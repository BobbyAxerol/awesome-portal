import type { AccessActor } from "./access.contract";
import { CurrentHumanCandidate, type CommandStatusContextLink, type CurrentHumanBinding, type C2FinancialOriginalLink } from "./current-human-candidate";
import {pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes} from "./pm-http-request-binding";
import { RestoreIndependentCustodyCandidate } from "./restore-independent-custody-candidate";
import {C2P7IssuerFenceCandidate} from "./c2-p7-issuer-fence-candidate";
import {appendCustodiedOriginal} from "./c2-custody-append-contention";
import {C2CustodyPendingError} from "./c2-custody-pending-error";
export {C2CustodyPendingError} from "./c2-custody-pending-error";

/** UNMOUNTED candidate: this wrapper will not return a bearer before verified
 * independent custody. It is not an HTTP delivery fence or restore cutover. */
const issue=CurrentHumanCandidate.prototype.issueC2ProtectedOwner;
const issueStatus=CurrentHumanCandidate.prototype.issueC2ProtectedOwnerCommandStatus;
const revalidateStatus=CurrentHumanCandidate.prototype.revalidateC2ProtectedOwnerCommandStatus;
const resume=CurrentHumanCandidate.prototype.resumeC2ProtectedOwnerIssue;
const revalidate=CurrentHumanCandidate.prototype.revalidateC2ProtectedOwnerIssue;
const verifyFinancialTerminal=CurrentHumanCandidate.prototype.verifyC2FinancialTerminal;
const preflight=RestoreIndependentCustodyCandidate.prototype.preflightOriginal;
const usesCustodySource=CurrentHumanCandidate.prototype.usesCustodySource;
const requiresC2DeliverySchema=CurrentHumanCandidate.prototype.requiresC2DeliverySchema;
const custodyBindingDigest=RestoreIndependentCustodyCandidate.prototype.bindingDigest;
const hasSourceProofVault=RestoreIndependentCustodyCandidate.prototype.hasSourceProofVault;
type Issued=Awaited<ReturnType<typeof issue>>;
function snapshot(actor:AccessActor,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds) {
  // Validate the caller's original exact shape before copying it, then retain
  // private bytes across every asynchronous check and same-original retry.
  pmHttpRequestDigest(request,bounds);
  return {actor:{user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation},
    request:{method:request.method,raw_path:Buffer.from(request.raw_path),query_string:Buffer.from(request.query_string),body:Buffer.from(request.body)},
    bounds:{request_bytes:bounds.request_bytes}};
}

