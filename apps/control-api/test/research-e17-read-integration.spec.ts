/** E17 current-source reader tests, explicitly fixture-backed, not product receipts. */
import { describe, expect, it, vi } from "vitest";
import { ResearchSearchService } from "../src/research/search.service";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { IMPORTED_ALPHA_ADAPTER_ID, IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_PROFILE_ID, IMPORTED_ALPHA_PROFILE_DIGEST } from "../src/research/imported-alpha.profile";
import { importedAlphaReadBinding } from "../src/research/imported-alpha.read-binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { SplitHubRow } from "../src/research/split.repository";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { p04Requested } from "./research-w1-wfo.fixture";
import { openApiValidator } from "./research-rf05-openapi";

const scope = { workspaceId: "e17-read-workspace", actorUserId: "e17-read-owner" };
const parameters = { window: 32, regime: "normal", exposure: 0.5 };
function importedRow(): SplitHubRow {
  const requested = p04Requested({ alpha_binding: { alpha_id: "e17-alpha", alpha_version_id: "av_e17_read" },
    strategy_id: "e17-alpha", parameter_space_overrides: [
      { name: "window", kind: "pin", value: 32 }, { name: "regime", kind: "pin", value: "normal" }], random_seed: 7 });
  const source = structuredClone(p14SplitSourceFixture()) as any;
  source.source.execution_adapter_id = IMPORTED_ALPHA_ADAPTER_ID;
  source.source.imported_source_digest = "7".repeat(64);
  source.protocol.selection.parameter_bundle_digest = sha256ResearchJson(parameters);
  source.windows.outer_oos.evaluation_state = "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE";
  return {
    kind: "DURABLE", runId: "rrun_e17_read", adapterContractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    executionProfileId: IMPORTED_ALPHA_PROFILE_ID,
    requestedSpecDigest: sha256ResearchJson(requested), effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64), manifestDigest: source.source.manifest_digest,
    importedAlphaVersion: { alphaVersionId: "av_e17_read", sourceDigest: "7".repeat(64), entrypoint: "generate_signals",
      declaredContract: { schema_version: "research.alpha-source.v1", entrypoint: "generate_signals", timeframes: ["1h"],
        required_columns: ["close"], warmup_bars: 32, determinism: { seed_required: true }, parameter_space: {
          window: { kind: "int_range", low: 8, high: 64, step: 1 }, regime: { kind: "categorical", values: ["normal", "stress"] },
          exposure: { kind: "fixed", value: 0.5 } } } },
    legacyRequest: { research: { requested_spec: requested, execution_profile_digest: IMPORTED_ALPHA_PROFILE_DIGEST,
      imported_source_digest: "7".repeat(64), imported_entrypoint: "generate_signals", imported_parameters: parameters } },
    progressSnapshot: null, jobState: "SUCCEEDED", revision: "p14r1_" + "f".repeat(64),
    projection: { schema_version: "research.split-projection.v1", source }, readiness: "PARTIAL",
    sourceSplitDigest: sha256ResearchJson(source), receivedAt: new Date("2026-09-27T00:00:00Z"),
    datasetBinding: null, sourceAsOfUtcMs: Date.parse("2026-09-27T00:00:00Z"),
    sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT", asOfUtcMs: Date.parse("2026-09-27T00:00:00Z"),
  };
}

