use rusqlite::params;
use tempfile::TempDir;

use crate::library_db::{LibraryDatabase, NewLocalDocument};
use crate::statistics::{ActivityCheckpoint, NewActivitySession};

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary statistics database");
    let database = LibraryDatabase::open(directory.path()).expect("open statistics database");
    (directory, database)
}

fn seed_document(database: &mut LibraryDatabase, id: &str) {
    database
        .insert_local(NewLocalDocument {
            id: id.into(),
            title: format!("Document {id}"),
            content_hash: format!("hash-{id}"),
            managed_path: format!("/managed/{id}.pdf"),
        })
        .expect("seed document");
}

fn session_count(database: &LibraryDatabase, id: &str) -> i64 {
    database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM activity_sessions WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .expect("session count")
}

fn session_active_ms(database: &LibraryDatabase, id: &str) -> i64 {
    database
        .connection
        .query_row(
            "SELECT raw_active_ms FROM activity_sessions WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .expect("session raw_active_ms")
}

fn page_count_for_session(database: &LibraryDatabase, session_id: &str) -> i64 {
    database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM reading_session_pages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .expect("page count")
}

#[test]
fn statistics_migration_creates_tables() {
    let (_directory, database) = db();
    let id: String = database
        .connection
        .query_row(
            "SELECT id FROM schema_migrations WHERE id='0011_statistics'",
            [],
            |row| row.get(0),
        )
        .expect("statistics migration");
    assert_eq!(id, "0011_statistics");
    for table in ["activity_sessions", "reading_session_pages"] {
        let count: i64 = database
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                params![table],
                |row| row.get(0),
            )
            .expect("table lookup");
        assert_eq!(count, 1, "missing {table}");
    }
}

#[test]
fn start_and_checkpoint_activity_session_persists_active_ms_and_visit_atomically() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");

    database
        .start_activity_session(NewActivitySession {
            id: "session-1".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 540,
        })
        .expect("start");
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-1".into(),
            occurred_at: "2026-07-18T01:00:15.000Z".into(),
            active_ms: 15_000,
            document_id: Some("doc-1".into()),
            page: Some(8),
            page_visit_increment: 1,
        })
        .expect("checkpoint");

    let values: (i64, i64, i64) = database
        .connection
        .query_row(
            "SELECT s.raw_active_ms, p.raw_active_ms, p.visit_count
             FROM activity_sessions s
             JOIN reading_session_pages p ON p.session_id = s.id
             WHERE s.id = 'session-1' AND p.page = 8",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("activity values");
    assert_eq!(values, (15_000, 15_000, 1));

    let ended_at: String = database
        .connection
        .query_row(
            "SELECT ended_at FROM activity_sessions WHERE id = 'session-1'",
            [],
            |row| row.get(0),
        )
        .expect("ended_at");
    assert_eq!(ended_at, "2026-07-18T01:00:15.000Z");
}

#[test]
fn start_activity_session_rejects_unknown_app_activity_pair_without_persisting() {
    let (_directory, mut database) = db();
    let result = database.start_activity_session(NewActivitySession {
        id: "session-unknown-pair".into(),
        app_key: "unknown_app".into(),
        activity_kind: "reading".into(),
        context_kind: None,
        context_id: None,
        occurred_at: "2026-07-18T01:00:00.000Z".into(),
        local_day: "2026-07-18".into(),
        timezone_offset_minutes: 0,
    });
    assert!(
        result.is_err(),
        "unknown app/activity pair should be rejected"
    );
    assert_eq!(session_count(&database, "session-unknown-pair"), 0);
}

#[test]
fn start_activity_session_rejects_memora_reading_pair_without_persisting() {
    // (memora, reading) is invalid even though both keys are known individually.
    let (_directory, mut database) = db();
    let result = database.start_activity_session(NewActivitySession {
        id: "session-memora-bad".into(),
        app_key: "memora".into(),
        activity_kind: "reading".into(),
        context_kind: None,
        context_id: None,
        occurred_at: "2026-07-18T01:00:00.000Z".into(),
        local_day: "2026-07-18".into(),
        timezone_offset_minutes: 0,
    });
    assert!(result.is_err());
    assert_eq!(session_count(&database, "session-memora-bad"), 0);
}

