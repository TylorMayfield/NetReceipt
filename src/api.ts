import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { save } from "@tauri-apps/plugin-dialog";
import type { ExportFormat, HistoryOverview, MonitorConfig, Sample } from "./domain";

export const isDesktopRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const monitorApi = {
  getConfig: () => invoke<MonitorConfig>("get_config"),
  updateConfig: (config: MonitorConfig) => invoke<void>("update_config", { config }),
  getCurrent: () => invoke<Sample | null>("get_current"),
  getHistory: (limit = 100) => invoke<Sample[]>("get_history", { limit }),
  getHistoryOverview: (startTimestamp: number, endTimestamp: number, maxPoints = 180) =>
    invoke<HistoryOverview>("get_history_overview", { startTimestamp, endTimestamp, maxPoints }),
  setMonitoring: (enabled: boolean) => invoke<void>("set_monitoring", { enabled }),
  writeHistoryExport: (path: string, format: ExportFormat, startTimestamp: number, endTimestamp: number) =>
    invoke<void>("write_history_export", { path, format, startTimestamp, endTimestamp }),
};

export async function exportHistory(format: ExportFormat, startTimestamp: number, endTimestamp: number): Promise<boolean> {
  const extension = format === "csv" ? "csv" : "md";
  const kind = format === "csv" ? "data" : "report";
  const date = new Date(endTimestamp * 1000).toISOString().slice(0, 10);
  const path = await save({ defaultPath: `netreceipt-${kind}-${date}.${extension}` });

  if (!path) return false;

  await monitorApi.writeHistoryExport(path, format, startTimestamp, endTimestamp);
  return true;
}

export async function appVersion(): Promise<string> {
  return isDesktopRuntime ? getVersion() : "Preview";
}
