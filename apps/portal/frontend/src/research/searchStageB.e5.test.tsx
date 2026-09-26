/**
 * E5 · Screen 06 Stage B (HiFi audit 6.7, 6.8, 6.9, 6.10, 6.11) on a retained
 * WFO run: the pool funnel with K, the freeze-line label, the typeset formula,
 * θ*'s per-fold decay, the pool plane and the four-row best ≠ selected cards.
 *
 * The search body is the published canonical fixture (the real W5b seal
 * through the E5 Control API service); progress, requested spec and the hub
 * read are the W3b real bodies. Variants change one served fact at a time and
 * check that its absence is printed as an absence — never as 0.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchRoute } from "./SearchRoute";
import type { CurrentSourceSearch } from "./searchClient";
import { forgetObservedFolds } from "./evidenceCursor";
import { forgetSearchReads } from "./useSearch";
import { forgetRunIdentities } from "./retainedLane";
import { drawdownPercent, formulaFromTerms, freezeLineLabel, kExpression, signed2 } from "./SearchStageB";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SURFACE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: unknown;
};
const RUN = SURFACE.run_id;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function stub(search: unknown = SURFACE) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      const [status, payload] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/search")
            ? [200, search]
            : path.endsWith("/search")
              ? [200, W3B.hub_search]
              : [404, { error: { code: "UNEXPECTED" } }];
      return { ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload } as unknown as Response;
    }),
  );
}

async function settled(search: unknown = SURFACE) {
  stub(search);
  const path = `/research/quantbt/runs/${RUN}/search`;
  window.history.replaceState(null, "", path);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.container.querySelector("[data-panel='pool-freeze'] [data-retained-pool]")).toBeTruthy());
  return view.container;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetSearchReads();
  forgetRunIdentities();
  forgetObservedFolds();
});

const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent ?? null;

describe("E5 · 6.7/6.8 B1 pool freeze and the K callout", () => {
  it("draws the HiFi funnel from the served pool: 3 evaluated, feasible n/a, K 1, 1 re-evaluated, 1 selected", async () => {
    const root = await settled();
    const pool = root.querySelector("[data-panel='pool-freeze']") as HTMLElement;
    expect(pool.querySelector("[data-retained-pool]")?.getAttribute("data-pool-schema")).toBe("research.current-source-search-pool.v1");
    expect(text(pool, "[data-pool-count='trials']")).toBe("3");
    expect(text(pool, "[data-pool-count='feasible']")).toBe("n/a");
    expect(pool.querySelector("[data-pool-row='feasible']")?.getAttribute("data-pool-state")).toBe("NOT_APPLICABLE");
    expect(pool.querySelector("[data-pool-bar='feasible']")).toBeNull();
    expect(text(pool, "[data-pool-row='feasible']")).toContain("does not arise — QuantBT's walk-forward study declares no constraints");
    expect(text(pool, "[data-pool-count='top-is']")).toBe("1");
    expect(text(pool, "[data-pool-row='top-is']")).toContain("K = ⌈3 × 0.1⌉ = 1");
    expect(text(pool, "[data-pool-count='reevaluated']")).toBe("1");
    expect(text(pool, "[data-pool-row='reevaluated']")).toContain("on every outer fold — the OOS column enters the ranking");
    expect(text(pool, "[data-pool-count='selected']")).toBe("1");
    expect(text(pool, "[data-pool-row='selected']")).toContain("robust_decay");
    expect(text(pool, "[data-pool-row='trials']")).toContain("3 scored, not pruned");
  });

  it("the callout prints QuantBT's rule with the served inputs, and says what the OOS then does", async () => {
    const root = await settled();
    const callout = root.querySelector("[data-k-callout]") as HTMLElement;
    expect(callout.getAttribute("data-k-callout")).toBe("CEIL_N_TIMES_TOP_IS_FRACTION");
    expect(callout.textContent).toBe(
      "K = ⌈n_trials × top_is_fraction⌉ = ⌈3 × 0.1⌉ = 1 — the pool closes BEFORE any OOS value is computed. Stage B then ranks the frozen pool on OOS, so the claim is selection-adjusted.",
    );
  });

  it("the freeze line reads POOL FROZEN · K = ⌈3 × 0.1⌉ = 1", async () => {
    const root = await settled();
    const label = root.querySelector("[data-freeze-label]") as HTMLElement;
    expect(label.getAttribute("data-freeze-label")).toBe("served");
    expect(label.textContent).toBe("POOL FROZEN · K = ⌈3 × 0.1⌉ = 1");
  });

  it("a K the server withholds is printed as its absence: no bar, no zero, no K worked out in the browser", async () => {
    const search = copy(SURFACE);
    search.pool!.top_is_k = { state: "NOT_PUBLISHED", value: null, reason_code: "RETAINED_POOL_SIZE_DISAGREES_WITH_THE_QUANTBT_POOL_RULE", source: null };
    search.pool!.rule = { ...search.pool!.rule, state: "NOT_PUBLISHED", reason_code: "RETAINED_POOL_SIZE_DISAGREES_WITH_THE_QUANTBT_POOL_RULE", k: 3 };
    const root = await settled(search);
    expect(text(root, "[data-pool-count='top-is']")).toBe("not published");
    expect(root.querySelector("[data-pool-bar='top-is']")).toBeNull();
    expect(root.querySelector("[data-k-callout]")?.getAttribute("data-k-callout")).toBe("absent");
    expect(text(root, "[data-k-callout]")).toContain("the retained pool and QuantBT's rule disagree");
    expect(text(root, "[data-freeze-label]")).toBe("POOL FROZEN · K NOT PUBLISHED");
    expect([...root.querySelectorAll("[data-pool-count]")].map((cell) => cell.textContent)).not.toContain("0");
  });

  it("an older server without `pool` keeps the ledger totals, says so, and never prints a 0 for a missing selection", async () => {
    const search = copy(SURFACE) as Partial<CurrentSourceSearch>;
    delete search.pool;
    search.selection = { ...search.selection!, selected_trial_id: null };
    const root = await settled(search);
    expect(root.querySelector("[data-retained-pool]")?.getAttribute("data-retained-pool")).toBe("pre-e5");
    expect(text(root, "[data-pool-row='selected']")).toContain("not published");
    expect(text(root, "[data-pool-row='selected']")).not.toMatch(/\b0\b/);
  });
});

describe("E5 · 6.9/6.10 B2 formula and sub-panels", () => {
  it("typesets J from the served terms, with λ and γ as served", async () => {
    const root = await settled();
    const typeset = root.querySelector("[data-formula-typeset]") as HTMLElement;
    expect(typeset.getAttribute("data-formula-typeset")).toBe("MODE_1_DECAY_OOS_MEAN_MINUS_LAMBDA_STD_MINUS_GAMMA_POSITIVE_DECAY");
    expect(typeset.querySelector("[role='math']")?.getAttribute("aria-label")).toBe("mean_oos_sharpe - 0.5 * std_decay - 0.5 * positive_mean_decay");
    expect(typeset.textContent).toContain("λ 0.5 · γ 0.5");
  });

  it("draws θ*'s per-fold decay verbatim, sign first, bars scaled to the largest |d|", async () => {
    const root = await settled();
    const rows = [...root.querySelectorAll("[data-fold-decay-row]")];
    expect(rows.map((row) => row.getAttribute("data-fold-decay-row"))).toEqual(["0", "1"]);
    expect(rows.map((row) => row.textContent)).toEqual(["fold_01+7.44", "fold_02+0.38"]);
    expect(rows.map((row) => row.querySelector("[data-decay-sign]")?.getAttribute("data-decay-sign"))).toEqual(["positive", "positive"]);
    expect((rows[0]!.querySelector("[data-decay-sign]") as HTMLElement).style.width).toBe("48%");
  });

  it("a per-fold series the server withholds is its reason, not an empty chart", async () => {
    const search = copy(SURFACE);
    search.pool!.per_fold_decay = { state: "NOT_PUBLISHED", reason_code: "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS", basis: null, rows: [] };
    const root = await settled(search);
    expect(root.querySelector("[data-fold-decay]")?.getAttribute("data-fold-decay")).toBe("NOT_PUBLISHED");
    expect(text(root, "[data-gap-reason='fold-decay']")).toBe("QuantBT did not retain θ*'s fold metrics");
    expect(root.querySelectorAll("[data-fold-decay-row]")).toHaveLength(0);
  });

  it("places every pool member with both means on the plane; θ* is the gold point", async () => {
    const root = await settled();
    const plane = root.querySelector("[data-pool-plane]") as HTMLElement;
    expect(plane.getAttribute("data-pool-plane")).toBe("1");
    const point = plane.querySelector("[data-plane-point='0']") as HTMLElement;
    expect(point.getAttribute("data-plane-theta")).toBe("true");
    expect(point.getAttribute("title")).toBe("candidate 0 · IS -1.4435308120735202 · OOS -5.354970424211971 · θ*");
  });
});

describe("E5 · 6.11 B3 best ≠ selected — four rows per card", () => {
  it("each card lists S_IS, S̄_OOS, d̄ decay and max_dd from the pool member that re-scored it", async () => {
    const root = await settled();
    for (const kind of ["raw-best", "selected"]) {
      const card = root.querySelector(`[data-role-card='${kind}']`) as HTMLElement;
      expect([...card.querySelectorAll("[data-role-row]")].map((row) => row.textContent)).toEqual([
        "S_IS−1.44",
        "S̄_OOS−5.35",
        "d̄ decay+3.91",
        "max_dd−0.67%",
      ]);
    }
    const dd = root.querySelector("[data-role-card='selected'] [data-max-dd-source]") as HTMLElement;
    expect(dd.getAttribute("data-max-dd-source")).toBe("RETAINED_STITCHED_OOS_PATH");
  });

  it("a candidate drawdown the ledger does not publish reads 'not published' with its reason — never 0", async () => {
    const search = copy(SURFACE);
    search.candidates.rows[0]!.max_drawdown = { state: "NOT_PUBLISHED", value: null, reason_code: "QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN", source: null };
    const root = await settled(search);
    const row = root.querySelector("[data-role-card='selected'] [data-role-row='max_dd']") as HTMLElement;
    expect(row.textContent).toBe("max_dd" + "not published");
    expect(row.querySelector("[data-absent]")?.getAttribute("data-absent")).toBe("QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN");
  });

  it("an older server (no max_drawdown) keeps the one-number cards", async () => {
    const search = copy(SURFACE);
    for (const row of search.candidates.rows) delete (row as Partial<typeof row>).max_drawdown;
    const root = await settled(search);
    expect(root.querySelector("[data-role-cards]")).toBeNull();
    expect(root.querySelector("[data-role-card='selected']")?.textContent).toContain("−9.81");
  });
});

describe("E5 · display rules on S06 (E1 helpers)", () => {
  it("claim tokens print as QuantBT's token in capitals (claimToken); the exact value rides in the attribute", async () => {
    const root = await settled();
    const oos = root.querySelector("[data-claim-fact='oos used for selection'] [data-claim-value]") as HTMLElement;
    expect(oos.textContent).toBe("YES");
    const metric = root.querySelector("[data-claim-fact='candidate selection metric'] [data-claim-value]") as HTMLElement;
    expect(metric.textContent).toBe("ROBUST_DECAY");
    expect(metric.getAttribute("data-claim-value")).toBe("robust_decay");
  });

  it("the run id in the breadcrumb is short, with the full id kept for copy", async () => {
    const root = await settled();
    const crumb = root.querySelector("nav[aria-label='Breadcrumb'] [data-full-id]") as HTMLElement;
    expect(crumb.getAttribute("data-full-id")).toBe(RUN);
  });

  it("pure helpers print served values without arithmetic beyond a unit change", () => {
    expect(signed2("0.3824316215292036")).toBe("+0.38");
    expect(signed2("-0.08")).toBe("−0.08");
    expect(drawdownPercent("-0.006740604275658146")).toBe("−0.67%");
    expect(drawdownPercent(null)).toBeNull();
    expect(formulaFromTerms([{ term: "a", weight: "1" }, { term: "b", weight: "-0.5" }, { term: "c", weight: "2" }])).toBe("a - 0.5 * b + 2 * c");
    expect(kExpression({ state: "AVAILABLE", reason_code: null, expression: "CONFIGURED_TOP_IS_K", n: 9, top_is_fraction: "0.1", configured_top_is_k: 4, k: 4 })).toBe("K = top_is_k = 4");
    expect(freezeLineLabel(undefined)).toBeNull();
  });
});
