import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import type { C2P7SourceVerifier } from "./c2-p7-acceptance";
import { C2P7RegistrationWriterCandidate, type C2P7OwnerIntentVerifierCandidate } from "./c2-p7-registration-writer-candidate";
import { inspectPinnedC2B1NotAuthorized } from "./c2-b1-preflight";
import { lockCurrentHumanSnapshot } from "./current-human-snapshot";
import { ACCESS_STEP_UP_PROOFS, AccountLifecycleRepository } from "../repos/account-lifecycle";

/** Candidate only: no route, owner UI, CSRF boundary, grants, or real source
 * verifier are installed. This is not P7 acceptance or authority to sign. */
const hex=z.string().regex(/^[0-9a-f]{64}$/);
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const ms=z.number().int().nonnegative().safe();
const reviewBinding=z.object({cycle_sha256:hex,confirmation_sha256:hex}).strict();
const binding=z.object({b1_sha256:hex,workspace_id:id,owner_user_id:id,issuer:id,subject:id,
  current_workload_ref:id,source_workload_id:id,ts_user_id:id,environment:z.literal("paper"),
  visibility:z.literal("BUSINESS"),fields:z.tuple([z.literal("business_report")]),
  operations:z.array(z.enum(["READ","HISTORY"])).length(2),
  scopes:z.array(z.object({environment:z.literal("paper"),portfolio_id:id}).strict()).length(2),
  application_revision:id,authority_revision:ms,mapping_sha256:hex,source_evidence_sha256:hex,
  signer_kid:id,effective_from_ms:ms,expires_at_ms:ms}).strict();
const sha=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const fail=():never=>{throw new Error("C2_P7_OWNER_INTENT_DENIED");};
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const scopes=["paper-portfolio-g1","paper-root-g1"];
const nowMs=async(db:PoolClient)=>Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);

