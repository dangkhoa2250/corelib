use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension, Row};
use uuid::Uuid;

use crate::{
    library_db::{LibraryDatabase, LibraryDbError, Result},
    model::{CardSourcePayload, LearningCardSummary, SearchResultPayload, SelectionRect},
};

pub struct NewCard {
    pub deck_name: String,
    pub front: String,
    pub back: String,
    pub source: Option<NewCardSource>,
    pub tags: Vec<String>,
    pub front_language: Option<String>,
}
pub struct UpdateCard {
    pub card_id: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub front_language: Option<String>,
}
pub struct UpdateAndMoveCard {
    pub card_id: String,
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
    pub destination_deck_id: Option<String>,
    pub front_language: Option<String>,
}
pub struct BulkResult {
    pub affected_ids: Vec<String>,
    pub affected_count: usize,
}
pub struct NewCardSource {
    pub document_id: String,
    pub page: i64,
    pub quote: String,
    pub rects_json: String,
}
pub struct AppliedReview {
    pub card_id: String,
    pub rating: String,
    pub prior_state: String,
    pub next_state: String,
    pub prior_due_at: String,
    pub next_due_at: String,
    pub interval_seconds: i64,
    pub elapsed_ms: i64,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub memory_state_json: Option<String>,
    pub scheduler_version: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardSort {
    UpdatedDesc,
    CreatedDesc,
    DueAsc,
    FrontAsc,
}

impl CardSort {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "updated_desc" => Ok(Self::UpdatedDesc),
            "created_desc" => Ok(Self::CreatedDesc),
            "due_asc" => Ok(Self::DueAsc),
            "front_asc" => Ok(Self::FrontAsc),
            _ => Err(LibraryDbError::InvalidLearning(format!(
                "invalid sort: {}",
                s
            ))),
        }
    }
}

pub struct CardBrowserQuery {
    pub deck_id: String,
    pub query: String,
    pub states: Vec<String>,
    pub tags: Vec<String>,
    pub sort: CardSort,
    pub cursor: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrashSort {
    DeletedDesc,
    FrontAsc,
}

impl TrashSort {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "deleted_desc" => Ok(Self::DeletedDesc),
            "front_asc" => Ok(Self::FrontAsc),
            _ => Err(LibraryDbError::InvalidLearning(format!(
                "invalid trash sort: {}",
                s
            ))),
        }
    }
}

pub struct TrashQuery {
    pub query: String,
    pub sort: TrashSort,
    pub cursor: Option<String>,
    pub limit: usize,
}

