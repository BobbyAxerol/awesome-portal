/**
 * Batch F1 (honesty) · Screen 13, on the canonical compare fixtures.
 *
 *  - S13 equal claim: "claim ↑ →" was printed between cards of EQUAL claim rank (all
 *    real attempts of one idea share one family) and the gold rule said the claim
 *    "strengthens at every step". The connector now reads what the two served ranks
 *    say, and the sentence is conditional.
 *    F1b / VD-F1-03 (Bobby 2026-10-01): between equal ranks nothing is printed, the
 *    rule sentence is the ladder heading's title, one short "claim strengthens →" line
 *    only when a step strengthens, and a ladder of one claim is one line + a plain grid.
 *  - 400-trial audit: the pair table labelled a common-window return "total return
 *    (OOS)" and mixed scopes under one header; the config diff compared every column
 *    with a baseline this screen picked, without saying so.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATTEMPTS_RULE,
  ATTEMPTS_RULE_BASE,
  LADDER_STRENGTHENS,
  attemptsRule,
  ladderOneClaim,
  ladderOrderNote,
  ladderStepKind,
  ladderSteps,
  type LadderStepKind,
} from "./CompareDetail";
import { CompareRoute } from "./CompareRoute";
import type { Compare, CompareRun } from "./compareClient";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string): Compare => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Compare;
const WFO_ALPHA = "delta-rsi-polynomial-alpha";
const base = `/research/quantbt/alphas/${WFO_ALPHA}/compare`;

function server(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/compare" element={<CompareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const page = () => document.querySelector('[data-screen="compare"]') as HTMLElement;
const settled = () => waitFor(() => expect(page().getAttribute("aria-busy")).toBe("false"));
const arrows = () => [...document.querySelectorAll("[data-ladder-arrow]")] as HTMLElement[];
/** VD-F1-03: the rule sentence rides the ladder heading's title (no callout). */
const ruleText = () => document.querySelector(".cp-ladderhead")?.getAttribute("title") ?? "";
/** The ladder section's text without its heading (cards, connectors, notes). */
const ladderTextWithoutHeading = () => document.querySelector("[data-ladder-order]")?.textContent ?? "";
const header = () => document.querySelector(".cp-ladderhead [data-ladder-order-key]")?.textContent ?? "";

/** The canonical attempts fixture with the claim ranks of its three attempts set (server order: strongest first). */
function attemptsWithRanks(ranks: Array<number | null>): Compare {
  const body = fixture("research-compare.attempts.valid.json");
  if (body.result.mode !== "attempts") throw new Error("fixture guard");
  const families = ["STRICT_OUTER_OOS", "SELECTION_ADJUSTED_OOS", "WALK_FORWARD_OOS_COMPATIBILITY", "NONE_FULL_SAMPLE_CALIBRATION"] as const;
  body.result.attempts.forEach((item, index) => {
    const rank = ranks[index]!;
    item.claim.rank = rank;
    item.claim.family = rank === null ? "NOT_PUBLISHED" : families[rank - 1]!;
  });
  return body;
}

