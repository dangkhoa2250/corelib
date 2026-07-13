use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiModel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TranslationResult {
    pub translation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettingsSummary {
    pub provider: String,
    pub has_api_key: bool,
}

fn provider_base_url(provider: &str) -> Result<&'static str, String> {
    match provider {
        "nvidia" => Ok("https://integrate.api.nvidia.com/v1"),
        "openrouter" => Ok("https://openrouter.ai/api/v1"),
        "cerebras" => Ok("https://api.cerebras.ai/v1"),
        "google-ai-studio" => Ok("https://generativelanguage.googleapis.com/v1beta"),
        "google-translation" => Ok("https://translation.googleapis.com/language/translate/v2"),
        _ => Err(format!("Unsupported AI provider: {provider}")),
    }
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("Could not create AI client: {error}"))
}

fn response_error(status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|json| {
            json.get("error")
                .and_then(|error| error.get("message").or_else(|| error.get("detail")))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| body.chars().take(240).collect());

    if status.as_u16() == 401 || status.as_u16() == 403 {
        return "API key is invalid or not authorized for this provider.".to_owned();
    }
    if status.as_u16() == 429 {
        return "Provider rate limit reached. Please try again later.".to_owned();
    }
    format!("AI provider request failed ({}): {detail}", status.as_u16())
}

fn ensure_success(response: reqwest::blocking::Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Could not read AI provider response: {error}"))?;
    let json = serde_json::from_str::<Value>(&body)
        .map_err(|error| format!("AI provider returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(response_error(status, &body));
    }
    Ok(json)
}

fn keys_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.library.desktop")
        .join("ai-keys.json")
}

fn load_keys() -> HashMap<String, String> {
    let path = keys_path();
    if !path.exists() {
        return HashMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn save_keys(keys: &HashMap<String, String>) -> Result<(), String> {
    let path = keys_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create config dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(keys).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| format!("Cannot write API keys: {e}"))
}

pub fn save_api_key(provider: &str, api_key: &str) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty.".to_owned());
    }
    provider_base_url(provider)?;
    let mut keys = load_keys();
    keys.insert(provider.to_owned(), api_key.trim().to_owned());
    save_keys(&keys)
}

pub fn clear_api_key(provider: &str) -> Result<(), String> {
    provider_base_url(provider)?;
    let mut keys = load_keys();
    keys.remove(provider);
    save_keys(&keys)
}

pub fn has_api_key(provider: &str) -> Result<bool, String> {
    provider_base_url(provider)?;
    let keys = load_keys();
    Ok(keys.get(provider).is_some_and(|v| !v.is_empty()))
}

pub(crate) fn load_api_key(provider: &str) -> Result<String, String> {
    provider_base_url(provider)?;
    let keys = load_keys();
    keys.get(provider)
        .filter(|v| !v.trim().is_empty())
        .cloned()
        .ok_or_else(|| "No API key configured for this provider.".to_owned())
}

fn parse_openai_models(value: &Value) -> Vec<AiModel> {
    value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| {
            let id = model.get("id")?.as_str()?.to_owned();
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&id)
                .to_owned();
            Some(AiModel { id, name })
        })
        .collect()
}

fn parse_google_models(value: &Value) -> Vec<AiModel> {
    value
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|model| {
            model
                .get("supportedGenerationMethods")
                .and_then(Value::as_array)
                .map(|methods| {
                    methods
                        .iter()
                        .any(|method| method.as_str() == Some("generateContent"))
                })
                .unwrap_or(false)
        })
        .filter_map(|model| {
            let full_name = model.get("name")?.as_str()?.to_owned();
            let id = model
                .get("baseModelId")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| full_name.trim_start_matches("models/").to_owned());
            let name = model
                .get("displayName")
                .and_then(Value::as_str)
                .unwrap_or(&id)
                .to_owned();
            Some(AiModel { id, name })
        })
        .collect()
}

