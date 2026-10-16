import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import { accessDigest } from "./access-policy";
import { edgeScopedNoticeBatch,scopedReplayBinding,scopedRealtimeFrame,
  type ScopedReplayBinding,type EdgeScopedNoticeBatch,type ScopedRealtimeFrame } from "./realtime.contract";
import { scopeRealtimeIdentity,ExecutionReadScopes,type AuthorizedExecutionReadScope } from "./read-scope";
import type { AccessResource } from "./access.contract";

export class ScopedReplayError extends Error {
  constructor(readonly code:NonNullable<ScopedRealtimeFrame["reason_code"]>){super("Execution updates require a current authorized snapshot.");}
}
/** Encrypted and authenticated, not merely base64-encoded/HMAC plaintext.
 * Dedicated domain separation prevents reuse of a query/command token. Keys
 * and inner Edge cursors stay server-only. No runtime credentials are added. */
export class ScopedReplayCursorCodec {
  private readonly keys:Map<string,Buffer>;
  constructor(private readonly active:string,keys:Readonly<Record<string,string>>,private readonly ttlMs:number,
    private readonly now:()=>number=Date.now){
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(active)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300_000||
      !Object.hasOwn(keys,active)||Object.keys(keys).length>4||Object.entries(keys).some(([id,key])=>
        !/^[A-Za-z0-9_-]{1,32}$/.test(id)||Buffer.byteLength(key)<32))throw new Error("REPLAY_CURSOR_CONFIG_INVALID");
    this.keys=new Map(Object.entries(keys).map(([id,key])=>[id,createHash("sha256").update("portal-scoped-replay-v1\0").update(key).digest()]));
  }
  encode(binding:ScopedReplayBinding,sourceCursor:string):string{
    scopedReplayBinding.parse(binding);
    if(!/^[A-Za-z0-9._~-]+$/.test(sourceCursor)||Buffer.byteLength(sourceCursor)>2048)throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");
    const issued=this.now(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.keys.get(this.active)!,iv);
    cipher.setAAD(Buffer.from(`portal-scoped-replay.v1:${this.active}`));
    if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(issued+this.ttlMs))throw new Error("REPLAY_CLOCK_INVALID");
    const json=Buffer.from(JSON.stringify({binding:accessDigest(binding),source:sourceCursor,issued,expires:issued+this.ttlMs}));
    // Fixed-length padding also hides changes in the private source token's
    // length. Ciphertext randomization alone would not hide that side channel.
    const payload=randomBytes(2816);payload.writeUInt32BE(json.length);json.copy(payload,4);
    const data=Buffer.concat([cipher.update(payload),cipher.final()]);
    return ["sr1",this.active,iv.toString("base64url"),data.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
  }
  decode(token:string,binding:ScopedReplayBinding):string{
    try{
      scopedReplayBinding.parse(binding);
      if(token.length>4096||!/^[A-Za-z0-9_.-]+$/.test(token))throw Error();
      const [version,id,iv,ciphertext,tag,...extra]=token.split("."),key=this.keys.get(id);
      if(version!=="sr1"||!key||extra.length)throw Error();
      const nonce=Buffer.from(iv,"base64url"),authTag=Buffer.from(tag,"base64url");
      const data=Buffer.from(ciphertext,"base64url");
      if(nonce.length!==12||authTag.length!==16||data.length!==2816||
        nonce.toString("base64url")!==iv||authTag.toString("base64url")!==tag||data.toString("base64url")!==ciphertext)throw Error();
      const decipher=createDecipheriv("aes-256-gcm",key,nonce);
      decipher.setAAD(Buffer.from(`portal-scoped-replay.v1:${id}`));decipher.setAuthTag(authTag);
      const payload=Buffer.concat([decipher.update(data),decipher.final()]),length=payload.readUInt32BE();
      if(length>2812)throw Error();
      const raw=JSON.parse(payload.subarray(4,4+length).toString("utf8"));
      const now=this.now();
      if(!Number.isSafeInteger(now)||now<0||Object.keys(raw).sort().join()!=="binding,expires,issued,source"||raw.binding!==accessDigest(binding)||
        !Number.isSafeInteger(raw.issued)||!Number.isSafeInteger(raw.expires)||raw.issued>now||raw.expires<=now||
        raw.expires-raw.issued<1||raw.expires-raw.issued>300_000||typeof raw.source!=="string"||!raw.source||
        Buffer.byteLength(raw.source)>2048)throw Error();
      return raw.source;
    }catch{throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");}
  }
}

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
type Client={id:string;binding:ScopedReplayBinding;guard:ReplayDeliveryGuard;write:(frame:ScopedRealtimeFrame)=>boolean;
  sourceCursor:string;queue:Array<{frame:ScopedRealtimeFrame;bytes:number}>;bytes:number;closed:boolean;busy:boolean;};

/** No timer/public listener/upstream setup. A commissioned server coordinator
 * calls poll once per bounded cadence, not once per browser or synchronous UI
 * refresh. Identical scoped flights coalesce; no browser TS polling. */
