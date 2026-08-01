use std::fs;
use std::path::{Path, PathBuf};
use std::sync::MutexGuard;
use std::time::Duration;

use rusqlite::params;
use tempfile::TempDir;

use crate::library_db::LibraryDatabase;
use crate::media::{CardMediaStore, MEDIA_DIR_NAME, STAGING_DIR_NAME};

/// Minimal valid 1x1 PNG (signature + IHDR + IDAT + IEND).
const PNG_BYTES: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

/// Bytes whose JPEG magic (FF D8 FF) is recognizable to the sniffer.
const JPEG_BYTES: &[u8] = &[
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
];

/// Bytes whose GIF89a magic is recognizable to the sniffer.
const GIF_BYTES: &[u8] = &[
    b'G', b'I', b'F', b'8', b'9', b'a', 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
];

/// Bytes whose RIFF/WEBP magic is recognizable to the sniffer.
const WEBP_BYTES: &[u8] = &[
    b'R', b'I', b'F', b'F', 0x1A, 0x00, 0x00, 0x00, b'W', b'E', b'B', b'P', b'V', b'P', 0x38, 0x4C,
    0x0D, 0x00, 0x00, 0x00, 0x2D, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x9D, 0x81,
    0x21, 0x4E, 0x9D, 0x81, 0x21, 0x4E,
];

const UNSUPPORTED_BYTES: &[u8] = &[0x00, 0x01, 0x02, 0x03, 0x04, 0x05];

fn setup() -> (
    TempDir,
    std::sync::Arc<std::sync::Mutex<LibraryDatabase>>,
    CardMediaStore,
) {
    let directory = TempDir::new().expect("temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    let database = std::sync::Arc::new(std::sync::Mutex::new(database));
    let media_root = directory.path().join(MEDIA_DIR_NAME);
    let store = CardMediaStore::new(std::sync::Arc::clone(&database), media_root);
    (directory, database, store)
}

fn insert_deck(database: &LibraryDatabase, id: &str) {
    database
        .connection
        .execute(
            "INSERT INTO decks(id,name,created_at,updated_at) \
             VALUES(?1,?1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
            params![id],
        )
        .expect("insert deck");
}

fn insert_card(database: &LibraryDatabase, id: &str, deck_id: &str) {
    database
        .connection
        .execute(
            "INSERT INTO cards(id,deck_id,front,back,state,due_at,reps,lapses,created_at,updated_at) \
             VALUES(?1,?2,?1,?1,'new','2026-01-01T00:00:00.000Z',0,0,\
             '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
            params![id, deck_id],
        )
        .expect("insert card");
}

fn media_root_of(store: &CardMediaStore) -> &Path {
    store.media_root()
}

fn lock_db(store: &CardMediaStore) -> MutexGuard<'_, LibraryDatabase> {
    store.database().lock().expect("database lock")
}

fn row_exists(database: &LibraryDatabase, media_id: &str) -> bool {
    database
        .connection
        .query_row(
            "SELECT 1 FROM card_media WHERE id = ?1",
            params![media_id],
            |_| Ok(()),
        )
        .is_ok()
}

fn relative_path(database: &LibraryDatabase, media_id: &str) -> String {
    database
        .connection
        .query_row(
            "SELECT relative_path FROM card_media WHERE id = ?1",
            params![media_id],
            |row| row.get::<_, String>(0),
        )
        .expect("row present")
}

/// Stage a blob under `draft` and return its media id, for terse arrange blocks.
fn stage_id(store: &CardMediaStore, draft: &str, bytes: &[u8], mime: &str) -> String {
    store
        .stage_from_bytes(draft, bytes, mime, "clipboard", None)
        .expect("stage")
        .id
}

