import { describe, expect, it } from "vitest";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import {
  EDS11R_MANAGER_EXTRA_OPERATIONS,
  EDS11R_MANAGER_RELATION_OPERATION_REGISTRY,
  EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST,
  browserManagerRelationOperationManifest,
  isManagerExtraOperation,
  managerRelationOperationById,
  managerRelationOperationByRelation,
  managerRelationOperationByRoute,
  managerRelationOperationPolicy,
} from "../src/execution/eds11r-manager-relation.registry";
import { MaximumDataOperationService, decodePayloadScalar, managerRelationRecord } from "../src/execution/maximum-data-operation.service";
import { NATIVE_TUPLE_A_CATALOGUE_SHA256, nativeTupleARelationAllowed } from "../src/execution/native-tuple-a";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import { nativeResearchReadAllowed } from "../src/execution/native-review-profile";

// Offline: pure functions and fake current source. Nothing here reads a database or a host.
const ALLOWED_KEYS = [
  "order_id", "client_order_id", "venue_order_id", "strategy_id", "account_id", "mode", "venue", "instrument_id", "symbol",
  "side", "position_side", "order_type", "time_in_force", "quantity", "price", "trigger_price", "status", "reduce_only",
  "post_only", "intent", "execution_session_id", "risk_grant_id", "error_code",
];
const operation = managerRelationOperationByRoute("domain-events")!;

const text = (value: string) => ({ kind: "TEXT", value });
const payload = (extra: Record<string, unknown> = {}) => ({
  kind: "OBJECT",
  value: {
    order_id: text("ord-1"), client_order_id: text("coid-1"), venue_order_id: text("vo-1"), strategy_id: text("s-1"),
    account_id: text("acc-1"), mode: text("paper"), venue: text("BINANCE"), instrument_id: text("BTCUSDT"), symbol: text("BTCUSDT"),
    side: text("BUY"), position_side: text("BOTH"), order_type: text("LIMIT"), time_in_force: text("GTC"),
    quantity: { kind: "DECIMAL", value: "0.5" }, price: { kind: "INTEGER", value: 65000 }, trigger_price: { kind: "NULL", value: null },
    status: text("FILLED"), reduce_only: { kind: "BOOLEAN", value: false }, post_only: { kind: "BOOLEAN", value: true },
    intent: text("OPEN"), execution_session_id: text("es-1"), risk_grant_id: text("rg-1"), error_code: { kind: "NULL", value: null },
    ...extra,
  },
});
function item(fields: Record<string, unknown> = {}) {
  return {
    relation: { schema: "public", relation: "domain_events" },
    record_key: "raw-source-key-must-not-cross-browser",
    fields: {
      event_id: text("9b9e1d2c-0000-4000-8000-000000000001"), event_ts: { kind: "TIMESTAMP", value: "2026-11-07T08:55:49.000Z" },
      created_at: { kind: "TIMESTAMP", value: "2026-11-07T08:55:50.000Z" }, event_type: text("ORDER_STATUS"),
      producer: text("postgres.order-state-projector.v1"), message_type: text("execution.order.state.v2"), venue: text("BINANCE"),
      mode: text("paper"), payload: payload(), raw: { kind: "OBJECT", value: { secret: text("must-not-cross") } },
      unselected_secret: text("must-not-cross"),
      ...fields,
    },
  };
}
const valuesOf = (fields: Record<string, unknown> = {}, payloadOverride?: unknown) =>
  managerRelationRecord(item(payloadOverride === undefined ? fields : { ...fields, payload: payloadOverride }), operation).values;

