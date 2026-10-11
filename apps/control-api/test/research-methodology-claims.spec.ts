import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ResearchEngineAtlasPrivateSchema } from "../src/research/foundation.contract";
import { MethodologyClaimSchema, ResearchMethodologyClaimsService, projectEvidenceClaimStrip, projectMethodologyClaims } from "../src/research/methodology-claims";

// The isolated Control API cell mounts the canonical contracts at /contracts.
const atlasFixturePath = process.env.PORTAL_CONTRACTS_DIR
  ? join(process.env.PORTAL_CONTRACTS_DIR, "fixtures", "research-foundation.atlas-current.valid.json")
  : new URL("../../../packages/contracts/fixtures/research-foundation.atlas-current.valid.json", import.meta.url);
const atlasFixture = JSON.parse(readFileSync(atlasFixturePath, "utf8")) as { atlas: unknown };
const atlas = ResearchEngineAtlasPrivateSchema.parse(atlasFixture.atlas);
const sealFixture = JSON.parse(readFileSync(new URL("./research-w3-real-hmd-seal.fixture.json", import.meta.url), "utf8")) as { summary: Record<string, unknown> };
const identity = { releaseId: "er_quantbt_111", mode: "mode_1_decay", schedule: "global" };

describe("CG-FG-S03-02/S04-01 shared methodology claim projection", () => {
  it("uses authorized same-snapshot facts, including absence, without a second read", async () => {
    const claimFactsForRead = vi.fn().mockResolvedValue(sealFixture.summary);
    const service = new ResearchMethodologyClaimsService({ read: vi.fn().mockResolvedValue(atlas) } as never,
      { claimFactsForRead } as never);
    const actor = { userId: "caller", role: "USER" } as never, scope = { workspaceId: "ws_claim", actorUserId: "caller" };
    expect(await service.read(actor, scope, "run_claim", identity, true, "PROGRESS", sealFixture.summary))
      .toEqual(projectMethodologyClaims(atlas, sealFixture.summary, identity));
    expect((await service.read(actor, scope, "run_claim", identity, true, "PROGRESS", null))
      .every(c => c.state !== "ISSUED")).toBe(true);
    expect(claimFactsForRead).not.toHaveBeenCalled();
    await service.read(actor, scope, "run_claim", identity, true);
    expect(claimFactsForRead).toHaveBeenCalledOnce();
  });
  it("projects the same claims from the narrow sealed groups without fetching analytics", () => {
    const full = sealFixture.summary.source_facts!;
    const narrow = { source_facts: { schema_version: full.schema_version, claims: full.claims, execution: full.execution } };
    expect(projectMethodologyClaims(atlas, narrow, identity)).toEqual(projectMethodologyClaims(atlas, sealFixture.summary, identity));
    expect(projectEvidenceClaimStrip(atlas, narrow, identity)).toEqual(projectEvidenceClaimStrip(atlas, sealFixture.summary, identity));
    expect(projectMethodologyClaims(atlas, { source_facts: { ...narrow.source_facts, claims: {} } }, identity)
      .every(claim => claim.state !== "ISSUED")).toBe(true);
  });
  it('never forecasts WFO optimization from a fixed native compatibility mode',()=>{
    const claims=projectMethodologyClaims(atlas,null,{...identity,executionProfileId:'p10.delta-reactive-fixed-1h.v1'});
    expect(claims.map(c=>c.state)).toEqual(['NOT_PUBLISHED','NOT_PUBLISHED','NOT_PUBLISHED','NOT_APPLICABLE']);
    expect(claims.every(c=>c.text===null)).toBe(true);
    expect(MethodologyClaimSchema.array().parse(claims)).toHaveLength(4);
  });
  it("shows four Atlas forecasts before a source seal, never four invented issued claims", () => {
    const claims = projectMethodologyClaims(atlas, null, identity);
    expect(MethodologyClaimSchema.array().length(4).safeParse(claims).success).toBe(true);
    expect(claims.map((claim) => claim.state)).toEqual(["FORECAST", "FORECAST", "FORECAST", "FORECAST"]);
    expect(claims.map((claim) => claim.text)).toEqual([
      "walk_forward_oos", "not_causal_multi_fold_global_calibration", "retrospective_global_calibration", "USED",
    ]);
  });

  it("promotes only source-attested, sealed WFO facts to ISSUED", () => {
    const claims = projectMethodologyClaims(atlas, sealFixture.summary, identity);
    expect(claims.map((claim) => claim.state)).toEqual(["ISSUED", "ISSUED", "ISSUED", "ISSUED"]);
    expect(claims.every((claim) => claim.source === "SEALED_QUANTBT_CLAIM")).toBe(true);
    const withoutFactBlock = { ...sealFixture.summary, source_facts: undefined };
    expect(projectMethodologyClaims(atlas, withoutFactBlock, identity).every((claim) => claim.state === "FORECAST")).toBe(true);
  });

  it("does not substitute the current Atlas for a historical release or an unknown pair", () => {
    for (const other of [
      { ...identity, releaseId: "er_quantbt_108" },
      { ...identity, schedule: "unknown" },
    ]) {
      const claims = projectMethodologyClaims(atlas, null, other);
      expect(claims.every((claim) => claim.state === "NOT_PUBLISHED" && claim.text === null)).toBe(true);
    }
  });

  it("serves all seven S04 cells, keeping P04-only source gaps typed", () => {
    const wfo = projectEvidenceClaimStrip(atlas, sealFixture.summary, { ...identity, routeId: "signal_notional" });
    expect(MethodologyClaimSchema.array().length(7).safeParse(wfo).success).toBe(true);
    expect(wfo.map((claim) => claim.kind)).toEqual([
      "VALIDATION", "CHRONOLOGY", "OOS_SELECTION", "HOLDOUT_STATE",
      "CAUSALITY", "EXECUTION_CONTRACT", "RUNTIME_AUTHORITY",
    ]);
    expect(wfo[3]).toMatchObject({ state: "NOT_APPLICABLE", reason_code: "P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT" });
    expect(wfo[5]).toMatchObject({ state: "ISSUED", text: "close_target_v2" });
    expect(wfo[6]).toMatchObject({ state: "ISSUED", text: "native_vectorized" });
    const p04 = projectEvidenceClaimStrip(atlas, null, { ...identity, routeId: "signal_notional" });
    expect(p04).toHaveLength(7);
    expect(p04[3]).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "P04_HOLDOUT_SEAL_NOT_IN_EVIDENCE_HUB" });
    expect(p04[6]).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RUNTIME_AUTHORITY_NOT_PUBLISHED_FOR_RUN" });
    expect(p04.every((claim) => claim.state !== "ISSUED")).toBe(true);
  });
});
