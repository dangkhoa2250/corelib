use chrono::{DateTime, SecondsFormat, Utc};
use tempfile::TempDir;

use crate::{
    library_db::LibraryDatabase,
    scheduler::{CardScheduleInput, CardState, ReviewScheduler, SchedulerConfig},
    study_queue::{
        DeckLearningSettingsUpdate, MemoraSettingsUpdate, StudyScope, StudySession,
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
        let created = utc("2026-07-16T00:00:00.000Z")
            + chrono::Duration::seconds(index as i64);
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

    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 0,
        desired_retention: 0.80,
    }).is_ok());
    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 1000,
        desired_retention: 0.90,
    }).is_err());
    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 20,
        desired_retention: 0.98,
    }).is_err());
}

#[test]
fn deck_settings_inherit_until_a_custom_limit_is_saved() {
    let (_directory, mut database) = db();
    let deck = database.create_deck("Biology").expect("create deck");

    let inherited = database.deck_learning_settings(&deck.id).expect("inherit");
    assert_eq!(inherited.new_cards_per_day, None);
    assert_eq!(inherited.effective_new_cards_per_day, 20);

    database.update_deck_learning_settings(
        &deck.id,
        DeckLearningSettingsUpdate::Custom(7),
    ).expect("save override");
    assert_eq!(
        database.deck_learning_settings(&deck.id)
            .expect("custom")
            .effective_new_cards_per_day,
        7
    );

    database.update_deck_learning_settings(
        &deck.id,
        DeckLearningSettingsUpdate::Inherit,
    ).expect("remove override");
    assert_eq!(
        database.deck_learning_settings(&deck.id)
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
    insert_card(&mut database, "learning-1", "deck-1", "learning", now, Some(0));
    insert_card(
        &mut database,
        "future-review",
        "deck-1",
        "review",
        utc("2026-07-17T09:00:00.000Z"),
        None,
    );
    insert_card(&mut database, "suspended-1", "deck-1", "suspended", now, None);

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
        .start_study_session(StudyScope::All, utc("2026-07-16T09:00:00.000Z"), "2026-07-16")
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
        .start_study_session(StudyScope::All, utc("2026-07-16T09:00:00.000Z"), "2026-07-16")
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
    insert_card(&mut database, "learning-1", "deck-1", "learning", now, Some(0));

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
                    learning_step: grant
                        .card
                        .learning_step
                        .map(|step| step as u8),
                    memory_state_json: memory,
                    elapsed_days: 0,
                },
                now,
            )
            .expect("preview");
        assert_eq!(grant.preview, expected);
    }
}
