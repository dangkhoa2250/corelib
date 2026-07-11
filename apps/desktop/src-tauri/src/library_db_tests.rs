use std::{sync::Arc, thread};

use rusqlite::{params, Connection, OptionalExtension};
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
            0,
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
fn opening_a_database_applies_the_learning_schema() {
    let directory = tempdir().expect("create temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    drop(database);

    let connection = Connection::open(directory.path().join("library.sqlite3"))
        .expect("open database connection");
    let migration = connection
        .query_row(
            "SELECT id FROM schema_migrations WHERE id = ?1",
            params!["0005_learning_source_integrity"],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .expect("query migration");

    assert_eq!(migration.as_deref(), Some("0005_learning_source_integrity"));

    let table_count = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type IN ('table', 'virtual table')
               AND name IN ('decks', 'cards', 'card_sources', 'review_logs', 'tags', 'card_tags', 'card_text')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("count learning tables");
    assert_eq!(table_count, 7);

    let index_count = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'index'
               AND name IN (
                 'cards_state_due_at_id',
                 'card_sources_document_id_page',
                 'review_logs_card_id_reviewed_at'
               )",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("count learning indexes");
    assert_eq!(index_count, 3);
}

#[test]
fn learning_schema_enforces_scheduler_relations_and_values() {
    let directory = tempdir().expect("create temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    drop(database);

    let connection = Connection::open(directory.path().join("library.sqlite3"))
        .expect("open database connection");
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .expect("enable foreign keys");
    let timestamp = "2026-07-10T00:00:00Z";
    connection
        .execute(
            "INSERT INTO documents (
               id, source, content_hash, title, managed_path, status, index_state, created_at, updated_at
             ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'ready', 'ready', ?5, ?5)",
            params![
                "document-1",
                "document-content",
                "Source document",
                "/managed/source.pdf",
                timestamp,
            ],
        )
        .expect("insert source document");
    connection
        .execute(
            "INSERT INTO decks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params!["deck-1", "Biology", timestamp],
        )
        .expect("insert deck");
    connection
        .execute(
            "INSERT INTO cards (
               id, deck_id, front, back, state, due_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, 'new', ?5, ?6, ?6)",
            params!["card-1", "deck-1", "   ", "ATP", timestamp, timestamp],
        )
        .expect("insert whitespace card for repository-level validation");
    connection
        .execute(
            "INSERT INTO card_sources (card_id, document_id, page, quote, rects_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["card-1", "document-1", 3, "ATP stores energy.", "[]"],
        )
        .expect("insert card source");
    connection
        .execute(
            "INSERT INTO review_logs (
               id, card_id, reviewed_at, rating, prior_state, next_state,
               prior_due_at, next_due_at, interval_seconds, elapsed_ms, scheduler_version
             ) VALUES (?1, ?2, ?3, 'good', 'new', 'review', ?3, ?3, 86400, 4500, 'fsrs-v1')",
            params!["review-1", "card-1", timestamp],
        )
        .expect("insert review log");
    connection
        .execute(
            "INSERT INTO tags (id, name) VALUES (?1, ?2)",
            params!["tag-1", "biology"],
        )
        .expect("insert tag");
    connection
        .execute(
            "INSERT INTO card_tags (card_id, tag_id) VALUES (?1, ?2)",
            params!["card-1", "tag-1"],
        )
        .expect("tag card");
    connection
        .execute(
            "INSERT INTO card_text (card_id, body) VALUES (?1, ?2)",
            params!["card-1", "ATP is an energy molecule"],
        )
        .expect("index card text");

    let full_text_card_id = connection
        .query_row(
            "SELECT card_id FROM card_text WHERE card_text MATCH ?1",
            params!["energy"],
            |row| row.get::<_, String>(0),
        )
        .expect("search card text");
    assert_eq!(full_text_card_id, "card-1");
    assert!(connection
        .execute(
            "UPDATE decks SET archived = 2 WHERE id = ?1",
            params!["deck-1"],
        )
        .is_err());
    assert!(connection
        .execute(
            "UPDATE cards SET state = 'unknown' WHERE id = ?1",
            params!["card-1"],
        )
        .is_err());
    assert!(connection
        .execute(
            "UPDATE card_sources SET page = 0 WHERE card_id = ?1",
            params!["card-1"],
        )
        .is_err());
    assert!(connection
        .execute(
            "UPDATE review_logs SET rating = 'unknown' WHERE id = ?1",
            params!["review-1"],
        )
        .is_err());
    assert!(connection
        .execute(
            "INSERT INTO cards (
               id, deck_id, front, back, state, due_at, created_at, updated_at
             ) VALUES (?1, 'missing-deck', 'front', 'back', 'new', ?2, ?2, ?2)",
            params!["invalid-card", timestamp],
        )
        .is_err());

    connection
        .execute("DELETE FROM cards WHERE id = ?1", params!["card-1"])
        .expect("delete card");
    for table in ["card_sources", "review_logs", "card_tags"] {
        let count = connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count cascaded rows");
        assert_eq!(count, 0, "{table} rows should cascade with the card");
    }
    let stale_card_text = connection
        .query_row(
            "SELECT card_id FROM card_text WHERE card_text MATCH ?1",
            params!["energy"],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .expect("check card text deletion");
    assert_eq!(stale_card_text, None);
}

