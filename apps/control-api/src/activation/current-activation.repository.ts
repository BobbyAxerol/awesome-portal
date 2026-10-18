import {Inject,Injectable} from "@nestjs/common";
import {Pool,type PoolClient} from "pg";
import {z} from "zod";
import {CONTROL_API_POOL} from "../tokens";
import {accessDigest} from "../execution-v2/access-digest";
import {ACTIVATION_CAPABILITIES,DELIVERY_PROFILES} from "./contracts";
import {currentActivationCapability,currentActivationPlan,currentActivationEvidenceItem,currentActivationRequirementItem} from "./current-activation.contract";
export class ActivationMetadataError extends Error{
  constructor(readonly code:"BOUND"|"INTEGRITY"){super("ACTIVATION_METADATA_"+code);}
}
const fail=():never=>{throw new ActivationMetadataError("INTEGRITY");};
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/);
const rev=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const hash=z.string().regex(/^sha256:[0-9a-f]{64}$/),n=z.number().int().positive().safe();
const key=z.enum(ACTIVATION_CAPABILITIES),profile=z.enum(DELIVERY_PROFILES);
// SQL emits exact UTC microseconds, not the driver's millisecond Date parser.
const utc=z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/).refine(v=>Number.isFinite(Date.parse(v)));
const millis=(v:string)=>new Date(v).getTime();
const cap=z.object({workspace_id:id,capability_key:key,effective_profile:z.literal("fixture"),desired_profile:profile,
  capability_version:n,source_enabled:z.literal(false),runtime_enabled:z.literal(false),kill_switch_engaged:z.literal(true),
  last_plan_id:id.nullable(),created_at:utc,updated_at:utc}).strict();
const plan=z.object({workspace_id:id,plan_id:id,capability_key:key,action:z.enum(["PROMOTE","ROLLBACK"]),from_profile:profile,
  target_profile:profile,expected_capability_version:n,plan_version:n,status:z.enum(["READY","BLOCKED","DENIED","APPLIED","VERIFIED"]),
  evidence_set_hash:hash,compatibility_set_hash:hash,source_side_effect_requested:z.literal(false),
  runtime_activation_requested:z.literal(false),owner_artifact_imported:z.literal(false),
  expires_at:utc,applied_at:utc.nullable(),verified_at:utc.nullable(),resulting_capability_version:n.nullable(),
  created_at:utc,updated_at:utc}).strict();
const child=z.number().int().min(0).max(15);
const evidence=z.object({plan_id:id,ordinal:child,evidence_kind:z.enum(["CONTRACT","IMAGE","SCHEMA","QUALIFICATION","ROLLBACK"]),
  reference_id:id,artifact_digest:hash,schema_version:rev,signer_fingerprint:hash,
  detached_signature:z.string().regex(/^[A-Za-z0-9_-]{43,4096}$/),compatibility_revision:rev,expires_at:utc,
  structure_valid:z.literal(true),owner_accepted:z.literal(false),trusted_for_activation:z.literal(false)}).strict();
const requirement=z.object({plan_id:id,ordinal:child,requirement_kind:z.enum(["CONTRACT","IMAGE","SCHEMA","CAPABILITY"]),
  component:rev,exact_revision:rev,expected_digest:hash}).strict();
const head=plan.pick({workspace_id:true,plan_id:true,capability_key:true,status:true,resulting_capability_version:true});
type Plan=z.infer<typeof plan>;type Cap=z.infer<typeof cap>;
export interface ActivationCandidate{workspaceId:string;planId:string;capabilityKey:z.infer<typeof key>}
export interface ActivationSections{evidence:boolean;compatibility:boolean}
export interface ActivationMetadata{
  witness:string;capabilities:z.infer<typeof currentActivationCapability>[];
  plan?:z.infer<typeof currentActivationPlan>;
  evidence?:z.infer<typeof currentActivationEvidenceItem>[];
  compatibility?:z.infer<typeof currentActivationRequirementItem>[];
}
const ordinary=(alias:string,columns:string[])=>columns.flatMap(column=>["'"+column+"'",alias+"."+column]);
const stamp=(alias:string,column:string)=>["'"+column+"'","CASE WHEN "+alias+"."+column+
  " >= TIMESTAMPTZ '0001-01-01 00:00:00+00' AND "+alias+"."+column+
  " < TIMESTAMPTZ '10000-01-01 00:00:00+00' THEN to_char("+alias+"."+column+
  " AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') ELSE NULL END"];
