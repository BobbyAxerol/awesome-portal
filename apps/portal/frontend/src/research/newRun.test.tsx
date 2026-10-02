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
import type { PreflightResponse } from "./preflightClient";
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
  isUntouched,
  missingConstraints,
  parameterEntriesFrom,
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
import { onSessionExpired } from "../auth/sessionExpiry";
import { lookupAbsent, lookupFound, lookupProblem, lookupRecord, LOOKUP_PUBLISHED_AT, LOOKUP_SERVER_PROSE } from "./alphaVersionPublication.fixture";
import { CATALOG_FAILURE_COPY, catalogFailureState, readDatasetCatalog } from "./datasetClient";
import { PREFLIGHT_REFUSAL_GENERIC_COPY } from "./preflightClient";
import { usePreflight } from "./usePreflight";

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
  requiredColumns: ["open", "high", "low", "close", "volume"],
  warmupBars: 120,
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

function preflightResponse(mayCreate = false): PreflightResponse {
  const fixture = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/preflight.json"), "utf8")) as PreflightResponse;
  return {
    ...fixture,
    preflight_token: "pf_01",
    expires_at_utc_ms: 1800000000000,
    may_create_run: mayCreate,
    requested_spec_digest: "sha256:req",
    effective_spec_digest: "sha256:eff",
    dataset_binding_digest: "sha256:bind",
    manifest_digest: "sha256:man",
  };
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
    ).toBe("Holdout end is required.");
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

