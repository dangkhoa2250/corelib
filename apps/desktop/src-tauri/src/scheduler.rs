use std::fmt;

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use fsrs::{ItemState, MemoryState, FSRS};
use serde::{Deserialize, Serialize};

const SECONDS_PER_DAY: f64 = 86_400.0;
const MINIMUM_INTERVAL_SECONDS: i64 = 60;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SchedulerConfig {
    #[serde(rename = "desiredRetention")]
    pub desired_retention: f32,
    pub version: String,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            desired_retention: 0.9,
            version: "fsrs-6.6.0".into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ScheduledState {
    pub state: String,
    #[serde(rename = "dueAt")]
    pub due_at: String,
    #[serde(rename = "intervalSeconds")]
    pub interval_seconds: i64,
    pub stability: Option<f32>,
    pub difficulty: Option<f32>,
    #[serde(rename = "memoryStateJson")]
    pub memory_state_json: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ReviewPreview {
    pub again: ScheduledState,
    pub hard: ScheduledState,
    pub good: ScheduledState,
    pub easy: ScheduledState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SchedulerError {
    InvalidConfig,
    InvalidMemoryState,
    SchedulingFailed,
    SerializationFailed,
}

impl fmt::Display for SchedulerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidConfig => "Scheduler configuration is invalid.",
            Self::InvalidMemoryState => "Card memory state is invalid.",
            Self::SchedulingFailed => "The card could not be scheduled.",
            Self::SerializationFailed => "The scheduled memory state could not be saved.",
        };

        formatter.write_str(message)
    }
}

impl std::error::Error for SchedulerError {}

#[derive(Clone, Debug, Default)]
pub struct ReviewScheduler {
    config: SchedulerConfig,
}

impl ReviewScheduler {
    pub fn new(config: SchedulerConfig) -> Result<Self, SchedulerError> {
        validate_config(&config)?;
        Ok(Self { config })
    }

    pub fn config(&self) -> &SchedulerConfig {
        &self.config
    }

    pub fn preview(
        &self,
        memory_state: Option<&str>,
        elapsed_days: u32,
        now: DateTime<Utc>,
    ) -> Result<ReviewPreview, SchedulerError> {
        validate_config(&self.config)?;
        let previous_state = parse_memory_state(memory_state)?;
        let is_existing_card = previous_state.is_some();
        let next_states = FSRS::default()
            .next_states(previous_state, self.config.desired_retention, elapsed_days)
            .map_err(|_| SchedulerError::SchedulingFailed)?;

        Ok(ReviewPreview {
            again: scheduled_state(
                if is_existing_card {
                    "relearning"
                } else {
                    "learning"
                },
                next_states.again,
                now,
            )?,
            hard: scheduled_state("review", next_states.hard, now)?,
            good: scheduled_state("review", next_states.good, now)?,
            easy: scheduled_state("review", next_states.easy, now)?,
        })
    }

    pub fn apply(
        &self,
        memory_state: Option<&str>,
        elapsed_days: u32,
        rating: Rating,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        let preview = self.preview(memory_state, elapsed_days, now)?;

        Ok(match rating {
            Rating::Again => preview.again,
            Rating::Hard => preview.hard,
            Rating::Good => preview.good,
            Rating::Easy => preview.easy,
        })
    }
}

#[derive(Deserialize, Serialize)]
struct StoredMemoryState {
    stability: f32,
    difficulty: f32,
}

fn validate_config(config: &SchedulerConfig) -> Result<(), SchedulerError> {
    if config.desired_retention.is_finite()
        && config.desired_retention > 0.0
        && config.desired_retention < 1.0
    {
        Ok(())
    } else {
        Err(SchedulerError::InvalidConfig)
    }
}

fn parse_memory_state(value: Option<&str>) -> Result<Option<MemoryState>, SchedulerError> {
    value
        .map(|value| {
            let stored: StoredMemoryState =
                serde_json::from_str(value).map_err(|_| SchedulerError::InvalidMemoryState)?;
            if !stored.stability.is_finite() || !stored.difficulty.is_finite() {
                return Err(SchedulerError::InvalidMemoryState);
            }

            Ok(MemoryState {
                stability: stored.stability,
                difficulty: stored.difficulty,
            })
        })
        .transpose()
}

fn scheduled_state(
    state: &str,
    item_state: ItemState,
    now: DateTime<Utc>,
) -> Result<ScheduledState, SchedulerError> {
    let interval_seconds = interval_seconds(item_state.interval)?;
    let due_at = now
        .checked_add_signed(Duration::seconds(interval_seconds))
        .ok_or(SchedulerError::SchedulingFailed)?
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let memory_state_json = serde_json::to_string(&StoredMemoryState {
        stability: item_state.memory.stability,
        difficulty: item_state.memory.difficulty,
    })
    .map_err(|_| SchedulerError::SerializationFailed)?;

    Ok(ScheduledState {
        state: state.into(),
        due_at,
        interval_seconds,
        stability: Some(item_state.memory.stability),
        difficulty: Some(item_state.memory.difficulty),
        memory_state_json,
    })
}

fn interval_seconds(interval_days: f32) -> Result<i64, SchedulerError> {
    let seconds = f64::from(interval_days) * SECONDS_PER_DAY;
    if !seconds.is_finite() || seconds > i64::MAX as f64 {
        return Err(SchedulerError::SchedulingFailed);
    }

    Ok(seconds.round().max(MINIMUM_INTERVAL_SECONDS as f64) as i64)
}
