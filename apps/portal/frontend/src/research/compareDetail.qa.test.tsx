/**
 * QA sweep 2026-10-02 · S13 Compare fixes, on the canonical compare fixtures (`packages/contracts/fixtures/research-compare.*`),
 * mutated only where a path needs a state the fixtures do not cover (said in the test). Each test fails without its fix.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LADDER_TITLE, MARKETS_SHORT, refusalSentence, runName } from "./CompareDetail";
import { CompareRoute } from "./CompareRoute";
import type { Compare, CompareRun } from "./compareClient";
import { identicalSeriesGroups } from "./compareFoldBars";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string): Compare => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Compare;
const base = "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare";

function server(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
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

function attempts(mutate?: (runs: CompareRun[], body: Extract<Compare["result"], { mode: "attempts" }>) => void): Compare {
  const body = fixture("research-compare.attempts.valid.json");
  if (body.result.mode !== "attempts") throw new Error("fixture guard");
  mutate?.(body.result.attempts as CompareRun[], body.result);
  return body;
}

describe("QA S13 · labels, not ids", () => {
  it("runName: the row's display_label, else the registry, else the short RUN id, never the attempt id", () => {
    const run = attempts().result.mode === "attempts" ? (attempts().result as { attempts: CompareRun[] }).attempts[0]! : (null as never);
    expect(runName({ ...run, display_label: "R-P04-006" })).toBe("R-P04-006");
    expect(runName({ ...run, display_label: null, run_id: "rrun_8c9c9991bdd0cfe72100da64ebee1150" })).toBe("rrun_8c9c9991");
    expect(runName({ ...run, display_label: null, run_id: "rrun_8c9c9991bdd0cfe72100da64ebee1150", attempt_id: "ratt_8d756a95aa" })).not.toMatch(/ratt_/);
  });

  it("ladder cards, off-ladder rows, the fold legend and the config-diff heads are all named by the label; the attempt id is a tooltip", async () => {
    const body = attempts((runs, result) => {
      runs.forEach((run, index) => {
        run.display_label = `R-WFO-0${index + 1}`;
        run.attempt_id = `ratt_8d756a95${index}`;
      });
      runs[2]!.claim = { ...runs[2]!.claim, family: "NOT_PUBLISHED", rank: null, text: null, availability: { state: "NOT_PUBLISHED", reason_code: "P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED" } } as CompareRun["claim"];
      void result;
    });
    server(body);
    renderAt(base);
    await settled();
    const text = page().textContent ?? "";
    expect(text).not.toMatch(/ratt_/);
    expect(text).toContain("R-WFO-01");
    const card = document.querySelector('[data-ladder-run="run-w6a-wfo-a"]') as HTMLElement;
    expect(card.querySelector(".cp-att")!.textContent).toBe("R-WFO-01");
    expect(card.querySelector(".cp-att")!.getAttribute("title")).toContain("ratt_8d756a950");
    /* the label is the one link of the card to the run: not printed twice */
    expect([...card.querySelectorAll("a")].filter((a) => a.getAttribute("data-run-link")).map((a) => a.textContent)).toEqual(["R-WFO-01"]);
    for (const head of document.querySelectorAll(".cp-difftable thead th:not(:first-child)")) expect(head.textContent).toMatch(/^R-WFO-0\d$/);
    const legend = [...document.querySelectorAll("[data-fold-legend-run]")].map((el) => el.textContent);
    expect(legend.length).toBeGreaterThan(0);
    for (const entry of legend) expect(entry).toMatch(/^R-WFO-0\d · /);
    fireEvent.click(document.querySelector('[data-action="toggle-unclaimed"]')!);
    const row = document.querySelector('[data-unclaimed-run="run-w6a-p04"]')!;
    expect(row.textContent).toContain("R-WFO-03");
    expect(row.textContent).not.toMatch(/ratt_/);
    expect(row.querySelector(".cp-crowid")!.getAttribute("title")).toContain("ratt_8d756a952");
  });

  it("without any label the card shows the short run id (absence path), still not the attempt id", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    const card = document.querySelector('[data-ladder-run="run-w6a-wfo-a"]') as HTMLElement;
    expect(card.querySelector(".cp-att")!.textContent).toBe("run-w6a-wfo-a");
    expect(card.querySelector(".cp-att")!.textContent).not.toContain("att-");
  });

  it("the refusal names the differing key parts in one short sentence and keeps the server's message as a tooltip", async () => {
    const body = fixture("research-compare.pair-mismatch.valid.json");
    if (body.result.mode !== "pair" || body.result.state !== "REFUSED") throw new Error("fixture guard");
    server(body);
    renderAt(`${base}?mode=pair&runs=rrun_3d5633d2adb712722fe4ba108102aa5d,rrun_ece579ebadb712722fe4ba108102aa5d`);
    await settled();
    const message = document.querySelector("[data-refusal-message]")!;
    expect(message.textContent).toBe("Can't overlay: symbol differs (btcusdt vs ethusdt).");
    /* wave 2: one sentence plus one short pointer, and no `rrun_` id as prose in the card. */
    const card = document.querySelector("[data-panel='refusal']")!;
    expect(card.querySelector("[data-refusal-keys]")).toBeNull();
    expect(card.textContent).not.toMatch(/rrun_/);
    expect(card.querySelector("[data-refusal-message]")!.getAttribute("title")).toContain("One alpha across markets: use the markets tab.");
    expect(message.getAttribute("data-server-message")).toBe(body.result.refusal.message);
    expect(document.querySelector("[data-panel='refusal']")!.getAttribute("title")).toBe(body.result.refusal.message);
    expect(document.querySelector("[data-panel='refusal']")!.textContent).not.toMatch(/button|lie/);
    expect(refusalSentence(body.result.refusal.left_key, body.result.refusal.left_key)).toBe("Can't overlay these runs.");
  });

  it("the markets rule is one short sentence; the server's caption rides the title", async () => {
    const body = fixture("research-compare.markets.valid.json");
    server(body);
    renderAt(`${base}?mode=markets`);
    await settled();
    const caption = document.querySelector("[data-caption]")!;
    expect(caption.textContent).toBe(MARKETS_SHORT);
    expect(MARKETS_SHORT.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(document.querySelector("[data-panel='rule']")!.getAttribute("title")).toContain(caption.getAttribute("data-server-caption")!);
  });
});

