/**
 * W4 — Screens 02 / 12 / 14 consume the P02/P04/P07/P08 facts delivered on
 * this branch. Each assertion reads a published contract value or the exact
 * copy the screen renders; none reconstructs a fact locally.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, awaitingStep, gateTiming, type AlphaImportProps } from "./AlphaImport";
import type { GateRow, SourceResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import type { DatasetCatalog } from "./datasetClient";
import { NewRun } from "./NewRun";
import { emptyDraft } from "./NewRunRoute";
import { PreflightPanel } from "./PreflightPanel";
import { PreflightApiError, type PreflightResponse, toPreflightRefusal } from "./preflightClient";
import { cloneFailureState } from "./runCloneClient";
import {
  type DraftConstraints,
  type RunDraft,
  applyOverrides,
  blockingProblems,
  draftFromRequestedSpec,
  serializeRequestedSpec,
  stepForFieldPath,
  usesSpecV2,
  validateParameters,
} from "./runDraft";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { runLineageFor } from "./useNewRun";
import { REFUSAL_COPY } from "./researchRefusal";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const ATLAS = (
  JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument }
).atlas;
const PREFLIGHT = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/fixtures/research-preflight.response.valid.json"), "utf8"),
) as PreflightResponse;
const OK = researchState({ kind: "ok", rowCount: 1 });

const LIMITS: DraftConstraints = {
  declaredTimeframes: ["1h"],
  seedRequired: false,
  trialCeiling: 4000,
  entrypoint: "generate_signals",
  blockedRoutes: {},
  sweepCeiling: 8,
  requiredColumns: ["open", "high", "low", "close"],
  warmupBars: 64,
};

function advanced(walkForward: Partial<RunDraft["walkForward"]> = {}, extra: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: "delta",
    alphaVersionId: "av_delta_1",
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    protocol: "advanced",
    walkForward: {
      start: "2026-06-01T00:00", endExclusive: "2026-07-15T00:00", splitMode: "2026-07-01T00:00",
      frequency: "weekly", windowMode: "expanding", ...walkForward,
    },
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    optunaTrials: "3",
    randomSeed: "42",
    engineReleaseId: "er_quantbt_111",
    configDigest: "c".repeat(64),
    ...extra,
  };
}

function view(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  return render(
    <NewRun
      draft={advanced()}
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

describe("CG-P02-02 / CG-P08-02 requested-spec v2 serializer", () => {
  it("keeps a draft with no v2 field a v1 document", () => {
    const spec = serializeRequestedSpec(advanced());
    expect(spec.schema_version).toBe("research.requested-spec.v1");
    expect(Object.keys(spec.walk_forward ?? {}).sort()).toEqual(["end_exclusive", "frequency", "split_mode", "start", "window_mode"]);
  });

  it("serializes rolling width, guards and inner folds only when declared", () => {
    const spec = serializeRequestedSpec(advanced(
      { windowMode: "rolling", trainWindow: "30D", purgeBars: "3", embargoBars: "4", inner: { splitFrequency: "weekly", windowMode: "expanding", trainWindow: "7D", minFolds: "" } },
      { optimizationSchedule: "per_fold_causal" },
    ));
    expect(spec.schema_version).toBe("research.requested-spec.v2");
    expect(spec.walk_forward).toMatchObject({
      window_mode: "rolling", train_window: "30D", purge_bars: 3, embargo_bars: 4,
      inner: { split_frequency: "weekly", window_mode: "expanding", train_window: "7D" },
    });
    expect(spec.walk_forward).not.toHaveProperty("label_horizon_bars");
    expect((spec.walk_forward as unknown as { inner: object }).inner).not.toHaveProperty("min_folds");
  });

  it("blocks rolling without a width and causal Mode 1 without inner folds, at the windows step", () => {
    expect(blockingProblems(advanced({ windowMode: "rolling" }), LIMITS)[0]).toMatchObject({ step: "windows" });
    expect(blockingProblems(advanced({}, { optimizationSchedule: "per_fold_causal" }), LIMITS)[0]?.message)
      .toContain("needs inner folds");
    expect(blockingProblems(advanced({ purgeBars: "-1" }), LIMITS)[0]?.message).toContain("purge");
    expect(usesSpecV2(advanced({ labelHorizonBars: "2" }))).toBe(true);
  });
});

describe("CG-P08-03 refusals go to the step that owns the field", () => {
  it("maps requested-spec paths to wizard steps", () => {
    expect(stepForFieldPath(["walk_forward", "train_window"])).toBe("windows");
    expect(stepForFieldPath(["parameter_space_overrides"])).toBe("parameters");
    expect(stepForFieldPath(["optimization_schedule"])).toBe("windows");
    expect(stepForFieldPath(["random_seed"])).toBe("optimization");
    expect(stepForFieldPath(["data", "timeframe"])).toBe("data");
    expect(stepForFieldPath(["client", "engine_release_id"])).toBe("review");
    expect(stepForFieldPath(null)).toBe("review");
  });

  it("carries the server's gate and field path into the refusal", () => {
    const refusal = toPreflightRefusal(new PreflightApiError(
      "sweep dims 9 > 8 — pin params or drop entries.", 409, "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", "req_1",
      { gate: "sweep_ceiling", field_path: ["parameter_space_overrides"] },
    ));
    expect(refusal).toMatchObject({ gate: "sweep_ceiling", fieldPath: ["parameter_space_overrides"], highlightsInput: true });
    const invalid = toPreflightRefusal(new PreflightApiError("Invalid", 400, "RESEARCH_PREFLIGHT_INVALID", null, { field_paths: [["walk_forward", "purge_bars"]] }));
    expect(invalid.fieldPath).toEqual(["walk_forward", "purge_bars"]);
  });

  it("marks the owning step and offers to go there", () => {
    const refusal = toPreflightRefusal(new PreflightApiError(
      "QuantBT 1.1.1 refused this walk-forward plan.", 409, "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", null,
      { gate: "inner_folds", field_path: ["walk_forward", "inner"] },
    ));
    view({ initialStep: "review", preflightRefusal: refusal });
    expect(document.querySelector('[data-step-pill="windows"]')?.getAttribute("data-step-state")).toBe("error");
    fireEvent.click(document.querySelector('[data-action="go-to-refused-step"]') as HTMLElement);
    expect(document.querySelector('[data-step-pill="windows"]')?.getAttribute("aria-current")).toBe("step");
  });
});

describe("G10 — a refusal that names no field is still shown (real-server receipt 2026-09-30)", () => {
  /* The first real preflight against a server refused the request (403, origin not allowed) and the
     screen said nothing: only refusals carrying a `field_path` had somewhere to render. */
  const cases: Array<[string, unknown]> = [
    ["403", new PreflightApiError("Request origin is not allowed.", 403, "RESEARCH_PREFLIGHT_INVALID", "req_o", {})],
    ["503", new PreflightApiError("Preflight is unavailable.", 503, null, "req_u", {})],
    ["transport", new TypeError("offline")],
  ];
  it.each(cases)("shows the %s refusal on the Review step, with no field to fix", (_label, error) => {
    const refusal = toPreflightRefusal(error);
    view({ initialStep: "review", preflightRefusal: refusal });
    const alert = document.querySelector("[data-refusal-field]") as HTMLElement;
    expect(alert, "the refusal must be on screen").not.toBeNull();
    expect(alert.textContent).not.toBe("");
    /* No field, so nothing to navigate to. */
    expect(document.querySelector('[data-action="go-to-refused-step"]')).toBeNull();
    /* The retry stays available: the action is the same button. */
    expect(document.querySelector('[data-action="preflight"]')).not.toBeNull();
  });

  it("reads a 403 as the one neutral sentence and never echoes the server's prose", () => {
    const refusal = toPreflightRefusal(new PreflightApiError("SECRET-SERVER-PROSE", 403, "RESEARCH_PREFLIGHT_INVALID", "r", {}));
    view({ initialStep: "review", preflightRefusal: refusal });
    const text = (document.querySelector("[data-refusal-field]") as HTMLElement).textContent ?? "";
    expect(text).toContain(REFUSAL_COPY.denied);
    expect(text).not.toContain("SECRET-SERVER-PROSE");
  });
});

