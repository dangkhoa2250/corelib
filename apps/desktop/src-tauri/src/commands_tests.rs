use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};

#[cfg(target_os = "macos")]
use std::process::Command;

use chrono::{TimeZone, Timelike, Utc};
use tauri::Manager;
use tempfile::tempdir;

use crate::commands::{
    discard_media_draft, download_drive_file_async, download_drive_file_async_guarded,
    fetch_remote_image_preview, get_document_file_url, import_local_documents_for_test,
    local_review_clock, resolve_card_media, resolve_staged_media, scope_from_payload, stage_card_media,
    stage_remote_card_media, validate_import_paths, validate_read_page, IndexTask, IndexWorkerPool,
    LibraryStore, StageCardMediaInput, StudyRatingPayload, INDEX_QUEUE_CAPACITY,
};
use crate::library_db::{LibraryDatabase, NewLocalDocument};
use crate::library_store::content_hash;
use crate::media::{CardMediaStore, MEDIA_DIR_NAME};
use crate::model::StudyScopePayload;

#[test]
fn local_review_clock_uses_the_supplied_instant_in_the_current_timezone() {
    let fixed_now = Utc
        .with_ymd_and_hms(2030, 1, 2, 3, 4, 5)
        .single()
        .expect("construct fixed UTC instant");
    let expected_local = fixed_now.with_timezone(&chrono::Local);

    let (study_day, local_minute_of_day) = local_review_clock(fixed_now);

    assert_eq!(study_day, expected_local.date_naive().to_string());
    assert_eq!(
        local_minute_of_day,
        i64::from(expected_local.hour() * 60 + expected_local.minute())
    );
}

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

    let imported =
        import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    let imported =
        import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    let imported =
        import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state())
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

    let result =
        import_local_documents_for_test(vec![source.to_string_lossy().into_owned()], app.state());

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
        assert!(import_local_documents_for_test(
            vec![path.to_string_lossy().into_owned()],
            app.state()
        )
        .is_err());
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

    assert!(import_local_documents_for_test(
        vec![fifo_path.to_string_lossy().into_owned()],
        app.state()
    )
    .is_err());
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
            front_doc: None,
            back_doc: None,
            media_draft_id: None,
        },
        app.state(),
    )
    .expect("create card");

    let scope = StudyScopePayload {
        kind: "deck".into(),
        deck_id: Some(card.deck_id.clone()),
    };
    let session = crate::commands::start_study_session(scope, app.state()).expect("start session");
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
            front_doc: None,
            back_doc: None,
            media_draft_id: None,
        },
        app.state(),
    )
    .expect("create card");

    let scope = StudyScopePayload {
        kind: "deck".into(),
        deck_id: Some(card.deck_id.clone()),
    };
    let session = crate::commands::start_study_session(scope, app.state()).expect("start session");
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

/// Minimal valid 1x1 PNG (same signature used by the media store tests).
const MEDIA_PNG_BYTES: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0x8B, 0x8F, 0xC4, 0x4E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

const MEDIA_JPEG_BYTES: &[u8] = &[
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
];

fn base64_standard(bytes: &[u8]) -> String {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    STANDARD.encode(bytes)
}

fn media_rows(library_root: &Path) -> Vec<(String, String, Option<String>, Option<String>)> {
    let database = LibraryDatabase::open(library_root).expect("reopen database");
    let mut statement = database
        .connection
        .prepare(
            "SELECT id, relative_path, card_id, draft_id FROM card_media \
             ORDER BY created_at, id",
        )
        .expect("prepare media query");
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .expect("query media rows");
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .expect("collect media rows")
}

#[test]
fn stage_card_media_command_stages_a_file_source_under_staging() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);
    let source = directory.path().join("photo.png");
    fs::write(&source, MEDIA_PNG_BYTES).expect("write source png");

    let staged = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "file".to_string(),
            attribution: None,
            file_path: Some(source.to_string_lossy().into_owned()),
            bytes_base64: None,
        },
        app.state(),
    )
    .expect("stage from file");

    assert_eq!(staged.source_type, "file");
    assert_eq!(staged.mime_type, "image/png");
    assert_eq!(staged.card_id, None);
    assert_eq!(staged.draft_id.as_deref(), Some("draft-1"));
    assert!(
        staged.relative_path.starts_with("staging/draft-1/"),
        "staged file must live under staging/draft-1/, got {}",
        staged.relative_path
    );
    assert!(library_root
        .join("card-media")
        .join(&staged.relative_path)
        .is_file());
}

