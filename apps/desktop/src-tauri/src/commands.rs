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

#[cfg(test)]
use chrono::DateTime;
use chrono::{Timelike, Utc};
use serde::Deserialize;

use tauri::State;
use uuid::Uuid;

use crate::{
    indexer::index_managed_pdf,
    learning::{DeckStatistics, NewCard, NewCardSource},
    library_db::{LibraryDatabase, NewLocalDocument},
    library_store::{content_hash, import_pdf_with_status, validate_pdf_input},
    model::DocumentSummary,
    model::{
        CardSourcePayload, DeckLearningSettingsPayload, DeckSummary, LearningCardSummary,
        MemoraSettingsPayload, ReviewIntervalPayload, ReviewPreviewPayload, StudyCountsPayload,
        StudyGrantPayload, StudyReadyCountsPayload, StudyScopePayload, StudySessionPayload,
        SearchResultPayload, SelectionRect, UpdateDeckLearningSettingsPayload,
    },
    scheduler::{Rating, ScheduledState},
    study_queue::{
        DeckLearningSettings, DeckLearningSettingsUpdate, MemoraSettings, MemoraSettingsUpdate,
        StudyGrant, StudyRating, StudyRatingResult, StudyScope, StudySession,
    },
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
pub async fn import_local_documents(
    paths: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    let database = Arc::clone(&state.database);
    let library_root = state.library_root.clone();
    let index_coordinator = Arc::clone(&state.index_coordinator);
    import_local_documents_inner(paths, database, library_root, index_coordinator)
}

fn import_local_documents_inner(
    paths: Vec<String>,
    database: Arc<Mutex<LibraryDatabase>>,
    library_root: PathBuf,
    index_coordinator: Arc<IndexCoordinator>,
) -> Result<Vec<DocumentSummary>, String> {
    let documents = prepare_local_documents(&paths)?;

    let mut guard = database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?;
    let mut created_paths = Vec::new();
    let imported_documents = documents
        .iter()
        .map(|document| {
            let imported = import_pdf_with_status(
                &library_root,
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

    let summaries = guard
        .insert_local_batch(imported_documents)
        .map_err(|error| {
            remove_new_managed_files(&created_paths);
            error.to_string()
        })?;
    drop(guard);
    index_coordinator.schedule_pending_indexes();

    Ok(summaries)
}

#[cfg(test)]
pub(crate) fn import_local_documents_for_test(
    paths: Vec<String>,
    state: tauri::State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    let database = Arc::clone(&state.database);
    let library_root = state.library_root.clone();
    let index_coordinator = Arc::clone(&state.index_coordinator);
    import_local_documents_inner(paths, database, library_root, index_coordinator)
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
    num_pages: Option<i64>,
    state: State<'_, LibraryStore>,
) -> Result<DocumentSummary, String> {
    validate_read_page(page)?;

    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .update_read_page(&id, page, num_pages)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_page_tags(
    id: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<crate::model::PageTagSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .list_page_tags(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toggle_page_tag(
    document_id: String,
    page: i64,
    state: State<'_, LibraryStore>,
) -> Result<Vec<crate::model::PageTagSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .toggle_page_tag(&document_id, page)
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

#[derive(serde::Serialize, serde::Deserialize)]
struct FileCredentials {
    client_id: String,
    client_secret: String,
}

#[tauri::command]
pub fn drive_connect(state: State<'_, LibraryStore>) -> Result<(), String> {
    let store_path = state.library_root.join(".google_drive_token.txt");
    let store = crate::drive_auth::FileTokenStore::new(store_path);
    crate::drive_api::drive_connect(&store, &state.library_root)
}

#[tauri::command]
pub fn save_google_drive_credentials(
    state: State<'_, LibraryStore>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let path = state.library_root.join(".google_drive_credentials.json");
    let creds = FileCredentials { client_id, client_secret };
    let json = serde_json::to_string(&creds).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_google_drive_credentials(
    state: State<'_, LibraryStore>,
) -> Result<Option<std::collections::HashMap<String, String>>, String> {
    let path = state.library_root.join(".google_drive_credentials.json");
    if !path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let creds: FileCredentials = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    
    let mut map = std::collections::HashMap::new();
    map.insert("clientId".to_owned(), creds.client_id);
    map.insert("clientSecret".to_owned(), creds.client_secret);
    Ok(Some(map))
}

#[tauri::command]
pub fn clear_google_drive_credentials(state: State<'_, LibraryStore>) -> Result<(), String> {
    let path = state.library_root.join(".google_drive_credentials.json");
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn drive_list(
    state: State<'_, LibraryStore>,
    folder_id: Option<String>,
) -> Result<Vec<crate::drive_api::DriveEntry>, String> {
    let store_path = state.library_root.join(".google_drive_token.txt");
    let store = crate::drive_auth::FileTokenStore::new(store_path);
    crate::drive_api::drive_list(&store, &state.library_root, folder_id.as_deref())
}

#[tauri::command]
pub fn drive_import(
    ids: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<Vec<DocumentSummary>, String> {
    let store_path = state.library_root.join(".google_drive_token.txt");
    let store = crate::drive_auth::FileTokenStore::new(store_path);
    let imported = crate::drive_api::drive_import(&store, &state.library_root, &state.database, ids)?;
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

    let store_path = library_root.join(".google_drive_token.txt");
    let store = crate::drive_auth::FileTokenStore::new(store_path);
    let library_root_for_closure = library_root.clone();
    let result = download_drive_file_async_guarded(
        file_id.clone(),
        library_root,
        Arc::clone(&state.cache_generation),
        Arc::clone(&state.cache_lock),
        move |id| crate::drive_api::download_drive_file(&store, &library_root_for_closure, &id),
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
pub fn save_cover(
    id: String,
    data: Vec<u8>,
    state: State<'_, LibraryStore>,
) -> Result<DocumentSummary, String> {
    let covers_dir = state.library_root.join("covers");
    std::fs::create_dir_all(&covers_dir)
        .map_err(|e| format!("failed to create covers directory: {e}"))?;
    let cover_path = covers_dir.join(format!("{id}.png"));
    std::fs::write(&cover_path, &data)
        .map_err(|e| format!("failed to write cover: {e}"))?;

    let cover_str = cover_path.to_string_lossy().into_owned();
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .set_cover_path(&id, Some(&cover_str))
        .map_err(|e| e.to_string())
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

    let cover_path = state.library_root.join("covers").join(format!("{id}.png"));
    let _ = std::fs::remove_file(cover_path);

    Ok(())
}

#[tauri::command]
pub fn rename_document(
    id: String,
    title: String,
    state: State<'_, LibraryStore>,
) -> Result<DocumentSummary, String> {
    state
        .database
        .lock()
        .map_err(|_| "database unavailable".to_owned())?
        .rename_document(&id, &title)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardSourceInput {
    pub document_id: Option<String>,
    pub page: i64,
    pub quote: String,
    pub rects: Vec<SelectionRect>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardInput {
    pub deck_name: String,
    pub front: String,
    pub back: String,
    pub source: Option<CardSourceInput>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub front_language: Option<String>,
}

fn learning_lock(
    store: &LibraryStore,
) -> Result<std::sync::MutexGuard<'_, crate::library_db::LibraryDatabase>, String> {
    store
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())
}

#[tauri::command]
pub fn create_card(
    input: CreateCardInput,
    state: State<'_, LibraryStore>,
) -> Result<LearningCardSummary, String> {
    let source = input
        .source
        .map(|s| -> Result<NewCardSource, String> {
            let document_id = s
                .document_id
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| "source document is required".to_owned())?;
            let rects_json = serde_json::to_string(&s.rects)
                .map_err(|_| "source rects are invalid".to_owned())?;
            Ok(NewCardSource {
                document_id,
                page: s.page,
                quote: s.quote,
                rects_json,
            })
        })
        .transpose()?;
    learning_lock(&state)?
        .create_card(NewCard {
            deck_name: input.deck_name,
            front: input.front,
            back: input.back,
            source,
            tags: input.tags,
            front_language: input.front_language,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_decks(state: State<'_, LibraryStore>) -> Result<Vec<DeckSummary>, String> {
    learning_lock(&state)?
        .list_decks()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_deck(name: String, state: State<'_, LibraryStore>) -> Result<DeckSummary, String> {
    learning_lock(&state)?
        .create_deck(&name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_deck(
    id: String,
    name: String,
    state: State<'_, LibraryStore>,
) -> Result<DeckSummary, String> {
    learning_lock(&state)?
        .rename_deck(&id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_deck(id: String, state: State<'_, LibraryStore>) -> Result<(), String> {
    learning_lock(&state)?
        .delete_deck(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_deck_statistics(
    deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<DeckStatistics, String> {
    learning_lock(&state)?
        .get_deck_statistics(&deck_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn count_deck_cards(id: String, state: State<'_, LibraryStore>) -> Result<i64, String> {
    learning_lock(&state)?
        .count_cards_in_deck(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_card(id: String, state: State<'_, LibraryStore>) -> Result<LearningCardSummary, String> {
    learning_lock(&state)?
        .card_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "card not found".to_owned())
}

#[tauri::command]
pub fn list_deck_cards(
    deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<LearningCardSummary>, String> {
    learning_lock(&state)?
        .cards_in_deck(&deck_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_card(id: String, state: State<'_, LibraryStore>) -> Result<(), String> {
    learning_lock(&state)?
        .delete_card(&id)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
fn parse_now(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| "invalid learning timestamp".to_owned())
}

#[cfg(test)]
fn elapsed_days(last: Option<&str>, now: DateTime<Utc>) -> Result<u32, String> {
    let Some(last) = last else { return Ok(0) };
    let then = parse_now(last)?;
    Ok((now.signed_duration_since(then).num_seconds().max(0) as f64 / 86_400.0).floor() as u32)
}

fn interval_label(seconds: i64) -> String {
    if seconds < 3600 {
        format!("{}m", (seconds.max(60) + 59) / 60)
    } else if seconds < 86_400 {
        format!("{}h", (seconds + 3599) / 3600)
    } else {
        format!("{}d", (seconds + 43_199) / 86_400)
    }
}

fn preview_payload(state: &ScheduledState) -> ReviewIntervalPayload {
    ReviewIntervalPayload {
        due_at: state.due_at.clone(),
        interval_label: interval_label(state.interval_seconds),
    }
}

#[tauri::command]
pub fn get_card_source(
    id: String,
    state: State<'_, LibraryStore>,
) -> Result<Option<CardSourcePayload>, String> {
    learning_lock(&state)?
        .card_source(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_document(id: String, state: State<'_, LibraryStore>) -> Result<DocumentSummary, String> {
    learning_lock(&state)?
        .get_document(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "document not found".to_owned())
}

#[tauri::command]
pub fn search_everything(
    query: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<SearchResultPayload>, String> {
    let db = learning_lock(&state)?;
    let mut output = db
        .search(&query)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|d| SearchResultPayload {
            kind: "document".into(),
            id: d.id,
            title: d.title,
            subtitle: d.author,
        })
        .collect::<Vec<_>>();
    output.extend(db.learning_search(&query, 30).map_err(|e| e.to_string())?);
    output.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
            .then_with(|| a.id.cmp(&b.id))
    });
    output.truncate(30);
    Ok(output)
}

#[tauri::command]
pub fn query_deck_cards(
    payload: crate::model::CardBrowserQueryPayload,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::CardPagePayload, String> {
    use crate::learning::{CardBrowserQuery, CardSort};
    let sort = CardSort::parse(&payload.sort).map_err(|e| e.to_string())?;
    learning_lock(&state)?
        .query_deck_cards(CardBrowserQuery {
            deck_id: payload.deck_id,
            query: payload.query,
            states: payload.states,
            tags: payload.tags,
            sort,
            cursor: payload.cursor,
            limit: payload.limit,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_active_tags(
    deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<String>, String> {
    learning_lock(&state)?
        .list_active_tags(&deck_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_card(
    payload: crate::model::UpdateCardPayload,
    state: State<'_, LibraryStore>,
) -> Result<LearningCardSummary, String> {
    use crate::learning::UpdateCard;
    learning_lock(&state)?
        .update_card(UpdateCard {
            card_id: payload.card_id,
            front: payload.front,
            back: payload.back,
            tags: payload.tags,
            front_language: payload.front_language,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_and_move_card(
    payload: crate::model::UpdateAndMoveCardPayload,
    state: State<'_, LibraryStore>,
) -> Result<LearningCardSummary, String> {
    use crate::learning::UpdateAndMoveCard;
    learning_lock(&state)?
        .update_and_move_card(UpdateAndMoveCard {
            card_id: payload.card_id,
            front: payload.front,
            back: payload.back,
            tags: payload.tags,
            destination_deck_id: payload.destination_deck_id,
            front_language: payload.front_language,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_cards(
    card_ids: Vec<String>,
    destination_deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .move_cards(&card_ids, &destination_deck_id)
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

#[tauri::command]
pub fn set_cards_suspended(
    card_ids: Vec<String>,
    suspended: bool,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .set_cards_suspended(&card_ids, suspended)
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

#[tauri::command]
pub fn trash_cards(
    card_ids: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .trash_cards(&card_ids)
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

#[tauri::command]
pub fn list_trashed_cards(
    query: String,
    sort: String,
    cursor: Option<String>,
    limit: usize,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::CardPagePayload, String> {
    use crate::learning::{TrashQuery, TrashSort};
    let sort_parsed = TrashSort::parse(&sort).map_err(|e| e.to_string())?;
    learning_lock(&state)?
        .list_trashed_cards(TrashQuery {
            query,
            sort: sort_parsed,
            cursor,
            limit,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_cards(
    card_ids: Vec<String>,
    destination_deck_id: Option<String>,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .restore_cards(&card_ids, destination_deck_id.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

#[tauri::command]
pub fn delete_cards_permanently(
    card_ids: Vec<String>,
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .delete_cards_permanently(&card_ids)
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

#[tauri::command]
pub fn empty_trash(
    state: State<'_, LibraryStore>,
) -> Result<crate::model::BulkResultPayload, String> {
    let res = learning_lock(&state)?
        .empty_trash()
        .map_err(|e| e.to_string())?;
    Ok(crate::model::BulkResultPayload {
        affected_ids: res.affected_ids,
        affected_count: res.affected_count,
    })
}

impl From<MemoraSettings> for MemoraSettingsPayload {
    fn from(settings: MemoraSettings) -> Self {
        Self {
            new_cards_per_day: settings.new_cards_per_day,
            desired_retention: settings.desired_retention,
        }
    }
}

impl From<DeckLearningSettings> for DeckLearningSettingsPayload {
    fn from(settings: DeckLearningSettings) -> Self {
        Self {
            deck_id: settings.deck_id,
            inherited_new_cards_per_day: settings.inherited_new_cards_per_day,
            new_cards_per_day: settings.new_cards_per_day,
            effective_new_cards_per_day: settings.effective_new_cards_per_day,
        }
    }
}

#[tauri::command]
pub fn get_memora_settings(
    state: State<'_, LibraryStore>,
) -> Result<MemoraSettingsPayload, String> {
    learning_lock(&state)?
        .memora_settings()
        .map(Into::into)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_memora_settings(
    settings: MemoraSettingsPayload,
    state: State<'_, LibraryStore>,
) -> Result<MemoraSettingsPayload, String> {
    learning_lock(&state)?
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: settings.new_cards_per_day,
            desired_retention: settings.desired_retention,
        })
        .map(Into::into)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_deck_learning_settings(
    deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<DeckLearningSettingsPayload, String> {
    learning_lock(&state)?
        .deck_learning_settings(&deck_id)
        .map(Into::into)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_deck_learning_settings(
    payload: UpdateDeckLearningSettingsPayload,
    state: State<'_, LibraryStore>,
) -> Result<DeckLearningSettingsPayload, String> {
    let update = match payload.new_cards_per_day {
        Some(value) => DeckLearningSettingsUpdate::Custom(value),
        None => DeckLearningSettingsUpdate::Inherit,
    };
    learning_lock(&state)?
        .update_deck_learning_settings(&payload.deck_id, update)
        .map(Into::into)
        .map_err(|e| e.to_string())
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyRatingPayload {
    pub session_id: String,
    pub card_id: String,
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub rating: Rating,
    pub elapsed_ms: i64,
}

pub(crate) fn scope_from_payload(payload: StudyScopePayload) -> Result<StudyScope, String> {
    match payload.kind.as_str() {
        "all" => Ok(StudyScope::All),
        "deck" => {
            let deck_id = payload
                .deck_id
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| "study scope deck id is required".to_owned())?;
            Ok(StudyScope::Deck(deck_id))
        }
        _ => Err("invalid study scope".to_owned()),
    }
}

fn scope_to_payload(scope: &StudyScope) -> StudyScopePayload {
    match scope {
        StudyScope::All => StudyScopePayload {
            kind: "all".to_owned(),
            deck_id: None,
        },
        StudyScope::Deck(id) => StudyScopePayload {
            kind: "deck".to_owned(),
            deck_id: Some(id.clone()),
        },
    }
}

fn grant_to_payload(grant: StudyGrant) -> StudyGrantPayload {
    StudyGrantPayload {
        grant_token: grant.grant_token,
        expected_state: grant.expected_state,
        expected_due_at: grant.expected_due_at,
        card: grant.card,
        preview: ReviewPreviewPayload {
            again: preview_payload(&grant.preview.again),
            hard: preview_payload(&grant.preview.hard),
            good: preview_payload(&grant.preview.good),
            easy: preview_payload(&grant.preview.easy),
        },
    }
}

fn session_to_payload(session: StudySession) -> StudySessionPayload {
    StudySessionPayload {
        session_id: session.session_id,
        scope: scope_to_payload(&session.scope),
        cards: session.cards.into_iter().map(grant_to_payload).collect(),
        counts: StudyCountsPayload {
            learning: session.counts.learning,
            review: session.counts.review,
            new: session.counts.new,
        },
        next_learning_due_at: session.next_learning_due_at,
    }
}

#[tauri::command]
pub fn start_study_session(
    scope: StudyScopePayload,
    state: State<'_, LibraryStore>,
) -> Result<StudySessionPayload, String> {
    let scope = scope_from_payload(scope)?;
    let now = Utc::now();
    let study_day = chrono::Local::now().date_naive().to_string();
    learning_lock(&state)?
        .start_study_session(scope, now, &study_day)
        .map(session_to_payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn refresh_study_session(
    session_id: String,
    state: State<'_, LibraryStore>,
) -> Result<StudySessionPayload, String> {
    let now = Utc::now();
    let study_day = chrono::Local::now().date_naive().to_string();
    learning_lock(&state)?
        .refresh_study_session(&session_id, now, &study_day)
        .map(session_to_payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rate_study_card(
    payload: StudyRatingPayload,
    state: State<'_, LibraryStore>,
) -> Result<StudyRatingResult, String> {
    if payload.elapsed_ms < 0 {
        return Err("elapsedMs must be nonnegative".to_owned());
    }
    let now = Utc::now();
    let local_now = chrono::Local::now();
    let study_day = local_now.date_naive().to_string();
    let local_minute_of_day = i64::from(local_now.hour() * 60 + local_now.minute());
    learning_lock(&state)?
        .rate_study_card(StudyRating {
            session_id: payload.session_id,
            card_id: payload.card_id,
            grant_token: payload.grant_token,
            expected_state: payload.expected_state,
            expected_due_at: payload.expected_due_at,
            rating: payload.rating,
            elapsed_ms: payload.elapsed_ms,
            now,
            study_day,
            local_minute_of_day,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_study_ready_counts(
    state: State<'_, LibraryStore>,
) -> Result<StudyReadyCountsPayload, String> {
    let now = Utc::now();
    let study_day = chrono::Local::now().date_naive().to_string();
    learning_lock(&state)?
        .study_ready_counts(now, &study_day)
        .map(|counts| StudyReadyCountsPayload {
            learning: counts.learning,
            review: counts.review,
            new: counts.new,
            total: counts.total,
        })
        .map_err(|e| e.to_string())
}

pub struct AccountServiceState {
    pub api: crate::account::PocketBaseAccountApi<crate::account::KeyringSessionStore, crate::account::ReqwestHttpClient>,
}

use crate::account::{
    AccountApi, AccountGroup, AccountProfile, AccountStatus, AccountStatusResponse,
    DailyStatisticsSnapshot, FeatureAssignment, FeatureAssignmentInput, FeatureDefinition,
    SessionSnapshot, AdminMetrics, AdminStatistics, AnalyticsEventInput,
};

#[tauri::command]
pub fn account_register(
    display_name: String,
    email: String,
    password: String,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AccountStatusResponse, String> {
    state.api.register(&display_name, &email, &password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_sign_in(
    email: String,
    password: String,
    remember: bool,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AccountStatusResponse, String> {
    state.api.sign_in(&email, &password, remember).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_session(
    state: tauri::State<'_, AccountServiceState>,
) -> Result<SessionSnapshot, String> {
    state.api.current_session().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_sign_out(
    state: tauri::State<'_, AccountServiceState>,
) -> Result<(), String> {
    state.api.sign_out().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_set_analytics_enabled(
    enabled: bool,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AccountProfile, String> {
    state.api.set_analytics_enabled(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_track_event(
    installation_id: String,
    name: String,
    app_version: String,
    occurred_at: String,
    payload: serde_json::Value,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<(), String> {
    state.api.send_analytics(AnalyticsEventInput {
        installation_id,
        name,
        app_version,
        occurred_at,
        payload,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_list_users(
    status: Option<AccountStatus>,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<Vec<AccountProfile>, String> {
    state.api.admin_list_users(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_set_user_status(
    user_id: String,
    status: AccountStatus,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AccountProfile, String> {
    state.api.admin_set_status(&user_id, status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_set_user_groups(
    user_id: String,
    group_ids: Vec<String>,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<(), String> {
    state.api.admin_set_groups(&user_id, group_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_list_groups(
    state: tauri::State<'_, AccountServiceState>,
) -> Result<Vec<AccountGroup>, String> {
    state.api.admin_list_groups().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_create_group(
    name: String,
    description: String,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AccountGroup, String> {
    state.api.admin_create_group(&name, &description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_list_features(
    state: tauri::State<'_, AccountServiceState>,
) -> Result<Vec<FeatureDefinition>, String> {
    state.api.admin_list_features().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_create_feature(
    key: String,
    description: String,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<FeatureDefinition, String> {
    state.api.admin_create_feature(&key, &description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_set_feature_assignment(
    feature_key: String,
    subject_type: String,
    subject_id: String,
    enabled: bool,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<FeatureAssignment, String> {
    state.api.admin_set_feature_assignment(FeatureAssignmentInput {
        feature_key,
        subject_type,
        subject_id,
        enabled,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_get_metrics(
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AdminMetrics, String> {
    state.api.admin_metrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_delete_user(
    user_id: String,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<(), String> {
    state.api.admin_delete_user(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn account_upsert_daily_statistics(
    input: DailyStatisticsSnapshot,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<(), String> {
    state.api.upsert_daily_statistics(input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn admin_get_statistics(
    range: String,
    app_key: String,
    state: tauri::State<'_, AccountServiceState>,
) -> Result<AdminStatistics, String> {
    state.api.admin_statistics(&range, &app_key).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Statistics command input types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStatisticsOverviewInput {
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetReadingStatisticsInput {
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDocumentStatisticsInput {
    pub document_id: String,
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetMemoraStatisticsInput {
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDeckStatisticsDetailInput {
    pub deck_id: String,
    pub range: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartActivitySessionInput {
    pub id: String,
    pub app_key: String,
    pub activity_kind: String,
    pub context_kind: Option<String>,
    pub context_id: Option<String>,
    pub occurred_at: String,
    pub local_day: String,
    pub timezone_offset_minutes: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCheckpointInput {
    pub session_id: String,
    pub occurred_at: String,
    pub active_ms: i64,
    pub document_id: Option<String>,
    pub page: Option<i64>,
    pub page_visit_increment: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishActivitySessionInput {
    pub session_id: String,
    pub occurred_at: String,
}

// ---------------------------------------------------------------------------
// Statistics commands
// ---------------------------------------------------------------------------

fn statistics_now() -> (String, String) {
    let now = Utc::now();
    let now_utc = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let today_local_day = chrono::Local::now().date_naive().to_string();
    (now_utc, today_local_day)
}

#[tauri::command]
pub fn get_statistics_overview(
    input: GetStatisticsOverviewInput,
    state: State<'_, LibraryStore>,
) -> Result<crate::statistics::StatisticsOverview, String> {
    let range =
        crate::statistics::StatisticsRange::parse(&input.range).map_err(|e| e.to_string())?;
    let (now_utc, today_local_day) = statistics_now();
    learning_lock(&state)?
        .statistics_overview(range, &now_utc, &today_local_day)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_reading_statistics(
    input: GetReadingStatisticsInput,
    state: State<'_, LibraryStore>,
) -> Result<crate::statistics::ReadingStatistics, String> {
    let range =
        crate::statistics::StatisticsRange::parse(&input.range).map_err(|e| e.to_string())?;
    let (now_utc, today_local_day) = statistics_now();
    learning_lock(&state)?
        .reading_statistics(range, &now_utc, &today_local_day)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_document_statistics(
    input: GetDocumentStatisticsInput,
    state: State<'_, LibraryStore>,
) -> Result<crate::statistics::DocumentStatistics, String> {
    let range =
        crate::statistics::StatisticsRange::parse(&input.range).map_err(|e| e.to_string())?;
    let (now_utc, today_local_day) = statistics_now();
    learning_lock(&state)?
        .document_statistics(&input.document_id, range, &now_utc, &today_local_day)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_memora_statistics(
    input: GetMemoraStatisticsInput,
    state: State<'_, LibraryStore>,
) -> Result<crate::statistics::MemoraStatistics, String> {
    let range =
        crate::statistics::StatisticsRange::parse(&input.range).map_err(|e| e.to_string())?;
    let (now_utc, today_local_day) = statistics_now();
    learning_lock(&state)?
        .memora_statistics(range, &now_utc, &today_local_day)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_deck_statistics_detail(
    input: GetDeckStatisticsDetailInput,
    state: State<'_, LibraryStore>,
) -> Result<crate::statistics::DeckStatisticsDetail, String> {
    let range =
        crate::statistics::StatisticsRange::parse(&input.range).map_err(|e| e.to_string())?;
    let (now_utc, today_local_day) = statistics_now();
    learning_lock(&state)?
        .deck_statistics_detail(&input.deck_id, range, &now_utc, &today_local_day)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_activity_session(
    input: StartActivitySessionInput,
    state: State<'_, LibraryStore>,
) -> Result<(), String> {
    learning_lock(&state)?
        .start_activity_session(crate::statistics::NewActivitySession {
            id: input.id,
            app_key: input.app_key,
            activity_kind: input.activity_kind,
            context_kind: input.context_kind,
            context_id: input.context_id,
            occurred_at: input.occurred_at,
            local_day: input.local_day,
            timezone_offset_minutes: input.timezone_offset_minutes,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn checkpoint_activity_session(
    input: ActivityCheckpointInput,
    state: State<'_, LibraryStore>,
) -> Result<(), String> {
    learning_lock(&state)?
        .checkpoint_activity_session(crate::statistics::ActivityCheckpoint {
            session_id: input.session_id,
            occurred_at: input.occurred_at,
            active_ms: input.active_ms,
            document_id: input.document_id,
            page: input.page,
            page_visit_increment: input.page_visit_increment,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finish_activity_session(
    input: FinishActivitySessionInput,
    state: State<'_, LibraryStore>,
) -> Result<(), String> {
    learning_lock(&state)?
        .finish_activity_session(&input.session_id, &input.occurred_at)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDailyStatisticsSnapshotsInput {
    pub query: crate::statistics::DailySnapshotQuery,
}

#[tauri::command]
pub fn get_daily_statistics_snapshots(
    input: GetDailyStatisticsSnapshotsInput,
    state: State<'_, LibraryStore>,
) -> Result<Vec<crate::statistics::DailyStatisticsSnapshot>, String> {
    let db = learning_lock(&state)?;
    crate::statistics::get_daily_statistics_snapshots(&db.connection, &input.query)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod learning_command_tests {
    use super::{elapsed_days, interval_label, parse_now};
    use chrono::TimeZone;

    #[test]
    fn elapsed_days_is_nonnegative_and_whole_days() {
        let now = chrono::Utc.with_ymd_and_hms(2026, 7, 10, 0, 0, 0).unwrap();
        assert_eq!(elapsed_days(None, now).unwrap(), 0);
        assert_eq!(
            elapsed_days(Some("2026-07-08T12:00:00.000Z"), now).unwrap(),
            1
        );
        assert_eq!(
            elapsed_days(Some("2026-07-11T00:00:00.000Z"), now).unwrap(),
            0
        );
        assert!(parse_now("bad").is_err());
    }

    #[test]
    fn interval_labels_are_compact_and_readable() {
        assert_eq!(interval_label(60), "1m");
        assert_eq!(interval_label(3600), "1h");
        assert_eq!(interval_label(86_400), "1d");
    }
}
