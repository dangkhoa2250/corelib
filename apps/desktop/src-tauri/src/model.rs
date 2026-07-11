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
    #[serde(rename = "numPages")]
    pub num_pages: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PageTagSummary {
    pub id: String,
    #[serde(rename = "documentId")]
    pub document_id: String,
    pub page: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SelectionRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CardSourcePayload {
    #[serde(rename = "documentId")]
    pub document_id: Option<String>,
    pub page: i64,
    pub quote: String,
    pub rects: Vec<SelectionRect>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DeckSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub archived: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LearningCardSummary {
    pub id: String,
    #[serde(rename = "deckId")]
    pub deck_id: String,
    pub front: String,
    pub back: String,
    pub state: String,
    #[serde(rename = "dueAt")]
    pub due_at: String,
    pub reps: i64,
    pub lapses: i64,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    #[serde(rename = "lastReviewAt")]
    pub last_review_at: Option<String>,
    pub source: Option<CardSourcePayload>,
    pub tags: Vec<String>,
    #[serde(rename = "frontLanguage")]
    pub front_language: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ReviewIntervalPayload {
    #[serde(rename = "dueAt")]
    pub due_at: String,
    #[serde(rename = "intervalLabel")]
    pub interval_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ReviewPreviewPayload {
    pub again: ReviewIntervalPayload,
    pub hard: ReviewIntervalPayload,
    pub good: ReviewIntervalPayload,
    pub easy: ReviewIntervalPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SearchResultPayload {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardBrowserQueryPayload {
    pub deck_id: String,
    pub query: String,
    pub states: Vec<String>,
    pub tags: Vec<String>,
    pub sort: String,
    pub cursor: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardPayload {
    pub card_id: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub front_language: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAndMoveCardPayload {
    pub card_id: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub destination_deck_id: Option<String>,
    pub front_language: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCardsPayload {
    pub card_ids: Vec<String>,
    pub destination_deck_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCardsSuspendedPayload {
    pub card_ids: Vec<String>,
    pub suspended: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCardsPayload {
    pub card_ids: Vec<String>,
    pub destination_deck_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashQueryPayload {
    pub query: String,
    pub sort: String,
    pub cursor: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkCardsPayload {
    pub card_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkResultPayload {
    pub affected_ids: Vec<String>,
    pub affected_count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardBrowserRowPayload {
    pub id: String,
    pub deck_id: Option<String>,
    pub deck_name: String,
    pub front: String,
    pub back: String,
    pub state: String,
    pub due_at: String,
    pub reps: i64,
    pub lapses: i64,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub last_review_at: Option<String>,
    pub source: Option<CardSourcePayload>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub deleted_from_deck_name: Option<String>,
    pub front_language: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPagePayload {
    pub rows: Vec<CardBrowserRowPayload>,
    pub total: usize,
    pub next_cursor: Option<String>,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        BulkResultPayload, CardBrowserRowPayload, CardPagePayload, CardSourcePayload, DeckSummary,
        LearningCardSummary, ReviewIntervalPayload, ReviewPreviewPayload, SearchResultPayload,
        SelectionRect,
    };

    #[test]
    fn learning_payloads_use_the_frontend_json_contract() {
        let deck = DeckSummary {
            id: "deck-1".into(),
            name: "Biology".into(),
            description: Some("Cell biology".into()),
            color: Some("blue".into()),
            archived: false,
        };
        let card = LearningCardSummary {
            id: "card-1".into(),
            deck_id: "deck-1".into(),
            front: "What is ATP?".into(),
            back: "Adenosine triphosphate".into(),
            state: "review".into(),
            due_at: "2026-07-10T09:00:00Z".into(),
            reps: 4,
            lapses: 1,
            stability: Some(3.5),
            difficulty: Some(6.2),
            last_review_at: Some("2026-07-09T09:00:00Z".into()),
            source: Some(CardSourcePayload {
                document_id: Some("document-1".into()),
                page: 7,
                quote: "ATP stores energy.".into(),
                rects: vec![SelectionRect {
                    x: 1.0,
                    y: 2.0,
                    width: 3.0,
                    height: 4.0,
                }],
            }),
            tags: vec!["biology".into()],
            front_language: Some("en".into()),
        };
        let interval = ReviewIntervalPayload {
            due_at: "2026-07-11T09:00:00Z".into(),
            interval_label: "1 day".into(),
        };
        let preview = ReviewPreviewPayload {
            again: interval.clone(),
            hard: interval.clone(),
            good: interval.clone(),
            easy: interval,
        };

        assert_eq!(
            serde_json::to_value(deck).expect("serialize deck"),
            json!({
                "id": "deck-1",
                "name": "Biology",
                "description": "Cell biology",
                "color": "blue",
                "archived": false,
            })
        );
        assert_eq!(
            serde_json::to_value(card).expect("serialize card"),
            json!({
                "id": "card-1",
                "deckId": "deck-1",
                "front": "What is ATP?",
                "back": "Adenosine triphosphate",
                "state": "review",
                "dueAt": "2026-07-10T09:00:00Z",
                "reps": 4,
                "lapses": 1,
                "stability": 3.5,
                "difficulty": 6.2,
                "lastReviewAt": "2026-07-09T09:00:00Z",
                "source": {
                    "documentId": "document-1",
                    "page": 7,
                    "quote": "ATP stores energy.",
                    "rects": [{ "x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0 }],
                },
                "tags": ["biology"],
                "frontLanguage": "en",
            })
        );
        assert_eq!(
            serde_json::to_value(preview).expect("serialize preview"),
            json!({
                "again": { "dueAt": "2026-07-11T09:00:00Z", "intervalLabel": "1 day" },
                "hard": { "dueAt": "2026-07-11T09:00:00Z", "intervalLabel": "1 day" },
                "good": { "dueAt": "2026-07-11T09:00:00Z", "intervalLabel": "1 day" },
                "easy": { "dueAt": "2026-07-11T09:00:00Z", "intervalLabel": "1 day" },
            })
        );
    }

    #[test]
    fn search_results_serialize_a_nullable_subtitle() {
        let result = SearchResultPayload {
            kind: "card".into(),
            id: "card-1".into(),
            title: "What is ATP?".into(),
            subtitle: None,
        };

        assert_eq!(
            serde_json::to_value(result).expect("serialize search result"),
            json!({
                "kind": "card",
                "id": "card-1",
                "title": "What is ATP?",
                "subtitle": null,
            })
        );
    }

    #[test]
    fn source_payloads_serialize_an_unavailable_document_as_null() {
        let source = CardSourcePayload {
            document_id: None,
            page: 7,
            quote: "ATP stores energy.".into(),
            rects: vec![],
        };

        assert_eq!(
            serde_json::to_value(source).expect("serialize unavailable source"),
            json!({
                "documentId": null,
                "page": 7,
                "quote": "ATP stores energy.",
                "rects": [],
            })
        );
    }

    #[test]
    fn card_browser_payloads_use_frontend_contract() {
        let row = CardBrowserRowPayload {
            id: "card-1".into(),
            deck_id: Some("deck-1".into()),
            deck_name: "Biology".into(),
            front: "What is ATP?".into(),
            back: "Energy storage".into(),
            state: "review".into(),
            due_at: "2026-07-10T09:00:00Z".into(),
            reps: 4,
            lapses: 1,
            stability: Some(3.5),
            difficulty: Some(6.2),
            last_review_at: Some("2026-07-09T09:00:00Z".into()),
            source: None,
            tags: vec!["biology".into()],
            created_at: "2026-07-08T09:00:00Z".into(),
            updated_at: "2026-07-09T09:00:00Z".into(),
            deleted_at: Some("2026-07-10T10:00:00Z".into()),
            deleted_from_deck_name: Some("Biology".into()),
            front_language: Some("en".into()),
        };
        let page = CardPagePayload {
            rows: vec![row],
            total: 1,
            next_cursor: Some("opaque-cursor-value".into()),
        };
        let bulk_result = BulkResultPayload {
            affected_ids: vec!["card-1".into()],
            affected_count: 1,
        };

        let page_json = serde_json::to_value(page).expect("serialize page");
        let row_json = &page_json["rows"][0];

        assert!(row_json.get("deckId").is_some());
        assert!(row_json.get("deckName").is_some());
        assert!(row_json.get("createdAt").is_some());
        assert!(row_json.get("updatedAt").is_some());
        assert!(row_json.get("deletedAt").is_some());
        assert!(row_json.get("deletedFromDeckName").is_some());
        assert!(row_json.get("frontLanguage").is_some());
        assert!(page_json.get("nextCursor").is_some());

        let bulk_json = serde_json::to_value(bulk_result).expect("serialize bulk result");
        assert!(bulk_json.get("affectedIds").is_some());
        assert!(bulk_json.get("affectedCount").is_some());
    }
}
