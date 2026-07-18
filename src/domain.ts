export type Status = "healthy" | "slow" | "interrupted" | "unknown";

export interface Sample {
  id: number;
  timestamp: number;
  status: Status;
  explanation: string;
  latencyMs: number | null;
  dnsOk: boolean;
  httpsOk: boolean;
  tcpOk: boolean;
  dnsLatencyMs: number | null;
  httpsLatencyMs: number | null;
}

export interface HistoryPoint {
  timestamp: number;
  averageLatencyMs: number | null;
  peakLatencyMs: number | null;
  status: Status;
  sampleCount: number;
}

export interface Incident {
  startTimestamp: number;
  endTimestamp: number | null;
  durationSeconds: number;
  status: Status;
  sampleCount: number;
  peakLatencyMs: number | null;
  active: boolean;
}

export interface HistorySummary {
  sampleCount: number;
  averageLatencyMs: number | null;
  peakLatencyMs: number | null;
  incidentCount: number;
  totalIncidentSeconds: number;
}

export interface HistoryOverview {
  startTimestamp: number;
  endTimestamp: number;
  bucketSeconds: number;
  points: HistoryPoint[];
  summary: HistorySummary;
  incidents: Incident[];
}

export type HistoryRange = "6h" | "24h" | "7d" | "30d";
export type ExportFormat = "markdown" | "csv";

export const historyRangeSeconds: Record<HistoryRange, number> = {
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

export interface MonitorConfig {
  host: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  latencyThresholdMs: number;
  failureTolerance: number;
  retentionDays: number;
  notifications: boolean;
}

export const defaultConfig: MonitorConfig = {
  host: "one.one.one.one",
  intervalSeconds: 30,
  timeoutSeconds: 5,
  latencyThresholdMs: 250,
  failureTolerance: 3,
  retentionDays: 30,
  notifications: true,
};

export type NoticeKind = "success" | "warning" | "error";

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

export function validateConfig(config: MonitorConfig): string | null {
  if (!isValidHost(config.host)) {
    return "Host must be a hostname or IPv4 address without a scheme, port, or path.";
  }

  const values = [
    config.intervalSeconds,
    config.timeoutSeconds,
    config.latencyThresholdMs,
    config.failureTolerance,
    config.retentionDays,
  ];

  if (!values.every(Number.isInteger)) return "Settings must use whole numbers.";
  if (config.intervalSeconds < 5 || config.intervalSeconds > 86_400) {
    return "Interval must be between 5 and 86,400 seconds.";
  }
  if (config.timeoutSeconds < 1 || config.timeoutSeconds > config.intervalSeconds) {
    return "Timeout must be at least 1 second and no longer than the interval.";
  }
  if (config.latencyThresholdMs < 1) return "Slow threshold must be greater than zero.";
  if (config.failureTolerance < 1) return "Alert tolerance must be greater than zero.";
  if (config.retentionDays < 1) return "Retention must be greater than zero.";
  return null;
}

function isValidHost(host: string): boolean {
  return host.length > 0
    && host.length <= 253
    && host === host.trim()
    && !/[\s/:?#@]/.test(host)
    && host.split(".").every((label) => label.length > 0 && label.length <= 63);
}

export function samplesWithinWindow(
  samples: Sample[],
  endTimestamp: number,
  windowSeconds = 30 * 60,
): Sample[] {
  const startTimestamp = endTimestamp - windowSeconds;
  return samples.filter((sample) => sample.timestamp >= startTimestamp && sample.timestamp <= endTimestamp);
}