describe("RF-04 FE-S02-01 — the payload the server actually admits", () => {
  const declared = parameterEntriesFrom({
    window: { kind: "range", low: 10, high: 60, step: 2 },
    fixed_k: { kind: "fixed", value: 3 },
  } as never);

  it("never carries the generated $defs block", () => {
    expect("$defs" in serializeRequestedSpec(draft())).toBe(false);
  });

  it("sends no override for a row the reader did not change", () => {
    const spec = serializeRequestedSpec(draft({ parameters: declared }));
    expect(spec.parameter_space_overrides).toEqual([]);
    expect(declared.every(isUntouched)).toBe(true);
  });

  it("sends exactly the rows the reader changed", () => {
    const edited = declared.map((row) => (row.name === "window" ? { ...row, high: "40" } : row));
    const spec = serializeRequestedSpec(draft({ parameters: edited }));
    expect(spec.parameter_space_overrides).toEqual([{ name: "window", kind: "sweep", low: 10, high: 40 }]);
  });

  it("requires a whole trial count of at least 1 instead of sending 0", () => {
    for (const value of ["", "0", "1.5", "-2"]) {
      expect(validateOptimization(draft({ optunaTrials: value }), LIMITS)).toBe(
        "Trials must be a whole number of at least 1.",
      );
    }
    expect(validateOptimization(draft({ optunaTrials: "1" }), LIMITS)).toBeNull();
  });
});

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

  it("pins a bound run's strategy to its alpha_id, the value the server admits", () => {
    // run-admission.service.ts admits a create only when strategy_id equals the
    // bound alpha_id; demanding the entrypoint made every real create fail.
    expect(validateStrategy(draft({ strategyId: "something_else" }), limits)).toBeNull();
    expect(serializeRequestedSpec(draft({ strategyId: "something_else" })).strategy_id).toBe("delta_rsi");
    expect(validateStrategy(draft({ bound: false, strategyId: "" }), limits)).toBe(
      "A strategy id is required while scratch.",
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
    /* No override, nothing to say here: the Review row says "release defaults — nothing serialized" once. */
    expect(document.querySelector("[data-config-surface]")).toBeNull();
    expect(document.querySelector("[data-defaults-footer]")).toBeNull();
    expect(document.querySelector('[data-step-card="Optimization"]')?.textContent).not.toContain("nothing serialized");
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

describe("RF-04 FE-S02-06 — timeframe choices come only from the bound declaration", () => {
  const chips = () => [...document.querySelectorAll("[data-timeframe-chip]")] as HTMLElement[];

  it("offers only the published choices", () => {
    view();
    goToStep("data");
    expect(screen.getByRole("radiogroup", { name: "Timeframe" })).toBeTruthy();
    expect(chips().map((chip) => chip.getAttribute("data-timeframe-chip"))).toEqual(["1h", "4h"]);
    expect(chips().every((chip) => chip.getAttribute("aria-disabled") === "false")).toBe(true);
    expect(chips().map((chip) => chip.getAttribute("data-timeframe-chip"))).not.toContain("1d");
  });

  it("does not invent a selectable timeframe when declaration is unavailable", () => {
    view({ limits: { ...LIMITS, declaredTimeframes: null } });
    goToStep("data");
    /* Only the draft's own value, disabled, with the typed reason. */
    expect(chips().map((chip) => chip.getAttribute("data-timeframe-chip"))).toEqual(["4h"]);
    expect(chips()[0]!.getAttribute("aria-disabled")).toBe("true");
    expect(chips()[0]!.getAttribute("data-chip-reason")).toBe("declaration-not-published");
    expect(chips()[0]!.getAttribute("title")).toContain("not published");
  });
  it("shows draft windows and only the selected published mode×schedule claim", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument };
    const selected = manifest.atlas.modes[0]!.facts!.schedules[0]!;
    view({ atlas: manifest.atlas, draft: draft({ optimizationMode: manifest.atlas.modes[0]!.mode_id, optimizationSchedule: selected.schedule }) });
    expect(document.querySelector("[data-window-timeline]")?.textContent).toContain("2022-01-01T00:00");
    expect(document.querySelector("[data-claim-forecast]")?.textContent).toContain(selected.chronological_validation_claim.toUpperCase());
    /* S02-01: the ceiling line carries the server's own reason for the absence,
       not a sentence written in the form. */
    expect(document.querySelector("[data-claim-forecast]")?.textContent).toContain("cert ceiling");
    expect(document.querySelector("[data-cert-ceiling-absent]")?.textContent).toBe("not published");
    expect(document.querySelector("[data-cert-cap-reason]")?.getAttribute("title")).toBe(selected.cert_cap.reason);
  });
});

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
    expect(card.getAttribute("aria-disabled")).toBe("true");
    /* The served reason is the tooltip and the accessible name, not inline text. */
    expect(card.getAttribute("title")).toBe(
      "options route is deferred this round — no portal parameters are declared for it yet.",
    );
    expect(card.getAttribute("aria-label")).toContain("deferred this round");
    expect(card.textContent).not.toContain("deferred this round");
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
    /* FG 02-8b: a step nobody has opened has not been checked — not "valid". */
    expect(pill.getAttribute("data-step-state")).toBe("not-visited");
    fireEvent.click(pill);
    expect(pill.getAttribute("data-step-state")).toBe("current");
    expect(pill.textContent).toContain("in progress");
    /* Leaving it with the problem unsolved is what makes it need attention. */
    fireEvent.click(document.querySelector('[data-step-pill="route"]') as HTMLElement);
    expect(pill.getAttribute("data-step-state")).toBe("error");
    expect(pill.textContent).toContain("needs attention");
  });

  it("never prints a separator where a value belongs", () => {
    // §3.3 in its smallest form: `PUBLISHABLE ·` with nothing after it, and
    // `x × y` with both sides empty, both read as a value that is there.
    view({ draft: { ...emptyDraft(), bound: true } });
    const rail = document.querySelector("[data-review-rail]") as HTMLElement;
    expect(rail.textContent).not.toMatch(/PUBLISHABLE ·\s*$/m);
    /* E4 (audit 02-x): before a version is chosen the chip states that, instead of
       claiming PUBLISHABLE for a binding the reader has not made. */
    expect(rail.textContent).toContain("NO VERSION CHOSEN");
    expect(rail.textContent).not.toContain("PUBLISHABLE · no version bound");
    expect(within(rail).getAllByText("not declared").length).toBeGreaterThan(0);

    const chip = document.querySelector("[data-binding-chip]") as HTMLElement;
    expect(chip.textContent).toBe("NO VERSION CHOSEN");
    expect(chip.getAttribute("data-binding-chip")).toBe("PENDING_VERSION");
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
    expect(RUN_CREATE_PROBLEM_CODES).toHaveLength(13);
    for (const code of RUN_CREATE_PROBLEM_CODES) {
      const refusal = toRunCreateRefusal(new PortalApiError("server sentence", 400, code, "r"));
      expect(refusal.code).toBe(code);
      expect(refusal.message).toBe("server sentence");
      expect(refusal.state).not.toBe("available");
    }
  });

  it("keeps a reproduction-pin conflict terminal and never silently retries a new intent", () => {
    const refusal = toRunCreateRefusal(new PortalApiError("Pins differ", 409, "RESEARCH_RUN_REPRODUCTION_CONFLICT", "r"));
    expect(refusal.state).toBe("terminal");
    expect(refusal.mayRetry).toBe(false);
    expect(refusal.highlightsInput).toBe(true);
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
        expect(card.getAttribute("aria-disabled")).toBe("true");
        expect(card.getAttribute("title")).toContain(blockedRoutes[route]);
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
        // W4 CG-P08-02: rolling is admitted with a manifest-owned train width.
        const rolling = [...windowMode.options].find((option) => option.value === "rolling")!;
        expect(rolling.disabled).toBe(false);
        expect(document.querySelector('[data-option-refused="rolling"]')).toBeNull();
        /* The served rule is the field's tooltip (T13), not a 35-word paragraph under the row. */
        expect(document.querySelector("[data-split-rule]")).toBeNull();
        expect(screen.getByLabelText("First OOS instant").closest("label")?.getAttribute("title")).toBe(published.split_mode_rule);
        at("windows", { protocol: "advanced", walkForward: { start: "", endExclusive: "", splitMode: "", frequency: "weekly", windowMode: "rolling" } });
        expect(screen.getByLabelText("Train width")).toBeTruthy();
        expect(screen.getByLabelText("Purge (bars)")).toBeTruthy();
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

  it("shows all published schedules but disables invalid pairs with the source reason", () => {
    const patch = vi.fn();
    cleanup();
    view({ atlas: manifestAtlas, patch, draft: draft({ optimizationMode: "mode_4_is_only_robust", optimizationSchedule: "global" }) });
    goToStep("windows");
    const schedule = screen.getByLabelText("Optimization schedule") as HTMLSelectElement;
    expect([...schedule.options].filter((option) => option.value && !option.disabled).map((option) => option.value)).toEqual(["global", "per_fold_causal"]);
    expect([...schedule.options].find((option) => option.value === "per_fold_decay")?.disabled).toBe(true);
    expect([...schedule.options].find((option) => option.value === "per_fold_decay")?.textContent).toContain("not admitted");
    expect(document.querySelector('[data-invalid-schedule="per_fold_decay"]')?.textContent).toContain("per_fold_decay");
    fireEvent.change(screen.getByLabelText("Optimization mode"), { target: { value: "mode_2_sbb" } });
    expect(patch).toHaveBeenCalledWith({ optimizationMode: "mode_2_sbb", optimizationSchedule: "global" });
  });
});

