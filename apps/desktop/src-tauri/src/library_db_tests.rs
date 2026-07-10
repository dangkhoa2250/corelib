use std::{sync::Arc, thread};

use tempfile::tempdir;

use crate::library_db::{LibraryDatabase, NewLocalDocument};

#[test]
fn inserting_a_duplicate_local_hash_returns_the_existing_record() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");

    let first = database
        .insert_local(NewLocalDocument {
            id: "first".into(),
            title: "First title".into(),
            content_hash: "same-content".into(),
            managed_path: "/managed/first.pdf".into(),
        })
        .expect("insert first document");
    let duplicate = database
        .insert_local(NewLocalDocument {
            id: "second".into(),
            title: "Second title".into(),
            content_hash: "same-content".into(),
            managed_path: "/managed/second.pdf".into(),
        })
        .expect("return existing document");

    assert_eq!(duplicate.id, first.id);
    assert_eq!(duplicate.title, "First title");
    assert_eq!(database.list().expect("list documents").len(), 1);
}

#[test]
fn search_matches_title_metadata_case_insensitively() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "ada".into(),
            title: "Ada's Notes".into(),
            content_hash: "ada-content".into(),
            managed_path: "/managed/ada.pdf".into(),
        })
        .expect("insert document");

    let results = database.search("aDa").expect("search documents");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "ada");
}

#[test]
fn local_documents_start_processing_while_text_is_pending() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");

    let document = database
        .insert_local(NewLocalDocument {
            id: "pending".into(),
            title: "Pending index".into(),
            content_hash: "pending-content".into(),
            managed_path: "/managed/pending.pdf".into(),
        })
        .expect("insert document");

    assert_eq!(document.status, "processing");
    assert!(!document.indexed);
}

#[test]
fn completing_an_index_writes_searchable_text_and_marks_document_ready() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "searchable".into(),
            title: "Untitled PDF".into(),
            content_hash: "searchable-content".into(),
            managed_path: "/managed/searchable.pdf".into(),
        })
        .expect("insert document");

    database
        .set_index_ready(
            "searchable",
            "Fourier transforms reveal hidden frequencies",
            None,
        )
        .expect("store extracted text");

    let documents = database
        .search("frequencies")
        .expect("search extracted text");
    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].id, "searchable");
    assert_eq!(documents[0].status, "ready");
    assert!(documents[0].indexed);
}

#[test]
fn failed_indexing_keeps_the_document_ready_for_reader_access() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "failed".into(),
            title: "Encrypted PDF".into(),
            content_hash: "failed-content".into(),
            managed_path: "/managed/failed.pdf".into(),
        })
        .expect("insert document");

    database
        .set_index_failed("failed")
        .expect("mark index failure");

    let document = database
        .list()
        .expect("list documents")
        .pop()
        .expect("document");
    assert_eq!(document.id, "failed");
    assert_eq!(document.status, "ready");
    assert!(!document.indexed);
}

#[test]
fn updating_to_an_invalid_page_fails() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "page-test".into(),
            title: "Page test".into(),
            content_hash: "page-test-content".into(),
            managed_path: "/managed/page-test.pdf".into(),
        })
        .expect("insert document");

    assert!(database.update_read_page("page-test", 0).is_err());
}

#[test]
fn concurrent_database_opens_apply_the_migration_once() {
    let directory = tempdir().expect("create temporary directory");
    let database_directory = directory.path().to_path_buf();
    let start = Arc::new(std::sync::Barrier::new(2));
    let handles = (0..2)
        .map(|_| {
            let database_directory = database_directory.clone();
            let start = Arc::clone(&start);
            thread::spawn(move || {
                start.wait();
                LibraryDatabase::open(database_directory)
            })
        })
        .collect::<Vec<_>>();

    for handle in handles {
        assert!(handle.join().expect("join opener").is_ok());
    }
}

#[test]
fn batch_insert_rolls_back_when_a_later_document_cannot_be_recorded() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");

    let result = database.insert_local_batch(vec![
        NewLocalDocument {
            id: "same-id".into(),
            title: "First".into(),
            content_hash: "first-content".into(),
            managed_path: "/managed/first.pdf".into(),
        },
        NewLocalDocument {
            id: "same-id".into(),
            title: "Second".into(),
            content_hash: "second-content".into(),
            managed_path: "/managed/second.pdf".into(),
        },
    ]);

    assert!(result.is_err());
    assert!(database.list().expect("list documents").is_empty());
}
