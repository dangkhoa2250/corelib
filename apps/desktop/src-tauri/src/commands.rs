use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::State;
use uuid::Uuid;

use crate::{
    library_db::{LibraryDatabase, NewLocalDocument},
    library_store::{content_hash, import_pdf},
    model::DocumentSummary,
};

pub struct LibraryStore {
    database: Mutex<LibraryDatabase>,
    library_root: PathBuf,
}

impl LibraryStore {
    pub fn open(app_data_directory: PathBuf) -> Result<Self, String> {
        let database =
            LibraryDatabase::open(&app_data_directory).map_err(|error| error.to_string())?;
        Ok(Self {
            database: Mutex::new(database),
            library_root: app_data_directory,
        })
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
    validate_import_paths(&paths)?;

    let mut database = state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?;
    paths
        .iter()
        .map(|path| import_local_document(path, &state.library_root, &mut database))
        .collect()
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

fn import_local_document(
    source: &str,
    library_root: &Path,
    database: &mut LibraryDatabase,
) -> Result<DocumentSummary, String> {
    let source_path = Path::new(source);
    let content_hash = content_hash(source_path).map_err(|_| "unable to import PDF".to_owned())?;
    let managed_path = import_pdf(library_root, source_path, &content_hash)
        .map_err(|_| "unable to import PDF".to_owned())?;
    let title = source_path
        .file_stem()
        .and_then(|title| title.to_str())
        .filter(|title| !title.trim().is_empty())
        .ok_or_else(|| "PDF file name is invalid".to_owned())?
        .to_owned();

    database
        .insert_local(NewLocalDocument {
            id: Uuid::new_v4().to_string(),
            title,
            content_hash,
            managed_path,
        })
        .map_err(|error| error.to_string())
}
