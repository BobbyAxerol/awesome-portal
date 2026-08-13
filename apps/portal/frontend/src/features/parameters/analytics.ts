import { rowParams } from "../../lib/api";

export interface HistogramBin {
  center: number;
  count: number;
  low: number;
  high: number;
}

export function numericValues(rows: Record<string, unknown>[], parameter: string): number[] {
  return rows
    .map((row) => rowParams(row)[parameter])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function buildHistogram(values: number[], requestedBins = 16): HistogramBin[] {
  if (!values.length) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) return [{ center: low, count: values.length, low, high }];
  const binCount = Math.max(1, Math.min(requestedBins, Math.ceil(Math.sqrt(values.length)) * 2));
  const width = (high - low) / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of values) counts[Math.min(binCount - 1, Math.floor((value - low) / width))] += 1;
  return counts.map((count, index) => ({
    low: low + index * width,
    high: low + (index + 1) * width,
    center: low + (index + 0.5) * width,
    count,
  }));
}

export interface HeatmapCell {
  x: number;
  y: number;
  objective: number;
  count: number;
}

export function buildObjectiveHeatmap(rows: Record<string, unknown>[], parameterA: string, parameterB: string): HeatmapCell[] {
  const groups = new Map<string, { x: number; y: number; sum: number; count: number }>();
  for (const row of rows) {
    const params = rowParams(row);
    const x = params[parameterA];
    const y = params[parameterB];
    const objective = row.objective;
    if (typeof x !== "number" || typeof y !== "number" || typeof objective !== "number" || !Number.isFinite(objective)) continue;
    const key = `${x}\u0000${y}`;
    const current = groups.get(key) ?? { x, y, sum: 0, count: 0 };
    current.sum += objective;
    current.count += 1;
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    x: group.x,
    y: group.y,
    objective: group.sum / group.count,
    count: group.count,
  }));
}
