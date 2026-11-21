import {createHmac} from "node:crypto";
import {z} from "zod";
import type {AccessActor} from "./access.contract";
import {CurrentHumanLeaseError,type CurrentHumanBinding} from "./current-human-candidate";
import {C2CustodiedIssuerCandidate} from "./c2-custodied-issuer-candidate";
import {C2FinancialAuthorityAdapter} from "./c2-financial-authority-adapter";
import {C2FinancialOriginalRecoveryCandidate} from "./c2-financial-original-recovery-candidate";
import type {FinancialDeliveryContext} from "./financial-source-assertion";
import type {PmHttpRequestBytes} from "./pm-http-request-binding";

/** SOURCE/TEST ONLY. The in-memory authority supplies its private context; a
 * deterministic, domain-separated locator links each delivery to its own
 * durable ISSUE. It does not persist the parent context/sequence/Edge ACK,
 * authorize a successor, fence a former process, or own HTTP delivery. */
const identifier=z.string().min(1).max(128).regex(/^[^\u0000-\u0020\u007f]+$/u);
const selectionSchema=z.object({owner:identifier,receiver_id:identifier,
  binding_digest:z.string().regex(/^sha256:[a-f0-9]{64}$/u)}).strict();
const originalSchema=z.object({original_context:z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  expires_at_ms:z.number().int().positive().safe(),delivery_sequence:z.number().int().nonnegative().max(63),
  receiver_id:identifier,binding_digest:z.string().regex(/^sha256:[a-f0-9]{64}$/u)}).strict();
const checkScope=C2FinancialAuthorityAdapter.prototype.validateBoundRequest,adapterMatch=C2FinancialAuthorityAdapter.prototype.matchesCustodied;
const recoveryMatch=C2FinancialOriginalRecoveryCandidate.prototype.matchesCustodied;
const reserve=C2FinancialOriginalRecoveryCandidate.prototype.reserve,locate=C2FinancialOriginalRecoveryCandidate.prototype.locate,
  issue=C2FinancialOriginalRecoveryCandidate.prototype.issue,
  recover=C2FinancialOriginalRecoveryCandidate.prototype.recover,revalidate=C2FinancialOriginalRecoveryCandidate.prototype.revalidate,
  verifyTerminal=C2FinancialOriginalRecoveryCandidate.prototype.verifyTerminal;
const fail=():never=>{throw new Error("C2_FINANCIAL_DURABLE_INNER_UNAVAILABLE");};
const bounds=Object.freeze({request_bytes:1_048_576});
type Issued=Awaited<ReturnType<typeof issue>>;

