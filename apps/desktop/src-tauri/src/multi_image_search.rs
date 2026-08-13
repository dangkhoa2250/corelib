use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageSearchResult {
    pub id: String,
    pub source: String,
    pub title: String,
    pub preview_url: String,
    pub image_url: String,
    pub source_url: String,
    pub attribution: String,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderWarning {
    pub provider: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MultiImageSearchPage {
    pub results: Vec<ImageSearchResult>,
    pub warnings: Vec<ProviderWarning>,
}

pub trait HttpClient: Send + Sync {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<String, String>;
}

pub struct ReqwestHttpClient {
    client: Client,
}

impl ReqwestHttpClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("build reqwest client");
        Self { client }
    }
}

impl Default for ReqwestHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpClient for ReqwestHttpClient {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<String, String> {
        let mut req = self.client.get(url);
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        let res = req.send().map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP error {}", res.status()));
        }
        res.text().map_err(|e| e.to_string())
    }
}

const DEFAULT_USER_AGENT: &str = "Corelib Desktop image search/0.1";

// --- Wikimedia Commons ---

pub fn fetch_wikimedia(
    http: &dyn HttpClient,
    query: &str,
    page: u32,
    per_source: u32,
) -> Result<Vec<ImageSearchResult>, String> {
    let offset = page.saturating_sub(1).saturating_mul(per_source);
    let url = format!(
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={}&gsrnamespace=6&gsrlimit={}&gsroffset={}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=300&format=json",
        urlencode(query),
        per_source,
        offset
    );

    let mut results = Vec::new();
    let body = http.get(&url, &[("User-Agent", DEFAULT_USER_AGENT)])?;
    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|error| format!("invalid response: {error}"))?;

    if let Some(pages) = parsed["query"]["pages"].as_object() {
        for (page_id, page_val) in pages.iter().take(per_source as usize) {
            if let Some(imageinfo) = page_val["imageinfo"].as_array().and_then(|a| a.first()) {
                let preview_url = imageinfo["thumburl"]
                    .as_str()
                    .or_else(|| imageinfo["url"].as_str())
                    .unwrap_or("")
                    .to_string();
                let image_url = imageinfo["url"].as_str().unwrap_or("").to_string();
                if preview_url.is_empty() || image_url.is_empty() {
                    continue;
                }

                let width = imageinfo["thumbwidth"]
                    .as_u64()
                    .or_else(|| imageinfo["width"].as_u64())
                    .unwrap_or(300) as u32;
                let height = imageinfo["thumbheight"]
                    .as_u64()
                    .or_else(|| imageinfo["height"].as_u64())
                    .unwrap_or(200) as u32;

                let raw_title = page_val["title"]
                    .as_str()
                    .unwrap_or("Wikimedia Image")
                    .replace("File:", "");
                let artist = imageinfo["extmetadata"]["Artist"]["value"]
                    .as_str()
                    .unwrap_or("");
                let clean_artist = strip_html(artist);
                let attribution = if clean_artist.trim().is_empty() {
                    "Wikimedia Commons".to_string()
                } else {
                    format!("Photo by {} on Wikimedia", clean_artist.trim())
                };
                let source_url = page_val["canonicalurl"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| {
                        format!(
                            "https://commons.wikimedia.org/wiki/{}",
                            urlencode(page_val["title"].as_str().unwrap_or("Wikimedia Image"))
                        )
                    });
                let license = imageinfo["extmetadata"]["LicenseShortName"]["value"]
                    .as_str()
                    .map(strip_html)
                    .filter(|value| !value.trim().is_empty());
                let license_url = imageinfo["extmetadata"]["LicenseUrl"]["value"]
                    .as_str()
                    .map(strip_html)
                    .filter(|value| !value.trim().is_empty());

                results.push(ImageSearchResult {
                    id: format!("wiki-{}", page_id),
                    source: "wikimedia".to_string(),
                    title: raw_title,
                    preview_url,
                    image_url,
                    source_url,
                    attribution,
                    license,
                    license_url,
                    width,
                    height,
                });
            }
        }
    }
    Ok(results)
}

