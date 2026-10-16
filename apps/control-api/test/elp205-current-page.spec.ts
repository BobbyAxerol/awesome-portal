import { describe, expect, it } from "vitest";
import type { AuthSession, PortalUser } from "../src/domain";
import type { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import { MaximumDataOperationService, type MaximumDataOperationPrincipal } from "../src/execution/maximum-data-operation.service";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import { managerTimestamp } from "../src/execution/manager-timestamp";
import { retainedOperationPage } from "../src/execution/retained-operation-page";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";
import { testConfig } from "./harness";

// TEST_ONLY transport fixtures. No DB, HTTP client, source read or authority activation.
const user: PortalUser = {
  userId: "usr_elp205", username: "elp205", displayName: "ELP2-05", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-10-16T00:00:00.000Z"), updatedAt: new Date("2026-10-16T00:00:00.000Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_elp205", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-10-16T00:00:00.000Z"),
  idleExpiresAt: new Date("2026-10-16T01:00:00.000Z"), absoluteExpiresAt: new Date("2026-10-16T08:00:00.000Z"),
};
const principal: MaximumDataOperationPrincipal = { user, session, workspaceId: "ws_elp205" };
const privateCursor = "private-source-cursor-never-public";
const publicCursor = "mdc1.11111111-1111-4111-8111-111111111111";
const sourceTime = "2026-10-16T00:00:00.123Z";
const text = (value: string) => ({ kind: "TEXT", value });
const timestamp = (value: string) => ({ kind: "TIMESTAMP", value });

function row(id = "dep1", updatedAt = sourceTime, wide = false) {
  const padding = wide ? "x".repeat(4096) : "1";
  return {
    relation: { schema: "public", relation: "strategy_deployments" }, record_key: "private-key",
    fields: {
      deployment_id: text(id), strategy_id: text(padding), account_id: text(padding), portfolio_id: text(padding),
      mode: text("PAPER"), venue: text("BINANCE_USDM"), currency: text("USDT"), state: text("RUNNING"),
      active: { kind: "BOOLEAN", value: true }, created_at: timestamp(sourceTime), updated_at: timestamp(updatedAt),
      unselected_secret: text("must-not-cross"), raw: { kind: "OBJECT", value: { token: "must-not-cross" } },
    },
  };
}

function envelope(items: unknown[] = [row()], asOf = sourceTime) {
  return {
    schema_version: "portal.execution.current-source-bff.v2", authority: "PORTAL_CONTROL_API",
    requested_environment: "paper", source_environment: "paper", profile_id: "PAPER_BINANCE_USDM",
    source: {
      contract_version: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision, authority: "EXECUTION_CELL",
      profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of: asOf,
      data: { relation: { schema: "public", relation: "strategy_deployments" }, items, next_cursor: privateCursor },
    },
  };
}

function fixture(response: unknown) {
  const source = {
    relationForNamedOperation: async () => response,
    relationForCataloguedOperation: async () => response,
  };
  const issued: string[] = [];
  const continuations = {
    issue: async (_scope: unknown, value: string) => { issued.push(value); return publicCursor; },
  };
  return { issued, service: new MaximumDataOperationService(source as unknown as ExecutionCurrentSourceProxy, continuations as never) };
}

