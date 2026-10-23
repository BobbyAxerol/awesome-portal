/** Types for the fixture-lane consumer (apps/portal/fixture-bff). The helper itself is plain JS; bodies are served as the existing ManagerSeriesResponse shape. */
export interface PositiveManagerSeriesInput {
  lane: "FIXTURE_LAB";
  /** A populated canonical NAV ManagerSeriesResponse (metric "NAV", 1..4 AVAILABLE series). */
  nav: unknown;
  /** 3..1440; default 240. A test-data density, not an API limit. */
  pointCount?: number;
}
export type PositiveManagerSeries = Record<"NAV" | "NET_PNL" | "RETURN" | "DRAWDOWN", Record<string, unknown>>;
export function buildPositiveManagerSeries(input: PositiveManagerSeriesInput): PositiveManagerSeries;