#[test]
fn stage_from_bytes_writes_under_staging_for_each_source() {
    let (_directory, _database, store) = setup();

    let clipboard = store
        .stage_from_bytes("draft-1", PNG_BYTES, "image/png", "clipboard", None)
        .expect("stage clipboard png");
    let pixabay = store
        .stage_from_bytes(
            "draft-1",
            JPEG_BYTES,
            "image/jpeg",
            "pixabay",
            Some("Pixabay user 'sample' / pixabay.com"),
        )
        .expect("stage pixabay jpeg");

    assert_eq!(clipboard.source_type, "clipboard");
    assert_eq!(clipboard.mime_type, "image/png");
    assert_eq!(clipboard.card_id, None);
    assert_eq!(clipboard.draft_id.as_deref(), Some("draft-1"));
    assert!(clipboard.relative_path.starts_with("staging/draft-1/"));
    assert_eq!(clipboard.size_bytes, PNG_BYTES.len() as i64);
    assert!(clipboard.pixabay_attribution.is_none());

    assert_eq!(pixabay.source_type, "pixabay");
    assert_eq!(pixabay.mime_type, "image/jpeg");
    assert_eq!(
        pixabay.pixabay_attribution.as_deref(),
        Some("Pixabay user 'sample' / pixabay.com")
    );

    // Files must physically live under card-media/staging/<draftId>/.
    let staging_dir = media_root_of(&store).join(STAGING_DIR_NAME).join("draft-1");
    let clipboard_file = media_root_of(&store).join(&clipboard.relative_path);
    let pixabay_file = media_root_of(&store).join(&pixabay.relative_path);
    assert!(staging_dir.is_dir(), "staging directory should exist");
    assert!(clipboard_file.is_file(), "clipboard file should exist");
    assert!(pixabay_file.is_file(), "pixabay file should exist");
    assert_eq!(fs::read(&clipboard_file).unwrap(), PNG_BYTES);
}

#[test]
fn stage_from_bytes_detects_webp_and_gif_by_magic_bytes() {
    let (_database, _store, store) = setup();

    let webp = store
        .stage_from_bytes("draft-1", WEBP_BYTES, "", "clipboard", None)
        .expect("stage webp");
    let gif = store
        .stage_from_bytes("draft-1", GIF_BYTES, "", "clipboard", None)
        .expect("stage gif");

    assert_eq!(webp.mime_type, "image/webp");
    assert!(webp.relative_path.ends_with(".webp"));
    assert_eq!(gif.mime_type, "image/gif");
    assert!(gif.relative_path.ends_with(".gif"));
}

#[test]
fn stage_from_file_sniffs_mime_from_file_content() {
    let (directory, _database, store) = setup();

    let source_file = directory.path().join("source.png");
    fs::write(&source_file, PNG_BYTES).expect("write source png");

    let staged = store
        .stage_from_file("draft-1", &source_file, "file")
        .expect("stage from file");

    assert_eq!(staged.source_type, "file");
    assert_eq!(staged.mime_type, "image/png");
    assert!(staged.relative_path.starts_with("staging/draft-1/"));
    let staged_file = media_root_of(&store).join(&staged.relative_path);
    assert!(staged_file.is_file());
    assert_eq!(fs::read(&staged_file).unwrap(), PNG_BYTES);
}

#[test]
fn stage_rejects_oversized_media() {
    let (_directory, _database, store) = setup();

    let mut oversized = PNG_BYTES.to_vec();
    oversized.resize(10 * 1024 * 1024 + 1, 0);

    let error = store
        .stage_from_bytes("draft-1", &oversized, "image/png", "file", None)
        .expect_err("oversized media should be rejected");

    assert!(
        error.to_lowercase().contains("10 mib") || error.to_lowercase().contains("limit"),
        "expected size error, got: {error}"
    );
}

#[test]
fn stage_rejects_unsupported_mime() {
    let (_directory, _database, store) = setup();

    let error = store
        .stage_from_bytes(
            "draft-1",
            UNSUPPORTED_BYTES,
            "application/pdf",
            "clipboard",
            None,
        )
        .expect_err("unsupported media should be rejected");

    assert!(
        error.to_lowercase().contains("unsupported"),
        "expected unsupported error, got: {error}"
    );
}

#[test]
fn stage_rejects_invalid_source_type() {
    let (_directory, _database, store) = setup();

    let error = store
        .stage_from_bytes("draft-1", PNG_BYTES, "image/png", "dropbox", None)
        .expect_err("invalid sourceType should be rejected");

    assert!(
        error.to_lowercase().contains("source_type"),
        "expected source_type error, got: {error}"
    );
}

