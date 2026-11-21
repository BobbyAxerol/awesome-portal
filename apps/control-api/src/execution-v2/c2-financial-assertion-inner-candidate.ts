import type {AccessActor} from "./access.contract";
import type {CurrentHumanBinding} from "./current-human-candidate";
import type {PmHttpRequestBytes} from "./pm-http-request-binding";
import {C2FinancialAuthorityAdapter} from "./c2-financial-authority-adapter";

/** Unmounted adapter for the financial assertion authority. It supplies no
 * source authentication, durable context, terminal ACK or HTTP custody.
 * In particular it does not implement successor/terminal permission. */
const issue=C2FinancialAuthorityAdapter.prototype.issue;
const resume=C2FinancialAuthorityAdapter.prototype.resume;
const revalidate=C2FinancialAuthorityAdapter.prototype.revalidate;
type Issued=Awaited<ReturnType<typeof issue>>;
export class C2FinancialAssertionInnerCandidate {
  readonly #adapter:C2FinancialAuthorityAdapter;
  constructor(adapter:C2FinancialAuthorityAdapter) {
    if(!adapter||Object.getPrototypeOf(adapter)!==C2FinancialAuthorityAdapter.prototype||
      adapter.issue!==issue||adapter.resume!==resume||adapter.revalidate!==revalidate)throw new Error("C2_FINANCIAL_INNER_UNAVAILABLE");
    this.#adapter=adapter;
  }
  async issueBoundRequest(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes):Promise<Issued> {
    if(this.#adapter.issue!==issue||this.#adapter.resume!==resume||this.#adapter.revalidate!==revalidate)throw new Error("C2_FINANCIAL_INNER_UNAVAILABLE");
    return issue.call(this.#adapter,actor,binding,request);
  }
  async resumeBoundRequest(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,leaseId:string):Promise<Issued> {
    if(this.#adapter.issue!==issue||this.#adapter.resume!==resume||this.#adapter.revalidate!==revalidate)throw new Error("C2_FINANCIAL_INNER_UNAVAILABLE");
    return resume.call(this.#adapter,actor,binding,request,leaseId);
  }
  async revalidateBoundRequest(actor:AccessActor,binding:CurrentHumanBinding,issued:Issued,request:PmHttpRequestBytes):Promise<void> {
    if(this.#adapter.issue!==issue||this.#adapter.resume!==resume||this.#adapter.revalidate!==revalidate)throw new Error("C2_FINANCIAL_INNER_UNAVAILABLE");
    await revalidate.call(this.#adapter,actor,binding,request,issued);
  }
}