describe("W5a · P16/P19 — a what-if fork opens as a sibling, never an edit", () => {
  it("shows the pinned node read from the server grid and the untouched frozen run", () => {
    view({
      forkSource: { runId: "rrun_parent", cellId: "x6y4", state: "ready", parameters: { rvol: "1.4", slpercent: "2.3" }, reason: null },
    });
    const banner = document.querySelector("[data-fork-source]") as HTMLElement;
    expect(banner.getAttribute("data-fork-source")).toBe("rrun_parent");
    expect(banner.getAttribute("data-fork-cell")).toBe("x6y4");
    expect(banner.getAttribute("data-fork-state")).toBe("ready");
    expect(banner.textContent).toContain("sibling of");
    expect(banner.querySelector("[data-fork-pins]")?.textContent).toBe("rvol 1.4 · slpercent 2.3");
    /* F2b: the sentence is a tooltip now; the banner carries the two-word state. */
    expect(banner.querySelector("[title*='The frozen run is untouched.']")).not.toBeNull();
    expect(banner.textContent).not.toContain("The frozen run is untouched.");
    expect(banner.querySelector("a")?.getAttribute("href")).toBe("/research/quantbt/runs/rrun_parent/freeze");
  });

  it("says plainly when the node is not on the grid, and pins nothing", () => {
    view({
      forkSource: { runId: "rrun_parent", cellId: "x9y9", state: "missing", parameters: null, reason: "Node x9y9 is not on that run's what-if grid — nothing was pinned." },
    });
    const banner = document.querySelector("[data-fork-source]") as HTMLElement;
    expect(banner.getAttribute("data-fork-state")).toBe("missing");
    expect(banner.querySelector("[data-fork-pins]")).toBeNull();
    expect(banner.textContent).toContain("nothing was pinned");
  });

  it("renders no banner for an ordinary new run", () => {
    view();
    expect(document.querySelector("[data-fork-source]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * FG-05 — "last published rc" from the P22 alpha-version publication lookup
 * ---------------------------------------------------------------------- */

describe("FG-05 — last published rc reads the Alpha version's publication", () => {
  const registry = [entryWithDeclaration()];
  const LOOKUP_URL = "/api/v1/research/alpha-versions/av_0_3_0/publication";

  async function lastRc(state: string): Promise<HTMLElement> {
    return waitFor(() => {
      const row = document.querySelector(`[data-last-published-rc="${state}"]`) as HTMLElement | null;
      if (!row) throw new Error(`not yet: ${state}`);
      return row;
    });
  }

  it("prints the current rc, its raw status with the effective status beside it, the relation and the exact publish time", async () => {
    stub(() => [200, lookupFound(lookupRecord("rc_01K5LAST", "av_0_3_0", {}, { status: "APPROVED_WITH_CONDITION", effective_status: "EXPIRED" }))]);
    view({ registry });
    goToStep("context");
    const row = await lastRc("CURRENT");
    expect(row.querySelector("[data-last-rc]")!.textContent).toBe(
      "rc_01K5LAST · APPROVED_WITH_CONDITION (effective EXPIRED) · CURRENT · published 2026-09-25 08:08 UTC",
    );
    expect(row.querySelector("[data-last-rc] [title]")!.getAttribute("title")).toBe(new Date(LOOKUP_PUBLISHED_AT).toISOString());
    expect(row.querySelector("[data-last-rc]")!.getAttribute("data-last-rc-status")).toBe("APPROVED_WITH_CONDITION");
    expect(sent.map((call) => call.url)).toEqual([LOOKUP_URL]);
  });

  it("marks a superseded rc with the server's candidate_relation", async () => {
    stub(() => [200, lookupFound(lookupRecord("rc_01K5OLD", "av_0_3_0", { candidate_relation: "SUPERSEDED" }, { status: "APPROVED" }))]);
    view({ registry });
    goToStep("context");
    const row = await lastRc("SUPERSEDED");
    expect(row.querySelector("[data-last-rc]")!.textContent).toBe("rc_01K5OLD · APPROVED · SUPERSEDED · published 2026-09-25 08:08 UTC");
  });

  it("shows a typed absence with the server's reason code, never a dash or a zero", async () => {
    stub(() => [200, lookupAbsent("av_0_3_0")]);
    view({ registry });
    goToStep("context");
    const row = await lastRc("NOT_PUBLISHED");
    /* The typed absence stays typed: the server's reason code is the tooltip and the data attribute, the line is words. */
    const absent = row.querySelector("[data-last-rc-absent]")!;
    expect(absent.textContent).toBe("No release candidate yet");
    expect(absent.getAttribute("data-last-rc-absent")).toBe("P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED");
    expect(absent.getAttribute("title")).toBe("P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED");
    expect(row.textContent).not.toMatch(/—|N\/A|\b0\b/);
  });

  it("gives a 403 and a 404 the same words and never renders the server's message", async () => {
    const words: string[] = [];
    for (const status of [403, 404]) {
      stub(() => [status, lookupProblem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")]);
      view({ registry });
      goToStep("context");
      const row = await lastRc("denied");
      words.push(row.querySelector("[data-last-rc-refusal]")!.textContent!);
      expect(document.body.innerHTML).not.toContain(LOOKUP_SERVER_PROSE);
      cleanup();
      vi.unstubAllGlobals();
    }
    expect(words[0]).toBe("You don't have access to this in your current workspace, or it doesn't exist.");
    expect(words[1]).toBe(words[0]);
  });

  it("raises the shell's session signal once on a 401", async () => {
    let reports = 0;
    const stop = onSessionExpired(() => {
      reports += 1;
    });
    stub(() => [401, lookupProblem(401, "UNAUTHENTICATED")]);
    view({ registry });
    goToStep("context");
    await lastRc("session");
    stop();
    expect(reports).toBe(1);
  });

  it("asks nothing for a scratch draft or a version the registry does not list", () => {
    stub(() => [200, lookupAbsent("av_0_3_0")]);
    view({ registry, draft: draft({ bound: false }) });
    goToStep("context");
    expect(document.querySelector("[data-last-published-rc]")).toBeNull();
    cleanup();
    view({ registry, draft: draft({ alphaVersionId: "av_0_4_0" }) });
    goToStep("context");
    expect(document.querySelector("[data-last-published-rc]")).toBeNull();
    expect(sent).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * FG-08 (FE-A1-01, FE-A1-03, FE-A1-04): server prose never reaches Screen 02
 * ---------------------------------------------------------------------- */

describe("FG-08 — Screen 02 never renders the server's refusal prose", () => {
  const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";
  const problem = (code: string, details?: Record<string, unknown>) => ({
    error: { code, message: SENTINEL },
    request_id: "req_fg08",
    ...(details ? { details } : {}),
  });

  /** Reads the catalog through the real client and renders the data step with its note. */
  async function catalogNote(status: number, code: string) {
    stub(() => [status, problem(code)]);
    const error = await readDatasetCatalog().catch((caught: unknown) => caught);
    view({ initialStep: "data", catalog: null, catalogReason: catalogFailureState(error).reason });
    const note = document.querySelector("[data-catalog-unread]") as HTMLElement | null;
    expect(note, `catalog ${status}`).not.toBeNull();
    expect(document.body.textContent, `catalog ${status}`).not.toContain(SENTINEL);
    const facts = note!.querySelector("[data-catalog-facts]");
    const result = {
      text: note!.textContent!,
      facts: facts?.textContent ?? null,
      factsAreMono: facts?.classList.contains("mono") ?? false,
      sentence: note!.textContent!.replace(facts?.textContent ?? "", "").trim(),
    };
    cleanup();
    vi.unstubAllGlobals();
    return result;
  }

  it("prints fixed copy and typed facts for a dataset catalog 403, 404 and 503, the denials without their code", async () => {
    const denied403 = await catalogNote(403, "RESEARCH_WORKSPACE_FORBIDDEN");
    const denied404 = await catalogNote(404, "RESEARCH_PREFLIGHT_NOT_FOUND");
    const down503 = await catalogNote(503, "RESEARCH_PREFLIGHT_UNAVAILABLE");

    expect(denied403.sentence).toBe(`Dataset catalog not read: ${CATALOG_FAILURE_COPY.denied}`);
    expect(denied404.sentence).toBe(denied403.sentence);
    /* A denial prints the request id only, so a 403 and a 404 are the same text. */
    expect(denied403.facts).toBe("request req_fg08");
    expect(denied404.text).toBe(denied403.text);
    expect(down503.text).toBe(
      `Dataset catalog not read: ${CATALOG_FAILURE_COPY.unavailable} RESEARCH_PREFLIGHT_UNAVAILABLE · request req_fg08`,
    );
    expect([denied403, denied404, down503].every((note) => note.factsAreMono)).toBe(true);
  });

  it("gives a catalog 403 and a coded 404 byte-identical text when the server sends the same code", async () => {
    const denied403 = await catalogNote(403, "RESEARCH_WORKSPACE_FORBIDDEN");
    const denied404 = await catalogNote(404, "RESEARCH_WORKSPACE_FORBIDDEN");
    expect(denied404.text).toBe(denied403.text);
  });

  /** Runs a refused preflight through the real client and hook, then renders the review step. */
  async function refusedReview(status: number, body: unknown) {
    stub(() => [status, body]);
    const hook = renderHook(() => usePreflight(serializeRequestedSpec(draft())));
    await act(async () => hook.result.current.runPreflight());
    await waitFor(() => expect(hook.result.current.refusal).not.toBeNull());
    const { refusal, preflightState } = hook.result.current;
    hook.unmount();
    view({ initialStep: "review", preflightRefusal: refusal, preflightState });
    const alert = document.querySelector("[role=alert][data-refusal-field]") as HTMLElement | null;
    return { refusal: refusal!, alert };
  }

  it("shows the gate, fixed copy, field path and request id for a 422 with a field path", async () => {
    const { alert } = await refusedReview(
      422,
      problem("RESEARCH_PREFLIGHT_DATA_UNAVAILABLE", { gate: "DATA", field_path: ["data", "symbol"] }),
    );
    expect(document.body.textContent).not.toContain(SENTINEL);
    expect(alert).not.toBeNull();
    expect(alert!.getAttribute("data-refusal-field")).toBe("data.symbol");
    expect(alert!.querySelector("[data-refusal-copy]")!.textContent).toBe("The historical source has no data for this request.");
    expect(alert!.querySelector("[data-refusal-path]")!.textContent).toBe("data.symbol");
    expect(alert!.querySelector("[data-request-id]")!.textContent).toBe("request req_fg08");
    expect(alert!.textContent).toContain("DATA");
    expect(alert!.querySelector('[data-action="go-to-refused-step"]')).not.toBeNull();
  });

  it("still shows a refusal alert on the review step for a 422 without a field path", async () => {
    const { alert } = await refusedReview(422, problem("RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED"));
    expect(document.body.textContent).not.toContain(SENTINEL);
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toContain(alert);
    expect(alert!.getAttribute("data-refusal-field")).toBe("");
    expect(alert!.querySelector("[data-refusal-copy]")!.textContent).toBe("Portal has not admitted this route for runs.");
    expect(alert!.querySelector("[data-refusal-path]")).toBeNull();
    expect(alert!.querySelector('[data-action="go-to-refused-step"]')).toBeNull();
    const preview = document.querySelector("[data-preflight-preview]") as HTMLDetailsElement;
    /* One banner says it; the six panels stay folded rather than printing the same sentence six times (U19). */
    expect(preview.open).toBe(false);
    expect(document.querySelector("[data-preflight-preview-summary]")!.textContent).toBe("preflight checks · 6 panels · refused");
  });

  it("keeps the server prose out of the page for a 400 that lists field paths", async () => {
    const { alert } = await refusedReview(
      400,
      problem("RESEARCH_PREFLIGHT_INVALID", { field_paths: [["walk_forward", "purge_bars"]] }),
    );
    expect(document.body.textContent).not.toContain(SENTINEL);
    expect(alert!.getAttribute("data-refusal-field")).toBe("walk_forward.purge_bars");
    expect(alert!.querySelector("[data-refusal-copy]")!.textContent).toBe(
      "Preflight cannot accept a field of this declaration. Fix it and run preflight again.",
    );
  });

  it("uses the generic sentence for a refusal code this client does not know", async () => {
    const { alert } = await refusedReview(422, problem("RESEARCH_PREFLIGHT_SOMETHING_NEW"));
    expect(document.body.textContent).not.toContain(SENTINEL);
    expect(alert!.querySelector("[data-refusal-copy]")!.textContent).toBe(PREFLIGHT_REFUSAL_GENERIC_COPY);
  });

  it("keeps the folded preview saying none read yet before any preflight", () => {
    view({ initialStep: "review" });
    expect(document.querySelector("[role=alert][data-refusal-field]")).toBeNull();
    const preview = document.querySelector("[data-preflight-preview]") as HTMLDetailsElement;
    expect(preview.open).toBe(false);
    expect(document.querySelector("[data-preflight-preview-summary]")!.textContent).toBe(
      "preflight checks · 6 panels · not read",
    );
  });
});

/* -------------------------------------------------------------------------
 * FG-08 (A2b): a failed run create and a refused preflight never carry the
 * server's prose into the hook state or the rendered page
 * ---------------------------------------------------------------------- */

describe("FG-08 (A2b) — Screen 02 run create and preflight hook never carry server prose", () => {
  const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";
  const problem = (code: string | null) => ({
    error: { ...(code ? { code } : {}), message: SENTINEL },
    request_id: "req_a2b",
  });

  /** Runs a valid preflight, then a refused create, through the real client and hook; renders the review step. */
  async function failedCreate(status: number, code: string | null) {
    stub((url) => (url.endsWith("/preflights") ? [201, preflightResponse(true)] : [status, problem(code)]));
    const hook = renderHook(() => useNewRun(draft(), LIMITS));
    await act(async () => hook.result.current.preflight.runPreflight());
    await waitFor(() => expect(hook.result.current.preflight.preflight).not.toBeNull());
    await act(async () => hook.result.current.submit());
    await waitFor(() => expect(hook.result.current.createRefusal).not.toBeNull());
    const { createState, createRefusal, outcomeUnknown } = hook.result.current;
    hook.unmount();
    view({
      initialStep: "review",
      createState,
      outcomeUnknown,
      canSubmit: true,
      preflight: preflightResponse(true),
      preflightState: OK,
    });
    const panel = document.querySelector('[data-research-panel="run"]') as HTMLElement | null;
    expect(panel, `run panel for ${status}`).not.toBeNull();
    const pageText = document.body.textContent ?? "";
    const detailNode = panel!.querySelector("[data-research-detail]");
    const panelWithoutDetail = panel!.textContent!.replace(detailNode?.textContent ?? "", "");
    cleanup();
    vi.unstubAllGlobals();
    return { createState, refusal: createRefusal!, pageText, panelWithoutDetail };
  }

  it("keeps the sentinel out of the hook state and the page for run create 403, 404, 409, 422 and 503", async () => {
    for (const [status, code] of [
      [403, "RESEARCH_RUN_CREATE_FORBIDDEN"],
      [404, "RESEARCH_RUN_NOT_FOUND"],
      [409, "RESEARCH_RUN_PREFLIGHT_STALE"],
      [422, "RESEARCH_RUN_CREATE_INVALID"],
      [503, "RESEARCH_RUN_PRODUCER_UNAVAILABLE"],
    ] as const) {
      const { createState, refusal, pageText, panelWithoutDetail } = await failedCreate(status, code);
      expect(createState.reason, `${status}`).not.toContain(SENTINEL);
      expect(createState.detail ?? "", `${status}`).not.toContain(SENTINEL);
      expect(pageText, `${status}`).not.toContain(SENTINEL);
      expect(createState.reason, `${status}`).toBe(refusal.copy);
      expect(createState.detail, `${status}`).toBe(`${code} · request req_a2b`);
      expect(panelWithoutDetail, `${status}`).toContain(refusal.copy);
      // The server's sentence is still on the refusal, for diagnostics only.
      expect(refusal.message, `${status}`).toBe(SENTINEL);
    }
  });

  it("gives a run create 403 and 404 the same copy and the same panel text", async () => {
    const forbidden = await failedCreate(403, "RESEARCH_RUN_CREATE_FORBIDDEN");
    const notFound = await failedCreate(404, "RESEARCH_RUN_NOT_FOUND");
    expect(notFound.createState.reason).toBe(forbidden.createState.reason);
    expect(notFound.createState.state).toBe("denied");
    expect(forbidden.createState.state).toBe("denied");
    expect(notFound.panelWithoutDetail).toBe(forbidden.panelWithoutDetail);
  });

  it("uses the generic sentence for an unknown code and the uncoded sentence when no code came back", async () => {
    const unknown = await failedCreate(422, "RESEARCH_RUN_SOMETHING_NEW");
    expect(unknown.createState.reason).toBe("The run was not created.");
    expect(unknown.pageText).not.toContain(SENTINEL);

    const uncoded = await failedCreate(502, null);
    expect(uncoded.createState.reason).toBe("The server did not say whether the run was created.");
    expect(uncoded.createState.detail).toBe("request req_a2b");
    expect(uncoded.pageText).not.toContain(SENTINEL);
  });

  it("gives the preflight hook's panel state the client sentence, not the server message", async () => {
    stub(() => [422, { ...problem("RESEARCH_PREFLIGHT_DATA_UNAVAILABLE"), details: { gate: "DATA" } }]);
    const hook = renderHook(() => usePreflight(serializeRequestedSpec(draft())));
    await act(async () => hook.result.current.runPreflight());
    await waitFor(() => expect(hook.result.current.refusal).not.toBeNull());
    const { preflightState, refusal } = hook.result.current;
    hook.unmount();
    expect(preflightState.reason).toBe(refusal!.copy);
    expect(preflightState.reason).not.toContain(SENTINEL);
    expect(preflightState.detail ?? "").not.toContain(SENTINEL);
    expect(refusal!.message).toBe(SENTINEL);
  });
});

/* -------------------------------------------------------------------------
 * F2b · S02 — flow links and less prose
 * ---------------------------------------------------------------------- */

describe("F2b S02 — the way out and the way back", () => {
  it("the header links the Library, the import and the atlas, and carries no subtitle sentence", () => {
    view();
    const href = (name: string) => document.querySelector(`[data-link="${name}"]`)?.getAttribute("href");
    expect(href("run-library")).toBe("/research/quantbt/runs");
    expect(href("alpha-import")).toBe("/research/quantbt/alpha-import");
    /* HiFi 02-11: the atlas link moved into the route card. */
    expect(href("atlas")).toBeUndefined();
    goToStep("route");
    expect(href("atlas")).toBe("/research/quantbt/atlas");
    expect(document.body.textContent).not.toContain("Each step validates on its own");
    expect(document.querySelector("h1")?.getAttribute("title")).toContain("Each step validates on its own");
  });

  it("the release note is the pinned engine; the sentence is its tooltip", () => {
    view();
    const note = document.querySelector("[data-release-note]") as HTMLElement;
    expect(note.textContent).toContain("engine ");
    expect(note.textContent).not.toContain("read from the INSTALLED");
    expect(note.getAttribute("title")).toContain("installed engine release");
  });

  it("a copied run's banner links the source run and keeps the sentence in a tooltip", () => {
    view({ cloneSource: { runId: "rrun_src", state: OK } });
    const banner = document.querySelector("[data-clone-source]") as HTMLElement;
    expect(banner.querySelector('[data-link="clone-source"]')?.getAttribute("href")).toBe("/research/quantbt/runs/rrun_src/progress");
    expect(banner.textContent).not.toContain("The original run is untouched");
    expect(banner.querySelector("[title*='The original run is untouched']")).not.toBeNull();
  });

  it("the folded preview names its state in eight words or fewer", () => {
    view({ initialStep: "review" });
    expect(document.querySelector("[data-preflight-preview-summary]")!.textContent!.split(/\s+/).length).toBeLessThanOrEqual(8);
  });
});
