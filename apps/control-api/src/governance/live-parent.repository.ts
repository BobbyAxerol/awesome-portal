import { Inject,Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Pool,PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { IdentifierSchema } from "../operations/contracts";
import { computeEvidenceManifestHash } from "./evidence-manifest";
import type { EvidenceRecord } from "./governance.repository";
import type { RawApprovalMetadata,RawEvidenceMetadata } from "./positive-parent.repository";
export interface LiveParentCandidate {readonly workspaceId:string;readonly approvalId:string;
  readonly deploymentId:string;readonly environment:"LIVE";readonly family:"LIVE_GATE";}
export interface LiveParentSnapshot {readonly identity:LiveParentCandidate;readonly approval:RawApprovalMetadata;
  /** Private local equality witness, never a public snapshot digest or permit. */
  readonly revision:string;}
export class LiveParentRepositoryError extends Error{
  constructor(readonly code:"NOT_FOUND"|"BOUND"|"INTEGRITY"){super(code);}
}
const fail=(code:LiveParentRepositoryError["code"]):never=>{throw new LiveParentRepositoryError(code);};
const ids=(p:LiveParentCandidate)=>[p.workspaceId,p.approvalId,p.deploymentId];
function candidate(p:LiveParentCandidate):LiveParentCandidate{
  if(!p||p.environment!=="LIVE"||p.family!=="LIVE_GATE"||
    ![p.workspaceId,p.approvalId,p.deploymentId].every(v=>IdentifierSchema.safeParse(v).success))return fail("NOT_FOUND");
  return Object.freeze({workspaceId:p.workspaceId,approvalId:p.approvalId,deploymentId:p.deploymentId,
    environment:"LIVE",family:"LIVE_GATE"});
}
const root=`SELECT a.approval_id,a.workspace_id,a.subject_id AS deployment_id,a.status,a.policy_version,
  a.approval_version,a.quorum_required,a.quorum_met,a.evidence_complete,a.evidence_set_hash,
  a.sla_due_at,a.expires_at,a.created_at,a.updated_at,a.decided_at
  FROM governance_approval_requests a WHERE a.workspace_id=$1 AND a.approval_id=$2
    AND a.subject_id=$3 AND a.subject_type='DEPLOYMENT' AND a.gate='LIVE_GATE' AND a.environment='LIVE'`;
function date(value:unknown):Date{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))return fail("INTEGRITY");
  const d=new Date(value);
  if(!Number.isSafeInteger(d.valueOf())||d.valueOf()<0||d.getUTCFullYear()>9999)return fail("INTEGRITY");
  return d;
}
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value!==null&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>
    `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
@Injectable()
export class LiveParentRepository{
  constructor(@Inject(CONTROL_API_POOL)private readonly pool:Pool){}
  private async read<T>(run:(db:PoolClient,budget:{bytes:number})=>Promise<T>):Promise<T>{
    const db=await this.pool.connect();let open=false;
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");open=true;
      await db.query("SET LOCAL statement_timeout='2000ms'");
      await db.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      await db.query("SET LOCAL TIME ZONE 'UTC'");
      const result=await run(db,{bytes:2_097_152});await db.query("COMMIT");open=false;return result;
    }catch(e){if(open)await db.query("ROLLBACK").catch(()=>undefined);throw e;}finally{db.release();}
  }
  /** Static exact SQL only. All cap/count/byte admission follows the exact
   * selected tuple. Oversize gives NULL, not truncated private JSON in Node. */
  private async rows<T>(db:PoolClient,budget:{bytes:number},sql:string,values:readonly unknown[],cap:number):Promise<T[]>{
    const result=await db.query<{payload:string|null}>(`WITH selected AS MATERIALIZED (
      ${sql} LIMIT ${cap+1}
    ),encoded AS MATERIALIZED(SELECT row_to_json(__live_selected_row)::text AS payload FROM selected AS __live_selected_row),
    admitted AS(SELECT count(*)<=${cap} AND COALESCE(sum(octet_length(payload)),0)<=${budget.bytes}
      AND COALESCE(max(octet_length(payload)),0)<=32768 AS ok FROM encoded)
    SELECT CASE WHEN admitted.ok THEN encoded.payload ELSE NULL END AS payload FROM encoded CROSS JOIN admitted`,[...values]);
    if(result.rows.length>cap||result.rows.some(r=>r.payload===null))return fail("BOUND");
    return result.rows.map(({payload})=>{
      if(typeof payload!=="string"||Buffer.byteLength(payload,"utf8")>32768)return fail("BOUND");
      budget.bytes-=Buffer.byteLength(payload,"utf8");if(budget.bytes<0)return fail("BOUND");
      const parsed:unknown=JSON.parse(payload);
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return fail("INTEGRITY");return parsed as T;
    });
  }
  /** Only immutable bounded target/family metadata, no state/hash/evidence. */
  async identityCandidate(workspace:string,approvalId:string):Promise<LiveParentCandidate|null>{
    if(!IdentifierSchema.safeParse(workspace).success||!IdentifierSchema.safeParse(approvalId).success)return null;
    return this.read(async(db,budget)=>{
      const found=await this.rows<LiveParentCandidate>(db,budget,`SELECT a.workspace_id AS "workspaceId",
        a.approval_id AS "approvalId",a.subject_id AS "deploymentId",'LIVE'::text AS environment,'LIVE_GATE'::text AS family
        FROM governance_approval_requests a WHERE a.workspace_id=$1 AND a.approval_id=$2
          AND a.gate='LIVE_GATE' AND a.subject_type='DEPLOYMENT' AND a.environment='LIVE'
          AND octet_length(a.workspace_id) BETWEEN 1 AND 191 AND a.workspace_id ~ '^[A-Za-z0-9._:-]+$'
          AND octet_length(a.approval_id) BETWEEN 1 AND 191 AND a.approval_id ~ '^[A-Za-z0-9._:-]+$'
          AND octet_length(a.subject_id) BETWEEN 1 AND 191 AND a.subject_id ~ '^[A-Za-z0-9._:-]+$'`,[workspace,approvalId],1);
      return found[0]?candidate(found[0]):null;
    });
  }
  /** Caller must already hold SAME-flight exact current Live/audit/field
   * qualification. No private decoder is called during identity lookup. */
  async protectedDetails(selected:LiveParentCandidate):Promise<LiveParentSnapshot>{
    const p=candidate(selected),values=ids(p);
    return this.read(async(db,budget)=>{
      const roots=await this.rows<RawApprovalMetadata&{workspace_id:string;deployment_id:string}>(db,budget,root,values,1),a=roots[0];
      if(!a)return fail("NOT_FOUND");
      if(a.approval_id!==p.approvalId||a.workspace_id!==p.workspaceId||a.deployment_id!==p.deploymentId)return fail("INTEGRITY");
      for(const t of [a.created_at,a.updated_at,a.sla_due_at,a.expires_at])date(t);
      if(a.decided_at!==null)date(a.decided_at);
      if(typeof a.evidence_set_hash!=="string"||!/^sha256:[0-9a-f]{64}$/.test(a.evidence_set_hash))return fail("INTEGRITY");
      const evidence=await this.rows<RawEvidenceMetadata>(db,budget,`WITH root AS MATERIALIZED(${root})
        SELECT e.evidence_id,e.ordinal,e.sha256,e.schema_version,e.source_authority,e.captured_at
        FROM governance_approval_evidence e JOIN root r ON e.approval_id=r.approval_id
        ORDER BY e.ordinal,e.evidence_id`,values,256);
      if(new Set(evidence.map(e=>e.evidence_id)).size!==evidence.length||
        new Set(evidence.map(e=>e.ordinal)).size!==evidence.length)return fail("INTEGRITY");
      const manifest:Pick<EvidenceRecord,"evidenceId"|"ordinal"|"sha256"|"schemaVersion"|"sourceAuthority"|"capturedAt">[]=evidence.map(e=>{
        if(!IdentifierSchema.safeParse(e.evidence_id).success||!Number.isSafeInteger(e.ordinal)||e.ordinal<0||
          typeof e.sha256!=="string"||!/^sha256:[0-9a-f]{64}$/.test(e.sha256)||
          typeof e.schema_version!=="string"||e.schema_version.length===0||
          typeof e.source_authority!=="string"||e.source_authority.length===0)return fail("INTEGRITY");
        return {evidenceId:e.evidence_id,ordinal:e.ordinal,sha256:e.sha256,schemaVersion:e.schema_version,
          sourceAuthority:e.source_authority,capturedAt:date(e.captured_at)};
      });
      // SAME original hash and JS-ISO-ms preimage as the original writer.
      // No R1/R2/Portfolio record, current approval expiry or TS verdict is used.
      if(computeEvidenceManifestHash(manifest)!==a.evidence_set_hash)return fail("INTEGRITY");
      const approval:RawApprovalMetadata={approval_id:a.approval_id,status:a.status,policy_version:a.policy_version,
        approval_version:a.approval_version,quorum_required:a.quorum_required,quorum_met:a.quorum_met,
        evidence_complete:a.evidence_complete,evidence_set_hash:a.evidence_set_hash,sla_due_at:a.sla_due_at,
        expires_at:a.expires_at,created_at:a.created_at,updated_at:a.updated_at,decided_at:a.decided_at};
      // Exact raw UTC microseconds retained ONLY in the private local witness.
      // No hidden hash/preimage becomes a browser snapshot revision.
      const revision=`sha256:${createHash("sha256").update(canonical({identity:p,approval,
        evidence:[...evidence].sort((x,y)=>x.ordinal-y.ordinal||(x.evidence_id<y.evidence_id?-1:x.evidence_id>y.evidence_id?1:0))}),"utf8").digest("hex")}`;
      return Object.freeze({identity:p,approval,revision});
    });
  }
  async isUnchanged(p:LiveParentCandidate,revision:string):Promise<boolean>{
    return (await this.protectedDetails(p)).revision===revision;
  }
}
