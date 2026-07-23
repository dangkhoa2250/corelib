#[cfg(test)]
mod tests {
    use crate::account::{
        AccountApi, AccountError, AccountProfile, AccountRole, AccountStatus, AccountStatusResponse,
        AnalyticsEventInput, DailyStatisticsSnapshot, HttpClient,
        MemorySessionStore, PocketBaseAccountApi, SessionStore,
    };
    use serde_json::json;
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Duration;

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

    #[allow(clippy::type_complexity)]
    struct SwitchingHttpClient {
        stale_status: u16,
        stale_request_started: mpsc::Sender<()>,
        release_stale_request: Mutex<mpsc::Receiver<()>>,
        requests: Mutex<Vec<(String, String, serde_json::Value, Option<String>)>>,
    }

    impl SwitchingHttpClient {
        fn new(
            stale_status: u16,
        ) -> (Self, mpsc::Receiver<()>, mpsc::Sender<()>) {
            let (started_tx, started_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            (
                Self {
                    stale_status,
                    stale_request_started: started_tx,
                    release_stale_request: Mutex::new(release_rx),
                    requests: Mutex::new(Vec::new()),
                },
                started_rx,
                release_tx,
            )
        }
    }

    impl HttpClient for SwitchingHttpClient {
        fn post(
            &self,
            url: &str,
            body: serde_json::Value,
            token: Option<&str>,
        ) -> Result<(u16, serde_json::Value), String> {
            self.requests.lock().unwrap().push((
                "POST".to_string(),
                url.to_string(),
                body.clone(),
                token.map(str::to_string),
            ));

            if url.ends_with("/api/corelib/sign-in") {
                let account_id = if body.get("email").and_then(|value| value.as_str())
                    == Some("account-b@example.test")
                {
                    "account-b"
                } else {
                    "account-a"
                };
                return Ok((
                    200,
                    json!({
                        "status": "approved",
                        "token": format!("token-{account_id}"),
                        "profile": {
                            "id": account_id,
                            "displayName": account_id,
                            "email": format!("{account_id}@example.test"),
                            "status": "approved",
                            "role": "member",
                            "analyticsEnabled": true
                        }
                    }),
                ));
            }

            if url.ends_with("/api/corelib/analytics/daily-statistics") {
                return match token {
                    Some("token-account-a") => {
                        self.stale_request_started
                            .send(())
                            .map_err(|error| error.to_string())?;
                        self.release_stale_request
                            .lock()
                            .unwrap()
                            .recv()
                            .map_err(|error| error.to_string())?;
                        Ok((self.stale_status, json!({ "message": "session_expired" })))
                    }
                    Some("token-account-b") => Ok((204, json!(null))),
                    other => Err(format!("unexpected analytics token: {other:?}")),
                };
            }

            Err(format!("unexpected POST request: {url}"))
        }

        fn get(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
            self.requests.lock().unwrap().push((
                "GET".to_string(),
                url.to_string(),
                serde_json::Value::Null,
                token.map(str::to_string),
            ));

            if url.contains("/api/corelib/admin/statistics") {
                return match token {
                    Some("token-account-a") => {
                        self.stale_request_started
                            .send(())
                            .map_err(|error| error.to_string())?;
                        self.release_stale_request
                            .lock()
                            .unwrap()
                            .recv()
                            .map_err(|error| error.to_string())?;
                        Ok((self.stale_status, json!({ "message": "session_expired" })))
                    }
                    Some("token-account-b") => Ok((
                        200,
                        json!({
                            "approvedUsers": 1,
                            "analyticsEnabledUsers": 1,
                            "optInPercentage": 100.0,
                            "contributingUsers": 1,
                            "insufficientSample": false,
                            "buckets": []
                        }),
                    )),
                    other => Err(format!("unexpected admin statistics token: {other:?}")),
                };
            }

            Err(format!("unexpected GET request: {url}"))
        }

