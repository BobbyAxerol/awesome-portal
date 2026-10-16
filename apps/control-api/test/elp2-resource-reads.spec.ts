/** Resource360 composes synthetic retained rows through the real scope evaluator.
 * No browser or qualified upstream publication is claimed by this test. */
import { describe, expect, it, vi } from "vitest";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { productReadFixture, OWN, PEER } from "./elp2-product-read.fixture";
import type { ProjectionRelation, ProjectionScalar } from "../src/execution/profile-projection.repository";
import { scopedResourceResponseSchemas } from "../src/resource-read/scoped-resource.contract";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";

function fixture(full = false, legacy = false) {
  const f = productReadFixture({ full, legacy });
  const source = f.snapshot.document.relations["manager.orders:orders"];
  const relation = (name: string, fields: Record<string, ProjectionScalar>[]): ProjectionRelation => ({ ...source,
    relation: name, items: fields.map(value => ({ fields: value, lineage: source.items[0].lineage })) });
  Object.assign(f.snapshot.document.relations, {
    "manager.strategies:strategies": relation("strategies", [
      { strategy_id: "strategy-own", name: "Own Alpha", version: "v1", secret: "HIDDEN_SECRET" },
      { strategy_id: "strategy-peer", name: "Peer Alpha", version: "v2" },
    ]),
    "manager.portfolios:portfolios": relation("portfolios", [{ portfolio_id: OWN.portfolio_id, name: "Shared Portfolio", equity: "9000000" }]),
    "manager.portfolios:portfolio_allocations": relation("portfolio_allocations", [{ ...OWN, currency: "USDT", allocated_capital: "50" },
      { ...PEER, currency: "USDT", allocated_capital: "9999999" }]),
    "manager.accounts:accounts": relation("accounts", [{ account_id: OWN.account_id, name: "Shared Account", external_account_ref: "HIDDEN_CUSTODY" }]),
    "manager.accounts:broker_account_sync_effective": relation("broker_account_sync_effective", [
      { account_id: OWN.account_id, external_account_ref: "HIDDEN_CUSTODY", buying_power: "5555555" },
    ]),
  });
  const service = new ResourceReadService(f.config, f.repository as never, f.scopes);
  const read = (kind: "ALPHA" | "PORTFOLIO" | "ACCOUNT" | "BINDING", id: string) => service.read(f.principal, kind, id, "paper") as Promise<any>;
  return { ...f, service, read };
}

