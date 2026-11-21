/** TEST_ONLY cache/cursor serialization with a stub repository. No real DB,
 * native authority, physical delivery or runtime revoke acceptance. */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ControlApiConfig } from "../src/config";
import { MaximumDataContinuationRepository, type MaximumDataContinuationScope } from "../src/execution/maximum-data-continuation.repository";
import { sharedReadIdentity, type SharedReadScope } from "../src/execution/shared-read.repository";

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const epoch=(letter:string)=>"sha256:"+letter.repeat(64);
const cache:SharedReadScope={sourceId:"manager.deployments",profileId:"PAPER_BINANCE_USDM",
  workspaceId:"TEST_ONLY-workspace",principalId:"TEST_ONLY-stan",principalRole:"USER",
  adapterRevision:"PORTAL_E5_DEPLOYMENT_PAGE_V1",requestPath:"/internal/test"};
function scope(value?:string):MaximumDataContinuationScope{return{
  operationId:"maximumDataDeploymentPageV1",workspaceId:cache.workspaceId,principalId:cache.principalId,
  principalRole:cache.principalRole,environment:"paper",profileId:cache.profileId,
  sourceContractRevision:"TEST_ONLY-contract",sourceCatalogueSha256:epoch("c"),
  ...(value!==undefined?{nativeEpochDigest:value}:{})};}
function fixture(){
  const rows=new Map<string,{digest:string;source:string}>();
  const query=vi.fn(async(sql:string,args:unknown[])=>{
    if(sql.includes("INSERT INTO")){
      rows.set(String(args[5]),{digest:String(args[2]),source:String(args[8])});return{rows:[]};
    }
    const row=rows.get(String(args[0]));return{rows:row&&row.digest===args[3]?[{source_cursor:row.source}]:[]};
  });
  return {query,repo:new MaximumDataContinuationRepository({query} as unknown as Pool,
    {QUERY_CURSOR_TTL_SECONDS:60} as ControlApiConfig)};
}
const invalid=["bad",epoch("A"),epoch("a")+"\n",""];
describe("TEST_ONLY current Manager epoch correlation, never permission",()=>{
  it("preserves exact legacy N21 cache principal/request/key preimages",()=>{
    const principalDigest="sha256:"+sha(cache.principalId+"\0"+cache.principalRole);
    const requestDigest="sha256:"+sha(cache.requestPath);
    const cacheKey="sha256:"+sha(["N21",cache.sourceId,cache.profileId,cache.workspaceId,
      principalDigest,cache.adapterRevision,requestDigest].join("\0"));
    expect(sharedReadIdentity(cache)).toEqual({principalDigest,requestDigest,cacheKey});
  });
  it("keeps request bytes but isolates legacy and two native authority epochs",()=>{
    const legacy=sharedReadIdentity(cache),a=sharedReadIdentity({...cache,nativeEpochDigest:epoch("a")});
    const b=sharedReadIdentity({...cache,nativeEpochDigest:epoch("b")});
    expect(new Set([legacy.cacheKey,a.cacheKey,b.cacheKey]).size).toBe(3);
    expect(new Set([legacy.principalDigest,a.principalDigest,b.principalDigest]).size).toBe(3);
    expect(a.requestDigest).toBe(legacy.requestDigest);expect(b.requestDigest).toBe(legacy.requestDigest);
  });
  it.each(invalid)("rejects malformed cache epoch %j",nativeEpochDigest=>{
    expect(()=>sharedReadIdentity({...cache,nativeEpochDigest})).toThrow("scope");
  });
  it.each(invalid)("rejects malformed continuation epoch %j before query",async value=>{
    const f=fixture();await expect(f.repo.issue(scope(value),"TEST_ONLY-source")).rejects.toThrow("scope");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("preserves exact legacy continuation principal digest and mdc1 wire",async()=>{
    const f=fixture(),s=scope(),cursor=await f.repo.issue(s,"TEST_ONLY-source");
    expect(f.query.mock.calls[0]![1][2]).toBe("sha256:"+sha(s.principalId+"\0"+s.principalRole));
    expect(cursor).toMatch(/^mdc1\.[a-f0-9-]{36}$/);
    expect(await f.repo.resolve(s,cursor)).toBe("TEST_ONLY-source");
  });
  it("resolves next private page under exactly the same native epoch",async()=>{
    const f=fixture(),s=scope(epoch("a")),cursor=await f.repo.issue(s,"TEST_ONLY-source");
    expect(await f.repo.resolve(s,cursor)).toBe("TEST_ONLY-source");
  });
  it.each([undefined,epoch("b")])("rejects missing or changed native epoch %j",async changed=>{
    const f=fixture(),cursor=await f.repo.issue(scope(epoch("a")),"TEST_ONLY-private-source");
    await expect(f.repo.resolve(scope(changed),cursor)).rejects.toMatchObject({code:"EDS01_CURSOR_INVALID_OR_EXPIRED"});
  });
});
