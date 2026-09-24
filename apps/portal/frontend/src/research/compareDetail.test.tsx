/**
 * P20 consumer tests — Screen 13 Compare (S13-U01…).
 *
 * The claims that carry this phase:
 *
 *  - **One read per question.** One GET per (Alpha, mode, runs); a retry
 *    resends the ETag and a `304` keeps the copy in hand.
 *  - **Order and values are the server's.** Attempts keep the server's order;
 *    decimals, deltas and the correlation are printed as sent.
 *  - **A refused pair has nothing behind it.** No chart, delta, correlation,
 *    weaker claim or difference node exists when the server refuses.
 *  - **Refusals are neutral.** 403 and 404 say the same sentence and take the
 *    same state; the server's prose is never rendered.
 *  - **No comparison, same frame.** Loading and refusals keep the mode's blocks.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATTEMPTS_RULE,
  COMPARE_PANELS,
  COMPARE_RULES,
  COMPARE_TITLE,
  MODE_LABELS,
  PAIR_NEEDS_TWO,
  RESOLVER_NEEDS_ALPHA,
  overlayPlot,
} from "./CompareDetail";
import { CompareResolverRoute, CompareRoute } from "./CompareRoute";
import {
  CLAIM_RANK_MAP,
  COMPARE_NEUTRAL_REFUSAL,
  COMPARE_REFUSAL_COPY,
  COMPARE_REFUSAL_MESSAGE,
  LADDER_HEADER,
  MARKETS_CAPTION,
  compareEntryHref,
  compareHref,
  comparePath,
  compareState,
  pairRuns,
  type Compare,
  type CompareRun,
  type MarketChart,
  type PairComparable,
} from "./compareClient";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- fixtures */

/*
 * Shape, enums and reason codes from `apps/control-api/src/research/
 * compare.contract.ts` and `compare.service.ts` (no canonical frontend
 * fixture is published for P20).
 */
const ALPHA = "alpha-momentum";
const T0 = 1_785_000_000_000;
const DAY = 86_400_000;
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const np = (reason: string) => ({ state: "NOT_PUBLISHED", reason_code: reason }) as const;

function key(symbol: string, timeframe = "4h") {
  return { symbol, timeframe, route: "binance-perp", protocol: "wf-v1", availability: AVAILABLE } as const;
}

function run(id: string, overrides: Partial<CompareRun> = {}): CompareRun {
  return {
    run_id: id,
    attempt_id: `att_${id}`,
    alpha_version_id: "alphaver_1",
    alpha_version_label: "av_0_9_2",
    run_state: "READY",
    created_at_utc_ms: T0,
    comparison_contract_key: key("BTCUSDT"),
    claim: {
      family: "WALK_FORWARD_OOS_COMPATIBILITY",
      rank: 3,
      origin: "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL",
      text: "walk-forward compatible claim",
      availability: AVAILABLE,
    },
    original_metrics: [
      { key: "NET_RETURN_FRACTION", definition_id: "net-return.v1", scope: "original", value: "0.4217", availability: AVAILABLE },
      { key: "MAX_DRAWDOWN_FRACTION", definition_id: "mdd.v1", scope: "original", value: "-0.1375", availability: AVAILABLE },
      { key: "TRADE_COUNT", definition_id: "trades.v1", scope: "original", value: "118", availability: AVAILABLE },
      { key: "OOS_SHARPE", definition_id: "oos-sharpe.v1", scope: "original", value: null, availability: np("P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE") },
      { key: "DECAY", definition_id: "decay.v1", scope: "original", value: null, availability: np("P20_SOURCE_DID_NOT_PUBLISH_DECAY") },
    ],
    provenance: {
      requested_spec_digest: null,
      effective_spec_digest: null,
      dataset_binding_digest: null,
      manifest_digest: null,
      evidence_revision: null,
      split_revision: null,
      current_source_revision: null,
    },
    ...overrides,
  };
}

const NOT_PUBLISHED_CLAIM = {
  family: "NOT_PUBLISHED",
  rank: null,
  origin: "NOT_PUBLISHED",
  text: null,
  availability: np("P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED"),
} as const;

