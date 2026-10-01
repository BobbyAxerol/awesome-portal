/**
 * A10c — Screen 07 what-if sandbox (spec 07 §2.5, §4, §6 T07–T09/T14/T16).
 *
 *  - Sliders move over the server's nine nodes; ΔJ is the cell's own exact
 *    string (P16-T06), a missing cell is a word and never 0 (P16-T12).
 *  - Mount and slider moves send nothing; only "evaluate grid" POSTs, once,
 *    with the CSRF proof and the grid key the reader saw (P16-T13).
 *  - "create sibling attempt →" opens Screen 02 with `?from=&fork=` (P16-T08).
 *  - A fixed or dark lane keeps the card with every control disabled (A11).
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WhatIfCard, enumWords, shownDecimal, shownSignedDecimal, signedDecimal } from "./WhatIfCard";
import type { WhatIf, WhatIfCell } from "./freezeClient";
import { useFreeze } from "./useFreeze";

vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_whatif",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RVOL = ["1", "1", "1", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6"];
const SL = ["1.9", "2", "2.1", "2.2", "2.3", "2.4", "2.5", "2.5", "2.5"];

function cell(x: number, y: number, overrides: Partial<WhatIfCell> = {}): WhatIfCell {
  return {
    cell_id: `x${x}y${y}`,
    x_index: x,
    y_index: y,
    parameters: { rvol: RVOL[x]!, slpercent: SL[y]! },
    evaluation_key: `${x}${y}`.padEnd(64, "0"),
    canonical_cell_id: `x${Math.max(x, 2)}y${Math.min(y, 6)}`,
    clamped: x < 2 || y > 6,
    is_base: x === 4 && y === 4,
    state: "MISSING",
    objective: null,
    delta_j: null,
    source: null,
    source_ref: null,
    ...overrides,
  };
}

function whatIf(overrides: Partial<WhatIf> = {}, cells: (c: WhatIfCell) => WhatIfCell = (c) => c): WhatIf {
  const all: WhatIfCell[] = [];
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) all.push(cells(cell(x, y)));
  return {
    schema_version: "research.freeze-what-if.v1",
    state: "AVAILABLE",
    reason_code: null,
    definition: {
      profile_id: "p16.delta-whatif-grid.v1",
      profile_digest: "3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc",
      objective_kind: "MODE_1_DECAY_J",
      objective_scope: "GLOBAL_STUDY_IS_FOLDS",
      random_seed: 42,
      engine_release_id: "er_quantbt_111",
      dataset_binding_digest: "e".repeat(64),
      preview_only: true,
      interpolation: "NONE_SNAP_TO_NODE",
    },
    sliders: [
      { parameter: "rvol", hifi_name: "entry_z", minimum: "1", maximum: "2.5", step: "0.1", base: "1.2", radius_steps: 4, values: RVOL, clamped: RVOL.map((_, i) => i < 2) },
      { parameter: "slpercent", hifi_name: "atr_mult", minimum: "0.7", maximum: "2.5", step: "0.1", base: "2.3", radius_steps: 4, values: SL, clamped: SL.map((_, i) => i > 6) },
    ],
    grid: { size: 9, grid_key: "9".repeat(64), base_objective: "-1.4435308120735202", base_source: "PARENT_TRIAL", unique_evaluations: 49, cells: all },
    coverage: { evaluated_cells: 2, total_cells: 81, evaluated_unique: 2, unique_evaluations: 49, label: "2 / 81" },
    job: null,
    actions: {
      evaluate_grid: { state: "AVAILABLE", may_submit: true, reason_code: null, missing_evaluations: 47 },
      sibling_draft: { state: "AVAILABLE", may_create: true, reason_code: null, href_template: "/research/quantbt/runs/new?from=rrun_parent&fork={cell_id}" },
    },
    ...overrides,
  } as WhatIf;
}

const EVALUATED = (c: WhatIfCell) =>
  c.cell_id === "x4y4"
    ? { ...c, state: "EVALUATED" as const, objective: "-1.4435308120735202", delta_j: "0", source: "PARENT_TRIAL" as const, source_ref: "trial:0" }
    : c.cell_id === "x6y4"
      ? { ...c, state: "EVALUATED" as const, objective: "-2.1", delta_j: "-0.6564691879264798", source: "PARENT_TRIAL" as const, source_ref: "trial:2" }
      : c;

function Where() {
  const location = useLocation();
  return <span data-location>{location.pathname + location.search}</span>;
}

function renderCard(props: Partial<Parameters<typeof WhatIfCard>[0]> = {}) {
  const onEvaluate = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={["/research/quantbt/runs/rrun_parent/freeze"]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/freeze" element={<WhatIfCard whatIf={whatIf({}, EVALUATED)} onEvaluate={onEvaluate} {...props} />} />
        <Route path="/research/quantbt/runs/new" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, onEvaluate };
}

describe("A10c WhatIfCard — the preview reads the server's node, never a formula", () => {
  it("T07/P16-T06: the ΔJ₁ preview is the cell's own value, shown to 6 digits with the exact string in title; θ* starts at 0", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-delta-j]")?.textContent).toBe("ΔJ₁ 0");
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: RVOL[6]! } });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x6y4");
    expect(container.querySelector("[data-delta-j]")?.textContent).toBe("ΔJ₁ −0.656469");
    expect(container.querySelector("[data-delta-j]")?.getAttribute("title")).toBe("ΔJ₁ −0.6564691879264798 (exact)");
    expect(container.querySelector("[data-delta-j]")?.getAttribute("data-delta-j")).toBe("-0.6564691879264798");
    expect(container.querySelector("[data-cell-source='PARENT_TRIAL']")).not.toBeNull();
  });

  it("P16-T12: a missing node prints a word, never 0 or an interpolated number", () => {
    const { container } = renderCard();
    const [, sl] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(sl!, { target: { value: SL[5]! } });
    const preview = container.querySelector("[data-preview]");
    expect(preview?.getAttribute("data-preview")).toBe("MISSING");
    expect(preview?.textContent).toContain("not evaluated");
    expect(preview?.textContent).not.toMatch(/ΔJ₁\s*[−+-]?\d/);
  });

  it("T08: a clamped node says ≈ and names the evaluation it shares", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.keyDown(rvol!, { key: "Home" });
    expect(container.querySelector("[data-slider-value='rvol']")?.textContent).toContain("≈ 1");
    expect(container.querySelector("[data-cell-clamped]")?.textContent).toContain("same evaluation as x2y4");
  });

  it("T14: each slider announces its value and ΔJ; the preview is a live status", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    expect(rvol?.getAttribute("aria-valuetext")).toBe("1.2 (ΔJ 0)");
    fireEvent.change(rvol!, { target: { value: RVOL[6]! } });
    expect(container.querySelectorAll<HTMLInputElement>("input[type='range']")[0]?.getAttribute("aria-valuetext"))
      .toBe("1.4 (ΔJ −0.656469)");
    expect(container.querySelector("[data-preview]")?.getAttribute("role")).toBe("status");
  });

  it("T07/T16: 'preview only' flashes once per move, not on mount (reduced motion turns data-motion off in CSS)", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-preview-badge]")?.getAttribute("data-motion")).toBeNull();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: RVOL[5]! } });
    expect(container.querySelector("[data-preview-badge]")?.getAttribute("data-motion")).toBe("blink-once");
  });

  it("coverage is 'k / 81', from the server", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-coverage]")?.textContent).toBe("2 / 81 cells evaluated");
    expect(container.querySelectorAll("[data-heat-cell]")).toHaveLength(81);
    expect(container.querySelectorAll("[data-heat-state='EVALUATED']")).toHaveLength(2);
  });
});

describe("A10c WhatIfCard — actions", () => {
  it("P16-T13: 'evaluate grid' hands the grid key to the one explicit action; sliders never do", () => {
    const { container, onEvaluate } = renderCard();
    for (const input of container.querySelectorAll<HTMLInputElement>("input[type='range']")) {
      fireEvent.change(input, { target: { value: input.max } });
    }
    expect(onEvaluate).not.toHaveBeenCalled();
    const button = container.querySelector<HTMLButtonElement>("[data-action='evaluate-grid']");
    expect(button?.textContent).toBe("evaluate grid · 47 missing");
    fireEvent.click(button!);
    expect(onEvaluate).toHaveBeenCalledTimes(1);
    expect(onEvaluate).toHaveBeenCalledWith("9".repeat(64));
  });

  it("T09/P16-T08: 'create sibling attempt →' is off at θ* and opens Screen 02 with the fork after a move", () => {
    const { container } = renderCard();
    const sibling = () => container.querySelector<HTMLButtonElement>("[data-action='create-sibling']");
    expect(sibling()?.disabled).toBe(true);
    expect(sibling()?.getAttribute("title")).toContain("move a slider first");
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: RVOL[6]! } });
    fireEvent.click(sibling()!);
    expect(container.querySelector("[data-location]")?.textContent).toBe("/research/quantbt/runs/new?from=rrun_parent&fork=x6y4");
  });

  it("BLOCKED: the fork and the job are refused with the server's reason ('resolve the chain first')", () => {
    const blocked = whatIf({
      actions: {
        evaluate_grid: { state: "BLOCKED", may_submit: false, reason_code: "P16_WHATIF_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED", missing_evaluations: 47 },
        sibling_draft: { state: "BLOCKED", may_create: false, reason_code: "P16_SIBLING_DRAFT_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED", href_template: null },
      },
    }, EVALUATED);
    const { container } = renderCard({ whatIf: blocked });
    expect(container.querySelector<HTMLButtonElement>("[data-action='evaluate-grid']")?.disabled).toBe(true);
    expect(container.querySelector("[data-evaluate-reason]")?.textContent).toContain("resolve the chain first");
    expect(container.querySelector<HTMLButtonElement>("[data-action='create-sibling']")?.disabled).toBe(true);
  });

  it("an in-flight job shows its run, state and progress link; QUEUED cells are marked", () => {
    const running = whatIf({
      job: { run_id: "rrun_diag", state: "RUNNING", evaluations: 47, grid_key: "9".repeat(64), requested_at_utc_ms: 1_790_000_000_000, sealed: false, progress_href: "/research/quantbt/runs/rrun_diag/progress" },
      actions: {
        evaluate_grid: { state: "IN_FLIGHT", may_submit: false, reason_code: "P16_WHATIF_DIAGNOSTIC_JOB_IN_FLIGHT", missing_evaluations: 47 },
        sibling_draft: { state: "AVAILABLE", may_create: true, reason_code: null, href_template: "/research/quantbt/runs/new?from=rrun_parent&fork={cell_id}" },
      },
    }, (c) => (EVALUATED(c).state === "EVALUATED" ? EVALUATED(c) : { ...c, state: "QUEUED" }));
    const { container } = renderCard({ whatIf: running });
    expect(container.querySelector("[data-whatif-job='RUNNING']")?.textContent).toContain("rrun_diag");
    expect(container.querySelector("[data-action='open-job-progress']")?.getAttribute("href")).toBe("/research/quantbt/runs/rrun_diag/progress");
    expect(container.querySelectorAll("[data-heat-state='QUEUED']")).toHaveLength(79);
  });

  it("A11: a fixed run keeps the card, every control disabled, with the server's reason", () => {
    const { container } = renderCard({ whatIf: null, inert: { state: "NOT_APPLICABLE", reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID" } });
    const ranges = [...container.querySelectorAll<HTMLInputElement>("input[type='range']")];
    expect(ranges).toHaveLength(2);
    expect(ranges.every((range) => range.disabled)).toBe(true);
    expect(container.querySelector("[data-what-if-reason]")?.textContent).toContain("no evaluated neighbourhood");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
  });

  it("VD-TEXT-01: the fork rule is a short caption with the full sentence in its title", () => {
    const { container } = renderCard({ whatIf: null, inert: { state: "NOT_APPLICABLE", reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID" } });
    const rule = container.querySelector("[data-what-if-rule]");
    expect(rule?.textContent).toBe("commit → sibling attempt");
    expect(rule?.getAttribute("title")).toContain("never writes onto frozen params");
    expect(container.textContent).not.toContain("lineage-linked");
  });

  it("signed ΔJ keeps the exact digits", () => {
    expect(signedDecimal("0.041")).toBe("+0.041");
    expect(signedDecimal("-0.087")).toBe("−0.087");
    expect(signedDecimal("0")).toBe("0");
  });
});

describe("A10c useFreeze.runEvaluate — one POST, from one click", () => {
  it("posts the grid key with the CSRF proof, once, then re-asks the lane", async () => {
    const requests: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
    const hubDelegating = {
      schema_version: "research.freeze-detail.v1", read_authority: "PORTAL_PERSISTED_RESEARCH", run_id: "rrun_parent",
      revision: null, etag: null, availability: { state: "NOT_APPLICABLE", reason_code: "P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE" },
    };
    const lane = {
      schema_version: "research.current-source-freeze.v1", read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
      availability: { state: "AVAILABLE", reason_code: null }, etag: "\"rs02_freeze_a\"", what_if: whatIf({}, EVALUATED),
      frozen_selection: { selected_trial_id: "0", objective: "-1.44", parameters: { window: "34" }, availability: { state: "AVAILABLE", reason_code: null } },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => { headers[key] = value; });
      requests.push({ url, method, headers, body: init?.body as string | undefined });
      const payload = url.includes("/what-if/evaluate")
        ? { schema_version: "research.whatif-evaluate-result.v1", run_id: "rrun_parent", outcome: "ADMITTED", grid_key: "9".repeat(64), job: null }
        : url.includes("/current-source/freeze") ? lane : hubDelegating;
      return { ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => payload } as unknown as Response;
    }));
    const { result } = renderHook(() => useFreeze("rrun_parent", null));
    await waitFor(() => expect(result.current.retained.state).toBe("ready"));
    expect(requests.filter((entry) => entry.method === "POST")).toHaveLength(0);
    await act(async () => {
      result.current.runEvaluate("9".repeat(64));
      result.current.runEvaluate("9".repeat(64)); // a double click in one burst is one POST
    });
    await waitFor(() => expect(result.current.evaluate.state).toBe("done"));
    const posts = requests.filter((entry) => entry.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe("/api/v1/quantbt/runs/rrun_parent/current-source/freeze/what-if/evaluate");
    expect(posts[0]!.headers["x-portal-csrf"]).toBe("tok_whatif");
    expect(JSON.parse(posts[0]!.body!)).toEqual({ schema_version: "research.whatif-evaluate.v1", grid_key: "9".repeat(64) });
    // The lane is asked again after the typed answer, with its ETag.
    await waitFor(() => expect(requests.filter((entry) => entry.url.includes("/current-source/freeze") && entry.method === "GET").length).toBeGreaterThanOrEqual(2));
    const reread = requests.filter((entry) => entry.url.includes("/current-source/freeze") && entry.method === "GET").at(-1);
    expect(reread?.headers["if-none-match"]).toBe("\"rs02_freeze_a\"");
  });
});

/* -------------------------------------------------------------------------
 * F1 (2026-10-01) · D7 walk — the card prints no raw float, no invented
 * parameter name, and its slider track is the labelled range.
 * ---------------------------------------------------------------------- */

