use chrono::{TimeZone, Timelike, Utc};

use crate::scheduler::{
    CardScheduleInput, CardState, Rating, ReviewScheduler, SchedulerConfig,
};

fn fixed_now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 7, 10, 5, 30, 0)
        .single()
        .expect("fixed timestamp")
        .with_nanosecond(123_000_000)
        .expect("fixed timestamp")
}

fn input(state: CardState, learning_step: Option<u8>) -> CardScheduleInput {
    CardScheduleInput {
        state,
        learning_step,
        memory_state_json: None,
        elapsed_days: 0,
    }
}

#[test]
fn scheduler_config_defaults_to_fsrs_retention_and_version() {
    let config = SchedulerConfig::default();

    assert_eq!(config.desired_retention, 0.9);
    assert_eq!(config.version, "memora-learning-v2+fsrs-6.6.0");
}

#[test]
fn new_card_uses_fixed_learning_steps() {
    let scheduler = ReviewScheduler::default();
    let now = fixed_now();

    let again = scheduler
        .apply(input(CardState::New, None), Rating::Again, now)
        .unwrap();
    assert_eq!(
        (again.state, again.learning_step, again.interval_seconds),
        (CardState::Learning, Some(0), 60)
    );

    let hard = scheduler
        .apply(input(CardState::New, None), Rating::Hard, now)
        .unwrap();
    assert_eq!(
        (hard.state, hard.learning_step, hard.interval_seconds),
        (CardState::Learning, Some(0), 360)
    );

    let good = scheduler
        .apply(input(CardState::New, None), Rating::Good, now)
        .unwrap();
    assert_eq!(
        (good.state, good.learning_step, good.interval_seconds),
        (CardState::Learning, Some(1), 600)
    );

    let easy = scheduler
        .apply(input(CardState::New, None), Rating::Easy, now)
        .unwrap();
    assert_eq!(easy.state, CardState::Review);
    assert_eq!(easy.learning_step, None);
}

#[test]
fn final_learning_good_graduates_to_fsrs_review() {
    let scheduled = ReviewScheduler::default()
        .apply(input(CardState::Learning, Some(1)), Rating::Good, fixed_now())
        .unwrap();
    assert_eq!(scheduled.state, CardState::Review);
    assert_eq!(scheduled.learning_step, None);
    assert!(scheduled.memory_state_json.is_some());
}

#[test]
fn review_again_enters_relearning_and_records_one_lapse() {
    let mut review = input(CardState::Review, None);
    review.memory_state_json = Some(r#"{"stability":3.0,"difficulty":5.0}"#.into());
    review.elapsed_days = 4;

    let scheduled = ReviewScheduler::default()
        .apply(review, Rating::Again, fixed_now())
        .unwrap();
    assert_eq!(scheduled.state, CardState::Relearning);
    assert_eq!(scheduled.learning_step, Some(0));
    assert_eq!(scheduled.interval_seconds, 600);
    assert!(scheduled.increment_lapses);
}

#[test]
fn relearning_again_does_not_increment_lapses_again() {
    let mut relearning = input(CardState::Relearning, Some(0));
    relearning.memory_state_json = Some(r#"{"stability":1.0,"difficulty":6.0}"#.into());
    let scheduled = ReviewScheduler::default()
        .apply(relearning, Rating::Again, fixed_now())
        .unwrap();
    assert!(!scheduled.increment_lapses);
}

#[test]
fn graduated_review_memory_state_uses_stability_and_difficulty_json() {
    let scheduled = ReviewScheduler::default()
        .apply(input(CardState::New, None), Rating::Easy, fixed_now())
        .unwrap();
    let memory = scheduled.memory_state_json.expect("graduated memory state");
    assert!(memory.contains("stability"));
    assert!(memory.contains("difficulty"));
    assert!(scheduled.stability.is_some());
    assert!(scheduled.difficulty.is_some());
    assert!(scheduled.due_at.ends_with('Z'));
}

#[test]
fn scheduler_rejects_invalid_state_and_step_combinations() {
    let scheduler = ReviewScheduler::default();
    let now = fixed_now();

    assert!(scheduler
        .apply(input(CardState::New, Some(0)), Rating::Good, now)
        .is_err());
    assert!(scheduler
        .apply(input(CardState::Learning, None), Rating::Good, now)
        .is_err());
    assert!(scheduler
        .apply(input(CardState::Learning, Some(2)), Rating::Good, now)
        .is_err());
    assert!(scheduler
        .apply(input(CardState::Relearning, Some(1)), Rating::Good, now)
        .is_err());
    assert!(scheduler
        .apply(input(CardState::Suspended, None), Rating::Good, now)
        .is_err());
}

#[test]
fn invalid_stored_memory_state_returns_a_safe_error() {
    let mut review = input(CardState::Review, None);
    review.memory_state_json = Some("{not json}".into());
    let error = ReviewScheduler::default()
        .apply(review, Rating::Good, fixed_now())
        .expect_err("reject invalid stored state");

    assert_eq!(error.to_string(), "Card memory state is invalid.");
}

fn valid_inputs() -> Vec<CardScheduleInput> {
    let review_memory = Some(r#"{"stability":3.0,"difficulty":5.0}"#.to_string());
    let relearn_memory = Some(r#"{"stability":1.0,"difficulty":6.0}"#.to_string());
    vec![
        input(CardState::New, None),
        CardScheduleInput {
            state: CardState::Learning,
            learning_step: Some(0),
            memory_state_json: None,
            elapsed_days: 0,
        },
        CardScheduleInput {
            state: CardState::Learning,
            learning_step: Some(1),
            memory_state_json: None,
            elapsed_days: 0,
        },
        CardScheduleInput {
            state: CardState::Review,
            learning_step: None,
            memory_state_json: review_memory,
            elapsed_days: 4,
        },
        CardScheduleInput {
            state: CardState::Relearning,
            learning_step: Some(0),
            memory_state_json: relearn_memory,
            elapsed_days: 0,
        },
    ]
}

#[test]
fn apply_matches_preview_projection_for_every_rating() {
    let scheduler = ReviewScheduler::default();
    let now = fixed_now();

    for input in valid_inputs() {
        let preview = scheduler.preview(input.clone(), now).expect("preview");
        for rating in [Rating::Again, Rating::Hard, Rating::Good, Rating::Easy] {
            let applied = scheduler
                .apply(input.clone(), rating, now)
                .expect("apply rating");
            let projected = match rating {
                Rating::Again => &preview.again,
                Rating::Hard => &preview.hard,
                Rating::Good => &preview.good,
                Rating::Easy => &preview.easy,
            };
            assert_eq!(&applied, projected);
        }
    }
}
