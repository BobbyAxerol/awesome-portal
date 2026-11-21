/** Opt-in projection of the actual confined HMD child; never a synthetic receipt. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CurrentSourceFactsSchema } from "../src/research/current-source.payload";
import { readSamplerEvidence } from "../src/research/sampler-evidence.read";

const sourceHome = process.env.PORTAL_SAMPLER_REAL_SOURCE_RECEIPT_DIR;
describe.runIf(Boolean(sourceHome))("actual HMD child sampler retained-source BFF projection", () => {
  it("validates the real retained source facts and exact bytes before projecting available sampler facts", () => {
    const source = JSON.parse(readFileSync(join(sourceHome!, "research-w5b-real-replay.fixture.json"), "utf8"));
    // This existing HMD harness has a synthetic run identity. Validate the actual
    // retained source block, not unrelated run-ID fields of the product envelope.
    const facts = CurrentSourceFactsSchema.parse(source.summary.source_facts);
    const captured = facts.search.sampler_trace;
    expect(captured?.state).toBe("AVAILABLE");
    const original = readFileSync(join(sourceHome!, "sampler-public-trace.real.json"));
    expect(createHash("sha256").update(original).digest("hex")).toBe(captured?.artifact_sha256);
    expect(original.byteLength).toBe(captured?.size_bytes);
    const evidence = readSamplerEvidence(null, "0".repeat(64), source.table_rows.TRIAL, captured);
    expect(evidence.execution_trace).toMatchObject({ state: "AVAILABLE", capture: {
      recorded_trial_count: 3, invocation_count: 36, study_count: 1,
      studies: [{ source_study_id: "0", sampler_class: "TPESampler", pruner_class: "DuplicatePruner" }],
    } });
    expect(evidence.requested_configuration.state).toBe("NOT_PUBLISHED");
    expect(evidence.internal_trace.state).toBe("NOT_PUBLISHED");
    expect(evidence.execution_trace?.capture?.recorded_trial_count).toBe(source.table_rows.TRIAL);
  });
});
