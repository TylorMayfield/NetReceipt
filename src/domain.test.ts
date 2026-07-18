import { describe, expect, it } from "vitest";
import { defaultConfig, samplesWithinWindow, validateConfig, type Sample } from "./domain";

describe("validateConfig", () => {
  it("accepts the default settings", () => {
    expect(validateConfig(defaultConfig)).toBeNull();
  });

  it("rejects invalid boundaries and fractional values", () => {
    expect(validateConfig({ ...defaultConfig, host: "https://example.com" })).toContain("hostname");
    expect(validateConfig({ ...defaultConfig, host: "example.com:8443" })).toContain("hostname");
    expect(validateConfig({ ...defaultConfig, intervalSeconds: 4 })).toContain("between 5");
    expect(validateConfig({ ...defaultConfig, timeoutSeconds: 31 })).toContain("no longer");
    expect(validateConfig({ ...defaultConfig, failureTolerance: 0 })).toContain("tolerance");
    expect(validateConfig({ ...defaultConfig, retentionDays: 1.5 })).toContain("whole numbers");
  });
});

describe("samplesWithinWindow", () => {
  it("keeps only samples inside the requested rolling window", () => {
    const samples = [sampleAt(900), sampleAt(1_000), sampleAt(1_100), sampleAt(1_101)];
    expect(samplesWithinWindow(samples, 1_100, 100).map((sample) => sample.timestamp)).toEqual([1_000, 1_100]);
  });
});

function sampleAt(timestamp: number): Sample {
  return {
    id: timestamp,
    timestamp,
    status: "healthy",
    explanation: "Test",
    latencyMs: 10,
    dnsOk: true,
    httpsOk: true,
    tcpOk: true,
    dnsLatencyMs: 11,
    httpsLatencyMs: 12,
  };
}