#[test]
fn start_activity_session_allows_memora_practice_pair() {
    let (_directory, mut database) = db();
    database
        .start_activity_session(NewActivitySession {
            id: "session-memora".into(),
            app_key: "memora".into(),
            activity_kind: "practice".into(),
            context_kind: None,
            context_id: None,
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("memora practice is a valid pair");
}

#[test]
fn start_activity_session_rejects_invalid_rfc3339_timestamp_without_persisting() {
    let (_directory, mut database) = db();
    let result = database.start_activity_session(NewActivitySession {
        id: "session-bad-time".into(),
        app_key: "reading".into(),
        activity_kind: "reading".into(),
        context_kind: None,
        context_id: None,
        occurred_at: "not-a-timestamp".into(),
        local_day: "2026-07-18".into(),
        timezone_offset_minutes: 0,
    });
    assert!(result.is_err());
    assert_eq!(session_count(&database, "session-bad-time"), 0);
}

#[test]
fn start_activity_session_rejects_invalid_local_day_without_persisting() {
    let (_directory, mut database) = db();
    let result = database.start_activity_session(NewActivitySession {
        id: "session-bad-day".into(),
        app_key: "reading".into(),
        activity_kind: "reading".into(),
        context_kind: None,
        context_id: None,
        occurred_at: "2026-07-18T01:00:00.000Z".into(),
        local_day: "2026/07/18".into(),
        timezone_offset_minutes: 0,
    });
    assert!(result.is_err());
    assert_eq!(session_count(&database, "session-bad-day"), 0);
}

#[test]
fn checkpoint_activity_session_rejects_unknown_session_without_writes() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-x");
    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "nonexistent".into(),
        occurred_at: "2026-07-18T01:00:15.000Z".into(),
        active_ms: 5_000,
        document_id: Some("doc-x".into()),
        page: Some(1),
        page_visit_increment: 1,
    });
    assert!(result.is_err());
    assert_eq!(page_count_for_session(&database, "nonexistent"), 0);
}

#[test]
fn checkpoint_activity_session_rejects_negative_active_ms_without_writes() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");
    database
        .start_activity_session(NewActivitySession {
            id: "session-neg-ms".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "session-neg-ms".into(),
        occurred_at: "2026-07-18T01:00:15.000Z".into(),
        active_ms: -1,
        document_id: Some("doc-1".into()),
        page: Some(1),
        page_visit_increment: 1,
    });
    assert!(result.is_err());
    assert_eq!(session_active_ms(&database, "session-neg-ms"), 0);
    assert_eq!(page_count_for_session(&database, "session-neg-ms"), 0);
}

#[test]
fn checkpoint_activity_session_rejects_negative_page_visit_increment_without_writes() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");
    database
        .start_activity_session(NewActivitySession {
            id: "session-neg-inc".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "session-neg-inc".into(),
        occurred_at: "2026-07-18T01:00:15.000Z".into(),
        active_ms: 1_000,
        document_id: Some("doc-1".into()),
        page: Some(1),
        page_visit_increment: -1,
    });
    assert!(result.is_err());
    assert_eq!(session_active_ms(&database, "session-neg-inc"), 0);
    assert_eq!(page_count_for_session(&database, "session-neg-inc"), 0);
}

#[test]
fn checkpoint_activity_session_rejects_page_zero_without_writes() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");
    database
        .start_activity_session(NewActivitySession {
            id: "session-page-zero".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "session-page-zero".into(),
        occurred_at: "2026-07-18T01:00:15.000Z".into(),
        active_ms: 1_000,
        document_id: Some("doc-1".into()),
        page: Some(0),
        page_visit_increment: 1,
    });
    assert!(result.is_err());
    assert_eq!(session_active_ms(&database, "session-page-zero"), 0);
    assert_eq!(page_count_for_session(&database, "session-page-zero"), 0);
}