// --- Openverse ---

pub fn fetch_openverse(
    http: &dyn HttpClient,
    query: &str,
    page: u32,
    per_source: u32,
) -> Result<Vec<ImageSearchResult>, String> {
    let url = format!(
        "https://api.openverse.org/v1/images/?q={}&page={}&page_size={}",
        urlencode(query),
        page.max(1),
        per_source
    );

    let mut results = Vec::new();
    let body = http.get(&url, &[("User-Agent", DEFAULT_USER_AGENT)])?;
    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|error| format!("invalid response: {error}"))?;

    if let Some(items) = parsed["results"].as_array() {
        for item in items.iter().take(per_source as usize) {
            let id = item["id"].as_str().unwrap_or("").to_string();
            let preview_url = item["thumbnail"]
                .as_str()
                .or_else(|| item["url"].as_str())
                .unwrap_or("")
                .to_string();
            let image_url = item["url"].as_str().unwrap_or("").to_string();
            if id.is_empty() || preview_url.is_empty() || image_url.is_empty() {
                continue;
            }

            let title = item["title"]
                .as_str()
                .unwrap_or("Openverse Image")
                .to_string();
            let creator = item["creator"].as_str().unwrap_or("");
            let attribution = if creator.trim().is_empty() {
                "Openverse".to_string()
            } else {
                format!("Photo by {} on Openverse", creator.trim())
            };

            let width = item["width"].as_u64().unwrap_or(300) as u32;
            let height = item["height"].as_u64().unwrap_or(200) as u32;
            let license = item["license"]
                .as_str()
                .map(str::to_string)
                .and_then(|name| {
                    item["license_version"]
                        .as_str()
                        .map(|version| format!("{name} {version}"))
                        .or(Some(name))
                });

            results.push(ImageSearchResult {
                id: format!("openverse-{}", id),
                source: "openverse".to_string(),
                title,
                preview_url,
                image_url,
                source_url: item["foreign_landing_url"]
                    .as_str()
                    .or_else(|| item["detail_url"].as_str())
                    .unwrap_or("")
                    .to_string(),
                attribution,
                license,
                license_url: item["license_url"].as_str().map(str::to_string),
                width,
                height,
            });
        }
    }
    Ok(results)
}

// --- DuckDuckGo Image Search ---

pub fn fetch_duckduckgo(
    http: &dyn HttpClient,
    query: &str,
    page: u32,
    per_source: u32,
) -> Result<Vec<ImageSearchResult>, String> {
    let mut results = Vec::new();

    // Step 1: get vqd token
    let token_url = format!(
        "https://duckduckgo.com/?q={}&iax=images&ia=images",
        urlencode(query)
    );
    let token_body = http.get(&token_url, &[("User-Agent", DEFAULT_USER_AGENT)])?;

    let vqd = match extract_vqd(&token_body) {
        Some(v) => v,
        None => return Err("response did not contain a vqd token".to_string()),
    };

    // Step 2: query images endpoint
    let offset = page.saturating_sub(1).saturating_mul(per_source);
    let search_url = format!(
        "https://duckduckgo.com/i.js?q={}&o=json&vqd={}&p=1&s={}",
        urlencode(query),
        urlencode(&vqd),
        offset
    );

    let headers = [
        ("User-Agent", DEFAULT_USER_AGENT),
        ("Referer", "https://duckduckgo.com/"),
    ];

    let body = http.get(&search_url, &headers)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|error| format!("invalid response: {error}"))?;

    if let Some(items) = parsed["results"].as_array() {
        for (idx, item) in items.iter().take(per_source as usize).enumerate() {
            let image_url = item["image"].as_str().unwrap_or("").to_string();
            let preview_url = item["thumbnail"]
                .as_str()
                .or_else(|| item["image"].as_str())
                .unwrap_or("")
                .to_string();
            if image_url.is_empty() || preview_url.is_empty() {
                continue;
            }

            let title = item["title"].as_str().unwrap_or("Web Image").to_string();
            let width = item["width"].as_u64().unwrap_or(300) as u32;
            let height = item["height"].as_u64().unwrap_or(200) as u32;

            results.push(ImageSearchResult {
                id: format!("ddg-{}-{}", page, idx),
                source: "duckduckgo".to_string(),
                title,
                preview_url,
                image_url,
                source_url: item["url"].as_str().unwrap_or("").to_string(),
                attribution: "DuckDuckGo Image Search".to_string(),
                license: None,
                license_url: None,
                width,
                height,
            });
        }
    }

    Ok(results)
}

