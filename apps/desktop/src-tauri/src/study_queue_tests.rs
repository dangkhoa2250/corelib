use chrono::{DateTime, SecondsFormat, Utc};
use tempfile::TempDir;

use crate::{
    library_db::LibraryDatabase,
    scheduler::{CardScheduleInput, CardState, Rating, ReviewScheduler, SchedulerConfig},
    study_queue::{
        DeckLearningSettingsUpdate, MemoraSettingsUpdate, StudyGrant, StudyRating, StudyScope,
        StudySession,
    },
};

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    (directory, database)
}

fn utc(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .expect("valid rfc3339")
        .with_timezone(&Utc)
}

fn rfc3339(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn insert_deck(database: &mut LibraryDatabase, id: &str) {
    database
        .connection
        .execute(
            "INSERT INTO decks(id,name,created_at,updated_at) VALUES(?1,?1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
            rusqlite::params![id],
        )
        .expect("insert deck");
}

fn seeded_learning_database() -> (TempDir, LibraryDatabase) {
    let (directory, mut database) = db();
    insert_deck(&mut database, "deck-1");
    insert_deck(&mut database, "deck-2");
    (directory, database)
}

fn insert_card(
    database: &mut LibraryDatabase,
    id: &str,
    deck_id: &str,
    state: &str,
    due_at: DateTime<Utc>,
    learning_step: Option<i64>,
) {
    let due = rfc3339(due_at);
    database
        .connection
        .execute(
            "INSERT INTO cards(id,deck_id,front,back,state,due_at,learning_step,reps,lapses,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,0,0,?6,?6)",
            rusqlite::params![id, deck_id, id, id, state, due, learning_step],
        )
        .expect("insert card");
}

fn insert_new_cards(database: &mut LibraryDatabase, deck_id: &str, count: usize) {
    for index in 0..count {
        let created = utc("2026-07-16T00:00:00.000Z") + chrono::Duration::seconds(index as i64);
        let id = format!("{deck_id}-new-{index}");
        let created_str = rfc3339(created);
        database
            .connection
            .execute(
                "INSERT INTO cards(id,deck_id,front,back,state,due_at,reps,lapses,created_at,updated_at)
                 VALUES(?1,?2,?1,?1,'new',?3,0,0,?3,?3)",
                rusqlite::params![id, deck_id, created_str],
            )
            .expect("insert new card");
    }
}

fn insert_due_review(database: &mut LibraryDatabase, id: &str, deck_id: &str) {
    insert_card(
        database,
        id,
        deck_id,
        "review",
        utc("2026-07-16T08:00:00.000Z"),
        None,
    );
}

fn rating_from(grant: &StudyGrant, session: &StudySession, now: DateTime<Utc>) -> StudyRating {
    StudyRating {
        session_id: session.session_id.clone(),
        card_id: grant.card.id.clone(),
        grant_token: grant.grant_token.clone(),
        expected_state: grant.expected_state.clone(),
        expected_due_at: grant.expected_due_at.clone(),
        rating: Rating::Good,
        elapsed_ms: 1000,
        now,
        study_day: "2026-07-16".into(),
        local_minute_of_day: 13 * 60 + 15,
    }
}

fn review_log_count(database: &LibraryDatabase, card_id: &str) -> i64 {
    database
        .connection
        .query_row(
            "SELECT COUNT(*) FROM review_logs WHERE card_id = ?1",
            rusqlite::params![card_id],
            |row| row.get(0),
        )
        .expect("count review logs")
}

fn replace_open_grant_for_test(
    database: &mut LibraryDatabase,
    session_id: &str,
    original: &StudyGrant,
    replacement_card_id: &str,
) -> StudyGrant {
    let card = database
        .card_by_id(replacement_card_id)
        .expect("read replacement")
        .expect("replacement card");
    database
        .connection
        .execute(
            "UPDATE study_session_cards SET card_id=?1, expected_state=?2, expected_due_at=?3 WHERE session_id=?4 AND grant_token=?5 AND consumed_at IS NULL",
            rusqlite::params![replacement_card_id, card.state, card.due_at, session_id, original.grant_token],
        )
        .expect("replace test grant");
    StudyGrant {
        grant_token: original.grant_token.clone(),
        expected_state: card.state.clone(),
        expected_due_at: card.due_at.clone(),
        card,
        preview: original.preview.clone(),
    }
}

fn new_count(session: &StudySession, deck_id: &str) -> usize {
    session
        .cards
        .iter()
        .filter(|grant| grant.card.deck_id == deck_id && grant.card.state == "new")
        .count()
}

#[test]
fn memora_settings_default_and_validate_safe_ranges() {
    let (_directory, mut database) = db();
    let defaults = database.memora_settings().expect("read settings");
    assert_eq!(defaults.new_cards_per_day, 20);
    assert_eq!(defaults.desired_retention, 0.90);

    assert!(database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 0,
            desired_retention: 0.80,
        })
        .is_ok());
    assert!(database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 1000,
            desired_retention: 0.90,
        })
        .is_err());
    assert!(database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 20,
            desired_retention: 0.98,
        })
        .is_err());
}

