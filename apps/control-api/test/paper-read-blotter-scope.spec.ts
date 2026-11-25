/** FE-052: genuine policy/source adapters with TEST_ONLY publications and rows.
 * These are unit/contract guards, not an installed TS/Edge qualification. */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { PaperBlotterQuerySchema } from "../src/paper-read/contracts";
import { managerPage } from "../src/paper-read/manager-records";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { productReadFixture, OWN, PEER, PRIVATE, FIELDS } from "./elp2-product-read.fixture";

const parse = (value: unknown) => PaperBlotterQuerySchema.parse(value);
const orderRows = (f: ReturnType<typeof productReadFixture>) =>
  f.snapshot.document.relations["manager.orders:orders"];
const values = (body: any) => body.source.data.items.map((row: any) =>
  Object.fromEntries(Object.entries(row.fields).map(([key, value]) => [key, (value as any).value])));

// Validate the actual producer query, not just a fixture that may agree with
// the schema while the BFF emits a different tuple. Official cells mount the
// contracts at /contracts; the fallback also supports this host-only test.
const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const paperSchema = JSON.parse(readFileSync(resolve(contractsRoot, "schemas/execution-paper-read.v1.schema.json"), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(paperSchema);
const validatePublishedQuery = ajv.getSchema(`${paperSchema.$id}#/$defs/Query`)!;
const assertPublishedQuery = (value: unknown) => {
  expect(validatePublishedQuery(value), JSON.stringify(validatePublishedQuery.errors)).toBe(true);
};

function nativePaperFixture(status = "ACCEPTED") {
  const f = productReadFixture();
  // The scope-only fixture intentionally uses OPEN as a synthetic filter
  // bucket. A Paper product row must publish an admitted source status; OPEN
  // is not a canonical order status and must still be quarantined below.
  orderRows(f).items.find(row => row.fields.order_id === "order-own-2")!.fields.status = status;
  for (const [source, name] of [
    ["manager.fills", "fills"], ["manager.conditional-orders", "conditional_order_groups"],
    ["manager.conditional-orders", "conditional_order_group_legs"], ["manager.sessions", "execution_sessions"],
    ["manager.reconciliation", "reconciliation_findings"], ["manager.command-journal", "command_journal"],
  ]) f.snapshot.document.relations[`${source}:${name}`] = { ...orderRows(f), relation: name, items: [] };
  return { ...f, service: new PaperReadService(f.product, f.config) };
}

describe("FE-052 bounded Blotter query", () => {
  it("accepts scalar bounded scope identifiers and keeps the default page bound", () => {
    expect(parse({ stage: "PAPER", deployment_id: " dep-1 ", account_id: "account:1", alpha_id: "alpha@1" }))
      .toMatchObject({ stage: "PAPER", deployment_id: "dep-1", account_id: "account:1", alpha_id: "alpha@1", limit: 50 });
  });
  it.each([
    { deployment_id: ["dep-1"] }, { account_id: null }, { alpha_id: "a".repeat(192) },
    { alpha_id: "alpha\nsecret" }, { alpha_id: "alpha/id" }, { stage: "paper" },
    { stage: ["PAPER"] }, { deployment_id: "" }, { limit: 101 },
    { deployment_id: "dep-1", source_id: "manager.orders" },
  ])("rejects an unbounded or malformed selection %j", query => {
    expect(PaperBlotterQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("FE-052 authorization and scope before pagination", () => {
  it("selects a later authorized account before limit, without borrowing hidden rows", async () => {
    const f = productReadFixture();
    const body = await f.orders({ stage: "PAPER", account_id: PRIVATE.account_id, sort: "submitted_at_asc" });
    expect(values(body).map((row: any) => row.order_id)).toEqual(["order-own-2"]);
    expect(values(body)[0].quantity).toBe("12345678901234567890.123456789");
    expect(body.source.data.next_cursor).toBeNull();
    expect(JSON.stringify(body)).not.toContain("PEER_ONLY_STATUS");
    expect(f.named.relationPage).not.toHaveBeenCalled();
  });

  it.each([PEER.deployment_id, "unknown-deployment"])("hidden/unknown deployment %s has the same refusal", async deploymentId => {
    const f = productReadFixture();
    await expect(f.orders({ deployment_id: deploymentId })).rejects.toMatchObject({
      status: 404, code: "EXECUTION_READ_NOT_AVAILABLE",
    });
    expect(f.named.relationPage).not.toHaveBeenCalled();
  });

  it("does not authorize a Cartesian combination of individually visible IDs", async () => {
    const f = productReadFixture();
    await expect(f.orders({ deployment_id: OWN.deployment_id, account_id: PRIVATE.account_id }))
      .rejects.toMatchObject({ status: 404, code: "EXECUTION_READ_NOT_AVAILABLE" });
  });

  it("requires the selected axis in the current field policy", async () => {
    const f = productReadFixture({ fields: FIELDS.filter(field => field !== "alpha_id") });
    await expect(f.orders({ alpha_id: OWN.alpha_id })).rejects.toMatchObject({
      status: 404, code: "EXECUTION_READ_NOT_AVAILABLE",
    });
  });

  it("accepts qualified strategy lineage, never alpha=strategy string guessing", async () => {
    const f = productReadFixture();
    orderRows(f).items = [{ lineage: { workspace_id: f.snapshot.workspaceId, profile_id: f.snapshot.profileId,
      source_contract_revision: f.snapshot.document.source_contract_revision }, fields: {
      strategy_id: "strategy-own", account_id: PRIVATE.account_id,
      order_id: "qualified-strategy-order", status: "OPEN", quantity: "0",
      submitted_at: "2026-10-01T00:00:00.000Z",
    } }];
    const body = await f.orders({ alpha_id: OWN.alpha_id });
    expect(values(body).map((row: any) => row.order_id)).toEqual(["qualified-strategy-order"]);
    await expect(f.orders({ alpha_id: "strategy-own" })).rejects.toMatchObject({
      status: 404, code: "EXECUTION_READ_NOT_AVAILABLE",
    });
  });

  it("keeps ambiguous deployment attribution partial rather than assigning a shared account", async () => {
    const f = productReadFixture();
    orderRows(f).items = [{ lineage: { workspace_id: f.snapshot.workspaceId, profile_id: f.snapshot.profileId,
      source_contract_revision: f.snapshot.document.source_contract_revision }, fields: {
      alpha_id: OWN.alpha_id, order_id: "ambiguous-order", quantity: "0", status: "OPEN",
      submitted_at: "2026-10-01T00:00:00.000Z",
    } }];
    const body = await f.orders({ deployment_id: PRIVATE.deployment_id });
    expect(values(body)).toEqual([]);
    expect(body.source.data.scope).toMatchObject({
      state: "PARTIAL", reason_code: "N22_BLOTTER_SCOPE_LINEAGE_NOT_PUBLISHED",
    });
    expect(body.source.data.projected_total_items).toBeUndefined();
    expect(body.source.completeness).toBe("PARTIAL");
  });

  it.each([false, true])("binds a source cursor to all selected axes (legacy=%s)", async legacy => {
    const f = productReadFixture({ legacy });
    const first = await f.orders({ alpha_id: OWN.alpha_id, sort: "submitted_at_asc" });
    expect(first.source.data.next_cursor).toEqual(expect.any(String));
    await expect(f.orders({ alpha_id: OWN.alpha_id, deployment_id: OWN.deployment_id,
      sort: "submitted_at_asc", cursor: first.source.data.next_cursor }))
      .rejects.toMatchObject({ status: 400, code: "N31_PROJECTION_CURSOR_INVALID" });
    const next = await f.orders({ alpha_id: OWN.alpha_id, sort: "submitted_at_asc", cursor: first.source.data.next_cursor });
    expect(values(next).map((row: any) => row.order_id)).toEqual(["order-own-2"]);
  });

  it.each([false, true])("normalizes implicit/explicit Paper stage and sort in source cursors (legacy=%s)", async legacy => {
    const f = productReadFixture({ legacy });
    const first = await f.orders();
    const next = await f.orders({ stage: "PAPER", sort: "submitted_at_desc", cursor: first.source.data.next_cursor });
    expect(values(next).map((row: any) => row.order_id)).toEqual([legacy ? "order-own-2" : "order-own-1"]);
  });

  it("legacy rows without explicit alpha facts stay partial, not strategy-derived exact zeros", async () => {
    const f = productReadFixture({ legacy: true });
    for (const row of orderRows(f).items) delete row.fields.alpha_id;
    const body = await f.orders({ alpha_id: OWN.alpha_id });
    expect(values(body)).toEqual([]);
    expect(body.source.data.scope).toMatchObject({ state: "PARTIAL", reason_code: "N22_BLOTTER_SCOPE_LINEAGE_NOT_PUBLISHED" });
    expect(body.source.data.projected_total_items).toBeUndefined();
    expect(body.source.data.filtered_total_items).toBeUndefined();
  });

  it("does not switch the Paper relation to another stage", async () => {
    const f = productReadFixture();
    await expect(f.orders({ stage: "LIVE" })).rejects.toMatchObject({
      status: 400, code: "N22_BLOTTER_STAGE_NOT_AVAILABLE",
    });
  });

  it("keeps current native redaction separate from an exact mirror proof", async () => {
    const f = productReadFixture();
    const body = await f.orders({ account_id: PRIVATE.account_id });
    expect(body.projection).toBeUndefined();
    expect(body.source.completeness).toBe("PARTIAL");
    for (const key of ["projected_total_items", "filtered_total_items", "window_aggregates"])
      expect(body.source.data[key]).toBeUndefined();
    const page = managerPage(body, "orders", ["order_id", "quantity"]);
    expect(page.items.map(row => row.order_id)).toEqual(["order-own-2"]);
    expect(page.projection).toBeNull();
    expect(page.exactTotal).toBeNull();
    expect(page.filteredTotal).toBeNull();
    expect(page.aggregates).toBeNull();
  });

  it.each(["ACCEPTED", "RISK_REJECTED"])("serves admitted native %s through the real Paper adapter without claiming mirror or TS exactness", async status => {
    const f = nativePaperFixture(status);
    const body = await f.service.blotter(f.principal, parse({ account_id: PRIVATE.account_id })) as any;
    expect(body.data.orders.map((row: any) => row.order_id)).toEqual(["order-own-2"]);
    expect(body.data.orders[0].status).toBe(status === "RISK_REJECTED" ? "REJECTED" : status);
    if (status === "RISK_REJECTED") expect(body.data.orders[0].source_status).toBe("RISK_REJECTED");
    expect(body.data.exact_query).toMatchObject({
      state: "PARTIAL", reason_code: "SOURCE_PARTIAL", authority: null, formula_version: null,
    });
    expect(body.data.exact_query.mirror_revision).toBeUndefined();
    expect(body.data.exact_total).toBeNull();
    expect(body.data.filtered_total).toBeNull();
    expect(body.data.aggregates).toBeNull();
    assertPublishedQuery(body.data.query);
  });

  it.each([
    ["OPEN", ["order-own-2"]], ["FILLED", []],
  ] as const)("retains the %s status-bucket helper without adding a canonical axis", async (statusBucket, expectedIds) => {
    const f = nativePaperFixture();
    const body = await f.service.blotter(f.principal, parse({
      account_id: PRIVATE.account_id, status_bucket: statusBucket,
    })) as any;
    expect(body.data.orders.map((row: any) => row.order_id)).toEqual(expectedIds);
    expect(body.data.query.filters.status_bucket).toBe(statusBucket);
    expect(body.data.query.filter_allowlist).not.toContain("status_bucket");
    assertPublishedQuery(body.data.query);
  });

  it.each(["OPEN", "UNKNOWN_SOURCE_STATUS"])("still quarantines native source status %s instead of inventing a mapping", async status => {
    const f = nativePaperFixture(status);
    const body = await f.service.blotter(f.principal, parse({ account_id: PRIVATE.account_id })) as any;
    expect(body.data.orders).toEqual([]);
    expect(body.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.orders", state: "PARTIAL", reason_code: "N22_ORDER_STATUS_QUARANTINED", quarantined_rows: 1,
    }));
    expect(body.data.exact_query).toMatchObject({ state: "PARTIAL", authority: null, formula_version: null });
    expect(body.data.exact_total).toBeNull();
    expect(body.data.filtered_total).toBeNull();
  });
});

/** Narrow service fixture only for query propagation/opaque cursor guards.
 * Real scope and source relation behavior is exercised above. */
function serviceFixture() {
  const f = productReadFixture({ legacy: true });
  const relation = vi.fn(async (_principal: unknown, _environment: string, _screen: string, _source: string,
    name: string, _query: unknown) => ({
    profile_id: "PAPER_BINANCE_USDM", source_environment: "paper",
    source: {
      profile_id: "PAPER_BINANCE_USDM", authority: "EXECUTION_CELL", availability: "AVAILABLE",
      freshness: "STALE", completeness: "PARTIAL", as_of: null,
      data: {
        relation: { schema: "public", relation: name },
        items: name === "orders" ? [{ relation: { schema: "public", relation: name }, fields: {
          order_id: { kind: "TEXT", value: "order-1" }, status: { kind: "TEXT", value: "SUBMITTED" },
          deployment_id: { kind: "TEXT", value: PRIVATE.deployment_id },
          alpha_id: { kind: "TEXT", value: OWN.alpha_id }, quantity: { kind: "DECIMAL", value: "0" },
        } }] : [],
        next_cursor: name === "orders" ? "TEST_ONLY-next-source-cursor" : null,
      },
    },
  }));
  const service = new PaperReadService({ relation } as unknown as ExecutionProductReadSource, f.config);
  return { ...f, relation, service };
}

describe("FE-052 product query propagation", () => {
  it("passes each scope axis to every bounded branch and preserves source absence", async () => {
    const f = serviceFixture();
    const filters = { stage: "PAPER" as const, deployment_id: PRIVATE.deployment_id,
      account_id: PRIVATE.account_id, alpha_id: OWN.alpha_id };
    const body = await f.service.blotter(f.principal, parse(filters)) as any;
    // Six branches, the fills read narrowed to the page's orders, and the deployment census for the Deployment join.
    expect(f.relation).toHaveBeenCalledTimes(8);
    const blotterCalls = f.relation.mock.calls.filter(call => call[2] === "EXECUTION_FULL_BLOTTER_SCREEN");
    expect(blotterCalls).toHaveLength(7);
    for (const call of blotterCalls) expect(call[5]).toMatchObject(filters);
    expect(body.data.query.filters).toMatchObject(filters);
    expect(body.data.query.filter_allowlist).toEqual([
      "status", "venue", "symbol", "side", "stage", "deployment_id", "account_id", "alpha_id",
    ]);
    assertPublishedQuery(body.data.query);
    expect(body.data.orders[0]).toMatchObject({ deployment_id: PRIVATE.deployment_id, alpha_id: OWN.alpha_id, quantity: "0" });
    for (const field of ["filled_quantity", "average_fill_price", "slippage", "fee"])
      expect(body.data.orders[0][field]).toBeUndefined();
  });

  it.each(["ninth helper", "reordered tuple"])("rejects actual producer query mutated to a %s", async mutation => {
    const f = serviceFixture();
    const body = await f.service.blotter(f.principal, parse({})) as any;
    assertPublishedQuery(body.data.query);
    const allowlist = [...body.data.query.filter_allowlist];
    if (mutation === "ninth helper") allowlist.push("status_bucket");
    else [allowlist[0], allowlist[1]] = [allowlist[1], allowlist[0]];
    expect(validatePublishedQuery({ ...body.data.query, filter_allowlist: allowlist })).toBe(false);
    expect(validatePublishedQuery.errors).toContainEqual(expect.objectContaining({
      instancePath: "/filter_allowlist", keyword: "const",
    }));
  });

  it.each(["SANDBOX", "CANARY", "LIVE"] as const)("refuses %s before any source read", async stage => {
    const f = serviceFixture();
    await expect(f.service.blotter(f.principal, parse({ stage }))).rejects.toMatchObject({
      code: "N22_BLOTTER_STAGE_NOT_AVAILABLE", status: 400,
    });
    expect(f.relation).not.toHaveBeenCalled();
  });

  it.each(["stage", "deployment_id", "account_id", "alpha_id"] as const)("binds the product continuation to %s", async axis => {
    const f = serviceFixture();
    const query = parse({ stage: "PAPER", deployment_id: PRIVATE.deployment_id,
      account_id: PRIVATE.account_id, alpha_id: OWN.alpha_id });
    const first = await f.service.blotter(f.principal, query) as any;
    const changed = { ...query, [axis]: axis === "stage" ? "LIVE" : "another-id", after: first.data.page.next_cursor };
    await expect(f.service.blotter(f.principal, changed)).rejects.toMatchObject({
      code: axis === "stage" ? "N22_BLOTTER_STAGE_NOT_AVAILABLE" : "CURSOR_CONTEXT_MISMATCH",
    });
    expect(f.relation).toHaveBeenCalledTimes(8);
  });

  it("treats implicit and explicit Paper/default sort as the same cursor selection", async () => {
    const f = serviceFixture();
    const first = await f.service.blotter(f.principal, { limit: 1 }) as any;
    await expect(f.service.blotter(f.principal, { limit: 1, stage: "PAPER", sort: "submitted_at_desc", after: first.data.page.next_cursor }))
      .resolves.toHaveProperty("data.page");
    expect(f.relation).toHaveBeenCalledTimes(16);
  });
});
