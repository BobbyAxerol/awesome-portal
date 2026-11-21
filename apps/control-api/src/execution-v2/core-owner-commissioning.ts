/** PRIVATE OWNER MAINTENANCE. No controller, URL, credential login, synthetic
 * session, default grant or public bootstrap. Deploying this file does nothing.
 * This intake verifies independently reviewed bytes; it does not generate an
 * owner approval. The configured expiry bounds installation intake only.
 * Product field/grant validity stays exactly as explicitly reviewed.
 *
 * Runtime MUST keep legacy route selection unchanged until a separately
 * qualified native selected consumer is mounted. Domain policy installation
 * alone does not commission stream.subscribe or legacy SCOPED_V2 consumers:
 * a STREAM grant exists only if the reviewed artifact lists it explicitly. */
import { readRootOwnedPinnedFile, parseCompactJson } from "./private-root-file";
import { z } from "zod";
import type { Pool } from "pg";
import { accessDigest } from "./access-policy";
import { reviewedAccessPolicy, managerDomainGrant, AccessPolicyError } from "./access.contract";
import { ExecutionAccessService } from "./access.service";
import type { AuthService } from "../auth/auth.service";
import type { CurrentHumanMutations } from "./current-human-mutations";
import type { AccessTrustProvider, ReviewedPolicyArtifact } from "./access-trust";

const hash=z.string().regex(/^[0-9a-f]{64}$/);
const text=z.string().min(1).max(256).refine(v=>!/[\u0000-\u001f\u007f]/u.test(v));
const target=z.object({database_name:text,database_system_identifier:z.string().regex(/^[0-9]{1,20}$/),
  role_name:text,protected_owner_user_id:text,workspace_id:text,
  principal_workspace_pins:z.array(z.object({user_id:text,workspace_id:text}).strict()).min(1).max(65)}).strict();
const document=z.object({schema_version:z.literal("portal.private-owner-manager-commissioning.v1"),
  target,policy:reviewedAccessPolicy,root_grants:z.array(z.never()).max(0),
  manager_domain_grants:z.array(managerDomainGrant).min(1).max(64),provenance_ref:text}).strict();
/** Exported for the offline preparation validator and its tests only. The
 * installer still reads the artifact exclusively through readPinnedOwnerArtifact. */
export const privateOwnerCommissioningDocument=document;

/** Hard product ceiling for one domain grant under Plan B (Bobby, 2026-10-20). */
export const PLAN_B_MAXIMUM_GRANT_MS=2*3_600_000;
/** Plan B pin: READ and STREAM are installed TOGETHER, each finite, at most
 * `maximum_grant_ms` (never more than two hours) and never beyond the renewed
 * source trust end. Independent deployment pin (hash-pinned manifest), NOT read
 * back from the artifact. Absent = the pre-Plan-B artifact checks only. */
export const planBGrantWindow=z.object({plan:z.enum(["READ_AND_STREAM","READ_ONLY"]),
  maximum_grant_ms:z.number().int().positive().max(PLAN_B_MAXIMUM_GRANT_MS),
  trust_not_after_ms:z.number().int().positive().safe()}).strict();
export type PlanBGrantWindow=z.infer<typeof planBGrantWindow>;
export type PlanBGrantFinding="PLAN_B_GRANT_SET_INVALID"|"PLAN_B_GRANT_ID_NOT_DISTINCT"|"PLAN_B_GRANTS_NOT_SAME_SCOPE"|
  "GRANT_EXCEEDS_PLAN_B_WINDOW"|"GRANT_OUTLIVES_TRUST"|"GRANT_ALREADY_EXPIRED";
/** Pure. Exactly one ALLOW business.read_all and one ALLOW stream.subscribe for
 * the SAME subject/environment/domain/field seal reference, different grant ids,
 * each with its OWN finite interval. Returns stable codes; never throws. */
