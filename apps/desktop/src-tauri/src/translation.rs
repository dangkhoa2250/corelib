use crate::ai::{self, AiModel, TranslationResult};
use reqwest::blocking::{Client, Response};
use serde_json::{json, Value};
use std::time::Duration;

const GOOGLE_TRANSLATION_URL: &str = "https://translation.googleapis.com/language/translate/v2";

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("network_failed: Could not create translation client: {error}"))
}

fn google_error(status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| body.chars().take(240).collect());
    match status.as_u16() {
        400 => format!("unsupported_language_pair: {detail}"),
        401 | 403 => "authentication_failed: Google Cloud Translation API key is invalid or unauthorized.".to_owned(),
        429 => "quota_exceeded: Google Cloud Translation quota or rate limit was reached.".to_owned(),
        code => format!("network_failed: Google Cloud Translation request failed ({code}): {detail}"),
    }
}

fn ensure_google_success(response: Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("network_failed: Could not read Google response: {error}"))?;
    if !status.is_success() {
        return Err(google_error(status, &body));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("malformed_response: Google returned invalid JSON: {error}"))
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn parse_google_translation(value: &Value) -> Result<TranslationResult, String> {
    let translation = value
        .get("data")
        .and_then(|data| data.get("translations"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("translatedText"))
        .and_then(Value::as_str)
        .map(decode_html_entities)
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "malformed_response: Google returned no translated text.".to_owned())?;
    Ok(TranslationResult { translation })
}

fn target_language_code(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "arabic" | "ar" => Some("ar"),
        "chinese" | "chinese (simplified)" | "zh" | "zh-cn" => Some("zh"),
        "chinese (traditional)" | "zh-tw" => Some("zh-TW"),
        "dutch" | "nl" => Some("nl"),
        "english" | "en" | "en-us" | "en-gb" => Some("en"),
        "french" | "fr" => Some("fr"),
        "german" | "de" => Some("de"),
        "hindi" | "hi" => Some("hi"),
        "indonesian" | "id" => Some("id"),
        "italian" | "it" => Some("it"),
        "japanese" | "ja" => Some("ja"),
        "korean" | "ko" => Some("ko"),
        "polish" | "pl" => Some("pl"),
        "portuguese" | "pt" | "pt-br" => Some("pt"),
        "russian" | "ru" => Some("ru"),
        "spanish" | "es" => Some("es"),
        "thai" | "th" => Some("th"),
        "turkish" | "tr" => Some("tr"),
        "ukrainian" | "uk" => Some("uk"),
        "vietnamese" | "vi" | "vi-vn" => Some("vi"),
        _ => None,
    }
}

fn percent_decode_component(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("engine_unavailable: Invalid encoded AI model ID.".to_owned());
            }
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| "engine_unavailable: Invalid encoded AI model ID.".to_owned())?;
            decoded.push(
                u8::from_str_radix(hex, 16)
                    .map_err(|_| "engine_unavailable: Invalid encoded AI model ID.".to_owned())?,
            );
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .map_err(|_| "engine_unavailable: AI model ID is not valid UTF-8.".to_owned())
}

fn parse_ai_engine_id(value: &str) -> Result<(String, String), String> {
    let rest = value
        .strip_prefix("ai:")
        .ok_or_else(|| "engine_unavailable: Invalid AI engine ID.".to_owned())?;
    let (provider, encoded_model) = rest
        .split_once(':')
        .ok_or_else(|| "engine_unavailable: Invalid AI engine ID.".to_owned())?;
    if !matches!(
        provider,
        "google-ai-studio" | "nvidia" | "openrouter" | "cerebras" | "opencode-go"
    ) {
        return Err("engine_unavailable: Unknown AI provider.".to_owned());
    }
    let model = percent_decode_component(encoded_model)?;
    if model.trim().is_empty() {
        return Err("engine_unavailable: AI model ID is empty.".to_owned());
    }
    Ok((provider.to_owned(), model))
}

pub fn validate_google_translation_key() -> Result<(), String> {
    let api_key = ai::load_api_key("google-translation")?;
    ensure_google_success(
        client()?
            .get(format!("{GOOGLE_TRANSLATION_URL}/languages"))
            .query(&[("key", api_key.as_str()), ("target", "en")])
            .send()
            .map_err(|error| format!("network_failed: Could not reach Google Cloud Translation: {error}"))?,
    )?;
    Ok(())
}

pub fn list_google_translation_models() -> Result<Vec<AiModel>, String> {
    validate_google_translation_key()?;
    Ok(vec![AiModel {
        id: "nmt".to_owned(),
        name: "Google Cloud Translation — NMT".to_owned(),
    }])
}

fn translate_with_google(text: &str, target_language: &str) -> Result<TranslationResult, String> {
    let target = target_language_code(target_language)
        .ok_or_else(|| format!("unsupported_language_pair: Unsupported target language: {target_language}"))?;
    let api_key = ai::load_api_key("google-translation")?;
    let value = ensure_google_success(
        client()?
            .post(GOOGLE_TRANSLATION_URL)
            .query(&[("key", api_key.as_str())])
            .json(&json!({ "q": text, "target": target, "format": "text" }))
            .send()
            .map_err(|error| format!("network_failed: Could not reach Google Cloud Translation: {error}"))?,
    )?;
    parse_google_translation(&value)
}

#[cfg(target_os = "macos")]
pub mod apple {
    use super::{target_language_code, TranslationResult};
    use std::collections::HashMap;
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use std::time::Duration;

    type AppleResult = Result<TranslationResult, String>;
    type PendingRequests = Mutex<HashMap<u64, mpsc::Sender<AppleResult>>>;

