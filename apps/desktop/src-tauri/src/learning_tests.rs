use rusqlite::params;
use tempfile::TempDir;

use crate::learning::{AppliedReview, CardBrowserQuery, CardSort, NewCard, NewCardSource};
use crate::library_db::LibraryDatabase;

fn db() -> (TempDir, LibraryDatabase) {
    let dir = TempDir::new().expect("temp dir");
    let mut db = LibraryDatabase::open(dir.path()).expect("open db");
    db.insert_local(crate::library_db::NewLocalDocument {
        id: "doc-1".into(),
        title: "Biology".into(),
        content_hash: "hash-1".into(),
        managed_path: "/tmp/book.pdf".into(),
    })
    .expect("document");
    (dir, db)
}

fn card(front: &str) -> NewCard {
    NewCard {
        deck_name: " Biology ".into(),
        front: front.into(),
        back: "answer".into(),
        source: Some(NewCardSource {
            document_id: "doc-1".into(),
            page: 2,
            quote: "quoted text".into(),
            rects_json: "[]".into(),
        }),
        tags: vec!["English".into(), " english ".into(), "books".into()],
    }
}

#[test]
fn creates_card_source_and_normalizes_tags() {
    let (_dir, mut db) = db();
    let result = db.create_card(card("What is ATP?")).expect("create");
    assert_eq!(result.front, "What is ATP?");
    assert_eq!(result.state, "new");
    assert_eq!(result.tags, vec!["English", "books"]);
    assert_eq!(
        result
            .source
            .as_ref()
            .and_then(|s| s.document_id.as_deref()),
        Some("doc-1")
    );
}

#[test]
fn rejects_blank_inputs_without_writes() {
    let (_dir, mut db) = db();
    for mut invalid in [card(""), card("front")] {
        if invalid.front == "front" {
            invalid.back = " ".into();
        }
        assert!(db.create_card(invalid).is_err());
    }
    assert!(db.card_by_id("missing").expect("read").is_none());
}

#[test]
fn rejects_missing_or_invalid_source() {
    let (_dir, mut db) = db();
    let mut missing = card("front");
    missing.source.as_mut().unwrap().document_id = "nope".into();
    assert!(db.create_card(missing).is_err());
    let mut page = card("front");
    page.source.as_mut().unwrap().page = 0;
    assert!(db.create_card(page).is_err());
}

#[test]
fn rejects_malformed_rects_before_writing_any_learning_rows() {
    let (_dir, mut db) = db();
    let mut malformed = card("front");
    malformed.source.as_mut().unwrap().rects_json = "[1]".into();
    assert!(db.create_card(malformed).is_err());
    let count: i64 = db
        .connection
        .query_row("SELECT (SELECT COUNT(*) FROM decks) + (SELECT COUNT(*) FROM cards) + (SELECT COUNT(*) FROM tags) + (SELECT COUNT(*) FROM card_text)", [], |row| row.get(0))
        .expect("count learning rows");
    assert_eq!(count, 0);

    let mut negative = card("front");
    negative.source.as_mut().unwrap().rects_json =
        r#"[{"x":0,"y":0,"width":-1,"height":2}]"#.into();
    assert!(db.create_card(negative).is_err());
}

#[test]
fn due_cards_order_and_filter_state() {
    let (_dir, mut db) = db();
    let first = db.create_card(card("first")).expect("first");
    let second = db.create_card(card("second")).expect("second");
    let due = db.due_cards("9999-12-31T00:00:00.000Z", 20).expect("due");
    assert_eq!(due.len(), 2);
    assert!(
        due[0].due_at < due[1].due_at || (due[0].due_at == due[1].due_at && due[0].id < due[1].id)
    );
    assert!(due.iter().any(|card| card.id == first.id));
    assert!(due.iter().any(|card| card.id == second.id));
}

