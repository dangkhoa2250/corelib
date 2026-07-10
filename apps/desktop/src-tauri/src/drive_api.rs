use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use crate::drive_auth::DriveTokenStore;
use crate::library_db::LibraryDatabase;
use crate::model::DocumentSummary;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DriveEntry {
    pub id: String,
    pub name: String,
    pub kind: String, // "pdf" or "folder"
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
}

pub fn get_env_var(key: &str) -> Option<String> {
    if let Ok(value) = std::env::var(key) {
        return Some(value);
    }
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..5 {
        let env_path = dir.join(".env");
        if env_path.is_file() {
            if let Ok(content) = std::fs::read_to_string(env_path) {
                for line in content.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        if k.trim() == key {
                            return Some(v.trim().trim_matches('"').trim_matches('\'').to_owned());
                        }
                    }
                }
            }
        }
        let desktop_env = dir.join("apps").join("desktop").join(".env");
        if desktop_env.is_file() {
            if let Ok(content) = std::fs::read_to_string(desktop_env) {
                for line in content.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        if k.trim() == key {
                            return Some(v.trim().trim_matches('"').trim_matches('\'').to_owned());
                        }
                    }
                }
            }
        }
        if let Some(parent) = dir.parent() {
            dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    None
}

fn open_url(url: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open browser: {e}"))
}

fn parse_code_from_request(request: &str) -> Option<String> {
    let path = request.split_whitespace().nth(1)?;
    let url = reqwest::Url::parse(&format!("http://localhost{}", path)).ok()?;
    for (key, val) in url.query_pairs() {
        if key == "code" {
            return Some(val.into_owned());
        }
    }
    None
}

pub fn drive_connect(token_store: &dyn DriveTokenStore) -> Result<(), String> {
    let client_id = get_env_var("GOOGLE_OAUTH_CLIENT_ID")
        .ok_or_else(|| "GOOGLE_OAUTH_CLIENT_ID not found".to_owned())?;
    let client_secret = get_env_var("GOOGLE_OAUTH_CLIENT_SECRET")
        .ok_or_else(|| "GOOGLE_OAUTH_CLIENT_SECRET not found".to_owned())?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("failed to bind local server: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={client_id}&\
         redirect_uri={redirect_uri}&\
         response_type=code&\
         scope=https://www.googleapis.com/auth/drive.readonly&\
         access_type=offline&\
         prompt=consent"
    );

    open_url(&auth_url)?;

    let (mut stream, _addr) = listener.accept().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| e.to_string())?;

    let code = parse_code_from_request(&request_line)
        .ok_or_else(|| "Failed to parse authorization code from redirect".to_owned())?;

    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .map_err(|e| format!("token exchange request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!(
            "token exchange failed: {}",
            res.text().unwrap_or_default()
        ));
    }

    let token_res: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    let refresh_token = token_res["refresh_token"]
        .as_str()
        .ok_or_else(|| "No refresh token returned".to_owned())?;

    token_store.save(refresh_token)?;

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n\
                    <html><body><h1>Authentication Successful!</h1><p>You can now close this tab and return to the application.</p></body></html>";
    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())?;
    let _ = stream.flush();

    Ok(())
}

pub fn get_access_token(token_store: &dyn DriveTokenStore) -> Result<String, String> {
    let refresh_token = token_store
        .load()?
        .ok_or_else(|| "Google Drive is not connected".to_owned())?;

    let client_id = get_env_var("GOOGLE_OAUTH_CLIENT_ID")
        .ok_or_else(|| "GOOGLE_OAUTH_CLIENT_ID not found".to_owned())?;
    let client_secret = get_env_var("GOOGLE_OAUTH_CLIENT_SECRET")
        .ok_or_else(|| "GOOGLE_OAUTH_CLIENT_SECRET not found".to_owned())?;

    let client = reqwest::blocking::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| format!("token refresh request failed: {e}"))?;

    if !res.status().is_success() {
        return Err("revoked".to_owned());
    }

    let token_res: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    let access_token = token_res["access_token"]
        .as_str()
        .ok_or_else(|| "No access token returned".to_owned())?;

    Ok(access_token.to_owned())
}

pub fn drive_list(
    token_store: &dyn DriveTokenStore,
    folder_id: Option<&str>,
) -> Result<Vec<DriveEntry>, String> {
    let access_token = get_access_token(token_store)?;

    let parent = folder_id.unwrap_or("root");
    let q = format!(
        "'{}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/pdf')",
        parent
    );

    let client = reqwest::blocking::Client::new();
    let res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[
            ("q", q.as_str()),
            ("fields", "files(id, name, mimeType, parents)"),
        ])
        .bearer_auth(access_token)
        .send()
        .map_err(|e| format!("failed to query Google Drive: {e}"))?;

    if !res.status().is_success() {
        return Err(format!(
            "Google Drive API error: {}",
            res.text().unwrap_or_default()
        ));
    }

    let body: serde_json::Value = res.json().map_err(|e| e.to_string())?;
    parse_drive_entries(&body, folder_id)
}