#[test]
fn stage_card_media_command_stages_base64_for_clipboard_and_web() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let clipboard = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage clipboard png");

    let web = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "web".to_string(),
            attribution: Some("Artist · CC BY".to_string()),
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_JPEG_BYTES)),
        },
        app.state(),
    )
    .expect("stage web jpeg");

    assert_eq!(clipboard.source_type, "clipboard");
    assert_eq!(clipboard.mime_type, "image/png");
    assert_eq!(web.source_type, "web");
    assert_eq!(web.mime_type, "image/jpeg");
    assert_eq!(web.attribution.as_deref(), Some("Artist · CC BY"));
    let rows = media_rows(&library_root);
    assert_eq!(rows.len(), 2);
    for (_id, relative_path, card_id, draft_id) in rows {
        assert_eq!(card_id, None, "staged rows must not be committed");
        assert_eq!(draft_id.as_deref(), Some("draft-1"));
        assert!(relative_path.starts_with("staging/draft-1/"));
    }
}

fn serve_preview_image() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind preview server");
    let address = listener.local_addr().expect("preview server address");
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept preview request");
        read_request_headers(&mut stream);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\n\r\n",
            MEDIA_PNG_BYTES.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write preview headers");
        stream
            .write_all(MEDIA_PNG_BYTES)
            .expect("write preview body");
    });
    format!("http://test.invalid:{}/preview", address.port())
}

fn read_request_headers(stream: &mut std::net::TcpStream) {
    let mut request = Vec::new();
    let mut byte = [0u8; 1];
    while !request.windows(4).any(|window| window == b"\r\n\r\n") {
        stream.read_exact(&mut byte).expect("read preview request");
        request.push(byte[0]);
        assert!(
            request.len() <= 64 * 1024,
            "preview request headers too large"
        );
    }
}

#[test]
fn fetch_remote_image_preview_command_returns_validated_payload() {
    let payload = tauri::async_runtime::block_on(fetch_remote_image_preview(serve_preview_image()))
        .expect("fetch preview");
    assert_eq!(payload.mime_type, "image/png");
    assert_eq!(base64_standard(MEDIA_PNG_BYTES), payload.data_base64);
}

#[test]
fn library_store_open_cleans_stale_staged_media() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let database = Arc::new(Mutex::new(
        LibraryDatabase::open(&library_root).expect("open database"),
    ));
    let media_store = CardMediaStore::new(Arc::clone(&database), library_root.join(MEDIA_DIR_NAME));
    let staged = media_store
        .stage_from_bytes("stale-draft", MEDIA_PNG_BYTES, "", "web", None)
        .expect("stage media");
    database
        .lock()
        .expect("database lock")
        .connection
        .execute(
            "UPDATE card_media SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?1",
            rusqlite::params![staged.id],
        )
        .expect("age staged media");
    drop(media_store);
    drop(database);

    let _store = LibraryStore::open(library_root.clone()).expect("reopen library");
    assert!(media_rows(&library_root).is_empty());
    assert!(!library_root
        .join(MEDIA_DIR_NAME)
        .join(staged.relative_path)
        .exists());
}

#[test]
fn stage_remote_card_media_command_stages_web_media_with_generic_attribution() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let staged = tauri::async_runtime::block_on(stage_remote_card_media(
        "draft-web".to_string(),
        serve_preview_image(),
        Some("Openverse / CC0".to_string()),
        app.state(),
    ))
    .expect("stage remote image");

    assert_eq!(staged.source_type, "web");
    assert_eq!(staged.attribution.as_deref(), Some("Openverse / CC0"));
    assert_eq!(staged.mime_type, "image/png");
    assert!(library_root
        .join("card-media")
        .join(&staged.relative_path)
        .is_file());
}

#[test]
fn stage_remote_card_media_command_validates_url_before_database_write() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let error = tauri::async_runtime::block_on(stage_remote_card_media(
        "draft-web".to_string(),
        "file:///tmp/image.png".to_string(),
        Some("Openverse / CC0".to_string()),
        app.state(),
    ))
    .expect_err("non-http source");
    assert!(error.contains("http"));
}

