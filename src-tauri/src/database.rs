use crate::models::{Config, Sample};
use rusqlite::{params, Connection};

pub fn initialize(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS samples (
            id INTEGER PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL,
            explanation TEXT NOT NULL,
            latency_ms INTEGER,
            dns_ok INTEGER NOT NULL,
            https_ok INTEGER NOT NULL,
            tcp_ok INTEGER NOT NULL,
            dns_latency_ms INTEGER,
            https_latency_ms INTEGER
        );
        CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_samples_timestamp ON samples(timestamp);",
    )
}

pub fn read_config(connection: &Connection) -> Config {
    connection
        .query_row("SELECT json FROM config WHERE id = 1", [], |row| {
            row.get::<_, String>(0)
        })
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

pub fn save_config(connection: &Connection, config: &Config) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO config(id, json) VALUES(1, ?1)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json",
            [json],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn insert_sample(connection: &Connection, sample: &mut Sample) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO samples(timestamp, status, explanation, latency_ms, dns_ok, https_ok, tcp_ok, dns_latency_ms, https_latency_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            sample.timestamp,
            sample.status,
            sample.explanation,
            sample.latency_ms,
            sample.dns_ok,
            sample.https_ok,
            sample.tcp_ok,
            sample.dns_latency_ms,
            sample.https_latency_ms,
        ],
    )?;
    sample.id = connection.last_insert_rowid();
    Ok(())
}

pub fn prune_before(connection: &Connection, cutoff: i64) -> rusqlite::Result<usize> {
    connection.execute("DELETE FROM samples WHERE timestamp < ?", [cutoff])
}

pub fn history(connection: &Connection, limit: u32) -> Result<Vec<Sample>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, timestamp, status, explanation, latency_ms, dns_ok, https_ok, tcp_ok, dns_latency_ms, https_latency_ms
             FROM samples ORDER BY timestamp DESC LIMIT ?",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([limit.min(500)], |row| {
            Ok(Sample {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                status: row.get(2)?,
                explanation: row.get(3)?,
                latency_ms: row.get(4)?,
                dns_ok: row.get::<_, i32>(5)? != 0,
                https_ok: row.get::<_, i32>(6)? != 0,
                tcp_ok: row.get::<_, i32>(7)? != 0,
                dns_latency_ms: row.get(8)?,
                https_latency_ms: row.get(9)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

pub fn history_between(
    connection: &Connection,
    start_timestamp: i64,
    end_timestamp: i64,
) -> Result<Vec<Sample>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, timestamp, status, explanation, latency_ms, dns_ok, https_ok, tcp_ok, dns_latency_ms, https_latency_ms
             FROM samples WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY timestamp ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![start_timestamp, end_timestamp], |row| {
            Ok(Sample {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                status: row.get(2)?,
                explanation: row.get(3)?,
                latency_ms: row.get(4)?,
                dns_ok: row.get::<_, i32>(5)? != 0,
                https_ok: row.get::<_, i32>(6)? != 0,
                tcp_ok: row.get::<_, i32>(7)? != 0,
                dns_latency_ms: row.get(8)?,
                https_latency_ms: row.get(9)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

pub fn history_analysis_between(
    connection: &Connection,
    start_timestamp: i64,
    end_timestamp: i64,
) -> Result<Vec<Sample>, String> {
    let mut statement = connection
        .prepare(
            "SELECT timestamp, status, latency_ms
             FROM samples WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY timestamp ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![start_timestamp, end_timestamp], |row| {
            let latency_ms = row.get(2)?;
            Ok(Sample {
                id: 0,
                timestamp: row.get(0)?,
                status: row.get(1)?,
                explanation: String::new(),
                latency_ms,
                dns_ok: false,
                https_ok: false,
                tcp_ok: latency_ms.is_some(),
                dns_latency_ms: None,
                https_latency_ms: None,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        history, history_analysis_between, history_between, initialize, insert_sample, prune_before,
    };
    use crate::models::Sample;
    use rusqlite::Connection;

    fn sample(timestamp: i64) -> Sample {
        Sample {
            id: 0,
            timestamp,
            status: "healthy".into(),
            explanation: "Test sample".into(),
            latency_ms: Some(10),
            dns_ok: true,
            https_ok: true,
            tcp_ok: true,
            dns_latency_ms: Some(11),
            https_latency_ms: Some(12),
        }
    }

    #[test]
    fn history_is_newest_first_and_prunes_old_samples() {
        let connection = Connection::open_in_memory().unwrap();
        initialize(&connection).unwrap();
        for timestamp in [100, 300, 200] {
            insert_sample(&connection, &mut sample(timestamp)).unwrap();
        }

        let timestamps = history(&connection, 10)
            .unwrap()
            .into_iter()
            .map(|item| item.timestamp)
            .collect::<Vec<_>>();
        assert_eq!(timestamps, vec![300, 200, 100]);

        assert_eq!(prune_before(&connection, 200).unwrap(), 1);
        let timestamps = history(&connection, 10)
            .unwrap()
            .into_iter()
            .map(|item| item.timestamp)
            .collect::<Vec<_>>();
        assert_eq!(timestamps, vec![300, 200]);
    }

    #[test]
    fn range_history_is_oldest_first_and_inclusive() {
        let connection = Connection::open_in_memory().unwrap();
        initialize(&connection).unwrap();
        for timestamp in [100, 300, 200, 400] {
            insert_sample(&connection, &mut sample(timestamp)).unwrap();
        }
        let timestamps = history_between(&connection, 200, 300)
            .unwrap()
            .into_iter()
            .map(|item| item.timestamp)
            .collect::<Vec<_>>();
        assert_eq!(timestamps, vec![200, 300]);

        let analysis = history_analysis_between(&connection, 200, 300).unwrap();
        assert_eq!(analysis.len(), 2);
        assert!(analysis.iter().all(|item| item.explanation.is_empty()));
        assert!(analysis.iter().all(|item| item.latency_ms == Some(10)));
    }
}
