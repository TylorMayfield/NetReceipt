export function adaptiveChartMax(peak: number | null, threshold: number) {
  const observedMax = Math.max(peak ?? 0, 25);
  const observedCeiling = niceChartCeiling(observedMax * 1.25);
  const includeThreshold = threshold <= observedCeiling * 1.6;
  return niceChartCeiling(Math.max(observedMax * 1.25, includeThreshold ? threshold * 1.05 : 0));
}

function niceChartCeiling(value: number) {
  const step = value <= 100 ? 25 : value <= 500 ? 50 : 100;
  return Math.max(50, Math.ceil(value / step) * step);
}
