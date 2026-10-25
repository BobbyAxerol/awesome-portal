/**
 * BE-P15 (RV-11 R-5..R-9): record-detail vocabulary, subject-record time semantics, Resource360 v2 detail rows,
 * per-deployment snapshot rows and typed Alpha identity absences.
 *
 * No database, Docker, network or source: the REAL scope evaluator and REAL readers run over synthetic TEST_ONLY rows
 * (same fixture family as elp2-resource-reads). Nothing here is a qualified source receipt.
 */
import { describe, expect, it, vi } from "vitest";
import { productReadFixture, OWN, PEER, FIELDS } from "./elp2-product-read.fixture";
import { ExecutionSubjectActivityService } from "../src/execution/subject-activity.service";
import { ExecutionProfileReadAdapterService } from "../src/execution/profile-read-adapter.service";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { scopedResourceResponseSchemas } from "../src/resource-read/scoped-resource.contract";
import { scopedSubjectActivitySchema } from "../src/execution-v2/subject-activity.contract";
import { scopedAdapterResponseSchema } from "../src/execution-v2/profile-adapter.contract";
import { BUSINESS_READ_FIELDS, RECORD_DETAIL_READ_FIELDS } from "../src/execution-v2/read-fields";
import { epochMsFrom, recordDetailValue } from "../src/execution-v2/record-detail";
import { scopeAllowsDetailField, scopeAllowsField, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { retainedFieldAllowed } from "../src/execution/retained-operation-page";
import type { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import type { ExecutionProfileProjectionRepository, ProjectionRelation, ProjectionScalar } from "../src/execution/profile-projection.repository";

const DETAIL = [...RECORD_DETAIL_READ_FIELDS];
type Fixture = ReturnType<typeof productReadFixture>;
const binding = (f: Fixture) => ({ environment: "paper" as const, profileId: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID! });
const dataset = (f: Fixture) => ({ dataset_id: "be-p15", source_revision: f.snapshot.payloadDigest, projection_generation: f.snapshot.projectionEpoch,
  catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null });
const alphaScope = (f: Fixture) => f.scopes.authorize(f.principal as ReadScopePrincipal, binding(f),
  { action: "alpha.read", resource: { kind: "ALPHA", id: OWN.alpha_id }, dataset: dataset(f) });

function addRelations(f: Fixture, extra: Record<string, { name: string; rows: Record<string, ProjectionScalar>[] }>) {
  const source = f.snapshot.document.relations["manager.orders:orders"];
  for (const [key, value] of Object.entries(extra)) f.snapshot.document.relations[key] = { ...source, relation: value.name,
    items: value.rows.map(fields => ({ fields, lineage: source.items[0].lineage })) } as ProjectionRelation;
}

describe("BE-P15 record-detail vocabulary is separate from the business vocabulary", () => {
  it("shares no name with BUSINESS_READ_FIELDS, so every scopeAllowsField / retainedFieldAllowed guard is unchanged", async () => {
    for (const name of DETAIL) expect((BUSINESS_READ_FIELDS as readonly string[]).includes(name)).toBe(false);
    const f = productReadFixture({ full: true }), scope = await alphaScope(f);
    for (const name of DETAIL) {
      expect(scopeAllowsField(scope, name)).toBe(false);          // the money guards still see commission as an unapproved protected value
      expect(retainedFieldAllowed(scope, name)).toBe(false);
      expect(scopeAllowsDetailField(scope, name)).toBe(true);     // a full-business reader may read the detail
    }
  });
  it("a researcher gets exactly the detail names its reviewed artifact lists, never a name outside the vocabulary", async () => {
    const f = productReadFixture({ fields: [...FIELDS, "client_order_id", "commission", "custody_balance", "private_key"] }), scope = await alphaScope(f);
    expect(scopeAllowsDetailField(scope, "client_order_id")).toBe(true);
    expect(scopeAllowsDetailField(scope, "commission")).toBe(true);
    expect(scopeAllowsDetailField(scope, "liquidity_side")).toBe(false);
    expect(scopeAllowsDetailField(scope, "custody_balance")).toBe(false);
    expect(scopeAllowsDetailField(scope, "private_key")).toBe(false);
    expect(scopeAllowsField(scope, "commission")).toBe(false);
  });
  it("a researcher whose artifact lists no detail name sees none of it", async () => {
    const f = productReadFixture(), scope = await alphaScope(f);
    for (const name of DETAIL) expect(scopeAllowsDetailField(scope, name)).toBe(false);
  });
  it("is denied to a non-business purpose even when the name is in the vocabulary", async () => {
    const f = productReadFixture({ full: true });
    const scope = await f.scopes.authorize(f.principal as ReadScopePrincipal, binding(f), { action: "maintenance.read", dataset: dataset(f) }).catch(() => null);
    if (scope) for (const name of DETAIL) expect(scopeAllowsDetailField(scope, name)).toBe(false);
  });
});

describe("BE-P15 recordDetailValue never coerces", () => {
  it.each([
    ["client_order_id", "client-1", "client-1"], ["client_order_id", null, null], ["client_order_id", "", undefined], ["client_order_id", "a\nb", undefined],
    ["client_order_id", 5, undefined], ["client_order_id", "x".repeat(257), undefined],
    ["order_type", "STOP_MARKET", "STOP_MARKET"], ["finding_type", "ANY_RAW_SOURCE_TEXT", "ANY_RAW_SOURCE_TEXT"],
    ["commission", "0.0000000000000000001", "0.0000000000000000001"], ["commission", "-1.5", "-1.5"], ["commission", "0", "0"], ["commission", null, null],
    ["commission", 0.1, undefined], ["commission", "1e-4", undefined], ["commission", "01", undefined], ["commission", "1".repeat(129), undefined],
    ["liquidity_side", "MAKER", "MAKER"], ["liquidity_side", "TAKER", "TAKER"], ["liquidity_side", "UNKNOWN", "UNKNOWN"], ["liquidity_side", "maker", undefined], ["liquidity_side", "OTHER", undefined],
    ["leg_sequence", 0, 0], ["leg_sequence", "2", 2], ["leg_sequence", -1, undefined], ["leg_sequence", "02", undefined], ["leg_sequence", 1.5, undefined], ["leg_sequence", null, null],
    ["submitted_at_ms", "2026-10-01T00:00:00.123Z", 1790812800123], ["submitted_at_ms", 1790812800123, 1790812800123], ["submitted_at_ms", "not a time", undefined],
    ["submitted_at_ms", -5, undefined], ["resolved_at_ms", "2026-10-01T00:05:00Z", 1790813100000],
    ["not_in_vocabulary", "x", undefined], ["physical_balance", "1", undefined],
    ["runtime_state", "RUNNING", "RUNNING"], ["runtime_state", "ACTIVE", undefined],
    ["started_at", "2026-10-01T07:00:00+07:00", "2026-10-01T00:00:00.000Z"],
    ["started_at", Number.MAX_SAFE_INTEGER, undefined], ["completed_at", null, null],
    ["average_fill_price", "123.000000001", "123.000000001"], ["filled_quantity", "0", "0"],
    ["average_fill_price", "1\n", undefined], ["trigger_price", 1.2, undefined],
    ["reduce_only", false, false], ["post_only", true, true], ["post_only", "true", undefined],
  ])("%s %j -> %j", (field, raw, expected) => {
    expect(recordDetailValue(field, raw)).toBe(expected);
  });
  it("truncates sub-millisecond digits and states UTC epoch milliseconds", () => {
    expect(epochMsFrom("2026-10-01T00:00:00.123456Z")).toBe(1790812800123);
    expect(epochMsFrom(1790812800123)).toBe(1790812800123);
    expect(epochMsFrom("")).toBeUndefined();
  });
  // CR-04: only an explicit-zone ISO instant (or a safe integer epoch-ms NUMBER) is an instant; everything else is absent.
  const at = (iso: string) => Date.parse(iso);
  it.each([
    ["2026-10-01T00:00:00Z", 1790812800000], ["2026-10-01T00:00:00.5Z", 1790812800500], ["1970-01-01T00:00:00Z", 0],
    ["2028-02-29T12:00:00Z", Date.UTC(2028, 1, 29, 12)], ["2000-02-29T00:00:00Z", Date.UTC(2000, 1, 29)],
    ["2026-12-31T23:59:59Z", Date.UTC(2026, 11, 31, 23, 59, 59)],
    ["2026-10-01T07:00:00+07:00", 1790812800000], ["2026-09-30T17:00:00-07:00", 1790812800000],
    ["2026-10-01T05:30:00+05:30", Date.UTC(2026, 9, 1, 0, 0, 0)], ["2026-10-01T00:00:00+00:00", 1790812800000], ["2026-10-01T00:00:00-00:00", 1790812800000],
  ])("accepts %s", (raw, expected) => {
    expect(epochMsFrom(raw)).toBe(expected);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("accepts %i fractional-second digits and truncates to milliseconds", (digits) => {
    const fraction = "123456789".slice(0, digits);
    expect(epochMsFrom(`2026-10-01T00:00:00.${fraction}Z`)).toBe(1790812800000 + Number(fraction.padEnd(3, "0").slice(0, 3)));
  });
  it("keeps a zero-padded short fraction exact (.05 is 50 ms, .005 is 5 ms)", () => {
    expect(epochMsFrom("2026-10-01T00:00:00.05Z")).toBe(1790812800050);
    expect(epochMsFrom("2026-10-01T00:00:00.005Z")).toBe(1790812800005);
    expect(epochMsFrom("2026-10-01T00:00:00.0009999Z")).toBe(1790812800000);
  });
  it.each([
    ["2026-02-30T12:00:00Z"], ["2026-02-29T12:00:00Z"], ["2100-02-29T00:00:00Z"], ["2026-04-31T00:00:00Z"], ["2026-13-01T00:00:00Z"], ["2026-00-10T00:00:00Z"],
    ["2026-10-00T00:00:00Z"], ["2026-10-32T00:00:00Z"], ["2026-10-01T24:00:00Z"], ["2026-10-01T23:60:00Z"], ["2026-10-01T23:59:60Z"],
    ["2026-10-01T00:00:00+24:00"], ["2026-10-01T00:00:00+07:60"],
    ["2026-10-01"], ["2026-10-01T00:00:00"], ["2026-10-01T00:00"], ["2026-10-01 00:00:00Z"], ["2026-10-01 00:00:00"], ["2026-10-01t00:00:00z"],
    ["2026-10-01T00:00:00+0700"], ["2026-10-01T00:00:00+07"], ["2026-10-01T00:00:00.Z"], ["2026-10-01T00:00:00.1234567890Z"],
    ["1"], ["1790812800123"], ["0"], ["  1790812800123"], ["1e3"], ["2001"], ["Oct 1 2026 00:00:00 GMT"], ["Thu, 01 Oct 2026 00:00:00 GMT"],
    ["1969-12-31T23:59:59Z"], ["+002026-10-01T00:00:00Z"], ["2026-10-01T00:00:00Z\n"], ["2026-10-01T00:00:00Z "], ["not a time"], [""],
  ])("rejects %j as malformed", (raw) => {
    expect(epochMsFrom(raw)).toBeUndefined();
    expect(recordDetailValue("submitted_at_ms", raw)).toBeUndefined();
  });
  it("accepts only an already-safe non-negative integer number as an epoch stamp", () => {
    for (const raw of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) expect(epochMsFrom(raw)).toBeUndefined();
    for (const raw of [undefined, null, true, {}, [], 1n]) expect(epochMsFrom(raw)).toBeUndefined();
    expect(epochMsFrom(0)).toBe(0);
    expect(epochMsFrom(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("agrees with the engine on every valid instant it accepts (no hand-rolled calendar drift)", () => {
    for (const iso of ["2024-02-29T01:02:03.456Z", "2026-03-01T00:00:00Z", "2026-12-31T23:59:59.999+14:00", "2038-01-19T03:14:08Z", "9999-12-31T23:59:59Z"])
      expect(epochMsFrom(iso)).toBe(at(iso));
  });
});

describe("BE-P15 subject records (RV-11 R-5, R-9)", () => {
  function subject(options: { full?: boolean; fields?: string[]; orders?: Record<string, ProjectionScalar>[]; fills?: Record<string, ProjectionScalar>[] } = {}) {
    const f = productReadFixture({ full: options.full, fields: options.fields });
    addRelations(f, { "manager.fills:fills": { name: "fills", rows: [] } });
    const config = { ...f.config, FEATURE_EXECUTION_DURABLE_MIRROR: "true", FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "k1", QUERY_CURSOR_KEYS_JSON: JSON.stringify({ k1: "01234567890123456789012345678901" }), QUERY_CURSOR_TTL_SECONDS: 900 };
    const rowsFor = (relationKey: string) => (relationKey.endsWith("orders") ? options.orders ?? [] : options.fills ?? []).map((fields, index) => ({
      rowId: `row-${index}`, ts: relationKey.endsWith("orders") ? String(fields.updated_at) : String(fields.trade_time ?? "2026-10-01T00:00:01.000Z"), fields }));
    const mirror = { scopedSubjectRead: vi.fn(async (_scope: unknown, relationKey: string) => {
      const rows = rowsFor(relationKey);
      return { page: { rows, hasMore: false }, coverage: { rowCount: rows.length, oldestTs: rows.at(-1)?.ts ?? null, newestTs: rows[0]?.ts ?? null } };
    }) };
    const service = new ExecutionSubjectActivityService(config as never, f.repository as unknown as ExecutionProfileProjectionRepository,
      mirror as unknown as ExecutionDurableMirrorRepository, f.scopes);
    const read = (relation: "orders" | "fills") => service.readAuthorized(f.principal as ReadScopePrincipal,
      { environment: "paper", subjectKind: "alpha", subjectId: OWN.alpha_id, relation }) as Promise<any>;
    return { f, read, mirror };
  }
  const order = (extra: Record<string, ProjectionScalar> = {}): Record<string, ProjectionScalar> => ({ ...OWN, strategy_id: "strategy-own", order_id: "o1", status: "FILLED", side: "BUY",
    quantity: "10.5", price: "100.1234567890123456789", submitted_at: "2026-10-01T00:00:00.123Z", updated_at: "2026-10-01T00:00:02.000Z",
    client_order_id: "client-entry", order_type: "LIMIT", venue_order_id: "NEVER_RETURN", error_message: "NEVER_RETURN", ...extra });
  const fill = (extra: Record<string, ProjectionScalar> = {}): Record<string, ProjectionScalar> => ({ ...OWN, strategy_id: "strategy-own", fill_id: "f1", side: "BUY",
    price: "100.1234567890123456789", quantity: "10.5", trade_time: "2026-10-01T00:00:01.456Z", client_order_id: "client-entry",
    commission: "0.0000000000000000001", commission_currency: "USDT", liquidity_side: "MAKER", trade_id: "NEVER_RETURN", ...extra });

  it("full-business read: order submission instant, client id, order type; unit and basis stated; secrets never returned", async () => {
    const { read } = subject({ full: true, orders: [order()] });
    const page = await read("orders");
    expect(page.time_unit).toBe("UTC_EPOCH_MS");
    expect(page.observed_at_basis).toBe("ORDER_UPDATED_AT");
    expect(page.records[0].values).toMatchObject({ order_id: "o1", client_order_id: "client-entry", order_type: "LIMIT",
      submitted_at_ms: 1790812800123, updated_at: 1790812802000, quantity: "10.5", price: "100.1234567890123456789" });
    expect(page.records[0].time_reason_code).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(/NEVER_RETURN|venue_order_id|error_message|trade_id/);
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
  it("full-business read of fills: exact fee, fee currency, liquidity, trade instant; basis FILL_TRADE_TIME", async () => {
    const { read } = subject({ full: true, fills: [fill()] });
    const page = await read("fills");
    expect(page.observed_at_basis).toBe("FILL_TRADE_TIME");
    expect(page.records[0].values).toMatchObject({ fill_id: "f1", client_order_id: "client-entry", commission: "0.0000000000000000001",
      commission_currency: "USDT", liquidity_side: "MAKER", occurred_at_ms: 1790812801456 });
    expect(page.records[0].time_reason_code).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(/NEVER_RETURN|trade_id/);
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
  it("a researcher without the detail names gets neither the names nor a fee, and the page says why no order instant is shown", async () => {
    const { read } = subject({ fields: [...FIELDS, "timestamp_ms"], orders: [order()], fills: [fill()] });
    const orders = await read("orders");
    expect(orders.records[0].values.client_order_id).toBeUndefined();
    expect(orders.records[0].values.submitted_at_ms).toBeUndefined();
    expect(orders.records[0].time_reason_code).toBe("SUBMITTED_AT_NOT_IN_POLICY");
    const fills = await read("fills");
    expect(fills.records[0].values.commission).toBeUndefined();
    expect(fills.records[0].values.liquidity_side).toBeUndefined();
    expect(fills.records[0].time_reason_code).toBe("OCCURRED_AT_NOT_IN_POLICY");
  });
  it("a researcher whose artifact lists exactly some names gets exactly those", async () => {
    const { read } = subject({ fields: [...FIELDS, "timestamp_ms", "occurred_at_ms", "client_order_id", "commission", "commission_currency"], orders: [order()], fills: [fill()] });
    const fills = await read("fills");
    expect(fills.records[0].values).toMatchObject({ client_order_id: "client-entry", commission: "0.0000000000000000001", commission_currency: "USDT", occurred_at_ms: 1790812801456 });
    expect(fills.records[0].values.liquidity_side).toBeUndefined();
    const orders = await read("orders");
    expect(orders.records[0].values.client_order_id).toBe("client-entry");
    expect(orders.records[0].values.order_type).toBeUndefined();
    expect(orders.records[0].time_reason_code).toBe("SUBMITTED_AT_NOT_IN_POLICY");
  });
  it("CR-04: an impossible, zone-less or numeric-string order time is named SOURCE_TIME_UNPARSEABLE, not invented as an instant", async () => {
    const bad = ["2026-02-30T12:00:00Z", "1", "2026-10-01T00:00:00", "2026-10-01"];
    const { read } = subject({ full: true, orders: bad.map((submitted_at, index) => order({ order_id: `b${index}`, submitted_at })) });
    const page = await read("orders");
    expect(page.records.map((record: any) => record.time_reason_code)).toEqual(bad.map(() => "SOURCE_TIME_UNPARSEABLE"));
    for (const record of page.records) expect(record.values.submitted_at_ms).toBeUndefined();
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
  it("a source that states no order time, or an unreadable one, is named - never a guess, never a failed page", async () => {
    const { read } = subject({ full: true, orders: [order({ submitted_at: null }), order({ order_id: "o2", submitted_at: "garbage" }), order({ order_id: "o3" })] });
    const page = await read("orders");
    expect(page.records.map((record: any) => record.time_reason_code)).toEqual(["SOURCE_TIME_NOT_PUBLISHED", "SOURCE_TIME_UNPARSEABLE", undefined]);
    expect(page.records[0].values.submitted_at_ms).toBeNull();
    expect(page.records[1].values.submitted_at_ms).toBeUndefined();
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
  it("a malformed detail cell is omitted, not coerced, and does not fail the page", async () => {
    const { read } = subject({ full: true, fills: [fill({ commission: "1e-4", liquidity_side: "maker", client_order_id: "x\ny", commission_currency: "USDT" })] });
    const page = await read("fills");
    expect(page.records[0].values.commission).toBeUndefined();
    expect(page.records[0].values.liquidity_side).toBeUndefined();
    expect(page.records[0].values.client_order_id).toBeUndefined();
    expect(page.records[0].values.commission_currency).toBe("USDT");
  });
  it("an explicit null fee stays null: the source stated no value, which is not zero", async () => {
    const { read } = subject({ full: true, fills: [fill({ commission: null, liquidity_side: null })] });
    const page = await read("fills");
    expect(page.records[0].values.commission).toBeNull();
    expect(page.records[0].values.liquidity_side).toBeNull();
  });
  it("the envelope refuses a basis that contradicts the operation", () => {
    const valid = { schema_version: "portal.execution.subject-records.v2", time_unit: "UTC_EPOCH_MS", observed_at_basis: "ORDER_UPDATED_AT",
      logical_operation_id: "executionAlphaOrdersV1", authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW", source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
      history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY", environment: "paper", profile_id: "p", resource: { kind: "alpha", id: "a" },
      read_scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: "r" }, state: "EMPTY", reason_code: "SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY",
      coverage: { retained_row_count: 0, oldest_observed_at_ms: null, newest_observed_at_ms: null },
      page: { limit: 10, maximum_page_rows: 500, returned_count: 0, has_more: false, next_cursor: null }, records: [] };
    expect(scopedSubjectActivitySchema.safeParse(valid).success).toBe(true);
    expect(scopedSubjectActivitySchema.safeParse({ ...valid, observed_at_basis: "FILL_TRADE_TIME" }).success).toBe(false);
    expect(scopedSubjectActivitySchema.safeParse({ ...valid, time_unit: "SECONDS" }).success).toBe(false);
    expect(scopedSubjectActivitySchema.safeParse({ ...valid, time_unit: undefined }).success).toBe(false);
  });
});

describe("BE-P15 scoped adapter (RV-11 R-8, R-9 legs)", () => {
  it("publishes conditional-order leg identity and reconciliation finding identity by exact member, with the unit stated; a peer's legs stay hidden", async () => {
    const f = productReadFixture({ fields: [...FIELDS, "timestamp_ms", "group_id", "leg_id", "price", "client_order_id", "order_type", "leg_role", "leg_sequence",
      "finding_id", "finding_type", "resolved_at_ms"] });
    const lineage = { workspace_id: f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!, profile_id: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!, source_contract_revision: "TEST_ONLY" };
    const rel = (name: string, rows: Record<string, ProjectionScalar>[]) => ({ ...f.snapshot.document.relations["manager.orders:orders"], relation: name, items: rows.map(fields => ({ fields, lineage })) });
    Object.assign(f.snapshot.document.relations, {
      "manager.orders:orders": rel("orders", []), "manager.fills:fills": rel("fills", []),
      "manager.sessions:execution_sessions": rel("execution_sessions", []), "manager.command-journal:command_journal": rel("command_journal", []),
      "manager.conditional-orders:conditional_order_groups": rel("conditional_order_groups", []),
      "manager.conditional-orders:conditional_order_group_legs": rel("conditional_order_group_legs", [
        { ...OWN, group_id: "g1", leg_id: "l1", role: "ENTRY", sequence: 0, client_order_id: "client-entry", order_type: "LIMIT", side: "BUY", quantity: "10.5", price: "100.5", venue_order_id: "NEVER_RETURN" },
        { ...OWN, group_id: "g1", leg_id: "l2", role: "STOP", sequence: "1", client_order_id: "client-stop", order_type: "STOP_MARKET", side: "SELL", quantity: "10.5", price: null },
        { ...PEER, group_id: "g2", leg_id: "l3", role: "ENTRY", sequence: 0, client_order_id: "PEER_HIDDEN", order_type: "LIMIT" }]),
      "manager.reconciliation:reconciliation_findings": rel("reconciliation_findings", [{ ...OWN, finding_id: "fi1", finding_type: "RAW_TYPE_TEXT", status: "RESOLVED",
        created_at: "2026-10-01T00:00:00Z", resolved_at: "2026-10-01T00:05:00Z", execution_session_id: "NEVER_RETURN" }]),
    });
    for (const relation of Object.values(f.snapshot.document.relations)) for (const item of relation.items) (item as { lineage?: unknown }).lineage ??= lineage;
    const repository = { ...f.repository, pool: { connect: async () => ({ release() { /* test */ } }) } };
    const adapter = new ExecutionProfileReadAdapterService({ ...f.config } as never, repository as unknown as ExecutionProfileProjectionRepository, f.scopes);
    const response = await adapter.readAuthorized(f.principal as ReadScopePrincipal, "paper", "event.order-lifecycle", {}) as any;
    expect(response.time_unit).toBe("UTC_EPOCH_MS");
    expect(response.relations.conditional_order_group_legs.items).toEqual([
      { group_id: "g1", leg_id: "l1", leg_role: "ENTRY", leg_sequence: 0, client_order_id: "client-entry", order_type: "LIMIT", side: "BUY", quantity: "10.5", price: "100.5", deployment_id: OWN.deployment_id, account_id: OWN.account_id, alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id, alpha_version_id: OWN.alpha_version_id },
      { group_id: "g1", leg_id: "l2", leg_role: "STOP", leg_sequence: 1, client_order_id: "client-stop", order_type: "STOP_MARKET", side: "SELL", quantity: "10.5", price: null, deployment_id: OWN.deployment_id, account_id: OWN.account_id, alpha_id: OWN.alpha_id, portfolio_id: OWN.portfolio_id, alpha_version_id: OWN.alpha_version_id },
    ]);
    const inspect = await adapter.readAuthorized(f.principal as ReadScopePrincipal, "paper", "admin.inspect", {}) as any;
    expect(inspect.relations.reconciliation.items).toEqual([expect.objectContaining({ finding_id: "fi1", finding_type: "RAW_TYPE_TEXT", status: "RESOLVED",
      resolved_at_ms: 1790813100000, created_at: 1790812800000 })]);
    expect(JSON.stringify(response)).not.toMatch(/PEER_HIDDEN|NEVER_RETURN|venue_order_id|execution_session_id/);
    expect(scopedAdapterResponseSchema.safeParse(response).success).toBe(true);
  });
  it("an adapter response without the stated unit is refused by the contract", () => {
    expect(scopedAdapterResponseSchema.safeParse({ schema_version: "portal.execution.profile-read-adapter.v2", capability_id: "admin.inspect", authority: "PORTAL_SGP_PROJECTION",
      workspace_id: "w", environment: "paper", profile_id: "p", visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: "r",
      bounds: { maximum_rows_per_relation: 200, maximum_response_bytes: 1048576 }, relations: {} }).success).toBe(false);
  });
});

describe("BE-P15 Resource360 v2 (RV-11 R-6, R-7, R-8, R-9)", () => {
  function resources(options: { full: boolean; fields?: string[]; strategy?: Record<string, ProjectionScalar>; equity?: Record<string, ProjectionScalar>[]; fills?: boolean } = { full: true }) {
    const f = productReadFixture({ full: options.full, fields: options.fields });
    addRelations(f, {
      "manager.strategies:strategies": { name: "strategies", rows: [options.strategy ?? { strategy_id: "strategy-own" }, { strategy_id: "strategy-peer", name: "Peer Alpha" }] },
      "manager.fills:fills": { name: "fills", rows: options.fills === false ? [] : [{ ...OWN, fill_id: "f1", side: "BUY", price: "100.1234567890123456789", quantity: "10.5",
        trade_time: "2026-10-01T00:00:01.456Z", client_order_id: "client-entry", commission: "0.0000000000000000001", commission_currency: "USDT", liquidity_side: "MAKER", trade_id: "NEVER_RETURN" }] },
      "manager.reconciliation:reconciliation_findings": { name: "reconciliation_findings", rows: [{ ...OWN, finding_id: "fi1", finding_type: "RAW_TYPE_TEXT", status: "RESOLVED",
        created_at: "2026-10-01T00:00:00Z", resolved_at: "2026-10-01T00:05:00Z", execution_session_id: "TEST_ONLY-visible-session" }] },
      "manager.performance:account_equity_snapshots": { name: "account_equity_snapshots", rows: options.equity ?? [] },
    });
    f.snapshot.document.relations["manager.orders:orders"].items[0].fields.client_order_id = "client-entry";
    f.snapshot.document.relations["manager.orders:orders"].items[0].fields.order_type = "LIMIT";
    const service = new ResourceReadService(f.config, f.repository as never, f.scopes);
    return { f, read: () => service.read(f.principal, "ALPHA", OWN.alpha_id, "paper") as Promise<any> };
  }
  const equityRow = (ts: string, extra: Record<string, ProjectionScalar> = {}): Record<string, ProjectionScalar> => ({ ...OWN, ts, currency: "USDT",
    net_pnl: "-1234567890.1234567890123456789", equity: "9007199254740993.0000000001", ...extra });

  it("full-business read: orders, fills and reconciliation carry the detail members and the instants carry a stated unit", async () => {
    const { read } = resources({ full: true, strategy: { strategy_id: "strategy-own", name: "Own Alpha", version: "v1" } });
    const body = await read();
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(body).success).toBe(true);
    expect(body.data.orders[0]).toMatchObject({ client_order_id: "client-entry", order_type: "LIMIT", submitted_at: "2026-10-01T00:00:00.000Z", submitted_at_ms: 1790812800000 });
    expect(body.data.fills[0]).toMatchObject({ client_order_id: "client-entry", commission: "0.0000000000000000001", commission_currency: "USDT",
      liquidity_side: "MAKER", trade_time_ms: 1790812801456 });
    expect(body.data.reconciliation[0]).toMatchObject({ finding_id: "fi1", finding_type: "RAW_TYPE_TEXT", resolved_at: "2026-10-01T00:05:00Z", resolved_at_ms: 1790812800000 + 300000 });
    expect(body.capabilities.find((c: any) => c.capability_id === "resource.alpha.fills").state).not.toBe("UNAVAILABLE");
    expect(body.data.reconciliation[0].execution_session_id).toBe("TEST_ONLY-visible-session");
    expect(JSON.stringify(body)).not.toMatch(/NEVER_RETURN|trade_id/);
  });
  it("a researcher without the detail names: fills stay a typed FIELD_POLICY_PENDING absence (the fee is an unapproved protected value), orders drop the detail", async () => {
    const { read } = resources({ full: false });
    const body = await read();
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(body).success).toBe(true);
    const fills = body.capabilities.find((c: any) => c.capability_id === "resource.alpha.fills");
    expect(fills.reason_code).toBe("EXECUTION_READ_FIELD_POLICY_PENDING");
    expect(body.data.fills).toEqual([]);
    expect(body.data.orders[0].client_order_id).toBeUndefined();
    expect(body.data.reconciliation[0].finding_id).toBeUndefined();
  });
  it("a researcher whose artifact lists the fee names gets the fills panel", async () => {
    const { read } = resources({ full: false, fields: [...FIELDS, "occurred_at_ms", "commission", "commission_currency", "liquidity_side", "client_order_id", "realized_pnl", "price"] });
    const body = await read();
    expect(body.data.fills[0]).toMatchObject({ commission: "0.0000000000000000001", liquidity_side: "MAKER", client_order_id: "client-entry" });
  });

  it("Alpha identity: a stated name and version are published and not listed as absent; owner and stage are always typed absences", async () => {
    const { read } = resources({ full: true, strategy: { strategy_id: "strategy-own", name: "Own Alpha", version: "v1" } });
    const alpha = (await read()).data.alpha;
    expect(alpha.name).toBe("Own Alpha");
    expect(alpha.version).toBe("v1");
    expect(alpha.identity_absences).toEqual([{ member: "owner", reason_code: "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER" }, { member: "stage", reason_code: "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE" }]);
  });
  it("Alpha identity: an unstated name/version is a typed absence, never 'Unnamed alpha' or a join on the display id", async () => {
    const { read } = resources({ full: true });
    const alpha = (await read()).data.alpha;
    expect(alpha.name).toBeUndefined();
    expect(alpha.version).toBeUndefined();
    expect(alpha.identity_absences.map((a: any) => [a.member, a.reason_code])).toEqual([["name", "ALPHA_NAME_NOT_IN_SOURCE"], ["version", "ALPHA_VERSION_NOT_IN_SOURCE"],
      ["owner", "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER"], ["stage", "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE"]]);
  });
  it("Alpha identity: when the scope does not admit name/version the reason says policy, not source", async () => {
    const fields = FIELDS.filter(field => !["name", "display_name"].includes(field));
    const { read } = resources({ full: false, fields, strategy: { strategy_id: "strategy-own", name: "Own Alpha", version: "v1" } });
    const alpha = (await read()).data.alpha;
    expect(alpha.name).toBeUndefined();
    expect(alpha.identity_absences.find((a: any) => a.member === "name").reason_code).toBe("ALPHA_NAME_NOT_IN_POLICY");
    expect(alpha.identity_absences.find((a: any) => a.member === "version").reason_code).toBe("ALPHA_VERSION_NOT_IN_POLICY");
  });

  it("deployment snapshot: the latest visible row per deployment, exact decimals, no sum", async () => {
    const { read } = resources({ full: true, equity: [equityRow("2026-10-01T00:00:00Z", { net_pnl: "1", equity: "10" }), equityRow("2026-10-01T00:10:00Z"),
      equityRow("2026-10-01T00:05:00Z", { net_pnl: "5", equity: "50" }), { ...PEER, ts: "2026-10-01T00:20:00Z", net_pnl: "999", equity: "999" }] });
    const body = await read();
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(body).success).toBe(true);
    expect(body.data.alpha.deployment_financials).toEqual([{ profile_environment: "paper", deployment_id: OWN.deployment_id, state: "AVAILABLE", reason_code: null,
      basis: "LATEST_VISIBLE_ACCOUNT_EQUITY_SNAPSHOT_ROW", snapshot_at_ms: Date.parse("2026-10-01T00:10:00Z"), currency: "USDT",
      net_pnl: "-1234567890.1234567890123456789", equity: "9007199254740993.0000000001" }]);
    expect(JSON.stringify(body.data.alpha.deployment_financials)).not.toMatch(/999/);
  });
  it("deployment snapshot: two different rows at the latest instant are AMBIGUOUS, never merged or summed", async () => {
    const { read } = resources({ full: true, equity: [equityRow("2026-10-01T00:10:00Z"), equityRow("2026-10-01T00:10:00Z", { currency: "EUR", net_pnl: "7", equity: "70" })] });
    const [row] = (await read()).data.alpha.deployment_financials;
    expect(row).toMatchObject({ state: "UNAVAILABLE", reason_code: "DEPLOYMENT_FINANCIAL_SNAPSHOT_AMBIGUOUS", net_pnl: null, equity: null, snapshot_at_ms: null });
  });
  it("deployment snapshot: no row for the deployment is a typed absence, not zero", async () => {
    const { read } = resources({ full: true, equity: [{ ...PEER, ts: "2026-10-01T00:20:00Z", net_pnl: "999", equity: "999" }] });
    const [row] = (await read()).data.alpha.deployment_financials;
    expect(row).toMatchObject({ state: "UNAVAILABLE", reason_code: "DEPLOYMENT_FINANCIAL_SNAPSHOT_NOT_PUBLISHED", net_pnl: null });
  });
  it("deployment snapshot: a researcher lacking net_pnl makes the equity relation a typed absence, so the snapshot is absent too", async () => {
    const { read } = resources({ full: false, equity: [equityRow("2026-10-01T00:10:00Z")] });
    const [row] = (await read()).data.alpha.deployment_financials;
    expect(row).toMatchObject({ state: "UNAVAILABLE", reason_code: "DEPLOYMENT_FINANCIALS_RELATION_UNAVAILABLE" });
  });
  it("deployment snapshot: a profile whose catalogue binds no equity relation is a typed absence", async () => {
    const { deploymentFinancials } = await import("../src/resource-read/scoped-summary-facts");
    const rows = deploymentFinancials([{ profile_environment: "live", deployment_id: "dep-live" }, { profile_environment: "sandbox", deployment_id: "dep-sandbox" }], undefined);
    expect(rows.map(row => [row.profile_environment, row.state, row.reason_code])).toEqual([
      ["live", "UNAVAILABLE", "DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE"], ["sandbox", "UNAVAILABLE", "DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE"]]);
  });
  it("deployment snapshot: a window the Portal cut is PARTIAL, never AVAILABLE", async () => {
    const { deploymentFinancials } = await import("../src/resource-read/scoped-summary-facts");
    const [row] = deploymentFinancials([{ profile_environment: "paper", deployment_id: OWN.deployment_id }],
      { unavailableEnvironments: new Set(), truncated: true, rows: [{ profile_environment: "paper", deployment_id: OWN.deployment_id, ts_ms: 5, currency: "USDT", net_pnl: "2", equity: "20" }] });
    expect(row).toMatchObject({ state: "PARTIAL", reason_code: "DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED", snapshot_at_ms: 5, net_pnl: "2" });
  });
  it("the same response without any new member parses as before (additive contract)", async () => {
    const { read } = resources({ full: true });
    const body = await read();
    const { deployment_financials, identity_absences, ...legacy } = body.data.alpha;
    expect(deployment_financials).toBeDefined();
    expect(identity_absences).toBeDefined();
    expect(scopedResourceResponseSchemas.ALPHA.safeParse({ ...body, data: { ...body.data, alpha: legacy } }).success).toBe(true);
  });
});
