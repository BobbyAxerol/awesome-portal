/**
 * P10 consumer tests — Screen 02 New Run.
 *
 * Three claims carry the phase, and each exists because of what it prevents:
 *
 *  - **One serializer.** Preview, preflight and submit must send byte-identical
 *    specs. The moment they are built by different code the reader approves one
 *    thing and the server receives another.
 *  - **`may_create_run` is display state.** Treating it as a gate would hide a
 *    control the server might still admit, and would make a typed `FORBIDDEN`
 *    after submit look like a bug rather than the normal atomic re-admission.
 *  - **An unknown outcome is never retried.** A blind retry is how one
 *    declaration becomes two runs.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewRun, UNKNOWN_OUTCOME_NOTE } from "./NewRun";
import { constraintsFrom, emptyDraft, parametersFor } from "./NewRunRoute";
import {
  RUN_CREATE_PROBLEM_CODES,
  newClientIntentId,
  outcomeIsUnknown,
  toRunCreateRefusal,
} from "./runCreateClient";
import type { RegistryEntry } from "./alphaImportClient";
import {
  type DraftConstraints,
  type RunDraft,
  SWEEP_CEILING,
  blockingProblems,
  missingConstraints,
  parameterStatus,
  serializeRequestedSpec,
  validateData,
  validateOptimization,
  validateStrategy,
  validateWindows,
} from "./runDraft";
import { useNewRun } from "./useNewRun";
import type { AtlasDocument } from "./atlas";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

function draft(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: "delta_rsi",
    alphaVersionId: "av_0_3_0",
    strategyId: "delta_rsi_polynomial",
    datasetId: "ds_btcusdt_4h",
    symbol: "BTCUSDT",
    timeframe: "4h",
    windows: {
      is: { start: "2022-01-01T00:00", endExclusive: "2024-01-01T00:00" },
      oos: { start: "2024-01-01T00:00", endExclusive: "2025-01-01T00:00" },
      holdout: { start: "2025-01-01T00:00", endExclusive: "2026-01-01T00:00" },
    },
    optimizationMode: "per_fold_causal",
    optimizationSchedule: "endpoint",
    optunaTrials: "400",
    randomSeed: "42",
    engineReleaseId: "er_quantbt_111",
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

const LIMITS: DraftConstraints = {
  declaredTimeframes: ["1h", "4h"],
  seedRequired: true,
  trialCeiling: 2000,
  entrypoint: "delta_rsi_polynomial",
  blockedRoutes: { options: "options route is deferred this round — no portal parameters are declared for it yet." },
};

const ATLAS: AtlasDocument = {
  schema_version: "research-engine-atlas.v1",
  manifest_revision: 7,
  current_release: {
    release_id: "er_quantbt_111",
    package: "quantbt-engine",
    expected_version: "1.1.1",
    installed_version: "1.1.1",
    verified: true,
    native_package: null,
    native_expected_version: null,
    native_installed_version: null,
    detail: null,
    trial_ceiling: 4000,
    optimizer_defaults: {
      schema_version: "research.optimizer-defaults.v1",
      groups: [
        { group_id: "study", fields: [{ field_id: "n_trials", default_value: 300, value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
        { group_id: "sampler", fields: [{ field_id: "name", default_value: "tpe", value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
        { group_id: "objective", fields: [{ field_id: "optuna_trials", default_value: 400, value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
        { group_id: "candidate_selection", fields: [{ field_id: "candidate_selection_metric", default_value: "robust_decay", value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
      ],
    },
    submission_constraints: {
      profile_id: "p10.fixed-qualification.v1", optimization_overrides: "FORBIDDEN",
      accepted_trial_count: 1, early_stopping: "MUST_BE_NULL", random_seed: "MUST_BE_NULL",
      reason: "Fixture fixed-qualification profile.",
    },
  },
  historical_releases: [],
  routes: [
    {
      route_id: "signal_notional",
      family: "signal",
      execution_contract: "close_target_v2",
      backend: "native_vectorized",
      report_levels: ["audit"],
      default_for_new_runs: true,
      axes: {
        engine: "ENGINE_SUPPORTED",
        integration: "ADAPTER_AVAILABLE",
        evidence: "EVIDENCE_MAPPED",
        admission: "P04_BASELINE_ONLY",
      },
      reason: "Certified in the installed release.",
      required_input_class: "single_symbol_ohlcv_plus_signal",
    },
    {
      route_id: "options",
      family: "multi",
      execution_contract: "options",
      backend: "native_option",
      report_levels: ["audit"],
      default_for_new_runs: false,
      axes: {
        engine: "ENGINE_SUPPORTED",
        integration: "DEFERRED_BY_PORTAL",
        evidence: "EVIDENCE_GAP",
        admission: "DEFERRED",
      },
      reason: "options route is deferred this round — no portal parameters are declared for it yet.",
      required_input_class: "option_chain",
    },
  ],
  modes: [],
  claims: [],
  evidence_contract: {
    schema_id: "research-run-evidence.v1",
    required_fields: ["engine_release_id"],
    writer_state: "P05_OWNED_NOT_ACTIVE",
  },
};

const OK = researchState({ kind: "ok", rowCount: 1 });

function preflightResponse(mayCreate = false) {
  return {
    schema_version: "research.preflight.v1",
    preflight_token: "pf_01",
    expires_at_utc_ms: 1800000000000,
    may_create_run: mayCreate,
    requested_spec_digest: "sha256:req",
    effective_spec_digest: "sha256:eff",
    dataset_binding_digest: "sha256:bind",
    manifest_digest: "sha256:man",
    effective_spec: {} as never,
    dataset_binding: {} as never,
    snapshot: {} as never,
    topology: { protocol: "advanced_walk_forward", frequency: "quarterly", window_mode: "expanding", folds: [], sealed_holdout: null, topology_digest: "sha256:t" } as never,
    resource_estimate: {} as never,
    capability: {} as never,
  } as never;
}

let sent: { url: string; body: Record<string, unknown> }[] = [];

function stub(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      sent.push({ url, body });
      const [status, payload] = responder(url);
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: { get: () => null },
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  sent = [];
});
afterEach(() => vi.unstubAllGlobals());

/** Moves the wizard to a step through its own pill, as a reader would. */
function goToStep(step: string) {
  fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
}