describe("S13 equal claim — the connector and the rule say only what the ranks say", () => {
  it("F1-S13-01a on the canonical fixture every attempt is rank 3: nothing between the cards, one line 'N attempts · one claim: <family>', a plain grid", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    expect(new Set(body.result.attempts.map((item) => item.claim.rank))).toEqual(new Set([3]));
    server(body);
    renderAt(base);
    await settled();
    expect(arrows()).toHaveLength(0);
    const ladder = document.querySelector("[data-ladder-order]")!;
    expect(ladder.getAttribute("data-ladder-layout")).toBe("one-claim");
    expect(ladder.querySelectorAll("[data-ladder-run]")).toHaveLength(body.result.attempts.length);
    expect(document.querySelector("[data-ladder-one-claim]")?.textContent).toBe(
      `${body.result.attempts.length} attempts · one claim: WALK_FORWARD_OOS_COMPATIBILITY`,
    );
    expect(document.querySelector('[data-panel="ladder"]')!.textContent).not.toMatch(/claim ↑|same claim/);
    /* the rule keeps what is always true and drops the "every step" promise; it is a title, not a callout */
    expect(document.querySelector('[data-panel="rule"]')).toBeNull();
    expect(ruleText()).toContain(ATTEMPTS_RULE_BASE);
    expect(ruleText()).not.toContain("strengthens at every step");
    expect(ruleText()).not.toContain("selection luck");
    expect(header()).not.toContain(LADDER_STRENGTHENS);
    expect(header()).not.toContain("returned");
  });

  it("F1-S13-01b a ladder that strengthens at every step keeps the hi-fi arrows, the full sentence (title) and one 'claim strengthens →' line", async () => {
    /* server order is strongest first: ranks 1, 2, 3 -> laid out reversed 3, 2, 1 */
    server(attemptsWithRanks([1, 2, 3]));
    renderAt(base);
    await settled();
    expect(arrows().map((el) => el.textContent?.trim())).toEqual(["claim ↑ →", "claim ↑ →"]);
    expect(ruleText()).toContain(ATTEMPTS_RULE);
    expect(header()).toContain(LADDER_STRENGTHENS);
    expect(document.querySelectorAll("[data-ladder-order-note]")).toHaveLength(1);
    expect(document.querySelector("[data-ladder-one-claim]")).toBeNull();
    expect(document.querySelector("[data-ladder-order]")!.getAttribute("data-ladder-layout")).toBe("ladder");
  });

  it("F1-S13-01c a mixed ladder prints words only at the step that really strengthens; the equal step is a wordless connector", async () => {
    /* server order 1, 3, 3 -> laid out 3, 3, 1: same, then up */
    server(attemptsWithRanks([1, 3, 3]));
    renderAt(base);
    await settled();
    expect(arrows().map((el) => el.textContent?.trim())).toEqual(["", "claim ↑ →"]);
    expect(arrows().map((el) => el.getAttribute("data-step-kind"))).toEqual(["SAME", "UP"]);
    expect(ladderTextWithoutHeading()).not.toContain("same claim");
    expect(ruleText()).not.toContain("strengthens at every step");
    expect(ruleText()).toContain("a claim ↑ step is a stronger claim");
    expect(header()).toContain(LADDER_STRENGTHENS);
    expect(document.querySelector("[data-ladder-one-claim]")).toBeNull();
  });

  it("F1-S13-01d a card whose rank is not published gets a plain connector, not a claim arrow", async () => {
    /* attempt 3 has no claim family, so it leaves the ladder; give it rank null with a published family to reach the connector */
    const body = attemptsWithRanks([1, 3, 3]);
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    body.result.attempts[2]!.claim.rank = null;
    server(body);
    renderAt(base);
    await settled();
    expect(arrows().map((el) => el.getAttribute("data-step-kind"))).toEqual(["UNKNOWN", "UP"].slice(0, arrows().length));
    expect(arrows()[0]!.textContent?.trim()).toBe("→");
    expect(document.querySelector('[data-panel="ladder"]')!.textContent).not.toContain("same claim");
    /* an unpublished rank is not "one claim": no one-claim line */
    expect(document.querySelector("[data-ladder-one-claim]")).toBeNull();
  });

  it("F1-S13-01e the step helpers compare the two served ranks only", () => {
    const withRank = (rank: number | null) => ({ claim: { rank } }) as unknown as CompareRun;
    const kinds = (ranks: Array<number | null>): LadderStepKind[] => ladderSteps(ranks.map(withRank));
    expect(ladderStepKind(withRank(3), withRank(1))).toBe("UP");
    expect(ladderStepKind(withRank(3), withRank(3))).toBe("SAME");
    expect(ladderStepKind(withRank(1), withRank(3))).toBe("DOWN");
    expect(ladderStepKind(withRank(null), withRank(3))).toBe("UNKNOWN");
    expect(kinds([3, 3, 3])).toEqual(["SAME", "SAME"]);
    expect(attemptsRule(kinds([3, 3, 3]))).toBe(ATTEMPTS_RULE_BASE);
    expect(attemptsRule([])).toBe(ATTEMPTS_RULE_BASE);
    expect(attemptsRule(kinds([3, 2, 1]))).toBe(ATTEMPTS_RULE);
    expect(attemptsRule(kinds([3, 3, 1]))).toContain("a claim ↑ step");
    expect(ladderOrderNote(kinds([3, 3, 3]))).toBeNull();
    expect(ladderOrderNote(kinds([3, 2, 1]))).toBe(LADDER_STRENGTHENS);
    expect(ladderOrderNote(kinds([3, 3, 1]))).toBe(LADDER_STRENGTHENS);
    expect(ladderOrderNote(kinds([1, 3]))).toBeNull();
    expect(ladderOrderNote([])).toBeNull();
    expect(ladderOneClaim(kinds([3, 3, 3]))).toBe(true);
    expect(ladderOneClaim(kinds([3, 3, 1]))).toBe(false);
    expect(ladderOneClaim(kinds([3, null, 3]))).toBe(false);
    expect(ladderOneClaim(kinds([3]))).toBe(false);
  });
});

