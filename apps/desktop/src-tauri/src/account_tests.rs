#[cfg(test)]
mod tests {
    use crate::account::{
        AccountApi, AccountError, AccountProfile, AccountRole, AccountStatus, AccountStatusResponse,
        AnalyticsEventInput, DailyStatisticsSnapshot, HttpClient,
        MemorySessionStore, PocketBaseAccountApi, SessionStore,
    };
    use serde_json::json;
    use std::sync::Mutex;

    #[allow(clippy::type_complexity)]
    struct MockHttpClient {
        responses: Mutex<Vec<(u16, serde_json::Value)>>,
        requests: Mutex<Vec<(String, String, serde_json::Value, Option<String>)>>,
    }

    impl MockHttpClient {
        fn new(responses: Vec<(u16, serde_json::Value)>) -> Self {
            Self {
                responses: Mutex::new(responses),
                requests: Mutex::new(Vec::new()),
            }
        }
    }

    impl HttpClient for MockHttpClient {
        fn post(
            &self,
            url: &str,
            body: serde_json::Value,
            token: Option<&str>,
        ) -> Result<(u16, serde_json::Value), String> {
            self.requests.lock().unwrap().push((
                "POST".to_string(),
                url.to_string(),
                body,
                token.map(|s| s.to_string()),
            ));
            let mut resps = self.responses.lock().unwrap();
            if resps.is_empty() {
                return Err("No mock response configured".to_string());
            }
            Ok(resps.remove(0))
        }

        fn get(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
            self.requests.lock().unwrap().push((
                "GET".to_string(),
                url.to_string(),
                serde_json::Value::Null,
                token.map(|s| s.to_string()),
            ));
            let mut resps = self.responses.lock().unwrap();
            if resps.is_empty() {
                return Err("No mock response configured".to_string());
            }
            Ok(resps.remove(0))
        }

        fn delete(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
            self.requests.lock().unwrap().push((
                "DELETE".to_string(),
                url.to_string(),
                serde_json::Value::Null,
                token.map(|s| s.to_string()),
            ));
            let mut resps = self.responses.lock().unwrap();
            if resps.is_empty() {
                return Err("No mock response configured".to_string());
            }
            Ok(resps.remove(0))
        }
    }

    #[test]
    fn maps_pending_sign_in_without_persisting_a_token() {
        let store = MemorySessionStore::new();
        let http = MockHttpClient::new(vec![(
            200,
            json!({
                "status": "pending"
            }),
        )]);

        let api = PocketBaseAccountApi::new_with_deps(
            "http://localhost:8090".to_string(),
            store,
            http,
        );

        let res = api.sign_in("pending@example.test", "password12345", true);
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), AccountStatusResponse::Pending);

        // Assert no token is persisted in the store
        let token = api.store.get_token().unwrap();
        assert!(token.is_none());
    }

    #[test]
    fn converts_an_approved_response_to_the_safe_profile_shape() {
        let store = MemorySessionStore::new();
        let http = MockHttpClient::new(vec![(
            200,
            json!({
                "status": "approved",
                "token": "valid-bearer-token",
                "profile": {
                    "id": "user-123",
                    "displayName": "Approved User",
                    "email": "approved@example.test",
                    "status": "approved",
                    "role": "member",
                    "analyticsEnabled": true
                }
            }),
        )]);

        let api = PocketBaseAccountApi::new_with_deps(
            "http://localhost:8090".to_string(),
            store,
            http,
        );

        let res = api.sign_in("approved@example.test", "password12345", true);
        assert!(res.is_ok());

        let expected_profile = AccountProfile {
            id: "user-123".to_string(),
            display_name: "Approved User".to_string(),
            email: "approved@example.test".to_string(),
            status: AccountStatus::Approved,
            role: AccountRole::Member,
            analytics_enabled: true,
        };

        if let AccountStatusResponse::Approved(snapshot) = res.unwrap() {
            assert_eq!(snapshot.profile, expected_profile);
            // Default entitlements on sign-in before refresh/me
            assert!(snapshot.entitlements.feature_keys.is_empty());
        } else {
            panic!("Expected AccountStatusResponse::Approved");
        }

        // Assert token is persisted in the store
        let token = api.store.get_token().unwrap();
        assert_eq!(token, Some("valid-bearer-token".to_string()));
    }

    #[test]
    fn rejects_analytics_payloads_before_sending_them() {
        let store = MemorySessionStore::new();
        // Give the store an approved token so send_analytics doesn't fail on session check
        store.set_token("token-abc").unwrap();

        let http = MockHttpClient::new(vec![]);
        let api = PocketBaseAccountApi::new_with_deps(
            "http://localhost:8090".to_string(),
            store,
            http,
        );

        // Prohibited key "query"
        let event = AnalyticsEventInput {
            installation_id: "inst-123".to_string(),
            name: "app_opened".to_string(),
            app_version: "1.0.0".to_string(),
            occurred_at: "2026-07-13T21:00:00Z".to_string(),
            payload: json!({ "query": "delete from users" }),
        };

        let res = api.send_analytics(event);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), AccountError::InvalidEvent);

        // Key not in allowlist for "app_opened" (which only allows "source")
        let event_invalid_key = AnalyticsEventInput {
            installation_id: "inst-123".to_string(),
            name: "app_opened".to_string(),
            app_version: "1.0.0".to_string(),
            occurred_at: "2026-07-13T21:00:00Z".to_string(),
            payload: json!({ "featureKey": "editor" }),
        };

        let res = api.send_analytics(event_invalid_key);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), AccountError::InvalidEvent);
    }

    #[test]
    fn upserts_daily_statistics() {
        let store = MemorySessionStore::new();
        store.set_token("token-abc").unwrap();
        let http = MockHttpClient::new(vec![(204, json!(null))]);

        let api = PocketBaseAccountApi::new_with_deps(
            "http://localhost:8090".to_string(),
            store,
            http,
        );

        let input = DailyStatisticsSnapshot {
            schema_version: 1,
            local_day: "2026-07-19".to_string(),
            app_key: "reading".to_string(),
            active_ms: 3600000,
            active_day: true,
            session_count: 3,
            page_visit_count: Some(12),
            unique_page_count: None,
            real_review_count: None,
            again_count: None,
            hard_count: None,
            good_count: None,
            easy_count: None,
            lapse_count: None,
        };

        let res = api.upsert_daily_statistics(input);
        assert!(res.is_ok());

        let reqs = api.http.requests.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].0, "POST");
        assert!(reqs[0].1.contains("/api/corelib/analytics/daily-statistics"));
    }

    #[test]
    fn retrieves_admin_statistics() {
        let store = MemorySessionStore::new();
        store.set_token("token-abc").unwrap();
        let http = MockHttpClient::new(vec![(
            200,
            json!({
                "approvedUsers": 10,
                "analyticsEnabledUsers": 8,
                "optInPercentage": 80.0,
                "contributingUsers": 5,
                "insufficientSample": false,
                "buckets": []
            }),
        )]);

        let api = PocketBaseAccountApi::new_with_deps(
            "http://localhost:8090".to_string(),
            store,
            http,
        );

        let res = api.admin_statistics("7d", "reading");
        assert!(res.is_ok());

        let stats = res.unwrap();
        assert_eq!(stats.approved_users, 10);
        assert_eq!(stats.buckets.len(), 0);

        let reqs = api.http.requests.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].0, "GET");
        assert!(reqs[0].1.contains("/api/corelib/admin/statistics"));
        assert!(reqs[0].1.contains("range=7d"));
        assert!(reqs[0].1.contains("appKey=reading"));
    }
}
