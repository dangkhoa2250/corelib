//! Background PDF text indexing using the pure-Rust `lopdf` crate (0.43).

use std::{
    fs,
    panic::{catch_unwind, AssertUnwindSafe},
    path::Path,
    sync::{Arc, Mutex},
};

use lopdf::Document;

use crate::library_db::LibraryDatabase;

pub const MAX_PDF_INPUT_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_PDF_PAGE_COUNT: usize = 256;
pub const MAX_EXTRACTED_TEXT_BYTES: usize = 4 * 1024 * 1024;

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
    let metadata = fs::metadata(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if !metadata.is_file() || metadata.len() > MAX_PDF_INPUT_BYTES as u64 {
        return Err("PDF text extraction failed".to_owned());
    }
    let document = Document::load(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if document.is_encrypted() {
        return Err("PDF text extraction failed".to_owned());
    }
    let pages = document.get_pages();
    if pages.len() > MAX_PDF_PAGE_COUNT {
        return Err("PDF text extraction failed".to_owned());
    }

    let mut extracted = String::new();
    for page in pages.into_keys() {
        let page_text = document
            .extract_text(&[page])
            .map_err(|_| "PDF text extraction failed".to_owned())?;
        if extracted
            .len()
            .checked_add(page_text.len())
            .is_none_or(|length| length > MAX_EXTRACTED_TEXT_BYTES)
        {
            return Err("PDF text extraction failed".to_owned());
        }
        extracted.push_str(&page_text);
    }
    Ok(extracted)
}