fn extract_vqd(body: &str) -> Option<String> {
    if let Some(start) = body.find("vqd=\"") {
        let rest = &body[start + 5..];
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }
    if let Some(start) = body.find("vqd='") {
        let rest = &body[start + 5..];
        if let Some(end) = rest.find('\'') {
            return Some(rest[..end].to_string());
        }
    }
    if let Some(start) = body.find("vqd=") {
        let rest = &body[start + 4..];
        let end = rest
            .find(|c: char| !c.is_alphanumeric() && c != '-')
            .unwrap_or(rest.len());
        if end > 0 {
            return Some(rest[..end].to_string());
        }
    }
    None
}

fn urlencode(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

fn strip_html(input: &str) -> String {
    let mut result = String::new();
    let mut inside = false;
    for c in input.chars() {
        if c == '<' {
            inside = true;
        } else if c == '>' {
            inside = false;
        } else if !inside {
            result.push(c);
        }
    }
    result
}

pub fn search_multi_source_images_with(
    http: &dyn HttpClient,
    query: &str,
    page: u32,
    per_source: u32,
) -> Result<MultiImageSearchPage, String> {
    let query_trimmed = query.trim();
    if query_trimmed.is_empty() {
        return Ok(MultiImageSearchPage {
            results: Vec::new(),
            warnings: Vec::new(),
        });
    }

    let per_source = per_source.clamp(1, 5);
    let page = page.max(1);

    let (wiki_result, ddg_result, openverse_result) = std::thread::scope(|scope| {
        let wiki = scope.spawn(|| fetch_wikimedia(http, query_trimmed, page, per_source));
        let ddg = scope.spawn(|| fetch_duckduckgo(http, query_trimmed, page, per_source));
        let openverse = scope.spawn(|| fetch_openverse(http, query_trimmed, page, per_source));
        let wiki = wiki
            .join()
            .map_err(|_| "wikimedia provider task panicked".to_string())?;
        let ddg = ddg
            .join()
            .map_err(|_| "duckduckgo provider task panicked".to_string())?;
        let openverse = openverse
            .join()
            .map_err(|_| "openverse provider task panicked".to_string())?;
        Ok::<_, String>((wiki, ddg, openverse))
    })?;
    let providers = [
        ("wikimedia", wiki_result),
        ("duckduckgo", ddg_result),
        ("openverse", openverse_result),
    ];
    let mut warnings = Vec::new();
    let mut provider_results = Vec::new();
    for (provider, result) in providers {
        match result {
            Ok(results) => provider_results.push(results),
            Err(message) => warnings.push(ProviderWarning {
                provider: provider.to_string(),
                message,
            }),
        }
    }

    if provider_results.is_empty() {
        let message = warnings
            .iter()
            .map(|warning| format!("{}: {}", warning.provider, warning.message))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("all image providers failed: {message}"));
    }

    let mut combined = Vec::new();
    let max_len = provider_results.iter().map(Vec::len).max().unwrap_or(0);

    for i in 0..max_len {
        for results in &provider_results {
            if let Some(result) = results.get(i) {
                combined.push(result.clone());
            }
        }
    }

    Ok(MultiImageSearchPage {
        results: combined,
        warnings,
    })
}

