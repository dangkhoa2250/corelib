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

#[test]
fn rejects_a_hash_that_would_escape_the_library_root() {
    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("fixture.pdf");
    let library_root = temporary_directory.path().join("library");
    let escaped_path = temporary_directory.path().join("escape.pdf");
    fs::write(&source_path, b"%PDF-1.4\nfixture content\n").expect("write fixture PDF");

    let error = import_pdf(&library_root, &source_path, "../../escape")
        .expect_err("reject a path traversal hash");

    assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    assert!(!escaped_path.exists());
}

#[test]
fn rejects_a_mismatched_hash_without_creating_a_managed_file() {
    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("fixture.pdf");
    let library_root = temporary_directory.path().join("library");
    fs::write(&source_path, b"%PDF-1.4\nfixture content\n").expect("write fixture PDF");

    let trusted_hash = content_hash(&source_path).expect("hash fixture PDF");
    let replacement = if trusted_hash.starts_with('0') {
        "1"
    } else {
        "0"
    };
    let mismatched_hash = format!("{replacement}{}", &trusted_hash[1..]);
    let poisoned_path = library_root
        .join("documents")
        .join(format!("{mismatched_hash}.pdf"));

    let error = import_pdf(&library_root, &source_path, &mismatched_hash)
        .expect_err("reject a mismatched hash");

    assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    assert!(!poisoned_path.exists());
}
