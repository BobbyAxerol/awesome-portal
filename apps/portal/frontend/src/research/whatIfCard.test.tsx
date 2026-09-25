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

import { WhatIfCard, signedDecimal } from "./WhatIfCard";
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
  it("T07/P16-T06: the ΔJ₁ preview is the cell's exact string; θ* starts at 0", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-delta-j]")?.textContent).toBe("ΔJ₁ 0");
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: "6" } });
    expect(container.querySelector("[data-preview]")?.getAttribute("data-cell")).toBe("x6y4");
    expect(container.querySelector("[data-delta-j]")?.textContent).toBe("ΔJ₁ −0.6564691879264798");
    expect(container.querySelector("[data-cell-source='PARENT_TRIAL']")).not.toBeNull();
  });

  it("P16-T12: a missing node prints a word, never 0 or an interpolated number", () => {
    const { container } = renderCard();
    const [, sl] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(sl!, { target: { value: "5" } });
    const preview = container.querySelector("[data-preview]");
    expect(preview?.getAttribute("data-preview")).toBe("MISSING");
    expect(preview?.textContent).toContain("not evaluated");
    expect(preview?.textContent).not.toMatch(/ΔJ₁\s*[−+-]?\d/);
  });

  it("T08: a clamped node says ≈ and names the evaluation it shares", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: "0" } });
    expect(container.querySelector("[data-slider-value='rvol']")?.textContent).toContain("≈ 1");
    expect(container.querySelector("[data-cell-clamped]")?.textContent).toContain("same evaluation as x2y4");
  });

  it("T14: each slider announces its value and ΔJ; the preview is a live status", () => {
    const { container } = renderCard();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    expect(rvol?.getAttribute("aria-valuetext")).toBe("1.2 (ΔJ 0)");
    fireEvent.change(rvol!, { target: { value: "6" } });
    expect(container.querySelectorAll<HTMLInputElement>("input[type='range']")[0]?.getAttribute("aria-valuetext"))
      .toBe("1.4 (ΔJ −0.6564691879264798)");
    expect(container.querySelector("[data-preview]")?.getAttribute("role")).toBe("status");
  });

  it("T07/T16: 'preview only' flashes once per move, not on mount (reduced motion turns data-motion off in CSS)", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-preview-badge]")?.getAttribute("data-motion")).toBeNull();
    const [rvol] = container.querySelectorAll<HTMLInputElement>("input[type='range']");
    fireEvent.change(rvol!, { target: { value: "5" } });
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
      fireEvent.change(input, { target: { value: "7" } });
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
    fireEvent.change(rvol!, { target: { value: "6" } });
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
    expect(container.querySelector("[data-what-if-reason]")?.textContent).toContain("no evaluated neighbourhood exists");
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
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