function view(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
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

/* -------------------------------------------------------------------------
 * The serializer
 * ---------------------------------------------------------------------- */

describe("P10-T01 — one serializer feeds preview, preflight and submit", () => {
  it("exists exactly once on the surface", () => {
    const files = ["runDraft.ts", "useNewRun.ts", "NewRun.tsx", "NewRunRoute.tsx"];
    const definitions = files.filter((name) =>
      /export function serializeRequestedSpec/.test(
        readFileSync(join(process.cwd(), "src", "research", name), "utf8"),
      ),
    );
    expect(definitions).toEqual(["runDraft.ts"]);
  });

  it("sends the protocol's own windows and never both", () => {
    const three = serializeRequestedSpec(draft());
    expect(three.windows).toBeDefined();
    expect(three.walk_forward).toBeUndefined();

    const advanced = serializeRequestedSpec(draft({ protocol: "advanced" }));
    expect(advanced.walk_forward).toBeDefined();
    expect(advanced.windows).toBeUndefined();
  });

  it("serializes no untouched default", () => {
    // Spec 02 §13-1: an untouched field is the engine's to default, and
    // writing it out freezes a value that should follow the release.
    expect(serializeRequestedSpec(draft()).optimization_config).toEqual({});
    expect(
      serializeRequestedSpec(draft({ optimizationConfigOverrides: { n_trials: 400 } }))
        .optimization_config,
    ).toEqual({ n_trials: 400 });
  });

  it("computes no digest and carries only the release identity", () => {
    const spec = serializeRequestedSpec(draft());
    expect(spec.client).toEqual({ engine_release_id: "er_quantbt_111", config_digest: "sha256:cfg" });
    const source = readFileSync(join(process.cwd(), "src", "research", "runDraft.ts"), "utf8");
    expect(source).not.toMatch(/createHash|subtle\.digest|sha256\s*\(/);
  });

  it("marks a scratch declaration not publishable", () => {
    expect(serializeRequestedSpec(draft({ bound: false })).not_publishable).toBe(true);
    expect(serializeRequestedSpec(draft({ bound: false })).alpha_binding).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * Validators
 * ---------------------------------------------------------------------- */

describe("P10-T02 — window rules are verbatim and half-open", () => {
  it("names the exact boundary that is wrong", () => {
    expect(
      validateWindows(draft({ windows: { ...draft().windows, oos: { start: "2024-02-01T00:00", endExclusive: "2025-01-01T00:00" } } })),
    ).toBe("OOS must begin exactly where IS ends.");
    expect(
      validateWindows(draft({ windows: { ...draft().windows, holdout: { start: "2025-02-01T00:00", endExclusive: "2026-01-01T00:00" } } })),
    ).toBe("Holdout must begin exactly where OOS ends.");
    expect(
      validateWindows(draft({ windows: { ...draft().windows, is: { start: "2024-01-01T00:00", endExclusive: "2022-01-01T00:00" } } })),
    ).toBe("Every window must have a positive length.");
    expect(
      validateWindows(draft({ windows: { ...draft().windows, holdout: { start: "2025-01-01T00:00", endExclusive: "" } } })),
    ).toBe("A holdout end-exclusive is required for the historical query.");
  });

  it("accepts windows that meet exactly", () => {
    expect(validateWindows(draft())).toBeNull();
  });
});

describe("P10-T03 — the declared space is never widened", () => {
  it("refuses a sweep outside the declared bounds", () => {
    const entry = { name: "rsi_len", declaredLow: 5, declaredHigh: 30, dimension: "sweep" as const, low: "2", high: "40" };
    expect(parameterStatus(entry).tone).toBe("refused");
    expect(parameterStatus(entry).text).toBe("outside the declared space — refused");
  });

  it("allows a narrowed sweep and says so", () => {
    const entry = { name: "rsi_len", declaredLow: 5, declaredHigh: 30, dimension: "sweep" as const, low: "10", high: "20" };
    expect(parameterStatus(entry).text).toBe("narrowed — allowed");
  });

  it("refuses a pin outside the space and labels a valid one", () => {
    const base = { name: "rsi_len", declaredLow: 5, declaredHigh: 30, dimension: "pin" as const, high: "" };
    expect(parameterStatus({ ...base, low: "99" }).text).toBe("pin value outside declared space — refused");
    expect(parameterStatus({ ...base, low: "14" }).text).toBe("pinned at 14 — fixed, out of sweep dims");
  });

  it("blocks above the sweep ceiling with the count", () => {
    const many = Array.from({ length: SWEEP_CEILING + 1 }, (_, i) => ({
      name: `p${i}`,
      declaredLow: 0,
      declaredHigh: 10,
      dimension: "sweep" as const,
      low: "0",
      high: "10",
    }));
    const problems = blockingProblems(draft({ parameters: many }), LIMITS);
    expect(problems.map((p) => p.message)).toContain(
      `sweep dims ${SWEEP_CEILING + 1} > ${SWEEP_CEILING} — pin params or drop entries.`,
    );
  });
});

describe("P10-T04 — the release's ceilings are the engine's, not the browser's", () => {
  it("quotes the published trial ceiling", () => {
    expect(validateOptimization(draft({ optunaTrials: "5000" }), LIMITS)).toBe(
      "The engine release publishes a ceiling of 2000 trials.",
    );
  });

  it("requires a seed only when the strategy declares it", () => {
    expect(validateOptimization(draft({ randomSeed: "" }), LIMITS)).toBe(
      "The strategy declares determinism.seed_required — a fixed random seed is required.",
    );
    expect(validateOptimization(draft({ randomSeed: "" }), { ...LIMITS, seedRequired: false })).toBeNull();
  });

  it("enforces no ceiling it cannot read, and claims none either", () => {
    // `Infinity` was the old fallback and it read as "no limit" — a claim about
    // the release that no response supported. `null` says the ceiling was not
    // read; the server still enforces its own at preflight.
    const noAtlas = constraintsFrom(null, [], "");
    expect(noAtlas.trialCeiling).toBeNull();
    expect(validateOptimization(draft({ optunaTrials: "99999" }), noAtlas)).toBeNull();
    expect(missingConstraints(noAtlas)).toContain("trial ceiling");
  });

  it("uses the release's published finite ceiling once the Atlas is read", () => {
    const withAtlas = constraintsFrom(ATLAS, [], "");
    expect(withAtlas.trialCeiling).toBe(ATLAS.current_release.trial_ceiling);
    expect(Number.isFinite(withAtlas.trialCeiling as number)).toBe(true);
    expect(validateOptimization(draft({ optunaTrials: "99999" }), withAtlas)).toBe(
      `The engine release publishes a ceiling of ${ATLAS.current_release.trial_ceiling} trials.`,
    );
  });

  it("reports blocking problems in the spec's order", () => {
    const problems = blockingProblems(
      draft({ executionRoute: "options", symbol: "", randomSeed: "" }),
      LIMITS,
    );
    expect(problems.map((p) => p.step)).toEqual(["route", "data", "optimization"]);
  });
});

/* -------------------------------------------------------------------------
 * The browser declaration amendment
 * ---------------------------------------------------------------------- */

/** A registry entry as the server projects it, with its safe declaration. */
function entryWithDeclaration(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    alpha_id: "delta_rsi",
    alpha_version_id: "av_0_3_0",
    version_label: "av_0_3_0",
    lifecycle_state: "ACTIVE",
    entrypoint: "alpha.delta_rsi:run",
    declaration: {
      schema_version: "research.alpha-version-declaration.v1",
      entrypoint: "alpha.delta_rsi:run",
      timeframes: ["1h", "4h"],
      determinism: { seed_required: true },
      parameter_space: {
        rsi_len: { kind: "int_range", low: 5, high: 30, step: 1 },
        poly_deg: { kind: "int_range", low: 2, high: 4, step: 1 },
        use_atr: { kind: "categorical", values: [true, false] },
        warmup: { kind: "fixed", value: 120 },
      },
    },
    source_digest_prefix: "sha256:11ab",
    alpha_revision: 6,
    registered_at_utc_ms: 1789836572369,
    may_activate: false,
    ...overrides,
  };
}

describe("P10-T11 — all four Spec 02 validators activate from the typed response", () => {
  const registry = [entryWithDeclaration()];
  const limits = constraintsFrom(ATLAS, registry, "av_0_3_0");

  it("reads every declared fact rather than falling back", () => {
    expect(limits.declaredTimeframes).toEqual(["1h", "4h"]);
    expect(limits.seedRequired).toBe(true);
    expect(limits.entrypoint).toBe("alpha.delta_rsi:run");
    expect(limits.trialCeiling).toBe(4000);
    expect(missingConstraints(limits)).toEqual([]);
  });

  it("fires the timeframe rule with the declared list", () => {
    expect(validateData(draft({ timeframe: "1d" }), limits)).toBe(
      "The strategy declares only 1h, 4h.",
    );
  });

  it("fires the seed rule because the declaration asks for it", () => {
    expect(validateOptimization(draft({ randomSeed: "" }), limits)).toBe(
      "The strategy declares determinism.seed_required — a fixed random seed is required.",
    );
  });

  it("fires the pin rule with the declared entrypoint", () => {
    expect(validateStrategy(draft({ strategyId: "something_else" }), limits)).toBe(
      "Strategy is pinned by av_0_3_0 (entrypoint alpha.delta_rsi:run) — switch to scratch in Context to explore other strategies.",
    );
  });

  it("fires the ceiling rule with the release's published number", () => {
    expect(validateOptimization(draft({ optunaTrials: "9999" }), limits)).toBe(
      "The engine release publishes a ceiling of 4000 trials.",
    );
  });

  it("declares nothing when the selected version is not in the registry", () => {
    // A near-match is not a match, and an entrypoint is never inferred from an
    // identifier. Everything is null and the screen says which.
    const absent = constraintsFrom(ATLAS, registry, "av_0_4_0");
    expect(absent.declaredTimeframes).toBeNull();
    expect(absent.seedRequired).toBeNull();
    expect(absent.entrypoint).toBeNull();
    expect(missingConstraints(absent)).toEqual([
      "declared timeframes",
      "determinism.seed_required",
      "entrypoint",
    ]);
    // The ceiling still came from the Atlas: one read failing does not erase
    // the other.
    expect(absent.trialCeiling).toBe(4000);
  });
});

describe("P10-T12 — the declared parameter space is adopted, never invented", () => {
  it("projects every declared kind into a row", () => {
    const rows = parametersFor([entryWithDeclaration()], "av_0_3_0");
    expect(rows.map((r) => r.name)).toEqual(["poly_deg", "rsi_len", "use_atr", "warmup"]);

    const categorical = rows.find((r) => r.name === "use_atr")!;
    expect(categorical.levels).toEqual([true, false]);

    // A `fixed` declaration is a parameter the alpha already decided, so it
    // arrives pinned at its value with nowhere to move.
    const fixed = rows.find((r) => r.name === "warmup")!;
    expect(fixed.dimension).toBe("pin");
    expect(fixed.low).toBe("120");
    expect(parameterStatus(fixed).tone).not.toBe("refused");
  });

  it("refuses a widening of the declared range", () => {
    const rows = parametersFor([entryWithDeclaration()], "av_0_3_0");
    const rsi = { ...rows.find((r) => r.name === "rsi_len")!, low: "1", high: "99" };
    expect(parameterStatus(rsi).text).toBe("outside the declared space — refused");
  });

  it("adopts nothing when no version is bound", () => {
    expect(parametersFor([entryWithDeclaration()], "av_9_9_9")).toEqual([]);
  });

  it("renders the normalized declaration without leaking a raw binding field", () => {
    view({
      draft: draft({ parameters: parametersFor([entryWithDeclaration()], "av_0_3_0") }),
      limits: constraintsFrom(ATLAS, [entryWithDeclaration()], "av_0_3_0"),
    });
    goToStep("parameters");
    const table = document.querySelector("[data-parameter-table]") as HTMLElement;
    expect(table.textContent).toContain("rsi_len");
    // Nothing from the source, the adapter or the provenance reaches the page.
    for (const leaked of ["source_digest", "sha256:", "adapter", "alpha.delta_rsi:run"]) {
      expect(table.textContent, leaked).not.toContain(leaked);
    }
  });
});

describe("P10-T13 — the four release-default groups stay locked", () => {
  it("renders all four named groups from the Atlas", () => {
    view();
    goToStep("optimization");
    const groups = Array.from(document.querySelectorAll("[data-default-group]")).map((n) =>
      n.getAttribute("data-default-group"),
    );
    expect(groups).toEqual(["study", "sampler", "objective", "candidate_selection"]);
  });

  it("marks every field RELEASE_DEFAULT and offers no input for a locked one", () => {
    view();
    goToStep("optimization");
    const fields = Array.from(document.querySelectorAll("[data-default-field]"));
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field.getAttribute("data-value-source")).toBe("RELEASE_DEFAULT");
      // A default is explained, never edited here: an input the server would
      // refuse is a promise the screen cannot keep.
      expect(field.querySelectorAll("input, select, textarea")).toHaveLength(0);
    }
    expect(document.querySelectorAll('[data-override-state="LOCKED"]').length).toBeGreaterThan(0);
  });

  it("never serializes a release default as a browser override", () => {
    // The draft's override map is what goes on the wire. Rendering the release's
    // defaults must not add a single key to it.
    const spec = serializeRequestedSpec(draft());
    expect(spec.optimization_config).toEqual({});
    view();
    goToStep("optimization");
    expect(document.querySelector("[data-override-summary]")?.textContent).toContain(
      "nothing serialized",
    );
  });

  it("states the current submission profile in the server's own words", () => {
    view();
    goToStep("optimization");
    const panel = document.querySelector("[data-submission-constraints]") as HTMLElement;
    expect(panel.getAttribute("data-submission-constraints")).toBe("p10.fixed-qualification.v1");
    expect(panel.textContent).toContain("trials 1");
    expect(panel.textContent).toContain("optimizer overrides FORBIDDEN");
  });

  it("shows no default at all when the Atlas is unavailable", () => {
    view({ atlas: null, atlasState: researchState({ kind: "transport", status: 503, retryable: false }) });
    goToStep("optimization");
    expect(document.querySelectorAll("[data-default-group]")).toHaveLength(0);
    expect(document.querySelector("[data-no-defaults]")?.textContent).toContain(
      "does not carry a local copy",
    );
  });
});

/* -------------------------------------------------------------------------
 * Composition
 * ---------------------------------------------------------------------- */

describe("P10-T05 — all eight steps are present and the route grid is manifest-driven", () => {
  it("renders eight step pills", () => {
    view();
    expect(document.querySelectorAll("[data-step-pill]")).toHaveLength(8);
  });

  it("builds the route cards from the Atlas, not a local list", () => {
    view();
    goToStep("route");
    expect(document.querySelectorAll("[data-route-card]")).toHaveLength(ATLAS.routes.length);
    // The ids on screen are the manifest's, so a route the release adds needs
    // no frontend change.
    const ids = Array.from(document.querySelectorAll("[data-route-card]")).map((n) =>
      n.getAttribute("data-route-card"),
    );
    expect(ids).toEqual(ATLAS.routes.map((r) => r.route_id));
  });

  it("shows a blocked route with the engine's reason rather than hiding it", () => {
    view();
    goToStep("route");
    const card = document.querySelector('[data-route-card="options"]') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.disabled).toBe(true);
    expect(card.getAttribute("title")).toBe(
      "options route is deferred this round — no portal parameters are declared for it yet.",
    );
    expect(card.textContent).toContain("deferred this round");
  });

  it("offers no route at all when the Atlas cannot be read", () => {
    view({ atlas: null, atlasState: researchState({ kind: "transport", status: 503, retryable: false }) });
    goToStep("route");
    expect(document.querySelectorAll("[data-route-card]")).toHaveLength(0);
    expect(document.querySelector("[data-no-atlas]")?.textContent).toContain(
      "does not carry a local copy",
    );
  });

  it("marks a step with a problem and says what needs attention", () => {
    view({ draft: draft({ symbol: "" }) });
    const pill = document.querySelector('[data-step-pill="data"]') as HTMLElement;
    expect(pill.getAttribute("data-step-state")).toBe("error");
    expect(pill.textContent).toContain("needs attention");
  });

  it("never prints a separator where a value belongs", () => {
    // §3.3 in its smallest form: `PUBLISHABLE ·` with nothing after it, and
    // `x × y` with both sides empty, both read as a value that is there.
    view({ draft: { ...emptyDraft(), bound: true } });
    const rail = document.querySelector("[data-review-rail]") as HTMLElement;
    expect(rail.textContent).not.toMatch(/PUBLISHABLE ·\s*$/m);
    expect(rail.textContent).toContain("PUBLISHABLE · no version bound");
    expect(within(rail).getAllByText("not declared").length).toBeGreaterThan(0);

    const chip = document.querySelector("[data-binding-chip]") as HTMLElement;
    expect(chip.textContent).toBe("PUBLISHABLE · no version bound");
    // No pin is claimed while no version is bound: the message used to read
    // "pinned by  (entrypoint …)", naming a version the reader had not chosen.
    expect(rail.textContent).not.toMatch(/pinned by\s{2}/);
  });

  it("shows the review rail on every step, with the payload's own facts", () => {
    view();
    const rail = document.querySelector("[data-review-rail]") as HTMLElement;
    expect(within(rail).getByText(/PUBLISHABLE · av_0_3_0/)).toBeTruthy();
    expect(rail.textContent).toContain("release defaults — nothing serialized");
  });
});

describe("P10-T06 — may_create_run is display state, not a gate", () => {
  it("still offers submit when the server has not published admission", () => {
    view({ preflight: preflightResponse(false), preflightState: OK, canSubmit: true, mayCreateRun: false });
    goToStep("review");
    const button = document.querySelector('[data-action="create-run"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(document.querySelector("[data-admission-note]")?.textContent).toContain(
      "admission is decided when the request arrives",
    );
  });

  it("reports the published flag rather than hiding the control", () => {
    view({ preflight: preflightResponse(true), preflightState: OK, canSubmit: true, mayCreateRun: true });
    goToStep("review");
    expect(document.querySelector("[data-may-create]")?.getAttribute("data-may-create")).toBe("true");
    expect(document.querySelector("[data-admission-note]")).toBeNull();
  });

  it("withholds submit only while there is no preflight", () => {
    view({ canSubmit: false });
    goToStep("review");
    const button = document.querySelector('[data-action="create-run"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.querySelector('[data-disabled-reason="create-run"]')?.textContent).toBe(
      "Run preflight first.",
    );
  });
});

/* -------------------------------------------------------------------------
 * Submit
 * ---------------------------------------------------------------------- */

describe("P10-T07 — the create request carries only what the contract declares", () => {
  it("sends the token, the canonical spec, an intent id and NEW", async () => {
    stub((url) =>
      url.endsWith("/preflights")
        ? [201, preflightResponse(true)]
        : [202, { schema_version: "research.run-create.v1", run_id: "run_1", status: "QUEUED", replayed: false, requested_spec_digest: "d1", effective_spec_digest: "d2", dataset_binding_digest: "d3", manifest_digest: "d4", legacy: { strategy_id: "s", dataset_id: "d", protocol: "p" } }],
    );

    const { result } = renderHook(() => useNewRun(draft(), LIMITS));
    await act(async () => result.current.preflight.runPreflight());
    await waitFor(() => expect(result.current.preflight.preflight).not.toBeNull());
    await act(async () => result.current.submit());
    await waitFor(() => expect(result.current.created).not.toBeNull());

    const create = sent.find((r) => r.url === "/api/v1/research/runs")!;
    expect(Object.keys(create.body).sort()).toEqual([
      "client_intent_id",
      "intent_kind",
      "preflight_token",
      "requested_spec",
      "schema_version",
    ]);
    expect(create.body.intent_kind).toBe("NEW");
    expect(create.body.preflight_token).toBe("pf_01");

    // The preview, the preflight and the submit carry the identical spec.
    const preflightCall = sent.find((r) => r.url.startsWith("/api/v1/research/preflights"))!;
    expect(create.body.requested_spec).toEqual(preflightCall.body.requested_spec);
    expect(create.body.requested_spec).toEqual(result.current.requestedSpec);
  });

  it("sends no private or derived fact", async () => {
    stub((url) =>
      url.endsWith("/preflights")
        ? [201, preflightResponse(true)]
        : [202, { schema_version: "research.run-create.v1", run_id: "r", status: "QUEUED", replayed: false, requested_spec_digest: "d", effective_spec_digest: "d", dataset_binding_digest: "d", manifest_digest: "d", legacy: { strategy_id: "s", dataset_id: "d", protocol: "p" } }],
    );
    const { result } = renderHook(() => useNewRun(draft(), LIMITS));
    await act(async () => result.current.preflight.runPreflight());
    await waitFor(() => expect(result.current.preflight.preflight).not.toBeNull());
    await act(async () => result.current.submit());
    await waitFor(() => expect(result.current.created).not.toBeNull());

    const body = JSON.stringify(sent.find((r) => r.url === "/api/v1/research/runs")!.body);
    for (const forbidden of [
      "effective_spec_digest",
      "requested_spec_digest",
      "lease_epoch",
      "worker_id",
      "adapter_id",
      "snapshot_bytes",
      "source_path",
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it("reuses one intent id so a re-check cannot create a second run", async () => {
    let attempt = 0;
    stub((url) => {
      if (url.endsWith("/preflights")) return [201, preflightResponse(true)];
      attempt += 1;
      if (attempt === 1) {
        return [502, { error: { code: "RESEARCH_RUN_TRANSPORT_UNKNOWN", message: "No answer from the producer." }, request_id: "r1" }];
      }
      return [202, { schema_version: "research.run-create.v1", run_id: "run_1", status: "QUEUED", replayed: true, requested_spec_digest: "d", effective_spec_digest: "d", dataset_binding_digest: "d", manifest_digest: "d", legacy: { strategy_id: "s", dataset_id: "d", protocol: "p" } }];
    });

    const { result } = renderHook(() => useNewRun(draft(), LIMITS));
    await act(async () => result.current.preflight.runPreflight());
    await waitFor(() => expect(result.current.preflight.preflight).not.toBeNull());

    await act(async () => result.current.submit());
    await waitFor(() => expect(result.current.outcomeUnknown).toBe(true));

    await act(async () => result.current.recheck());
    await waitFor(() => expect(result.current.created).not.toBeNull());

    const creates = sent.filter((r) => r.url === "/api/v1/research/runs");
    expect(creates).toHaveLength(2);
    expect(creates[0].body.client_intent_id).toBe(creates[1].body.client_intent_id);
    expect(result.current.created?.replayed).toBe(true);
  });

  it("generates a distinct intent id per attempt", () => {
    expect(newClientIntentId()).not.toBe(newClientIntentId());
  });
});

describe("P10-T08 — typed refusals keep the declaration on screen", () => {
  it("maps every code the contract declares", () => {
    expect(RUN_CREATE_PROBLEM_CODES).toHaveLength(12);
    for (const code of RUN_CREATE_PROBLEM_CODES) {
      const refusal = toRunCreateRefusal(new PortalApiError("server sentence", 400, code, "r"));
      expect(refusal.code).toBe(code);
      expect(refusal.message).toBe("server sentence");
      expect(refusal.state).not.toBe("available");
    }
  });

  it("does not downgrade rich parameters when the adapter refuses them", async () => {
    stub((url) =>
      url.endsWith("/preflights")
        ? [201, preflightResponse(true)]
        : [
            503,
            {
              error: {
                code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
                message: "The fixed P04 adapter does not accept these parameters.",
              },
              request_id: "r",
            },
          ],
    );
    const rich = draft({ routeParams: { reactive: { runtime: "R3B", audit_mode: "audit" } } });
    const { result } = renderHook(() => useNewRun(rich, LIMITS));
    await act(async () => result.current.preflight.runPreflight());
    await waitFor(() => expect(result.current.preflight.preflight).not.toBeNull());
    await act(async () => result.current.submit());
    await waitFor(() => expect(result.current.createRefusal).not.toBeNull());

    // The declaration is untouched: nothing was quietly replaced with a fixed
    // value the reader never chose.
    expect(result.current.draft.routeParams).toEqual({
      reactive: { runtime: "R3B", audit_mode: "audit" },
    });
    expect(result.current.createRefusal?.highlightsInput).toBe(true);
    expect(result.current.created).toBeNull();
  });

  it("treats a forbidden submit as a normal outcome of atomic re-admission", () => {
    const refusal = toRunCreateRefusal(
      new PortalApiError("Not admitted.", 403, "RESEARCH_RUN_CREATE_FORBIDDEN", null),
    );
    expect(refusal.state).toBe("denied");
    expect(refusal.mayRetry).toBe(false);
    expect(refusal.invalidatesPreflight).toBe(false);
  });

  it("marks only an unknown outcome as unknown", () => {
    expect(
      outcomeIsUnknown(toRunCreateRefusal(new PortalApiError("x", 502, "RESEARCH_RUN_TRANSPORT_UNKNOWN", null))),
    ).toBe(true);
    expect(outcomeIsUnknown(toRunCreateRefusal(new TypeError("Failed to fetch")))).toBe(true);
    expect(
      outcomeIsUnknown(toRunCreateRefusal(new PortalApiError("x", 400, "RESEARCH_RUN_CREATE_INVALID", null))),
    ).toBe(false);
  });
});

describe("P10-T09 — a 202 is a queued run and nothing more", () => {
  it("renders only the opaque id, the status and the digests", () => {
    view({
      created: {
        schema_version: "research.run-create.v1",
        run_id: "run_01HZ",
        status: "QUEUED",
        replayed: false,
        requested_spec_digest: "sha256:req",
        effective_spec_digest: "sha256:eff",
        dataset_binding_digest: "sha256:bind",
        manifest_digest: "sha256:man",
        legacy: { strategy_id: "s", dataset_id: "d", protocol: "p" },
      },
      createState: OK,
      canSubmit: true,
      preflight: preflightResponse(true),
      preflightState: OK,
    });
    goToStep("review");

    const card = document.querySelector("[data-created]") as HTMLElement;
    expect(card.getAttribute("data-created")).toBe("run_01HZ");
    expect(card.textContent).toContain("QUEUED");
    // P11 owns progress. Nothing here invents elapsed time or a worker.
    expect(card.textContent).not.toMatch(/elapsed|remaining|worker|%/i);
  });

  it("asks the reader to check again rather than retrying an unknown outcome", () => {
    view({ outcomeUnknown: true, canSubmit: true, preflight: preflightResponse(true), preflightState: OK });
    goToStep("review");
    expect(screen.getByText(UNKNOWN_OUTCOME_NOTE)).toBeTruthy();
    expect(document.querySelector('[data-action="recheck"]')).toBeTruthy();
  });
});

describe("P10-T10 — the surface makes no request of its own", () => {
  it("requests only the published create path", () => {
    const code = readFileSync(join(process.cwd(), "src", "research", "runCreateClient.ts"), "utf8");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/research/runs"]);
    expect(code).not.toMatch(/["'`](https?:)?\/\//);
  });

  it("builds no local DTO for the P10 payload", () => {
    for (const name of ["runCreateClient.ts", "useNewRun.ts", "NewRun.tsx", "NewRunRoute.tsx"]) {
      const code = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(code, name).not.toMatch(/interface\s+RunCreate(Request|Response)\b/);
    }
  });
});

/* -------------------------------------------------------------------------
 * RF02-F2 — every P02 control is built for real or refused with its reason
 * ---------------------------------------------------------------------- */

describe("RF02-F2 — the P02 field map is covered 24/24", () => {
  const fieldMap = JSON.parse(
    readFileSync(join(__dirname, "../../../../../upgrade/research_loop/evidence/P02/requested-spec-field-map.v1.json"), "utf8"),
  ) as { denominator: { mapped_form_controls: number }; controls: { source_control_id: string; draft_path: string; requested_spec_path: string }[] };
  const manifestAtlas = (
    JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument }
  ).atlas;
  const blockedRoutes = Object.fromEntries(
    manifestAtlas.routes.filter((route) => route.axes.admission !== "P04_BASELINE_ONLY").map((route) => [route.route_id, route.reason]),
  );
  const ROUTE_OF: Record<string, string> = { ib: "intrabar_bracket", pf: "portfolio", rx: "reactive", dc: "dca_ladder" };

  function at(step: string, overrides: Partial<RunDraft> = {}) {
    cleanup();
    view({ atlas: manifestAtlas, limits: { ...LIMITS, blockedRoutes }, draft: draft(overrides) });
    goToStep(step);
  }

  it("names 24 controls and resolves each one", () => {
    expect(fieldMap.controls).toHaveLength(fieldMap.denominator.mapped_form_controls);
    expect(fieldMap.controls).toHaveLength(24);
    const outcome: Record<string, "built" | "refused"> = {};
    for (const control of fieldMap.controls) {
      const path = control.draft_path;
      if (path.startsWith("routeCfg.")) {
        // A route-specific control belongs to a route the release does not
        // admit: its card is disabled with the server's reason, and no input
        // for that parameter exists anywhere.
        const route = ROUTE_OF[path.split(".")[1]!]!;
        at("route");
        const card = document.querySelector(`[data-route-card="${route}"]`) as HTMLButtonElement;
        expect(card, route).toBeTruthy();
        expect(card.disabled).toBe(true);
        expect(card.textContent).toContain(blockedRoutes[route]);
        outcome[control.source_control_id] = "refused";
        continue;
      }
      if (path === "alphaId" || path === "avId") {
        at("context");
        expect(screen.getByLabelText(path === "alphaId" ? "Alpha" : "Alpha version")).toBeTruthy();
      } else if (path === "datasetId" || path === "symbol" || path === "timeframe") {
        at("data");
        expect(screen.getByLabelText({ datasetId: "Dataset", symbol: "Symbol", timeframe: "Timeframe" }[path])).toBeTruthy();
      } else if (path.startsWith("windows[*].start")) {
        at("windows", { protocol: "three_window_decay" });
        expect(screen.getByLabelText("IS start")).toBeTruthy();
        at("windows", { protocol: "advanced" });
        expect(screen.getByLabelText("Analysis start")).toBeTruthy();
      } else if (path === "windows[*].end") {
        at("windows", { protocol: "three_window_decay" });
        expect(screen.getByLabelText("Holdout end exclusive")).toBeTruthy();
      } else if (path === "advanced.*") {
        at("windows", { protocol: "advanced" });
        expect(screen.getByLabelText("Analysis end exclusive")).toBeTruthy();
        expect(screen.getByLabelText("First OOS instant")).toBeTruthy();
        const frequency = screen.getByLabelText("Frequency") as HTMLSelectElement;
        const windowMode = screen.getByLabelText("Window mode") as HTMLSelectElement;
        // The values are the manifest's, not a list in the component.
        const published = manifestAtlas.current_release.walk_forward_options!;
        expect([...frequency.options].map((option) => option.value)).toEqual(published.frequency.map((item) => item.value));
        const rolling = [...windowMode.options].find((option) => option.value === "rolling")!;
        expect(rolling.disabled).toBe(true);
        expect(document.querySelector('[data-option-refused="rolling"]')?.textContent).toContain("RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED");
        expect(document.querySelector("[data-split-rule]")?.textContent).toBe(published.split_mode_rule);
      } else if (path.startsWith("parameter row")) {
        at("parameters", {
          parameters: [{ name: "window", dimension: "sweep", low: "20", high: "60", value: "", step: "2" } as never],
        });
        expect(screen.getByLabelText(path.endsWith("high") ? "window high" : "window low")).toBeTruthy();
      } else if (path === "trials" || path === "earlyStopping" || path === "seed") {
        at("optimization");
        expect(screen.getByLabelText({ trials: "Optuna trials", earlyStopping: "Early stopping", seed: "Random seed" }[path])).toBeTruthy();
      } else if (path === "cfgOverrides") {
        // The release forbids optimization overrides; the constraint is shown
        // where the control would be, with its reason.
        at("optimization");
        expect(document.querySelector('[data-submission-constraints="p10.fixed-qualification.v1"]')?.textContent).toMatch(/FORBIDDEN/);
        outcome[control.source_control_id] = "refused";
        continue;
      } else {
        throw new Error(`unmapped control ${control.source_control_id} ${path}`);
      }
      outcome[control.source_control_id] = "built";
    }
    expect(Object.keys(outcome)).toHaveLength(24);
    expect(Object.values(outcome).filter((value) => value === "built")).toHaveLength(13);
    expect(Object.values(outcome).filter((value) => value === "refused")).toHaveLength(11);
  });

  it("offers only the schedules the chosen mode lists, from the Atlas", () => {
    const patch = vi.fn();
    cleanup();
    view({ atlas: manifestAtlas, patch, draft: draft({ optimizationMode: "mode_4_is_only_robust", optimizationSchedule: "global" }) });
    goToStep("windows");
    const schedule = screen.getByLabelText("Optimization schedule") as HTMLSelectElement;
    expect([...schedule.options].map((option) => option.value).filter(Boolean)).toEqual(["global", "per_fold_causal"]);
    fireEvent.change(screen.getByLabelText("Optimization mode"), { target: { value: "mode_2_sbb" } });
    expect(patch).toHaveBeenCalledWith({ optimizationMode: "mode_2_sbb", optimizationSchedule: "global" });
  });
});
