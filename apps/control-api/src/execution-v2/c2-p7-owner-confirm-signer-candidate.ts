import {createHash,createPublicKey,sign,type KeyObject} from "node:crypto";
import type {Pool} from "pg";
import {z} from "zod";
import type {AccessActor} from "./access.contract";
import type {C2P7SourceVerifier} from "./c2-p7-acceptance";
import {C2P7ReviewCandidateService} from "./c2-p7-review-candidate.service";
import {C2P7IssuerFenceCandidate} from "./c2-p7-issuer-fence-candidate";
import {C2P7OwnerWitnessCustodyCandidate} from "./c2-p7-owner-witness-custody-candidate";
import type {C2P7ConfirmationClaims} from "./c2-p7-owner-confirmation-proof";
import {C2P7OwnerAuthAttestationCandidate} from "./c2-p7-owner-auth-attestation-candidate";
import {c2P7RegisteredSourceKeysAreIndependent} from "./c2-p7-registered-source-candidate";

/** SOURCE ONLY. This is not an HTTP authentication boundary: only a separately
 * authenticated, origin/CSRF-protected owner-confirm route may invoke it.
 * The signer key, its pin and the custody store need independently qualified
 * provisioning and privileges. It cannot grant access, publish or activate an
 * issuer. There is intentionally no generic sign-arbitrary-claims method. */
const hex=/^[a-f0-9]{64}$/;
const identifier=/^[^\u0000-\u001f\u007f]{1,128}$/;
const confirm=C2P7ReviewCandidateService.prototype.confirm;
const preview=C2P7ReviewCandidateService.prototype.preview;
const confirmReserved=C2P7ReviewCandidateService.prototype.confirmReserved;
const resumeByKey=C2P7ReviewCandidateService.prototype.resumeByKey;
const resumeReserved=C2P7ReviewCandidateService.prototype.resumeReserved;
const reviewUses=C2P7ReviewCandidateService.prototype.usesInstallation;
const reviewSelection=C2P7ReviewCandidateService.prototype.usesConfirmationSelection;
const checkLocked=C2P7IssuerFenceCandidate.prototype.checkLocked;
const storeMatches=C2P7OwnerWitnessCustodyCandidate.prototype.matchesSourceAndSigner;
const retain=C2P7OwnerWitnessCustodyCandidate.prototype.retain;
const withVerifiedSource=C2P7OwnerWitnessCustodyCandidate.prototype.withVerifiedSource;
const recover=C2P7OwnerWitnessCustodyCandidate.prototype.recover;
const retainedIntent=C2P7OwnerWitnessCustodyCandidate.prototype.retainedIntent;
const reserveIntent=C2P7OwnerWitnessCustodyCandidate.prototype.reserveIntent;
const verifyOwner=C2P7OwnerAuthAttestationCandidate.prototype.verify;
const ownerKey=C2P7OwnerAuthAttestationCandidate.prototype.keySha256;
const fail=():never=>{throw new Error("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");};
type Selection={workspace_id:string;owner_user_id:string;workload_id:string;registration_key:string;
  cycle_sha256:string;b1_sha256:string;signer_spki_sha256:string};

