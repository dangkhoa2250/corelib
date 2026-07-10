use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

pub struct Cache {
    root: PathBuf,
}

impl Cache {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let root = app_data_dir.join("drive-cache");
        let _ = fs::create_dir_all(&root);
        Self { root }
    }

    #[cfg(test)]
    pub fn for_test() -> Result<Self, String> {
        let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
        let root = temp.keep().join("drive-cache");
        let _ = fs::create_dir_all(&root);
        Ok(Self { root })
    }

    pub fn path_for(&self, file_id: &str) -> PathBuf {
        let mut hasher = Sha256::new();
        hasher.update(file_id.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        self.root.join(format!("{}.pdf", hash))
    }

    pub fn put(&self, file_id: &str, bytes: &[u8]) -> Result<PathBuf, String> {
        let target = self.path_for(file_id);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let temp_path = target.with_extension("tmp");
        fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;
        fs::rename(&temp_path, &target).map_err(|e| e.to_string())?;
        Ok(target)
    }

    pub fn clear(&self) -> Result<(), String> {
        if self.root.exists() {
            for entry in fs::read_dir(&self.root).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    fs::remove_file(path).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    }
}
