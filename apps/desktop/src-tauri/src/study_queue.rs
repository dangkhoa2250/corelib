use chrono::{DateTime, Duration, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::library_db::{LibraryDatabase, LibraryDbError, Result};
use crate::model::LearningCardSummary;
use crate::scheduler::{
    CardScheduleInput, CardState, ReviewPreview, ReviewScheduler, SchedulerConfig,
};

const SCHEDULER_VERSION: &str = "memora-learning-v2+fsrs-6.6.0";

#[derive(Clone, Debug, PartialEq)]
pub enum StudyScope {
    All,
    Deck(String),
}

#[derive(Clone, Debug)]
pub struct StudyCounts {
    pub learning: usize,
    pub review: usize,
    pub new: usize,
}

#[derive(Clone, Debug)]
pub struct StudyGrant {
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub card: LearningCardSummary,
    pub preview: ReviewPreview,
}

#[derive(Clone, Debug)]
pub struct StudySession {
    pub session_id: String,
    pub scope: StudyScope,
    pub cards: Vec<StudyGrant>,
    pub counts: StudyCounts,
    pub next_learning_due_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MemoraSettings {
    pub new_cards_per_day: i64,
    pub desired_retention: f64,
}

pub struct MemoraSettingsUpdate {
    pub new_cards_per_day: i64,
    pub desired_retention: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DeckLearningSettings {
    pub deck_id: String,
    pub inherited_new_cards_per_day: i64,
    pub new_cards_per_day: Option<i64>,
    pub effective_new_cards_per_day: i64,
}

pub enum DeckLearningSettingsUpdate {
    Inherit,
    Custom(i64),
}

fn validate_new_cards_per_day(value: i64) -> Result<()> {
    if (0..=999).contains(&value) {
        Ok(())
    } else {
        Err(LibraryDbError::InvalidLearning(
            "new cards per day must be between 0 and 999".into(),
        ))
    }
}

fn validate_retention(value: f64) -> Result<()> {
    if value.is_finite() && (0.80..=0.97).contains(&value) {
        Ok(())
    } else {
        Err(LibraryDbError::InvalidLearning(
            "desired retention must be between 0.80 and 0.97".into(),
        ))
    }
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

impl LibraryDatabase {
    pub fn memora_settings(&self) -> Result<MemoraSettings> {
        self.connection
            .query_row(
                "SELECT new_cards_per_day, desired_retention FROM memora_settings WHERE id = 1",
                [],
                |row| {
                    Ok(MemoraSettings {
                        new_cards_per_day: row.get(0)?,
                        desired_retention: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn update_memora_settings(&mut self, update: MemoraSettingsUpdate) -> Result<MemoraSettings> {
        validate_new_cards_per_day(update.new_cards_per_day)?;
        validate_retention(update.desired_retention)?;
        self.connection.execute(
            "UPDATE memora_settings
               SET new_cards_per_day = ?1, desired_retention = ?2, updated_at = ?3
             WHERE id = 1",
            params![update.new_cards_per_day, update.desired_retention, now()],
        )?;
        self.memora_settings()
    }

    fn deck_exists(&self, deck_id: &str) -> Result<()> {
        let exists: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
            params![deck_id],
            |row| row.get(0),
        )?;
        if exists {
            Ok(())
        } else {
            Err(LibraryDbError::InvalidLearning("deck not found".into()))
        }
    }

    pub fn deck_learning_settings(&self, deck_id: &str) -> Result<DeckLearningSettings> {
        self.deck_exists(deck_id)?;
        let inherited = self.memora_settings()?.new_cards_per_day;
        let new_cards_per_day: Option<i64> = self
            .connection
            .query_row(
                "SELECT new_cards_per_day FROM deck_learning_settings WHERE deck_id = ?1",
                params![deck_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(DeckLearningSettings {
            deck_id: deck_id.to_owned(),
            inherited_new_cards_per_day: inherited,
            new_cards_per_day,
            effective_new_cards_per_day: new_cards_per_day.unwrap_or(inherited),
        })
    }

    pub fn update_deck_learning_settings(
        &mut self,
        deck_id: &str,
        update: DeckLearningSettingsUpdate,
    ) -> Result<DeckLearningSettings> {
        self.deck_exists(deck_id)?;
        match update {
            DeckLearningSettingsUpdate::Custom(value) => {
                validate_new_cards_per_day(value)?;
                self.connection.execute(
                    "INSERT INTO deck_learning_settings(deck_id, new_cards_per_day, updated_at)
                     VALUES(?1, ?2, ?3)
                     ON CONFLICT(deck_id) DO UPDATE SET
                       new_cards_per_day = excluded.new_cards_per_day,
                       updated_at = excluded.updated_at",
                    params![deck_id, value, now()],
                )?;
            }
            DeckLearningSettingsUpdate::Inherit => {
                self.connection.execute(
                    "DELETE FROM deck_learning_settings WHERE deck_id = ?1",
                    params![deck_id],
                )?;
            }
        }
        self.deck_learning_settings(deck_id)
    }

    pub fn start_study_session(
        &mut self,
        scope: StudyScope,
        now: DateTime<Utc>,
        study_day: &str,
    ) -> Result<StudySession> {
        NaiveDate::parse_from_str(study_day, "%Y-%m-%d")
            .map_err(|_| LibraryDbError::InvalidLearning("invalid study day".into()))?;
        let now_str = rfc3339(now);

        self.connection.execute(
            "DELETE FROM study_sessions WHERE expires_at <= ?1",
            params![now_str],
        )?;

        let session_id = Uuid::new_v4().to_string();
        let (scope_kind, deck_id) = match &scope {
            StudyScope::All => ("all", None),
            StudyScope::Deck(id) => ("deck", Some(id.clone())),
        };
        let expires_at = rfc3339(now + Duration::hours(24));
        self.connection.execute(
            "INSERT INTO study_sessions(id, scope_kind, deck_id, created_at, expires_at)
             VALUES(?1, ?2, ?3, ?4, ?5)",
            params![session_id, scope_kind, deck_id, now_str, expires_at],
        )?;

        let settings = self.memora_settings()?;
        let scheduler = ReviewScheduler::new(SchedulerConfig {
            desired_retention: settings.desired_retention as f32,
            version: SCHEDULER_VERSION.into(),
        })
        .map_err(|error| LibraryDbError::InvalidLearning(error.to_string()))?;

        let cards =
            self.grant_available_cards(&session_id, &scope, now, study_day, &scheduler, false)?;
        let counts = count_grants(&cards);
        let next_learning_due_at = self.next_learning_due_at(&scope, now)?;

        Ok(StudySession {
            session_id,
            scope,
            cards,
            counts,
            next_learning_due_at,
        })
    }

    pub fn refresh_study_session(
        &mut self,
        session_id: &str,
        now: DateTime<Utc>,
        study_day: &str,
    ) -> Result<StudySession> {
        NaiveDate::parse_from_str(study_day, "%Y-%m-%d")
            .map_err(|_| LibraryDbError::InvalidLearning("invalid study day".into()))?;
        let now_str = rfc3339(now);

        let session: Option<(String, Option<String>, String)> = self
            .connection
            .query_row(
                "SELECT scope_kind, deck_id, expires_at FROM study_sessions WHERE id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let (scope_kind, deck_id, expires_at) = session
            .ok_or_else(|| LibraryDbError::InvalidLearning("study session not found".into()))?;
        if expires_at.as_str() <= now_str.as_str() {
            return Err(LibraryDbError::InvalidLearning(
                "study session has expired".into(),
            ));
        }
        let scope = match scope_kind.as_str() {
            "deck" => StudyScope::Deck(
                deck_id.ok_or_else(|| {
                    LibraryDbError::InvalidLearning("study session is missing a deck".into())
                })?,
            ),
            _ => StudyScope::All,
        };

        let settings = self.memora_settings()?;
        let scheduler = ReviewScheduler::new(SchedulerConfig {
            desired_retention: settings.desired_retention as f32,
            version: SCHEDULER_VERSION.into(),
        })
        .map_err(|error| LibraryDbError::InvalidLearning(error.to_string()))?;

        self.grant_available_cards(session_id, &scope, now, study_day, &scheduler, true)?;

        let cards = self.open_grants(session_id, now, &scheduler)?;
        let counts = count_grants(&cards);
        let next_learning_due_at = self.next_learning_due_at(&scope, now)?;

        Ok(StudySession {
            session_id: session_id.to_string(),
            scope,
            cards,
            counts,
            next_learning_due_at,
        })
    }

    fn grant_available_cards(
        &mut self,
        session_id: &str,
        scope: &StudyScope,
        now: DateTime<Utc>,
        study_day: &str,
        scheduler: &ReviewScheduler,
        exclude_open_grants: bool,
    ) -> Result<Vec<StudyGrant>> {
        let now_str = rfc3339(now);
        let deck_filter: Option<&str> = match scope {
            StudyScope::All => None,
            StudyScope::Deck(id) => Some(id.as_str()),
        };

        let mut ordered_ids: Vec<String> = Vec::new();

        let exclusion = if exclude_open_grants {
            " AND NOT EXISTS (SELECT 1 FROM study_session_cards grants WHERE grants.session_id = ?3 AND grants.card_id = cards.id AND grants.consumed_at IS NULL)"
        } else {
            ""
        };

        let learning_sql = format!(
            "SELECT id FROM cards WHERE state IN ('learning','relearning') AND due_at <= ?1 AND deleted_at IS NULL AND (?2 IS NULL OR deck_id = ?2){exclusion} ORDER BY due_at ASC, id ASC"
        );
        let review_sql = format!(
            "SELECT id FROM cards WHERE state = 'review' AND due_at <= ?1 AND deleted_at IS NULL AND (?2 IS NULL OR deck_id = ?2){exclusion} ORDER BY due_at ASC, id ASC"
        );

        for id in self.select_ids(&learning_sql, &now_str, deck_filter, session_id, exclude_open_grants)? {
            ordered_ids.push(id);
        }
        for id in self.select_ids(&review_sql, &now_str, deck_filter, session_id, exclude_open_grants)? {
            ordered_ids.push(id);
        }

        let decks = match scope {
            StudyScope::Deck(id) => vec![id.clone()],
            StudyScope::All => {
                let mut stmt = self.connection.prepare(
                    "SELECT DISTINCT deck_id FROM cards WHERE state = 'new' AND deleted_at IS NULL ORDER BY deck_id ASC",
                )?;
                let rows = stmt
                    .query_map([], |row| row.get::<_, String>(0))?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            }
        };

        for deck in decks {
            let effective_limit = self.deck_learning_settings(&deck)?.effective_new_cards_per_day;
            let introduced: i64 = self.connection.query_row(
                "SELECT COUNT(*) FROM card_introductions WHERE deck_id = ?1 AND study_day = ?2",
                params![deck, study_day],
                |row| row.get(0),
            )?;
            let remaining = (effective_limit - introduced).max(0);
            if remaining == 0 {
                continue;
            }
            let new_sql = if exclude_open_grants {
                "SELECT id FROM cards WHERE state = 'new' AND deleted_at IS NULL AND deck_id = ?1 AND id NOT IN (SELECT card_id FROM card_introductions) AND NOT EXISTS (SELECT 1 FROM study_session_cards grants WHERE grants.session_id = ?3 AND grants.card_id = cards.id AND grants.consumed_at IS NULL) ORDER BY created_at ASC, id ASC LIMIT ?2"
            } else {
                "SELECT id FROM cards WHERE state = 'new' AND deleted_at IS NULL AND deck_id = ?1 AND id NOT IN (SELECT card_id FROM card_introductions) ORDER BY created_at ASC, id ASC LIMIT ?2"
            };
            let mut stmt = self.connection.prepare(new_sql)?;
            let rows = if exclude_open_grants {
                stmt.query_map(params![deck, remaining, session_id], |row| {
                    row.get::<_, String>(0)
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?
            } else {
                stmt.query_map(params![deck, remaining], |row| row.get::<_, String>(0))?
                    .collect::<std::result::Result<Vec<_>, _>>()?
            };
            for id in rows {
                ordered_ids.push(id);
            }
        }

        let mut grants = Vec::with_capacity(ordered_ids.len());
        for id in ordered_ids {
            let card = self
                .card_by_id(&id)?
                .ok_or(LibraryDbError::DocumentNotFound)?;
            let memory = self.card_memory_state(&id)?;
            let input = CardScheduleInput {
                state: parse_card_state(&card.state)?,
                learning_step: card
                    .learning_step
                    .map(|step| {
                        u8::try_from(step).map_err(|_| {
                            LibraryDbError::InvalidLearning("invalid learning step".into())
                        })
                    })
                    .transpose()?,
                memory_state_json: memory,
                elapsed_days: 0,
            };
            let preview = scheduler
                .preview(input, now)
                .map_err(|error| LibraryDbError::InvalidLearning(error.to_string()))?;
            let grant_token = Uuid::new_v4().to_string();
            let admitted_as_new = i64::from(card.state == "new");
            self.connection.execute(
                "INSERT INTO study_session_cards(id, session_id, card_id, grant_token, expected_state, expected_due_at, admitted_as_new, granted_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    session_id,
                    card.id,
                    grant_token,
                    card.state,
                    card.due_at,
                    admitted_as_new,
                    now_str,
                ],
            )?;
            grants.push(StudyGrant {
                grant_token,
                expected_state: card.state.clone(),
                expected_due_at: card.due_at.clone(),
                card,
                preview,
            });
        }
        Ok(grants)
    }

    fn select_ids(
        &self,
        sql: &str,
        now_str: &str,
        deck_filter: Option<&str>,
        session_id: &str,
        exclude_open_grants: bool,
    ) -> Result<Vec<String>> {
        let mut stmt = self.connection.prepare(sql)?;
        let rows = if exclude_open_grants {
            stmt.query_map(params![now_str, deck_filter, session_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?
        } else {
            stmt.query_map(params![now_str, deck_filter], |row| row.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        Ok(rows)
    }

    fn open_grants(
        &self,
        session_id: &str,
        now: DateTime<Utc>,
        scheduler: &ReviewScheduler,
    ) -> Result<Vec<StudyGrant>> {
        let mut stmt = self.connection.prepare(
            "SELECT grants.card_id, grants.grant_token, grants.expected_state, grants.expected_due_at
             FROM study_session_cards grants
             JOIN cards ON cards.id = grants.card_id
             WHERE grants.session_id = ?1 AND grants.consumed_at IS NULL AND cards.deleted_at IS NULL
             ORDER BY
               CASE
                 WHEN cards.state IN ('learning','relearning') THEN 0
                 WHEN cards.state = 'review' THEN 1
                 ELSE 2
               END ASC,
               cards.due_at ASC,
               cards.id ASC",
        )?;
        let rows = stmt
            .query_map(params![session_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut grants = Vec::with_capacity(rows.len());
        for (card_id, grant_token, expected_state, expected_due_at) in rows {
            let card = self
                .card_by_id(&card_id)?
                .ok_or(LibraryDbError::DocumentNotFound)?;
            let memory = self.card_memory_state(&card_id)?;
            let input = CardScheduleInput {
                state: parse_card_state(&card.state)?,
                learning_step: card
                    .learning_step
                    .map(|step| {
                        u8::try_from(step).map_err(|_| {
                            LibraryDbError::InvalidLearning("invalid learning step".into())
                        })
                    })
                    .transpose()?,
                memory_state_json: memory,
                elapsed_days: 0,
            };
            let preview = scheduler
                .preview(input, now)
                .map_err(|error| LibraryDbError::InvalidLearning(error.to_string()))?;
            grants.push(StudyGrant {
                grant_token,
                expected_state,
                expected_due_at,
                card,
                preview,
            });
        }
        Ok(grants)
    }

    fn next_learning_due_at(
        &self,
        scope: &StudyScope,
        now: DateTime<Utc>,
    ) -> Result<Option<String>> {
        let now_str = rfc3339(now);
        let deck_filter: Option<&str> = match scope {
            StudyScope::All => None,
            StudyScope::Deck(id) => Some(id.as_str()),
        };
        let due: Option<String> = self.connection.query_row(
            "SELECT MIN(due_at) FROM cards WHERE state IN ('learning','relearning') AND due_at > ?1 AND deleted_at IS NULL AND (?2 IS NULL OR deck_id = ?2)",
            params![now_str, deck_filter],
            |row| row.get(0),
        )?;
        Ok(due)
    }
}

fn rfc3339(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn count_grants(grants: &[StudyGrant]) -> StudyCounts {
    let mut counts = StudyCounts {
        learning: 0,
        review: 0,
        new: 0,
    };
    for grant in grants {
        match grant.card.state.as_str() {
            "learning" | "relearning" => counts.learning += 1,
            "review" => counts.review += 1,
            "new" => counts.new += 1,
            _ => {}
        }
    }
    counts
}

fn parse_card_state(state: &str) -> Result<CardState> {
    match state {
        "new" => Ok(CardState::New),
        "learning" => Ok(CardState::Learning),
        "review" => Ok(CardState::Review),
        "relearning" => Ok(CardState::Relearning),
        "suspended" => Ok(CardState::Suspended),
        other => Err(LibraryDbError::InvalidLearning(format!(
            "invalid card state: {other}"
        ))),
    }
}