#[test]
fn checkpoint_activity_session_rejects_invalid_rfc3339_timestamp_without_writes() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");
    database
        .start_activity_session(NewActivitySession {
            id: "session-bad-cp-time".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "session-bad-cp-time".into(),
        occurred_at: "not-a-timestamp".into(),
        active_ms: 1_000,
        document_id: Some("doc-1".into()),
        page: Some(1),
        page_visit_increment: 1,
    });
    assert!(result.is_err());
    assert_eq!(session_active_ms(&database, "session-bad-cp-time"), 0);
    assert_eq!(page_count_for_session(&database, "session-bad-cp-time"), 0);
}

#[test]
fn checkpoint_activity_session_skips_page_when_document_or_page_missing() {
    let (_directory, mut database) = db();
    database
        .start_activity_session(NewActivitySession {
            id: "session-no-page".into(),
            app_key: "memora".into(),
            activity_kind: "practice".into(),
            context_kind: None,
            context_id: None,
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    // No document_id or page — should still update the session active time.
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-no-page".into(),
            occurred_at: "2026-07-18T01:00:30.000Z".into(),
            active_ms: 30_000,
            document_id: None,
            page: None,
            page_visit_increment: 0,
        })
        .expect("checkpoint without page info");

    assert_eq!(session_active_ms(&database, "session-no-page"), 30_000);
    assert_eq!(page_count_for_session(&database, "session-no-page"), 0);
}

#[test]
fn checkpoint_activity_session_accumulates_active_ms_and_visit_counts_on_repeat_visits() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");
    database
        .start_activity_session(NewActivitySession {
            id: "session-repeat".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("doc-1".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    // First visit to page 5.
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-repeat".into(),
            occurred_at: "2026-07-18T01:00:10.000Z".into(),
            active_ms: 10_000,
            document_id: Some("doc-1".into()),
            page: Some(5),
            page_visit_increment: 1,
        })
        .expect("first visit");

    // Same page, no new visit (page_visit_increment == 0 is allowed).
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-repeat".into(),
            occurred_at: "2026-07-18T01:00:20.000Z".into(),
            active_ms: 10_000,
            document_id: Some("doc-1".into()),
            page: Some(5),
            page_visit_increment: 0,
        })
        .expect("same page");

    // Visit again.
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-repeat".into(),
            occurred_at: "2026-07-18T01:00:30.000Z".into(),
            active_ms: 5_000,
            document_id: Some("doc-1".into()),
            page: Some(5),
            page_visit_increment: 1,
        })
        .expect("repeat visit");

    let page_values: (i64, i64) = database
        .connection
        .query_row(
            "SELECT raw_active_ms, visit_count FROM reading_session_pages
             WHERE session_id = 'session-repeat' AND page = 5",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("page values");
    assert_eq!(page_values, (25_000, 2));
    assert_eq!(session_active_ms(&database, "session-repeat"), 25_000);
}

#[test]
fn finish_activity_session_marks_session_ended_and_updated() {
    let (_directory, mut database) = db();
    database
        .start_activity_session(NewActivitySession {
            id: "session-finish".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: None,
            context_id: None,
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    database
        .finish_activity_session("session-finish", "2026-07-18T02:00:00.000Z")
        .expect("finish");

    let (ended_at, updated_at): (String, String) = database
        .connection
        .query_row(
            "SELECT ended_at, updated_at FROM activity_sessions WHERE id = 'session-finish'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("session row");
    assert_eq!(ended_at, "2026-07-18T02:00:00.000Z");
    assert_eq!(updated_at, "2026-07-18T02:00:00.000Z");
}

#[test]
fn finish_activity_session_is_idempotent_for_unknown_id() {
    let (_directory, mut database) = db();
    database
        .finish_activity_session("nonexistent", "2026-07-18T02:00:00.000Z")
        .expect("finish on unknown session is a safe no-op");
    assert_eq!(session_count(&database, "nonexistent"), 0);
}

#[test]
fn finish_activity_session_rejects_invalid_timestamp() {
    let (_directory, mut database) = db();
    let result = database.finish_activity_session("any", "not-a-timestamp");
    assert!(result.is_err());
}
