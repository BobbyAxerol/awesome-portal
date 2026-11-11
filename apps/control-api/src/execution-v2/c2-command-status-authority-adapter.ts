import type {AccessActor} from "./access.contract";
import {CurrentHumanCandidate,currentHumanBinding,type CurrentHumanBinding,type CommandStatusContextLink} from "./current-human-candidate";
import {C2CustodiedIssuerCandidate} from "./c2-custodied-issuer-candidate";
import {pmHttpRequestDigest,type PmHttpRequestBytes} from "./pm-http-request-binding";

/** Unmounted composition for CommandSourceAssertionAuthority only. Its
 * outer authority must authenticate the current requester, source original,
 * callback and receiver. P7 READ/HISTORY does not grant command authority;
 * this adapter never submits a command or manufactures a source/Edge ACK. */
const match=C2CustodiedIssuerCandidate.prototype.matchesIssuer;
const issue=C2CustodiedIssuerCandidate.prototype.issueStatus;
const resume=C2CustodiedIssuerCandidate.prototype.resumeStatus;
const revalidate=C2CustodiedIssuerCandidate.prototype.revalidateStatus;
const terminal=CurrentHumanCandidate.prototype.canReplaceResolvedIssue;
const ack=CurrentHumanCandidate.prototype.acknowledgeCommandStatusIssue;
const matchesInstallation=CurrentHumanCandidate.prototype.matchesC2Installation;
const bounds=Object.freeze({request_bytes:1_048_576});
type Issued=Awaited<ReturnType<CurrentHumanCandidate["issue"]>>;
type Identity=Omit<Issued,"token">;
const fail=():never=>{throw new Error("C2_STATUS_ADAPTER_UNAVAILABLE");};

export class C2CommandStatusAuthorityAdapter {
  readonly #issuer:CurrentHumanCandidate;readonly #custodied:C2CustodiedIssuerCandidate;
  readonly #owner:string;readonly #workspace:string;readonly #workload:string;
  constructor(issuer:CurrentHumanCandidate,custodied:C2CustodiedIssuerCandidate,selection:{owner:string;workspace:string;workload:string}) {
    if(!issuer||Object.getPrototypeOf(issuer)!==CurrentHumanCandidate.prototype||
      !custodied||Object.getPrototypeOf(custodied)!==C2CustodiedIssuerCandidate.prototype||
      custodied.matchesIssuer!==match||custodied.issueStatus!==issue||custodied.resumeStatus!==resume||
      custodied.revalidateStatus!==revalidate||!match.call(custodied,issuer)||
      !selection||![selection.owner,selection.workspace,selection.workload].every(v=>typeof v==="string"&&
        v.length>0&&v.length<=128&&v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v))||
      !matchesInstallation.call(issuer,selection.workspace,selection.workload))throw new Error("C2_STATUS_ADAPTER_UNAVAILABLE");
    this.#issuer=issuer;this.#custodied=custodied;this.#owner=selection.owner;
    this.#workspace=selection.workspace;this.#workload=selection.workload;
  }
  #scope(actor:AccessActor,binding:CurrentHumanBinding):CurrentHumanBinding {
    const b=currentHumanBinding.parse(binding);
    if(!actor||actor.user_id!==this.#owner||b.workspace_id!==this.#workspace||b.workload_id!==this.#workload||b.environment!=="paper"||
      this.#custodied.matchesIssuer!==match||this.#custodied.issueStatus!==issue||this.#custodied.resumeStatus!==resume||
      this.#custodied.revalidateStatus!==revalidate||!match.call(this.#custodied,this.#issuer)||
      !matchesInstallation.call(this.#issuer,this.#workspace,this.#workload))return fail();
    return b;
  }
  async issueCommandStatus(actor:AccessActor,binding:CurrentHumanBinding,link:CommandStatusContextLink,request?:PmHttpRequestBytes):Promise<Issued> {
    const b=this.#scope(actor,binding);
    if(!request||pmHttpRequestDigest(request,bounds)!==b.request_digest)return fail();
    return issue.call(this.#custodied,actor,this.#owner,request,bounds,link);
  }
  async resumeCommandStatusIssue(actor:AccessActor,binding:CurrentHumanBinding,leaseId:string,request?:PmHttpRequestBytes,
    link?:CommandStatusContextLink):Promise<Issued> {
    const b=this.#scope(actor,binding);
    if(!request||!link||pmHttpRequestDigest(request,bounds)!==b.request_digest)return fail();
    return resume.call(this.#custodied,actor,this.#owner,request,bounds,leaseId,link);
  }
  async revalidateIssue(actor:AccessActor,binding:CurrentHumanBinding,issued:Issued,link?:CommandStatusContextLink):Promise<void> {
    const b=this.#scope(actor,binding);if(!link)return fail();
    return revalidate.call(this.#custodied,actor,this.#owner,b,issued,link);
  }
  async canReplaceResolvedIssue(actor:AccessActor,binding:CurrentHumanBinding,issued:Identity):Promise<boolean> {
    return terminal.call(this.#issuer,actor,this.#scope(actor,binding),issued);
  }
  async acknowledgeCommandStatusIssue(actor:AccessActor,binding:CurrentHumanBinding,issued:Identity,responseDigest:string):Promise<boolean> {
    return ack.call(this.#issuer,actor,this.#scope(actor,binding),issued,responseDigest);
  }
}