export class C2FinancialDurableInnerCandidate {
  readonly #selection:z.infer<typeof selectionSchema>;
  constructor(private readonly adapter:C2FinancialAuthorityAdapter,private readonly recovery:C2FinancialOriginalRecoveryCandidate,
    private readonly custodied:C2CustodiedIssuerCandidate,selection:z.infer<typeof selectionSchema>) {
    this.#selection=selectionSchema.parse(selection);this.#check();
  }
  #check():void {
    if(!this.adapter||Object.getPrototypeOf(this.adapter)!==C2FinancialAuthorityAdapter.prototype||
      this.adapter.validateBoundRequest!==checkScope||this.adapter.matchesCustodied!==adapterMatch||
      !this.recovery||Object.getPrototypeOf(this.recovery)!==C2FinancialOriginalRecoveryCandidate.prototype||
      this.recovery.matchesCustodied!==recoveryMatch||this.recovery.reserve!==reserve||this.recovery.locate!==locate||this.recovery.issue!==issue||
      this.recovery.recover!==recover||this.recovery.revalidate!==revalidate||this.recovery.verifyTerminal!==verifyTerminal||
      !this.custodied||Object.getPrototypeOf(this.custodied)!==C2CustodiedIssuerCandidate.prototype||
      !adapterMatch.call(this.adapter,this.custodied)||!recoveryMatch.call(this.recovery,this.custodied))return fail();
  }
  #original(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,raw:FinancialDeliveryContext) {
    this.#check();checkScope.call(this.adapter,actor,binding,request);
    const selected=originalSchema.parse(raw),key=Buffer.from(selected.original_context,"base64url");
    let context:string;
    try {
      if(key.length!==32||key.toString("base64url")!==selected.original_context||actor.user_id!==this.#selection.owner||
        selected.receiver_id!==this.#selection.receiver_id||selected.binding_digest!==this.#selection.binding_digest)return fail();
      context=createHmac("sha256",key).update("portal.c2.financial.delivery.v1\0","utf8")
        .update(String(selected.delivery_sequence),"utf8").digest("base64url");
    } finally {key.fill(0);}
    return {context,input:{subject_id:actor.user_id,session_id:actor.session_id,session_revision:actor.session_generation,
      workspace_id:binding.workspace_id,workload_id:binding.workload_id,receiver_id:selected.receiver_id,
      binding_digest:selected.binding_digest,request_digest:binding.request_digest,expires_at_ms:selected.expires_at_ms}};
  }
  // The financial authority requires the legacy interface, but accidental
  // calls without explicit delivery correlation must fail closed.
  async issueBoundRequest():Promise<Issued> {return fail();}
  async resumeBoundRequest():Promise<Issued> {return fail();}
  async revalidateBoundRequest():Promise<void> {return fail();}
  async issueBoundDelivery(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,raw:FinancialDeliveryContext):Promise<Issued> {
    const selected=this.#original(actor,binding,request,raw),existing=await reserve.call(this.recovery,selected.context,selected.input);
    this.#check();
    if(existing.lease_id!==null)
      return recover.call(this.recovery,actor,this.#selection.owner,request,bounds,selected.context,selected.input);
    try {
      return await issue.call(this.recovery,actor,this.#selection.owner,request,bounds,selected.context,selected.input);
    } catch(error) {
      // Another process can reserve the same unbound locator before either
      // ISSUE obtains the authority lock. Only the issuer's explicit
      // same-original refusal permits a lookup; an arbitrary failure or an
      // unrelated request must never become a new issuance or a guessed lease.
      if(!(error instanceof CurrentHumanLeaseError)||error.code!=="CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED")throw error;
      this.#check();
      try {await locate.call(this.recovery,selected.context,selected.input);}
      catch {throw error;}
      this.#check();
      return recover.call(this.recovery,actor,this.#selection.owner,request,bounds,selected.context,selected.input);
    }
  }
  async resumeBoundDelivery(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,leaseId:string,
    raw:FinancialDeliveryContext):Promise<Issued> {
    const selected=this.#original(actor,binding,request,raw),existing=await locate.call(this.recovery,selected.context,selected.input);
    this.#check();if(existing!==leaseId)return fail();
    return recover.call(this.recovery,actor,this.#selection.owner,request,bounds,selected.context,selected.input);
  }
  /** Locator only, not a grant or permission to deliver. Recovery must still
   * resume the exact lease through current P7/session and custody checks. */
  async locateBoundDelivery(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,
    raw:FinancialDeliveryContext):Promise<string> {
    const selected=this.#original(actor,binding,request,raw);
    const lease=await locate.call(this.recovery,selected.context,selected.input);
    this.#check();return lease;
  }
  async revalidateBoundDelivery(actor:AccessActor,binding:CurrentHumanBinding,issued:Issued,request:PmHttpRequestBytes,
    raw:FinancialDeliveryContext):Promise<void> {
    const selected=this.#original(actor,binding,request,raw),existing=await locate.call(this.recovery,selected.context,selected.input);
    this.#check();if(existing!==issued.lease_id)return fail();
    return revalidate.call(this.recovery,actor,this.#selection.owner,request,bounds,issued,selected.context,selected.input);
  }
  /** Read-only source terminal evidence. Deliberately not named or wired as
   * canReplaceResolvedIssue: no recipient ACK or successor fence exists yet. */
  async verifyBoundTerminal(actor:AccessActor,binding:CurrentHumanBinding,issued:Issued,request:PmHttpRequestBytes,
    raw:FinancialDeliveryContext) {
    const selected=this.#original(actor,binding,request,raw);this.#check();
    return verifyTerminal.call(this.recovery,actor,this.#selection.owner,request,bounds,issued,selected.context,selected.input);
  }
}
