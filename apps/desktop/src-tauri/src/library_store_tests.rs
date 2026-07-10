use std::fs;

use tempfile::tempdir;

use crate::library_store::{content_hash, import_pdf};

#[test]
fn importing_the_same_pdf_twice_reuses_the_managed_file() {
    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("fixture.pdf");
    let library_root = temporary_directory.path().join("library");
    fs::write(&source_path, b"%PDF-1.4\nfixture content\n").expect("write fixture PDF");

    let hash = content_hash(&source_path).expect("hash fixture PDF");
    let first_path = import_pdf(&library_root, &source_path, &hash).expect("first import");
    let second_path = import_pdf(&library_root, &source_path, &hash).expect("second import");

    assert_eq!(first_path, second_path);
    assert!(std::path::Path::new(&first_path).exists());
}