describe("domain-events: hand-authored extra operation next to the generated 54", () => {
  it("leaves the generated registry, its counts and the relation index untouched", () => {
    expect(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY).toHaveLength(54);
    expect(EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.screenBoundRelationCount).toBe(54);
    expect(managerRelationOperationByRelation("domain_events")).toBeNull(); // still PROJECTION_INPUT for every ledger/catalogue
    expect(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.some((o) => o.relation === "domain_events")).toBe(false);
    expect(EDS11R_MANAGER_EXTRA_OPERATIONS).toHaveLength(1);
    expect(browserManagerRelationOperationManifest().operations).toHaveLength(54);
    expect(Object.keys(browserManagerRelationOperationManifest())).not.toContain("extra_operations"); // pinned OpenAPI shape
  });
  it("resolves by route and operation id only, and only tuple A carries the relation", () => {
    expect(operation.operationId).toBe("managerDomainEventsPageV1");
    expect(managerRelationOperationById("managerDomainEventsPageV1")).toBe(operation);
    expect(isManagerExtraOperation(operation)).toBe(true);
    expect(isManagerExtraOperation(managerRelationOperationByRoute("account-balances")!)).toBe(false);
    expect(nativeTupleARelationAllowed("domain_events")).toBe(true);
    expect(managerRelationOperationPolicy(operation, "paper")).toMatchObject({
      operationId: "managerDomainEventsPageV1", sourceId: "manager.current.domain-events", relation: "domain_events" });
  });
  it("exposes exactly the 23 pinned payload keys as payload_* fields and never raw or payload as a field", () => {
    const flat = operation.fields.filter((f) => f.name.startsWith("payload_")).map((f) => f.name.slice(8)).sort();
    expect(flat).toEqual([...ALLOWED_KEYS].sort());
    expect(operation.payloadProjection!.keys).toHaveLength(23);
    const names = operation.fields.map((f) => f.name);
    expect(names).not.toContain("raw");
    expect(names).not.toContain("payload");
    expect(names).not.toContain("payload_error_message");
    expect(names).not.toContain("instrument_metadata_version"); // census: MAY_CONTAIN_SENSITIVE_STRUCTURED_DATA
    expect(new Set(names).size).toBe(names.length);
    expect(operation.fields.find((f) => f.name === "payload_quantity")!.kind).toBe("DECIMAL");
    expect(operation.fields.find((f) => f.name === "payload_reduce_only")!.kind).toBe("BOOLEAN");
    expect(operation.fields.find((f) => f.name === "event_ts")!.kind).toBe("TIMESTAMP");
  });
  it("(1) flattening keeps exactly the 23 keys with typed values", () => {
    const v = valuesOf();
    const flat = Object.keys(v).filter((k) => k.startsWith("payload_")).map((k) => k.slice(8)).sort();
    // trigger_price and error_code arrive as NULL: present as null, not as 0 and not absent
    expect(flat).toEqual([...ALLOWED_KEYS].sort());
    expect(v.payload_symbol).toBe("BTCUSDT");
    expect(v.payload_quantity).toBe("0.5");
    expect(v.payload_price).toBe("65000"); // JSON integer accepted for a DECIMAL field, kept as text
    expect(v.payload_trigger_price).toBeNull();
    expect(v.payload_reduce_only).toBe(false);
    expect(v.payload_post_only).toBe(true);
    expect(v.event_ts).toBe(Date.parse("2026-11-07T08:55:49.000Z"));
    expect(v.event_type).toBe("ORDER_STATUS");
  });
  it("(2) a future or unknown payload key is dropped", () => {
    const v = valuesOf({}, payload({ future_key: text("x"), another: { kind: "INTEGER", value: 3 } }));
    expect(Object.keys(v).some((k) => k.includes("future_key") || k.includes("another"))).toBe(false);
    expect(JSON.stringify(v)).not.toContain("future_key");
  });
  it("(3) error_message is dropped even when the source sends it", () => {
    const v = valuesOf({}, payload({ error_message: text("exchange said: -2010 insufficient balance for key AKIA...") }));
    expect(Object.keys(v)).not.toContain("payload_error_message");
    expect(JSON.stringify(v)).not.toContain("insufficient");
    expect(JSON.stringify(v)).not.toContain("AKIA");
  });
  it("(4) raw, the whole payload and unselected columns never appear", () => {
    const v = valuesOf();
    const json = JSON.stringify(v);
    expect(Object.keys(v)).not.toContain("raw");
    expect(Object.keys(v)).not.toContain("payload");
    expect(json).not.toContain("must-not-cross");
    expect(json).not.toContain("secret");
  });
  it("(5) a payload value of the wrong kind rejects the record", () => {
    expect(() => valuesOf({}, payload({ status: { kind: "INTEGER", value: 3 } }))).toThrow();
    expect(() => valuesOf({}, payload({ reduce_only: text("false") }))).toThrow();
    expect(() => valuesOf({}, payload({ quantity: text("lots") }))).toThrow(); // text that is not a decimal
    expect(() => valuesOf({}, payload({ quantity: { kind: "OBJECT", value: {} } }))).toThrow();
    expect(() => valuesOf({ event_ts: text("yesterday") })).toThrow(); // scalar columns stay strict
    // a DECIMAL field accepts the numeric spellings of JSON numbers and nothing else
    expect(decodePayloadScalar("DECIMAL", { kind: "INTEGER", value: 7 })).toBe("7");
    expect(decodePayloadScalar("DECIMAL", { kind: "TEXT", value: "0.25" })).toBe("0.25");
    expect(decodePayloadScalar("DECIMAL", { kind: "DECIMAL", value: "1.50" })).toBe("1.50");
    expect(decodePayloadScalar("DECIMAL", { kind: "NULL", value: null })).toBeNull();
  });
  it("(6) a payload that is not an object yields no payload_* values and the row is still served", () => {
    for (const bad of [{ kind: "NULL", value: null }, text("not json"), { kind: "ARRAY", value: [] }, "oops", 7, null]) {
      const v = valuesOf({}, bad);
      expect(Object.keys(v).filter((k) => k.startsWith("payload_"))).toEqual([]);
      expect(v.event_type).toBe("ORDER_STATUS");
    }
    // a source that does not advertise the payload column at all behaves the same (gating by absence, no 500)
    const { payload: _drop, ...rest } = item().fields;
    const v = managerRelationRecord({ ...item(), fields: rest }, operation).values;
    expect(Object.keys(v).filter((k) => k.startsWith("payload_"))).toEqual([]);
    expect(v.event_id).toBe("9b9e1d2c-0000-4000-8000-000000000001");
  });
  it("the identity is the event id; a row without it is rejected", () => {
    expect(managerRelationRecord(item(), operation).resource_id).toMatch(/^por1_[a-f0-9]{64}$/);
    expect(() => managerRelationRecord(item({ event_id: { kind: "NULL", value: null } }), operation)).toThrow();
  });
});

