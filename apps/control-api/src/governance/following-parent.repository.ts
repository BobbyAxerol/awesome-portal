import { Inject, Injectable } from "@nestjs/common";
import type { Pool,PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { IdentifierSchema } from "../operations/contracts";
import { accessDigest } from "../execution-v2/access-digest";
import { followingSteps } from "./following-parent.contract";
export type FollowingFamily="SANDBOX"|"CANARY";
export type FollowingCandidate=Readonly<{workspaceId:string;family:FollowingFamily;deploymentId:string;portfolioId:string;
  certificationId:string;promotionGrantId:string;paperExitReviewId:string;r1ApprovalId:string;r2ApprovalId:string;
  envelopeId:string|null;promotionPlanId:string|null;requestedEnvironment:"sandbox"|"live"}>;
export type FollowingSections=Readonly<{lineage:boolean;steps:boolean;proposal:boolean}>;
export interface FollowingRaw {identity:FollowingCandidate;root:Record<string,unknown>;
  steps:Record<string,unknown>[];proposal:Record<string,unknown>|null}
export type FollowingSnapshot=Readonly<{raw:FollowingRaw;revision:string}>;
export class FollowingParentError extends Error {
  constructor(readonly code:"NOT_FOUND"|"INVALID"|"BOUND"){super(code);}
}
const fail=(code:FollowingParentError["code"]):never=>{throw new FollowingParentError(code);};
const immutableFrom=String.raw`FROM governance_sandbox_certifications c
 JOIN governance_promotion_authority_grants g ON g.workspace_id=c.workspace_id AND g.grant_id=c.promotion_grant_id
   AND g.review_id=c.paper_exit_review_id AND g.deployment_id=c.deployment_id AND g.target_stage='SANDBOX_VALIDATION'
   AND g.policy_version=c.policy_version
 JOIN governance_paper_exit_reviews v ON v.workspace_id=c.workspace_id AND v.review_id=c.paper_exit_review_id
   AND v.deployment_id=c.deployment_id AND v.portfolio_id=c.portfolio_id AND v.venue=c.venue
   AND v.artifact_digest=c.artifact_digest AND v.r1_approval_id=c.r1_approval_id AND v.r2_approval_id=c.r2_approval_id
   AND v.source_snapshot_hash=g.source_snapshot_hash
 JOIN governance_approval_requests a ON a.workspace_id=c.workspace_id AND a.approval_id=v.review_id AND a.gate='PAPER_EXIT'
   AND a.subject_type='DEPLOYMENT' AND a.subject_id=c.deployment_id AND a.environment='PAPER' AND a.evidence_set_hash=g.evidence_set_hash
 JOIN governance_approval_requests r2 ON r2.workspace_id=c.workspace_id AND r2.approval_id=c.r2_approval_id AND r2.gate='R2'
   AND r2.subject_type='DEPLOYMENT' AND r2.subject_id=c.deployment_id AND r2.environment='PAPER'
 JOIN governance_approval_analytics_scopes s ON s.workspace_id=c.workspace_id AND s.approval_id=r2.approval_id
   AND s.gate='R2' AND s.portfolio_id=c.portfolio_id
 JOIN governance_r2_lineage l ON l.workspace_id=c.workspace_id AND l.r2_approval_id=c.r2_approval_id
   AND l.r2_gate='R2' AND l.r1_approval_id=c.r1_approval_id AND l.r1_gate='R1'
 JOIN governance_approval_requests r1 ON r1.workspace_id=c.workspace_id AND r1.approval_id=c.r1_approval_id AND r1.gate='R1'`;
const from=(family:FollowingFamily)=>immutableFrom+(family==="SANDBOX"?"":String.raw`
 JOIN governance_canary_envelopes e ON e.workspace_id=c.workspace_id AND e.certification_id=c.certification_id
   AND e.deployment_id=c.deployment_id
 JOIN governance_sandbox_promotion_plans p ON p.workspace_id=c.workspace_id AND p.certification_id=c.certification_id
   AND p.plan_id=e.promotion_plan_id AND p.target_stage='CANARY' AND p.status='BLOCKED'
   AND p.evidence_set_hash=e.evidence_set_hash`);
const metadataFrom=(family:FollowingFamily)=>"FROM governance_sandbox_certifications c"+(family==="SANDBOX"?"":String.raw`
 JOIN governance_canary_envelopes e ON e.workspace_id=c.workspace_id AND e.certification_id=c.certification_id
   AND e.deployment_id=c.deployment_id`);
const latest=`e.envelope_id=(SELECT e2.envelope_id FROM governance_canary_envelopes e2
  WHERE e2.workspace_id=c.workspace_id AND e2.deployment_id=c.deployment_id
  ORDER BY e2.revision DESC,e2.envelope_id DESC LIMIT 1)`;
const columns=(family:FollowingFamily)=>`c.workspace_id AS "workspaceId",'${family}'::text AS family,c.deployment_id AS "deploymentId",
 c.portfolio_id AS "portfolioId",c.certification_id AS "certificationId",c.promotion_grant_id AS "promotionGrantId",
 c.paper_exit_review_id AS "paperExitReviewId",c.r1_approval_id AS "r1ApprovalId",c.r2_approval_id AS "r2ApprovalId",
 ${family==="CANARY"?'e.envelope_id':'NULL::text'} AS "envelopeId",
 ${family==="CANARY"?'e.promotion_plan_id':'NULL::text'} AS "promotionPlanId",
 '${family==="SANDBOX"?"sandbox":"live"}'::text AS "requestedEnvironment"`;
const identityKeys=["workspaceId","deploymentId","portfolioId","certificationId","promotionGrantId",
  "paperExitReviewId","r1ApprovalId","r2ApprovalId"] as const;
function checked(p:FollowingCandidate):FollowingCandidate{
  if(!p||!["SANDBOX","CANARY"].includes(p.family)||!identityKeys.every(k=>IdentifierSchema.safeParse(p[k]).success)||
    p.requestedEnvironment!==(p.family==="SANDBOX"?"sandbox":"live")||
    (p.family==="SANDBOX"?(p.envelopeId!==null||p.promotionPlanId!==null):
      !IdentifierSchema.safeParse(p.envelopeId).success||!IdentifierSchema.safeParse(p.promotionPlanId).success))return fail("INVALID");
  return Object.freeze({...p});
}
const boundedIdentities=`octet_length(c.workspace_id) BETWEEN 3 AND 96 AND `+
 ["c.deployment_id","c.portfolio_id","c.certification_id","c.promotion_grant_id","c.paper_exit_review_id","c.r1_approval_id","c.r2_approval_id"]
 .map(k=>`octet_length(${k}) BETWEEN 1 AND 191 AND ${k} ~ '^[A-Za-z0-9._:-]+$'`).join(" AND ");
function exact(p:FollowingCandidate){
  return `c.workspace_id=$1 AND c.deployment_id=$2 AND c.portfolio_id=$3 AND c.certification_id=$4
   AND c.promotion_grant_id=$5 AND c.paper_exit_review_id=$6 AND c.r1_approval_id=$7 AND c.r2_approval_id=$8`+
   (p.family==="CANARY"?` AND e.envelope_id=$9 AND e.promotion_plan_id=$10 AND ${latest}`:"");
}
const values=(p:FollowingCandidate):unknown[]=>[p.workspaceId,p.deploymentId,p.portfolioId,p.certificationId,
 p.promotionGrantId,p.paperExitReviewId,p.r1ApprovalId,p.r2ApprovalId,...(p.family==="CANARY"?[p.envelopeId,p.promotionPlanId]:[])];
const sandboxRoot=`c.certification_id,c.workflow_state,c.workflow_version,c.policy_version,c.formula_version,
 c.created_at,c.updated_at,c.submitted_at,c.decided_at,c.source_integration_state,c.delivery_profile,
 c.source_side_effect_requested,c.runtime_activation_requested,c.promotion_execution_requested`;
const canaryRoot=`e.envelope_id,e.revision,e.previous_envelope_id,e.expected_certification_version,e.status,e.created_at,
 e.source_integration_state,e.delivery_profile,e.source_side_effect_requested,e.runtime_activation_requested,
 e.promotion_execution_requested,e.production_command_active`;
@Injectable()
export class FollowingParentRepository{
  constructor(@Inject(CONTROL_API_POOL)private readonly pool:Pool){}
  private async transaction<T>(run:(db:PoolClient,budget:{bytes:number})=>Promise<T>):Promise<T>{
    const db=await this.pool.connect();let open=false;
    try{await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");open=true;
      await db.query("SET LOCAL statement_timeout='2000ms'");await db.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      await db.query("SET LOCAL TIME ZONE 'UTC'");const result=await run(db,{bytes:262144});
      await db.query("COMMIT");open=false;return result;
    }catch(error){if(open)await db.query("ROLLBACK").catch(()=>undefined);throw error;}finally{db.release();}
  }
  private async rows<T>(db:PoolClient,budget:{bytes:number},sql:string,args:unknown[],cap:number):Promise<T[]>{
    const result=await db.query<{payload:string|null}>(`WITH selected AS MATERIALIZED (${sql} LIMIT ${cap+1}),
      encoded AS MATERIALIZED(SELECT row_to_json(selected)::text AS payload FROM selected),
      admitted AS(SELECT count(*)<=${cap} AND COALESCE(max(octet_length(payload)),0)<=32768 AND
        COALESCE(sum(octet_length(payload)),0)<=${budget.bytes} AS ok FROM encoded)
      SELECT CASE WHEN admitted.ok THEN encoded.payload ELSE NULL END AS payload FROM encoded CROSS JOIN admitted`,args);
    if(result.rows.length>cap||result.rows.some(r=>r.payload===null))return fail("BOUND");
    return result.rows.map(r=>{if(typeof r.payload!=="string")return fail("BOUND");
      budget.bytes-=Buffer.byteLength(r.payload,"utf8");if(budget.bytes<0)return fail("BOUND");return JSON.parse(r.payload) as T;});
  }
  async identityCandidate(workspace:string,family:FollowingFamily,deployment:string):Promise<FollowingCandidate|null>{
    if(!IdentifierSchema.safeParse(workspace).success||!IdentifierSchema.safeParse(deployment).success||
      !["SANDBOX","CANARY"].includes(family))return fail("INVALID");
    return this.transaction(async(db,budget)=>{
      const rows=await this.rows<FollowingCandidate>(db,budget,`SELECT ${columns(family)} ${metadataFrom(family)}
        WHERE c.workspace_id=$1 AND c.deployment_id=$2 AND ${boundedIdentities}
        ${family==="CANARY"?`AND ${latest}`:""}`,[workspace,deployment],1);
      return rows[0]?checked(rows[0]):null;
    });
  }
  async protectedDetails(candidate:FollowingCandidate,sections:FollowingSections):Promise<FollowingSnapshot>{
    const p=checked(candidate);
    return this.transaction(async(db,budget)=>{
      const scope=from(p.family)+` WHERE ${exact(p)}`,args=values(p);
      const found=await this.rows<Record<string,unknown>>(db,budget,`SELECT ${p.family==="SANDBOX"?sandboxRoot:canaryRoot} ${scope}`,args,1);
      if(found.length!==1)return fail("NOT_FOUND");
      const steps:Record<string,unknown>[]=[];
      if(p.family==="SANDBOX"&&sections.steps){
        const rows=await this.rows<Record<string,unknown>>(db,budget,`SELECT k.step_key,
          x.evidence_id,x.evaluation_state,x.source_authority,x.source_verification_state,x.as_of,x.expires_at
          ${from(p.family)}
          CROSS JOIN unnest(ARRAY['CONNECT','SYNC','ORDER_TYPES','RECONCILIATION','TIMEBOXED_RUN','CLEANUP','EXIT_REVIEW']::text[]) WITH ORDINALITY k(step_key,n)
          LEFT JOIN LATERAL(SELECT q.evidence_id,q.evaluation_state,q.source_authority,q.source_verification_state,q.as_of,q.expires_at
            FROM governance_sandbox_step_evidence q WHERE q.workspace_id=c.workspace_id AND q.certification_id=c.certification_id
              AND q.step_key=k.step_key ORDER BY q.created_at DESC,q.evidence_id DESC LIMIT 1)x ON true
          WHERE ${exact(p)} ORDER BY k.n`,args,7);
        if(rows.length!==followingSteps.length)return fail("INVALID");steps.push(...rows);
      }
      let proposal:Record<string,unknown>|null=null;
      if(p.family==="CANARY"&&sections.proposal){
        const rows=await this.rows<Record<string,unknown>>(db,budget,`SELECT e.base_risk_profile_revision,e.currency,e.capital_cap::text AS capital_cap,
          e.gross_notional_cap::text AS gross_notional_cap,e.daily_loss_cap::text AS daily_loss_cap,e.max_open_orders,e.duration_days ${scope}`,args,1);
        if(rows.length!==1)return fail("NOT_FOUND");proposal=rows[0]!;
      }
      const raw:FollowingRaw={identity:p,root:found[0]!,steps,proposal};
      return Object.freeze({raw,revision:accessDigest({domain:"following-parent-current-local-view.v1",raw})});
    });
  }
  async isUnchanged(candidate:FollowingCandidate,revision:string,sections:FollowingSections):Promise<boolean>{
    const current=await this.identityCandidate(candidate.workspaceId,candidate.family,candidate.deploymentId);
    if(!current||accessDigest(current)!==accessDigest(candidate))return false;
    return(await this.protectedDetails(candidate,sections)).revision===revision;
  }
}
