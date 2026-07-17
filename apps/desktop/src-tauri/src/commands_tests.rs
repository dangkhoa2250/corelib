use std::{
    fs,
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

#[cfg(target_os = "macos")]
use std::process::Command;

use tauri::Manager;
use tempfile::tempdir;

use crate::commands::{
    download_drive_file_async, download_drive_file_async_guarded, get_document_file_url,
    import_local_documents_for_test, scope_from_payload, validate_import_paths, validate_read_page,
    IndexTask, IndexWorkerPool, LibraryStore, StudyRatingPayload, INDEX_QUEUE_CAPACITY,
};
use crate::library_db::{LibraryDatabase, NewLocalDocument};
use crate::library_store::content_hash;
use crate::model::StudyScopePayload;

#[test]
fn drive_download_runs_off_command_thread_without_holding_database_lock() {
    let database = std::sync::Arc::new(std::sync::Mutex::new(()));
    let database_for_download = std::sync::Arc::clone(&database);
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let result = tauri::async_runtime::block_on(async {
        let task = tauri::async_runtime::spawn(download_drive_file_async(
            "drive-file".to_owned(),
            tempdir().expect("temporary directory").keep(),
            move |_file_id| {
                started_tx.send(()).expect("signal worker start");
                assert!(
                    database_for_download.try_lock().is_ok(),
                    "download callback must run without a database lock"
                );
                std::thread::sleep(Duration::from_millis(25));
                Ok(b"%PDF".to_vec())
            },
        ));
        started_rx.recv().expect("worker should start");
        assert!(database.try_lock().is_ok(), "database remains available");
        task.await.expect("download task should join")
    });
    assert!(result.is_ok());
}

#[test]
fn cached_drive_document_becomes_ready_and_indexes_once() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let (app, tasks) = app_with_controlled_indexer(&library_root);
    let mut database = LibraryDatabase::open(&library_root).expect("open database");
    database
        .insert_drive("drive-document", "drive-file-1", "Cached.pdf")
        .expect("insert Drive document");
    drop(database);
    let cache = crate::drive_cache::Cache::new(library_root.clone());
    let cached_path = cache
        .put("drive-file-1", b"%PDF-1.4\ncached\n")
        .expect("seed cache");

    let path = tauri::async_runtime::block_on(get_document_file_url(
        "drive-document".to_owned(),
        app.state(),
    ))
    .expect("cache hit should return the cached path");
    assert_eq!(path, cached_path.to_string_lossy());
    let document = crate::commands::list_documents(app.state())
        .expect("list documents")
        .pop()
        .expect("cached document");
    assert_eq!(document.status, "ready");
    tasks
        .try_recv()
        .expect("cache hit should schedule indexing")();
    assert!(
        tasks.try_recv().is_err(),
        "indexing should be scheduled once"
    );

    tauri::async_runtime::block_on(get_document_file_url(
        "drive-document".to_owned(),
        app.state(),
    ))
    .expect("second cache hit should return the cached path");
    assert!(
        tasks.try_recv().is_err(),
        "claimed indexing should not duplicate"
    );
}

#[test]
fn clearing_cache_invalidates_an_in_flight_download() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let generation = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let cache_lock = Arc::new(Mutex::new(()));
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let generation_for_task = Arc::clone(&generation);
    let lock_for_task = Arc::clone(&cache_lock);
    let root_for_task = library_root.clone();
    let task = tauri::async_runtime::spawn(download_drive_file_async_guarded(
        "drive-file-1".to_owned(),
        root_for_task,
        generation_for_task,
        lock_for_task,
        move |_file_id| {
            started_tx.send(()).expect("signal worker start");
            release_rx.recv().expect("wait for clear");
            Ok(b"%PDF-1.4\nin-flight\n".to_vec())
        },
    ));
    started_rx.recv().expect("download should start");
    {
        let _guard = cache_lock.lock().expect("lock cache");
        generation.fetch_add(1, Ordering::SeqCst);
        crate::drive_cache::Cache::new(library_root.clone())
            .clear()
            .expect("clear cache");
    }
    release_tx.send(()).expect("release download");
    let result = tauri::async_runtime::block_on(task).expect("guarded download task should join");
    assert_eq!(result, Err("cache_cleared_during_download".to_owned()));
    assert!(!crate::drive_cache::Cache::new(library_root)
        .path_for("drive-file-1")
        .exists());
}

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

    let imported = import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("initial import");
    import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    let imported = import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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
