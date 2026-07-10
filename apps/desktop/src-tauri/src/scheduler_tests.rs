use chrono::{TimeZone, Utc};

use crate::scheduler::{Rating, ReviewScheduler, SchedulerConfig};

fn fixed_now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 7, 10, 5, 30, 0)
        .single()
        .expect("fixed timestamp")
}

#[test]
fn scheduler_config_defaults_to_fsrs_retention_and_version() {
    let config = SchedulerConfig::default();

    assert_eq!(config.desired_retention, 0.9);
    assert_eq!(config.version, "fsrs-6.6.0");
}

#[test]
fn new_cards_preview_all_four_ratings_with_nonzero_intervals() {
    let preview = ReviewScheduler::default()
        .preview(None, 0, fixed_now())
        .expect("preview a new card");

    assert!(preview.again.interval_seconds >= 60);
    assert!(preview.hard.interval_seconds >= 60);
    assert!(preview.good.interval_seconds >= 60);
    assert!(preview.easy.interval_seconds >= preview.good.interval_seconds);
    assert_eq!(preview.again.state, "learning");
    assert_eq!(preview.good.state, "review");
}

#[test]
fn stored_memory_state_rates_again_sooner_than_good() {
    let scheduler = ReviewScheduler::default();
    let initial = scheduler
        .apply(None, 0, Rating::Good, fixed_now())
        .expect("schedule an initial good rating");

    let preview = scheduler
        .preview(Some(&initial.memory_state_json), 4, fixed_now())
        .expect("preview a stored memory state");

    assert!(preview.again.interval_seconds < preview.good.interval_seconds);
    assert_eq!(preview.again.state, "relearning");
    assert_eq!(preview.good.state, "review");
}

#[test]
fn apply_returns_the_selected_rating_schedule() {
    let scheduler = ReviewScheduler::default();
    let preview = scheduler
        .preview(None, 0, fixed_now())
        .expect("preview a new card");
    let scheduled = scheduler
        .apply(None, 0, Rating::Easy, fixed_now())
        .expect("apply easy rating");

    assert_eq!(scheduled, preview.easy);
    assert!(scheduled.memory_state_json.contains("stability"));
    assert!(scheduled.due_at.ends_with('Z'));
}

#[test]
fn invalid_stored_memory_state_returns_a_safe_error() {
    let error = ReviewScheduler::default()
        .preview(Some("{not json}"), 1, fixed_now())
        .expect_err("reject invalid stored state");

    assert_eq!(error.to_string(), "Card memory state is invalid.");
}