function envelope(result: Compare["result"], overrides: Partial<Compare> = {}): Compare {
  return {
    schema_version: "research.compare.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    alpha: { alpha_id: ALPHA, name: "Momentum BTC" },
    revision: "rev_7",
    etag: '"cmp-rev-7"',
    availability: AVAILABLE,
    as_of_utc_ms: T0 + DAY,
    result,
    source_absences: {
      structured_claim_family: np("P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED"),
      full_resolution_outer_oos_returns: np("P20_FULL_RESOLUTION_RETURNS_APPLY_TO_PAIR_MODE_ONLY"),
    },
    ...overrides,
  };
}

const TRAJECTORY = {
  template_id: "P20_ATTEMPT_TRAJECTORY_V1",
  text: "claims rank before numbers — inspection never selects, promotes, approves, or publishes a run.",
  availability: AVAILABLE,
} as const;

function attempts(runs: CompareRun[]) {
  return envelope({
    mode: "attempts",
    attempts: runs,
    coverage: { state: "COMPLETE", total_attempts: runs.length, reason_code: null },
    trajectory: TRAJECTORY,
  });
}

function chart(state: "AVAILABLE" | "NOT_PUBLISHED"): MarketChart {
  return state === "AVAILABLE"
    ? {
        state,
        sampling: "FULL",
        source_observation_count: 3,
        emitted_point_count: 3,
        points: [
          { at_utc_ms: T0, equity: "1000" },
          { at_utc_ms: T0 + DAY, equity: "1040.5" },
          { at_utc_ms: T0 + 2 * DAY, equity: "1012.25" },
        ],
        availability: AVAILABLE,
      }
    : {
        state,
        sampling: "NOT_APPLICABLE",
        source_observation_count: null,
        emitted_point_count: 0,
        points: [],
        availability: np("P20_P13_EQUITY_SERIES_NOT_AVAILABLE"),
      };
}

function markets() {
  return envelope({
    mode: "markets",
    caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie.",
    cards: [
      { run: run("run_btc"), chart: chart("AVAILABLE") },
      { run: run("run_eth", { comparison_contract_key: key("ETHUSDT"), run_state: "QUEUED", claim: NOT_PUBLISHED_CLAIM }), chart: chart("NOT_PUBLISHED") },
    ],
    coverage: { state: "COMPLETE", total_attempts: 2, reason_code: null },
  });
}

function pairData(overrides: Partial<PairComparable["pair"]> = {}): PairComparable["pair"] {
  return {
    key: key("BTCUSDT"),
    runs: [run("run_a"), run("run_b", { alpha_version_label: "av_0_9_3" })],
    intentional_differences: [{ path: "random_seed", before: "7", after: "11" }],
    weaker_claim: { family: "WALK_FORWARD_OOS_COMPATIBILITY", rank: 3, availability: AVAILABLE },
    common_window: {
      state: "AVAILABLE",
      definition_id: "research.compare-common-window.v1",
      left_source_observation_count: 400,
      right_source_observation_count: 410,
      matched_observation_count: 398,
      start_utc_ms: T0,
      end_utc_ms: T0 + 2 * DAY,
      metrics: [
        { key: "NET_RETURN_FRACTION", definition_id: "net-return.v1", left_value: "0.4217", right_value: "0.3901", delta: "-0.0316", availability: AVAILABLE },
        { key: "MAX_DRAWDOWN_FRACTION", definition_id: "mdd.v1", left_value: "-0.1375", right_value: "-0.1102", delta: "0.0273", availability: AVAILABLE },
        {
          key: "TRADE_COUNT",
          definition_id: "trades.v1",
          left_value: null,
          right_value: null,
          delta: null,
          availability: { state: "NOT_APPLICABLE", reason_code: "P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT" },
        },
      ],
      availability: AVAILABLE,
    },
    correlation: {
      state: "AVAILABLE",
      source_label: "PORTAL_DERIVED",
      formula_id: "pearson-product-moment-correlation",
      formula_version: "p20.raw-return-v1",
      value: "0.412345",
      n: 397,
      common_window_start_utc_ms: T0,
      common_window_end_utc_ms: T0 + 2 * DAY,
      missing_policy: "INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL",
      availability: AVAILABLE,
    },
    overlay: {
      state: "AVAILABLE",
      sampling: "FULL",
      source_observation_count: 3,
      emitted_point_count: 3,
      points: [
        { at_utc_ms: T0, left_equity: "1000", right_equity: "1000" },
        { at_utc_ms: T0 + DAY, left_equity: "1050", right_equity: "1020" },
        { at_utc_ms: T0 + 2 * DAY, left_equity: "1030", right_equity: "1060" },
      ],
      availability: AVAILABLE,
    },
    ...overrides,
  };
}

