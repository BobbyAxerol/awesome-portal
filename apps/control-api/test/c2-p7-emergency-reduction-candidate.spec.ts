import {beforeEach,describe,expect,it,vi} from "vitest";
import type {Pool} from "pg";
const mocks=vi.hoisted(()=>({user:vi.fn(),session:vi.fn()}));
vi.mock("../src/repos/users",()=>({UsersRepository:class{lockById=mocks.user;}}));
vi.mock("../src/repos/sessions",()=>({SessionsRepository:class{lockActiveLease=mocks.session;}}));
import {C2P7EmergencyReductionCandidate} from "../src/execution-v2/c2-p7-emergency-reduction-candidate";
const actor={user_id:"owner",session_id:"session",session_generation:1},intentId="afba55ed-e41c-4e30-a0e3-bb497a486879",digest="a".repeat(64);
function fixture(options:{anchor?:string;scope?:boolean;intentOwner?:string;failUpdate?:boolean;badDisposition?:boolean}={}) {
  let revoked=false;
  const query=vi.fn(async(sql:string,_params?:unknown[])=>{
    if(sql.includes("SELECT singleton"))return {rowCount:1,rows:[{}]};
    if(sql.includes("pg_try_advisory"))return {rowCount:1,rows:[{acquired:true}]};
    if(sql.includes("portal_owner_anchor"))return {rowCount:1,rows:[{user_id:options.anchor??"owner"}]};
    if(sql.includes("FROM workspaces"))return {rowCount:1,rows:[{}]};
    if(sql.includes("lock_owner_intent_by_id"))return {rowCount:1,rows:[{workspace_id:"workspace",
      owner_user_id:options.intentOwner??"owner",registration_key:"key",registration_sha256:digest}]};
    if(sql.includes("INSERT INTO elp210_c2_p7_candidate.owner_intent_revocations")){revoked=true;return {rowCount:1,rows:[]};}
    if(sql.includes("revoke_registered_scope_candidate")){if(options.failUpdate)throw new Error("blocked");return {rowCount:1,rows:[{
      disposition:options.badDisposition?"UNEXPECTED":options.scope===false?"REGISTRATION_REVOKED_FENCE_UNPROVISIONED":"REGISTRATION_REVOKED_BLOCK_NEW"}]};}
    if(sql.includes("FROM auth_sessions"))return {rowCount:1,rows:[{}]};
    if(sql==="ROLLBACK")revoked=false;
    return {rowCount:0,rows:[]};
  });
  const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
  return {pool,query,get revoked(){return revoked;}};
}
beforeEach(()=>{mocks.user.mockResolvedValue({status:"ACTIVE",archivedAt:null,mustChangePassword:false,sessionVersion:1});mocks.session.mockResolvedValue(true);});
describe("P7 emergency reduction candidate, synthetic",()=>{
  it("revokes only and confirms BLOCK_NEW without policy, step-up or source",async()=>{
    const d=fixture(),result=await new C2P7EmergencyReductionCandidate(d.pool,"key").reduce(actor,"workspace",intentId);
    expect(result).toEqual({state:"AUTHORITY_PROPAGATION_PENDING",intent:"REVOKED",registration:"REVOKED",local_fence:"BLOCK_NEW"});
    expect(d.query.mock.calls.some(c=>/policy|step.up|source/i.test(c[0]))).toBe(false);
    expect(d.query.mock.calls.some(c=>c[0].includes("UPDATE elp210_c2_p7_candidate.registrations"))).toBe(false);
    const call=d.query.mock.calls.find(c=>c[0].includes("revoke_registered_scope_candidate"));
    expect(call?.[1]).toEqual(["key",digest,"owner","session",1,"workspace"]);
    expect(d.query.mock.calls.some(c=>c[0]==="COMMIT")).toBe(true);
  });
  it("reports unprovisioned fence honestly",async()=>{
    const d=fixture({scope:false}),result=await new C2P7EmergencyReductionCandidate(d.pool,"key").reduce(actor,"workspace",intentId);
    expect(result.local_fence).toBe("UNPROVISIONED");expect(result.state).toBe("AUTHORITY_PROPAGATION_PENDING");
  });
  it("refuses other owner or dead session, and rolls back partial errors",async()=>{
    for(const d of [fixture({anchor:"other"}),fixture({intentOwner:"other"}),fixture({failUpdate:true}),fixture({badDisposition:true})]){
      await expect(new C2P7EmergencyReductionCandidate(d.pool,"key").reduce(actor,"workspace",intentId)).rejects.toThrow();
      expect(d.query.mock.calls.some(c=>c[0]==="ROLLBACK")).toBe(true);expect(d.revoked).toBe(false);
    }
    mocks.session.mockResolvedValueOnce(false);const d=fixture();
    await expect(new C2P7EmergencyReductionCandidate(d.pool,"key").reduce(actor,"workspace",intentId)).rejects.toThrow();
    expect(d.query.mock.calls.some(c=>c[0].includes("INSERT INTO"))).toBe(false);
  });
});
