use rusqlite::params;
use tempfile::TempDir;

use crate::learning::{NewCard, NewCardSource};
use crate::library_db::{LibraryDatabase, NewLocalDocument};
use crate::statistics::{
    get_daily_statistics_snapshots, ActivityCheckpoint, DailySnapshotQuery,
    NewActivitySession, StatisticsRange,
};

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
fn checkpoint_activity_session_rolls_back_session_update_when_page_upsert_fails() {
    // Drives a real in-transaction failure AFTER the session-UPDATE has
    // succeeded: the page upsert references a non-existent document_id, so
    // the FOREIGN KEY constraint on reading_session_pages.document_id fires
    // inside the transaction. The test would fail if checkpoint_activity_session
    // used autocommit instead of wrapping both writes in one transaction.
    let (_directory, mut database) = db();
    // Note: no seed_document — "missing-doc" intentionally does not exist.
    database
        .start_activity_session(NewActivitySession {
            id: "session-fk-rollback".into(),
            app_key: "reading".into(),
            activity_kind: "reading".into(),
            context_kind: Some("document".into()),
            context_id: Some("missing-doc".into()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");

    let result = database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "session-fk-rollback".into(),
        occurred_at: "2026-07-18T01:00:15.000Z".into(),
        active_ms: 15_000,
        document_id: Some("missing-doc".into()),
        page: Some(1),
        page_visit_increment: 1,
    });
    assert!(result.is_err(), "FK violation should surface as an error");
    assert_eq!(
        session_active_ms(&database, "session-fk-rollback"),
        0,
        "session-UPDATE must roll back when the page upsert fails"
    );
    assert_eq!(
        page_count_for_session(&database, "session-fk-rollback"),
        0,
        "no page row should remain after rollback"
    );
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

#[test]
fn deleting_document_preserves_aggregate_reading_activity() {
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
            timezone_offset_minutes: 0,
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

    database
        .delete_document("doc-1")
        .expect("delete document");

    let remaining: (i64, Option<String>) = database
        .connection
        .query_row(
            "SELECT raw_active_ms,context_id FROM activity_sessions WHERE id='session-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("aggregate remains");
    let pages: i64 = database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM reading_session_pages",
            [],
            |row| row.get(0),
        )
        .expect("page count");
    assert_eq!(remaining, (15_000, None));
    assert_eq!(pages, 0);
}

#[test]
fn deleting_deck_preserves_aggregate_practice_activity() {
    let (_directory, mut database) = db();
    let deck = database.create_deck("Spanish").expect("create deck");

    database
        .start_activity_session(NewActivitySession {
            id: "session-deck".into(),
            app_key: "memora".into(),
            activity_kind: "practice".into(),
            context_kind: Some("deck".into()),
            context_id: Some(deck.id.clone()),
            occurred_at: "2026-07-18T01:00:00.000Z".into(),
            local_day: "2026-07-18".into(),
            timezone_offset_minutes: 0,
        })
        .expect("start");
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: "session-deck".into(),
            occurred_at: "2026-07-18T01:00:15.000Z".into(),
            active_ms: 15_000,
            document_id: None,
            page: None,
            page_visit_increment: 0,
        })
        .expect("checkpoint");

    database.delete_deck(&deck.id).expect("delete deck");

    let remaining: (i64, Option<String>) = database
        .connection
        .query_row(
            "SELECT raw_active_ms,context_id FROM activity_sessions WHERE id='session-deck'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("aggregate remains");
    assert_eq!(remaining, (15_000, None));
    let decks: i64 = database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM decks WHERE id = ?1",
            params![deck.id],
            |row| row.get(0),
        )
        .expect("deck count");
    assert_eq!(decks, 0);
}

// ---------------------------------------------------------------------------
// Task 4: personal aggregate query tests
// ---------------------------------------------------------------------------

const FIXED_NOW: &str = "2026-07-18T23:59:00.000Z";
const TODAY_LOCAL_DAY: &str = "2026-07-18";

fn seed_document_with_pages(database: &mut LibraryDatabase, id: &str, num_pages: i64) {
    database
        .insert_local(NewLocalDocument {
            id: id.into(),
            title: format!("Document {id}"),
            content_hash: format!("hash-{id}"),
            managed_path: format!("/managed/{id}.pdf"),
        })
        .expect("seed document");
    database
        .connection
        .execute(
            "UPDATE documents SET num_pages = ?1 WHERE id = ?2",
            params![num_pages, id],
        )
        .expect("set num_pages");
}