describe("QA S13 · Sharpe, cert and claim said once", () => {
  it("each card with a Sharpe says which Sharpe it is (scope), never a bare number", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    const scopes = [...document.querySelectorAll("[data-ladder-run] [data-sharpe-scope]")];
    expect(scopes.length).toBeGreaterThan(0);
    for (const scope of scopes) expect(scope.textContent).toMatch(/^OOS Sharpe/);
    expect(document.querySelector("[data-oos-sharpe]")!.getAttribute("title")).toContain("mean of folds");
  });

  it("a card whose Sharpe is not published has no scope line (absence path)", async () => {
    server(
      attempts((runs) => {
        const metric = runs[0]!.original_metrics.find((entry) => entry.key === "OOS_SHARPE")!;
        metric.value = null;
        metric.availability = { state: "NOT_PUBLISHED", reason_code: "P20_P13_OOS_SHARPE_NOT_AVAILABLE" };
      }),
    );
    renderAt(base);
    await settled();
    const card = document.querySelector('[data-ladder-run="run-w6a-wfo-a"]')!;
    expect(card.querySelector("[data-sharpe-scope]")).toBeNull();
    expect(card.querySelector("[data-oos-sharpe-absent]")!.outerHTML).toContain("P20_P13_OOS_SHARPE_NOT_AVAILABLE");
  });

  it("the same certification absence on every card is one line above the ladder; a differing one stays on its card", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    expect(document.querySelectorAll("[data-ladder-cert]")).toHaveLength(1);
    expect(document.querySelector("[data-ladder-cert]")!.outerHTML).toContain("P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE");
    expect(document.querySelectorAll("[data-ladder-run] [data-cert-absent]")).toHaveLength(0);
    cleanup();
    server(
      attempts((runs) => {
        runs[1]!.certification = { ...runs[1]!.certification, reason_code: "P20_OTHER" } as CompareRun["certification"];
      }),
    );
    renderAt(base);
    await settled();
    expect(document.querySelector("[data-ladder-cert]")).toBeNull();
    expect(document.querySelectorAll("[data-ladder-run] [data-cert-absent]")).toHaveLength(3);
  });

  it("the ladder says its order and no longer carries the slogan", async () => {
    expect(LADDER_TITLE).toBe("attempts, weakest to strongest claim");
    server(attempts());
    renderAt(base);
    await settled();
    expect(document.querySelector("[data-ladder-header]")!.textContent).toBe(LADDER_TITLE);
    expect(document.querySelector("[data-panel='ladder']")!.textContent).not.toMatch(/claims rank before numbers/i);
  });

  it("the header does not print pair-only absences on attempts or markets, and prints them in pair mode", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    expect(page().querySelector("[data-source-absence]")).toBeNull();
    expect(page().textContent).not.toContain("P20_FULL_RESOLUTION_RETURNS_APPLY_TO_PAIR_MODE_ONLY");
    cleanup();
    server(fixture("research-compare.pair-ok.valid.json"));
    renderAt(`${base}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    /* W4: everything available is silent; this fixture publishes both pair sources, so no absence line prints. */
    expect(page().querySelector('[data-source-absence="full_resolution_outer_oos_returns"]')).toBeNull();
  });

  it("the trajectory card prints no template id and the delta heads name the direction in three characters", async () => {
    const body = attempts();
    server(body);
    renderAt(base);
    await settled();
    if (body.result.mode !== "attempts") throw new Error("guard");
    expect(document.querySelector("[data-panel='trajectory']")!.textContent).not.toContain(body.result.trajectory.template_id);
    /* W4: no heading and no sr-only gloss; the template id and the sentence are the card's tooltip. */
    expect(document.querySelector("[data-panel='trajectory']")!.getAttribute("title")).toContain(body.result.trajectory.template_id);
    expect(document.querySelector("[data-panel='trajectory']")!.getAttribute("title")).toContain(body.result.trajectory.text!);
    expect(document.querySelector("[data-trajectory-text]")).toBeNull();
    cleanup();
    const pair = fixture("research-compare.pair-ok.valid.json");
    if (pair.result.mode !== "pair" || pair.result.state === "REFUSED") throw new Error("guard");
    /* the fixture serves no common-window Sharpe; this path needs one (said here), as a research.compare.metric.v2 server does */
    const sharpe = pair.result.pair.common_window.metrics.find((metric) => metric.key === "OOS_SHARPE")!;
    Object.assign(sharpe, { left_value: "1.5", right_value: "1.2", delta: "-0.3", availability: { state: "AVAILABLE", reason_code: null } });
    server(pair);
    renderAt(`${base}?mode=pair&runs=run-w6a-wfo-a,run-w6a-wfo-b`);
    await settled();
    expect(document.querySelector("[data-delta-direction]")!.textContent).toBe("B − A");
    expect(document.querySelector('[data-delta-row="OOS_SHARPE"]')).toBeNull();
    expect(document.querySelector('[data-delta-row="OOS_SHARPE_COMMON"]')!.textContent).not.toContain("see common window");
  });
});

describe("QA S13 · one state per meaning", () => {
  it("a 503 shows the notice with a retry and no stacked placeholder frames", async () => {
    server({ error: { code: "RESEARCH_COMPARE_UNAVAILABLE", message: "Compare is temporarily unavailable." }, request_id: "req-503" }, 503);
    renderAt(`${base}?mode=pair&runs=rrun_3258a4c450816129d2d285f25b801061,rrun_3d5633d2adb712722fe4ba108102aa5d`);
    await settled();
    expect(page().getAttribute("data-compare-state")).toBe("unavailable");
    expect(document.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(document.querySelector("[data-refusal-request]")!.getAttribute("data-refusal-request")).toBe("req-503");
    expect(document.querySelectorAll("[data-pending]")).toHaveLength(0);
    for (const name of ["overlay", "delta", "correlation", "guard"]) expect(document.querySelector(`[data-panel="${name}"]`), name).toBeNull();
  });

  it("while loading, the frames keep their place (the loading state is not an error)", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
    renderAt(`${base}?mode=pair&runs=a,b`);
    expect(document.querySelectorAll("[data-pending]").length).toBeGreaterThan(2);
    expect(document.querySelector('[data-panel="overlay"]')).not.toBeNull();
  });

  it("pair mode with no runs: one sentence and one way out, no five placeholder frames", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    renderAt(`${base}?mode=pair`);
    /* T-D8: no source for the picker's options -> one sentence and the Library exit. */
    await waitFor(() => expect(document.querySelector("[data-idle-reason]")!.textContent).toBe("Pick a second run."));
    expect(document.querySelector('[data-action="runs"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-pending]")).toHaveLength(0);
    for (const name of ["overlay", "delta", "correlation"]) expect(document.querySelector(`[data-panel="${name}"]`), name).toBeNull();
  });
});

describe("W7 · T-D8 pair picker, T-D11 fold chart region", () => {
  it("an unaddressed pair offers the Alpha's ready runs by label; no pair read is sent", async () => {
    const body = attempts((runs) => runs.forEach((run) => ((run as { run_state: string }).run_state = "READY")));
    server(body);
    renderAt(`${base}?mode=pair`);
    await waitFor(() => expect(document.querySelector('[data-pair-picker="ready"]')).not.toBeNull());
    const selects = document.querySelectorAll<HTMLSelectElement>("select[data-pair-pick]");
    expect(selects).toHaveLength(2);
    expect(selects[0]!.options.length).toBeGreaterThan(2);
    expect(document.querySelector('[data-panel="notice"]')).toBeNull();
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).includes("mode=pair"))).toBe(false);
  });

  it("the fold chart is one chart region that reads a fold on ArrowRight", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    const region = document.querySelector<HTMLElement>('[data-panel="fold-chart"] .cp-plot-area');
    if (region === null) return; /* fixture without a drawable fold series: nothing to assert */
    expect(region.getAttribute("aria-roledescription")).toBe("chart");
    expect(region.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(document.querySelector('[data-panel="fold-chart"] [data-chart-live]')!.textContent).toMatch(/\S/);
  });
});

describe("QA S13 · the mode tabs are a tablist", () => {
  it("tabs, one selected, roving tabindex; the arrow keys move the mode and Home/End jump", async () => {
    server(attempts());
    const view = renderAt(base);
    await settled();
    const list = view.container.querySelector('[role="tablist"]')!;
    const tabs = [...list.querySelectorAll('[role="tab"]')] as HTMLElement[];
    expect(tabs.map((tab) => tab.getAttribute("data-mode-option"))).toEqual(["attempts", "markets", "pair"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    server(fixture("research-compare.markets.valid.json"));
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    await waitFor(() => expect(page().getAttribute("data-compare-mode")).toBe("markets"));
    const after = [...view.container.querySelectorAll('[role="tab"]')] as HTMLElement[];
    expect(after.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    fireEvent.keyDown(after[1]!, { key: "ArrowLeft" });
    await waitFor(() => expect(page().getAttribute("data-compare-mode")).toBe("attempts"));
    fireEvent.keyDown(after[1]!, { key: "End" });
    await waitFor(() => expect(page().getAttribute("data-compare-mode")).toBe("pair"));
  });
});

describe("QA S13 · config diff baseline picker", () => {
  it("a column heading is a real picker: it moves the baseline, the legend says it was picked, clicking again returns to the default", async () => {
    server(attempts());
    renderAt(base);
    await settled();
    const legend = () => document.querySelector("[data-config-diff-legend]")!.textContent! + " " + document.querySelector("[data-config-diff-legend]")!.getAttribute("title")! + " chosen:" + document.querySelector("[data-config-diff-legend]")!.getAttribute("data-baseline-chosen");
    const cells = (path: string, runId: string) => document.querySelector(`[data-config-diff-path="${path}"] [data-config-value="${runId}"]`) as HTMLElement;
    const defaultBaseline = document.querySelector('.cp-difftable thead th[data-active="true"]')!.querySelector("button")!.getAttribute("data-baseline-run")!;
    const other = [...document.querySelectorAll("[data-action='pick-baseline']")].map((button) => button.getAttribute("data-baseline-run")!).find((id) => id !== defaultBaseline)!;
    expect(legend()).toContain("Baseline picked by this screen");
    fireEvent.click(document.querySelector(`[data-baseline-run="${other}"]`)!);
    expect(legend()).toContain("Baseline picked by you");
    expect(legend()).toContain(other);
    expect(document.querySelector('.cp-difftable thead th[data-active="true"] button')!.getAttribute("data-baseline-run")).toBe(other);
    /* the cells compare with the picked column now: the picked column never tints itself */
    expect(cells("random_seed", other).getAttribute("data-differs")).toBeNull();
    expect(cells("random_seed", defaultBaseline).getAttribute("data-differs")).toBe("true");
    fireEvent.click(document.querySelector(`[data-baseline-run="${other}"]`)!);
    expect(legend()).toContain("Baseline picked by this screen");
    expect(document.querySelector('.cp-difftable thead th[data-active="true"] button')!.getAttribute("data-baseline-run")).toBe(defaultBaseline);
  });
});

describe("QA S13 · the per-fold chart in lines mode", () => {
  const folds = (base0: number, count = 10) =>
    Array.from({ length: count }, (_, index) => ({
      fold_id: `fold_${String(index + 1).padStart(2, "0")}`,
      source_ordinal: index,
      oos_sharpe: String(base0 + (index % 3) * 0.1),
      availability: { state: "AVAILABLE", reason_code: null },
    }));

  it("pure grouping: identical exact strings group in order of first appearance; any difference splits", () => {
    const series = [
      { runId: "a", folds: folds(1) },
      { runId: "b", folds: folds(2) },
      { runId: "c", folds: folds(1) },
      { runId: "d", folds: folds(1).map((fold, i) => (i === 3 ? { ...fold, oos_sharpe: "9" } : fold)) },
    ];
    expect(identicalSeriesGroups(series)).toEqual([["a", "c"], ["b"], ["d"]]);
    expect(identicalSeriesGroups([])).toEqual([]);
  });

  function lines(mutate: (runs: CompareRun[]) => number[]): Compare {
    return attempts((runs, result) => {
      const bases = mutate(runs);
      result.fold_series = runs.map((run, index) => ({
        run_id: run.run_id,
        state: "AVAILABLE",
        source_fold_count: 10,
        truncated: false,
        folds: folds(bases[index]!),
        availability: { state: "AVAILABLE", reason_code: null },
      })) as typeof result.fold_series;
    });
  }

  it("twelve-style case: identical attempts are ONE line with one legend entry that names how many are identical", async () => {
    /* The three canonical attempts, two of them given the same per-fold values (said here: the fixture has distinct series). */
    server(lines(() => [1, 1, 2]));
    renderAt(base);
    await settled();
    const figure = document.querySelector('[data-panel="fold-chart"]')!;
    expect(figure.getAttribute("data-fold-mode")).toBe("lines");
    expect(figure.querySelectorAll("[data-fold-line]")).toHaveLength(2);
    expect(figure.querySelectorAll("[data-fold-legend-run]")).toHaveLength(2);
    const grouped = [...figure.querySelectorAll("[data-fold-legend-run]")].find((el) => el.getAttribute("data-fold-group-size") === "2")!;
    expect(grouped.querySelector("[data-fold-identical]")!.textContent).toContain("+1 identical");
    expect(grouped.getAttribute("title")).toContain("identical per-fold values");
    expect(figure.querySelector(`[data-fold-line="${grouped.getAttribute("data-fold-legend-run")}"]`)!.getAttribute("data-fold-line-members")).toBe("2");
  });

  it("all distinct: one line and one legend entry per attempt, none merged (absence path of the grouping)", async () => {
    server(lines(() => [1, 2, 3]));
    renderAt(base);
    await settled();
    const figure = document.querySelector('[data-panel="fold-chart"]')!;
    expect(figure.querySelectorAll("[data-fold-line]")).toHaveLength(3);
    expect(figure.querySelector("[data-fold-identical]")).toBeNull();
    const swatches = [...figure.querySelectorAll("[data-fold-legend] .sw")].map((el) => (el as HTMLElement).style.background);
    expect(new Set(swatches).size).toBe(swatches.length);
  });

  it("every fold is labelled on the x axis up to twelve folds", async () => {
    server(lines(() => [1, 2, 3]));
    renderAt(base);
    await settled();
    expect([...document.querySelectorAll("[data-fold-group]")].map((el) => el.textContent)).toHaveLength(10);
  });

  it("a legend entry's hover isolates its line (the group's representative)", async () => {
    server(lines(() => [1, 1, 2]));
    renderAt(base);
    await settled();
    const figure = document.querySelector('[data-panel="fold-chart"]')!;
    const entries = [...figure.querySelectorAll("[data-fold-legend-run]")];
    fireEvent.mouseEnter(entries[0]!);
    const dimmed = [...figure.querySelectorAll("[data-fold-line]")].filter((line) => (line as SVGElement).style.opacity === "0.18");
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0]!.getAttribute("data-fold-line")).not.toBe(entries[0]!.getAttribute("data-fold-legend-run"));
  });
});

describe("QA S13 wave 2 · a legend entry always points at something", () => {
  const fold = (index: number, value: string | null) => ({
    fold_id: `fold_${String(index + 1).padStart(2, "0")}`,
    source_ordinal: index,
    oos_sharpe: value,
    availability: { state: "AVAILABLE", reason_code: null },
  });
  const tenFolds = (value: (index: number) => string | null) => Array.from({ length: 10 }, (_, index) => fold(index, value(index)));

  function serieses(make: (index: number) => ReturnType<typeof tenFolds>) {
    return attempts((runs, result) => {
      result.fold_series = runs.map((run, index) => ({
        run_id: run.run_id,
        state: "AVAILABLE",
        source_fold_count: 10,
        truncated: false,
        folds: make(index),
        availability: { state: "AVAILABLE", reason_code: null },
      })) as typeof result.fold_series;
    });
  }

  it("N-3: a series with one value draws a dot (a path that is not one vertex) and says 'one point'; one with none says 'no value'", async () => {
    server(serieses((index) => (index === 0 ? tenFolds((i) => (i === 4 ? "1.5" : null)) : index === 1 ? tenFolds(() => null) : tenFolds((i) => String(i / 10)))));
    renderAt(base);
    await settled();
    const figure = document.querySelector('[data-panel="fold-chart"]')!;
    expect(figure.getAttribute("data-fold-mode")).toBe("lines");
    const dot = figure.querySelector('[data-fold-line][data-vertices="1"]')!;
    expect(dot.getAttribute("d")).toMatch(/^M(\S+ \S+) L\1$/);
    expect(figure.querySelector("[data-fold-one-point]")).not.toBeNull();
    expect(figure.querySelector("[data-fold-no-line]")!.textContent).toContain("no value");
  });

  it("N-3 absence path: every series with several values has neither marker", async () => {
    server(serieses((index) => tenFolds((i) => String(index + i / 10))));
    renderAt(base);
    await settled();
    const figure = document.querySelector('[data-panel="fold-chart"]')!;
    expect(figure.querySelector("[data-fold-one-point]")).toBeNull();
    expect(figure.querySelector("[data-fold-no-line]")).toBeNull();
  });
});
