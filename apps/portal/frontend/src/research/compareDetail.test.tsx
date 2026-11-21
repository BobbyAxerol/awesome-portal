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
import { runStatusWord } from "./runTerminalState";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MARKETS_SHORT,
  ATTEMPTS_RULE,
  ATTEMPTS_RULE_BASE,
  CLAIM_SENTENCE,
  LADDER_TITLE,
  scopeWords,
  runManifestProvenance,
  COMPARE_PANELS,
  COMPARE_TITLE,
  MODE_LABELS,
  MODE_TITLES,
  RESOLVER_NEEDS_ALPHA,
  overlayPlot,
} from "./CompareDetail";
import { CompareResolverRoute, CompareRoute } from "./CompareRoute";
import {
  CLAIM_RANK_MAP,
  COMPARE_REFUSAL_COPY,
  COMPARE_REFUSAL_MESSAGE,
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
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
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
    display_label: null,
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
    lane: "P04_FIXED_PROFILE",
    schedule: { mode: "fixed", schedule: "none", availability: AVAILABLE },
    certification: {
      state: "NOT_PUBLISHED",
      grade: null,
      reason_code: "P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE",
      availability: np("P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE"),
    },
    alpha_version_lifecycle: { value: "ACTIVE", availability: AVAILABLE },
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

describe("P24 distinct manifest identity scopes", () => {
  it("discloses retained artifact and preflight pins independently", () => {
    const body = run("rrun_manifest");
    body.provenance.manifest_digest = "1".repeat(64);
    body.provenance.manifest_digest_scope = "PREFLIGHT_DATASET_SPEC";
    body.provenance.source_manifest_digest = "2".repeat(64);
    expect(runManifestProvenance(body)).toBe(`retained artifact manifest ${"2".repeat(64)} · preflight dataset/spec manifest ${"1".repeat(64)}`);
  });
  it("never substitutes a preflight digest when retained source identity is absent", () => {
    const body = run("rrun_manifest");
    body.provenance.manifest_digest = "1".repeat(64);
    body.provenance.source_manifest_digest = null;
    expect(runManifestProvenance(body)).toBe(`retained artifact manifest not published · preflight dataset/spec manifest ${"1".repeat(64)}`);
  });
});

function attempts(runs: CompareRun[]) {
  return envelope({
    mode: "attempts",
    order: "CLAIM_RANK_ASC_OOS_SHARPE_DESC_NET_RETURN_DESC",
    attempts: runs,
    fold_series: runs.map((item) => ({
      run_id: item.run_id,
      state: "NOT_PUBLISHED",
      source_fold_count: null,
      truncated: false,
      folds: [],
      availability: np("P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE"),
    })),
    config_diff: runs.length < 2
      ? { paths: [], availability: { state: "NOT_APPLICABLE", reason_code: "P20_CONFIG_DIFF_NEEDS_TWO_ATTEMPTS" } }
      : { paths: [], availability: AVAILABLE },
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
        emitted_point_count: null,
        points: [],
        availability: np("P20_P13_EQUITY_SERIES_NOT_AVAILABLE"),
      };
}

function markets() {
  return envelope({
    mode: "markets",
    caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie.",
    grouping: "MARKET_KEY_ACTIVE_OR_LATEST_V1",
    cards: [
      { market: { symbol: "BTCUSDT", timeframe: "4h" }, selection: "LATEST_ACTIVE_VERSION_RUN", runs_in_market: 3, run: run("run_btc"), chart: chart("AVAILABLE") },
      {
        market: { symbol: "ETHUSDT", timeframe: "4h" },
        selection: "LATEST_RUN",
        runs_in_market: 1,
        run: run("run_eth", { comparison_contract_key: key("ETHUSDT"), run_state: "QUEUED", claim: NOT_PUBLISHED_CLAIM }),
        chart: chart("NOT_PUBLISHED"),
      },
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
      delta_definition: "RIGHT_MINUS_LEFT",
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
        {
          key: "OOS_SHARPE",
          definition_id: "research.compare.metric.v1.common-window-oos-sharpe",
          left_value: null,
          right_value: null,
          delta: null,
          availability: { state: "NOT_APPLICABLE", reason_code: "P20_COMMON_WINDOW_SHARPE_NEEDS_SOURCE_ANNUALIZATION" },
        },
        {
          key: "WIN_RATE_FRACTION",
          definition_id: "research.compare.metric.v1.common-window-win-rate",
          left_value: null,
          right_value: null,
          delta: null,
          availability: { state: "NOT_APPLICABLE", reason_code: "P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE" },
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
  it("P24 workspace deep link scopes the named Compare read exactly", async () => {
    const { calls } = server([{ status: 200, body: attempts([run("run_a")]) }]);
    renderAt(`${base}?workspace_id=ws%26review`);
    await settled();
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url, "http://localhost").searchParams.get("workspace_id")).toBe("ws&review");
    const outgoing = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/research/quantbt/"]')];
    expect(outgoing.length).toBeGreaterThan(0);
    for (const link of outgoing) expect(new URL(link.href).searchParams.get("workspace_id")).toBe("ws&review");
  });

  it("P24 legacy Compare resolver preserves the explicit workspace on redirect and GET", async () => {
    const { calls } = server([{ status: 200, body: attempts([run("run_a")]) }]);
    renderAt(`/research/quantbt/compare?alpha=${ALPHA}&workspace_id=ws%26review`);
    await settled();
    expect(new URL(`http://localhost${location()}`).searchParams.get("workspace_id")).toBe("ws&review");
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url, "http://localhost").searchParams.get("workspace_id")).toBe("ws&review");
  });

  it("P24 pair picker keeps workspace on its options GET and resulting pair navigation", async () => {
    const { calls } = server([{ status: 200, body: attempts([run("run_a"), run("run_b")]) }, { status: 200, body: pair() }]);
    renderAt(`${base}?mode=pair&workspace_id=ws%26review`);
    await waitFor(() => expect(document.querySelector('[data-pair-picker="ready"]')).not.toBeNull());
    expect(new URL(calls[0]!.url, "http://localhost").searchParams.get("workspace_id")).toBe("ws&review");
    fireEvent.change(document.querySelector('[data-pair-pick="A"]')!, { target: { value: "run_a" } });
    fireEvent.change(document.querySelector('[data-pair-pick="B"]')!, { target: { value: "run_b" } });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(new URL(`http://localhost${location()}`).searchParams.get("workspace_id")).toBe("ws&review");
    expect(new URL(calls[1]!.url, "http://localhost").searchParams.get("workspace_id")).toBe("ws&review");
  });

  it("S13-U01 loading keeps the attempts frame: every block in place, no digit, no ladder card", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderAt(base);
    expect(page().getAttribute("data-compare-state")).toBe("loading");
    for (const name of ["header", "meta", "ladder", "fold-chart", "diff", "trajectory"]) expect(panel(name), name).not.toBeNull();
    /* VD-TEXT-01: no rule callout on the attempts mode, no rules footer, no subtitle. */
    for (const name of ["rule", "rules"]) expect(panel(name), name).toBeNull();
    expect(document.querySelector("[data-subtitle]")).toBeNull();
    expect(document.querySelectorAll("[data-ladder-run]")).toHaveLength(0);
    expect(panel("ladder")?.textContent).not.toMatch(/\d/);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(COMPARE_TITLE);
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
    /* D10 (13-1): run_m publishes no claim, so it folds into a compact row instead of a ladder step. */
    expect(order).toEqual(["run_a", "run_z"]);
    expect(document.querySelector("[data-ladder-order]")?.getAttribute("data-ladder-order")).toBe("server-reversed");
    const arrows = Array.from(document.querySelectorAll("[data-ladder-arrow]"));
    /* F1 / VD-F1-03: both ladder cards carry rank 3 — an equal-claim step prints nothing (every card one claim: no connector at all). */
    expect(arrows).toHaveLength(0);
    expect(document.querySelector("[data-ladder-one-claim]")?.textContent).toBe("2 attempts · one claim: Walk-forward");
    const folded = document.querySelector("[data-unclaimed]") as HTMLElement;
    expect(folded.getAttribute("data-unclaimed")).toBe("1");
    expect(folded.querySelector("[data-unclaimed-run]")).toBeNull();
    fireEvent.click(folded.querySelector('[data-action="toggle-unclaimed"]') as HTMLElement);
    expect(Array.from(folded.querySelectorAll("[data-unclaimed-run]")).map((el) => el.getAttribute("data-unclaimed-run"))).toEqual(["run_m"]);
    expect(panels()).toEqual([...COMPARE_PANELS.attempts]);
  });

  it("D1-O1 cold Compare read prints the server's run label and keeps the full link id", async () => {
    const labelledRun = "rrun_e1fa9e5c0f2b41d3a0c7e3b54a17d5aa";
    server([{ status: 200, body: attempts([run(labelledRun, { display_label: "R-WFO-075" })]) }]);
    renderAt(base);
    await settled();
    const link = page().querySelector(`[data-run-link="${labelledRun}"]`) as HTMLAnchorElement;
    expect(link.textContent).toBe("R-WFO-075");
    expect(link.getAttribute("href")).toContain(labelledRun);
    expect(link.getAttribute("title")).toBe(`${labelledRun} — open in Evidence Flow`);
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
    expect(card.querySelector("[data-oos-sharpe-absent]")?.outerHTML).toContain("P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE");
    expect(card.querySelector("[data-cert-absent]")?.outerHTML).toContain("P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE");
    expect(card.querySelector("[data-claim-origin]")?.getAttribute("data-claim-origin")).toBe("PORTAL_DERIVED_FROM_SOURCE_PROTOCOL");
    expect(panel("fold-chart")?.querySelector("[data-fold-chart-absent]")?.outerHTML).toContain("P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE");
    expect(document.querySelector("[data-ladder-header]")?.textContent).toBe(LADDER_TITLE);
    expect(document.querySelector("[data-panel='trajectory']")?.getAttribute("title")).toContain(TRAJECTORY.text);
    /* One claimed attempt: no step, so the heading's title carries the base rule only, no "strengthens at every step" sentence (F1). The rule is a tooltip, not a callout (VD-F1-03). */
    expect(panel("ladder")?.querySelector(".cp-ladderhead")?.getAttribute("title")).toBe(ATTEMPTS_RULE_BASE);
    expect(panel("rule")).toBeNull();
    expect(panel("rules")).toBeNull();
    expect(page().textContent).not.toContain(ATTEMPTS_RULE_BASE);
    expect(panel("diff")?.outerHTML).toContain("P20_CONFIG_DIFF_NEEDS_TWO_ATTEMPTS");
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
    expect(partial.outerHTML).toContain("P20_BOUNDED_ATTEMPT_LIMIT_REACHED");
  });
});

