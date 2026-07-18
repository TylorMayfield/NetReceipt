import { useMemo, useState } from "react";
import { DownloadIcon } from "@radix-ui/react-icons";
import { Button, Dialog } from "@radix-ui/themes";
import type { ExportFormat } from "./domain";

type ExportRange = "24h" | "7d" | "30d" | "custom";

const rangeSeconds: Record<Exclude<ExportRange, "custom">, number> = {
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

export function ExportDialog({ onExport }: { onExport: (format: ExportFormat, start: number, end: number) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [range, setRange] = useState<ExportRange>("24h");
  const [customStart, setCustomStart] = useState(() => localInputValue(Date.now() - 24 * 60 * 60 * 1000));
  const [customEnd, setCustomEnd] = useState(() => localInputValue(Date.now()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRange = useMemo(() => exportTimestamps(range, customStart, customEnd), [customEnd, customStart, range]);

  const runExport = async () => {
    if (!selectedRange) {
      setError("Choose a valid start and end time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (await onExport(format, selectedRange.start, selectedRange.end)) setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) setError(null); }}>
      <Dialog.Trigger><button type="button"><DownloadIcon /> Export</button></Dialog.Trigger>
      <Dialog.Content className="export-dialog-content" maxWidth="380px">
        <Dialog.Title>Export connection history</Dialog.Title>
        <Dialog.Description size="2" color="gray">Create a readable ISP report or export the underlying measurements.</Dialog.Description>
        <fieldset className="export-options">
          <legend>Format</legend>
          <label className={format === "markdown" ? "selected" : ""}><input type="radio" name="format" value="markdown" checked={format === "markdown"} onChange={() => setFormat("markdown")} /><span><b>Markdown report</b><small>Summary and confirmed incidents</small></span></label>
          <label className={format === "csv" ? "selected" : ""}><input type="radio" name="format" value="csv" checked={format === "csv"} onChange={() => setFormat("csv")} /><span><b>Raw CSV data</b><small>Every probe and timing measurement</small></span></label>
        </fieldset>
        <fieldset className="export-range">
          <legend>Period</legend>
          <div className="range-picker">{(["24h", "7d", "30d", "custom"] as ExportRange[]).map((item) => <button key={item} type="button" className={range === item ? "selected" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item === "custom" ? "Custom" : item}</button>)}</div>
          {range === "custom" ? <div className="custom-range-fields"><label><span>Start</span><input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label><span>End</span><input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div> : null}
        </fieldset>
        {error ? <p className="export-error" role="alert">{error}</p> : null}
        <div className="export-actions"><Dialog.Close><Button variant="soft" color="gray" disabled={saving}>Cancel</Button></Dialog.Close><Button loading={saving} disabled={saving} onClick={() => void runExport()}>Choose save location</Button></div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function exportTimestamps(range: ExportRange, customStart: string, customEnd: string) {
  if (range !== "custom") {
    const end = Math.floor(Date.now() / 1000);
    return { start: end - rangeSeconds[range], end };
  }
  const start = Math.floor(new Date(customStart).getTime() / 1000);
  const end = Math.floor(new Date(customEnd).getTime() / 1000);
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}

function localInputValue(milliseconds: number) {
  const date = new Date(milliseconds - new Date(milliseconds).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
