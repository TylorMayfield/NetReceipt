use crate::models::{Config, Sample};
use rusqlite::Connection;
use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Mutex,
};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub config: Mutex<Config>,
    pub current: Mutex<Option<Sample>>,
    pub running: AtomicBool,
    pub worker_generation: AtomicU64,
    pub failures: Mutex<u32>,
}
