/**
 * F1 honesty batch — Screen 02 New Run (group S02).
 *
 * Each block asserts that a specific lie is gone AND that the honest state
 * shows. Atlas, registry, catalog and preflight documents are canonical
 * fixtures from `packages/contracts/fixtures`. The one body with no canonical
 * fixture is the `?from=` requested-spec read: it is built here by the same
 * serializer the form submits with, then given the instants the way the server
 * stores them (`…:00Z`), which is the shape the preview returned for R-WFO-020.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { NewRun, datetimeInputValue, outsideProfileNotes } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import type { RunDraft } from "./runDraft";
import { serializeRequestedSpec } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG = fixture<unknown>("research-preflight.dataset-catalog.valid.json");
const PREFLIGHT = fixture<PreflightResponse>("research-preflight.response.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

function draft(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    optunaTrials: "400",
    randomSeed: "42",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

function advanced(walkForward: Partial<RunDraft["walkForward"]> = {}, extra: Partial<RunDraft> = {}): RunDraft {
  const base = draft({ protocol: "advanced", ...extra });
  return {
    ...base,
    walkForward: {
      ...base.walkForward,
      start: "2026-05-01T00:00:00Z",
      endExclusive: "2026-07-31T00:00:00Z",
      splitMode: "2026-06-01T00:00:00Z",
      frequency: "weekly",
      windowMode: "expanding",
      ...walkForward,
    },
  };
}

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  return render(
    <NewRun
      draft={draft()}
      patch={vi.fn()}
      limits={LIMITS}
      atlas={ATLAS}
      atlasState={OK}
      preflight={null}
      preflightState={researchState({ kind: "ok", rowCount: 0 })}
      onRunPreflight={vi.fn()}
      mayCreateRun={false}
      canSubmit={false}
      created={null}
      createState={researchState({ kind: "ok", rowCount: 0 })}
      outcomeUnknown={false}
      onSubmit={vi.fn()}
      onRecheck={vi.fn()}
      {...overrides}
    />,
  );
}

const go = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
const pill = (step: string) => document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement;

/* ---------------------------------------------------------------- FG 02-8b */

describe("FG 02-8b — the stepper does not call an unvisited step valid", () => {
  it("opens with one current step and seven that are not visited — no ✓ anywhere", () => {
    mount();
    expect(pill("context").getAttribute("data-step-state")).toBe("current");
    for (const step of ["strategy", "route", "data", "windows", "parameters", "optimization", "review"]) {
      expect(pill(step).getAttribute("data-step-state")).toBe("not-visited");
      expect(pill(step).textContent).not.toContain("✓");
    }
    expect(pill("data").textContent).toContain("not visited");
    expect(document.querySelector("[role=tablist]")?.textContent).not.toContain("✓");
  });

  it("an unvisited step that would fail is not-visited, never valid, until the reader gets there", () => {
    mount({ draft: draft({ symbol: "" }) });
    expect(pill("data").getAttribute("data-step-state")).toBe("not-visited");
    go("data");
    /* Reaching the step is what makes its problem count: it reads error at once. */
    expect(pill("data").getAttribute("data-step-state")).toBe("error");
    go("route");
    expect(pill("data").getAttribute("data-step-state")).toBe("error");
    expect(pill("data").textContent).toContain("needs attention");
  });

  it("a visited step that passes its own checks reads valid; Review never earns a ✓ it cannot see", () => {
    mount();
    go("data");
    go("route");
    expect(pill("data").getAttribute("data-step-state")).toBe("valid");
    expect(pill("data").textContent).toContain("✓");
    expect(pill("route").getAttribute("data-step-state")).toBe("current");
    go("review");
    go("data");
    /* Review's verdict is the server's preflight; the bar cannot see it. */
    expect(pill("review").textContent).not.toContain("✓");
    expect(pill("review").getAttribute("data-step-state")).toBe("visited");
  });
});

/* ------------------------------------------------------------------- D6 */

