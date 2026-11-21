import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import type {AccessActor} from "./access.contract";
import type {C2P7SourceVerifier} from "./c2-p7-acceptance";
import {lockCurrentHumanSnapshot} from "./current-human-snapshot";
import {ACCESS_STEP_UP_PROOFS,AccountLifecycleRepository} from "../repos/account-lifecycle";

/** SOURCE-ONLY, NOT MOUNTED. Neither an attestation signature nor ACCESS_ADMIN
 * step-up constitutes an owner's intent. A separately qualified DB-only
 * verifier must validate an actual owner approval/revocation under the same
 * authority lock. No such verifier, registry writer ACL, or commissioning is
 * currently installed. This code cannot authorize a grant or publication. */
export interface C2P7OwnerIntentVerifierCandidate {
  /** DB-only, bounded, same transaction. It must revalidate provenance and
   * revocation, not just decode or hash caller-provided input. */
  verifyLocked(db:PoolClient,proof:Uint8Array):Promise<unknown>;
}
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const timestamp=z.number().int().nonnegative().safe();
const sourceBinding=z.object({workspace_id:id,owner_user_id:id,subject:id,application_revision:id,
  authority_revision:timestamp,effective_from_ms:timestamp,expires_at_ms:timestamp,source_evidence_sha256:hex}).passthrough();
const intentBinding=z.object({action:z.enum(["REGISTER","REVOKE"]),workspace_id:id,owner_user_id:id,
  session_id:id,registration_key:id,registration_sha256:hex,source_evidence_sha256:hex,
  authority_revision:timestamp,expires_at_ms:timestamp,intent_evidence_sha256:hex}).strict();
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const fail=():never=>{throw new Error("C2_P7_REGISTRY_WRITE_DENIED");};

