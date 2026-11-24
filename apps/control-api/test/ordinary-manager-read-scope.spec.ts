/** In-process synthetic authority/source ports, not connected qualification. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ControlApiConfig } from "../src/config";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { OrdinaryProfileAuthority } from "../src/execution-v2/ordinary-profile-authority";
import type { OrdinaryProfileReadDecision } from "../src/execution-v2/ordinary-profile-authority.contract";
import { accessDigest } from "../src/execution-v2/access-digest";
import { ExecutionReadScopes, scopeReadPopulation, scopeAllowsFullAccountingPopulation, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublication } from "../src/execution-v2/read-publication";

function fixture() {
  const now=Date.now(),deadline=now+60_000;
  const actor={user_id:"synthetic-user",session_id:"synthetic-session",session_generation:1};
  const domain={profile_id:"paper-okx",catalogue_sha256:"a".repeat(64),profile_sha256:"b".repeat(64),field_policy_sha256:"c".repeat(64)};
  const decision={schema_version:"portal.ordinary-profile-read-decision.v1",actor,workspace_id:"synthetic-ws",environment:"paper",
    domain,field_policy_ref:"synthetic-field-policy",fingerprint:accessDigest("decision"),valid_until_ms:deadline,
    head_revision:"ordinary-1",grant_id:"grant-1",grant_revision:"grant-1-r1"} as OrdinaryProfileReadDecision;
  const principal={workspaceId:"synthetic-ws",user:{userId:actor.user_id,role:"USER",sessionVersion:1},session:{
    userId:actor.user_id,sessionId:actor.session_id,sessionVersion:1,authenticationTime:new Date(now),
    idleExpiresAt:new Date(deadline),absoluteExpiresAt:new Date(deadline)}} as ReadScopePrincipal;
  const pool={query:vi.fn(async()=>({rows:[{role:"USER",session_version:1,policy:null,policy_revision:null,policy_seen:false,
    workspace_exists:true,member:true,owner:false,retained:[]}]}))} as unknown as Pool;
  const dataset={dataset_id:"alpha_fleet_overview",source_revision:"r1",window:null};
  const tuple={alpha_id:"a1",alpha_version_id:"av1",portfolio_id:"p1",deployment_id:"d1",account_id:"c1"};
  const publication:ExecutionReadPublication={workspace_id:principal.workspaceId,environment:"paper",profile_id:domain.profile_id,
    manager_domain:{environment:"paper",domain:structuredClone(domain),field_policy_ref:decision.field_policy_ref},qualification:"SOURCE_VERIFIED",
    publication_revision:"publication-1",binding:dataset,population_coverage:"COMPLETE_FOR_DATASET_WINDOW",provenance_ref:"synthetic-receipt",
    current_linkage:null,tuples:[tuple],resources:[{kind:"ALPHA",id:"a1"},{kind:"ALPHA_VERSION",id:"av1"},
      {kind:"PORTFOLIO",id:"p1"},{kind:"DEPLOYMENT",id:"d1"},{kind:"ACCOUNT",id:"c1"}]};
  let current=true;
  const ordinary={usesPool:(candidate:unknown)=>candidate===pool,
    read:vi.fn(async(_actor:unknown,workspace:string,environment:string,profile:string)=>
      current&&workspace===decision.workspace_id&&environment==="paper"&&profile===domain.profile_id?structuredClone(decision):null),
    confirmMany:vi.fn(async()=>current?{assertCurrent:()=>{if(!current||Date.now()>=deadline)throw Error("expired");}}:null),
  } as unknown as Pick<OrdinaryProfileAuthority,"read"|"confirmMany"|"usesPool">;
  const access={readPublication:vi.fn(async()=>structuredClone(publication)),hasNativeCurrentRelations:()=>true} as unknown as ExecutionAccessService;
  const scopes=new ExecutionReadScopes(pool,access,{} as ControlApiConfig,ordinary);
  const binding={environment:"paper" as const,profileId:domain.profile_id},requirement={action:"alpha.read" as const,dataset};
  return{scopes,principal,binding,requirement,publication,ordinary,access,pool,revoke:()=>{current=false;}};
}

describe("ordinary Manager read fences (synthetic ports)",()=>{
  it("issues a genuine scoped population without flipping legacy policy selection",async()=>{
    const f=fixture();
    const scope=await f.scopes.authorize(f.principal,f.binding,f.requirement);
    expect(scope.mode).toBe("SCOPED_V2");expect(scope.profileId).toBe("paper-okx");
    expect(scopeReadPopulation(scope).allowedTuples).toEqual(f.publication.tuples);
    expect(scopeAllowsFullAccountingPopulation(scope,"p1","a1")).toBe(true);
    expect(scopeAllowsFullAccountingPopulation(scope,"unknown-portfolio")).toBe(false);
    expect(scopeAllowsFullAccountingPopulation(scope,undefined,"unknown-alpha")).toBe(false);
    expect(await f.scopes.selectionMode(f.principal)).toBe("LEGACY_COMPATIBILITY");
    expect(await f.scopes.deliver(scope,async()=>"body")).toBe("body");
  });
  it.each(["workspace","environment","profile"])("does not fall back when ordinary %s differs",async(axis)=>{
    const f=fixture();
    if(axis==="workspace")f.principal.workspaceId="wrong";
    if(axis==="environment")f.binding.environment="sandbox" as "paper";
    if(axis==="profile")f.binding.profileId="paper-binance";
    await expect(f.scopes.authorize(f.principal,f.binding,f.requirement)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE"});
    expect(f.access.readPublication).not.toHaveBeenCalled();
  });
  it.each(["qualification","domain","field","census","window"])("refuses unqualified or mismatched %s",async(axis)=>{
    const f=fixture();
    if(axis==="qualification")f.publication.qualification="TEST_ONLY";
    if(axis==="domain")f.publication.manager_domain!.domain.profile_sha256="d".repeat(64);
    if(axis==="field")f.publication.manager_domain!.field_policy_ref="wrong";
    if(axis==="census")f.publication.resources.pop();
    if(axis==="window")Object.assign(f.requirement.dataset,{window:{from_ms:1,to_ms:2}});
    await expect(f.scopes.authorize(f.principal,f.binding,f.requirement)).rejects.toBeDefined();
  });
  it("blocks revoke during body generation, including a held error",async()=>{
    for(const throws of [false,true]){
      const f=fixture(),scope=await f.scopes.authorize(f.principal,f.binding,f.requirement);
      await expect(f.scopes.deliver(scope,async()=>{f.revoke();if(throws)throw Error("private-source-detail");return "protected-body";}))
        .rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE"});
    }
  });
  it("compares publication after source await and confirms authority after it",async()=>{
    const f=fixture();let calls=0;
    vi.mocked(f.access.readPublication).mockImplementation(async()=>{if(++calls===2)f.revoke();return structuredClone(f.publication);});
    await expect(f.scopes.authorize(f.principal,f.binding,f.requirement)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED"});
  });
  it("does not issue ordinary HISTORY or STREAM",async()=>{
    const f=fixture();
    await expect(f.scopes.authorize(f.principal,f.binding,{...f.requirement,dataset:{...f.requirement.dataset,window:{from_ms:1,to_ms:2}}}))
      .rejects.toBeDefined();
    await expect(f.scopes.authorize(f.principal,f.binding,{action:"stream.subscribe",resource:{kind:"ALPHA",id:"a1"}})).rejects.toBeDefined();
  });
  it("refuses asynchronous release checks without letting a rejected Promise escape",async()=>{
    const f=fixture(),scope=await f.scopes.authorize(f.principal,f.binding,f.requirement);
    await expect(f.scopes.deliverScopedTogether([scope],async()=>"protected-body",async()=>{throw Error("TEST_ONLY-private-async");}))
      .rejects.toMatchObject({code:"EXECUTION_READ_AUTHORITY_UNAVAILABLE",status:503});
  });
});