describe("D6 — the Data select shows the draft's timeframe, not its first option", () => {
  const onlyOneHour = { ...LIMITS, declaredTimeframes: ["1h"] as const };

  it("a draft on 4h against a strategy that declares only 1h: the select says 4h, marked not declared", () => {
    mount({ draft: draft({ timeframe: "4h" }), limits: onlyOneHour });
    go("data");
    const select = screen.getByLabelText("Timeframe") as HTMLSelectElement;
    expect(select.value).toBe("4h");
    const shown = select.options[select.selectedIndex]!;
    expect(shown.textContent).toBe("4h · not declared");
    expect(shown.hasAttribute("data-undeclared-timeframe")).toBe(true);
    /* The declared choice is still offered, and is not what is displayed. */
    expect([...select.options].map((option) => option.value)).toEqual(["4h", "1h"]);
    /* The cause of the error is on screen, naming the same value Review prints. */
    expect(screen.getByText(/does not declare 4h/)).toBeTruthy();
    expect(document.querySelector("[data-review-rail]")?.textContent).toContain("4h");
  });

  it("a declared timeframe adds no extra option", () => {
    mount({ draft: draft({ timeframe: "1h" }), limits: onlyOneHour });
    go("data");
    const select = screen.getByLabelText("Timeframe") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(["1h"]);
    expect(select.value).toBe("1h");
    expect(document.querySelector("[data-undeclared-timeframe]")).toBeNull();
  });

  it("an empty draft timeframe is a visible 'choose', not a silent 1h", () => {
    mount({ draft: draft({ timeframe: "" }), limits: onlyOneHour });
    go("data");
    const select = screen.getByLabelText("Timeframe") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[select.selectedIndex]!.textContent).toBe("choose a timeframe");
  });
});

/* ----------------------------------------------------------- CG-P04-05 / S02-01 */

describe("S02-01 — the cert ceiling line carries the Atlas fact, not a sentence from the form", () => {
  it("prints the served cert_cap reason beside 'not published'", () => {
    const fact = ATLAS.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!.schedules.find((entry) => entry.schedule === "global")!;
    mount({ draft: draft({ optimizationMode: "mode_1_decay", optimizationSchedule: "global" }) });
    const line = document.querySelector("[data-cert-cap]") as HTMLElement;
    expect(line.getAttribute("data-cert-cap")).toBe(fact.cert_cap.state);
    expect(line.textContent).toContain("cert ceiling");
    expect(line.querySelector("[data-cert-ceiling-absent]")?.textContent).toBe("not published");
    expect(document.querySelector("[data-cert-cap-reason]")?.textContent).toBe(fact.cert_cap.reason);
    expect(fact.cert_cap.reason.length).toBeGreaterThan(20);
    /* The old hard-coded tail is gone. */
    expect(document.querySelector("[data-claim-forecast]")?.textContent).not.toContain("global · cert ceiling not published");
  });

  it("follows the server when its reason changes", () => {
    const changed = structuredClone(ATLAS);
    const mode = changed.modes.find((candidate) => candidate.mode_id === "mode_1_decay")!;
    const schedule = mode.facts!.schedules.find((entry) => entry.schedule === "global")!;
    schedule.cert_cap = { state: "NOT_PUBLISHED", reason: "A reason the form never wrote.", source: null };
    mount({ atlas: changed, draft: draft({ optimizationMode: "mode_1_decay", optimizationSchedule: "global" }) });
    expect(document.querySelector("[data-cert-cap-reason]")?.textContent).toBe("A reason the form never wrote.");
  });
});

/* ------------------------------------------------- CG-P02-02 / CG-P08-02 */

