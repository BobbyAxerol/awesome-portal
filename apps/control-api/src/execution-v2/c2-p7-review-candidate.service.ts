import {createHash} from "node:crypto";
import type {Pool} from "pg";
import {z} from "zod";
import {AccessPolicyError,type AccessActor} from "./access.contract";
import {inspectPinnedC2B1NotAuthorized} from "./c2-b1-preflight";
import {inspectC2P7Prerequisites,C2P7RecordCandidate,type C2P7SourceVerifier} from "./c2-p7-acceptance";
import {C2P7OwnerIntentCandidate} from "./c2-p7-owner-intent-candidate";
import {C2P7RegistrationWriterCandidate} from "./c2-p7-registration-writer-candidate";
import {C2P7EmergencyReductionCandidate} from "./c2-p7-emergency-reduction-candidate";

/** Preparation-only Research composition. Explicit private bootstrap injection
 * does not commission source pins, grant authority, or activate the issuer.
 * It cannot sign, publish, enable Live, or claim source acceptance. */
type Pins={enabled?:boolean;environment?:"RESEARCH";workspace_id:string;cycle_sha256:string;
  b1_sha256:string;b1_bytes:Uint8Array;source_proof:Uint8Array};
const hex=z.string().regex(/^[0-9a-f]{64}$/);
const text=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const scope=z.object({environment:z.literal("paper"),portfolio_id:text}).strict();
const sourceBinding=z.object({b1_sha256:hex,workspace_id:text,owner_user_id:text,subject:text,issuer:text,
  current_workload_ref:text,source_workload_id:text,ts_user_id:text,environment:z.literal("paper"),
  operations:z.tuple([z.literal("HISTORY"),z.literal("READ")]),fields:z.tuple([z.literal("business_report")]),
  scopes:z.tuple([scope,scope]),visibility:z.literal("BUSINESS"),application_revision:text,
  authority_revision:z.number().int().nonnegative().safe(),mapping_sha256:hex,signer_kid:text,
  effective_from_ms:z.number().int().nonnegative().safe(),expires_at_ms:z.number().int().nonnegative().safe(),
  source_evidence_sha256:hex}).strict();
const publicPins=z.object({a1_sha256:hex,jwks_sha256:hex,p8_spki_sha256:hex}).passthrough();
const fail=():never=>{throw new Error("C2_P7_REVIEW_UNAVAILABLE");};
const sha=(b:string|Uint8Array)=>createHash("sha256").update(b).digest("hex");
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Only transactional contention is retryable. Each retry re-enters the
// complete source, session, intent and revocation checks on the same original.
const retryable=(error:unknown)=>error instanceof AccessPolicyError?error.code==="ACCESS_RETRY_REQUIRED":
  error instanceof Error && "code" in error && typeof error.code==="string" &&
    ["55P03","40001","40P01"].includes(error.code);
const retryDelayMs=[20,60,120] as const;

