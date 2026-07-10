use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub source: String,
    #[serde(rename = "coverUrl")]
    pub cover_url: Option<String>,
    pub indexed: bool,
    pub status: String,
    #[serde(rename = "lastReadPage")]
    pub last_read_page: Option<i64>,
}