describe("CG-P02-02 / P08-02 — v2 controls say create does not admit them yet", () => {
  const NOTE = "Preflight accepts this; create does not admit it yet.";
  const notes = () => [...document.querySelectorAll("[data-v2-create-note]")].map((node) => node.getAttribute("data-v2-create-note"));

  it("rolling width, the temporal guards and the inner folds each carry the note, with no cause claimed", () => {
    mount({
      draft: advanced({ windowMode: "rolling", trainWindow: "30D" }, { optimizationMode: "mode_1_decay", optimizationSchedule: "per_fold_causal" }),
    });
    go("windows");
    expect(notes()).toEqual(["train-window", "temporal-guards", "inner-folds"]);
    for (const node of document.querySelectorAll("[data-v2-create-note]")) expect(node.textContent).toBe(NOTE);
    /* Neutral: it names no executor, no adapter and no reason. */
    expect(document.body.textContent).not.toMatch(/no installed executor|adapter/i);
  });

  it("is absent where the controls are not offered (three-window, or no v2 control on screen)", () => {
    mount({ draft: draft() });
    go("windows");
    expect(notes()).toEqual([]);
    cleanup();
    mount({ draft: advanced() });
    go("windows");
    /* Expanding + global: only the always-offered temporal guards remain. */
    expect(notes()).toEqual(["temporal-guards"]);
  });

  it("steps aside when the preflight serves run_admission.may_create_run = true", () => {
    const admitted = { ...PREFLIGHT, run_admission: { may_create_run: true, code: null, message: null, field_path: [] } } as PreflightResponse;
    mount({ draft: advanced(), preflight: admitted });
    go("windows");
    expect(notes()).toEqual([]);
    cleanup();
    const refused = { ...PREFLIGHT, run_admission: { may_create_run: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", message: "x", field_path: [] } } as PreflightResponse;
    mount({ draft: advanced(), preflight: refused });
    go("windows");
    expect(notes()).toEqual(["temporal-guards"]);
  });
});

/* ------------------------------------------------------ 400-trial audit */

describe("400-trial audit — a copied run's instants are shown, not blanked", () => {
  it("strips only the zone for the input and keeps the draft's own text", () => {
    expect(datetimeInputValue("2026-05-01T00:00:00Z")).toEqual({ input: "2026-05-01T00:00:00", raw: null });
    expect(datetimeInputValue("2026-05-01T00:00")).toEqual({ input: "2026-05-01T00:00", raw: null });
    expect(datetimeInputValue("2026-05-01T00:00:00.250Z")).toEqual({ input: "2026-05-01T00:00:00.250", raw: null });
    expect(datetimeInputValue("")).toEqual({ input: "", raw: null });
    /* What the input cannot hold is handed back as text to print, never dropped. */
    expect(datetimeInputValue("2026-05-01T00:00:00+07:00")).toEqual({ input: "", raw: "2026-05-01T00:00:00+07:00" });
    expect(datetimeInputValue("2026-05-01")).toEqual({ input: "", raw: "2026-05-01" });
  });

  it("the three advanced inputs show the copied dates; the draft is untouched", () => {
    const patch = vi.fn();
    const copied = advanced();
    mount({ draft: copied, patch });
    go("windows");
    expect((screen.getByLabelText("Analysis start") as HTMLInputElement).value).toBe("2026-05-01T00:00");
    expect((screen.getByLabelText("Analysis end exclusive") as HTMLInputElement).value).toBe("2026-07-31T00:00");
    expect((screen.getByLabelText("First OOS instant") as HTMLInputElement).value).toBe("2026-06-01T00:00");
    expect(patch).not.toHaveBeenCalled();
    expect(document.querySelector("[data-instant-unshown]")).toBeNull();
  });

  it("an instant the input cannot show is printed beside it", () => {
    mount({ draft: advanced({ splitMode: "2026-06-01T00:00:00+07:00" }) });
    go("windows");
    expect((screen.getByLabelText("First OOS instant") as HTMLInputElement).value).toBe("");
    expect(document.querySelector("[data-instant-unshown]")?.textContent).toContain("2026-06-01T00:00:00+07:00");
  });

  it("the Review rail names the first OOS instant it used to leave out", () => {
    mount({ draft: advanced() });
    expect(document.querySelector("[data-advanced-timeline]")?.textContent).toContain("first OOS 2026-06-01T00:00:00Z");
    cleanup();
    mount({ draft: advanced({ splitMode: "" }) });
    expect(document.querySelector("[data-advanced-timeline]")?.textContent).toContain("first OOS not declared");
  });

  it("a three-window draft's typed values still show as typed", () => {
    mount({
      draft: draft({ windows: {
        is: { start: "2022-01-01T00:00", endExclusive: "2024-01-01T00:00" },
        oos: { start: "2024-01-01T00:00", endExclusive: "2025-01-01T00:00" },
        holdout: { start: "2025-01-01T00:00", endExclusive: "2026-01-01T00:00" },
      } }),
    });
    go("windows");
    expect((screen.getByLabelText("IS start") as HTMLInputElement).value).toBe("2022-01-01T00:00");
  });
});

describe("400-trial audit — a value outside the listed submission profile is kept and said so", () => {
  it("lists the trials, early stopping and seed that differ, in the Atlas's own terms", () => {
    const constraints = ATLAS.current_release.submission_constraints;
    const notes = outsideProfileNotes({ optunaTrials: "400", earlyStopping: "", randomSeed: "42" }, constraints);
    expect(notes.map((note) => note.field)).toEqual(["trials", "random_seed"]);
    expect(notes[0]!.text).toBe(`Trials 400 — the profile lists ${constraints.accepted_trial_count}. Kept as entered.`);
    /* Nothing is said about a value that agrees with the profile. */
    expect(outsideProfileNotes({ optunaTrials: "1", earlyStopping: "", randomSeed: "" }, constraints)).toEqual([]);
    expect(outsideProfileNotes({ optunaTrials: "", earlyStopping: "", randomSeed: "" }, constraints)).toEqual([]);
  });

  it("shows on the Optimization step and does not change the draft", () => {
    const patch = vi.fn();
    mount({ draft: draft({ optunaTrials: "400", randomSeed: "42" }), patch });
    go("optimization");
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).value).toBe("400");
    expect(document.querySelector('[data-outside-profile-field="trials"]')?.textContent).toContain("Trials 400");
    expect(patch).not.toHaveBeenCalled();
  });

  it("says nothing when the Atlas is unavailable (no profile to compare with)", () => {
    mount({ draft: draft({ optunaTrials: "400" }), atlas: null, atlasState: researchState({ kind: "transport", status: 503, retryable: false }) });
    go("optimization");
    expect(document.querySelector("[data-outside-profile]")).toBeNull();
  });
});

