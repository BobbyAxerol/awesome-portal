import { createHash, X509Certificate } from "node:crypto";
import { request } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { TLSSocket } from "node:tls";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import { commandIntent } from "./command.contract";
import { commandAuthorization, sourceCommandResult, type CommandTrust } from "./command-trust";
import { CommandSourceAssertionAuthority, CommandSourceAssertionError, COMMAND_STATUS_EDGE_PATH,
  type CommandStatusInput } from "./command-source-assertion";
import { bindEdgeCurrentRequesterStatus, type EdgeCommandGatewayBinding,
  type EdgeCurrentRequesterStatusPort } from "./edge-command-gateway-binding";
import type { EdgeCommandExchange, EdgeCommandPreparedCall } from "./edge-command-adapter";
import { parseCompactJson } from "./private-root-file";
import type { CommandStatusOriginalFingerprints } from "./command-status-original-fingerprints";

const text=z.string().min(1).max(256),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/u);
export const commandStatusOriginal = z.object({gateway_ref:text,reference:text,authorization_digest:digest,
  intent_hash:digest,request_digest:digest,transport_payload_digest:digest,source_intent_digest:z.string().regex(/^[a-f0-9]{64}$/u),
  source_key:z.tuple([text,text,text]),target_ref:text}).strict();
const originalResponse=z.object({schema_version:z.literal("execution.core-command-original-response.v1"),
  original:commandStatusOriginal.nullable(),status_request_utf8:z.string().max(32_768).nullable(),
  pm_status_request_digest:digest.nullable()}).strict();
export const commandStatusExchange = z.object({schema_version:z.literal("execution.core-command-status-response.v1"),
  original_digest:digest,call_digest:digest,delivered_request_digest:digest,result:sourceCommandResult,
  full_outcome_custody:z.object({reference:text,digest}).strict().nullable()}).strict();
const originalWire=z.object({schema_version:z.literal("execution.core-pm-original.v1"),action:z.literal("STATUS"),
  key:text,operation:text,payload:z.record(z.unknown()),payload_digest:text,request_digest:text}).strict();
export const COMMAND_STATUS_ORIGINAL_PATH="/internal/elp210/core-command/original";
export interface EdgeCommandStatusTransportConfig {
  /** Construction is explicit; neither this factory nor the adapter opens a listener. */
  mode:"EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY";
  origin:string; gateway_ref:string;
  tls:{key:string|Buffer;cert:string|Buffer;ca:string|Buffer};
  peer:{certificate_sha256:string;dns_name:string};
  limits:{maximum_in_flight:number;deadline_ms:number;request_bytes:number;response_bytes:number;maximum_originals:number};
}
const fail=(code:string,status=503):never=>{throw new CommandSourceAssertionError(code,status);};
const bounded=(n:number,max:number)=>Number.isSafeInteger(n)&&n>=1&&n<=max;
type OriginalInput=Parameters<EdgeCurrentRequesterStatusPort["original"]>[0];
type StatusWaiter={resolve:(value:EdgeCommandExchange)=>void;reject:(error:unknown)=>void};
type SharedStatusDelivery={promise:Promise<EdgeCommandExchange>;abort:AbortController;waiters:number;settled:boolean;
  subscribers:Set<StatusWaiter>;outcome?:{ok:true;value:EdgeCommandExchange}|{ok:false;error:unknown}};
type Prepared={input:Omit<CommandStatusInput,"signal">;body:string;token:string;prepared:EdgeCommandPreparedCall;
  pending?:SharedStatusDelivery;finished?:boolean};

/** Concrete HTTP1/TLS1.3 STATUS-only Edge port. It never addresses PM, resolves
 * a target, creates a command/claim, or reuses the old author's identity. The
 * source-owned original codec is opaque retained data, not a Core mapping of
 * economic intent. Unknown/expired deliveries are not silently replaced.
 * Construction stays OFF unless an owner explicitly gives all trust inputs. */
