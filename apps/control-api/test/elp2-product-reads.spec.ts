/** Real scoped product adapters; fixture authority is explicitly TEST_ONLY. */
import { describe, expect, it, vi } from "vitest";
import { retainedOperationPage, NAMED_RETAINED_PURPOSES } from "../src/execution/retained-operation-page";
import { EDS11R_MANAGER_RELATION_REGISTRY_SOURCE } from "../src/execution/eds11r-manager-relation-registry.generated";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";
import { productReadFixture as fixture, OWN, PEER, FIELDS } from "./elp2-product-read.fixture";

describe("ELP2-04 product reads before filtering, counts and pages", () => {
  it.each(["deployments", "orders"])("current legacy %s retains the exact dark-profile refusal without local workspace", async route => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    const error = Object.assign(new Error("Profile is not activated."), { code: "N13B_PROFILE_NOT_ACTIVATED", status: 503 });
    f.upstream.relationForNamedOperation.mockRejectedValue(error);
    f.upstream.relationForCataloguedOperation.mockRejectedValue(error);
    const read = route === "deployments" ? f.maximum.deploymentPage(f.principal, { environment: "paper", limit: 20 })
      : f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 });
    await expect(read).rejects.toBe(error);
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled(); expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("V2 without a local qualified dataset cannot take the current-source legacy path", async () => {
    const f = fixture({ full: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("sticky activation after legacy source await prevents delivery even when the policy row was deleted", async () => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_READ_PROFILE = "source_current_v1";
    f.config.FEATURE_EXECUTION_LOCAL_PROJECTION = "false";
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = undefined;
    // The real scope service consumes mocked identity rows, as in the fixture.
    const identity = (f.scopes as any).pool.query;
    const original = identity.getMockImplementation(); let policySeen = false;
    identity.mockImplementation(async (...args: unknown[]) => {
      const value = await original(...args);
      return { ...value, rows: value.rows.map((row: object) => ({ ...row, policy: null, policy_seen: policySeen })) };
    });
    f.upstream.relationForCataloguedOperation.mockImplementation(async () => { policySeen = true; return {}; });
    vi.spyOn(f.maximum as any, "translateRelationPage").mockResolvedValue({ records: ["MUST_NOT_DELIVER"] });
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).toHaveBeenCalledOnce();
  });
  it("local and retained named reads still enforce exact configured source workspace", async () => {
    const f = fixture({ legacy: true });
    f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID = "TEST_ONLY-other-source";
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 20 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("classifies every named alias explicitly, without a default Alpha purpose", () => {
    const aliases = EDS11R_MANAGER_RELATION_REGISTRY_SOURCE.operations;
    expect(aliases).toHaveLength(54);
    expect(Object.keys(NAMED_RETAINED_PURPOSES).sort()).toEqual(aliases.map(row => row.relation).sort());
  });
  it.each(EDS11R_MANAGER_RELATION_REGISTRY_SOURCE.operations.filter(operation =>
    NAMED_RETAINED_PURPOSES[operation.relation as keyof typeof NAMED_RETAINED_PURPOSES] === null))(
    "full business cannot claim uncommissioned named purpose $route_id", async operation => {
      const f = fixture({ full: true });
      await expect(f.maximum.relationPage(f.principal, operation.route_id, { environment: "paper", limit: 20 }))
        .rejects.toMatchObject({ code: "EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED", status: 503 });
      expect(f.repository.rawSnapshot).not.toHaveBeenCalled(); expect(f.repository.snapshot).not.toHaveBeenCalled();
      expect(f.access.readPublication).not.toHaveBeenCalled();
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    });
  it("named unsupported purpose remains an explicit legacy no-data observation, not a V2 grant", async () => {
    const f = fixture({ legacy: true });
    const page = await f.maximum.relationPage(f.principal, "service-heartbeats", { environment: "paper", limit: 20 });
    expect(page.state).toBe("UNAVAILABLE"); expect(page.records).toEqual([]);
    expect(page).not.toHaveProperty("read_scope");
  });
  it("scopes raw rows before sort/page/count/facets; exact zero and decimal survive", async () => {
    const f = fixture(); const first = await f.orders();
    expect(first.source.data.items).toHaveLength(1);
    expect(first.source.data.items[0].fields.order_id.value).toBe("order-own-2");
    expect(first.source.data.items[0].fields.quantity.value).toBe("12345678901234567890.123456789");
    expect(first.source.data.projected_total_items).toBe(2);
    expect(first.source.data.window_aggregates.status).toEqual({ OPEN: 2 });
    expect(JSON.stringify(first)).not.toMatch(/PEER_ONLY_STATUS|HIDDEN_VENUE|NEVER_RETURN|order-peer|epoch-1/);
    const second = await f.orders({ cursor: first.source.data.next_cursor });
    expect(second.source.data.items[0].fields.quantity.value).toBe("0");
    expect(first.projection.sequence).toBeNull(); expect(first.projection.received_at).toBeNull();
  });
  it("hidden value search equals unknown value search", async () => {
    const f = fixture();
    const hidden = await f.orders({ status: "PEER_ONLY_STATUS" });
    const unknown = await f.orders({ status: "NEVER_EXISTS" });
    expect(hidden).toEqual(unknown);
    expect(hidden.source.data.filtered_total_items).toBe(0);
  });
  it("forbidden field cannot be a filter or sorting oracle", async () => {
    const f = fixture({ fields: FIELDS.filter(value => value !== "venue") });
    await expect(f.orders({ venue: "HIDDEN_VENUE" })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("shared account total is excluded before any downstream composition", async () => {
    const f = fixture();
    const page = await retainedOperationPage(f.config, f.repository as never, f.principal,
      managerRelationOperationByRoute("account-balances")!, { environment: "paper", limit: 20 }, f.scopes);
    expect(JSON.stringify(page)).not.toContain("1000000");
    expect(page.records).toHaveLength(1);
    expect(page.records[0].values.total).toBe("0");
  });
  it("current full-business authority reads peer rows but never technical fields", async () => {
    const f = fixture({ full: true }); const page = await f.orders({ limit: 20 });
    expect(page.source.data.items).toHaveLength(3);
    expect(JSON.stringify(page)).toContain("order-peer");
    expect(JSON.stringify(page)).not.toContain("NEVER_RETURN");
  });
  it.each(["size", "query", "session", "epoch", "policy"])("opaque cursor refuses %s changes", async change => {
    const f = fixture(); const first = await f.orders(); const query: Record<string, unknown> = { cursor: first.source.data.next_cursor };
    if (change === "size") query.limit = 2;
    if (change === "query") query.status = "OPEN";
    if (change === "session") f.principal.session.sessionId = "TEST_ONLY-new-session";
    if (change === "epoch") f.snapshot.projectionEpoch = "epoch-2";
    if (change === "policy") f.context.authority_fingerprint = "TEST_ONLY-db-r2";
    await expect(f.orders(query)).rejects.toMatchObject({ code: "N31_PROJECTION_CURSOR_INVALID", status: 400 });
  });
  it("hidden deployment and nonexistent deployment share public refusal", async () => {
    const f = fixture();
    for (const id of [PEER.deployment_id, "missing"])
      await expect(f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", id))
        .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("own deployment resolves through qualified Alpha lineage without revealing account credentials", async () => {
    const f = fixture(); const result = await f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", OWN.deployment_id);
    expect(result.state).toBe("FOUND");
    expect(result.scope?.deploymentId).toBe(OWN.deployment_id);
    expect(result.scope?.externalAccountRef).toBeNull();
    expect(JSON.stringify(result)).not.toContain("peer");
  });
  it("epoch changes after projection produce a typed conflict", async () => {
    const f = fixture(); f.repository.snapshotMetadata.mockResolvedValue({ ...f.snapshot, projectionEpoch: "epoch-changed" });
    await expect(f.orders()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("revoke during the final source check prevents returned rows", async () => {
    const f = fixture(); let calls = 0; f.repository.snapshotMetadata.mockImplementation(async () => {
      if (++calls === 2) { f.context.grants = []; f.context.authority_fingerprint = "TEST_ONLY-revoked"; } return f.snapshot;
    });
    await expect(f.orders()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("named V2 operations use retained scoped rows without upstream or continuation writes", async () => {
    const f = fixture();
    // Manager's named Orders catalogue declares the source PK as INTEGER.
    f.snapshot.document.relations["manager.orders:orders"].items.forEach((row, i) => { row.fields.order_id = String(i + 1); });
    const page = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 });
    expect(page.records).toHaveLength(1); expect(page.page.next_cursor).toBeTruthy();
    expect(page.source_health.availability).toBe("AVAILABLE");
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    expect(JSON.stringify(page)).not.toMatch(/order-peer|NEVER_RETURN/);
  });
  it("named source health cannot distinguish peer-only retained data from an empty relation", async () => {
    const f = fixture();
    const relation = f.snapshot.document.relations["manager.orders:orders"];
    relation.items = relation.items.filter(row => row.fields.alpha_id === "peer");
    relation.items[0].fields.order_id = "2";
    const peerOnly = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }) as any;
    expect(peerOnly.records).toEqual([]); expect(peerOnly.source_health.availability).toBe("UNAVAILABLE");
    expect(peerOnly.source_health.as_of_ms).toBeNull(); expect(peerOnly.source_health.global_sequence).toBeNull();
    relation.items = [];
    const empty = await f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }) as any;
    expect(empty.source_health).toEqual(peerOnly.source_health);
    expect(empty.records).toEqual(peerOnly.records); expect(empty.reason_code).toBe(peerOnly.reason_code);
    expect(empty.page).toEqual(peerOnly.page);
  });
  it("missing qualified local publication never falls through to upstream", async () => {
    const f = fixture(); f.access.readPublication.mockResolvedValue(null as never);
    await expect(f.maximum.relationPage(f.principal, "orders", { environment: "paper", limit: 1 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });
  it("qualified retained path reads persisted bytes, not an augmented compatibility digest", async () => {
    const f = fixture(); f.repository.snapshot.mockResolvedValue({ ...f.snapshot, payloadDigest: "AUGMENTED_COMPATIBILITY_DIGEST" });
    await expect(f.orders()).resolves.toHaveProperty("visibility", "SCOPED");
    expect(f.repository.snapshot).not.toHaveBeenCalled();
    expect(f.repository.rawSnapshot).toHaveBeenCalled();
  });
  it("legacy explicit mode keeps its established internal envelope", async () => {
    const f = fixture({ legacy: true }); const page = await f.orders({ limit: 20 });
    expect(page.source.data.items).toHaveLength(3); expect(page.projection.epoch).toBe("epoch-1");
    expect(page.visibility).toBeUndefined();
  });
});
