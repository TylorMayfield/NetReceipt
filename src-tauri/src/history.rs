use crate::models::{HistoryOverview, HistoryPoint, HistorySummary, Incident, Sample};

pub fn overview(
    samples: &[Sample],
    start_timestamp: i64,
    end_timestamp: i64,
    max_points: u32,
    failure_tolerance: u32,
    interval_seconds: u64,
    now_timestamp: i64,
) -> HistoryOverview {
    let range_seconds = (end_timestamp - start_timestamp).max(1);
    let bucket_seconds = ((range_seconds + 1 + i64::from(max_points.max(1)) - 1)
        / i64::from(max_points.max(1)))
    .max(1);

    let points = aggregate_points(samples, start_timestamp, bucket_seconds);
    let mut summary = summarize(samples);
    let mut incidents = derive_incidents(
        samples,
        failure_tolerance.max(1),
        interval_seconds.max(1) as i64,
        end_timestamp,
        now_timestamp,
    );
    summary.incident_count = incidents.len() as u32;
    summary.total_incident_seconds = incidents.iter().map(|item| item.duration_seconds).sum();
    incidents.reverse();

    HistoryOverview {
        start_timestamp,
        end_timestamp,
        bucket_seconds,
        points,
        summary,
        incidents,
    }
}

fn aggregate_points(
    samples: &[Sample],
    start_timestamp: i64,
    bucket_seconds: i64,
) -> Vec<HistoryPoint> {
    struct Bucket {
        index: i64,
        timestamp: i64,
        latency_sum: u128,
        latency_count: u64,
        peak: Option<u64>,
        status: String,
        sample_count: u32,
    }

    fn finish(bucket: Bucket) -> HistoryPoint {
        HistoryPoint {
            timestamp: bucket.timestamp,
            average_latency_ms: (bucket.latency_count > 0)
                .then(|| (bucket.latency_sum / u128::from(bucket.latency_count)) as u64),
            peak_latency_ms: bucket.peak,
            status: bucket.status,
            sample_count: bucket.sample_count,
        }
    }

    let mut result = Vec::new();
    let mut current: Option<Bucket> = None;
    for sample in samples {
        let index = (sample.timestamp - start_timestamp).max(0) / bucket_seconds;
        if current.as_ref().is_some_and(|bucket| bucket.index != index) {
            result.push(finish(current.take().unwrap()));
        }
        let bucket = current.get_or_insert_with(|| Bucket {
            index,
            timestamp: sample.timestamp,
            latency_sum: 0,
            latency_count: 0,
            peak: None,
            status: "healthy".into(),
            sample_count: 0,
        });
        bucket.timestamp = sample.timestamp;
        bucket.sample_count += 1;
        if severity(&sample.status) > severity(&bucket.status) {
            bucket.status = sample.status.clone();
        }
        if let Some(latency) = sample.latency_ms {
            bucket.latency_sum += u128::from(latency);
            bucket.latency_count += 1;
            bucket.peak = Some(bucket.peak.map_or(latency, |peak| peak.max(latency)));
        }
    }
    if let Some(bucket) = current {
        result.push(finish(bucket));
    }
    result
}

fn summarize(samples: &[Sample]) -> HistorySummary {
    let values = samples.iter().filter_map(|sample| sample.latency_ms);
    let mut count = 0_u64;
    let mut sum = 0_u128;
    let mut peak = None;
    for value in values {
        count += 1;
        sum += u128::from(value);
        peak = Some(peak.map_or(value, |current: u64| current.max(value)));
    }
    HistorySummary {
        sample_count: samples.len() as u32,
        average_latency_ms: (count > 0).then(|| (sum / u128::from(count)) as u64),
        peak_latency_ms: peak,
        ..HistorySummary::default()
    }
}