export class EdgeCommandStatusTransport implements EdgeCurrentRequesterStatusPort {
  private readonly config:EdgeCommandStatusTransportConfig;
  /** Bounded disposable byte cache only: durable comparison is in PG, and
   * issued/UNKNOWN contexts retain their own exact body in `prepared`. */
  private readonly originals=new Map<string,{status:string;pm_digest:string}>();
  private readonly prepared=new Map<string,Prepared>();
  /** Reserve before issuing an assertion. Concurrent identical preparation
   * shares one reservation, just as the authority shares its pending call. */
  private readonly preparing=new Map<string,number>();
  private inFlight=0;
  constructor(private readonly authority:CommandSourceAssertionAuthority,input:EdgeCommandStatusTransportConfig,
    private readonly fingerprints:CommandStatusOriginalFingerprints) {
    try {
      const origin=new URL(input.origin),l=input.limits;
      if(Object.keys(input).some(k=>!["mode","origin","gateway_ref","tls","peer","limits"].includes(k))||
        input.mode!=="EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY"||!fingerprints||typeof fingerprints.pin!=="function"||!/^https:\/\/[^/?#\\\s]+\/?$/u.test(input.origin)||
        origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash||
        !text.safeParse(input.gateway_ref).success||!input.tls.key||!input.tls.cert||!input.tls.ca||
        !digest.safeParse(input.peer.certificate_sha256).success||
        !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(input.peer.dns_name)||
        !bounded(l.maximum_in_flight,16)||!bounded(l.deadline_ms,5000)||!bounded(l.request_bytes,131_072)||
        !bounded(l.response_bytes,1_048_576)||!bounded(l.maximum_originals,128))throw new Error();
      this.config={...input,origin:origin.origin,peer:{...input.peer},limits:{...l},
        tls:{key:Buffer.from(input.tls.key),cert:Buffer.from(input.tls.cert),ca:Buffer.from(input.tls.ca)}};
    }catch{throw new CommandSourceAssertionError("COMMAND_STATUS_EDGE_CONFIG_INVALID",400);}
  }
  snapshot(){return Object.freeze({in_flight:this.inFlight,originals:this.originals.size,prepared:this.prepared.size});}
  async original(input:OriginalInput) {
    const result=await this.readOriginal(input);
    return result?structuredClone(result.original):null;
  }
  private async readOriginal(input:OriginalInput) {
    const a=commandAuthorization.parse(input.authorization),i=commandIntent.parse(input.intent);
    if(i.environment!=="paper"||a.qualification!=="OWNER_VERIFIED"||a.workspace_id!==i.workspace_id||
      a.intent_hash!==accessDigest({actor_user_id:a.actor_id,intent:i}))return fail("COMMAND_STATUS_ORIGINAL_INVALID",403);
    const body=JSON.stringify({schema_version:"execution.core-command-original-request.v1",
      authorization:a,intent:i,contract:input.contract,gateway_ref:this.config.gateway_ref});
    const response=originalResponse.parse(await this.exchange(COMMAND_STATUS_ORIGINAL_PATH,body,undefined,input.signal));
    if(response.original===null){if(response.status_request_utf8!==null||response.pm_status_request_digest!==null)return fail("COMMAND_STATUS_ORIGINAL_INVALID");return null;}
    const o=response.original;
    if(!response.status_request_utf8||!response.pm_status_request_digest||o.gateway_ref!==this.config.gateway_ref||o.authorization_digest!==accessDigest(a)||
      o.intent_hash!==a.intent_hash||o.source_intent_digest!==a.source_intent_digest)return fail("COMMAND_STATUS_ORIGINAL_INVALID");
    const statusBytes=Buffer.from(response.status_request_utf8,"utf8");
    if(statusBytes.toString("utf8")!==response.status_request_utf8)return fail("COMMAND_STATUS_ORIGINAL_INVALID");
    const raw=originalWire.parse(parseCompactJson(statusBytes));
    const sameHash=(value:string,expected:string)=>value===expected||`sha256:${value}`===expected;
    if(raw.key!==o.source_key[2]||raw.operation!==o.source_key[1]||
      !sameHash(raw.payload_digest,o.transport_payload_digest)||!sameHash(raw.request_digest,o.request_digest))
      return fail("COMMAND_STATUS_ORIGINAL_INVALID");
    await this.fingerprints.pin({binding_digest:accessDigest({gateway_ref:o.gateway_ref,authorization_digest:o.authorization_digest,
      intent_hash:o.intent_hash,source_intent_digest:o.source_intent_digest}),original_digest:accessDigest(o),
      status_bytes_digest:`sha256:${createHash("sha256").update(statusBytes).digest("hex")}`,
      pm_status_request_digest:response.pm_status_request_digest,workspace_id:i.workspace_id,
      key_hash:accessDigest(i.business_payload.idempotency_key),intent_hash:a.intent_hash,intent_digest:accessDigest(i),
      authorization_digest:accessDigest(a),actor_id:a.actor_id});
    const key=accessDigest(o);
    this.originals.delete(key);
    while(this.originals.size>=this.config.limits.maximum_originals)this.originals.delete(this.originals.keys().next().value!);
    this.originals.set(key,{status:response.status_request_utf8,pm_digest:response.pm_status_request_digest});
    return {original:o,status:response.status_request_utf8,pm_digest:response.pm_status_request_digest};
  }
  async prepareStatus(input:CommandStatusInput) {
    for(const [key,old]of this.prepared)if(old.finished&&old.prepared.expires_at_ms<=Date.now())this.prepared.delete(key);
    // A cache miss is refetched from source, never reconstructed from the
    // fingerprint. Pending/UNKNOWN prepared bodies are not evicted.
    let status=this.originals.get(accessDigest(input.original));
    if(!status){const fresh=await this.readOriginal(input);
      if(!fresh||accessDigest(fresh.original)!==accessDigest(input.original))return fail("COMMAND_STATUS_ORIGINAL_REQUIRED",409);
      status=fresh;}
    // Source codec is decoded/re-encoded only as its JSON value. Its ORIGINAL
    // payload mapping and both independent digests remain exactly source-owned.
    const body=JSON.stringify({schema_version:"execution.core-command-status-request.v1",original:input.original,
      call_digest:input.call_digest,pm_status_request_digest:status.pm_digest,core_request:parseCompactJson(Buffer.from(status.status))});
    const {signal:_signal,...captured}=input;
    const admission=accessDigest({input:captured,body});
    const existing=[...this.prepared.values()].some(p=>!p.finished&&p.body===body&&accessDigest(p.input)===accessDigest(captured));
    if(!existing&&!this.preparing.has(admission)&&this.prepared.size+this.preparing.size>=this.config.limits.maximum_originals)
      return fail("COMMAND_STATUS_EDGE_CAPACITY",429);
    // Each caller owns its share of the same capacity reservation. Releasing
    // the first caller must not free the slot while another caller is still
    // waiting for the authority's coalesced preparation.
    const reserved=!existing;
    if(reserved)this.preparing.set(admission,(this.preparing.get(admission)??0)+1);
    try {
      const issued=await this.authority.prepare(input,body),key=issued.prepared.assertion_ref;
      const old=this.prepared.get(key);
      if(old&&(old.body!==body||accessDigest(old.prepared)!==accessDigest(issued.prepared)))return fail("COMMAND_STATUS_PREPARED_CHANGED",409);
      if(!old){
        // Defensive check if an authority returns a new context for an
        // existing delivery: never evict an unresolved original/context.
        if(this.prepared.size>=this.config.limits.maximum_originals)return fail("COMMAND_STATUS_EDGE_CAPACITY",429);
        this.prepared.set(key,{input:structuredClone(captured),body,token:issued.token,prepared:issued.prepared});
      }
      return {requester_digest:accessDigest(input.actor),prepared:{...issued.prepared}};
    } finally { if(reserved){
      const remaining=(this.preparing.get(admission)??1)-1;
      if(remaining===0)this.preparing.delete(admission);else this.preparing.set(admission,remaining);
    } }
  }
  async status(input:CommandStatusInput & {prepared:EdgeCommandPreparedCall}) {
    const flight=this.prepared.get(input.prepared.assertion_ref),{prepared:_prepared,signal:_signal,...captured}=input;
    if(!flight||accessDigest(captured)!==accessDigest(flight.input)||accessDigest(input.prepared)!==accessDigest(flight.prepared))
      return fail("COMMAND_STATUS_PREPARED_REQUIRED",403);
    await this.authority.check(input.prepared.assertion_ref,{...captured,signal:input.signal});
    if(input.signal.aborted)return fail("COMMAND_STATUS_EDGE_ABORTED",499);
    // Same-delivery retry rejoins the exact original promise, including an
    // ambiguous failure. The physical request belongs to all its waiters,
    // not to the first request's AbortSignal. Cancel it when the last waiter
    // leaves, without releasing or inventing the original Edge custody.
    if(!flight.pending){
      const shared:SharedStatusDelivery={abort:new AbortController(),waiters:0,settled:false,promise:undefined as never,
        subscribers:new Set()};
      shared.promise=Promise.resolve().then(async()=>{
        const raw=commandStatusExchange.parse(await this.exchange(COMMAND_STATUS_EDGE_PATH,flight.body,flight.token,shared.abort.signal));
        if(raw.original_digest!==accessDigest(flight.input.original)||raw.call_digest!==flight.input.call_digest||
          raw.delivered_request_digest!==flight.prepared.delivered_request_digest)return fail("COMMAND_STATUS_REPLY_INVALID");
        if(raw.result.business.state!=="UNKNOWN"&&(!raw.full_outcome_custody||raw.result.delivery!=="ACKNOWLEDGED"))
          return fail("COMMAND_STATUS_REPLY_CUSTODY_REQUIRED");
        const {schema_version:_schema,...reply}=raw;return reply;
      }).then(value=>{shared.settled=true;return value;},error=>{
        shared.settled=true;
        // Never discard a successor if an older delivery finishes late.
        if(flight.pending===shared)flight.pending=undefined;
        throw error;
      });
      // A single settlement listener owns the shared exchange. Registering a
      // promise handler per caller would retain every cancelled caller until a
      // slow exchange ends, even though the concurrent-waiter cap is 64.
      // Remove individual subscribers synchronously on cancellation instead.
      void shared.promise.then(value=>{
        shared.outcome={ok:true,value};
        for(const waiter of shared.subscribers)waiter.resolve(value);
      },error=>{
        shared.outcome={ok:false,error};
        for(const waiter of shared.subscribers)waiter.reject(error);
      });
      flight.pending=shared;
    }
    const pending=flight.pending;
    if(pending.waiters>=64)return fail("COMMAND_STATUS_EDGE_CAPACITY",429);
    pending.waiters++;
    let held:EdgeCommandExchange;
    try {held=await new Promise<EdgeCommandExchange>((resolve,reject)=>{
      let done=false;
      const finish=(callback:()=>void)=>{if(done)return;done=true;input.signal.removeEventListener("abort",cancel);
        pending.subscribers.delete(waiter);callback();};
      const cancel=()=>finish(()=>reject(new CommandSourceAssertionError("COMMAND_STATUS_EDGE_ABORTED",499)));
      const waiter:StatusWaiter={resolve:value=>finish(()=>resolve(value)),reject:error=>finish(()=>reject(error))};
      pending.subscribers.add(waiter);
      input.signal.addEventListener("abort",cancel,{once:true});
      if(input.signal.aborted)cancel();
      else if(pending.outcome?.ok===true)waiter.resolve(pending.outcome.value);
      else if(pending.outcome?.ok===false)waiter.reject(pending.outcome.error);
    });} finally {
      pending.waiters--;
      if(pending.waiters===0&&!pending.settled)pending.abort.abort();
    }
    await this.authority.check(input.prepared.assertion_ref,{...captured,signal:input.signal});
    if(held.result.business.state!=="UNKNOWN"&&held.full_outcome_custody) {
      await this.authority.acknowledgeRetainedRead(input.prepared.assertion_ref,{...captured,signal:input.signal});
      flight.finished=true;
    }
    return structuredClone(held);
  }
  private async exchange(path:string,body:string,token:string|undefined,signal:AbortSignal):Promise<unknown> {
    if(signal.aborted)return fail("COMMAND_STATUS_EDGE_ABORTED",499);
    if(Buffer.byteLength(body)>this.config.limits.request_bytes)return fail("COMMAND_STATUS_EDGE_REQUEST_LIMIT",413);
    if(this.inFlight>=this.config.limits.maximum_in_flight)return fail("COMMAND_STATUS_EDGE_BUSY",429);
    this.inFlight++;
    try {return await new Promise((resolve,reject)=>{
      let req:ClientRequest|undefined,res:IncomingMessage|undefined,socket:TLSSocket|undefined,failed=false;
      let output:unknown,complete=false;const chunks:Buffer[]=[];
      const until=performance.now()+this.config.limits.deadline_ms;
      const stop=(code="COMMAND_STATUS_EDGE_UNAVAILABLE")=>{
        if(failed)return;failed=true;res?.destroy();req?.destroy();socket?.destroy();
        if(!req){clearTimeout(timer);signal.removeEventListener("abort",abort);reject(new CommandSourceAssertionError(code));}
      };
      const abort=()=>stop("COMMAND_STATUS_EDGE_ABORTED");
      const timer=setTimeout(()=>stop("COMMAND_STATUS_EDGE_DEADLINE"),this.config.limits.deadline_ms);
      signal.addEventListener("abort",abort,{once:true});
      try {
        req=request(new URL(path,this.config.origin),{...this.config.tls,method:"POST",agent:false,
          servername:this.config.peer.dns_name,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",rejectUnauthorized:true,
          maxHeaderSize:8192,headers:{"content-type":"application/json",accept:"application/json",connection:"close",
            "content-length":Buffer.byteLength(body),...(token?{authorization:`Bearer ${token}`}:{})},
          checkServerIdentity:(_host,cert)=>this.peer(cert.raw)?undefined:new Error("COMMAND_STATUS_EDGE_PEER_INVALID")},response=>{
          res=response;const length=Number(res.headers["content-length"]),names=res.rawHeaders.filter((_,n)=>n%2===0).map(v=>v.toLowerCase());
          if(res.statusCode!==200||res.httpVersion!=="1.1"||res.headers["content-type"]!=="application/json"||
            res.headers["content-encoding"]!==undefined||res.headers["transfer-encoding"]!==undefined||
            names.filter(v=>v==="content-length").length!==1||names.filter(v=>v==="content-type").length!==1||
            !bounded(length,this.config.limits.response_bytes))return stop();
          let size=0;res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>length||size>this.config.limits.response_bytes)return stop();chunks.push(Buffer.from(chunk));});
          res.on("error",()=>stop());res.on("aborted",()=>stop());res.once("end",()=>{
            if(failed||!res?.complete||size!==length)return stop();
            try{output=parseCompactJson(Buffer.concat(chunks,size));complete=true;}catch{stop();}
          });
        });
        req.once("error",()=>stop());req.once("close",()=>{
          clearTimeout(timer);signal.removeEventListener("abort",abort);chunks.length=0;
          if(failed||!complete||performance.now()>=until)reject(new CommandSourceAssertionError("COMMAND_STATUS_EDGE_UNAVAILABLE"));else resolve(output);
        });
        req.once("socket",candidate=>{
          if(!(candidate instanceof TLSSocket))return stop();socket=candidate;
          socket.once("secureConnect",()=>{
            if(signal.aborted)return abort();
            if(!socket!.authorized||socket!.getProtocol()!=="TLSv1.3"||!this.peer(socket!.getPeerCertificate().raw))return stop();
            req!.end(body);
          });
        });
        // No write, end or flushHeaders before actual peer+SAN+leaf validation.
      }catch{stop();}
    });}finally{this.inFlight--;}
  }
  private peer(raw:Buffer|undefined):boolean {
    try{return !!raw&&`sha256:${createHash("sha256").update(raw).digest("hex")}`===this.config.peer.certificate_sha256&&
      new X509Certificate(raw).checkHost(this.config.peer.dns_name,{subject:"never",wildcards:false})===this.config.peer.dns_name;}
    catch{return false;}
  }
}

/** Actual optional factory entrypoint, not an injected fake source port. No
 * AppModule registration/default-on flag or submit authority is introduced. */
export function createAuthenticatedEdgeCurrentRequesterStatus(binding:EdgeCommandGatewayBinding,base:CommandTrust,
  authority:CommandSourceAssertionAuthority,config:EdgeCommandStatusTransportConfig,fingerprints:CommandStatusOriginalFingerprints) {
  if(binding.requester_status!=="FRESH_CURRENT_HUMAN"||binding.selection.gateway_ref!==config.gateway_ref||
    binding.scope.environment!=="paper"||binding.selection.qualification!=="OWNER_VERIFIED"||binding.edge_contract===null)
    return fail("COMMAND_STATUS_EDGE_BINDING_INVALID",400);
  const port=new EdgeCommandStatusTransport(authority,config,fingerprints);
  return {port,trust:bindEdgeCurrentRequesterStatus(binding,base,port)};
}
