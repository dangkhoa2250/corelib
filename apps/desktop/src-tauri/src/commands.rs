use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender, TrySendError},
        Arc, Mutex,
    },
    thread,
};

use tauri::State;
use uuid::Uuid;

use crate::{
    indexer::index_managed_pdf,
    library_db::{LibraryDatabase, NewLocalDocument},
    library_store::{content_hash, import_pdf_with_status, validate_pdf_input},
    model::DocumentSummary,
};

pub type IndexTask = Box<dyn FnOnce() + Send + 'static>;
type IndexScheduler = Arc<dyn Fn(IndexTask) -> bool + Send + Sync>;

pub const INDEX_QUEUE_CAPACITY: usize = 8;
const INDEX_WORKER_COUNT: usize = 2;

pub(crate) struct IndexWorkerPool {
    sender: SyncSender<IndexTask>,
    _receiver: Arc<Mutex<Receiver<IndexTask>>>,
}

impl IndexWorkerPool {
    fn new() -> Arc<Self> {
        let (sender, receiver) = mpsc::sync_channel(INDEX_QUEUE_CAPACITY);
        Self::with_workers(sender, receiver, INDEX_WORKER_COUNT)
    }

    #[cfg(test)]
    pub(crate) fn without_workers() -> Arc<Self> {
        let (sender, receiver) = mpsc::sync_channel(INDEX_QUEUE_CAPACITY);
        Self::with_workers(sender, receiver, 0)
    }

    fn with_workers(
        sender: SyncSender<IndexTask>,
        receiver: Receiver<IndexTask>,
        worker_count: usize,
    ) -> Arc<Self> {
        let receiver = Arc::new(Mutex::new(receiver));
        for _ in 0..worker_count {
            let receiver = Arc::clone(&receiver);
            thread::spawn(move || loop {
                let task = { receiver.lock().expect("index worker receiver lock").recv() };
                match task {
                    Ok(task) => task(),
                    Err(_) => break,
                }
            });
        }
        Arc::new(Self {
            sender,
            _receiver: receiver,
        })
    }

    pub(crate) fn try_schedule(&self, task: IndexTask) -> bool {
        match self.sender.try_send(task) {
            Ok(()) => true,
            Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => false,
        }
    }
}

struct IndexCoordinator {
    database: Arc<Mutex<LibraryDatabase>>,
    library_root: PathBuf,
    schedule_index: IndexScheduler,
}

impl IndexCoordinator {
    fn schedule_managed_pdf_index(self: &Arc<Self>, id: String) {
        let claimed = self
            .database
            .lock()
            .ok()
            .and_then(|mut database| database.claim_pending_index(&id).ok().flatten());
        let Some(record) = claimed else {
            return;
        };
        let path = if record.source == "google_drive" {
            let Some(ref file_id) = record.source_ref else {
                return;
            };
            crate::drive_cache::Cache::new(self.library_root.clone()).path_for(file_id)
        } else {
            let Some(ref p) = record.managed_path else {
                return;
            };
            PathBuf::from(p)
        };
        let database = Arc::clone(&self.database);
        let coordinator = Arc::clone(self);
        let scheduled = (self.schedule_index)(Box::new(move || {
            index_managed_pdf(&database, &id, &path);
            coordinator.schedule_pending_indexes();
        }));
        if !scheduled {
            let _ = self
                .database
                .lock()
                .ok()
                .and_then(|mut database| database.release_pending_index_claim(&record.id).ok());
        }
    }

    fn schedule_pending_indexes(self: &Arc<Self>) {
        let records = match self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_owned())
            .and_then(|database| {
                database
                    .pending_indexing_records()
                    .map_err(|error| error.to_string())
            }) {
            Ok(records) => records,
            Err(_) => return,
        };
        for record in records {
            self.schedule_managed_pdf_index(record.id);
        }
    }
}

pub struct LibraryStore {
    database: Arc<Mutex<LibraryDatabase>>,
    library_root: PathBuf,
    index_coordinator: Arc<IndexCoordinator>,
    cache_generation: Arc<AtomicU64>,
    cache_lock: Arc<Mutex<()>>,
}

impl LibraryStore {
    pub fn open(app_data_directory: PathBuf) -> Result<Self, String> {
        let index_workers = IndexWorkerPool::new();
        Self::open_with_scheduler(
            app_data_directory,
            Arc::new(move |task| index_workers.try_schedule(task)),
        )
    }