const capFields=ordinary("c",["workspace_id","capability_key","effective_profile","desired_profile","capability_version",
  "source_enabled","runtime_enabled","kill_switch_engaged","last_plan_id"])
  .concat(stamp("c","created_at"),stamp("c","updated_at"));
const planFields=ordinary("p",["workspace_id","plan_id","capability_key","action","from_profile","target_profile",
  "expected_capability_version","plan_version","status","evidence_set_hash","compatibility_set_hash",
  "source_side_effect_requested","runtime_activation_requested","owner_artifact_imported","resulting_capability_version"])
  .concat(...["expires_at","applied_at","verified_at","created_at","updated_at"].map(column=>stamp("p",column)));
const evidenceFields=ordinary("e",["plan_id","ordinal","evidence_kind","reference_id","artifact_digest","schema_version",
  "signer_fingerprint","detached_signature","compatibility_revision","structure_valid","owner_accepted","trusted_for_activation"])
  .concat(stamp("e","expires_at"));
const requirementFields=ordinary("r",["plan_id","ordinal","requirement_kind","component","exact_revision","expected_digest"]);
function publicCap(c:Cap){
  if(c.updated_at<c.created_at)return fail();
  return currentActivationCapability.parse({capability_key:c.capability_key,record_state:"RECORDED",effective_profile:c.effective_profile,
    desired_profile:c.desired_profile,capability_version:c.capability_version,source_enabled:c.source_enabled,runtime_enabled:c.runtime_enabled,
    kill_switch_engaged:c.kill_switch_engaged,last_plan_id:c.last_plan_id,created_at_ms:millis(c.created_at),updated_at_ms:millis(c.updated_at)});
}
function publicPlan(p:Plan){
  const initial=["READY","BLOCKED","DENIED"].includes(p.status);
  if(p.expires_at<p.created_at||p.updated_at<p.created_at||initial&&(p.applied_at!==null||p.verified_at!==null||p.resulting_capability_version!==null)||
    p.status==="APPLIED"&&(p.applied_at===null||p.verified_at!==null||p.resulting_capability_version===null)||
    p.status==="VERIFIED"&&(p.applied_at===null||p.verified_at===null||p.resulting_capability_version===null)||
    p.applied_at!==null&&(p.applied_at<p.created_at||p.applied_at>p.updated_at)||
    p.verified_at!==null&&(p.verified_at<p.applied_at!||p.verified_at>p.updated_at))return fail();
  return currentActivationPlan.parse({plan_id:p.plan_id,capability_key:p.capability_key,action:p.action,from_profile:p.from_profile,
    target_profile:p.target_profile,expected_capability_version:p.expected_capability_version,plan_version:p.plan_version,stored_status:p.status,
    expiry_basis:"HISTORICAL_CAPTURE_NOT_CURRENT_READ_AUTHORITY",expires_at_ms:millis(p.expires_at),
    applied_at_ms:p.applied_at===null?null:millis(p.applied_at),verified_at_ms:p.verified_at===null?null:millis(p.verified_at),
    resulting_capability_version:p.resulting_capability_version,created_at_ms:millis(p.created_at),updated_at_ms:millis(p.updated_at),
    source_side_effect_requested:p.source_side_effect_requested,runtime_activation_requested:p.runtime_activation_requested,
    owner_artifact_imported:p.owner_artifact_imported});
}
@Injectable()
export class CurrentActivationRepository{
  constructor(@Inject(CONTROL_API_POOL) private readonly pool:Pool){}
  /** Bounded immutable routing metadata only. No status/prose/hash/child read. */
  async identityCandidate(workspaceId:string,planId:string):Promise<ActivationCandidate|null>{
    const client=await this.pool.connect();
    let open=false;
    try{
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");open=true;
      await client.query("SET LOCAL statement_timeout='2s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
      const result=await client.query<{workspace_id:string;plan_id:string;capability_key:unknown}>(
        "SELECT workspace_id,plan_id,capability_key FROM execution_activation_plans WHERE workspace_id=$1 AND plan_id=$2 "+
        "AND octet_length(workspace_id)<=512 AND octet_length(plan_id)<=512 AND octet_length(capability_key)<=32 LIMIT 1",
        [workspaceId,planId]);
      const row=result.rows[0];
      if(row&&(row.workspace_id!==workspaceId||row.plan_id!==planId||!key.safeParse(row.capability_key).success))return fail();
      const selected=row?{workspaceId,planId,capabilityKey:key.parse(row.capability_key)}:null;
      await client.query("COMMIT");open=false;return selected;
    }catch(error){
      if(open)await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{client.release();}
  }
  /** All SQL identifiers/projections here are module constants, never input. */
  private async rows(db:PoolClient,from:string,fields:string[],where:string,values:unknown[],order:string,limit:number,bytes:number){
    // Preflight selected scalar bytes BEFORE constructing JSON. A corrupt
    // unbounded text identity cannot materialize an unbounded driver payload.
    const size=fields.filter((_,index)=>index%2===1).map(expression=>
      "COALESCE(octet_length(("+expression+")::text),0)").join("+");
    const result=await db.query<{value:unknown}>("WITH bounded AS (SELECT CASE WHEN ("+size+")<="+(bytes-1024)+
      " THEN jsonb_build_object("+fields.join(",")+") ELSE NULL END AS value FROM "+from+" WHERE "+where+" ORDER BY "+order+" LIMIT "+limit+
      ") SELECT CASE WHEN octet_length(value::text)<="+bytes+" THEN value ELSE NULL END AS value FROM bounded",values);
    if(result.rows.some(row=>row.value===null))throw new ActivationMetadataError("BOUND");
    return result.rows.map(row=>row.value);
  }
  async protectedDetails(workspaceId:string,candidate?:ActivationCandidate,
    sections:ActivationSections={evidence:false,compatibility:false}):Promise<ActivationMetadata>{
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='2s'");
      await db.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
      if(candidate&&candidate.workspaceId!==workspaceId)return fail();
      const rawCaps=await this.rows(db,"execution_activation_capabilities c",capFields,
        candidate?"c.workspace_id=$1 AND c.capability_key=$2":"c.workspace_id=$1",
        candidate?[workspaceId,candidate.capabilityKey]:[workspaceId],"c.capability_key",8,4096);
      if(rawCaps.length>7)throw new ActivationMetadataError("BOUND");
      const caps=rawCaps.map(value=>cap.parse(value));
      if(new Set(caps.map(c=>c.capability_key)).size!==caps.length||caps.some(c=>c.workspace_id!==workspaceId))return fail();
      // The global FK alone permits a foreign workspace/key head. Bind all three.
      const heads:z.infer<typeof head>[]=[];
      for(const c of caps){
        if(c.last_plan_id===null){if(c.capability_version!==1)return fail();continue;}
        const rows=await this.rows(db,"execution_activation_plans p",ordinary("p",["workspace_id","plan_id","capability_key","status","resulting_capability_version"]),
          "p.workspace_id=$1 AND p.capability_key=$2 AND p.plan_id=$3",[workspaceId,c.capability_key,c.last_plan_id],"p.plan_id",1,8192);
        if(rows.length!==1)return fail();
        const h=head.parse(rows[0]);
        if(!["APPLIED","VERIFIED"].includes(h.status)||h.resulting_capability_version!==c.capability_version||
          h.plan_id!==c.last_plan_id||h.workspace_id!==workspaceId||h.capability_key!==c.capability_key)return fail();
        heads.push(h);
      }
      const projectedCaps=candidate?caps.map(publicCap):ACTIVATION_CAPABILITIES.map(k=>{
        const c=caps.find(item=>item.capability_key===k);return c?publicCap(c):currentActivationCapability.parse({capability_key:k,record_state:"NOT_RECORDED"});
      });
      let p:Plan|undefined;let ev:z.infer<typeof evidence>[]=[];let requirements:z.infer<typeof requirement>[]=[];
      if(candidate){
        const roots=await this.rows(db,"execution_activation_plans p",planFields,"p.workspace_id=$1 AND p.plan_id=$2 AND p.capability_key=$3",
          [workspaceId,candidate.planId,candidate.capabilityKey],"p.plan_id",1,8192);
        if(roots.length!==1||caps.length!==1)return fail();
        p=plan.parse(roots[0]);
        if(p.workspace_id!==workspaceId||p.plan_id!==candidate.planId||p.capability_key!==candidate.capabilityKey)return fail();
        // Explicit reviewed PLAN_ROOT integrity inputs authorize BOTH bounded
        // hash cohorts transiently. Output still needs each independent seal.
        const er=await this.rows(db,"execution_activation_evidence_refs e",evidenceFields,
          "e.plan_id=$1",[candidate.planId],"e.ordinal",17,8192);
        const rr=await this.rows(db,"execution_activation_compatibility_requirements r",requirementFields,
          "r.plan_id=$1",[candidate.planId],"r.ordinal",17,2048);
        if(er.length>16||rr.length>16)throw new ActivationMetadataError("BOUND");
        ev=er.map(v=>evidence.parse(v));requirements=rr.map(v=>requirement.parse(v));
        if(ev.some((e,i)=>e.ordinal!==i||e.plan_id!==p!.plan_id)||requirements.some((r,i)=>r.ordinal!==i||r.plan_id!==p!.plan_id)||
          new Set(ev.map(e=>e.reference_id)).size!==ev.length||
          new Set(requirements.map(r=>r.requirement_kind+":"+r.component)).size!==requirements.length)return fail();
        // EXACT unchanged original producer semantics, not raw stored order.
        const normalizedEvidence=ev.map(e=>({kind:e.evidence_kind,reference_id:e.reference_id,artifact_digest:e.artifact_digest,
          schema_version:e.schema_version,signer_fingerprint:e.signer_fingerprint,detached_signature:e.detached_signature,
          compatibility_revision:e.compatibility_revision,expires_at:new Date(e.expires_at).toISOString()}));
        const normalizedRequirements=requirements.map(r=>({kind:r.requirement_kind,component:r.component,exact_revision:r.exact_revision,
          expected_digest:r.expected_digest})).sort((l,r)=>(l.kind+":"+l.component).localeCompare(r.kind+":"+r.component));
        if(accessDigest(normalizedEvidence)!==p.evidence_set_hash||accessDigest(normalizedRequirements)!==p.compatibility_set_hash)return fail();
      }
      const raw={candidate:candidate??null,caps,heads,p:p??null,ev,requirements};
      if(Buffer.byteLength(JSON.stringify(raw),"utf8")>262144)throw new ActivationMetadataError("BOUND");
      const witness=accessDigest(raw); // PRIVATE ephemeral witness, not a public revision/cache key.
      const result:ActivationMetadata={witness,capabilities:projectedCaps};
      if(p)result.plan=publicPlan(p);
      if(candidate&&sections.evidence)result.evidence=ev.map(e=>currentActivationEvidenceItem.parse({
        ordinal:e.ordinal,kind:e.evidence_kind,reference_id:e.reference_id,artifact_digest:e.artifact_digest,schema_version:e.schema_version,
        compatibility_revision:e.compatibility_revision,expires_at_ms:millis(e.expires_at),structure_valid:e.structure_valid,
        owner_accepted:e.owner_accepted,trusted_for_activation:e.trusted_for_activation}));
      if(candidate&&sections.compatibility)result.compatibility=requirements.map(r=>currentActivationRequirementItem.parse({
        ordinal:r.ordinal,kind:r.requirement_kind,component:r.component,exact_revision:r.exact_revision,expected_digest:r.expected_digest}));
      await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK").catch(()=>undefined);
      if(error instanceof ActivationMetadataError)throw error;throw new ActivationMetadataError("INTEGRITY");
    }finally{db.release();}
  }
  async isUnchanged(workspaceId:string,witness:string,candidate?:ActivationCandidate,sections?:ActivationSections){
    return (await this.protectedDetails(workspaceId,candidate,sections)).witness===witness;
  }
}