        fn delete(&self, url: &str, _token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
            Err(format!("unexpected DELETE request: {url}"))
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
        let http = MockHttpClient::new(vec![
            (
                200,
                json!({
                    "status": "approved",
                    "token": "token-account-a",
                    "profile": {
                        "id": "account-a",
                        "displayName": "Account A",
                        "email": "account-a@example.test",
                        "status": "approved",
                        "role": "member",
                        "analyticsEnabled": true
                    }
                }),
            ),
            (204, json!(null)),
        ]);

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

        api.sign_in("account-a@example.test", "password12345", true)
            .expect("sign in account A");

        let res = api.upsert_daily_statistics("account-a", input);
        assert!(res.is_ok());

        let reqs = api.http.requests.lock().unwrap();
        assert_eq!(reqs.len(), 2);
        assert_eq!(reqs[1].0, "POST");
        assert!(reqs[1].1.contains("/api/corelib/analytics/daily-statistics"));
        assert_eq!(reqs[1].3.as_deref(), Some("token-account-a"));
        assert!(reqs[1].2.get("expectedAccountId").is_none());
    }

    #[test]
    fn rejects_daily_statistics_for_a_different_active_account_without_an_upsert_request() {
        let store = MemorySessionStore::new();
        let http = MockHttpClient::new(vec![(
            200,
            json!({
                "status": "approved",
                "token": "token-account-b",
                "profile": {
                    "id": "account-b",
                    "displayName": "Account B",
                    "email": "account-b@example.test",
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
        api.sign_in("account-b@example.test", "password12345", true)
            .expect("sign in account B");

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

        let result = api.upsert_daily_statistics("account-a", input);

        assert_eq!(result, Err(AccountError::AccountMismatch));
        let requests = api.http.requests.lock().unwrap();
        assert_eq!(requests.len(), 1, "mismatch must not reach the upsert endpoint");
        assert!(requests
            .iter()
            .all(|request| !request.1.contains("/api/corelib/analytics/daily-statistics")));
    }

    #[test]
    fn stale_unauthorized_upload_response_does_not_clear_the_new_active_session() {
        for stale_status in [401, 403] {
            let (http, upload_started, release_upload) =
                SwitchingHttpClient::new(stale_status);
            let api = Arc::new(PocketBaseAccountApi::new_with_deps(
                "http://localhost:8090".to_string(),
                MemorySessionStore::new(),
                http,
            ));
            api.sign_in("account-a@example.test", "password12345", true)
                .expect("sign in account A");

            let snapshot = DailyStatisticsSnapshot {
                schema_version: 1,
                local_day: "2026-07-19".to_string(),
                app_key: "reading".to_string(),
                active_ms: 3600000,
                active_day: true,
                session_count: 3,
                page_visit_count: None,
                unique_page_count: None,
                real_review_count: None,
                again_count: None,
                hard_count: None,
                good_count: None,
                easy_count: None,
                lapse_count: None,
            };
            let stale_api = Arc::clone(&api);
            let stale_snapshot = snapshot.clone();
            let stale_upload = std::thread::spawn(move || {
                stale_api.upsert_daily_statistics("account-a", stale_snapshot)
            });

            if let Err(error) = upload_started.recv_timeout(Duration::from_secs(2)) {
                let _ = release_upload.send(());
                panic!("account A upload did not start: {error}");
            }
            api.sign_in("account-b@example.test", "password12345", true)
                .expect("activate account B while A upload is in flight");
            assert_eq!(
                api.store.get_token().unwrap().as_deref(),
                Some("token-account-b")
            );

            release_upload.send(()).expect("release stale A response");
            let stale_result = stale_upload.join().expect("join stale A upload");
            assert_eq!(
                stale_result,
                Err(if stale_status == 401 {
                    AccountError::SessionExpired
                } else {
                    AccountError::AccountNotApproved
                })
            );
            assert_eq!(
                api.store.get_token().unwrap().as_deref(),
                Some("token-account-b"),
                "stale {stale_status} must not clear B's persisted token"
            );
            api.upsert_daily_statistics("account-b", snapshot)
                .expect("account B remains authenticated");

            let requests = api.http.requests.lock().unwrap();
            let analytics_tokens: Vec<&str> = requests
                .iter()
                .filter(|request| request.1.ends_with("/api/corelib/analytics/daily-statistics"))
                .filter_map(|request| request.3.as_deref())
                .collect();
            assert_eq!(analytics_tokens, vec!["token-account-a", "token-account-b"]);
        }
    }

    #[test]
    fn stale_unauthorized_admin_statistics_response_does_not_clear_the_new_active_session() {
        for stale_status in [401, 403] {
            let (http, request_started, release_request) = SwitchingHttpClient::new(stale_status);
            let api = Arc::new(PocketBaseAccountApi::new_with_deps(
                "http://localhost:8090".to_string(),
                MemorySessionStore::new(),
                http,
            ));
            api.sign_in("account-a@example.test", "password12345", true)
                .expect("sign in account A");

            let stale_api = Arc::clone(&api);
            let stale_request = std::thread::spawn(move || {
                stale_api.admin_statistics("7d", "reading")
            });

            if let Err(error) = request_started.recv_timeout(Duration::from_secs(2)) {
                let _ = release_request.send(());
                panic!("account A admin statistics request did not start: {error}");
            }
            api.sign_in("account-b@example.test", "password12345", true)
                .expect("activate account B while A request is in flight");
            assert_eq!(
                api.store.get_token().unwrap().as_deref(),
                Some("token-account-b")
            );

            release_request.send(()).expect("release stale A response");
            let stale_result = stale_request.join().expect("join stale A request");
            assert_eq!(
                stale_result,
                Err(if stale_status == 401 {
                    AccountError::SessionExpired
                } else {
                    AccountError::AccountNotApproved
                })
            );
            assert_eq!(
                api.store.get_token().unwrap().as_deref(),
                Some("token-account-b"),
                "stale {stale_status} must not clear B's persisted token"
            );
            api.admin_statistics("7d", "reading")
                .expect("account B remains authenticated");

            let requests = api.http.requests.lock().unwrap();
            let statistics_tokens: Vec<&str> = requests
                .iter()
                .filter(|request| request.1.contains("/api/corelib/admin/statistics"))
                .filter_map(|request| request.3.as_deref())
                .collect();
            assert_eq!(statistics_tokens, vec!["token-account-a", "token-account-b"]);
        }
    }

    #[test]
    fn unauthorized_upload_for_the_current_session_still_clears_it() {
        for status in [401, 403] {
            let store = MemorySessionStore::new();
            let http = MockHttpClient::new(vec![
                (
                    200,
                    json!({
                        "status": "approved",
                        "token": "token-account-a",
                        "profile": {
                            "id": "account-a",
                            "displayName": "Account A",
                            "email": "account-a@example.test",
                            "status": "approved",
                            "role": "member",
                            "analyticsEnabled": true
                        }
                    }),
                ),
                (status, json!({ "message": "session_expired" })),
            ]);
            let api = PocketBaseAccountApi::new_with_deps(
                "http://localhost:8090".to_string(),
                store,
                http,
            );
            api.sign_in("account-a@example.test", "password12345", true)
                .expect("sign in account A");
            let snapshot = DailyStatisticsSnapshot {
                schema_version: 1,
                local_day: "2026-07-19".to_string(),
                app_key: "reading".to_string(),
                active_ms: 3600000,
                active_day: true,
                session_count: 3,
                page_visit_count: None,
                unique_page_count: None,
                real_review_count: None,
                again_count: None,
                hard_count: None,
                good_count: None,
                easy_count: None,
                lapse_count: None,
            };

            assert!(api
                .upsert_daily_statistics("account-a", snapshot)
                .is_err());
            assert_eq!(api.store.get_token().unwrap(), None);
        }
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
