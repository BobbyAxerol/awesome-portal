/** TEST_ONLY installer control flow against a stub DB/trust/coordinator.
 * Not actual identity, DB-role/system-ID or owner-approval evidence. */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest } from "../src/execution-v2/access-policy";
import { unqualifiedAccessTrust, type ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import type { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";

const hash=(c:string)=>"sha256:"+c.repeat(64);
function fixture(){
  const now=Date.now(),workspace="TEST_ONLY-workspace",owner="TEST_ONLY-owner",person="TEST_ONLY-stan";
  const domain={profile_id:"TEST_ONLY-profile",catalogue_sha256:"a".repeat(64),
    profile_sha256:"b".repeat(64),field_policy_sha256:"c".repeat(64)};
  const artifact:ReviewedPolicyArtifact={policy:{workspace_id:workspace,revision:"TEST_ONLY-policy-r1",
    artifact_digest:hash("d"),approval_ref:"TEST_ONLY-NOT-REAL-APPROVAL",state:"REVIEWED",
    qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,
    researcher_fields:{state:"QUALIFIED",policy_ref:"TEST_ONLY-fields",fields:["alpha_id"]},
    manager_read_domains:[{environment:"paper",domain,field_policy_ref:"TEST_ONLY-fields",
      valid_from_ms:now-1000,valid_until_ms:now+60000}]},root_grants:[],
    manager_domain_grants:[{schema_version:"portal.manager-domain-grant.v1",grant_id:"TEST_ONLY-manager-grant",
      workspace_id:workspace,subject_user_id:person,issued_by:owner,parent_grant_id:null,revision:"TEST_ONLY-grant-r1",
      policy_revision:"TEST_ONLY-policy-r1",action:"business.read_all",effect:"ALLOW",environment:"paper",domain,
      field_policy_ref:"TEST_ONLY-fields",valid_from_ms:now-1000,valid_until_ms:now+60000,revoked_at_ms:null}],
    manager_commissioning_target:{database_name:"TEST_ONLY-db",database_system_identifier:"1234567890",
      role_name:"TEST_ONLY-role",protected_owner_user_id:owner,workspace_id:workspace,
      principal_workspace_pins:[{user_id:person,workspace_id:workspace}]},provenance_ref:"TEST_ONLY-not-production"};
  const actual={db:"TEST_ONLY-db",system_identifier:"1234567890",login:"TEST_ONLY-role",role:"TEST_ONLY-role"};
  const event={request_digest:accessDigest(artifact)};
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes("current_database()"))return{rows:[actual]};
    if(sql.includes("portal_access_policy_events"))return{rows:[event]};
    return{rows:[]};
  });
  const client={query,release:vi.fn()},pool={connect:vi.fn(async()=>client)} as unknown as Pool;
  const executeVerified=vi.fn(),mutations={usesPool:(p:Pool)=>p===pool,executeVerified} as unknown as CurrentHumanMutations;
  const service=new ExecutionAccessService(pool,{} as AuthService,
    {...unqualifiedAccessTrust,verifyPolicy:async()=>artifact},false,mutations);
  return {actual,event,query,executeVerified,service};
}
describe("TEST_ONLY historical Manager ACK exact target",()=>{
  it.each(["db","system_identifier","login","role"] as const)("denies wrong actual %s before historical ACK",async axis=>{
    const f=fixture();f.actual[axis]="TEST_ONLY-wrong-target";
    await expect(f.service.installReviewedManagerDomainPolicy({TEST_ONLY:true}))
      .rejects.toMatchObject({code:"RECEIPT_BINDING_MISMATCH"});
    expect(f.query.mock.calls.some(([sql])=>sql.includes("portal_access_policy_events"))).toBe(false);
    expect(f.executeVerified).not.toHaveBeenCalled();
  });
  it("acknowledges exact historical digest read-only without drain or grant repair",async()=>{
    const f=fixture();await f.service.installReviewedManagerDomainPolicy({TEST_ONLY:true});
    const sql=f.query.mock.calls.map(([s])=>s);
    expect(sql.indexOf("SET TRANSACTION READ ONLY")).toBeGreaterThan(-1);
    expect(sql.findIndex(s=>s.includes("current_database()"))).toBeLessThan(sql.findIndex(s=>s.includes("portal_access_policy_events")));
    expect(sql.some(s=>/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE)\b/i.test(s))).toBe(false);
    expect(f.executeVerified).not.toHaveBeenCalled();
  });
  it("still denies a different historical digest at the exact target",async()=>{
    const f=fixture();f.event.request_digest=hash("f");
    await expect(f.service.installReviewedManagerDomainPolicy({TEST_ONLY:true}))
      .rejects.toMatchObject({code:"POLICY_REVISION_CONFLICT"});
    expect(f.executeVerified).not.toHaveBeenCalled();
  });
});
