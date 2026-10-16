import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { productReadFixture, OWN, PEER } from "./elp2-product-read.fixture";
const head = { revision:"TEST_ONLY:r1",source_epoch:"TEST_ONLY:epoch",source_sequence:"1",projection_generation:"TEST_ONLY:g1",
  payload_digest:"sha256:"+"0".repeat(64),catalogue_digest:EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest };
function fixture(full=false) {
  const f=productReadFixture({full,fields:[...BUSINESS_READ_FIELDS]});
  const model=new ManagerModelService({} as Pool,f.scopes,f.config);
  const repository=(model as any).repository;
  vi.spyOn(repository,"head").mockResolvedValue(head);
  vi.spyOn(repository,"document").mockResolvedValue({qualification:"TEST_ONLY"});
  return {...f,model,repository};
}
// Qualified-shaped server adapter fixture ONLY, never a source acceptance receipt.
function emptyProjection(f:ReturnType<typeof fixture>) {
  return {schema_version:"portal.execution.manager-model-input.v1",workspace_id:f.principal.workspaceId,
    environment:"paper",profile_id:f.config.EXECUTION_EDGE_PAPER_PROFILE_ID,qualification:"SOURCE_VERIFIED",family_id:"alpha_fleet_overview",
    revision:head.revision,supersedes_revision:null,source_epoch:head.source_epoch,source_sequence:"1",projection_generation:head.projection_generation,
    catalogue_digest:head.catalogue_digest,source_set_digest:head.payload_digest,as_of_ms:1000,recorded_through_ms:1100,facts_through_ms:1000,observed_at_ms:1200,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},members:[],facts:[]};
}
describe("ELP2-06 service admission and final authority fences (synthetic adapters)",()=>{
  it("never serves TEST_ONLY even with a full business grant and valid current scope",async()=>{
    const f=fixture(true);
    await expect(f.model.read(f.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({code:"EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",status:503});
    expect(f.repository.document).toHaveBeenCalledOnce();
  });
  it("closed query/workspace checks happen before projection metadata or population",async()=>{
    const f=fixture();
    for(const query of [{environment:"ALL"},{environment:"paper",sql:"SELECT"},{environment:"paper",limit:201},{environment:"paper",workspace_id:"other"}])
      await expect(f.model.read(f.principal,"FLEET",query)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE"});
    expect(f.repository.head).not.toHaveBeenCalled();expect(f.repository.document).not.toHaveBeenCalled();
  });
  it("Fund requires whole-population authority before a projection is read",async()=>{
    const f=fixture();
    await expect(f.model.read(f.principal,"FUND",{environment:"paper"})).rejects.toMatchObject({status:404});
    expect(f.repository.document).not.toHaveBeenCalled();
  });
  it("own Deployment is authorized via Alpha tuples; unknown and peer IDs do not reach business rows",async()=>{
    const f=fixture();
    await expect(f.model.read(f.principal,"DEPLOYMENT",{environment:"paper"},OWN.deployment_id)).rejects.toMatchObject({status:503});
    expect(f.repository.document).toHaveBeenCalledOnce(); f.repository.document.mockClear();
    for(const id of [PEER.deployment_id,"unknown"])
      await expect(f.model.read(f.principal,"DEPLOYMENT",{environment:"paper"},id)).rejects.toMatchObject({status:404});
    expect(f.repository.document).not.toHaveBeenCalled();
  });
  it("uses an explicit full Portfolio grant without requiring read_restricted",async()=>{
    const f=fixture();
    f.context.grants=[{...f.context.grants[0],action:"portfolio.read",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[OWN.portfolio_id]}}];
    const spy=vi.spyOn(f.scopes,"authorize");
    await expect(f.model.read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id)).rejects.toMatchObject({status:503});
    expect(spy.mock.calls.map(call=>call[2].action)).toEqual(["portfolio.read","portfolio.read"]); // initial + current delivery fence, no fallback
    expect(f.repository.document).toHaveBeenCalledOnce();
  });
  it("uses the distinct restricted Portfolio capability only after an explicit full-read denial",async()=>{
    const f=fixture();const spy=vi.spyOn(f.scopes,"authorize");
    await expect(f.model.read(f.principal,"PORTFOLIO",{environment:"paper"},OWN.portfolio_id)).rejects.toMatchObject({status:503});
    expect(spy.mock.calls.map(call=>call[2].action)).toEqual(["portfolio.read","portfolio.read_restricted","portfolio.read_restricted"]);
    expect(f.repository.document).toHaveBeenCalledOnce();
  });
  it("legacy compatibility and missing new projection never return a legacy fallback",async()=>{
    const f=fixture(true);f.repository.head.mockResolvedValue(null);
    await expect(f.model.read(f.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({status:503});
    expect(f.repository.document).not.toHaveBeenCalled();
  });
  it("sanitizes store corruption; never copies internal exception text to browser",async()=>{
    const f=fixture(true);f.repository.document.mockRejectedValue(new Error("password=DO_NOT_RETURN_SOURCE_CONNECTION"));
    try { await f.model.read(f.principal,"FLEET",{environment:"paper"});throw new Error("expected failure"); }
    catch(error) { expect(error).toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});expect(String(error)).not.toContain("DO_NOT_RETURN"); }
  });
  it("rechecks snapshot head after reading and refuses mid-flight generation replacement",async()=>{
    const f=fixture(true);f.repository.document.mockResolvedValue(emptyProjection(f));
    f.repository.head.mockResolvedValueOnce(head).mockResolvedValue({...head,revision:"TEST_ONLY:r2"});
    await expect(f.model.read(f.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("current grant revoke while the store is awaited prevents delivery",async()=>{
    const f=fixture(true);f.repository.document.mockImplementation(async()=>{f.context.grants[0].revoked_at_ms=f.context.now_ms;return emptyProjection(f);});
    await expect(f.model.read(f.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({status:404});
  });
  it("typed current snapshot passes only through the final scoped delivery fence",async()=>{
    const f=fixture(true);f.repository.document.mockResolvedValue(emptyProjection(f));const fence=vi.spyOn(f.scopes,"deliver");
    const result=await f.model.read(f.principal,"FLEET",{environment:"paper"});
    expect(fence).toHaveBeenCalledOnce();expect(result.page.returned_count).toBe(0);expect(result.scores.raw.value).toBeNull();
    expect(result.scores.direct_nav.status).toBe("policy_pending");
  });
  it("controller keeps unknown query keys closed and checks current workspace membership",async()=>{
    const f=fixture(),workspace={canReadExecution:vi.fn(async()=>false)};
    const controller=new ManagerModelController(f.model,workspace as any);
    const request={portalUser:f.principal.user,portalSession:f.principal.session,portalWorkspaceId:f.principal.workspaceId} as any;
    await expect(controller.fleet(request,{environment:"paper"})).rejects.toMatchObject({status:404});
    workspace.canReadExecution.mockResolvedValue(true);
    await expect(controller.fleet(request,{environment:"paper",sort:"not-json"})).rejects.toMatchObject({status:400});
    await expect(controller.fleet(request,{environment:"paper",relation:"private"})).rejects.toMatchObject({status:400});
    expect(f.repository.document).not.toHaveBeenCalled();
  });
});
