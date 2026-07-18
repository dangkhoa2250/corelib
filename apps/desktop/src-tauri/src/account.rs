use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use keyring::Entry;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AccountStatus {
    Pending,
    Approved,
    Rejected,
}

impl AccountStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AccountRole {
    Member,
    Admin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub id: String,
    pub display_name: String,
    pub email: String,
    pub status: AccountStatus,
    pub role: AccountRole,
    pub analytics_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entitlements {
    pub feature_keys: Vec<String>,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub profile: AccountProfile,
    pub entitlements: Entitlements,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AccountStatusResponse {
    Pending,
    Approved(SessionSnapshot),
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEventInput {
    pub installation_id: String,
    pub name: String,
    pub app_version: String,
    pub occurred_at: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountGroup {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureDefinition {
    pub id: String,
    pub key: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureAssignmentInput {
    pub feature_key: String,
    pub subject_type: String,
    pub subject_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeatureAssignment {
    pub id: String,
    pub feature_key: String,
    pub subject_type: String,
    pub subject_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminMetrics {
    pub approved_users: u64,
    pub pending_users: u64,
    pub active_users_last30_days: u64,
    pub events_by_name: Vec<MetricCount>,
    pub versions: Vec<MetricVersion>,
    pub errors_by_code: Vec<MetricErrorCode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetricCount {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetricVersion {
    pub app_version: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetricErrorCode {
    pub code: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatisticsSnapshot {
    pub schema_version: i32,
    pub local_day: String,
    pub app_key: String,
    pub active_ms: i64,
    pub active_day: bool,
    pub session_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_visit_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_page_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub real_review_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub again_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hard_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub easy_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lapse_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatisticsBucket {
    pub local_day: String,
    pub contributing_users: i64,
    pub insufficient_sample: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminAppAggregate {
    pub active_users: i64,
    pub active_ms: i64,
    pub session_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_visit_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub real_review_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub again_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hard_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub easy_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lapse_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recall_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub returning_user_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly_learning_frequency: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminStatistics {
    pub approved_users: i64,
    pub analytics_enabled_users: i64,
    pub opt_in_percentage: f64,
    pub contributing_users: i64,
    pub insufficient_sample: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dau: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wau: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mau: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_days: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_active_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_active_days: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_allocation: Option<HashMap<String, f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reading: Option<AdminAppAggregate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memora: Option<AdminAppAggregate>,
    pub buckets: Vec<AdminStatisticsBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccountError {
    InvalidInput,
    EmailTaken,
    InvalidCredentials,
    AccountNotApproved,
    AdminRequired,
    InvalidEvent,
    AnalyticsDisabled,
    SessionExpired,
    AccountServiceNotConfigured,
    NetworkError(String),
    Internal(String),
}

impl std::fmt::Display for AccountError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput => write!(f, "invalid_input"),
            Self::EmailTaken => write!(f, "email_taken"),
            Self::InvalidCredentials => write!(f, "invalid_credentials"),
            Self::AccountNotApproved => write!(f, "account_not_approved"),
            Self::AdminRequired => write!(f, "admin_required"),
            Self::InvalidEvent => write!(f, "invalid_event"),
            Self::AnalyticsDisabled => write!(f, "analytics_disabled"),
            Self::SessionExpired => write!(f, "session_expired"),
            Self::AccountServiceNotConfigured => write!(f, "account_service_not_configured"),
            Self::NetworkError(msg) => write!(f, "network_error: {}", msg),
            Self::Internal(msg) => write!(f, "internal_error: {}", msg),
        }
    }
}

impl std::error::Error for AccountError {}

pub trait SessionStore {
    fn get_token(&self) -> Result<Option<String>, String>;
    fn set_token(&self, token: &str) -> Result<(), String>;
    fn delete_token(&self) -> Result<(), String>;
}

pub struct KeyringSessionStore;

impl SessionStore for KeyringSessionStore {
    fn get_token(&self) -> Result<Option<String>, String> {
        let entry = Entry::new("com.library.desktop.account", "session")
            .map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set_token(&self, token: &str) -> Result<(), String> {
        let entry = Entry::new("com.library.desktop.account", "session")
            .map_err(|e| e.to_string())?;
        entry.set_password(token).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn delete_token(&self) -> Result<(), String> {
        let entry = Entry::new("com.library.desktop.account", "session")
            .map_err(|e| e.to_string())?;
        match entry.delete_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

pub struct MemorySessionStore {
    token: Mutex<Option<String>>,
}

impl MemorySessionStore {
    pub fn new() -> Self {
        Self {
            token: Mutex::new(None),
        }
    }
}

impl Default for MemorySessionStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionStore for MemorySessionStore {
    fn get_token(&self) -> Result<Option<String>, String> {
        Ok(self.token.lock().unwrap().clone())
    }

    fn set_token(&self, token: &str) -> Result<(), String> {
        *self.token.lock().unwrap() = Some(token.to_string());
        Ok(())
    }

    fn delete_token(&self) -> Result<(), String> {
        *self.token.lock().unwrap() = None;
        Ok(())
    }
}

pub trait HttpClient {
    fn post(&self, url: &str, body: serde_json::Value, token: Option<&str>) -> Result<(u16, serde_json::Value), String>;
    fn get(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String>;
    fn delete(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String>;
}

pub struct ReqwestHttpClient {
    client: reqwest::blocking::Client,
}

impl ReqwestHttpClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::blocking::Client::new(),
        }
    }
}

impl Default for ReqwestHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpClient for ReqwestHttpClient {
    fn post(&self, url: &str, body: serde_json::Value, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
        let mut req = self.client.post(url);
        if let Some(tok) = token {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
        let resp = req.json(&body).send().map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let val = resp.json().unwrap_or(serde_json::Value::Null);
        Ok((status, val))
    }

    fn get(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
        let mut req = self.client.get(url);
        if let Some(tok) = token {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
        let resp = req.send().map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let val = resp.json().unwrap_or(serde_json::Value::Null);
        Ok((status, val))
    }

    fn delete(&self, url: &str, token: Option<&str>) -> Result<(u16, serde_json::Value), String> {
        let mut req = self.client.delete(url);
        if let Some(tok) = token {
            req = req.header("Authorization", format!("Bearer {}", tok));
        }
        let resp = req.send().map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let val = resp.json().unwrap_or(serde_json::Value::Null);
        Ok((status, val))
    }
}

pub trait AccountApi {
    fn register(&self, display_name: &str, email: &str, password: &str) -> Result<AccountStatusResponse, AccountError>;
    fn sign_in(&self, email: &str, password: &str, remember: bool) -> Result<AccountStatusResponse, AccountError>;
    fn current_session(&self) -> Result<SessionSnapshot, AccountError>;
    fn sign_out(&self) -> Result<(), AccountError>;
    fn set_analytics_enabled(&self, enabled: bool) -> Result<AccountProfile, AccountError>;
    fn send_analytics(&self, event: AnalyticsEventInput) -> Result<(), AccountError>;
    fn admin_list_users(&self, status: Option<AccountStatus>) -> Result<Vec<AccountProfile>, AccountError>;
    fn admin_set_status(&self, user_id: &str, status: AccountStatus) -> Result<AccountProfile, AccountError>;
    fn admin_set_groups(&self, user_id: &str, group_ids: Vec<String>) -> Result<(), AccountError>;
    fn admin_list_groups(&self) -> Result<Vec<AccountGroup>, AccountError>;
    fn admin_create_group(&self, name: &str, description: &str) -> Result<AccountGroup, AccountError>;
    fn admin_list_features(&self) -> Result<Vec<FeatureDefinition>, AccountError>;
    fn admin_create_feature(&self, key: &str, description: &str) -> Result<FeatureDefinition, AccountError>;
    fn admin_set_feature_assignment(&self, input: FeatureAssignmentInput) -> Result<FeatureAssignment, AccountError>;
    fn admin_metrics(&self) -> Result<AdminMetrics, AccountError>;
    fn admin_delete_user(&self, user_id: &str) -> Result<(), AccountError>;
    fn upsert_daily_statistics(&self, input: DailyStatisticsSnapshot) -> Result<(), AccountError>;
    fn admin_statistics(&self, range: &str, app_key: &str) -> Result<AdminStatistics, AccountError>;
}

pub struct PocketBaseAccountApi<S: SessionStore, H: HttpClient> {
    pub base_url: String,
    pub store: S,
    pub http: H,
    pub ephemeral_token: Mutex<Option<String>>,
}

impl<S: SessionStore, H: HttpClient> PocketBaseAccountApi<S, H> {
    pub fn new_with_deps(base_url: String, store: S, http: H) -> Self {
        Self { base_url, store, http, ephemeral_token: Mutex::new(None) }
    }

    fn get_active_token(&self) -> Result<String, AccountError> {
        if let Some(t) = self.ephemeral_token.lock().unwrap().as_ref() {
            return Ok(t.clone());
        }
        self.store
            .get_token()
            .map_err(AccountError::Internal)?
            .ok_or(AccountError::SessionExpired)
    }

    fn clear_all_tokens(&self) {
        *self.ephemeral_token.lock().unwrap() = None;
        let _ = self.store.delete_token();
    }

    fn handle_error_response(&self, status: u16, body: &serde_json::Value) -> AccountError {
        let msg = body.get("message").and_then(|m| m.as_str()).unwrap_or("");
        match status {
            400 => AccountError::InvalidInput,
            401 => {
                self.clear_all_tokens();
                if msg.contains("invalid_credentials") {
                    AccountError::InvalidCredentials
                } else {
                    AccountError::SessionExpired
                }
            }
            403 => {
                if msg.contains("admin_required") {
                    AccountError::AdminRequired
                } else if msg.contains("analytics_disabled") {
                    AccountError::AnalyticsDisabled
                } else {
                    self.clear_all_tokens();
                    AccountError::AccountNotApproved
                }
            }
            409 => {
                if msg.contains("email_taken") {
                    AccountError::EmailTaken
                } else {
                    AccountError::Internal(msg.to_string())
                }
            }
            _ => AccountError::Internal(format!("HTTP status {}: {}", status, msg)),
        }
    }
}

impl<S: SessionStore, H: HttpClient> AccountApi for PocketBaseAccountApi<S, H> {
    fn register(&self, display_name: &str, email: &str, password: &str) -> Result<AccountStatusResponse, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let url = format!("{}/api/corelib/register", self.base_url);
        let body = serde_json::json!({
            "displayName": display_name,
            "email": email,
            "password": password,
            "passwordConfirm": password,
        });
        let (status, res) = self.http.post(&url, body, None).map_err(AccountError::NetworkError)?;
        if status == 200 {
            Ok(AccountStatusResponse::Pending)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn sign_in(&self, email: &str, password: &str, remember: bool) -> Result<AccountStatusResponse, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let url = format!("{}/api/corelib/sign-in", self.base_url);
        let body = serde_json::json!({
            "email": email,
            "password": password,
        });
        let (status, res) = self.http.post(&url, body, None).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let status_str = res.get("status").and_then(|s| s.as_str()).unwrap_or("pending");
            match status_str {
                "approved" => {
                    let token = res.get("token").and_then(|t| t.as_str()).unwrap_or("");
                    let profile_val = res.get("profile").cloned().unwrap_or(serde_json::Value::Null);
                    let profile: AccountProfile = serde_json::from_value(profile_val)
                        .map_err(|e| AccountError::Internal(e.to_string()))?;
                    if remember {
                        self.store.set_token(token).map_err(AccountError::Internal)?;
                    } else {
                        *self.ephemeral_token.lock().unwrap() = Some(token.to_string());
                    }
                    Ok(AccountStatusResponse::Approved(SessionSnapshot {
                        profile,
                        entitlements: Entitlements {
                            feature_keys: vec![],
                            refreshed_at: "".to_string(),
                        },
                    }))
                }
                "rejected" => Ok(AccountStatusResponse::Rejected),
                _ => Ok(AccountStatusResponse::Pending),
            }
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn current_session(&self) -> Result<SessionSnapshot, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/me", self.base_url);
        let (status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let snapshot: SessionSnapshot = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(snapshot)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn sign_out(&self) -> Result<(), AccountError> {
        self.clear_all_tokens();
        Ok(())
    }

    fn set_analytics_enabled(&self, enabled: bool) -> Result<AccountProfile, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/me/analytics", self.base_url);
        let body = serde_json::json!({ "enabled": enabled });
        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let profile: AccountProfile = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(profile)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn send_analytics(&self, event: AnalyticsEventInput) -> Result<(), AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }

        // Validate payload structure
        let prohibited = ["query", "path", "content", "prompt", "location", "address"];
        let allowed_keys = match event.name.as_str() {
            "app_opened" => vec!["source"],
            "feature_opened" => vec!["featureKey"],
            "feature_completed" => vec!["featureKey"],
            "handled_error" => vec!["code"],
            "updater_state" => vec!["state", "targetVersion"],
            _ => return Err(AccountError::InvalidEvent),
        };

        if let Some(obj) = event.payload.as_object() {
            if obj.len() > 20 {
                return Err(AccountError::InvalidEvent);
            }
            for k in obj.keys() {
                if k.len() > 80 || prohibited.contains(&k.as_str()) || !allowed_keys.contains(&k.as_str()) {
                    return Err(AccountError::InvalidEvent);
                }
                let val = &obj[k];
                if !val.is_string() && !val.is_boolean() && !val.is_number() {
                    return Err(AccountError::InvalidEvent);
                }
                if let Some(s) = val.as_str() {
                    if s.len() > 160 {
                        return Err(AccountError::InvalidEvent);
                    }
                }
                if let Some(f) = val.as_f64() {
                    if !f.is_finite() {
                        return Err(AccountError::InvalidEvent);
                    }
                }
            }
        } else if !event.payload.is_null() {
            return Err(AccountError::InvalidEvent);
        }

        if event.installation_id.is_empty() || event.installation_id.len() > 80 {
            return Err(AccountError::InvalidEvent);
        }

        if event.app_version.is_empty() || event.app_version.len() > 40 {
            return Err(AccountError::InvalidEvent);
        }

        let token = self.get_active_token()?;

        let url = format!("{}/api/corelib/analytics", self.base_url);
        let body = serde_json::json!({
            "installationId": event.installation_id,
            "name": event.name,
            "appVersion": event.app_version,
            "occurredAt": event.occurred_at,
            "payload": event.payload,
        });

        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 204 {
            Ok(())
        } else if status == 400 {
            Err(AccountError::InvalidEvent)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_list_users(&self, status: Option<AccountStatus>) -> Result<Vec<AccountProfile>, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/users", self.base_url);
        let (http_status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if http_status == 200 {
            #[derive(Deserialize)]
            struct UserListItem {
                profile: AccountProfile,
            }
            #[derive(Deserialize)]
            struct UsersResponse {
                users: Vec<UserListItem>,
            }
            let wrapper: UsersResponse = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            let mut list: Vec<AccountProfile> = wrapper.users.into_iter().map(|item| item.profile).collect();
            if let Some(st) = status {
                list.retain(|p| p.status == st);
            }
            Ok(list)
        } else {
            Err(self.handle_error_response(http_status, &res))
        }
    }

    fn admin_set_status(&self, user_id: &str, status: AccountStatus) -> Result<AccountProfile, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/users/{}/status", self.base_url, user_id);
        let body = serde_json::json!({ "status": status.as_str() });
        let (http_status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if http_status == 200 {
            let profile: AccountProfile = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(profile)
        } else {
            Err(self.handle_error_response(http_status, &res))
        }
    }

    fn admin_set_groups(&self, user_id: &str, group_ids: Vec<String>) -> Result<(), AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/users/{}/groups", self.base_url, user_id);
        let body = serde_json::json!({ "groupIds": group_ids });
        let (http_status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if http_status == 200 {
            Ok(())
        } else {
            Err(self.handle_error_response(http_status, &res))
        }
    }

    fn admin_list_groups(&self) -> Result<Vec<AccountGroup>, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/groups", self.base_url);
        let (status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            #[derive(Deserialize)]
            struct GroupsResponse {
                groups: Vec<AccountGroup>,
            }
            let wrapper: GroupsResponse = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(wrapper.groups)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_create_group(&self, name: &str, description: &str) -> Result<AccountGroup, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/groups", self.base_url);
        let body = serde_json::json!({ "name": name, "description": description });
        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let group: AccountGroup = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(group)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_list_features(&self) -> Result<Vec<FeatureDefinition>, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/features", self.base_url);
        let (status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            #[derive(Deserialize)]
            struct FeaturesResponse {
                features: Vec<FeatureDefinition>,
            }
            let wrapper: FeaturesResponse = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(wrapper.features)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_create_feature(&self, key: &str, description: &str) -> Result<FeatureDefinition, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/features", self.base_url);
        let body = serde_json::json!({ "key": key, "description": description });
        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let feature: FeatureDefinition = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(feature)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_set_feature_assignment(&self, input: FeatureAssignmentInput) -> Result<FeatureAssignment, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/assignments", self.base_url);
        let body = serde_json::json!({
            "featureKey": input.feature_key,
            "subjectType": input.subject_type,
            "subjectId": input.subject_id,
            "enabled": input.enabled,
        });
        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let assignment: FeatureAssignment = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(assignment)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_metrics(&self) -> Result<AdminMetrics, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/metrics", self.base_url);
        let (status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let metrics: AdminMetrics = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(metrics)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_delete_user(&self, user_id: &str) -> Result<(), AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/users/{}", self.base_url, user_id);
        let (status, res) = self.http.delete(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            Ok(())
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn upsert_daily_statistics(&self, input: DailyStatisticsSnapshot) -> Result<(), AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/analytics/daily-statistics", self.base_url);
        let body = serde_json::to_value(&input).map_err(|e| AccountError::Internal(e.to_string()))?;
        let (status, res) = self.http.post(&url, body, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 204 {
            Ok(())
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }

    fn admin_statistics(&self, range: &str, app_key: &str) -> Result<AdminStatistics, AccountError> {
        if self.base_url.is_empty() {
            return Err(AccountError::AccountServiceNotConfigured);
        }
        let token = self.get_active_token()?;
        let url = format!("{}/api/corelib/admin/statistics?range={}&appKey={}", self.base_url, range, app_key);
        let (status, res) = self.http.get(&url, Some(&token)).map_err(AccountError::NetworkError)?;
        if status == 200 {
            let stats: AdminStatistics = serde_json::from_value(res)
                .map_err(|e| AccountError::Internal(e.to_string()))?;
            Ok(stats)
        } else {
            Err(self.handle_error_response(status, &res))
        }
    }
}