describe("CG-P08-05 sweep ceiling comes from the release", () => {
  const row = (name: string) => ({ name, declaredLow: 1, declaredHigh: 9, dimension: "sweep" as const, low: "1", high: "9" });
  it("uses the published ceiling, and skips the check when none was published", () => {
    const nine = advanced({}, { parameters: Array.from({ length: 9 }, (_, index) => row(`p${index}`)) });
    expect(validateParameters(nine, LIMITS)).toBe("sweep dims 9 > 8 — pin params or drop entries.");
    expect(validateParameters(nine, { ...LIMITS, sweepCeiling: 10 })).toBeNull();
    expect(validateParameters(nine, { ...LIMITS, sweepCeiling: null })).toBeNull();
  });
});

describe("CG-P08-04 dataset step reads the catalog", () => {
  const catalog: DatasetCatalog = {
    schema_version: "research.dataset-catalog.v1",
    coverage_rule: "Coverage is the month partitions present in the approved reader's storage layout.",
    datasets: [{
      dataset_id: "crypto-binance-1m", venue: "BINANCE", availability: "available", unavailable_reason: null,
      source_class: "historical_market_data", usage_scopes: ["backtest", "research"], excluded_scopes: [],
      source_timezone: "UTC", calendar_policy: "CRYPTO_24_7", timeframes: ["1min", "1h", "4h", "1D"],
      symbols: { state: "PUBLISHED", reason: null, total: 1, truncated: false, items: [
        { symbol: "BTCUSDT", contract_kind: "PERPETUAL", coverage: { first_month: "2020-01", last_month: "2026-09", months: 81, granularity: "MONTH_PARTITION" } },
      ] },
    }],
  };
  it("offers the catalog's datasets and shows the symbol's coverage", () => {
    view({ initialStep: "data", catalog });
    /* One available dataset: an identity row, not a select. */
    expect(screen.getByLabelText("Dataset").getAttribute("data-dataset-identity")).toBe("crypto-binance-1m");
    expect(document.querySelector("[data-dataset-select]")).toBeNull();
    expect(document.querySelector("[data-symbol-coverage]")?.textContent).toBe("perpetual · 2020-01 → 2026-09 · 81 months");
  });
  it("names an unlisted symbol and a catalog it could not read", () => {
    view({ initialStep: "data", catalog, draft: advanced({}, { symbol: "DOGEUSDT" }) });
    expect(document.querySelector("[data-symbol-unlisted]")?.textContent).toContain("DOGEUSDT is not in this dataset");
    cleanup();
    view({ initialStep: "data", catalog: null, catalogReason: "The historical source cannot publish its dataset catalog right now." });
    expect(document.querySelector("[data-catalog-unread]")?.textContent).toContain("cannot publish");
  });
});

