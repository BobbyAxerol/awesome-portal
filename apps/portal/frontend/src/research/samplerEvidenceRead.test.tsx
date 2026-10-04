import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SamplerEvidenceRead } from "./SamplerEvidenceRead";
import type { CurrentSourceSearch } from "./searchClient";
import publicTraceFixture from "../../../../../packages/contracts/fixtures/research-sampler-execution-trace.valid.json";

const fact: NonNullable<CurrentSourceSearch["sampler_evidence"]> = {
  schema_version: "research.sampler-evidence.v1",
  requested_configuration: { state: "AVAILABLE", scope: "RUN_REQUESTED_SPEC", reason_code: null,
    source_ref: "IMMUTABLE_RUN_REQUESTED_OPTIMIZER_CONFIG_V1", requested_spec_digest: "a".repeat(64),
    optimization_config: { name: "custom_sampler", enabled: false, trials: 400 }, random_seed: 42 },
  internal_trace: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE", source_ref: "QUANTBT_1_1_1_RETAINED_NATIVE_WFO_RESULT_V2" },
  observed_trials: { state: "AVAILABLE", scope: "RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE", source_ref: "SEALED_RETAINED_TRIAL_LEDGER_V1", source_trial_count: 400 },
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("sampler request facts are not sampler internal trace", () => {
  it("shows actual sampler calls and disclosed samples without claiming private densities or launching compute", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const trace: NonNullable<NonNullable<CurrentSourceSearch["sampler_evidence"]>["execution_trace"]> = {
      state: "AVAILABLE", reason_code: null, scope: "OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY",
      source_ref: "SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1",
      capture: { ...publicTraceFixture.capture, schema_version: "research.sampler-public-observer.v1", state: "AVAILABLE",
        scope: "OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY", engine_version: "1.1.1",
        studies: [{ observer_study_index: 0, source_study_id: "0", sampler_class: "TPESampler", pruner_class: "NopPruner",
          directions: ["MAXIMIZE"], effective_configuration_state: "NOT_PUBLISHED" }], sample_trials: [{
          observer_study_index: 0, source_study_id: "0", trial_number: 0, started_at_utc_ms: 1791158400000,
          completed_at_utc_ms: 1791158400100, state: "COMPLETE", invocation_kinds: ["sample_independent"],
          invocation_count: 5, returned_parameters: { window: "32" }, values: ["0.25"] }] },
    };
    const { container } = render(<SamplerEvidenceRead fact={{ ...fact, execution_trace: trace }} />);
    expect(container.querySelector('[data-sampler-execution-trace="AVAILABLE"]')?.textContent).toContain("TPESampler · 1 observed trials · 5 sampler calls");
    expect(container.querySelector("[data-sampler-trace-samples]")?.getAttribute("title")).toContain('"window":"32"');
    expect(container.textContent).toContain("TPE density/ranking internals: not published");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows historical absence instead of reconstructing a sampler from the trial ledger", () => {
    const { container } = render(<SamplerEvidenceRead fact={{ ...fact, execution_trace: {
      state: "NOT_PUBLISHED", scope: "OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY", source_ref: "SEALED_CHILD_OPTUNA_PUBLIC_HOOK_CAPTURE_V1",
      reason_code: "SAMPLER_PUBLIC_HOOK_TRACE_NOT_RECORDED", capture: null } }} />);
    expect(container.querySelector("[data-sampler-execution-trace]")?.textContent).toContain("not recorded for this run");
    expect(container.textContent).not.toContain("TPESampler");
  });
  it("renders actual immutable configuration and seed with their request scope, retaining explicit trace absence", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { container } = render(<p><SamplerEvidenceRead fact={fact} /></p>);
    expect(container.querySelector("[data-sampler-configuration-values]")?.textContent).toBe("name custom_sampler · enabled false · trials 400 · random seed 42");
    expect(container.querySelector("[data-sampler-configuration]")?.getAttribute("title")).toContain("RUN_REQUESTED_SPEC");
    expect(container.querySelector("[data-sampler-internal-trace]")?.getAttribute("title")).toContain(fact.internal_trace.reason_code);
    expect(container.textContent).toContain("400 retained trials · not an internal trace");
    expect(container.textContent).not.toContain("release default");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("missing request remains typed absence with no guessed default or seed", () => {
    const { container } = render(<SamplerEvidenceRead fact={{ ...fact, requested_configuration: { ...fact.requested_configuration, state: "NOT_PUBLISHED", reason_code: "P24_REQUESTED_SPEC_NOT_RECORDED", requested_spec_digest: null, optimization_config: null, random_seed: null } }} />);
    expect(container.querySelector('[data-sampler-configuration="NOT_PUBLISHED"]')?.getAttribute("title")).toContain("P24_REQUESTED_SPEC_NOT_RECORDED");
    expect(container.querySelector("[data-sampler-configuration-values]")).toBeNull();
    expect(container.textContent).not.toContain("42");
  });
  it("legacy body preserves the original absence sentence and does not invent a new trace", () => {
    const { container } = render(<SamplerEvidenceRead fallbackCode="SOURCE_NOT_RECORDED" />);
    expect(container.textContent).toBe("sampler: not published");
    expect(container.querySelector("[data-absent]")?.getAttribute("title")).toBe("SOURCE_NOT_RECORDED");
  });
});
