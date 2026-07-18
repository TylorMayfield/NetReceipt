use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    pub interval_seconds: u64,
    pub timeout_seconds: u64,
    pub latency_threshold_ms: u64,
    pub failure_tolerance: u32,
    pub retention_days: u32,
    pub notifications: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: default_host(),
            interval_seconds: 30,
            timeout_seconds: 5,
            latency_threshold_ms: 250,
            failure_tolerance: 3,
            retention_days: 30,
            notifications: true,
        }
    }
}

impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if !valid_host(&self.host) {
            return Err(
                "Host must be a hostname or IPv4 address without a scheme, port, or path.".into(),
            );
        }
        if !(5..=86_400).contains(&self.interval_seconds) {
            return Err("Interval must be between 5 and 86400 seconds.".into());
        }
        if self.timeout_seconds == 0 || self.timeout_seconds > self.interval_seconds {
            return Err(
                "Timeout must be greater than zero and no longer than the interval.".into(),
            );
        }
        if self.latency_threshold_ms == 0 || self.retention_days == 0 {
            return Err("Latency threshold and retention must be greater than zero.".into());
        }
        if self.failure_tolerance == 0 {
            return Err("Alert tolerance must be greater than zero.".into());
        }
        Ok(())
    }
}

fn default_host() -> String {
    "one.one.one.one".into()
}

fn valid_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host.trim() == host
        && !host
            .chars()
            .any(|character| character.is_whitespace() || "/:?#@".contains(character))
        && host
            .split('.')
            .all(|label| !label.is_empty() && label.len() <= 63)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub id: i64,
    pub timestamp: i64,
    pub status: String,
    pub explanation: String,
    pub latency_ms: Option<u64>,
    pub dns_ok: bool,
    pub https_ok: bool,
    pub tcp_ok: bool,
    pub dns_latency_ms: Option<u64>,
    pub https_latency_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    pub timestamp: i64,
    pub average_latency_ms: Option<u64>,
    pub peak_latency_ms: Option<u64>,
    pub status: String,
    pub sample_count: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub start_timestamp: i64,
    pub end_timestamp: Option<i64>,
    pub duration_seconds: i64,
    pub status: String,
    pub sample_count: u32,
    pub peak_latency_ms: Option<u64>,
    pub active: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub sample_count: u32,
    pub average_latency_ms: Option<u64>,
    pub peak_latency_ms: Option<u64>,
    pub incident_count: u32,
    pub total_incident_seconds: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOverview {
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub bucket_seconds: i64,
    pub points: Vec<HistoryPoint>,
    pub summary: HistorySummary,
    pub incidents: Vec<Incident>,
}

#[cfg(test)]
mod tests {
    use super::Config;

    #[test]
    fn rejects_timeout_longer_than_interval() {
        let config = Config {
            timeout_seconds: 31,
            ..Config::default()
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn validates_config_boundaries() {
        assert!(Config {
            host: "https://example.com".into(),
            ..Config::default()
        }
        .validate()
        .is_err());
        assert!(Config {
            interval_seconds: 5,
            timeout_seconds: 5,
            ..Config::default()
        }
        .validate()
        .is_ok());
        assert!(Config {
            interval_seconds: 4,
            ..Config::default()
        }
        .validate()
        .is_err());
        assert!(Config {
            interval_seconds: 86_401,
            ..Config::default()
        }
        .validate()
        .is_err());
        assert!(Config {
            failure_tolerance: 0,
            ..Config::default()
        }
        .validate()
        .is_err());
        assert!(Config {
            latency_threshold_ms: 0,
            ..Config::default()
        }
        .validate()
        .is_err());
        assert!(Config {
            retention_days: 0,
            ..Config::default()
        }
        .validate()
        .is_err());
    }
}
