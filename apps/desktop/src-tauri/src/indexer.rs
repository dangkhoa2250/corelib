//! Background PDF text indexing using the pure-Rust `lopdf` crate (0.43).

use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    path::Path,
    sync::{Arc, Mutex},
};

use lopdf::Document;

use crate::library_db::LibraryDatabase;

pub fn index_managed_pdf(database: &Arc<Mutex<LibraryDatabase>>, id: &str, path: &Path) {
    index_document_with(database, id, path, extract_pdf_text);
}

pub fn index_document_with<F>(
    database: &Arc<Mutex<LibraryDatabase>>,
    id: &str,
    path: &Path,
    extract: F,
) where
    F: FnOnce(&Path) -> Result<String, String>,
{
    let extracted = catch_unwind(AssertUnwindSafe(|| extract(path)))
        .unwrap_or_else(|_| Err("PDF text extraction failed".to_owned()));

    if let Ok(mut database) = database.lock() {
        match extracted {
            Ok(text) => {
                let _ = database.set_index_ready(id, &text, None);
            }
            Err(_) => {
                let _ = database.set_index_failed(id);
            }
        }
    }
}

pub(crate) fn extract_pdf_text(path: &Path) -> Result<String, String> {
    let document = Document::load(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if document.is_encrypted() {
        return Err("PDF text extraction failed".to_owned());
    }
    let pages = document.get_pages().into_keys().collect::<Vec<_>>();
    document
        .extract_text(&pages)
        .map_err(|_| "PDF text extraction failed".to_owned())
}
