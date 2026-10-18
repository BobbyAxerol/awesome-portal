import { AccessPolicyError, type AccessResource } from "../execution-v2/access.contract";
import { accessDigest, currentBoundaryProof, currentAllowedGrantIds, evaluateAccess,
  type AccessEvaluationContext } from "../execution-v2/access-policy";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { nativeNoticeValidUntil } from "../execution-v2/read-scope";
import { OperationalReadError, type ExactReadQualification } from "../operations/current-operational-read";
import type { PositiveParentCandidate } from "./positive-parent.repository";
import { parentFieldSetDigest, type ParentFieldPurpose, type ParentReadFieldSeal } from "../execution-v2/parent-read-fields";

const REVISION = "portal.execution.parent-fields.v1";
const resources = (candidate: Pick<PositiveParentCandidate,"deploymentId"|"portfolioId">): readonly AccessResource[] => [
  { kind: "DEPLOYMENT", id: candidate.deploymentId }, { kind: "PORTFOLIO", id: candidate.portfolioId },
];
const refused = (): never => { throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404); };
export class ParentFieldPurposeError extends Error {
  constructor() { super("GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE"); }
}

/** Field selection cannot pick a different unrestricted ALLOW to rescue a
 * denied/expired/delegated seal-specific leaf. Current audit and gate DENYs
 * remain on the complete graph. No role/owner/read_all/.decide implication. */
// Shared exact selector only. Caller keeps its own existing gate/current-field
// proof and same-flight terminal fence; this object is NOT a transferable permit.
export function selectedParentSeal(context:AccessEvaluationContext,
  candidate:Pick<PositiveParentCandidate,"workspaceId"|"deploymentId"|"portfolioId">&{environment:"paper"|"sandbox"|"live"},
  purpose:ParentFieldPurpose){
  return selectedParentFieldSeal(context,candidate.environment,resources(candidate),purpose);
}
/** SAME selected-leaf algorithm. Callers supply genuine exact stored/current
 * anchors, never empty or duplicated placeholders to mint a field permit. */
export function selectedParentFieldSeal(context:AccessEvaluationContext,
  environment:"paper"|"sandbox"|"live",targets:readonly AccessResource[],purpose:ParentFieldPurpose){
  return synchronousParentSealSelector(context,environment,targets)(purpose);
}
type SelectedParentSeal = {seal:ParentReadFieldSeal;
  selected:{kind:string;id:string;grant_id:string;revision:string}[]};

/** A private synchronous calculation only. Its caller owns the whole function
 * lifetime; never retain this closure in a flight, snapshot, or across await.
 * Complete-graph checks stay unchanged. Only repeated selection of the SAME
 * exact anchor/purpose at this one evaluation time is shared. */
function synchronousParentSealSelector(context:AccessEvaluationContext,
  environment:"paper"|"sandbox"|"live",targets:readonly AccessResource[]){
  const valid=targets.length>=1&&targets.length<=2&&
    new Set(targets.map(t=>JSON.stringify([t.kind,t.id]))).size===targets.length;
  const now=Math.max(context.now_ms,Date.now()),effective={...context,now_ms:now};
  const sorted=[...effective.grants].sort((a,b)=>a.grant_id<b.grant_id?-1:a.grant_id>b.grant_id?1:0);
  const eligible=new Map<string,ReadonlySet<string>>(),selectedByPurpose=new Map<ParentFieldPurpose,SelectedParentSeal|null>();
  return (purpose:ParentFieldPurpose):SelectedParentSeal|null=>{
    if(!valid)return null;
    if(selectedByPurpose.has(purpose))return selectedByPurpose.get(purpose)??null;
    const seal=effective.policy?.parent_read_fields?.find(value=>value.purpose===purpose&&value.environment===environment&&
      value.contract_revision===REVISION&&value.field_set_sha256===parentFieldSetDigest(purpose)&&
      value.valid_from_ms<=now&&value.valid_until_ms>now);
    if(!seal){selectedByPurpose.set(purpose,null);return null;}
    const selected:SelectedParentSeal["selected"]=[];
    for(const target of targets){
      const key=JSON.stringify([target.kind,target.id]);let ids=eligible.get(key);
      if(!ids){
        // Retain genuine actual-clock session checks and the filtered audit
        // graph. A different field-policy ALLOW cannot supply this purpose.
        requireCurrentTsAuditRead(effective,target,environment);
        ids=currentAllowedGrantIds(effective,"audit.read",target,environment);eligible.set(key,ids);
      }
      const allowed=ids;
      const grant=sorted.find(value=>value.subject_user_id===effective.principal_id&&value.workspace_id===effective.workspace_id&&
        value.action==="audit.read"&&value.effect==="ALLOW"&&value.requires_ts_acceptance===true&&
        value.field_policy_ref===seal.field_policy_ref&&effective.relationsFor(value.subject_user_id).qualified&&allowed.has(value.grant_id));
      if(!grant){selectedByPurpose.set(purpose,null);return null;}
      selected.push({kind:target.kind,id:target.id,grant_id:grant.grant_id,revision:grant.revision});
    }
    const result={seal,selected};selectedByPurpose.set(purpose,result);return result;
  };
}

/** Internal authorizer: call before any protected row decode and re-run it at
 * each same-flight final fence. The result is consistency metadata, NOT a
 * reusable permit. Optional unavailable sections stay absent, not value0. */