describe("S13 ladder pill — the version's lifecycle is not the run's state", () => {
  it("F1-S13-04 each card's pill reads 'version ACTIVE' / 'version SUPERSEDED' and its title names the run state separately", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    server(body);
    renderAt(base);
    await settled();
    for (const item of body.result.attempts) {
      const pill = document.querySelector(`[data-ladder-run="${item.run_id}"] [data-life]`) as HTMLElement;
      expect(pill.textContent).toBe(`version ${item.alpha_version_lifecycle.value}`);
      expect(pill.getAttribute("title")).toContain(`not the run's state (${item.run_state})`);
    }
    expect([...document.querySelectorAll("[data-ladder-run] [data-life]")].map((el) => el.textContent)).not.toContain("ACTIVE");
  });
});

describe("S13 pair table — every figure carries its served scope", () => {
  it("F1-S13-02a the common-window return is no longer labelled 'total return (OOS)'; return and drawdown say 'common window', Sharpe and trades keep their served scope", async () => {
    const body = fixture("research-compare.pair-ok.valid.json");
    server(body);
    renderAt(`${base}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    const table = document.querySelector("[data-delta-table]") as HTMLElement;
    expect(table.textContent).not.toContain("total return (OOS)");
    const row = (id: string) => table.querySelector(`[data-delta-row="${id}"] td`) as HTMLElement;
    expect(row("NET_RETURN_FRACTION").textContent).toBe("net returncommon window");
    expect(row("NET_RETURN_FRACTION").getAttribute("title")).toBe("research.compare.metric.v1.common-window-net-return");
    expect(row("MAX_DRAWDOWN_FRACTION").textContent).toBe("max drawdowncommon window");
    expect(row("OOS_SHARPE").textContent).toBe("OOS sharpemean of folds");
    expect(row("TRADE_COUNT").textContent).toBe("tradessum of folds");
    expect(row("WIN_RATE").textContent).toContain("common window");
    /* the window the figures belong to is printed under the table */
    expect(document.querySelector("[data-common-window] [title]")?.getAttribute("title")).toBe("research.compare-common-window.v1");
  });
});

describe("S13 pair table — a served common-window Sharpe gets its own labelled row", () => {
  it("F1-S13-02b research.compare.metric.v2 serves A/B/Δ for the common window: a second row carries them; the fold-mean row no longer prints 'Δ — available AVAILABLE'", async () => {
    const body = fixture("research-compare.pair-ok.valid.json");
    if (body.result.mode !== "pair" || body.result.pair === null) throw new Error("fixture guard");
    const sharpe = body.result.pair.common_window.metrics.find((metric) => metric.key === "OOS_SHARPE")!;
    Object.assign(sharpe, {
      definition_id: "research.compare.metric.v2.common-window-utc-daily-sharpe-365",
      left_value: "-11.167622735917",
      right_value: "-2.252034277509",
      delta: "8.915588458408",
      availability: { state: "AVAILABLE", reason_code: null },
    });
    server(body);
    renderAt(`${base}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    const table = document.querySelector("[data-delta-table]") as HTMLElement;
    expect(table.textContent).not.toContain("available AVAILABLE");
    expect([...table.querySelectorAll("[data-delta-row]")].map((row) => row.getAttribute("data-delta-row"))).toEqual([
      "OOS_SHARPE", "OOS_SHARPE_COMMON", "NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION", "TRADE_COUNT", "WIN_RATE", "CLAIM",
    ]);
    const original = table.querySelector('[data-delta-row="OOS_SHARPE"]') as HTMLElement;
    expect(original.querySelector("td")!.textContent).toBe("OOS sharpemean of folds");
    expect(original.querySelector("td.d")!.textContent).toContain("Δ — not published");
    const common = table.querySelector('[data-delta-row="OOS_SHARPE_COMMON"]') as HTMLElement;
    expect(common.querySelector("td")!.textContent).toBe("OOS sharpecommon window");
    expect(common.querySelector("td")!.getAttribute("title")).toBe(sharpe.definition_id);
    expect(common.querySelector("[data-delta-value]")!.getAttribute("data-delta-value")).toBe("8.915588458408");
    expect(common.querySelector("[data-exact]")!.getAttribute("data-exact")).toBe("-11.167622735917");
  });
});

describe("S13 config diff — a baseline this screen picked says so", () => {
  it("F1-S13-03a the legend names the baseline, says the screen picked it and that the server names none", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    server(body);
    renderAt(base);
    await settled();
    const legend = document.querySelector("[data-config-diff-legend]") as HTMLElement;
    const active = body.result.attempts.find((item) => item.alpha_version_lifecycle.value === "ACTIVE")!;
    expect(legend.textContent).toBe(`gold = differs from ${active.attempt_id} · baseline picked by this screen`);
    expect(legend.getAttribute("data-baseline-chosen")).toBe("screen");
    expect(legend.getAttribute("title")).toContain("The server publishes no baseline attempt");
    const head = document.querySelector(`.cp-difftable thead th[data-active="true"]`) as HTMLElement;
    expect(head.getAttribute("title")).toBe(`${active.attempt_id} — baseline picked by this screen (the server names none)`);
  });

  it("F1-S13-03b with no ACTIVE version on the ladder nothing is compared, and the legend says no baseline exists", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    for (const item of body.result.attempts) item.alpha_version_lifecycle.value = "SUPERSEDED";
    server(body);
    renderAt(base);
    await settled();
    const legend = document.querySelector("[data-config-diff-legend]") as HTMLElement;
    expect(legend.getAttribute("data-baseline-chosen")).toBe("none");
    expect(legend.textContent).toBe(`${body.result.config_diff.paths.length} keys · no baseline — the server names none`);
    expect(document.querySelector('[data-differs="true"]')).toBeNull();
  });
});