fn completed_workers_drain_overflowed_pending_indexes_without_another_import_or_restart() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let (sender, tasks) = mpsc::sync_channel(INDEX_QUEUE_CAPACITY);
    let scheduled = Arc::new(AtomicUsize::new(0));
    let scheduled_by_scheduler = Arc::clone(&scheduled);
    let app = tauri::test::mock_builder()
        .manage(
            LibraryStore::open_with_scheduler(
                library_root,
                Arc::new(move |task: IndexTask| match sender.try_send(task) {
                    Ok(()) => {
                        scheduled_by_scheduler.fetch_add(1, Ordering::SeqCst);
                        true
                    }
                    Err(_) => false,
                }),
            )
            .expect("open library"),
        )
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("build test application");
    let sources = (0..INDEX_QUEUE_CAPACITY + 2)
        .map(|index| {
            let path = directory.path().join(format!("overflow-{index}.pdf"));
            fs::write(&path, format!("%PDF-1.4\nmalformed-{index}\n"))
                .expect("write valid PDF header");
            path.to_string_lossy().into_owned()
        })
        .collect();

    let imported = import_local_documents_for_test(sources, app.state()).expect("import documents");

    assert_eq!(
        scheduled.load(Ordering::SeqCst),
        INDEX_QUEUE_CAPACITY,
        "only the bounded queue capacity is scheduled initially"
    );

    for _ in 0..imported.len() {
        tasks
            .recv_timeout(Duration::from_secs(1))
            .expect("each completed worker should schedule the next pending document")();
    }

    assert!(
        tasks.try_recv().is_err(),
        "all work should complete exactly once without a busy retry loop"
    );
    assert!(
        crate::commands::list_documents(app.state())
            .expect("list documents")
            .iter()
            .all(|document| document.status == "ready"),
        "every overflowed document should finish after worker completions"
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

    let imported = import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
        .expect("initial import");
    tasks
        .try_recv()
        .expect("initial document should be indexed")();
    assert_eq!(
        crate::commands::list_documents(app.state()).expect("list indexed documents")[0].status,
        "ready"
    );

    import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    let result = import_local_documents_for_test(
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

    let result = import_local_documents_for_test(
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

    let result = import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state());

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

    let result = import_local_documents_for_test(
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
            import_local_documents_for_test(vec![path.to_string_lossy().into_owned()], app.state()).is_err()
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

    assert!(import_local_documents_for_test(
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
        import_local_documents_for_test(vec![fifo_path.to_string_lossy().into_owned()], app.state())
            .is_err()
    );
    assert!(crate::commands::list_documents(app.state())
        .expect("list documents")
        .is_empty());
    assert!(!library_root.join("documents").exists());
}

fn study_review_log_count(library_root: &Path, card_id: &str) -> i64 {
    let database = LibraryDatabase::open(library_root).expect("open database");
    database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM review_logs WHERE card_id = ?1",
            rusqlite::params![card_id],
            |row| row.get(0),
        )
        .expect("count review logs")
}

#[test]
fn study_scope_conversion_rejects_invalid_kind_and_missing_deck() {
    assert!(scope_from_payload(StudyScopePayload {
        kind: "all".into(),
        deck_id: None,
    })
    .is_ok());
    assert!(scope_from_payload(StudyScopePayload {
        kind: "deck".into(),
        deck_id: Some("deck-1".into()),
    })
    .is_ok());
    assert!(scope_from_payload(StudyScopePayload {
        kind: "deck".into(),
        deck_id: None,
    })
    .is_err());
    assert!(scope_from_payload(StudyScopePayload {
        kind: "everything".into(),
        deck_id: None,
    })
    .is_err());
}

#[test]
fn rate_study_card_rejects_negative_elapsed_ms_without_writes() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let error = crate::commands::rate_study_card(
        StudyRatingPayload {
            session_id: "session".into(),
            card_id: "card".into(),
            grant_token: "token".into(),
            expected_state: "review".into(),
            expected_due_at: "2026-07-16T08:00:00.000Z".into(),
            rating: crate::scheduler::Rating::Good,
            elapsed_ms: -1,
        },
        app.state(),
    )
    .expect_err("negative elapsed rejected");
    assert_eq!(error, "elapsedMs must be nonnegative");
}

#[test]
fn rate_study_card_surfaces_stale_grant_message_without_writes() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    crate::commands::create_deck("Biology".to_owned(), app.state()).expect("create deck");
    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
        },
        app.state(),
    )
    .expect("create card");

    let scope = StudyScopePayload {
        kind: "deck".into(),
        deck_id: Some(card.deck_id.clone()),
    };
    let session =
        crate::commands::start_study_session(scope, app.state()).expect("start session");
    let grant = session.cards[0].clone();

    crate::commands::set_cards_suspended(vec![card.id.clone()], true, app.state())
        .expect("suspend card");

    let error = crate::commands::rate_study_card(
        StudyRatingPayload {
            session_id: session.session_id.clone(),
            card_id: grant.card.id.clone(),
            grant_token: grant.grant_token.clone(),
            expected_state: grant.expected_state.clone(),
            expected_due_at: grant.expected_due_at.clone(),
            rating: crate::scheduler::Rating::Good,
            elapsed_ms: 1000,
        },
        app.state(),
    )
    .expect_err("stale grant rejected");
    assert_eq!(error, "study card changed; refresh the session");
    assert_eq!(study_review_log_count(&library_root, &card.id), 0);
}

#[test]
fn rate_study_card_rejects_expired_session_without_writes() {
    let directory = tempdir().expect("create temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    crate::commands::create_deck("Biology".to_owned(), app.state()).expect("create deck");
    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
        },
        app.state(),
    )
    .expect("create card");

    let scope = StudyScopePayload {
        kind: "deck".into(),
        deck_id: Some(card.deck_id.clone()),
    };
    let session =
        crate::commands::start_study_session(scope, app.state()).expect("start session");
    let grant = session.cards[0].clone();

    {
        let database = LibraryDatabase::open(&library_root).expect("reopen database");
        database
            .connection
            .execute(
                "UPDATE study_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?1",
                rusqlite::params![session.session_id],
            )
            .expect("expire session");
    }

    let error = crate::commands::rate_study_card(
        StudyRatingPayload {
            session_id: session.session_id.clone(),
            card_id: grant.card.id.clone(),
            grant_token: grant.grant_token.clone(),
            expected_state: grant.expected_state.clone(),
            expected_due_at: grant.expected_due_at.clone(),
            rating: crate::scheduler::Rating::Good,
            elapsed_ms: 1000,
        },
        app.state(),
    )
    .expect_err("expired session rejected");
    assert_eq!(error, "study session expired");
    assert_eq!(study_review_log_count(&library_root, &card.id), 0);
}
