use std::{
    fs,
    io::{self, Write},
};

use tempfile::tempdir;

use crate::library_store::{content_hash, import_pdf, import_pdf_with_status_and_copier};

#[cfg(windows)]
use crate::library_store::open_pdf_input_after_metadata_for_test;

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

#[test]
fn failed_managed_copy_removes_the_partial_file_and_temp_artifact() {
    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("fixture.pdf");
    let library_root = temporary_directory.path().join("library");
    let documents_directory = library_root.join("documents");
    fs::write(&source_path, b"%PDF-1.4\nfixture content\n").expect("write fixture PDF");
    let hash = content_hash(&source_path).expect("hash fixture PDF");
    let target_path = documents_directory.join(format!("{hash}.pdf"));

    let result =
        import_pdf_with_status_and_copier(&library_root, &source_path, &hash, |_, destination| {
            destination.write_all(b"partial copy")?;
            Err(io::Error::other("injected copy failure"))
        });
    let error = match result {
        Err(error) => error,
        Ok(_) => panic!("copy failure must be returned"),
    };

    assert_eq!(error.kind(), io::ErrorKind::Other);
    assert!(
        !target_path.exists(),
        "partial data must not reach the final path"
    );
    assert_eq!(
        fs::read_dir(&documents_directory)
            .expect("read documents directory")
            .count(),
        0,
        "failed copies must not leave temp artifacts"
    );
}

#[cfg(windows)]
#[test]
fn safe_open_rejects_a_path_replaced_with_a_symlink_after_metadata_validation() {
    use std::os::windows::fs::symlink_file;

    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("source.pdf");
    let replacement_path = temporary_directory.path().join("replacement.pdf");
    fs::write(&source_path, b"%PDF-1.4\noriginal\n").expect("write original PDF");
    fs::write(&replacement_path, b"%PDF-1.4\nreplacement\n").expect("write replacement PDF");

    let mut symlink_creation_error = None;
    let result = open_pdf_input_after_metadata_for_test(&source_path, || {
        fs::remove_file(&source_path).expect("remove validated source pathname");
        match symlink_file(&replacement_path, &source_path) {
            Ok(()) => Ok(()),
            Err(error) => {
                symlink_creation_error = Some(error);
                Ok(())
            }
        }
    });

    if let Some(error) = symlink_creation_error {
        if error.kind() == io::ErrorKind::PermissionDenied {
            return;
        }
        panic!("create replacement symlink: {error}");
    }

    assert!(
        result.is_err(),
        "safe open must not follow the replacement symlink"
    );
}

#[cfg(unix)]
#[test]
fn managed_copy_uses_the_handle_that_was_hashed_not_a_reopened_path() {
    use std::io::{copy, Seek, SeekFrom};

    let temporary_directory = tempdir().expect("create temporary directory");
    let source_path = temporary_directory.path().join("fixture.pdf");
    let replacement_path = temporary_directory.path().join("replacement.pdf");
    let library_root = temporary_directory.path().join("library");
    let original_contents = b"%PDF-1.4\noriginal content\n";
    let replacement_contents = b"%PDF-1.4\nreplacement content\n";
    fs::write(&source_path, original_contents).expect("write original PDF");
    fs::write(&replacement_path, replacement_contents).expect("write replacement PDF");
    let hash = content_hash(&source_path).expect("hash original PDF");

    let imported = import_pdf_with_status_and_copier(
        &library_root,
        &source_path,
        &hash,
        |source, destination| {
            fs::rename(&replacement_path, &source_path).expect("replace source pathname");
            source.seek(SeekFrom::Start(0))?;
            copy(source, destination).map(|_| ())
        },
    )
    .expect("import exact source handle");

    assert_eq!(
        fs::read(imported.managed_path).expect("read imported PDF"),
        original_contents
    );
    assert_eq!(
        fs::read(&source_path).expect("read replacement PDF"),
        replacement_contents
    );
}