#[test]
fn resolve_rejects_relative_path_traversal_in_stored_row() {
    let (_directory, _database, store) = setup();

    // Plant malicious staged rows by hand so we can prove resolve() defends
    // against traversal/absolute stored paths even if the database is corrupt.
    // Staged rows (card_id NULL) avoid the cards FK.
    {
        let db = lock_db(&store);
        db.connection
            .execute(
                "INSERT INTO card_media(id,card_id,draft_id,mime_type,relative_path,source_type,\
                 size_bytes,created_at,updated_at) \
                 VALUES('evil',NULL,'draft-x','image/png','staging/../../etc/passwd','file',\
                 4,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
                [],
            )
            .expect("plant traversal row");
    }

    let error = store
        .resolve_media_path(None, Some("draft-x"), "evil")
        .expect_err("traversal must be rejected");
    assert!(
        error.to_lowercase().contains("traversal")
            || error.to_lowercase().contains("relative_path"),
        "expected traversal error, got: {error}"
    );

    {
        let db = lock_db(&store);
        db.connection
            .execute(
                "UPDATE card_media SET relative_path = '/etc/passwd' WHERE id = 'evil'",
                [],
            )
            .expect("plant absolute row");
    }

    let error = store
        .resolve_media_path(None, Some("draft-x"), "evil")
        .expect_err("absolute path must be rejected");
    assert!(
        error.to_lowercase().contains("absolute"),
        "expected absolute error, got: {error}"
    );
}