describe("F1 · D7 — what-if honesty", () => {
  it("J₁ and base are shown to 6 digits, the exact decimals ride in the title, no 16-digit float on the face", () => {
    const { container } = renderCard();
    const line = container.querySelector("[data-objective]") as HTMLElement;
    expect(line.textContent).toBe("J₁ −1.44353 · base −1.44353");
    expect(line.getAttribute("title")).toBe("J₁ -1.4435308120735202 · base -1.4435308120735202 (exact)");
    expect(container.querySelector("[data-preview]")?.textContent).not.toMatch(/\d\.\d{7,}/);
    expect(container.querySelector("[data-heatmap]")?.textContent).not.toMatch(/\d\.\d{7,}/);
    const heat = container.querySelector("[data-heat-cell='x6y4']") as HTMLElement;
    expect(heat.getAttribute("title")).toContain("ΔJ −0.656469");
    expect(heat.getAttribute("title")).not.toContain("0.6564691879264798");
  });

  it("sliders are named by the served parameter alone — no HiFi placeholder anywhere", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-slider='rvol']")?.textContent).toContain("rvol");
    expect(container.querySelector("[data-slider='slpercent']")?.textContent).toContain("slpercent");
    expect(container.textContent).not.toMatch(/entry_z|atr_mult/);
    for (const input of container.querySelectorAll("input[type='range']")) {
      expect(input.getAttribute("aria-label")).not.toMatch(/entry_z|atr_mult/);
    }
    expect(container.querySelector("[data-heatmap]")?.textContent).toContain("9 × 9 · slpercent ↑ · rvol →");
  });

  it("a card with no served slider names no parameter at all (inert and a served-but-unavailable body)", () => {
    const inert = renderCard({ whatIf: null, inert: { state: "NOT_APPLICABLE", reason_code: "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID" } });
    expect(inert.container.textContent).not.toMatch(/rvol|slpercent|entry_z|atr_mult/);
    expect(inert.container.querySelectorAll("input[type='range']")).toHaveLength(2);
    inert.unmount();
    const dark = renderCard({ whatIf: whatIf({ state: "NOT_ENABLED", reason_code: "P16_WHATIF_NOT_ENABLED", sliders: [], grid: null, coverage: null }) });
    expect(dark.container.textContent).not.toMatch(/rvol|slpercent|entry_z|atr_mult/);
    expect(dark.container.querySelectorAll<HTMLInputElement>("input[type='range']")).toHaveLength(2);
  });

  it("the track IS the labelled range: min/max are the end labels and the thumb sits at the node's value", () => {
    const { container } = renderCard();
    const [rvol, sl] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    expect(rvol!.getAttribute("data-slider-track")).toBe("value");
    expect(rvol!.min).toBe(RVOL[0]);
    expect(rvol!.max).toBe(RVOL[8]);
    expect(Number(rvol!.value)).toBe(Number(RVOL[4]));
    expect(sl!.min).toBe(SL[0]);
    expect(sl!.max).toBe(SL[8]);
    const ends = container.querySelector("[data-slider='rvol'] .justify-between:last-child")!.textContent!;
    expect(ends.startsWith(RVOL[0]!)).toBe(true);
    expect(ends.endsWith(RVOL[8]!)).toBe(true);
    /* θ* = 1.2 on a 1 → 1.6 track is a third of the way, not the middle. */
    const share = (Number(rvol!.value) - Number(rvol!.min)) / (Number(rvol!.max) - Number(rvol!.min));
    expect(share).toBeCloseTo(1 / 3, 5);
  });

  it("a drag snaps to the nearest served node; clamped duplicates resolve to the one nearest the thumb", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: "1.33" } });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x5y4");
    fireEvent.change(rvol!, { target: { value: "1.0" } });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x2y4");
  });

  it("arrow keys walk the nodes, Home/End jump to the ends, and nothing leaves 0..8", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.keyDown(rvol!, { key: "ArrowRight" });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x5y4");
    fireEvent.keyDown(rvol!, { key: "ArrowLeft" });
    fireEvent.keyDown(rvol!, { key: "ArrowLeft" });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x3y4");
    fireEvent.keyDown(rvol!, { key: "End" });
    fireEvent.keyDown(rvol!, { key: "ArrowRight" });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x8y4");
    fireEvent.keyDown(rvol!, { key: "Home" });
    fireEvent.keyDown(rvol!, { key: "ArrowLeft" });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x0y4");
  });

  it("an unusable node set falls back to the node-index track instead of drawing a wrong one", () => {
    const base = whatIf({}, EVALUATED);
    const broken = { ...base, sliders: [{ ...base.sliders[0]!, values: base.sliders[0]!.values.map(() => "1") }, base.sliders[1]!] } as WhatIf;
    const { container } = renderCard({ whatIf: broken });
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    expect(rvol!.getAttribute("data-slider-track")).toBe("node");
    expect(rvol!.max).toBe("8");
  });

  it("the objective scope reads as words without turning 'IS' into a verb; the raw code is the title", () => {
    const { container } = renderCard();
    const definition = container.querySelector("[data-what-if-definition]") as HTMLElement;
    expect(definition.textContent).toContain("mode 1 decay J · global study · IS folds");
    expect(definition.textContent).not.toMatch(/over the|is folds/);
    expect(definition.querySelector("[data-objective-scope]")?.getAttribute("title")).toBe("GLOBAL_STUDY_IS_FOLDS");
    expect(definition.querySelector("[data-objective-kind]")?.getAttribute("title")).toBe("MODE_1_DECAY_J");
  });

  it("shownDecimal / enumWords: no zero for a non-number, abbreviations stay capitals", () => {
    expect(shownDecimal("-1.4435308120735202")).toBe("−1.44353");
    expect(shownDecimal("0")).toBe("0");
    expect(shownDecimal("not-a-number")).toBe("not-a-number");
    expect(shownSignedDecimal("0.041")).toBe("+0.041");
    expect(shownSignedDecimal("-0.087")).toBe("−0.087");
    expect(shownSignedDecimal("0")).toBe("0");
    expect(enumWords("GLOBAL_STUDY_IS_FOLDS")).toBe("global study · IS folds");
    expect(enumWords("PER_FOLD_OOS_SCORE")).toBe("per fold OOS score");
  });
});