#[test]
fn upgrading_0004_preserves_a_card_source_when_its_document_is_deleted() {
    let directory = tempdir().expect("create temporary directory");
    let database_path = directory.path().join("library.sqlite3");
    let connection = Connection::open(&database_path).expect("open legacy learning database");
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL);",
        )
        .expect("create migration table");
    for (migration_id, migration) in [
        (
            "0001_library",
            include_str!("../migrations/0001_library.sql"),
        ),
        (
            "0002_index_claims",
            include_str!("../migrations/0002_index_claims.sql"),
        ),
        (
            "0003_drive_source",
            include_str!("../migrations/0003_drive_source.sql"),
        ),
        (
            "0004_learning",
            include_str!("../migrations/0004_learning.sql"),
        ),
    ] {
        connection
            .execute_batch(migration)
            .expect("apply legacy migration");
        connection
            .execute(
                "INSERT INTO schema_migrations (id) VALUES (?1)",
                params![migration_id],
            )
            .expect("record legacy migration");
    }
    let timestamp = "2026-07-10T00:00:00Z";
    connection
        .execute(
            "INSERT INTO documents (
               id, source, content_hash, title, managed_path, status, index_state, created_at, updated_at
             ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'ready', 'ready', ?5, ?5)",
            params![
                "document-1",
                "document-content",
                "Source document",
                "/managed/source.pdf",
                timestamp,
            ],
        )
        .expect("insert source document");
    connection
        .execute(
            "INSERT INTO decks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params!["deck-1", "Biology", timestamp],
        )
        .expect("insert deck");
    connection
        .execute(
            "INSERT INTO cards (
               id, deck_id, front, back, state, due_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, 'review', ?5, ?6, ?6)",
            params![
                "card-1",
                "deck-1",
                "What is ATP?",
                "Energy storage",
                timestamp,
                timestamp
            ],
        )
        .expect("insert sourced card");
    connection
        .execute(
            "INSERT INTO card_sources (card_id, document_id, page, quote, rects_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "card-1",
                "document-1",
                7,
                "ATP stores energy.",
                "[{\"x\":1}]"
            ],
        )
        .expect("insert card source");
    drop(connection);

    let mut database = LibraryDatabase::open(directory.path()).expect("upgrade learning database");
    database
        .delete_document("document-1")
        .expect("delete source document");
    drop(database);

    let connection = Connection::open(&database_path).expect("open upgraded database");
    let source = connection
        .query_row(
            "SELECT cards.id, card_sources.document_id, card_sources.page,
                    card_sources.quote, card_sources.rects_json
             FROM cards
             INNER JOIN card_sources ON card_sources.card_id = cards.id
             WHERE cards.id = ?1",
            params!["card-1"],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .expect("retain source anchor");

    assert_eq!(source.0, "card-1");
    assert_eq!(source.1, None);
    assert_eq!(source.2, 7);
    assert_eq!(source.3, "ATP stores energy.");
    assert_eq!(source.4, "[{\"x\":1}]");
}