#[test]
fn promote_referenced_moves_only_referenced_media() {
    let (_directory, _database, store) = setup();
    {
        let db = lock_db(&store);
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let a = stage_id(&store, "draft-1", PNG_BYTES, "image/png");
    let b = stage_id(&store, "draft-1", JPEG_BYTES, "image/jpeg");
    let c = stage_id(&store, "draft-1", WEBP_BYTES, "image/webp");

    let promoted = store
        .promote_referenced("card-1", "draft-1", &[a.clone(), c.clone()])
        .expect("promote referenced");

    assert_eq!(promoted.len(), 2);
    let promoted_ids: Vec<&str> = promoted.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(promoted_ids, vec![a.as_str(), c.as_str()]);

    let mut a_old_path = PathBuf::new();
    for media in &promoted {
        assert_eq!(media.card_id.as_deref(), Some("card-1"));
        assert!(
            media.draft_id.is_none(),
            "draft_id must be cleared on promote"
        );
        assert!(
            media.relative_path.starts_with("card-1/"),
            "committed path must be under card-1/, got {}",
            media.relative_path
        );
        let file = media_root_of(&store).join(&media.relative_path);
        assert!(file.is_file(), "committed file must exist: {file:?}");
        if media.id == a {
            // remember original staged path so we can confirm it was vacated
            a_old_path = media_root_of(&store).join(format!("staging/draft-1/{}.png", a));
        }
    }

    // Unreferenced staged media stays in staging, still owned by the draft.
    {
        let db = lock_db(&store);
        let b_path = relative_path(&db, &b);
        assert!(b_path.starts_with("staging/draft-1/"));
        assert!(
            media_root_of(&store).join(&b_path).is_file(),
            "unreferenced staged file must still exist"
        );
    }
    // The old staging file for promoted media is gone.
    assert!(
        !a_old_path.exists(),
        "old staging file for promoted media must be removed"
    );
}

#[test]
fn discard_draft_removes_only_its_staged_media() {
    let (_directory, _database, store) = setup();

    let draft1_a = store
        .stage_from_bytes("draft-1", PNG_BYTES, "image/png", "clipboard", None)
        .expect("stage draft-1 a");
    let draft1_b = store
        .stage_from_bytes("draft-1", JPEG_BYTES, "image/jpeg", "clipboard", None)
        .expect("stage draft-1 b");
    let draft2 = store
        .stage_from_bytes("draft-2", GIF_BYTES, "image/gif", "clipboard", None)
        .expect("stage draft-2");

    store.discard_draft("draft-1").expect("discard draft-1");

    {
        let db = lock_db(&store);
        assert!(!row_exists(&db, &draft1_a.id));
        assert!(!row_exists(&db, &draft1_b.id));
        assert!(row_exists(&db, &draft2.id));
    }
    assert!(
        !media_root_of(&store).join(&draft1_a.relative_path).exists(),
        "draft-1 file must be removed"
    );
    assert!(
        media_root_of(&store).join(&draft2.relative_path).is_file(),
        "draft-2 file must remain"
    );
    assert!(
        !media_root_of(&store)
            .join(STAGING_DIR_NAME)
            .join("draft-1")
            .exists(),
        "draft-1 staging directory must be removed when emptied"
    );
}

#[test]
fn cleanup_staging_older_than_removes_only_old_staging() {
    let (_directory, _database, store) = setup();
    {
        let db = lock_db(&store);
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let old = store
        .stage_from_bytes("draft-old", PNG_BYTES, "image/png", "clipboard", None)
        .expect("stage old");
    let recent = store
        .stage_from_bytes("draft-recent", JPEG_BYTES, "image/jpeg", "clipboard", None)
        .expect("stage recent");

    // Age the "old" row's created_at back to 2020 (must happen without holding
    // the lock across another store call to avoid deadlocking).
    {
        let db = lock_db(&store);
        db.connection
            .execute(
                "UPDATE card_media SET created_at='2020-01-01T00:00:00.000Z',\
                 updated_at='2020-01-01T00:00:00.000Z' WHERE id=?1",
                params![old.id],
            )
            .expect("age old row");
    }

    // Promote a committed row and age it too, to prove committed media is never
    // purged regardless of age.
    let committed = store
        .promote_referenced(
            "card-1",
            "draft-promote",
            &[stage_id(&store, "draft-promote", GIF_BYTES, "image/gif")],
        )
        .expect("promote")
        .into_iter()
        .next()
        .expect("promoted row");
    {
        let db = lock_db(&store);
        db.connection
            .execute(
                "UPDATE card_media SET created_at='2020-01-01T00:00:00.000Z',\
                 updated_at='2020-01-01T00:00:00.000Z' WHERE id=?1",
                params![committed.id],
            )
            .expect("age committed row");
    }

    let removed = store
        .cleanup_staging_older_than(Duration::from_secs(60 * 60 * 24))
        .expect("cleanup");
    assert!(
        removed >= 1,
        "at least one old staged row removed, got {removed}"
    );

    let db = lock_db(&store);
    assert!(!row_exists(&db, &old.id), "old staged removed");
    assert!(row_exists(&db, &recent.id), "recent staged kept");
    assert!(
        row_exists(&db, &committed.id),
        "committed never purged by age"
    );
}

#[test]
fn remove_unreferenced_media_deletes_no_longer_referenced() {
    let (_directory, _database, store) = setup();
    {
        let db = lock_db(&store);
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let promoted = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[
                stage_id(&store, "draft-1", PNG_BYTES, "image/png"),
                stage_id(&store, "draft-1", JPEG_BYTES, "image/jpeg"),
                stage_id(&store, "draft-1", WEBP_BYTES, "image/webp"),
            ],
        )
        .expect("promote three");
    let committed: Vec<(String, PathBuf)> = promoted
        .iter()
        .map(|m| (m.id.clone(), media_root_of(&store).join(&m.relative_path)))
        .collect();
    let keep_ids: Vec<String> = committed.iter().take(2).map(|(id, _)| id.clone()).collect();
    let drop_id = committed[2].0.clone();
    let drop_file = committed[2].1.clone();

    store
        .remove_unreferenced_media("card-1", &keep_ids)
        .expect("remove unreferenced");

    let db = lock_db(&store);
    for id in &keep_ids {
        assert!(row_exists(&db, id), "referenced media kept");
    }
    assert!(!row_exists(&db, &drop_id), "unreferenced removed");
    drop(db);
    assert!(!drop_file.exists(), "unreferenced file removed");
}

#[test]
fn resolve_returns_path_for_owner_card() {
    let (_directory, _database, store) = setup();
    {
        let db = lock_db(&store);
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let promoted = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[stage_id(&store, "draft-1", PNG_BYTES, "image/png")],
        )
        .expect("promote");
    let media = promoted.first().expect("promoted row");

    let resolved = store
        .resolve_media_path(Some("card-1"), None, &media.id)
        .expect("resolve owned media");
    assert!(resolved.is_file(), "resolved path should point to the file");
    assert!(
        resolved.starts_with(media_root_of(&store)),
        "resolved path must stay inside media root"
    );
}

#[test]
fn resolve_rejects_non_owned_media() {
    let (_directory, _database, store) = setup();
    {
        let db = lock_db(&store);
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let promoted = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[stage_id(&store, "draft-1", PNG_BYTES, "image/png")],
        )
        .expect("promote");
    let media = promoted.first().expect("promoted row");

    let wrong_card = store.resolve_media_path(Some("card-other"), None, &media.id);
    assert!(wrong_card.is_err(), "must reject media not owned by card");

    let staged = store
        .stage_from_bytes("draft-x", GIF_BYTES, "image/gif", "clipboard", None)
        .expect("stage");
    let wrong_draft = store.resolve_media_path(None, Some("draft-y"), &staged.id);
    assert!(
        wrong_draft.is_err(),
        "must reject staged media not owned by the draft"
    );

    let missing = store.resolve_media_path(Some("card-1"), None, "does-not-exist");
    assert!(missing.is_err(), "must reject unknown media id");
}

#[test]
fn trash_retains_card_media_files() {
    let (_directory, database, store) = setup();
    {
        let db = database.lock().unwrap();
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let promoted = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[stage_id(&store, "draft-1", PNG_BYTES, "image/png")],
        )
        .expect("promote");
    let media = promoted.first().expect("promoted row");
    let file = media_root_of(&store).join(&media.relative_path);
    assert!(file.is_file());

    database
        .lock()
        .unwrap()
        .trash_cards(&["card-1".to_string()])
        .expect("trash card");

    // Existing semantics: trashing only sets deleted_at; media is retained.
    assert!(file.is_file(), "trashing a card must keep its media files");
    let db = lock_db(&store);
    assert!(row_exists(&db, &media.id), "rows must remain");
}

#[test]
fn permanent_delete_removes_card_media_files_and_rows() {
    let (_directory, database, store) = setup();
    {
        let db = database.lock().unwrap();
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
    }

    let promoted = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[stage_id(&store, "draft-1", PNG_BYTES, "image/png")],
        )
        .expect("promote");
    let media = promoted.first().expect("promoted row");
    let file = media_root_of(&store).join(&media.relative_path);

    database
        .lock()
        .unwrap()
        .trash_cards(&["card-1".to_string()])
        .expect("trash card");

    // The command layer (Task 6) calls this helper alongside the permanent
    // delete. ON DELETE CASCADE on card_media.card_id removes the rows once the
    // card row is deleted; the helper removes the files.
    store
        .delete_card_media_files("card-1")
        .expect("delete media files");
    database
        .lock()
        .unwrap()
        .delete_cards_permanently(&["card-1".to_string()])
        .expect("permanent delete");

    assert!(!file.exists(), "file must be removed on permanent delete");
    let db = lock_db(&store);
    assert!(
        !row_exists(&db, &media.id),
        "row must be removed (via CASCADE) on permanent delete"
    );
}

#[test]
fn empty_trash_removes_card_media_files_and_rows() {
    let (_directory, database, store) = setup();
    {
        let db = database.lock().unwrap();
        insert_deck(&db, "deck-1");
        insert_card(&db, "card-1", "deck-1");
        insert_card(&db, "card-2", "deck-1");
    }

    let p1 = store
        .promote_referenced(
            "card-1",
            "draft-1",
            &[stage_id(&store, "draft-1", PNG_BYTES, "image/png")],
        )
        .expect("promote card-1");
    let p2 = store
        .promote_referenced(
            "card-2",
            "draft-2",
            &[stage_id(&store, "draft-2", JPEG_BYTES, "image/jpeg")],
        )
        .expect("promote card-2");
    let file1 = media_root_of(&store).join(&p1[0].relative_path);
    let file2 = media_root_of(&store).join(&p2[0].relative_path);

    {
        let mut db = database.lock().unwrap();
        db.trash_cards(&["card-1".to_string(), "card-2".to_string()])
            .expect("trash both");
    }

    store.delete_card_media_files("card-1").expect("delete c1");
    store.delete_card_media_files("card-2").expect("delete c2");
    database.lock().unwrap().empty_trash().expect("empty trash");

    assert!(!file1.exists() && !file2.exists(), "files must be removed");
    let db = lock_db(&store);
    assert!(
        !row_exists(&db, &p1[0].id) && !row_exists(&db, &p2[0].id),
        "rows must be removed via CASCADE"
    );
}

#[test]
fn delete_card_media_files_rejects_path_components_in_card_id() {
    let (_directory, _database, store) = setup();

    let err = store
        .delete_card_media_files("../escape")
        .expect_err("traversal card id rejected");
    assert!(
        err.to_lowercase().contains("card_id"),
        "expected card_id validation error, got: {err}"
    );
    // Idempotent for a missing card directory.
    store
        .delete_card_media_files("never-existed")
        .expect("missing directory is a no-op");
}
