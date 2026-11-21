/** Scoped named retained aliases: TEST_ONLY authority and stored observations.
 * This is not a source, browser or physical-send acceptance receipt. */
import { describe, expect, it, vi } from "vitest";
import type { ProjectionScalar } from "../src/execution/profile-projection.repository";
import { productReadFixture as fixture, OWN, PEER, FIELDS } from "./elp2-product-read.fixture";

const cases = [
  { route: "orders", relation: "orders", source: "manager.orders", identity: { order_id: "1" } },
  { route: "positions-v2", relation: "positions_v2", source: "manager.positions", identity: { position_id: "pos-1" } },
  { route: "execution-sessions", relation: "execution_sessions", source: "manager.sessions", identity: { execution_session_id: "session-1" } },
  { route: "fills", relation: "fills", source: "manager.fills", identity: { fill_id: "1", trade_time: "2026-10-01T12:00:00.000Z" } },
] as const;
type Case = typeof cases[number];

function setup(item: Case, legacy = false) {
  const f = fixture({ legacy, fields: [...FIELDS, "position_id", "execution_session_id", "fill_id", "trade_time", "price"] });
  f.context.actor_lease_until_ms = f.context.now_ms + 600_000;
  // Both Alpha deployments share an Account; granting the Account must not
  // grant the peer Alpha. OWN and PEER differ only in the Alpha lineage.
  f.context.grants = f.context.grants.map(g => g.action === "account.read" ? { ...g,
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [OWN.account_id] } } : g);
  const row = (anchors: typeof OWN, identity: Record<string, string>) => ({ fields: {
    ...anchors, ...identity, strategy_id: anchors.alpha_id === OWN.alpha_id ? "strategy-own" : "strategy-peer",
    mode: "paper", status: "OPEN", quantity: "1", secret: "TEST_ONLY_SECRET",
  } as Record<string, ProjectionScalar> });
  const peerIdentity = Object.fromEntries(Object.entries(item.identity).map(([key, value]) =>
    [key, key === "trade_time" ? value : key === "order_id" || key === "fill_id" ? "2" : `${value}-peer`]));
  f.snapshot.document.relations = { [`${item.source}:${item.relation}`]: {
    source_id: item.source, relation: item.relation, availability: "AVAILABLE", completeness: "COMPLETE",
    freshness: "FRESH", reason_code: null, as_of: "2026-10-01T12:00:00.000Z",
    items: [row(OWN, item.identity), row(PEER, peerIdentity)],
  } } as never;
  const read = (cursor?: string, limit = 20) => f.maximum.relationPage(f.principal, item.route,
    { environment: "paper", limit, ...(cursor ? { cursor } : {}) });
  return { ...f, read };
}

