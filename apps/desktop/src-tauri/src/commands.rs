use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::State;
use uuid::Uuid;

use crate::{
    library_db::{LibraryDatabase, NewLocalDocument},
    library_store::{content_hash, import_pdf_with_status, validate_pdf_input},
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

    #[cfg(test)]
    pub(crate) fn install_insert_failure_for_test(&self) -> Result<(), String> {
        self.database
            .lock()
            .map_err(|_| "library database is unavailable".to_owned())?
            .install_insert_failure_for_test()
            .map_err(|error| error.to_string())
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

    database
        .insert_local_batch(imported_documents)
        .map_err(|error| {
            remove_new_managed_files(&created_paths);
            error.to_string()
        })
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