    pub(crate) fn open_with_scheduler(
        app_data_directory: PathBuf,
        schedule_index: IndexScheduler,
    ) -> Result<Self, String> {
        let database =
            LibraryDatabase::open(&app_data_directory).map_err(|error| error.to_string())?;
        let database = Arc::new(Mutex::new(database));
        let index_coordinator = Arc::new(IndexCoordinator {
            database: Arc::clone(&database),
            library_root: app_data_directory.clone(),
            schedule_index,
        });
        let store = Self {
            database,
            library_root: app_data_directory,
            index_coordinator,
            cache_generation: Arc::new(AtomicU64::new(0)),
            cache_lock: Arc::new(Mutex::new(())),
        };
        store.requeue_pending_indexes()?;
        Ok(store)
    }

    #[cfg(test)]
    pub(crate) fn install_insert_failure_for_test(&self) -> Result<(), String> {
        self.database
            .lock()
            .map_err(|_| "library database is unavailable".to_owned())?
            .install_insert_failure_for_test()
            .map_err(|error| error.to_string())
    }

    fn schedule_pending_indexes(&self) -> Result<(), String> {
        self.index_coordinator.schedule_pending_indexes();
        Ok(())
    }

    fn requeue_pending_indexes(&self) -> Result<(), String> {
        self.database
            .lock()
            .map_err(|_| "library database is unavailable".to_owned())?
            .reset_pending_index_claims()
            .map_err(|error| error.to_string())?;
        self.schedule_pending_indexes()
    }
}

#[tauri::command]
pub fn list_documents(state: State<'_, LibraryStore>) -> Result<Vec<DocumentSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .list()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_local_documents(
    paths: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    let documents = prepare_local_documents(&paths)?;

    let mut database = state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?;
    let mut created_paths = Vec::new();
    let imported_documents = documents
        .iter()
        .map(|document| {
            let imported = import_pdf_with_status(
                &state.library_root,
                &document.source_path,
                &document.content_hash,
            )
            .map_err(|_| "unable to import PDF".to_owned())?;
            if imported.created {
                created_paths.push(imported.managed_path.clone());
            }
            Ok(NewLocalDocument {
                id: document.id.clone(),
                title: document.title.clone(),
                content_hash: document.content_hash.clone(),
                managed_path: imported.managed_path,
            })
        })
        .collect::<Result<Vec<_>, String>>();

    let imported_documents = match imported_documents {
        Ok(documents) => documents,
        Err(error) => {
            remove_new_managed_files(&created_paths);
            return Err(error);
        }
    };

    let summaries = database
        .insert_local_batch(imported_documents)
        .map_err(|error| {
            remove_new_managed_files(&created_paths);
            error.to_string()
        })?;
    drop(database);
    state.schedule_pending_indexes()?;

    Ok(summaries)
}

#[tauri::command]
pub fn search_documents(
    query: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .search(&query)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_read_page(
    id: String,
    page: i64,
    state: State<'_, LibraryStore>,
) -> Result<DocumentSummary, String> {
    validate_read_page(page)?;

    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .update_read_page(&id, page)
        .map_err(|error| error.to_string())
}

pub fn validate_import_paths(paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Err("select at least one PDF".to_owned());
    }

    if paths.iter().any(|path| {
        path.is_empty()
            || !Path::new(path)
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    }) {
        return Err("only PDF files can be imported".to_owned());
    }

    Ok(())
}

pub fn validate_read_page(page: i64) -> Result<(), String> {
    if page <= 0 {
        return Err("page must be positive".to_owned());
    }

    Ok(())
}

struct PreparedLocalDocument {
    source_path: PathBuf,
    id: String,
    title: String,
    content_hash: String,
}

fn prepare_local_documents(paths: &[String]) -> Result<Vec<PreparedLocalDocument>, String> {
    validate_import_paths(paths)?;

    paths
        .iter()
        .map(|source| {
            let source_path = PathBuf::from(source);
            let title = source_path
                .file_stem()
                .and_then(|title| title.to_str())
                .filter(|title| !title.trim().is_empty())
                .ok_or_else(|| "PDF file name is invalid".to_owned())?
                .to_owned();
            validate_pdf_input(&source_path).map_err(|_| "unable to import PDF".to_owned())?;
            let content_hash =
                content_hash(&source_path).map_err(|_| "unable to import PDF".to_owned())?;
            Ok(PreparedLocalDocument {
                source_path,
                id: Uuid::new_v4().to_string(),
                title,
                content_hash,
            })
        })
        .collect()
}