export function planBGrantFindings(grants:readonly z.infer<typeof managerDomainGrant>[],
  window:PlanBGrantWindow,nowMs:number):{code:PlanBGrantFinding;index:number|null}[]{
  const out:{code:PlanBGrantFinding;index:number|null}[]=[];
  const read=grants.filter(g=>g.action==="business.read_all"&&g.effect==="ALLOW"),
    stream=grants.filter(g=>g.action==="stream.subscribe"&&g.effect==="ALLOW");
  if(window.plan==="READ_ONLY"){
    // Bobby, 2026-11-12: READ never implies STREAM. Exactly ONE finite READ ALLOW grant and
    // nothing else (no STREAM, no DENY), under the same <= 2 h and trust bounds as Plan B.
    if(grants.length!==1||read.length!==1){out.push({code:"PLAN_B_GRANT_SET_INVALID",index:null});return out;}
  }else{
    if(grants.length!==2||read.length!==1||stream.length!==1){out.push({code:"PLAN_B_GRANT_SET_INVALID",index:null});return out;}
    const [r,s]=[read[0]!,stream[0]!];
    if(r.grant_id===s.grant_id)out.push({code:"PLAN_B_GRANT_ID_NOT_DISTINCT",index:null});
    if(r.subject_user_id!==s.subject_user_id||r.environment!==s.environment||accessDigest(r.domain)!==accessDigest(s.domain)||
      r.field_policy_ref!==s.field_policy_ref||r.workspace_id!==s.workspace_id)out.push({code:"PLAN_B_GRANTS_NOT_SAME_SCOPE",index:null});
  }
  grants.forEach((g,index)=>{
    if(g.valid_until_ms-g.valid_from_ms>window.maximum_grant_ms)out.push({code:"GRANT_EXCEEDS_PLAN_B_WINDOW",index});
    if(g.valid_until_ms>window.trust_not_after_ms)out.push({code:"GRANT_OUTLIVES_TRUST",index});
    if(g.valid_until_ms<=nowMs)out.push({code:"GRANT_ALREADY_EXPIRED",index});
  });
  return out;
}

export interface PrivateOwnerCommissioningPin {
  /** Root-owned 0600 regular file, no symlink. Absolute private path only. */
  artifact_path:string;
  approved_sha256:string;
  /** Independent deployment pin, NOT read back from the artifact. */
  target:z.infer<typeof target>;
  /** Independent configured intake validity, NOT a short product-grant TTL. */
  intake_not_before_ms:number;
  intake_not_after_ms:number;
  /** Plan B caps (see planBGrantWindow). When present the artifact MUST be the
   * READ+STREAM pair inside them or the intake is refused. */
  grant_window?:PlanBGrantWindow;
}

/** Exported only for focused private-file tests / maintenance composition. */
export async function readPinnedOwnerArtifact(pin:PrivateOwnerCommissioningPin,nowMs:number):Promise<ReviewedPolicyArtifact>{
  try{
    hash.parse(pin.approved_sha256);target.parse(pin.target);
    if(pin.grant_window!==undefined)planBGrantWindow.parse(pin.grant_window);
    if(!pin.artifact_path.startsWith("/")||!Number.isSafeInteger(nowMs)||
      !Number.isSafeInteger(pin.intake_not_before_ms)||!Number.isSafeInteger(pin.intake_not_after_ms)||
      pin.intake_not_before_ms>=pin.intake_not_after_ms||nowMs<pin.intake_not_before_ms||nowMs>=pin.intake_not_after_ms)
      throw new Error("invalid");
    const raw=await readRootOwnedPinnedFile(pin.artifact_path,pin.approved_sha256);
    // One reviewed compact representation (shared private-file boundary).
    const parsed=parseCompactJson(raw);
    const value=document.parse(parsed);
    if(accessDigest(value.target)!==accessDigest(pin.target)||value.policy.qualification!=="OWNER_VERIFIED"||
      value.policy.state!=="REVIEWED"||value.policy.workspace_id!==pin.target.workspace_id||
      value.policy.protected_owner_user_id!==pin.target.protected_owner_user_id)throw new Error("invalid");
    // An already-expired grant is a validator finding, not an installer refusal:
    // the exact immutable replay of a lost ACK must stay possible after expiry.
    if(pin.grant_window&&planBGrantFindings(value.manager_domain_grants,pin.grant_window,nowMs)
      .some(f=>f.code!=="GRANT_ALREADY_EXPIRED"))throw new Error("invalid");
    return {policy:value.policy,root_grants:[],manager_domain_grants:value.manager_domain_grants,
      manager_commissioning_target:value.target,provenance_ref:value.provenance_ref};
  }catch{throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);}
}