describe("ELP2 named execution alias dual-purpose boundary", () => {
  function twoOrders() {
    const f = setup(cases[0]), relation = f.snapshot.document.relations["manager.orders:orders"];
    relation.items.push({ ...relation.items[0], fields: { ...relation.items[0].fields, order_id: "3" } });
    return f;
  }
  it.each(cases)("$route requires Account authority in addition to Alpha", async item => {
    const f = setup(item); f.context.grants = f.context.grants.filter(g => g.action !== "account.read");
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it.each(cases)("$route requires Alpha authority even when Account is granted", async item => {
    const f = setup(item); f.context.grants = f.context.grants.filter(g => g.action !== "alpha.read");
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it.each(cases)("$route intersects shared-account rows before pagination", async item => {
    const f = setup(item); const result = await f.read();
    expect(result.records).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/TEST_ONLY_SECRET|strategy-peer|dep-peer/);
    expect(result.page.has_more).toBe(false);
    expect(f.access.readPublication.mock.calls.some(([request]) => request.binding.dataset_id.endsWith(`:${item.relation}`))).toBe(true);
  });
  it.each(cases)("$route refuses after Account grant is revoked during the read", async item => {
    const f = setup(item), original = f.repository.rawSnapshot.getMockImplementation()!;
    f.repository.rawSnapshot.mockImplementation(async () => {
      const snapshot = await original();
      f.context.grants = f.context.grants.filter(g => g.action !== "account.read");
      return snapshot;
    });
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it.each(cases)("$route prioritizes a revoked grant over a held invalid cursor", async item => {
    const f = setup(item), original = f.repository.rawSnapshot.getMockImplementation()!;
    f.repository.rawSnapshot.mockImplementation(async () => {
      const snapshot = await original();
      f.context.grants = f.context.grants.filter(g => g.action !== "account.read");
      return snapshot;
    });
    await expect(f.read("TEST_ONLY-invalid-cursor", 1))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it.each(cases)("$route preserves a typed invalid-cursor refusal with unchanged authority", async item => {
    const f = setup(item);
    await expect(f.read("TEST_ONLY-invalid-cursor", 1))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
  });
  it.each(cases)("$route does not include a row when Account access belongs to another account", async item => {
    const f = setup(item);
    f.context.grants = f.context.grants.map(g => g.action === "account.read" ? { ...g,
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ["own-account"] } } : g);
    const result = await f.read();
    expect(result.records).toEqual([]);
    expect(result.source_health.availability).toBe("UNAVAILABLE");
  });
  it.each(cases)("$route retains the established legacy compatibility read", async item => {
    const f = setup(item, true); f.context.grants = [];
    const result = await f.read();
    expect(result.records).toHaveLength(2);
    expect(result).not.toHaveProperty("read_scope");
  });
  it.each(cases)("$route refuses the visible row when the source account or Alpha anchor is missing", async item => {
    const f = setup(item), relation = f.snapshot.document.relations[`${item.source}:${item.relation}`];
    relation.items[0].fields.account_id = null;
    // The remaining tuple may be identifiable, but the retained publication
    // has not actually supplied the mandatory source Account anchor.
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it.each(cases)("$route does not reveal a malformed hidden peer's anchor", async item => {
    const f = setup(item), relation = f.snapshot.document.relations[`${item.source}:${item.relation}`];
    relation.items[1].fields.account_id = null;
    const result = await f.read();
    expect(result.records).toHaveLength(1);
  });
  it.each(cases)("$route refuses a row that could belong to two permitted deployments", async item => {
    const f = setup(item), relation = f.snapshot.document.relations[`${item.source}:${item.relation}`];
    delete relation.items[0].fields.deployment_id;
    const other = { ...OWN, deployment_id: "dep-other-own" };
    const oldRelations = f.context.relationsFor(f.principal.user.userId);
    f.context.relationsFor = () => ({ ...oldRelations, roots: { ...oldRelations.roots,
      root: [...oldRelations.roots.root, { kind: "DEPLOYMENT", id: other.deployment_id }] } });
    const readPublication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const publication = await readPublication(request);
      return { ...publication, resources: [...publication.resources, { kind: "DEPLOYMENT" as const, id: other.deployment_id }],
        tuples: [...publication.tuples, other] };
    });
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it.each(cases)("$route refuses an unregistered source with the right relation name", async item => {
    const f = setup(item);
    f.snapshot.document.relations[`${item.source}:${item.relation}`].source_id = "manager.TEST_ONLY-unregistered";
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("binds pagination to the Account grant revision", async () => {
    const f = twoOrders(), first = await f.read(undefined, 1);
    expect(first.page.next_cursor).toEqual(expect.any(String));
    f.context.grants = f.context.grants.map(g => g.action === "account.read" ? { ...g, revision: "TEST_ONLY-account-r2" } : g);
    await expect(f.read(first.page.next_cursor!, 1))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
  });
  it("rechecks cursor expiry after the last authority confirmation", async () => {
    const f = twoOrders(), now = f.context.now_ms;
    f.config.QUERY_CURSOR_TTL_SECONDS = 30;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const first = await f.read(undefined, 1);
      expect(first.page.next_cursor).toEqual(expect.any(String));
      let observedSnapshot = false;
      const raw = f.repository.rawSnapshot.getMockImplementation()!;
      f.repository.rawSnapshot.mockImplementation(async () => { observedSnapshot = true; return raw(); });
      f.access.confirmReadContext.mockImplementation(async () => {
        if (observedSnapshot) clock.mockReturnValue(now + 31_000);
        return f.context;
      });
      await expect(f.read(first.page.next_cursor!, 1))
        .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
      expect(observedSnapshot).toBe(true);
    } finally { clock.mockRestore(); }
  });
});