export class ScopedReplayHub {
  private readonly clients=new Map<string,Client>();
  private readonly flights=new Map<string,Promise<EdgeScopedNoticeBatch>>();
  private readonly timedOutFlights=new Set<string>();
  private queuedBytes=0;
  private pending=0;
  private stopped=false;
  private readonly limits:Readonly<ScopedReplayLimits>;
  constructor(private readonly source:ScopedNoticeSource,private readonly codec:ScopedReplayCursorCodec,
    limits:ScopedReplayLimits){const captured={...limits};validateLimits(captured);this.limits=Object.freeze(captured);}
  async subscribe(input:{binding:ScopedReplayBinding;guard:ReplayDeliveryGuard;write:Client["write"];
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
    const client:Client={id:randomBytes(16).toString("hex"),binding,guard:input.guard,write:input.write,sourceCursor:cursor,
      queue:[],bytes:0,closed:false,busy:false};
    this.clients.set(client.id,client);
    return{id:client.id,close:()=>this.close(client)};
    }finally{this.pending--;}
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
  stop():void{this.stopped=true;for(const c of this.clients.values())this.terminate(c,"unavailable","STOPPED");}
  diagnostics(){return{clients:this.clients.size,queued_bytes:this.queuedBytes,source_flights:this.flights.size,
    pending_subscriptions:this.pending,timed_out_flights:this.timedOutFlights.size,browser_source_calls:0,semantics:"NOTIFICATION_ONLY" as const};}
  private close(c:Client){if(c.closed)return;c.closed=true;this.queuedBytes-=c.bytes;c.bytes=0;c.queue=[];this.clients.delete(c.id);}
  private terminate(c:Client,event:ScopedRealtimeFrame["event_type"],reason:NonNullable<ScopedRealtimeFrame["reason_code"]>){
    if(c.closed)return;
    const f=scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
      event_type:event,terminal:true,reconnect_required:event==="resync_required",resume_cursor:null,projection_generation:null,quality:null,
      next_action:event==="access_revoked"?"SIGN_IN_OR_REQUEST_ACCESS":event==="resync_required"?"READ_NAMED_SNAPSHOT":"WAIT",reason_code:reason});
    // Terminal frames carry no target rows, scope IDs, source cursor or quality.
    this.close(c);try{c.write(f);}catch{/* broken client cannot affect peers */}
  }
  private queue(c:Client,frame:ScopedRealtimeFrame):boolean{
    const bytes=Buffer.byteLength(JSON.stringify(frame));
    if(bytes>this.limits.maximumFrameBytes||c.queue.length>=this.limits.maximumEntriesPerClient||
      c.bytes+bytes>this.limits.maximumClientBytes||this.queuedBytes+bytes>this.limits.maximumTotalBytes){
      this.terminate(c,"resync_required","SLOW_CLIENT");return false;
    }
    c.queue.push({frame,bytes});c.bytes+=bytes;this.queuedBytes+=bytes;return true;
  }
  private async read(c:Client){
    const key=accessDigest([c.binding,c.sourceCursor]);
    const existing=this.flights.get(key);if(existing)return existing;
    if(this.flights.size>=this.limits.maximumClients)throw new ScopedReplayError("RECONNECT_LIMIT");
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const source=Promise.resolve().then(()=>this.source.read(structuredClone(c.binding),c.sourceCursor,this.limits.maximumNoticesPerRead,controller.signal));
    // A provider ignoring Abort keeps its slot occupied until real completion.
    // One stuck source cannot admit an unbounded sequence of replacement jobs.
    const result=Promise.race([source,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{this.timedOutFlights.add(key);controller.abort();reject(new ScopedReplayError("SOURCE_UNAVAILABLE"));},this.limits.readTimeoutMs);
      timer.unref();
    })]);
    this.flights.set(key,result);
    void source.finally(()=>{clearTimeout(timer);this.flights.delete(key);this.timedOutFlights.delete(key);}).catch(()=>undefined);
    return result;
  }
  private async pollClient(c:Client):Promise<void>{
    if(c.closed||c.busy)return;c.busy=true;
    try{
      if(await c.guard.currentIdentity()!==c.binding.principal_scope_digest)throw new ScopedReplayError("SCOPE_CHANGED");
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
          event_type:"revalidate",terminal:false,reconnect_required:false,resume_cursor:this.codec.encode(c.binding,notice.resume_cursor),
          projection_generation:notice.projection_generation,quality:notice.quality,next_action:"READ_NAMED_SNAPSHOT",reason_code:null});
        if(!this.queue(c,frame))return;
      }
      // Always rotate the encrypted heartbeat token, also on a no-change poll.
      // Token equality cannot disclose hidden-only activity/scanned row counts.
      if(!batch.notices.length&&!this.queue(c,scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
        event_type:"heartbeat",terminal:false,reconnect_required:false,resume_cursor:this.codec.encode(c.binding,batch.next_cursor),
        projection_generation:c.binding.projection_generation,quality:null,next_action:"RESUME_PORTAL_CURSOR",reason_code:null})))return;
      while(c.queue.length&&!c.closed){
        const item=c.queue[0];
        const accepted=await c.guard.write(c.binding.principal_scope_digest,()=>{
          if(c.closed)return false;
          return c.write(structuredClone(item.frame));
        });
        if(c.closed)return;
        if(!accepted){this.terminate(c,"resync_required","SLOW_CLIENT");return;}
        c.queue.shift();c.bytes-=item.bytes;this.queuedBytes-=item.bytes;
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
    }finally{c.busy=false;}
  }
}
