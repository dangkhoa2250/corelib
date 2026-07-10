use std::{fs, path::Path};

#[cfg(target_os = "macos")]
use std::process::Command;

use tauri::Manager;
use tempfile::tempdir;

use crate::commands::{
    import_local_documents, validate_import_paths, validate_read_page, LibraryStore,
};

fn app_with_library(path: &Path) -> tauri::App<tauri::test::MockRuntime> {
    tauri::test::mock_builder()
        .manage(LibraryStore::open(path.to_path_buf()).expect("open library"))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("build test application")
}

#[test]
fn import_command_validation_rejects_empty_and_non_pdf_paths() {
    assert!(validate_import_paths(&[]).is_err());
    assert!(validate_import_paths(&["".to_owned()]).is_err());
    assert!(validate_import_paths(&["/tmp/not-a-pdf.txt".to_owned()]).is_err());
}

#[test]
fn save_read_page_command_validation_rejects_non_positive_pages() {
    assert!(validate_read_page(0).is_err());
    assert!(validate_read_page(-1).is_err());
}

#[test]
fn batch_import_rejects_a_whitespace_title_without_creating_any_documents() {
    let directory = tempdir().expect("create temporary directory");
    let valid_pdf = directory.path().join("valid.pdf");
    let blank_title_pdf = directory.path().join("   .pdf");
    let library_root = directory.path().join("library");
    fs::write(&valid_pdf, b"%PDF-1.4\nvalid\n").expect("write valid PDF");
    fs::write(&blank_title_pdf, b"%PDF-1.4\nblank title\n").expect("write blank-title PDF");
    let app = app_with_library(&library_root);

    let result = import_local_documents(
        vec![
            valid_pdf.to_string_lossy().into_owned(),
            blank_title_pdf.to_string_lossy().into_owned(),
        ],
        app.state(),
    );

    assert!(result.is_err());
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(
        !library_root.join("documents").exists(),
        "no managed directory should be created"
    );
}

#[test]
fn batch_import_prevalidates_every_path_before_copying() {
    let directory = tempdir().expect("create temporary directory");
    let valid_pdf = directory.path().join("valid.pdf");
    let invalid_path = directory.path().join("not-a-pdf.txt");
    let library_root = directory.path().join("library");
    fs::write(&valid_pdf, b"%PDF-1.4\nvalid\n").expect("write valid PDF");
    fs::write(&invalid_path, b"not a PDF").expect("write invalid input");
    let app = app_with_library(&library_root);

    let result = import_local_documents(
        vec![
            valid_pdf.to_string_lossy().into_owned(),
            invalid_path.to_string_lossy().into_owned(),
        ],
        app.state(),
    );

    assert!(result.is_err());
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}

#[test]
fn batch_import_removes_new_managed_files_when_the_database_batch_fails() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("valid.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\nvalid\n").expect("write valid PDF");
    let app = app_with_library(&library_root);
    app.state::<LibraryStore>()
        .install_insert_failure_for_test()
        .expect("install insert failure");

    let result = import_local_documents(vec![source.to_string_lossy().into_owned()], app.state());

    assert!(result.is_err());
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(library_root.join("documents").exists());
    assert!(
        fs::read_dir(library_root.join("documents"))
            .expect("read managed directory")
            .next()
            .is_none(),
        "the failed batch must remove files it created"
    );
}

#[test]
fn import_rejects_a_pdf_name_with_non_pdf_contents() {
    let directory = tempdir().expect("create temporary directory");
    let renamed_text = directory.path().join("renamed.pdf");
    let library_root = directory.path().join("library");
    fs::write(&renamed_text, b"this is not a PDF").expect("write renamed text file");
    let app = app_with_library(&library_root);

    let result = import_local_documents(
        vec![renamed_text.to_string_lossy().into_owned()],
        app.state(),
    );

    assert!(result.is_err());
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}

#[test]
fn import_rejects_missing_and_directory_paths() {
    let directory = tempdir().expect("create temporary directory");
    let missing = directory.path().join("missing.pdf");
    let directory_pdf = directory.path().join("directory.pdf");
    let library_root = directory.path().join("library");
    fs::create_dir(&directory_pdf).expect("create directory with PDF suffix");
    let app = app_with_library(&library_root);

    for path in [missing, directory_pdf] {
        assert!(
            import_local_documents(vec![path.to_string_lossy().into_owned()], app.state()).is_err()
        );
    }

    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}

#[cfg(unix)]
#[test]
fn import_rejects_symlinked_pdf_input() {
    use std::os::unix::fs::symlink;

    let directory = tempdir().expect("create temporary directory");
    let target = directory.path().join("target.pdf");
    let symlink_path = directory.path().join("linked.pdf");
    let library_root = directory.path().join("library");
    fs::write(&target, b"%PDF-1.4\ntarget\n").expect("write target PDF");
    symlink(&target, &symlink_path).expect("create symlink");
    let app = app_with_library(&library_root);

    assert!(import_local_documents(
        vec![symlink_path.to_string_lossy().into_owned()],
        app.state()
    )
    .is_err());
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}

#[cfg(target_os = "macos")]
#[test]
fn import_rejects_fifo_pdf_input() {
    let directory = tempdir().expect("create temporary directory");
    let fifo_path = directory.path().join("input.pdf");
    let library_root = directory.path().join("library");
    assert!(Command::new("mkfifo")
        .arg(&fifo_path)
        .status()
        .expect("run mkfifo")
        .success());
    let app = app_with_library(&library_root);

    assert!(
        import_local_documents(vec![fifo_path.to_string_lossy().into_owned()], app.state())
            .is_err()
    );
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}
