use std::fmt;

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use fsrs::{ItemState, MemoryState, NextStates, FSRS};
use serde::{Deserialize, Serialize};

const SECONDS_PER_DAY: f64 = 86_400.0;
const MINIMUM_INTERVAL_SECONDS: i64 = 60;

const AGAIN_LEARNING_SECONDS: i64 = 60;
const HARD_LEARNING_SECONDS: i64 = 360;
const GOOD_LEARNING_SECONDS: i64 = 600;
const RELEARNING_SECONDS: i64 = 600;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CardState {
    New,
    Learning,
    Review,
    Relearning,
    Suspended,
}

impl CardState {
    fn as_str(self) -> &'static str {
        match self {
            Self::New => "new",
            Self::Learning => "learning",
            Self::Review => "review",
            Self::Relearning => "relearning",
            Self::Suspended => "suspended",
        }
    }
}

#[derive(Clone, Debug)]
pub struct CardScheduleInput {
    pub state: CardState,
    pub learning_step: Option<u8>,
    pub memory_state_json: Option<String>,
    pub elapsed_days: u32,
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
            version: "memora-learning-v2+fsrs-6.6.0".into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ScheduledState {
    pub state: CardState,
    #[serde(rename = "learningStep")]
    pub learning_step: Option<u8>,
    #[serde(rename = "dueAt")]
    pub due_at: String,
    #[serde(rename = "intervalSeconds")]
    pub interval_seconds: i64,
    pub stability: Option<f32>,
    pub difficulty: Option<f32>,
    #[serde(rename = "memoryStateJson")]
    pub memory_state_json: Option<String>,
    #[serde(skip)]
    pub increment_lapses: bool,
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
    InvalidCardState,
    InvalidMemoryState,
    SchedulingFailed,
    SerializationFailed,
}

impl fmt::Display for SchedulerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidConfig => "Scheduler configuration is invalid.",
            Self::InvalidCardState => "Card state is invalid for scheduling.",
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
        input: CardScheduleInput,
        now: DateTime<Utc>,
    ) -> Result<ReviewPreview, SchedulerError> {
        validate_config(&self.config)?;
        validate_input(&input)?;

        Ok(ReviewPreview {
            again: self.transition(&input, Rating::Again, now)?,
            hard: self.transition(&input, Rating::Hard, now)?,
            good: self.transition(&input, Rating::Good, now)?,
            easy: self.transition(&input, Rating::Easy, now)?,
        })
    }

    pub fn apply(
        &self,
        input: CardScheduleInput,
        rating: Rating,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        validate_config(&self.config)?;
        validate_input(&input)?;
        self.transition(&input, rating, now)
    }

    fn transition(
        &self,
        input: &CardScheduleInput,
        rating: Rating,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        let memory = input.memory_state_json.as_deref();
        match (input.state, rating) {
            (CardState::New, Rating::Again) => {
                Ok(fixed(CardState::Learning, Some(0), AGAIN_LEARNING_SECONDS, None, now)?)
            }
            (CardState::New, Rating::Hard) => {
                Ok(fixed(CardState::Learning, Some(0), HARD_LEARNING_SECONDS, None, now)?)
            }
            (CardState::New, Rating::Good) => {
                Ok(fixed(CardState::Learning, Some(1), GOOD_LEARNING_SECONDS, None, now)?)
            }
            (CardState::New, Rating::Easy) => self.graduate_with_fsrs(None, Rating::Easy, input, now),

            (CardState::Learning, Rating::Again) => {
                Ok(fixed(CardState::Learning, Some(0), AGAIN_LEARNING_SECONDS, memory, now)?)
            }
            (CardState::Learning, Rating::Hard) => Ok(fixed(
                CardState::Learning,
                input.learning_step,
                HARD_LEARNING_SECONDS,
                memory,
                now,
            )?),
            (CardState::Learning, Rating::Good) if input.learning_step == Some(0) => {
                Ok(fixed(CardState::Learning, Some(1), GOOD_LEARNING_SECONDS, memory, now)?)
            }
            (CardState::Learning, Rating::Good | Rating::Easy) => {
                self.graduate_with_fsrs(memory, rating, input, now)
            }

            (CardState::Review, Rating::Again) => {
                self.relearn_with_fsrs(memory, true, input, now)
            }
            (CardState::Review, Rating::Hard | Rating::Good | Rating::Easy) => {
                self.review_with_fsrs(memory, rating, input, now)
            }

            (CardState::Relearning, Rating::Again | Rating::Hard) => {
                self.relearn_with_fsrs(memory, false, input, now)
            }
            (CardState::Relearning, Rating::Good | Rating::Easy) => {
                self.review_with_fsrs(memory, rating, input, now)
            }

            _ => Err(SchedulerError::InvalidCardState),
        }
    }

    fn next_states(
        &self,
        memory: Option<&str>,
        elapsed_days: u32,
    ) -> Result<NextStates, SchedulerError> {
        let previous_state = parse_memory_state(memory)?;
        FSRS::default()
            .next_states(previous_state, self.config.desired_retention, elapsed_days)
            .map_err(|_| SchedulerError::SchedulingFailed)
    }

    fn graduate_with_fsrs(
        &self,
        memory: Option<&str>,
        rating: Rating,
        input: &CardScheduleInput,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        let next_states = self.next_states(memory, input.elapsed_days)?;
        let item_state = rating_item_state(next_states, rating);
        review_scheduled_state(CardState::Review, None, item_state, false, now)
    }

    fn review_with_fsrs(
        &self,
        memory: Option<&str>,
        rating: Rating,
        input: &CardScheduleInput,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        let next_states = self.next_states(memory, input.elapsed_days)?;
        let item_state = rating_item_state(next_states, rating);
        review_scheduled_state(CardState::Review, None, item_state, false, now)
    }

    fn relearn_with_fsrs(
        &self,
        memory: Option<&str>,
        is_from_review: bool,
        input: &CardScheduleInput,
        now: DateTime<Utc>,
    ) -> Result<ScheduledState, SchedulerError> {
        let next_states = self.next_states(memory, input.elapsed_days)?;
        let item_state = next_states.again;
        let memory_state_json = serialize_memory_state(&item_state.memory)?;
        let due_at = due_at(now, RELEARNING_SECONDS)?;

        Ok(ScheduledState {
            state: CardState::Relearning,
            learning_step: Some(0),
            due_at,
            interval_seconds: RELEARNING_SECONDS,
            stability: Some(item_state.memory.stability),
            difficulty: Some(item_state.memory.difficulty),
            memory_state_json: Some(memory_state_json),
            increment_lapses: is_from_review,
        })
    }
}

