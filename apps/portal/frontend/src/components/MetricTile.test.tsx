/**
 * Metric tile tests.
 *
 * The contract under test: a metric always carries definition, unit, segment
 * and as-of, and a value the engine did not compute never renders as
 * something a reader could mistake for a number.
 */
import { fmtPct } from "../lib/format";
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

  it("colours a signed metric by its sign, because crossing zero changes the outcome", () => {
    expect(metricTone(metricDefinition("total_return_pct"), 12)).toBe("good");
    expect(metricTone(metricDefinition("total_return_pct"), -12)).toBe("bad");
    expect(metricTone(metricDefinition("total_return_pct"), 0)).toBe("neutral");
  });

  it("does not praise a level metric the engine reported without a verdict", () => {
    // The old rule painted this green, which claimed a judgement nobody computed.
    expect(metricTone(metricDefinition("sharpe"), 13.2)).toBe("neutral");
    expect(metricTone(metricDefinition("calmar"), 7231)).toBe("neutral");
    // The adverse side IS defined, so it still flags.
    expect(metricTone(metricDefinition("sharpe"), -0.4)).toBe("bad");
  });

  it("uses the profit factor's own threshold, not zero", () => {
    // Its definition says "below 1 means a net loss".
    expect(metricTone(metricDefinition("profit_factor"), 0.8)).toBe("bad");
    expect(metricTone(metricDefinition("profit_factor"), 1.4)).toBe("neutral");
  });

  it("leaves equity uncoloured, because a colour that never varies says nothing", () => {
    expect(metricTone(metricDefinition("final_equity"), 161634)).toBe("neutral");
    expect(metricTone(metricDefinition("final_equity"), 10)).toBe("neutral");
  });

  it("leaves drawdown uncoloured: every run has one and no threshold was published", () => {
    expect(metricTone(metricDefinition("max_drawdown_pct"), 0)).toBe("neutral");
    expect(metricTone(metricDefinition("max_drawdown_pct"), 12)).toBe("neutral");
  });

  it("gives no tone at all when there is no value", () => {
    expect(metricTone(metricDefinition("sharpe"), null)).toBe("neutral");
  });

  it("groups a large percentage instead of printing a raw run of digits", () => {
    expect(fmtPct(24837.88)).toBe("24,837.88%");
    expect(fmtPct(3.43)).toBe("3.43%");
    expect(fmtPct(708.17, true)).toBe("+708.17%");
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
    expect(container.querySelector(".sr-only")?.textContent).toContain("as-of not published");
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
