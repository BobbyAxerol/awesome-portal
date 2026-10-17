/** TEST_ONLY authority + retained JSON fixtures, actual current scope/reader.
 * NOT a source/PG/runtime acceptance or held compound-source fence proof. */
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { productReadFixture as fixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { joinRetainedBracketLegRows, namedRetainedBusinessFields } from "../src/execution/retained-business-aliases";
import { NAMED_RETAINED_PURPOSES } from "../src/execution/retained-operation-page";
import type { ProjectionScalar } from "../src/execution/profile-projection.repository";

type Fixture = ReturnType<typeof fixture>;
const TIME = "2026-10-01T12:00:00.000Z";
const CHILD = "manager.current.order-bracket-legs:order_bracket_legs";
const PARENT = "manager.current.order-brackets:order_brackets";
function put(f: Fixture, relation: "order_brackets" | "order_bracket_legs", rows: Record<string, ProjectionScalar>[]) {
  const source = relation === "order_brackets" ? "manager.current.order-brackets" : "manager.current.order-bracket-legs";
  f.snapshot.document.relations[source + ":" + relation] = {
    source_id: source, relation, availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH",
    reason_code: null, as_of: TIME, items: rows.map(fields => ({ fields, lineage: {
      workspace_id: f.principal.workspaceId, profile_id: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!,
      source_contract_revision: "TEST_ONLY-contract" } })),
  };
}
function bracket(id = "PRIVATE-bracket", fields: Record<string, ProjectionScalar> = {}) {
  return { bracket_group_id: id, account_id: PRIVATE.account_id, strategy_id: null, mode: "paper",
    execution_session_id: "PRIVATE-session", risk_grant_id: "PRIVATE-risk", error_message: "PRIVATE-error",
    venue: "PRIVATE-venue", ...fields };
}
function leg(id = "1", fields: Record<string, ProjectionScalar> = {}) {
  return { bracket_group_id: "PRIVATE-bracket", leg_id: id, leg_index: "0", side: "BUY", quantity: "0",
    price: "12345678901234567890.0001", status: "SUBMITTED", created_at: TIME, updated_at: TIME,
    submitted_at: TIME, client_order_id: "PRIVATE-client", trigger_price: "90000", reduce_only: true,
    quantity_fraction: "0.5", order_type: "LIMIT", leg_type: "TAKE_PROFIT", time_in_force: "GTC", ...fields };
}
function seed(f: Fixture) { put(f, "order_brackets", [bracket()]); put(f, "order_bracket_legs", [leg()]); }
function run(f: Fixture, query: { limit?: number; cursor?: string } = {}) {
  return f.maximum.relationPage(f.principal, "order-bracket-legs", { environment: "paper", limit: 20, ...query });
}
function parentReads(f: Fixture) {
  return f.access.readPublication.mock.calls.filter(([request]) => request.binding.dataset_id.endsWith(":order_brackets"));
}

describe("ELP2-04 finite same-snapshot order-bracket legs", () => {
  it("opens only the narrow account purpose and existing public-field vocabulary", () => {
    expect(NAMED_RETAINED_PURPOSES.order_bracket_legs).toBe("account.read");
    expect(NAMED_RETAINED_PURPOSES.order_brackets).toBe("alpha.read");
    expect(Object.values(NAMED_RETAINED_PURPOSES).filter(value => value === null)).toHaveLength(29);
    expect(namedRetainedBusinessFields("order_bracket_legs")!.every(field =>
      BUSINESS_READ_FIELDS.includes(field as never) || field === "submitted_at")).toBe(true);
  });

  it("serves a private account parent with no strategy/session inference, exact decimals and opaque identity", async () => {
    const f = fixture({ fields: [...BUSINESS_READ_FIELDS] }); seed(f);
    const authorize = vi.spyOn(f.scopes, "authorize");
    const value = await run(f);
    expect(value.records).toHaveLength(1);
    expect(value.records[0].values).toEqual({ leg_id: "1", side: "BUY", quantity: "0",
      price: "12345678901234567890.0001", status: "SUBMITTED", created_at: Date.parse(TIME),
      updated_at: Date.parse(TIME), submitted_at: Date.parse(TIME) });
    expect(value.records[0].resource_id).toMatch(/^por1_[a-f0-9]{64}$/);
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-|trigger_price|reduce_only|leg_type|account_id|execution_session_id/);
    expect(authorize.mock.calls.some(([, , requirement]) => requirement.action === "account.read" &&
      requirement.dataset?.dataset_id === "relation:" + PARENT)).toBe(true);
    expect(parentReads(f).length).toBeGreaterThan(0);
    expect(f.access.readPublication.mock.calls.some(([request]) => request.binding.dataset_id.endsWith(":execution_sessions"))).toBe(false);
    expect(f.repository.rawSnapshot).toHaveBeenCalledOnce();
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(value).toMatchObject({ state: "PARTIAL", coverage: "AUTHORIZED_ONLY",
      source_health: { freshness: "STALE", completeness: "PARTIAL", as_of_ms: null, replay_eligible: false } });
    expect((await run(f)).records[0].resource_id).toBe(value.records[0].resource_id);
    const guess = "por1_" + createHash("sha256").update(value.logical_operation_id + "\u0000leg_id\u00001").digest("hex");
    expect(value.records[0].resource_id).not.toBe(guess);
  });

  it("intersects current child fields without publishing parent IDs or adding global vocabulary", async () => {
    const f = fixture({ fields: ["status"] }); seed(f);
    expect((await run(f)).records[0].values).toEqual({ status: "SUBMITTED" });
  });

  it("does not allow Alpha ownership to replace explicit child account authority", async () => {
    const f = fixture(); seed(f);
    f.context.grants = f.context.grants.filter(grant => grant.action !== "account.read");
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });

  it("requires accepted independent parent authority before raw snapshot bytes", async () => {
    const f = fixture(); const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request =>
      request.binding.dataset_id.endsWith(":order_brackets") ? null as never : original(request));
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });

  it("does not use a child strategy to narrow an unauthorized shared-account parent", async () => {
    const f = fixture(); put(f, "order_brackets", [bracket("PRIVATE-bracket", { account_id: OWN.account_id })]);
    put(f, "order_bracket_legs", [leg("1", { account_id: OWN.account_id, strategy_id: "strategy-own" })]);
    expect((await run(f)).records).toEqual([]);
    const full = fixture({ full: true }); put(full, "order_brackets", [bracket("PRIVATE-bracket", { account_id: OWN.account_id })]);
    put(full, "order_bracket_legs", [leg()]);
    expect((await run(full)).records).toHaveLength(1);
  });

  it.each(["missing", "hidden", "duplicate-hidden", "contradictory-account", "contradictory-strategy",
    "contradictory-session", "wrong-mode", "no-account"] as const)(
    "omits %s parent links uniformly before private identity/field validation", async fault => {
      const f = fixture(); let parents: ReturnType<typeof bracket>[] = [bracket()];
      let row: Record<string, ProjectionScalar> = leg();
      if (fault === "missing") parents = [];
      if (fault === "hidden") parents = [bracket("PRIVATE-bracket", { account_id: PEER.account_id, strategy_id: "strategy-peer" })];
      if (fault === "duplicate-hidden") parents.push(bracket("PRIVATE-bracket", { account_id: PEER.account_id, strategy_id: "strategy-peer" }));
      if (fault === "contradictory-account") row.account_id = PEER.account_id;
      if (fault === "contradictory-strategy") { parents = [bracket("PRIVATE-bracket", { strategy_id: "strategy-own" })]; row.strategy_id = "strategy-peer"; }
      if (fault === "contradictory-session") row.execution_session_id = "OTHER-PRIVATE-session";
      if (fault === "wrong-mode") parents = [bracket("PRIVATE-bracket", { mode: "live" })];
      if (fault === "no-account") parents = [bracket("PRIVATE-bracket", { account_id: null })];
      put(f, "order_brackets", parents); put(f, "order_bracket_legs", [row]);
      const absent = await run(f);
      expect(absent.records).toEqual([]);
      put(f, "order_bracket_legs", []);
      expect(await run(f)).toEqual(absent);
    });

  it("does not inspect an invalid leg identity on hidden/unknown lineage", async () => {
    const f = fixture();
    put(f, "order_brackets", [bracket("PRIVATE-bracket", { account_id: PEER.account_id, strategy_id: "strategy-peer" })]);
    put(f, "order_bracket_legs", [leg("1", { leg_id: null }), leg("2", { bracket_group_id: "unknown", leg_id: null })]);
    const hidden = await run(f);
    put(f, "order_bracket_legs", []);
    expect(await run(f)).toEqual(hidden);
  });

  it.each(["missing", "duplicate-relation", "wrong-source", "unavailable", "partial", "unknown", "mixed-freshness", "missing-clock", "bad-clock"] as const)(
    "does not turn %s parent DATASET into empty success", async fault => {
      const f = fixture(); seed(f); const parent = f.snapshot.document.relations[PARENT];
      if (fault === "missing") delete f.snapshot.document.relations[PARENT];
      if (fault === "duplicate-relation") f.snapshot.document.relations["other:order_brackets"] = parent;
      if (fault === "wrong-source") parent.source_id = "manager.UNREGISTERED";
      if (fault === "unavailable") parent.availability = "UNAVAILABLE";
      if (fault === "partial") parent.completeness = "PARTIAL";
      if (fault === "unknown") parent.freshness = "UNKNOWN";
      if (fault === "mixed-freshness") parent.freshness = "STALE";
      if (fault === "missing-clock") parent.as_of = null;
      if (fault === "bad-clock") parent.as_of = "not-a-clock";
      await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    });

  it("keeps a compatible STALE retained pair honestly PARTIAL", async () => {
    const f = fixture(); seed(f);
    f.snapshot.document.relations[PARENT].freshness = "STALE"; f.snapshot.document.relations[CHILD].freshness = "STALE";
    expect((await run(f))).toMatchObject({ state: "PARTIAL", source_health: { freshness: "STALE", completeness: "PARTIAL" } });
  });

  it("rejects a wrong child source and never silently accepts new legacy bracket aliases", async () => {
    const f = fixture(); seed(f); f.snapshot.document.relations[CHILD].source_id = "manager.brackets";
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("binds the parent current revision into cursor continuation and final delivery", async () => {
    const f = fixture(); seed(f); put(f, "order_bracket_legs", [leg("1"), leg("2")]);
    const original = f.access.readPublication.getMockImplementation()!;
    let revision = "TEST_ONLY-parent-r1";
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      return request.binding.dataset_id.endsWith(":order_brackets") ? { ...value, publication_revision: revision } : value;
    });
    const first = await run(f, { limit: 1 });
    expect(first.page.next_cursor).toEqual(expect.any(String));
    revision = "TEST_ONLY-parent-r2";
    await expect(run(f, { limit: 1, cursor: first.page.next_cursor! }))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
    let reads = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++reads === 3) revision = "TEST_ONLY-parent-r3"; return f.snapshot;
    });
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("refuses account grants revoked after final snapshot I/O", async () => {
    const f = fixture(); seed(f); let reads = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++reads === 3) { f.context.grants = []; f.context.authority_fingerprint = "TEST_ONLY-revoked"; } return f.snapshot;
    });
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("refuses a different raw snapshot before private FK resolution", async () => {
    const f = fixture(); seed(f);
    f.repository.rawSnapshot.mockResolvedValue({ ...f.snapshot, payloadDigest: "sha256:" + "c".repeat(64) });
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it.each(["children", "parents"] as const)("bounds the full %s census without truncation", async bound => {
    const f = fixture(); seed(f);
    if (bound === "children") put(f, "order_bracket_legs", Array.from({ length: 2_001 }, (_, index) => leg(String(index))));
    else put(f, "order_brackets", Array.from({ length: 2_001 }, (_, index) => bracket(String(index))));
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("accepts the exact 2000-row join bound and refuses duplicate visible child identities", async () => {
    const parents = [{ fields: bracket() }];
    const children = Array.from({ length: 2_000 }, (_, index) => ({ fields: leg(String(index)) }));
    expect(joinRetainedBracketLegRows(children, parents, "paper")).toHaveLength(2_000);
    const f = fixture(); seed(f); put(f, "order_bracket_legs", [leg("1"), leg("1")]);
    await expect(run(f)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("uses descriptor-only private joins; malformed duplicates cannot be selected away", () => {
    const getter = vi.fn(() => "PRIVATE-bracket");
    const malformed = Object.defineProperty(bracket(), "private", { enumerable: true, get: getter });
    expect(joinRetainedBracketLegRows([{ fields: leg() }], [{ fields: bracket() }, { fields: malformed }], "paper")).toEqual([]);
    const badChild = Object.defineProperty(leg(), "bracket_group_id", { enumerable: true, get: getter });
    expect(joinRetainedBracketLegRows([{ fields: badChild }], [{ fields: bracket() }], "paper")).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
  });

  it("retains legacy bytes and broad legacy fields without introducing a parent dependency", async () => {
    const f = fixture({ legacy: true }); put(f, "order_bracket_legs", [leg()]);
    const value = await run(f);
    expect(parentReads(f)).toHaveLength(0);
    expect(value.records[0].values).toMatchObject({ bracket_group_id: "PRIVATE-bracket", trigger_price: "90000", order_type: "LIMIT" });
    expect(value.records[0].resource_id).toBe("por1_" + createHash("sha256")
      .update(value.logical_operation_id + "\u0000leg_id\u00001").digest("hex"));
    expect(value).not.toHaveProperty("read_scope");
  });
});