export class C2P7ReviewCandidateService {
  readonly #b1:Buffer;readonly #proof:Buffer;readonly #pin:string;readonly #cycle:string;
  readonly #workspace:string;readonly #enabled:boolean;readonly #pool:Pool;readonly #source:C2P7SourceVerifier;
  readonly #verify:C2P7SourceVerifier['verify'];
  readonly #intents:C2P7OwnerIntentCandidate;readonly #registrations:C2P7RegistrationWriterCandidate;
  readonly #records:C2P7RecordCandidate;
  readonly #approve:C2P7OwnerIntentCandidate['approveAndRegister'];
  readonly #record:C2P7RecordCandidate['recordFromIntent'];
  constructor(pool:Pool,source:C2P7SourceVerifier,intents:C2P7OwnerIntentCandidate,
    registrations:C2P7RegistrationWriterCandidate,records:C2P7RecordCandidate,pins:Pins) {
    const bounded=(x:unknown)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>0&&x<=30000;
    if(!pool?.options||!bounded(pool.options.connectionTimeoutMillis)||!bounded(pool.options.query_timeout)||
      !pins||!text.safeParse(pins.workspace_id).success||!hex.safeParse(pins.cycle_sha256).success||
      !hex.safeParse(pins.b1_sha256).success||!(pins.b1_bytes instanceof Uint8Array)||pins.b1_bytes.byteLength>131072||
      !(pins.source_proof instanceof Uint8Array)||pins.source_proof.byteLength<1||pins.source_proof.byteLength>65536)
      throw new Error("C2_P7_REVIEW_UNAVAILABLE");
    this.#pool=pool;this.#source=source;this.#verify=source.verify;this.#intents=intents;this.#registrations=registrations;this.#records=records;
    this.#approve=intents.approveAndRegister;this.#record=records.recordFromIntent;
    this.#enabled=pins.enabled===true&&pins.environment==="RESEARCH";
    this.#workspace=pins.workspace_id;this.#pin=pins.b1_sha256;this.#cycle=pins.cycle_sha256;
    this.#b1=Buffer.from(pins.b1_bytes);this.#proof=Buffer.from(pins.source_proof);
    inspectPinnedC2B1NotAuthorized(this.#b1,this.#pin);
  }
  /** Checks composition identity only; it does not qualify this candidate as
   * a source or grant authority, and does not activate the issuer. */
  usesInstallation(pool:Pool,workspace:string):boolean {
    if(this.#pool!==pool||this.#workspace!==workspace||!this.#enabled||typeof this.#verify!=="function"||this.#source.verify!==this.#verify||!this.#intents||!this.#registrations||!this.#records||
      Object.getPrototypeOf(this.#intents)!==C2P7OwnerIntentCandidate.prototype||
      Object.getPrototypeOf(this.#registrations)!==C2P7RegistrationWriterCandidate.prototype||
      Object.getPrototypeOf(this.#records)!==C2P7RecordCandidate.prototype||
      this.#approve!==C2P7OwnerIntentCandidate.prototype.approveAndRegister||this.#intents.approveAndRegister!==this.#approve||
      this.#record!==C2P7RecordCandidate.prototype.recordFromIntent||this.#records.recordFromIntent!==this.#record)return false;
    const key=C2P7RegistrationWriterCandidate.prototype.compositionRegistrationKey.call(this.#registrations);
    return typeof key==="string"&&
      C2P7OwnerIntentCandidate.prototype.matchesComposition.call(this.#intents,pool,this.#source,key)&&
      C2P7RegistrationWriterCandidate.prototype.matchesComposition.call(this.#registrations,pool,this.#source,this.#intents)&&
      C2P7RecordCandidate.prototype.matchesComposition.call(this.#records,pool,this.#source,key);
  }
  /** Bind the signer to the exact source and bytes reviewed, not just a pool
   * and workspace. This is composition identity, not source qualification. */
  usesConfirmationSelection(pool:Pool,source:C2P7SourceVerifier,proof:Uint8Array,selection:{
    workspace_id:string;registration_key:string;cycle_sha256:string;b1_sha256:string}):boolean {
    return !!selection && source===this.#source && proof instanceof Uint8Array &&
      this.#proof.equals(Buffer.from(proof)) && selection.cycle_sha256===this.#cycle &&
      selection.b1_sha256===this.#pin &&
      C2P7RegistrationWriterCandidate.prototype.compositionRegistrationKey.call(this.#registrations)===selection.registration_key &&
      C2P7ReviewCandidateService.prototype.usesInstallation.call(this,pool,selection.workspace_id);
  }
  #ready(){if(!this.#enabled)fail();}
  #selected(actor:AccessActor){
    const b1=inspectPinnedC2B1NotAuthorized(this.#b1,this.#pin),doc=b1.acceptance.document;
    const verificationCopy=Buffer.from(this.#proof);
    let decoded:ReturnType<typeof sourceBinding.safeParse>;
    try {if(typeof this.#verify!=="function"||this.#source.verify!==this.#verify)return fail();
      decoded=sourceBinding.safeParse(this.#verify.call(this.#source,verificationCopy));}
    finally {verificationCopy.fill(0);}
    if(!decoded.success)return fail();const s=decoded.data;
    if(s.b1_sha256!==this.#pin||s.workspace_id!==this.#workspace||s.owner_user_id!==actor.user_id||s.subject!==actor.user_id||
      s.ts_user_id!==b1.head.user_id||s.source_evidence_sha256!==sha(this.#proof)||!same(s.operations,doc.operations)||
      !same(s.fields,doc.fields)||!same(s.scopes,doc.scopes)||s.visibility!==doc.visibility||
      !same(s.scopes.map(x=>x.portfolio_id),["paper-portfolio-g1","paper-root-g1"]))return fail();
    // The trusted strict source verifier authenticated this exact envelope;
    // extract its public pins so the owner can actually review P8/A1 rather
    // than approving only an opaque digest. No signing key is read or shown.
    try {
      const env=JSON.parse(this.#proof.toString("utf8")) as {payload?:unknown};
      if(typeof env.payload!=="string"||!/^[A-Za-z0-9_-]+$/.test(env.payload))return fail();
      const payload=Buffer.from(env.payload,"base64url");if(payload.toString("base64url")!==env.payload)return fail();
      const publicFields=publicPins.safeParse(JSON.parse(payload.toString("utf8")));
      if(!publicFields.success)return fail();
      return {...s,a1_sha256:publicFields.data.a1_sha256,jwks_sha256:publicFields.data.jwks_sha256,p8_spki_sha256:publicFields.data.p8_spki_sha256};
    }catch{return fail();}
  }
  #reviewDigest(actor:AccessActor,s:z.infer<typeof sourceBinding>) {
    return sha(JSON.stringify(["portal.c2-p7-confirmation.v1",this.#cycle,this.#pin,sha(this.#proof),this.#workspace,
      actor.user_id,actor.session_id,actor.session_generation,s]));
  }
  async #recordOriginal(person:AccessActor,confirmationSha:string,intentId:string) {
    for(let attempt=0;;attempt++) {
      try {
        return await this.#record.call(this.#records,person,this.#workspace,this.#cycle,this.#b1,this.#pin,this.#proof,intentId,confirmationSha);
      } catch(error) {
        if(!retryable(error)||attempt>=retryDelayMs.length)throw error;
        await new Promise<void>(resolve=>setTimeout(resolve,retryDelayMs[attempt]));
      }
    }
  }
  async preview(actor:AccessActor) {
    this.#ready();const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const s=this.#selected(person),db=await this.#pool.connect();let discard=false;
    try {await db.query("BEGIN");const check=await inspectC2P7Prerequisites(db,person,this.#workspace,this.#b1,this.#pin);
      await db.query("COMMIT");return {state:"REVIEW_ONLY_NOT_AUTHORIZED" as const,workspace_id:this.#workspace,b1_sha256:this.#pin,
        confirmation_sha256:this.#reviewDigest(person,s),issuer:s.issuer,subject:s.subject,
        current_workload_ref:s.current_workload_ref,ts_user_id:s.ts_user_id,
        workload_id:s.source_workload_id,application_revision:s.application_revision,
        authority_revision:s.authority_revision,operations:s.operations,scopes:s.scopes,fields:s.fields,visibility:s.visibility,
        a1_sha256:s.a1_sha256,jwks_sha256:s.jwks_sha256,p8_spki_sha256:s.p8_spki_sha256,mapping_sha256:s.mapping_sha256,
        effective_from_ms:s.effective_from_ms,expires_at_ms:s.expires_at_ms,signer_kid:s.signer_kid,missing:check.missing};
    }catch(e){try{await db.query("ROLLBACK");}catch{discard=true;}throw e;}finally{db.release(discard);}
  }
  /** One explicit owner confirmation, server-pinned bytes; opaque proof never
   * leaves this process. A lost response can recover an already registered
   * original; an intent alone cannot recreate its proof or registration. */
  async confirm(actor:AccessActor,confirmationSha:string,idempotencyKey:string) {
    return this.#confirm(actor,confirmationSha,idempotencyKey);
  }
  /** Internal candidate path: the ID comes from independent custody, not a
   * transport-supplied ID. A missing original is never recreated on retry. */
  async confirmReserved(actor:AccessActor,confirmationSha:string,idempotencyKey:string,reservedIntentId:string) {
    if(!z.string().uuid().safeParse(reservedIntentId).success)return fail();
    const result=await this.#confirm(actor,confirmationSha,idempotencyKey,reservedIntentId);
    if(result.intent_id!==reservedIntentId)return fail();
    return result;
  }
  async #confirm(actor:AccessActor,confirmationSha:string,idempotencyKey:string,reservedIntentId?:string) {
    this.#ready();if(!hex.safeParse(confirmationSha).success||!text.safeParse(idempotencyKey).success)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const selected=this.#selected(person);
    if(this.#reviewDigest(person,selected)!==confirmationSha)return fail();
    // Owner intent and its registration are committed together. On an
    // ambiguous COMMIT the client may locate this same intent by its original
    // key; no bearer or second intent is generated by resume.
    let intent:{intent_id:string};
    try {
      intent=await this.#approve.call(this.#intents,person,this.#workspace,this.#b1,this.#pin,this.#proof,idempotencyKey,
        {cycle_sha256:this.#cycle,confirmation_sha256:confirmationSha},this.#registrations,reservedIntentId);
    } catch(originalError) {
      // An error may mean the COMMIT reply was lost, not that it rolled back.
      // Resume is only a locator: recordFromIntent must revalidate the exact
      // owner, session, review, source, live authority and revocation under
      // lock. A failure to prove that original preserves the original error.
      try { return await this.#resumeByKey(person,confirmationSha,idempotencyKey,reservedIntentId); }
      catch { throw originalError; }
    }
    try {
      const record=await this.#recordOriginal(person,confirmationSha,intent.intent_id);
      return {state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED" as const,intent_id:intent.intent_id,
        acceptance_id:record.acceptance_id,delegation_id:record.delegation_id};
    }catch{return {state:"REGISTRATION_RECORDED_P7_NOT_CONFIRMED" as const,intent_id:intent.intent_id};}
  }
  /** Resume only a previously recorded REGISTER intent for this same owner,
   * session, reviewed digest and source. Never recreate or return its proof. */
  async resume(actor:AccessActor,confirmationSha:string,intentId:string) {
    return this.#resume(actor,confirmationSha,intentId);
  }
  async #resume(actor:AccessActor,confirmationSha:string,intentId:string) {
    this.#ready();
    if(!hex.safeParse(confirmationSha).success||!z.string().uuid().safeParse(intentId).success)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const selected=this.#selected(person);
    if(this.#reviewDigest(person,selected)!==confirmationSha)return fail();
    const record=await this.#recordOriginal(person,confirmationSha,intentId);
    return {state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED" as const,intent_id:intentId,
      acceptance_id:record.acceptance_id,delegation_id:record.delegation_id};
  }
  /** If the HTTP response carrying intent_id was lost, the client can retry
   * with its original idempotency key. Lookup is only a locator; recordFromIntent
   * revalidates the complete owner/source/registration and revocation under lock. */
  async resumeByKey(actor:AccessActor,confirmationSha:string,idempotencyKey:string) {
    return this.#resumeByKey(actor,confirmationSha,idempotencyKey);
  }
  async resumeReserved(actor:AccessActor,confirmationSha:string,idempotencyKey:string,expectedIntentId:string) {
    if(!z.string().uuid().safeParse(expectedIntentId).success)return fail();
    return this.#resumeByKey(actor,confirmationSha,idempotencyKey,expectedIntentId);
  }
  async #resumeByKey(actor:AccessActor,confirmationSha:string,idempotencyKey:string,expectedIntentId?:string) {
    this.#ready();
    if(!hex.safeParse(confirmationSha).success||!text.safeParse(idempotencyKey).success)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const selected=this.#selected(person);
    if(this.#reviewDigest(person,selected)!==confirmationSha)return fail();
    const idem=sha(JSON.stringify(["c2-p7-owner-intent-v1",this.#workspace,person.user_id,idempotencyKey]));
    const found=await this.#pool.query(`SELECT intent_id FROM elp210_c2_p7_candidate.owner_intents
      WHERE idempotency_sha256=$1 AND workspace_id=$2 AND owner_user_id=$3 AND session_id=$4
        AND session_generation=$5 AND action='REGISTER' LIMIT 2`,
    [idem,this.#workspace,person.user_id,person.session_id,person.session_generation]);
    if(found.rowCount!==1||!z.string().uuid().safeParse(found.rows[0]?.intent_id).success||
      (expectedIntentId!==undefined&&found.rows[0].intent_id!==expectedIntentId))return fail();
    return this.#resume(person,confirmationSha,found.rows[0].intent_id);
  }
}

/** Independent reduction path: no B1/source/attestor is required even at
 * construction; this must not get disabled merely because a source failed. */
export class C2P7EmergencyReviewCandidateService {
  readonly #enabled:boolean;readonly #workspace:string;readonly #emergency:C2P7EmergencyReductionCandidate;
  readonly #reduce:C2P7EmergencyReductionCandidate['reduce'];
  constructor(emergency:C2P7EmergencyReductionCandidate,pins:{enabled?:boolean;environment?:"RESEARCH";workspace_id:string}) {
    if(!pins||!text.safeParse(pins.workspace_id).success)throw new Error("C2_P7_REVIEW_UNAVAILABLE");
    this.#emergency=emergency;this.#reduce=emergency.reduce;
    this.#enabled=pins.enabled===true&&pins.environment==="RESEARCH";this.#workspace=pins.workspace_id;
  }
  usesInstallation(pool:Pool,workspace:string):boolean {
    return !!this.#emergency&&Object.getPrototypeOf(this.#emergency)===C2P7EmergencyReductionCandidate.prototype&&
      this.#reduce===C2P7EmergencyReductionCandidate.prototype.reduce&&this.#emergency.reduce===this.#reduce&&
      C2P7EmergencyReductionCandidate.prototype.usesPool.call(this.#emergency,pool)&&this.#workspace===workspace&&this.#enabled;
  }
  async revoke(actor:AccessActor,intentId:string) {
    if(!this.#enabled||!z.string().uuid().safeParse(intentId).success)return fail();
    return this.#reduce.call(this.#emergency,actor,this.#workspace,intentId);
  }
}