export class C2CustodiedIssuerCandidate {
  readonly #issuer:CurrentHumanCandidate;
  readonly #custody:RestoreIndependentCustodyCandidate;
  readonly #p7?:C2P7IssuerFenceCandidate;
  constructor(issuer:CurrentHumanCandidate,custody:RestoreIndependentCustodyCandidate,p7?:C2P7IssuerFenceCandidate) {
    if(!issuer||Object.getPrototypeOf(issuer)!==CurrentHumanCandidate.prototype||
      !custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
      !usesCustodySource.call(issuer,custody)||!hasSourceProofVault.call(custody)||
      (p7!==undefined&&(Object.getPrototypeOf(p7)!==C2P7IssuerFenceCandidate.prototype||
        p7.checkLocked!==C2P7IssuerFenceCandidate.prototype.checkLocked)))
      throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    this.#issuer=issuer;this.#custody=custody;this.#p7=p7;
  }
  /** Identity comparison for an internal composition, not an authority grant. */
  matchesIssuer(issuer:CurrentHumanCandidate):boolean {return this.#issuer===issuer&&this.#p7!==undefined;}
  async issue(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds):Promise<Issued> {
    const captured=snapshot(actor,request,bounds);
    // A known-full or unavailable custody must not create an ISSUED lease.
    // This is deliberately only advisory; concurrent issuers still serialize
    // at append and the loser resumes its exact original, not a fresh lease.
    if(!requiresC2DeliverySchema.call(this.#issuer))await preflight.call(this.#custody);
    const issued=await issue.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,custodyBindingDigest.call(this.#custody),this.#p7,this.#custody);
    if(requiresC2DeliverySchema.call(this.#issuer))return issued;
    return this.#recordThenReturn(captured.actor,owner,captured.request,captured.bounds,issued);
  }
  async resume(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,leaseId?:string):Promise<Issued> {
    const captured=snapshot(actor,request,bounds);
    const issued=await resume.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,leaseId,custodyBindingDigest.call(this.#custody),this.#p7,this.#custody);
    if(requiresC2DeliverySchema.call(this.#issuer))return issued;
    return this.#recordThenReturn(captured.actor,owner,captured.request,captured.bounds,issued);
  }
  /** Internal opt-in seam; the issuer binds/rechecks this exact financial
   * context under its authority transaction. Not an HTTP delivery fence. */
  async issueFinancial(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    link:C2FinancialOriginalLink):Promise<Issued> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7)throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds),original={...link};
    return issue.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,
      custodyBindingDigest.call(this.#custody),this.#p7,this.#custody,original);
  }
  async resumeFinancial(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    leaseId:string,link:C2FinancialOriginalLink):Promise<Issued> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7)throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds),original={...link};
    return resume.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,leaseId,
      custodyBindingDigest.call(this.#custody),this.#p7,this.#custody,undefined,original);
  }
  async revalidateFinancial(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    issued:Issued,link:C2FinancialOriginalLink):Promise<void> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7||
      !RestoreIndependentCustodyCandidate.prototype.hasAuthenticatedJournal.call(this.#custody))
      throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds),original={...link};
    await revalidate.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,issued,
      custodyBindingDigest.call(this.#custody),this.#p7,original);
  }
  /** A signed source terminal is NOT an Edge ACK or successor authority. */
  async verifyFinancialTerminal(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    issued:Issued,link:C2FinancialOriginalLink):Promise<{state:"VERIFIED_NOT_ACK";phase:"COMMITTED"|"ROLLED_BACK"}> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7||
      !RestoreIndependentCustodyCandidate.prototype.hasAuthenticatedJournal.call(this.#custody))
      throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds),original={...link};
    return verifyFinancialTerminal.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,issued,
      original,this.#custody,this.#p7);
  }
  /** Unmounted C2 financial seam: recheck this exact owner's request and
   * retained assertion. It does not authenticate a source, persist a
   * financial correlation, acknowledge delivery or fence an HTTP write. */
  async revalidate(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,issued:Issued):Promise<void> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7||
      !RestoreIndependentCustodyCandidate.prototype.hasAuthenticatedJournal.call(this.#custody))
      throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds);
    await revalidate.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,issued,
      custodyBindingDigest.call(this.#custody),this.#p7);
  }
  /** Explicit STATUS-only seam for a separately authenticated STATUS
   * authority. This candidate is unmounted and does not establish such an
   * authority, a source receipt or an Edge delivery ACK. */
  async issueStatus(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    link:CommandStatusContextLink):Promise<Issued> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7)throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds);
    return issueStatus.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,link,
      custodyBindingDigest.call(this.#custody),this.#p7,this.#custody);
  }
  async resumeStatus(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    leaseId:string,link:CommandStatusContextLink):Promise<Issued> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7)throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const captured=snapshot(actor,request,bounds);
    return resume.call(this.#issuer,captured.actor,owner,captured.request,captured.bounds,leaseId,
      custodyBindingDigest.call(this.#custody),this.#p7,this.#custody,link);
  }
  async revalidateStatus(actor:AccessActor,owner:string,binding:CurrentHumanBinding,issued:Issued,
    link:CommandStatusContextLink):Promise<void> {
    if(!requiresC2DeliverySchema.call(this.#issuer)||!this.#p7)throw new Error("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    return revalidateStatus.call(this.#issuer,actor,owner,binding,issued,link,
      custodyBindingDigest.call(this.#custody),this.#p7,this.#custody);
  }
  async #recordThenReturn(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,issued:Issued):Promise<Issued> {
    try {
      // The lease UUID is the stable operation ID. After an ambiguous commit,
      // inventory recovers its original generation; never mint a replacement.
      await appendCustodiedOriginal(this.#custody,"ISSUED_HUMAN_ASSERTION",issued.lease_id,issued.token);
      await revalidate.call(this.#issuer,actor,owner,request,bounds,issued,custodyBindingDigest.call(this.#custody),this.#p7);
      return issued;
    } catch {throw new C2CustodyPendingError(issued.lease_id);}
  }
}