fn remove_new_managed_files(paths: &[String]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

#[tauri::command]
pub fn drive_connect() -> Result<(), String> {
    let store = crate::drive_auth::KeychainTokenStore::new();
    crate::drive_api::drive_connect(&store)
}

#[tauri::command]
pub fn drive_list(folder_id: Option<String>) -> Result<Vec<crate::drive_api::DriveEntry>, String> {
    let store = crate::drive_auth::KeychainTokenStore::new();
    crate::drive_api::drive_list(&store, folder_id.as_deref())
}

#[tauri::command]
pub fn drive_import(
    ids: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    let store = crate::drive_auth::KeychainTokenStore::new();
    let imported = crate::drive_api::drive_import(&store, &state.database, ids)?;
    Ok(imported)
}

#[tauri::command]
pub async fn get_document_file_url(
    id: String,
    state: State<'_, LibraryStore>,
) -> Result<String, String> {
    let database = Arc::clone(&state.database);
    let library_root = state.library_root.clone();
    let index_coordinator = Arc::clone(&state.index_coordinator);
    let record = database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?
        .indexing_record(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "document not found".to_owned())?;

    if record.source == "local_managed" {
        let managed_path = record
            .managed_path
            .ok_or_else(|| "managed path not found".to_owned())?;
        return Ok(managed_path);
    }

    let file_id = record
        .source_ref
        .ok_or_else(|| "source_ref not found".to_owned())?;
    let cache = crate::drive_cache::Cache::new(library_root.clone());
    let cache_path = cache.path_for(&file_id);

    if cache_path.is_file() {
        database
            .lock()
            .map_err(|_| "database unavailable".to_owned())?
            .set_document_status(&id, "ready")
            .map_err(|e| e.to_string())?;
        index_coordinator.schedule_pending_indexes();
        return Ok(cache_path.to_string_lossy().into_owned());
    }

    database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?
        .set_document_status(&id, "processing")
        .map_err(|e| e.to_string())?;

    let store = crate::drive_auth::KeychainTokenStore::new();
    let result = download_drive_file_async_guarded(
        file_id.clone(),
        library_root,
        Arc::clone(&state.cache_generation),
        Arc::clone(&state.cache_lock),
        move |id| crate::drive_api::download_drive_file(&store, &id),
    )
    .await;
    let path = match result {
        Ok(path) => path,
        Err(e) => {
            let status = if e == "revoked" {
                "error"
            } else {
                "download_required"
            };
            let _ = database
                .lock()
                .map_err(|_| "database unavailable".to_owned())?
                .set_document_status(&id, status);
            return Err(if e == "revoked" {
                "reconnect_required".to_owned()
            } else {
                "network_error".to_owned()
            });
        }
    };

    database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?
        .set_document_status(&id, "ready")
        .map_err(|e| e.to_string())?;

    index_coordinator.schedule_pending_indexes();

    Ok(path)
}

pub(crate) async fn download_drive_file_async<F>(
    file_id: String,
    library_root: PathBuf,
    downloader: F,
) -> Result<String, String>
where
    F: FnOnce(String) -> Result<Vec<u8>, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = downloader(file_id.clone())?;
        crate::drive_cache::Cache::new(library_root)
            .put(&file_id, &bytes)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("download task failed: {error}"))?
}

pub(crate) async fn download_drive_file_async_guarded<F>(
    file_id: String,
    library_root: PathBuf,
    cache_generation: Arc<AtomicU64>,
    cache_lock: Arc<Mutex<()>>,
    downloader: F,
) -> Result<String, String>
where
    F: FnOnce(String) -> Result<Vec<u8>, String> + Send + 'static,
{
    let starting_generation = cache_generation.load(Ordering::Acquire);
    let path = download_drive_file_async(file_id, library_root, downloader).await?;
    let _guard = cache_lock
        .lock()
        .map_err(|_| "cache unavailable".to_owned())?;
    if starting_generation != cache_generation.load(Ordering::Acquire) {
        let _ = std::fs::remove_file(&path);
        return Err("cache_cleared_during_download".to_owned());
    }
    Ok(path)
}

#[tauri::command]
pub fn clear_drive_cache(state: State<'_, LibraryStore>) -> Result<(), String> {
    let _cache_guard = state
        .cache_lock
        .lock()
        .map_err(|_| "cache unavailable".to_owned())?;
    state.cache_generation.fetch_add(1, Ordering::AcqRel);
    let cache = crate::drive_cache::Cache::new(state.library_root.clone());
    cache.clear()?;

    let mut db = state
        .database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?;
    db.clear_drive_cache().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_document(id: String, state: State<'_, LibraryStore>) -> Result<(), String> {
    let managed_path = state
        .database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?
        .delete_document(&id)
        .map_err(|e| e.to_string())?;

    if let Some(path) = managed_path {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