    static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
    static PENDING_REQUESTS: OnceLock<PendingRequests> = OnceLock::new();

    extern "C" {
        fn library_apple_translation_available() -> bool;
        fn library_apple_translate(
            request_id: u64,
            source: *const c_char,
            target: *const c_char,
            source_language: *const c_char,
            callback: extern "C" fn(u64, *const c_char, *const c_char),
        );
    }

    fn pending_requests() -> &'static PendingRequests {
        PENDING_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    extern "C" fn handle_translation(
        request_id: u64,
        translation: *const c_char,
        error: *const c_char,
    ) {
        let result = std::panic::catch_unwind(|| {
            if !error.is_null() {
                let message = unsafe { CStr::from_ptr(error) }.to_string_lossy().into_owned();
                return Err(message);
            }
            if translation.is_null() {
                return Err("engine_unavailable: Apple Translation returned no result.".to_owned());
            }
            let translation = unsafe { CStr::from_ptr(translation) }
                .to_string_lossy()
                .trim()
                .to_owned();
            if translation.is_empty() {
                return Err("malformed_response: Apple Translation returned empty text.".to_owned());
            }
            Ok(TranslationResult { translation })
        })
        .unwrap_or_else(|_| Err("engine_unavailable: Apple Translation callback failed.".to_owned()));

        if let Ok(mut pending) = pending_requests().lock() {
            if let Some(sender) = pending.remove(&request_id) {
                let _ = sender.send(result);
            }
        }
    }

    pub fn available() -> bool {
        unsafe { library_apple_translation_available() }
    }

    pub fn translate(
        text: &str,
        target_language: &str,
        source_language: Option<&str>,
    ) -> AppleResult {
        let target = target_language_code(target_language)
            .ok_or_else(|| format!("unsupported_language_pair: Unsupported target language: {target_language}"))?;
        let source_code = source_language.and_then(target_language_code);
        let source = CString::new(text)
            .map_err(|_| "malformed_response: Text contains an unsupported null character.".to_owned())?;
        let target = CString::new(target).expect("static language codes never contain null bytes");
        let source_c = source_code.and_then(|code| CString::new(code).ok());
        let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::channel();
        pending_requests()
            .lock()
            .map_err(|_| "engine_unavailable: Apple Translation request registry is unavailable.".to_owned())?
            .insert(request_id, sender);

        unsafe {
            library_apple_translate(
                request_id,
                source.as_ptr(),
                target.as_ptr(),
                source_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                handle_translation,
            );
        }

        match receiver.recv_timeout(Duration::from_secs(90)) {
            Ok(result) => result,
            Err(_) => {
                if let Ok(mut pending) = pending_requests().lock() {
                    pending.remove(&request_id);
                }
                Err("engine_unavailable: Apple Translation timed out.".to_owned())
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub mod apple {
    use super::TranslationResult;

    pub fn available() -> bool {
        false
    }

    pub fn translate(_text: &str, _target_language: &str, _source_language: Option<&str>) -> Result<TranslationResult, String> {
        Err("engine_unavailable: Apple Translation is only available on macOS.".to_owned())
    }
}

pub fn translate(
    engine_id: &str,
    text: &str,
    target_language: &str,
    source_language: Option<&str>,
) -> Result<TranslationResult, String> {
    if text.trim().is_empty() {
        return Err("malformed_response: Text to translate cannot be empty.".to_owned());
    }
    match engine_id {
        "apple-translation" => apple::translate(text, target_language, source_language),
        "google-translation" => translate_with_google(text, target_language),
        value if value.starts_with("ai:") => {
            let (provider, model) = parse_ai_engine_id(value)?;
            ai::translate_text(&provider, &model, text, target_language)
        }
        _ => Err("engine_unavailable: Unknown translation engine.".to_owned()),
    }
}

#[tauri::command]
pub async fn translate_text(
    engine_id: String,
    text: String,
    target_language: String,
    source_language: Option<String>,
) -> Result<TranslationResult, String> {
    tauri::async_runtime::spawn_blocking(move || translate(&engine_id, &text, &target_language, source_language.as_deref()))
        .await
        .map_err(|error| format!("engine_unavailable: Translation task failed: {error}"))?
}

#[tauri::command]
pub fn apple_translation_available() -> bool {
    apple::available()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_google_translation_response() {
        let result = parse_google_translation(&json!({
            "data": { "translations": [{ "translatedText": "Xin &amp; chào" }] }
        }))
        .unwrap();
        assert_eq!(result.translation, "Xin & chào");
    }

    #[test]
    fn maps_target_language_names_and_tags_to_codes() {
        assert_eq!(target_language_code("Vietnamese"), Some("vi"));
        assert_eq!(target_language_code("vi-VN"), Some("vi"));
        assert_eq!(target_language_code("Japanese"), Some("ja"));
        assert_eq!(target_language_code(""), None);
    }

    #[test]
    fn parses_encoded_ai_engine_ids() {
        let parsed = parse_ai_engine_id("ai:openrouter:vendor%2Fmodel%3Afree").unwrap();
        assert_eq!(parsed, ("openrouter".to_owned(), "vendor/model:free".to_owned()));
    }

    #[test]
    fn parses_opencode_go_engine_ids() {
        assert_eq!(
            parse_ai_engine_id("ai:opencode-go:deepseek-v4-flash").unwrap(),
            ("opencode-go".to_owned(), "deepseek-v4-flash".to_owned())
        );
    }

    #[test]
    fn rejects_unknown_engine_ids() {
        assert!(parse_ai_engine_id("google-translation").is_err());
        assert!(parse_ai_engine_id("ai:unknown:model").is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn links_apple_translation_on_supported_macos() {
        assert!(apple::available());
    }
}
