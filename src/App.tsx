import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cross2Icon,
  GearIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
} from "@radix-ui/react-icons";
import {
  Button,
  Dialog,
  Flex,
  Grid,
  Switch,
  Text,
} from "@radix-ui/themes";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AboutDialog } from "./about-dialog";
import { setAnalyticsConsent, track } from "./analytics";
import { exportHistory, isDesktopRuntime, monitorApi } from "./api";
import { ActivityChart, MetricCard, Setting, TextSetting } from "./components";
import { type ExportFormat, type HistoryOverview, samplesWithinWindow, validateConfig, type MonitorConfig, type Sample, type Status } from "./domain";
import { ExportDialog } from "./export-dialog";
import { HistoryDialog } from "./history-dialog";
import { connectionPresentation, metricPresentation } from "./presentation";
import { useMonitor } from "./useMonitor";

const statusPresentation: Record<Status, { headline: string; detail: string }> = {
  healthy: {
    headline: "Your internet is healthy",
    detail: "All checks are passing. No interruptions detected.",
  },
  slow: {
    headline: "Your internet is slow",
    detail: "The connection is working, but response times are elevated.",
  },
  interrupted: {
    headline: "Your internet is interrupted",
    detail: "One or more connection checks are currently failing.",
  },
  unknown: {
    headline: "Your connection is partially available",
    detail: "Some checks passed while others could not be completed.",
  },
};

const telemetryStorageKey = "netreceipt.telemetry-enabled";

function savedTelemetryPreference(): boolean | null {
  const value = localStorage.getItem(telemetryStorageKey);
  return value === null ? null : value === "true";
}

export function App() {
  const monitor = useMonitor();
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(savedTelemetryPreference);
  const [telemetryDialogOpen, setTelemetryDialogOpen] = useState(telemetryEnabled === null);
  const [mountedAt] = useState(() => Math.floor(Date.now() / 1000));
  const preview = useMemo(() => isDesktopRuntime ? null : previewData(), []);
  const current = monitor.current ?? preview?.current ?? null;
  const history = useMemo(() => monitor.history.length ? monitor.history : preview?.history ?? [], [monitor.history, preview]);
  const historyEnd = current?.timestamp ?? mountedAt;
  const visibleHistory = samplesWithinWindow(history, historyEnd);
  const status = current?.status ?? "unknown";
  const presentation = connectionPresentation(current, statusPresentation);

  useEffect(() => {
    if (telemetryEnabled !== null) setAnalyticsConsent(telemetryEnabled);
  }, [telemetryEnabled]);

  const saveTelemetry = (enabled: boolean) => {
    localStorage.setItem(telemetryStorageKey, String(enabled));
    setTelemetryEnabled(enabled);
    setTelemetryDialogOpen(false);
  };

  const updateTelemetry = (enabled: boolean) => {
    localStorage.setItem(telemetryStorageKey, String(enabled));
    setTelemetryEnabled(enabled);
  };

  const runExport = async (format: ExportFormat, startTimestamp: number, endTimestamp: number) => {
    if (!isDesktopRuntime) {
      monitor.showNotice("warning", "Export is available in the desktop app");
      return false;
    }
    if (await exportHistory(format, startTimestamp, endTimestamp)) {
      track("history_exported", { format });
      monitor.showNotice("success", format === "csv" ? "Connection data exported" : "Connection report exported");
      return true;
    }
    return false;
  };

  const loadHistoryOverview = useCallback(async (startTimestamp: number, endTimestamp: number): Promise<HistoryOverview> => {
    if (isDesktopRuntime) return monitorApi.getHistoryOverview(startTimestamp, endTimestamp);
    return previewHistoryOverview(history, startTimestamp, endTimestamp);
  }, [history]);

  return (
    <main className="widget-shell">
      <header className="widget-header" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <NetReceiptMark />
          <span>NetReceipt</span>
        </div>
        <div className="header-actions">
          <span className={`live-state ${monitor.running || !isDesktopRuntime ? "active" : ""}`}>
            <i />{monitor.running || !isDesktopRuntime ? "Live" : "Paused"}
          </span>
          <span className="header-rule" />
          <SettingsDialog config={monitor.config} onSave={monitor.saveConfig} />
          <AboutDialog telemetryEnabled={telemetryEnabled ?? false} onTelemetryChange={updateTelemetry} />
          <span className="header-rule window-rule" />
          <button className="window-control" aria-label="Minimize" title="Minimize" onClick={() => void runWindowAction("minimize")}><MinusIcon /></button>
          <button className="window-control close" aria-label="Close to tray" title="Close to tray" onClick={() => void runWindowAction("close")}><Cross2Icon /></button>
        </div>
      </header>

      <div className="widget-content">
        <section className={`status-hero ${status}`}>
          <span className="eyebrow">CONNECTION STATUS</span>
          <div className="status-hero-row">
            <div className="status-check" aria-hidden="true"><StatusIcon status={status} /></div>
            <div className="status-message">
              <h1>{presentation.headline}</h1>
              <p>{presentation.detail}</p>
            </div>
          </div>
          <span className="checked-time">{formatCheckedTime(current?.timestamp)}</span>
        </section>

        <section className="metrics-grid" aria-label="Connection metrics">
          <MetricCard kind="latency" label="TCP" value={current?.latencyMs} {...metricPresentation("latency", current, monitor.config.latencyThresholdMs)} />
          <MetricCard kind="dns" label="DNS" value={current?.dnsLatencyMs} {...metricPresentation("dns", current, monitor.config.latencyThresholdMs)} />
          <MetricCard kind="https" label="HTTPS" value={current?.httpsLatencyMs} {...metricPresentation("https", current, monitor.config.latencyThresholdMs)} />
        </section>

        <section className="history-section">
          <div className="section-title-row">
            <h2>TCP latency history</h2>
            <div className="section-title-actions"><span>30 min · ≥ {monitor.config.latencyThresholdMs} ms</span><HistoryDialog threshold={monitor.config.latencyThresholdMs} loadOverview={loadHistoryOverview} /></div>
          </div>
          <ActivityChart samples={visibleHistory} threshold={monitor.config.latencyThresholdMs} endTimestamp={historyEnd} />
        </section>
      </div>

      <footer className="widget-footer">
        <div className="footer-main">
          <span>Checking every {monitor.config.intervalSeconds} sec&nbsp; · &nbsp;{monitor.config.host}</span>
          <div className="footer-actions">
            <ExportDialog onExport={runExport} />
            <button type="button" onClick={() => { track("monitor_toggled", { enabled: !monitor.running }); monitor.toggleMonitoring(); }}>
              {monitor.running || !isDesktopRuntime ? <PauseIcon /> : <PlayIcon />}
              {monitor.running || !isDesktopRuntime ? "Pause" : "Resume"}
            </button>
          </div>
        </div>
      </footer>

      {telemetryDialogOpen && (
        <TelemetryDialog
          initialValue={telemetryEnabled ?? false}
          required={telemetryEnabled === null}
          onClose={() => setTelemetryDialogOpen(false)}
          onSave={saveTelemetry}
        />
      )}

      {monitor.notice && (
        <div
          key={monitor.notice.id}
          className={`widget-message ${monitor.notice.kind}`}
          role={monitor.notice.kind === "error" ? "alert" : "status"}
          aria-live={monitor.notice.kind === "error" ? "assertive" : "polite"}
        >
          {monitor.notice.message}
        </div>
      )}
    </main>
  );
}

