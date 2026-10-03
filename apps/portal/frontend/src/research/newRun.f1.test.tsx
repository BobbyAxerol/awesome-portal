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
import { blockingProblems, serializeRequestedSpec } from "./runDraft";
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
  it("opens with one current step and six that are not visited — and the pinned strategy says so, not a tick it never earned", () => {
    mount();
    expect(pill("context").getAttribute("data-step-state")).toBe("current");
    for (const step of ["route", "data", "windows", "parameters", "optimization", "review"]) {
      expect(pill(step).getAttribute("data-step-state")).toBe("not-visited");
    }
    /* A bound run's strategy is the alpha's own: nothing is left to choose, so the pill reads "pinned" and never blocks. */
    expect(pill("strategy").textContent).toContain("pinned");
    /* W4A: an unvisited step prints no caption; its state is the data attribute. */
    expect(pill("data").querySelector("[data-step-caption]")).toBeNull();
  });

  it("an unvisited step that would fail is not-visited, never valid, until the reader gets there", () => {
    mount({ draft: draft({ symbol: "" }) });
    expect(pill("data").getAttribute("data-step-state")).toBe("not-visited");
    go("data");
    /* Reaching the step is not enough: a form nobody typed in does not read wrong. */
    expect(pill("data").getAttribute("data-step-state")).toBe("current");
    expect(pill("data").textContent).toContain("in progress");
    expect(document.querySelector("[data-step-error]")).toBeNull();
    expect(document.body.textContent).not.toContain("A symbol is required.");
    expect(document.querySelector("[data-review-rail]")?.textContent).not.toContain("A symbol is required.");
    go("route");
    /* U18: walking through a step without typing in it is not an error. */
    expect(pill("data").getAttribute("data-step-state")).toBe("incomplete");
    expect(pill("data").textContent).toContain("in progress");
  });

  it("typing in a required field shows its error at once; leaving does not; Review always lists it", () => {
    const patch = vi.fn();
    mount({ draft: draft({ symbol: "" }), patch });
    go("data");
    expect(document.querySelector("[data-step-error]")).toBeNull();
    expect(pill("data").getAttribute("data-step-state")).toBe("current");
    /* The harness keeps the draft empty, so typed-then-still-empty is the touched path. */
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "B" } });
    expect(patch).toHaveBeenCalled();
    expect(document.querySelector("[data-step-error]")?.textContent).toBe("A symbol is required.");
    expect(pill("data").textContent).toContain("needs attention");
    cleanup();
    mount({ draft: draft({ symbol: "" }) });
    go("data");
    go("route");
    /* U18: leaving does not engage the step; only an edit does. */
    expect(pill("data").getAttribute("data-step-state")).toBe("incomplete");
    go("data");
    expect(document.querySelector("[data-step-error]")).toBeNull();
    cleanup();
    mount({ draft: draft({ symbol: "" }) });
    go("data");
    go("review");
    expect(document.body.textContent).toContain("A symbol is required.");
  });

  it("a step nobody opened stays not visited even when it has a problem; the preflight guard still sees every problem", () => {
    mount({ draft: draft({ symbol: "" }) });
    expect(pill("data").getAttribute("data-step-state")).toBe("not-visited");
    /* W4A: an unvisited step prints no caption; its state is the data attribute. */
    expect(pill("data").querySelector("[data-step-caption]")).toBeNull();
    expect(blockingProblems(draft({ symbol: "" }), LIMITS).map((problem) => problem.message)).toContain("A symbol is required.");
  });

  it("a step that passes its own checks reads valid; Review never earns a ✓ it cannot see", () => {
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

  const chip = (tf: string) => document.querySelector(`[data-timeframe-chip="${tf}"]`) as HTMLElement | null;

  it("a draft on 4h against a strategy that declares only 1h: the 4h chip is selected, marked not declared", () => {
    mount({ draft: draft({ timeframe: "4h" }), limits: onlyOneHour });
    go("data");
    go("route");
    go("data");
    expect(chip("4h")!.getAttribute("aria-checked")).toBe("true");
    expect(chip("4h")!.getAttribute("data-chip-reason")).toBe("not-declared");
    expect(chip("4h")!.getAttribute("title")).toMatch(/^not declared by /);
    /* The declared choice is still offered, and is not what is selected. */
    expect(chip("1h")!.getAttribute("aria-checked")).toBe("false");
    expect(chip("1h")!.getAttribute("aria-disabled")).toBe("false");
    /* The cause of the error is on screen, naming the same value Review prints. */
    expect(document.querySelector("[data-step-error]")?.textContent).toContain("declares only 1h");
  });

  it("a declared timeframe adds no extra chip", () => {
    mount({ draft: draft({ timeframe: "1h" }), limits: onlyOneHour });
    go("data");
    expect([...document.querySelectorAll("[data-timeframe-chip]")].map((node) => node.getAttribute("data-timeframe-chip"))).toEqual(["1h"]);
    expect(chip("1h")!.getAttribute("aria-checked")).toBe("true");
  });

  it("an empty draft timeframe selects no chip, not a silent 1h", () => {
    mount({ draft: draft({ timeframe: "" }), limits: onlyOneHour });
    go("data");
    expect(chip("1h")!.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector('[data-timeframe-chip][aria-checked="true"]')).toBeNull();
  });
});

