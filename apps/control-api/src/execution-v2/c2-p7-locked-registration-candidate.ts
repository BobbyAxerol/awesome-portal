import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {z} from "zod";
import type {AccessActor} from "./access.contract";
import type {C2P7SourceVerifier} from "./c2-p7-acceptance";
import {lockCurrentHumanSnapshot} from "./current-human-snapshot";
import {ACCESS_STEP_UP_PROOFS,AccountLifecycleRepository} from "../repos/account-lifecycle";

/**
 * Unmounted DB-only candidate: caller owns one short READ COMMITTED transaction
 * through any downstream candidate write. This checks but does not create an
 * approved registration, owner acceptance, delegation, or publication.
 * All future registration writers/revokers MUST take the same authority row
 * lock first and be independently authorized. That writer and DB privileges are
 * NOT commissioned. This candidate cannot be used as an authorization barrier.
 */
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const verified=z.object({workspace_id:id,owner_user_id:id,subject:id,application_revision:id,
  authority_revision:z.number().int().nonnegative().safe(),effective_from_ms:z.number().int().nonnegative().safe(),
  expires_at_ms:z.number().int().nonnegative().safe(),source_evidence_sha256:hex}).passthrough();
const fail=():never=>{throw new Error("C2_P7_REGISTRATION_NOT_CURRENT");};

/** The registration key is trusted configuration, never request input. */
export function createC2P7LockedRegistrationCandidate(source:C2P7SourceVerifier,registrationKey:string) {
  if(!source||typeof source.verify!=="function"||!id.safeParse(registrationKey).success)return fail();
  const verify=source.verify;
  return Object.freeze({async revalidate(db:PoolClient,actor:AccessActor,workspace:string,proof:Uint8Array) {
    if(!(proof instanceof Uint8Array)||!proof.byteLength||proof.byteLength>65536||!id.safeParse(workspace).success)
      return fail();
    const input=Buffer.from(proof);
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const parsed=verified.safeParse(verify.call(source,input));
    if(!parsed.success)return fail();
    const v=parsed.data;
    if(v.workspace_id!==workspace||v.owner_user_id!==person.user_id||v.subject!==person.user_id||
      v.source_evidence_sha256!==createHash("sha256").update(input).digest("hex"))return fail();
    // Only the signed candidate verifier's strict canonical envelope is valid.
    // This extraction cannot authenticate the payload; source.verify did that.
    let payload:Buffer;
    try {
      const envelope=JSON.parse(input.toString("utf8")) as {payload?:unknown};
      if(typeof envelope.payload!=="string"||!/^[A-Za-z0-9_-]+$/.test(envelope.payload))return fail();
      payload=Buffer.from(envelope.payload,"base64url");
      if(payload.toString("base64url")!==envelope.payload)return fail();
    } catch{return fail();}
    const registrationDigest=createHash("sha256").update(payload).digest("hex");
    const current=await lockCurrentHumanSnapshot(db,person,workspace);
    if(current.anchor!==person.user_id||!current.policy||current.policy.state!=="REVIEWED"||
      current.policy.qualification!=="OWNER_VERIFIED"||current.policy.protected_owner_user_id!==person.user_id)return fail();
    const step=await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(person.session_id,person.user_id,ACCESS_STEP_UP_PROOFS);
    if(!step)return fail();
    const authority=await db.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton");
    const rowAuthority=authority.rows[0];
    if(authority.rowCount!==1||rowAuthority?.drain_id!==null||
      String(rowAuthority?.revision)!==String(v.authority_revision))return fail();
    const result=await db.query(`SELECT registration_sha256,workspace_id,owner_user_id,application_revision,
      authority_revision::text,state,expires_at_ms::text FROM elp210_c2_p7_candidate.lock_registration_for_read($1)`,[registrationKey]);
    const row=result.rows[0];
    if(result.rowCount!==1||row?.state!=="ACTIVE"||row.registration_sha256!==registrationDigest||
      row.workspace_id!==workspace||row.owner_user_id!==person.user_id||row.application_revision!==v.application_revision||
      String(row.authority_revision)!==String(v.authority_revision)||String(row.expires_at_ms)!==String(v.expires_at_ms))return fail();
    const now=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
    if(!Number.isSafeInteger(now)||now<v.effective_from_ms||now>=v.expires_at_ms||
      now>=current.lease_until_ms||now>=step.getTime())return fail();
    // Caller must perform any candidate write before committing this transaction.
    return Object.freeze({state:"CHECKED_NOT_AUTHORIZED" as const,registration_sha256:registrationDigest,
      authority_revision:v.authority_revision,application_revision:v.application_revision,
      valid_until_ms:Math.min(v.expires_at_ms,current.lease_until_ms,step.getTime())});
  }});
}
