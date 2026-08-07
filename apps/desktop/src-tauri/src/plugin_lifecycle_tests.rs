use tempfile::tempdir;

use crate::plugin_lifecycle::{
    PluginLifecycleAccountState, PluginLifecycleNavigationState, PluginLifecycleStateFile,
    PluginLifecycleStateStore,
};

fn account(revision: u64, plugin_id: &str, surface_id: &str) -> PluginLifecycleAccountState {
    PluginLifecycleAccountState {
        revision,
        known_plugin_ids: vec![plugin_id.to_string()],
        enabled_plugin_ids: vec![plugin_id.to_string()],
        navigation: PluginLifecycleNavigationState {
            pinned_surface_ids: vec![surface_id.to_string()],
        },
    }
}

#[test]
fn missing_state_file_loads_as_empty_versioned_state() {
    let directory = tempdir().expect("create temporary directory");
    let store = PluginLifecycleStateStore::new(directory.path());

    let result = store.load().expect("load missing state file");

    assert_eq!(result.state.schema_version, 1);
    assert!(result.state.accounts.is_empty());
    assert!(result.notices.is_empty());
    assert!(!store.path().exists());
}

#[test]
fn saves_and_reloads_independent_account_records() {
    let directory = tempdir().expect("create temporary directory");
    let store = PluginLifecycleStateStore::new(directory.path());
    let mut state = PluginLifecycleStateFile::default();
    state.accounts.insert(
        "account-a".to_string(),
        account(1, "corelib.library", "route.library"),
    );
    state.accounts.insert(
        "account-b".to_string(),
        account(7, "corelib.memora", "route.memora"),
    );

    store.save(&state).expect("save lifecycle state");
    let loaded = store.load().expect("reload lifecycle state");

    assert_eq!(loaded.state, state);
    assert_eq!(loaded.state.accounts["account-a"].revision, 1);
    assert_eq!(loaded.state.accounts["account-b"].revision, 7);
    let json = std::fs::read_to_string(store.path()).expect("read saved JSON");
    assert!(json.contains("\"schemaVersion\""));
    assert!(json.contains("\"pinnedSurfaceIds\""));
}

#[test]
fn atomically_replaces_an_existing_state_file_without_temp_residue() {
    let directory = tempdir().expect("create temporary directory");
    let store = PluginLifecycleStateStore::new(directory.path());
    let mut first = PluginLifecycleStateFile::default();
    first.accounts.insert(
        "account-a".to_string(),
        account(1, "corelib.library", "route.library"),
    );
    store.save(&first).expect("save initial state");

    let mut replacement = first.clone();
    replacement.accounts.get_mut("account-a").unwrap().revision = 2;
    store.save(&replacement).expect("replace state atomically");

    assert_eq!(store.load().unwrap().state, replacement);
    let entries = std::fs::read_dir(directory.path())
        .expect("list state directory")
        .map(|entry| entry.unwrap().file_name())
        .collect::<Vec<_>>();
    assert_eq!(entries, vec![store.path().file_name().unwrap()]);
}

#[test]
fn quarantines_malformed_json_and_returns_a_recovery_notice() {
    let directory = tempdir().expect("create temporary directory");
    let store = PluginLifecycleStateStore::new(directory.path());
    std::fs::write(store.path(), b"{not valid json").expect("write corrupt state");

    let result = store.load().expect("recover corrupt state");

    assert_eq!(result.state, PluginLifecycleStateFile::default());
    assert_eq!(result.notices.len(), 1);
    assert_eq!(result.notices[0].code, "corrupt_state_recovered");
    assert!(!store.path().exists());
    let quarantined = std::fs::read_dir(directory.path())
        .expect("list quarantine")
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("plugin-lifecycle-state.json.corrupt-")
        })
        .expect("quarantined state file");
    assert_eq!(
        std::fs::read_to_string(quarantined).unwrap(),
        "{not valid json"
    );
}

#[test]
fn failed_save_preserves_the_previous_state_file() {
    let directory = tempdir().expect("create temporary directory");
    let store = PluginLifecycleStateStore::new(directory.path());
    let mut valid = PluginLifecycleStateFile::default();
    valid.accounts.insert(
        "account-a".to_string(),
        account(4, "corelib.library", "route.library"),
    );
    store.save(&valid).expect("save valid state");
    let previous_bytes = std::fs::read(store.path()).expect("read valid state");

    let mut unsupported = valid.clone();
    unsupported.schema_version = 2;
    assert!(store.save(&unsupported).is_err());

    assert_eq!(std::fs::read(store.path()).unwrap(), previous_bytes);
    assert_eq!(store.load().unwrap().state, valid);
}
