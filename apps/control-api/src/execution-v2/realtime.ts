import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import { accessDigest } from "./access-policy";
import { edgeScopedNoticeBatch,scopedReplayBinding,scopedRealtimeFrame,
  type ScopedReplayBinding,type EdgeScopedNoticeBatch,type ScopedRealtimeFrame } from "./realtime.contract";
import { scopeRealtimeIdentity,ExecutionReadScopes,type AuthorizedExecutionReadScope } from "./read-scope";
import { accessResource,type AccessResource } from "./access.contract";
import { CurrentHumanCandidate } from "./current-human-candidate";
import type { NativeReadEgressStream } from "./native-read-egress";
import { ScopedReplayCursorCodec,ScopedReplayError,decodeScopedReplayContinuation,
  encodeScopedReplayContinuation } from "./scoped-replay-cursor";
export { ScopedReplayCursorCodec,ScopedReplayError } from "./scoped-replay-cursor";

// Existing import identity remains re-exported above. In the native path use
// original intrinsic codec functions; do not call an overridden public method.
const nativeCandidateMethods=Object.freeze({
  open:CurrentHumanCandidate.prototype.openNativeNoticeStream,
  next:CurrentHumanCandidate.prototype.nextNativeNoticeDelivery,
  close:CurrentHumanCandidate.prototype.closeNativeNoticeStream,
  acquire:CurrentHumanCandidate.prototype.acquireNativeFrame,
  send:CurrentHumanCandidate.prototype.sendNativeFrame,
  cancel:CurrentHumanCandidate.prototype.cancelNativeFrame,
});
const prepareNativeNotice=ExecutionReadScopes.prototype.prepareNativeNotice;

/** Private source port. Its adapter MUST verify dense local-journal receipt
 * coverage/digests, current scope and source continuity before returning. This
 * batch is not a proof and `caught_up` never means economic completeness.
 * The pinned Edge port is NOTIFICATION_ONLY; no TS event replay is claimed. */
export interface ScopedNoticeSource {
  read(binding:ScopedReplayBinding,after:string,limit:number,signal:AbortSignal):Promise<EdgeScopedNoticeBatch>;
}
export interface ReplayDeliveryGuard {
  /** Stable current authority; no retained grant/cache entitlement. */
  currentIdentity():Promise<string>;
  /** Recheck at every write. Callback must be synchronous/nonblocking. */
  write<T>(expectedIdentity:string,send:()=>T):Promise<T>;
}
/** Resolve a NEW scope from the named current dataset before each event, so a
 * document revision does not become a permanently cached grant. Model/field/
 * query/generation and authorized lineage still bind the continuation. */
export function scopedNoticeGuard(scopes:ExecutionReadScopes,current:()=>Promise<AuthorizedExecutionReadScope>,resource:AccessResource):ReplayDeliveryGuard{
  return {currentIdentity:async()=>scopeRealtimeIdentity(await current()),
    write:async(expected,send)=>{const scope=await current();
      if(scopeRealtimeIdentity(scope)!==expected)throw new ScopedReplayError("SCOPE_CHANGED");
      return scopes.deliverRealtime(scope,resource,send);
    }};
}

export interface ScopedReplayLimits {maximumClients:number;maximumEntriesPerClient:number;maximumFrameBytes:number;
  maximumClientBytes:number;maximumTotalBytes:number;maximumNoticesPerRead:number;readTimeoutMs:number;}
/** Explicit tested cell budgets, NOT production defaults or a certified SLA. */
function validateLimits(l:ScopedReplayLimits){
  const keys=["maximumClients","maximumEntriesPerClient","maximumFrameBytes","maximumClientBytes",
    "maximumTotalBytes","maximumNoticesPerRead","readTimeoutMs"] as const;
  if(!l||typeof l!=="object"||Object.keys(l).length!==keys.length||
    keys.some(k=>!Object.hasOwn(l,k)||!Number.isSafeInteger(l[k])||l[k]<1)||l.maximumClients>4096||l.maximumEntriesPerClient>4096||
    l.maximumNoticesPerRead>200||l.maximumFrameBytes>1048576||l.maximumClientBytes<l.maximumFrameBytes||
    l.maximumTotalBytes<l.maximumClientBytes||l.maximumTotalBytes>64*1048576||l.readTimeoutMs>60000)
    throw new Error("REPLAY_LIMITS_INVALID");
}
type QueuedFrame={frame:ScopedRealtimeFrame;bytes:number;
  native?:{frameJson:string;sourceCursor:string};};
