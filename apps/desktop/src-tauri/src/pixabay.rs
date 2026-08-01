use crate::model::PixabayImage;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::time::Duration;

/// Keychain service under which the Pixabay API key is stored.
pub const PIXABAY_KEYCHAIN_SERVICE: &str = "com.library.desktop.pixabay";

pub trait PixabayKeyStore {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, key: &str) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

pub struct KeychainPixabayKeyStore {
    service: String,
    username: String,
}

impl KeychainPixabayKeyStore {
    pub fn new() -> Self {
        Self {
            service: PIXABAY_KEYCHAIN_SERVICE.to_owned(),
            username: "api_key".to_owned(),
        }
    }

    pub fn service(&self) -> &str {
        &self.service
    }

    pub fn username(&self) -> &str {
        &self.username
    }
}

impl Default for KeychainPixabayKeyStore {
    fn default() -> Self {
        Self::new()
    }
}

impl PixabayKeyStore for KeychainPixabayKeyStore {
    fn load(&self) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(&self.service, &self.username).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn save(&self, key: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(&self.service, &self.username).map_err(|e| e.to_string())?;
        entry.set_password(key).map_err(|e| e.to_string())?;
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
pub struct MemoryPixabayKeyStore {
    key: std::sync::Mutex<Option<String>>,
}

#[cfg(test)]
impl MemoryPixabayKeyStore {
    pub fn new() -> Self {
        Self {
            key: std::sync::Mutex::new(None),
        }
    }
}

#[cfg(test)]
impl Default for MemoryPixabayKeyStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl PixabayKeyStore for MemoryPixabayKeyStore {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.key.lock().unwrap().clone())
    }

    fn save(&self, key: &str) -> Result<(), String> {
        *self.key.lock().unwrap() = Some(key.to_owned());
        Ok(())
    }

    fn clear(&self) -> Result<(), String> {
        *self.key.lock().unwrap() = None;
        Ok(())
    }
}

pub(crate) fn save_pixabay_key_with(
    store: &dyn PixabayKeyStore,
    key: String,
) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("Enter a Pixabay API key in Settings \u{203a} Media.".to_owned());
    }
    store
        .save(key.trim())
        .map_err(|e| format!("Could not save Pixabay API key: {e}"))
}

pub(crate) fn check_pixabay_key_with(store: &dyn PixabayKeyStore) -> Result<bool, String> {
    match store.load() {
        Ok(Some(key)) => Ok(!key.trim().is_empty()),
        Ok(None) => Ok(false),
        Err(_) => Ok(false),
    }
}

pub(crate) fn delete_pixabay_key_with(store: &dyn PixabayKeyStore) -> Result<(), String> {
    store
        .clear()
        .map_err(|e| format!("Could not remove Pixabay API key: {e}"))
}

#[derive(Debug, Clone)]
pub struct PixabayHttpResponse {
    pub status: u16,
    pub body: String,
}

pub trait PixabayHttpClient {
    fn get(&self, url: &str) -> Result<PixabayHttpResponse, String>;
}

pub struct ReqwestPixabayHttpClient {
    client: Client,
}

impl ReqwestPixabayHttpClient {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|e| format!("Pixabay search failed. Try again.: {e}"))?;
        Ok(Self { client })
    }
}

impl Default for ReqwestPixabayHttpClient {
    fn default() -> Self {
        Self::new().expect("reqwest client builds")
    }
}

impl PixabayHttpClient for ReqwestPixabayHttpClient {
    fn get(&self, url: &str) -> Result<PixabayHttpResponse, String> {
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|_| "Pixabay search failed. Try again.".to_owned())?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .map_err(|_| "Pixabay search failed. Try again.".to_owned())?;
        Ok(PixabayHttpResponse { status, body })
    }
}

const KEY_MISSING: &str = "Add a Pixabay API key in Settings \u{203a} Media to search for images.";
const INVALID_KEY: &str =
    "Pixabay rejected the API key. Re-add the key in Settings \u{203a} Media.";
