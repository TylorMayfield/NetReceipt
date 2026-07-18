import type { MetricTone } from "./components";
import type { Sample, Status } from "./domain";

type StatusPresentation = Record<Status, { headline: string; detail: string }>;

const checkingPresentation = {
  headline: "Checking your internet",
  detail: "Waiting for the first connection sample.",
};

export function connectionPresentation(sample: Sample | null, presentations: StatusPresentation) {
  return sample ? presentations[sample.status] : checkingPresentation;
}

export function metricPresentation(kind: "latency" | "dns" | "https", sample: Sample | null, threshold: number): { status: string; tone: MetricTone } {
  if (!sample) return { status: "Waiting", tone: "waiting" };
  const value = kind === "latency" ? sample.latencyMs : kind === "dns" ? sample.dnsLatencyMs : sample.httpsLatencyMs;
  const available = kind === "latency" ? sample.tcpOk : kind === "dns" ? sample.dnsOk : sample.httpsOk;
  if (!available || value === null) return { status: "Failed", tone: "error" };
  if (value > threshold) return { status: "Elevated", tone: "warning" };
  return { status: kind === "dns" ? "Resolved" : kind === "https" ? "Connected" : "Excellent", tone: "healthy" };
}
