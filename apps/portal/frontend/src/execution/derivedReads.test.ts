/**
 * Phase 4 · four published reads that no screen was calling.
 *
 * Each test loads the **canonical fixture copied from dev's own answer**,
 * including the empty ones: a source that has published nothing must leave the
 * screen saying nothing, not showing an invented row.
 */
import { describe, expect, it } from "vitest";

import {
  readApprovalHistoryEnvelope,
  readConditionalGroup,
  readSourceHealthRead,
} from "./derivedReads";
import { APPROVAL_HISTORY, CONDITIONAL_GROUP, SOURCE_HEALTH_READ } from "./derivedReads.fixtures";
import { createFixtureApi } from "./api/fixtureApi";

describe("source health, read directly rather than inferred", () => {
  it("keeps every profile's own environment, state and reason", () => {
    const health = readSourceHealthRead(SOURCE_HEALTH_READ)!;
    expect(health.state).toBe("PARTIAL");
    expect(health.profiles.map((p) => p.environment)).toEqual(["paper", "sandbox", "live"]);
    expect(health.profiles[0]).toMatchObject({ profileId: "PAPER_BINANCE_USDM", completeness: "PARTIAL" });
  });

  it("refuses a payload of another schema rather than half-reading it", () => {
    expect(readSourceHealthRead({ ...SOURCE_HEALTH_READ, schema_version: "other.v1" })).toBeNull();
    expect(readSourceHealthRead(null)).toBeNull();
  });

  it("drops a profile row with no environment instead of guessing one", () => {
    const raw = structuredClone(SOURCE_HEALTH_READ) as Record<string, unknown>;
    (raw.profiles as Record<string, unknown>[])[1].environment = null;
    expect(readSourceHealthRead(raw)!.profiles.map((p) => p.environment)).toEqual(["paper", "live"]);
  });
});

describe("approval history — the decided list finally has a source", () => {
  it("reads the envelope and leaves the rows to the parser that owns them", () => {
    const envelope = readApprovalHistoryEnvelope(APPROVAL_HISTORY)!;
    // Dev has taken no decision: zero rows is the answer, not a gap.
    expect(envelope.rawRows).toEqual([]);
    expect(envelope.totalCount).toBe(0);
    expect(envelope.deliveryProfile).toBe("fixture");
  });

  it("comes through the port as a page with the server's own count", async () => {
    const result = await createFixtureApi().getApprovalHistory();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rows).toEqual([]);
      expect(result.value.totalCount).toBe(0);
    }
  });
});

describe("conditional order group", () => {
  it("reads the legs the server published", () => {
    const group = readConditionalGroup(CONDITIONAL_GROUP)!;
    expect(group.groupId).toBe("1");
    expect(group.contingency).toBe("OCO");
    expect(group.legs.map((leg) => leg.role)).toEqual(["TAKE_PROFIT", "STOP"]);
  });

  it("drops a leg with no identifier of any kind", () => {
    const raw = structuredClone(CONDITIONAL_GROUP) as Record<string, unknown>;
    const data = raw.data as Record<string, unknown>;
    (data.legs as Record<string, unknown>[])[0] = { role: "TAKE_PROFIT" };
    expect(readConditionalGroup(raw)!.legs).toHaveLength(1);
  });
});

describe("the port answers all four", () => {
  it("exposes them, so a screen has something to call", async () => {
    const api = createFixtureApi();
    expect(typeof api.getSourceHealthRead).toBe("function");
    expect(typeof api.getApprovalHistory).toBe("function");
    expect(typeof api.getBindingDetail).toBe("function");
    expect(typeof api.getConditionalGroup).toBe("function");
    const health = await api.getSourceHealthRead();
    expect(health.ok && health.value.profiles).toHaveLength(3);
  });
});
