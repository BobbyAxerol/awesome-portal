import type {AccessActor} from "./access.contract";
import type {ServerResponse} from "node:http";
import {randomBytes} from "node:crypto";
import {accessDigest} from "./access-digest";
import {C2FinancialDurableInnerCandidate} from "./c2-financial-durable-inner-candidate";
import {C2FinancialParentCandidate} from "./c2-financial-parent-candidate";
import {captureFinancialAssertionRequest,captureFinancialRegistration,FinancialSourceAssertionAuthority,
  FinancialSourceAssertionError,type FinancialSourceAssertionCompletionResponse,
  type FinancialSourceAssertionRequest,type FinancialSourceAssertionResponse,type FinancialSourceAssertionSelection} from "./financial-source-assertion";
import {pmHttpRequestDigest} from "./pm-http-request-binding";

/** SOURCE/TEST ONLY. No transport or runtime mount. The owner must durably
 * retain operationId, qualify independent storage/key/roles, fence old
 * holders and keep HTTP custody before using this in a real composition. */
const invalid=():never=>{throw new Error("C2_FINANCIAL_PARENT_ORCHESTRATION_UNAVAILABLE");};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
type Registration=ReturnType<typeof captureFinancialRegistration>;
type Entry={registration:Registration;digest:string;context:string};
type Limits={ttl_ms:number;maximum_contexts:number;maximum_requests_per_context:number};
type TestScope={operationId:string;parentContext:string;responses:Set<ServerResponse>};
type TestDelivery=(context:string,request:FinancialSourceAssertionRequest,output:FinancialSourceAssertionResponse,
  response:ServerResponse,remainingMs:number)=>Promise<void>;