#[test]
fn deck_settings_inherit_until_a_custom_limit_is_saved() {
    let (_directory, mut database) = db();
    let deck = database.create_deck("Biology").expect("create deck");

    let inherited = database.deck_learning_settings(&deck.id).expect("inherit");
    assert_eq!(inherited.new_cards_per_day, None);
    assert_eq!(inherited.effective_new_cards_per_day, 20);

    database
        .update_deck_learning_settings(&deck.id, DeckLearningSettingsUpdate::Custom(7))
        .expect("save override");
    assert_eq!(
        database
            .deck_learning_settings(&deck.id)
            .expect("custom")
            .effective_new_cards_per_day,
        7
    );

    database
        .update_deck_learning_settings(&deck.id, DeckLearningSettingsUpdate::Inherit)
        .expect("remove override");
    assert_eq!(
        database
            .deck_learning_settings(&deck.id)
            .expect("inherited again")
            .new_cards_per_day,
        None
    );
}

#[test]
fn queue_prioritizes_learning_then_review_then_new() {
    let (_directory, mut database) = seeded_learning_database();
    let now = utc("2026-07-16T09:00:00.000Z");
    insert_card(&mut database, "new-1", "deck-1", "new", now, None);
    insert_card(&mut database, "review-1", "deck-1", "review", now, None);
    insert_card(
        &mut database,
        "learning-1",
        "deck-1",
        "learning",
        now,
        Some(0),
    );
    insert_card(
        &mut database,
        "future-review",
        "deck-1",
        "review",
        utc("2026-07-17T09:00:00.000Z"),
        None,
    );
    insert_card(
        &mut database,
        "suspended-1",
        "deck-1",
        "suspended",
        now,
        None,
    );

    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .expect("start session");
    let ids = session
        .cards
        .iter()
        .map(|grant| grant.card.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["learning-1", "review-1", "new-1"]);
    assert_eq!(session.counts.learning, 1);
    assert_eq!(session.counts.review, 1);
    assert_eq!(session.counts.new, 1);
}

#[test]
fn expired_refresh_uses_the_recoverable_session_error() {
    let (_directory, mut database) = seeded_learning_database();
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database
        .start_study_session(StudyScope::All, now, "2026-07-16")
        .expect("start session");

    let error = database
        .refresh_study_session(
            &session.session_id,
            now + chrono::Duration::hours(24),
            "2026-07-17",
        )
        .expect_err("expired session");

    assert_eq!(error.to_string(), "study session expired");
}

#[test]
fn queue_applies_global_and_per_deck_new_card_limits() {
    let (_directory, mut database) = seeded_learning_database();
    database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 2,
            desired_retention: 0.90,
        })
        .unwrap();
    database
        .update_deck_learning_settings("deck-2", DeckLearningSettingsUpdate::Custom(1))
        .unwrap();
    insert_new_cards(&mut database, "deck-1", 4);
    insert_new_cards(&mut database, "deck-2", 4);

    let session = database
        .start_study_session(
            StudyScope::All,
            utc("2026-07-16T09:00:00.000Z"),
            "2026-07-16",
        )
        .unwrap();
    assert_eq!(new_count(&session, "deck-1"), 2);
    assert_eq!(new_count(&session, "deck-2"), 1);
}

#[test]
fn zero_new_limit_keeps_due_reviews_available() {
    let (_directory, mut database) = seeded_learning_database();
    database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 0,
            desired_retention: 0.90,
        })
        .unwrap();
    insert_new_cards(&mut database, "deck-1", 2);
    insert_due_review(&mut database, "review-1", "deck-1");

    let session = database
        .start_study_session(
            StudyScope::All,
            utc("2026-07-16T09:00:00.000Z"),
            "2026-07-16",
        )
        .unwrap();
    assert_eq!(session.cards.len(), 1);
    assert_eq!(session.cards[0].card.id, "review-1");
}

