import { describe, expect, it } from "vitest";
import {
  R3_REALTIME_DR_CONTRACT,
  R3_REALTIME_DR_SCENARIOS,
  r3RealtimeDrEvidence,
} from "../src/execution/r3-realtime-dr-contract";

describe("R3-2 local realtime and DR contract", () => {
  it("covers every required failure and lifecycle case without promoting Portal observation to source replay", () => {
    expect(R3_REALTIME_DR_CONTRACT.scenarios.map((record) => record.scenario).sort())
      .toEqual([...R3_REALTIME_DR_SCENARIOS].sort());
    expect(new Set(R3_REALTIME_DR_CONTRACT.scenarios.map((record) => record.scenario)).size)
      .toBe(R3_REALTIME_DR_SCENARIOS.length);
    for (const record of R3_REALTIME_DR_CONTRACT.scenarios) {
      expect(record.sourceReadAmplificationAllowed).toBe(false);
      expect(record.sourceReplayClaimed).toBe(false);
    }
    expect(R3_REALTIME_DR_CONTRACT.realtimeAuthority).toEqual({
      source: "PORTAL_LOCAL_POSTGRES_PROJECTION_JOURNAL",
      browserDirectEdgeOrSourceAccess: false,
      ownerEventReplayOrGlobalOrderingClaimed: false,
      cursor: "PORTAL_LOCAL_EPOCH_SEQUENCE",
    });
  });

  it("pins bounded local cost and leaves deployment-specific evidence for R3-4 instead of faking it", () => {
    expect(R3_REALTIME_DR_CONTRACT.boundedOperation).toEqual({
      localTailPollMs: 250,
      healthPollMs: 1000,
      maximumScopeGroups: 16,
      maximumSubscribersPerScope: 256,
      maximumPendingPerScope: 32,
    });
    expect(R3_REALTIME_DR_CONTRACT.deploymentCandidate).toEqual({
      state: "READY_FOR_R3_4_TWO_PROCESS_DEV_EVIDENCE",
      rollback: "IMAGE_ONLY_FORWARD_MIGRATIONS_NO_VOLUME_DELETE",
      evidenceNotClaimedByThisContract: ["TWO_OS_PROCESS", "BROWSER_DOM", "DEPLOYED_IMAGE_DIGEST"],
    });
    const evidence = r3RealtimeDrEvidence();
    expect(evidence.contract_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.scenario_count).toBe(12);
  });
});
