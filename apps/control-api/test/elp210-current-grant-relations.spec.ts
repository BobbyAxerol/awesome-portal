/** TEST_ONLY synthetic Core compatibility vectors. No users/grants/receipts
 * inserted, no actual source, held native fence or production acceptance. */
import { describe, expect, it } from "vitest";
import { requireCurrentTsAuditRead } from "../src/execution-v2/current-audit-read";
import type { AccessResource, ScopedAccessGrant, TsMembershipAcceptance, TsRootMembershipAcceptance } from "../src/execution-v2/access.contract";
import { tsRootMembershipAcceptance } from "../src/execution-v2/access.contract";
import { currentAcceptanceMatches, currentAccessRelations, currentGrantProof, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { accessDigest, canonicalSelector, currentBoundaryProof, environmentRelations, evaluateAccess,
  grantCurrent, resolvedResources, validateDelegation, type AccessEvaluationContext, type AccessRelations } from "../src/execution-v2/access-policy";
import { detachDelegatedReceiptSource } from "../src/execution-v2/access-delegated-receipt";
import { ExecutionReadScopes, scopeRealtimeIdentity, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ControlApiConfig } from "../src/config";
import type { Pool } from "pg";

const NOW=1_800_000_000_000;
const ENV=["paper","sandbox","live"] as const;
const P:AccessResource={kind:"PORTFOLIO",id:"TEST_ONLY:P"}, Q:AccessResource={kind:"PORTFOLIO",id:"TEST_ONLY:Q"};
const R:AccessResource={kind:"ROOT",id:"TEST_ONLY:R"};
const mapping="TEST_ONLY:mapping:original";
function grant(id="TEST_ONLY:g",overrides:Partial<ScopedAccessGrant>={}):ScopedAccessGrant {
  const value:ScopedAccessGrant={grant_id:id,subject_user_id:"TEST_ONLY:manager",workspace_id:"TEST_ONLY:workspace",action:"business.read_all",effect:"ALLOW",
    selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[P.id,Q.id]},environments:[...ENV],
    valid_from_ms:NOW-200,valid_until_ms:NOW+10000,delegable_actions:[],issued_by:"TEST_ONLY:owner",parent_grant_id:null,
    revision:"TEST_ONLY:grant:r1",policy_revision:"TEST_ONLY:policy:r1",revoked_at_ms:null,requires_ts_acceptance:true,
    ts_receipt:{receipt_id:id+":original-acceptance",membership_revision:id+":original-revision",mapping_revision:mapping,
      effective_at_ms:NOW-100,expires_at_ms:NOW+10000},field_policy_ref:null,...overrides};
  return value.ts_receipt?{...value,ts_acceptance_digest:accessDigest(fact(value))}:value;
}
function fact(g:ScopedAccessGrant):TsMembershipAcceptance {
  const r=g.ts_receipt!;
  return {source:"TEST_ONLY:PM",source_contract:"TEST_ONLY:contract",trust_profile:"TEST_ONLY:profile",receipt_id:r.receipt_id,
    proposal_id:g.grant_id+":proposal",proposal_digest:accessDigest([g.grant_id,"TEST_ONLY:proposal"]),portal_user_id:g.subject_user_id,
    ts_user_id:"TEST_ONLY:ts-user",mapping_revision:r.mapping_revision,human_requester_user_id:g.issued_by,workspace_id:g.workspace_id,
    action:g.action,selector_digest:accessDigest(canonicalSelector(g.selector)),environments:[...g.environments],
    previous_membership_revision:null,membership_revision:r.membership_revision,effective_at_ms:r.effective_at_ms,
    expires_at_ms:r.expires_at_ms,outcome:"ACCEPTED",payload_digest:accessDigest([g.grant_id,"TEST_ONLY:payload"]),
    provenance_ref:"TEST_ONLY:NOT_REAL_ACCEPTANCE"};
}
function source(grants=[grant()]):CurrentAccessRelations {
  return {schema_version:"pma.core-current-relations.v1",subject_user_id:grants[0].subject_user_id,
    workspace_id:grants[0].workspace_id,ts_user_id:"TEST_ONLY:ts-user",mapping_revision:mapping,
    resources:ENV.map(environment=>({environment,revision:"TEST_ONLY:resource-cut",own_alpha_ids:["TEST_ONLY:own-alpha"],
      member_portfolio_ids:[P.id,Q.id],roots:[{root_id:R.id,revision:"TEST_ONLY:root-cut",complete:true,resources:[P,Q]}]})),
    grants:grants.map(g=>({grant_id:g.grant_id,binding_digest:grantBindingDigest(g),accepted:fact(g),
      targets:g.environments.flatMap(environment=>[P,Q,R].map(resource=>({environment,resource,revision:`TEST_ONLY:${g.grant_id}:${environment}:${resource.id}`,
        native_reference_digest:accessDigest(["TEST_ONLY:original-native-reference",g.grant_id,environment,resource]),
        valid_from_ms:NOW-50,valid_until_ms:NOW+5000})))}))};
}
function relations(authority:CurrentAccessRelations):AccessRelations {
  return {qualified:true,revision:"TEST_ONLY:global-observation",own_alpha_ids:["TEST_ONLY:STALE-global-alpha"],
    member_portfolio_ids:["TEST_ONLY:STALE-global-portfolio"],roots:{"TEST_ONLY:STALE-global-root":[P,Q]},
    membership:{receipt_id:"TEST_ONLY:legacy",revision:"TEST_ONLY:legacy",mapping_revision:"TEST_ONLY:legacy"},current_authority:authority};
}
function context(gs=[grant()], s=source(gs)):AccessEvaluationContext {
  return {principal_id:gs[0].subject_user_id,workspace_id:"TEST_ONLY:workspace",now_ms:NOW,actor_current:true,allow_test_only:true,
    policy:{workspace_id:"TEST_ONLY:workspace",revision:"TEST_ONLY:policy:r1",artifact_digest:accessDigest("TEST_ONLY:policy"),approval_ref:"TEST_ONLY:not-owner-approval",
      state:"REVIEWED",qualification:"TEST_ONLY",protected_owner_user_id:"TEST_ONLY:owner",researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}},
    grants:gs,active_principals:new Set(["TEST_ONLY:owner","TEST_ONLY:manager","TEST_ONLY:child"]),relationsFor:()=>relations(s)};
}
function decide(c:AccessEvaluationContext,resource=P,environment:typeof ENV[number]="paper") {
  return evaluateAccess(c,"business.read_all",resource,environment);
}
function removeLeg(s:CurrentAccessRelations,resource=P,env:typeof ENV[number]="paper",id=s.grants[0].grant_id) {
  const entry=s.grants.find(g=>g.grant_id===id)!;
  entry.targets=entry.targets.filter(p=>!(p.resource.kind===resource.kind&&p.resource.id===resource.id&&p.environment===env));
}

