/** SOURCE-COMPATIBILITY component regressions with synthetic TEST_ONLY facts.
 * No real TS issuer, source lease, PostgreSQL rollback, COMMIT or qualification
 * claim. Existing real-PG command harness remains an additional acceptance gate. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AccessAction, AccessActor, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { tsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, evaluateAccess, type AccessEvaluationContext,
  type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { commandIntent, type CommandIntent } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { commandMembershipCurrent } from "../src/execution-v2/command-current-authority";
import { ExecutionCommandService, intentHash, validateAuthorization } from "../src/execution-v2/command.service";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { CommandStore } from "../src/execution-v2/command.store";

const NOW=1_792_100_000_000,WS="TEST_ONLY:workspace",OWNER="TEST_ONLY:owner",USER="TEST_ONLY:user";
const actor:AccessActor={user_id:USER,session_id:"TEST_ONLY:session",session_generation:1};
type Environment="paper"|"sandbox"|"live";
function fixture() {
  const grants:ScopedAccessGrant[]=[];
  const source:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",subject_user_id:USER,workspace_id:WS,
    ts_user_id:"TEST_ONLY:ts-user",mapping_revision:"TEST_ONLY:mapping",resources:["paper","live"].map(environment=>({
      environment:environment as Environment,revision:"TEST_ONLY:cut",own_alpha_ids:[],member_portfolio_ids:[],roots:[]})),grants:[]};
  const relations:AccessRelations={qualified:true,revision:"TEST_ONLY:observation",own_alpha_ids:[],member_portfolio_ids:[],roots:{},
    membership:null,current_authority:source};
  const ownerRelations:AccessRelations={qualified:true,revision:"TEST_ONLY:owner",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null};
  const context:AccessEvaluationContext={principal_id:USER,workspace_id:WS,now_ms:NOW,actor_current:true,actor_role:"USER",
    allow_test_only:true,authority_fingerprint:"TEST_ONLY:db",active_principals:new Set([USER,OWNER,"TEST_ONLY:delegator"]),
    policy:{workspace_id:WS,revision:"TEST_ONLY:policy",artifact_digest:accessDigest("TEST_ONLY:policy"),
      approval_ref:"TEST_ONLY:not-approval",state:"REVIEWED",qualification:"TEST_ONLY",protected_owner_user_id:OWNER,
      researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}},
    grants,relationsFor:id=>id===USER?relations:ownerRelations};
  function grant(id:string,resource="TEST_ONLY:portfolio-a",environments:Environment[]=["paper"],action:AccessAction="capital.top_up"):ScopedAccessGrant {
    return {grant_id:id,workspace_id:WS,subject_user_id:USER,action,effect:"ALLOW",selector:{
      kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[resource]},environments,
      valid_from_ms:NOW-1_000,valid_until_ms:NOW+90_000,delegable_actions:[],issued_by:OWNER,parent_grant_id:null,
      revision:"TEST_ONLY:grant",policy_revision:context.policy!.revision,revoked_at_ms:null,
      requires_ts_acceptance:true,ts_receipt:null,field_policy_ref:null};
  }
  function add(value:ScopedAccessGrant,existingFact?:CurrentAccessRelations["grants"][number]["accepted"]) {
    const fact=existingFact??tsMembershipAcceptance.parse({source:"TEST_ONLY:PM",source_contract:"TEST_ONLY:contract",
      trust_profile:"TEST_ONLY:uninstalled",receipt_id:"TEST_ONLY:receipt:"+value.grant_id,
      proposal_id:"TEST_ONLY:proposal:"+value.grant_id,proposal_digest:accessDigest(["TEST_ONLY:proposal",value.grant_id]),
      portal_user_id:USER,ts_user_id:source.ts_user_id,mapping_revision:source.mapping_revision,human_requester_user_id:value.issued_by,
      workspace_id:WS,action:value.action,selector_digest:accessDigest(canonicalSelector(value.selector)),environments:value.environments,
      previous_membership_revision:null,membership_revision:"TEST_ONLY:membership:"+value.grant_id,effective_at_ms:NOW-1_000,
      expires_at_ms:NOW+60_000,outcome:"ACCEPTED",payload_digest:accessDigest(["TEST_ONLY:fact",value.grant_id]),
      provenance_ref:"TEST_ONLY:no-real-source"});
    value.ts_receipt={receipt_id:fact.receipt_id,membership_revision:fact.membership_revision,mapping_revision:fact.mapping_revision,
      effective_at_ms:fact.effective_at_ms,expires_at_ms:fact.expires_at_ms};
    value.ts_acceptance_digest=accessDigest(fact);
    if(value.selector.kind!=="EXPLICIT_RESOURCE_SET")throw new Error("TEST_ONLY fixture requires explicit selector");
    const ids=value.selector.ids;
    source.grants.push({grant_id:value.grant_id,binding_digest:grantBindingDigest(value),accepted:fact,
      targets:value.environments.flatMap(environment=>ids.map(id=>({environment,resource:{kind:"PORTFOLIO" as const,id},
        revision:"TEST_ONLY:native:"+value.grant_id+":"+environment+":"+id,
        native_reference_digest:accessDigest(["TEST_ONLY:leg",value.grant_id,environment,id]),
        valid_from_ms:NOW-1_000,valid_until_ms:NOW+5_000})))});
    grants.push(value);
    return value;
  }
  const selected=add(grant("TEST_ONLY:grant-a"));
  function intent(resource="TEST_ONLY:portfolio-a",environment:Environment="paper"):CommandIntent {
    return commandIntent.parse({schema_version:"execution.capital-intent.v2",workspace_id:WS,
      resource:{kind:"PORTFOLIO",id:resource},environment,expected_policy_revision:context.policy!.revision,
      business_payload:{schema_version:"pma.capital-command.v1.1",operation:"TOP_UP",idempotency_key:"TEST_ONLY:key-0001",
        recipient_kind:"PORTFOLIO",currency:"USDT",reason:"TEST_ONLY component",amount:"10",expected_versions:{budget:"1",source:"2",parent:"3"}}});
  }
  function authorization(value=selected,i=intent()):CommandAuthorization {
    return commandAuthorization.parse({qualification:"TEST_ONLY",reference:"TEST_ONLY:authorization",authority_ref:"TEST_ONLY:pm",
      profile_ref:"TEST_ONLY:profile",audience:"pma.management.v1",actor_id:USER,ts_user_id:source.ts_user_id,
      workload_ref:"TEST_ONLY:workload",delegation_ref:"TEST_ONLY:opaque-native-ref",mapping_revision:value.ts_receipt!.mapping_revision,
      membership_revision:value.ts_receipt!.membership_revision,membership_receipt_ref:value.ts_receipt!.receipt_id,
      workspace_id:WS,environment:i.environment,operation:i.business_payload.operation,resource_kind:i.resource.kind,resource_id:i.resource.id,
      policy_revision:context.policy!.revision,intent_hash:intentHash(actor,i),source_intent_digest:accessDigest(["TEST_ONLY:source",i]).slice(7),
      expected_versions:i.business_payload.expected_versions,issued_at_ms:NOW-100,expires_at_ms:NOW+10_000,
      idempotency_retained_until_ms:NOW+60_000,approval_required:false,required_approval_gate:null,approval:null,r2_basis:null,
      commit_checks:{human:true,workload:true,membership:true,scope:true,versions:true,capacity:true,approval:true}});
  }
  return {grants,source,relations,ownerRelations,context,selected,grant,add,intent,authorization};
}
const validate=(f:ReturnType<typeof fixture>,a=f.authorization(),i=f.intent(),now=NOW,c=f.context)=>
  validateAuthorization(a,actor,i,c,true,now);
function refuse(f:ReturnType<typeof fixture>,a=f.authorization(),i=f.intent(),now=NOW,c=f.context) {
  expect(()=>validate(f,a,i,now,c)).toThrow("COMMAND_CONTEXT_INVALID");
}

describe("ELP2-07 per-grant accepted correspondence (TEST_ONLY, uninstalled)",()=>{
  it("accepts independent receipts without a singleton; an audit receipt is not capital authority",()=>{
    const f=fixture(),other=f.add(f.grant("TEST_ONLY:grant-b","TEST_ONLY:portfolio-b"));
    const audit=f.add(f.grant("TEST_ONLY:audit","TEST_ONLY:portfolio-a",["paper"],"audit.read"));
    expect(currentAccessRelations.safeParse(f.source).success).toBe(true);
    expect(()=>validate(f)).not.toThrow();
    const i=f.intent("TEST_ONLY:portfolio-b");expect(()=>validate(f,f.authorization(other,i),i)).not.toThrow();
    refuse(f,f.authorization(audit));refuse(f,f.authorization(other));
  });
  it("keeps independent resource/environment legs of one grant exact",()=>{
    const f=fixture();f.grants.length=0;f.source.grants.length=0;
    const g=f.grant("TEST_ONLY:multi","TEST_ONLY:portfolio-a",["paper","live"]);
    if(g.selector.kind!=="EXPLICIT_RESOURCE_SET")throw new Error("fixture");
    g.selector.ids.push("TEST_ONLY:portfolio-b");f.add(g);
    const a=f.authorization(g);expect(()=>validate(f,a)).not.toThrow();
    f.source.grants[0].targets=f.source.grants[0].targets.filter(t=>t.environment!=="live"||t.resource.id!=="TEST_ONLY:portfolio-a");
    const live=f.intent("TEST_ONLY:portfolio-a","live");refuse(f,f.authorization(g,live),live);
    expect(()=>validate(f,a)).not.toThrow();
    const sibling=f.intent("TEST_ONLY:portfolio-b","live");expect(()=>validate(f,f.authorization(g,sibling),sibling)).not.toThrow();
  });
  it.each(["null","undefined","malformed","unqualified","subject","workspace","ts-user","mapping","missing-grant","missing-leg"])(
    "present %s extension never falls back to a matching legacy tuple",fault=>{
      const f=fixture(),a=f.authorization();f.relations.membership={revision:a.membership_revision,
        mapping_revision:a.mapping_revision,receipt_id:a.membership_receipt_ref};
      if(fault==="null")f.relations.current_authority=null;
      if(fault==="undefined")f.relations.current_authority=undefined;
      if(fault==="malformed")f.relations.current_authority={schema_version:"bad"} as never;
      if(fault==="unqualified")f.relations.qualified=false;
      if(fault==="subject")f.source.subject_user_id="TEST_ONLY:other";
      if(fault==="workspace")f.source.workspace_id="TEST_ONLY:other";
      if(fault==="ts-user")f.source.ts_user_id="TEST_ONLY:other";
      if(fault==="mapping")f.source.mapping_revision="TEST_ONLY:other";
      if(fault==="missing-grant")f.source.grants=[];
      if(fault==="missing-leg")f.source.grants[0].targets=[];
      refuse(f,a);
    });
  it.each(["digest","binding","receipt","revision","accepted-meaning"])("rejects %s acceptance substitution",fault=>{
    const f=fixture(),a=f.authorization(),entry=f.source.grants[0];
    if(fault==="digest")f.selected.ts_acceptance_digest=accessDigest("other");
    if(fault==="binding")entry.binding_digest=accessDigest("other");
    if(fault==="receipt")entry.accepted.receipt_id="other";
    if(fault==="revision")entry.accepted.membership_revision="other";
    if(fault==="accepted-meaning")entry.accepted.action="capital.fund";
    refuse(f,a);
  });
  it("uses final time with half-open target expiry, not the old source/context clock",()=>{
    const f=fixture();expect(()=>validate(f,undefined,undefined,NOW+4_999)).not.toThrow();
    refuse(f,undefined,undefined,NOW+5_000);expect(f.context.now_ms).toBe(NOW);
  });
  it("does not borrow an independent ALLOW when the receipt-selected delegation is denied",()=>{
    const f=fixture(),ceiling=f.grant("TEST_ONLY:ceiling");
    Object.assign(ceiling,{subject_user_id:OWNER,action:"access.grant",requires_ts_acceptance:false,
      delegable_actions:["capital.top_up"],ts_receipt:null});f.grants.push(ceiling);
    f.selected.parent_grant_id=ceiling.grant_id;
    f.source.grants[0].binding_digest=grantBindingDigest(f.selected);
    const deny=f.grant("TEST_ONLY:owner-deny");
    Object.assign(deny,{subject_user_id:OWNER,action:"access.grant",effect:"DENY",requires_ts_acceptance:false,ts_receipt:null});
    f.grants.push(deny);
    const independent=f.add(f.grant("TEST_ONLY:independent"));
    expect(evaluateAccess(f.context,"capital.top_up",f.intent().resource,"paper").allowed).toBe(true);
    refuse(f);expect(()=>validate(f,f.authorization(independent))).not.toThrow();
  });
  it("preserves the independent ancestry of a matching DENY",()=>{
    const f=fixture(),ceiling=f.grant("TEST_ONLY:deny-ceiling");
    Object.assign(ceiling,{subject_user_id:"TEST_ONLY:delegator",action:"access.grant",requires_ts_acceptance:false,
      delegable_actions:["capital.top_up"],ts_receipt:null});f.grants.push(ceiling);
    const deny=f.grant("TEST_ONLY:deny");
    Object.assign(deny,{effect:"DENY",issued_by:"TEST_ONLY:delegator",parent_grant_id:ceiling.grant_id,
      requires_ts_acceptance:false,ts_receipt:null});f.grants.push(deny);
    expect(evaluateAccess(f.context,"capital.top_up",f.intent().resource,"paper").allowed).toBe(false);refuse(f);
  });
  it("rejects ambiguous copies of an accepted receipt rather than selecting by array order",()=>{
    const f=fixture(),fact=f.source.grants[0].accepted;f.add(f.grant("TEST_ONLY:ambiguous"),fact);refuse(f);
    f.grants.reverse();refuse(f);
  });
  it("cannot use an opaque delegation_ref as another grant ID or alias another action",()=>{
    const f=fixture(),other=f.add(f.grant("TEST_ONLY:grant-b","TEST_ONLY:portfolio-b"));
    refuse(f,{...f.authorization(other),delegation_ref:f.selected.grant_id});
    const audit=f.add(f.grant("TEST_ONLY:audit","TEST_ONLY:portfolio-a",["paper"],"audit.read"));refuse(f,f.authorization(audit));
  });
  it("preserves literal-true legacy authority and unchanged acceptance/private DTO bytes",()=>{
    const f=fixture(),a=f.authorization(),before=JSON.stringify(a),grants=JSON.stringify(f.grants);
    delete f.relations.current_authority;
    f.relations.membership={revision:a.membership_revision,mapping_revision:a.mapping_revision,receipt_id:a.membership_receipt_ref};
    expect(f.relations.qualified).toBe(true);
    expect(commandMembershipCurrent(a,actor,f.intent(),f.context,"capital.top_up",NOW)).toBe(true);
    expect(()=>validate(f,a)).not.toThrow();expect(JSON.stringify(a)).toBe(before);
    expect(JSON.stringify(f.grants)).toBe(grants);
    expect(commandAuthorization.parse(JSON.parse(before))).toEqual(a);
    expect(commandAuthorization.safeParse({...a,core_grant_id:f.selected.grant_id}).success).toBe(false);
    expect(()=>validateAuthorization(a,actor,f.intent(),f.context,false,NOW)).toThrow("COMMAND_RELAY_NOT_QUALIFIED");
  });
  it.each([false,undefined,null,"false","true",1,{}])("legacy command membership rejects nonliteral qualification %j without rewriting receipts",invalid=>{
    const f=fixture(),a=f.authorization(),before=JSON.stringify(a),grants=JSON.stringify(f.grants);
    delete f.relations.current_authority;
    f.relations.membership={revision:a.membership_revision,mapping_revision:a.mapping_revision,receipt_id:a.membership_receipt_ref};
    (f.relations as unknown as Record<string,unknown>).qualified=invalid;
    const membership=JSON.stringify(f.relations.membership);
    // Direct helper assertion discriminates its guard from the shared-policy repair.
    expect(commandMembershipCurrent(a,actor,f.intent(),f.context,"capital.top_up",NOW)).toBe(false);
    refuse(f,a);expect(JSON.stringify(a)).toBe(before);expect(JSON.stringify(f.grants)).toBe(grants);
    expect(JSON.stringify(f.relations.membership)).toBe(membership);
  });
  it.each(["final-clock","final-context"])("service uses %s after awaited store write (synthetic boundary only)",async fault=>{
    const f=fixture(),a=f.authorization(),i=f.intent();
    const finalSource=structuredClone(f.source);if(fault==="final-context")finalSource.grants[0].targets=[];
    const final={...f.context,now_ms:fault==="final-clock"?NOW+5_000:NOW,
      relationsFor:(id:string)=>id===USER?{...f.relations,current_authority:finalSource}:f.ownerRelations};
    const access={readContext:vi.fn(async()=>f.context),confirmReadContext:vi.fn(async()=>f.context),
      commandHumanMapping:vi.fn(async()=>({ts_user_id:a.ts_user_id,revision:a.mapping_revision})),
      commandBoundary:vi.fn(async(_actor:unknown,_workspace:unknown,_expected:unknown,_action:unknown,_resource:unknown,_env:unknown,
        check:(now:number,current:AccessEvaluationContext)=>void,fn:(db:never)=>Promise<unknown>)=>{
          const result=await fn(null as never);check(final.now_ms,final);return result;
        })};
    const send=vi.fn(),trust:CommandTrust={prepare:async()=>a,send,lookup:async()=>null};
    const service=new ExecutionCommandService(null as unknown as Pool,access as unknown as ExecutionAccessService,trust,true);
    const store={keyed:vi.fn(async()=>null),insert:vi.fn(async()=>({id:"ecm_00000000000000000000000000000001"})),
      claim:vi.fn(async()=>"TEST_ONLY:attempt")};
    (service as unknown as {store:CommandStore}).store=store as unknown as CommandStore;
    const preview=await service.preview(actor,i);expect(preview.allowed).toBe(true);
    await expect(service.submit(actor,i,preview.preview_digest!)).rejects.toMatchObject({code:"COMMAND_CONTEXT_INVALID"});
    expect(store.insert).toHaveBeenCalledOnce();expect(store.claim).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
    // No rollback assertion: this focused harness deliberately has no DB.
  });
});