impl LibraryDatabase {
    pub fn list_decks(&self) -> Result<Vec<crate::model::DeckSummary>> {
        let mut stmt = self.connection.prepare("SELECT id,name,description,color,archived FROM decks ORDER BY archived ASC, name COLLATE NOCASE ASC, id ASC")?;
        let rows = stmt.query_map([], |r| {
            Ok(crate::model::DeckSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                color: r.get(3)?,
                archived: r.get::<_, i64>(4)? != 0,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn create_deck(&mut self, name: &str) -> Result<crate::model::DeckSummary> {
        let name = norm(name, "deck name is required")?;
        let now = learning_timestamp();
        let id = Uuid::new_v4().to_string();
        self.connection
            .execute(
                "INSERT INTO decks(id,name,created_at,updated_at) VALUES(?1,?2,?3,?3)",
                params![id, name, now],
            )
            .map_err(|e| {
                if matches!(e, rusqlite::Error::SqliteFailure(_, _)) {
                    invalid("deck already exists")
                } else {
                    e.into()
                }
            })?;
        self.connection
            .query_row(
                "SELECT id,name,description,color,archived FROM decks WHERE id=?1",
                params![id],
                |r| {
                    Ok(crate::model::DeckSummary {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        description: r.get(2)?,
                        color: r.get(3)?,
                        archived: r.get::<_, i64>(4)? != 0,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn rename_deck(&mut self, id: &str, name: &str) -> Result<crate::model::DeckSummary> {
        let name = norm(name, "deck name is required")?;
        let now = learning_timestamp();
        let updated = self
            .connection
            .execute(
                "UPDATE decks SET name=?1, updated_at=?2 WHERE id=?3",
                params![name, now, id],
            )
            .map_err(|e| {
                if matches!(e, rusqlite::Error::SqliteFailure(_, _)) {
                    invalid("deck already exists")
                } else {
                    e.into()
                }
            })?;
        if updated == 0 {
            return Err(invalid("deck not found"));
        }
        self.connection
            .query_row(
                "SELECT id,name,description,color,archived FROM decks WHERE id=?1",
                params![id],
                |r| {
                    Ok(crate::model::DeckSummary {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        description: r.get(2)?,
                        color: r.get(3)?,
                        archived: r.get::<_, i64>(4)? != 0,
                    })
                },
            )
            .map_err(Into::into)
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStatistics {
    pub total_cards: i64,
    pub new_cards: i64,
    pub learning_cards: i64,
    pub review_cards: i64,
    pub relearning_cards: i64,
    pub suspended_cards: i64,
    pub due_cards: i64,
}

impl LibraryDatabase {
    pub fn count_cards_in_deck(&self, id: &str) -> Result<i64> {
        self.connection
            .query_row(
                "SELECT COUNT(*) FROM cards WHERE deck_id=?1 AND deleted_at IS NULL",
                params![id],
                |r| r.get(0),
            )
            .map_err(Into::into)
    }

    pub fn get_deck_statistics(&self, deck_id: &str) -> Result<DeckStatistics> {
        let now = learning_timestamp();
        self.connection.query_row(
            "SELECT
                COUNT(*) as total_cards,
                SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) as new_cards,
                SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) as learning_cards,
                SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) as review_cards,
                SUM(CASE WHEN state = 'relearning' THEN 1 ELSE 0 END) as relearning_cards,
                SUM(CASE WHEN state = 'suspended' THEN 1 ELSE 0 END) as suspended_cards,
                SUM(CASE WHEN state NOT IN ('new', 'suspended') AND due_at <= ?1 THEN 1 ELSE 0 END) as due_cards
            FROM cards
            WHERE deck_id = ?2 AND deleted_at IS NULL",
            params![now, deck_id],
            |r| Ok(DeckStatistics {
                total_cards: r.get(0)?,
                new_cards: r.get(1)?,
                learning_cards: r.get(2)?,
                review_cards: r.get(3)?,
                relearning_cards: r.get(4)?,
                suspended_cards: r.get(5)?,
                due_cards: r.get(6)?,
            })
        ).map_err(Into::into)
    }

    /// Deletes a deck along with every card that belongs to it (and, via
    /// their `ON DELETE CASCADE` foreign keys, each card's review logs and
    /// tags). The host UI is expected to warn the user with the card count
    /// (see `count_cards_in_deck`) before calling this.
    pub fn delete_deck(&mut self, id: &str) -> Result<()> {
        let tx = self.connection.transaction()?;

        let deck_name: Option<String> = tx
            .query_row("SELECT name FROM decks WHERE id = ?1", params![id], |r| {
                r.get(0)
            })
            .optional()?;
        let deck_name = match deck_name {
            Some(name) => name,
            None => return Err(invalid("deck not found")),
        };

        let now = learning_timestamp();

        let active_ids = {
            let mut active_stmt =
                tx.prepare("SELECT id FROM cards WHERE deck_id = ?1 AND deleted_at IS NULL")?;
            let ids: Vec<String> = active_stmt
                .query_map(params![id], |r| r.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            ids
        };

        for card_id in active_ids {
            tx.execute(
                "UPDATE cards SET deleted_at = ?1, deleted_from_deck_name = ?2, deck_id = NULL, updated_at = ?1 WHERE id = ?3",
                params![now, deck_name, card_id],
            )?;
            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![card_id])?;
        }

        tx.execute(
            "UPDATE cards SET deck_id = NULL, deleted_from_deck_name = COALESCE(deleted_from_deck_name, ?1), updated_at = ?2 WHERE deck_id = ?3 AND deleted_at IS NOT NULL",
            params![deck_name, now, id],
        )?;

        let deleted = tx.execute("DELETE FROM decks WHERE id=?1", params![id])?;
        if deleted == 0 {
            return Err(invalid("deck not found"));
        }
        tx.commit()?;
        Ok(())
    }

    pub fn card_memory_state(&self, id: &str) -> Result<Option<String>> {
        self.connection
            .query_row(
                "SELECT memory_state_json FROM cards WHERE id=?1 AND deleted_at IS NULL",
                params![id],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(Into::into)
            .map(|opt| opt.flatten())
    }
}

fn invalid(message: &str) -> LibraryDbError {
    LibraryDbError::InvalidLearning(message.to_string())
}
fn norm(value: &str, field: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        Err(invalid(field))
    } else {
        Ok(value.to_string())
    }
}

fn is_supported_youglish_language(lang: &str) -> bool {
    matches!(
        lang,
        "ar" | "zh" | "nl" | "en" | "fr" | "de" | "el" | "he" | "hi" | "id" | "it" | "ja"
            | "ko" | "fa" | "pl" | "pt" | "ro" | "ru" | "es" | "sv" | "th" | "tr"
            | "uk" | "vi" | "sgn"
    )
}

fn validate_front_language(lang: &Option<String>) -> Result<Option<String>> {
    if let Some(ref l) = lang {
        let normalized = l.trim().to_lowercase();
        if normalized.is_empty() {
            Ok(None)
        } else if is_supported_youglish_language(&normalized) {
            Ok(Some(normalized))
        } else {
            Err(invalid("unsupported front language"))
        }
    } else {
        Ok(None)
    }
}

fn learning_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl LibraryDatabase {
    pub fn create_card(&mut self, input: NewCard) -> Result<LearningCardSummary> {
        let front_language = validate_front_language(&input.front_language)?;
        let deck = norm(&input.deck_name, "deck name is required")?;
        let front = norm(&input.front, "front is required")?;
        let back = norm(&input.back, "back is required")?;
        let source_quote = input
            .source
            .as_ref()
            .map(|source| source.quote.trim().to_string())
            .unwrap_or_default();
        let mut tags = Vec::new();
        for tag in input.tags {
            let tag = tag.trim();
            if !tag.is_empty() && !tags.iter().any(|x: &String| x.eq_ignore_ascii_case(tag)) {
                tags.push(tag.to_string());
            }
        }
        if let Some(source) = &input.source {
            if source.document_id.trim().is_empty() {
                return Err(invalid("source document is required"));
            }
            if source.page <= 0 {
                return Err(invalid("source page must be positive"));
            }
            if source.quote.trim().is_empty() {
                return Err(invalid("source quote is required"));
            }
            let rects: Vec<SelectionRect> = serde_json::from_str(&source.rects_json)
                .map_err(|_| invalid("source rects must be an array of rectangles"))?;
            if rects.iter().any(|rect| {
                !rect.x.is_finite()
                    || !rect.y.is_finite()
                    || !rect.width.is_finite()
                    || !rect.height.is_finite()
                    || rect.width < 0.0
                    || rect.height < 0.0
            }) {
                return Err(invalid(
                    "source rect dimensions must be finite and nonnegative",
                ));
            }
        }
        let tx = self.connection.transaction()?;
        let now = learning_timestamp();
        let deck_id: String = tx
            .query_row("SELECT id FROM decks WHERE name = ?1", params![deck], |r| {
                r.get(0)
            })
            .optional()?
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        tx.execute(
            "INSERT OR IGNORE INTO decks (id,name,created_at,updated_at) VALUES (?1,?2,?3,?3)",
            params![deck_id, deck, now],
        )?;
        if let Some(source) = &input.source {
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM documents WHERE id=?1)",
                params![source.document_id.trim()],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(invalid("source document not found"));
            }
        }
        let id = Uuid::new_v4().to_string();
        tx.execute("INSERT INTO cards (id,deck_id,front,back,state,due_at,reps,lapses,created_at,updated_at,front_language) VALUES (?1,?2,?3,?4,'new',?5,0,0,?5,?5,?6)", params![id, deck_id, front, back, now, front_language])?;
        if let Some(source) = input.source {
            tx.execute("INSERT INTO card_sources (card_id,document_id,page,quote,rects_json) VALUES (?1,?2,?3,?4,?5)", params![id, source.document_id.trim(), source.page, source.quote.trim(), source.rects_json])?;
        }
        let mut tag_names = Vec::new();
        for tag in tags {
            let tag_id: String = tx
                .query_row("SELECT id FROM tags WHERE name=?1", params![tag], |r| {
                    r.get(0)
                })
                .optional()?
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            tx.execute(
                "INSERT OR IGNORE INTO tags (id,name) VALUES (?1,?2)",
                params![tag_id, tag],
            )?;
            tx.execute(
                "INSERT INTO card_tags(card_id,tag_id) VALUES(?1,?2)",
                params![id, tag_id],
            )?;
            tag_names.push(tag);
        }
        let body = format!(
            "{} {} {} {} {}",
            front,
            back,
            deck,
            tag_names.join(" "),
            source_quote
        );
        tx.execute(
            "INSERT INTO card_text(card_id,body) VALUES(?1,?2)",
            params![id, body],
        )?;
        tx.commit()?;
        self.card_by_id(&id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn due_cards(&self, now: &str, limit: usize) -> Result<Vec<LearningCardSummary>> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        let limit = i64::try_from(limit).map_err(|_| invalid("due card limit is too large"))?;
        let mut stmt = self.connection.prepare("SELECT id FROM cards WHERE state IN ('new','learning','review','relearning') AND due_at <= ?1 AND deleted_at IS NULL ORDER BY due_at,id LIMIT ?2")?;
        let ids = stmt
            .query_map(params![now, limit], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        ids.into_iter()
            .map(|id| {
                self.card_by_id(&id)?
                    .ok_or(LibraryDbError::DocumentNotFound)
            })
            .collect()
    }

    pub fn card_by_id(&self, id: &str) -> Result<Option<LearningCardSummary>> {
        let exists = self.connection.query_row("SELECT id,deck_id,front,back,state,due_at,reps,lapses,stability,difficulty,last_review_at,front_language FROM cards WHERE id=?1 AND deleted_at IS NULL", params![id], |r| self.hydrate_card(r)).optional()?;
        Ok(exists)
    }

    fn hydrate_card(&self, row: &Row<'_>) -> rusqlite::Result<LearningCardSummary> {
        let id: String = row.get(0)?;
        let deck_id: String = row.get(1)?;
        let source = self
            .connection
            .query_row(
                "SELECT document_id,page,quote,rects_json FROM card_sources WHERE card_id=?1",
                params![id],
                |r| {
                    let raw: String = r.get(3)?;
                    let rects: Vec<SelectionRect> = serde_json::from_str(&raw).map_err(|e| {
                        rusqlite::Error::FromSqlConversionFailure(
                            3,
                            rusqlite::types::Type::Text,
                            Box::new(e),
                        )
                    })?;
                    Ok(CardSourcePayload {
                        document_id: r.get(0)?,
                        page: r.get(1)?,
                        quote: r.get(2)?,
                        rects,
                    })
                },
            )
            .optional()?;
        let mut tags_stmt = self.connection.prepare("SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id=t.id WHERE ct.card_id=?1 ORDER BY ct.rowid")?;
        let tags = tags_stmt
            .query_map(params![id], |r| r.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;
        Ok(LearningCardSummary {
            id,
            deck_id,
            front: row.get(2)?,
            back: row.get(3)?,
            state: row.get(4)?,
            due_at: row.get(5)?,
            reps: row.get(6)?,
            lapses: row.get(7)?,
            stability: row.get(8)?,
            difficulty: row.get(9)?,
            last_review_at: row.get(10)?,
            front_language: row.get(11)?,
            source,
            tags,
        })
    }

    pub fn card_source(&self, id: &str) -> Result<Option<CardSourcePayload>> {
        Ok(self.card_by_id(id)?.and_then(|c| c.source))
    }

    pub fn cards_in_deck(&self, deck_id: &str) -> Result<Vec<LearningCardSummary>> {
        let mut stmt = self
            .connection
            .prepare("SELECT id FROM cards WHERE deck_id=?1 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC")?;
        let ids = stmt
            .query_map(params![deck_id], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        ids.into_iter()
            .map(|id| {
                self.card_by_id(&id)?
                    .ok_or(LibraryDbError::DocumentNotFound)
            })
            .collect()
    }

    /// Deletes a card along with its review logs and tags, via their
    /// `ON DELETE CASCADE` foreign keys.
    pub fn delete_card(&mut self, id: &str) -> Result<()> {
        let deleted = self
            .connection
            .execute("DELETE FROM cards WHERE id=?1", params![id])?;
        if deleted == 0 {
            return Err(invalid("card not found"));
        }
        Ok(())
    }

    pub fn apply_review_atomic(&mut self, review: AppliedReview) -> Result<LearningCardSummary> {
        let rating = review.rating.trim();
        let prior_state = review.prior_state.trim();
        let next_state = review.next_state.trim();
        let prior_due_at = review.prior_due_at.trim();
        let next_due_at = review.next_due_at.trim();
        if !matches!(rating, "again" | "hard" | "good" | "easy")
            || !matches!(
                prior_state,
                "new" | "learning" | "review" | "relearning" | "suspended"
            )
            || !matches!(
                next_state,
                "new" | "learning" | "review" | "relearning" | "suspended"
            )
            || review.interval_seconds < 0
            || review.elapsed_ms < 0
            || prior_due_at.is_empty()
            || next_due_at.is_empty()
            || review.stability.is_some_and(|value| !value.is_finite())
            || review.difficulty.is_some_and(|value| !value.is_finite())
            || review.memory_state_json.as_deref().is_some_and(|raw| {
                serde_json::from_str::<serde_json::Value>(raw)
                    .map(|value| !value.is_object())
                    .unwrap_or(true)
            })
        {
            return Err(invalid("invalid review"));
        }
        let tx = self.connection.transaction()?;

        let card_info: Option<(String, Option<String>)> = tx
            .query_row(
                "SELECT id, deleted_at FROM cards WHERE id = ?1",
                params![review.card_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
            )
            .optional()?;

        match card_info {
            None => return Err(invalid("card not found")),
            Some((_, Some(_))) => return Err(invalid("card is in Trash")),
            _ => {}
        }

        let reviewed_at = learning_timestamp();
        let changed = tx.execute("UPDATE cards SET state=?1,due_at=?2,stability=?3,difficulty=?4,memory_state_json=?5,reps=reps+1,lapses=lapses+CASE WHEN ?6='again' THEN 1 ELSE 0 END,last_review_at=?7,updated_at=?7 WHERE id=?8 AND state=?9 AND due_at=?10 AND deleted_at IS NULL", params![next_state,next_due_at,review.stability,review.difficulty,review.memory_state_json,rating,reviewed_at,review.card_id,prior_state,prior_due_at])?;
        if changed != 1 {
            return Err(invalid("card review precondition failed"));
        }
        tx.execute("INSERT INTO review_logs(id,card_id,reviewed_at,rating,prior_state,next_state,prior_due_at,next_due_at,interval_seconds,elapsed_ms,scheduler_version) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", params![Uuid::new_v4().to_string(),review.card_id,reviewed_at,rating,prior_state,next_state,prior_due_at,next_due_at,review.interval_seconds,review.elapsed_ms,review.scheduler_version])?;
        tx.commit()?;
        self.card_by_id(&review.card_id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    #[cfg(test)]
    pub(crate) fn install_learning_review_failure_for_test(&mut self) -> Result<()> {
        self.connection.execute_batch("CREATE TRIGGER fail_learning_review_insert_for_test BEFORE INSERT ON review_logs BEGIN SELECT RAISE(FAIL, 'test review insert failure'); END;")?;
        Ok(())
    }

    pub fn learning_search(&self, query: &str, limit: usize) -> Result<Vec<SearchResultPayload>> {
        if query.trim().is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let expression = query
            .split_whitespace()
            .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ");
        let mut stmt = self.connection.prepare("SELECT c.id,c.front,d.name,cs.document_id FROM card_text ft JOIN cards c ON c.id=ft.card_id JOIN decks d ON d.id=c.deck_id LEFT JOIN card_sources cs ON cs.card_id=c.id WHERE card_text MATCH ?1 AND c.deleted_at IS NULL LIMIT ?2")?;
        let rows = stmt.query_map(params![expression, limit.min(100)], |r| {
            let deck: String = r.get(2)?;
            let doc: Option<String> = r.get(3)?;
            Ok(SearchResultPayload {
                kind: "card".into(),
                id: r.get(0)?,
                title: r.get(1)?,
                subtitle: Some(match doc {
                    Some(document) => format!("{} · {}", deck, document),
                    None => deck,
                }),
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn query_deck_cards(
        &self,
        query: CardBrowserQuery,
    ) -> Result<crate::model::CardPagePayload> {
        if query.limit < 1 || query.limit > 200 {
            return Err(invalid("limit must be between 1 and 200"));
        }

        // Validate states
        for state in &query.states {
            validate_state(state)?;
        }

        let mut sql = "SELECT c.id, c.deck_id, c.front, c.back, c.state, c.due_at, c.reps, c.lapses, c.stability, c.difficulty, c.last_review_at, c.created_at, c.updated_at, d.name, c.deleted_at, c.deleted_from_deck_name, c.front_language FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.deleted_at IS NULL".to_string();

        let mut count_sql = "SELECT COUNT(*) FROM cards c WHERE c.deleted_at IS NULL".to_string();

        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

        if !query.deck_id.is_empty() {
            sql.push_str(" AND c.deck_id = ?1");
            count_sql.push_str(" AND c.deck_id = ?1");
            params_vec.push(Box::new(query.deck_id.clone()));
        }

        // 1. Text search
        if !query.query.trim().is_empty() {
            let pattern = format!("%{}%", escape_like(query.query.trim()));
            let param_idx = params_vec.len() + 1;
            let filter_str = format!(
                " AND (c.front LIKE ?{0} ESCAPE '\\' OR c.back LIKE ?{0} ESCAPE '\\' OR EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON ct.tag_id = t.id WHERE ct.card_id = c.id AND t.name LIKE ?{0} ESCAPE '\\'))",
                param_idx
            );
            sql.push_str(&filter_str);
            count_sql.push_str(&filter_str);
            params_vec.push(Box::new(pattern));
        }

        // 2. States filter
        if !query.states.is_empty() {
            let mut state_clauses = Vec::new();
            for state in &query.states {
                let param_idx = params_vec.len() + 1;
                state_clauses.push(format!("c.state = ?{}", param_idx));
                params_vec.push(Box::new(state.clone()));
            }
            let filter_str = format!(" AND ({})", state_clauses.join(" OR "));
            sql.push_str(&filter_str);
            count_sql.push_str(&filter_str);
        }

        // 3. Tags filter (AND logic)
        for tag in &query.tags {
            let param_idx = params_vec.len() + 1;
            let filter_str = format!(
                " AND EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON ct.tag_id = t.id WHERE ct.card_id = c.id AND t.name = ?{} COLLATE NOCASE)",
                param_idx
            );
            sql.push_str(&filter_str);
            count_sql.push_str(&filter_str);
            params_vec.push(Box::new(tag.trim().to_string()));
        }

        // Calculate total count before adding pagination cursor
        let mut count_stmt = self.connection.prepare(&count_sql)?;
        let total: i64 = count_stmt.query_row(
            rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
            |r| r.get(0),
        )?;
        let total = total as usize;

        // 4. Cursor pagination
        if let Some(cursor_str) = &query.cursor {
            let (cursor_val, cursor_id) = decode_cursor(cursor_str)?;
            let val_idx = params_vec.len() + 1;
            let id_idx = params_vec.len() + 2;

            let cursor_clause = match query.sort {
                CardSort::UpdatedDesc => {
                    format!(
                        " AND (c.updated_at < ?{} OR (c.updated_at = ?{} AND c.id > ?{}))",
                        val_idx, val_idx, id_idx
                    )
                }
                CardSort::CreatedDesc => {
                    format!(
                        " AND (c.created_at < ?{} OR (c.created_at = ?{} AND c.id > ?{}))",
                        val_idx, val_idx, id_idx
                    )
                }
                CardSort::DueAsc => {
                    format!(
                        " AND (c.due_at > ?{} OR (c.due_at = ?{} AND c.id > ?{}))",
                        val_idx, val_idx, id_idx
                    )
                }
                CardSort::FrontAsc => {
                    format!(" AND (c.front COLLATE NOCASE > ?{} OR (c.front COLLATE NOCASE = ?{} AND c.id > ?{}))", val_idx, val_idx, id_idx)
                }
            };
            sql.push_str(&cursor_clause);
            params_vec.push(Box::new(cursor_val));
            params_vec.push(Box::new(cursor_id));
        }

        // 5. Ordering
        let order_clause = match query.sort {
            CardSort::UpdatedDesc => " ORDER BY c.updated_at DESC, c.id ASC",
            CardSort::CreatedDesc => " ORDER BY c.created_at DESC, c.id ASC",
            CardSort::DueAsc => " ORDER BY c.due_at ASC, c.id ASC",
            CardSort::FrontAsc => " ORDER BY c.front COLLATE NOCASE ASC, c.id ASC",
        };
        sql.push_str(order_clause);

        // 6. Limit
        let limit_idx = params_vec.len() + 1;
        sql.push_str(&format!(" LIMIT ?{}", limit_idx));
        params_vec.push(Box::new((query.limit + 1) as i64));

        let mut stmt = self.connection.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
            |r| self.hydrate_browser_row(r),
        )?;

        let mut card_rows = Vec::new();
        for r in rows {
            card_rows.push(r?);
        }

        let mut next_cursor = None;
        if card_rows.len() > query.limit {
            card_rows.truncate(query.limit);
            if let Some(last_row) = card_rows.last() {
                let cursor_val = match query.sort {
                    CardSort::UpdatedDesc => last_row.updated_at.clone(),
                    CardSort::CreatedDesc => last_row.created_at.clone(),
                    CardSort::DueAsc => last_row.due_at.clone(),
                    CardSort::FrontAsc => last_row.front.clone(),
                };
                next_cursor = Some(encode_cursor(&cursor_val, &last_row.id));
            }
        }

        Ok(crate::model::CardPagePayload {
            rows: card_rows,
            total,
            next_cursor,
        })
    }

    pub fn list_active_tags(&self, deck_id: &str) -> Result<Vec<String>> {
        let mut sql = "SELECT DISTINCT t.name FROM tags t JOIN card_tags ct ON ct.tag_id = t.id JOIN cards c ON ct.card_id = c.id WHERE c.deleted_at IS NULL".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

        if !deck_id.is_empty() {
            sql.push_str(" AND c.deck_id = ?1");
            params_vec.push(Box::new(deck_id.to_string()));
        }

        sql.push_str(" ORDER BY t.name COLLATE NOCASE");

        let mut stmt = self.connection.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
            |r| r.get::<_, String>(0),
        )?;

        let mut tags = Vec::new();
        for r in rows {
            tags.push(r?);
        }
        Ok(tags)
    }

    fn hydrate_browser_row(
        &self,
        row: &Row<'_>,
    ) -> rusqlite::Result<crate::model::CardBrowserRowPayload> {
        let id: String = row.get(0)?;
        let deck_id: Option<String> = row.get(1)?;
        let front: String = row.get(2)?;
        let back: String = row.get(3)?;
        let state: String = row.get(4)?;
        let due_at: String = row.get(5)?;
        let reps: i64 = row.get(6)?;
        let lapses: i64 = row.get(7)?;
        let stability: Option<f64> = row.get(8)?;
        let difficulty: Option<f64> = row.get(9)?;
        let last_review_at: Option<String> = row.get(10)?;
        let created_at: String = row.get(11)?;
        let updated_at: String = row.get(12)?;
        let deck_name: String = row.get(13)?;
        let deleted_at: Option<String> = row.get(14)?;
        let deleted_from_deck_name: Option<String> = row.get(15)?;
        let front_language: Option<String> = row.get(16)?;

        let source = self
            .connection
            .query_row(
                "SELECT document_id,page,quote,rects_json FROM card_sources WHERE card_id=?1",
                params![id],
                |r| {
                    let raw: String = r.get(3)?;
                    let rects: Vec<SelectionRect> = serde_json::from_str(&raw).map_err(|e| {
                        rusqlite::Error::FromSqlConversionFailure(
                            3,
                            rusqlite::types::Type::Text,
                            Box::new(e),
                        )
                    })?;
                    Ok(CardSourcePayload {
                        document_id: r.get(0)?,
                        page: r.get(1)?,
                        quote: r.get(2)?,
                        rects,
                    })
                },
            )
            .optional()?;

        let mut tags_stmt = self.connection.prepare("SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id=t.id WHERE ct.card_id=?1 ORDER BY ct.rowid")?;
        let tags = tags_stmt
            .query_map(params![id], |r| r.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;

        Ok(crate::model::CardBrowserRowPayload {
            id,
            deck_id,
            deck_name,
            front,
            back,
            state,
            due_at,
            reps,
            lapses,
            stability,
            difficulty,
            last_review_at,
            source,
            tags,
            created_at,
            updated_at,
            deleted_at,
            deleted_from_deck_name,
            front_language,
        })
    }

    pub fn update_card(&mut self, input: UpdateCard) -> Result<LearningCardSummary> {
        let front_language = validate_front_language(&input.front_language)?;
        let front = norm(&input.front, "front is required")?;
        let back = norm(&input.back, "back is required")?;
        let mut tags = Vec::new();
        for tag in input.tags {
            let tag = tag.trim();
            if !tag.is_empty() && !tags.iter().any(|x: &String| x.eq_ignore_ascii_case(tag)) {
                tags.push(tag.to_string());
            }
        }

        let tx = self.connection.transaction()?;
        let now = learning_timestamp();

        let is_active: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE id=?1 AND deleted_at IS NULL)",
            params![input.card_id],
            |r| r.get(0),
        )?;
        if !is_active {
            return Err(invalid("card not found or is in Trash"));
        }

        tx.execute(
            "UPDATE cards SET front=?1, back=?2, updated_at=?3, front_language=?4 WHERE id=?5",
            params![front, back, now, front_language, input.card_id],
        )?;

        tx.execute(
            "DELETE FROM card_tags WHERE card_id=?1",
            params![input.card_id],
        )?;

        let mut tag_names = Vec::new();
        for tag in tags {
            let tag_id: String = tx
                .query_row("SELECT id FROM tags WHERE name=?1", params![tag], |r| {
                    r.get(0)
                })
                .optional()?
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            tx.execute(
                "INSERT OR IGNORE INTO tags (id,name) VALUES (?1,?2)",
                params![tag_id, tag],
            )?;
            tx.execute(
                "INSERT INTO card_tags(card_id,tag_id) VALUES(?1,?2)",
                params![input.card_id, tag_id],
            )?;
            tag_names.push(tag);
        }

        let (deck_name, source_quote): (String, Option<String>) = tx.query_row(
            "SELECT d.name, cs.quote FROM cards c JOIN decks d ON c.deck_id = d.id LEFT JOIN card_sources cs ON cs.card_id = c.id WHERE c.id = ?1",
            params![input.card_id],
            |r| Ok((r.get(0)?, r.get(1)?))
        )?;
        let quote = source_quote.unwrap_or_default();
        let body = format!(
            "{} {} {} {} {}",
            front,
            back,
            deck_name,
            tag_names.join(" "),
            quote.trim()
        );
        tx.execute(
            "DELETE FROM card_text WHERE card_id = ?1",
            params![input.card_id],
        )?;
        tx.execute(
            "INSERT INTO card_text(card_id, body) VALUES(?1, ?2)",
            params![input.card_id, body],
        )?;

        tx.commit()?;
        self.card_by_id(&input.card_id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn update_and_move_card(
        &mut self,
        input: UpdateAndMoveCard,
    ) -> Result<LearningCardSummary> {
        let front_language = validate_front_language(&input.front_language)?;
        let front = norm(&input.front, "front is required")?;
        let back = norm(&input.back, "back is required")?;
        let mut tags = Vec::new();
        for tag in input.tags {
            let tag = tag.trim();
            if !tag.is_empty() && !tags.iter().any(|x: &String| x.eq_ignore_ascii_case(tag)) {
                tags.push(tag.to_string());
            }
        }

        let tx = self.connection.transaction()?;
        let now = learning_timestamp();

        let (current_deck_id, is_active): (String, bool) = tx.query_row(
            "SELECT deck_id, deleted_at IS NULL FROM cards WHERE id = ?1",
            params![input.card_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if !is_active {
            return Err(invalid("card not found or is in Trash"));
        }

        let final_deck_id: String = match &input.destination_deck_id {
            Some(dest) if dest.trim() == current_deck_id => current_deck_id,
            Some(dest) => {
                let dest_id = dest.trim();
                let deck_exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
                    params![dest_id],
                    |r| r.get(0),
                )?;
                if !deck_exists {
                    return Err(invalid("destination deck not found"));
                }
                dest_id.to_string()
            }
            None => current_deck_id,
        };

        tx.execute(
            "UPDATE cards SET front = ?1, back = ?2, deck_id = ?3, updated_at = ?4, front_language = ?5 WHERE id = ?6",
            params![front, back, final_deck_id, now, front_language, input.card_id],
        )?;

        tx.execute(
            "DELETE FROM card_tags WHERE card_id = ?1",
            params![input.card_id],
        )?;

        let mut tag_names = Vec::new();
        for tag in &tags {
            let tag_id: String = tx
                .query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| {
                    r.get(0)
                })
                .optional()?
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            tx.execute(
                "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
                params![tag_id, tag],
            )?;
            tx.execute(
                "INSERT INTO card_tags (card_id, tag_id) VALUES (?1, ?2)",
                params![input.card_id, tag_id],
            )?;
            tag_names.push(tag.clone());
        }

        let (deck_name, source_quote): (String, Option<String>) = tx.query_row(
            "SELECT d.name, cs.quote FROM cards c JOIN decks d ON c.deck_id = d.id LEFT JOIN card_sources cs ON cs.card_id = c.id WHERE c.id = ?1",
            params![input.card_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let quote = source_quote.unwrap_or_default();
        let body = format!(
            "{} {} {} {} {}",
            front,
            back,
            deck_name,
            tag_names.join(" "),
            quote.trim()
        );
        tx.execute(
            "DELETE FROM card_text WHERE card_id = ?1",
            params![input.card_id],
        )?;
        tx.execute(
            "INSERT INTO card_text (card_id, body) VALUES (?1, ?2)",
            params![input.card_id, body],
        )?;

        tx.commit()?;
        self.card_by_id(&input.card_id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn move_cards(
        &mut self,
        card_ids: &[String],
        destination_deck_id: &str,
    ) -> Result<BulkResult> {
        let dest_id = destination_deck_id.trim();
        if dest_id.is_empty() {
            return Err(invalid("destination deck ID is required"));
        }
        let ids = validate_and_deduplicate_ids(card_ids)?;

        let tx = self.connection.transaction()?;

        let deck_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
            params![dest_id],
            |r| r.get(0),
        )?;
        if !deck_exists {
            return Err(invalid("destination deck not found"));
        }

        verify_all_cards_active(&tx, &ids)?;

        let now = learning_timestamp();
        for id in &ids {
            tx.execute(
                "UPDATE cards SET deck_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![dest_id, now, id],
            )?;

            let (front, back, deck_name, source_quote): (String, String, String, Option<String>) = tx.query_row(
                "SELECT c.front, c.back, d.name, cs.quote FROM cards c JOIN decks d ON c.deck_id = d.id LEFT JOIN card_sources cs ON cs.card_id = c.id WHERE c.id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            )?;

            let mut tags_stmt = tx.prepare("SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id=t.id WHERE ct.card_id=?1 ORDER BY ct.rowid")?;
            let tags = tags_stmt
                .query_map(params![id], |r| r.get(0))?
                .collect::<std::result::Result<Vec<String>, _>>()?;

            let quote = source_quote.unwrap_or_default();
            let body = format!(
                "{} {} {} {} {}",
                front,
                back,
                deck_name,
                tags.join(" "),
                quote.trim()
            );
            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![id])?;
            tx.execute(
                "INSERT INTO card_text(card_id, body) VALUES(?1, ?2)",
                params![id, body],
            )?;
        }

        tx.commit()?;

        let count = ids.len();
        Ok(BulkResult {
            affected_ids: ids,
            affected_count: count,
        })
    }

    pub fn set_cards_suspended(
        &mut self,
        card_ids: &[String],
        suspended: bool,
    ) -> Result<BulkResult> {
        let ids = validate_and_deduplicate_ids(card_ids)?;

        let tx = self.connection.transaction()?;
        verify_all_cards_active(&tx, &ids)?;

        let now = learning_timestamp();
        for id in &ids {
            let (state, suspended_from_state): (String, Option<String>) = tx.query_row(
                "SELECT state, suspended_from_state FROM cards WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;

            if suspended {
                if state == "suspended" {
                    return Err(invalid(&format!("card {} is already suspended", id)));
                }
                tx.execute(
                    "UPDATE cards SET state = 'suspended', suspended_from_state = ?1, updated_at = ?2 WHERE id = ?3",
                    params![state, now, id],
                )?;
            } else {
                if state != "suspended" {
                    return Err(invalid(&format!("card {} is not suspended", id)));
                }
                let prior_state = suspended_from_state.ok_or_else(|| {
                    invalid(&format!("suspended_from_state is missing for card {}", id))
                })?;
                tx.execute(
                    "UPDATE cards SET state = ?1, suspended_from_state = NULL, updated_at = ?2 WHERE id = ?3",
                    params![prior_state, now, id],
                )?;
            }
        }

        tx.commit()?;

        let count = ids.len();
        Ok(BulkResult {
            affected_ids: ids,
            affected_count: count,
        })
    }

    pub fn trash_cards(&mut self, card_ids: &[String]) -> Result<BulkResult> {
        let ids = validate_and_deduplicate_ids(card_ids)?;

        let tx = self.connection.transaction()?;
        verify_all_cards_active(&tx, &ids)?;

        let now = learning_timestamp();
        for id in &ids {
            let deck_name: String = tx.query_row(
                "SELECT d.name FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.id = ?1",
                params![id],
                |r| r.get(0),
            )?;

            tx.execute(
                "UPDATE cards SET deleted_at = ?1, deleted_from_deck_name = ?2, updated_at = ?1 WHERE id = ?3",
                params![now, deck_name, id],
            )?;

            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![id])?;
        }

        tx.commit()?;

        let count = ids.len();
        Ok(BulkResult {
            affected_ids: ids,
            affected_count: count,
        })
    }

    pub fn list_trashed_cards(&self, query: TrashQuery) -> Result<crate::model::CardPagePayload> {
        if query.limit < 1 || query.limit > 200 {
            return Err(invalid("limit must be between 1 and 200"));
        }

        let mut sql = "SELECT c.id, c.deck_id, c.front, c.back, c.state, c.due_at, c.reps, c.lapses, c.stability, c.difficulty, c.last_review_at, c.created_at, c.updated_at, COALESCE(d.name, c.deleted_from_deck_name, ''), c.deleted_at, c.deleted_from_deck_name, c.front_language FROM cards c LEFT JOIN decks d ON c.deck_id = d.id WHERE c.deleted_at IS NOT NULL".to_string();

        let mut count_sql =
            "SELECT COUNT(*) FROM cards c WHERE c.deleted_at IS NOT NULL".to_string();

        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if !query.query.trim().is_empty() {
            let pattern = format!("%{}%", escape_like(query.query.trim()));
            let param_idx = params_vec.len() + 1;
            let filter_str = format!(
                " AND (c.front LIKE ?{0} ESCAPE '\\' OR c.back LIKE ?{0} ESCAPE '\\' OR EXISTS (SELECT 1 FROM card_tags ct JOIN tags t ON ct.tag_id = t.id WHERE ct.card_id = c.id AND t.name LIKE ?{0} ESCAPE '\\'))",
                param_idx
            );
            sql.push_str(&filter_str);
            count_sql.push_str(&filter_str);
            params_vec.push(Box::new(pattern));
        }

        let mut count_stmt = self.connection.prepare(&count_sql)?;
        let total: i64 = count_stmt.query_row(
            rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
            |r| r.get(0),
        )?;
        let total = total as usize;

        if let Some(cursor_str) = &query.cursor {
            let (cursor_val, cursor_id) = decode_cursor(cursor_str)?;
            let val_idx = params_vec.len() + 1;
            let id_idx = params_vec.len() + 2;

            let cursor_clause = match query.sort {
                TrashSort::DeletedDesc => {
                    format!(
                        " AND (c.deleted_at < ?{} OR (c.deleted_at = ?{} AND c.id > ?{}))",
                        val_idx, val_idx, id_idx
                    )
                }
                TrashSort::FrontAsc => {
                    format!(" AND (c.front COLLATE NOCASE > ?{} OR (c.front COLLATE NOCASE = ?{} AND c.id > ?{}))", val_idx, val_idx, id_idx)
                }
            };
            sql.push_str(&cursor_clause);
            params_vec.push(Box::new(cursor_val));
            params_vec.push(Box::new(cursor_id));
        }

        let order_clause = match query.sort {
            TrashSort::DeletedDesc => " ORDER BY c.deleted_at DESC, c.id ASC",
            TrashSort::FrontAsc => " ORDER BY c.front COLLATE NOCASE ASC, c.id ASC",
        };
        sql.push_str(order_clause);

        let limit_idx = params_vec.len() + 1;
        sql.push_str(&format!(" LIMIT ?{}", limit_idx));
        params_vec.push(Box::new((query.limit + 1) as i64));

        let mut stmt = self.connection.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
            |r| self.hydrate_browser_row(r),
        )?;

        let mut card_rows = Vec::new();
        for r in rows {
            card_rows.push(r?);
        }

        let mut next_cursor = None;
        if card_rows.len() > query.limit {
            card_rows.truncate(query.limit);
            if let Some(last_row) = card_rows.last() {
                let cursor_val = match query.sort {
                    TrashSort::DeletedDesc => last_row.deleted_at.clone().unwrap_or_default(),
                    TrashSort::FrontAsc => last_row.front.clone(),
                };
                next_cursor = Some(encode_cursor(&cursor_val, &last_row.id));
            }
        }

        Ok(crate::model::CardPagePayload {
            rows: card_rows,
            total,
            next_cursor,
        })
    }

    pub fn restore_cards(
        &mut self,
        card_ids: &[String],
        destination: Option<&str>,
    ) -> Result<BulkResult> {
        let ids = validate_and_deduplicate_ids(card_ids)?;

        let tx = self.connection.transaction()?;
        let now = learning_timestamp();

        for id in &ids {
            let (deck_id, deleted_at): (Option<String>, Option<String>) = tx
                .query_row(
                    "SELECT deck_id, deleted_at FROM cards WHERE id = ?1",
                    params![id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| invalid(&format!("card {} not found", id)))?;

            if deleted_at.is_none() {
                return Err(invalid(&format!("card {} is not in Trash", id)));
            }

            let target_deck_id = match deck_id {
                Some(did) => {
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
                        params![did],
                        |r| r.get(0),
                    )?;
                    if exists {
                        did
                    } else {
                        let dest = destination.ok_or_else(|| {
                            invalid(&format!("original deck for card {} is deleted; destination deck ID is required", id))
                        })?;
                        dest.to_string()
                    }
                }
                None => {
                    let dest = destination.ok_or_else(|| {
                        invalid(&format!(
                            "card {} has no associated deck; destination deck ID is required",
                            id
                        ))
                    })?;
                    dest.to_string()
                }
            };

            let dest_exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
                params![target_deck_id],
                |r| r.get(0),
            )?;
            if !dest_exists {
                return Err(invalid(&format!(
                    "destination deck {} not found",
                    target_deck_id
                )));
            }

            tx.execute(
                "UPDATE cards SET deck_id = ?1, deleted_at = NULL, deleted_from_deck_name = NULL, updated_at = ?2 WHERE id = ?3",
                params![target_deck_id, now, id],
            )?;

            let (front, back, deck_name, source_quote): (String, String, String, Option<String>) = tx.query_row(
                "SELECT c.front, c.back, d.name, cs.quote FROM cards c JOIN decks d ON c.deck_id = d.id LEFT JOIN card_sources cs ON cs.card_id = c.id WHERE c.id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            )?;

            let mut tags_stmt = tx.prepare("SELECT t.name FROM tags t JOIN card_tags ct ON ct.tag_id=t.id WHERE ct.card_id=?1 ORDER BY ct.rowid")?;
            let tags = tags_stmt
                .query_map(params![id], |r| r.get(0))?
                .collect::<std::result::Result<Vec<String>, _>>()?;

            let quote = source_quote.unwrap_or_default();
            let body = format!(
                "{} {} {} {} {}",
                front,
                back,
                deck_name,
                tags.join(" "),
                quote.trim()
            );
            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![id])?;
            tx.execute(
                "INSERT INTO card_text(card_id, body) VALUES(?1, ?2)",
                params![id, body],
            )?;
        }

        tx.commit()?;

        let count = ids.len();
        Ok(BulkResult {
            affected_ids: ids,
            affected_count: count,
        })
    }

    pub fn delete_cards_permanently(&mut self, card_ids: &[String]) -> Result<BulkResult> {
        let ids = validate_and_deduplicate_ids(card_ids)?;

        let tx = self.connection.transaction()?;
        for id in &ids {
            let deleted_at: Option<String> = tx
                .query_row(
                    "SELECT deleted_at FROM cards WHERE id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .optional()?
                .ok_or_else(|| invalid(&format!("card {} not found", id)))?;

            if deleted_at.is_none() {
                return Err(invalid(&format!("card {} is not in Trash", id)));
            }

            tx.execute("DELETE FROM cards WHERE id = ?1", params![id])?;
            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![id])?;
        }

        tx.commit()?;

        let count = ids.len();
        Ok(BulkResult {
            affected_ids: ids,
            affected_count: count,
        })
    }

    pub fn empty_trash(&mut self) -> Result<BulkResult> {
        let tx = self.connection.transaction()?;

        let trashed_ids: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM cards WHERE deleted_at IS NOT NULL")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };

        for id in &trashed_ids {
            tx.execute("DELETE FROM cards WHERE id = ?1", params![id])?;
            tx.execute("DELETE FROM card_text WHERE card_id = ?1", params![id])?;
        }

        tx.commit()?;

        let count = trashed_ids.len();
        Ok(BulkResult {
            affected_ids: trashed_ids,
            affected_count: count,
        })
    }
}

fn encode_cursor(value: &str, id: &str) -> String {
    let cursor_json = serde_json::to_string(&(value, id)).unwrap();
    URL_SAFE_NO_PAD.encode(cursor_json.as_bytes())
}

fn decode_cursor(cursor: &str) -> Result<(String, String)> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| invalid("invalid cursor encoding"))?;
    let decoded: (String, String) =
        serde_json::from_slice(&bytes).map_err(|_| invalid("invalid cursor json"))?;
    Ok(decoded)
}

fn validate_state(state: &str) -> Result<()> {
    match state {
        "new" | "learning" | "review" | "relearning" | "suspended" => Ok(()),
        _ => Err(LibraryDbError::InvalidLearning(format!(
            "invalid state: {}",
            state
        ))),
    }
}

fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn validate_and_deduplicate_ids(card_ids: &[String]) -> Result<Vec<String>> {
    if card_ids.is_empty() {
        return Err(invalid("card IDs list cannot be empty"));
    }
    let mut ids = Vec::new();
    for id in card_ids {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(invalid("card ID cannot be empty"));
        }
        if !ids.contains(&trimmed.to_string()) {
            ids.push(trimmed.to_string());
        }
    }
    Ok(ids)
}

fn verify_all_cards_active(tx: &rusqlite::Transaction<'_>, ids: &[String]) -> Result<()> {
    for id in ids {
        let active: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE id = ?1 AND deleted_at IS NULL)",
            params![id],
            |r| r.get(0),
        )?;
        if !active {
            return Err(invalid(&format!("card {} not found or is in Trash", id)));
        }
    }
    Ok(())
}