describe("CG-P04-06 route step renders engine facts", () => {
  it("shows the status word, description and method note of the selected route", () => {
    view({ initialStep: "route" });
    expect(document.querySelector('[data-route-card="arbitrage"] [data-route-status]')?.textContent).toBe("6/9");
    expect(document.querySelector('[data-route-desc="signal_notional"]')?.textContent).toBe("Create a signal-notional endpoint.");
    expect(document.querySelector("[data-route-method-note]")?.textContent).toBe("strategy-param route — walk-forward search applies");
  });
});

describe("CG-P11-07 ?from= clone", () => {
  it("copies a run's declaration and re-applies its overrides on the version's table", () => {
    const source = serializeRequestedSpec(advanced({ windowMode: "rolling", trainWindow: "30D" }, {
      parameters: [{ name: "window", declaredLow: 8, declaredHigh: 64, dimension: "pin", low: "20", high: "" }],
    }));
    const copied = draftFromRequestedSpec(source, emptyDraft());
    expect(copied).toMatchObject({ alphaVersionId: "av_delta_1", protocol: "advanced", optunaTrials: "3", randomSeed: "42" });
    expect(copied.walkForward).toMatchObject({ windowMode: "rolling", trainWindow: "30D" });
    const table = applyOverrides(
      [{ name: "window", declaredLow: 8, declaredHigh: 64, dimension: "sweep", low: "8", high: "64" }],
      source.parameter_space_overrides,
    );
    expect(table[0]).toMatchObject({ dimension: "pin", low: "20" });
  });
  it("says copied-from, and types each failure of the read", () => {
    view({ cloneSource: { runId: "rrun_1", state: OK } });
    expect(document.querySelector('[data-clone-source="rrun_1"]')?.textContent).toContain("copied from");
    expect(cloneFailureState("rrun_1", new PortalApiError("x", 409, "RESEARCH_RUN_REQUESTED_SPEC_NOT_RETAINED", null)).reason)
      .toContain("not retained");
    expect(cloneFailureState("rrun_1", new PortalApiError("x", 404, null, null)).reason).toContain("not found");
    expect(cloneFailureState("rrun_1", new PortalApiError("x", 403, null, null)).state).toBe("denied");
  });

  it("E13: the submission names the run it was copied from, once the copy landed", () => {
    /* This is the whole of E13 on the browser side. Without the declaration
       the server stores no `parent_attempt_id`, and Screen 10 reads every
       attempt as ROOT with an empty "diff vs parent" — which is exactly what
       all 33 attempts on the preview do today. */
    expect(runLineageFor(null, { runId: "rrun_1", copied: true }))
      .toEqual({ relation: "CLONE_OF", parent_run_id: "rrun_1" });
  });

  it("E13: names no parent before the copy lands, or when the read failed", () => {
    /* `?from=` in the address is an intention, not a copy. Claiming the
       parent on intention alone would write an edge for a draft the reader
       then filled in by hand. */
    expect(runLineageFor(null, { runId: "rrun_1", copied: false })).toBeNull();
    expect(runLineageFor(null, null)).toBeNull();
  });

  it("E13: a what-if fork still wins, cell and all", () => {
    /* `runs/new?from=<run>&fork=<cell>` sets both. SIBLING_OF is the more
       specific claim and must not be downgraded to a plain clone. */
    expect(runLineageFor({ runId: "rrun_1", cellId: "x6y4", ready: true }, { runId: "rrun_1", copied: true }))
      .toEqual({ relation: "SIBLING_OF", parent_run_id: "rrun_1", what_if_cell_id: "x6y4" });
    /* A fork whose grid could not be read falls back to the plain copy, not
       to a sibling with no node behind it. */
    expect(runLineageFor({ runId: "rrun_1", cellId: "x6y4", ready: false }, { runId: "rrun_1", copied: true }))
      .toEqual({ relation: "CLONE_OF", parent_run_id: "rrun_1" });
  });
});