describe("S13 Compare — markets", () => {
  it("S13-U06 small multiples: server caption, no overlay, one chart drawn and one absent, QUEUED shown", async () => {
    const { calls } = server([{ status: 200, body: markets() }]);
    renderAt(`${base}?mode=markets`);
    await settled();
    expect(calls[0]!.url).toContain("mode=markets");
    expect(calls[0]!.url).not.toContain("runs=");
    /* QA S13: the screen says it in one short sentence; the server's caption rides along as an attribute and the rule's title. */
    expect(document.querySelector("[data-caption]")?.textContent).toBe(MARKETS_SHORT);
    expect(document.querySelector("[data-caption]")?.getAttribute("data-server-caption")).toBe(MARKETS_CAPTION);
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    expect(document.querySelector("[data-delta-table]")).toBeNull();
    expect(document.querySelector('[data-mini-chart="AVAILABLE"] svg path.cp-mini-line')).not.toBeNull();
    const eth = document.querySelector('[data-market-run="run_eth"]') as HTMLElement;
    expect(eth.querySelector('[data-mini-chart="NOT_PUBLISHED"]')?.outerHTML).toContain("P20_P13_EQUITY_SERIES_NOT_AVAILABLE");
    expect(eth.querySelector('[data-state="QUEUED"]')).not.toBeNull();
    /* D10: a card is a market; it says which run stands for it and how many ran there. */
    const btc = document.querySelector('[data-market-run="run_btc"]') as HTMLElement;
    expect(btc.querySelector("[data-market-key]")?.textContent).toBe("BTCUSDT · 4h");
    expect(btc.querySelector("[data-market-selection-words]")?.textContent).toBe("1 of 3");
    expect(btc.querySelector("[data-market-selection-words]")?.getAttribute("title")).toContain("1 of 3 runs on this market");
    expect(eth.querySelector("[data-market-selection-words]")?.textContent).toBe("only run");
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
    expect(net.textContent).toBe("−3.16 pp");
    expect(net.querySelector("[data-delta-value]")?.getAttribute("data-delta-value")).toBe("-0.0316");
    expect(net.getAttribute("data-sign")).toBe("neg");
    expect(document.querySelector('[data-delta-row="MAX_DRAWDOWN_FRACTION"] td[data-sign]')?.getAttribute("data-sign")).toBe("pos");
    /* DQ-08 + hi-fi "ρ = 0.18": two places on screen, the exact server string kept one hover away. */
    expect(document.querySelector("[data-rho]")?.textContent).toBe("ρ = 0.41");
    expect(document.querySelector("[data-rho]")?.getAttribute("data-exact")).toBe("0.412345");
    expect(document.querySelector("[data-rho-caption]")?.textContent).toBe("raw returns · overlapping window only");
    expect(document.querySelector("[data-correlation-source]")?.outerHTML).toContain("PORTAL_DERIVED");
    expect(document.querySelector("[data-correlation-meta]")?.getAttribute("title")).toContain("INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL");
    expect(document.querySelector("[data-promotes-under]")?.textContent).toBe(
      "Walk-forward",
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
    expect(delta.outerHTML).toContain("P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT");
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
    /* QA S13: one short sentence built from the two keys; the server's message stays in the attribute and the box's title. */
    expect(document.querySelector("[data-refusal-message]")?.getAttribute("data-server-message")).toBe(COMPARE_REFUSAL_MESSAGE);
    expect(document.querySelector("[data-refusal-message]")?.textContent).toMatch(/^Can't overlay: symbol differs \(.* vs .*\), timeframe differs/);
    expect(document.querySelector("[data-refusal-message]")?.textContent).not.toMatch(/lie|button/);
    for (const selector of ["[data-pair-overlay]", "[data-delta-table]", "[data-correlation]", "[data-weaker-claim]", "svg", "[data-rho]", "[data-difference]"]) {
      expect(document.querySelectorAll(selector), selector).toHaveLength(0);
    }
    const mismatched = Array.from(document.querySelectorAll('[data-key-side="left"] [data-mismatch="true"]')).map((el) => el.getAttribute("data-part"));
    expect(mismatched).toEqual(["symbol", "timeframe"]);
    expect(panels()).toEqual([...COMPARE_PANELS.refused]);
  });

  it("S13-U11 a pair without exactly two runs sends no pair read and offers a picker, frame intact", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt(`${base}?mode=pair&runs=run_a`);
    /* T-D8: the only read is the Alpha's attempts (the picker's options); never a pair. */
    expect(spy.mock.calls.filter(([url]) => String(url).includes("mode=pair"))).toHaveLength(0);
    await waitFor(() => expect(document.querySelector("[data-pair-picker]")).not.toBeNull());
    /* QA S13-9: nothing was requested, so one guard card says so; the four placeholder frames are gone. */
    expect(panel("guard")).not.toBeNull();
    for (const name of ["overlay", "delta", "correlation"]) expect(panel(name), name).toBeNull();
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
    expect(screen.getByTitle(new RegExp(COMPARE_REFUSAL_COPY[503].slice(0, 30)))).toBeTruthy();
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
    expect(screen.getByText("Not available to you.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("alice@example");
    expect(document.querySelector("[data-refusal-request]")?.getAttribute("data-refusal-request")).toBe("req_p20");
    expect(document.querySelector("[data-pair-overlay]")).toBeNull();
    /* QA S13-9: after a refusal the notice is the whole answer; no placeholder frame repeats "withheld". */
    for (const name of ["guard", "overlay", "delta", "correlation"]) expect(panel(name), name).toBeNull();
    expect(document.querySelector("[data-pending]")).toBeNull();
    expect(document.querySelector('[data-panel="meta"]')).toBeNull();
  });

  it("S13-U16 400 and 401 are their own sentences; neither is retryable", async () => {
    server([problem(400, "RESEARCH_COMPARE_INVALID")]);
    renderAt(`${base}?mode=bogus`);
    await settled();
    expect(screen.getByTitle(new RegExp(COMPARE_REFUSAL_COPY[400].slice(0, 30)))).toBeTruthy();
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    cleanup();
    vi.restoreAllMocks();
    server([problem(401, "RESEARCH_COMPARE_UNAUTHENTICATED")]);
    renderAt(base);
    await settled();
    expect(screen.getByTitle(new RegExp(COMPARE_REFUSAL_COPY[401].slice(0, 30)))).toBeTruthy();
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
    expect(document.querySelector('[data-mode-option="attempts"]')?.getAttribute("aria-selected")).toBe("true");
    expect(MODE_LABELS.pair).toBe("Pair");
    expect(MODE_TITLES.pair).toBe("Two runs, one key");
  });

  it("S13-U18 without a mode, two runs mean pair and nothing means attempts", async () => {
    const { calls } = server([{ status: 200, body: pair() }]);
    renderAt(`${base}?runs=run_a,run_b`);
    await settled();
    expect(calls[0]!.url).toContain("mode=pair");
    expect(document.querySelector('[data-mode-option="pair"]')?.getAttribute("aria-selected")).toBe("true");
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

describe("S13 Compare — the resolver says why it read nothing, in every mode", () => {
  /* FG-01 row 13-15. */
  for (const mode of ["attempts", "markets"] as const) {
    it(`without an Alpha the ${mode} view names the missing Alpha once and reads nothing`, () => {
      const spy = vi.spyOn(globalThis, "fetch");
      renderAt(`/research/quantbt/compare?mode=${mode}`);
      expect(spy).not.toHaveBeenCalled();
      const reasons = document.querySelectorAll("[data-idle-reason]");
      expect(reasons.length).toBe(1);
      expect(reasons[0]?.textContent).toBe(RESOLVER_NEEDS_ALPHA);
      expect(document.querySelector('[data-action="runs"]')?.getAttribute("href")).toBe("/research/quantbt/runs");
    });
  }

  it("without an Alpha the pair view still names the missing Alpha exactly once", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderAt("/research/quantbt/compare?runs=run_a,run_b");
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelectorAll("[data-idle-reason]").length).toBe(1);
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
    expect(cell.querySelector("[data-delta-value]")?.getAttribute("data-delta-value")).toBe("0.0000");
    expect(cell.getAttribute("data-sign")).toBeNull();
    /* CG-P20-09: the direction is the contract's field, not a reading of the service code. */
    expect(document.querySelector("[data-delta-direction]")?.getAttribute("data-delta-direction")).toBe("RIGHT_MINUS_LEFT");
    expect(document.querySelector("[data-delta-direction]")?.textContent).toBe("B − A");
    expect(document.querySelector('[data-delta-row="OOS_SHARPE"] td')?.textContent).not.toContain("stitched");
  });

  it("S13-U25 an unpublished common window or correlation prints its reason, never a count that reads as a value", async () => {
    const data = pairData();
    data.common_window = {
      ...data.common_window,
      state: "NOT_PUBLISHED",
      matched_observation_count: null,
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
      n: null,
      common_window_start_utc_ms: null,
      common_window_end_utc_ms: null,
      availability: np("P20_NO_COMMON_RAW_RETURN_WINDOW"),
    };
    data.overlay = { ...data.overlay, state: "NOT_PUBLISHED", sampling: "NOT_APPLICABLE", emitted_point_count: null, source_observation_count: null, points: [], availability: np("P20_COMMON_WINDOW_NOT_AVAILABLE") };
    server([{ status: 200, body: pair("PARTIAL", data) }]);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const foot = document.querySelector('[data-common-window="NOT_PUBLISHED"]') as HTMLElement;
    expect(foot.outerHTML).toContain("P20_NO_COMMON_RAW_RETURN_WINDOW");
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

/*
 * W6a · CG-P20-01…11 on the canonical fixtures the control-api publishes from
 * the real retained WFO seal (CG-P20-01), not on a body built here.
 */
const COMPARE_FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const compareFixture = (name: string) => JSON.parse(readFileSync(join(COMPARE_FIXTURES, name), "utf8")) as Compare;

describe("S13 Compare — W6a fields on the canonical fixtures", () => {
  const WFO_ALPHA = "delta-rsi-polynomial-alpha";
  const wfoBase = `/research/quantbt/alphas/${WFO_ALPHA}/compare`;

  it("S13-U27 CG-P20-02/03/08 schedule, typed cert and lifecycle ride each ladder card; ACTIVE is drawn heavier", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(wfoBase);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    for (const run of body.result.attempts) {
      const card = document.querySelector(`[data-ladder-run="${run.run_id}"]`) as HTMLElement;
      expect(card.getAttribute("data-lifecycle")).toBe(run.alpha_version_lifecycle.value);
      /* Hi-fi: "{run} · {mode} × {schedule}" — no "sched" word. */
      /* W1: the ladder line is one tooltip (state · version · mode × schedule); only a typed absence stays visible. */
      expect(card.querySelector("[data-run-line]")?.getAttribute("title")).toContain(`${run.schedule.mode} × ${run.schedule.schedule}`);
      /* The pill is the lifecycle (hi-fi); the run state reads in the run line. */
      expect(card.querySelector("[data-run-line]")?.getAttribute("title")).toContain(runStatusWord(run.run_state));
      expect(card.querySelectorAll(".cp-st")).toHaveLength(0);
      /* QA S13: one absence shared by every card is said once above the ladder. */
      expect((card.querySelector("[data-cert-absent]") ?? document.querySelector("[data-ladder-cert]"))?.outerHTML).toContain(run.certification.reason_code);
      expect(card.querySelector(`[data-life="${run.alpha_version_lifecycle.value}"]`)).not.toBeNull();
    }
  });

  it("S13-U28 CG-P20-04 the fold chart draws one bar per published fold per attempt, exact value kept", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(wfoBase);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    const published = body.result.fold_series.filter((item) => item.state === "AVAILABLE");
    const bars = document.querySelectorAll("[data-fold-bar]");
    expect(bars).toHaveLength(published.reduce((sum, item) => sum + item.folds.filter((fold) => fold.oos_sharpe !== null).length, 0));
    const first = published[0]!;
    const bar = document.querySelector(`[data-fold-bar="${first.run_id}:${first.folds[0]!.fold_id}"]`)!;
    expect(bar.getAttribute("data-exact")).toBe(first.folds[0]!.oos_sharpe);
    expect(document.querySelector("[data-fold-absent-runs]")?.outerHTML).toContain("P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE");
  });

  it("S13-U29 CG-P20-05 the config diff lists every changed key with each attempt's value", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(wfoBase);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    const rows = Array.from(document.querySelectorAll("[data-config-diff-path]")).map((row) => row.getAttribute("data-config-diff-path"));
    expect(rows).toEqual(body.result.config_diff.paths.map((path) => path.path));
    const seed = body.result.config_diff.paths.find((path) => path.path === "random_seed")!;
    for (const value of seed.values) {
      expect(document.querySelector(`[data-config-diff-path="random_seed"] [data-config-value="${value.run_id}"]`)?.textContent).toBe(value.value);
    }
  });

  it("S13-U30 CG-P20-11 the ladder names the server's order key and still lays the server array out reversed", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(wfoBase);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    expect(document.querySelector("[data-ladder-order-key]")?.getAttribute("data-ladder-order-key")).toBe(body.result.order);
    const shown = Array.from(document.querySelectorAll("[data-ladder-run]")).map((card) => card.getAttribute("data-ladder-run"));
    expect(shown).toEqual([...body.result.attempts].reverse().map((run) => run.run_id));
  });

  it("S13-U31 CG-P20-06/09 the delta table reads the contract's direction and types Sharpe and win rate as not applicable", async () => {
    const body = compareFixture("research-compare.pair-ok.valid.json");
    server([{ status: 200, body }]);
    renderAt(`${wfoBase}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    expect(document.querySelector("[data-delta-direction]")?.getAttribute("data-delta-direction")).toBe("RIGHT_MINUS_LEFT");
    /* The Sharpe reason is the fixture's own (it moved with 8bd781ed): read, never hard-coded. */
    const sharpe = body.result.mode === "pair" ? body.result.pair?.common_window.metrics.find((metric) => metric.key === "OOS_SHARPE") : undefined;
    expect(sharpe?.availability.reason_code).toBeTruthy();
    expect(document.querySelector('[data-delta-row="OOS_SHARPE"] td.d')?.outerHTML).toContain(sharpe!.availability.reason_code!);
    expect(document.querySelector('[data-delta-row="WIN_RATE"]')?.outerHTML).toContain("P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE");
    if (body.result.mode !== "pair" || body.result.pair === null) throw new Error("fixture guard");
    const net = body.result.pair.common_window.metrics.find((metric) => metric.key === "NET_RETURN_FRACTION")!;
    expect(document.querySelector('[data-delta-row="NET_RETURN_FRACTION"] [data-delta-value]')?.getAttribute("data-delta-value")).toBe(net.delta);
  });

  it("S13-U32 CG-P20-10 a zero-variance pair prints the measured n nowhere beside its absence; markets cards keep null counts silent", async () => {
    const body = compareFixture("research-compare.pair-nocorr.valid.json");
    server([{ status: 200, body }]);
    renderAt(`${wfoBase}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    expect(document.querySelector("[data-rho]")).toBeNull();
    expect(document.querySelector("[data-correlation-meta]")?.textContent).not.toMatch(/\bn\b/);
    cleanup();
    const markets = compareFixture("research-compare.markets.valid.json");
    server([{ status: 200, body: markets }]);
    renderAt(`${wfoBase}?mode=markets`);
    await settled();
    if (markets.result.mode !== "markets") throw new Error("fixture guard");
    for (const card of markets.result.cards) {
      const tile = document.querySelector(`[data-market-run="${card.run.run_id}"]`) as HTMLElement;
      if (card.chart.state === "AVAILABLE") {
        expect(tile.querySelector("[data-mini-meta]")?.textContent).toContain(`emitted ${card.chart.emitted_point_count} of ${card.chart.source_observation_count}`);
      } else {
        expect(tile.querySelector("[data-mini-meta]")).toBeNull();
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * X3 2026-09-26 — VD-P20 decisions and S13 debt (evidence
 * P20/X3_S13_P23_CLAUDE_2026-09-26.md).
 * ---------------------------------------------------------------------- */

describe("S13 Compare — X3 decisions and debt", () => {
  it("S13-U33 S13-BACK-REFETCH: returning to any key already read resends that key's own ETag and shows its copy while it revalidates", async () => {
    const mk = { ...markets(), revision: "rev_mk", etag: '"cmp-mk-1"' };
    let release: (value: Response) => void = () => {};
    const calls: Call[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: String(input), method: "GET", headers: (init?.headers ?? {}) as Record<string, string> });
      if (calls.length === 1) return new Response(JSON.stringify(attempts([run("run_a")])), { status: 200 });
      if (calls.length === 2) return new Response(JSON.stringify(mk), { status: 200 });
      if (calls.length === 3) return new Promise<Response>((resolve) => (release = resolve));
      return new Response(null, { status: 304 });
    });
    renderAt(base);
    await settled();
    fireEvent.click(document.querySelector('[data-mode-option="markets"]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-market-run="run_btc"]')).not.toBeNull());
    await settled();
    fireEvent.click(document.querySelector('[data-mode-option="attempts"]') as HTMLElement);
    await waitFor(() => expect(calls).toHaveLength(3));
    /* The single-slot validator sent nothing here (debt C4): the last key read was markets. */
    expect(calls[2]!.headers["If-None-Match"]).toBe('"cmp-rev-7"');
    /* Retained copy of the same key, labelled stale — never another key's runs. */
    expect(document.querySelector('[data-ladder-run="run_a"]')).not.toBeNull();
    expect(document.querySelector('[data-market-run="run_btc"]')).toBeNull();
    expect(page().getAttribute("data-compare-state")).toBe("stale");
    release(new Response(null, { status: 304 }));
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("available");
    fireEvent.click(document.querySelector('[data-mode-option="markets"]') as HTMLElement);
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[3]!.headers["If-None-Match"]).toBe('"cmp-mk-1"');
    await settled();
    expect(document.querySelector('[data-market-run="run_btc"]')).not.toBeNull();
  });

  it("S13-U34 S13-MINI-LABELS-UNIT: a small multiple prints at most two day labels and formatted axis values with the exact string kept", async () => {
    server([{ status: 200, body: markets() }]);
    renderAt(`${base}?mode=markets`);
    await settled();
    const mini = document.querySelector('[data-mini-chart="AVAILABLE"]') as HTMLElement;
    const days = Array.from(mini.querySelectorAll("[data-x-label]"));
    expect(days.length).toBeGreaterThan(0);
    expect(days.length).toBeLessThanOrEqual(2);
    const ys = Array.from(mini.querySelectorAll("[data-y-label]")).map((el) => [el.textContent, el.getAttribute("data-exact")]);
    expect(ys).toContainEqual(["1,041", "1040.5"]);
    expect(ys).toContainEqual(["1,000", "1000"]);
  });

  it("S13-U35 past eight folds the per-fold figure draws one line per attempt, the ACTIVE one heavier; legend reads attempt · claim", async () => {
    const folds = (base0: number) =>
      Array.from({ length: 10 }, (_, index) => ({
        fold_id: String(index),
        source_ordinal: index,
        oos_sharpe: String(base0 + (index % 3) * 0.1),
        availability: AVAILABLE,
      }));
    const runs = [
      run("run_active", { attempt_id: "att_03" }),
      run("run_old", { attempt_id: "att_01", alpha_version_lifecycle: { value: "SUPERSEDED", availability: AVAILABLE } }),
    ];
    const body = attempts(runs);
    if (body.result.mode !== "attempts") throw new Error("guard");
    body.result.fold_series = runs.map((item, index) => ({
      run_id: item.run_id,
      state: "AVAILABLE",
      source_fold_count: 10,
      truncated: false,
      folds: folds(1 + index),
      availability: AVAILABLE,
    })) as typeof body.result.fold_series;
    server([{ status: 200, body }]);
    renderAt(base);
    await settled();
    const figure = panel("fold-chart") as HTMLElement;
    expect(figure.getAttribute("data-fold-mode")).toBe("lines");
    expect(figure.querySelectorAll("rect.cp-foldbar")).toHaveLength(0);
    expect(figure.querySelector('[data-fold-line="run_active"]')?.getAttribute("data-active")).toBe("true");
    expect(figure.querySelector('[data-fold-line="run_old"]')?.getAttribute("data-active")).toBe("false");
    /* Legend in ladder order (weak → strong): the server's array reversed. */
    expect(Array.from(figure.querySelectorAll("[data-fold-legend-run]")).map((el) => el.textContent)).toEqual(["run_old · WALK-FORWARD", "run_active · WALK-FORWARD"]);
  });

  it("S13-U36 the config diff reads in ladder order, marks the ACTIVE column and tints only cells that differ from it", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(`/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare`);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    const heads = Array.from(document.querySelectorAll(".cp-difftable thead th")).map((el) => el.textContent);
    expect(heads).toEqual(["key", ...[...body.result.attempts].reverse().map((item) => item.display_label ?? item.run_id)]);
    const active = body.result.attempts.find((item) => item.alpha_version_lifecycle.value === "ACTIVE")!;
    expect(document.querySelector("[data-config-diff-legend]")?.textContent).toBe(`vs ${active.display_label ?? active.run_id}`);
    for (const path of body.result.config_diff.paths) {
      const reference = path.values.find((entry) => entry.run_id === active.run_id)?.value ?? null;
      for (const entry of path.values) {
        const cell = document.querySelector(`[data-config-diff-path="${path.path}"] [data-config-value="${entry.run_id}"]`) as HTMLElement;
        expect(cell.getAttribute("data-differs"), `${path.path} ${entry.run_id}`).toBe(entry.run_id !== active.run_id && entry.value !== reference ? "true" : null);
      }
    }
  });

  it("S13-U37 VD decisions: rule without demo digits, no lifecycle pill on a one-lifecycle ladder, family-only claim chip, one-line title block, headings in the body face", async () => {
    server([{ status: 200, body: attempts([run("run_a")]) }]);
    renderAt(base);
    await settled();
    expect(ATTEMPTS_RULE).not.toMatch(/\d/);
    const card = document.querySelector('[data-ladder-run="run_a"]') as HTMLElement;
    const chip = card.querySelector(".cp-claimchip") as HTMLElement;
    expect(chip.getAttribute("title")).toContain("rank 3");
    expect(chip.getAttribute("title")).toContain("origin PORTAL_DERIVED_FROM_SOURCE_PROTOCOL");
    /* Bobby 2026-10-01: a ladder whose attempts all share one lifecycle does not repeat it on every card. */
    expect(card.querySelectorAll("[data-life]")).toHaveLength(0);
    expect(card.hasAttribute("data-lifecycle")).toBe(false);
    expect(card.querySelector("[data-run-line]")?.getAttribute("title")).toContain("completed");
    const css = document.querySelector('[data-screen="compare"] style')?.textContent ?? "";
    expect(css).toMatch(/\.cp-head > \.l \{[^}]*flex: 0 1 auto/);
    expect(css).toMatch(/\.cp-card > \.t, \.cp-tcard > \.t \{[^}]*font-family: var\(--font-body\)/);
  });
});

describe("S13 — the version lifecycle shows on a card only when the ladder mixes lifecycles", () => {
  it("a mixed ladder pills each card with its own lifecycle; a uniform one pills none", async () => {
    server([{ status: 200, body: attempts([run("run_a"), run("run_b", { attempt_id: "att_b", alpha_version_lifecycle: { value: "SUPERSEDED", availability: AVAILABLE } })]) }]);
    renderAt(base);
    await settled();
    expect(document.querySelector('[data-ladder-run="run_a"] [data-life="ACTIVE"]')).not.toBeNull();
    expect(document.querySelector('[data-ladder-run="run_b"] [data-life="SUPERSEDED"]')).not.toBeNull();
    cleanup();
    server([{ status: 200, body: attempts([run("run_a"), run("run_c", { attempt_id: "att_c" })]) }]);
    renderAt(base);
    await settled();
    expect(document.querySelectorAll("[data-ladder-run] [data-life]")).toHaveLength(0);
  });
});

describe("E7 / D10 — Screen 13 on the HiFi (Unified 13.4.1)", () => {
  const WFO_ALPHA = "delta-rsi-polynomial-alpha";
  const wfoBase = `/research/quantbt/alphas/${WFO_ALPHA}/compare`;

  it("13-3 the claim line is the family and one sentence of the screen's; the key=value text stays in the title", async () => {
    const body = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body }]);
    renderAt(wfoBase);
    await settled();
    const card = document.querySelector('[data-ladder-run="run-w6a-wfo-a"]') as HTMLElement;
    /* VD-TEXT-01: the sentence is the claim chip's title (once, not printed on every card); the key=value text rides there too. */
    /* QA S13: every card shares one claim, so the chip is not repeated per card; the ladder header says it once and carries the sentence. */
    const chip = (card.querySelector(".cp-claimchip") ?? page().querySelector("[data-ladder-one-claim]")) as HTMLElement;
    expect(card.querySelector("[data-claim-text]")).toBeNull();
    expect(card.textContent).not.toContain(CLAIM_SENTENCE.WALK_FORWARD_OOS_COMPATIBILITY);
    expect(chip.getAttribute("title")).toContain(CLAIM_SENTENCE.WALK_FORWARD_OOS_COMPATIBILITY);
    expect((card.querySelector(".cp-claimchip") ?? card.querySelector(".cp-att"))!.getAttribute("title")).toContain("validation_claim=walk_forward_oos");
    expect(page().textContent).not.toContain("validation_claim=");
    expect((card.querySelector("[data-claim]") ?? chip).getAttribute("data-claim")).toBe("WALK_FORWARD_OOS_COMPATIBILITY");
  });

  it("13-10 metric scopes read as words, never RS02_… codes", async () => {
    expect(scopeWords("RS02_OOS_MEAN_OF_FOLDS")).toBe("mean of folds");
    expect(scopeWords("RS02_OOS_SUM_OF_FOLDS")).toBe("sum of folds");
    expect(scopeWords("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    const body = compareFixture("research-compare.pair-ok.valid.json");
    server([{ status: 200, body }]);
    renderAt(`${wfoBase}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    const table = document.querySelector("[data-delta-table]") as HTMLElement;
    expect(table.textContent).not.toMatch(/RS02_/);
    expect(table.querySelector('[data-delta-row="OOS_SHARPE"] [data-scope]')?.textContent).toBe("mean of folds");
    expect(table.querySelector('[data-delta-row="TRADE_COUNT"] [data-scope]')?.textContent).toBe("sum of folds");
    /* 13-9: heads are A/B + the run, not the raw id twice. */
    expect(table.querySelector('th[data-side="left"]')?.textContent).toBe("A · run-w6a-wfo-a");
  });

  it("13-2 / 13-4 E1 short ids on cards and legend; folds read 1-based; each series its own tone", async () => {
    const LONG = "rrun_8c9c9991bdd0cfe72100da64ebee1150";
    const LONG_ATT = "ratt_8c9c9991bdd0cfe72100da64ebee1150";
    server([{ status: 200, body: attempts([run(LONG, { attempt_id: LONG_ATT }), run("run_a")]) }]);
    renderAt(base);
    await settled();
    const card = document.querySelector(`[data-ladder-run="${LONG}"]`) as HTMLElement;
    /* QA S13 (UX-4): the card is titled by the run (label, else the short RUN id), never by the attempt id; the attempt id is the tooltip. */
    expect(card.querySelector(".cp-att")?.textContent).toBe("rrun_8c9c9991");
    expect(card.querySelector(".cp-att")?.textContent).not.toMatch(/ratt_/);
    expect(card.querySelector(".cp-att")?.getAttribute("title")).toContain(LONG_ATT);
    expect(card.querySelector(`[data-run-link="${LONG}"]`)?.textContent).toBe("rrun_8c9c9991");
    expect(page().textContent).not.toContain("8c9c9991bdd0cfe72100da64ebee1150");
    cleanup();
    const fixture = compareFixture("research-compare.attempts.valid.json");
    server([{ status: 200, body: fixture }]);
    renderAt(`/research/quantbt/alphas/${WFO_ALPHA}/compare`);
    await settled();
    const groups = Array.from(document.querySelectorAll("[data-fold-group]")).map((el) => el.textContent);
    expect(groups[0]).toBe("F1");
    expect(document.querySelector("[data-fold-group]")?.getAttribute("data-fold-group")).toBe("0");
    const swatches = Array.from(document.querySelectorAll("[data-fold-legend] .sw")).map((el) => (el as HTMLElement).style.background);
    expect(new Set(swatches).size).toBe(swatches.length);
    /* 13-5: the attempts without per-fold rows are a count and a closed disclosure. */
    const absent = document.querySelector("[data-fold-absent-runs]") as HTMLDetailsElement;
    expect(absent.tagName).toBe("DETAILS");
    expect(absent.open).toBe(false);
    expect(absent.querySelector("summary")?.textContent).toBe("1 without fold rows");
  });
});

describe("E7 / D10 — a server before the market grouping", () => {
  it("lists its per-run cards as they came and says the grouping is not published, grouping nothing itself", async () => {
    const body = markets();
    const result = body.result as unknown as Record<string, unknown> & { cards: Array<Record<string, unknown>> };
    delete result.grouping;
    for (const card of result.cards) {
      delete card.market;
      delete card.selection;
      delete card.runs_in_market;
    }
    server([{ status: 200, body }]);
    renderAt(`${base}?mode=markets`);
    await settled();
    expect(document.querySelector("[data-markets-ungrouped]")).not.toBeNull();
    expect(document.querySelectorAll("[data-market-run]")).toHaveLength(2);
    expect(document.querySelector('[data-market-run="run_btc"] [data-market-key]')?.textContent).toBe("BTCUSDT · 4h");
    expect(document.querySelector("[data-market-selection-words]")).toBeNull();
  });
});

/*
 * FG-04a (board F12, Unified :3816): on the hi-fi (`QuantBT 13 Compare.dc.html`
 * :76–93, :329) "claim ↑ →" stands only between two cards. The arrow leads its
 * own card inside one wrapping step, so a wrapped row can never end on an arrow
 * that points at nothing. The layout itself is CSS (checked in the browser);
 * these tests hold the structure it relies on and the server's order.
 */
describe("S13 Compare — ladder arrows between cards, never after one", () => {
  const CLAIMS: ReadonlyArray<Pick<CompareRun["claim"], "family" | "rank">> = [
    { family: "WALK_FORWARD_OOS_COMPATIBILITY", rank: 3 },
    { family: "STRICT_OUTER_OOS", rank: 1 },
    { family: "NONE_FULL_SAMPLE_CALIBRATION", rank: 4 },
    { family: "SELECTION_ADJUSTED_OOS", rank: 2 },
  ];

  /** `count` claimed attempts in the server's order, claim families deliberately unsorted. */
  function claimedRuns(count: number, claims: ReadonlyArray<Pick<CompareRun["claim"], "family" | "rank">> = CLAIMS): CompareRun[] {
    return Array.from({ length: count }, (_, index) => {
      const claim = claims[index % claims.length]!;
      return run(`run_${String(index + 1).padStart(2, "0")}`, {
        claim: { ...run("x").claim, family: claim.family, rank: claim.rank },
      });
    });
  }

  async function renderLadder(runs: CompareRun[]) {
    server([{ status: 200, body: attempts(runs) }]);
    renderAt(base);
    await settled();
    const ladder = document.querySelector("[data-ladder-order]") as HTMLElement;
    expect(ladder).not.toBeNull();
    return { ladder, steps: Array.from(ladder.children) as HTMLElement[], arrows: Array.from(ladder.querySelectorAll<HTMLElement>("[data-ladder-arrow]")) };
  }

  /** Every arrow opens a step that is not the first, and no card is ever followed by an arrow. */
  function expectArrowsLeadTheirCards(ladder: HTMLElement, steps: HTMLElement[], arrows: HTMLElement[]) {
    for (const step of steps) {
      expect(step.hasAttribute("data-ladder-step")).toBe(true);
      expect(step.lastElementChild?.hasAttribute("data-ladder-run")).toBe(true);
    }
    for (const arrow of arrows) {
      const step = arrow.parentElement as HTMLElement;
      expect(step.parentElement).toBe(ladder);
      expect(step.firstElementChild).toBe(arrow);
      expect(steps.indexOf(step)).toBeGreaterThan(0);
    }
    expect(steps[0]?.querySelector("[data-ladder-arrow]")).toBeNull();
    expect(ladder.lastElementChild?.hasAttribute("data-ladder-arrow")).toBe(false);
    expect(ladder.lastElementChild?.lastElementChild?.hasAttribute("data-ladder-arrow")).toBe(false);
  }

  it("a single claimed attempt stands alone on the ladder, with no claim arrow", async () => {
    const { ladder, steps, arrows } = await renderLadder(claimedRuns(1));
    expect(steps).toHaveLength(1);
    expect(arrows).toHaveLength(0);
    expectArrowsLeadTheirCards(ladder, steps, arrows);
  });

  it("two claimed attempts are joined by one claim arrow that leads the second card, outside either card's text", async () => {
    /* The server orders strongest first (CLAIM_RANK_ASC…); the ladder lays it out reversed, so run_02 (rank 3) then run_01 (rank 1) is a real strengthening step. */
    const { ladder, steps, arrows } = await renderLadder(claimedRuns(2, [CLAIMS[1]!, CLAIMS[0]!]));
    expect(steps).toHaveLength(2);
    expect(arrows).toHaveLength(1);
    expectArrowsLeadTheirCards(ladder, steps, arrows);
    const arrow = arrows[0]!;
    expect(arrow.textContent?.trim()).toBe("claim ↑ →");
    /* Accessibility unchanged: the same label as before, not hidden, and never part of a card's content. */
    expect(arrow.getAttribute("aria-label")).toBe("claim strengthens along the ladder");
    expect(arrow.hasAttribute("aria-hidden")).toBe(false);
    expect(arrow.closest("[data-ladder-run]")).toBeNull();
    for (const card of Array.from(ladder.querySelectorAll("[data-ladder-run]"))) expect(card.textContent).not.toContain("claim ↑ →");
    /* Reading order is still card, arrow, card. */
    const sequence = Array.from(ladder.querySelectorAll("[data-ladder-run], [data-ladder-arrow]")).map((el) =>
      el.hasAttribute("data-ladder-arrow") ? "arrow" : el.getAttribute("data-ladder-run"),
    );
    expect(sequence).toEqual(["run_02", "arrow", "run_01"]);
  });

  it("four claimed attempts read as the hi-fi row: three arrows between the cards and none after the last", async () => {
    const { ladder, steps, arrows } = await renderLadder(claimedRuns(4));
    expect(steps).toHaveLength(4);
    expect(arrows).toHaveLength(3);
    expectArrowsLeadTheirCards(ladder, steps, arrows);
    expect(steps.map((step) => step.querySelector("[data-ladder-arrow]") !== null)).toEqual([false, true, true, true]);
    expect(steps.at(-1)?.lastElementChild?.getAttribute("data-ladder-run")).toBe("run_01");
  });

  it("twelve claimed attempts get eleven arrows and no arrow is the ladder's last child, whichever row the cards wrap into", async () => {
    const { ladder, steps, arrows } = await renderLadder(claimedRuns(12));
    expect(steps).toHaveLength(12);
    expect(arrows).toHaveLength(11);
    expectArrowsLeadTheirCards(ladder, steps, arrows);
    /* No arrow is a flex item of its own, so none can be left alone at the end of a wrapped row. */
    expect(Array.from(ladder.children).some((child) => child.hasAttribute("data-ladder-arrow"))).toBe(false);
    expect(ladder.lastElementChild?.hasAttribute("data-ladder-step")).toBe(true);
  });

  it("the ladder keeps the server's attempt order, laid out reversed as VD-P20-14 decides, and never regroups by claim", async () => {
    const runs = claimedRuns(12);
    const { steps } = await renderLadder(runs);
    const serverReversed = [...runs].reverse();
    const shownRuns = steps.map((step) => step.querySelector("[data-ladder-run]")?.getAttribute("data-ladder-run"));
    expect(shownRuns).toEqual(serverReversed.map((item) => item.run_id));
    expect(steps.map((step) => step.getAttribute("data-ladder-step"))).toEqual(shownRuns);
    const shownClaims = steps.map((step) => step.querySelector("[data-claim]")?.getAttribute("data-claim"));
    expect(shownClaims).toEqual(serverReversed.map((item) => item.claim.family));
    /* The fixture's families are unsorted, so a ladder that sorted or grouped by claim would fail above. */
    const byRank = [...serverReversed].sort((a, b) => (a.claim.rank ?? 0) - (b.claim.rank ?? 0)).map((item) => item.claim.family);
    expect(shownClaims).not.toEqual(byRank);
  });
});

/**
 * B9 S13 chart annotations. The bodies are TYPED BUILDERS: the canonical pair-ok fixture with its
 * `pair.chart_annotations` replaced by values shaped by the generated CompareChartAnnotation type
 * (not server captures; preview has no amendment rows yet).
 */
describe("S13 Compare — per-run chart annotations (B9)", () => {
  const url = "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b";

  function withAnnotations(truncated: boolean) {
    const body = compareFixture("research-compare.pair-ok.valid.json");
    if (body.result.mode !== "pair" || body.result.pair === null) throw new Error("fixture guard");
    const points = body.result.pair.overlay.points;
    const first = points[0]!.at_utc_ms;
    const last = points[points.length - 1]!.at_utc_ms;
    const one = (run_id: string, scopeWindow: [number, number], coverage: string) => ({
      run_id,
      availability: { state: "AVAILABLE", reason_code: null },
      input_digest: "e".repeat(64),
      scope: {
        window: "OOS",
        first_at_utc_ms: scopeWindow[0],
        last_at_utc_ms: scopeWindow[1],
        observation_count: 10,
        fold_count: 3,
        locator: `locator:${run_id}`,
        benchmark_locator: "bench#1",
        coverage,
        source_observation_count: 10,
      },
      all_time_metrics: null,
      drawdown_episodes: {
        state: "AVAILABLE",
        reason_code: null,
        origin: "PORTAL_DERIVED",
        total: 1,
        open_episode_present: false,
        longest_open: false,
        values: [{ start_utc_ms: first, trough_utc_ms: first, recovery_utc_ms: last, depth_fraction: "-0.0123", duration_seconds: 100 }],
      },
      month_extrema: truncated
        ? {
            availability: { state: "NOT_PUBLISHED", reason_code: "B9_MONTH_TRANSPORT_DOES_NOT_COVER_FULL_POPULATION" },
            definition_id: "ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1",
            includes_partial_months: true,
            source_period_count: 40,
            best: null,
            worst: null,
          }
        : {
            availability: { state: "AVAILABLE", reason_code: null },
            definition_id: "ALL_RETAINED_OOS_MONTHS_MAX_MIN_RETURN_V1",
            includes_partial_months: true,
            source_period_count: 2,
            best: { month_start_utc_ms: first, return_fraction: "0.05", observation_count: 20, expected_observation_count: 30, partial: true, basis: "FIRST_OOS_CLOSE", base_at_utc_ms: first, close_at_utc_ms: last },
            worst: null,
          },
    });
    (body.result.pair as unknown as { chart_annotations: unknown[] }).chart_annotations = [
      one("run-w6a-wfo-a", [first, last], "FULL_RETAINED_OOS"),
      one("run-w6a-wfo-b", [first, last], "SAMPLED_RETAINED_EQUITY"),
    ];
    return body;
  }

  it("B9-S13-A the fixture's typed absence stays a typed absence per run (no span, no ring)", async () => {
    server([{ status: 200, body: compareFixture("research-compare.pair-ok.valid.json") }]);
    renderAt(url);
    await settled();
    const text = document.querySelector("[data-run-annotations]")!.outerHTML;
    expect(text).toContain("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(document.querySelector("[data-annotation-span]")).toBeNull();
    expect(document.querySelector("[data-annotation-ring]")).toBeNull();
  });

  it("B9-S13-B published annotations: a shaded span and a ringed month per run, each run's own scope labelled, provenance in the title", async () => {
    server([{ status: 200, body: withAnnotations(false) }]);
    renderAt(url);
    await settled();
    for (const run of ["run-w6a-wfo-a", "run-w6a-wfo-b"]) {
      expect(document.querySelector(`[data-annotation-span="${run}"]`)).not.toBeNull();
      expect(document.querySelector(`[data-annotation-ring="${run}:best"]`)).not.toBeNull();
      const card = document.querySelector(`[data-annotation-run="${run}"]`)!;
      expect(card.querySelector("[data-annotation-scope]")!.textContent).toContain("own scope");
      const dd = card.querySelector("[data-annotation-drawdown]")!;
      expect(dd.getAttribute("title")).toContain("origin PORTAL_DERIVED");
      expect(dd.getAttribute("title")).toContain(`locator locator:${run}`);
      expect(dd.getAttribute("title")).toContain("e".repeat(64));
      expect(dd.querySelector("[data-exact]")!.getAttribute("data-exact")).toBe("-0.0123");
      expect(dd.textContent).toContain("−1.23%");
    }
    const scopes = Array.from(document.querySelectorAll("[data-annotation-scope]")).map((node) => node.textContent);
    expect(scopes[0]).toContain("full retained");
    expect(scopes[1]).toContain("sampled retained");
  });

  it("B9-S13-C a truncated month population prints the typed absence and draws no ring, never a guessed extremum", async () => {
    server([{ status: 200, body: withAnnotations(true) }]);
    renderAt(url);
    await settled();
    expect(document.querySelector("[data-annotation-ring]")).toBeNull();
    expect(document.querySelectorAll("[data-annotation-months-absent]")).toHaveLength(2);
    expect(document.querySelector("[data-annotation-months-absent]")!.outerHTML).toContain("B9_MONTH_TRANSPORT_DOES_NOT_COVER_FULL_POPULATION");
    expect(document.querySelector("[data-annotation-span]")).not.toBeNull();
  });
});