#[test]
fn resolve_staged_media_command_returns_an_absolute_owned_path() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);
    let staged = tauri::async_runtime::block_on(stage_remote_card_media(
        "draft-owned".to_string(),
        serve_preview_image(),
        None,
        app.state(),
    ))
    .expect("stage media");

    let resolved = resolve_staged_media(
        "draft-owned".to_string(),
        staged.id,
        app.state(),
    )
    .expect("resolve staged media");

    assert!(Path::new(&resolved).is_absolute());
    assert!(Path::new(&resolved).is_file());
}

#[test]
fn stage_card_media_command_rejects_invalid_combinations() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    // File source without a file path.
    let missing_path = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "file".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: None,
        },
        app.state(),
    );
    assert!(missing_path.is_err(), "file source needs a file path");

    // Clipboard source with neither bytes nor a path.
    let empty_bytes = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: None,
        },
        app.state(),
    );
    assert!(empty_bytes.is_err(), "clipboard source needs bytes");

    // Invalid source type.
    let bad_type = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "dropbox".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    );
    assert!(bad_type.is_err(), "unknown source type rejected");
}

#[test]
fn discard_media_draft_command_removes_only_that_drafts_staging() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    for (draft, bytes) in [("draft-1", MEDIA_PNG_BYTES), ("draft-1", MEDIA_JPEG_BYTES)] {
        stage_card_media(
            StageCardMediaInput {
                draft_id: draft.to_string(),
                source_type: "clipboard".to_string(),
                attribution: None,
                file_path: None,
                bytes_base64: Some(base64_standard(bytes)),
            },
            app.state(),
        )
        .expect("stage");
    }
    stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-2".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage draft-2");

    discard_media_draft("draft-1".to_string(), app.state()).expect("discard draft-1");

    let rows = media_rows(&library_root);
    assert_eq!(rows.len(), 1, "only draft-2 rows remain");
    assert_eq!(rows[0].3.as_deref(), Some("draft-2"));
    // The staging directory for the discarded draft is gone.
    assert!(!library_root.join("card-media/staging/draft-1").exists());
}

#[test]
fn resolve_card_media_command_returns_owned_media_absolute_path() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    // Seed a committed media row: reopen the database to insert a card, promote
    // a staged blob through the store, then resolve via the command.
    let staged = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage");

    {
        let database = LibraryDatabase::open(&library_root).expect("reopen database");
        database
            .connection
            .execute(
                "INSERT INTO decks(id,name,created_at,updated_at) \
                 VALUES('deck-1','deck-1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
                [],
            )
            .expect("insert deck");
        database
            .connection
            .execute(
                "INSERT INTO cards(id,deck_id,front,back,state,due_at,reps,lapses,created_at,updated_at) \
                 VALUES('card-1','deck-1','card-1','card-1','new','2026-01-01T00:00:00.000Z',0,0,\
                 '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
                [],
            )
            .expect("insert card");
        let media_store = crate::media::CardMediaStore::new(
            Arc::new(Mutex::new(database)),
            library_root.join(crate::media::MEDIA_DIR_NAME),
        );
        media_store
            .promote_referenced("card-1", "draft-1", std::slice::from_ref(&staged.id))
            .expect("promote");
    }

    let absolute = resolve_card_media("card-1".to_string(), staged.id.clone(), app.state())
        .expect("resolve owned media");
    assert!(
        Path::new(&absolute).ends_with(Path::new("card-1").join(format!("{}.png", staged.id))),
        "committed media resolves to the absolute file path, got {absolute}"
    );
    assert!(std::path::Path::new(&absolute).is_file());

    let non_owned = resolve_card_media("card-other".to_string(), staged.id.clone(), app.state());
    assert!(
        non_owned.is_err(),
        "must reject media not owned by the card"
    );
    let missing = resolve_card_media("card-1".to_string(), "nope".to_string(), app.state());
    assert!(missing.is_err(), "must reject unknown media id");
}

fn text_doc(text: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": text}],
        }],
    })
}

fn image_doc(media_id: &str, alt: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "doc",
        "content": [{
            "type": "image",
            "attrs": { "mediaId": media_id, "alt": alt, "widthPercent": 50 },
        }],
    })
}