export function qualifyPositiveParent(context: AccessEvaluationContext, candidate: PositiveParentCandidate,
  selectedOperationId?: string): ExactReadQualification {
  const effective = { ...context, now_ms: Math.max(context.now_ms, Date.now()) };
  if (effective.workspace_id !== candidate.workspaceId) return refused();
  const targets = resources(candidate), audits = targets.map(target => ({ target,
    decision: requireCurrentTsAuditRead(effective, target, "paper") }));
  let gate: ReturnType<typeof evaluateAccess> | null = null;
  if (candidate.family === "R2") {
    gate = evaluateAccess(effective, "governance.r2.read", targets[0]!, "paper");
    if (!gate.allowed) return refused();
  } else if (effective.actor_member !== true) return refused();
  const select=synchronousParentSealSelector(effective,"paper",targets);
  const rootPurpose = candidate.family === "R2" ? "R2_ROOT" : "PAPER_EXIT_ROOT";
  const root = select(rootPurpose);
  if (!root) throw new ParentFieldPurposeError();
  const operation = selectedOperationId === undefined ? null : select("DECISION_OPERATION");
  if (selectedOperationId !== undefined && !operation) throw new ParentFieldPurposeError();
  const optional = candidate.family === "R2"
    ? ["R2_LINEAGE", "DECISION_ACTORS", "DECISION_LATEST_OPERATION", "R2_DECISION_CONTEXT", "RECORDED_PORTAL_ACTIVITY", "R2_RECORDED_VERDICTS"] as const
    : ["PAPER_EXIT_REVIEW", "PAPER_EXIT_LINEAGE", "PAPER_EXIT_CRITERIA", "DECISION_ACTORS", "DECISION_LATEST_OPERATION", "RECORDED_PORTAL_ACTIVITY"] as const;
  const sections = optional.map(purpose => [purpose, select(purpose)] as const);
  // A published discovery link must also have the existing detail purpose.
  // No ID is selected when that independent selected-operation field leaf is absent.
  const latestDetail = select("DECISION_LATEST_OPERATION")?select("DECISION_OPERATION"):null;
  const activityDetail = select("RECORDED_PORTAL_ACTIVITY")?select("DECISION_OPERATION"):null;
  let until = Math.min(nativeNoticeValidUntil(effective, "paper", effective.actor_lease_until_ms!), root.seal.valid_until_ms);
  // Future optional-field qualification/expiry is also a transition. Do not
  // invent a TTL or freeze an old genuine session lease through renewal.
  for (const seal of effective.policy!.parent_read_fields ?? []) {
    if (seal.environment !== "paper") continue;
    for (const time of [seal.valid_from_ms, seal.valid_until_ms])
      if (time > effective.now_ms) until = Math.min(until, time);
  }
  return { proof: accessDigest({ domain: "portal.execution.positive-parent-qualification.v1", candidate,
    policy_revision: effective.policy!.revision, fields: { root, sections, latestDetail, activityDetail }, operation: { id: selectedOperationId ?? null, seal: operation },
    audits: audits.map(({ target, decision }) => [target, decision.policy_revision, decision.scope_revision, decision.field_policy_ref]),
    gate: gate ? [gate.policy_revision, gate.scope_revision, gate.field_policy_ref] : "CURRENT_ACTIVE_WORKSPACE_MEMBER",
    source: currentBoundaryProof(effective, "paper", targets) }), valid_until_ms: until };
}

/** Main must call only while constructing the already qualified same-flight
 * body; no I/O, no grant creation, no missing section promoted to AVAILABLE. */
export function positiveParentSections(context: AccessEvaluationContext, candidate: PositiveParentCandidate) {
  const effective={...context,now_ms:Math.max(context.now_ms,Date.now())};
  if(!Number.isSafeInteger(effective.actor_lease_until_ms)||effective.now_ms>=effective.actor_lease_until_ms!)
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED",403);
  let until=nativeNoticeValidUntil(effective,"paper",effective.actor_lease_until_ms!);
  for(const seal of effective.policy?.parent_read_fields??[]){
    if(seal.environment!=="paper")continue;
    for(const time of [seal.valid_from_ms,seal.valid_until_ms])
      if(time>effective.now_ms)until=Math.min(until,time);
  }
  // A NEW synchronous selector for this invocation, after the caller's fresh
  // authority capture; never reuse the authorizer's pre-await calculation.
  const select=synchronousParentSealSelector(effective,"paper",resources(candidate));
  const common = {
    recordedActivity: select("RECORDED_PORTAL_ACTIVITY")!==null&&select("DECISION_OPERATION")!==null,
    actors: select("DECISION_ACTORS")!==null,
    latestOperation: select("DECISION_LATEST_OPERATION")!==null&&select("DECISION_OPERATION")!==null,
  };
  const sections=candidate.family === "R2"
    ? {...common,lineage:select("R2_LINEAGE")!==null,decisionContext:select("R2_DECISION_CONTEXT")!==null,
      recordedVerdicts:select("R2_RECORDED_VERDICTS")!==null}
    : {...common,lineage:select("PAPER_EXIT_LINEAGE")!==null,evaluation:select("PAPER_EXIT_REVIEW")!==null,
      criteria:select("PAPER_EXIT_CRITERIA")!==null};
  // No optional protected SQL may start using a calculation that crossed a
  // genuine lease or graph/field transition while synchronous selection ran.
  // The same-flight LAST Core and response fences remain independently required.
  const now=Math.max(effective.now_ms,Date.now());
  if(now>=effective.actor_lease_until_ms!)throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED",403);
  if(now>=until)throw new OperationalReadError("OPERATIONAL_READ_CHANGED",409);
  return sections;
}