describe("E17 immutable imported read alignment", () => {
  it("serves a real fixed-only declaration without inventing numeric ranges", async () => {
    const row = importedRow(); const work = (row.legacyRequest as any).research;
    work.imported_parameters = { scale: 1000 };
    work.requested_spec.parameter_space_overrides = [];
    row.requestedSpecDigest = sha256ResearchJson(work.requested_spec);
    (row.importedAlphaVersion!.declaredContract as any).parameter_space = { scale: { kind: "fixed", value: 1000 } };
    (row.projection as any).source.protocol.selection.parameter_bundle_digest = sha256ResearchJson(work.imported_parameters);
    const search = await new ResearchSearchService({ hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never).detail(scope, row.runId, {});
    expect(search.availability.state).toBe("AVAILABLE");
    expect(search.fixed_profile.parameters).toEqual([]);
    expect(search.imported_alpha?.parameters).toEqual([{ name: "scale", kind: "fixed", value: 1000 }]);
    openApiValidator("research-search.openapi.json", "SearchDetail").assert(search);
  });

  it("Search exposes the actual declaration/pins, not the P04 release parameters", async () => {
    const row = importedRow();
    const search = await new ResearchSearchService({ hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never).detail(scope, row.runId, {});
    expect(search.availability.state).toBe("AVAILABLE");
    expect(search.provenance.source_adapter_id).toBe(IMPORTED_ALPHA_ADAPTER_ID);
    expect(search.fixed_profile.parameters.map((parameter) => parameter.name)).toEqual(["window"]);
    expect(search.imported_alpha?.parameters).toEqual([
      { name: "exposure", kind: "fixed", value: 0.5 }, { name: "regime", kind: "categorical", value: "normal" },
      { name: "window", kind: "int_range", value: 32 }]);
    expect(search.claim_row.oos_column.source_evaluation_state).toBe("IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE");
    openApiValidator("research-search.openapi.json", "SearchDetail").assert(search);
  });
  it("Freeze compares child source + pins; the shared adapter digest is not a source-code hash", async () => {
    const row = importedRow();
    const freeze = await new ResearchFreezeService({ hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_FREEZE: "true" } as never).detail(scope, row.runId, {});
    expect(freeze.availability.state).toBe("AVAILABLE");
    expect(freeze.freeze.integrity.checks).toHaveLength(4);
    expect(freeze.freeze.integrity.checks.every((check) => check.state === "MATCH")).toBe(true);
    expect(freeze.stage4_binding).toMatchObject({ lane: "IMPORTED_FIXED_QUALIFICATION", state: "BOUND" });
    expect(freeze.parameter_authority.code_fixed).toMatchObject({ hash_scope: "SOURCE_CODE_SHA256", code_digest: "7".repeat(64), state: "NOT_PUBLISHED" });
    openApiValidator("research-freeze.openapi.json", "FreezeDetail").assert(freeze);
  });
  it("blocks a retained child-source mismatch without replacing expected bytes", async () => {
    const row = importedRow(); (row.projection as any).source.source.imported_source_digest = "8".repeat(64);
    const freeze = await new ResearchFreezeService({ hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_FREEZE: "true" } as never).detail(scope, row.runId, {});
    expect(freeze.freeze.integrity.state).toBe("BLOCKED");
    expect(freeze.stage4_binding.state).toBe("DRIFT");
    expect(freeze.imported_alpha?.source_digest).toBe("7".repeat(64));
  });
  it("refuses a P04 sidecar being presented as an imported-run adapter", async () => {
    const row = importedRow(); (row.projection as any).source.source.execution_adapter_id = "p04.delta-rsi.v1";
    await expect(new ResearchFreezeService({ hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_FREEZE: "true" } as never).detail(scope, row.runId, {}))
      .rejects.toMatchObject({ code: "RESEARCH_FREEZE_UNAVAILABLE", status: 503 });
  });
  it.each(["version", "source", "parameter", "categorical", "profile"])("rejects immutable %s drift", (kind) => {
    const row = importedRow(); const work = (row.legacyRequest as any).research;
    if (kind === "version") row.importedAlphaVersion!.alphaVersionId = "av_other";
    if (kind === "source") work.imported_source_digest = "8".repeat(64);
    if (kind === "parameter") work.imported_parameters = { ...parameters, exposure: 9 };
    if (kind === "categorical") work.imported_parameters = { ...parameters, regime: "stress" };
    if (kind === "profile") work.execution_profile_digest = "8".repeat(64);
    expect(importedAlphaReadBinding(row)).toBeNull();
  });
});
