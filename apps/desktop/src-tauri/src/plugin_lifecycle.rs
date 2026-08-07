use std::{
    collections::BTreeMap,
    fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const STATE_FILE_NAME: &str = "plugin-lifecycle-state.json";
const STATE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleNavigationState {
    pub pinned_surface_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleAccountState {
    pub revision: u64,
    pub known_plugin_ids: Vec<String>,
    pub enabled_plugin_ids: Vec<String>,
    pub navigation: PluginLifecycleNavigationState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleStateFile {
    pub schema_version: u32,
    pub accounts: BTreeMap<String, PluginLifecycleAccountState>,
}

impl Default for PluginLifecycleStateFile {
    fn default() -> Self {
        Self {
            schema_version: STATE_SCHEMA_VERSION,
            accounts: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleStateNotice {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleStateLoadResult {
    pub state: PluginLifecycleStateFile,
    pub notices: Vec<PluginLifecycleStateNotice>,
}

pub struct PluginLifecycleStateStore {
    path: PathBuf,
}

impl PluginLifecycleStateStore {
    pub fn new(app_data_directory: impl AsRef<Path>) -> Self {
        Self {
            path: app_data_directory.as_ref().join(STATE_FILE_NAME),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> Result<PluginLifecycleStateLoadResult, String> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Ok(PluginLifecycleStateLoadResult {
                    state: PluginLifecycleStateFile::default(),
                    notices: Vec::new(),
                });
            }
            Err(error) => return Err(error.to_string()),
        };
        let state = match serde_json::from_slice::<PluginLifecycleStateFile>(&bytes) {
            Ok(state) if state.schema_version == STATE_SCHEMA_VERSION => state,
            Ok(state) => {
                return self.recover_corrupt(format!(
                    "unsupported schema version {}",
                    state.schema_version
                ));
            }
            Err(error) => return self.recover_corrupt(error.to_string()),
        };
        Ok(PluginLifecycleStateLoadResult {
            state,
            notices: Vec::new(),
        })
    }

    fn recover_corrupt(&self, reason: String) -> Result<PluginLifecycleStateLoadResult, String> {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let quarantined_file_name = format!("{STATE_FILE_NAME}.corrupt-{timestamp}");
        let quarantined_path = self.path.with_file_name(&quarantined_file_name);
        fs::rename(&self.path, &quarantined_path).map_err(|error| {
            format!("failed to quarantine corrupt plugin lifecycle state: {error}")
        })?;
        Ok(PluginLifecycleStateLoadResult {
            state: PluginLifecycleStateFile::default(),
            notices: vec![PluginLifecycleStateNotice {
                code: "corrupt_state_recovered".to_string(),
                message: format!(
                    "Recovered plugin lifecycle defaults after quarantining {quarantined_file_name}: {reason}"
                ),
            }],
        })
    }

    pub fn save(&self, state: &PluginLifecycleStateFile) -> Result<(), String> {
        if state.schema_version != STATE_SCHEMA_VERSION {
            return Err(format!(
                "unsupported plugin lifecycle state schema version: {}",
                state.schema_version
            ));
        }
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "plugin lifecycle state path has no parent".to_string())?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
        let temporary_path = parent.join(format!(
            ".{STATE_FILE_NAME}.tmp-{}",
            Uuid::new_v4().simple()
        ));

        let write_result = (|| -> Result<(), std::io::Error> {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)?;
            file.write_all(&bytes)?;
            file.write_all(b"\n")?;
            file.sync_all()?;
            fs::rename(&temporary_path, &self.path)?;
            Ok(())
        })();

        if let Err(error) = write_result {
            let _ = fs::remove_file(&temporary_path);
            return Err(error.to_string());
        }
        Ok(())
    }
}

#[tauri::command]
pub fn load_plugin_lifecycle_state(
    store: tauri::State<'_, PluginLifecycleStateStore>,
) -> Result<PluginLifecycleStateLoadResult, String> {
    store.load()
}

#[tauri::command]
pub fn save_plugin_lifecycle_state(
    value: PluginLifecycleStateFile,
    store: tauri::State<'_, PluginLifecycleStateStore>,
) -> Result<(), String> {
    store.save(&value)
}