describe.each(["deployment", "named relation"] as const)("ELP2-05 current-page %s boundary", lane => {
  function read(service: MaximumDataOperationService, limit: number) {
    const query = { environment: "paper" as const, limit };
    return lane === "deployment" ? service.deploymentPage(principal, query)
      : service.relationPage(principal, "strategy-deployments", query);
  }
  const rejected = lane === "deployment" ? "EDS01_SOURCE_CONTRACT_REJECTED" : "EDS11R_SOURCE_CONTRACT_REJECTED";
  const tooLarge = lane === "deployment" ? "EDS01_RESPONSE_TOO_LARGE" : "EDS11R_RESPONSE_TOO_LARGE";

  it("rejects more rows than the requested page before persisting a continuation", async () => {
    const f = fixture(envelope([row("dep1"), row("dep2")]));
    await expect(read(f.service, 1)).rejects.toMatchObject({ code: rejected, status: 502 });
    expect(f.issued).toEqual([]);
  });

  it.each([
    "2026-10-16T00:00:00", "2026-10-16", "2026-02-30T00:00:00.000Z",
    "2026-10-16T00:00:00.1234567890Z", "2026-10-16T24:00:00.000Z",
    "2026-10-16T00:00:00.000+25:00", "2026-10-16T00:00:00.Z",
    "2026-10-16T00:00:00.000Z\n",
  ])("rejects ambiguous, invalid or unsupported-precision source clock %s", async clock => {
    const f = fixture(envelope([row()], clock));
    await expect(read(f.service, 1)).rejects.toMatchObject({ code: rejected, status: 502 });
    expect(f.issued).toEqual([]);
  });

  it.each([
    ["2026-10-16T00:00:00Z", "2026-10-16T00:00:00.000Z"],
    ["2026-10-16T00:00:00.1Z", "2026-10-16T00:00:00.100Z"],
    ["2026-10-16T00:00:00.123456Z", sourceTime],
    ["2026-10-16T00:00:00.123456789Z", sourceTime],
    ["2026-10-16T00:00:00.123456+07:00", "2026-10-15T17:00:00.123Z"],
    ["2026-10-15T17:00:00.123456-07:00", sourceTime],
  ])("projects source and row clock %s to UTC milliseconds", async (clock, expected) => {
    const f = fixture(envelope([row("dep1", clock)], clock));
    const result = await read(f.service, 1);
    expect(result.source_health.as_of_ms).toBe(Date.parse(expected));
    const record = result.records[0];
    const values: Record<string, unknown> = lane === "deployment" ? record : (record as { values: Record<string, unknown> }).values;
    expect(values.updated_at).toBe(Date.parse(expected));
    expect(f.issued).toEqual([privateCursor]);
  });

  it("rejects invalid selected row timestamps before persisting a continuation", async () => {
    const f = fixture(envelope([row("dep1", "2026-10-16T00:00:00")]));
    await expect(read(f.service, 1)).rejects.toMatchObject({ code: rejected, status: 502 });
    expect(f.issued).toEqual([]);
  });

  it("rejects an overlarge public page without orphaning a private continuation", async () => {
    const f = fixture(envelope(Array.from({ length: 200 }, (_, i) => row(`dep${i}`, sourceTime, true))));
    await expect(read(f.service, 200)).rejects.toMatchObject({ code: tooLarge, status: 502 });
    expect(f.issued).toEqual([]);
  });

  it("preserves an exact millisecond source clock and issues only the opaque public continuation", async () => {
    const f = fixture(envelope([row()], "2026-10-16T07:00:00.123+07:00"));
    const result = await read(f.service, 1);
    expect(result.source_health.as_of_ms).toBe(Date.parse(sourceTime));
    expect(result.page.next_cursor).toBe(publicCursor);
    expect(result.page.has_more).toBe(true);
    expect(result.source_health.replay_eligible).toBe(false);
    expect(f.issued).toEqual([privateCursor]);
    const serialized = JSON.stringify(result);
    for (const denied of ["private-key", privateCursor, "must-not-cross", "unselected_secret", "raw"])
      expect(serialized).not.toContain(denied);
  });
});

describe("ELP2-05 exact source grain behind public millisecond clocks", () => {
  const op = managerRelationOperationByRoute("fills")!;
  const config = testConfig({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: principal.workspaceId });
  const clocks = ["2026-10-16T00:00:00.123456Z", "2026-10-16T00:00:00.123457Z"];
  function current(times: string[]) {
    const response = envelope(times.map(trade_time => ({ relation: { schema: "public", relation: "fills" },
      fields: { fill_id: { kind: "INTEGER", value: "7" }, trade_time: timestamp(trade_time) } })));
    response.source.data.relation.relation = "fills";
    return fixture(response).service.relationPage(principal, "fills", { environment: "paper", limit: 20 });
  }
  function retained(times: string[]) {
    const snapshot = { payloadDigest: "TEST_ONLY", projectionEpoch: "TEST_ONLY", sourceCatalogueSha256: "TEST_ONLY",
      document: { source_contract_revision: "TEST_ONLY", relations: { fills: { relation: "fills", availability: "AVAILABLE",
        items: times.map(trade_time => ({ fields: { fill_id: "7", trade_time } })) } } } };
    return retainedOperationPage(config, { snapshot: async () => snapshot } as never, principal, op,
      { environment: "paper", limit: 20 });
  }
  it("distinct sub-ms source keys remain distinct and parity holds in current/retained adapters", async () => {
    const live = await current(clocks), local = await retained(clocks);
    expect(live.records[0].values.trade_time).toBe(live.records[1].values.trade_time);
    const ids = live.records.map(r => r.resource_id).sort();
    expect(new Set(ids).size).toBe(2);
    expect(local.records.map(r => r.resource_id).sort()).toEqual(ids);
    expect(JSON.stringify([live, local])).not.toMatch(/123456|123457/);
  });
  it("equivalent fractional/offset spellings have the same private identity", async () => {
    const times = [clocks[0], "2026-10-16T07:00:00.123456000+07:00"];
    const live = await current(times), local = await retained(times);
    expect(live.records[0].resource_id).toBe(live.records[1].resource_id);
    expect(local.records[0].resource_id).toBe(live.records[0].resource_id);
    expect(local.records[1].resource_id).toBe(live.records[0].resource_id);
  });
  it("exact-ms identity is backward compatible, nanosecond grain is not truncated", () => {
    const ms = Date.parse(sourceTime);
    expect(managerTimestamp(sourceTime)?.identity).toBe(String(ms));
    expect(managerTimestamp("2026-10-16T00:00:00.123456789Z")?.identity).toBe(`${ms}:456789`);
  });
  it.each(["2026-10-16T00:00:00", "2026-02-30T00:00:00Z", "2026-10-16T00:00:00.123Z\n"])(
    "retained adapter rejects ambiguous or invalid source timestamp %s", async time => {
      await expect(retained([time])).rejects.toMatchObject({ code: "UDB_RETAINED_SCALAR_CONTRACT_REJECTED", status: 503 });
    });
});