/* F3 · FG 07-04 / 07-05 */
describe("F3 · what-if evaluate answer", () => {
  const result = (outcome: "ADMITTED" | "REPLAYED" | "NOTHING_TO_EVALUATE") =>
    ({
      schema_version: "research.whatif-evaluate-result.v1",
      run_id: "rrun_parent",
      outcome,
      grid_key: "9".repeat(64),
      job:
        outcome === "NOTHING_TO_EVALUATE"
          ? null
          : { run_id: "rrun_job", state: "QUEUED", evaluations: 47, grid_key: "9".repeat(64), requested_at_utc_ms: 1, sealed: false, progress_href: "/x" },
    }) as never;

  it("after a 202 ADMITTED one outcome line says what started", () => {
    const { container } = renderCard({ evaluate: { state: "done", result: result("ADMITTED") } });
    expect(container.querySelector("[data-evaluate-outcome='ADMITTED']")?.textContent).toBe(
      "admitted — one diagnostic job started · 47 evaluations · job queued",
    );
  });

  it("REPLAYED and NOTHING_TO_EVALUATE are told apart from ADMITTED", () => {
    const replayed = renderCard({ evaluate: { state: "done", result: result("REPLAYED") } });
    expect(replayed.container.querySelector("[data-evaluate-outcome]")?.textContent).toMatch(/^replayed/);
    cleanup();
    const none = renderCard({ evaluate: { state: "done", result: result("NOTHING_TO_EVALUATE") } });
    expect(none.container.querySelector("[data-evaluate-outcome]")?.textContent).toBe("nothing to evaluate — every node exists");
  });

  it("a 409 says the grid changed and asks for a re-read; other refusals do not", () => {
    const refusal = (status: number) =>
      ({ code: "RESEARCH_WHATIF_GRID_CHANGED", message: "m", detail: null, status, requestId: null, state: "stale", mayRetry: true, terminal: false, stopsPolling: false, sessionExpired: false, notFound: false }) as never;
    const c409 = renderCard({ evaluate: { state: "refused", refusal: refusal(409) } }).container;
    expect(c409.querySelector("[data-evaluate-conflict]")?.textContent).toBe("the grid changed since you read it — re-read, then evaluate again");
    cleanup();
    expect(renderCard({ evaluate: { state: "refused", refusal: refusal(503) } }).container.querySelector("[data-evaluate-conflict]")).toBeNull();
  });
});