export class C2P7OwnerIntentCandidate implements C2P7OwnerIntentVerifierCandidate {
  readonly #pool:Pool; readonly #source?:C2P7SourceVerifier; readonly #verify?:C2P7SourceVerifier['verify'];
  readonly #registrationKey?:string;
  constructor(pool:Pool,source?:C2P7SourceVerifier,registrationKey?:string) {
    const bounded=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0&&n<=30000;
    if(!pool?.options||!bounded(pool.options.connectionTimeoutMillis)||!bounded(pool.options.query_timeout))fail();
    this.#pool=pool;this.#source=source;this.#verify=source?.verify;this.#registrationKey=registrationKey;
  }
  matchesComposition(pool:Pool,source:C2P7SourceVerifier,key:string):boolean {
    return this.#pool===pool&&this.#source===source&&this.#verify===source.verify&&typeof this.#verify==='function'&&
      this.#registrationKey===key&&id.safeParse(key).success;
  }
  async #transaction<T>(f:(db:PoolClient)=>Promise<T>):Promise<T> {
    const db=await this.#pool.connect();let discard=false;
    try {await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const out=await f(db);await db.query("COMMIT");return out;
    } catch(e){try{await db.query("ROLLBACK");}catch{discard=true;}throw e;}finally{db.release(discard);}
  }
  /** Caller is responsible for actual authenticated confirmation and CSRF;
   * never call this from a transport until that boundary is implemented.
   * The opaque proof is one-view: an idempotency retry cannot reveal it again. */
  async approve(actor:AccessActor,workspace:string,action:"REGISTER"|"REVOKE",b1Bytes:Uint8Array,
    b1Pin:string,sourceProof:Uint8Array,idempotencyKey:string,untrustedReviewBinding?:unknown) {
    return this.#approveInternal(actor,workspace,action,b1Bytes,b1Pin,sourceProof,idempotencyKey,untrustedReviewBinding);
  }
  /** The process-local proof never leaves this method. Intent and registration
   * commit together; a rollback leaves neither. This is still preparation, not
   * owner acceptance, source authority or a permit to issue. */
  async approveAndRegister(actor:AccessActor,workspace:string,b1Bytes:Uint8Array,b1Pin:string,sourceProof:Uint8Array,
    idempotencyKey:string,review:unknown,writer:C2P7RegistrationWriterCandidate,reservedIntentId?:string) {
    if(reservedIntentId!==undefined&&!z.string().uuid().safeParse(reservedIntentId).success)return fail();
    if(!reviewBinding.safeParse(review).success||!this.#source||this.#source.verify!==this.#verify||!writer||Object.getPrototypeOf(writer)!==C2P7RegistrationWriterCandidate.prototype||
      !C2P7RegistrationWriterCandidate.prototype.matchesComposition.call(writer,this.#pool,this.#source,this)||
      C2P7RegistrationWriterCandidate.prototype.compositionRegistrationKey.call(writer)!==this.#registrationKey)return fail();
    const result=await this.#approveInternal(actor,workspace,"REGISTER",b1Bytes,b1Pin,sourceProof,idempotencyKey,review,writer,reservedIntentId);
    result.proof.fill(0);
    return {intent_id:result.intent_id,state:result.state,expires_at_ms:result.expires_at_ms};
  }
  async #approveInternal(actor:AccessActor,workspace:string,action:"REGISTER"|"REVOKE",b1Bytes:Uint8Array,
    b1Pin:string,sourceProof:Uint8Array,idempotencyKey:string,untrustedReviewBinding?:unknown,writer?:C2P7RegistrationWriterCandidate,reservedIntentId?:string) {
    if(!this.#source||typeof this.#verify!=="function"||this.#source.verify!==this.#verify||!id.safeParse(this.#registrationKey).success||!id.safeParse(workspace).success||
      !id.safeParse(idempotencyKey).success||!["REGISTER","REVOKE"].includes(action)||
      !(sourceProof instanceof Uint8Array)||sourceProof.byteLength<1||sourceProof.byteLength>65536) return fail();
    const review=untrustedReviewBinding===undefined?undefined:reviewBinding.safeParse(untrustedReviewBinding);
    if(review&&!review.success)return fail();
    const pinnedReview=review?.success?review.data:undefined;
    const currentActor={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const proof=Buffer.from(sourceProof),sourceSha=sha(proof),b1=inspectPinnedC2B1NotAuthorized(b1Bytes,b1Pin),doc=b1.acceptance.document;
    const parsed=binding.safeParse(this.#verify.call(this.#source,proof));if(!parsed.success)return fail();const b=parsed.data;
    if(b.expires_at_ms<=b.effective_from_ms||b.expires_at_ms-b.effective_from_ms>90*86400_000||
      b.b1_sha256!==b1Pin||b.workspace_id!==workspace||b.owner_user_id!==currentActor.user_id||b.subject!==currentActor.user_id||
      b.source_evidence_sha256!==sourceSha||b.ts_user_id!==b1.head.user_id||!eq(b.operations,doc.operations)||!eq(b.fields,doc.fields)||
      !eq(b.scopes,doc.scopes)||!eq([...doc.operations].sort(),["HISTORY","READ"])||
      !eq(doc.scopes.map(s=>s.portfolio_id).sort(),scopes))return fail();
    let registrationSha:string;
    try{const env=JSON.parse(proof.toString("utf8")) as {payload?:unknown};
      if(typeof env.payload!=="string"||!/^[A-Za-z0-9_-]+$/.test(env.payload))return fail();
      const payload=Buffer.from(env.payload,"base64url");if(payload.toString("base64url")!==env.payload)return fail();registrationSha=sha(payload);
    }catch{return fail();}
    const key=this.#registrationKey!,idem=sha(JSON.stringify(["c2-p7-owner-intent-v1",workspace,currentActor.user_id,idempotencyKey]));
    const token=randomBytes(32),tokenHash=sha(token),intentId=reservedIntentId??randomUUID();
    let result: {intent_id:string;state:"RECORDED_NOT_AUTHORIZED";expires_at_ms:number};
    try { result=await this.#transaction(async db=>{
      const snapshot=await lockCurrentHumanSnapshot(db,currentActor,workspace);
      if(snapshot.anchor!==currentActor.user_id||!snapshot.policy||snapshot.policy.state!=="REVIEWED"||
        snapshot.policy.qualification!=="OWNER_VERIFIED"||snapshot.policy.protected_owner_user_id!==currentActor.user_id)return fail();
      const step=await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(currentActor.session_id,currentActor.user_id,ACCESS_STEP_UP_PROOFS);
      const authority=await db.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton");
      const revision=Number(authority.rows[0]?.revision),now=await nowMs(db);
      if(!step||authority.rowCount!==1||authority.rows[0].drain_id!==null||!Number.isSafeInteger(revision)||revision!==b.authority_revision||
        !Number.isSafeInteger(now)||now<b.effective_from_ms||now>=b.expires_at_ms||now>=snapshot.lease_until_ms||now>=step.getTime())return fail();
      const expiry=Math.min(b.expires_at_ms,snapshot.lease_until_ms,step.getTime());
      const decision={schema:"portal.c2-p7-owner-intent.v1",b1_sha256:b1Pin,source:b,action,registration_key:key,
        registration_sha256:registrationSha,session_generation:currentActor.session_generation,
        ...(pinnedReview?{review_binding:pinnedReview}:{})};
      const inserted=await db.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents
        (intent_id,proof_sha256,idempotency_sha256,action,workspace_id,owner_user_id,session_id,session_generation,
        registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(idempotency_sha256) DO NOTHING`,
      [intentId,tokenHash,idem,action,workspace,currentActor.user_id,currentActor.session_id,currentActor.session_generation,
        key,registrationSha,sourceSha,b1Pin,JSON.stringify(decision),revision,expiry]);
      if(inserted.rowCount!==1)throw new Error("C2_P7_OWNER_INTENT_REPLAY_NO_SECRET");
      if(writer)await C2P7RegistrationWriterCandidate.prototype.changeInTransaction.call(writer,db,"REGISTER",currentActor,workspace,proof,token);
      const final=await nowMs(db);if(!Number.isSafeInteger(final)||final>=expiry)return fail();
      return {intent_id:intentId,state:"RECORDED_NOT_AUTHORIZED" as const,expires_at_ms:expiry};
    }); } catch(error) {token.fill(0);throw error;}
    return {...result,proof:token};
  }
  /** Must be invoked inside the SAME transaction as registration; row lock
   * serializes a concurrent append-only revocation until transaction ends. */
  async verifyLocked(db:PoolClient,proof:Uint8Array):Promise<unknown> {
    if(!(proof instanceof Uint8Array)||proof.byteLength!==32)return fail();
    const proofSha=sha(Buffer.from(proof));
    await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
    const isolation=(await db.query("SHOW transaction_isolation")).rows[0]?.transaction_isolation;
    const readOnly=(await db.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if(isolation!=="read committed"||readOnly!=="off")return fail();
    const xid=String((await db.query("SELECT txid_current()::text AS xid")).rows[0]?.xid??"");
    const result=await db.query("SELECT * FROM elp210_c2_p7_candidate.lock_owner_intent_by_proof($1)",[proofSha]);
    const row=result.rows[0];
    // A fresh READ COMMITTED statement is essential: the lock query may have
    // waited behind a revocation that committed after its snapshot was taken.
    const revoked=row?await db.query("SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations WHERE intent_id=$1",[row.intent_id]):null;
    const final=await db.query("SELECT txid_current()::text AS xid, floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms");
    const now=Number(final.rows[0]?.ms),revision=Number(row?.authority_revision),expiry=Number(row?.expires_at_ms);
    if(!/^[1-9][0-9]*$/.test(xid)||final.rows[0]?.xid!==xid||result.rowCount!==1||!row||!revoked||revoked.rowCount!==0||
      !Number.isSafeInteger(now)||!Number.isSafeInteger(expiry)||now>=expiry||!Number.isSafeInteger(revision))return fail();
    return {action:row.action,workspace_id:row.workspace_id,owner_user_id:row.owner_user_id,session_id:row.session_id,
      registration_key:row.registration_key,registration_sha256:row.registration_sha256,source_evidence_sha256:row.source_evidence_sha256,
      authority_revision:revision,expires_at_ms:expiry,intent_evidence_sha256:proofSha};
  }
  /** Append-only revoke of the intent itself, not a source grant or P7 token.
   * Route authentication/CSRF remains an unimplemented commissioning gate. */
  async revoke(actor:AccessActor,workspace:string,intentId:string) {
    if(!z.string().uuid().safeParse(intentId).success)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    return this.#transaction(async db=>{
      const current=await lockCurrentHumanSnapshot(db,person,workspace);
      if(current.anchor!==person.user_id)return fail();
      const step=await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(person.session_id,person.user_id,ACCESS_STEP_UP_PROOFS);
      if(!step)return fail();
      const row=await db.query("SELECT owner_user_id,workspace_id FROM elp210_c2_p7_candidate.lock_owner_intent_by_id($1)",[intentId]);
      if(row.rowCount!==1||row.rows[0].owner_user_id!==person.user_id||row.rows[0].workspace_id!==workspace)return fail();
      await db.query("INSERT INTO elp210_c2_p7_candidate.owner_intent_revocations(intent_id,actor_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[intentId,person.user_id]);
      const now=await nowMs(db);if(!Number.isSafeInteger(now)||now>=current.lease_until_ms||now>=step.getTime())return fail();
      return {state:"INTENT_REVOKED_NOT_PROPAGATED" as const};
    });
  }
}