#[test]
fn due_cards_honors_limits_above_five_hundred() {
    let (_dir, mut db) = db();
    for index in 0..501 {
        db.create_card(NewCard {
            deck_name: "Bulk".into(),
            front: format!("front-{index}"),
            back: "answer".into(),
            source: None,
            tags: Vec::new(),
        })
        .expect("create bulk card");
    }
    assert_eq!(
        db.due_cards("9999-12-31T00:00:00.000Z", 501)
            .expect("due cards")
            .len(),
        501
    );
}

#[test]
fn card_search_and_source_delete_are_resilient() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("unique mitochondria")).expect("create");
    let matches = db.learning_search("mitochondria", 10).expect("search");
    assert_eq!(matches.len(), 1);
    db.delete_document("doc-1").expect("delete");
    assert!(db
        .card_by_id(&created.id)
        .expect("read")
        .unwrap()
        .source
        .unwrap()
        .document_id
        .is_none());
}

#[test]
fn duplicate_deck_name_reuses_deck() {
    let (_dir, mut db) = db();
    let a = db.create_card(card("one")).expect("one");
    let b = db.create_card(card("two")).expect("two");
    assert_eq!(a.deck_id, b.deck_id);
}

#[test]
fn review_updates_card_and_log_atomically() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("review me")).expect("create");
    let updated = db
        .apply_review_atomic(AppliedReview {
            card_id: created.id.clone(),
            rating: "good".into(),
            prior_state: "new".into(),
            next_state: "review".into(),
            prior_due_at: created.due_at.clone(),
            next_due_at: "9999-12-31T00:00:00.000Z".into(),
            interval_seconds: 86400,
            elapsed_ms: 10,
            stability: Some(2.0),
            difficulty: Some(5.0),
            memory_state_json: Some("{}".into()),
            scheduler_version: "test".into(),
        })
        .expect("review");
    assert_eq!(updated.state, "review");
    assert_eq!(updated.reps, 1);
}

#[test]
fn review_log_failure_rolls_back_card_update() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("rollback")).expect("create");
    db.install_learning_review_failure_for_test()
        .expect("trigger");
    let result = db.apply_review_atomic(AppliedReview {
        card_id: created.id.clone(),
        rating: "good".into(),
        prior_state: "new".into(),
        next_state: "review".into(),
        prior_due_at: created.due_at.clone(),
        next_due_at: "9999-12-31T00:00:00.000Z".into(),
        interval_seconds: 1,
        elapsed_ms: 1,
        stability: Some(2.0),
        difficulty: Some(5.0),
        memory_state_json: Some("{}".into()),
        scheduler_version: "test".into(),
    });
    assert!(result.is_err());
    let unchanged = db.card_by_id(&created.id).expect("read").unwrap();
    assert_eq!(unchanged.state, "new");
    assert_eq!(unchanged.reps, 0);
}

#[test]
fn rejects_invalid_review_state_and_empty_timestamps() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("invalid review")).expect("create");
    let invalid = AppliedReview {
        card_id: created.id,
        rating: "good".into(),
        prior_state: "new".into(),
        next_state: "bogus".into(),
        prior_due_at: " ".into(),
        next_due_at: "9999-12-31T00:00:00.000Z".into(),
        interval_seconds: 1,
        elapsed_ms: 1,
        stability: None,
        difficulty: None,
        memory_state_json: None,
        scheduler_version: "test".into(),
    };
    assert!(db.apply_review_atomic(invalid).is_err());
}

#[test]
fn rejects_nonfinite_review_parameters_and_nonobject_memory() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("invalid fsrs")).expect("create");
    for (stability, difficulty, memory) in [
        (Some(f64::NAN), None, None),
        (None, Some(f64::INFINITY), None),
        (None, None, Some("[]".into())),
    ] {
        assert!(db
            .apply_review_atomic(AppliedReview {
                card_id: created.id.clone(),
                rating: "good".into(),
                prior_state: "new".into(),
                next_state: "review".into(),
                prior_due_at: created.due_at.clone(),
                next_due_at: "9999-12-31T00:00:00.000Z".into(),
                interval_seconds: 1,
                elapsed_ms: 1,
                stability,
                difficulty,
                memory_state_json: memory,
                scheduler_version: "test".into(),
            })
            .is_err());
    }
}