#[derive(Deserialize, Serialize)]
struct StoredMemoryState {
    stability: f32,
    difficulty: f32,
}

fn validate_config(config: &SchedulerConfig) -> Result<(), SchedulerError> {
    if config.desired_retention.is_finite() && (0.80..=0.97).contains(&config.desired_retention) {
        Ok(())
    } else {
        Err(SchedulerError::InvalidConfig)
    }
}

fn validate_input(input: &CardScheduleInput) -> Result<(), SchedulerError> {
    match (input.state, input.learning_step) {
        (CardState::New | CardState::Review, None) => Ok(()),
        (CardState::Learning, Some(0 | 1)) => Ok(()),
        (CardState::Relearning, Some(0)) => Ok(()),
        _ => Err(SchedulerError::InvalidCardState),
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

fn rating_item_state(next_states: NextStates, rating: Rating) -> ItemState {
    match rating {
        Rating::Again => next_states.again,
        Rating::Hard => next_states.hard,
        Rating::Good => next_states.good,
        Rating::Easy => next_states.easy,
    }
}

fn serialize_memory_state(memory: &MemoryState) -> Result<String, SchedulerError> {
    serde_json::to_string(&StoredMemoryState {
        stability: memory.stability,
        difficulty: memory.difficulty,
    })
    .map_err(|_| SchedulerError::SerializationFailed)
}

fn fixed(
    state: CardState,
    learning_step: Option<u8>,
    interval_seconds: i64,
    memory: Option<&str>,
    now: DateTime<Utc>,
) -> Result<ScheduledState, SchedulerError> {
    let parsed = parse_memory_state(memory)?;
    let due_at = due_at(now, interval_seconds)?;
    let memory_state_json = memory.map(|value| value.to_string());

    Ok(ScheduledState {
        state,
        learning_step,
        due_at,
        interval_seconds,
        stability: parsed.map(|memory| memory.stability),
        difficulty: parsed.map(|memory| memory.difficulty),
        memory_state_json,
        increment_lapses: false,
    })
}

fn review_scheduled_state(
    state: CardState,
    learning_step: Option<u8>,
    item_state: ItemState,
    increment_lapses: bool,
    now: DateTime<Utc>,
) -> Result<ScheduledState, SchedulerError> {
    let interval_seconds = interval_seconds(item_state.interval)?;
    let due_at = due_at(now, interval_seconds)?;
    let memory_state_json = serialize_memory_state(&item_state.memory)?;

    Ok(ScheduledState {
        state,
        learning_step,
        due_at,
        interval_seconds,
        stability: Some(item_state.memory.stability),
        difficulty: Some(item_state.memory.difficulty),
        memory_state_json: Some(memory_state_json),
        increment_lapses,
    })
}

fn due_at(now: DateTime<Utc>, interval_seconds: i64) -> Result<String, SchedulerError> {
    Ok(now
        .checked_add_signed(Duration::seconds(interval_seconds))
        .ok_or(SchedulerError::SchedulingFailed)?
        .to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn interval_seconds(interval_days: f32) -> Result<i64, SchedulerError> {
    let seconds = f64::from(interval_days) * SECONDS_PER_DAY;
    if !seconds.is_finite() || seconds > i64::MAX as f64 {
        return Err(SchedulerError::SchedulingFailed);
    }

    Ok(seconds.round().max(MINIMUM_INTERVAL_SECONDS as f64) as i64)
}

impl CardState {
    pub fn label(self) -> &'static str {
        self.as_str()
    }
}
