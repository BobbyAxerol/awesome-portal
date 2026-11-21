/**
 * ELP2-03 pure evaluator/strict browser-contract regressions.
 * Every identity, policy approval, membership, relation and receipt below is
 * synthetic TEST_ONLY input. No DB, HTTP app, verifier, TS or runtime proof.
 */
import { describe, expect, it, vi } from "vitest";
import { AccessPolicyError, accessAction, accessAuditQuery, accessPreview, accessProposal,
  accessResource, accessRevoke, accessWorkspaceQuery, grantChange, resourceSelector,
  tsBusinessAction } from "../src/execution-v2/access.contract";
import type { AccessAction, AccessRefusal, AccessResource, GrantChange, ReviewedAccessPolicy,
  ResourceSelector, ScopedAccessGrant, TsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalChange, canonicalSelector, evaluateAccess, grantCurrent,
  currentGrantAllows, policyReady, resolvedResources, unqualifiedAccessRelations, validateDelegation } from "../src/execution-v2/access-policy";
import type { AccessEvaluationContext, AccessRelations } from "../src/execution-v2/access-policy";
import { positiveParentSections, qualifyPositiveParent } from "../src/governance/positive-parent.authority";
import { parentFieldSetDigest, type ParentFieldPurpose } from "../src/execution-v2/parent-read-fields";
import type { PositiveParentCandidate } from "../src/governance/positive-parent.repository";
import { requireCurrentTsAuditRead } from "../src/execution-v2/current-audit-read";
import * as accessPolicyModule from "../src/execution-v2/access-policy";
import { grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";

const ID = {
  owner: "TEST_ONLY:user:protected-owner", manager: "TEST_ONLY:user:manager",
  researcher: "TEST_ONLY:user:researcher", delegate: "TEST_ONLY:user:delegate",
  target: "TEST_ONLY:user:target", workspace: "TEST_ONLY:workspace:one",
  otherWorkspace: "TEST_ONLY:workspace:two", root: "TEST_ONLY:root:one",
  p1: "TEST_ONLY:portfolio:one", p2: "TEST_ONLY:portfolio:two",
  a1: "TEST_ONLY:alpha:one", a2: "TEST_ONLY:alpha:two",
} as const;
const NOW = 1_800_000_000_000;
const POLICY_REVISION = "TEST_ONLY:policy:r1";
const P1: AccessResource = { kind: "PORTFOLIO", id: ID.p1 };
const P2: AccessResource = { kind: "PORTFOLIO", id: ID.p2 };
const explicit = (ids: string[] = [ID.p1], resource_kind: AccessResource["kind"] = "PORTFOLIO"): ResourceSelector =>
  ({ kind: "EXPLICIT_RESOURCE_SET", resource_kind, ids });
const receipt = (): NonNullable<ScopedAccessGrant["ts_receipt"]> => ({
  receipt_id: "TEST_ONLY:receipt:r1", membership_revision: "TEST_ONLY:membership:r1",
  mapping_revision: "TEST_ONLY:mapping:r1", effective_at_ms: NOW - 100,
  expires_at_ms: NOW + 10_000,
});
function policy(overrides: Partial<ReviewedAccessPolicy> = {}): ReviewedAccessPolicy {
  return { workspace_id: ID.workspace, revision: POLICY_REVISION,
    artifact_digest: accessDigest({ fixture: "TEST_ONLY:reviewed-policy" }),
    approval_ref: "TEST_ONLY:NOT_AN_OWNER_APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY",
    protected_owner_user_id: ID.owner,
    researcher_fields: { state: "PENDING", policy_ref: null, fields: [] }, ...overrides };
}
function relations(overrides: Partial<AccessRelations> = {}): AccessRelations {
  return { qualified: true, revision: "TEST_ONLY:relations:r1", own_alpha_ids: [ID.a1],
    member_portfolio_ids: [ID.p1],
    roots: { [ID.root]: [P1, P2, { kind: "ALPHA", id: ID.a1 }, { kind: "ALPHA", id: ID.a2 }] },
    membership: { revision: receipt().membership_revision, receipt_id: receipt().receipt_id,
      mapping_revision: receipt().mapping_revision }, ...overrides };
}
function grant(overrides: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
  const action = overrides.action ?? "portfolio.read";
  return { grant_id: "TEST_ONLY:grant:read", subject_user_id: ID.manager, workspace_id: ID.workspace,
    action, effect: "ALLOW", selector: explicit(), environments: ["sandbox"],
    valid_from_ms: NOW - 1_000, valid_until_ms: NOW + 10_000, delegable_actions: [],
    issued_by: ID.owner, parent_grant_id: null, revision: "TEST_ONLY:grant:r1",
    policy_revision: POLICY_REVISION, revoked_at_ms: null,
    requires_ts_acceptance: tsBusinessAction(action), ts_receipt: tsBusinessAction(action) ? receipt() : null,
    field_policy_ref: null, ...overrides };
}
function ceiling(overrides: Partial<ScopedAccessGrant> = {}): ScopedAccessGrant {
  return grant({ grant_id: "TEST_ONLY:grant:ceiling", action: "access.grant",
    selector: explicit([ID.p1, ID.p2]), environments: ["paper", "sandbox"],
    delegable_actions: ["portfolio.read", "users.read"], ...overrides });
}
function context(grants: ScopedAccessGrant[] = [], overrides: Partial<AccessEvaluationContext> = {}): AccessEvaluationContext {
  return { principal_id: ID.manager, workspace_id: ID.workspace, now_ms: NOW, actor_current: true,
    policy: policy(), grants, active_principals: new Set(Object.values(ID).filter(id => id.startsWith("TEST_ONLY:user:"))),
    relationsFor: () => relations(), allow_test_only: true, ...overrides };
}
function change(overrides: Partial<GrantChange> = {}): GrantChange {
  return { subject_user_id: ID.target, action: "portfolio.read", effect: "ALLOW", selector: explicit(),
    environments: ["sandbox"], valid_from_ms: NOW, valid_until_ms: NOW + 5_000, delegable_actions: [],
    ceiling_grant_id: "TEST_ONLY:grant:ceiling", expected_ceiling_revision: "TEST_ONLY:grant:r1",
    expected_policy_revision: POLICY_REVISION, expected_ts_membership_revision: null,
    reason: "TEST_ONLY synthetic delegated-read request", ...overrides };
}
function expectRefusal(operation: () => unknown, code: AccessRefusal, status = 403) {
  let failure: unknown;
  try { operation(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(AccessPolicyError);
  expect(failure).toMatchObject({ code, status, message: "The requested access is not available." });
}
const decision = (ctx: AccessEvaluationContext, action: AccessAction = "portfolio.read", resource = P1,
  environment: "paper" | "sandbox" | "live" = "sandbox") => evaluateAccess(ctx, action, resource, environment);

describe("parent field selection — per-invocation synchronous compatibility only / TEST_ONLY",()=>{
  it.each(["actor-expiry","future-deny","native-expiry","optional-field-expiry","optional-field-start"] as const)(
    "crossing %s DURING field selection refuses before protected SQL admission",kind=>{
      const deadline=NOW+100;let wall=NOW;
      const clock=vi.spyOn(Date,"now").mockImplementation(()=>wall);
      let restoreEligible:(()=>void)|undefined;
      try{
        const deployment:AccessResource={kind:"DEPLOYMENT",id:"TEST_ONLY:deployment"},targets=[deployment,P1];
        const purposes:ParentFieldPurpose[]=["R2_ROOT","RECORDED_PORTAL_ACTIVITY","DECISION_OPERATION","DECISION_ACTORS","R2_LINEAGE"];
        const fields=purposes.map(purpose=>({purpose,environment:"paper" as const,
          contract_revision:"portal.execution.parent-fields.v1" as const,field_policy_ref:`TEST_ONLY:${purpose}`,
          field_set_sha256:parentFieldSetDigest(purpose),
          valid_from_ms:kind==="optional-field-start"&&purpose==="R2_LINEAGE"?deadline:NOW-1,
          valid_until_ms:kind==="optional-field-expiry"&&purpose==="DECISION_ACTORS"?deadline:NOW+5000}));
        let audits=fields.flatMap(field=>targets.map(target=>grant({grant_id:`${field.field_policy_ref}:${target.kind}`,
          action:"audit.read",selector:explicit([target.id],target.kind),environments:["paper"],requires_ts_acceptance:true,
          ts_receipt:receipt(),field_policy_ref:field.field_policy_ref})));
        const gate=grant({grant_id:"TEST_ONLY:r2-app",action:"governance.r2.read",requires_ts_acceptance:false,ts_receipt:null,
          environments:["paper"],selector:explicit([deployment.id],"DEPLOYMENT")});
        const c=context([...audits,gate],{policy:policy({parent_read_fields:fields}),actor_member:true,
          authority_fingerprint:"TEST_ONLY:context",actor_lease_until_ms:kind==="actor-expiry"?deadline:NOW+20000});
        if(kind==="future-deny")c.grants=[...c.grants,grant({grant_id:"TEST_ONLY:future-deny",action:"audit.read",effect:"DENY",
          requires_ts_acceptance:false,ts_receipt:null,environments:["paper"],selector:explicit([P1.id]),valid_from_ms:deadline})];
        if(kind==="native-expiry"){
          // Exact existing versioned grammar and full accepted-fact/hash checks,
          // not a synthetic legacy expiry alias. No source installation occurs.
          const fact=(g:ScopedAccessGrant):TsMembershipAcceptance=>({source:"TEST_ONLY:PM",source_contract:"TEST_ONLY:contract",
            trust_profile:"TEST_ONLY:profile",receipt_id:g.ts_receipt!.receipt_id,proposal_id:`${g.grant_id}:proposal`,
            proposal_digest:accessDigest([g.grant_id,"TEST_ONLY:proposal"]),portal_user_id:g.subject_user_id,
            ts_user_id:"TEST_ONLY:ts-user",mapping_revision:g.ts_receipt!.mapping_revision,human_requester_user_id:g.issued_by,
            workspace_id:g.workspace_id,action:g.action,selector_digest:accessDigest(canonicalSelector(g.selector)),
            environments:[...g.environments],previous_membership_revision:null,membership_revision:g.ts_receipt!.membership_revision,
            effective_at_ms:g.ts_receipt!.effective_at_ms,expires_at_ms:g.ts_receipt!.expires_at_ms,outcome:"ACCEPTED",
            payload_digest:accessDigest([g.grant_id,"TEST_ONLY:payload"]),provenance_ref:"TEST_ONLY:NOT_REAL_ACCEPTANCE"});
          audits=audits.map(g=>({...g,ts_acceptance_digest:accessDigest(fact(g))}));c.grants=[...audits,gate];
          const source:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",subject_user_id:ID.manager,
            workspace_id:ID.workspace,ts_user_id:"TEST_ONLY:ts-user",mapping_revision:receipt().mapping_revision,
            resources:[{environment:"paper",revision:"TEST_ONLY:cut",own_alpha_ids:[],member_portfolio_ids:[],roots:[]}],
            grants:audits.map(g=>({grant_id:g.grant_id,binding_digest:grantBindingDigest(g),accepted:fact(g),
              targets:targets.filter(t=>g.selector.kind==="EXPLICIT_RESOURCE_SET"&&g.selector.resource_kind===t.kind&&g.selector.ids.includes(t.id))
                .map(resource=>({environment:"paper",resource,revision:`TEST_ONLY:${g.grant_id}:target`,
                  native_reference_digest:accessDigest([g.grant_id,resource]),valid_from_ms:NOW-1,valid_until_ms:deadline}))}))};
          c.relationsFor=id=>id===ID.manager?relations({current_authority:source}):relations();
        }
        const candidate:PositiveParentCandidate={family:"R2",workspaceId:ID.workspace,approvalId:"TEST_ONLY:r2",
          r1ApprovalId:"TEST_ONLY:r1",r2ApprovalId:"TEST_ONLY:r2",deploymentId:deployment.id,portfolioId:P1.id,environment:"PAPER"};
        // Establish both exact anchors and optional sections at the real pure
        // evaluator's T, BEFORE installing the delayed physical-clock seam.
        const initial=positiveParentSections(c,candidate);
        expect(initial.recordedActivity).toBe(true);expect(initial.actors).toBe(true);
        const original=accessPolicyModule.currentAllowedGrantIds,populated:string[]=[];
        const eligibleSpy=vi.spyOn(accessPolicyModule,"currentAllowedGrantIds").mockImplementation((...args)=>{
          const ids=original(...args); // no positive mock result or weaker graph
          expect(args[0].now_ms).toBe(NOW);expect(ids.size).toBeGreaterThan(0);
          populated.push(args[2].kind);
          if(populated.length===2){
            expect(populated).toEqual(["DEPLOYMENT","PORTFOLIO"]);
            wall=deadline; // second exact anchor is populated; only time moves
          }
          return ids;
        });
        restoreEligible=()=>eligibleSpy.mockRestore();
        const protectedDetails=vi.fn();
        // Pure ordering witness for positive-parent.service decode: selection
        // precedes protectedDetails. Not a PG read/custody/runtime receipt.
        const enterProtectedSql=()=>{const sections=positiveParentSections(c,candidate);protectedDetails(sections);};
        expect(enterProtectedSql).toThrowError(expect.objectContaining(kind==="actor-expiry"
          ?{code:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403}:{code:"OPERATIONAL_READ_CHANGED",status:409}));
        expect(populated).toEqual(["DEPLOYMENT","PORTFOLIO"]);
        expect(eligibleSpy).toHaveBeenCalledTimes(2);expect(protectedDetails).not.toHaveBeenCalled();
        expect(c.now_ms).toBe(NOW);expect(wall).toBe(deadline);
      }finally{restoreEligible?.();clock.mockRestore();}
    });
  it("matches the old single-leaf predicate, preserves future transition and refreshes between calls",()=>{
    const clock=vi.spyOn(Date,"now").mockReturnValue(NOW);
    try{
      const deployment:AccessResource={kind:"DEPLOYMENT",id:"TEST_ONLY:deployment"},targets=[deployment,P1];
      const purposes:ParentFieldPurpose[]=["R2_ROOT","R2_LINEAGE","DECISION_ACTORS","DECISION_LATEST_OPERATION",
        "DECISION_OPERATION","R2_DECISION_CONTEXT","RECORDED_PORTAL_ACTIVITY","R2_RECORDED_VERDICTS"];
      const fields=purposes.map(purpose=>({purpose,environment:"paper" as const,
        contract_revision:"portal.execution.parent-fields.v1" as const,field_policy_ref:`TEST_ONLY:${purpose}`,
        field_set_sha256:parentFieldSetDigest(purpose),valid_from_ms:purpose==="DECISION_ACTORS"?NOW+100:NOW-1,
        valid_until_ms:NOW+5000}));
      const audits=fields.flatMap(field=>targets.map(target=>grant({grant_id:`${field.field_policy_ref}:${target.kind}`,
        action:"audit.read",selector:explicit([target.id],target.kind),environments:["paper"],requires_ts_acceptance:true,
        ts_receipt:receipt(),field_policy_ref:field.field_policy_ref})));
      const gate=grant({grant_id:"TEST_ONLY:r2-app",action:"governance.r2.read",requires_ts_acceptance:false,ts_receipt:null,
        environments:["paper"],selector:explicit([deployment.id],"DEPLOYMENT")});
      const c=context([...audits,gate],{policy:policy({parent_read_fields:fields}),actor_member:true,
        authority_fingerprint:"TEST_ONLY:context",actor_lease_until_ms:NOW+20000});
      const candidate:PositiveParentCandidate={family:"R2",workspaceId:ID.workspace,approvalId:"TEST_ONLY:r2",
        r1ApprovalId:"TEST_ONLY:r1",r2ApprovalId:"TEST_ONLY:r2",deploymentId:deployment.id,portfolioId:P1.id,environment:"PAPER"};
      // Exact old predicate at a fixed actual time; not a source fixture or a
      // reusable authority object. It intentionally calls currentGrantAllows.
      const old=(purpose:ParentFieldPurpose)=>{
        const now=Math.max(c.now_ms,Date.now()),seal=c.policy?.parent_read_fields?.find(value=>value.purpose===purpose&&
          value.environment==="paper"&&value.contract_revision==="portal.execution.parent-fields.v1"&&
          value.field_set_sha256===parentFieldSetDigest(purpose)&&value.valid_from_ms<=now&&value.valid_until_ms>now);
        if(!seal)return false;
        const effective={...c,now_ms:now};
        return targets.every(target=>{
          requireCurrentTsAuditRead(effective,target,"paper");
          return [...effective.grants].sort((a,b)=>a.grant_id<b.grant_id?-1:a.grant_id>b.grant_id?1:0).some(value=>
            value.subject_user_id===effective.principal_id&&value.workspace_id===effective.workspace_id&&value.action==="audit.read"&&
            value.effect==="ALLOW"&&value.requires_ts_acceptance===true&&value.field_policy_ref===seal.field_policy_ref&&
            effective.relationsFor(value.subject_user_id).qualified&&currentGrantAllows(effective,"audit.read",target,"paper",value.grant_id));
        });
      };
      const compare=()=>expect(positiveParentSections(c,candidate)).toEqual({
        recordedActivity:old("RECORDED_PORTAL_ACTIVITY")&&old("DECISION_OPERATION"),actors:old("DECISION_ACTORS"),
        latestOperation:old("DECISION_LATEST_OPERATION")&&old("DECISION_OPERATION"),lineage:old("R2_LINEAGE"),
        decisionContext:old("R2_DECISION_CONTEXT"),recordedVerdicts:old("R2_RECORDED_VERDICTS")});
      compare();expect(positiveParentSections(c,candidate).actors).toBe(false);
      expect(qualifyPositiveParent(c,candidate).valid_until_ms).toBe(NOW+100);
      clock.mockReturnValue(NOW+100);compare();expect(positiveParentSections(c,candidate).actors).toBe(true);
      // Same object, new invocation: an absent field leg cannot borrow any of
      // the remaining accepted audit leaves or a previous selected result.
      const missing=audits.find(value=>value.field_policy_ref==="TEST_ONLY:DECISION_ACTORS"&&
        value.selector.kind==="EXPLICIT_RESOURCE_SET"&&value.selector.resource_kind==="PORTFOLIO")!;
      c.grants=c.grants.filter(value=>value.grant_id!==missing.grant_id);compare();
      expect(positiveParentSections(c,candidate).actors).toBe(false);
      c.grants=[...c.grants,grant({grant_id:"TEST_ONLY:audit-deny",action:"audit.read",effect:"DENY",
        requires_ts_acceptance:false,ts_receipt:null,environments:["paper"],selector:explicit([P1.id])})];
      expect(()=>positiveParentSections(c,candidate)).toThrowError(expect.objectContaining({code:"ACCESS_RESOURCE_NOT_FOUND",status:404}));
      clock.mockReturnValue(NOW+20000);
      expect(()=>qualifyPositiveParent(c,candidate)).toThrowError(expect.objectContaining({code:"CURRENT_ACTOR_AUTHORITY_REQUIRED",status:403}));
    }finally{clock.mockRestore();}
  });
});

describe("ELP2-03 TEST_ONLY policy and exact effective scope", () => {
  it("T03-01 denies by default, including the protected owner without an explicit grant", () => {
    for (const principal_id of [ID.owner, ID.manager, ID.researcher])
      expect(decision(context([], { principal_id }))).toMatchObject({ allowed: false, reason_code: "ACCESS_DENIED" });
  });

  it("T03-01 requires explicit TEST_ONLY opt-in; a synthetic approval is not a production policy", () => {
    expect(policyReady(context())).toBe(true);
    for (const allow_test_only of [undefined, false]) {
      const ctx = context([grant()], { allow_test_only });
      expect(policyReady(ctx)).toBe(false);
      expect(decision(ctx)).toMatchObject({ allowed: false, reason_code: "POLICY_PENDING" });
    }
  });

  it("T03-01 pending, unqualified, absent and wrong-workspace policies fail closed", () => {
    for (const current of [null, policy({ state: "PENDING" }), policy({ qualification: "UNQUALIFIED" }),
      policy({ workspace_id: ID.otherWorkspace })])
      expect(decision(context([grant()], { policy: current }))).toMatchObject({ allowed: false, reason_code: "POLICY_PENDING" });
  });

  it("T03-01 current session authority and active principal are required before grant matching", () => {
    const stale = context([grant()], { actor_current: false });
    const inactive = context([grant()], { active_principals: new Set([ID.owner]) });
    for (const ctx of [stale, inactive])
      expect(decision(ctx)).toMatchObject({ allowed: false, reason_code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
  });

  it("T03-01 synthetic owner, manager and researcher get only their stable-ID grants", () => {
    const grants = [grant({ grant_id: "TEST_ONLY:owner:read", subject_user_id: ID.owner,
      action: "business.read_all", selector: { kind: "ROOT_SCOPE", root_id: ID.root }, environments: ["live"] }),
    grant({ grant_id: "TEST_ONLY:manager:read", action: "business.read_all",
      selector: { kind: "ROOT_SCOPE", root_id: ID.root }, environments: ["live"] }),
    grant({ grant_id: "TEST_ONLY:researcher:own", subject_user_id: ID.researcher,
      action: "alpha.read", selector: { kind: "OWN_ALPHA" } }),
    grant({ grant_id: "TEST_ONLY:researcher:linked", subject_user_id: ID.researcher,
      action: "portfolio.discover_linked", selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1, ID.p2] } })];
    for (const principal_id of [ID.owner, ID.manager])
      expect(decision(context(grants, { principal_id }), "business.read_all", P2, "live").allowed).toBe(true);
    const researcher = context(grants, { principal_id: ID.researcher });
    expect(decision(researcher, "alpha.read", { kind: "ALPHA", id: ID.a1 }).allowed).toBe(true);
    expect(decision(researcher, "alpha.read", { kind: "ALPHA", id: ID.a2 }).allowed).toBe(false);
    expect(decision(researcher, "portfolio.discover_linked").allowed).toBe(true);
    expect(decision(researcher, "portfolio.discover_linked", P2).allowed).toBe(false);
    expect(decision(researcher, "portfolio.read").allowed).toBe(false);
  });

  it("T03-02 matches exact resource kind and ID, never an ID prefix or same-ID other kind", () => {
    const ctx = context([grant()]);
    expect(decision(ctx).allowed).toBe(true);
    for (const resource of [P2, { kind: "PORTFOLIO" as const, id: `${ID.p1}:child` },
      { kind: "ACCOUNT" as const, id: ID.p1 }]) expect(decision(ctx, "portfolio.read", resource).allowed).toBe(false);
  });

  it("T03-02 a grant from another workspace cannot authorize the current workspace", () => {
    expect(decision(context([grant({ workspace_id: ID.otherWorkspace })])).allowed).toBe(false);
  });

  it("T03-02 environment and action are exact, with no read-to-write or cross-mode implication", () => {
    const ctx = context([grant()]);
    expect(decision(ctx).allowed).toBe(true);
    for (const environment of ["paper", "live"] as const)
      expect(decision(ctx, "portfolio.read", P1, environment).allowed).toBe(false);
    for (const action of ["portfolio.manage", "membership.propose", "capital.fund"] as const)
      expect(decision(ctx, action).allowed).toBe(false);
  });

  it("T03-02 grant intervals include valid_from and exclude valid_until", () => {
    const current = grant({ valid_from_ms: NOW, valid_until_ms: NOW + 1 });
    expect(decision(context([current])).allowed).toBe(true);
    expect(decision(context([current], { now_ms: NOW - 1 })).allowed).toBe(false);
    expect(decision(context([current], { now_ms: NOW + 1 })).allowed).toBe(false);
    const appOnly = grant({ action: "users.read", valid_until_ms: null });
    expect(decision(context([appOnly], { now_ms: NOW + 1_000_000 }), "users.read").allowed).toBe(true);
  });

  it("T03-02 a root grant must originate from the protected owner and current policy revision", () => {
    for (const invalid of [grant({ issued_by: ID.delegate }), grant({ policy_revision: "TEST_ONLY:policy:old" })])
      expect(decision(context([invalid])).allowed).toBe(false);
  });

  it("T03-02 current DENY wins over ALLOW regardless of row order", () => {
    const allow = grant();
    const deny = grant({ grant_id: "TEST_ONLY:grant:deny", effect: "DENY" });
    for (const grants of [[allow, deny], [deny, allow]])
      expect(decision(context(grants))).toMatchObject({ allowed: false, reason_code: "ACCESS_DENIED", field_policy_ref: null });
  });

  it("T03-02 expired, revoked, other-resource and other-environment DENY rows do not widen denial scope", () => {
    for (const overrides of [{ valid_until_ms: NOW }, { revoked_at_ms: NOW - 1 },
      { selector: explicit([ID.p2]) }, { environments: ["live"] as ["live"] }]) {
      const deny = grant({ grant_id: "TEST_ONLY:grant:deny", effect: "DENY", ...overrides });
      expect(decision(context([grant(), deny])).allowed).toBe(true);
    }
  });

  it("T03-09 all-business read is independent of bounded mutation and technical/export/stream rights", () => {
    const ctx = context([grant({ action: "business.read_all", selector: explicit([ID.p1, ID.p2]), environments: ["live"] }),
      grant({ grant_id: "TEST_ONLY:grant:fund", action: "capital.fund" })]);
    expect(decision(ctx, "business.read_all", P2, "live").allowed).toBe(true);
    expect(decision(ctx, "capital.fund").allowed).toBe(true);
    expect(decision(ctx, "capital.fund", P2, "live").allowed).toBe(false);
    for (const action of ["users.manage_status", "access.grant", "report.export", "stream.subscribe",
      "maintenance.read", "maintenance.execute", "development.read", "development.execute"] as const)
      expect(decision(ctx, action, P2, "live").allowed).toBe(false);
  });

  it("T03-09 owner recovery remains disabled even with an explicit synthetic grant", () => {
    expect(decision(context([grant({ action: "owner.recovery" })]), "owner.recovery"))
      .toMatchObject({ allowed: false, reason_code: "OWNER_RECOVERY_NOT_APPROVED" });
  });
});

describe("ELP2-03 TEST_ONLY trusted finite resource relations", () => {
  it("T03-02 explicit resource sets resolve without inventing dynamic relation proof", () => {
    expect(resolvedResources(explicit([ID.p2, ID.p1]), unqualifiedAccessRelations())).toEqual([P2, P1]);
    expect(unqualifiedAccessRelations()).toEqual({ qualified: false, revision: "UNQUALIFIED",
      own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership: null });
  });

  it("T03-11 every dynamic selector refuses unqualified source relations", () => {
    for (const selector of [{ kind: "OWN_ALPHA" }, { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1] },
      { kind: "ROOT_SCOPE", root_id: ID.root }] as ResourceSelector[])
      expectRefusal(() => resolvedResources(selector, unqualifiedAccessRelations()), "SOURCE_RELATION_NOT_QUALIFIED");
  });

  it("T03-11 membership selection intersects requested IDs with current membership, not historical IDs", () => {
    const selector: ResourceSelector = { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1, ID.p2] };
    expect(resolvedResources(selector, relations())).toEqual([P1]);
    expect(resolvedResources(selector, relations({ member_portfolio_ids: [ID.p2] }))).toEqual([P2]);
    expect(resolvedResources(selector, relations({ member_portfolio_ids: [] }))).toEqual([]);
  });

  it("T03-11 roots expand only the named finite trusted relation; unknown roots fail closed", () => {
    const selector: ResourceSelector = { kind: "ROOT_SCOPE", root_id: ID.root };
    expect(resolvedResources(selector, relations({ roots: { [ID.root]: [P1] } })))
      .toEqual([{ kind: "ROOT", id: ID.root }, P1]);
    expectRefusal(() => resolvedResources({ kind: "ROOT_SCOPE", root_id: `${ID.root}:prefix` }, relations()),
      "SOURCE_RELATION_NOT_QUALIFIED");
  });

  it("T03-11 ownership alone grants no permission and current ownership changes immediately affect OWN_ALPHA", () => {
    const own = grant({ action: "alpha.read", selector: { kind: "OWN_ALPHA" } });
    const resource: AccessResource = { kind: "ALPHA", id: ID.a1 };
    expect(decision(context(), "alpha.read", resource).allowed).toBe(false);
    expect(decision(context([own]), "alpha.read", resource).allowed).toBe(true);
    expect(decision(context([own], { relationsFor: () => relations({ own_alpha_ids: [ID.a2] }) }), "alpha.read", resource).allowed).toBe(false);
  });
});