#[tauri::command]
pub async fn search_multi_source_images(
    query: String,
    page: u32,
) -> Result<MultiImageSearchPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let http = ReqwestHttpClient::new();
        search_multi_source_images_with(&http, &query, page, 5)
    })
    .await
    .map_err(|error| format!("image search task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex};

    struct DummyHttpClient {
        wiki: Mutex<Option<Result<String, String>>>,
        ddg_token: Mutex<Option<Result<String, String>>>,
        ddg_search: Mutex<Option<Result<String, String>>>,
        openverse: Mutex<Option<Result<String, String>>>,
        urls: Arc<Mutex<Vec<String>>>,
    }

    impl DummyHttpClient {
        fn all(
            wiki: Result<String, String>,
            ddg_token: Result<String, String>,
            ddg_search: Result<String, String>,
            openverse: Result<String, String>,
        ) -> Self {
            Self::all_with_urls(
                wiki,
                ddg_token,
                ddg_search,
                openverse,
                Arc::new(Mutex::new(vec![])),
            )
        }

        fn all_with_urls(
            wiki: Result<String, String>,
            ddg_token: Result<String, String>,
            ddg_search: Result<String, String>,
            openverse: Result<String, String>,
            urls: Arc<Mutex<Vec<String>>>,
        ) -> Self {
            Self {
                wiki: Mutex::new(Some(wiki)),
                ddg_token: Mutex::new(Some(ddg_token)),
                ddg_search: Mutex::new(Some(ddg_search)),
                openverse: Mutex::new(Some(openverse)),
                urls,
            }
        }

        fn wiki(response: Result<String, String>) -> Self {
            Self::all(
                response,
                Ok("{}".to_string()),
                Ok("{}".to_string()),
                Ok("{}".to_string()),
            )
        }

        fn openverse(response: Result<String, String>) -> Self {
            Self::all(
                Ok("{}".to_string()),
                Ok("{}".to_string()),
                Ok("{}".to_string()),
                response,
            )
        }

        fn ddg(token: Result<String, String>, search: Result<String, String>) -> Self {
            Self::all(Ok("{}".to_string()), token, search, Ok("{}".to_string()))
        }
    }

    impl HttpClient for DummyHttpClient {
        fn get(&self, url: &str, _headers: &[(&str, &str)]) -> Result<String, String> {
            self.urls.lock().unwrap().push(url.to_string());
            let response = if url.contains("commons.wikimedia.org") {
                self.wiki.lock().unwrap().take()
            } else if url.contains("duckduckgo.com/?") {
                self.ddg_token.lock().unwrap().take()
            } else if url.contains("duckduckgo.com/i.js") {
                self.ddg_search.lock().unwrap().take()
            } else {
                self.openverse.lock().unwrap().take()
            };
            response.unwrap_or_else(|| Ok("{}".to_string()))
        }
    }

    fn json(body: &str) -> Result<String, String> {
        Ok(body.to_string())
    }

    fn wiki_results(count: usize) -> String {
        let pages = (0..count)
            .map(|index| {
                format!(
                    "\"{}\":{{\"title\":\"File:Wiki {index}\",\"canonicalurl\":\"https://commons.wikimedia.org/wiki/File:Wiki_{index}\",\"imageinfo\":[{{\"url\":\"https://example.test/wiki-{index}.jpg\",\"thumburl\":\"https://example.test/wiki-{index}-thumb.jpg\",\"width\":640,\"height\":480,\"extmetadata\":{{\"LicenseShortName\":{{\"value\":\"CC BY 4.0\"}},\"LicenseUrl\":{{\"value\":\"https://creativecommons.org/licenses/by/4.0/\"}}}}}}]}}",
                    index + 1
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!("{{\"query\":{{\"pages\":{{{pages}}}}}}}")
    }

    fn openverse_results(count: usize) -> String {
        let results = (0..count)
            .map(|index| {
                format!(
                    "{{\"id\":\"open-{index}\",\"title\":\"Open {index}\",\"url\":\"https://example.test/open-{index}.jpg\",\"thumbnail\":\"https://example.test/open-{index}-thumb.jpg\",\"foreign_landing_url\":\"https://example.test/open-{index}\",\"license\":\"cc-by\",\"license_version\":\"4.0\",\"license_url\":\"https://creativecommons.org/licenses/by/4.0/\"}}"
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!("{{\"results\":[{results}]}}")
    }

    fn ddg_results(count: usize) -> String {
        let results = (0..count)
            .map(|index| {
                format!(
                    "{{\"image\":\"https://example.test/ddg-{index}.jpg\",\"thumbnail\":\"https://example.test/ddg-{index}-thumb.jpg\",\"title\":\"DDG {index}\"}}"
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!("{{\"results\":[{results}]}}")
    }

    #[test]
    fn extracts_vqd_token() {
        assert_eq!(
            extract_vqd("some html vqd=\"3-123456789\" and more"),
            Some("3-123456789".to_string())
        );
        assert_eq!(
            extract_vqd("some html vqd='3-987654321' and more"),
            Some("3-987654321".to_string())
        );
    }

    #[test]
    fn strips_html_tags() {
        assert_eq!(strip_html("<a href=\"foo\">John Doe</a>"), "John Doe");
    }

    #[test]
    fn returns_empty_for_blank_query() {
        let http = DummyHttpClient::all(
            Ok("{}".to_string()),
            Ok("{}".to_string()),
            Ok("{}".to_string()),
            Ok("{}".to_string()),
        );
        let page = search_multi_source_images_with(&http, "   ", 1, 5).unwrap();
        assert!(page.results.is_empty());
        assert!(page.warnings.is_empty());
        assert!(http.urls.lock().unwrap().is_empty());
    }

    #[test]
    fn requests_five_results_and_uses_page_two_offsets() {
        let urls = Arc::new(Mutex::new(vec![]));
        let http = DummyHttpClient::all_with_urls(
            json(&wiki_results(5)),
            json("<html>vqd=token</html>"),
            json(&ddg_results(5)),
            json(&openverse_results(5)),
            Arc::clone(&urls),
        );

        let page = search_multi_source_images_with(&http, "red fox", 2, 99).unwrap();
        assert_eq!(page.results.len(), 15);
        let requested = urls.lock().unwrap().join("\n");
        assert!(requested.contains("gsrlimit=5"));
        assert!(requested.contains("gsroffset=5"));
        assert!(requested.contains("page=2"));
        assert!(requested.contains("s=5"));
        assert!(requested.contains("page_size=5"));
    }

    #[test]
    fn preserves_provider_landing_and_license_metadata() {
        let wiki_http = DummyHttpClient::wiki(json(&wiki_results(1)));
        let openverse_http = DummyHttpClient::openverse(json(&openverse_results(1)));
        let ddg_http = DummyHttpClient::ddg(json("<html>vqd=token</html>"), json(&ddg_results(1)));

        let wiki = fetch_wikimedia(&wiki_http, "trees", 1, 5)
            .unwrap()
            .remove(0);
        let openverse = fetch_openverse(&openverse_http, "trees", 1, 5)
            .unwrap()
            .remove(0);
        let ddg = fetch_duckduckgo(&ddg_http, "trees", 1, 5)
            .unwrap()
            .remove(0);

        assert_eq!(
            wiki.source_url,
            "https://commons.wikimedia.org/wiki/File:Wiki_0"
        );
        assert_eq!(wiki.license.as_deref(), Some("CC BY 4.0"));
        assert_eq!(
            wiki.license_url.as_deref(),
            Some("https://creativecommons.org/licenses/by/4.0/")
        );
        assert_eq!(openverse.source_url, "https://example.test/open-0");
        assert_eq!(openverse.license.as_deref(), Some("cc-by 4.0"));
        assert_eq!(
            openverse.license_url.as_deref(),
            Some("https://creativecommons.org/licenses/by/4.0/")
        );
        assert!(ddg.source_url.is_empty());
        assert!(ddg.license.is_none());
        assert!(ddg.license_url.is_none());
    }

    #[test]
    fn extreme_page_offset_does_not_overflow() {
        let http = DummyHttpClient::wiki(json(&wiki_results(0)));

        fetch_wikimedia(&http, "trees", u32::MAX, 5).unwrap();
        assert!(http.urls.lock().unwrap()[0].contains("gsroffset=4294967295"));
    }

    struct ConcurrentHttpClient {
        first_requests: Barrier,
        active: AtomicUsize,
        max_active: AtomicUsize,
    }

    impl HttpClient for ConcurrentHttpClient {
        fn get(&self, url: &str, _headers: &[(&str, &str)]) -> Result<String, String> {
            let is_provider_start = url.contains("commons.wikimedia.org")
                || url.contains("api.openverse.org")
                || url == "https://duckduckgo.com/?q=trees&iax=images&ia=images";
            if is_provider_start {
                let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
                self.max_active.fetch_max(active, Ordering::SeqCst);
                self.first_requests.wait();
                std::thread::sleep(std::time::Duration::from_millis(10));
                self.active.fetch_sub(1, Ordering::SeqCst);
            }
            if url.contains("commons.wikimedia.org") {
                Ok(wiki_results(1))
            } else if url.contains("api.openverse.org") {
                Ok(openverse_results(1))
            } else if url.contains("duckduckgo.com/?") {
                Ok("<html>vqd=token</html>".to_string())
            } else {
                Ok(ddg_results(1))
            }
        }
    }

    #[test]
    fn runs_top_level_provider_requests_concurrently() {
        let http = ConcurrentHttpClient {
            first_requests: Barrier::new(3),
            active: AtomicUsize::new(0),
            max_active: AtomicUsize::new(0),
        };

        let page = search_multi_source_images_with(&http, "trees", 1, 5).unwrap();
        assert_eq!(page.results.len(), 3);
        assert!(http.max_active.load(Ordering::SeqCst) >= 2);
    }

    #[test]
    fn caps_wikimedia_and_openverse_results_when_upstream_returns_extras() {
        let wiki_http = DummyHttpClient::wiki(json(&wiki_results(7)));
        let openverse_http = DummyHttpClient::openverse(json(&openverse_results(7)));

        assert_eq!(fetch_wikimedia(&wiki_http, "trees", 1, 5).unwrap().len(), 5);
        assert_eq!(
            fetch_openverse(&openverse_http, "trees", 1, 5)
                .unwrap()
                .len(),
            5
        );
    }

    #[test]
    fn interleaves_provider_results_in_source_order() {
        let http = DummyHttpClient::all(
            json(&wiki_results(2)),
            json("<html>vqd=token</html>"),
            json(&ddg_results(2)),
            json(&openverse_results(2)),
        );

        let page = search_multi_source_images_with(&http, "trees", 1, 2).unwrap();
        let sources = page
            .results
            .iter()
            .map(|result| result.source.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            sources,
            [
                "wikimedia",
                "duckduckgo",
                "openverse",
                "wikimedia",
                "duckduckgo",
                "openverse"
            ]
        );
    }

    #[test]
    fn isolates_provider_failure_and_reports_warning() {
        let http = DummyHttpClient::all(
            Err("Wikimedia unavailable".to_string()),
            json("<html>vqd=token</html>"),
            json(&ddg_results(1)),
            json(&openverse_results(1)),
        );

        let page = search_multi_source_images_with(&http, "mountains", 1, 5).unwrap();
        assert_eq!(page.results.len(), 2);
        assert_eq!(page.warnings.len(), 1);
        assert_eq!(page.warnings[0].provider, "wikimedia");
        assert!(page.warnings[0].message.contains("unavailable"));
    }

    #[test]
    fn returns_command_error_when_all_providers_fail() {
        let http = DummyHttpClient::all(
            Err("Wikimedia unavailable".to_string()),
            Err("DuckDuckGo unavailable".to_string()),
            Ok("{}".to_string()),
            Err("Openverse unavailable".to_string()),
        );

        let error = search_multi_source_images_with(&http, "mountains", 1, 5).unwrap_err();
        assert!(error.contains("all image providers failed"));
        assert!(error.contains("Wikimedia unavailable"));
    }
}
