use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
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
        let Some(managed_path) = record.managed_path else {
            return;
        };
        let database = Arc::clone(&self.database);
        let coordinator = Arc::clone(self);
        let scheduled = (self.schedule_index)(Box::new(move || {
            index_managed_pdf(&database, &id, Path::new(&managed_path));
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
            schedule_index,
        });
        let store = Self {
            database,
            library_root: app_data_directory,
            index_coordinator,
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