describe("ELP2-04 Resource360 raw graph authorization", () => {
  it("ALPHA uses qualified strategy mapping and scopes before children/panels", async () => {
    const f = fixture(); const result = await f.read("ALPHA", OWN.alpha_id);
    expect(result.schema_version).toBe("execution.alpha-resource.v2");
    expect(result.visibility).toBe("SCOPED"); expect(result.coverage).toBe("AUTHORIZED_ONLY");
    expect(result.data.deployments).toHaveLength(1);
    expect(result.data.deployments[0].deployment_id).toBe(OWN.deployment_id);
    expect(JSON.stringify(result)).not.toMatch(/Peer Alpha|dep-peer|9000000|9999999|5555555|HIDDEN_SECRET|HIDDEN_CUSTODY/);
    expect(result.data.alpha.financial_summary.reason_code).toBe("SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS");
    expect(result.projection[0].epoch).toBeNull(); expect(result.projection[0].sequence).toBeNull();
    expect(result.data.profile_coverage.paper.source_as_of).toBeNull();
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(result).success).toBe(true);
  });
  it("qualified legacy strategy deep link resolves, equal-looking unqualified ID does not", async () => {
    const f = fixture(); const result = await f.read("ALPHA", "strategy-own");
    expect(result.data.deployments).toHaveLength(1);
    for (const id of ["strategy-peer", "missing", "peer"])
      await expect(f.read("ALPHA", id)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("linked Portfolio supplies only its approved shell and owned child rows", async () => {
    const f = fixture(); const result = await f.read("PORTFOLIO", OWN.portfolio_id);
    expect(result.resource.id).toBe(OWN.portfolio_id);
    expect(result.data.portfolio.name).toBe("Shared Portfolio");
    expect(result.is_full_portfolio).toBe(false);
    expect(result.data.portfolio.holdings_count).toBeUndefined();
    expect(result.data.portfolio.allocation_by_currency).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/9000000|9999999|Peer Alpha|dep-peer|shared-account.*1000000/);
  });
  it("full manager still gets scoped raw peer facts, without native-custody totals", async () => {
    const f = fixture(true); const result = await f.read("PORTFOLIO", OWN.portfolio_id);
    expect(result.data.deployments).toHaveLength(2);
    expect(JSON.stringify(result)).toContain("Peer Alpha");
    expect(JSON.stringify(result)).not.toMatch(/5555555|HIDDEN_CUSTODY|HIDDEN_SECRET/);
  });
  it("never uses cached augmented data as the qualified raw snapshot", async () => {
    const f = fixture(); f.repository.snapshot.mockResolvedValue({ ...f.snapshot, payloadDigest: "DERIVED_AUGMENTED_DIGEST" });
    const result = await f.read("ALPHA", OWN.alpha_id);
    expect(result.schema_version).toBe("execution.alpha-resource.v2");
    expect(f.repository.snapshot).not.toHaveBeenCalled(); expect(f.repository.rawSnapshot).toHaveBeenCalledTimes(1);
  });
  it("revoke after raw read blocks response and no completed template is reused", async () => {
    const f = fixture(); const original = f.repository.snapshotMetadata.getMockImplementation()!;
    let calls = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      const value = await original();
      if (++calls === 2) { f.context.grants = []; f.context.authority_fingerprint = "REVOKED"; }
      return value;
    });
    await expect(f.read("ALPHA", OWN.alpha_id)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("raw cutover is refused before composition", async () => {
    const f = fixture(); f.repository.rawSnapshot.mockResolvedValue({ ...f.snapshot, projectionEpoch: "DIFFERENT_EPOCH" });
    await expect(f.read("ALPHA", OWN.alpha_id)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("raw document with another profile is refused despite equal digest", async () => {
    const f = fixture(); f.repository.rawSnapshot.mockResolvedValue({ ...f.snapshot, document: { ...f.snapshot.document, profile_id: "OTHER" } });
    await expect(f.read("ALPHA", OWN.alpha_id)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("wrong workspace is rejected before any snapshot reads", async () => {
    const f = fixture();
    await expect(f.service.read({ ...f.principal, workspaceId: "other" }, "ALPHA", OWN.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("named financial fields lacking approved access become typed panel absence, never zero", async () => {
    const f = fixture(); const result = await f.read("ALPHA", OWN.alpha_id);
    const allocations = result.capabilities.find((capability: any) => capability.capability_id === "resource.alpha.portfolio_allocations");
    expect(allocations.reason_code).toBe("EXECUTION_READ_FIELD_POLICY_PENDING");
    expect(result.data.portfolio_allocations).toEqual([]);
    expect(result.data.alpha.allocation_by_currency).toBeUndefined();
  });
  it("public revision ignores peer money and raw global/lineage metadata", async () => {
    const f = fixture(); const first = await f.read("ALPHA", OWN.alpha_id);
    const source = f.snapshot.document.relations["manager.orders:orders"];
    const peer = source.items.find(row => row.fields.account_id === PEER.account_id && row.fields.alpha_id === PEER.alpha_id)!;
    peer.fields.quantity = "999999999999999999999999";
    Object.assign(source, { source_total: 100000, source_cursor: "GLOBAL_CHANGED" });
    Object.assign(source.items[0], { lineage: { source_cursor: "PEER_CHECKPOINT_CHANGED" } });
    Object.assign(f.snapshot, { payloadDigest: `sha256:${"c".repeat(64)}`, projectionSequence: 999999 });
    const second = await f.read("ALPHA", OWN.alpha_id);
    expect(second.projection[0].payload_digest).toBe(first.projection[0].payload_digest);
    expect(JSON.stringify(second)).not.toMatch(/999999999999999999999999|GLOBAL_CHANGED|PEER_CHECKPOINT_CHANGED/);
  });
  it("refuses untyped financial numbers rather than silently stringifying or defaulting", async () => {
    const f = fixture();
    f.snapshot.document.relations["manager.orders:orders"].items[0].fields.quantity = 0.1;
    await expect(f.read("ALPHA", OWN.alpha_id)).rejects.toMatchObject({ code: "EXECUTION_READ_FIELD_POLICY_PENDING", status: 503 });
  });
  it("all-profile view keeps authorized Paper when Sandbox/Live are denied", async () => {
    const f = fixture();
    const result = await f.service.read(f.principal, "ALPHA", OWN.alpha_id) as any;
    expect(result.data.deployments).toHaveLength(1);
    expect(result.data.profile_coverage.paper.state).toBe("FOUND");
    for (const env of ["sandbox", "live"]) {
      expect(result.data.profile_coverage[env]).toMatchObject({ profile_id: null, state: "UNAVAILABLE",
        reason_code: "EXECUTION_READ_NOT_AVAILABLE", projection_epoch: null, projection_sequence: null, source_as_of: null });
      expect(result.read_scope.find((entry: any) => entry.environment === env).policy_revision).toBeNull();
    }
    expect(result.completeness).toBe("PARTIAL");
    expect(f.repository.rawSnapshot).toHaveBeenCalledTimes(1);
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(result).success).toBe(true);
  });
  it("isolates qualified-publication 503 without exposing raw reason or source identity", async () => {
    const f = fixture();
    for (const grant of f.context.grants) Object.assign(grant, { environments: ["paper", "sandbox", "live"] });
    const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      if (request.environment !== "paper") throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      return original(request);
    });
    const result = await f.service.read(f.principal, "ALPHA", OWN.alpha_id) as any;
    expect(result.data.deployments).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    expect(result.data.profile_coverage.live.reason_code).toBe("EXECUTION_READ_NOT_AVAILABLE");
    expect(f.repository.rawSnapshot).toHaveBeenCalledTimes(1);
    await expect(f.service.read(f.principal, "ALPHA", OWN.alpha_id, "live"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });
  it("no allowed profile is a uniform refusal rather than an existence-bearing empty DTO", async () => {
    const f = fixture(); f.context.grants = [];
    await expect(f.service.read(f.principal, "ALPHA", OWN.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("unconfigured legacy profiles preserve only a current-identity no-data unavailable shell", async () => {
    const f = fixture(false, true);
    Object.assign(f.config, { EXECUTION_EDGE_PAPER_PROFILE_ID: undefined, EXECUTION_EDGE_SANDBOX_PROFILE_ID: undefined,
      EXECUTION_EDGE_LIVE_PROFILE_ID: undefined });
    const result = await f.service.read(f.principal, "ALPHA", "unknown") as any;
    expect(result.schema_version).toBe("execution.alpha-resource.v1");
    expect(result).toMatchObject({ state: "unavailable", freshness: "UNKNOWN", completeness: "UNKNOWN", data: {} });
    expect(result.capabilities.every((entry: any) => entry.state !== "AVAILABLE")).toBe(true);
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled(); expect(f.repository.snapshot).not.toHaveBeenCalled();
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
    vi.spyOn(f.scopes, "selectionMode").mockResolvedValueOnce("LEGACY_COMPATIBILITY").mockResolvedValueOnce("SCOPED_V2");
    await expect(f.service.read(f.principal, "ALPHA", "unknown"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
});