#[test]
fn opening_a_pre_learning_database_preserves_existing_documents() {
    let directory = tempdir().expect("create temporary directory");
    let database_path = directory.path().join("library.sqlite3");
    let connection = Connection::open(&database_path).expect("open legacy database");
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL);
             INSERT INTO schema_migrations (id)
             VALUES ('0001_library'), ('0002_index_claims'), ('0003_drive_source');",
        )
        .expect("record legacy migrations");
    connection
        .execute_batch(include_str!("../migrations/0001_library.sql"))
        .expect("create legacy library schema");
    connection
        .execute_batch(include_str!("../migrations/0002_index_claims.sql"))
        .expect("apply legacy index claim migration");
    connection
        .execute_batch(include_str!("../migrations/0003_drive_source.sql"))
        .expect("apply legacy drive migration");
    connection
        .execute(
            "INSERT INTO documents (
               id, source, content_hash, title, managed_path, status, index_state, created_at, updated_at
             ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'ready', 'ready', ?5, ?5)",
            params![
                "legacy-document",
                "legacy-content",
                "Legacy document",
                "/managed/legacy.pdf",
                "2026-07-10T00:00:00Z",
            ],
        )
        .expect("insert legacy document");
    drop(connection);

    let database = LibraryDatabase::open(directory.path()).expect("upgrade legacy database");
    let documents = database.list().expect("list preserved documents");

    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].id, "legacy-document");
}

#[test]
fn only_one_concurrent_worker_can_claim_a_pending_index() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "claimed".into(),
            title: "Claimed PDF".into(),
            content_hash: "claimed-content".into(),
            managed_path: "/managed/claimed.pdf".into(),
        })
        .expect("insert document");
    drop(database);

    let database_directory = directory.path().to_path_buf();
    let start = Arc::new(std::sync::Barrier::new(2));
    let handles = (0..2)
        .map(|_| {
            let database_directory = database_directory.clone();
            let start = Arc::clone(&start);
            thread::spawn(move || {
                let mut database =
                    LibraryDatabase::open(database_directory).expect("open database");
                start.wait();
                database
                    .claim_pending_index("claimed")
                    .expect("claim index")
            })
        })
        .collect::<Vec<_>>();

    let claims = handles
        .into_iter()
        .filter_map(|handle| handle.join().expect("join claimer"))
        .count();
    assert_eq!(claims, 1);
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

