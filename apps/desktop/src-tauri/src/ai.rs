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
        "opencode-go" => Ok("https://opencode.ai/zen/go/v1"),
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
    models.sort_by_key(|model| model.name.to_lowercase());
    Ok(models)
}

/// Providers that honour the OpenAI `response_format: json_object` switch.
/// Others receive a plain-text instruction instead, because sending an
/// unsupported field makes the whole request fail.
fn supports_json_object_response(provider: &str) -> bool {
    matches!(provider, "nvidia" | "openrouter" | "cerebras")
}

const TRANSLATION_SYSTEM_PROMPT: &str = "You are a translation engine. Reply with the translated text only. Never add explanations, notes, labels, quotes, markdown, or the original text.";

fn translation_prompt(text: &str, target_language: &str) -> String {
    format!(
        "Translate the following text into {target_language}. Return JSON only in this exact shape: {{\"translation\":\"...\"}}. Preserve the meaning and do not add explanations. Text: {text}"
    )
}

fn plain_translation_prompt(text: &str, target_language: &str) -> String {
    format!("Translate the text below into {target_language}. Reply with the translation only.\n\n{text}")
}

/// Drops `<think>…</think>` reasoning that reasoning models prepend to the answer.
fn strip_reasoning_blocks(value: &str) -> String {
    if !value.contains("<think>") {
        return match value.rfind("</think>") {
            Some(end) => value[end + "</think>".len()..].to_owned(),
            None => value.to_owned(),
        };
    }

    let mut kept = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("<think>") {
        kept.push_str(&rest[..start]);
        let after_open = &rest[start + "<think>".len()..];
        match after_open.find("</think>") {
            Some(end) => rest = &after_open[end + "</think>".len()..],
            // An unterminated block never reaches an answer worth keeping.
            None => return kept,
        }
    }
    kept.push_str(rest);
    kept
}

fn strip_code_fence(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_owned();
    }
    let inner = trimmed.trim_start_matches('`');
    let inner = match inner.find('\n') {
        Some(index) => &inner[index + 1..],
        None => inner,
    };
    let inner = match inner.rfind("```") {
        Some(index) => &inner[..index],
        None => inner,
    };
    inner.trim().to_owned()
}

/// Reads a `{"translation":"…"}` envelope even when it is embedded in prose.
fn json_translation(value: &str) -> Option<String> {
    let start = value.find('{')?;
    let end = value.rfind('}')?;
    if end < start {
        return None;
    }
    let text = serde_json::from_str::<Value>(&value[start..=end])
        .ok()?
        .get("translation")?
        .as_str()?
        .trim()
        .to_owned();
    (!text.is_empty()).then_some(text)
}

/// Recovers the quoted answer from sentences such as
/// `The translation of "Introduction" into Vietnamese is "Giới thiệu".`
fn quoted_translation(value: &str) -> Option<String> {
    const LEAD_INS: [&str; 6] = [" is ", " is: ", " to ", " to: ", ": ", " = "];
    let lowered = value.to_lowercase();
    if !lowered.contains("translat") && !lowered.contains("dịch") {
        return None;
    }
    let closing = value.rfind('"')?;
    let opening = value[..closing].rfind('"')?;
    if !LEAD_INS
        .iter()
        .any(|lead_in| value[..opening].ends_with(lead_in))
    {
        return None;
    }
    let text = value[opening + 1..closing].trim().to_owned();
    (!text.is_empty()).then_some(text)
}

fn starts_with_ignore_ascii_case(value: &str, prefix: &str) -> bool {
    value.len() >= prefix.len()
        && value.is_char_boundary(prefix.len())
        && value[..prefix.len()].eq_ignore_ascii_case(prefix)
}

