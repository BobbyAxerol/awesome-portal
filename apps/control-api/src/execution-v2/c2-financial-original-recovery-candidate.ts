import type {AccessActor} from "./access.contract";
import {accessDigest} from "./access-digest";
import {C2CustodiedIssuerCandidate} from "./c2-custodied-issuer-candidate";
import {C2FinancialOriginalCandidate,type C2FinancialOriginalInput} from "./c2-financial-original-candidate";
import type {PmHttpRequestBounds,PmHttpRequestBytes} from "./pm-http-request-binding";

/** Unmounted internal composition. A caller must independently authenticate
 * its selection and enforce sole HTTP custody; this does not confer either. */
const prepare=C2FinancialOriginalCandidate.prototype.prepare,reserve=C2FinancialOriginalCandidate.prototype.reserve,
  locate=C2FinancialOriginalCandidate.prototype.locate;
const issue=C2CustodiedIssuerCandidate.prototype.issueFinancial,resume=C2CustodiedIssuerCandidate.prototype.resumeFinancial,
  revalidate=C2CustodiedIssuerCandidate.prototype.revalidateFinancial,terminal=C2CustodiedIssuerCandidate.prototype.verifyFinancialTerminal;
export class C2FinancialOriginalRecoveryCandidate {
  constructor(private readonly store:C2FinancialOriginalCandidate,private readonly issuer:C2CustodiedIssuerCandidate) {
    if(!store||Object.getPrototypeOf(store)!==C2FinancialOriginalCandidate.prototype||store.prepare!==prepare||store.reserve!==reserve||store.locate!==locate||
      !issuer||Object.getPrototypeOf(issuer)!==C2CustodiedIssuerCandidate.prototype||issuer.issueFinancial!==issue||issuer.resumeFinancial!==resume||issuer.revalidateFinancial!==revalidate||issuer.verifyFinancialTerminal!==terminal)
      throw new Error("C2_FINANCIAL_RECOVERY_UNAVAILABLE");
  }
  #check():void {
    if(this.store.prepare!==prepare||this.store.reserve!==reserve||this.store.locate!==locate||this.issuer.issueFinancial!==issue||this.issuer.resumeFinancial!==resume||this.issuer.revalidateFinancial!==revalidate||this.issuer.verifyFinancialTerminal!==terminal)
      throw new Error("C2_FINANCIAL_RECOVERY_UNAVAILABLE");
  }
  prepare(input:C2FinancialOriginalInput) {this.#check();return prepare.call(this.store,input);}
  reserve(context:string,input:C2FinancialOriginalInput) {this.#check();return reserve.call(this.store,context,input);}
  locate(context:string,input:C2FinancialOriginalInput) {this.#check();return locate.call(this.store,context,input);}
  matchesCustodied(issuer:C2CustodiedIssuerCandidate):boolean {this.#check();return this.issuer===issuer;}
  #link(context:string,input:C2FinancialOriginalInput) {
    if(typeof context!=="string"||!/^[A-Za-z0-9_-]{43}$/u.test(context))throw new Error("C2_FINANCIAL_RECOVERY_UNAVAILABLE");
    return {context_digest:accessDigest(context),receiver_id:input.receiver_id,binding_digest:input.binding_digest,expires_at_ms:input.expires_at_ms};
  }
  async issue(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    context:string,input:C2FinancialOriginalInput) {
    this.#check();return issue.call(this.issuer,actor,owner,request,bounds,this.#link(context,input));
  }
  async recover(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    context:string,input:C2FinancialOriginalInput) {
    this.#check();const link=this.#link(context,input),lease=await locate.call(this.store,context,input);
    this.#check();return resume.call(this.issuer,actor,owner,request,bounds,lease,link);
  }
  async revalidate(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    issued:Awaited<ReturnType<typeof issue>>,context:string,input:C2FinancialOriginalInput):Promise<void> {
    this.#check();return revalidate.call(this.issuer,actor,owner,request,bounds,issued,this.#link(context,input));
  }
  async verifyTerminal(actor:AccessActor,owner:string,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,
    issued:Awaited<ReturnType<typeof issue>>,context:string,input:C2FinancialOriginalInput) {
    this.#check();const link=this.#link(context,input),lease=await locate.call(this.store,context,input);
    this.#check();if(lease!==issued.lease_id)throw new Error("C2_FINANCIAL_RECOVERY_UNAVAILABLE");
    return terminal.call(this.issuer,actor,owner,request,bounds,issued,link);
  }
}