fn derive_incidents(
    samples: &[Sample],
    tolerance: u32,
    interval_seconds: i64,
    range_end: i64,
    now_timestamp: i64,
) -> Vec<Incident> {
    #[derive(Clone)]
    struct Run {
        start: i64,
        last: i64,
        status: String,
        count: u32,
        peak: Option<u64>,
    }

    fn finish(run: Run, end: Option<i64>, active: bool, tolerance: u32) -> Option<Incident> {
        (run.count >= tolerance).then(|| {
            let duration_end = end.unwrap_or(run.last);
            Incident {
                start_timestamp: run.start,
                end_timestamp: if active { None } else { end },
                duration_seconds: (duration_end - run.start).max(0),
                status: run.status,
                sample_count: run.count,
                peak_latency_ms: run.peak,
                active,
            }
        })
    }

    let gap_limit = (interval_seconds * 3).max(1);
    let mut incidents = Vec::new();
    let mut run: Option<Run> = None;
    let mut previous_timestamp = None;

    for sample in samples {
        if previous_timestamp.is_some_and(|previous| sample.timestamp - previous > gap_limit) {
            if let Some(prior) = run
                .take()
                .and_then(|item| finish(item, None, false, tolerance))
            {
                incidents.push(prior);
            }
        }
        previous_timestamp = Some(sample.timestamp);

        if sample.status == "healthy" {
            if let Some(prior) = run
                .take()
                .and_then(|item| finish(item, Some(sample.timestamp), false, tolerance))
            {
                incidents.push(prior);
            }
            continue;
        }

        let current = run.get_or_insert_with(|| Run {
            start: sample.timestamp,
            last: sample.timestamp,
            status: sample.status.clone(),
            count: 0,
            peak: None,
        });
        current.last = sample.timestamp;
        current.count += 1;
        if severity(&sample.status) > severity(&current.status) {
            current.status = sample.status.clone();
        }
        if let Some(latency) = sample.latency_ms {
            current.peak = Some(current.peak.map_or(latency, |peak| peak.max(latency)));
        }
    }

    if let Some(last_run) = run {
        let coverage_current =
            range_end >= now_timestamp - gap_limit && last_run.last >= now_timestamp - gap_limit;
        let end = coverage_current.then_some(now_timestamp);
        if let Some(prior) = finish(last_run, end, coverage_current, tolerance) {
            incidents.push(prior);
        }
    }
    incidents
}

fn severity(status: &str) -> u8 {
    match status {
        "interrupted" => 3,
        "unknown" => 2,
        "slow" => 1,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::overview;
    use crate::models::Sample;

    fn sample(timestamp: i64, status: &str, latency: Option<u64>) -> Sample {
        Sample {
            id: timestamp,
            timestamp,
            status: status.into(),
            explanation: "Test".into(),
            latency_ms: latency,
            dns_ok: status != "interrupted",
            https_ok: status != "interrupted",
            tcp_ok: status != "interrupted",
            dns_latency_ms: latency,
            https_latency_ms: latency,
        }
    }

    #[test]
    fn aggregates_points_and_preserves_worst_status() {
        let samples = vec![
            sample(0, "healthy", Some(10)),
            sample(10, "slow", Some(30)),
            sample(70, "healthy", Some(20)),
        ];
        let result = overview(&samples, 0, 120, 2, 2, 10, 120);
        assert_eq!(result.points.len(), 2);
        assert_eq!(result.points[0].average_latency_ms, Some(20));
        assert_eq!(result.points[0].status, "slow");
        assert_eq!(result.summary.average_latency_ms, Some(20));
        assert_eq!(result.summary.peak_latency_ms, Some(30));
    }

    #[test]
    fn confirms_incidents_at_tolerance_and_closes_on_recovery() {
        let samples = vec![
            sample(0, "healthy", Some(10)),
            sample(30, "slow", Some(300)),
            sample(60, "unknown", Some(20)),
            sample(90, "interrupted", None),
            sample(120, "healthy", Some(10)),
        ];
        let result = overview(&samples, 0, 180, 60, 3, 30, 180);
        assert_eq!(result.incidents.len(), 1);
        assert_eq!(result.incidents[0].start_timestamp, 30);
        assert_eq!(result.incidents[0].end_timestamp, Some(120));
        assert_eq!(result.incidents[0].duration_seconds, 90);
        assert_eq!(result.incidents[0].status, "interrupted");
    }

    #[test]
    fn monitoring_gaps_split_runs_and_are_not_counted_as_downtime() {
        let samples = vec![
            sample(0, "interrupted", None),
            sample(30, "interrupted", None),
            sample(60, "interrupted", None),
            sample(400, "interrupted", None),
            sample(430, "interrupted", None),
            sample(460, "interrupted", None),
        ];
        let result = overview(&samples, 0, 500, 60, 3, 30, 1_000);
        assert_eq!(result.incidents.len(), 2);
        assert_eq!(result.summary.total_incident_seconds, 120);
        assert!(result.incidents.iter().all(|incident| !incident.active));
    }
}
