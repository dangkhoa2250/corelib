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

use chrono::{DateTime, Utc};
use serde::Deserialize;

use tauri::State;
use uuid::Uuid;

use crate::{
    indexer::index_managed_pdf,
    learning::{AppliedReview, DeckStatistics, NewCard, NewCardSource},
    library_db::{LibraryDatabase, NewLocalDocument},
    library_store::{content_hash, import_pdf_with_status, validate_pdf_input},
    model::DocumentSummary,
    model::{
        CardSourcePayload, DeckSummary, LearningCardSummary, ReviewIntervalPayload,
        ReviewPreviewPayload, SearchResultPayload, SelectionRect,
    },
    scheduler::{Rating, ReviewScheduler, ScheduledState},
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
pub fn list_due_cards(
    limit: Option<usize>,
    state: State<'_, LibraryStore>,
) -> Result<Vec<LearningCardSummary>, String> {
    let limit = limit.unwrap_or(20).min(100);
    learning_lock(&state)?
        .due_cards(
            &Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            limit,
        )
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

fn parse_now(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| "invalid learning timestamp".to_owned())
}

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
pub fn preview_card_review(
    id: String,
    state: State<'_, LibraryStore>,
) -> Result<ReviewPreviewPayload, String> {
    let db = learning_lock(&state)?;
    let card = db
        .card_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "card not found".to_owned())?;
    let memory = db.card_memory_state(&id).map_err(|e| e.to_string())?;
    let now = Utc::now();
    let preview = ReviewScheduler::default()
        .preview(
            memory.as_deref(),
            elapsed_days(card.last_review_at.as_deref(), now)?,
            now,
        )
        .map_err(|e| e.to_string())?;
    Ok(ReviewPreviewPayload {
        again: preview_payload(&preview.again),
        hard: preview_payload(&preview.hard),
        good: preview_payload(&preview.good),
        easy: preview_payload(&preview.easy),
    })
}

#[tauri::command]
pub fn rate_card(
    id: String,
    rating: Rating,
    elapsed_ms: i64,
    state: State<'_, LibraryStore>,
) -> Result<LearningCardSummary, String> {
    if elapsed_ms < 0 {
        return Err("elapsedMs must be nonnegative".to_owned());
    }
    let mut db = learning_lock(&state)?;
    let card = db
        .card_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "card not found".to_owned())?;
    let now = Utc::now();
    let memory = db.card_memory_state(&id).map_err(|e| e.to_string())?;
    let next = ReviewScheduler::default()
        .apply(
            memory.as_deref(),
            elapsed_days(card.last_review_at.as_deref(), now)?,
            rating,
            now,
        )
        .map_err(|e| e.to_string())?;
    let rating_name = match rating {
        Rating::Again => "again",
        Rating::Hard => "hard",
        Rating::Good => "good",
        Rating::Easy => "easy",
    };
    db.apply_review_atomic(AppliedReview {
        card_id: id,
        rating: rating_name.to_owned(),
        prior_state: card.state,
        next_state: next.state,
        prior_due_at: card.due_at,
        next_due_at: next.due_at,
        interval_seconds: next.interval_seconds,
        elapsed_ms,
        stability: next.stability.map(f64::from),
        difficulty: next.difficulty.map(f64::from),
        memory_state_json: Some(next.memory_state_json),
        scheduler_version: ReviewScheduler::default().config().version.clone(),
    })
    .map_err(|e| e.to_string())
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