pub fn list_models(provider: &str) -> Result<Vec<AiModel>, String> {
    if provider == "google-translation" {
        return crate::translation::list_google_translation_models();
    }
    let api_key = load_api_key(provider)?;
    let http = client()?;
    let value = if provider == "google-ai-studio" {
        ensure_success(
            http.get(format!("{}/models", provider_base_url(provider)?))
                .query(&[("key", &api_key)])
                .send()
                .map_err(|error| format!("Could not reach Google AI Studio: {error}"))?,
        )?
    } else {
        ensure_success(
            http.get(format!("{}/models", provider_base_url(provider)?))
                .bearer_auth(&api_key)
                .send()
                .map_err(|error| format!("Could not reach AI provider: {error}"))?,
        )?
    };

    let mut models = if provider == "google-ai-studio" {
        parse_google_models(&value)
    } else {
        parse_openai_models(&value)
    };
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

fn translation_prompt(text: &str, target_language: &str) -> String {
    format!(
        "Translate the following text into {target_language}. Return JSON only in this exact shape: {{\"translation\":\"...\"}}. Preserve the meaning and do not add explanations. Text: {text}"
    )
}

fn parse_translation(value: &Value) -> Result<TranslationResult, String> {
    let raw = value
        .get("translation")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .get("candidates")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|candidate| candidate.get("content"))
                .and_then(|content| content.get("parts"))
                .and_then(Value::as_array)
                .and_then(|parts| parts.first())
                .and_then(|part| part.get("text"))
                .and_then(Value::as_str)
        })
        .ok_or_else(|| "AI provider returned no translation.".to_owned())?;

    let translation = if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
        parsed
            .get("translation")
            .and_then(Value::as_str)
            .unwrap_or(raw)
            .trim()
            .to_owned()
    } else {
        raw.trim().to_owned()
    };

    if translation.is_empty() {
        return Err("AI provider returned an empty translation.".to_owned());
    }
    Ok(TranslationResult { translation })
}

pub fn translate_text(
    provider: &str,
    model: &str,
    text: &str,
    target_language: &str,
) -> Result<TranslationResult, String> {
    if text.trim().is_empty() {
        return Err("Text to translate cannot be empty.".to_owned());
    }
    if model.trim().is_empty() {
        return Err("Choose a model before translating.".to_owned());
    }

    let api_key = load_api_key(provider)?;
    let http = client()?;
    let prompt = translation_prompt(text, target_language);
    let value = if provider == "google-ai-studio" {
        ensure_success(
            http.post(format!(
                "{}/models/{}:generateContent",
                provider_base_url(provider)?,
                model
            ))
            .query(&[("key", &api_key)])
            .json(&json!({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
            }))
            .send()
            .map_err(|error| format!("Could not reach Google AI Studio: {error}"))?,
        )?
    } else {
        ensure_success(
            http.post(format!("{}/chat/completions", provider_base_url(provider)?))
                .bearer_auth(&api_key)
                .json(&json!({
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }))
                .send()
                .map_err(|error| format!("Could not reach AI provider: {error}"))?,
        )?
    };

    if provider == "google-ai-studio" {
        parse_translation(&value)
    } else {
        let content = value
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(Value::as_str)
            .ok_or_else(|| "AI provider returned no translation content.".to_owned())?;
        parse_translation(&json!({"translation": content}))
    }
}

#[tauri::command]
pub fn save_ai_api_key(provider: String, api_key: String) -> Result<(), String> {
    save_api_key(&provider, &api_key)
}

#[tauri::command]
pub fn clear_ai_api_key(provider: String) -> Result<(), String> {
    clear_api_key(&provider)
}

#[tauri::command]
pub fn has_ai_api_key(provider: String) -> Result<bool, String> {
    has_api_key(&provider)
}

#[tauri::command]
pub fn list_ai_models(provider: String) -> Result<Vec<AiModel>, String> {
    list_models(&provider)
}

#[tauri::command]
pub fn translate_with_ai(
    provider: String,
    model: String,
    text: String,
    target_language: String,
) -> Result<TranslationResult, String> {
    translate_text(&provider, &model, &text, &target_language)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_google_models_to_generate_content() {
        let models = parse_google_models(&json!({
            "models": [
                {"name":"models/gemini-flash","baseModelId":"gemini-flash","displayName":"Gemini Flash","supportedGenerationMethods":["generateContent"]},
                {"name":"models/text-embed","baseModelId":"text-embed","supportedGenerationMethods":["embedContent"]}
            ]
        }));
        assert_eq!(
            models,
            vec![AiModel {
                id: "gemini-flash".into(),
                name: "Gemini Flash".into()
            }]
        );
    }

    #[test]
    fn parses_openai_compatible_models() {
        let models = parse_openai_models(
            &json!({"data":[{"id":"model-a"},{"id":"model-b","name":"Model B"}]}),
        );
        assert_eq!(models[0].name, "model-a");
        assert_eq!(models[1].name, "Model B");
    }

    #[test]
    fn parses_json_translation_from_google_candidate() {
        let result = parse_translation(&json!({"candidates":[{"content":{"parts":[{"text":"{\"translation\":\"Xin chào\"}"}]}}]})).unwrap();
        assert_eq!(result.translation, "Xin chào");
    }
}