/* ------------------------------------------- the real route: ?from=<400-trial run> */

function copiedSpec() {
  const spec = serializeRequestedSpec(advanced({}, { optunaTrials: "400", randomSeed: "42" }));
  return {
    schema_version: "research.run-requested-spec.v1",
    run_id: "rrun_3258a4c450816129d2d285f25b801061",
    requested_spec: spec,
    requested_spec_digest: "sha256:" + "a".repeat(64),
    alpha_id: ALPHA.alpha_id,
    alpha_version_id: ALPHA.alpha_version_id,
    execution_profile_id: "p10.delta-signal-notional-wfo.v1",
    created_at_utc_ms: 1790000000000,
    clone: { intent_kind: "NEW", requires_fresh_preflight: true },
  };
}

function serve(options: { requestedSpec: "ok" | "refused" }) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
    if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
    if (method === "GET" && url.pathname === "/api/v1/research/datasets") return json(CATALOG);
    if (method === "GET" && url.pathname.endsWith("/requested-spec")) {
      return options.requestedSpec === "ok"
        ? json(copiedSpec())
        : json({ error: { code: "RESEARCH_RUN_NOT_FOUND", message: "not found" }, request_id: "req_1" }, 404);
    }
    if (method === "POST") return json(PREFLIGHT);
    throw new Error(`unexpected request ${method} ${url.pathname}`);
  }));
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

async function mountClone(requestedSpec: "ok" | "refused") {
  serve({ requestedSpec });
  render(
    <MemoryRouter initialEntries={["/research/quantbt/runs/new?from=rrun_3258a4c450816129d2d285f25b801061&step=optimization"]}>
      <NewRunRoute />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen=new-run]")).not.toBeNull());
  await settle();
  await settle();
}

describe("400-trial audit — ?from=<400-trial run> copies the run's own values", () => {
  it("keeps 400 trials and seed 42 — the profile's accepted count of 1 does not overwrite the copy", async () => {
    await mountClone("ok");
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).value).toBe("400");
    expect((screen.getByLabelText("Random seed") as HTMLInputElement).value).toBe("42");
    /* And the difference from the listed profile is on screen, not silently resolved. */
    expect(document.querySelector('[data-outside-profile-field="trials"]')?.textContent).toBe(
      `Trials 400 — the profile lists ${ATLAS.current_release.submission_constraints.accepted_trial_count}. Kept as entered.`,
    );
  });

  it("shows the copied walk-forward instants in their inputs", async () => {
    await mountClone("ok");
    go("windows");
    expect((screen.getByLabelText("Analysis start") as HTMLInputElement).value).toBe("2026-05-01T00:00");
    expect((screen.getByLabelText("Analysis end exclusive") as HTMLInputElement).value).toBe("2026-07-31T00:00");
    expect((screen.getByLabelText("First OOS instant") as HTMLInputElement).value).toBe("2026-06-01T00:00");
  });

  it("a copy that could not be read still gets the profile's default — the default is only a fallback", async () => {
    await mountClone("refused");
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).value).toBe(
      String(ATLAS.current_release.submission_constraints.accepted_trial_count),
    );
  });
});
