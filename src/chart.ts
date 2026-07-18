export function adaptiveChartMax(peak: number | null, threshold: number) {
  const observedMax = Math.max(peak ?? 0, 25);
  const observedCeiling = niceChartCeiling(observedMax * 1.25);
  const includeThreshold = threshold <= observedCeiling * 1.6;
  return niceChartCeiling(Math.max(observedMax * 1.25, includeThreshold ? threshold * 1.05 : 0));
}

export function selectSpacedMarkers<T>(
  items: T[],
  position: (item: T) => number,
  isImportant: (item: T) => boolean,
  minimumGap = 44,
) {
  if (items.length <= 2) return items;

  const lastIndex = items.length - 1;
  const requiredPositions = items.flatMap((item, index) =>
    index === 0 || index === lastIndex || isImportant(item) ? [position(item)] : [],
  );
  const selectedPositions = [...requiredPositions];

  return items.filter((item, index) => {
    if (index === 0 || index === lastIndex || isImportant(item)) return true;

    const itemPosition = position(item);
    if (selectedPositions.some((selected) => Math.abs(selected - itemPosition) < minimumGap)) return false;
    selectedPositions.push(itemPosition);
    return true;
  });
}

function niceChartCeiling(value: number) {
  const step = value <= 100 ? 25 : value <= 500 ? 50 : 100;
  return Math.max(50, Math.ceil(value / step) * step);
}