#[allow(clippy::too_many_arguments)]
fn start_session(
    database: &mut LibraryDatabase,
    id: &str,
    app_key: &str,
    activity_kind: &str,
    occurred_at: &str,
    local_day: &str,
    context_kind: Option<&str>,
    context_id: Option<&str>,
) {
    database
        .start_activity_session(NewActivitySession {
            id: id.into(),
            app_key: app_key.into(),
            activity_kind: activity_kind.into(),
            context_kind: context_kind.map(str::to_string),
            context_id: context_id.map(str::to_string),
            occurred_at: occurred_at.into(),
            local_day: local_day.into(),
            timezone_offset_minutes: 0,
        })
        .expect("start session");
}

fn checkpoint(
    database: &mut LibraryDatabase,
    session_id: &str,
    occurred_at: &str,
    active_ms: i64,
    document_id: Option<&str>,
    page: Option<i64>,
    page_visit_increment: i64,
) {
    database
        .checkpoint_activity_session(ActivityCheckpoint {
            session_id: session_id.into(),
            occurred_at: occurred_at.into(),
            active_ms,
            document_id: document_id.map(str::to_string),
            page,
            page_visit_increment,
        })
        .expect("checkpoint");
}

#[allow(clippy::too_many_arguments)]
fn insert_review_log(
    database: &LibraryDatabase,
    id: &str,
    card_id: &str,
    reviewed_at: &str,
    rating: &str,
    prior_state: &str,
    next_state: &str,
    elapsed_ms: i64,
) {
    database
        .connection
        .execute(
            "INSERT INTO review_logs(
                id, card_id, reviewed_at, rating, prior_state, next_state,
                prior_due_at, next_due_at, interval_seconds, elapsed_ms, scheduler_version
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                       '2026-07-18T00:00:00.000Z', '2026-07-19T00:00:00.000Z',
                       86400, ?7, 'test')",
            params![id, card_id, reviewed_at, rating, prior_state, next_state, elapsed_ms],
        )
        .expect("insert review log");
}

fn create_card_for_document(
    database: &mut LibraryDatabase,
    deck_name: &str,
    document_id: &str,
    page: i64,
    front: &str,
) -> String {
    let card = database
        .create_card(NewCard {
            deck_name: deck_name.into(),
            front: front.into(),
            back: "answer".into(),
            source: Some(NewCardSource {
                document_id: document_id.into(),
                page,
                quote: format!("quote-{front}"),
                rects_json: "[]".into(),
            }),
            tags: vec![],
            front_language: None,
        })
        .expect("create card");
    card.id
}