describe("CG-P08-03/05/06 preflight panel", () => {
  it("renders the server's gates, ceilings, per-window gap scan and the read-only seal", () => {
    render(<PreflightPanel preflight={PREFLIGHT} state={OK} />);
    expect(document.querySelectorAll("[data-preflight-gate]").length).toBe(PREFLIGHT.gates!.length);
    expect(document.querySelector('[data-preflight-gate="sweep_ceiling"]')?.getAttribute("data-gate-state")).toBe("PASS");
    expect(document.querySelector('[data-gap-window="holdout"]')?.textContent).toContain("content unread");
    expect(document.querySelector('[data-gap-window="IS"]')?.getAttribute("data-gap-verdict")).toBe("PASS");
    expect(document.querySelector('[data-holdout-seal="SEALED"]')?.textContent).toContain("OWNER_SCOPE_REQUIRED");
    expect(document.querySelector('[data-fact="ceilings"]')?.textContent).toContain("sweep dims 0/8");
  });
});

describe("CG-P07-03/04 Screen 14 mirror and gates", () => {
  const mirror: SourceResponse["mirror"] = [
    { field: "strategy_id", state: "server_assigned", check: "NOT_APPLICABLE", gate: null, note: "Assigned at registration as the alpha_id (DQ-07); never read from the file." },
    { field: "version", state: "parsed", value: "0.3.0", check: "PASS", gate: "contract-complete", note: "Semantic version." },
    { field: "artifact.digest", state: "server_computed", value: "sha256:abc", check: "PASS", gate: null, note: "Server computed." },
    { field: "output_contract", state: "not_in_contract", check: "NOT_APPLICABLE", gate: null, note: "Not part of the v1 single-file contract (DQ-05); nothing is inferred for it." },
  ];
  const baseProps = (overrides: Partial<AlphaImportProps> = {}): AlphaImportProps => ({
    sourceText: "x", fileName: "alpha.py", onSourceChange: vi.fn(), onMultiFileRejected: vi.fn(),
    parse: { schema_version: "research.alpha-source.v1", source_file_ref: "sfr_1", expires_at_utc_ms: 4102444800000, source_digest: "a".repeat(64), analysis_digest: "b".repeat(64), parse_ok: true, mirror },
    gates: null, registration: null, activation: null, registry: [],
    parseState: OK, gatesState: awaitingStep("Gates run once a source parses."), registerState: awaitingStep("Registration opens once all seven gates pass."),
    registryState: OK, refusal: null, alphaId: "", onAlphaIdChange: vi.fn(), onParse: vi.fn(), onRunGates: vi.fn(),
    onRegister: vi.fn(), onActivate: vi.fn(), activationAdmitted: false, ...overrides,
  });

  it("shows each field's source, gate verdict and never a value the v1 file cannot carry", () => {
    render(<AlphaImport {...baseProps()} />);
    expect(document.querySelector('[data-mirror-field="version"]')?.getAttribute("data-mirror-check")).toBe("PASS");
    expect(document.querySelector('[data-mirror-field="version"]')?.textContent).toContain("contract-complete");
    const notInContract = document.querySelector('[data-mirror-field="output_contract"]') as HTMLElement;
    expect(notInContract.textContent).toContain("not in v1");
    // Its typed absence, and nothing that reads as a value.
    expect(notInContract.querySelector("dd")?.textContent).toBe("not in v1");
    expect(notInContract.querySelector("dd [data-absent]")?.getAttribute("data-absent")).toBe("not_in_contract");
    expect(document.querySelector('[data-mirror-field="artifact.digest"] dd')?.textContent).toBe("sha256:abc");
  });

  it("shows RUNNING for all seven gates while the one gates request is in flight", () => {
    render(<AlphaImport {...baseProps({ busyStep: "gates" })} />);
    const running = document.querySelectorAll('[data-gates-running] [data-gate-state="RUNNING"]');
    expect(running).toHaveLength(7);
    expect(running[0]?.querySelector('[data-motion="pulse"]')).toBeTruthy();
  });

  it("formats analyser time per gate and names Control API's registry lookup", () => {
    const base: GateRow = { n: 1, name: "contract-complete", state: "PASS", message: "ok", ms: 0 };
    expect(gateTiming({ ...base, timing_source: "ANALYSER", analyser_us: 214 })).toBe("214 µs · analyser");
    expect(gateTiming({ ...base, timing_source: "ANALYSER", analyser_us: 2140 })).toBe("2.1 ms · analyser");
    expect(gateTiming({ ...base, n: 3, name: "digest-unique", timing_source: "CONTROL_API", analyser_us: null, ms: 2 })).toBe("2 ms · registry");
    expect(gateTiming({ ...base, state: "SKIPPED" })).toBeNull();
  });
});
