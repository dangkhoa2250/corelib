pub trait DriveTokenStore {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, refresh_token: &str) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

pub struct KeychainTokenStore {
    service: String,
    username: String,
}

impl KeychainTokenStore {
    pub fn new() -> Self {
        Self {
            service: "com.library.desktop.google_drive".to_owned(),
            username: "refresh_token".to_owned(),
        }
    }
}

impl Default for KeychainTokenStore {
    fn default() -> Self {
        Self::new()
    }
}

impl DriveTokenStore for KeychainTokenStore {
    fn load(&self) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(&self.service, &self.username).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn save(&self, refresh_token: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, &self.username).map_err(|e| e.to_string())?;
        entry
            .set_password(refresh_token)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn clear(&self) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, &self.username).map_err(|e| e.to_string())?;
        match entry.delete_password() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
pub struct MemoryTokenStore {
    token: std::sync::Mutex<Option<String>>,
}

#[cfg(test)]
impl MemoryTokenStore {
    pub fn new() -> Self {
        Self {
            token: std::sync::Mutex::new(None),
        }
    }
}

#[cfg(test)]
impl Default for MemoryTokenStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl DriveTokenStore for MemoryTokenStore {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.token.lock().unwrap().clone())
    }

    fn save(&self, refresh_token: &str) -> Result<(), String> {
        *self.token.lock().unwrap() = Some(refresh_token.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<(), String> {
        *self.token.lock().unwrap() = None;
        Ok(())
    }
}
