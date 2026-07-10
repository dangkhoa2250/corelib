use tempfile::TempDir;

use crate::learning::{AppliedReview, NewCard, NewCardSource};
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
fn due_cards_order_and_filter_state() {
    let (_dir, mut db) = db();
    let first = db.create_card(card("first")).expect("first");
    let second = db.create_card(card("second")).expect("second");
    let due = db.due_cards("9999999999", 20).expect("due");
    let mut expected = vec![first.id, second.id];
    expected.sort();
    assert_eq!(
        due.iter().map(|c| c.id.clone()).collect::<Vec<_>>(),
        expected
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
            next_due_at: "9999999999".into(),
            interval_seconds: 86400,
            elapsed_ms: 10,
            stability: Some(2.0),
            difficulty: Some(5.0),
            memory_state_json: Some("{}".into()),
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
        next_due_at: "9999999999".into(),
        interval_seconds: 1,
        elapsed_ms: 1,
        stability: Some(2.0),
        difficulty: Some(5.0),
        memory_state_json: Some("{}".into()),
    });
    assert!(result.is_err());
    let unchanged = db.card_by_id(&created.id).expect("read").unwrap();
    assert_eq!(unchanged.state, "new");
    assert_eq!(unchanged.reps, 0);
}