/* ----------------------------------------------------------- CG-P04-05 / S02-01 */

describe("S02-01 — the cert ceiling line carries the Atlas fact, not a sentence from the form", () => {
  it("prints the served cert_cap reason beside 'not published'", () => {
    const fact = ATLAS.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!.schedules.find((entry) => entry.schedule === "global")!;
    mount({ draft: draft({ optimizationMode: "mode_1_decay", optimizationSchedule: "global" }) });
    go("review");
    const line = document.querySelector("[data-cert-cap]") as HTMLElement;
    expect(line.getAttribute("data-cert-cap")).toBe(fact.cert_cap.state);
    expect(line.textContent).toContain("cert ceiling");
    expect(line.querySelector("[data-cert-ceiling-absent]")?.textContent).toBe("not published");
    /* The server's sentence is the label's tooltip and accessible name, no longer a 28-word line under every forecast. */
    const reason = document.querySelector("[data-cert-cap-reason]") as HTMLElement;
    expect(reason.getAttribute("title")).toBe(fact.cert_cap.reason);
    expect(reason.getAttribute("aria-label")).toBe(`cert ceiling — ${fact.cert_cap.reason}`);
    expect(reason.textContent).toBe("cert ceiling");
    expect(document.querySelector("[data-claim-forecast]")?.textContent).not.toContain(fact.cert_cap.reason);
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
    go("review");
    expect(document.querySelector("[data-cert-cap-reason]")?.getAttribute("title")).toBe("A reason the form never wrote.");
  });
});

/* ------------------------------------------------- CG-P02-02 / CG-P08-02 */

describe("CG-P02-02 / P08-02 — the v2 controls carry no 'preflight only' note", () => {
  it("rolling width, the temporal guards and the inner folds are controls, not warnings", () => {
    mount({
      draft: advanced({ windowMode: "rolling", trainWindow: "30D", purgeBars: "2" }, { optimizationMode: "mode_1_decay", optimizationSchedule: "per_fold_causal" }),
    });
    go("windows");
    expect(document.querySelector("[data-v2-create-note]")).toBeNull();
    expect(document.body.textContent).not.toContain("preflight only for now");
    expect(document.querySelector("[data-train-window]")).not.toBeNull();
    expect(document.querySelector("[data-temporal-guards]")).not.toBeNull();
    expect(document.querySelector("[data-inner-folds]")).not.toBeNull();
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
    go("windows");
    expect(document.querySelector("[data-advanced-timeline]")?.textContent).toContain("first OOS 2026-06-01T00:00");
    /* One instant format (U12): the seconds and the Z a copied run carries are not printed. */
    expect(document.querySelector("[data-advanced-timeline]")?.textContent).not.toContain(":00Z");
    cleanup();
    mount({ draft: advanced({ splitMode: "" }) });
    go("windows");
    /* An absent instant is left out of the line, not printed as "not declared". */
    expect(document.querySelector("[data-advanced-timeline]")?.textContent).not.toContain("first OOS");
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
    /* S02_V2B (LW-07): the copy is a WFO draft, so the profile it falls under is the served p10 one
       (trials 2-400, seed 42), not the stale single-profile `submission_constraints` (1 trial, no seed).
       400 and 42 sit inside it, so there is nothing to flag; the seed is the profile's pin. */
    expect(document.querySelector("[data-profile-card]")?.getAttribute("data-profile-card")).toBe("p10.delta-signal-notional-wfo.v1");
    expect(document.querySelector("[data-outside-profile]")).toBeNull();
    expect(document.querySelector("[data-submission-constraints]")).toBeNull();
    expect((screen.getByLabelText("Random seed") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).readOnly).toBe(false);
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

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