fn seed_primary_fixture(database: &mut LibraryDatabase) -> (crate::model::DeckSummary, String) {
    seed_document_with_pages(database, "doc-1", 10);

    // Reading session on doc-1 with visits to pages [1, 2, 2, 4].
    start_session(
        database,
        "session-read-1",
        "reading",
        "reading",
        "2026-07-18T01:00:00.000Z",
        "2026-07-18",
        Some("document"),
        Some("doc-1"),
    );
    checkpoint(
        database,
        "session-read-1",
        "2026-07-18T01:00:15.000Z",
        15_000,
        Some("doc-1"),
        Some(1),
        1,
    );
    checkpoint(
        database,
        "session-read-1",
        "2026-07-18T01:00:30.000Z",
        15_000,
        Some("doc-1"),
        Some(2),
        1,
    );
    checkpoint(
        database,
        "session-read-1",
        "2026-07-18T01:00:45.000Z",
        15_000,
        Some("doc-1"),
        Some(2),
        1,
    );
    checkpoint(
        database,
        "session-read-1",
        "2026-07-18T01:01:00.000Z",
        15_000,
        Some("doc-1"),
        Some(4),
        1,
    );

    // One card linked to doc-1, marked review so the Again review counts as a lapse.
    let deck = database.create_deck("Biology").expect("deck");
    let card_id = create_card_for_document(database, "Biology", "doc-1", 1, "card-1");
    database
        .connection
        .execute(
            "UPDATE cards SET state='review' WHERE id = ?1",
            params![card_id],
        )
        .expect("set review state");

    // 3 real reviews linked to the document through the card's source.
    // 1 Again (prior_state='review', elapsed=600s, capped at 300s) — counts as a lapse.
    insert_review_log(
        database,
        "log-1",
        &card_id,
        "2026-07-18T02:00:00.000Z",
        "again",
        "review",
        "relearning",
        600_000,
    );
    // 2 Good (elapsed=30s each, contribute to recall rate).
    insert_review_log(
        database,
        "log-2",
        &card_id,
        "2026-07-18T02:01:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );
    insert_review_log(
        database,
        "log-3",
        &card_id,
        "2026-07-18T02:02:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );

    (deck, card_id)
}

#[test]
fn primary_metrics_match_personal_aggregate_spec() {
    let (_directory, mut database) = db();
    seed_primary_fixture(&mut database);

    let overview = database
        .statistics_overview(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    let document = database
        .document_statistics("doc-1", StatisticsRange::All, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("document statistics");

    assert_eq!(document.document_id, "doc-1");
    assert_eq!(document.unique_pages, 3);
    assert_eq!(document.page_visits, 4);
    assert_eq!(document.revisits, 1);
    assert_eq!(document.coverage, 0.3);
    assert_eq!(document.real_reviews, 3);
    assert_eq!(document.recall_rate, Some(2.0 / 3.0));
    assert_eq!(document.again_count, 1);
    assert_eq!(document.lapses, 1);
    assert_eq!(overview.memora_active_ms, 360_000); // capped 5m + 30s + 30s
}

#[test]
fn statistics_range_parse_round_trips_known_values() {
    assert_eq!(
        StatisticsRange::parse("7d").expect("7d"),
        StatisticsRange::Days7
    );
    assert_eq!(
        StatisticsRange::parse("30d").expect("30d"),
        StatisticsRange::Days30
    );
    assert_eq!(
        StatisticsRange::parse("1y").expect("1y"),
        StatisticsRange::Year1
    );
    assert_eq!(
        StatisticsRange::parse("all").expect("all"),
        StatisticsRange::All
    );
    assert!(StatisticsRange::parse("invalid").is_err());
}

#[test]
fn zero_denominators_return_none_instead_of_zero_percent() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    let overview = database
        .statistics_overview(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    assert_eq!(overview.active_ms, 0);
    assert_eq!(overview.reading_active_ms, 0);
    assert_eq!(overview.memora_active_ms, 0);
    assert_eq!(overview.current_streak, 0);
    assert_eq!(overview.active_days, 0);
    assert_eq!(overview.buckets.len(), 30);
    assert!(overview.buckets.iter().all(|bucket| bucket.active_ms == 0));

    let reading = database
        .reading_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading");
    assert_eq!(reading.active_ms, 0);
    assert_eq!(reading.session_count, 0);
    assert_eq!(reading.average_session_ms, None);
    assert_eq!(reading.page_visits, 0);
    assert_eq!(reading.unique_pages, 0);
    assert_eq!(reading.revisits, 0);

    let memora = database
        .memora_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("memora");
    assert_eq!(memora.active_ms, 0);
    assert_eq!(memora.practice_active_ms, 0);
    assert_eq!(memora.session_count, 0);
    assert_eq!(memora.real_reviews, 0);
    assert_eq!(memora.recall_rate, None);
    assert_eq!(memora.lapse_rate, None);
    assert_eq!(memora.average_answer_ms, None);

    let document = database
        .document_statistics("doc-1", StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("document");
    assert_eq!(document.real_reviews, 0);
    assert_eq!(document.recall_rate, None);
    assert_eq!(document.average_session_ms, None);
    assert_eq!(document.coverage, 0.0); // no visits -> 0 / 10

    let deck = database.create_deck("Empty").expect("deck");
    let detail = database
        .deck_statistics_detail(
            &deck.id,
            StatisticsRange::Days30,
            FIXED_NOW,
            TODAY_LOCAL_DAY,
        )
        .expect("deck detail");
    assert_eq!(detail.real_reviews, 0);
    assert_eq!(detail.recall_rate, None);
    assert_eq!(detail.lapse_rate, None);
}

#[test]
fn range_filters_activity_sessions_and_review_logs_by_local_day() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    // In-range reading session (today).
    start_session(
        &mut database,
        "session-today",
        "reading",
        "reading",
        "2026-07-18T01:00:00.000Z",
        "2026-07-18",
        Some("document"),
        Some("doc-1"),
    );
    checkpoint(
        &mut database,
        "session-today",
        "2026-07-18T01:00:30.000Z",
        30_000,
        Some("doc-1"),
        Some(1),
        1,
    );

    // Out-of-range reading session (one year ago) — outside even Year1.
    start_session(
        &mut database,
        "session-old",
        "reading",
        "reading",
        "2025-01-01T01:00:00.000Z",
        "2025-01-01",
        Some("document"),
        Some("doc-1"),
    );
    checkpoint(
        &mut database,
        "session-old",
        "2025-01-01T01:00:30.000Z",
        30_000,
        Some("doc-1"),
        Some(1),
        1,
    );

    // Out-of-range review log (one year ago).
    let deck = database.create_deck("Biology").expect("deck");
    let card_id = create_card_for_document(&mut database, "Biology", "doc-1", 1, "card");
    insert_review_log(
        &database,
        "log-old",
        &card_id,
        "2025-01-01T02:00:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );

    let reading_30 = database
        .reading_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading 30d");
    assert_eq!(reading_30.active_ms, 30_000);
    assert_eq!(reading_30.session_count, 1);

    let reading_all = database
        .reading_statistics(StatisticsRange::All, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading all");
    assert_eq!(reading_all.active_ms, 60_000);
    assert_eq!(reading_all.session_count, 2);

    let document_30 = database
        .document_statistics("doc-1", StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("document 30d");
    assert_eq!(document_30.real_reviews, 0); // old review excluded

    let document_all = database
        .document_statistics("doc-1", StatisticsRange::All, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("document all");
    assert_eq!(document_all.real_reviews, 1);

    // Suppress unused warning when the test doesn't otherwise touch deck.
    let _ = deck;
}

#[test]
fn range_boundary_includes_start_local_day() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    // Days7 starts at 2026-07-12 (today minus 6). Place one session on the
    // boundary and one just before it.
    start_session(
        &mut database,
        "session-boundary",
        "reading",
        "reading",
        "2026-07-12T01:00:00.000Z",
        "2026-07-12",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-boundary",
        "2026-07-12T01:00:30.000Z",
        15_000,
        None,
        None,
        0,
    );

    start_session(
        &mut database,
        "session-outside",
        "reading",
        "reading",
        "2026-07-11T01:00:00.000Z",
        "2026-07-11",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-outside",
        "2026-07-11T01:00:30.000Z",
        15_000,
        None,
        None,
        0,
    );

    let reading = database
        .reading_statistics(StatisticsRange::Days7, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading");
    assert_eq!(reading.session_count, 1);
    assert_eq!(reading.active_ms, 15_000);
    assert_eq!(
        reading.buckets.first().expect("first bucket").local_day,
        "2026-07-12"
    );
    assert_eq!(reading.buckets.len(), 7);
}

#[test]
fn active_day_threshold_requires_min_activity_or_real_review() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    // Day 1: exactly 60,000ms — qualifies.
    start_session(
        &mut database,
        "session-d1",
        "reading",
        "reading",
        "2026-07-16T01:00:00.000Z",
        "2026-07-16",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-d1",
        "2026-07-16T01:01:00.000Z",
        60_000,
        None,
        None,
        0,
    );

    // Day 2: 30,000ms only — does NOT qualify by activity; no reviews either.
    start_session(
        &mut database,
        "session-d2",
        "reading",
        "reading",
        "2026-07-17T01:00:00.000Z",
        "2026-07-17",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-d2",
        "2026-07-17T01:00:30.000Z",
        30_000,
        None,
        None,
        0,
    );

    // Day 3: zero activity but one review log — qualifies.
    let _deck = database.create_deck("Biology").expect("deck");
    let card_id = create_card_for_document(&mut database, "Biology", "doc-1", 1, "card");
    insert_review_log(
        &database,
        "log-d3",
        &card_id,
        "2026-07-18T02:00:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );

    let overview = database
        .statistics_overview(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    assert_eq!(overview.active_days, 2); // days 1 and 3 only
}

#[test]
fn current_streak_ending_yesterday_when_today_inactive() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    // Yesterday and the day before yesterday qualify; today is inactive.
    for (session_id, day) in [("session-y", "2026-07-17"), ("session-y2", "2026-07-16")] {
        let occurred_at = format!("{day}T01:00:00.000Z");
        let ended_at = format!("{day}T01:02:00.000Z");
        start_session(
            &mut database,
            session_id,
            "reading",
            "reading",
            &occurred_at,
            day,
            None,
            None,
        );
        checkpoint(
            &mut database,
            session_id,
            &ended_at,
            60_000,
            None,
            None,
            0,
        );
    }

    let overview = database
        .statistics_overview(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    assert_eq!(overview.current_streak, 2);
}

#[test]
fn current_streak_remains_untruncated_by_short_range() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    // 8 consecutive active days ending today — exceeds the 7-day window.
    let base_date = chrono::NaiveDate::parse_from_str("2026-07-18", "%Y-%m-%d").expect("date");
    for offset in 0..8 {
        let day_string = (base_date - chrono::Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string();
        let session_id = format!("session-streak-{offset}");
        let occurred_at = format!("{day_string}T01:00:00.000Z");
        let ended_at = format!("{day_string}T01:02:00.000Z");
        start_session(
            &mut database,
            &session_id,
            "reading",
            "reading",
            &occurred_at,
            &day_string,
            None,
            None,
        );
        checkpoint(
            &mut database,
            &session_id,
            &ended_at,
            60_000,
            None,
            None,
            0,
        );
    }

    let overview = database
        .statistics_overview(StatisticsRange::Days7, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    assert_eq!(overview.current_streak, 8);
    assert_eq!(overview.buckets.len(), 7); // buckets still obey the range
}

#[test]
fn practice_sessions_count_for_active_time_but_not_recall() {
    let (_directory, mut database) = db();

    start_session(
        &mut database,
        "practice-1",
        "memora",
        "practice",
        "2026-07-18T01:00:00.000Z",
        "2026-07-18",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "practice-1",
        "2026-07-18T01:00:30.000Z",
        30_000,
        None,
        None,
        0,
    );

    let memora = database
        .memora_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("memora");
    assert_eq!(memora.practice_active_ms, 30_000);
    assert_eq!(memora.active_ms, 30_000);
    assert_eq!(memora.session_count, 1);
    assert_eq!(memora.real_reviews, 0);
    assert_eq!(memora.recall_rate, None);
    assert_eq!(memora.lapse_rate, None);
    assert_eq!(memora.average_answer_ms, None);

    let overview = database
        .statistics_overview(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("overview");
    assert_eq!(overview.memora_active_ms, 30_000);
    assert_eq!(overview.active_ms, 30_000);
}

#[test]
fn memora_session_count_sums_real_study_sessions_and_practice_sessions() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);
    let deck = database.create_deck("Biology").expect("deck");
    let card_id = create_card_for_document(&mut database, "Biology", "doc-1", 1, "card");

    // Real study session with one consumed card and persisted review log.
    insert_review_log(
        &database,
        "log-real",
        &card_id,
        "2026-07-18T02:00:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );
    database
        .connection
        .execute(
            "INSERT INTO study_sessions(id, scope_kind, deck_id, created_at, expires_at)
             VALUES ('study-1', 'deck', ?1, '2026-07-18T01:50:00.000Z', '2026-07-18T23:59:59.000Z')",
            params![deck.id],
        )
        .expect("study session");
    database
        .connection
        .execute(
            "INSERT INTO study_session_cards(
                 id, session_id, card_id, grant_token, expected_state, expected_due_at,
                 admitted_as_new, granted_at, consumed_at, review_log_id
             )
             VALUES ('ssc-1', 'study-1', ?1, 'token-1', 'review',
                     '2026-07-18T00:00:00.000Z', 0, '2026-07-18T01:55:00.000Z',
                     '2026-07-18T02:00:00.000Z', 'log-real')",
            params![card_id],
        )
        .expect("study_session_cards");

    // Two practice sessions — both should count.
    start_session(
        &mut database,
        "practice-1",
        "memora",
        "practice",
        "2026-07-18T03:00:00.000Z",
        "2026-07-18",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "practice-1",
        "2026-07-18T03:00:30.000Z",
        30_000,
        None,
        None,
        0,
    );
    start_session(
        &mut database,
        "practice-2",
        "memora",
        "practice",
        "2026-07-18T04:00:00.000Z",
        "2026-07-18",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "practice-2",
        "2026-07-18T04:00:30.000Z",
        15_000,
        None,
        None,
        0,
    );

    let memora = database
        .memora_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("memora");
    // 1 real study session + 2 practice sessions.
    assert_eq!(memora.session_count, 3);
}

#[test]
fn deck_scope_filters_review_outcomes_and_card_states() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);
    let deck_a = database.create_deck("DeckA").expect("deckA");
    let deck_b = database.create_deck("DeckB").expect("deckB");

    let card_a = create_card_for_document(&mut database, "DeckA", "doc-1", 1, "card-a");
    let card_b = create_card_for_document(&mut database, "DeckB", "doc-1", 1, "card-b");

    // 2 good reviews on deck_a; 1 again review on deck_b.
    insert_review_log(
        &database,
        "log-a1",
        &card_a,
        "2026-07-18T02:00:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );
    insert_review_log(
        &database,
        "log-a2",
        &card_a,
        "2026-07-18T02:01:00.000Z",
        "good",
        "review",
        "review",
        30_000,
    );
    insert_review_log(
        &database,
        "log-b1",
        &card_b,
        "2026-07-18T02:02:00.000Z",
        "again",
        "review",
        "relearning",
        30_000,
    );

    let detail_a = database
        .deck_statistics_detail(&deck_a.id, StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("deck a");
    assert_eq!(detail_a.deck_id, deck_a.id);
    assert_eq!(detail_a.real_reviews, 2);
    assert_eq!(detail_a.recall_rate, Some(1.0));
    assert_eq!(detail_a.rating_distribution.again, 0);
    assert_eq!(detail_a.rating_distribution.good, 2);
    assert_eq!(detail_a.lapse_rate, Some(0.0));

    let detail_b = database
        .deck_statistics_detail(&deck_b.id, StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("deck b");
    assert_eq!(detail_b.real_reviews, 1);
    assert_eq!(detail_b.recall_rate, Some(0.0));
    assert_eq!(detail_b.rating_distribution.again, 1);
    assert_eq!(detail_b.lapse_rate, Some(1.0));
}

#[test]
fn due_forecast_excludes_suspended_and_deleted_cards() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);
    let _deck = database.create_deck("Biology").expect("deck");

    let card_active = create_card_for_document(&mut database, "Biology", "doc-1", 1, "active");
    let card_suspended =
        create_card_for_document(&mut database, "Biology", "doc-1", 1, "suspended");
    let card_deleted = create_card_for_document(&mut database, "Biology", "doc-1", 1, "deleted");

    let due_today = "2026-07-18T12:00:00.000Z";
    for card_id in [card_active.as_str(), card_suspended.as_str(), card_deleted.as_str()] {
        database
            .connection
            .execute(
                "UPDATE cards SET state='review', due_at=?1 WHERE id=?2",
                params![due_today, card_id],
            )
            .expect("set due");
    }

    database
        .set_cards_suspended(std::slice::from_ref(&card_suspended), true)
        .expect("suspend");
    database.trash_cards(std::slice::from_ref(&card_deleted)).expect("trash");

    let memora = database
        .memora_statistics(StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("memora");
    assert_eq!(memora.due_forecast.today, 1);
    assert_eq!(memora.due_forecast.next_7_days, 0);
    assert_eq!(memora.due_forecast.next_30_days, 0);
}

#[test]
fn zero_filled_buckets_cover_every_local_day_in_range() {
    let (_directory, mut database) = db();

    // A single active day; every other day in the 7-day window should still
    // appear in the buckets with active_ms = 0.
    start_session(
        &mut database,
        "session-only",
        "reading",
        "reading",
        "2026-07-16T01:00:00.000Z",
        "2026-07-16",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-only",
        "2026-07-16T01:01:00.000Z",
        60_000,
        None,
        None,
        0,
    );

    let reading = database
        .reading_statistics(StatisticsRange::Days7, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading");
    assert_eq!(reading.buckets.len(), 7);
    assert_eq!(
        reading.buckets.first().expect("first").local_day,
        "2026-07-12"
    );
    assert_eq!(
        reading.buckets.last().expect("last").local_day,
        "2026-07-18"
    );
    let active_buckets: Vec<&i64> = reading
        .buckets
        .iter()
        .map(|bucket| &bucket.active_ms)
        .filter(|value| **value > 0)
        .collect();
    assert_eq!(active_buckets.len(), 1);
    let day_16 = reading
        .buckets
        .iter()
        .find(|bucket| bucket.local_day == "2026-07-16")
        .expect("day 16");
    assert_eq!(day_16.active_ms, 60_000);
}

#[test]
fn deck_scope_excludes_other_decks_practice_and_review_activity() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);

    let deck_a = database.create_deck("DeckA").expect("deck_a");
    let deck_b = database.create_deck("DeckB").expect("deck_b");

    let card_a1 = create_card_for_document(&mut database, "DeckA", "doc-1", 1, "card-a1");
    let card_a2 = create_card_for_document(&mut database, "DeckA", "doc-1", 1, "card-a2");
    let card_b1 = create_card_for_document(&mut database, "DeckB", "doc-1", 1, "card-b1");

    insert_review_log(&database, "log-a1", &card_a1, "2026-07-18T02:00:00.000Z", "good", "review", "review", 30_000);
    insert_review_log(&database, "log-a2", &card_a2, "2026-07-18T02:01:00.000Z", "good", "review", "review", 30_000);
    insert_review_log(&database, "log-b1", &card_b1, "2026-07-18T02:02:00.000Z", "hard", "review", "review", 30_000);

    start_session(&mut database, "practice-a", "memora", "practice", "2026-07-18T03:00:00.000Z", "2026-07-18", Some("deck"), Some(&deck_a.id));
    checkpoint(&mut database, "practice-a", "2026-07-18T03:01:00.000Z", 60_000, None, None, 0);

    start_session(&mut database, "practice-b", "memora", "practice", "2026-07-18T04:00:00.000Z", "2026-07-18", Some("deck"), Some(&deck_b.id));
    checkpoint(&mut database, "practice-b", "2026-07-18T04:00:30.000Z", 30_000, None, None, 0);

    let detail_a = database
        .deck_statistics_detail(&deck_a.id, StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("deck_a");

    assert_eq!(detail_a.active_ms, 120_000);
    assert_eq!(detail_a.session_count, 1);
    assert_eq!(detail_a.real_reviews, 2);
    let nonzero: Vec<&i64> = detail_a.buckets.iter().filter(|b| b.active_ms > 0).map(|b| &b.active_ms).collect();
    assert_eq!(nonzero.len(), 1, "expected exactly one non-zero bucket");
    assert_eq!(*nonzero[0], 120_000);

    let detail_b = database
        .deck_statistics_detail(&deck_b.id, StatisticsRange::Days30, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("deck_b");

    assert_eq!(detail_b.active_ms, 60_000);
    assert_eq!(detail_b.session_count, 1);
    assert_eq!(detail_b.real_reviews, 1);
    let nonzero_b: Vec<&i64> = detail_b.buckets.iter().filter(|b| b.active_ms > 0).map(|b| &b.active_ms).collect();
    assert_eq!(nonzero_b.len(), 1, "expected exactly one non-zero bucket for deck_b");
    assert_eq!(*nonzero_b[0], 60_000);
}

// ---------------------------------------------------------------------------
// Daily snapshot tests
// ---------------------------------------------------------------------------

#[test]
fn daily_snapshots_exclude_data_before_consent_started_at() {
    let (_directory, mut database) = db();
    seed_document(&mut database, "doc-1");

    // Reading session before consent
    start_session(
        &mut database,
        "session-pre",
        "reading",
        "reading",
        "2026-07-15T01:00:00.000Z",
        "2026-07-15",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-pre",
        "2026-07-15T01:01:00.000Z",
        60_000,
        None,
        None,
        0,
    );

    // Reading session after consent (from_local_day = 2026-07-16)
    start_session(
        &mut database,
        "session-post",
        "reading",
        "reading",
        "2026-07-16T01:00:00.000Z",
        "2026-07-16",
        None,
        None,
    );
    checkpoint(
        &mut database,
        "session-post",
        "2026-07-16T01:01:00.000Z",
        60_000,
        None,
        None,
        0,
    );

    let query = DailySnapshotQuery {
        consent_started_at: "2026-07-16T00:00:00.000Z".into(),
        from_local_day: "2026-07-16".into(),
    };
    let snapshots =
        get_daily_statistics_snapshots(&database.connection, &query).expect("daily snapshots");

    let reading_days: Vec<&str> = snapshots
        .iter()
        .filter(|s| s.app_key == "reading")
        .map(|s| s.local_day.as_str())
        .collect();
    assert_eq!(reading_days, vec!["2026-07-16"]);
}

#[test]
fn daily_snapshots_reading_contains_only_numeric_fields() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 20);

    start_session(
        &mut database,
        "s1",
        "reading",
        "reading",
        "2026-07-18T01:00:00.000Z",
        "2026-07-18",
        Some("document"),
        Some("doc-1"),
    );
    checkpoint(
        &mut database,
        "s1",
        "2026-07-18T01:02:00.000Z",
        120_000,
        Some("doc-1"),
        Some(3),
        1,
    );
    checkpoint(
        &mut database,
        "s1",
        "2026-07-18T01:03:00.000Z",
        30_000,
        Some("doc-1"),
        Some(5),
        1,
    );

    let query = DailySnapshotQuery {
        consent_started_at: "2026-07-01T00:00:00.000Z".into(),
        from_local_day: "2026-07-18".into(),
    };
    let snapshots =
        get_daily_statistics_snapshots(&database.connection, &query).expect("daily snapshots");

    let reading = snapshots
        .iter()
        .find(|s| s.app_key == "reading")
        .expect("reading snapshot");
    assert_eq!(reading.local_day, "2026-07-18");
    assert_eq!(reading.active_ms, 150_000);
    assert!(reading.active_day);
    assert_eq!(reading.session_count, 1);
    assert_eq!(reading.page_visit_count, Some(2));
    assert_eq!(reading.unique_page_count, Some(2));
    // Memora fields must be None
    assert!(reading.real_review_count.is_none());
    assert!(reading.again_count.is_none());
    assert!(reading.hard_count.is_none());
    assert!(reading.good_count.is_none());
    assert!(reading.easy_count.is_none());
    assert!(reading.lapse_count.is_none());
}

#[test]
fn daily_snapshots_memora_contains_only_numeric_fields() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-1", 10);
    let _deck = database.create_deck("DeckA").expect("deck");
    let card = create_card_for_document(&mut database, "DeckA", "doc-1", 1, "card-a");

    insert_review_log(
        &database,
        "log-1",
        &card,
        "2026-07-18T02:00:00.000Z",
        "good",
        "review",
        "review",
        60_000,
    );
    insert_review_log(
        &database,
        "log-2",
        &card,
        "2026-07-18T02:01:00.000Z",
        "again",
        "review",
        "relearning",
        10_000,
    );
    insert_review_log(
        &database,
        "log-3",
        &card,
        "2026-07-18T02:02:00.000Z",
        "hard",
        "learning",
        "learning",
        5_000,
    );

    let query = DailySnapshotQuery {
        consent_started_at: "2026-07-01T00:00:00.000Z".into(),
        from_local_day: "2026-07-18".into(),
    };
    let snapshots =
        get_daily_statistics_snapshots(&database.connection, &query).expect("daily snapshots");

    let memora = snapshots
        .iter()
        .find(|s| s.app_key == "memora")
        .expect("memora snapshot");
    assert_eq!(memora.local_day, "2026-07-18");
    assert_eq!(memora.real_review_count, Some(3));
    assert_eq!(memora.again_count, Some(1));
    assert_eq!(memora.hard_count, Some(1));
    assert_eq!(memora.good_count, Some(1));
    assert_eq!(memora.easy_count, Some(0));
    assert_eq!(memora.lapse_count, Some(1)); // prior=review + rating=again
    // Reading fields must be None
    assert!(memora.page_visit_count.is_none());
    assert!(memora.unique_page_count.is_none());
}

#[test]
fn daily_snapshots_empty_range_returns_empty_vec() {
    let (_directory, database) = db();
    let query = DailySnapshotQuery {
        consent_started_at: "2099-01-01T00:00:00.000Z".into(),
        from_local_day: "2099-01-01".into(),
    };
    let snapshots =
        get_daily_statistics_snapshots(&database.connection, &query).expect("daily snapshots");
    assert!(snapshots.is_empty());
}
