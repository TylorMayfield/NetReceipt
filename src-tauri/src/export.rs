use crate::models::{Config, HistoryOverview, Sample};
use chrono::{DateTime, Utc};

pub fn write(
    path: &str,
    format: &str,
    samples: &[Sample],
    overview: &HistoryOverview,
    config: &Config,
    generated_at: i64,
) -> Result<(), String> {
    let content = match format {
        "csv" => csv(samples),
        "markdown" => markdown(samples, overview, config, generated_at),
        _ => return Err("Unsupported export format.".into()),
    };
    std::fs::write(path, content).map_err(|error| error.to_string())
}

pub fn csv(samples: &[Sample]) -> String {
    let mut output = "timestamp_utc,status,explanation,tcp_latency_ms,dns_latency_ms,https_latency_ms,dns_ok,https_ok,tcp_ok\n".to_string();
    for sample in samples {
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            csv_cell(&iso_timestamp(sample.timestamp)),
            csv_cell(&sample.status),
            csv_cell(&sample.explanation),
            optional_number(sample.latency_ms),
            optional_number(sample.dns_latency_ms),
            optional_number(sample.https_latency_ms),
            sample.dns_ok,
            sample.https_ok,
            sample.tcp_ok,
        ));
    }
    output
}

pub fn markdown(
    _samples: &[Sample],
    overview: &HistoryOverview,
    config: &Config,
    generated_at: i64,
) -> String {
    let summary = &overview.summary;
    let mut output = format!(
        "# NetReceipt Connection Report\n\n\
         Generated: {}  \n\
         Monitored host: `{}`  \n\
         Period: {} to {}\n\n\
         ## Summary\n\n\
         | Measurement | Result |\n|---|---:|\n\
         | Samples | {} |\n\
         | Average TCP latency | {} |\n\
         | Peak TCP latency | {} |\n\
         | Confirmed incidents | {} |\n\
         | Total impacted time | {} |\n\n\
         ## Incidents\n\n",
        iso_timestamp(generated_at),
        config.host,
        iso_timestamp(overview.start_timestamp),
        iso_timestamp(overview.end_timestamp),
        summary.sample_count,
        format_latency(summary.average_latency_ms),
        format_latency(summary.peak_latency_ms),
        summary.incident_count,
        format_duration(summary.total_incident_seconds),
    );

    if overview.incidents.is_empty() {
        output.push_str("No confirmed connection incidents were detected in this period.\n");
    } else {
        output.push_str("| Started (UTC) | Ended (UTC) | Status | Duration | Peak TCP | Samples |\n|---|---|---|---:|---:|---:|\n");
        for incident in overview.incidents.iter().rev() {
            let end = if incident.active {
                "Ongoing".into()
            } else {
                incident
                    .end_timestamp
                    .map(iso_timestamp)
                    .unwrap_or_else(|| "Monitoring gap".into())
            };
            output.push_str(&format!(
                "| {} | {} | {} | {} | {} | {} |\n",
                iso_timestamp(incident.start_timestamp),
                end,
                incident.status,
                format_duration(incident.duration_seconds),
                format_latency(incident.peak_latency_ms),
                incident.sample_count,
            ));
        }
    }
    output.push_str(
        "\n---\nGenerated locally by NetReceipt. Connection measurements were not uploaded.\n",
    );
    output
}

fn iso_timestamp(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp, 0)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
        .to_rfc3339()
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn optional_number(value: Option<u64>) -> String {
    value.map(|item| item.to_string()).unwrap_or_default()
}

fn format_latency(value: Option<u64>) -> String {
    value
        .map(|item| format!("{item} ms"))
        .unwrap_or_else(|| "—".into())
}

fn format_duration(seconds: i64) -> String {
    if seconds < 60 {
        format!("{} sec", seconds.max(0))
    } else if seconds < 3_600 {
        format!("{} min", (seconds / 60).max(1))
    } else {
        let hours = seconds / 3_600;
        let minutes = (seconds % 3_600) / 60;
        format!("{hours} hr {minutes} min")
    }
}

#[cfg(test)]
mod tests {
    use super::{csv, markdown};
    use crate::{
        history,
        models::{Config, Sample},
    };

    fn sample(timestamp: i64, status: &str, explanation: &str) -> Sample {
        Sample {
            id: timestamp,
            timestamp,
            status: status.into(),
            explanation: explanation.into(),
            latency_ms: Some(42),
            dns_ok: true,
            https_ok: true,
            tcp_ok: true,
            dns_latency_ms: Some(8),
            https_latency_ms: Some(75),
        }
    }

    #[test]
    fn csv_includes_all_timings_and_escapes_quotes() {
        let output = csv(&[sample(0, "healthy", "A \"quoted\" value")]);
        assert!(output.contains("tcp_latency_ms,dns_latency_ms,https_latency_ms"));
        assert!(output.contains("\"A \"\"quoted\"\" value\""));
        assert!(output.contains(",42,8,75,"));
    }

    #[test]
    fn markdown_contains_summary_and_incidents() {
        let samples = vec![
            sample(0, "interrupted", "Down"),
            sample(30, "interrupted", "Down"),
            sample(60, "interrupted", "Down"),
            sample(90, "healthy", "Back"),
        ];
        let overview = history::overview(&samples, 0, 120, 60, 3, 30, 120);
        let output = markdown(&samples, &overview, &Config::default(), 120);
        assert!(output.contains("# NetReceipt Connection Report"));
        assert!(output.contains("| Confirmed incidents | 1 |"));
        assert!(output.contains("| 1970-01-01T00:00:00+00:00"));
        assert!(output.contains("Generated locally by NetReceipt"));
    }
}
