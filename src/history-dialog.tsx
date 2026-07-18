import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@radix-ui/themes";
import { track } from "./analytics";
import { HistoryRangeChart } from "./components";
import { historyRangeSeconds, type HistoryOverview, type HistoryRange } from "./domain";

const ranges: Array<{ value: HistoryRange; label: string }> = [
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export function HistoryDialog({ threshold, loadOverview }: { threshold: number; loadOverview: (start: number, end: number) => Promise<HistoryOverview> }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<HistoryRange>("24h");
  const [overview, setOverview] = useState<HistoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const loadOverviewRef = useRef(loadOverview);

  useEffect(() => {
    loadOverviewRef.current = loadOverview;
  }, [loadOverview]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const end = Math.floor(Date.now() / 1000);
    void loadOverviewRef.current(end - historyRangeSeconds[range], end)
      .then((value) => { if (active) setOverview(value); })
      .catch((cause) => { if (active) setError(errorMessage(cause)); })
    return () => { active = false; };
  }, [open, range, retryKey]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) { setOverview(null); setError(null); track("history_opened"); } }}>
      <Dialog.Trigger><button type="button" className="history-link">View history</button></Dialog.Trigger>
      <Dialog.Content className="history-dialog-content" maxWidth="392px">
        <Dialog.Title>Connection history</Dialog.Title>
        <Dialog.Description size="2" color="gray">Review retained measurements and confirmed connection incidents.</Dialog.Description>
        <div className="range-picker" aria-label="History range">
          {ranges.map((item) => <button key={item.value} type="button" autoFocus={range === item.value} className={range === item.value ? "selected" : ""} aria-pressed={range === item.value} onClick={() => { setOverview(null); setError(null); setRange(item.value); track("history_range_changed", { range: item.value }); }}>{item.label}</button>)}
        </div>
        {!overview && !error ? <div className="history-state">Loading connection history…</div> : null}
        {error ? <div className="history-state error" role="alert">{error}<Button size="1" variant="soft" onClick={() => { setError(null); setRetryKey((value) => value + 1); }}>Try again</Button></div> : null}
        {overview && !error ? <HistoryDetail overview={overview} threshold={threshold} /> : null}
        <div className="dialog-close-row"><Dialog.Close><Button variant="soft" color="gray">Done</Button></Dialog.Close></div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function HistoryDetail({ overview, threshold }: { overview: HistoryOverview; threshold: number }) {
  const { summary, incidents } = overview;
  return (
    <div className="history-detail">
      <div className="history-summary-grid">
        <Summary label="Average" value={formatLatency(summary.averageLatencyMs)} />
        <Summary label="Peak" value={formatLatency(summary.peakLatencyMs)} />
        <Summary label="Incidents" value={String(summary.incidentCount)} />
        <Summary label="Impacted" value={formatDuration(summary.totalIncidentSeconds)} />
      </div>
      <HistoryRangeChart overview={overview} threshold={threshold} />
      <section className="incident-section">
        <div className="incident-heading"><h3>Confirmed incidents</h3><span>{summary.sampleCount.toLocaleString()} samples</span></div>
        {incidents.length ? <div className="incident-list">{incidents.map((incident) => (
          <article key={`${incident.startTimestamp}-${incident.status}`} className={`incident-row ${incident.status}`}>
            <i />
            <div><strong>{incident.active ? "Ongoing incident" : statusLabel(incident.status)}</strong><span>{formatDateTime(incident.startTimestamp)} · {formatDuration(incident.durationSeconds)}</span></div>
            <small>{incident.peakLatencyMs === null ? "No TCP" : `${incident.peakLatencyMs} ms peak`}</small>
          </article>
        ))}</div> : <div className="no-incidents"><b>No confirmed incidents</b><span>Your connection met the configured tolerance throughout this period.</span></div>}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function statusLabel(status: string) {
  if (status === "interrupted") return "Connection interruption";
  if (status === "slow") return "Elevated latency";
  return "Partial connection failure";
}

function formatLatency(value: number | null) { return value === null ? "—" : `${value} ms`; }
function formatDateTime(value: number) { return new Date(value * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(0, seconds)} sec`;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}
function errorMessage(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