describe("original08 current native/Core grant compatibility (TEST_ONLY)",()=>{
  it.each(ENV.flatMap(env=>[P,Q].map(resource=>({env,resource}))))("one accepted grant can cover many independent legs: $env $resource.id",({env,resource})=>{
    const c=context(); expect(decide(c,resource,env).allowed).toBe(true);expect(grantCurrent(c.grants[0],c)).toBe(true);
  });
  it.each(ENV)("revoking P/%s denies exactly that leg, preserving other portfolio/environment positives",env=>{
    const gs=[grant()],s=source(gs),before=context(gs,s),old=decide(before,Q,"live");
    const immutable=structuredClone(gs);removeLeg(s,P,env);const c=context(gs,s);
    for(const e of ENV)for(const r of [P,Q])expect(decide(c,r,e).allowed).toBe(!(r.id===P.id&&e===env));
    expect(grantCurrent(gs[0],c)).toBe(false);expect(decide(c,Q,"live").scope_revision).toBe(old.scope_revision);
    expect(gs).toEqual(immutable);
  });
  it("two different grants retain their distinct accepted receipts, not a single principal tuple",()=>{
    const gs=[grant("TEST_ONLY:first"),grant("TEST_ONLY:second")],s=source(gs);
    removeLeg(s,P,"paper",gs[0].grant_id);expect(decide(context(gs,s)).allowed).toBe(true);
    removeLeg(s,P,"paper",gs[1].grant_id);expect(decide(context(gs,s)).allowed).toBe(false);
    expect(decide(context(gs,s),Q,"live").allowed).toBe(true);
  });
  it.each([null,undefined,{}, {schema_version:"UNKNOWN"}])("invalid present extension never falls back to legacy (%j)",invalid=>{
    const gs=[grant()],c=context(gs),r=relations(source(gs));r.membership={revision:gs[0].ts_receipt!.membership_revision,
      receipt_id:gs[0].ts_receipt!.receipt_id,mapping_revision:mapping};
    (r as {current_authority:unknown}).current_authority=invalid;c.relationsFor=()=>r;
    expect(decide(c).allowed).toBe(false);
  });
  it("the explicitly absent extension retains existing legacy tuple behavior",()=>{
    const gs=[grant()],c=context(gs),r=relations(source(gs));delete r.current_authority;
    r.membership={revision:gs[0].ts_receipt!.membership_revision,receipt_id:gs[0].ts_receipt!.receipt_id,mapping_revision:mapping};
    c.relationsFor=()=>r;expect(decide(c).allowed).toBe(true);
  });
  it.each(["subject_user_id","workspace_id","mapping_revision","ts_user_id"] as const)("wrong current %s denies without rewriting acceptance",field=>{
    const s=source();(s as Record<string,unknown>)[field]="TEST_ONLY:wrong";
    expect(decide(context(undefined,s)).allowed).toBe(false);
  });
  it.each(["receipt_id","membership_revision","mapping_revision","ts_user_id","portal_user_id","human_requester_user_id","workspace_id",
    "action","selector_digest","effective_at_ms","expires_at_ms","outcome","payload_digest","provenance_ref"] as const)("wrong original accepted %s denies",field=>{
    const s=source();const value=s.grants[0].accepted[field];
    (s.grants[0].accepted as unknown as Record<string,unknown>)[field]=typeof value==="number"?value+1:"TEST_ONLY:wrong";
    expect(decide(context(undefined,s)).allowed).toBe(false);
  });
  it.each(["selector","action","valid_until_ms","policy_revision","issued_by","workspace_id","environments"] as const)("changed grant meaning %s cannot borrow old provenance",field=>{
    const gs=[grant()],s=source(gs);
    if(field==="selector")gs[0].selector={kind:"ROOT_SCOPE",root_id:R.id};
    else if(field==="environments")gs[0].environments=["live"];
    else if(field==="valid_until_ms")gs[0].valid_until_ms=NOW+20000;
    else (gs[0] as unknown as Record<string,unknown>)[field]="TEST_ONLY:changed";
    expect(decide(context(gs,s)).allowed).toBe(false);
  });
  it.each([-1,0,1])("native lease expiry is exclusive with delta %i",delta=>{
    const s=source();s.grants[0].targets.find(p=>p.resource.id===P.id&&p.environment==="paper")!.valid_until_ms=NOW+delta;
    const c=context(undefined,s);expect(decide(c).allowed).toBe(delta>0);expect(decide(c,Q,"paper").allowed).toBe(true);
  });
  it("a new native command/version cannot silently renew the old Core acceptance",()=>{
    const s=source();s.grants[0].accepted.membership_revision="TEST_ONLY:renewed-native-receipt";
    expect(decide(context(undefined,s)).allowed).toBe(false);
  });
  it("ROOT complete census is environment-specific and cannot use legacy flat roots",()=>{
    const gs=[grant(undefined,{selector:{kind:"ROOT_SCOPE",root_id:R.id}})],s=source(gs),c=context(gs,s);
    expect(decide(c,P,"paper").allowed).toBe(true);s.resources[0].roots[0].complete=false;
    expect(decide(c,P,"paper").allowed).toBe(false);expect(decide(c,P,"live").allowed).toBe(true);
    expect(()=>resolvedResources(gs[0].selector,relations(s))).toThrow();
  });
  it.each(["partial","empty","missing"])("%s ROOT coverage is not a complete wildcard and explicit grants still work",mode=>{
    const root=grant("TEST_ONLY:root",{selector:{kind:"ROOT_SCOPE",root_id:R.id}}),exact=grant("TEST_ONLY:exact");
    const s=source([root,exact]);if(mode==="partial")s.resources[0].roots[0].complete=false;
    if(mode==="empty")s.resources[0].roots[0].resources=[];if(mode==="missing")s.resources[0].roots=[];
    const c=context([root,exact],s);expect(grantCurrent(root,c,new Set(),{resource:P,environment:"paper"})).toBe(false);
    expect(evaluateAccess(context([root],s),"business.read_all",P,"paper").allowed).toBe(false);
    expect(decide(c).allowed).toBe(true);
  });
  it("new environment cuts override stale legacy OWN_ALPHA/member/root fields",()=>{
    const s=source(),r=environmentRelations(relations(s),"paper");
    expect(r.own_alpha_ids).toEqual(["TEST_ONLY:own-alpha"]);expect(r.member_portfolio_ids).toEqual([P.id,Q.id]);
    s.resources=s.resources.filter(cut=>cut.environment!=="paper");
    expect(environmentRelations(relations(s),"paper")).toMatchObject({qualified:false,own_alpha_ids:[],roots:{}});
  });
  it.each(["subject_user_id","workspace_id"] as const)("non-TS technical dynamic selectors reject wrong %s without native acceptance",field=>{
    for(const selector of [{kind:"OWN_ALPHA"} as const,{kind:"ROOT_SCOPE",root_id:R.id} as const]){
      const g=grant(undefined,{action:"maintenance.read",selector,requires_ts_acceptance:false,ts_receipt:null});
      delete g.ts_acceptance_digest;
      const s=source(),c=context([g],s),resource=selector.kind==="OWN_ALPHA"?{kind:"ALPHA" as const,id:s.resources[0].own_alpha_ids[0]}:R;
      expect(evaluateAccess(c,"maintenance.read",resource,"paper").allowed).toBe(true);
      s[field]="TEST_ONLY:wrong-correlation";
      expect(evaluateAccess(c,"maintenance.read",resource,"paper").allowed).toBe(false);
    }
  });
  it.each(["subject_user_id","workspace_id"] as const)("new delegation subject cannot borrow another principal's %s census",field=>{
    const ceiling=grant("TEST_ONLY:ceiling",{action:"access.grant",delegable_actions:["business.read_all"]}),issuer=source([ceiling]);
    const target=structuredClone(issuer);target.subject_user_id="TEST_ONLY:child";target[field]="TEST_ONLY:wrong-correlation";
    const c=context([ceiling],issuer);c.relationsFor=id=>relations(id==="TEST_ONLY:child"?target:issuer);
    expect(()=>validateDelegation(c,{subject_user_id:"TEST_ONLY:child",action:"business.read_all",effect:"ALLOW",
      selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[P.id]},environments:["paper"],valid_from_ms:NOW,
      valid_until_ms:NOW+1000,delegable_actions:[],ceiling_grant_id:ceiling.grant_id,expected_ceiling_revision:ceiling.revision,
      expected_policy_revision:ceiling.policy_revision,expected_ts_membership_revision:null,reason:"TEST_ONLY:cross-subject"}))
      .toThrowError(expect.objectContaining({code:"SOURCE_RELATION_NOT_QUALIFIED"}));
  });
  it("visible proof/cursor identity ignores unrelated leg/global observations, but changes on selected revoke",()=>{
    const gs=[grant()],s=source(gs),before=accessDigest(currentBoundaryProof(context(gs,s),"paper",[P]));
    removeLeg(s,Q,"live");s.resources[2].revision="TEST_ONLY:unrelated-source-change";
    expect(accessDigest(currentBoundaryProof(context(gs,s),"paper",[P]))).toBe(before);
    removeLeg(s,P,"paper");expect(accessDigest(currentBoundaryProof(context(gs,s),"paper",[P]))).not.toBe(before);
  });
  it("ordinary intake and later use share the exact original full fact and complete target set",()=>{
    const g=grant(),s=source([g]);expect(currentAcceptanceMatches(fact(g),g,s,NOW)).toBe(true);
    expect(currentAcceptanceMatches({...fact(g),provenance_ref:"TEST_ONLY:other-original-fact"},g,s,NOW)).toBe(false);
    removeLeg(s,Q,"sandbox");expect(currentAcceptanceMatches(fact(g),g,s,NOW)).toBe(false);
  });
  it("reviewed-root fact remains distinct, with no invented ordinary proposal fields",()=>{
    const g=grant(),s=source([g]),{proposal_id:_id,proposal_digest:_digest,...base}=fact(g);
    const {ts_acceptance_digest:_accepted,...pending}=g;
    const root:TsRootMembershipAcceptance={...base,context:"REVIEWED_POLICY_ROOT",policy_revision:g.policy_revision,
      policy_artifact_digest:accessDigest("TEST_ONLY:policy"),policy_install_digest:accessDigest("TEST_ONLY:install"),
      approval_ref:"TEST_ONLY:approval",grant_id:g.grant_id,grant_digest:accessDigest({...pending,ts_receipt:null}),expected_grant_revision:g.revision};
    expect(tsRootMembershipAcceptance.safeParse(root).success).toBe(true);s.grants[0].accepted=root;g.ts_acceptance_digest=accessDigest(root);
    expect(currentAcceptanceMatches(root,g,s,NOW)).toBe(true);expect(decide(context([g],s)).allowed).toBe(true);
    expect(root).not.toHaveProperty("proposal_id");expect(root).not.toHaveProperty("proposal_digest");
  });
  it("delegated detached source preserves new authority across existing held receipt coordination",()=>{
    const g=grant(),s=source([g]),input={fact:fact(g),mapping:{ts_user_id:s.ts_user_id,revision:mapping},
      relations:[{principal_id:g.subject_user_id,relations:relations(s)}]};
    const detached=detachDelegatedReceiptSource(input,{workspace_id:g.workspace_id,subject_user_id:g.subject_user_id,
      principal_ids:[g.subject_user_id]});
    expect(detached.relations[0].relations.current_authority).toEqual(s);
    detached.relations[0].relations.current_authority!.grants[0].targets=[];expect(input.relations[0].relations.current_authority!.grants[0].targets.length).toBeGreaterThan(0);
  });
  it.each(["grant","environment","target","root"])("duplicate %s proof cannot ambiguously qualify",kind=>{
    const s=source();if(kind==="grant")s.grants.push(structuredClone(s.grants[0]));
    if(kind==="environment")s.resources.push(structuredClone(s.resources[0]));
    if(kind==="target")s.grants[0].targets.push(structuredClone(s.grants[0].targets[0]));
    if(kind==="root")s.resources[0].roots.push(structuredClone(s.resources[0].roots[0]));
    expect(currentAccessRelations.safeParse(s).success).toBe(false);expect(decide(context(undefined,s)).allowed).toBe(false);
  });
  it("protocol byte limit fails closed without truncating or narrowing the declared scope",()=>{
    const s=source();for(let i=0;i<63;i++){const copy=structuredClone(s.grants[0]);copy.grant_id+=String(i);s.grants.push(copy);}
    expect(Buffer.byteLength(JSON.stringify(s))).toBeGreaterThan(32768);expect(currentAccessRelations.safeParse(s).success).toBe(false);
  });
  it("unqualified source cannot assert current targets even with a valid legacy receipt",()=>{
    const c=context(),r=relations(source());r.qualified=false;c.relationsFor=()=>r;expect(decide(c).allowed).toBe(false);
  });
  it("grant revision attachment is not native renewal; changing semantics is",()=>{
    const g=grant();expect(grantBindingDigest({...g,revision:"TEST_ONLY:attached-new-core-revision"})).toBe(grantBindingDigest(g));
    expect(grantBindingDigest({...g,valid_from_ms:NOW-1000})).not.toBe(grantBindingDigest(g));
  });
  it.each(["partial","missing"])("uncertain %s ROOT DENY never disappears behind explicit ALLOW",mode=>{
    const allow=grant(),deny=grant("TEST_ONLY:deny",{effect:"DENY",selector:{kind:"ROOT_SCOPE",root_id:R.id},requires_ts_acceptance:false,ts_receipt:null});
    const s=source([allow]);if(mode==="partial")s.resources[0].roots[0].complete=false;else s.resources[0].roots=[];
    expect(decide(context([allow,deny],s)).allowed).toBe(false);
    expect(decide(context([allow,deny],s),P,"live").allowed).toBe(false);
  });
  it("an explicit disjoint DENY retains unrelated exact positives even without ROOT census",()=>{
    const allow=grant(),deny=grant("TEST_ONLY:deny",{effect:"DENY",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[Q.id]},
      requires_ts_acceptance:false,ts_receipt:null}),s=source([allow]);s.resources[0].roots=[];
    expect(decide(context([allow,deny],s),P).allowed).toBe(true);expect(decide(context([allow,deny],s),Q).allowed).toBe(false);
  });
  it("an issuer's revoked native leg denies only the dependent descendant use",()=>{
    const parent=grant("TEST_ONLY:ceiling",{action:"access.grant",delegable_actions:["business.read_all"]});
    const child=grant("TEST_ONLY:child-grant",{subject_user_id:"TEST_ONLY:child",issued_by:parent.subject_user_id,parent_grant_id:parent.grant_id});
    const p=source([parent]),s=source([child]),c=context([parent,child],p);c.principal_id=child.subject_user_id;
    c.relationsFor=id=>relations(id===child.subject_user_id?s:p);
    expect(decide(c).allowed).toBe(true);removeLeg(p,P,"paper");
    expect(decide(c).allowed).toBe(false);expect(decide(c,Q,"paper").allowed).toBe(true);expect(decide(c,P,"live").allowed).toBe(true);
  });
  it("unknown issuer ROOT DENY applies through delegation, not just direct-grant matching",()=>{
    const parent=grant("TEST_ONLY:ceiling",{action:"access.grant",delegable_actions:["business.read_all"]});
    const child=grant("TEST_ONLY:child-grant",{subject_user_id:"TEST_ONLY:child",issued_by:parent.subject_user_id,parent_grant_id:parent.grant_id});
    const deny=grant("TEST_ONLY:issuer-deny",{action:"access.grant",effect:"DENY",selector:{kind:"ROOT_SCOPE",root_id:R.id},requires_ts_acceptance:false,ts_receipt:null});
    const p=source([parent]),s=source([child]),c=context([parent,child,deny],p);c.principal_id=child.subject_user_id;
    p.resources[0].roots=[];c.relationsFor=id=>relations(id===child.subject_user_id?s:p);
    expect(decide(c).allowed).toBe(false);
  });
  it("delegation of one remaining good leg does not require unrelated ceiling legs to stay current",()=>{
    const parent=grant("TEST_ONLY:ceiling",{action:"access.grant",delegable_actions:["business.read_all"]}),p=source([parent]);
    removeLeg(p,Q,"live");const c=context([parent],p),child=structuredClone(p);
    child.subject_user_id="TEST_ONLY:child";child.grants=[];
    c.relationsFor=id=>relations(id===child.subject_user_id?child:p);
    expect(validateDelegation(c,{subject_user_id:"TEST_ONLY:child",action:"business.read_all",effect:"ALLOW",
      selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[P.id]},environments:["paper"],valid_from_ms:NOW,
      valid_until_ms:NOW+1000,delegable_actions:[],ceiling_grant_id:parent.grant_id,expected_ceiling_revision:parent.revision,
      expected_policy_revision:parent.policy_revision,expected_ts_membership_revision:null,reason:"TEST_ONLY:scoped delegation"})).toBe(parent);
  });
  it.each(["unrelated","selected"] as const)("actual scope mint/revalidate path handles %s native delta without using a DB fixture as authority",async which=>{
    const gs=[grant()],s=source(gs),p={user:{userId:gs[0].subject_user_id,sessionVersion:1,role:"USER"},
      session:{sessionId:"TEST_ONLY:session",userId:gs[0].subject_user_id,sessionVersion:1},workspaceId:gs[0].workspace_id} as ReadScopePrincipal;
    let reads=0,changed=false;
    const binding={dataset_id:"TEST_ONLY:dataset",source_revision:"TEST_ONLY:dataset-revision",window:{from_ms:NOW-100,to_ms:NOW+100}};
    const publication={workspace_id:gs[0].workspace_id,environment:"paper",profile_id:"TEST_ONLY:profile",qualification:"TEST_ONLY",
      publication_revision:"TEST_ONLY:publication",binding,population_coverage:"COMPLETE_FOR_DATASET_WINDOW",
      provenance_ref:"TEST_ONLY:publication-not-real-source",current_linkage:null,resources:[P],tuples:[]};
    const access={readContext:async()=>{reads++;if(reads===2){removeLeg(s,which==="unrelated"?Q:P,which==="unrelated"?"live":"paper");changed=true;}
      return {...context(gs,structuredClone(s)),actor_role:"USER"};},readPublication:async()=>structuredClone(publication),
      confirmReadContext:async(_actor:unknown,_workspace:unknown,expected:AccessEvaluationContext)=>expected} as unknown as ExecutionAccessService;
    const pool={query:async()=>({rows:[{role:"USER",session_version:1,policy:{},policy_seen:true,workspace_exists:true,member:true,owner:false,retained:[]}]})} as unknown as Pool;
    const scopes=new ExecutionReadScopes(pool,access,{} as ControlApiConfig),request={action:"business.read_all" as const,resource:P,dataset:binding};
    const operation=scopes.authorize(p,{environment:"paper",profileId:"TEST_ONLY:profile"},request);
    if(which==="selected")await expect(operation).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED"});
    else {
      const scope=await operation,identity=scopeRealtimeIdentity(scope);
      removeLeg(s,Q,"sandbox");await expect(scopes.revalidate(scope)).resolves.toBeUndefined();
      const renewed=await scopes.authorize(p,{environment:"paper",profileId:"TEST_ONLY:profile"},request);
      expect(scopeRealtimeIdentity(renewed)).toBe(identity);
      removeLeg(s,P,"paper");await expect(scopes.revalidate(scope)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE"});
    }
    expect(changed).toBe(true);
  });
});

