import {createHash} from "node:crypto";
import {decodeJwt} from "jose";
import type {Pool} from "pg";
import {CurrentHumanCandidate,CurrentHumanLeaseError} from "./current-human-candidate";
import {RestoreIndependentCustodyCandidate} from "./restore-independent-custody-candidate";
import {C2P7IssuerFenceCandidate} from "./c2-p7-issuer-fence-candidate";
import {appendCustodiedOriginal} from "./c2-custody-append-contention";

/** Unmounted: stores the verified source proof encrypted before allowing Core
 * to resolve and emit its ACK. This is not a qualified independent authority, a source
 * ACK census, an old-holder fence, or a recovery/cutover barrier. */
const usesPool=CurrentHumanCandidate.prototype.usesPool;
const usesSourcePool=RestoreIndependentCustodyCandidate.prototype.usesSourcePool;
const hasSourceProofVault=RestoreIndependentCustodyCandidate.prototype.hasSourceProofVault;
const enterWithCustody=CurrentHumanCandidate.prototype.enterWithCustody;
const resolveWithCustody=CurrentHumanCandidate.prototype.resolveWithCustody;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Namespaced deterministic operation identity. A retry cannot create a second
 * custody event for a lease; different bytes for the same operation conflict. */
function terminalOperation(lease:string,kind:"ENTER"|"UNKNOWN"|"TERMINAL"):string {
  const bytes=createHash("sha256").update(`portal.c2-${kind.toLowerCase()}-custody.v1\0`).update(lease).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x40; bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=bytes.toString("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export class C2CustodiedTerminalCandidate {
  readonly #candidate:CurrentHumanCandidate;
  readonly #custody:RestoreIndependentCustodyCandidate;
  readonly #p7?:C2P7IssuerFenceCandidate;
  constructor(pool:Pool,candidate:CurrentHumanCandidate,custody:RestoreIndependentCustodyCandidate,p7?:C2P7IssuerFenceCandidate) {
    if(!candidate||Object.getPrototypeOf(candidate)!==CurrentHumanCandidate.prototype||!usesPool.call(candidate,pool)||
      !custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||!usesSourcePool.call(custody,pool)||
      !hasSourceProofVault.call(custody)||
      (p7!==undefined&&(Object.getPrototypeOf(p7)!==C2P7IssuerFenceCandidate.prototype||
        p7.checkLocked!==C2P7IssuerFenceCandidate.prototype.checkLocked||p7.bindingDigest!==C2P7IssuerFenceCandidate.prototype.bindingDigest)))
      throw new Error("C2_CUSTODIED_TERMINAL_CONFIG_INVALID");
    this.#candidate=candidate;
    this.#custody=custody;
    this.#p7=p7;
  }
  usesCandidate(candidate:CurrentHumanCandidate):boolean { return this.#candidate===candidate; }
  async enter(humanToken:string,proof:string):Promise<{lease_id:string;attempt_id:string}> {
    // Core's admission is one-shot and is committed before custody. Until the
    // independent write succeeds we return no ACK, so the source cannot borrow
    // a transaction. Lost ACK is uncertain, NEVER permission to retry ENTER.
    const admitted=await enterWithCustody.call(this.#candidate,humanToken,proof,this.#custody,this.#p7);
    if(!uuid.test(admitted.lease_id))throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
    const operation=terminalOperation(admitted.lease_id,"ENTER");
    await appendCustodiedOriginal(this.#custody,"SIGNED_SOURCE_ENTER",operation,proof);
    return admitted;
  }
  /** Recovery only: retain an authenticated ENTER proof for an attempt
   * already committed by Core. A new custody append requires a fresh proof;
   * an exact retained proof can be checked after expiry. This never calls ENTER, resumes source work,
   * emits an entry ACK, or makes a recovery/cutover decision. Custody checks
   * the pinned source, exact current lease/attempt and original under locks. */
  async retainEnteredProof(proof:string):Promise<{state:"RETAINED_NOT_ENTRY_ACK"}> {
    if(typeof proof!=="string"||Buffer.byteLength(proof)>8192)throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");
    let claims:ReturnType<typeof decodeJwt>;
    try {claims=decodeJwt(proof);} catch {throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");}
    if(claims.phase!=="ENTER"||typeof claims.lease_id!=="string"||!uuid.test(claims.lease_id))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
    await appendCustodiedOriginal(this.#custody,"SIGNED_SOURCE_ENTER",terminalOperation(claims.lease_id,"ENTER"),proof);
    return {state:"RETAINED_NOT_ENTRY_ACK"};
  }
  async resolve(proof:string):Promise<{replayed:boolean;phase:string}> {
    if(typeof proof!=="string"||Buffer.byteLength(proof)>8192)throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");
    let claims:ReturnType<typeof decodeJwt>;
    try {claims=decodeJwt(proof);} catch {throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");}
    if((claims.phase!=="COMMITTED"&&claims.phase!=="ROLLED_BACK"&&claims.phase!=="UNKNOWN")||typeof claims.lease_id!=="string"||!uuid.test(claims.lease_id))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_REQUIRED");
    const unknown=claims.phase==="UNKNOWN",operation=terminalOperation(claims.lease_id,unknown?"UNKNOWN":"TERMINAL");
    // append authenticates the proof and original under row locks. Failure,
    // including uncertain commit, never calls resolve or returns a success.
    await appendCustodiedOriginal(this.#custody,unknown?"SIGNED_SOURCE_UNKNOWN":"SIGNED_SOURCE_TERMINAL",operation,proof);
    return resolveWithCustody.call(this.#candidate,proof,this.#custody);
  }
}