#[test]
fn create_card_command_with_docs_derives_plain_text_and_persists_docs() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);
    let front_doc = text_doc("rich front");
    let back_doc = text_doc("rich back");

    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "ignored".into(),
            back: "ignored".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(front_doc.clone()),
            back_doc: Some(back_doc.clone()),
            media_draft_id: None,
        },
        app.state(),
    )
    .expect("create rich card");

    assert_eq!(card.front, "rich front");
    assert_eq!(card.back, "rich back");
    assert_eq!(card.front_doc, Some(front_doc));
    assert_eq!(card.back_doc, Some(back_doc));
    assert!(card.media.is_empty());
}

#[test]
fn create_card_command_rejects_invalid_doc_naming_the_node_path() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let error = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(serde_json::json!({
                "type": "doc",
                "content": [{ "type": "bogus" }],
            })),
            back_doc: None,
            media_draft_id: None,
        },
        app.state(),
    )
    .expect_err("invalid doc must be rejected");

    assert!(
        error.contains("doc.content[0]"),
        "error must name the offending node path, got: {error}"
    );

    let count: i64 = LibraryDatabase::open(&library_root)
        .expect("reopen database")
        .connection
        .query_row("SELECT COUNT(*) FROM cards", [], |row| row.get(0))
        .expect("count cards");
    assert_eq!(count, 0, "no card may be written for an invalid doc");
}

#[test]
fn update_card_command_removes_unreferenced_media_only_after_successful_save() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let first = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage first blob");
    let second = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-2".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_JPEG_BYTES)),
        },
        app.state(),
    )
    .expect("stage second blob");

    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(image_doc(&first.id, "first")),
            back_doc: None,
            media_draft_id: Some("draft-1".into()),
        },
        app.state(),
    )
    .expect("create card referencing first blob");

    let first_file = library_root
        .join("card-media")
        .join(&card.id)
        .join(format!("{}.png", first.id));
    assert!(first_file.is_file(), "first blob committed under the card");

    let updated = crate::commands::update_card(
        crate::model::UpdateCardPayload {
            card_id: card.id.clone(),
            front: "front".into(),
            back: "back".into(),
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(image_doc(&second.id, "second")),
            back_doc: None,
            media_draft_id: Some("draft-2".into()),
        },
        app.state(),
    )
    .expect("update card to reference second blob");

    let second_file = library_root
        .join("card-media")
        .join(&card.id)
        .join(format!("{}.jpg", second.id));
    assert!(
        second_file.is_file(),
        "second blob committed under the card"
    );
    assert!(
        !first_file.exists(),
        "no-longer-referenced first blob must be removed after a successful save"
    );
    assert_eq!(updated.media.len(), 1);
    assert_eq!(updated.media[0].id, second.id);

    // A failed save must leave the current media untouched.
    let failed = crate::commands::update_card(
        crate::model::UpdateCardPayload {
            card_id: card.id.clone(),
            front: "front".into(),
            back: "back".into(),
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(serde_json::json!({
                "type": "doc",
                "content": [{ "type": "bogus" }],
            })),
            back_doc: None,
            media_draft_id: None,
        },
        app.state(),
    );
    assert!(failed.is_err(), "invalid doc update must fail");
    assert!(
        second_file.is_file(),
        "failed save must leave prior media files intact"
    );
    let rows = media_rows(&library_root);
    assert_eq!(rows.len(), 1, "only the still-referenced media row remains");
    assert_eq!(rows[0].0, second.id);
}

#[test]
fn update_and_move_card_command_persists_docs_and_promotes_staged_media() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let staged = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-edit".to_string(),
            source_type: "web".to_string(),
            attribution: Some("Artist · CC BY".to_string()),
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage web image for the back face");

    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "What is ATP?".into(),
            back: "Energy storage.".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: None,
            back_doc: None,
            media_draft_id: None,
        },
        app.state(),
    )
    .expect("create card");

    let back_doc = image_doc(&staged.id, "cell diagram");
    let updated = crate::commands::update_and_move_card(
        crate::model::UpdateAndMoveCardPayload {
            card_id: card.id.clone(),
            front: "What is ATP?".into(),
            back: "Cell diagram".into(),
            tags: Vec::new(),
            destination_deck_id: None,
            front_language: None,
            front_doc: None,
            back_doc: Some(back_doc.clone()),
            media_draft_id: Some("draft-edit".into()),
        },
        app.state(),
    )
    .expect("update and move with an imported image");

    assert_eq!(updated.back_doc, Some(back_doc));
    assert_eq!(updated.media.len(), 1, "imported image must be committed");
    assert_eq!(updated.media[0].id, staged.id);
    assert_eq!(
        updated.media[0].card_id.as_deref(),
        Some(card.id.as_str()),
        "media row must be owned by the edited card"
    );

    let committed_file = library_root
        .join("card-media")
        .join(&card.id)
        .join(format!("{}.png", staged.id));
    assert!(
        committed_file.is_file(),
        "imported image file must move into card-media/<cardId>"
    );

    let rows = media_rows(&library_root);
    assert_eq!(rows.len(), 1, "no staged rows may remain after promotion");
    assert_eq!(rows[0].0, staged.id);
    assert_eq!(rows[0].2.as_deref(), Some(card.id.as_str()));
    assert_eq!(rows[0].3, None);
}