export function TelemetryDialog({ initialValue, required, onClose, onSave }: { initialValue: boolean; required: boolean; onClose: () => void; onSave: (enabled: boolean) => void }) {
  const [enabled, setEnabled] = useState(initialValue);

  return (
    <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen && !required) onClose(); }}>
      <Dialog.Content
        className="telemetry-dialog"
        maxWidth="370px"
        onEscapeKeyDown={(event) => { if (required) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (required) event.preventDefault(); }}
      >
        <span className="eyebrow">PRIVACY CHOICE</span>
        <Dialog.Title>Help improve NetReceipt?</Dialog.Title>
        <Dialog.Description>Share anonymous usage events so we can understand whether NetReceipt is useful and improve the app.</Dialog.Description>
        <ul>
          <li>Includes basic app opens and feature usage.</li>
          <li>Never includes monitored hosts, latency results, connection history, or exported data.</li>
        </ul>
        <label className="telemetry-toggle">
          <span><b>Anonymous telemetry</b><small>{enabled ? "On" : "Off"}</small></span>
          <Switch aria-label="Anonymous telemetry" checked={enabled} onCheckedChange={setEnabled} />
        </label>
        <p className="telemetry-note">You can change this anytime from About &amp; Privacy.</p>
        <div className="telemetry-actions">
          {!required && <Button type="button" variant="soft" color="gray" onClick={onClose}>Cancel</Button>}
          <Button type="button" onClick={() => onSave(enabled)}>Save choice</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function SettingsDialog({ config, onSave }: { config: MonitorConfig; onSave: (config: MonitorConfig) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraft(config);
    setValidationError(null);
    setOpen(nextOpen);
  };

  const handleSave = async () => {
    const error = validateConfig(draft);
    if (error) {
      setValidationError(error);
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      await onSave(draft);
      setOpen(false);
    } catch (cause) {
      setValidationError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <button type="button" className="settings-button" aria-label="Open settings" title="Open settings"><GearIcon /></button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="380px">
        <Dialog.Title>Monitor settings</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">Choose the host NetReceipt tests and tune how frequently it samples your connection.</Dialog.Description>
        <div className="host-setting">
          <TextSetting label="Host to test" value={draft.host} placeholder="one.one.one.one" onChange={(host) => setDraft({ ...draft, host })} />
        </div>
        <Grid columns="2" gap="3">
          <Setting label="Interval (seconds)" min={5} max={86_400} value={draft.intervalSeconds} onChange={(intervalSeconds) => setDraft({ ...draft, intervalSeconds })} />
          <Setting label="Timeout (seconds)" max={draft.intervalSeconds} value={draft.timeoutSeconds} onChange={(timeoutSeconds) => setDraft({ ...draft, timeoutSeconds })} />
          <Setting label="Slow threshold (ms)" value={draft.latencyThresholdMs} onChange={(latencyThresholdMs) => setDraft({ ...draft, latencyThresholdMs })} />
          <Setting label="Retention (days)" value={draft.retentionDays} onChange={(retentionDays) => setDraft({ ...draft, retentionDays })} />
          <Setting wide label="Alert after consecutive issues" value={draft.failureTolerance} onChange={(failureTolerance) => setDraft({ ...draft, failureTolerance })} />
        </Grid>
        <Flex align="center" justify="between" mt="4">
          <div><Text as="div" size="2" weight="medium">Status notifications</Text><Text as="div" size="1" color="gray">After sustained changes</Text></div>
          <Switch aria-label="Status notifications" checked={draft.notifications} onCheckedChange={(notifications) => setDraft({ ...draft, notifications })} />
        </Flex>
        {validationError && <Text as="p" className="settings-error" role="alert" size="2" color="red" mt="3">{validationError}</Text>}
        <Flex gap="3" mt="5" justify="end">
          <Button type="button" variant="soft" color="gray" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" loading={saving} disabled={saving} onClick={() => void handleSave()}>Save</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function NetReceiptMark() {
  return <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M3.5 15.5c3.7-6.3 6.8-6.3 10.2 0s6.8 6.3 10.8 0" /></svg>;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "healthy") return <svg viewBox="0 0 48 48"><path d="m10 25 9 9 19-20" /></svg>;
  if (status === "slow") return <span>!</span>;
  if (status === "interrupted") return <svg viewBox="0 0 48 48"><path d="m14 14 20 20m0-20L14 34" /></svg>;
  return <span>…</span>;
}

function formatCheckedTime(timestamp?: number) {
  if (!timestamp || Date.now() / 1000 - timestamp < 60) return "Checked just now";
  return `Checked ${new Date(timestamp * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

async function runWindowAction(action: "close" | "minimize") {
  if (!isDesktopRuntime) return;
  const appWindow = getCurrentWindow();
  if (action === "close") await appWindow.close();
  if (action === "minimize") await appWindow.minimize();
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function previewData() {
  const now = Math.floor(Date.now() / 1000);
  const values = [29, 26, 30, 27, 28, 67, 31, 28, 25, 20, 29, 24, 33, 27, 19, 28, 25, 32, 22, 26, 28, 16, 24];
  const history = [...values].reverse().map((latencyMs, index): Sample => ({
    id: index + 1,
    timestamp: now - index * 80,
    status: "healthy",
    explanation: "All checks are passing. No interruptions detected.",
    latencyMs,
    dnsOk: true,
    httpsOk: true,
    tcpOk: true,
    dnsLatencyMs: 18,
    httpsLatencyMs: 41,
  }));
  return { current: history[0], history };
}

function previewHistoryOverview(samples: Sample[], startTimestamp: number, endTimestamp: number): HistoryOverview {
  const selected = samples.filter((sample) => sample.timestamp >= startTimestamp && sample.timestamp <= endTimestamp).reverse();
  const latencies = selected.flatMap((sample) => sample.latencyMs === null ? [] : [sample.latencyMs]);
  const average = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
  const peak = latencies.length ? Math.max(...latencies) : null;
  return {
    startTimestamp,
    endTimestamp,
    bucketSeconds: Math.max(1, Math.ceil((endTimestamp - startTimestamp) / 180)),
    points: selected.map((sample) => ({
      timestamp: sample.timestamp,
      averageLatencyMs: sample.latencyMs,
      peakLatencyMs: sample.latencyMs,
      status: sample.status,
      sampleCount: 1,
    })),
    summary: {
      sampleCount: selected.length,
      averageLatencyMs: average,
      peakLatencyMs: peak,
      incidentCount: 0,
      totalIncidentSeconds: 0,
    },
    incidents: [],
  };
}