#[test]
fn renames_a_deck() {
    let (_dir, mut db) = db();
    let created = db.create_deck("Chemistry").expect("create");
    let renamed = db
        .rename_deck(&created.id, "Organic Chemistry")
        .expect("rename");
    assert_eq!(renamed.name, "Organic Chemistry");
    let decks = db.list_decks().expect("list");
    assert!(decks.iter().any(|d| d.name == "Organic Chemistry"));
}

#[test]
fn rejects_renaming_to_a_duplicate_deck_name() {
    let (_dir, mut db) = db();
    db.create_deck("Chemistry").expect("create");
    let physics = db.create_deck("Physics").expect("create");
    assert!(db.rename_deck(&physics.id, "Chemistry").is_err());
}

#[test]
fn rejects_renaming_a_missing_deck() {
    let (_dir, mut db) = db();
    assert!(db.rename_deck("missing-id", "New Name").is_err());
}

#[test]
fn deletes_an_empty_deck() {
    let (_dir, mut db) = db();
    let created = db.create_deck("Chemistry").expect("create");
    db.delete_deck(&created.id).expect("delete");
    let decks = db.list_decks().expect("list");
    assert!(decks.iter().all(|d| d.id != created.id));
}

#[test]
fn deleting_a_deck_cascades_to_its_cards() {
    let (_dir, mut db) = db();
    let result = db.create_card(card("What is ATP?")).expect("create");
    let decks = db.list_decks().expect("list");
    let biology = decks.iter().find(|d| d.name == "Biology").expect("deck");
    assert_eq!(db.count_cards_in_deck(&biology.id).expect("count"), 1);

    db.delete_deck(&biology.id).expect("delete");

    let decks = db.list_decks().expect("list");
    assert!(decks.iter().all(|d| d.name != "Biology"));
    assert!(db.card_by_id(&result.id).expect("read").is_none());
}

#[test]
fn counts_cards_in_an_empty_deck_as_zero() {
    let (_dir, mut db) = db();
    let created = db.create_deck("Chemistry").expect("create");
    assert_eq!(db.count_cards_in_deck(&created.id).expect("count"), 0);
}

#[test]
fn lists_cards_in_a_deck_in_creation_order() {
    let (_dir, mut db) = db();
    let first = db.create_card(card("What is ATP?")).expect("create");
    let second = db
        .create_card(card("What is a mitochondrion?"))
        .expect("create");

    let mut other_deck_card = card("What is a neuron?");
    other_deck_card.deck_name = "Neuroscience".into();
    db.create_card(other_deck_card).expect("create");

    let decks = db.list_decks().expect("list");
    let biology = decks.iter().find(|d| d.name == "Biology").expect("deck");
    let cards = db.cards_in_deck(&biology.id).expect("list cards");

    // Only Biology's own two cards, in creation order — proves the deck_id
    // filter actually scopes the query instead of returning every card.
    assert_eq!(
        cards.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
        vec![first.id.as_str(), second.id.as_str()]
    );
}

#[test]
fn lists_no_cards_for_an_empty_deck() {
    let (_dir, mut db) = db();
    let created = db.create_deck("Chemistry").expect("create");
    assert!(db
        .cards_in_deck(&created.id)
        .expect("list cards")
        .is_empty());
}

#[test]
fn deletes_a_card() {
    let (_dir, mut db) = db();
    let created = db.create_card(card("What is ATP?")).expect("create");
    db.delete_card(&created.id).expect("delete");
    assert!(db.card_by_id(&created.id).expect("read").is_none());
}