pub fn parse_drive_entries(
    body: &serde_json::Value,
    requested_parent: Option<&str>,
) -> Result<Vec<DriveEntry>, String> {
    let files = body["files"]
        .as_array()
        .ok_or_else(|| "invalid files response".to_owned())?;

    let mut entries = Vec::new();
    for file in files {
        let id = file["id"].as_str().unwrap_or_default().to_owned();
        let name = file["name"].as_str().unwrap_or_default().to_owned();
        let mime_type = file["mimeType"].as_str().unwrap_or_default();
        let kind = if mime_type == "application/vnd.google-apps.folder" {
            "folder".to_owned()
        } else {
            "pdf".to_owned()
        };
        let parent_id = file["parents"]
            .as_array()
            .and_then(|parents| parents.first())
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
            .or_else(|| requested_parent.map(str::to_owned));
        entries.push(DriveEntry {
            id,
            name,
            kind,
            parent_id,
        });
    }

    entries.sort_by(|a, b| {
        if a.kind != b.kind {
            if a.kind == "folder" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

pub fn drive_import(
    token_store: &dyn DriveTokenStore,
    database: &Arc<Mutex<LibraryDatabase>>,
    ids: Vec<String>,
) -> Result<Vec<DocumentSummary>, String> {
    let access_token = get_access_token(token_store)?;
    let client = reqwest::blocking::Client::new();
    let mut imported = Vec::new();

    for id in ids {
        let res = client
            .get(format!("https://www.googleapis.com/drive/v3/files/{}", id))
            .query(&[("fields", "id, name, mimeType")])
            .bearer_auth(&access_token)
            .send();

        let Ok(res) = res else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(file_meta) = res.json::<serde_json::Value>() else {
            continue;
        };

        let mime_type = file_meta["mimeType"].as_str().unwrap_or_default();
        let name = file_meta["name"].as_str().unwrap_or_default().to_owned();

        if mime_type == "application/pdf" {
            if let Ok(mut db) = database.lock() {
                let uuid = uuid::Uuid::new_v4().to_string();
                if let Ok(summary) = db.insert_drive(&uuid, &id, &name) {
                    imported.push(summary);
                }
            }
        } else if mime_type == "application/vnd.google-apps.folder" {
            let q = format!(
                "'{}' in parents and trashed = false and mimeType = 'application/pdf'",
                id
            );
            let child_res = client
                .get("https://www.googleapis.com/drive/v3/files")
                .query(&[("q", q.as_str()), ("fields", "files(id, name)")])
                .bearer_auth(&access_token)
                .send();

            let Ok(child_res) = child_res else {
                continue;
            };
            if !child_res.status().is_success() {
                continue;
            }
            let Ok(child_body) = child_res.json::<serde_json::Value>() else {
                continue;
            };
            if let Some(files) = child_body["files"].as_array() {
                if let Ok(mut db) = database.lock() {
                    for file in files {
                        let child_id = file["id"].as_str().unwrap_or_default().to_owned();
                        let child_name = file["name"].as_str().unwrap_or_default().to_owned();
                        let uuid = uuid::Uuid::new_v4().to_string();
                        if let Ok(summary) = db.insert_drive(&uuid, &child_id, &child_name) {
                            imported.push(summary);
                        }
                    }
                }
            }
        }
    }

    Ok(imported)
}

pub fn download_drive_file(
    token_store: &dyn DriveTokenStore,
    file_id: &str,
) -> Result<Vec<u8>, String> {
    let access_token = get_access_token(token_store)?;
    let client = reqwest::blocking::Client::new();
    let res = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .bearer_auth(access_token)
        .send()
        .map_err(|e| format!("failed to download file: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().unwrap_or_default();
        if status.as_u16() == 401
            || body.contains("authError")
            || body.contains("Invalid Credentials")
        {
            return Err("revoked".to_owned());
        }
        return Err(format!("Google Drive download API error: {}", body));
    }

    let bytes = res.bytes().map_err(|e| e.to_string())?.to_vec();
    Ok(bytes)
}

pub struct DriveTestRecord {
    pub source: String,
    pub managed_path: Option<String>,
    pub status: String,
}

pub fn new_drive_record(_id: &str, _title: &str) -> DriveTestRecord {
    DriveTestRecord {
        source: "google_drive".to_owned(),
        managed_path: None,
        status: "download_required".to_owned(),
    }
}
