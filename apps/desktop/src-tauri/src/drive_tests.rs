use crate::drive_api::new_drive_record;
use crate::drive_auth::{DriveTokenStore, MemoryTokenStore};

#[test]
fn a_drive_document_is_not_a_local_managed_file() {
    let record = new_drive_record("drive-file-1", "Probabilistic AI.pdf");
    assert_eq!(record.source, "google_drive");
    assert_eq!(record.managed_path, None);
    assert_eq!(record.status, "download_required");
}

#[test]
fn test_memory_token_store() {
    let store = MemoryTokenStore::new();
    assert_eq!(store.load().unwrap(), None);
    store.save("my-refresh-token").unwrap();
    assert_eq!(store.load().unwrap(), Some("my-refresh-token".to_owned()));
    store.clear().unwrap();
    assert_eq!(store.load().unwrap(), None);
}

#[test]
fn cache_clear_removes_download_not_library_record() {
    let cache = crate::drive_cache::Cache::for_test().unwrap();
    cache.put("drive-file-1", b"%PDF").unwrap();
    cache.clear().unwrap();
    assert!(!cache.path_for("drive-file-1").exists());
}

#[test]
fn drive_entries_use_each_file_actual_parent() {
    let body = serde_json::json!({
        "files": [
            {"id": "nested-folder", "name": "Nested", "mimeType": "application/vnd.google-apps.folder", "parents": ["actual-parent"]},
            {"id": "nested-pdf", "name": "Nested.pdf", "mimeType": "application/pdf", "parents": ["actual-parent"]}
        ]
    });

    let entries = crate::drive_api::parse_drive_entries(&body, Some("requested-folder"))
        .expect("parse Drive entries");
    assert_eq!(entries[0].parent_id.as_deref(), Some("actual-parent"));
    assert_eq!(entries[1].parent_id.as_deref(), Some("actual-parent"));
}