const RATE_LIMIT: &str = "Pixabay rate limit reached. Try again later.";
const SEARCH_FAILED: &str = "Pixabay search failed. Try again.";
const PARSE_FAILED: &str = "Pixabay returned an unexpected response. Try again.";
const PIXABAY_ENDPOINT: &str = "https://pixabay.com/api/";
const PAGE_SIZE: usize = 12;

/// Raw Pixabay API hit. Only these twelve approved fields are read from the
/// response; everything else (views, downloads, likes, comments, imageSize,
/// userImageURL, ...) is deliberately ignored to keep the whitelist tight.
#[derive(Debug, Deserialize)]
struct PixabayHitRaw {
    id: i64,
    #[serde(rename = "pageURL")]
    page_url: String,
    #[serde(rename = "type")]
    media_type: String,
    tags: String,
    #[serde(rename = "previewURL")]
    preview_url: String,
    #[serde(rename = "previewWidth")]
    preview_width: u32,
    #[serde(rename = "previewHeight")]
    preview_height: u32,
    #[serde(rename = "webformatURL")]
    webformat_url: String,
    #[serde(rename = "imageWidth")]
    image_width: u32,
    #[serde(rename = "imageHeight")]
    image_height: u32,
    user: String,
    #[serde(rename = "user_id")]
    user_id: i64,
}

impl PixabayHitRaw {
    fn into_image(self) -> PixabayImage {
        PixabayImage {
            id: self.id,
            page_url: self.page_url,
            preview_url: self.preview_url,
            image_url: self.webformat_url,
            preview_width: self.preview_width,
            preview_height: self.preview_height,
            width: self.image_width,
            height: self.image_height,
            tags: self.tags,
            user: self.user,
            user_id: self.user_id,
            media_type: self.media_type,
        }
    }
}

#[derive(Debug, Deserialize)]
struct PixabayResponseRaw {
    #[serde(default)]
    hits: Vec<PixabayHitRaw>,
}

pub(crate) fn search_pixabay_images_with(
    store: &dyn PixabayKeyStore,
    http: &dyn PixabayHttpClient,
    query: &str,
    page: u32,
) -> Result<Vec<PixabayImage>, String> {
    let key = store
        .load()
        .ok()
        .flatten()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| KEY_MISSING.to_owned())?;

    let page = page.max(1);
    let mut url = reqwest::Url::parse(PIXABAY_ENDPOINT).map_err(|_| SEARCH_FAILED.to_owned())?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("key", &key);
        pairs.append_pair("q", query);
        pairs.append_pair("safesearch", "true");
        pairs.append_pair("per_page", &PAGE_SIZE.to_string());
        pairs.append_pair("page", &page.to_string());
    }

    let response = http
        .get(url.as_str())
        .map_err(|_| SEARCH_FAILED.to_owned())?;

    if response.status == 401 || response.status == 403 {
        return Err(INVALID_KEY.to_owned());
    }
    if response.status == 429 {
        return Err(RATE_LIMIT.to_owned());
    }
    if !(200..300).contains(&response.status) {
        return Err(SEARCH_FAILED.to_owned());
    }

    let parsed: PixabayResponseRaw =
        serde_json::from_str(&response.body).map_err(|_| PARSE_FAILED.to_owned())?;

    Ok(parsed
        .hits
        .into_iter()
        .take(PAGE_SIZE)
        .map(PixabayHitRaw::into_image)
        .collect())
}

#[tauri::command]
pub fn save_pixabay_key(key: String) -> Result<(), String> {
    save_pixabay_key_with(&KeychainPixabayKeyStore::new(), key)
}

#[tauri::command]
pub fn check_pixabay_key() -> Result<bool, String> {
    check_pixabay_key_with(&KeychainPixabayKeyStore::new())
}

#[tauri::command]
pub fn delete_pixabay_key() -> Result<(), String> {
    delete_pixabay_key_with(&KeychainPixabayKeyStore::new())
}

#[tauri::command]
pub fn search_pixabay_images(query: String, page: u32) -> Result<Vec<PixabayImage>, String> {
    let http = ReqwestPixabayHttpClient::new()?;
    search_pixabay_images_with(&KeychainPixabayKeyStore::new(), &http, &query, page)
}