#[test]
fn upgrading_0005_adds_card_lifecycle_without_data_loss() {
    let directory = tempdir().expect("create temporary directory");
    let database_path = directory.path().join("library.sqlite3");
    let connection = Connection::open(&database_path).expect("open legacy database");
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL);",
        )
        .expect("create migration table");

    for (migration_id, migration) in [
        (
            "0001_library",
            include_str!("../migrations/0001_library.sql"),
        ),
        (
            "0002_index_claims",
            include_str!("../migrations/0002_index_claims.sql"),
        ),
        (
            "0003_drive_source",
            include_str!("../migrations/0003_drive_source.sql"),
        ),
        (
            "0004_learning",
            include_str!("../migrations/0004_learning.sql"),
        ),
        (
            "0005_learning_source_integrity",
            include_str!("../migrations/0005_learning_source_integrity.sql"),
        ),
    ] {
        connection
            .execute_batch(migration)
            .expect("apply legacy migration");
        connection
            .execute(
                "INSERT INTO schema_migrations (id) VALUES (?1)",
                params![migration_id],
            )
            .expect("record legacy migration");
    }

    let timestamp = "2026-07-10T00:00:00Z";
    connection
        .execute(
            "INSERT INTO documents (
               id, source, content_hash, title, managed_path, status, index_state, created_at, updated_at
             ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'ready', 'ready', ?5, ?5)",
            params![
                "document-1",
                "document-content",
                "Source document",
                "/managed/source.pdf",
                timestamp,
            ],
        )
        .expect("insert source document");
    connection
        .execute(
            "INSERT INTO decks (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params!["deck-1", "Biology", timestamp],
        )
        .expect("insert deck");
    connection
        .execute(
            "INSERT INTO cards (
               id, deck_id, front, back, state, due_at, reps, lapses, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, 'review', ?5, 4, 1, ?6, ?6)",
            params![
                "card-1",
                "deck-1",
                "What is ATP?",
                "Energy storage",
                timestamp,
                timestamp
            ],
        )
        .expect("insert review card");
    connection
        .execute(
            "INSERT INTO card_sources (card_id, document_id, page, quote, rects_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "card-1",
                "document-1",
                7,
                "ATP stores energy.",
                "[{\"x\":1}]"
            ],
        )
        .expect("insert card source");
    connection
        .execute(
            "INSERT INTO tags (id, name) VALUES ('tag-1', 'biology')",
            [],
        )
        .expect("insert tag");
    connection
        .execute(
            "INSERT INTO card_tags (card_id, tag_id) VALUES ('card-1', 'tag-1')",
            [],
        )
        .expect("insert card tag");
    connection
        .execute(
            "INSERT INTO review_logs (
               id, card_id, reviewed_at, rating, prior_state, next_state,
               prior_due_at, next_due_at, interval_seconds, elapsed_ms, scheduler_version
             ) VALUES ('review-1', 'card-1', ?1, 'good', 'review', 'review', ?1, ?1, 86400, 2000, 'fsrs-v1')",
            params![timestamp],
        )
        .expect("insert review log");

    drop(connection);

    let db = LibraryDatabase::open(directory.path()).expect("upgrade database");
    drop(db);

    let connection = Connection::open(&database_path).expect("open database connection");

    let migration: Option<String> = connection
        .query_row(
            "SELECT id FROM schema_migrations WHERE id = ?1",
            params!["0007_youglish_clickable"],
            |row| row.get(0),
        )
        .optional()
        .expect("query migration table");
    assert_eq!(migration.as_deref(), Some("0007_youglish_clickable"));

    let mut table_info = connection
        .prepare("PRAGMA table_info(cards);")
        .expect("prepare table_info");
    let mut deck_id_not_null = None;
    let mut rows = table_info.query([]).expect("query table_info");
    while let Some(row) = rows.next().expect("next row") {
        let name: String = row.get(1).expect("get name");
        if name == "deck_id" {
            deck_id_not_null = Some(row.get::<_, i32>(3).expect("get notnull"));
        }
    }
    assert_eq!(deck_id_not_null, Some(0));

    let card: (Option<String>, Option<String>, Option<String>, Option<String>, String, i32) = connection
        .query_row(
            "SELECT deck_id, deleted_at, deleted_from_deck_name, suspended_from_state, state, reps FROM cards WHERE id = 'card-1'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .expect("query upgraded card");

    assert_eq!(card.0.as_deref(), Some("deck-1"));
    assert_eq!(card.1, None);
    assert_eq!(card.2, None);
    assert_eq!(card.3, None);
    assert_eq!(card.4, "review");
    assert_eq!(card.5, 4);

    let fk_check: Option<String> = connection
        .query_row("PRAGMA foreign_key_check;", [], |row| row.get(0))
        .optional()
        .expect("run pragma foreign_key_check");
    assert!(
        fk_check.is_none(),
        "foreign key check failed: {:?}",
        fk_check
    );

    let sources_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM card_sources", [], |row| row.get(0))
        .expect("count sources");
    assert_eq!(sources_count, 1);

    let tags_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM card_tags", [], |row| row.get(0))
        .expect("count tags");
    assert_eq!(tags_count, 1);

    let logs_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM review_logs", [], |row| row.get(0))
        .expect("count logs");
    assert_eq!(logs_count, 1);
}
