use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};

use crate::library_db::{LibraryDatabase, LibraryDbError, Result};

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
}