#[test]
fn queue_preview_matches_direct_scheduler_preview() {
    let (_directory, mut database) = seeded_learning_database();
    let now = utc("2026-07-16T09:00:00.000Z");
    insert_card(&mut database, "new-1", "deck-1", "new", now, None);
    insert_card(&mut database, "review-1", "deck-1", "review", now, None);
    insert_card(
        &mut database,
        "learning-1",
        "deck-1",
        "learning",
        now,
        Some(0),
    );

    let settings = database.memora_settings().expect("settings");
    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .expect("start session");

    let scheduler = ReviewScheduler::new(SchedulerConfig {
        desired_retention: settings.desired_retention as f32,
        version: "memora-learning-v2+fsrs-6.6.0".into(),
    })
    .expect("scheduler");

    for grant in &session.cards {
        let state = match grant.card.state.as_str() {
            "new" => CardState::New,
            "learning" => CardState::Learning,
            "review" => CardState::Review,
            "relearning" => CardState::Relearning,
            other => panic!("unexpected state {other}"),
        };
        let memory = database
            .card_memory_state(&grant.card.id)
            .expect("memory state");
        let expected = scheduler
            .preview(
                CardScheduleInput {
                    state,
                    learning_step: grant.card.learning_step.map(|step| step as u8),
                    memory_state_json: memory,
                    elapsed_days: 0,
                },
                now,
            )
            .expect("preview");
        assert_eq!(grant.preview, expected);
    }
}