#[test]
fn rejects_deleting_a_missing_card() {
    let (_dir, mut db) = db();
    assert!(db.delete_card("missing-id").is_err());
}

#[test]
fn card_browser() {
    let (_dir, mut db) = db();

    let deck_bio = db.create_deck("Biology").expect("deck");
    let _deck_chem = db.create_deck("Chemistry").expect("deck");

    let mut card1 = card("ATP energy");
    card1.tags = vec!["Biology".into(), "Cell".into()];
    let c1 = db.create_card(card1).expect("c1");
    db.connection
        .execute(
            "UPDATE cards SET state='review', updated_at='2026-07-10T10:00:00Z' WHERE id=?1",
            params![c1.id],
        )
        .expect("update");

    let mut card2 = card("Mitochondria ATP");
    card2.tags = vec!["biology".into(), "Organelle".into()];
    let c2 = db.create_card(card2).expect("c2");
    db.connection
        .execute(
            "UPDATE cards SET state='review', updated_at='2026-07-10T09:00:00Z' WHERE id=?1",
            params![c2.id],
        )
        .expect("update");

    let mut card3 = card("ATP synthesis");
    card3.tags = vec!["Biology".into()];
    let c3 = db.create_card(card3).expect("c3");
    db.connection
        .execute(
            "UPDATE cards SET state='new', updated_at='2026-07-10T08:00:00Z' WHERE id=?1",
            params![c3.id],
        )
        .expect("update");

    let mut card_trashed = card("ATP trashed");
    card_trashed.tags = vec!["Biology".into()];
    let c_trashed = db.create_card(card_trashed).expect("c_trashed");
    db.connection
        .execute(
            "UPDATE cards SET deleted_at='2026-07-10T11:00:00Z' WHERE id=?1",
            params![c_trashed.id],
        )
        .expect("update");

    let mut card_chem = card("Reaction chemistry");
    card_chem.deck_name = "Chemistry".into();
    card_chem.tags = vec!["Chemistry".into()];
    let _c_chem = db.create_card(card_chem).expect("c_chem");

    let page = db
        .query_deck_cards(CardBrowserQuery {
            deck_id: deck_bio.id.clone(),
            query: "ATP".into(),
            states: vec!["review".into()],
            tags: vec!["Biology".into()],
            sort: CardSort::UpdatedDesc,
            cursor: None,
            limit: 2,
        })
        .expect("query");

    assert_eq!(page.rows.len(), 2);
    assert_eq!(page.rows[0].id, c1.id);
    assert_eq!(page.rows[1].id, c2.id);
    assert_eq!(page.total, 2);
    assert!(page.next_cursor.is_none());

    let page2 = db
        .query_deck_cards(CardBrowserQuery {
            deck_id: deck_bio.id.clone(),
            query: "ATP".into(),
            states: vec!["new".into(), "review".into()],
            tags: vec!["Biology".into()],
            sort: CardSort::UpdatedDesc,
            cursor: None,
            limit: 2,
        })
        .expect("query");
    assert_eq!(page2.total, 3);
    assert_eq!(page2.rows.len(), 2);
    assert!(page2.next_cursor.is_some());

    let page3 = db
        .query_deck_cards(CardBrowserQuery {
            deck_id: deck_bio.id.clone(),
            query: "ATP".into(),
            states: vec!["new".into(), "review".into()],
            tags: vec!["Biology".into()],
            sort: CardSort::UpdatedDesc,
            cursor: page2.next_cursor,
            limit: 2,
        })
        .expect("query cursor");
    assert_eq!(page3.rows.len(), 1);
    assert_eq!(page3.rows[0].id, c3.id);
    assert_eq!(page3.total, 3);

    let page4 = db
        .query_deck_cards(CardBrowserQuery {
            deck_id: deck_bio.id.clone(),
            query: "".into(),
            states: vec![],
            tags: vec!["biology".into(), "cell".into()],
            sort: CardSort::UpdatedDesc,
            cursor: None,
            limit: 10,
        })
        .expect("query tags");
    assert_eq!(page4.total, 1);
    assert_eq!(page4.rows[0].id, c1.id);
}

