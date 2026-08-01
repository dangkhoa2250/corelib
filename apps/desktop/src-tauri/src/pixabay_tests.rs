#[cfg(test)]
mod tests {
    use crate::model::PixabayImage;
    use crate::pixabay::{
        check_pixabay_key_with, delete_pixabay_key_with, save_pixabay_key_with,
        search_pixabay_images_with, KeychainPixabayKeyStore, MemoryPixabayKeyStore,
        PixabayHttpClient, PixabayHttpResponse, PixabayKeyStore, PIXABAY_KEYCHAIN_SERVICE,
    };
    use serde_json::{json, Value};
    use std::sync::Mutex;

    struct FakePixabayHttp {
        responses: Mutex<Vec<Result<PixabayHttpResponse, String>>>,
        requests: Mutex<Vec<String>>,
    }

    impl FakePixabayHttp {
        fn new(responses: Vec<Result<PixabayHttpResponse, String>>) -> Self {
            Self {
                responses: Mutex::new(responses),
                requests: Mutex::new(Vec::new()),
            }
        }

        fn only_request(&self) -> String {
            self.requests.lock().unwrap()[0].clone()
        }
    }

    impl PixabayHttpClient for FakePixabayHttp {
        fn get(&self, url: &str) -> Result<PixabayHttpResponse, String> {
            self.requests.lock().unwrap().push(url.to_string());
            let mut responses = self.responses.lock().unwrap();
            match responses.len() {
                0 => Err("no mock response configured".to_string()),
                _ => responses.remove(0),
            }
        }
    }

    fn ok_response(hits: Vec<Value>) -> String {
        serde_json::to_string(&json!({
            "total": hits.len() * 10,
            "totalHits": hits.len(),
            "hits": hits,
        }))
        .unwrap()
    }

    fn hit_json(id: i64) -> Value {
        json!({
            "id": id,
            "pageURL": format!("https://pixabay.com/photos/page-{id}/"),
            "type": "photo",
            "tags": "cat, animal",
            "previewURL": format!("https://cdn.pixabay.com/photo/{id}/preview.jpg"),
            "previewWidth": 150,
            "previewHeight": 100,
            "webformatURL": format!("https://cdn.pixabay.com/photo/{id}/full.jpg"),
            "webformatWidth": 640,
            "webformatHeight": 480,
            "imageWidth": 1280,
            "imageHeight": 960,
            "user": format!("user{id}"),
            "user_id": id * 10,
        })
    }

    // ---- Keychain wiring ----

    #[test]
    fn keychain_store_uses_the_pixabay_service_constant_and_api_key_username() {
        let store = KeychainPixabayKeyStore::new();
        assert_eq!(store.service(), PIXABAY_KEYCHAIN_SERVICE);
        assert_eq!(store.service(), "com.library.desktop.pixabay");
        assert_eq!(store.username(), "api_key");
    }

    // ---- Memory store lifecycle ----

    #[test]
    fn memory_store_round_trips_and_clears_a_key() {
        let store = MemoryPixabayKeyStore::new();
        assert_eq!(store.load().unwrap(), None);
        store.save("secret-key").unwrap();
        assert_eq!(store.load().unwrap(), Some("secret-key".to_string()));
        store.clear().unwrap();
        assert_eq!(store.load().unwrap(), None);
    }

    #[test]
    fn memory_store_overwrites_the_previous_key() {
        let store = MemoryPixabayKeyStore::new();
        store.save("first").unwrap();
        store.save("second").unwrap();
        assert_eq!(store.load().unwrap(), Some("second".to_string()));
    }

    // ---- save/check/delete with helpers ----

    #[test]
    fn save_then_check_returns_true_then_delete_then_check_false() {
        let store = MemoryPixabayKeyStore::new();

        assert!(!check_pixabay_key_with(&store).unwrap());

        save_pixabay_key_with(&store, "secret-key".to_string()).unwrap();
        assert!(check_pixabay_key_with(&store).unwrap());

        delete_pixabay_key_with(&store).unwrap();
        assert!(!check_pixabay_key_with(&store).unwrap());
    }

    #[test]
    fn save_rejects_an_empty_key() {
        let store = MemoryPixabayKeyStore::new();
        let err = save_pixabay_key_with(&store, "   ".to_string()).unwrap_err();
        assert!(err.contains("Pixabay API key"), "unexpected error: {err}");
        assert_eq!(store.load().unwrap(), None);
    }

    #[test]
    fn delete_is_idempotent_when_no_key_exists() {
        let store = MemoryPixabayKeyStore::new();
        delete_pixabay_key_with(&store).unwrap();
        assert!(!check_pixabay_key_with(&store).unwrap());
    }

    // ---- search: request construction ----

