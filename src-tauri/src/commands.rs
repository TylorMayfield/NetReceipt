use crate::{
    database, export, history,
    models::{Config, HistoryOverview, Sample},
    monitor,
    state::AppState,
};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_config(state: State<'_, AppState>, config: Config) -> Result<(), String> {
    config.validate()?;
    database::save_config(&state.db.lock().unwrap(), &config)?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn get_current(state: State<'_, AppState>) -> Option<Sample> {
    state.current.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_history(state: State<'_, AppState>, limit: u32) -> Result<Vec<Sample>, String> {
    database::history(&state.db.lock().unwrap(), limit)
}

#[tauri::command]
pub fn get_history_overview(
    state: State<'_, AppState>,
    start_timestamp: i64,
    end_timestamp: i64,
    max_points: u32,
) -> Result<HistoryOverview, String> {
    let config = state.config.lock().unwrap().clone();
    let (start, end) = validated_range(start_timestamp, end_timestamp, config.retention_days)?;
    let samples = database::history_between(&state.db.lock().unwrap(), start, end)?;
    Ok(history::overview(
        &samples,
        start,
        end,
        max_points.clamp(60, 360),
        config.failure_tolerance,
        config.interval_seconds,
        now(),
    ))
}

#[tauri::command]
pub fn write_history_export(
    state: State<'_, AppState>,
    path: String,
    format: String,
    start_timestamp: i64,
    end_timestamp: i64,
) -> Result<(), String> {
    let config = state.config.lock().unwrap().clone();
    let (start, end) = validated_range(start_timestamp, end_timestamp, config.retention_days)?;
    let samples = database::history_between(&state.db.lock().unwrap(), start, end)?;
    let overview = history::overview(
        &samples,
        start,
        end,
        240,
        config.failure_tolerance,
        config.interval_seconds,
        now(),
    );
    export::write(&path, &format, &samples, &overview, &config, now())
}

#[tauri::command]
pub fn set_monitoring(state: State<'_, AppState>, app: AppHandle, enabled: bool) {
    if enabled {
        monitor::start(app);
    } else if state.running.load(Ordering::SeqCst) {
        monitor::stop(&state);
    }
}

fn validated_range(start: i64, end: i64, retention_days: u32) -> Result<(i64, i64), String> {
    if start >= end {
        return Err("History start must be before its end.".into());
    }
    let current = now();
    let bounded_end = end.min(current);
    if start >= bounded_end {
        return Err("History range must begin before the current time.".into());
    }
    let retained_start = bounded_end - i64::from(retention_days.max(1)) * 86_400;
    Ok((start.max(retained_start), bounded_end))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