describe("S13 text trim (VD-TEXT-01) — prose out of the body, honesty kept", () => {
  it("F1b-S13-04 no subtitle, no rules footer, no explanatory tails; the sentences ride titles; links and absences stay", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    server(body);
    renderAt(base);
    await settled();
    const text = page().textContent ?? "";
    expect(page().querySelector("h2")!.textContent).toBe("Compare");
    expect(page().querySelector("[data-subtitle]")).toBeNull();
    expect(text).not.toMatch(/rules of this screen|rule of this mode|three different questions/i);
    expect(text).not.toContain("only keys that changed");
    expect(text).not.toContain("same folds, same tape");
    expect(text).not.toContain("never inferred from results");
    expect(text).not.toContain("only ever reads the ACTIVE node");
    expect(page().querySelector('[data-panel="diff"] h3 span')!.textContent).toBe("config diff");
    expect(page().querySelector('[data-panel="diff"] .foot')!.getAttribute("title")).toContain("PORTAL_PERSISTED_RESEARCH");
    /* the trajectory keeps its two links as links, the sentence is their title */
    const links = page().querySelector("[data-trajectory-links]") as HTMLElement;
    expect(links.textContent).toMatch(/^Attempt Lineage → · release candidate →$/);
    expect(links.getAttribute("title")).toContain("only ever reads the ACTIVE node");
    /* typed absences stay: cert and claim chip are printed, never dropped with the gloss */
    expect(page().querySelector("[data-cert-absent]")!.textContent).toContain("cert not published");
    expect(page().querySelector(".cp-claimchip")!.textContent).toContain("WALK");
  });

  it("F1b-S13-05 without an ACTIVE attempt the release-candidate link says so instead of vanishing", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    if (body.result.mode !== "attempts") throw new Error("fixture guard");
    for (const item of body.result.attempts) item.alpha_version_lifecycle.value = "SUPERSEDED";
    server(body);
    renderAt(base);
    await settled();
    expect(page().querySelector("[data-trajectory-rc-absent]")!.textContent).toBe("release candidate — no ACTIVE attempt");
    expect(page().querySelector('[data-action="trajectory-rc"]')).toBeNull();
  });
});
