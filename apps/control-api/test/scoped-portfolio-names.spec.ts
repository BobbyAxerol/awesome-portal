/** Synthetic source/authority, real Resource360 scoped composition. No runtime acceptance. */
import { describe, expect, it } from "vitest";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { scopedPortfolioNames } from "../src/resource-read/scoped-portfolio-names";
import { scopedResourceResponseSchemas } from "../src/resource-read/scoped-resource.contract";
import type { ProjectionRelation, ProjectionScalar } from "../src/execution/profile-projection.repository";
import { productReadFixture, FIELDS, OWN, PEER } from "./elp2-product-read.fixture";

const PORTFOLIOS = "manager.portfolios:portfolios";
const lineage = { workspace_id: "TEST_ONLY-product-workspace", profile_id: "PAPER_BINANCE_USDM",
  source_contract_revision: "TEST_ONLY-contract" };
const projectedRow = (fields: Record<string, ProjectionScalar>) => ({ lineage: { ...lineage }, fields });
function relation(rows: Record<string, ProjectionScalar>[]): ProjectionRelation {
  return { source_id: "manager.portfolios", relation: "portfolios", availability: "AVAILABLE", reason_code: null,
    freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-23T00:00:00Z", items: rows.map(projectedRow) };
}
function fixture(fields = FIELDS) {
  const f = productReadFixture({ fields });
  f.snapshot.document.relations[PORTFOLIOS] = relation([
    { portfolio_id: OWN.portfolio_id, name: "Visible linked portfolio" },
    { portfolio_id: "hidden", name: "DO_NOT_LEAK" },
  ]);
  f.snapshot.document.relations["manager.strategies:strategies"] = relation([
    { strategy_id: "strategy-own", name: "Own" }, { strategy_id: "strategy-peer", name: "Peer" },
  ]);
  f.snapshot.document.relations["manager.portfolios:portfolio_allocations"] = relation([{ ...OWN }, { ...PEER }]);
  const service = new ResourceReadService(f.config, f.repository as never, f.scopes);
  return { ...f, service, read: () => service.read(f.principal, "ALPHA", OWN.alpha_id, "paper") as Promise<any> };
}
describe("package6 same-snapshot authorized portfolio names", () => {
  it("joins both child relations from one authorized raw snapshot without extra reads", async () => {
    const f = fixture(), result = await f.read();
    for (const alias of ["deployments", "portfolio_allocations"]) {
      expect(result.data[alias]).toHaveLength(1);
      expect(result.data[alias][0]).toMatchObject({ portfolio_name: "Visible linked portfolio", portfolio_name_reason_code: null });
    }
    expect(result.data.alpha.deployments[0].portfolio_name).toBe("Visible linked portfolio");
    expect(scopedResourceResponseSchemas.ALPHA.safeParse(result).success).toBe(true);
    expect(f.repository.rawSnapshot).toHaveBeenCalledTimes(1);
    expect(f.repository.snapshot).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_LEAK|dep-peer/);
    expect(f.snapshot.document.relations["manager.deployments:strategy_deployments"].items[0].fields).not.toHaveProperty("portfolio_name");
  });
  it("respects name field policy instead of letting the join unmask it", async () => {
    const result = await fixture(FIELDS.filter(field => field !== "name")).read();
    expect(result.data.deployments[0]).toMatchObject({ portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(JSON.stringify(result)).not.toContain("Visible linked portfolio");
  });
  it("binds published revision to visible labels, ignoring unrelated hidden label changes", async () => {
    const f = fixture(), first = await f.read();
    const source = f.snapshot.document.relations[PORTFOLIOS];
    source.items[1].fields.name = "HIDDEN_CHANGED";
    const hidden = await f.read();
    expect(hidden.projection[0].payload_digest).toBe(first.projection[0].payload_digest);
    source.items[0].fields.name = "Renamed visible portfolio";
    const visible = await f.read();
    expect(visible.data.deployments[0].portfolio_name).toBe("Renamed visible portfolio");
    expect(visible.projection[0].payload_digest).not.toBe(first.projection[0].payload_digest);
  });
  it("cannot use the page as its name universe", async () => {
    const f = fixture();
    f.snapshot.document.relations[PORTFOLIOS].items.unshift(...Array.from({ length: 250 }, (_, i) => projectedRow({ portfolio_id: `hidden-${i}`, name: "HIDDEN_PREFIX" })));
    expect((await f.read()).data.deployments[0].portfolio_name).toBe("Visible linked portfolio");
  });
  it.each(["missing", "unavailable", "no-name", "conflict"] as const)("publishes typed absence for %s source", async fault => {
    const f = fixture(), source = f.snapshot.document.relations[PORTFOLIOS];
    if (fault === "missing") delete f.snapshot.document.relations[PORTFOLIOS];
    if (fault === "unavailable") source.availability = "UNAVAILABLE";
    if (fault === "no-name") delete source.items[0].fields.name;
    if (fault === "conflict") source.items.push(projectedRow({ portfolio_id: OWN.portfolio_id, name: "Conflicting" }));
    const result = await f.read();
    expect(result.data.deployments[0]).toMatchObject({ portfolio_name: null, portfolio_name_reason_code:
      fault === "conflict" ? "PORTFOLIO_NAME_AMBIGUOUS" : fault === "no-name" ? "PORTFOLIO_NAME_NOT_PUBLISHED" : "PORTFOLIO_NAME_NOT_READ" });
  });
  it("does not disclose a raw label without eligible Portfolio identity", async () => {
    const f = fixture();
    // Owning Alpha grants no arbitrary unrelated portfolio-name lookup.
    f.snapshot.document.relations["manager.deployments:strategy_deployments"].items[0].fields.portfolio_id = "hidden";
    const result = await f.read();
    expect(JSON.stringify(result)).not.toContain("DO_NOT_LEAK");
  });
  it("refuses snapshot change and wrong workspace before exposing joined labels", async () => {
    const f = fixture();
    f.repository.rawSnapshot.mockResolvedValue({ ...f.snapshot, projectionEpoch: "other" });
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
    await expect(f.service.read({ ...f.principal, workspaceId: "other" }, "ALPHA", OWN.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  it("rechecks revocation after composing labels", async () => {
    const f = fixture(), original = f.repository.snapshotMetadata.getMockImplementation()!;
    let reads = 0;
    f.repository.snapshotMetadata.mockImplementation(async () => {
      const value = await original();
      if (++reads === 2) { f.context.grants = []; f.context.authority_fingerprint = "REVOKED"; }
      return value;
    });
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
});
describe("portfolio label consensus", () => {
  it("accepts identical duplicates but does not choose arbitrarily between missing and present", () => {
    const rows = [{ portfolio_id: "p", name: "Name" }, { portfolio_id: "p", name: "Name" }];
    expect(scopedPortfolioNames(relation(rows), true)({ portfolio_id: "p" })).toEqual({ portfolio_name: "Name", portfolio_name_reason_code: null });
    expect(scopedPortfolioNames(relation([...rows, { portfolio_id: "p", name: null }]), true)({ portfolio_id: "p" })).toMatchObject({ portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_AMBIGUOUS" });
  });
  it.each(["", "bad\nlabel", "x".repeat(513)])("does not emit invalid label %j", name => {
    expect(scopedPortfolioNames(relation([{ portfolio_id: "p", name }]), true)({ portfolio_id: "p" })).toEqual({ portfolio_name: null, portfolio_name_reason_code: "PORTFOLIO_NAME_NOT_PUBLISHED" });
  });
});
