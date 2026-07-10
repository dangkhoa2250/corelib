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

    pub fn count_cards_in_deck(&self, id: &str) -> Result<i64> {
        self.connection
            .query_row(
                "SELECT COUNT(*) FROM cards WHERE deck_id=?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(Into::into)
    }

    /// Deletes a deck along with every card that belongs to it (and, via
    /// their `ON DELETE CASCADE` foreign keys, each card's review logs and
    /// tags). The host UI is expected to warn the user with the card count
    /// (see `count_cards_in_deck`) before calling this.
    pub fn delete_deck(&mut self, id: &str) -> Result<()> {
        let tx = self.connection.transaction()?;
        tx.execute("DELETE FROM cards WHERE deck_id=?1", params![id])?;
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
                "SELECT memory_state_json FROM cards WHERE id=?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(Into::into)
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

fn learning_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl LibraryDatabase {
    pub fn create_card(&mut self, input: NewCard) -> Result<LearningCardSummary> {
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
        tx.execute("INSERT INTO cards (id,deck_id,front,back,state,due_at,reps,lapses,created_at,updated_at) VALUES (?1,?2,?3,?4,'new',?5,0,0,?5,?5)", params![id, deck_id, front, back, now])?;
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
        let mut stmt = self.connection.prepare("SELECT id FROM cards WHERE state IN ('new','learning','review','relearning') AND due_at <= ?1 ORDER BY due_at,id LIMIT ?2")?;
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
        let exists = self.connection.query_row("SELECT id,deck_id,front,back,state,due_at,reps,lapses,stability,difficulty,last_review_at FROM cards WHERE id=?1", params![id], |r| self.hydrate_card(r)).optional()?;
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
            .prepare("SELECT id FROM cards WHERE deck_id=?1 ORDER BY created_at ASC, id ASC")?;
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
        let reviewed_at = learning_timestamp();
        let changed = tx.execute("UPDATE cards SET state=?1,due_at=?2,stability=?3,difficulty=?4,memory_state_json=?5,reps=reps+1,lapses=lapses+CASE WHEN ?6='again' THEN 1 ELSE 0 END,last_review_at=?7,updated_at=?7 WHERE id=?8 AND state=?9 AND due_at=?10", params![next_state,next_due_at,review.stability,review.difficulty,review.memory_state_json,rating,reviewed_at,review.card_id,prior_state,prior_due_at])?;
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
        let mut stmt = self.connection.prepare("SELECT c.id,c.front,d.name,cs.document_id FROM card_text ft JOIN cards c ON c.id=ft.card_id JOIN decks d ON d.id=c.deck_id LEFT JOIN card_sources cs ON cs.card_id=c.id WHERE card_text MATCH ?1 LIMIT ?2")?;
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
}
