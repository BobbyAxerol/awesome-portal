/**
 * Optimization view — what a partially-produced run is allowed to say.
 *
 * The regression this file exists for: an `advanced_walk_forward` run with
 * `optimization_mode: "none"` never writes `wfo/candidates.parquet`, so the API
 * answers 404. The screen used to turn that into a full-page failure, hiding the
 * trials that had loaded, and its funnel printed `candidates 0 → selected 0` —
 * two numbers no artifact ever produced.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesProvider } from "../../app/preferences";

// jsdom has no canvas, and these assertions are about what the screen SAYS,
// not what it draws — the rendered pixels are covered by the visual baseline.
vi.mock("../../charts/EChart", () => ({
  EChart: ({ height }: { height?: number }) => <div data-testid="echart" style={{ height }} />,
}));

import { OptimizationView } from "./OptimizationView";

const TRIALS = {
  total_rows: 3,
  returned_rows: 3,
  rows: [
    { trial_id: 0, objective: 1.1, mean_is_sharpe: 1.2, mean_oos_sharpe: 0.9, mean_decay: 0.2, pruned: false, params_json: '{"window":30}' },
    { trial_id: 1, objective: 1.4, mean_is_sharpe: 1.5, mean_oos_sharpe: 1.1, mean_decay: 0.3, pruned: false, params_json: '{"window":34}' },
    { trial_id: 2, objective: 0.4, mean_is_sharpe: 0.5, mean_oos_sharpe: 0.2, mean_decay: 0.3, pruned: true, params_json: '{"window":38}' },
  ],
};

const FOLDS = {
  total_rows: 1,
  returned_rows: 1,
  rows: [{ fold_id: 0, train_start: "2023-01-01T00:00:00+00:00", train_end: "2023-01-31T23:59:00+00:00", test_start: "2023-02-01T00:00:00+00:00", test_end: "2023-04-30T23:59:00+00:00", train_bars: 44640, test_bars: 128160 }],
};

const TRACE_WITHOUT_TRIAL = {
  artifact_schema_version: "1",
  capabilities: { per_trial_selection_breakdown: false },
  params_semantics: "single_global_parameter_set",
  source: "QuantBT best_trial from walk_forward",
};

const RUN = {
  run_id: "r-1",
  status: "COMPLETED",
  protocol: "advanced_walk_forward",
  strategy_id: "delta-rsi-polynomial-alpha",
  symbol: "BTCUSDT",
  timeframe: "1min",
  created_at: "2026-08-17T02:48:34+00:00",
  completed_at: "2026-08-17T02:48:48+00:00",
  stage_index: 12,
  stage_count: 13,
  events: [
    { state: "QUEUED", at: 1_787_027_548 },
    { state: "OPTIMIZING_IS", at: 1_787_027_554 },
    { state: "COMPLETED", at: 1_787_027_593 },
  ],
  failure: null,
};

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    headers: new Headers({ "x-request-id": "req-test" }),
    json: async () => body,
  } as unknown as Response;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PreferencesProvider>
      <QueryClientProvider client={client}>
        <OptimizationView runId="r-1" />
      </QueryClientProvider>
    </PreferencesProvider>,
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/wfo/trials")) return jsonResponse(TRIALS);
    if (url.includes("/wfo/candidates")) {
      return jsonResponse({ detail: "artifact wfo/candidates.parquet not found", request_id: "req-1" }, 404);
    }
    if (url.includes("/wfo/folds")) return jsonResponse(FOLDS);
    if (url.includes("/selection/trace")) return jsonResponse(TRACE_WITHOUT_TRIAL);
    if (url.includes("/fold-plan")) return jsonResponse({ detail: "not found" }, 404);
    if (url.includes("/audit")) return jsonResponse({ manifest: { completed_at: "2026-08-17T02:48:48+00:00" } });
    if (url.match(/\/api\/runs\/r-1$/)) return jsonResponse(RUN);
    return jsonResponse({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("OptimizationView with an absent candidates artifact", () => {
  it("still renders the trials the run does have", async () => {
    renderView();
    // The trial explorer is proof the screen did not collapse into a failure.
    await waitFor(() => expect(screen.getByText("Trial explorer")).toBeTruthy());
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it("explains the absence in place of the candidate figures", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Trial explorer")).toBeTruthy());
    const explanations = screen.getAllByText(/did not produce wfo\/candidates\.parquet/);
    // Two candidate figures on this screen: the IS/OOS scatter and the decay bars.
    expect(explanations.length).toBeGreaterThanOrEqual(2);
  });

  it("leaves the candidate and selected counts blank instead of printing zero", async () => {
    const { container } = renderView();
    await waitFor(() => expect(screen.getByText("Trial explorer")).toBeTruthy());
    const funnel = container.querySelector('section[aria-label="Search funnel"]');
    expect(funnel).toBeTruthy();
    const values = [...funnel!.querySelectorAll(".mono")].map((node) => node.textContent);
    // sampled=3 and valid=2 are real; candidates and selected have no source.
    expect(values).toContain("3");
    expect(values).toContain("2");
    expect(values.filter((value) => value === "—")).toHaveLength(2);
    expect(values).not.toContain("0");
  });

  it("says the protocol has no candidate stage rather than blaming the load", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Trial explorer")).toBeTruthy());
    expect(screen.getByText("no candidate stage")).toBeTruthy();
  });

  it("does not claim a selected trial when the trace records none", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Selected parameter set")).toBeTruthy());
    expect(screen.getByText("not recorded")).toBeTruthy();
    expect(screen.getByText(/evaluated one global\s+parameter set/)).toBeTruthy();
  });

  it("draws the stages the run actually entered", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Stages")).toBeTruthy());
    expect(screen.getByText("optimizing is")).toBeTruthy();
    // The final state has no successor, so it has no duration to claim.
    expect(screen.getByText("final")).toBeTruthy();
  });
});

describe("OptimizationView with an unreadable trials artifact", () => {
  it("refuses to render an empty screen when the response is not the row envelope", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // A bare array: what an API build older than the envelope contract sends.
      if (url.includes("/wfo/trials")) return jsonResponse(TRIALS.rows);
      if (url.match(/\/api\/runs\/r-1$/)) return jsonResponse(RUN);
      return jsonResponse({}, 404);
    }) as typeof fetch;
    renderView();
    await waitFor(() => expect(screen.getByText(/older build/)).toBeTruthy());
    expect(screen.queryByText("Trial explorer")).toBeNull();
  });
});