/// Seeds a trashed card whose committed media file lives on disk, returning
/// `(card_id, media_file, media_id)`.
fn seed_trashed_card_with_media(
    library_root: &Path,
    app: &tauri::App<tauri::test::MockRuntime>,
) -> (String, std::path::PathBuf, String) {
    let staged = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage blob");

    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(image_doc(&staged.id, "photo")),
            back_doc: None,
            media_draft_id: Some("draft-1".into()),
        },
        app.state(),
    )
    .expect("create card referencing staged blob");

    let media_file = library_root
        .join("card-media")
        .join(&card.id)
        .join(format!("{}.png", staged.id));
    assert!(
        media_file.is_file(),
        "committed media file must exist on disk"
    );

    crate::commands::trash_cards(vec![card.id.clone()], app.state()).expect("trash the card");
    assert!(
        media_file.is_file(),
        "trashing a card must keep its media files for restore"
    );

    (card.id, media_file, staged.id)
}

#[test]
fn delete_card_command_removes_committed_media_files() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);

    let staged = stage_card_media(
        StageCardMediaInput {
            draft_id: "draft-1".to_string(),
            source_type: "clipboard".to_string(),
            attribution: None,
            file_path: None,
            bytes_base64: Some(base64_standard(MEDIA_PNG_BYTES)),
        },
        app.state(),
    )
    .expect("stage blob");
    let card = crate::commands::create_card(
        crate::commands::CreateCardInput {
            deck_name: "Biology".into(),
            front: "front".into(),
            back: "back".into(),
            source: None,
            tags: Vec::new(),
            front_language: None,
            front_doc: Some(image_doc(&staged.id, "photo")),
            back_doc: None,
            media_draft_id: Some("draft-1".into()),
        },
        app.state(),
    )
    .expect("create card referencing staged blob");
    let media_file = library_root
        .join("card-media")
        .join(&card.id)
        .join(format!("{}.png", staged.id));
    assert!(
        media_file.is_file(),
        "committed media file must exist on disk"
    );

    crate::commands::delete_card(card.id.clone(), app.state()).expect("delete card");

    assert!(
        !media_file.exists(),
        "delete_card must remove the card media directory"
    );
    let rows = media_rows(&library_root);
    assert!(
        rows.iter().all(|(id, _, _, _)| *id != staged.id),
        "media rows must be removed via CASCADE on delete_card"
    );
}

#[test]
fn delete_cards_permanently_command_removes_committed_media_files() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);
    let (card_id, media_file, media_id) = seed_trashed_card_with_media(&library_root, &app);

    crate::commands::delete_cards_permanently(vec![card_id.clone()], app.state())
        .expect("permanently delete trashed card");

    assert!(
        !media_file.exists(),
        "permanent delete must remove the card media directory"
    );
    let rows = media_rows(&library_root);
    assert!(
        rows.iter().all(|(id, _, _, _)| *id != media_id),
        "media rows must be removed via CASCADE on permanent delete"
    );
}

#[test]
fn empty_trash_command_removes_committed_media_files() {
    let directory = tempdir().expect("temporary directory");
    let library_root = directory.path().join("library");
    let app = app_with_library(&library_root);
    let (_card_id, media_file, media_id) = seed_trashed_card_with_media(&library_root, &app);

    crate::commands::empty_trash(app.state()).expect("empty trash");

    assert!(
        !media_file.exists(),
        "empty trash must remove the card media directory"
    );
    let rows = media_rows(&library_root);
    assert!(
        rows.iter().all(|(id, _, _, _)| *id != media_id),
        "media rows must be removed via CASCADE on empty trash"
    );
}