/** One opaque intake capability. A copied JSON request/hash/reviewed=true does
 * not authenticate an owner artifact. All other provider ports are delegated
 * verbatim to the SAME existing trusted provider, never a second engine. */
export function privateOwnerCommissioning(base:AccessTrustProvider,pool:Pool,pin:PrivateOwnerCommissioningPin,
  clock:()=>number=Date.now){
  const detached=structuredClone(pin),request=Object.freeze({});
  // What the verified artifact actually carries, so the ACK cannot describe a
  // READ-only install when the reviewed artifact also records a STREAM grant.
  let streamAllowGrants=0;
  let grantDetail:{grant_id:string;action:string;valid_from_ms:number;valid_until_ms:number}[]=[];
  const trust:AccessTrustProvider={
    verifyPolicy:async input=>{
      if(input!==request)return base.verifyPolicy(input);
      const artifact=await readPinnedOwnerArtifact(detached,clock());
      streamAllowGrants=artifact.manager_domain_grants?.filter(g=>g.action==="stream.subscribe"&&g.effect==="ALLOW").length??0;
      grantDetail=(artifact.manager_domain_grants??[]).map(g=>({grant_id:g.grant_id,action:g.action,
        valid_from_ms:g.valid_from_ms,valid_until_ms:g.valid_until_ms}));
      return artifact;
    },
    verifyReceipt:base.verifyReceipt.bind(base),
    verifyRootReceipt:base.verifyRootReceipt?.bind(base),
    qualifyDelegatedReceipt:base.qualifyDelegatedReceipt?.bind(base),
    relations:base.relations.bind(base),verifiedHumanMapping:base.verifiedHumanMapping.bind(base),
    readPublication:base.readPublication?.bind(base),
  };
  return Object.freeze({trust,
    install:async(access:ExecutionAccessService)=>{
      if(!access.usesPool(pool))throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED",503);
      await access.installReviewedManagerDomainPolicy(request);
      // Default (READ-only artifact) output is unchanged. A STREAM grant is a
      // separate explicit artifact entry; recording it is reported, never
      // implied, and still says nothing about source publication or egress.
      const stream=streamAllowGrants>0;
      return Object.freeze({state:"REVIEWED_MANAGER_POLICY_ACKNOWLEDGED",
        authority_scope:stream?"DOMAIN_READ_AND_STREAM_GRANT":"DOMAIN_READ_ONLY",
        artifact_sha256:detached.approved_sha256,workspace_id:detached.target.workspace_id,
        stream_commissioned:stream,command_commissioned:false,
        // Plan B only: the two separately-expiring grants, ids and windows, so the
        // ACK itself shows READ and STREAM as distinct finite facts. No hash, key
        // or approval text. Pre-Plan-B ACK bytes are unchanged.
        ...(detached.grant_window?{plan:detached.grant_window.plan,grants:grantDetail.map(g=>({...g}))}:{})});
    }});
}

/** Small existing-AppModule dependency seam. The returned dependencies MUST be
 * injected into the reviewed native selected workload's existing app factory,
 * so AuthService, lifecycle, governance, workspace and access writers share
 * this SAME coordinator/pool before any native admission. This is not a new
 * AppModule, an enable flag, a substitute for route compatibility, or permission
 * to run unrelated latest routes on only the minimal schema. */
export function composePrivateOwnerCommissioning(pool:Pool,auth:AuthService,base:AccessTrustProvider,
  mutations:CurrentHumanMutations,pin:PrivateOwnerCommissioningPin){
  const prepared=privateOwnerCommissioning(base,pool,pin);
  const access=new ExecutionAccessService(pool,auth,prepared.trust,false,mutations);
  return Object.freeze({
    dependencies:Object.freeze({executionAccessTrust:prepared.trust,currentHumanMutations:mutations}),
    install:()=>prepared.install(access),
  });
}
