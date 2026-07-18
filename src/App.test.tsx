import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./App";
import { AboutDialog } from "./about-dialog";
import { defaultConfig, type HistoryOverview, type Sample } from "./domain";
import { ExportDialog } from "./export-dialog";
import { HistoryDialog } from "./history-dialog";
import { connectionPresentation, metricPresentation } from "./presentation";
import { adaptiveChartMax } from "./chart";

describe("connection presentation", () => {
  it("distinguishes initial checking from a partial result", () => {
    const presentations = {
      healthy: { headline: "Healthy", detail: "" },
      slow: { headline: "Slow", detail: "" },
      interrupted: { headline: "Interrupted", detail: "" },
      unknown: { headline: "Partially available", detail: "" },
    };
    expect(connectionPresentation(null, presentations).headline).toBe("Checking your internet");
    expect(connectionPresentation(sample({ status: "unknown", dnsOk: false }), presentations).headline).toContain("Partially available");
  });
});

describe("metric presentation", () => {
  it("scores each probe independently", () => {
    const result = sample({ status: "slow", latencyMs: 20, dnsLatencyMs: 400, httpsLatencyMs: 40 });
    expect(metricPresentation("latency", result, 250)).toEqual({ status: "Excellent", tone: "healthy" });
    expect(metricPresentation("dns", result, 250)).toEqual({ status: "Elevated", tone: "warning" });
    expect(metricPresentation("https", result, 250)).toEqual({ status: "Connected", tone: "healthy" });
  });

  it("marks a failed probe as an error", () => {
    expect(metricPresentation("dns", sample({ dnsOk: false, dnsLatencyMs: null }), 250)).toEqual({ status: "Failed", tone: "error" });
  });
});

describe("adaptive chart scale", () => {
  it("shows healthy variation without stretching the chart to a distant slow threshold", () => {
    expect(adaptiveChartMax(67, 250)).toBe(100);
  });

  it("includes the slow threshold when observed latency approaches it", () => {
    expect(adaptiveChartMax(180, 250)).toBe(300);
  });
});

describe("SettingsDialog", () => {
  it("discards draft edits when cancelled", async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn());
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const interval = screen.getByRole("spinbutton", { name: "Interval (seconds)" });
    fireEvent.change(interval, { target: { value: "45" } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("spinbutton", { name: "Interval (seconds)" }).getAttribute("value")).toBe("30");
  });

  it("keeps the dialog open when persistence fails", async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn().mockRejectedValue(new Error("Could not save settings")));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save settings");
    expect(screen.getByRole("dialog", { name: "Monitor settings" })).not.toBeNull();
  });

  it("persists a valid draft and closes after success", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog(onSave);
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Host to test" }), { target: { value: "example.com" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Interval (seconds)" }), { target: { value: "45" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...defaultConfig, host: "example.com", intervalSeconds: 45 }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Monitor settings" })).toBeNull());
  });
});

describe("HistoryDialog", () => {
  it("loads the default range and refreshes when a different range is selected", async () => {
    const user = userEvent.setup();
    const loadOverview = vi.fn().mockResolvedValue(historyOverview());
    render(<Theme appearance="dark"><HistoryDialog threshold={250} refreshKey={1} loadOverview={loadOverview} /></Theme>);
    await user.click(screen.getByRole("button", { name: "View history" }));
    expect(await screen.findByRole("dialog", { name: "Connection history" })).not.toBeNull();
    await waitFor(() => expect(loadOverview).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(loadOverview).toHaveBeenCalledTimes(2));
    const [start, end] = loadOverview.mock.calls[1];
    expect(end - start).toBe(7 * 24 * 60 * 60);
  });
});

describe("ExportDialog", () => {
  it("submits the selected format and period", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn().mockResolvedValue(true);
    render(<Theme appearance="dark"><ExportDialog onExport={onExport} /></Theme>);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("radio", { name: /Raw CSV data/ }));
    await user.click(screen.getByRole("button", { name: "7d" }));
    await user.click(screen.getByRole("button", { name: "Choose save location" }));
    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
    const [format, start, end] = onExport.mock.calls[0];
    expect(format).toBe("csv");
    expect(end - start).toBe(7 * 24 * 60 * 60);
  });
});

describe("AboutDialog", () => {
  it("shows the local-data promise and updates telemetry", async () => {
    const user = userEvent.setup();
    const onTelemetryChange = vi.fn();
    render(<Theme appearance="dark"><AboutDialog telemetryEnabled={false} onTelemetryChange={onTelemetryChange} /></Theme>);
    await user.click(screen.getByRole("button", { name: "About and privacy" }));
    expect(screen.getByText("Your history stays on this device.")).not.toBeNull();
    await user.click(screen.getByRole("switch", { name: "Anonymous telemetry" }));
    expect(onTelemetryChange).toHaveBeenCalledWith(true);
  });
});

function renderDialog(onSave: (config: typeof defaultConfig) => Promise<void>) {
  return render(<Theme appearance="dark"><SettingsDialog config={defaultConfig} onSave={onSave} /></Theme>);
}

function sample(overrides: Partial<Sample> = {}): Sample {
  return {
    id: 1,
    timestamp: 1,
    status: "healthy",
    explanation: "Test",
    latencyMs: 20,
    dnsOk: true,
    httpsOk: true,
    tcpOk: true,
    dnsLatencyMs: 20,
    httpsLatencyMs: 20,
    ...overrides,
  };
}

function historyOverview(): HistoryOverview {
  return {
    startTimestamp: 0,
    endTimestamp: 3_600,
    bucketSeconds: 60,
    points: [],
    summary: { sampleCount: 0, averageLatencyMs: null, peakLatencyMs: null, incidentCount: 0, totalIncidentSeconds: 0 },
    incidents: [],
  };
}