// Append to elp210-current-grant-relations.spec.ts; add shared-helper import.
// Pure TEST_ONLY vectors, not a source/native qualification receipt.
describe("current exact audit-read helper — preserves the shared policy graph",()=>{
  function legacyAudit(){
    const gs=[grant(undefined,{action:"audit.read"})],c=context(gs),r=relations(source(gs));
    delete r.current_authority;
    r.membership={receipt_id:gs[0].ts_receipt!.receipt_id,revision:gs[0].ts_receipt!.membership_revision,mapping_revision:mapping};
    c.relationsFor=()=>r;return {c,r};
  }
  it("accepts qualified legacy compatibility while keeping the accepted grant immutable",()=>{
    const {c}=legacyAudit(),before=structuredClone(c.grants);
    expect(requireCurrentTsAuditRead(c,P,"paper").allowed).toBe(true);
    expect(c.grants).toEqual(before);
  });
  it.each([false,undefined,null,"false","true",1,{}])("nonliteral qualification %j is never audit authority",invalid=>{
    const {c,r}=legacyAudit();(r as unknown as Record<string,unknown>).qualified=invalid;
    expect(()=>requireCurrentTsAuditRead(c,P,"paper"))
      .toThrowError(expect.objectContaining({code:"ACCESS_RESOURCE_NOT_FOUND",status:404}));
  });
  it.each([null,undefined,{}, {schema_version:"UNKNOWN"}])("present invalid current proof %j does not recover through matching legacy fields",invalid=>{
    const {c,r}=legacyAudit();(r as {current_authority:unknown}).current_authority=invalid;
    expect(()=>requireCurrentTsAuditRead(c,P,"paper"))
      .toThrowError(expect.objectContaining({code:"ACCESS_RESOURCE_NOT_FOUND",status:404}));
  });
  it.each([NaN,Infinity,-1,1.25,Number.MAX_SAFE_INTEGER+1])("invalid evaluation clock %j fails closed",now=>{
    const {c}=legacyAudit();c.now_ms=now;
    expect(()=>requireCurrentTsAuditRead(c,P,"paper"))
      .toThrowError(expect.objectContaining({code:"ACCESS_RESOURCE_NOT_FOUND",status:404}));
  });
  it("an app-only audit leaf cannot borrow the qualified provider's legacy membership",()=>{
    const {c}=legacyAudit();c.grants=[{...c.grants[0],requires_ts_acceptance:false,ts_receipt:null}];
    expect(()=>requireCurrentTsAuditRead(c,P,"paper"))
      .toThrowError(expect.objectContaining({code:"ACCESS_RESOURCE_NOT_FOUND",status:404}));
  });
});
