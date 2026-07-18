import { Text, TextField } from "@radix-ui/themes";
import { adaptiveChartMax } from "./chart";
import type { HistoryOverview, HistoryPoint, Sample } from "./domain";

export type MetricTone = "healthy" | "warning" | "error" | "waiting";

export function MetricCard({ kind, label, value, status, tone }: { kind: "latency" | "dns" | "https"; label: string; value?: number | null; status: string; tone: MetricTone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-heading"><MetricIcon kind={kind} /><span>{label}</span></div>
      <div className="metric-value"><strong>{value ?? "—"}</strong>{value !== null && value !== undefined && <span>ms</span>}</div>
      <div className="metric-state"><i />{status}</div>
    </article>
  );
}

export function Setting({ label, value, min = 1, max, wide = false, onChange }: { label: string; value: number; min?: number; max?: number; wide?: boolean; onChange: (value: number) => void }) {
  return (
    <label className={wide ? "setting-wide" : undefined}>
      <Text as="div" size="2" color="gray" mb="1">{label}</Text>
      <TextField.Root type="number" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function TextSetting({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <Text as="div" size="2" color="gray" mb="1">{label}</Text>
      <TextField.Root type="text" value={value} placeholder={placeholder} spellCheck={false} autoCapitalize="none" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function ActivityChart({ samples, threshold, endTimestamp }: { samples: Sample[]; threshold: number; endTimestamp: number }) {
  const ordered = [...samples].reverse();
  const values = ordered.flatMap((sample) => sample.latencyMs === null ? [] : [sample.latencyMs]);
  const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const peak = values.length ? Math.max(...values) : null;
  const issues = ordered.filter((sample) => sample.status !== "healthy").length;
  const chartMax = adaptiveChartMax(peak, threshold);
  const left = 38;
  const right = 742;
  const top = 22;
  const bottom = 210;
  const startTimestamp = endTimestamp - 30 * 60;
  const x = (timestamp: number) => left + ((Math.max(startTimestamp, Math.min(endTimestamp, timestamp)) - startTimestamp) / (endTimestamp - startTimestamp)) * (right - left);
  const y = (value: number) => bottom - (Math.min(value, chartMax) / chartMax) * (bottom - top);
  const segments = chartSegments(ordered, x, y);
  const thresholdY = y(threshold);
  const accessibleSummary = values.length
    ? `TCP latency trend. Average ${average} milliseconds, peak ${peak} milliseconds, with ${issues} connection issues in the last 30 minutes.`
    : "No TCP latency samples are available for the last 30 minutes.";

  return (
    <div className="history-card">
      <div className="chart-area">
        <svg className="activity-chart" viewBox="0 0 780 250" role="img" aria-label={accessibleSummary}>
          <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#45c9c2" stopOpacity=".18" /><stop offset="1" stopColor="#45c9c2" stopOpacity="0" /></linearGradient></defs>
          <text className="axis-label" x="0" y={top + 4}>{chartMax} ms</text>
          <text className="axis-label" x="0" y={(top + bottom) / 2 + 4}>{Math.round(chartMax / 2)}</text>
          <text className="axis-label" x="0" y={bottom + 4}>0</text>
          <line className="chart-grid" x1={left} y1={top} x2={right} y2={top} />
          <line className="chart-grid" x1={left} y1={(top + bottom) / 2} x2={right} y2={(top + bottom) / 2} />
          <line className="chart-grid solid" x1={left} y1={bottom} x2={right} y2={bottom} />
          {threshold <= chartMax && thresholdY >= top && thresholdY <= bottom && <><line className="chart-threshold" x1={left} y1={thresholdY} x2={right} y2={thresholdY} /><text className="threshold-label" x={right - 4} y={thresholdY - 8}>Slow threshold</text></>}
          {segments.map((segment, index) => <path key={`fill-${index}`} className="chart-fill" d={`${segment.path} L ${segment.endX} ${bottom} L ${segment.startX} ${bottom} Z`} />)}
          {segments.map((segment, index) => <path key={`line-${index}`} className="chart-line" d={segment.path} />)}
          {ordered.map((sample) => sample.latencyMs === null ? null : <circle key={sample.id} cx={x(sample.timestamp)} cy={y(sample.latencyMs)} r="4.4" className={`chart-point ${sample.status}`} />)}
          <text className="time-label" x={left} y="241">{formatTime(startTimestamp)}</text>
          <text className="time-label middle" x={(left + right) / 2} y="241">{formatTime(startTimestamp + 15 * 60)}</text>
          <text className="time-label end" x={right} y="241">Now</text>
        </svg>
        {!values.length && <div className="chart-empty">Waiting for TCP latency samples</div>}
      </div>
      <div className="chart-summary">
        <div><span>Average</span><strong>{average ?? "—"}<small>{average === null ? "" : "ms"}</small></strong></div>
        <div><span>Peak</span><strong>{peak ?? "—"}<small>{peak === null ? "" : "ms"}</small></strong></div>
        <div><span>Issues</span><strong>{issues}</strong></div>
      </div>
    </div>
  );
}

export function HistoryRangeChart({ overview, threshold }: { overview: HistoryOverview; threshold: number }) {
  const { points, startTimestamp, endTimestamp, bucketSeconds, summary } = overview;
  const chartMax = adaptiveChartMax(summary.peakLatencyMs, threshold);
  const left = 42;
  const right = 738;
  const top = 18;
  const bottom = 178;
  const range = Math.max(1, endTimestamp - startTimestamp);
  const x = (timestamp: number) => left + ((timestamp - startTimestamp) / range) * (right - left);
  const y = (value: number) => bottom - (Math.min(value, chartMax) / chartMax) * (bottom - top);
  const segments = historySegments(points, x, y, bucketSeconds);
  const thresholdY = y(threshold);
  const label = summary.sampleCount
    ? `TCP latency history. Average ${summary.averageLatencyMs ?? "unavailable"} milliseconds, peak ${summary.peakLatencyMs ?? "unavailable"} milliseconds, with ${summary.incidentCount} confirmed incidents.`
    : "No connection samples are available for this period.";

  return (
    <div className="range-chart-wrap">
      <svg className="range-chart" viewBox="0 0 780 220" role="img" aria-label={label}>
        <defs><linearGradient id="range-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#45c9c2" stopOpacity=".2" /><stop offset="1" stopColor="#45c9c2" stopOpacity="0" /></linearGradient></defs>
        <text className="axis-label" x="0" y={top + 4}>{chartMax} ms</text>
        <text className="axis-label" x="0" y={(top + bottom) / 2 + 4}>{Math.round(chartMax / 2)}</text>
        <text className="axis-label" x="0" y={bottom + 4}>0</text>
        <line className="chart-grid" x1={left} y1={top} x2={right} y2={top} />
        <line className="chart-grid" x1={left} y1={(top + bottom) / 2} x2={right} y2={(top + bottom) / 2} />
        <line className="chart-grid solid" x1={left} y1={bottom} x2={right} y2={bottom} />
        {threshold <= chartMax && <line className="chart-threshold" x1={left} y1={thresholdY} x2={right} y2={thresholdY} />}
        {segments.map((segment, index) => <path key={`range-fill-${index}`} className="range-chart-fill" d={`${segment.path} L ${segment.endX} ${bottom} L ${segment.startX} ${bottom} Z`} />)}
        {segments.map((segment, index) => <path key={`range-line-${index}`} className="chart-line" d={segment.path} />)}
        {points.map((point) => point.averageLatencyMs === null ? null : <circle key={point.timestamp} cx={x(point.timestamp)} cy={y(point.averageLatencyMs)} r="4" className={`chart-point ${point.status}`} />)}
        <text className="time-label" x={left} y="211">{formatRangeTime(startTimestamp, range)}</text>
        <text className="time-label middle" x={(left + right) / 2} y="211">{formatRangeTime(startTimestamp + range / 2, range)}</text>
        <text className="time-label end" x={right} y="211">Now</text>
      </svg>
      {!summary.sampleCount && <div className="chart-empty">No samples in this period</div>}
    </div>
  );
}

function historySegments(points: HistoryPoint[], x: (timestamp: number) => number, y: (value: number) => number, bucketSeconds: number) {
  const segments: Array<{ path: string; startX: number; endX: number }> = [];
  let values: Array<{ x: number; y: number }> = [];
  let previousTimestamp: number | null = null;
  const finish = () => {
    if (!values.length) return;
    segments.push({
      path: values.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      startX: values[0].x,
      endX: values[values.length - 1].x,
    });
    values = [];
  };
  for (const point of points) {
    if (point.averageLatencyMs === null || (previousTimestamp !== null && point.timestamp - previousTimestamp > bucketSeconds * 2.5)) finish();
    if (point.averageLatencyMs !== null) values.push({ x: x(point.timestamp), y: y(point.averageLatencyMs) });
    previousTimestamp = point.timestamp;
  }
  finish();
  return segments;
}

function chartSegments(samples: Sample[], x: (timestamp: number) => number, y: (value: number) => number) {
  const segments: Array<{ path: string; startX: number; endX: number }> = [];
  let points: Array<{ x: number; y: number }> = [];

  const finish = () => {
    if (!points.length) return;
    segments.push({
      path: points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      startX: points[0].x,
      endX: points[points.length - 1].x,
    });
    points = [];
  };

  for (const sample of samples) {
    if (sample.latencyMs === null) {
      finish();
    } else {
      points.push({ x: x(sample.timestamp), y: y(sample.latencyMs) });
    }
  }
  finish();
  return segments;
}

function MetricIcon({ kind }: { kind: "latency" | "dns" | "https" }) {
  if (kind === "latency") return <svg viewBox="0 0 28 28"><path d="M5 20a10 10 0 1 1 18 0M14 14l5-4M8 18h12" /><circle cx="14" cy="14" r="1.4" /></svg>;
  if (kind === "dns") return <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" /><path d="M4 14h20M14 4c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10Z" /></svg>;
  return <svg viewBox="0 0 28 28"><rect x="6" y="12" width="16" height="12" rx="1.5" /><path d="M9 12V9a5 5 0 0 1 10 0v3" /></svg>;
}

function formatTime(timestamp?: number) {
  return timestamp === undefined ? "—" : new Date(timestamp * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRangeTime(timestamp: number, rangeSeconds: number) {
  const options: Intl.DateTimeFormatOptions = rangeSeconds >= 24 * 60 * 60
    ? { month: "short", day: "numeric" }
    : { hour: "numeric", minute: "2-digit" };
  return new Date(timestamp * 1000).toLocaleString([], options);
}
