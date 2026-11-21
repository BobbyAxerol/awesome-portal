import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {z} from "zod";
import type {AccessActor} from "./access.contract";
import {verifiedBinding,type C2P7SourceVerifier} from "./c2-p7-acceptance";
import {createC2P7LockedRegistrationCandidate} from "./c2-p7-locked-registration-candidate";
import {lockCurrentHumanSnapshot} from "./current-human-snapshot";
import {C2P7OwnerConfirmationVerifier} from "./c2-p7-owner-confirmation-proof";

/** Internal candidate precondition only: the transaction owner must keep the
 * held locks through issuance and explicitly roll back on any failure. A
 * locally prepared record is NOT a qualified P7 grant and this checker does
 * not open the hard-fenced issuer, prove HTTP delivery or commission a source. */
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const hash=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
const fail=():never=>{throw new Error("C2_P7_ISSUER_FENCE_DENIED");};
const verifyConfirmation=C2P7OwnerConfirmationVerifier.prototype.verify;
const confirmationKeySha=C2P7OwnerConfirmationVerifier.prototype.keySha256;

export class C2P7IssuerFenceCandidate {
  readonly #source:C2P7SourceVerifier;
  readonly #verify:C2P7SourceVerifier["verify"];
  readonly #registration:ReturnType<typeof createC2P7LockedRegistrationCandidate>;
  readonly #key:string;readonly #cycle:string;readonly #b1:string;readonly #proof:Buffer;
  readonly #confirmation?:Readonly<{verifier:C2P7OwnerConfirmationVerifier;proof:Buffer;issued_at_ms:number;expires_at_ms:number}>;
  constructor(source:C2P7SourceVerifier,key:string,cycle:string,b1:string,proof:Uint8Array,
    confirmation?:{verifier:C2P7OwnerConfirmationVerifier;proof:Uint8Array;issued_at_ms:number;expires_at_ms:number}) {
    if(!source||typeof source.verify!=="function"||!id.safeParse(key).success||
      !hex.safeParse(cycle).success||!hex.safeParse(b1).success||!(proof instanceof Uint8Array)||
      !proof.byteLength||proof.byteLength>65536)throw new Error("C2_P7_ISSUER_FENCE_DENIED");
    this.#source=source;this.#verify=source.verify;this.#key=key;this.#cycle=cycle;this.#b1=b1;
    this.#proof=Buffer.from(proof);
    if(confirmation!==undefined) {
      if(!confirmation.verifier||Object.getPrototypeOf(confirmation.verifier)!==C2P7OwnerConfirmationVerifier.prototype||
        confirmation.verifier.verify!==verifyConfirmation||confirmation.verifier.keySha256!==confirmationKeySha||
        !(confirmation.proof instanceof Uint8Array)||!confirmation.proof.byteLength||confirmation.proof.byteLength>24576||
        !Number.isSafeInteger(confirmation.issued_at_ms)||!Number.isSafeInteger(confirmation.expires_at_ms)||
        confirmation.issued_at_ms<0||confirmation.expires_at_ms<=confirmation.issued_at_ms)
        throw new Error("C2_P7_ISSUER_FENCE_DENIED");
      this.#confirmation=Object.freeze({verifier:confirmation.verifier,proof:Buffer.from(confirmation.proof),
        issued_at_ms:confirmation.issued_at_ms,expires_at_ms:confirmation.expires_at_ms});
    }
    const verify=this.#verify;
    this.#registration=createC2P7LockedRegistrationCandidate(Object.freeze({
      verify:(value:Uint8Array)=>verify.call(source,value)}),key);
  }

  /** Stable public digest only; never store the proof or bearer in a lease. */
  bindingDigest():string {
    return this.#confirmation
      ? `sha256:${hash(JSON.stringify(["portal.c2-p7-issuer-fence.v2",this.#key,this.#cycle,this.#b1,hash(this.#proof),
        confirmationKeySha.call(this.#confirmation.verifier),hash(this.#confirmation.proof)]))}`
      : `sha256:${hash(JSON.stringify(["portal.c2-p7-issuer-fence.v1",this.#key,this.#cycle,this.#b1,hash(this.#proof)]))}`;
  }

  /** Only a public key fingerprint. The consumer must compare it with an
   * independently provisioned authority pin; this caller-supplied fence is
   * never itself the source of trust. */
  confirmationKeySha256():string|null {
    return this.#confirmation ? confirmationKeySha.call(this.#confirmation.verifier) : null;
  }

  /** Stronger candidate only: cryptographic provenance is checked against the
   * exact rows already locked by checkLocked, not against caller JSON. The
   * signer must separately be commissioned as an authenticated owner-confirm
   * authority and protected independently of this DB. This does not activate
   * the issuer or prove signer/role/recovery qualification. */
  async checkAuthenticatedLocked(db:PoolClient,actor:AccessActor,workspace:string,workload:string) {
    const witness=this.#confirmation;
    if(!witness||witness.verifier.verify!==verifyConfirmation||witness.verifier.keySha256!==confirmationKeySha)
      throw new Error("C2_P7_OWNER_CONFIRMATION_REQUIRED");
    const checked=await this.checkLocked(db,actor,workspace,workload);
    const rows=await db.query(`SELECT i.intent_id::text,i.registration_key,i.registration_sha256,i.source_evidence_sha256,
      i.b1_sha256,i.workspace_id,i.owner_user_id,i.session_id,i.session_generation::text,i.authority_revision::text,
      i.expires_at_ms::text,floor(extract(epoch FROM i.created_at)*1000)::bigint::text AS created_at_ms,
      r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256,
      floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
      FROM elp210_c2_p7_candidate.owner_intents i JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id
      WHERE i.intent_id=$1 AND r.cycle_sha256=$2`,[checked.intent_id,this.#cycle]);
    const row=rows.rows[0],source=verifiedBinding.safeParse(this.#verify.call(this.#source,Buffer.from(this.#proof)));
    if(rows.rowCount!==1||!row||!source.success)return fail();
    const now=Number(row.now_ms),created=Number(row.created_at_ms),intentExpiry=Number(row.expires_at_ms);
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(created)||!Number.isSafeInteger(intentExpiry)||
      witness.issued_at_ms<created||witness.issued_at_ms>=intentExpiry||
      witness.expires_at_ms>intentExpiry||witness.expires_at_ms>source.data.expires_at_ms)return fail();
    verifyConfirmation.call(witness.verifier,witness.proof,{
      schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:this.#cycle,confirmation_sha256:row.confirmation_sha256,
      intent_id:row.intent_id,registration_key:row.registration_key,registration_sha256:row.registration_sha256,
      source_evidence_sha256:row.source_evidence_sha256,b1_sha256:row.b1_sha256,workspace_id:row.workspace_id,
      owner_user_id:row.owner_user_id,session_id:row.session_id,session_generation:Number(row.session_generation),
      authority_revision:Number(row.authority_revision),acceptance_sha256:row.acceptance_sha256,
      delegation_sha256:row.delegation_sha256,issued_at_ms:witness.issued_at_ms,expires_at_ms:witness.expires_at_ms},now);
    return Object.freeze({...checked,expires_at_ms:Math.min(checked.expires_at_ms,witness.expires_at_ms)});
  }

  async checkLocked(db:PoolClient,actor:AccessActor,workspace:string,workload:string) {
    if(!db||!actor||!id.safeParse(workspace).success||!id.safeParse(workload).success||
      this.#source.verify!==this.#verify)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const proof=Buffer.from(this.#proof);
    try {
      const selected=verifiedBinding.safeParse(this.#verify.call(this.#source,proof));
      if(!selected.success)return fail();
      const v=selected.data;
      if(v.b1_sha256!==this.#b1||v.source_evidence_sha256!==hash(proof)||v.workspace_id!==workspace||
        v.owner_user_id!==person.user_id||v.subject!==person.user_id||v.source_workload_id!==workload||
        JSON.stringify(v.operations)!==JSON.stringify(["HISTORY","READ"])||
        JSON.stringify(v.scopes)!==JSON.stringify([{environment:"paper",portfolio_id:"paper-portfolio-g1"},
          {environment:"paper",portfolio_id:"paper-root-g1"}]))return fail();
      const current=await lockCurrentHumanSnapshot(db,person,workspace);
      const registry=await this.#registration.revalidate(db,person,workspace,proof);
      if(current.anchor!==person.user_id||registry.authority_revision!==v.authority_revision||
        registry.application_revision!==v.application_revision)return fail();
      // The first read is only a locator, never authority. Match acceptance's
      // lock order: original intent first, then record; validate the linked
      // ID again after both locks. A concurrent mutation, missing record or
      // stale locator therefore fails closed instead of authorizing a new one.
      const locator=await db.query(`SELECT owner_intent_id::text FROM elp210_c2_p7_candidate.records
        WHERE cycle_sha256=$1`,[this.#cycle]);
      if(locator.rowCount!==1||!z.string().uuid().safeParse(locator.rows[0]?.owner_intent_id).success)return fail();
      const intent=await db.query(`SELECT intent_id::text,expires_at_ms::text
        FROM elp210_c2_p7_candidate.lock_owner_intent_by_id($1)
        WHERE action='REGISTER' AND workspace_id=$2 AND owner_user_id=$3 AND session_id=$4
          AND session_generation=$5 AND registration_key=$6 AND registration_sha256=$7
          AND source_evidence_sha256=$8 AND b1_sha256=$9 AND authority_revision=$10`,
      [locator.rows[0].owner_intent_id,workspace,person.user_id,person.session_id,person.session_generation,this.#key,
        registry.registration_sha256,v.source_evidence_sha256,this.#b1,v.authority_revision]);
      if(intent.rowCount!==1)return fail();
      const record=await db.query(`SELECT binding_sha256,b1_sha256,acceptance_id::text,delegation_id::text,
        acceptance_json,acceptance_sha256,delegation_json,delegation_sha256,owner_intent_id::text,confirmation_sha256
        FROM elp210_c2_p7_candidate.lock_record_by_cycle($1)`,[this.#cycle]);
      // The confirmation digest belongs to the durable record and must be
      // bound into the decision; it cannot be guessed or provided by a caller.
      // Query it independently while retaining both row locks, then verify the
      // complete decision and binding below.
      if(record.rowCount!==1)return fail();
      const row=record.rows[0];
      if(!row||row.owner_intent_id!==intent.rows[0].intent_id||!hex.safeParse(row.confirmation_sha256).success)return fail();
      row.expires_at_ms=intent.rows[0].expires_at_ms;
      const decision=await db.query(`SELECT 1 FROM elp210_c2_p7_candidate.owner_intents
        WHERE intent_id=$1 AND decision_json=$2::jsonb`,[row.owner_intent_id,
        JSON.stringify({schema:"portal.c2-p7-owner-intent.v1",b1_sha256:this.#b1,source:v,action:"REGISTER",
          registration_key:this.#key,registration_sha256:registry.registration_sha256,
          session_generation:person.session_generation,
          review_binding:{cycle_sha256:this.#cycle,confirmation_sha256:row.confirmation_sha256}})]);
      const revocation=await db.query("SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations WHERE intent_id=$1",[row.owner_intent_id]);
      if(decision.rowCount!==1||revocation.rowCount!==0||row.b1_sha256!==this.#b1||
        row.binding_sha256!==hash(JSON.stringify([this.#cycle,this.#b1,v,current.authority_fingerprint,
          row.owner_intent_id,row.confirmation_sha256]))||
        hash(row.acceptance_json)!==row.acceptance_sha256||hash(row.delegation_json)!==row.delegation_sha256)return fail();
      if(!z.string().uuid().safeParse(row.acceptance_id).success||!z.string().uuid().safeParse(row.delegation_id).success)return fail();
      const common={schema:"portal.pm-current-access.p7-binding.v1",b1_sha256:this.#b1,workspace_id:workspace,
        environment:"paper",owner_user_id:person.user_id,grantor:{issuer:v.issuer,subject:v.subject},
        grantee_workload:{current_workload_ref:v.current_workload_ref,source_workload_id:v.source_workload_id},
        application_revision:v.application_revision,authority_revision:v.authority_revision,
        mapping_sha256:v.mapping_sha256,source_evidence_sha256:v.source_evidence_sha256,
        effective_from_ms:v.effective_from_ms,expires_at_ms:v.expires_at_ms,signer_kid:v.signer_kid,
        operations:v.operations,fields:v.fields,visibility:v.visibility,scopes:v.scopes};
      const expectedDelegation=JSON.stringify({...common,record_kind:"DELEGATION_PREPARATION_NOT_AUTHORIZED",delegation_id:row.delegation_id});
      const expectedAcceptance=JSON.stringify({...common,record_kind:"ACCEPTANCE_PREPARATION_NOT_AUTHORIZED",
        acceptance_id:row.acceptance_id,delegation_id:row.delegation_id,delegation_record_digest:row.delegation_sha256});
      if(row.delegation_json!==expectedDelegation||row.acceptance_json!==expectedAcceptance)return fail();
      const now=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
      const intentExpiry=Number(row.expires_at_ms);
      if(!Number.isSafeInteger(now)||!Number.isSafeInteger(intentExpiry)||now<v.effective_from_ms||now>=v.expires_at_ms||
        now>=intentExpiry||now>=current.lease_until_ms||now>=registry.valid_until_ms)return fail();
      return Object.freeze({state:"P7_PREPARATION_CURRENT_NOT_AUTHORIZED" as const,
        acceptance_id:row.acceptance_id as string,delegation_id:row.delegation_id as string,
        intent_id:row.owner_intent_id as string,expires_at_ms:Math.min(registry.valid_until_ms,intentExpiry)});
    } finally {proof.fill(0);}
  }
}