#[test]
fn lifecycle_active() {
    let (_dir, mut db) = db();

    let deck_bio = db.create_deck("Biology").expect("deck");
    let deck_chem = db.create_deck("Chemistry").expect("deck");

    let mut card1 = card("ATP energy");
    card1.tags = vec!["Biology".into()];
    let c1 = db.create_card(card1).expect("c1");

    db.connection.execute(
        "UPDATE cards SET state='review', stability=4.5, difficulty=2.1, reps=5, lapses=2, due_at='2026-07-10T12:00:00Z', memory_state_json='{\"fsrs\":1}' WHERE id=?1",
        params![c1.id]
    ).expect("update");

    use crate::learning::UpdateCard;
    let updated = db
        .update_card(UpdateCard {
            card_id: c1.id.clone(),
            front: "ATP energy updated".into(),
            back: "Adenosine triphosphate".into(),
            tags: vec!["biology".into(), "Cell".into()],
        })
        .expect("update_card");

    assert_eq!(updated.front, "ATP energy updated");
    assert_eq!(updated.back, "Adenosine triphosphate");
    assert_eq!(updated.tags, vec!["Biology", "Cell"]);

    let preserved: (String, Option<f64>, Option<f64>, i64, i64, String, Option<String>) = db.connection.query_row(
        "SELECT state, stability, difficulty, reps, lapses, due_at, memory_state_json FROM cards WHERE id=?1",
        params![c1.id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
    ).expect("query");
    assert_eq!(preserved.0, "review");
    assert_eq!(preserved.1, Some(4.5));
    assert_eq!(preserved.2, Some(2.1));
    assert_eq!(preserved.3, 5);
    assert_eq!(preserved.4, 2);
    assert_eq!(preserved.5, "2026-07-10T12:00:00Z");
    assert_eq!(preserved.6.as_deref(), Some("{\"fsrs\":1}"));

    let c2 = db.create_card(card("card 2")).expect("c2");

    let move_res = db
        .move_cards(&[c1.id.clone(), c2.id.clone()], &deck_chem.id)
        .expect("move");
    assert_eq!(move_res.affected_count, 2);
    assert!(move_res.affected_ids.contains(&c1.id));
    assert!(move_res.affected_ids.contains(&c2.id));

    let deck_id_c1: String = db
        .connection
        .query_row(
            "SELECT deck_id FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(deck_id_c1, deck_chem.id);

    let rollback_move = db.move_cards(&[c1.id.clone(), "invalid-id".into()], &deck_bio.id);
    assert!(rollback_move.is_err());
    let deck_id_c1_post: String = db
        .connection
        .query_row(
            "SELECT deck_id FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(deck_id_c1_post, deck_chem.id);

    let rollback_deck = db.move_cards(std::slice::from_ref(&c1.id), "missing-deck-id");
    assert!(rollback_deck.is_err());
    let deck_id_c1_post2: String = db
        .connection
        .query_row(
            "SELECT deck_id FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(deck_id_c1_post2, deck_chem.id);

    let suspend_res = db
        .set_cards_suspended(&[c1.id.clone(), c2.id.clone()], true)
        .expect("suspend");
    assert_eq!(suspend_res.affected_count, 2);

    let c1_state: (String, Option<String>) = db
        .connection
        .query_row(
            "SELECT state, suspended_from_state FROM cards WHERE id=?1",
            params![c1.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("query");
    assert_eq!(c1_state.0, "suspended");
    assert_eq!(c1_state.1.as_deref(), Some("review"));

    let rollback_suspend = db.set_cards_suspended(std::slice::from_ref(&c1.id), true);
    assert!(rollback_suspend.is_err());

    let unsuspend_res = db
        .set_cards_suspended(&[c1.id.clone(), c2.id.clone()], false)
        .expect("unsuspend");
    assert_eq!(unsuspend_res.affected_count, 2);

    let c1_state_post: (String, Option<String>) = db
        .connection
        .query_row(
            "SELECT state, suspended_from_state FROM cards WHERE id=?1",
            params![c1.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("query");
    assert_eq!(c1_state_post.0, "review");
    assert_eq!(c1_state_post.1, None);

    let rollback_unsuspend = db.set_cards_suspended(std::slice::from_ref(&c1.id), false);
    assert!(rollback_unsuspend.is_err());
}

#[test]
fn update_and_move_card_is_atomic() {
    let (_dir, mut db) = db();

    let deck_bio = db.create_deck("Biology").expect("deck");
    let deck_chem = db.create_deck("Chemistry").expect("deck");

    let c1 = db.create_card(card("ATP energy")).expect("c1");

    use crate::learning::UpdateAndMoveCard;

    // Happy path: update content + move deck in one transaction.
    let moved = db
        .update_and_move_card(UpdateAndMoveCard {
            card_id: c1.id.clone(),
            front: "ATP updated".into(),
            back: "Adenosine triphosphate".into(),
            tags: vec!["energy".into()],
            destination_deck_id: Some(deck_chem.id.clone()),
        })
        .expect("update_and_move");

    assert_eq!(moved.front, "ATP updated");
    assert_eq!(moved.back, "Adenosine triphosphate");
    assert_eq!(moved.tags, vec!["energy"]);

    let row: (String, String, String) = db
        .connection
        .query_row(
            "SELECT front, back, deck_id FROM cards WHERE id=?1",
            params![c1.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("query");
    assert_eq!(row.0, "ATP updated");
    assert_eq!(row.1, "Adenosine triphosphate");
    assert_eq!(row.2, deck_chem.id);

    // Update-only path (destination_deck_id = None): no deck change.
    let updated = db
        .update_and_move_card(UpdateAndMoveCard {
            card_id: c1.id.clone(),
            front: "ATP v2".into(),
            back: "Energy molecule".into(),
            tags: vec![],
            destination_deck_id: None,
        })
        .expect("update only");
    assert_eq!(updated.front, "ATP v2");
    let deck_id_unchanged: String = db
        .connection
        .query_row(
            "SELECT deck_id FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(deck_id_unchanged, deck_chem.id);

    // Same-deck destination: treated as update-only (no move).
    let _same_deck = db
        .update_and_move_card(UpdateAndMoveCard {
            card_id: c1.id.clone(),
            front: "ATP v3".into(),
            back: "Energy molecule v3".into(),
            tags: vec![],
            destination_deck_id: Some(deck_chem.id.clone()),
        })
        .expect("same deck");

    // Atomicity: move to a non-existent deck must roll back the content edit.
    let front_before: String = db
        .connection
        .query_row(
            "SELECT front FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");

    let failed = db.update_and_move_card(UpdateAndMoveCard {
        card_id: c1.id.clone(),
        front: "THIS SHOULD NOT PERSIST".into(),
        back: "NEITHER SHOULD THIS".into(),
        tags: vec!["ghost".into()],
        destination_deck_id: Some("nonexistent-deck".into()),
    });
    assert!(failed.is_err());

    let front_after: String = db
        .connection
        .query_row(
            "SELECT front FROM cards WHERE id=?1",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(front_after, front_before);
    assert_ne!(front_after, "THIS SHOULD NOT PERSIST");

    // Move the card back to Biology for a trashed-card rejection check.
    db.update_and_move_card(UpdateAndMoveCard {
        card_id: c1.id.clone(),
        front: "ATP v3".into(),
        back: "Energy molecule v3".into(),
        tags: vec![],
        destination_deck_id: Some(deck_bio.id.clone()),
    })
    .expect("move back");

    db.trash_cards(std::slice::from_ref(&c1.id))
        .expect("trash");

    let trashed_edit = db.update_and_move_card(UpdateAndMoveCard {
        card_id: c1.id.clone(),
        front: "edited while trashed".into(),
        back: "should fail".into(),
        tags: vec![],
        destination_deck_id: None,
    });
    assert!(trashed_edit.is_err());
}

#[test]
fn trash_and_isolation() {
    let (_dir, mut db) = db();

    let deck_bio = db.create_deck("Biology").expect("deck");
    let deck_chem = db.create_deck("Chemistry").expect("deck");

    let c1 = db.create_card(card("ATP energy")).expect("c1");
    let c2 = db.create_card(card("Mitochondria")).expect("c2");

    let trash_res = db.trash_cards(std::slice::from_ref(&c1.id)).expect("trash");
    assert_eq!(trash_res.affected_count, 1);
    assert_eq!(trash_res.affected_ids, vec![c1.id.clone()]);

    let active_cards = db.cards_in_deck(&deck_bio.id).expect("active");
    assert_eq!(active_cards.len(), 1);
    assert_eq!(active_cards[0].id, c2.id);

    let count = db.count_cards_in_deck(&deck_bio.id).expect("count");
    assert_eq!(count, 1);

    use crate::learning::{TrashQuery, TrashSort};
    let trashed_page = db
        .list_trashed_cards(TrashQuery {
            query: "".into(),
            sort: TrashSort::DeletedDesc,
            cursor: None,
            limit: 10,
        })
        .expect("trash page");
    assert_eq!(trashed_page.total, 1);
    assert_eq!(trashed_page.rows[0].id, c1.id);
    assert_eq!(trashed_page.rows[0].deck_name, "Biology");

    let review_err = db.apply_review_atomic(AppliedReview {
        card_id: c1.id.clone(),
        rating: "good".into(),
        prior_state: "new".into(),
        next_state: "review".into(),
        prior_due_at: "2026-07-10T00:00:00Z".into(),
        next_due_at: "2026-07-11T00:00:00Z".into(),
        interval_seconds: 86400,
        elapsed_ms: 1000,
        stability: None,
        difficulty: None,
        memory_state_json: None,
        scheduler_version: "fsrs-v1".into(),
    });
    assert!(review_err.is_err());
    let err_msg = review_err.unwrap_err().to_string();
    assert!(
        err_msg.contains("card is in Trash"),
        "error message is: {}",
        err_msg
    );

    let restore_res = db
        .restore_cards(std::slice::from_ref(&c1.id), None)
        .expect("restore");
    assert_eq!(restore_res.affected_count, 1);

    let active_cards_post = db.cards_in_deck(&deck_bio.id).expect("active post");
    assert_eq!(active_cards_post.len(), 2);

    db.delete_deck(&deck_bio.id).expect("delete deck");

    let deck_exists = db
        .connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
            params![deck_bio.id],
            |r| r.get::<_, bool>(0),
        )
        .expect("query");
    assert!(!deck_exists);

    let c2_deleted: (Option<String>, Option<String>, Option<String>) = db
        .connection
        .query_row(
            "SELECT deck_id, deleted_at, deleted_from_deck_name FROM cards WHERE id = ?1",
            params![c2.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("query");
    assert_eq!(c2_deleted.0, None);
    assert!(c2_deleted.1.is_some());
    assert_eq!(c2_deleted.2.as_deref(), Some("Biology"));

    assert!(db
        .restore_cards(std::slice::from_ref(&c2.id), None)
        .is_err());

    let restore_c2 = db
        .restore_cards(std::slice::from_ref(&c2.id), Some(&deck_chem.id))
        .expect("restore with dest");
    assert_eq!(restore_c2.affected_count, 1);

    let c2_deck_id: String = db
        .connection
        .query_row(
            "SELECT deck_id FROM cards WHERE id=?1",
            params![c2.id],
            |r| r.get(0),
        )
        .expect("query");
    assert_eq!(c2_deck_id, deck_chem.id);

    let trash_c2 = db.trash_cards(std::slice::from_ref(&c2.id)).expect("trash");
    assert_eq!(trash_c2.affected_count, 1);

    let perm_del = db
        .delete_cards_permanently(std::slice::from_ref(&c2.id))
        .expect("perm delete");
    assert_eq!(perm_del.affected_count, 1);

    let c2_exists: bool = db
        .connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE id=?1)",
            params![c2.id],
            |r| r.get(0),
        )
        .expect("query");
    assert!(!c2_exists);

    // c1 is already trashed because of delete_deck. So we can just empty trash directly.
    let empty_res = db.empty_trash().expect("empty");
    assert_eq!(empty_res.affected_count, 1);

    let c1_exists: bool = db
        .connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE id=?1)",
            params![c1.id],
            |r| r.get(0),
        )
        .expect("query");
    assert!(!c1_exists);
}

#[test]
fn get_deck_statistics_counts_cards_by_state_and_due_status() {
    let (_dir, mut db) = db();

    let deck_bio = db.create_deck("Biology").expect("deck");
    let deck_chem = db.create_deck("Chemistry").expect("deck");

    // Create cards in different states for Biology
    let c_new = db.create_card(card("new card")).expect("new");
    db.connection
        .execute(
            "UPDATE cards SET state='new', due_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_new.id],
        )
        .expect("update");

    let c_learning = db.create_card(card("learning card")).expect("learning");
    db.connection
        .execute(
            "UPDATE cards SET state='learning', due_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_learning.id],
        )
        .expect("update");

    let c_review = db.create_card(card("review card")).expect("review");
    db.connection
        .execute(
            "UPDATE cards SET state='review', due_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_review.id],
        )
        .expect("update");

    let c_relearning = db.create_card(card("relearning card")).expect("relearning");
    db.connection
        .execute(
            "UPDATE cards SET state='relearning', due_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_relearning.id],
        )
        .expect("update");

    let c_suspended = db.create_card(card("suspended card")).expect("suspended");
    db.connection
        .execute(
            "UPDATE cards SET state='suspended', due_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_suspended.id],
        )
        .expect("update");

    let c_not_due = db.create_card(card("not due card")).expect("not due");
    db.connection
        .execute(
            "UPDATE cards SET state='review', due_at='2099-12-31T00:00:00Z' WHERE id=?1",
            params![c_not_due.id],
        )
        .expect("update");

    // Create a card in Chemistry to verify deck filtering
    let c_chem = card("chemistry card");
    let c_chem = NewCard {
        deck_name: "Chemistry".into(),
        ..c_chem
    };
    let _c_chem = db.create_card(c_chem).expect("chemistry");

    // Create a trashed card to verify it's excluded
    let c_trashed = db.create_card(card("trashed card")).expect("trashed");
    db.connection
        .execute(
            "UPDATE cards SET deleted_at='2026-07-10T00:00:00Z' WHERE id=?1",
            params![c_trashed.id],
        )
        .expect("update");

    // Get statistics for Biology deck
    let stats = db
        .get_deck_statistics(&deck_bio.id)
        .expect("get_deck_statistics");

    assert_eq!(stats.total_cards, 6);
    assert_eq!(stats.new_cards, 1);
    assert_eq!(stats.learning_cards, 1);
    assert_eq!(stats.review_cards, 2);
    assert_eq!(stats.relearning_cards, 1);
    assert_eq!(stats.suspended_cards, 1);
    assert_eq!(stats.due_cards, 3);

    // Get statistics for Chemistry deck
    let chem_stats = db
        .get_deck_statistics(&deck_chem.id)
        .expect("get_deck_statistics");
    assert_eq!(chem_stats.total_cards, 1);
    assert_eq!(chem_stats.new_cards, 1);
    assert_eq!(chem_stats.due_cards, 0);
}
