/**
 * Parameters view — whose search range, and what the run admits to.
 *
 * Two claims are defended here. The first is identity: the panel must measure
 * the frozen values against the range of the strategy THIS run used, not the
 * first strategy the API lists — the fixture deliberately puts a decoy first.
 * The second is disclosure: `oos_used_for_selection: true` changes how every OOS
 * number in the module should be read, so it has to appear without the reader
 * expanding anything.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesProvider } from "../../app/preferences";
import { ParametersView } from "./ParametersView";

vi.mock("../../charts/EChart", () => ({
  EChart: ({ height }: { height?: number }) => <div data-testid="echart" style={{ height }} />,
}));

// Held in a constant rather than written into the assertion: a hash followed
// by three digits matches the raw-colour gate's pattern, and the gate is right
// to be blunt about it.
const TRIAL_ID = 107;

const DECOY_STRATEGY = {
  strategy_id: "some-other-alpha",
  display_name: "Some Other Alpha",
  version: "9.9.9",
  default_timeframe: "1d",
  required_columns: ["close"],
  structural_contract: { decoy: true },
  // Wide enough that `window: 34` would read as a low percentile against it.
  parameter_space: { window: { low: 0, high: 1000, step: 1 } },
};

const RUN_STRATEGY = {
  strategy_id: "delta-rsi-polynomial-alpha",
  display_name: "Delta-RSI Polynomial Alpha",
  version: "1.0.0",
  default_timeframe: "1h",
  required_columns: ["open", "high", "low", "close", "volume"],
  structural_contract: { polynomial_degree: 2, hard_stop_loss: true },
  parameter_space: { window: { low: 20, high: 60, step: 2 }, rvol: { low: 1.2, high: 1.6, step: 0.1 } },
};

const PARAMETERS = {
  params_by_fold: {},
  selected: {
    params: { window: 34, rvol: 1.6 },
    trial_id: TRIAL_ID,
    frozen_at: "2026-08-18T04:33:13+00:00",
    params_hash: "98dbd1e23da393fc05915d25d0cbce6e050e4f572d7d23c55d3a4f385a8771ef",
    params_semantics: "single_global_parameter_set",
    causality_claim: "retrospective_global_calibration",
    validation_claim: "walk_forward_oos",
    oos_used_for_selection: true,
  },
};

const TRIALS = {
  total_rows: 2,
  returned_rows: 2,
  rows: [
    { trial_id: 0, objective: 1.1, params_json: '{"window":30,"rvol":1.3}' },
    { trial_id: 1, objective: 1.4, params_json: '{"window":34,"rvol":1.6}' },
  ],
};

const RUN = {
  run_id: "r-1",
  status: "COMPLETED",
  protocol: "three_window_decay",
  strategy_id: "delta-rsi-polynomial-alpha",
  symbol: "ETHUSDT",
  timeframe: "1h",
  created_at: "2026-08-18T04:32:28+00:00",
  completed_at: "2026-08-18T04:33:14+00:00",
  stage_index: 12,
  stage_count: 13,
  events: [],
  failure: null,
};

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: "OK",
    headers: new Headers({ "x-request-id": "req-test" }),
    json: async () => body,
  } as unknown as Response;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PreferencesProvider>
      <QueryClientProvider client={client}>
        <ParametersView runId="r-1" />
      </QueryClientProvider>
    </PreferencesProvider>,
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/wfo/parameters")) return jsonResponse(PARAMETERS);
    if (url.includes("/wfo/trials")) return jsonResponse(TRIALS);
    // The decoy sorts first on purpose.
    if (url.includes("/api/strategies")) return jsonResponse([DECOY_STRATEGY, RUN_STRATEGY]);
    if (url.includes("/audit")) return jsonResponse({ manifest: {} });
    if (url.match(/\/api\/runs\/r-1$/)) return jsonResponse(RUN);
    return jsonResponse({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("ParametersView", () => {
  it("measures each value against the range of the run's own strategy", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Frozen parameter set θ*")).toBeTruthy());
    // window 34 in [20,60] is p35. Against the decoy's [0,1000] it would be p3.
    expect(screen.getByText("p35 of 20–60")).toBeTruthy();
  });

  it("does not compress a range narrower than one unit", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Frozen parameter set θ*")).toBeTruthy());
    // rvol 1.6 sits at the top of [1.2, 1.6]; the old divisor made this p40.
    expect(screen.getByText("p100 of 1.2–1.6")).toBeTruthy();
  });

  it("names the run's strategy in the structural contract, not the first listed", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Frozen parameter set θ*")).toBeTruthy());
    expect(screen.getByText(/Structural contract — Delta-RSI Polynomial Alpha v1\.0\.0/)).toBeTruthy();
    expect(screen.queryByText(/Some Other Alpha/)).toBeNull();
  });

  it("states that the OOS segment was consulted while selecting", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("What this parameter set claims")).toBeTruthy());
    expect(screen.getByText(/not an untouched hold-out/)).toBeTruthy();
  });

  it("carries the selection provenance the artifact publishes", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("Frozen parameter set θ*")).toBeTruthy());
    expect(screen.getByText(new RegExp(`trial #${TRIAL_ID}`))).toBeTruthy();
    expect(screen.getByText(/98dbd1e23da3…/)).toBeTruthy();
    expect(screen.getByText("retrospective global calibration")).toBeTruthy();
    expect(screen.getByText("walk forward oos")).toBeTruthy();
  });

  it("says the run did not refit per fold rather than leaving the question open", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("What this parameter set claims")).toBeTruthy());
    expect(screen.getByText("none — the run did not refit per fold")).toBeTruthy();
  });
});

describe("ParametersView when no registered strategy matches the run", () => {
  it("says the search ranges are not on record instead of borrowing another strategy's", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wfo/parameters")) return jsonResponse(PARAMETERS);
      if (url.includes("/wfo/trials")) return jsonResponse(TRIALS);
      if (url.includes("/api/strategies")) return jsonResponse([DECOY_STRATEGY]);
      if (url.includes("/audit")) return jsonResponse({ manifest: {} });
      if (url.match(/\/api\/runs\/r-1$/)) return jsonResponse(RUN);
      return jsonResponse({}, 404);
    }) as typeof fetch;
    renderView();
    await waitFor(() => expect(screen.getByText("Frozen parameter set θ*")).toBeTruthy());
    expect(screen.getAllByText("search range not published").length).toBe(2);
    expect(screen.getByText(/No registered strategy matches/)).toBeTruthy();
    // And the decoy's thesis is not offered as this run's.
    expect(screen.queryByText(/Structural contract/)).toBeNull();
  });
});