export class C2FinancialParentOrchestratorCandidate {
  readonly #authority:FinancialSourceAssertionAuthority;
  readonly #entries=new Map<string,Entry>();
  readonly #pending=new Set<string>();
  readonly #transportContexts=new Map<string,TestScope>();
  readonly #transportOperations=new Set<string>();
  #stopped=false;
  constructor(private readonly parent:C2FinancialParentCandidate,private readonly inner:C2FinancialDurableInnerCandidate,
    limits:Limits) {
    if(!(parent instanceof C2FinancialParentCandidate)||!(inner instanceof C2FinancialDurableInnerCandidate))
      throw new Error("C2_FINANCIAL_PARENT_ORCHESTRATION_UNAVAILABLE");
    this.#authority=new FinancialSourceAssertionAuthority(inner,limits);
  }
  #start(operationId:string):void {
    if(this.#stopped||typeof operationId!=="string"||!uuid.test(operationId)||this.#pending.has(operationId)||
      this.#entries.has(operationId)||this.#pending.size>=16)return invalid();
    this.#pending.add(operationId);
  }
  #current():void {if(this.#stopped)return invalid();}
  #entry(operationId:string,registration:Registration):Entry {
    this.#current();const entry=this.#entries.get(operationId);
    if(!entry||entry.digest!==accessDigest(registration))return invalid();
    return entry;
  }
  /** No private context escapes until the parent write has committed. A failed
   * or ambiguous save is refused, never replaced with another operation. */
  async begin(operationId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection):Promise<{expires_at_ms:number}> {
    const registration=captureFinancialRegistration(actor,selection);this.#start(operationId);
    let context:string|undefined;
    try {
      const created=this.#authority.register(registration.actor,registration.selection);context=created.original_context;
      await this.parent.save(operationId,registration.actor,registration.selection,context,created.expires_at_ms);
      this.#current();
      this.#entries.set(operationId,{registration,digest:accessDigest(registration),context});
      return {expires_at_ms:created.expires_at_ms};
    } catch(error) {if(context)this.#authority.release(context);throw error;}
    finally {this.#pending.delete(operationId);}
  }
  async issue(operationId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection,input:unknown):Promise<FinancialSourceAssertionResponse> {
    const registration=captureFinancialRegistration(actor,selection),request=captureFinancialAssertionRequest(input);
    const entry=this.#entry(operationId,registration);
    return this.#authority.issue(entry.context,request);
  }
  /** TEST-ONLY transport bridge. The opaque context is exposed only inside a
   * trusted server callback after the encrypted parent is saved/recovered.
   * Scope exit, release and shutdown immediately refuse new transport reads.
   * This is not a qualified sole-egress or cross-process old-holder fence. */
  async withTestTransportContext<T>(operationId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection,
    use:(context:string)=>Promise<T>):Promise<T> {
    const entry=this.#entry(operationId,captureFinancialRegistration(actor,selection));
    if(typeof use!=="function"||this.#transportOperations.has(operationId))return invalid();
    // Never reuse the parent locator as transport bearer. A fresh scope token
    // prevents an old HTTP request from joining a later scope for this parent.
    const transportContext=randomBytes(32).toString("base64url");
    if(this.#transportContexts.has(transportContext))return invalid();
    const scope:TestScope={operationId,parentContext:entry.context,responses:new Set()};
    this.#transportOperations.add(operationId);this.#transportContexts.set(transportContext,scope);
    try {
      const result=await use(transportContext);
      if(this.#stopped||this.#entries.get(operationId)!==entry||this.#transportContexts.get(transportContext)!==scope)return invalid();
      return result;
    } finally {
      this.#closeTestScope(transportContext,scope);
      this.#transportOperations.delete(operationId);
    }
  }
  /** Transport must still authenticate its own pinned mTLS workload. No
   * completion is accepted here: terminal alone is not a recipient ACK. */
  testTransportAuthority():Readonly<{issue:(context:string,input:unknown)=>Promise<FinancialSourceAssertionResponse>;
    complete:(context:string,input:unknown)=>Promise<FinancialSourceAssertionCompletionResponse>}> {
    return Object.freeze({issue:async(context:string,input:unknown)=>{
      this.#current();const scope=this.#transportContexts.get(context),operationId=scope?.operationId;
      const entry=operationId&&this.#entries.get(operationId);
      if(!operationId||!entry||entry.context!==scope.parentContext||!this.#transportOperations.has(operationId))return invalid();
      const response=await this.#authority.issue(entry.context,input);
      // The callback may have ended while issuer/revalidation I/O was live.
      // A successful DB read cannot revive a retired transport scope.
      if(this.#stopped||this.#transportContexts.get(context)!==scope||
        this.#entries.get(operationId)!==entry||!this.#transportOperations.has(operationId))return invalid();
      return response;
    },complete:async()=>{throw new FinancialSourceAssertionError("FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED",409);}});
  }
  /** TEST ONLY. Interrupt an unfinished response when its owner scope ends.
   * Already handed-off bytes cannot be recalled and require source ENTER and
   * same-original recovery; socket finish never becomes a recipient ACK. */
  guardTestTransportDelivery(delivery:TestDelivery):TestDelivery {
    if(typeof delivery!=="function")return invalid();
    return async(context,request,output,response,remainingMs)=>{
      this.#current();const scope=this.#transportContexts.get(context),entry=scope&&this.#entries.get(scope.operationId);
      if(!scope||!entry||entry.context!==scope.parentContext||!this.#transportOperations.has(scope.operationId)||
        response.destroyed||response.writableEnded)return invalid();
      scope.responses.add(response);
      try {
        await delivery(entry.context,request,output,response,remainingMs);
        if(this.#stopped||this.#transportContexts.get(context)!==scope||this.#entries.get(scope.operationId)!==entry)return invalid();
      } finally {scope.responses.delete(response);}
    };
  }
  #closeTestScope(context:string,scope:TestScope):void {
    if(this.#transportContexts.get(context)!==scope)return;
    this.#transportContexts.delete(context);
    for(const response of scope.responses)if(!response.destroyed&&!response.writableFinished)response.destroy();
  }
  /** Restart may only locate and resume an existing first delivery. It cannot
   * ISSUE if the process died after save but before a lease was bound. */
  async restoreFirst(operationId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection,input:unknown):Promise<FinancialSourceAssertionResponse> {
    const registration=captureFinancialRegistration(actor,selection),request=captureFinancialAssertionRequest(input);
    this.#start(operationId);
    try {
      const s=registration.selection;
      if(request.delivery_sequence!==0||request.previous_lease_id!==null||request.binding_digest!==s.binding_digest||
        request.receiver_id!==s.receiver_id||request.workload_id!==s.workload_id||!s.paths.includes(request.path))return invalid();
      const bytes={method:request.method,raw_path:Buffer.from(request.path,"utf8"),query_string:Buffer.alloc(0),
        body:Buffer.from(request.body_utf8,"utf8")};
      const binding={workspace_id:s.workspace_id,environment:s.environment,workload_id:s.workload_id,
        request_digest:pmHttpRequestDigest(bytes,{request_bytes:1_048_576})};
      if(binding.request_digest!==request.request_digest)return invalid();
      const parent=await this.parent.load(operationId,registration.actor,s);this.#current();
      const original=Object.freeze({original_context:parent.original_context,expires_at_ms:parent.expires_at_ms,
        delivery_sequence:0,receiver_id:s.receiver_id,binding_digest:s.binding_digest});
      const lease=await this.inner.locateBoundDelivery(registration.actor,binding,bytes,original);this.#current();
      const response=await this.#authority.recoverFirstDelivery(registration.actor,s,parent.original_context,
        parent.expires_at_ms,request,lease);this.#current();
      this.#entries.set(operationId,{registration,digest:accessDigest(registration),context:parent.original_context});
      return response;
    } finally {this.#pending.delete(operationId);}
  }
  release(operationId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection):void {
    const entry=this.#entry(operationId,captureFinancialRegistration(actor,selection));
    this.#entries.delete(operationId);
    for(const [context,scope] of this.#transportContexts)if(scope.operationId===operationId)this.#closeTestScope(context,scope);
    this.#authority.release(entry.context);
  }
  shutdown():void {this.#stopped=true;this.#entries.clear();
    for(const [context,scope] of this.#transportContexts)this.#closeTestScope(context,scope);
    this.#authority.shutdown();}
}
