/** TEST_ONLY local authority/publication + stored projection fixtures. Real
 * scope minting and product readers; NOT source/TLS/runtime commissioning. */
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { querySigningKeys } from "../src/config";
import { productReadFixture as fixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { NAMED_RETAINED_PURPOSES } from "../src/execution/retained-operation-page";
import { scopeAllowsField } from "../src/execution-v2/read-scope";
import { joinRetainedConditionalLegRows, joinRetainedFindingSessionRows, namedRetainedBusinessFields, namedRetainedBusinessResourceId } from "../src/execution/retained-business-aliases";
import type { ProjectionScalar } from "../src/execution/profile-projection.repository";

type Fixture = ReturnType<typeof fixture>;
const TIME = "2026-10-01T12:00:00.000Z";
function set(f: Fixture, relation: string, rows: Record<string, ProjectionScalar>[]) {
  const source = relation === "account_sync_effective" ? "manager.accounts" : relation === "reconciliation_findings"
    ? "manager.reconciliation" : relation === "execution_sessions" ? "manager.sessions" : "manager.conditional-orders";
  f.snapshot.document.relations[`${source}:${relation}`] = {
    source_id: source, relation, availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH",
    reason_code: null, as_of: TIME,
    items: rows.map(fields => ({ fields, lineage: { workspace_id: f.principal.workspaceId,
      profile_id: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!, source_contract_revision: "TEST_ONLY-contract" } })),
  };
}
function run(f: Fixture, route: string, query: { limit?: number; cursor?: string } = {}) {
  return f.maximum.relationPage(f.principal, route, { environment: "paper", limit: 20, ...query });
}
function sync(id: string, account = PRIVATE.account_id) {
  return { sync_id: id, account_id: account, currency: "USDT", mode: "paper", status: "READY", created_at: TIME,
    source: "DO_NOT_PUBLISH_SOURCE", venue: "DO_NOT_PUBLISH_VENUE", buying_power: "9999999" };
}
function finding(id: string, anchors: Record<string, string> = PRIVATE) {
  return { ...anchors, finding_id: id, strategy_id: "strategy-own", status: "OPEN", mode: "paper", created_at: TIME,
    finding_type: "DO_NOT_PUBLISH_TYPE", severity: "DO_NOT_PUBLISH_SEVERITY", venue: "DO_NOT_PUBLISH_VENUE" };
}
function parent(group: string, anchors: Record<string, string> = PRIVATE) {
  return { ...anchors, group_id: group, strategy_id: "strategy-own", mode: "paper" };
}
function session(id = "PRIVATE-SESSION", fields: Record<string, ProjectionScalar> = {}) {
  return { execution_session_id: id, account_id: PRIVATE.account_id, strategy_id: "strategy-own",
    mode: "paper", submitted_count: "DO_NOT_PUBLISH_COUNT", ...fields };
}
function dependentFinding(id = "PRIVATE-FINDING", fields: Record<string, ProjectionScalar> = {}) {
  return { finding_id: id, account_id: PRIVATE.account_id, strategy_id: null,
    execution_session_id: "PRIVATE-SESSION", mode: "paper", status: "OPEN", created_at: TIME, ...fields };
}
function parentReads(f: Fixture) {
  return f.access.readPublication.mock.calls.filter(([request]) => request.binding.dataset_id.endsWith(":execution_sessions"));
}
/** Keep the child current authority intact. Removing alpha.read globally also
 * invalidates its linked account scope, so that is not a parent-only denial. */
function peerOnlySessionPublication(f: Fixture) {
  const original = f.access.readPublication.getMockImplementation()!;
  const peerKeys = new Set([`ALPHA:${PEER.alpha_id}`, `ALPHA_VERSION:${PEER.alpha_version_id}`,
    `PORTFOLIO:${PEER.portfolio_id}`, `DEPLOYMENT:${PEER.deployment_id}`, `ACCOUNT:${PEER.account_id}`]);
  f.access.readPublication.mockImplementation(async request => {
    const value = await original(request);
    return request.binding.dataset_id.endsWith(":execution_sessions") ? { ...value,
      resources: value.resources.filter(resource => peerKeys.has(`${resource.kind}:${resource.id}`)), tuples: [PEER],
      current_linkage: { ...value.current_linkage, pairs: [{ alpha_id: PEER.alpha_id, portfolio_id: PEER.portfolio_id }] },
      strategy_lineage: { ...value.strategy_lineage, pairs: [{ strategy_id: "strategy-peer", alpha_id: PEER.alpha_id }] },
    } : value;
  });
}
function leg(group: string, id = "own-leg") {
  return { group_id: group, leg_id: id, sequence: "1", side: "BUY", quantity: "0", price: "12345678901234567890.0001",
    state: "ACTIVE", created_at: TIME, updated_at: TIME, client_order_id: "DO_NOT_PUBLISH_CLIENT",
    venue_order_id: "DO_NOT_PUBLISH_VENUE_ORDER", trigger_price: "90000", order_type: "LIMIT" };
}

describe("ELP2-04 first three finite named business aliases", () => {
  it("keeps six explicit finite account purposes; the other27 named purposes stay closed", () => {
    expect(Object.values(NAMED_RETAINED_PURPOSES).filter(value => value === null)).toHaveLength(27);
    expect(NAMED_RETAINED_PURPOSES.order_bracket_legs).toBe("account.read");
    for (const alias of ["account_sync_current_state", "account_sync_effective", "account_sync_snapshots",
      "reconciliation_findings", "conditional_order_group_legs"]) {
      expect(NAMED_RETAINED_PURPOSES[alias as keyof typeof NAMED_RETAINED_PURPOSES]).toBe("account.read");
      expect(namedRetainedBusinessFields(alias)!.every(field => BUSINESS_READ_FIELDS.includes(field as never) || field === "mode")).toBe(true);
    }
    expect(namedRetainedBusinessFields("command_journal")).toBeNull();
  });
  it("publishes sync status without granting raw sync ID, custody amounts or venue/source", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("PRIVATE-SYNC-ID")]);
    const value = await run(f, "account-sync-effective");
    expect(value.records).toHaveLength(1);
    expect(value.records[0]).toMatchObject({ resource_id: expect.stringMatching(/^por1_[a-f0-9]{64}$/), values: {
      account_id: PRIVATE.account_id, currency: "USDT", mode: "paper", status: "READY", created_at: Date.parse(TIME),
    } });
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-SYNC-ID|DO_NOT_PUBLISH|9999999/);
    const identity = ["sync_id\u0000PRIVATE-SYNC-ID"];
    const guessed = `por1_${createHash("sha256").update(`${value.logical_operation_id}\u0000${identity.join("\u0001")}`).digest("hex")}`;
    expect(value.records[0].resource_id).not.toBe(guessed);
    expect(value.records[0].resource_id).toBe(namedRetainedBusinessResourceId(
      querySigningKeys(f.config)[f.config.QUERY_CURSOR_ACTIVE_KEY_ID], f.principal.workspaceId,
      "paper", f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!, value.logical_operation_id, identity));
    expect((await run(f, "account-sync-effective")).records[0].resource_id).toBe(value.records[0].resource_id);
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it.each(["workspace", "environment", "profile", "operation", "identity", "key"] as const)(
    "keyed row identity is separated by %s without returning a private identity", dimension => {
      const key = "TEST_ONLY-query-row-key-32-characters-minimum";
      const args: [string, string, "paper" | "sandbox" | "live", string, string, readonly string[]] = [
        key, "workspace-a", "paper", "profile-a", "operation-a", ["sync_id\u0000PRIVATE-ID"],
      ];
      const first = namedRetainedBusinessResourceId(...args);
      expect(namedRetainedBusinessResourceId(...args)).toBe(first);
      if (dimension === "workspace") args[1] = "workspace-b";
      if (dimension === "environment") args[2] = "live";
      if (dimension === "profile") args[3] = "profile-b";
      if (dimension === "operation") args[4] = "operation-b";
      if (dimension === "identity") args[5] = ["sync_id\u0000OTHER-PRIVATE-ID"];
      if (dimension === "key") args[0] = "TEST_ONLY-rotated-row-key-32-characters-minimum";
      const separated = namedRetainedBusinessResourceId(...args);
      expect(separated).not.toBe(first);
      expect(`${first}${separated}`).not.toMatch(/PRIVATE-ID|workspace-|profile-|operation-/);
    });
  it("invalidates finite-alias pagination on active row-key rotation while keeping the old signing key", async () => {
    const f = fixture();
    const oldKeyId = f.config.QUERY_CURSOR_ACTIVE_KEY_ID;
    f.config.QUERY_CURSOR_KEYS_JSON = JSON.stringify({ ...querySigningKeys(f.config),
      "TEST_ONLY-rotated": "TEST_ONLY-rotated-query-signing-key-32-bytes-minimum" });
    set(f, "account_sync_effective", [sync("one"), sync("two")]);
    const old = await run(f, "account-sync-effective", { limit: 1 });
    expect(old.page.next_cursor).toEqual(expect.any(String));
    f.config.QUERY_CURSOR_ACTIVE_KEY_ID = "TEST_ONLY-rotated";
    const rotated = await run(f, "account-sync-effective", { limit: 1 });
    expect(rotated.records[0].resource_id).not.toBe(old.records[0].resource_id);
    expect(querySigningKeys(f.config)[oldKeyId]).toEqual(expect.any(String));
    await expect(run(f, "account-sync-effective", { limit: 1, cursor: old.page.next_cursor! }))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
  });
  it("keeps account sync grain: shared account is hidden unless all correlated tuples are allowed", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("private"), sync("SECRET-shared", OWN.account_id)]);
    const value = await run(f, "account-sync-effective");
    expect(value.records).toHaveLength(1); expect(value.records[0].values.account_id).toBe(PRIVATE.account_id);
    const full = fixture({ full: true }); set(full, "account_sync_effective", [sync("a"), sync("b", OWN.account_id)]);
    expect((await run(full, "account-sync-effective")).records).toHaveLength(2);
  });
  it("a source identity supplies an opaque ID without making that private field public", async () => {
    const f = fixture({ fields: ["account_id", "status"] });
    set(f, "account_sync_effective", [sync("PRIVATE-SYNC-ID")]);
    const row = (await run(f, "account-sync-effective")).records[0];
    expect(row.values).toEqual({ account_id: PRIVATE.account_id, status: "READY" });
    expect(row.resource_id).toMatch(/^por1_[a-f0-9]{64}$/);
  });
  it("does not claim source-observed sync IDs are unique or deduplicate conflicting rows", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("same"), { ...sync("same"), status: "OTHER" }]);
    await expect(run(f, "account-sync-effective")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("ignores malformed identity on hidden rows before scalar/identity processing", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("own"), { ...sync("hidden", OWN.account_id), sync_id: null }]);
    expect((await run(f, "account-sync-effective")).records).toHaveLength(1);
  });
  it("a matching relation name under an unregistered source is not lineage proof", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("own")]);
    f.snapshot.document.relations["manager.accounts:account_sync_effective"].source_id = "manager.UNREGISTERED";
    await expect(run(f, "account-sync-effective")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it.each([null, "", "\u0000"])("rejects malformed visible private identity without raw diagnostic: %j", async identity => {
    const f = fixture(); set(f, "account_sync_effective", [{ ...sync("own"), sync_id: identity }]);
    await expect(run(f, "account-sync-effective")).rejects.toMatchObject({ status: 503 });
  });
  it("serves business-safe finding status, not diagnostics or peer records", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [finding("PRIVATE-FINDING"), {
      ...finding("SECRET-PEER", PEER), strategy_id: "strategy-peer", status: "SECRET-PEER-STATUS",
    }]);
    const value = await run(f, "reconciliation-findings");
    expect(value.records).toHaveLength(1); expect(value.records[0].values).toMatchObject({ account_id: PRIVATE.account_id, status: "OPEN" });
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-FINDING|SECRET-PEER|DO_NOT_PUBLISH/);
  });
  it("Alpha ownership alone is not the named account-read purpose", async () => {
    const f = fixture(); f.context.grants = f.context.grants.filter(grant => grant.action !== "account.read");
    set(f, "reconciliation_findings", [finding("own")]);
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it.each(["session-only", "missing-account"])("returns typed unavailable for an authorized but unsupported %s finding", async shape => {
    const f = fixture({ full: true }); set(f, "reconciliation_findings", [{ ...finding("unsupported"),
      ...(shape === "session-only" ? { strategy_id: null, execution_session_id: "unknown-session" } : { account_id: null }) }]);
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("does not reveal unsupported hidden shapes or unknown lineage through a source error", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [
      { ...finding("hidden", PEER), strategy_id: null, execution_session_id: "SECRET-session" },
      { ...finding("unknown-strategy"), strategy_id: "not-in-qualified-lineage" },
    ]);
    const hidden = await run(f, "reconciliation-findings"); set(f, "reconciliation_findings", []);
    expect(hidden).toEqual(await run(f, "reconciliation-findings"));
  });
  it("joins unanchored legs to the same immutable permitted group and preserves exact zero/decimals", async () => {
    const f = fixture({ fields: [...BUSINESS_READ_FIELDS] });
    set(f, "conditional_order_groups", [parent("own"), { ...parent("peer", PEER), strategy_id: "strategy-peer" }]);
    set(f, "conditional_order_group_legs", [leg("own"), leg("peer", "SECRET-LEG")]);
    const value = await run(f, "conditional-order-group-legs");
    expect(value.records).toHaveLength(1);
    expect(value.records[0].values).toMatchObject({ group_id: "own", leg_id: "own-leg", sequence: "1", quantity: "0", price: "12345678901234567890.0001" });
    expect(JSON.stringify(value)).not.toMatch(/SECRET-LEG|DO_NOT_PUBLISH|trigger_price|order_type/);
    expect(f.access.readPublication.mock.calls.some(([r]) => r.binding.dataset_id === "relation:manager.current.conditional-order-groups:conditional_order_groups")).toBe(true);
  });
  it.each(["missing", "duplicate", "contradictory"])("does not reinterpret %s conditional parent lineage", async fault => {
    const f = fixture({ full: true });
    set(f, "conditional_order_groups", fault === "missing" ? [] : fault === "duplicate" ? [parent("own"), parent("own", PEER)] : [parent("own")]);
    set(f, "conditional_order_group_legs", [{ ...leg("own"), ...(fault === "contradictory" ? { account_id: PEER.account_id } : {}) }]);
    const value = await run(f, "conditional-order-group-legs");
    expect(value.records).toEqual([]); expect(value.state).toBe("PARTIAL");
    expect(value.source_health).toMatchObject({ availability: "UNAVAILABLE", completeness: "PARTIAL" });
  });
  it("missing parent is typed unavailable, never empty success or lazy source lookup", async () => {
    const f = fixture({ full: true }); set(f, "conditional_order_group_legs", [leg("uncaptured")]);
    await expect(run(f, "conditional-order-group-legs")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(f.repository.rawSnapshot).toHaveBeenCalledOnce();
  });
  it.each(["unavailable", "partial", "unknown", "mixed-freshness", "missing-clock", "bad-clock"])(
    "refuses %s parent quality rather than making lineage complete", async fault => {
      const f = fixture({ full: true }); set(f, "conditional_order_groups", [parent("own")]);
      set(f, "conditional_order_group_legs", [leg("own")]);
      const input = f.snapshot.document.relations["manager.conditional-orders:conditional_order_groups"];
      if (fault === "unavailable") { input.availability = "UNAVAILABLE"; input.items = []; input.reason_code = "SOURCE_NOT_AVAILABLE"; }
      if (fault === "partial") input.completeness = "PARTIAL";
      if (fault === "unknown") input.freshness = "UNKNOWN";
      if (fault === "mixed-freshness") input.freshness = "STALE";
      if (fault === "missing-clock") input.as_of = null;
      if (fault === "bad-clock") input.as_of = "not-a-source-clock";
      await expect(run(f, "conditional-order-group-legs")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    });
  it("a compatible STALE retained pair stays PARTIAL/STALE, never current or complete", async () => {
    const f = fixture({ full: true }); set(f, "conditional_order_groups", [parent("own")]); set(f, "conditional_order_group_legs", [leg("own")]);
    f.snapshot.document.relations["manager.conditional-orders:conditional_order_groups"].freshness = "STALE";
    f.snapshot.document.relations["manager.conditional-orders:conditional_order_group_legs"].freshness = "STALE";
    const value = await run(f, "conditional-order-group-legs");
    expect(value.records).toHaveLength(1); expect(value.state).toBe("PARTIAL");
    expect(value.source_health).toMatchObject({ freshness: "STALE", completeness: "PARTIAL", as_of_ms: null });
  });
  it("requires independent accepted parent dataset before reading raw bytes", async () => {
    const f = fixture({ full: true }); const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => request.binding.dataset_id.includes(":conditional_order_groups") ? null as never : original(request));
    await expect(run(f, "conditional-order-group-legs")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("rejects duplicate physical relation aliases rather than choosing one parent", async () => {
    const f = fixture({ full: true }); set(f, "conditional_order_groups", [parent("own")]);
    f.snapshot.document.relations["another:conditional_order_groups"] = f.snapshot.document.relations["manager.conditional-orders:conditional_order_groups"];
    set(f, "conditional_order_group_legs", [leg("own")]);
    await expect(run(f, "conditional-order-group-legs")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("final grant revocation after the metadata await prevents returned records", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("own")]); let reads = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++reads === 3) { f.context.grants = []; f.context.authority_fingerprint = "TEST_ONLY-revoked"; }
      return f.snapshot;
    });
    await expect(run(f, "account-sync-effective")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("binds the independent parent publication to the final delivery fence", async () => {
    const f = fixture({ full: true }); set(f, "conditional_order_groups", [parent("own")]); set(f, "conditional_order_group_legs", [leg("own")]);
    const original = f.access.readPublication.getMockImplementation()!; let changed = false, reads = 0;
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      return { ...value, publication_revision: changed && request.binding.dataset_id.includes(":conditional_order_groups") ? "TEST_ONLY-parent-changed" : value.publication_revision };
    });
    f.repository.snapshotMetadata.mockImplementation(async () => { if (++reads === 3) changed = true; return f.snapshot; });
    await expect(run(f, "conditional-order-group-legs")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("keeps hidden-only and empty input observations indistinguishable", async () => {
    const f = fixture(); set(f, "account_sync_effective", [sync("hidden", OWN.account_id)]);
    const hidden = await run(f, "account-sync-effective"); set(f, "account_sync_effective", []);
    const empty = await run(f, "account-sync-effective");
    expect(hidden).toEqual(empty);
  });
  it("retains legacy source fields and behavior rather than silently applying a V2 field grant", async () => {
    const f = fixture({ legacy: true }); set(f, "account_sync_effective", [sync("legacy")]);
    const value = await run(f, "account-sync-effective");
    expect(value.records[0].values).toMatchObject({ sync_id: "legacy", source: "DO_NOT_PUBLISH_SOURCE", buying_power: "9999999" });
    expect(value.records[0].resource_id).toBe(`por1_${createHash("sha256")
      .update(`${value.logical_operation_id}\u0000sync_id\u0000legacy`).digest("hex")}`);
    expect(value).not.toHaveProperty("read_scope");
  });
  it("uses deterministic bounded parent work and never evaluates input getters", () => {
    const getter = vi.fn(() => "own"); const fields = Object.defineProperty({}, "group_id", { enumerable: true, get: getter });
    expect(joinRetainedConditionalLegRows([{ fields: leg("own") }], [{ fields: fields as never }])).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
    expect(() => joinRetainedConditionalLegRows(Array.from({ length: 2_001 }, () => ({ fields: leg("own") })), [{ fields: parent("own") }]))
      .toThrowError(expect.objectContaining({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" }));
  });
});

describe("ELP2-04 narrow finding session-parent lineage", () => {
  it("fills explicit null strategy only, with independently scoped parent and hidden private identity", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]);
    set(f, "execution_sessions", [session()]);
    const authorize = vi.spyOn(f.scopes, "authorize");
    const value = await run(f, "reconciliation-findings");
    expect(value.records).toHaveLength(1);
    expect(value.records[0].values).toEqual({ account_id: PRIVATE.account_id, strategy_id: "strategy-own",
      mode: "paper", status: "OPEN", created_at: Date.parse(TIME) });
    expect(value.records[0].resource_id).toMatch(/^por1_[a-f0-9]{64}$/);
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-FINDING|PRIVATE-SESSION|DO_NOT_PUBLISH_COUNT|execution_session_id/);
    expect(authorize.mock.calls.some(([, , requirement]) => requirement.action === "alpha.read" &&
      requirement.dataset?.dataset_id === "relation:manager.current.execution-sessions:execution_sessions")).toBe(true);
    expect(f.repository.rawSnapshot).toHaveBeenCalledOnce();
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(value).toMatchObject({ state: "PARTIAL", coverage: "AUTHORIZED_ONLY",
      source_health: { freshness: "STALE", completeness: "PARTIAL", replay_eligible: false } });
  });

  it.each(["absent", "denied", "partial", "wrong-source"] as const)(
    "direct/empty pages have no new parent dependency when parent is %s", async fault => {
      const f = fixture(); set(f, "reconciliation_findings", [finding("direct")]);
      const direct = await run(f, "reconciliation-findings");
      set(f, "execution_sessions", [session()]);
      const parent = f.snapshot.document.relations["manager.sessions:execution_sessions"];
      if (fault === "absent") delete f.snapshot.document.relations["manager.sessions:execution_sessions"];
      if (fault === "partial") parent.completeness = "PARTIAL";
      if (fault === "wrong-source") parent.source_id = "manager.UNREGISTERED";
      if (fault === "denied") peerOnlySessionPublication(f);
      f.access.readPublication.mockClear();
      expect(await run(f, "reconciliation-findings")).toEqual(direct);
      expect(parentReads(f)).toHaveLength(0);
      set(f, "reconciliation_findings", []);
      expect((await run(f, "reconciliation-findings")).records).toEqual([]);
      expect(parentReads(f)).toHaveLength(0);
    });

  it("hidden and shared-partial malformed session shapes equal empty before parent lookup", async () => {
    const f = fixture();
    set(f, "reconciliation_findings", [dependentFinding("hidden", { account_id: OWN.account_id,
      execution_session_id: "\u0000" }), dependentFinding("unknown", { account_id: "unknown-account" })]);
    set(f, "execution_sessions", [session()]);
    f.snapshot.document.relations["manager.sessions:execution_sessions"].completeness = "PARTIAL";
    const hidden = await run(f, "reconciliation-findings");
    expect(parentReads(f)).toHaveLength(0);
    set(f, "reconciliation_findings", []);
    expect(hidden).toEqual(await run(f, "reconciliation-findings"));
  });

  it("child account visibility cannot mint authority over a peer-only parent publication", async () => {
    const f = fixture(); peerOnlySessionPublication(f);
    set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(parentReads(f).length).toBeGreaterThan(0);
    set(f, "reconciliation_findings", [finding("direct")]);
    expect((await run(f, "reconciliation-findings")).records).toHaveLength(1);
  });

  it("all-tuples authority can resolve a shared-account candidate without changing its grain", async () => {
    const f = fixture({ full: true });
    set(f, "reconciliation_findings", [dependentFinding("shared", { account_id: OWN.account_id })]);
    set(f, "execution_sessions", [session("PRIVATE-SESSION", { account_id: OWN.account_id })]);
    expect((await run(f, "reconciliation-findings")).records[0].values).toMatchObject({
      account_id: OWN.account_id, strategy_id: "strategy-own" });
  });

  it.each([null, "", "\u0000", "x".repeat(4_097)] as const)(
    "an account-visible unsupported session key is typed unavailable: %j", async identity => {
      const f = fixture(); set(f, "reconciliation_findings", [dependentFinding("own", { execution_session_id: identity })]);
      set(f, "execution_sessions", [session()]);
      await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({
        code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    });

  it.each(["missing", "duplicate-relation", "wrong-source", "unavailable", "partial", "unknown", "mixed-freshness", "missing-clock", "bad-clock"] as const)(
    "a visible dependent record requires qualified parent DATASET: %s", async fault => {
      const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
      const parent = f.snapshot.document.relations["manager.sessions:execution_sessions"];
      if (fault === "missing") delete f.snapshot.document.relations["manager.sessions:execution_sessions"];
      if (fault === "duplicate-relation") f.snapshot.document.relations["other:execution_sessions"] = parent;
      if (fault === "wrong-source") parent.source_id = "manager.UNREGISTERED";
      if (fault === "unavailable") parent.availability = "UNAVAILABLE";
      if (fault === "partial") parent.completeness = "PARTIAL";
      if (fault === "unknown") parent.freshness = "UNKNOWN";
      if (fault === "mixed-freshness") parent.freshness = "STALE";
      if (fault === "missing-clock") parent.as_of = null;
      if (fault === "bad-clock") parent.as_of = "not-a-clock";
      await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({
        code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    });

  it("missing/ambiguous/contradictory/hidden parent ROWs have indistinguishable PARTIAL output", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]);
    const variants = [
      [],
      [session(), session("PRIVATE-SESSION", { account_id: PEER.account_id, strategy_id: "strategy-peer" })],
      [session("PRIVATE-SESSION", { account_id: PEER.account_id })],
      [session("PRIVATE-SESSION", { mode: "live" })],
      // Only checking the merged account+strategy would leak this parent:
      // original parent's contradictory explicit Alpha is not authorized.
      [session("PRIVATE-SESSION", { alpha_id: PEER.alpha_id })],
    ];
    let first: Awaited<ReturnType<typeof run>> | undefined;
    for (const rows of variants) {
      set(f, "execution_sessions", rows);
      const value = await run(f, "reconciliation-findings");
      expect(value.records).toEqual([]);
      expect(value).toMatchObject({ state: "PARTIAL",
        source_health: { availability: "UNAVAILABLE", freshness: "STALE", completeness: "PARTIAL" } });
      if (first) expect(value).toEqual(first); else first = value;
    }
  });

  it("keeps compatible STALE parent/child as retained observations and supports exact generated parent alias", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    f.snapshot.document.relations["manager.reconciliation:reconciliation_findings"].freshness = "STALE";
    const parent = f.snapshot.document.relations["manager.sessions:execution_sessions"];
    parent.freshness = "STALE"; parent.source_id = "manager.current.execution-sessions";
    const value = await run(f, "reconciliation-findings");
    expect(value.records).toHaveLength(1);
    expect(value.source_health).toMatchObject({ freshness: "STALE", completeness: "PARTIAL", as_of_ms: null });
  });

  it("uses the recovered strategy for authority even when its public field is not granted", async () => {
    const f = fixture({ fields: ["account_id", "status"] });
    set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    expect((await run(f, "reconciliation-findings")).records[0].values)
      .toEqual({ account_id: PRIVATE.account_id, status: "OPEN" });
  });

  it("intersects the inherited strategy field with an independently narrower session scope", async () => {
    const f = fixture({ fields: ["account_id", "status"] });
    const privateRoot = "TEST_ONLY-private-lineage";
    const privateResources = [
      { kind: "ALPHA", id: PRIVATE.alpha_id }, { kind: "ALPHA_VERSION", id: PRIVATE.alpha_version_id },
      { kind: "PORTFOLIO", id: PRIVATE.portfolio_id }, { kind: "DEPLOYMENT", id: PRIVATE.deployment_id },
      { kind: "ACCOUNT", id: PRIVATE.account_id },
    ] as const;
    const relations = f.context.relationsFor(f.principal.user.userId);
    f.context.relationsFor = () => ({ ...relations, roots: { ...relations.roots, [privateRoot]: privateResources } });
    f.context.grants = [...f.context.grants, { ...f.context.grants[0], grant_id: "TEST_ONLY-private-business-read",
      action: "business.read_all", selector: { kind: "ROOT_SCOPE", root_id: privateRoot } }];
    const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      // Only the finding publication is wholly business-readable. The actual
      // session publication keeps OWN+PEER+PRIVATE and mints restricted fields.
      return request.binding.dataset_id.endsWith(":reconciliation_findings") ? {
        ...value, resources: [...privateResources], tuples: [PRIVATE],
        current_linkage: { ...value.current_linkage,
          pairs: [{ alpha_id: PRIVATE.alpha_id, portfolio_id: PRIVATE.portfolio_id }] },
        strategy_lineage: { ...value.strategy_lineage,
          pairs: [{ strategy_id: "strategy-own", alpha_id: PRIVATE.alpha_id }] },
      } : value;
    });
    set(f, "reconciliation_findings", [finding("direct"), dependentFinding()]);
    set(f, "execution_sessions", [session()]);
    const authorize = vi.spyOn(f.scopes, "authorize");
    const value = await run(f, "reconciliation-findings");
    const childIndex = authorize.mock.calls.findIndex(([, , requirement]) =>
      requirement.action === "account.read" && requirement.dataset?.dataset_id.endsWith(":reconciliation_findings"));
    const parentIndex = authorize.mock.calls.findIndex(([, , requirement]) =>
      requirement.action === "alpha.read" && requirement.dataset?.dataset_id.endsWith(":execution_sessions"));
    expect(childIndex).toBeGreaterThanOrEqual(0); expect(parentIndex).toBeGreaterThanOrEqual(0);
    // Inspect genuine scopes minted by the policy engine, never JSON claims.
    expect(scopeAllowsField(await authorize.mock.results[childIndex].value, "strategy_id")).toBe(true);
    expect(scopeAllowsField(await authorize.mock.results[parentIndex].value, "strategy_id")).toBe(false);
    expect(value.records).toHaveLength(2);
    const direct = value.records.find(row => row.values.strategy_id === "strategy-own");
    const inherited = value.records.find(row => !Object.hasOwn(row.values, "strategy_id"));
    expect(direct?.values).toEqual({ account_id: PRIVATE.account_id, strategy_id: "strategy-own",
      mode: "paper", status: "OPEN", created_at: Date.parse(TIME) });
    expect(inherited?.values).toEqual({ account_id: PRIVATE.account_id,
      mode: "paper", status: "OPEN", created_at: Date.parse(TIME) });
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE-FINDING|PRIVATE-SESSION|execution_session_id|DO_NOT_PUBLISH/);
    expect(f.repository.rawSnapshot).toHaveBeenCalledOnce();
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });

  it("binds a used parent publication revision into pagination", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding("one"), dependentFinding("two")]);
    set(f, "execution_sessions", [session()]);
    const original = f.access.readPublication.getMockImplementation()!; let revision = "TEST_ONLY-session-r1";
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      return request.binding.dataset_id.endsWith(":execution_sessions") ? { ...value, publication_revision: revision } : value;
    });
    const first = await run(f, "reconciliation-findings", { limit: 1 });
    expect(first.page.next_cursor).toEqual(expect.any(String));
    revision = "TEST_ONLY-session-r2";
    await expect(run(f, "reconciliation-findings", { limit: 1, cursor: first.page.next_cursor! }))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
  });

  it("fences a used parent publication after final snapshot I/O", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    const original = f.access.readPublication.getMockImplementation()!; let changed = false, reads = 0;
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      return { ...value, publication_revision: changed && request.binding.dataset_id.endsWith(":execution_sessions")
        ? "TEST_ONLY-session-changed" : value.publication_revision };
    });
    f.repository.snapshotMetadata.mockImplementation(async () => { if (++reads === 3) changed = true; return f.snapshot; });
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("does not bind an unused parent revision to direct pagination", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [finding("direct-one"), finding("direct-two"), dependentFinding()]);
    set(f, "execution_sessions", [session("different-session")]);
    const original = f.access.readPublication.getMockImplementation()!; let revision = "TEST_ONLY-unused-r1";
    f.access.readPublication.mockImplementation(async request => {
      const value = await original(request);
      return request.binding.dataset_id.endsWith(":execution_sessions") ? { ...value, publication_revision: revision } : value;
    });
    const first = await run(f, "reconciliation-findings", { limit: 1 });
    expect(first.page.next_cursor).toEqual(expect.any(String));
    revision = "TEST_ONLY-unused-r2";
    const second = await run(f, "reconciliation-findings", { limit: 1, cursor: first.page.next_cursor! });
    expect(second.records).toHaveLength(1);
    expect(second.records[0].resource_id).not.toBe(first.records[0].resource_id);
  });

  it("does not return joined rows after parent alpha grant revocation", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    let reads = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++reads === 3) { f.context.grants = f.context.grants.filter(grant => grant.action !== "alpha.read");
        f.context.authority_fingerprint = "TEST_ONLY-parent-revoked"; }
      return f.snapshot;
    });
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("refuses a different raw snapshot before session resolution", async () => {
    const f = fixture(); set(f, "reconciliation_findings", [dependentFinding()]); set(f, "execution_sessions", [session()]);
    f.repository.rawSnapshot.mockResolvedValue({ ...f.snapshot, payloadDigest: `sha256:${"c".repeat(64)}` });
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(parentReads(f)).toHaveLength(0);
  });

  it.each(["parent", "dependent"] as const)("bounds %s join work without silently truncating", async bound => {
    const f = fixture(); set(f, "reconciliation_findings", bound === "dependent"
      ? Array.from({ length: 2_001 }, (_, index) => dependentFinding(String(index))) : [dependentFinding()]);
    set(f, "execution_sessions", bound === "parent"
      ? Array.from({ length: 2_001 }, (_, index) => session(String(index))) : [session()]);
    await expect(run(f, "reconciliation-findings")).rejects.toMatchObject({
      code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("does not lower existing direct finding bounds or add a session scope", async () => {
    const f = fixture(); set(f, "reconciliation_findings", Array.from({ length: 2_001 }, (_, index) => finding(String(index))));
    const value = await run(f, "reconciliation-findings");
    expect(value.records).toHaveLength(20); expect(value.page.has_more).toBe(true);
    expect(parentReads(f)).toHaveLength(0);
  });

  it("does not invoke child or parent getters; malformed parent cannot conceal a duplicate identity", () => {
    const getter = vi.fn(() => "PRIVATE-SESSION");
    const badChild = Object.defineProperty(dependentFinding(), "execution_session_id", { enumerable: true, get: getter });
    expect(() => joinRetainedFindingSessionRows([{ fields: badChild }], [{ fields: session() }]))
      .toThrowError(expect.objectContaining({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" }));
    const badParent = Object.defineProperty(session(), "private", { enumerable: true, get: getter });
    expect(joinRetainedFindingSessionRows([{ fields: dependentFinding() }], [
      { fields: session() }, { fields: badParent },
    ])).toEqual([]);
    expect(getter).not.toHaveBeenCalled();
  });
});
