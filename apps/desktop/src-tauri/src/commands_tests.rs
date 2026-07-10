use std::{
    fs,
    path::Path,
    sync::{mpsc, Arc},
};

#[cfg(target_os = "macos")]
use std::process::Command;

use tauri::Manager;
use tempfile::tempdir;

use crate::commands::{
    import_local_documents, validate_import_paths, validate_read_page, IndexTask, IndexWorkerPool,
    LibraryStore, INDEX_QUEUE_CAPACITY,
};
use crate::library_db::{LibraryDatabase, NewLocalDocument};
use crate::library_store::content_hash;

fn app_with_library(path: &Path) -> tauri::App<tauri::test::MockRuntime> {
    tauri::test::mock_builder()
        .manage(LibraryStore::open(path.to_path_buf()).expect("open library"))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("build test application")
}

fn app_with_controlled_indexer(
    path: &Path,
) -> (
    tauri::App<tauri::test::MockRuntime>,
    mpsc::Receiver<IndexTask>,
) {
    let (sender, receiver) = mpsc::channel();
    let scheduler = Arc::new(move |task: IndexTask| sender.send(task).is_ok());
    let app = tauri::test::mock_builder()
        .manage(
            LibraryStore::open_with_scheduler(path.to_path_buf(), scheduler).expect("open library"),
        )
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("build test application");
    (app, receiver)
}

#[test]
fn import_command_validation_rejects_empty_and_non_pdf_paths() {
    assert!(validate_import_paths(&[]).is_err());
    assert!(validate_import_paths(&["".to_owned()]).is_err());
    assert!(validate_import_paths(&["/tmp/not-a-pdf.txt".to_owned()]).is_err());
}

#[test]
fn import_returns_pending_before_its_background_index_task_runs() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("pending.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\npending\n").expect("write valid PDF");
    let (app, tasks) = app_with_controlled_indexer(&library_root);

    let imported = import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("import document without waiting for extraction");

    assert_eq!(imported[0].status, "processing");
    assert!(!imported[0].indexed);
    let task = tasks.try_recv().expect("index task should be scheduled");
    task();
    let indexed = crate::commands::list_documents(app.state()).expect("list after task");
    assert_eq!(indexed[0].status, "ready");
    assert!(
        !indexed[0].indexed,
        "malformed text extraction is recoverable"
    );
}

#[test]
fn reopening_the_application_requeues_a_persisted_pending_index() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let managed_path = library_root.join("documents").join("pending.pdf");
    fs::create_dir_all(managed_path.parent().expect("managed directory"))
        .expect("create directory");
    fs::write(&managed_path, b"%PDF-1.4\npending\n").expect("write PDF");
    let mut database = LibraryDatabase::open(&library_root).expect("open initial database");
    database
        .insert_local(NewLocalDocument {
            id: "persisted-pending".into(),
            title: "Persisted pending".into(),
            content_hash: "persisted-pending-hash".into(),
            managed_path: managed_path.to_string_lossy().into_owned(),
        })
        .expect("insert pending document");
    drop(database);

    let (_app, tasks) = app_with_controlled_indexer(&library_root);

    assert!(
        tasks.try_recv().is_ok(),
        "startup should requeue pending work"
    );
}

#[test]
fn reimporting_a_pending_document_does_not_schedule_a_second_extraction() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("pending-again.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\npending\n").expect("write valid PDF");
    let (app, tasks) = app_with_controlled_indexer(&library_root);

    import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("initial import");
    import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("reimport while pending");

    assert!(
        tasks.try_recv().is_ok(),
        "first import schedules extraction"
    );
    assert!(
        tasks.try_recv().is_err(),
        "the pending lease deduplicates extraction"
    );
}

#[test]
fn a_full_index_queue_rejects_work_without_exceeding_its_bound() {
    let pool = IndexWorkerPool::without_workers();

    for _ in 0..INDEX_QUEUE_CAPACITY {
        assert!(pool.try_schedule(Box::new(|| {})));
    }
    assert!(
        !pool.try_schedule(Box::new(|| {})),
        "the bounded queue must reject overflow rather than growing"
    );
}

#[test]
fn a_rejected_index_schedule_leaves_the_document_durably_pending() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("overflow.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\noverflow\n").expect("write valid PDF");
    let app = tauri::test::mock_builder()
        .manage(
            LibraryStore::open_with_scheduler(
                library_root.clone(),
                Arc::new(|_task: IndexTask| false),
            )
            .expect("open library"),
        )
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("build test application");

    let imported = import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("import document");
    let mut database = LibraryDatabase::open(&library_root).expect("open database");

    assert_eq!(imported[0].status, "processing");
    assert!(
        database
            .claim_pending_index(&imported[0].id)
            .expect("claim pending index")
            .is_some(),
        "a full queue must release its claim so startup or a later schedule can retry"
    );
}

#[test]
fn import_recovers_an_existing_managed_pdf_without_a_database_row_and_indexes_it_once() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("recovered.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\nrecovered\n").expect("write valid PDF");
    let hash = content_hash(&source).expect("hash source");
    let managed_path = library_root.join("documents").join(format!("{hash}.pdf"));
    fs::create_dir_all(managed_path.parent().expect("managed parent"))
        .expect("create managed directory");
    fs::copy(&source, &managed_path).expect("seed managed PDF without database record");
    let (app, tasks) = app_with_controlled_indexer(&library_root);

    let imported = import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("recover managed document");

    assert_eq!(imported.len(), 1);
    assert_eq!(imported[0].status, "processing");
    assert!(!imported[0].indexed);
    let task = tasks
        .try_recv()
        .expect("recovered database record should be indexed");
    assert!(tasks.try_recv().is_err(), "only one task should be queued");
    task();
    let indexed = crate::commands::list_documents(app.state()).expect("list recovered document");
    assert_eq!(indexed[0].id, imported[0].id);
    assert_eq!(indexed[0].status, "ready");
}

#[test]
fn importing_an_existing_ready_database_record_does_not_queue_another_index_task() {
    let directory = tempdir().expect("create temporary directory");
    let source = directory.path().join("existing.pdf");
    let library_root = directory.path().join("library");
    fs::write(&source, b"%PDF-1.4\nexisting\n").expect("write valid PDF");
    let (app, tasks) = app_with_controlled_indexer(&library_root);

    import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("initial import");
    tasks
        .try_recv()
        .expect("initial document should be indexed")();
    assert_eq!(
        crate::commands::list_documents(app.state()).expect("list indexed documents")[0].status,
        "ready"
    );

    import_local_documents(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("reimport existing database record");

    assert!(
        tasks.try_recv().is_err(),
        "ready database records should not be reindexed"
    );
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