fn contains_ignore_ascii_case(haystack: &str, needle: &str) -> bool {
    haystack
        .as_bytes()
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

/// Removes a leading `Translation:`-style label, including the polite preamble
/// some models put in front of it. A label further inside the line is only
/// treated as one when the text before it is such a preamble, so a translation
/// that legitimately reads `The answer: 42` survives untouched.
fn strip_label(value: &str) -> &str {
    const LABELS: [&str; 8] = [
        "translation:",
        "translated text:",
        "translated:",
        "output:",
        "answer:",
        "result:",
        "bản dịch:",
        "dịch:",
    ];
    const PREAMBLES: [&str; 5] = ["here is", "here's", "sure", "of course", "certainly"];

    let head_end = value.find('\n').unwrap_or(value.len());
    let mut cut = None;
    for (index, _) in value[..head_end].char_indices() {
        let rest = &value[index..];
        let preamble = &value[..index];
        if !preamble.trim().is_empty()
            && !PREAMBLES
                .iter()
                .any(|opener| contains_ignore_ascii_case(preamble, opener))
        {
            continue;
        }
        for label in LABELS {
            if starts_with_ignore_ascii_case(rest, label)
                && !rest[label.len()..].trim_start().is_empty()
            {
                cut = Some(index + label.len());
            }
        }
    }
    cut.map_or(value, |offset| value[offset..].trim_start())
}

fn drop_meta_lines(value: &str) -> String {
    const META_PREFIXES: [&str; 6] = [
        "note:",
        "notes:",
        "explanation:",
        "context:",
        "lưu ý:",
        "giải thích:",
    ];
    let kept = value
        .lines()
        .take_while(|line| {
            let line = line.trim_start();
            !META_PREFIXES
                .iter()
                .any(|prefix| starts_with_ignore_ascii_case(line, prefix))
        })
        .collect::<Vec<_>>()
        .join("\n");
    let kept = kept.trim();
    if kept.is_empty() {
        value.trim().to_owned()
    } else {
        kept.to_owned()
    }
}

fn unwrap_quotes(value: &str) -> &str {
    const PAIRS: [(char, char); 5] = [
        ('"', '"'),
        ('\'', '\''),
        ('\u{201c}', '\u{201d}'),
        ('\u{2018}', '\u{2019}'),
        ('\u{00ab}', '\u{00bb}'),
    ];
    for (open, close) in PAIRS {
        if let Some(inner) = value
            .strip_prefix(open)
            .and_then(|rest| rest.strip_suffix(close))
        {
            if !inner.contains(open) && !inner.contains(close) {
                return inner.trim();
            }
        }
    }
    value
}

/// A translation the model marked explicitly, so it can be trusted even when it
/// arrives inside reasoning output.
fn explicit_translation(raw: &str) -> Option<String> {
    let cleaned = strip_code_fence(&strip_reasoning_blocks(raw));
    json_translation(&cleaned)
        .or_else(|| quoted_translation(&cleaned))
        .map(|text| unwrap_quotes(text.trim()).to_owned())
}

/// Reduces free-form model output to the translated text alone, so a card's back
/// side never receives the model's commentary.
fn sanitize_translation(raw: &str) -> String {
    if let Some(explicit) = explicit_translation(raw) {
        return explicit;
    }
    let cleaned = strip_code_fence(&strip_reasoning_blocks(raw));
    let without_meta = drop_meta_lines(strip_label(cleaned.trim()));
    unwrap_quotes(without_meta.trim()).to_owned()
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

    let translation = sanitize_translation(raw);
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
    if provider == "google-ai-studio" {
        let value = ensure_success(
            http.post(format!(
                "{}/models/{}:generateContent",
                provider_base_url(provider)?,
                model
            ))
            .query(&[("key", &api_key)])
            .json(&json!({
                "contents": [{"parts": [{"text": translation_prompt(text, target_language)}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
            }))
            .send()
            .map_err(|error| format!("Could not reach Google AI Studio: {error}"))?,
        )?;
        return parse_translation(&value);
    }

    let value = ensure_success(
        http.post(format!("{}/chat/completions", provider_base_url(provider)?))
            .bearer_auth(&api_key)
            .json(&chat_completion_body(provider, model, text, target_language))
            .send()
            .map_err(|error| format!("Could not reach AI provider: {error}"))?,
    )?;

    let message = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"));
    let content = message
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !content.trim().is_empty() {
        return parse_translation(&json!({"translation": content}));
    }

    // Reasoning models sometimes leave `content` empty and answer inside their
    // reasoning trace. Accept that only when the translation is marked
    // explicitly, so raw reasoning never lands on a card.
    message
        .and_then(|message| {
            message
                .get("reasoning_content")
                .or_else(|| message.get("reasoning"))
        })
        .and_then(Value::as_str)
        .and_then(explicit_translation)
        .map(|translation| TranslationResult { translation })
        .ok_or_else(|| "AI provider returned no translation content.".to_owned())
}

fn chat_completion_body(
    provider: &str,
    model: &str,
    text: &str,
    target_language: &str,
) -> Value {
    if supports_json_object_response(provider) {
        return json!({
            "model": model,
            "messages": [{"role": "user", "content": translation_prompt(text, target_language)}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        });
    }
    json!({
        "model": model,
        "messages": [
            {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
            {"role": "user", "content": plain_translation_prompt(text, target_language)}
        ],
        "temperature": 0.1
    })
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

    #[test]
    fn resolves_opencode_go_base_url() {
        assert_eq!(
            provider_base_url("opencode-go").unwrap(),
            "https://opencode.ai/zen/go/v1"
        );
    }

    #[test]
    fn omits_json_response_format_for_opencode_go() {
        let body = chat_completion_body("opencode-go", "deepseek-v4-flash", "Introduction", "Vietnamese");
        assert!(body.get("response_format").is_none());
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], TRANSLATION_SYSTEM_PROMPT);
    }

    #[test]
    fn keeps_json_response_format_for_existing_openai_compatible_providers() {
        for provider in ["nvidia", "openrouter", "cerebras"] {
            let body = chat_completion_body(provider, "model", "Introduction", "Vietnamese");
            assert_eq!(body["response_format"]["type"], "json_object");
            assert_eq!(body["messages"][0]["role"], "user");
        }
    }

    #[test]
    fn returns_only_the_translated_text() {
        for raw in [
            "Giới thiệu",
            "  Giới thiệu  ",
            "\"Giới thiệu\"",
            "“Giới thiệu”",
            "Translation: Giới thiệu",
            "Bản dịch: Giới thiệu",
            "{\"translation\":\"Giới thiệu\"}",
            "```json\n{\"translation\": \"Giới thiệu\"}\n```",
            "```\nGiới thiệu\n```",
            "<think>The user selected a heading, so translate it.</think>Giới thiệu",
            "<think>Reasoning…</think>{\"translation\":\"Giới thiệu\"}",
            "Reasoning without an opening tag…</think>Giới thiệu",
            "The translation of \"Introduction\" into Vietnamese is \"Giới thiệu\".",
            "Sure! Here is the translation: Giới thiệu",
            "Giới thiệu\n\nNote: this is a common section heading.",
        ] {
            assert_eq!(sanitize_translation(raw), "Giới thiệu", "input: {raw}");
        }
    }

    #[test]
    fn keeps_quotes_that_belong_to_the_translation() {
        assert_eq!(
            sanitize_translation("Anh ấy nói \"xin chào\""),
            "Anh ấy nói \"xin chào\""
        );
    }

    #[test]
    fn keeps_a_label_like_word_that_belongs_to_the_translation() {
        assert_eq!(sanitize_translation("The answer: 42"), "The answer: 42");
        assert_eq!(sanitize_translation("Kết quả: 42"), "Kết quả: 42");
    }

    #[test]
    fn discards_unterminated_reasoning_without_an_answer() {
        assert_eq!(sanitize_translation("<think>Still thinking about it"), "");
    }
}
