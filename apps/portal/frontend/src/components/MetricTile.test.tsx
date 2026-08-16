/**
 * Metric tile tests.
 *
 * The contract under test: a metric always carries definition, unit, segment
 * and as-of, and a value the engine did not compute never renders as
 * something a reader could mistake for a number.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetricTile, type MetricEvidence } from "./MetricTile";
import {
  HEADLINE_METRICS,
  MATRIX_METRICS,
  metricDefinition,
  metricTone,
} from "../features/overview/metricDefinitions";

afterEach(cleanup);

const evidence: MetricEvidence = {
  segment: "oos",
  source: "metrics/summary.json#oos",
  asOf: "2026-08-15T18:00:00Z",
  digest: "sha256:4117b87006525d576aef7559c001002f18ea9f78e9fa83c64187d2776f4e9d18",
};

describe("metric definitions", () => {
  it("defines every metric the screens display", () => {
    for (const key of [...HEADLINE_METRICS, ...MATRIX_METRICS]) {
      const definition = metricDefinition(key);
      expect(definition.definition.length).toBeGreaterThan(20);
      expect(definition.label).toBeTruthy();
    }
  });

  it("falls back descriptively for an unknown metric instead of hiding it", () => {
    const definition = metricDefinition("some_new_metric_pct");
    expect(definition.label).toBe("some new metric pct");
    expect(definition.unit).toBe("percent");
    expect(definition.direction).toBe("none");
  });

  it("marks the annualized metrics, which depend on the config calendar", () => {
    expect(metricDefinition("sharpe").annualized).toBe(true);
    expect(metricDefinition("cagr_pct").annualized).toBe(true);
    expect(metricDefinition("num_trades").annualized).toBeUndefined();
  });

  it("never colours a descriptive metric good or bad", () => {
    expect(metricTone(metricDefinition("num_trades"), 500)).toBe("neutral");
    expect(metricTone(metricDefinition("num_trades"), 0)).toBe("neutral");
  });

  it("treats any non-zero drawdown as adverse", () => {
    expect(metricTone(metricDefinition("max_drawdown_pct"), 0)).toBe("neutral");
    expect(metricTone(metricDefinition("max_drawdown_pct"), 12)).toBe("bad");
  });

  it("gives no tone at all when there is no value", () => {
    expect(metricTone(metricDefinition("sharpe"), null)).toBe("neutral");
  });
});

describe("MetricTile", () => {
  it("renders the value with its definition and provenance", () => {
    const { container } = render(
      <MetricTile metricKey="sharpe" value={1.42} evidence={evidence} />,
    );
    expect(container.querySelector(".metric-tile-value")?.textContent).toContain("1.42");
    expect(container.querySelector(".metric-tile-foot")?.textContent).toContain("oos");
    expect(container.textContent).toContain("annualized");
    // The definition is reachable without a hover-only affordance.
    expect(screen.getByRole("note").getAttribute("aria-label")).toContain("Sharpe");
  });

  it("carries segment, source and as-of for a screen reader", () => {
    const { container } = render(<MetricTile metricKey="sharpe" value={1} evidence={evidence} />);
    const sr = container.querySelector(".sr-only")?.textContent ?? "";
    expect(sr).toContain("segment oos");
    expect(sr).toContain("metrics/summary.json#oos");
    expect(sr).toContain("as-of 2026-08-15T18:00:00Z");
  });

  it("says as-of is not published rather than inventing one", () => {
    const { container } = render(
      <MetricTile metricKey="sharpe" value={1} evidence={{ ...evidence, asOf: null }} />,
    );
    expect(container.querySelector(".sr-only")?.textContent).toContain("as-of chưa công bố");
  });

  it("renders a null metric as an explicit absent state, not a dash", () => {
    const { container } = render(
      <MetricTile metricKey="sharpe" value={null} evidence={evidence} />,
    );
    expect(container.querySelector(".metric-tile-value")).toBeNull();
    expect(container.querySelector(".metric-tile-absent")).not.toBeNull();
    expect(container.querySelector(".metric-tile-absent")?.textContent).not.toMatch(/^[—\-0]$/);
  });

  it("renders a real zero as a number", () => {
    const { container } = render(
      <MetricTile metricKey="num_trades" value={0} evidence={evidence} />,
    );
    expect(container.querySelector(".metric-tile-value")?.textContent).toBe("0");
    expect(container.querySelector(".metric-tile-absent")).toBeNull();
  });

  it("formats each unit with its own formatter", () => {
    const money = render(<MetricTile metricKey="final_equity" value={20000} evidence={evidence} />);
    expect(money.container.querySelector(".metric-tile-value")?.textContent).toContain("$");
    cleanup();
    const pct = render(<MetricTile metricKey="max_drawdown_pct" value={12.5} evidence={evidence} />);
    expect(pct.container.querySelector(".metric-tile-value")?.textContent).toContain("%");
  });
});