describe("ELP2-03 TEST_ONLY one complete delegation ceiling", () => {
  it("T03-02 accepts a strict resource/environment/interval/action subset of the named ceiling", () => {
    const parent = ceiling();
    expect(validateDelegation(context([parent]), change())).toBe(parent);
  });

  it("T03-02 rejects a resource ID or kind outside the named ceiling", () => {
    for (const selector of [explicit([`${ID.p1}:outside`]), explicit([ID.p1], "ACCOUNT")])
      expectRefusal(() => validateDelegation(context([ceiling()]), change({ selector })), "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-02 rejects widened environment, action, interval and a ceiling from another workspace", () => {
    for (const request of [change({ environments: ["live"] }), change({ action: "portfolio.manage" }),
      change({ valid_from_ms: NOW - 1_001 }), change({ valid_until_ms: NOW + 10_001 }),
      change({ valid_until_ms: null })])
      expectRefusal(() => validateDelegation(context([ceiling()]), request), "DELEGATION_CEILING_EXCEEDED");
    expectRefusal(() => validateDelegation(context([ceiling({ workspace_id: ID.otherWorkspace })]), change()),
      "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-06 stale expected policy and ceiling revisions have distinct 409 refusals", () => {
    const ctx = context([ceiling()]);
    expectRefusal(() => validateDelegation(ctx, change({ expected_policy_revision: "TEST_ONLY:policy:stale" })),
      "POLICY_REVISION_CONFLICT", 409);
    expectRefusal(() => validateDelegation(ctx, change({ expected_ceiling_revision: "TEST_ONLY:grant:stale" })),
      "GRANT_REVISION_CONFLICT", 409);
  });

  it("T03-03 forbids both ALLOW and DENY self privilege changes", () => {
    for (const effect of ["ALLOW", "DENY"] as const)
      expectRefusal(() => validateDelegation(context([ceiling()]), change({ subject_user_id: ID.manager, effect })),
        "SELF_PRIVILEGE_CHANGE_DENIED");
  });

  it("T03-03 forbids changes to the protected owner and unapproved owner recovery", () => {
    expectRefusal(() => validateDelegation(context([ceiling()]), change({ subject_user_id: ID.owner })),
      "PROTECTED_OWNER_CHANGE_DENIED");
    expectRefusal(() => validateDelegation(context([ceiling()]), change({ action: "owner.recovery" })),
      "OWNER_RECOVERY_NOT_APPROVED");
  });

  it("T03-03 rechecks current actor authority and policy before accepting a delegation", () => {
    expectRefusal(() => validateDelegation(context([ceiling()], { actor_current: false }), change()),
      "CURRENT_ACTOR_AUTHORITY_REQUIRED");
    expectRefusal(() => validateDelegation(context([ceiling()], { policy: policy({ state: "PENDING" }) }), change()),
      "POLICY_PENDING");
  });

  it("T03-04 access.grant alone cannot grant access.grant without explicit onward action", () => {
    expectRefusal(() => validateDelegation(context([ceiling()]), change({ action: "access.grant" })),
      "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-04 an explicitly delegable access.grant may carry only a subset of the same ceiling", () => {
    const parent = ceiling({ delegable_actions: ["access.grant", "portfolio.read", "users.read"] });
    const ctx = context([parent]);
    expect(validateDelegation(ctx, change({ action: "access.grant", delegable_actions: ["portfolio.read"] }))).toBe(parent);
    expectRefusal(() => validateDelegation(ctx, change({ action: "access.grant", delegable_actions: ["capital.fund"] })),
      "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-03 detects indirect delegation back to the original issuer across multiple levels", () => {
    const top = ceiling({ subject_user_id: ID.manager, delegable_actions: ["access.grant", "portfolio.read"] });
    const middle = ceiling({ grant_id: "TEST_ONLY:grant:middle", subject_user_id: ID.delegate,
      issued_by: ID.manager, parent_grant_id: top.grant_id, delegable_actions: ["access.grant", "portfolio.read"] });
    const last = ceiling({ grant_id: "TEST_ONLY:grant:last", subject_user_id: ID.researcher,
      issued_by: ID.delegate, parent_grant_id: middle.grant_id, delegable_actions: ["portfolio.read"] });
    const ctx = context([top, middle, last], { principal_id: ID.researcher });
    expectRefusal(() => validateDelegation(ctx, change({ subject_user_id: ID.manager, ceiling_grant_id: last.grant_id })),
      "SELF_PRIVILEGE_CHANGE_DENIED");
    expectRefusal(() => validateDelegation(ctx, change({ subject_user_id: ID.delegate, ceiling_grant_id: last.grant_id })),
      "SELF_PRIVILEGE_CHANGE_DENIED");
  });

  it("T03-04 never unions an action from one ceiling with wider resources or environments from another", () => {
    const narrow = ceiling({ selector: explicit(), environments: ["sandbox"], delegable_actions: ["portfolio.read"] });
    const broad = ceiling({ grant_id: "TEST_ONLY:grant:broad", selector: explicit([ID.p1, ID.p2]),
      environments: ["sandbox", "live"], delegable_actions: ["users.read"] });
    const ctx = context([narrow, broad]);
    for (const request of [change({ selector: explicit([ID.p2]) }), change({ environments: ["live"] }),
      change({ ceiling_grant_id: broad.grant_id })])
      expectRefusal(() => validateDelegation(ctx, request), "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-04 an explicit current access.grant DENY cannot be bypassed by selecting an ALLOW ceiling", () => {
    const deny = ceiling({ grant_id: "TEST_ONLY:grant:deny", effect: "DENY", selector: explicit() });
    expectRefusal(() => validateDelegation(context([ceiling(), deny]), change()), "DELEGATION_CEILING_EXCEEDED");
  });

  it("T03-02 an empty dynamic selector cannot reserve future unbounded delegation", () => {
    const ctx = context([ceiling()], { relationsFor: () => relations({ member_portfolio_ids: [] }) });
    expectRefusal(() => validateDelegation(ctx, change({ selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1] } })),
      "DELEGATION_CEILING_EXCEEDED");
  });
});

describe("ELP2-03 TEST_ONLY current ancestor and TS acceptance checks", () => {
  function lineage(parentOverrides: Partial<ScopedAccessGrant> = {}, childOverrides: Partial<ScopedAccessGrant> = {}) {
    const parent = ceiling(parentOverrides);
    const child = grant({ grant_id: "TEST_ONLY:grant:delegated", subject_user_id: ID.researcher,
      issued_by: ID.manager, parent_grant_id: parent.grant_id, ...childOverrides });
    return { parent, child, ctx: context([parent, child], { principal_id: ID.researcher }) };
  }

  it("T03-07 re-evaluates ancestor revocation on every use without rewriting the child row", () => {
    const { parent, child, ctx } = lineage();
    const originalChild = structuredClone(child);
    expect(decision(ctx).allowed).toBe(true);
    expect(decision({ ...ctx, grants: [{ ...parent, revoked_at_ms: NOW }, child] }).allowed).toBe(false);
    expect(child).toEqual(originalChild);
  });

  it("T03-07 ancestor expiration and not-yet-valid intervals invalidate otherwise-current descendants", () => {
    for (const overrides of [{ valid_until_ms: NOW }, { valid_from_ms: NOW + 1 }])
      expect(decision(lineage(overrides).ctx).allowed).toBe(false);
  });

  it("T03-07 inactive issuer, subject or protected-root issuer invalidates a delegated chain", () => {
    const { ctx } = lineage();
    for (const inactive of [ID.manager, ID.researcher, ID.owner]) {
      const active_principals = new Set(ctx.active_principals);
      active_principals.delete(inactive);
      expect(decision({ ...ctx, active_principals }).allowed).toBe(false);
    }
  });

  it("T03-06 a stale policy revision at any ancestor invalidates the current child", () => {
    expect(decision(lineage({ policy_revision: "TEST_ONLY:policy:old" }).ctx).allowed).toBe(false);
    expect(decision(lineage({}, { policy_revision: "TEST_ONLY:policy:old" }).ctx).allowed).toBe(false);
  });

  it("T03-04 every parent link must preserve issuer, action, effect, onward rights and exact scope", () => {
    for (const overrides of [{ action: "users.read" as const }, { effect: "DENY" as const },
      { delegable_actions: ["users.read"] as AccessAction[] }, { selector: explicit([ID.p2]) },
      { environments: ["paper"] as ["paper"] }, { subject_user_id: ID.delegate },
      { valid_from_ms: NOW }, { valid_until_ms: NOW + 100 }])
      expect(decision(lineage(overrides).ctx).allowed).toBe(false);
    expect(decision(lineage({}, { parent_grant_id: "TEST_ONLY:missing:parent" }).ctx).allowed).toBe(false);
    expect(decision(lineage({}, { delegable_actions: ["capital.fund"] }).ctx).allowed).toBe(false);
  });

  it("T03-04 cyclic parent links fail closed rather than recurse indefinitely", () => {
    const a = ceiling({ grant_id: "TEST_ONLY:cycle:a", subject_user_id: ID.manager,
      issued_by: ID.delegate, parent_grant_id: "TEST_ONLY:cycle:b", delegable_actions: ["access.grant", "portfolio.read"] });
    const b = ceiling({ grant_id: "TEST_ONLY:cycle:b", subject_user_id: ID.delegate,
      issued_by: ID.manager, parent_grant_id: a.grant_id, delegable_actions: ["access.grant", "portfolio.read"] });
    expect(grantCurrent(a, context([a, b]))).toBe(false);
  });

  it("T03-04 chains at the 16-node evaluation bound work; longer chains fail closed", () => {
    function chain(parentCount: number) {
      const grants: ScopedAccessGrant[] = [];
      const active_principals = new Set<string>([ID.owner, ID.target]);
      for (let index = 0; index < parentCount; index++) {
        const subject_user_id = `TEST_ONLY:depth:user:${index}`;
        active_principals.add(subject_user_id);
        grants.push(ceiling({ grant_id: `TEST_ONLY:depth:grant:${index}`, subject_user_id,
          issued_by: index === 0 ? ID.owner : grants[index - 1].subject_user_id,
          parent_grant_id: index === 0 ? null : grants[index - 1].grant_id,
          delegable_actions: ["access.grant", "portfolio.read"] }));
      }
      grants.push(grant({ subject_user_id: ID.target, issued_by: grants[parentCount - 1].subject_user_id,
        parent_grant_id: grants[parentCount - 1].grant_id }));
      return context(grants, { principal_id: ID.target, active_principals });
    }
    expect(decision(chain(15)).allowed).toBe(true);
    expect(decision(chain(16)).allowed).toBe(false);
  });

  it("T03-07 an issuer's current delegation DENY also withdraws existing descendant authority", () => {
    const { parent, child, ctx } = lineage({}, { selector: explicit([ID.p1, ID.p2]), environments: ["paper", "sandbox"] });
    const deny = ceiling({ grant_id: "TEST_ONLY:grant:issuer-deny", effect: "DENY", selector: explicit(), environments: ["sandbox"] });
    const denied = { ...ctx, grants: [parent, child, deny] };
    expect(decision(denied, "portfolio.read", P1, "sandbox").allowed).toBe(false);
    expect(decision(denied, "portfolio.read", P1, "paper").allowed).toBe(true);
    expect(decision(denied, "portfolio.read", P2, "sandbox").allowed).toBe(true);
  });

  it("T03-05 app-only rights need no TS receipt while a business grant awaiting acceptance is ineffective", () => {
    const app = grant({ action: "users.read" });
    expect(decision(context([app]), "users.read").allowed).toBe(true);
    const pending = grant({ requires_ts_acceptance: true, ts_receipt: null });
    expect(decision(context([pending])).allowed).toBe(false);
    expect(grantCurrent(pending, context([pending]))).toBe(false);
  });

  it("T03-05 an owner-reviewed root cannot disable independent TS authority with a stored boolean",()=>{
    const bypass=grant({action:"capital.fund",requires_ts_acceptance:false,ts_receipt:null});
    const ctx=context([bypass],{relationsFor:()=>relations({membership:null})});
    expect(grantCurrent(bypass,ctx)).toBe(false);
    expect(decision(ctx,"capital.fund").allowed).toBe(false);
  });

  it("T03-08 a synthetic accepted receipt must match the current receipt, membership and identity mapping", () => {
    const accepted = grant();
    expect(decision(context([accepted])).allowed).toBe(true);
    for (const patch of [{ receipt_id: "TEST_ONLY:receipt:other" }, { revision: "TEST_ONLY:membership:new" },
      { mapping_revision: "TEST_ONLY:mapping:new" }]) {
      const current = { ...relations().membership!, ...patch };
      expect(decision(context([accepted], { relationsFor: () => relations({ membership: current }) })).allowed).toBe(false);
    }
    expect(decision(context([accepted], { relationsFor: () => relations({ membership: null }) })).allowed).toBe(false);
  });

  it("T03-08 accepted receipt intervals include effective_at and exclude expiry", () => {
    expect(decision(context([grant({ ts_receipt: { ...receipt(), effective_at_ms: NOW } })])).allowed).toBe(true);
    for (const ts_receipt of [{ ...receipt(), effective_at_ms: NOW + 1 }, { ...receipt(), expires_at_ms: NOW }])
      expect(decision(context([grant({ ts_receipt })])).allowed).toBe(false);
    expect(decision(context([grant({ ts_receipt: { ...receipt(), expires_at_ms: null } })])).allowed).toBe(true);
  });

  it("T03-05 pending new rights do not replace or expand the last accepted effective grant", () => {
    const accepted = grant();
    const pending = grant({ grant_id: "TEST_ONLY:grant:pending", selector: explicit([ID.p2]), ts_receipt: null });
    const ctx = context([accepted, pending]);
    expect(decision(ctx).allowed).toBe(true);
    expect(decision(ctx, "portfolio.read", P2).allowed).toBe(false);
  });

  it("T03-07 Portal revocation immediately withdraws access despite a still-current synthetic TS receipt", () => {
    const revoked = grant({ revoked_at_ms: NOW });
    expect(decision(context([revoked])).allowed).toBe(false);
    expect(relations().membership?.revision).toBe(revoked.ts_receipt?.membership_revision);
  });
});

describe("ELP2-03 TEST_ONLY researcher disclosure and decision binding", () => {
  it("T03-11 linked restricted read remains pending until an approved field matrix is present", () => {
    const restricted = grant({ action: "portfolio.read_restricted", field_policy_ref: "TEST_ONLY:unapproved-fields" });
    expect(decision(context([restricted]), "portfolio.read_restricted"))
      .toMatchObject({ allowed: false, reason_code: "RESEARCHER_FIELD_POLICY_PENDING", field_policy_ref: null });
  });

  it("T03-11 a synthetic qualified field slice does not imply full portfolio, export or stream rights", () => {
    const field_policy_ref = "TEST_ONLY:approved-fields:v1";
    const restricted = grant({ action: "portfolio.read_restricted", field_policy_ref });
    const ctx = context([restricted], { policy: policy({ researcher_fields: {
      state: "QUALIFIED", policy_ref: field_policy_ref, fields: ["TEST_ONLY:own_alpha_status"] } }) });
    expect(decision(ctx, "portfolio.read_restricted")).toMatchObject({ allowed: true, field_policy_ref });
    for (const action of ["portfolio.read", "business.read_all", "report.export", "stream.subscribe"] as const)
      expect(decision(ctx, action).allowed).toBe(false);
  });

  it("T03-11 unqualified ownership relations fail closed with a redacted decision", () => {
    const own = grant({ action: "alpha.read", selector: { kind: "OWN_ALPHA" } });
    const ctx = context([own], { relationsFor: () => unqualifiedAccessRelations() });
    expect(decision(ctx, "alpha.read", { kind: "ALPHA", id: ID.a1 }))
      .toMatchObject({ allowed: false, reason_code: "ACCESS_DENIED", field_policy_ref: null });
  });

  it("T03-06 decision IDs bind principal/workspace/action/resource/environment; scope revisions bind ancestors", () => {
    const parent = ceiling();
    const child = grant({ issued_by: ID.manager, subject_user_id: ID.researcher, parent_grant_id: parent.grant_id });
    const ctx = context([parent, child], { principal_id: ID.researcher });
    const first = decision(ctx);
    expect(first.decision_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.scope_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(decision(ctx)).toEqual(first);
    expect(decision({ ...ctx, principal_id: ID.manager }).decision_id).not.toBe(first.decision_id);
    expect(decision({ ...ctx, workspace_id: ID.otherWorkspace }).decision_id).not.toBe(first.decision_id);
    expect(decision(ctx, "users.read").decision_id).not.toBe(first.decision_id);
    expect(decision(ctx, "portfolio.read", P2).decision_id).not.toBe(first.decision_id);
    expect(decision(ctx, "portfolio.read", P1, "live").decision_id).not.toBe(first.decision_id);
    expect(decision({ ...ctx, grants: [{ ...parent, revision: "TEST_ONLY:grant:r2" }, child] }).scope_revision)
      .not.toBe(first.scope_revision);
    expect(decision({ ...ctx, relationsFor: () => relations({ revision: "TEST_ONLY:relations:r2" }) }).scope_revision)
      .not.toBe(first.scope_revision);
  });
});

describe("ELP2-03 canonical digests distinguish sets from positional arrays", () => {
  it("T03-06 recursively normalizes object keys while preserving positional array order", () => {
    expect(accessDigest({ z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }] }))
      .toBe(accessDigest({ a: [{ c: 3, d: 4 }], z: { a: 1, b: 2 } }));
    expect(accessDigest(["actor", "target"])).not.toBe(accessDigest(["target", "actor"]));
    expect(accessDigest({ value: null })).not.toBe(accessDigest({ value: 0 }));
    expect(accessDigest({ value: null })).not.toBe(accessDigest({}));
  });

  it("T03-06 canonical selectors sort only declared ID sets without mutating the request", () => {
    const selector = explicit([ID.p2, ID.p1]);
    const membership: ResourceSelector = { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p2, ID.p1] };
    expect(canonicalSelector(selector)).toEqual(explicit([ID.p1, ID.p2]));
    expect(canonicalSelector(membership)).toEqual({ kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1, ID.p2] });
    expect(selector).toEqual(explicit([ID.p2, ID.p1]));
    expect(membership.portfolio_ids).toEqual([ID.p2, ID.p1]);
    expect(canonicalSelector({ kind: "OWN_ALPHA" })).toEqual({ kind: "OWN_ALPHA" });
  });

  it("T03-06 canonical changes normalize resource/environment/onward sets but bind real payload changes", () => {
    const original = change({ action: "access.grant", selector: explicit([ID.p2, ID.p1]),
      environments: ["sandbox", "paper"], delegable_actions: ["users.read", "portfolio.read"] });
    const reordered = change({ action: "access.grant", selector: explicit([ID.p1, ID.p2]),
      environments: ["paper", "sandbox"], delegable_actions: ["portfolio.read", "users.read"] });
    const originalCopy = structuredClone(original);
    const digest = accessDigest(canonicalChange(original));
    expect(accessDigest(canonicalChange(reordered))).toBe(digest);
    expect(original).toEqual(originalCopy);
    for (const different of [{ subject_user_id: ID.delegate }, { effect: "DENY" as const },
      { expected_policy_revision: "TEST_ONLY:policy:r2" }, { valid_until_ms: NOW + 4_999 },
      { selector: explicit([ID.p1]) }, { expected_ts_membership_revision: "TEST_ONLY:membership:r2" }])
      expect(accessDigest(canonicalChange({ ...original, ...different }))).not.toBe(digest);
  });
});

describe("ELP2-03 strict browser schemas reject structural authority spoofing", () => {
  it("T03-11 accepts only the documented preview/proposal/revoke/workspace shapes", () => {
    const changeBody = change();
    expect(grantChange.parse(changeBody)).toEqual(changeBody);
    expect(accessPreview.parse({ workspace_id: ID.workspace, change: changeBody }))
      .toEqual({ workspace_id: ID.workspace, change: changeBody });
    expect(accessProposal.parse({ workspace_id: ID.workspace, change: changeBody,
      preview_digest: accessDigest(canonicalChange(changeBody)) }).change).toEqual(changeBody);
    expect(accessWorkspaceQuery.parse({ workspace_id: ID.workspace })).toEqual({ workspace_id: ID.workspace });
    expect(accessRevoke.safeParse({ workspace_id: ID.workspace, expected_policy_revision: POLICY_REVISION,
      expected_grant_revision: "TEST_ONLY:grant:r1", reason: "TEST_ONLY revoke" }).success).toBe(true);
  });

  it("T03-03 rejects actor/role/session/owner/approval/verifier fields at the preview envelope", () => {
    const body = { workspace_id: ID.workspace, change: change() };
    for (const field of ["actor", "principal_id", "user_id", "role", "session_id", "session_generation",
      "protected_owner_user_id", "policy", "qualification", "approval_ref", "allow_test_only", "verifier", "sql", "url"])
      expect(accessPreview.safeParse({ ...body, [field]: "TEST_ONLY:SPOOF" }).success).toBe(false);
  });

  it("T03-03 rejects trusted grant facts, lineage, identity and policy state inside a browser change", () => {
    for (const field of ["grant_id", "workspace_id", "issued_by", "parent_grant_id", "revision", "policy_revision",
      "revoked_at_ms", "requires_ts_acceptance", "ts_receipt", "field_policy_ref", "owner_user_id", "preset",
      "membership", "active_principals", "researcher_fields"])
      expect(grantChange.safeParse({ ...change(), [field]: "TEST_ONLY:SPOOF" }).success).toBe(false);
  });

  it("T03-11 rejects browser ownership/membership facts, SQL, prefixes and wildcard selector shapes", () => {
    for (const selector of [{ kind: "OWN_ALPHA", owner_user_id: ID.researcher },
      { kind: "OWN_ALPHA", own_alpha_ids: [ID.a1] },
      { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1], member: true },
      { ...explicit(), sql: "TEST_ONLY:SELECT" }, { ...explicit(), prefix: ID.p1 },
      { kind: "ALL" }, { kind: "*" }, { kind: "ROOT_SCOPE", root_id: ID.root, resources: [P1] }])
      expect(resourceSelector.safeParse(selector).success).toBe(false);
    expect(accessResource.safeParse({ ...P1, owner_user_id: ID.researcher }).success).toBe(false);
  });

  it("T03-08 public proposals cannot assert TS acceptance, a producer receipt or a verifier", () => {
    const body = { workspace_id: ID.workspace, change: change(), preview_digest: accessDigest("TEST_ONLY:preview") };
    for (const field of ["ts_state", "outcome", "ts_receipt", "receipt", "membership_revision", "mapping_revision",
      "source", "trust_profile", "provenance_ref", "verifier", "allow_test_only"])
      expect(accessProposal.safeParse({ ...body, [field]: "TEST_ONLY:ACCEPTED" }).success).toBe(false);
    for (const preview_digest of ["sha256:abc", `sha256:${"A".repeat(64)}`, "TEST_ONLY:unhashed"])
      expect(accessProposal.safeParse({ ...body, preview_digest }).success).toBe(false);
  });

  it("T03-02 schema set fields reject duplicates, empties, invalid values and oversized resource lists", () => {
    for (const selector of [explicit([]), explicit([ID.p1, ID.p1]), explicit(Array.from({ length: 201 }, (_, i) => `TEST_ONLY:${i}`)),
      { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [ID.p1, ID.p1] }])
      expect(resourceSelector.safeParse(selector).success).toBe(false);
    for (const overrides of [{ environments: [] }, { environments: ["sandbox", "sandbox"] },
      { environments: ["CANARY"] }, { delegable_actions: ["portfolio.read", "portfolio.read"] }])
      expect(grantChange.safeParse({ ...change({ action: "access.grant" }), ...overrides }).success).toBe(false);
  });

  it("T03-04 only access.grant may carry onward delegation and no wildcard/technical-secret action is accepted", () => {
    expect(grantChange.safeParse(change({ delegable_actions: ["portfolio.read"] })).success).toBe(false);
    expect(grantChange.safeParse(change({ action: "access.grant", delegable_actions: ["portfolio.read"] })).success).toBe(true);
    for (const action of ["*", "capital.*", "maintenance.*", "secrets.read", "ADMIN", "portfolio.read_full"])
      expect(accessAction.safeParse(action).success).toBe(false);
  });

  it("T03-02 intervals require exact safe UTC milliseconds and a strictly later optional end", () => {
    for (const overrides of [{ valid_from_ms: -1 }, { valid_from_ms: 0.5 }, { valid_from_ms: Number.MAX_SAFE_INTEGER + 1 },
      { valid_from_ms: String(NOW) }, { valid_until_ms: NOW }, { valid_until_ms: NOW - 1 }])
      expect(grantChange.safeParse({ ...change(), ...overrides }).success).toBe(false);
    expect(grantChange.safeParse(change({ valid_until_ms: null })).success).toBe(true);
  });

  it("T03-11 text fields reject control characters and oversized IDs without accepting extra scope keys", () => {
    for (const id of ["", "TEST_ONLY:\u0000", "TEST_ONLY:\n", "x".repeat(257)])
      expect(accessResource.safeParse({ kind: "PORTFOLIO", id }).success).toBe(false);
    expect(accessWorkspaceQuery.safeParse({ workspace_id: ID.workspace, actor: ID.owner }).success).toBe(false);
    expect(accessRevoke.safeParse({ workspace_id: ID.workspace, expected_policy_revision: POLICY_REVISION,
      expected_grant_revision: "TEST_ONLY:grant:r1", reason: "TEST_ONLY", ts_receipt: receipt() }).success).toBe(false);
  });

  it("T03-11 audit pagination is bounded and strict; it accepts no arbitrary target/SQL or TS authority", () => {
    const query = { workspace_id: ID.workspace, subject_user_id: ID.manager };
    expect(accessAuditQuery.parse(query).limit).toBe(25);
    expect(accessAuditQuery.parse({ ...query, limit: "100", after: "TEST_ONLY:opaque-cursor" }).limit).toBe(100);
    for (const limit of [0, 101, 1.5]) expect(accessAuditQuery.safeParse({ ...query, limit }).success).toBe(false);
    for (const field of ["sql", "actor", "scope", "membership_revision"])
      expect(accessAuditQuery.safeParse({ ...query, [field]: "TEST_ONLY:SPOOF" }).success).toBe(false);
  });
});