    #[test]
    fn search_builds_url_with_key_safesearch_page_and_per_page() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: ok_response(vec![hit_json(1)]),
        })]);

        search_pixabay_images_with(&store, &http, "cats and dogs", 2).unwrap();

        let url = http.only_request();
        assert!(url.contains("key=secret-key"), "url missing key: {url}");
        assert!(
            url.contains("safesearch=true"),
            "url missing safesearch: {url}"
        );
        assert!(url.contains("per_page=12"), "url missing per_page: {url}");
        assert!(url.contains("page=2"), "url missing page: {url}");
        assert!(url.contains("q=cats"), "url missing query: {url}");
    }

    // ---- search: result count + clamping ----

    #[test]
    fn search_returns_at_most_twelve_results() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let hits: Vec<Value> = (1..=15).map(hit_json).collect();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: ok_response(hits),
        })]);

        let results = search_pixabay_images_with(&store, &http, "cats", 1).unwrap();
        assert_eq!(results.len(), 12);
        assert_eq!(results[0].id, 1);
        assert_eq!(results[11].id, 12);
        assert!(results.iter().all(|r| (1..=12).contains(&r.id)));
    }

    #[test]
    fn search_returns_fewer_than_twelve_when_api_has_less() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let hits: Vec<Value> = (1..=3).map(hit_json).collect();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: ok_response(hits),
        })]);

        let results = search_pixabay_images_with(&store, &http, "rare", 1).unwrap();
        assert_eq!(results.len(), 3);
    }

    // ---- search: field mapping ----

    #[test]
    fn search_maps_every_approved_field() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: ok_response(vec![hit_json(7)]),
        })]);

        let image = &search_pixabay_images_with(&store, &http, "cats", 1).unwrap()[0];
        assert_eq!(image.id, 7);
        assert_eq!(image.page_url, "https://pixabay.com/photos/page-7/");
        assert_eq!(
            image.preview_url,
            "https://cdn.pixabay.com/photo/7/preview.jpg"
        );
        assert_eq!(image.image_url, "https://cdn.pixabay.com/photo/7/full.jpg");
        assert_eq!(image.preview_width, 150);
        assert_eq!(image.preview_height, 100);
        assert_eq!(image.width, 1280);
        assert_eq!(image.height, 960);
        assert_eq!(image.tags, "cat, animal");
        assert_eq!(image.user, "user7");
        assert_eq!(image.user_id, 70);
        assert_eq!(image.media_type, "photo");
    }

    #[test]
    fn pixabay_image_serializes_with_camel_case_keys() {
        let image = PixabayImage {
            id: 7,
            page_url: "https://pixabay.com/photos/page-7/".into(),
            preview_url: "https://cdn.pixabay.com/photo/7/preview.jpg".into(),
            image_url: "https://cdn.pixabay.com/photo/7/full.jpg".into(),
            preview_width: 150,
            preview_height: 100,
            width: 1280,
            height: 960,
            tags: "cat, animal".into(),
            user: "user7".into(),
            user_id: 70,
            media_type: "photo".into(),
        };

        let value = serde_json::to_value(&image).unwrap();
        assert_eq!(value["id"], 7);
        assert_eq!(value["pageUrl"], "https://pixabay.com/photos/page-7/");
        assert_eq!(
            value["previewUrl"],
            "https://cdn.pixabay.com/photo/7/preview.jpg"
        );
        assert_eq!(
            value["imageUrl"],
            "https://cdn.pixabay.com/photo/7/full.jpg"
        );
        assert_eq!(value["previewWidth"], 150);
        assert_eq!(value["previewHeight"], 100);
        assert_eq!(value["width"], 1280);
        assert_eq!(value["height"], 960);
        assert_eq!(value["tags"], "cat, animal");
        assert_eq!(value["user"], "user7");
        assert_eq!(value["userId"], 70);
        assert_eq!(value["mediaType"], "photo");
        assert!(value.get("page_url").is_none());
        assert!(value.get("preview_url").is_none());
        assert!(value.get("image_url").is_none());
        assert!(value.get("user_id").is_none());
        assert!(value.get("media_type").is_none());
    }

    // ---- search: error mapping ----

    #[test]
    fn search_returns_setup_message_when_key_is_missing() {
        let store = MemoryPixabayKeyStore::new();
        let http = FakePixabayHttp::new(vec![]);

        let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
        assert!(err.contains("Settings"), "unexpected error: {err}");
        assert!(err.contains("Pixabay API key"), "unexpected error: {err}");
        assert!(http.requests.lock().unwrap().is_empty());
    }

    #[test]
    fn search_maps_invalid_key_responses_to_rejected_message() {
        for status in [401, 403] {
            let store = MemoryPixabayKeyStore::new();
            store.save("secret-key").unwrap();
            let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
                status,
                body: r#"{"error":"Invalid API key"}"#.to_string(),
            })]);

            let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
            assert!(
                err.contains("rejected") || err.contains("API key"),
                "status {status} -> unexpected error: {err}"
            );
        }
    }

    #[test]
    fn search_maps_rate_limit_response_to_rate_limit_message() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 429,
            body: r#"{"error":"Rate limit"}"#.to_string(),
        })]);

        let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
        assert!(err.contains("rate"), "unexpected error: {err}");
    }

    #[test]
    fn search_maps_network_failure_to_generic_message() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Err("connection reset".to_string())]);

        let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
        assert!(
            err.contains("Pixabay search failed"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn search_maps_generic_http_failure_to_generic_message() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 500,
            body: r#"{"error":"boom"}"#.to_string(),
        })]);

        let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
        assert!(
            err.contains("Pixabay search failed"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn search_maps_unparseable_body_to_parse_message() {
        let store = MemoryPixabayKeyStore::new();
        store.save("secret-key").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: "<html>not json</html>".to_string(),
        })]);

        let err = search_pixabay_images_with(&store, &http, "cats", 1).unwrap_err();
        assert!(
            err.contains("unexpected response"),
            "unexpected error: {err}"
        );
    }

    // ---- search: key never leaks ----

    #[test]
    fn search_results_never_contain_the_api_key() {
        let store = MemoryPixabayKeyStore::new();
        store.save("top-secret-key-value").unwrap();
        let http = FakePixabayHttp::new(vec![Ok(PixabayHttpResponse {
            status: 200,
            body: ok_response(vec![hit_json(1), hit_json(2)]),
        })]);

        let results = search_pixabay_images_with(&store, &http, "cats", 1).unwrap();
        let payload = serde_json::to_string(&results).unwrap();
        assert!(
            !payload.contains("top-secret-key-value"),
            "api key leaked into results: {payload}"
        );
    }
}
