use crate::{
    database,
    models::{Config, Sample},
    state::AppState,
};
use std::{
    net::{TcpStream, ToSocketAddrs},
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

pub fn start(app: AppHandle) {
    let state = app.state::<AppState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }

    let generation = state.worker_generation.fetch_add(1, Ordering::SeqCst) + 1;
    thread::spawn(move || run_worker(app, generation));
}

pub fn stop(state: &AppState) {
    state.running.store(false, Ordering::SeqCst);
    state.worker_generation.fetch_add(1, Ordering::SeqCst);
}

fn run_worker(app: AppHandle, generation: u64) {
    loop {
        let state = app.state::<AppState>();
        if !is_current_worker(&state, generation) {
            break;
        }

        let config = state.config.lock().unwrap().clone();
        let sample = probe(&config);
        if let Err(error) = record_sample(&state, &app, sample) {
            let _ = app.emit("monitor-error", error);
        }

        // Short sleeps make pause responsive without keeping multiple worker loops alive.
        let mut remaining = Duration::from_secs(config.interval_seconds);
        while remaining > Duration::ZERO && is_current_worker(&state, generation) {
            let slice = remaining.min(Duration::from_millis(250));
            thread::sleep(slice);
            remaining = remaining.saturating_sub(slice);
        }
    }
}

fn is_current_worker(state: &AppState, generation: u64) -> bool {
    state.running.load(Ordering::SeqCst)
        && state.worker_generation.load(Ordering::SeqCst) == generation
}

fn probe(config: &Config) -> Sample {
    let timeout = Duration::from_secs(config.timeout_seconds.max(1));
    sample_from_results(
        tcp_probe(&config.host, timeout),
        dns_probe(&config.host),
        https_probe(&config.host, timeout),
        config.latency_threshold_ms,
        now(),
    )
}

fn sample_from_results(
    (tcp_ok, tcp_ms): (bool, Option<u64>),
    (dns_ok, dns_ms): (bool, Option<u64>),
    (https_ok, https_ms): (bool, Option<u64>),
    latency_threshold_ms: u64,
    timestamp: i64,
) -> Sample {
    let latencies = [tcp_ms, dns_ms, https_ms]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let status = classify(tcp_ok, dns_ok, https_ok, &latencies, latency_threshold_ms);
    let explanation = match status {
        "healthy" => "All reference checks completed within the configured threshold.",
        "slow" => "Connectivity succeeded, but at least one check exceeded the latency threshold.",
        "interrupted" => "The reference server could not be reached by any check.",
        _ => "Some checks failed while others succeeded; the result is inconclusive.",
    };

    Sample {
        id: 0,
        timestamp,
        status: status.into(),
        explanation: explanation.into(),
        latency_ms: tcp_ms,
        dns_ok,
        https_ok,
        tcp_ok,
        dns_latency_ms: dns_ms,
        https_latency_ms: https_ms,
    }
}

fn classify(
    tcp_ok: bool,
    dns_ok: bool,
    https_ok: bool,
    latencies: &[u64],
    threshold: u64,
) -> &'static str {
    if !tcp_ok && !dns_ok && !https_ok {
        "interrupted"
    } else if !tcp_ok || !dns_ok || !https_ok {
        "unknown"
    } else if latencies.iter().any(|latency| *latency > threshold) {
        "slow"
    } else {
        "healthy"
    }
}

fn record_sample(state: &AppState, app: &AppHandle, mut sample: Sample) -> Result<(), String> {
    let config = state.config.lock().unwrap().clone();
    {
        let connection = state.db.lock().unwrap();
        database::insert_sample(&connection, &mut sample)
            .map_err(|error| format!("Could not save the latest connection sample: {error}"))?;
        let cutoff = now() - i64::from(config.retention_days.max(1)) * 86_400;
        database::prune_before(&connection, cutoff)
            .map_err(|error| format!("Could not prune expired connection history: {error}"))?;
    }

    let previous = state.current.lock().unwrap().replace(sample.clone());
    let failure_count = {
        let mut failures = state.failures.lock().unwrap();
        if sample.status == "healthy" {
            *failures = 0
        } else {
            *failures += 1
        };
        *failures
    };

    let status_changed = previous
        .as_ref()
        .is_some_and(|prior| prior.status != sample.status);
    let should_notify = config.notifications
        && notification_due(
            &sample.status,
            status_changed,
            failure_count,
            config.failure_tolerance,
        );
    if should_notify {
        let title = if sample.status == "healthy" {
            "Connection recovered"
        } else {
            "Connection status changed"
        };
        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(&sample.explanation)
            .show();
    }
    app.emit("sample", &sample)
        .map_err(|error| format!("Could not update the dashboard: {error}"))?;
    Ok(())
}

fn notification_due(
    status: &str,
    status_changed: bool,
    failure_count: u32,
    tolerance: u32,
) -> bool {
    (status == "healthy" && status_changed)
        || (status != "healthy" && failure_count == tolerance.max(1))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn dns_probe(host: &str) -> (bool, Option<u64>) {
    let start = Instant::now();
    let resolved = (host, 443)
        .to_socket_addrs()
        .is_ok_and(|mut addresses| addresses.next().is_some());
    if resolved {
        (true, Some(start.elapsed().as_millis() as u64))
    } else {
        (false, None)
    }
}

fn tcp_probe(host: &str, timeout: Duration) -> (bool, Option<u64>) {
    let start = Instant::now();
    let Ok(addresses) = (host, 443).to_socket_addrs() else {
        return (false, None);
    };
    for address in addresses {
        if TcpStream::connect_timeout(&address, timeout).is_ok() {
            return (true, Some(start.elapsed().as_millis() as u64));
        }
    }
    (false, None)
}

fn https_probe(host: &str, timeout: Duration) -> (bool, Option<u64>) {
    let start = Instant::now();
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .build()
        .new_agent();
    match agent.get(format!("https://{host}/")).call() {
        Ok(_) | Err(ureq::Error::StatusCode(_)) => (true, Some(start.elapsed().as_millis() as u64)),
        Err(_) => (false, None),
    }
}

#[cfg(test)]
mod tests {
    use super::{classify, notification_due, sample_from_results};

    #[test]
    fn classifies_probe_results() {
        assert_eq!(classify(true, true, true, &[10, 20, 30], 100), "healthy");
        assert_eq!(classify(true, true, true, &[10, 120], 100), "slow");
        assert_eq!(classify(true, false, true, &[10, 20], 100), "unknown");
        assert_eq!(classify(false, false, false, &[], 100), "interrupted");
    }

    #[test]
    fn notifies_once_when_failure_tolerance_is_reached() {
        assert!(!notification_due("interrupted", true, 1, 3));
        assert!(notification_due("interrupted", false, 3, 3));
        assert!(!notification_due("interrupted", false, 4, 3));
        assert!(notification_due("healthy", true, 0, 3));
    }

    #[test]
    fn sample_latency_is_tcp_connect_time() {
        let sample = sample_from_results(
            (true, Some(42)),
            (true, Some(8)),
            (true, Some(75)),
            100,
            123,
        );
        assert_eq!(sample.latency_ms, Some(42));
        assert_eq!(sample.dns_latency_ms, Some(8));
        assert_eq!(sample.https_latency_ms, Some(75));
        assert_eq!(sample.timestamp, 123);
    }
}