type ClientBase={id:string;binding:ScopedReplayBinding;sourceCursor:string;
  queue:QueuedFrame[];bytes:number;closed:boolean;busy:boolean;};
type NativeDelivery={stream:NativeReadEgressStream;resource:AccessResource;
  current:()=>Promise<AuthorizedExecutionReadScope>;bindingJson:string;};
type LegacyClient=ClientBase & {native?:undefined;guard:ReplayDeliveryGuard;write:(frame:ScopedRealtimeFrame)=>boolean;};
type NativeClient=ClientBase & {native:NativeDelivery;guard?:never;write?:never;};
type Client=LegacyClient|NativeClient;
/** Private fixed dependencies; not a public controller DTO, arbitrary delivery
 * callback or runtime commissioning switch. Both must be the actual instances
 * from the SAME reviewed Candidate/Core/source installation. */
export interface NativeScopedReplayDependencies {candidate:CurrentHumanCandidate;scopes:ExecutionReadScopes;}

/** No timer/public listener/upstream setup. A commissioned server coordinator
 * calls poll once per bounded cadence, not once per browser or synchronous UI
 * refresh. Identical scoped flights coalesce; no browser TS polling. */
export class ScopedReplayHub {
  private readonly clients=new Map<string,Client>();
  private readonly flights=new Map<string,Promise<EdgeScopedNoticeBatch>>();
  private readonly cancellations=new Map<string,AbortController>();
  private readonly timedOutFlights=new Set<string>();
  private queuedBytes=0;
  private pending=0;
  private stopped=false;
  private readonly limits:Readonly<ScopedReplayLimits>;
  private readonly native?:Readonly<NativeScopedReplayDependencies>;
  private nativeFlights=0;
  constructor(private readonly source:ScopedNoticeSource,private readonly codec:ScopedReplayCursorCodec,
    limits:ScopedReplayLimits,native?:NativeScopedReplayDependencies){
    const captured={...limits};validateLimits(captured);this.limits=Object.freeze(captured);
    this.native=native?Object.freeze({candidate:native.candidate,scopes:native.scopes}):undefined;
  }
  async subscribe(input:{binding:ScopedReplayBinding;guard:ReplayDeliveryGuard;write:LegacyClient["write"];
    baselineCursor:string;lastEventId?:string}):Promise<{id:string;close:()=>void}>{
    if(this.stopped)throw new ScopedReplayError("STOPPED");
    if(this.clients.size+this.pending>=this.limits.maximumClients)throw new ScopedReplayError("RECONNECT_LIMIT");
    this.pending++;
    try{
    const binding=structuredClone(scopedReplayBinding.parse(input.binding));
    if(await input.guard.currentIdentity()!==binding.principal_scope_digest)throw new ScopedReplayError("SCOPE_CHANGED");
    if(this.stopped)throw new ScopedReplayError("STOPPED");
    // No notices(None) shortcut: source starts-at-head is NOT a snapshot barrier.
    if(!input.baselineCursor)throw new ScopedReplayError("SNAPSHOT_REQUIRED");
    const cursor=input.lastEventId?this.codec.decode(input.lastEventId,binding):input.baselineCursor;
    this.codec.encode(binding,cursor); // Validate before retaining any session.
    const client:LegacyClient={id:randomBytes(16).toString("hex"),binding,guard:input.guard,write:input.write,sourceCursor:cursor,
      queue:[],bytes:0,closed:false,busy:false};
    this.clients.set(client.id,client);
    return{id:client.id,close:()=>this.close(client)};
    }finally{this.pending--;}
  }
  /** Opt-in original08 physical path. No guard.write/raw write callback is
   * accepted. HTTP transport ownership belongs exclusively to SAME Candidate.
   * current() is a trusted mint factory; a shaped scope fails the real issuer. */
  async subscribeNative(input:{binding:ScopedReplayBinding;resource:AccessResource;response:ServerResponse;
    current:()=>Promise<AuthorizedExecutionReadScope>;baselineCursor:string;lastEventId?:string;
  }):Promise<{id:string;close:()=>void}>{
    const dependencies=this.native;
    if(!dependencies)throw new ScopedReplayError("SOURCE_UNAVAILABLE");
    if(this.stopped)throw new ScopedReplayError("STOPPED");
    if(this.clients.size+this.pending>=this.limits.maximumClients)throw new ScopedReplayError("RECONNECT_LIMIT");
    this.pending++;
    let stream:NativeReadEgressStream|undefined,registered=false;
    const candidate=dependencies.candidate;
    try{
      const binding=structuredClone(scopedReplayBinding.parse(input.binding)),resource=accessResource.parse(input.resource),
        current=input.current,response=input.response,baseline=input.baselineCursor,last=input.lastEventId;
      if(typeof current!=="function")throw new ScopedReplayError("SCOPE_CHANGED");
      const scope=await current();
      if(scopeRealtimeIdentity(scope)!==binding.principal_scope_digest)throw new ScopedReplayError("SCOPE_CHANGED");
      if(this.stopped)throw new ScopedReplayError("STOPPED");
      if(!baseline)throw new ScopedReplayError("SNAPSHOT_REQUIRED");
      const cursor=last?decodeScopedReplayContinuation(this.codec,last,binding):baseline;
      encodeScopedReplayContinuation(this.codec,binding,cursor); // genuine codec + bounded original source token
      stream=nativeCandidateMethods.open.call(candidate,response);
      const client:NativeClient={id:randomBytes(16).toString("hex"),binding,sourceCursor:cursor,queue:[],bytes:0,closed:false,busy:false,
        native:{stream,resource,current,bindingJson:JSON.stringify(binding)}};
      this.clients.set(client.id,client);registered=true;
      return{id:client.id,close:()=>this.close(client)};
    }finally{
      this.pending--;
      if(stream&&!registered)try{nativeCandidateMethods.close.call(candidate,stream);}catch{/* original owner retains any uncertain state */}
    }
  }
  async poll():Promise<void>{
    if(this.stopped)return;
    await Promise.all([...this.clients.values()].map(c=>this.pollClient(c)));
  }
  /** Explicit app-revoke notification is a fast purge hint, never the only
   * fence. Missed hints are covered by current authority before every write. */
  revoke(predicate:(binding:ScopedReplayBinding)=>boolean):void{
    for(const c of this.clients.values())if(predicate(structuredClone(c.binding)))this.terminate(c,"access_revoked","ACCESS_CHANGED");
  }
  stop():void{
    this.stopped=true;
    for(const c of this.clients.values())this.terminate(c,"unavailable","STOPPED");
    for(const controller of this.cancellations.values())controller.abort();
  }
  diagnostics(){return{clients:this.clients.size,queued_bytes:this.queuedBytes,source_flights:this.flights.size,
    pending_subscriptions:this.pending,timed_out_flights:this.timedOutFlights.size,browser_source_calls:0,semantics:"NOTIFICATION_ONLY" as const};}
  private close(c:Client){
    if(c.closed)return;c.closed=true;this.queuedBytes-=c.bytes;c.bytes=0;c.queue=[];this.clients.delete(c.id);
    if(c.native)try{nativeCandidateMethods.close.call(this.native!.candidate,c.native.stream);}catch{/* no fake closure/settlement */}
  }
  private terminate(c:Client,event:ScopedRealtimeFrame["event_type"],reason:NonNullable<ScopedRealtimeFrame["reason_code"]>){
    if(c.closed)return;
    const f=scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
      event_type:event,terminal:true,reconnect_required:event==="resync_required",resume_cursor:null,projection_generation:null,quality:null,
      next_action:event==="access_revoked"?"SIGN_IN_OR_REQUEST_ACCESS":event==="resync_required"?"READ_NAMED_SNAPSHOT":"WAIT",reason_code:reason});
    // Terminal frames carry no target rows, scope IDs, source cursor or quality.
    this.close(c);
    // The native owner is closed; never append an unguarded terminal write to
    // its captured response. Legacy fixture/sync behavior remains unchanged.
    if(!c.native)try{(c as LegacyClient).write(f);}catch{/* broken client cannot affect peers */}
  }
  private queue(c:Client,frame:ScopedRealtimeFrame,sourceCursor:string):boolean{
    const frameJson=JSON.stringify(frame),jsonBytes=Buffer.byteLength(frameJson);
    const wireBytes=c.native?Buffer.byteLength(`id: ${frame.resume_cursor}\nevent: ${frame.event_type}\ndata: ${frameJson}\n\n`):jsonBytes;
    // Native queue retains canonical JSON + exact continuation as well as the
    // private frame object. Charge these additions, not merely the public JSON.
    const bytes=c.native?wireBytes+jsonBytes+Buffer.byteLength(sourceCursor):jsonBytes;
    if(wireBytes>this.limits.maximumFrameBytes||c.queue.length>=this.limits.maximumEntriesPerClient||
      c.bytes+bytes>this.limits.maximumClientBytes||this.queuedBytes+bytes>this.limits.maximumTotalBytes){
      this.terminate(c,"resync_required","SLOW_CLIENT");return false;
    }
    c.queue.push({frame,bytes,...(c.native?{native:{frameJson,sourceCursor}}:{})});
    c.bytes+=bytes;this.queuedBytes+=bytes;return true;
  }
  private async currentIdentity(c:Client):Promise<string>{
    return c.native?scopeRealtimeIdentity(await c.native.current()):(c as LegacyClient).guard.currentIdentity();
  }
  /** One exact original queue item. State strings alone never free a frame:
   * SAME actual Candidate/Egress must have advanced its own opaque stream. */
  private async deliverNative(c:NativeClient,item:QueuedFrame):Promise<boolean>{
    if(!this.native||!item.native)throw new ScopedReplayError("SOURCE_UNAVAILABLE");
    const candidate=this.native.candidate,stream=c.native.stream;
    const scope=await c.native.current();
    if(c.closed)return false;
    if(scopeRealtimeIdentity(scope)!==c.binding.principal_scope_digest)throw new ScopedReplayError("SCOPE_CHANGED");
    const delivery=nativeCandidateMethods.next.call(candidate,stream);
    const notice=await prepareNativeNotice.call(this.native.scopes,scope,c.native.resource,this.codec,{
      delivery_json:JSON.stringify(delivery),replay_binding_json:c.native.bindingJson,
      source_cursor:item.native.sourceCursor,frame_json:item.native.frameJson});
    if(c.closed)return false; // no native custody exists yet
    const handle=await nativeCandidateMethods.acquire.call(candidate,stream,notice);
    try{
      if(c.closed){await nativeCandidateMethods.cancel.call(candidate,handle);return false;}
      const result=await nativeCandidateMethods.send.call(candidate,handle);
      if(c.closed){await nativeCandidateMethods.cancel.call(candidate,handle);return false;}
      if(result.state!=="RECONCILED")throw new ScopedReplayError("SOURCE_UNAVAILABLE");
      const next=nativeCandidateMethods.next.call(candidate,stream);
      if(next.stream_id!==delivery.stream_id||BigInt(next.frame_ordinal)!==BigInt(delivery.frame_ordinal)+1n)
        throw new ScopedReplayError("SOURCE_UNAVAILABLE");
      // Only actual SERVED + source ACK + local durable settlement can move
      // this Egress owner's ordinal. ABORTED/cancel/UNKNOWN cannot satisfy it.
      return true;
    }catch(error){
      await nativeCandidateMethods.cancel.call(candidate,handle).catch(()=>undefined);
      throw error;
    }
  }
  private async read(c:Client){
    const key=accessDigest([c.binding,c.sourceCursor]);
    const existing=this.flights.get(key);if(existing)return existing;
    if(this.flights.size>=this.limits.maximumClients)throw new ScopedReplayError("RECONNECT_LIMIT");
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const source=Promise.resolve().then(()=>{
      if(this.stopped)throw new ScopedReplayError("STOPPED");
      return this.source.read(structuredClone(c.binding),c.sourceCursor,this.limits.maximumNoticesPerRead,controller.signal);
    });
    // A provider ignoring Abort keeps its slot occupied until real completion.
    // One stuck source cannot admit an unbounded sequence of replacement jobs.
    let abort!:()=>void;
    const cancelled=new Promise<never>((_,reject)=>{
      abort=()=>{clearTimeout(timer);reject(new ScopedReplayError(this.stopped?"STOPPED":"SOURCE_UNAVAILABLE"));};
      controller.signal.addEventListener("abort",abort,{once:true});
    });
    timer=setTimeout(()=>{this.timedOutFlights.add(key);controller.abort();},this.limits.readTimeoutMs);
    timer.unref();
    const result=Promise.race([source,cancelled]);
    this.cancellations.set(key,controller);
    this.flights.set(key,result);
    void source.finally(()=>{
      clearTimeout(timer);controller.signal.removeEventListener("abort",abort);
      this.flights.delete(key);this.timedOutFlights.delete(key);this.cancellations.delete(key);
    }).catch(()=>undefined);
    return result;
  }
  private async pollClient(c:Client):Promise<void>{
    if(c.closed||c.busy)return;c.busy=true;
    const nativeFlight=Boolean(c.native);
    if(nativeFlight&&this.nativeFlights>=this.limits.maximumClients){this.close(c);c.busy=false;return;}
    if(nativeFlight)this.nativeFlights++;
    try{
      if(await this.currentIdentity(c)!==c.binding.principal_scope_digest)throw new ScopedReplayError("SCOPE_CHANGED");
      if(c.closed)return;
      const batch=edgeScopedNoticeBatch.parse(await this.read(c));
      if(c.closed)return;
      if(batch.notices.length>this.limits.maximumNoticesPerRead||!batch.next_cursor||
        batch.notices.length>0&&batch.next_cursor!==batch.notices.at(-1)!.resume_cursor||
        !batch.caught_up&&batch.next_cursor===c.sourceCursor)
        throw new ScopedReplayError("SOURCE_COVERAGE_UNPROVED");
      const seen=new Set<string>();
      for(const notice of batch.notices){
        if(notice.projection_generation!==c.binding.projection_generation)throw new ScopedReplayError("GENERATION_CHANGED");
        // Exact Edge validate_batch contract. A coalesced notice may include
        // hidden trailing changes, but its token must equal this scan's end.
        if(seen.has(notice.resume_cursor)||notice.resume_cursor===c.sourceCursor)
          throw new ScopedReplayError("SOURCE_COVERAGE_UNPROVED");
        seen.add(notice.resume_cursor);
        const frame=scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
          event_type:"revalidate",terminal:false,reconnect_required:false,resume_cursor:c.native?
            encodeScopedReplayContinuation(this.codec,c.binding,notice.resume_cursor):this.codec.encode(c.binding,notice.resume_cursor),
          projection_generation:notice.projection_generation,quality:notice.quality,next_action:"READ_NAMED_SNAPSHOT",reason_code:null});
        if(!this.queue(c,frame,notice.resume_cursor))return;
      }
      // Always rotate the encrypted heartbeat token, also on a no-change poll.
      // Token equality cannot disclose hidden-only activity/scanned row counts.
      if(!batch.notices.length&&!this.queue(c,scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
        event_type:"heartbeat",terminal:false,reconnect_required:false,resume_cursor:c.native?
          encodeScopedReplayContinuation(this.codec,c.binding,batch.next_cursor):this.codec.encode(c.binding,batch.next_cursor),
        projection_generation:c.binding.projection_generation,quality:null,next_action:"RESUME_PORTAL_CURSOR",reason_code:null}),batch.next_cursor))return;
      while(c.queue.length&&!c.closed){
        const item=c.queue[0];
        const accepted=c.native?await this.deliverNative(c as NativeClient,item):await (c as LegacyClient).guard.write(c.binding.principal_scope_digest,()=>{
          if(c.closed)return false;
          return (c as LegacyClient).write(structuredClone(item.frame));
        });
        if(c.closed)return;
        if(!accepted){this.terminate(c,"resync_required","SLOW_CLIENT");return;}
        c.queue.shift();c.bytes-=item.bytes;this.queuedBytes-=item.bytes;
        if(c.native)c.sourceCursor=item.native!.sourceCursor;
      }
      if(!c.closed)c.sourceCursor=batch.next_cursor;
    }catch(error){
      if(c.closed)return;
      const code=error instanceof ScopedReplayError?error.code:null;
      if(code==="SCOPE_CHANGED"||!code&&error&&typeof error==="object"&&"status" in error&&[401,403,404,409].includes(Number(error.status)))
        this.terminate(c,"access_revoked","ACCESS_CHANGED");
      else if(code&&["GENERATION_CHANGED","SOURCE_COVERAGE_UNPROVED","CURSOR_INVALID_OR_EXPIRED"].includes(code))
        this.terminate(c,"resync_required",code);
      else this.terminate(c,"unavailable","SOURCE_UNAVAILABLE");
    }finally{c.busy=false;if(nativeFlight)this.nativeFlights--;}
  }
}
