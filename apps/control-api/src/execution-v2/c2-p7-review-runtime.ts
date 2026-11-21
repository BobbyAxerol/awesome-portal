/** Explicit, Research-only preparation of the P7 owner-review graph.
 * This is NOT installation, source authority, accepted delegation, or an
 * issuer switch. Without both private configuration references it is absent. */
import {isAbsolute,normalize} from "node:path";
import {z} from "zod";
import type {Pool} from "pg";
import {accessDigest} from "./access-digest";
import {inspectPinnedC2B1NotAuthorized} from "./c2-b1-preflight";
import {verifiedBinding} from "./c2-p7-acceptance";
import {createC2P7RegisteredSourceCandidate} from "./c2-p7-registered-source-candidate";
import {C2P7OwnerIntentCandidate} from "./c2-p7-owner-intent-candidate";
import {C2P7RegistrationWriterCandidate} from "./c2-p7-registration-writer-candidate";
import {C2P7RecordCandidate} from "./c2-p7-acceptance";
import {C2P7EmergencyReductionCandidate} from "./c2-p7-emergency-reduction-candidate";
import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "./c2-p7-review-candidate.service";
import {nativeCoreSchemaTarget,type NativeCoreSchemaTarget} from "./current-human-schema";
import {readNativeRuntimeReference} from "./native-core-runtime";
import {parseCompactJson} from "./private-root-file";

const hash=z.string().length(64).regex(/^[a-f0-9]{64}$/u);
const path=z.string().min(1).max(4096).refine(v=>isAbsolute(v)&&normalize(v)===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const ref=z.object({path,sha256:hash}).strict();
const id=z.string().min(1).max(128).refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const manifest=z.object({schema_version:z.literal("portal.c2-p7-review-runtime.v1"),
  target:z.literal("RESEARCH_PAPER_PREPARATION_ONLY"),schema_target:nativeCoreSchemaTarget,
  cycle_sha256:hash,registration_key:id,b1_ref:ref,registration_ref:ref,source_proof_ref:ref,
  attestor_public_key_ref:ref,attestor_spki_sha256:hash}).strict();
type Reference=z.infer<typeof ref>;
const fail=():never=>{throw new Error("C2_P7_REVIEW_RUNTIME_INVALID");};

/** The legacy current-human schema check does not cover the separate P7
 * namespace, its restricted writer role, procedures, triggers or ACLs. Do
 * not mount the review routes in a standalone process until an independently
 * registered, reviewed P7 installation can prove those properties. This is
 * deliberately not an environment-controlled switch. */
export function assertC2P7ReviewSchemaCommissioned():never {
  throw new Error("C2_P7_REVIEW_SCHEMA_NOT_COMMISSIONED");
}

export function c2P7ReviewRuntimeReference(env:NodeJS.ProcessEnv=process.env):Reference|undefined {
  const file=env.CONTROL_API_C2_P7_REVIEW_CONFIG_FILE,sha256=env.CONTROL_API_C2_P7_REVIEW_CONFIG_SHA256;
  if(file===undefined&&sha256===undefined)return undefined;
  try{return ref.parse({path:file,sha256});}catch{return fail();}
}

/** Copy and validate every pinned input before the app can mount a route.
 * No database, network, signing or listener is touched by preparation. */
export async function prepareC2P7ReviewRuntime(reference:Reference) {
  const buffers:Buffer[]=[];
  const read=async(r:Reference,max:number)=>{const bytes=await readNativeRuntimeReference(r,max);buffers.push(bytes);return bytes;};
  try {
    const selected=manifest.parse(parseCompactJson(await read(ref.parse(reference),65536)));
    const target=selected.schema_target,principal=target.principal_workspace_pins[0];
    if(!principal||principal.user_id!==target.protected_owner_user_id||principal.workspace_id!==target.workspace_id)return fail();
    const b1=await read(selected.b1_ref,131072),doc=inspectPinnedC2B1NotAuthorized(b1,selected.b1_ref.sha256);
    const registration=parseCompactJson(await read(selected.registration_ref,65536));
    const sourceProof=await read(selected.source_proof_ref,65536);
    const publicKey=new TextDecoder("utf-8",{fatal:true}).decode(await read(selected.attestor_public_key_ref,16384));
    const source=createC2P7RegisteredSourceCandidate(registration,publicKey,selected.attestor_spki_sha256);
    const parsed=verifiedBinding.safeParse(source.verify(sourceProof));
    if(!parsed.success)return fail();
    const value=parsed.data,selection=doc.acceptance.document;
    if(value.b1_sha256!==selected.b1_ref.sha256||value.workspace_id!==target.workspace_id||
      value.owner_user_id!==target.protected_owner_user_id||value.subject!==target.protected_owner_user_id||
      value.ts_user_id!==doc.head.user_id||JSON.stringify(value.operations)!==JSON.stringify(selection.operations)||
      JSON.stringify(value.scopes)!==JSON.stringify(selection.scopes)||JSON.stringify(value.fields)!==JSON.stringify(selection.fields)||
      value.visibility!==selection.visibility||Date.now()<value.effective_from_ms||Date.now()>=value.expires_at_ms)return fail();
    // Only copies are retained by the private closure; original read buffers
    // are wiped in finally even when parsing or proof verification fails.
    const pinnedB1=Buffer.from(b1),pinnedProof=Buffer.from(sourceProof),pinnedTarget=structuredClone(target);
    let used=false;
    return Object.freeze({schemaTarget:Object.freeze(structuredClone(pinnedTarget)),
      build(pool:Pool,actualTarget:NativeCoreSchemaTarget) {
        if(used||accessDigest(actualTarget)!==accessDigest(pinnedTarget))return fail();
        used=true;
        try {
          const intent=new C2P7OwnerIntentCandidate(pool,source,selected.registration_key);
          const registry=new C2P7RegistrationWriterCandidate(pool,source,intent,selected.registration_key);
          const records=new C2P7RecordCandidate(pool,source,selected.registration_key);
          const review=new C2P7ReviewCandidateService(pool,source,intent,registry,records,{enabled:true,environment:"RESEARCH",
            workspace_id:pinnedTarget.workspace_id,cycle_sha256:selected.cycle_sha256,b1_sha256:selected.b1_ref.sha256,
            b1_bytes:pinnedB1,source_proof:pinnedProof});
          const emergency=new C2P7EmergencyReviewCandidateService(
            new C2P7EmergencyReductionCandidate(pool,selected.registration_key),
            {enabled:true,environment:"RESEARCH",workspace_id:pinnedTarget.workspace_id});
          if(!review.usesInstallation(pool,pinnedTarget.workspace_id)||!emergency.usesInstallation(pool,pinnedTarget.workspace_id))return fail();
          return Object.freeze({c2P7ReviewCandidate:review,c2P7EmergencyCandidate:emergency});
        } finally {pinnedB1.fill(0);pinnedProof.fill(0);}
      },
      dispose(){used=true;pinnedB1.fill(0);pinnedProof.fill(0);},
    });
  } catch {return fail();} finally {buffers.forEach(value=>value.fill(0));}
}