export class C2P7RegistrationWriterCandidate {
  readonly #pool:Pool;readonly #source?:C2P7SourceVerifier;readonly #sourceVerify?:C2P7SourceVerifier['verify'];
  readonly #intent?:C2P7OwnerIntentVerifierCandidate;readonly #intentVerify?:C2P7OwnerIntentVerifierCandidate['verifyLocked'];
  readonly #registrationKey?:string;
  constructor(pool:Pool,source?:C2P7SourceVerifier,
    intent?:C2P7OwnerIntentVerifierCandidate,registrationKey?:string) {
    const bounded=(x:unknown)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>0&&x<=30000;
    if(!pool?.options||!bounded(pool.options.connectionTimeoutMillis)||!bounded(pool.options.query_timeout))
      throw new Error("C2_P7_REGISTRY_WRITE_DENIED");
    this.#pool=pool;this.#source=source;this.#sourceVerify=source?.verify;this.#intent=intent;
    this.#intentVerify=intent?.verifyLocked;this.#registrationKey=registrationKey;
  }
  matchesComposition(pool:Pool,source:C2P7SourceVerifier,intent:C2P7OwnerIntentVerifierCandidate):boolean {
    return this.#pool===pool&&this.#source===source&&this.#intent===intent&&
      typeof this.#sourceVerify==='function'&&this.#sourceVerify===source.verify&&
      typeof this.#intentVerify==='function'&&this.#intentVerify===intent.verifyLocked&&
      typeof this.#registrationKey==="string"&&id.safeParse(this.#registrationKey).success;
  }
  compositionRegistrationKey():string|undefined { return this.#registrationKey; }
  /** The older direct-UPDATE shortcut cannot prove BLOCK_NEW, preserve the
   * procedure's ACL/fencing checks, or reduce authority when policy parsing
   * fails. Keep it fail-closed for stale internal callers; the separately
   * composed C2P7EmergencyReductionCandidate is the only emergency path. */
  async emergencyRevoke(_actor:AccessActor,_workspace:string):Promise<never> {
    throw new Error("C2_P7_USE_EMERGENCY_REDUCTION");
  }
  async change(action:"REGISTER"|"REVOKE",actor:AccessActor,workspace:string,sourceProof:Uint8Array,intentProof:Uint8Array) {
    if(action==="REVOKE")throw new Error("C2_P7_USE_EMERGENCY_REDUCTION");
    if(!this.#source||!this.#intent||typeof this.#sourceVerify!=="function"||typeof this.#intentVerify!=="function"||
      this.#source.verify!==this.#sourceVerify||this.#intent.verifyLocked!==this.#intentVerify)return fail();
    const db=await this.#pool.connect();let discard=false;
    try {
      await db.query("BEGIN");
      const result=await C2P7RegistrationWriterCandidate.prototype.changeInTransaction.call(this,db,action,actor,workspace,sourceProof,intentProof);
      await db.query("COMMIT");
      return result;
    } catch(error) {try {await db.query("ROLLBACK");}catch{discard=true;}throw error;}
    finally {db.release(discard);}
  }
  /** Internal composition only. The caller owns this transaction and must
   * roll it back on failure. verifyLocked checks read-write READ COMMITTED and
   * locks the exact intent; no ID, callback, or session claim is a bearer. */
  async changeInTransaction(db:PoolClient,action:"REGISTER"|"REVOKE",actor:AccessActor,workspace:string,
    sourceProof:Uint8Array,intentProof:Uint8Array) {
    // The old direct registry UPDATE does not atomically BLOCK_NEW. All
    // reduction must go through the authority-first emergency procedure;
    // silently reporting a registry-only revoke would leave a split fence.
    if(action==="REVOKE")throw new Error("C2_P7_USE_EMERGENCY_REDUCTION");
    if(!this.#source||!this.#intent||typeof this.#sourceVerify!=="function"||typeof this.#intentVerify!=="function"||
      this.#source.verify!==this.#sourceVerify||this.#intent.verifyLocked!==this.#intentVerify||
      !id.safeParse(this.#registrationKey).success||!id.safeParse(workspace).success||
      !(sourceProof instanceof Uint8Array)||!sourceProof.byteLength||sourceProof.byteLength>65536||
      !(intentProof instanceof Uint8Array)||!intentProof.byteLength||intentProof.byteLength>65536||
      action!=="REGISTER")return fail();
    const key=this.#registrationKey!,src=Buffer.from(sourceProof),approval=Buffer.from(intentProof);
    try {
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    let payload:Buffer;
    try { const env=JSON.parse(src.toString("utf8")) as {payload?:unknown};
      if(typeof env.payload!=="string"||!/^[A-Za-z0-9_-]+$/.test(env.payload))return fail();
      payload=Buffer.from(env.payload,"base64url");if(payload.toString("base64url")!==env.payload)return fail();
    } catch{return fail();}
    const registrationSha=hash(payload),sourceSha=hash(src),intentSha=hash(approval);
      const snapshot=await lockCurrentHumanSnapshot(db,person,workspace);
      if(snapshot.anchor!==person.user_id||!snapshot.policy||snapshot.policy.state!=="REVIEWED"||
        snapshot.policy.qualification!=="OWNER_VERIFIED"||snapshot.policy.protected_owner_user_id!==person.user_id)return fail();
      const step=await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(person.session_id,person.user_id,ACCESS_STEP_UP_PROOFS);
      if(!step)return fail();
      const authority=await db.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton");
      const revision=Number(authority.rows[0]?.revision);
      if(authority.rowCount!==1||authority.rows[0]?.drain_id!==null||!Number.isSafeInteger(revision)||revision<0)return fail();
      // Verifiers are independently installed trusted components; no request can
      // choose their keys or change the registration key. Both must be reviewed
      // and source/intent revocation must participate in this same lock protocol.
      const s=sourceBinding.safeParse(this.#sourceVerify.call(this.#source,src));
      const v=intentBinding.safeParse(await this.#intentVerify.call(this.#intent,db,approval));
      if(!s.success||!v.success)return fail();
      const b=s.data,owner=v.data;
      if(b.workspace_id!==workspace||b.owner_user_id!==person.user_id||b.subject!==person.user_id||
        b.source_evidence_sha256!==sourceSha||owner.action!==action||owner.workspace_id!==workspace||
        owner.owner_user_id!==person.user_id||owner.session_id!==person.session_id||owner.registration_key!==key||
        owner.registration_sha256!==registrationSha||owner.source_evidence_sha256!==sourceSha||
        owner.intent_evidence_sha256!==intentSha||owner.authority_revision!==revision||
        b.authority_revision!==revision)return fail();
      const getNow=async()=>Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
      const checkClock=(now:number)=>{if(!Number.isSafeInteger(now)||now>=owner.expires_at_ms||now>=step.getTime()||
        now>=snapshot.lease_until_ms||now<b.effective_from_ms||now>=b.expires_at_ms)fail();};
      checkClock(await getNow());
      await db.query(`INSERT INTO elp210_c2_p7_candidate.registrations
        (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7) ON CONFLICT(registration_key) DO NOTHING`,
        [key,registrationSha,workspace,person.user_id,b.application_revision,b.authority_revision,b.expires_at_ms]);
      const row=(await db.query(`SELECT registration_sha256,workspace_id,owner_user_id,application_revision,
        authority_revision::text,state,expires_at_ms::text FROM elp210_c2_p7_candidate.registrations
        WHERE registration_key=$1 FOR UPDATE`,[key])).rows[0];
      if(!row||row.registration_sha256!==registrationSha||row.workspace_id!==workspace||row.owner_user_id!==person.user_id||
        row.application_revision!==b.application_revision||String(row.authority_revision)!==String(b.authority_revision)||
        String(row.expires_at_ms)!==String(b.expires_at_ms)||!["ACTIVE","REVOKED"].includes(row.state))return fail();
      if(row.state!=="ACTIVE")return fail();
      checkClock(await getNow());
      return Object.freeze({state:"RECORDED_NOT_AUTHORIZED" as const,registration_sha256:registrationSha,action});
    } finally { approval.fill(0); }
  }
}
