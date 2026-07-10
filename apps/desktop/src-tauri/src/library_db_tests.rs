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
