import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SamplerEvidenceRead } from "./SamplerEvidenceRead";
import type { CurrentSourceSearch } from "./searchClient";

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
