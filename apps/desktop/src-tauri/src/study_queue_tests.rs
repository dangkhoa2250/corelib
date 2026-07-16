use tempfile::TempDir;

use crate::{
    library_db::LibraryDatabase,
    study_queue::{DeckLearningSettingsUpdate, MemoraSettingsUpdate},
};

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    (directory, database)
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