export class C2P7OwnerConfirmSignerCandidate {
  readonly #pool:Pool;readonly #review:C2P7ReviewCandidateService;readonly #store:C2P7OwnerWitnessCustodyCandidate;
  readonly #fence:C2P7IssuerFenceCandidate;readonly #selection:Readonly<Selection>;readonly #key:KeyObject;
  readonly #ownerAuth:C2P7OwnerAuthAttestationCandidate;
  readonly #source:C2P7SourceVerifier;readonly #sourceProof:Buffer;
  constructor(pool:Pool,review:C2P7ReviewCandidateService,store:C2P7OwnerWitnessCustodyCandidate,
    source:C2P7SourceVerifier,sourceProof:Uint8Array,selection:Selection,privateKey:KeyObject,ownerAuth:C2P7OwnerAuthAttestationCandidate) {
    if(!pool?.options||[pool.options.connectionTimeoutMillis,pool.options.query_timeout]
      .some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000)||!selection||
      ![selection.workspace_id,selection.owner_user_id,selection.workload_id,selection.registration_key]
        .every(v=>typeof v==="string"&&identifier.test(v)&&v.trim()===v)||
      ![selection.cycle_sha256,selection.b1_sha256,selection.signer_spki_sha256].every(v=>typeof v==="string"&&hex.test(v))||
      !(privateKey instanceof Object)||privateKey.type!=="private"||privateKey.asymmetricKeyType!=="ed25519"||
      !review||Object.getPrototypeOf(review)!==C2P7ReviewCandidateService.prototype||review.preview!==preview||review.confirm!==confirm||review.confirmReserved!==confirmReserved||review.resumeByKey!==resumeByKey||review.resumeReserved!==resumeReserved||
      review.usesInstallation!==reviewUses||review.usesConfirmationSelection!==reviewSelection||
      !reviewSelection.call(review,pool,source,sourceProof,selection)||
      !store||Object.getPrototypeOf(store)!==C2P7OwnerWitnessCustodyCandidate.prototype||
      store.retain!==retain||store.withVerifiedSource!==withVerifiedSource||store.recover!==recover||store.retainedIntent!==retainedIntent||store.reserveIntent!==reserveIntent||store.matchesSourceAndSigner!==storeMatches||
      !storeMatches.call(store,pool,selection.signer_spki_sha256)||!ownerAuth||
      Object.getPrototypeOf(ownerAuth)!==C2P7OwnerAuthAttestationCandidate.prototype||
      ownerAuth.verify!==verifyOwner||ownerAuth.keySha256!==ownerKey||
      !c2P7RegisteredSourceKeysAreIndependent(source,ownerKey.call(ownerAuth),selection.signer_spki_sha256))
      throw new Error("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    const publicDigest=createHash("sha256").update(createPublicKey(privateKey).export({type:"spki",format:"der"})).digest("hex");
    if(publicDigest!==selection.signer_spki_sha256)throw new Error("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    this.#pool=pool;this.#review=review;this.#store=store;this.#key=privateKey;
    this.#ownerAuth=ownerAuth;
    this.#source=source;this.#sourceProof=Buffer.from(sourceProof);
    this.#selection=Object.freeze({...selection});
    this.#fence=new C2P7IssuerFenceCandidate(source,selection.registration_key,selection.cycle_sha256,selection.b1_sha256,sourceProof);
  }
  #stable() {
    if(this.#review.preview!==preview||this.#review.confirm!==confirm||this.#review.confirmReserved!==confirmReserved||this.#review.resumeByKey!==resumeByKey||this.#review.resumeReserved!==resumeReserved||this.#review.usesInstallation!==reviewUses||this.#review.usesConfirmationSelection!==reviewSelection||
      !reviewSelection.call(this.#review,this.#pool,this.#source,this.#sourceProof,this.#selection)||
      this.#store.retain!==retain||this.#store.withVerifiedSource!==withVerifiedSource||this.#store.recover!==recover||this.#store.retainedIntent!==retainedIntent||this.#store.reserveIntent!==reserveIntent||this.#store.matchesSourceAndSigner!==storeMatches||
      !storeMatches.call(this.#store,this.#pool,this.#selection.signer_spki_sha256)||this.#fence.checkLocked!==checkLocked||
      this.#ownerAuth.verify!==verifyOwner||this.#ownerAuth.keySha256!==ownerKey||
      !c2P7RegisteredSourceKeysAreIndependent(this.#source,ownerKey.call(this.#ownerAuth),this.#selection.signer_spki_sha256))return fail();
  }
  /** Called only after the *current request* passed session, origin and CSRF
   * guards. Confirmation digest and idempotency key are checked by the review
   * service; the signed claims come solely from its exact locked original.
   * Repeats deterministically regenerate the same Ed25519 bytes. */
  async confirmOwner(actor:AccessActor,confirmationSha256:string,idempotencyKey:string,ownerAttestation:Uint8Array) {
    this.#stable();
    if(!actor||actor.user_id!==this.#selection.owner_user_id||!hex.test(confirmationSha256)||
      typeof idempotencyKey!=="string"||!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)||
      !(ownerAttestation instanceof Uint8Array)||ownerAttestation.byteLength>24576)return fail();
    const person={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const attestation=Buffer.from(ownerAttestation),expected={workspace_id:this.#selection.workspace_id,
      owner_user_id:person.user_id,session_id:person.session_id,session_generation:person.session_generation,
      cycle_sha256:this.#selection.cycle_sha256,b1_sha256:this.#selection.b1_sha256,confirmation_sha256:confirmationSha256,
      idempotency_sha256:createHash("sha256").update(idempotencyKey).digest("hex")};
    try {verifyOwner.call(this.#ownerAuth,attestation,expected,Date.now());}
    catch {attestation.fill(0);return fail();}
    try {
    // Validate the current reviewed selection before consuming an immutable
    // reservation. This read does not replace the later locked revalidation.
    const currentReview=await preview.call(this.#review,person);
    this.#stable();
    if(currentReview.confirmation_sha256!==confirmationSha256)return fail();
    verifyOwner.call(this.#ownerAuth,attestation,expected,Date.now());
    // Commit independent reservation BEFORE dispatch. Existing or uncertain
    // reservations can only locate that original, never dispatch a new one.
    const requestSha256=createHash("sha256").update(JSON.stringify(["portal.c2-p7-reservation.v1",
      this.#selection,expected,ownerKey.call(this.#ownerAuth)])).digest("hex");
    const reservation=await reserveIntent.call(this.#store,this.#selection.cycle_sha256,requestSha256);
    this.#stable();
    // Reservation may wait on another transaction; do not dispatch using an
    // owner attestation that expired while the authority store was locked.
    verifyOwner.call(this.#ownerAuth,attestation,expected,Date.now());
    const result=reservation.created?await confirmReserved.call(this.#review,person,confirmationSha256,idempotencyKey,reservation.intent_id):
      await resumeReserved.call(this.#review,person,confirmationSha256,idempotencyKey,reservation.intent_id);
    if(result.intent_id!==reservation.intent_id)return fail();
    if(result.state!=="P7_PREPARATION_RECORDED_NOT_AUTHORIZED")return fail();
    return await withVerifiedSource.call(this.#store,async(db,retainLocked)=>{let proof:Buffer|undefined;
    try {
      // Source authority locks must not be retained indefinitely while the
      // independent witness store is unavailable. A killed source session is
      // never success: the checks and COMMIT below must still complete.
      await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='2000ms'");
      this.#stable();const locked=await checkLocked.call(this.#fence,db,person,this.#selection.workspace_id,this.#selection.workload_id);
      if(locked.intent_id!==result.intent_id||locked.acceptance_id!==result.acceptance_id||locked.delegation_id!==result.delegation_id)return fail();
      const rows=await db.query(`SELECT i.intent_id::text,i.registration_key,i.registration_sha256,i.source_evidence_sha256,
        i.b1_sha256,i.workspace_id,i.owner_user_id,i.session_id,i.session_generation::text,i.authority_revision::text,
        i.expires_at_ms::text,floor(extract(epoch FROM i.created_at)*1000)::bigint::text AS created_at_ms,
        r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256,
        floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
        FROM elp210_c2_p7_candidate.owner_intents i JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id
        WHERE i.intent_id=$1 AND r.cycle_sha256=$2`,[result.intent_id,this.#selection.cycle_sha256]);
      const row=rows.rows[0];if(rows.rowCount!==1||!row||row.confirmation_sha256!==confirmationSha256)return fail();
      const created=Number(row.created_at_ms),expiry=Number(row.expires_at_ms),now=Number(row.now_ms);
      verifyOwner.call(this.#ownerAuth,attestation,expected,now);
      if(!Number.isSafeInteger(created)||!Number.isSafeInteger(expiry)||!Number.isSafeInteger(now)||
        created<0||created>now||now>=expiry)return fail();
      const claims:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:this.#selection.cycle_sha256,
        confirmation_sha256:row.confirmation_sha256,intent_id:row.intent_id,registration_key:row.registration_key,
        registration_sha256:row.registration_sha256,source_evidence_sha256:row.source_evidence_sha256,
        b1_sha256:row.b1_sha256,workspace_id:row.workspace_id,owner_user_id:row.owner_user_id,session_id:row.session_id,
        session_generation:Number(row.session_generation),authority_revision:Number(row.authority_revision),
        acceptance_sha256:row.acceptance_sha256,delegation_sha256:row.delegation_sha256,
        issued_at_ms:created,expires_at_ms:expiry};
      if(!z.number().int().nonnegative().safe().safeParse(claims.session_generation).success||
        !z.number().int().nonnegative().safe().safeParse(claims.authority_revision).success)return fail();
      const payload=Buffer.from(JSON.stringify(claims));
      try {proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:sign(null,payload,this.#key).toString("base64url")}));}
      finally {payload.fill(0);}
      const retained=await retainLocked(claims,proof);
      // Store commit is independent. If this DB commit/reply is lost the same
      // authenticated owner may retry the same original; deterministic claims
      // and signature prohibit accidental replacement in custody.
      this.#stable();const again=await checkLocked.call(this.#fence,db,person,this.#selection.workspace_id,this.#selection.workload_id);
      if(again.intent_id!==result.intent_id)return fail();
      verifyOwner.call(this.#ownerAuth,attestation,expected,Date.now());
      await db.query("COMMIT");
      return Object.freeze({state:"WITNESS_RETAINED_NOT_AUTHORIZED" as const,intent_id:result.intent_id,
        acceptance_id:result.acceptance_id,delegation_id:result.delegation_id,proof_sha256:retained.proof_sha256});
    } catch(error) {try{await db.query("ROLLBACK");}catch{}throw error;}
    finally {proof?.fill(0);}
    });
    } finally {attestation.fill(0);}
  }
}
