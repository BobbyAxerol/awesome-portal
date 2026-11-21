/**
 * W3b · the lane decision and the run identity, on the real served bodies of
 * rrun_c860aac790d71981d49fb76b9287138b (Delta signal-notional WFO).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HUB_LANE_REASON,
  isHubLaneReason,
  isRetainedAnswer,
  protocolLabel,
  retainedReadiness,
  walkForwardOf,
} from "./retainedLane";
import type { ProgressRead, RunRequestedSpec } from "./progressClient";

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8"));
const W3 = read("w3RealWfo.fixture.json") as Record<string, unknown>;
const W3B = read("w3bRealWfo.fixture.json") as Record<string, unknown> & {
  progress: ProgressRead;
  requested_spec: RunRequestedSpec;
};

/** The typed 200 the retained lane answers for a P04 fixed-qualification run. */
const NOT_APPLICABLE = {
  schema_version: "research.current-source-not-applicable.v1",
  read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
  run_id: "R-WFO-118",
  revision: "rs02_not-applicable_b31f",
  etag: '"rs02_not-applicable_b31f"',
  availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
  lane: {
    state: "NOT_APPLICABLE",
    operation: "split",
    run_profile: "P04_FIXED_QUALIFICATION",
    retainable_profile_id: "rs02.delta-wfo-global.v1",
    reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION",
  },
};

describe("isRetainedAnswer", () => {
  it("is true for every retained AVAILABLE body the lane served", () => {
    for (const body of [W3.evidence, W3.search, W3.split, W3.series, W3B.freeze, W3B.replay]) {
      expect(isRetainedAnswer(body)).toBe(true);
    }
  });

  it("is false for the hub's bodies, the not-applicable answer and non-objects", () => {
    for (const body of [W3B.hub_evidence, W3B.hub_split, W3B.hub_search, W3B.hub_freeze]) {
      expect(isRetainedAnswer(body)).toBe(false);
    }
    expect(isRetainedAnswer(NOT_APPLICABLE)).toBe(false);
    expect(isRetainedAnswer(null)).toBe(false);
    expect(isRetainedAnswer("PORTAL_RETAINED_CURRENT_SOURCE")).toBe(false);
    expect(isRetainedAnswer({ read_authority: "PORTAL_RETAINED_CURRENT_SOURCE", availability: null })).toBe(false);
  });
});

describe("isHubLaneReason", () => {
  it("recognises P04-hub reason codes", () => {
    for (const code of [
      "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
      "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED",
      "P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED",
      "P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE",
      "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS",
    ]) {
      expect(isHubLaneReason(code), code).toBe(true);
    }
  });

  it("leaves the retained lane's own codes and non-strings alone", () => {
    for (const code of [
      "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS",
      "P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT",
      "RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET",
      "UI_RETAINED_LANE_HAS_NO_FIELD",
    ]) {
      expect(isHubLaneReason(code), code).toBe(false);
    }
    expect(isHubLaneReason(null)).toBe(false);
    expect(isHubLaneReason(undefined)).toBe(false);
  });

  it("the hub bodies carry these codes; the retained bodies carry none", () => {
    for (const key of ["hub_evidence", "hub_split", "hub_search", "hub_freeze"]) {
      expect(JSON.stringify(W3B[key]), key).toMatch(HUB_LANE_REASON);
    }
    for (const body of [W3.evidence, W3.search, W3.split, W3B.freeze, W3B.replay, W3B.progress, W3B.requested_spec]) {
      expect(JSON.stringify(body)).not.toMatch(HUB_LANE_REASON);
    }
  });
});

describe("retainedReadiness", () => {
  it("is READY for the fixture's progress (materialized READY, mandatory SEALED)", () => {
    expect(retainedReadiness(W3B.progress)).toBe("READY");
  });

  it("is NOT_READY when the mandatory bundle is not sealed, or materialization is still PENDING", () => {
    const unsealed = {
      ...W3B.progress,
      progress: { ...W3B.progress.progress, readiness: { ...W3B.progress.progress!.readiness, mandatory: "PENDING" } },
    } as ProgressRead;
    expect(retainedReadiness(unsealed)).toBe("NOT_READY");
    const unmaterialized = {
      ...W3B.progress,
      current: { ...W3B.progress.current, terminal_materialization: "PENDING" },
    } as ProgressRead;
    expect(retainedReadiness(unmaterialized)).toBe("NOT_READY");
  });

  it("is null without a progress read", () => {
    expect(retainedReadiness(null)).toBeNull();
  });
});

describe("walkForwardOf / protocolLabel", () => {
  it("reads the admitted requested spec field by field", () => {
    expect(walkForwardOf(W3B.requested_spec)).toEqual({
      protocol: "advanced",
      frequency: "weekly",
      windowMode: "expanding",
      start: "2026-06-01T00:00:00Z",
      endExclusive: "2026-07-15T00:00:00Z",
      seed: 42,
      trials: 3,
    });
  });

  it("is all null without a requested spec", () => {
    expect(walkForwardOf(null)).toEqual({
      protocol: null,
      frequency: null,
      windowMode: null,
      start: null,
      endExclusive: null,
      seed: null,
      trials: null,
    });
  });

  it("labels the protocol from the published tokens only", () => {
    const window = walkForwardOf(W3B.requested_spec);
    expect(protocolLabel(window, W3B.progress.run?.protocol ?? null)).toBe("advanced walk-forward · weekly · expanding");
    expect(protocolLabel(window, null)).toBe("advanced walk-forward · weekly · expanding");
    expect(protocolLabel({ ...window, windowMode: null }, "advanced")).toBe("advanced walk-forward · weekly");
    expect(protocolLabel(walkForwardOf(null), "basic")).toBe("basic");
    expect(protocolLabel(walkForwardOf(null), null)).toBeNull();
  });
});