// ---- end to end through the service with a fake current source (private page path, native epoch present) ----
const user: PortalUser = {
  userId: "usr_de", username: "de", displayName: "DE", role: "ADMIN", status: "ACTIVE", mustChangePassword: false,
  failedLoginCount: 0, lockedUntil: null, sessionVersion: 1, createdAt: new Date("2026-11-15T00:00:00.000Z"),
  updatedAt: new Date("2026-11-15T00:00:00.000Z"), disabledAt: null, accountRevision: 1, archivedAt: null,
};
const session: AuthSession = {
  sessionId: "ses_de", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-11-15T00:00:00.000Z"), idleExpiresAt: new Date("2026-11-15T01:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-11-15T08:00:00.000Z"),
};
class FakeSource {
  calls: Array<Record<string, unknown>> = [];
  response: unknown;
  async relationForCataloguedOperation(_p: unknown, environment: string, policy: Record<string, unknown>, query: Record<string, unknown>) {
    this.calls.push({ environment, policy, query });
    return this.response;
  }
}
class FakeContinuations {
  async issue() { return "mdc1.00000000-0000-4000-8000-000000000001"; }
  async resolve() { return "source-private-continuation"; }
}
function envelope(items: unknown[]) {
  return {
    schema_version: "portal.execution.current-source-bff.v2", authority: "PORTAL_CONTROL_API",
    requested_environment: "paper", source_environment: "paper", profile_id: "PAPER_BINANCE_USDM",
    source: {
      contract_version: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision, authority: "EXECUTION_CELL",
      profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: NATIVE_TUPLE_A_CATALOGUE_SHA256, availability: "AVAILABLE",
      freshness: "STALE", completeness: "COMPLETE", as_of: "2026-11-15T00:00:00.000Z",
      data: { relation: { schema: "public", relation: "domain_events" }, items, next_cursor: null },
    },
  };
}

describe("domain-events: private page path and the non-native refusal", () => {
  const principal = { user, session, workspaceId: "ws_de", nativeEpochDigest: "sha256:" + "a".repeat(64) } as never;
  it("serves a bounded page through the catalogued-operation policy, tuple A catalogue, no raw values", async () => {
    const source = new FakeSource();
    source.response = envelope([item(), item({ event_id: text("9b9e1d2c-0000-4000-8000-000000000002") })]);
    const service = new MaximumDataOperationService(source as unknown as ExecutionCurrentSourceProxy, new FakeContinuations() as never);
    const page = await (service as unknown as { prepareRelationData(p: unknown, o: unknown, q: unknown): Promise<any> })
      .prepareRelationData(principal, operation, { environment: "paper", limit: 50 });
    expect(page).toMatchObject({ logical_operation_id: "managerDomainEventsPageV1", field_id: "managerDomainEventsCurrent",
      source_catalogue_sha256: NATIVE_TUPLE_A_CATALOGUE_SHA256 });
    expect(page.records).toHaveLength(2);
    expect(page.records[0].values.payload_status).toBe("FILLED");
    expect(JSON.stringify(page)).not.toContain("must-not-cross");
    expect(JSON.stringify(page)).not.toContain("raw-source-key");
    expect(source.calls[0]).toMatchObject({ environment: "paper", policy: { relation: "domain_events", sourceId: "manager.current.domain-events" } });
  });
  it("a typed source contract rejection (not a crash) when a row has a wrong payload kind", async () => {
    const source = new FakeSource();
    source.response = envelope([item({}), item({ payload: payload({ side: { kind: "BOOLEAN", value: true } }) })]);
    const service = new MaximumDataOperationService(source as unknown as ExecutionCurrentSourceProxy, new FakeContinuations() as never);
    await expect((service as unknown as { prepareRelationData(p: unknown, o: unknown, q: unknown): Promise<unknown> })
      .prepareRelationData(principal, operation, { environment: "paper", limit: 50 })).rejects.toMatchObject({ status: expect.any(Number) });
  });
  it("the legacy/retained relation page refuses the extra operation like an unknown route (404)", async () => {
    const service = new MaximumDataOperationService(new FakeSource() as unknown as ExecutionCurrentSourceProxy, new FakeContinuations() as never);
    await expect(service.relationPage(principal, "domain-events", { environment: "paper", limit: 10 }))
      .rejects.toMatchObject({ status: 404 });
  });
  it("the native-review request gate admits the new route and still refuses an unknown one", () => {
    const config = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_de" };
    const get = (path: string) => nativeResearchReadAllowed(config, "GET", path, { environment: "paper" });
    expect(get("/api/v1/execution/manager/current/domain-events")).toBe(true);
    expect(get("/api/v1/execution/manager/current/account-balances")).toBe(true);
    expect(get("/api/v1/execution/manager/current/audit-log")).toBe(false); // non-browser relation: still not a route
    expect(get("/api/v1/execution/manager/current/events")).toBe(false);
  });
});
});
