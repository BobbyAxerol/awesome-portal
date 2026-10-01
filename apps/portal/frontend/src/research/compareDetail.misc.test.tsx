/**
 * Batch F4/MISC · S13 — the per-fold figure for a fixed-profile attempt, and a long ladder.
 * Canonical `research-compare.attempts` fixture: two walk-forward attempts (2 folds each) and one
 * P04 fixed-profile attempt whose OOS Sharpe and per-fold rows are NOT_PUBLISHED.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompareRoute } from "./CompareRoute";
import { SINGLE_OOS_WINDOW } from "./compareFoldBars";
import type { Compare, CompareRun } from "./compareClient";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = () =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-compare.attempts.valid.json"), "utf8")) as Compare;
const ALPHA = "delta-rsi-polynomial-alpha";

function mount(body: Compare) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/compare`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/compare" element={<CompareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const settled = () => waitFor(() => expect(document.querySelector('[data-screen="compare"]')?.getAttribute("aria-busy")).toBe("false"));
const chart = () => document.querySelector('[data-panel="fold-chart"]') as HTMLElement;

/** The P04 attempt publishes its OOS Sharpe (the value the one window carries). */
function withP04Sharpe(body: Compare, value: string): Compare {
  if (body.result.mode !== "attempts") throw new Error("fixture guard");
  const p04 = body.result.attempts.find((run) => run.lane === "P04_FIXED_PROFILE")!;
  p04.original_metrics = p04.original_metrics.map((metric) =>
    metric.key === "OOS_SHARPE" ? { ...metric, value, scope: "P04_OUTER_OOS_WINDOW", availability: { state: "AVAILABLE", reason_code: null } } : metric,
  );
  return body;
}

describe("S13 single OOS window", () => {
  it("draws the P04 attempt's published OOS Sharpe as ONE bar labelled 'single OOS window', beside the real folds", async () => {
    mount(withP04Sharpe(fixture(), "0.4217"));
    await settled();
    const bar = chart().querySelector('[data-fold-bar="run-w6a-p04:single OOS window"]');
    expect(bar?.getAttribute("data-exact")).toBe("0.4217");
    expect(chart().querySelectorAll('[data-fold-bar^="run-w6a-p04:"]')).toHaveLength(1);
    expect(chart().querySelector(`[data-fold-group="${SINGLE_OOS_WINDOW}"]`)?.textContent).toBe(SINGLE_OOS_WINDOW);
    /* The walk-forward folds keep their own groups; the single window never shares one with fold_01. */
    expect(chart().querySelectorAll("[data-fold-group]").length).toBe(3);
    expect(chart().querySelector("[data-fold-meta]")?.textContent).toContain(`2 folds + ${SINGLE_OOS_WINDOW}`);
    /* It is no longer listed as an attempt without per-fold rows. */
    expect(chart().querySelector("[data-fold-absent-runs]")).toBeNull();
  });

  it("a P04 attempt that publishes no OOS Sharpe stays a typed absence with the server's code, as before", async () => {
    mount(fixture());
    await settled();
    expect(chart().querySelector('[data-fold-bar^="run-w6a-p04:"]')).toBeNull();
    expect(chart().querySelector("[data-fold-absent-runs]")?.textContent).toContain("P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE");
  });

  it("when only P04 attempts are compared the figure is that one bar, captioned as such", async () => {
    const body = withP04Sharpe(fixture(), "-0.8");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    body.result.attempts = body.result.attempts.filter((run) => run.lane === "P04_FIXED_PROFILE");
    body.result.fold_series = body.result.fold_series.filter((item) => item.run_id === "run-w6a-p04");
    mount(body);
    await settled();
    expect(chart().querySelectorAll("[data-fold-bar]")).toHaveLength(1);
    expect(chart().querySelector("[data-fold-meta]")?.textContent).toBe(`1 attempt · ${SINGLE_OOS_WINDOW}`);
    expect(chart().querySelector("[data-fold-chart-absent]")).toBeNull();
  });
});

describe("S13 ladder with more than 12 claimed attempts", () => {
  it("keeps one wrapping unit per attempt: every connector lives inside its own step, none after the last", async () => {
    const body = fixture();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    const wfo = body.result.attempts.find((run) => run.lane === "RS02_RETAINED_CURRENT_SOURCE")!;
    const many: CompareRun[] = Array.from({ length: 14 }, (_, index) => ({
      ...wfo,
      run_id: `run-long-${index}`,
      attempt_id: `att_long_${index}`,
      claim: { ...wfo.claim, rank: (wfo.claim.rank ?? 1) + index },
    }));
    body.result.attempts = many;
    body.result.fold_series = many.map((run) => ({
      run_id: run.run_id,
      state: "NOT_PUBLISHED",
      source_fold_count: null,
      truncated: false,
      folds: [],
      availability: { state: "NOT_PUBLISHED", reason_code: "P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE" },
    }));
    mount(body);
    await settled();
    const steps = [...document.querySelectorAll("[data-ladder-step]")];
    expect(steps).toHaveLength(14);
    const arrows = steps.map((step) => step.querySelectorAll("[data-ladder-arrow]").length);
    expect(arrows[0]).toBe(0);
    expect(arrows.slice(1).every((count) => count === 1)).toBe(true);
    expect(document.querySelectorAll("[data-ladder-arrow]")).toHaveLength(13);
    /* The connector is a child of its own step, so a wrapped line never leaves one dangling at a row end. */
    for (const arrow of document.querySelectorAll("[data-ladder-arrow]")) expect(arrow.parentElement?.hasAttribute("data-ladder-step")).toBe(true);
  });
});
