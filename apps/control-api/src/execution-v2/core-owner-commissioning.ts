/** PRIVATE OWNER MAINTENANCE. No controller, URL, credential login, synthetic
 * session, default grant or public bootstrap. Deploying this file does nothing.
 * This intake verifies independently reviewed bytes; it does not generate an
 * owner approval. The configured expiry bounds installation intake only.
 * Product field/grant validity stays exactly as explicitly reviewed.
 *
 * Runtime MUST keep legacy route selection unchanged until a separately
 * qualified native selected consumer is mounted. Domain policy installation
 * alone does not commission stream.subscribe or legacy SCOPED_V2 consumers. */
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
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

export interface PrivateOwnerCommissioningPin {
  /** Root-owned 0600 regular file, no symlink. Absolute private path only. */
  artifact_path:string;
  approved_sha256:string;
  /** Independent deployment pin, NOT read back from the artifact. */
  target:z.infer<typeof target>;
  /** Independent configured intake validity, NOT a short product-grant TTL. */
  intake_not_before_ms:number;
  intake_not_after_ms:number;
}

/** Exported only for focused private-file tests / maintenance composition. */
export async function readPinnedOwnerArtifact(pin:PrivateOwnerCommissioningPin,nowMs:number):Promise<ReviewedPolicyArtifact>{
  try{
    hash.parse(pin.approved_sha256);target.parse(pin.target);
    if(!pin.artifact_path.startsWith("/")||!Number.isSafeInteger(nowMs)||
      !Number.isSafeInteger(pin.intake_not_before_ms)||!Number.isSafeInteger(pin.intake_not_after_ms)||
      pin.intake_not_before_ms>=pin.intake_not_after_ms||nowMs<pin.intake_not_before_ms||nowMs>=pin.intake_not_after_ms)
      throw new Error("invalid");
    const before=await lstat(pin.artifact_path);
    if(!before.isFile()||before.isSymbolicLink()||before.uid!==0||(before.mode&0o7777)!==0o600||
      before.size<1||before.size>131072)throw new Error("invalid");
    const file=await open(pin.artifact_path,constants.O_RDONLY|constants.O_NOFOLLOW);
    let raw:Buffer;
    try{
      const actual=await file.stat();
      if(!actual.isFile()||actual.uid!==0||(actual.mode&0o7777)!==0o600||
        actual.dev!==before.dev||actual.ino!==before.ino||actual.size!==before.size)throw new Error("invalid");
      const buffer=Buffer.alloc(131073);let length=0;
      while(length<buffer.length){
        const part=await file.read(buffer,length,buffer.length-length,null);
        if(part.bytesRead===0)break;
        length+=part.bytesRead;
      }
      raw=buffer.subarray(0,length);
      if(raw.length!==actual.size||raw.length>131072)throw new Error("invalid");
    }finally{await file.close();}
    if(createHash("sha256").update(raw).digest("hex")!==pin.approved_sha256)throw new Error("invalid");
    const parsed:unknown=JSON.parse(raw.toString("utf8"));
    // One reviewed compact representation: duplicate keys, whitespace variants,
    // invalid UTF-8 replacement and trailing bytes cannot normalize silently.
    if(Buffer.from(JSON.stringify(parsed),"utf8").compare(raw)!==0)throw new Error("invalid");
    const value=document.parse(parsed);
    if(accessDigest(value.target)!==accessDigest(pin.target)||value.policy.qualification!=="OWNER_VERIFIED"||
      value.policy.state!=="REVIEWED"||value.policy.workspace_id!==pin.target.workspace_id||
      value.policy.protected_owner_user_id!==pin.target.protected_owner_user_id)throw new Error("invalid");
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
  const trust:AccessTrustProvider={
    verifyPolicy:async input=>input===request?readPinnedOwnerArtifact(detached,clock()):base.verifyPolicy(input),
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
      return Object.freeze({state:"REVIEWED_MANAGER_POLICY_ACKNOWLEDGED",authority_scope:"DOMAIN_READ_ONLY",
        artifact_sha256:detached.approved_sha256,workspace_id:detached.target.workspace_id,
        stream_commissioned:false,command_commissioned:false});
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