function pair(state: "AVAILABLE" | "PARTIAL" = "AVAILABLE", data: PairComparable["pair"] = pairData()) {
  return envelope({ mode: "pair", state, refusal: null, pair: data });
}

function refused() {
  return envelope({
    mode: "pair",
    state: "REFUSED",
    refusal: {
      code: "P20_CONTRACT_KEY_MISMATCH",
      message:
        "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses.",
      left_key: key("BTCUSDT"),
      right_key: key("ETHUSDT", "1h"),
    },
    pair: null,
  });
}

/* ------------------------------------------------------------------ server */

type Answer = { status: number; body?: unknown };
type Call = { url: string; headers: Record<string, string>; method: string };

function server(answers: Answer[]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const answer = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (answer.status === 304) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return { calls };
}

const problem = (status: number, code: string): Answer => ({
  status,
  body: { error: { code, message: "server prose: run owned by alice@example" }, request_id: "req_p20" },
});

function LocationProbe() {
  const location = useLocation();
  return <output data-location>{`${location.pathname}${location.search}`}</output>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/research/quantbt/alphas/:alphaId/compare"
          element={
            <>
              <CompareRoute />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/research/quantbt/compare"
          element={
            <>
              <CompareResolverRoute />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const base = `/research/quantbt/alphas/${ALPHA}/compare`;
const page = () => document.querySelector('[data-screen="compare"]') as HTMLElement;
const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`);
const panels = () => Array.from(document.querySelectorAll("[data-panel]")).map((el) => el.getAttribute("data-panel"));
const settled = () => waitFor(() => expect(page().getAttribute("aria-busy")).toBe("false"));
const location = () => document.querySelector("[data-location]")?.textContent;

/* ------------------------------------------------------------------- tests */

describe("S13 Compare — reads and order", () => {
  it("S13-U01 loading keeps the attempts frame: every block in place, no digit, no ladder card", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderAt(base);
    expect(page().getAttribute("data-compare-state")).toBe("loading");
    for (const name of ["header", "meta", "rule", "ladder", "fold-chart", "diff", "trajectory", "rules"]) expect(panel(name), name).not.toBeNull();
    expect(document.querySelectorAll("[data-ladder-run]")).toHaveLength(0);
    expect(panel("ladder")?.textContent).not.toMatch(/\d/);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(COMPARE_TITLE);
  });

  it("S13-U02 sends one GET with mode=attempts and lays the server's attempt order out reversed, weak → strong as the hi-fi reads (rank 3, 3, not published)", async () => {
    const { calls } = server([
      { status: 200, body: attempts([run("run_z"), run("run_a"), run("run_m", { claim: NOT_PUBLISHED_CLAIM })]) },
    ]);
    renderAt(base);
    await settled();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`/api/v1/research/alphas/${ALPHA}/compare?mode=attempts`);
    const order = Array.from(document.querySelectorAll("[data-ladder-run]")).map((el) => el.getAttribute("data-ladder-run"));
    expect(order).toEqual(["run_m", "run_a", "run_z"]);
    expect(document.querySelector("[data-ladder-order]")?.getAttribute("data-ladder-order")).toBe("server-reversed");
    const arrows = Array.from(document.querySelectorAll("[data-ladder-arrow]"));
    expect(arrows).toHaveLength(2);
    expect(arrows.map((el) => el.textContent?.trim())).toEqual(["claim ↑ →", "claim ↑ →"]);
    expect(panels()).toEqual([...COMPARE_PANELS.attempts]);
  });

  it("S13-U03 the claim rank map covers all five families with spec ranks and palette tokens only", () => {
    expect(Object.keys(CLAIM_RANK_MAP).sort()).toEqual(
      ["NONE_FULL_SAMPLE_CALIBRATION", "NOT_PUBLISHED", "SELECTION_ADJUSTED_OOS", "STRICT_OUTER_OOS", "WALK_FORWARD_OOS_COMPATIBILITY"],
    );
    expect(CLAIM_RANK_MAP.STRICT_OUTER_OOS.rank).toBe(1);
    expect(CLAIM_RANK_MAP.SELECTION_ADJUSTED_OOS.rank).toBe(2);
    expect(CLAIM_RANK_MAP.WALK_FORWARD_OOS_COMPATIBILITY.rank).toBe(3);
    expect(CLAIM_RANK_MAP.NONE_FULL_SAMPLE_CALIBRATION.rank).toBe(4);
    expect(CLAIM_RANK_MAP.NOT_PUBLISHED.rank).toBeNull();
    for (const entry of Object.values(CLAIM_RANK_MAP)) expect(entry.token).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("S13-U04 OOS sharpe, cert and per-fold chart are typed absences; ladder header and trajectory are verbatim", async () => {
    server([{ status: 200, body: attempts([run("run_a")]) }]);
    renderAt(base);
    await settled();
    const card = document.querySelector('[data-ladder-run="run_a"]') as HTMLElement;
    expect(card.querySelector("[data-oos-sharpe]")).toBeNull();
    expect(card.querySelector("[data-oos-sharpe-absent]")?.textContent).toContain("P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE");
    expect(card.querySelector("[data-cert-absent]")?.textContent).toContain("CG-P20-03");
    expect(card.querySelector("[data-claim-origin]")?.textContent).toContain("PORTAL_DERIVED_FROM_SOURCE_PROTOCOL");
    expect(panel("fold-chart")?.querySelector("[data-fold-chart-absent]")?.textContent).toContain("CG-P20-04");
    expect(document.querySelector("[data-ladder-header]")?.textContent).toBe(LADDER_HEADER);
    expect(document.querySelector("[data-trajectory-text]")?.textContent).toBe(TRAJECTORY.text);
    expect(panel("rule")?.textContent).toContain(ATTEMPTS_RULE);
    expect(panel("rules")?.textContent).toContain(COMPARE_RULES);
    expect(panel("diff")?.textContent).toContain("CG-P20-05");
  });

  it("S13-U05 PARTIAL coverage says so, with the total and the reason, and the screen is partial", async () => {
    const body = attempts([run("run_a")]);
    (body.result as { coverage: unknown }).coverage = { state: "PARTIAL", total_attempts: 40, reason_code: "P20_BOUNDED_ATTEMPT_LIMIT_REACHED" };
    server([{ status: 200, body }]);
    renderAt(base);
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("partial");
    const partial = document.querySelector("[data-coverage-partial]") as HTMLElement;
    expect(partial.textContent).toContain("40 attempts in total");
    expect(partial.textContent).toContain("P20_BOUNDED_ATTEMPT_LIMIT_REACHED");
  });
});

describe("S13 Compare — markets", () => {
  it("S13-U06 small multiples: server caption, no overlay, one chart drawn and one absent, QUEUED shown", async () => {
    const { calls } = server([{ status: 200, body: markets() }]);
    renderAt(`${base}?mode=markets`);
    await settled();
    expect(calls[0]!.url).toContain("mode=markets");
    expect(calls[0]!.url).not.toContain("runs=");
    expect(document.querySelector("[data-caption]")?.textContent).toBe(MARKETS_CAPTION);
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    expect(document.querySelector("[data-delta-table]")).toBeNull();
    expect(document.querySelector('[data-mini-chart="AVAILABLE"] svg path.cp-mini-line')).not.toBeNull();
    const eth = document.querySelector('[data-market-run="run_eth"]') as HTMLElement;
    expect(eth.querySelector('[data-mini-chart="NOT_PUBLISHED"]')?.textContent).toContain("P20_P13_EQUITY_SERIES_NOT_AVAILABLE");
    expect(eth.querySelector('[data-state="QUEUED"]')).not.toBeNull();
    expect(panels()).toEqual([...COMPARE_PANELS.markets]);
  });
});

describe("S13 Compare — pair", () => {
  it("S13-U07 AVAILABLE pair: overlay of two lines, six delta rows with server deltas, correlation, weaker claim", async () => {
    const { calls } = server([{ status: 200, body: pair() }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    expect(calls[0]!.url).toBe(`/api/v1/research/alphas/${ALPHA}/compare?mode=pair&runs=run_a%2Crun_b`);
    expect(document.querySelectorAll('[data-pair-overlay="AVAILABLE"] path[data-line]')).toHaveLength(2);
    const rows = Array.from(document.querySelectorAll("[data-delta-row]")).map((el) => el.getAttribute("data-delta-row"));
    expect(rows).toEqual(["OOS_SHARPE", "NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT", "WIN_RATE", "CLAIM"]);
    const net = document.querySelector('[data-delta-row="NET_RETURN_FRACTION"] td[data-sign]') as HTMLElement;
    expect(net.textContent).toBe("-0.0316");
    expect(net.getAttribute("data-sign")).toBe("neg");
    expect(document.querySelector('[data-delta-row="MAX_DRAWDOWN_FRACTION"] td[data-sign]')?.getAttribute("data-sign")).toBe("pos");
    expect(document.querySelector("[data-rho]")?.textContent).toBe("ρ = 0.412345");
    expect(document.querySelector("[data-correlation-source]")?.textContent).toContain("PORTAL_DERIVED");
    expect(document.querySelector("[data-correlation-meta]")?.textContent).toContain("INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL");
    expect(document.querySelector("[data-promotes-under]")?.textContent).toBe(
      "the pair promotes under its weaker claim: WALK_FORWARD_OOS_COMPATIBILITY",
    );
    expect(document.querySelector('[data-difference="random_seed"]')?.textContent).toContain("11");
    expect(panels()).toEqual([...COMPARE_PANELS.pair]);
  });

  it("S13-U08 TRADE_COUNT has no common-window Δ: NOT_APPLICABLE with its reason, never a digit", async () => {
    server([{ status: 200, body: pair() }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const delta = document.querySelector('[data-delta-row="TRADE_COUNT"] td.d') as HTMLElement;
    expect(delta.getAttribute("data-sign")).toBeNull();
    expect(delta.textContent).toContain("not applicable");
    expect(delta.textContent).toContain("P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT");
  });

  it("S13-U09 PARTIAL pair names its gap; correlation zero-variance is a named absence, not 0", async () => {
    const data = pairData({
      correlation: {
        ...pairData().correlation,
        state: "NOT_PUBLISHED",
        value: null,
        availability: np("P20_ZERO_VARIANCE_RAW_RETURNS"),
      },
      common_window: { ...pairData().common_window, availability: { state: "PARTIAL", reason_code: "P20_INSUFFICIENT_COMMON_RAW_RETURNS" } },
    });
    server([{ status: 200, body: pair("PARTIAL", data) }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("partial");
    expect(document.querySelector("[data-pair-partial-reason]")?.textContent).toBe("P20_INSUFFICIENT_COMMON_RAW_RETURNS");
    expect(document.querySelector("[data-rho]")).toBeNull();
    expect(document.querySelector("[data-correlation-absent]")?.textContent).toBe("correlation not derived — P20_ZERO_VARIANCE_RAW_RETURNS");
  });

  it("S13-U10 REFUSED pair: refusal card and mismatched key parts, zero chart/delta/correlation/weaker nodes", async () => {
    server([{ status: 200, body: refused() }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    expect(page().getAttribute("data-pair-state")).toBe("REFUSED");
    expect(document.querySelector("[data-refusal-message]")?.textContent).toBe(COMPARE_REFUSAL_MESSAGE);
    for (const selector of ["[data-pair-overlay]", "[data-delta-table]", "[data-correlation]", "[data-weaker-claim]", "svg", "[data-rho]", "[data-difference]"]) {
      expect(document.querySelectorAll(selector), selector).toHaveLength(0);
    }
    const mismatched = Array.from(document.querySelectorAll('[data-key-side="left"] [data-mismatch="true"]')).map((el) => el.getAttribute("data-part"));
    expect(mismatched).toEqual(["symbol", "timeframe"]);
    expect(panels()).toEqual([...COMPARE_PANELS.refused]);
  });

  it("S13-U11 a pair without exactly two runs sends nothing and says so, frame intact", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt(`${base}?mode=pair&runs=run_a`);
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelector("[data-idle-reason]")?.textContent).toBe(PAIR_NEEDS_TWO);
    for (const name of ["guard", "overlay", "delta", "correlation"]) expect(panel(name), name).not.toBeNull();
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    expect(pairRuns(["a"])).toBeNull();
    expect(pairRuns(["a", ""])).toBeNull();
    expect(pairRuns(["a", "b", "c"])).toBeNull();
    expect(pairRuns(["a", "b"])).toEqual(["a", "b"]);
  });

  it("S13-U12 overlay geometry shares one scale and splits at the seam; an unparsable point draws nothing", () => {
    const plot = overlayPlot(pairData().overlay.points)!;
    expect(plot.left.startsWith("M")).toBe(true);
    expect(plot.right.startsWith("M")).toBe(true);
    expect(plot.left.split(" L")).toHaveLength(3);
    expect(plot.right.split(" L")).toHaveLength(3);
    expect(plot.yLabels.map((label) => label.text)).toEqual(["1060", "1000"]);
    expect(plot.xLabels.map((label) => label.text)).toHaveLength(3);
    expect(overlayPlot([{ at_utc_ms: T0, left_equity: "abc", right_equity: "1" }])).toBeNull();
    expect(overlayPlot([])).toBeNull();
  });
});

describe("S13 Compare — refusals and validators", () => {
  it("S13-U13 a 503 is retryable with the read-again button; the retry sends no validator it never had", async () => {
    const { calls } = server([
      { status: 503, body: { error: { code: "RESEARCH_COMPARE_UNAVAILABLE", message: "x" } } },
      { status: 200, body: attempts([run("run_a")]) },
    ]);
    renderAt(base);
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("unavailable");
    expect(screen.getByText(COMPARE_REFUSAL_COPY[503])).toBeTruthy();
    fireEvent.click(document.querySelector('[data-action="retry"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-ladder-run="run_a"]')).not.toBeNull());
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers["If-None-Match"]).toBeUndefined();
  });

  it("S13-U14 coming back to a comparison resends its ETag and a 304 keeps the copy in hand", async () => {
    const { calls } = server([
      { status: 200, body: attempts([run("run_a")]) },
      { status: 503, body: { error: { code: "RESEARCH_COMPARE_UNAVAILABLE", message: "x" } } },
      { status: 304 },
    ]);
    renderAt(base);
    await settled();
    fireEvent.click(document.querySelector('[data-mode-option="markets"]') as HTMLElement);
    await waitFor(() => expect(page().getAttribute("data-compare-state")).toBe("unavailable"));
    expect(document.querySelector("[data-ladder-run]")).toBeNull();
    fireEvent.click(document.querySelector('[data-mode-option="attempts"]') as HTMLElement);
    await waitFor(() => expect(calls).toHaveLength(3));
    await settled();
    expect(calls[0]!.headers["If-None-Match"]).toBeUndefined();
    expect(calls[2]!.headers["If-None-Match"]).toBe('"cmp-rev-7"');
    expect(document.querySelector('[data-ladder-run="run_a"]')).not.toBeNull();
    expect(page().getAttribute("data-compare-state")).toBe("available");
  });

  it.each([
    [403, "RESEARCH_COMPARE_FORBIDDEN"],
    [404, "RESEARCH_COMPARE_NOT_FOUND"],
  ])("S13-U15 %i is neutral: same sentence, same denied state, no server prose, frame kept", async (status, code) => {
    server([problem(status, code)]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("denied");
    expect(screen.getByText(COMPARE_NEUTRAL_REFUSAL)).toBeTruthy();
    expect(document.body.textContent).not.toContain("alice@example");
    expect(document.querySelector("[data-request-id]")?.textContent).toBe("request req_p20");
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    for (const name of ["guard", "overlay", "delta", "correlation"]) expect(panel(name), name).not.toBeNull();
  });

  it("S13-U16 400 and 401 are their own sentences; neither is retryable", async () => {
    server([problem(400, "RESEARCH_COMPARE_INVALID")]);
    renderAt(`${base}?mode=bogus`);
    await settled();
    expect(screen.getByText(COMPARE_REFUSAL_COPY[400])).toBeTruthy();
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    cleanup();
    vi.restoreAllMocks();
    server([problem(401, "RESEARCH_COMPARE_UNAUTHENTICATED")]);
    renderAt(base);
    await settled();
    expect(screen.getByText(COMPARE_REFUSAL_COPY[401])).toBeTruthy();
    expect(COMPARE_REFUSAL_COPY[403]).toBe(COMPARE_REFUSAL_COPY[404]);
  });
});

describe("S13 Compare — URL and switching", () => {
  it("S13-U17 a mode click pushes the URL, drops runs outside pair, and never shows the old mode's runs", async () => {
    let release: (value: Response) => void = () => {};
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      if (calls.length === 1) return new Response(JSON.stringify(pair()), { status: 200 });
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    expect(document.querySelector("[data-pair-overlay]")).not.toBeNull();
    fireEvent.click(document.querySelector('[data-mode-option="attempts"]') as HTMLElement);
    expect(location()).toBe(`${base}?mode=attempts`);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    expect(document.querySelector("[data-delta-table]")).toBeNull();
    expect(page().getAttribute("data-compare-state")).toBe("loading");
    release(new Response(JSON.stringify(attempts([run("run_x")])), { status: 200 }));
    await waitFor(() => expect(document.querySelector('[data-ladder-run="run_x"]')).not.toBeNull());
    expect(document.querySelector('[data-mode-option="attempts"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(MODE_LABELS.pair).toBe("two runs, one key");
  });

  it("S13-U18 without a mode, two runs mean pair and nothing means attempts", async () => {
    const { calls } = server([{ status: 200, body: pair() }]);
    renderAt(`${base}?runs=run_a,run_b`);
    await settled();
    expect(calls[0]!.url).toContain("mode=pair");
    expect(document.querySelector('[data-mode-option="pair"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("S13-U19 the resolver redirects with alpha= and refuses to guess without it", async () => {
    server([{ status: 200, body: pair() }]);
    renderAt(`/research/quantbt/compare?runs=run_a,run_b&alpha=${ALPHA}`);
    await waitFor(() => expect(location()).toBe(`${base}?mode=pair&runs=run_a,run_b`));
    cleanup();
    vi.restoreAllMocks();
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt("/research/quantbt/compare?runs=run_a,run_b");
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelector("[data-idle-reason]")?.textContent).toBe(RESOLVER_NEEDS_ALPHA);
    expect(document.querySelector('[data-action="runs"]')?.getAttribute("href")).toBe("/research/quantbt/runs");
  });
});

describe("S13 Compare — audit fixes", () => {
  it("S13-U24 a zero Δ carries no sign colour; the Δ header names the server's direction", async () => {
    const data = pairData();
    const net = data.common_window.metrics.find((metric) => metric.key === "NET_RETURN_FRACTION")!;
    net.delta = "0.0000";
    server([{ status: 200, body: pair("AVAILABLE", data) }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const cell = document.querySelector('[data-delta-row="NET_RETURN_FRACTION"] td.d') as HTMLElement;
    expect(cell.textContent).toBe("0.0000");
    expect(cell.getAttribute("data-sign")).toBeNull();
    expect(document.querySelector("[data-delta-direction]")?.textContent).toBe("B − A · as published");
    expect(document.querySelector('[data-delta-row="OOS_SHARPE"] td')?.textContent).not.toContain("stitched");
  });

  it("S13-U25 an unpublished common window or correlation prints its reason, never a count that reads as a value", async () => {
    const data = pairData();
    data.common_window = {
      ...data.common_window,
      state: "NOT_PUBLISHED",
      matched_observation_count: 0,
      left_source_observation_count: null,
      right_source_observation_count: null,
      start_utc_ms: null,
      end_utc_ms: null,
      metrics: data.common_window.metrics.map((metric) => ({ ...metric, left_value: null, right_value: null, delta: null, availability: np("P20_NO_COMMON_RAW_RETURN_WINDOW") })),
      availability: np("P20_NO_COMMON_RAW_RETURN_WINDOW"),
    };
    data.correlation = {
      ...data.correlation,
      state: "NOT_PUBLISHED",
      source_label: "NOT_PUBLISHED",
      value: null,
      n: 0,
      common_window_start_utc_ms: null,
      common_window_end_utc_ms: null,
      availability: np("P20_NO_COMMON_RAW_RETURN_WINDOW"),
    };
    data.overlay = { ...data.overlay, state: "NOT_PUBLISHED", sampling: "NOT_APPLICABLE", emitted_point_count: 0, source_observation_count: null, points: [], availability: np("P20_COMMON_WINDOW_NOT_AVAILABLE") };
    server([{ status: 200, body: pair("PARTIAL", data) }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const foot = document.querySelector('[data-common-window="NOT_PUBLISHED"]') as HTMLElement;
    expect(foot.textContent).toContain("P20_NO_COMMON_RAW_RETURN_WINDOW");
    expect(foot.textContent).not.toContain("matched");
    const meta = document.querySelector("[data-correlation-meta]") as HTMLElement;
    expect(meta.textContent).not.toMatch(/n\s+0/);
    expect(document.querySelector("[data-overlay-meta]")).toBeNull();
    expect(document.querySelector("[data-rho]")).toBeNull();
  });

  it("S13-U26 the resolver passes an unknown mode through so the server can refuse it", async () => {
    server([problem(400, "RESEARCH_COMPARE_INVALID")]);
    renderAt(`/research/quantbt/compare?alpha=${ALPHA}&mode=foo`);
    await waitFor(() => expect(location()).toBe(`${base}?mode=foo`));
  });
});

describe("S13 Compare — paths and sources", () => {
  it("S13-U20 comparePath sends runs only for a valid pair; hrefs encode as the routes expect", () => {
    expect(comparePath(ALPHA, { mode: "attempts", runs: ["a", "b"] })).toBe(`/api/v1/research/alphas/${ALPHA}/compare?mode=attempts`);
    expect(comparePath(ALPHA, { mode: "pair", runs: ["a"] })).toBe(`/api/v1/research/alphas/${ALPHA}/compare?mode=pair`);
    expect(comparePath("a/b", { mode: "pair", runs: ["x", "y"], workspaceId: "ws1" })).toBe(
      "/api/v1/research/alphas/a%2Fb/compare?workspace_id=ws1&mode=pair&runs=x%2Cy",
    );
    expect(compareHref(ALPHA)).toBe(base);
    expect(compareHref(ALPHA, { mode: "pair", runs: ["a", "b"] })).toBe(`${base}?mode=pair&runs=a,b`);
    expect(compareEntryHref(["a", "b"], null)).toBe("/research/quantbt/compare?runs=a,b");
    expect(compareEntryHref(["a", "b"], ALPHA)).toBe(`/research/quantbt/compare?runs=a,b&alpha=${ALPHA}`);
  });

  it("S13-U21 an empty alpha availability is the empty state, with the reason", () => {
    const body = attempts([]);
    const empty = { ...body, availability: np("P20_ALPHA_HAS_NO_COMPAREABLE_PRIMARY_RUN") } as Compare;
    const state = compareState(empty);
    expect(state.state).toBe("empty");
    expect(state.reason).toContain("P20_ALPHA_HAS_NO_COMPAREABLE_PRIMARY_RUN");
  });

  it("S13-U22 no S13 file formats, parses, sorts or scrolls; routes, regex and entry links are wired", () => {
    for (const name of ["compareClient.ts", "useCompare.ts", "CompareDetail.tsx", "CompareRoute.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(source, name).not.toMatch(/toFixed|Intl\.|Intl\b|toLocaleString|parseFloat|Number\(|scrollIntoView|\.sort\(/);
      expect(source, name).not.toMatch(/method:\s*["']POST/);
      expect(source, name).not.toMatch(/error\??\.message/);
    }
    const module = readFileSync(join(process.cwd(), "src", "features", "quantbt", "QuantBTModule.tsx"), "utf8");
    expect(module.indexOf('path="alphas/:alphaId/compare"')).toBeGreaterThan(0);
    expect(module.indexOf('path="alphas/:alphaId/compare"')).toBeLessThan(module.indexOf('path="alphas/:alphaId/:version"'));
    expect(module.indexOf('path="compare"')).toBeLessThan(module.indexOf('path=":tab"'));
    expect(module).toContain("alphas\\/[^/]+\\/(lineage|compare)");
    const library = readFileSync(join(process.cwd(), "src", "research", "RunLibrary.tsx"), "utf8");
    expect(library).toContain("compareEntryHref(selection.map((run) => run.runId), sharedAlpha)");
    const lineage = readFileSync(join(process.cwd(), "src", "research", "LineageDetail.tsx"), "utf8");
    expect(lineage).toContain('<Link to={compareHref(alpha.alpha_id)} data-action="open-compare">');
  });

  it("S13-U23 the button font reset has zero specificity; layout never overflows at 660px by construction", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "CompareDetail.tsx"), "utf8");
    expect(source).toContain(":where(.cp-page) button { font: inherit; }");
    expect(source).not.toMatch(/^\.cp-page button\s*\{/m);
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,8}\b/);
    expect(source).toContain(".cp-scroll { overflow-x: auto;");
    expect(source).toMatch(/@media \(max-width: 900px\)/);
    expect(source).not.toMatch(/min-width: (?!0|min\()\d{3,}px/);
  });
});