#[test]
fn overdue_review_preview_uses_elapsed_days_since_last_review() {
    let (_directory, mut database) = seeded_learning_database();
    let now = utc("2026-07-16T09:00:00.000Z");
    insert_due_review(&mut database, "review-1", "deck-1");
    database
        .connection
        .execute(
            "UPDATE cards
             SET last_review_at = '2026-07-12T09:00:00.000Z',
                 memory_state_json = '{\"stability\":3.0,\"difficulty\":5.0}',
                 stability = 3.0,
                 difficulty = 5.0
             WHERE id = 'review-1'",
            [],
        )
        .expect("seed review memory");

    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .expect("start session");
    let scheduler = ReviewScheduler::default();
    let expected = scheduler
        .preview(
            CardScheduleInput {
                state: CardState::Review,
                learning_step: None,
                memory_state_json: Some(r#"{"stability":3.0,"difficulty":5.0}"#.into()),
                elapsed_days: 4,
            },
            now,
        )
        .expect("preview overdue review");

    assert_eq!(session.cards[0].preview, expected);
}

#[test]
fn rating_consumes_one_grant_and_writes_one_review_atomically() {
    let (_directory, mut database) = seeded_learning_database();
    insert_due_review(&mut database, "review-1", "deck-1");
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .unwrap();
    let grant = &session.cards[0];

    let rating = StudyRating {
        session_id: session.session_id.clone(),
        card_id: grant.card.id.clone(),
        grant_token: grant.grant_token.clone(),
        expected_state: grant.expected_state.clone(),
        expected_due_at: grant.expected_due_at.clone(),
        rating: Rating::Good,
        elapsed_ms: 1200,
        now,
        study_day: "2026-07-16".into(),
        local_minute_of_day: 13 * 60 + 15,
    };

    let first = database.rate_study_card(rating.clone()).expect("rate card");
    let second = database.rate_study_card(rating).expect("idempotent retry");
    assert_eq!(second.review_log_id, first.review_log_id);
    assert_eq!(review_log_count(&database, "review-1"), 1);
}

#[test]
fn review_log_persists_local_minute_of_day() {
    let (_directory, mut database) = seeded_learning_database();
    insert_due_review(&mut database, "review-1", "deck-1");
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .expect("start session");

    let result = database
        .rate_study_card(rating_from(&session.cards[0], &session, now))
        .expect("rate card");
    let local_minute_of_day: i64 = database
        .connection
        .query_row(
            "SELECT local_minute_of_day FROM review_logs WHERE id = ?1",
            rusqlite::params![result.review_log_id],
            |row| row.get(0),
        )
        .expect("read local review minute");

    assert_eq!(local_minute_of_day, 13 * 60 + 15);
}

#[test]
fn rate_study_card_rejects_invalid_local_minute() {
    for local_minute_of_day in [-1, 1440] {
        let (_directory, mut database) = seeded_learning_database();
        insert_due_review(&mut database, "review-1", "deck-1");
        let now = utc("2026-07-16T09:00:00.000Z");
        let session = database
            .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
            .expect("start session");
        let grant = &session.cards[0];
        let card_before: (String, String, i64) = database
            .connection
            .query_row(
                "SELECT state, due_at, reps FROM cards WHERE id = ?1",
                rusqlite::params![grant.card.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read card before rating");
        let mut rating = rating_from(grant, &session, now);
        rating.local_minute_of_day = local_minute_of_day;

        let error = database
            .rate_study_card(rating)
            .expect_err("reject invalid local review minute");

        assert_eq!(
            error.to_string(),
            "local review minute must be between 0 and 1439"
        );
        assert_eq!(review_log_count(&database, "review-1"), 0);
        let card_after: (String, String, i64) = database
            .connection
            .query_row(
                "SELECT state, due_at, reps FROM cards WHERE id = ?1",
                rusqlite::params![grant.card.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read card after rating");
        assert_eq!(card_after, card_before);
    }
}

#[test]
fn stale_or_suspended_grant_is_rejected_without_writes() {
    let (_directory, mut database) = seeded_learning_database();
    insert_due_review(&mut database, "review-1", "deck-1");
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database
        .start_study_session(StudyScope::Deck("deck-1".into()), now, "2026-07-16")
        .unwrap();
    let grant = session.cards[0].clone();
    database
        .set_cards_suspended(&["review-1".into()], true)
        .unwrap();

    let error = database
        .rate_study_card(rating_from(&grant, &session, now))
        .expect_err("reject suspended card");
    assert_eq!(error.to_string(), "study card changed; refresh the session");
    assert_eq!(review_log_count(&database, "review-1"), 0);
}

#[test]
fn new_card_allowance_is_checked_when_rating_not_when_granted() {
    let (_directory, mut database) = seeded_learning_database();
    database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 1,
            desired_retention: 0.90,
        })
        .unwrap();
    insert_new_cards(&mut database, "deck-1", 2);
    let now = utc("2026-07-16T09:00:00.000Z");
    let first_session = database
        .start_study_session(StudyScope::All, now, "2026-07-16")
        .unwrap();
    let second_session = database
        .start_study_session(StudyScope::All, now, "2026-07-16")
        .unwrap();
    let second_grant = replace_open_grant_for_test(
        &mut database,
        &second_session.session_id,
        &second_session.cards[0],
        "deck-1-new-1",
    );

    database
        .rate_study_card(rating_from(&first_session.cards[0], &first_session, now))
        .unwrap();

    let error = database
        .rate_study_card(rating_from(&second_grant, &second_session, now))
        .expect_err("limit reached");
    assert_eq!(
        error.to_string(),
        "new card limit reached; refresh the session"
    );
}

#[test]
fn ready_counts_apply_new_allowance_without_creating_a_session() {
    let (_directory, mut database) = seeded_learning_database();
    database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 2,
            desired_retention: 0.90,
        })
        .unwrap();
    database
        .update_deck_learning_settings("deck-2", DeckLearningSettingsUpdate::Custom(1))
        .unwrap();
    insert_new_cards(&mut database, "deck-1", 4);
    insert_new_cards(&mut database, "deck-2", 4);
    insert_due_review(&mut database, "review-1", "deck-1");
    insert_card(
        &mut database,
        "learning-1",
        "deck-1",
        "learning",
        utc("2026-07-16T08:00:00.000Z"),
        Some(0),
    );

    let now = utc("2026-07-16T09:00:00.000Z");
    let counts = database.study_ready_counts(now, "2026-07-16").unwrap();

    assert_eq!(counts.learning, 1);
    assert_eq!(counts.review, 1);
    assert_eq!(counts.new, 3);
    assert_eq!(counts.total, 5);

    let sessions: i64 = database
        .connection
        .query_row("SELECT COUNT(*) FROM study_sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(sessions, 0);
}

#[test]
fn ready_counts_exclude_future_due_and_introduced_new_cards() {
    let (_directory, mut database) = seeded_learning_database();
    database
        .update_memora_settings(MemoraSettingsUpdate {
            new_cards_per_day: 5,
            desired_retention: 0.90,
        })
        .unwrap();
    insert_new_cards(&mut database, "deck-1", 3);
    insert_card(
        &mut database,
        "future-review",
        "deck-1",
        "review",
        utc("2026-07-20T09:00:00.000Z"),
        None,
    );

    let now = utc("2026-07-16T09:00:00.000Z");
    let before = database.study_ready_counts(now, "2026-07-16").unwrap();
    assert_eq!(before.new, 3);
    assert_eq!(before.review, 0);
    assert_eq!(before.total, 3);

    database
        .connection
        .execute(
            "INSERT INTO card_introductions(card_id, deck_id, study_day, introduced_at)
             VALUES('deck-1-new-0','deck-1','2026-07-16',?1)",
            rusqlite::params![rfc3339(now)],
        )
        .unwrap();
    let after = database.study_ready_counts(now, "2026-07-16").unwrap();
    assert_eq!(after.new, 2);
    assert_eq!(after.total, 2);
}
