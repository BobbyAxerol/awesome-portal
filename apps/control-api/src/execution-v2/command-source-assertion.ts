import { createHash, randomBytes } from "node:crypto";
import { types } from "node:util";
import { decodeJwt, SignJWT } from "jose";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { CurrentHumanCandidate, CurrentHumanLeaseError, type CurrentHumanBinding, type CommandStatusContextLink } from "./current-human-candidate";
import { C2CustodyPendingError } from "./c2-custody-pending-error";
import { pmHttpRequestDigest, type PmHttpRequestBytes } from "./pm-http-request-binding";
import type { Pool } from "pg";
import { CurrentOperationalReads } from "../operations/current-operational-read";
import { ExecutionAccessService } from "./access.service";
import { accessDigest } from "./access-digest";
import { commandAuthorization } from "./command-trust";
import { commandIntent } from "./command.contract";
import { CommandStore } from "./command.store";
import { workflowCommandRecord, workflowCommandTarget } from "./capital-workflow-record";
import { nativeNoticeValidUntil } from "./read-scope";
import type { EdgeCurrentRequesterStatusPort } from "./edge-command-gateway-binding";
import { CommandStatusPreparationError, PgCommandStatusPreparations } from "./command-status-preparations";
import { COMMAND_STATUS_ACK_CENSUS_SQL } from "./command-status-ack-census";
export const COMMAND_STATUS_PM_PATH = "/internal/elp210/pm-command/status";
export const COMMAND_STATUS_EDGE_PATH = "/internal/elp210/core-command/status";
export type CommandStatusInput = Parameters<EdgeCurrentRequesterStatusPort["prepareStatus"]>[0];
export interface CommandStatusAuthorityConfig {
  issuer: string; audience: string; key_id: string; key: Parameters<SignJWT["sign"]>[0];
  workload_id: string; ttl_ms: number; maximum_contexts: number; maximum_requests_per_context: number;
}

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u0020\u007f]+$/u);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const integer = z.number().int().nonnegative().safe();
const sourcePath = z.string().min(2).max(512).regex(/^\/[A-Za-z0-9_./-]+$/u)
  .refine(value => value.split("/").slice(1).every(segment => segment !== "" && segment !== "." && segment !== ".."));
const utf8 = z.string().max(1_048_576).refine(value =>
  Buffer.byteLength(value, "utf8") <= 1_048_576 && Buffer.from(value, "utf8").toString("utf8") === value);
export const commandSourceAssertionRequest = z.object({
  schema_version: z.literal("portal.execution.command-source-assertion-request.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, method: z.literal("POST"),
  path: z.literal(COMMAND_STATUS_PM_PATH), body_utf8: utf8, request_digest: digest,
  delivery_sequence: integer, previous_lease_id: text.nullable(),
}).strict();
export const commandSourceAssertionResponse = z.object({
  schema_version: z.literal("portal.execution.command-source-assertion-response.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, method: z.literal("POST"), path: sourcePath,
  request_digest: digest, assertion: z.string().min(1).max(16_384), lease_id: text,
  issued_at_ms: integer, expires_at_ms: integer, authority_revision: integer,
  delivery_sequence: integer, previous_lease_id: text.nullable(),
}).strict().refine(value => value.expires_at_ms > value.issued_at_ms &&
  value.expires_at_ms <= value.issued_at_ms + 30_000);
export type CommandSourceAssertionRequest = z.infer<typeof commandSourceAssertionRequest>;
export type CommandSourceAssertionResponse = z.infer<typeof commandSourceAssertionResponse>;
export const commandSourceAssertionCompletionRequest = z.object({
  schema_version: z.literal("portal.execution.command-source-assertion-completion-request.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, delivery_sequence: integer,
  lease_id: text, request_digest: digest, response_digest: digest,
}).strict();
export const commandSourceAssertionCompletionResponse = z.object({
  schema_version: z.literal("portal.execution.command-source-assertion-completion-response.v1"),
  delivery_sequence: integer, lease_id: text, request_digest: digest, response_digest: digest, completed: z.literal(true),
}).strict();
export type CommandSourceAssertionCompletionRequest = z.infer<typeof commandSourceAssertionCompletionRequest>;
export type CommandSourceAssertionCompletionResponse = z.infer<typeof commandSourceAssertionCompletionResponse>;
export class CommandSourceAssertionError extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super("The command STATUS source identity assertion is not available.");
  }
}
const fail = (code: string, status = 503): never => { throw new CommandSourceAssertionError(code, status); };
const actorSchema = z.object({ user_id: text, session_id: text, session_generation: integer }).strict();
const registrationSchema = z.object({ workspace_id: text, environment: z.literal("paper"),
  workload_id: text, receiver_id: text, binding_digest: digest,
  paths: z.array(z.literal(COMMAND_STATUS_PM_PATH)).length(1).refine(value => new Set(value).size === value.length),
}).strict();
export type CommandSourceAssertionSelection = z.infer<typeof registrationSchema>;
type Issued = Awaited<ReturnType<CurrentHumanCandidate["issue"]>>;
type LeaseIdentity = Omit<Issued, "token">;
type Candidate = Pick<CurrentHumanCandidate, "acknowledgeCommandStatusIssue"> & {
  issueCommandStatus:(actor:AccessActor,binding:CurrentHumanBinding,link:CommandStatusContextLink,request?:PmHttpRequestBytes)=>Promise<Issued>;
  revalidateIssue:(actor:AccessActor,binding:CurrentHumanBinding,issued:Issued,link?:CommandStatusContextLink)=>Promise<void>;
  /** Real candidate must authenticate persisted terminal source custody plus
   * current actor/authority. Absence is fail-closed for older/test adapters. */
  canReplaceResolvedIssue?: (actor: AccessActor, binding: CurrentHumanBinding, issued: LeaseIdentity) => Promise<boolean>;
  resumeCommandStatusIssue?: (actor:AccessActor,binding:CurrentHumanBinding,leaseId:string,
    request?:PmHttpRequestBytes,link?:CommandStatusContextLink)=>Promise<Issued>;
};
type Delivery = { sequence: number; previous_lease_id: string | null; key: string; binding: CurrentHumanBinding;
  link:CommandStatusContextLink;
  response: Promise<CommandSourceAssertionResponse>; completed: boolean;
  completion?: { response_digest: string; pending?: Promise<CommandSourceAssertionCompletionResponse> } };
type Entry = { input: Omit<CommandStatusInput,"signal">; status_body: string; status_token?: string; fingerprint?:string; read_completed?:boolean; read_closing?:boolean; actor: AccessActor; selection: CommandSourceAssertionSelection; expires: number; context_nonce: string;
  retired: boolean; last?: Delivery; pending: number; issued: number; restored?: boolean;
  preissue_recovered?: boolean; recovery_required?: boolean; status_request_digest?: string };
type PreparedStatus = { original_context:string; token:string;
  prepared:Awaited<ReturnType<EdgeCurrentRequesterStatusPort["prepareStatus"]>>["prepared"] };
type PreparedStatusInternal = PreparedStatus & { newlyRegistered:boolean };
type PreparationWaiter = { resolve:(result:PreparedStatus)=>boolean; reject:(error:unknown)=>void };
type SharedPreparation = { promise:Promise<PreparedStatusInternal>; waiters:Set<PreparationWaiter> };

/** Pure internal server boundary: reject accessors/proxies before schema code.
 * This is not an HTTP registration operation and accepts no client actor. */
function snapshot(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400);
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key)))
    return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d?.enumerable || !Object.hasOwn(d, "value")) return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400);
    out[key] = d.value;
  }
  return out;
}

/** Real CurrentHumanCandidate persists the same lease that its existing
 * ENTER/terminal/recovery routes inspect. The separate command STATUS proof is
 * derived from exact Core current audit authority; it never calls PM, grants
 * membership, or translates a workload into a human.
 * Exact-request retries reuse the original Promise/lease (including ambiguous
 * failures). A new delivery sequence additionally needs explicit authenticated
 * Edge completion AFTER it validated the original PM response, and persisted
 * COMMITTED/ROLLED_BACK custody plus fresh authority. Source terminal alone,
 * send/acquire, expiry, ENTERED/UNKNOWN or lost response NEVER completes a
 * delivery or allows replacement. This is identity orchestration, not a proof
 * invented by Core that the Edge actually received command STATUS response bytes.
 * A vanished context can only resume a durably linked exact issued assertion
 * or authenticated terminal completion; it cannot manufacture a lease.
 * Context expiry/release only stops issue; it NEVER deletes lease obligations.
 */
export class CommandSourceAssertionAuthority {
  private readonly contexts = new Map<string, Entry>();
  private readonly limits: { ttl_ms: number; maximum_contexts: number; maximum_requests_per_context: number };
  private readonly now: () => number;
  private stopped = false;
  private pending = 0;
  private readonly reads: CurrentOperationalReads;
  private readonly store: CommandStore;
  private readonly calls = new Map<string,string>();
  private readonly preparing = new Map<string,SharedPreparation>();
  /** A logical call may have only one in-flight preparation, even if a
   * conflicting request has different bytes and therefore a different
   * exact-retry key. Keep this reservation until authority I/O settles. */
  private readonly preparingCalls = new Map<string,string>();
  private preparationWaiters = 0;
  private readonly config: CommandStatusAuthorityConfig;
  private readonly preparations: PgCommandStatusPreparations;
  private recovery?: { source: Pick<EdgeCurrentRequesterStatusPort, "original">;
    contract: Parameters<EdgeCurrentRequesterStatusPort["original"]>[0]["contract"] };
  constructor(private readonly pool: Pool, private readonly access: ExecutionAccessService,
    private readonly candidate: Candidate, config: CommandStatusAuthorityConfig, now = Date.now) {
    const limits = config;
    if (!access.usesPool(pool) || ![config.issuer,config.audience,config.key_id,config.workload_id].every(v=>text.safeParse(v).success) ||
      !config.key || config.ttl_ms < 1000 || config.ttl_ms > 30_000) fail("COMMAND_STATUS_ASSERTION_CONFIG_INVALID");
    this.config={...config}; this.reads=new CurrentOperationalReads(access); this.store=new CommandStore(pool);
    if (![limits.ttl_ms, limits.maximum_contexts, limits.maximum_requests_per_context].every(Number.isSafeInteger) ||
      limits.ttl_ms < 1 || limits.ttl_ms > 300_000 || limits.maximum_contexts < 1 || limits.maximum_contexts > 128 ||
      limits.maximum_requests_per_context < 1 || limits.maximum_requests_per_context > 64)
      fail("COMMAND_STATUS_ASSERTION_CONFIG_INVALID");
    this.limits = { ...limits }; this.now = now;
    this.preparations = new PgCommandStatusPreparations(pool, limits.maximum_contexts);
  }
  /** Private composition wiring only. The selected Edge source independently
   * re-reads the original; a hash or a caller-provided object is not one. */
  bindRecoverySource(source: Pick<EdgeCurrentRequesterStatusPort, "original">,
    contract: Parameters<EdgeCurrentRequesterStatusPort["original"]>[0]["contract"]): void {
    if (this.stopped || this.recovery || this.contexts.size || this.preparing.size ||
      this.preparationWaiters || typeof source?.original !== "function" || !contract)
      return fail("COMMAND_STATUS_ASSERTION_RECOVERY_CONFIG_INVALID");
    this.recovery = { source, contract: structuredClone(contract) };
  }
  /** Called only by an authenticated Core server composition using its exact
   * principal, commissioned source binding and exact PM STATUS-only path. */
  private async register(actor: AccessActor, selection: CommandSourceAssertionSelection, input: Omit<CommandStatusInput,"signal">, status_body: string): Promise<{ original_context: string; expires_at_ms: number }> {
    let capturedActor: AccessActor, capturedSelection: CommandSourceAssertionSelection;
    try {
      capturedActor = actorSchema.parse(snapshot(actor, ["user_id", "session_id", "session_generation"]));
      const raw = snapshot(selection, ["workspace_id", "environment", "workload_id", "receiver_id", "binding_digest", "paths"]);
      if (!Array.isArray(raw.paths) || types.isProxy(raw.paths)) throw new Error();
      capturedSelection = registrationSchema.parse(raw);
    } catch { return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400); }
    const now = this.time(); this.prune(now);
    if (this.stopped) return fail("COMMAND_STATUS_ASSERTION_STOPPED");
    if (this.contexts.size >= this.limits.maximum_contexts) return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED", 429);
    const nonce = randomBytes(32).toString("base64url"), token = await this.contextFromNonce(nonce), expires = now + this.limits.ttl_ms;
    this.prune(this.time());
    if (this.stopped || this.contexts.size >= this.limits.maximum_contexts || this.contexts.has(token))
      return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    this.contexts.set(token, { input, status_body, actor: capturedActor, selection: capturedSelection, expires, context_nonce: nonce, retired: false,
      pending: 0, issued: 0 });
    return { original_context: token, expires_at_ms: expires };
  }
  /** Called exclusively by the selected Core port. The exact historical record
   * is re-read from Core and protected by the existing current TS audit fence.
   * No browser actor/grant is accepted by the callback or signed as authority. */
  async prepare(input: CommandStatusInput, statusBody: string): Promise<{
    original_context: string; token: string; prepared: Awaited<ReturnType<EdgeCurrentRequesterStatusPort["prepareStatus"]>>["prepared"];
  }> {
    if(input.signal.aborted)return fail("COMMAND_STATUS_ASSERTION_ABORTED",499);
    if(this.stopped)return fail("COMMAND_STATUS_ASSERTION_STOPPED");
    if(this.preparationWaiters>=this.limits.maximum_contexts*this.limits.maximum_requests_per_context)
      return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    const {signal:_signal,...raw}=input;
    const captured=structuredClone(raw);
    const key=accessDigest({input:captured,body:statusBody});
    const callKey=accessDigest({actor:captured.actor,original:captured.original,call:captured.call_digest});
    const reserved=this.preparingCalls.get(callKey);
    if(reserved!==undefined && reserved!==key)
      return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
    let pending=this.preparing.get(key);
    if(!pending){
      // Context capacity is checked after asynchronous authority I/O. Bound
      // distinct in-flight preparations as well, so stalled authority reads
      // cannot accumulate without limit before registration. Exact retries
      // still join the existing promise at the bound.
      if(this.preparing.size>=this.limits.maximum_contexts)
        return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
      // A shared preparation belongs to the original, not to whichever
      // caller happened to arrive first. Per-caller cancellation below must
      // neither cancel the shared operation nor mint another original.
      const sharedInput={...captured,signal:new AbortController().signal};
      pending={promise:Promise.resolve().then(()=>this.prepareOne(sharedInput,statusBody)),waiters:new Set()};
      this.preparing.set(key,pending);
      this.preparingCalls.set(callKey,key);
      const shared=pending;
      const clear=()=>{if(this.preparing.get(key)===shared){this.preparing.delete(key);
        if(this.preparingCalls.get(callKey)===key)this.preparingCalls.delete(callKey);}};
      // One listener per shared operation, not one per historical caller.
      // Aborted callers are removed from this Set and can be reclaimed even
      // if the authority read remains held for an arbitrarily long time.
      void shared.promise.then(result=>{
        clear();
        const {newlyRegistered,...prepared}=result;
        let delivered=false;
        for(const waiter of shared.waiters)delivered=waiter.resolve(prepared)||delivered;
        // A newly registered context whose token reached no waiter cannot
        // have authorized a delivery. Reclaim only this exact in-memory
        // reservation, never a previously delivered context or any custody.
        if(newlyRegistered&&!delivered){
          const context=prepared.original_context,entry=this.contexts.get(context);
          if(entry&&!entry.last&&entry.pending===0&&entry.issued===0&&this.calls.get(callKey)===context){
            this.contexts.delete(context);this.calls.delete(callKey);
          }
        }
      },
        error=>{clear();for(const waiter of shared.waiters)waiter.reject(error);});
    }
    const shared=pending;
    this.preparationWaiters++;
    return new Promise((resolve,reject)=>{
      const signal=input.signal;
      let settled=false,waiter:PreparationWaiter;
      const cleanup=()=>{if(settled)return false;settled=true;signal.removeEventListener("abort",aborted);
        shared.waiters.delete(waiter);this.preparationWaiters--;return true;};
      const aborted=()=>{if(cleanup())reject(new CommandSourceAssertionError("COMMAND_STATUS_ASSERTION_ABORTED",499));};
      waiter={resolve:result=>{if(signal.aborted){aborted();return false;}
          if(cleanup()){resolve(result);return true;}return false;},
        reject:error=>{if(cleanup())reject(error);}};
      shared.waiters.add(waiter);
      signal.addEventListener("abort",aborted,{once:true});
      if(signal.aborted){aborted();return;}
    });
  }
  private async prepareOne(input:CommandStatusInput,statusBody:string):Promise<PreparedStatusInternal> {
    if(input.signal.aborted) return fail("COMMAND_STATUS_ASSERTION_ABORTED",499);
    const {signal:_signal,...copy}=input, captured=structuredClone(copy);
    // A durable preparation must be recoverable from the exact same original
    // and requester after process loss. Reject a noncanonical call before it
    // can reserve a context or mint a lease: recoverIssue enforces this same
    // binding when it reloads the original from the configured source.
    if(this.recovery && captured.call_digest!==accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",
      requester_digest:accessDigest(captured.actor),original:captured.original,
      authorization_digest:accessDigest(captured.authorization),intent_hash:captured.authorization.intent_hash}))
      return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",403);
    const current=await this.authorize(captured);
    let wire: Record<string,unknown>;
    try { wire=JSON.parse(statusBody); if(wire.schema_version!=="execution.core-command-status-request.v1" ||
      accessDigest(wire.original)!==accessDigest(captured.original) || wire.call_digest!==captured.call_digest ||
      (wire.core_request as {action?:unknown})?.action!=="STATUS" ||
      typeof wire.pm_status_request_digest!=="string" || !/^sha256:[0-9a-f]{64}$/.test(wire.pm_status_request_digest)) throw new Error(); }
    catch { return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID",400); }
    const callKey=accessDigest({actor:captured.actor,original:captured.original,call:captured.call_digest});
    this.prune(this.time());
    let context=this.calls.get(callKey), entry=context?this.contexts.get(context):undefined, newlyRegistered=false;
    // Two processes may both prepare before either commits a lease. Once the
    // writer proves that the other context won, a subsequent prepare must
    // rejoin its immutable link instead of keeping the losing context forever.
    // Never retire an in-flight or ambiguously issued reservation.
    if(this.recovery && (!entry || (!entry.restored && entry.issued===0 && !entry.last && entry.pending===0))) {
      const outstanding=await this.findOutstanding(captured,statusBody,wire,current);
      if(outstanding && (outstanding.context!==context || entry?.recovery_required)) {
        if(entry) {
          if(entry.pending!==0 || entry.issued!==0 || entry.last)
            return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
          entry.retired=true;
          if(context && this.contexts.get(context)===entry)this.contexts.delete(context);
          if(this.calls.get(callKey)===context)this.calls.delete(callKey);
        }
        await this.restoreOutboundContext(outstanding.context,captured,outstanding.row,current);
        return this.prepareOne(input,statusBody);
      }
    }
    // A completed lease callback only confirms Edge's delivery ACK; it does
    // not mean the retained STATUS response has reached Core. Until that
    // response is checked and consumed, retries must keep the exact context.
    if(entry && !entry.read_completed) {
      this.current(entry);
      const requestDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),
        query_string:Buffer.alloc(0),body:Buffer.from(statusBody)},{request_bytes:131_072});
      if((entry.restored || entry.preissue_recovered ? entry.status_request_digest!==requestDigest : entry.status_body!==statusBody) ||
        accessDigest(entry.input)!==accessDigest(captured) || !entry.status_token)
        return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
      if(current.fingerprint!==entry.fingerprint || entry.expires>current.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      const confirmed=await this.authorize(entry.input); this.current(entry);
      if(confirmed.fingerprint!==entry.fingerprint || entry.expires>confirmed.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      if(entry.restored || entry.preissue_recovered) {entry.status_body=statusBody;entry.preissue_recovered=false;}
    } else {
      const registered=await this.register(captured.actor,{workspace_id:captured.intent.workspace_id,environment:"paper",
        workload_id:this.config.workload_id,receiver_id:captured.original.gateway_ref,
        binding_digest:accessDigest({original:captured.original,call:captured.call_digest}),paths:[COMMAND_STATUS_PM_PATH]},captured,statusBody);
      context=registered.original_context; entry=this.contexts.get(context)!;newlyRegistered=true;
      try {
      // JWT times are whole seconds. Check the actual encoded expiry, not the
      // unrounded bound, so a sub-second remaining authority cannot create an
      // already-expired token or an invalid durable recovery preparation.
      const now=this.time(), expires=Math.floor(Math.min(now+this.config.ttl_ms,current.valid_until_ms,
        captured.authorization.idempotency_retained_until_ms)/1000)*1000;
      const requestDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),
        query_string:Buffer.alloc(0),body:Buffer.from(statusBody)},{request_bytes:131_072});
      if(expires<=now) return fail("COMMAND_STATUS_ASSERTION_EXPIRED",403);
      entry.expires=expires;entry.fingerprint=current.fingerprint;
      entry.status_request_digest=requestDigest;
      entry.status_token=await this.signStatus(captured,current,context,requestDigest,Math.floor(now/1000)*1000,
        Math.floor(expires/1000)*1000);
      entry.expires=expires;
      const final=await this.authorize(captured); this.current(entry);
      if(final.fingerprint!==current.fingerprint || entry.expires>final.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      if(this.recovery) {
        // Persist before either the opaque context or STATUS JWT can escape.
        // A concurrent process must join the first reservation, not produce a
        // different context for the same original. This stores only digests and
        // a public nonce, never the token or source bytes.
        const claims=decodeJwt(entry.status_token);
        const selected=await this.preparations.reserve({
          context_digest:accessDigest(context),context_nonce:entry.context_nonce,
          subject_id:captured.actor.user_id,session_id:captured.actor.session_id,
          session_revision:captured.actor.session_generation,workspace_id:captured.intent.workspace_id,
          workload_id:this.config.workload_id,receiver_id:captured.original.gateway_ref,
          original_digest:accessDigest(captured.original),call_digest:captured.call_digest,
          binding_digest:entry.selection.binding_digest,authority_fingerprint:current.fingerprint,
          pm_request_digest:String(wire.pm_status_request_digest),status_request_digest:requestDigest,
          status_token_digest:accessDigest(entry.status_token),status_issued_at_ms:Number(claims.iat)*1000,
          context_expires_at_ms:entry.expires,
        },captured.authorization.intent_hash).catch(error=>{
          if(error instanceof CommandStatusPreparationError && error.code==="COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED")
            return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
          if(error instanceof CommandStatusPreparationError && error.code==="COMMAND_STATUS_PREPARATION_CAPACITY_EXHAUSTED")
            return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
          throw error;
        });
        this.current(entry);
        if(selected.context_digest!==accessDigest(context)) {
          this.contexts.delete(context);
          context=await this.contextFromNonce(selected.context_nonce);
          if(accessDigest(context)!==selected.context_digest)
            return fail("COMMAND_STATUS_ASSERTION_CONTEXT_CHANGED",409);
          await this.restoreOutboundContext(context,captured,selected,final,true);
          entry=this.contexts.get(context)!;
          entry.status_body=statusBody;
          entry.preissue_recovered=false;
          newlyRegistered=false;
        }
        const confirmed=await this.authorize(captured);this.current(entry);
        if(confirmed.fingerprint!==current.fingerprint || entry.expires>confirmed.valid_until_ms)
          return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      }
      this.calls.set(callKey,context);
      } catch(error) {
        // The context and signed status token have not escaped prepare yet.
        // Free only this unissued reservation; an issued/ambiguous delivery
        // must retain the same original custody and can never be discarded.
        if(this.contexts.get(context)===entry && !entry.last && entry.pending===0)
          this.contexts.delete(context);
        throw error;
      }
    }
    const claims=decodeJwt(entry!.status_token!);
    return {original_context:context!,token:entry!.status_token!,newlyRegistered,prepared:{
      gateway_ref:captured.original.gateway_ref,action:"STATUS",authority:"CURRENT_HUMAN",actor_id:captured.actor.user_id,
      call_digest:captured.call_digest,delivered_request_digest:String(claims.request_digest),assertion_ref:context!,
      issued_at_ms:Number(claims.iat)*1000,expires_at_ms:Number(claims.exp)*1000}};
  }
  private async findOutstanding(captured:Omit<CommandStatusInput,"signal">,statusBody:string,wire:Record<string,unknown>,
    current:{fingerprint:string}):Promise<{context:string;row:Record<string,unknown>}|undefined> {
    // This is an early recovery guard; the transactional issue fence remains
    // authoritative if another process wins after this SELECT.
    const outstanding=await this.pool.query(`SELECT l.lease_id,l.subject_id,l.session_id,l.session_revision,
      l.workspace_id,l.environment,l.workload_id,l.request_digest,c.context_digest,c.context_nonce,
      c.original_digest,c.call_digest,c.binding_digest,c.authority_fingerprint,c.receiver_id,
      c.context_expires_at_ms,c.status_token_digest,c.status_request_digest,c.status_issued_at_ms
      FROM elp210_candidate.leases l
      LEFT JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
      LEFT JOIN execution_command_status_preparations p ON p.context_digest=c.context_digest
      WHERE l.workspace_id=$1 AND l.environment='paper' AND l.workload_id=$2
        AND (c.original_digest=$3 OR l.request_digest=$4)
        AND (NOT EXISTS (SELECT 1 FROM execution_command_status_delivery_acks a
          WHERE a.lease_id=l.lease_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
            AND a.session_revision=l.session_revision AND a.workspace_id=l.workspace_id
            AND a.environment=l.environment AND a.workload_id=l.workload_id
            AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
            AND l.phase IN ('COMMITTED','ROLLED_BACK'))
          OR (p.context_digest IS NOT NULL AND p.consumed_at IS NULL
            AND p.context_expires_at_ms > floor(extract(epoch FROM clock_timestamp())*1000)
            AND NOT EXISTS (SELECT 1 FROM execution_command_status_context_links next_link
              WHERE next_link.context_digest=c.context_digest AND next_link.delivery_sequence>c.delivery_sequence))) LIMIT 2`,
    [captured.intent.workspace_id,this.config.workload_id,accessDigest(captured.original),wire.pm_status_request_digest]);
    if(!outstanding.rowCount)return undefined;
    const row=outstanding.rows[0];
    const requestDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),
      query_string:Buffer.alloc(0),body:Buffer.from(statusBody)},{request_bytes:131_072});
    if(outstanding.rowCount!==1 || row.subject_id!==captured.actor.user_id ||
      row.session_id!==captured.actor.session_id || Number(row.session_revision)!==captured.actor.session_generation ||
      row.workspace_id!==captured.intent.workspace_id || row.environment!=="paper" ||
      row.workload_id!==this.config.workload_id || row.request_digest!==wire.pm_status_request_digest ||
      row.original_digest!==accessDigest(captured.original) || row.call_digest!==captured.call_digest ||
      row.binding_digest!==accessDigest({original:captured.original,call:captured.call_digest}) ||
      row.authority_fingerprint!==current.fingerprint || row.receiver_id!==captured.original.gateway_ref ||
      row.status_request_digest!==requestDigest || typeof row.context_nonce!=="string")
      return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
    const context=await this.contextFromNonce(row.context_nonce);
    if(accessDigest(context)!==row.context_digest)return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
    return {context,row};
  }
  /** Domain-separated Ed25519 signature over a public random nonce. Only the
   * configured status signing key can reproduce the opaque context; the DB
   * never stores its bearer value or the signing key. The fixed purpose has
   * no authority claims and is not a STATUS JWT. */
  private async contextFromNonce(nonce:string):Promise<string> {
    if(!/^[A-Za-z0-9_-]{43}$(?![\s\S])/.test(nonce))return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    const proof=await new SignJWT({purpose:"portal.execution.status-context-derivation.v1",nonce})
      .setProtectedHeader({alg:"EdDSA",kid:this.config.key_id,typ:"portal-status-context-v1"})
      .setIssuer(this.config.issuer).setAudience(this.config.audience).sign(this.config.key);
    const parts=proof.split(".");
    if(parts.length!==3||!parts[2]||!/^[A-Za-z0-9_-]{86}$(?![\s\S])/.test(parts[2]))
      return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    // Preserve the existing 43-character opaque context wire contract.
    return createHash("sha256").update(Buffer.from(parts[2],"base64url")).digest("base64url");
  }
  private signStatus(input:Omit<CommandStatusInput,"signal">,
    current:{fingerprint:string;authority_revision:string;scope_revision:string;policy_revision:string;field_policy_ref:string|null},
    context:string,requestDigest:string,issuedAt:number,expires:number):Promise<string> {
    return new SignJWT({purpose:"execution.command-status-authority.v1",action:"STATUS",
      current_actor:input.actor.user_id,sid:input.actor.session_id,session_generation:input.actor.session_generation,
      workspace_id:input.intent.workspace_id,environment:"paper",workload_id:this.config.workload_id,
      authorization_id:input.authorization.reference,intent_id:input.authorization.intent_hash,
      original_sha256:accessDigest(input.original),request_digest:requestDigest,call_digest:input.call_digest,
      original_context:context,authority_fingerprint:current.fingerprint,authority_revision:current.authority_revision,
      scope_revision:current.scope_revision,policy_revision:current.policy_revision,field_policy_ref:current.field_policy_ref})
      .setProtectedHeader({alg:"EdDSA",kid:this.config.key_id,typ:"JWT"}).setIssuer(this.config.issuer)
      .setAudience(this.config.audience).setSubject(input.actor.user_id).setIssuedAt(issuedAt/1000)
      .setExpirationTime(expires/1000).setJti(context).sign(this.config.key);
  }
  /** Restore only the exact linked context and token after current-human and
   * original checks. The public nonce is not the bearer context; both the
   * derived context and deterministic token must match committed digests. */
  private async restoreOutboundContext(context:string,input:Omit<CommandStatusInput,"signal">,
    row:Record<string,unknown>,current:{fingerprint:string;valid_until_ms:number;authority_revision:string;
      scope_revision:string;policy_revision:string;field_policy_ref:string|null},unissued=false):Promise<void> {
    const expires=Number(row.context_expires_at_ms),issued=Number(row.status_issued_at_ms);
    if(!Number.isSafeInteger(expires)||expires%1000!==0||!Number.isSafeInteger(issued)||issued%1000!==0||
      issued>=expires||this.time()>=expires||expires>current.valid_until_ms||
      !digest.safeParse(row.status_token_digest).success||!digest.safeParse(row.status_request_digest).success||
      typeof row.context_nonce!=="string" || await this.contextFromNonce(row.context_nonce)!==context)
      return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    const statusToken=await this.signStatus(input,current,context,row.status_request_digest as string,issued,expires);
    if(accessDigest(statusToken)!==row.status_token_digest)return fail("COMMAND_STATUS_ASSERTION_CONTEXT_CHANGED",409);
    const confirmed=await this.authorize(input);
    if(this.stopped||this.time()>=expires||confirmed.fingerprint!==current.fingerprint||expires>confirmed.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    const key=accessDigest({actor:input.actor,original:input.original,call:input.call_digest});
    this.prune(this.time());
    const old=this.contexts.get(context), other=this.calls.get(key);
    if(other && other!==context)return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
    if(old) {
      const upgrade=!unissued && old.recovery_required===true && !old.last && old.pending===0;
      if((old.restored===unissued && !upgrade)||accessDigest(old.input)!==accessDigest(input)||old.status_token!==statusToken||
        old.status_request_digest!==row.status_request_digest||old.expires!==expires)
        return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
      if(upgrade) {old.restored=true;old.recovery_required=false;old.preissue_recovered=false;}
      return;
    }
    if(this.contexts.size>=this.limits.maximum_contexts)return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    this.contexts.set(context,{input:structuredClone(input),status_body:"",status_token:statusToken,
      status_request_digest:row.status_request_digest as string,fingerprint:current.fingerprint,actor:{...input.actor},
      selection:{workspace_id:input.intent.workspace_id,environment:"paper",workload_id:this.config.workload_id,
        receiver_id:input.original.gateway_ref,binding_digest:accessDigest({original:input.original,call:input.call_digest}),
      paths:[COMMAND_STATUS_PM_PATH]},expires,context_nonce:row.context_nonce,retired:false,pending:0,issued:0,
      restored:!unissued,preissue_recovered:unissued});
    this.calls.set(key,context);
  }
  /** Fresh source AND Core/session fence before and after the held status I/O.
   * The issuer-bound token cannot be swapped across principals or originals. */
  async check(context:string,input:CommandStatusInput):Promise<void> {
    if(input.signal.aborted)return fail("COMMAND_STATUS_ASSERTION_ABORTED",499);
    const entry=this.contexts.get(context); this.current(entry);
    const {signal:_signal,...raw}=input;
    if(accessDigest(raw)!==accessDigest(entry!.input)) return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",403);
    const current=await this.authorize(entry!.input); this.current(entry);
    if(current.fingerprint!==entry!.fingerprint || entry!.expires>current.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    if(input.signal.aborted)return fail("COMMAND_STATUS_ASSERTION_ABORTED",499);
  }
  /** A pinned Edge response may disclose already retained full terminal
   * custody without doing a new PM POST. Complete ONLY that local read; never
   * invent a PM delivery/lease ACK or erase an unresolved actual PM issuance. */
  async acknowledgeRetainedRead(context:string,input:CommandStatusInput):Promise<void> {
    await this.check(context,input);
    if(input.signal.aborted)return fail("COMMAND_STATUS_ASSERTION_ABORTED",499);
    const entry=this.contexts.get(context);this.current(entry);
    if(entry!.read_completed)return;
    if(entry!.read_closing)return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    if(entry!.last && !entry!.last.completed)return fail("COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED",409);
    // Take the in-process close fence before any asynchronous census/consume.
    // Otherwise a concurrent callback can issue while consume is waiting.
    entry!.read_closing=true;
    try {
    if(entry!.restored) {
      // A restored entry has no in-memory Delivery. Do not mistake that for
      // a no-ISSUE read: every linked original lease must have its exact
      // persisted terminal AND Edge acknowledgement before releasing it.
      const result=await this.pool.query(COMMAND_STATUS_ACK_CENSUS_SQL,[accessDigest(context),accessDigest(entry!.input.original),
        entry!.input.call_digest,entry!.selection.binding_digest,entry!.actor.user_id,entry!.actor.session_id,
        entry!.actor.session_generation,entry!.selection.workspace_id,entry!.selection.workload_id]);
      if(result.rows[0]?.total<1 || result.rows[0]?.unresolved!==0)
        return fail("COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED",409);
      await this.check(context,input);this.current(entry);
    }
    if(this.recovery) {
      try {
        await this.preparations.consume({context_digest:accessDigest(context),subject_id:entry!.actor.user_id,
          session_id:entry!.actor.session_id,session_revision:entry!.actor.session_generation,
          workspace_id:entry!.selection.workspace_id,workload_id:entry!.selection.workload_id,
          original_digest:accessDigest(entry!.input.original)},entry!.restored ? {
            call_digest:entry!.input.call_digest,binding_digest:entry!.selection.binding_digest} : undefined);
      } catch(error) {
        if(error instanceof CommandStatusPreparationError && error.code==="COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED")
          return fail("COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED",409);
        throw error;
      }
      await this.check(context,input);this.current(entry);
    }
    entry!.read_completed=true;
    } finally {entry!.read_closing=false;}
  }
  private async authorize(input:Omit<CommandStatusInput,"signal">):Promise<{fingerprint:string;valid_until_ms:number;authority_revision:string;
    scope_revision:string;policy_revision:string;field_policy_ref:string|null}> {
    const a=commandAuthorization.parse(input.authorization),i=commandIntent.parse(input.intent);
    if(input.action!=="STATUS" || i.environment!=="paper" || a.qualification!=="OWNER_VERIFIED" ||
      a.workspace_id!==i.workspace_id || a.intent_hash!==accessDigest({actor_user_id:a.actor_id,intent:i}) ||
      a.idempotency_retained_until_ms<=this.time() || input.original.authorization_digest!==accessDigest(a) ||
      input.original.intent_hash!==a.intent_hash || input.original.source_intent_digest!==a.source_intent_digest ||
      input.original.gateway_ref!==this.config.audience)
      return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",403);
    return this.authorizeBase(input.actor,a,i);
  }
  private async authorizeBase(actor: AccessActor, a: z.infer<typeof commandAuthorization>, i: z.infer<typeof commandIntent>):Promise<{
    fingerprint:string;valid_until_ms:number;authority_revision:string;scope_revision:string;policy_revision:string;field_policy_ref:string|null}> {
    if (i.environment !== "paper" || a.qualification !== "OWNER_VERIFIED" || a.workspace_id !== i.workspace_id ||
      a.intent_hash !== accessDigest({actor_user_id:a.actor_id,intent:i}) || a.idempotency_retained_until_ms <= this.time())
      return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",403);
    const flight=await this.reads.prepareExact(actor,i.workspace_id,async()=>{
      const epoch=async()=>{
        const row=(await this.pool.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0];
        if(!row||typeof row.revision!=="string"||!(/^[1-9][0-9]*$/u).test(row.revision)||row.drain_id!==null)
          return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_REQUIRED",403);
        return row.revision as string;
      };
      const authority_revision=await epoch();
      const found=await this.pool.query("SELECT command_id FROM execution_trusted_commands WHERE workspace_id=$1 AND key_hash=$2",
        [i.workspace_id,accessDigest(i.business_payload.idempotency_key)]);
      if(found.rowCount!==1) return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISSING",404);
      const row=await this.store.workflowCandidate(i.workspace_id,found.rows[0].command_id);
      if(!row) return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISSING",404);
      return {target:workflowCommandTarget(row),beforeFinal:async()=>{
        if(await epoch()!==authority_revision)return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      },decode:(current,decision)=>{
        const original=workflowCommandRecord(row,i.workspace_id,row.id,workflowCommandTarget(row));
        if(accessDigest(original.intent)!==accessDigest(i) || accessDigest(row.authorization)!==accessDigest(a) ||
          row.hash!==a.intent_hash || row.actor!==a.actor_id || original.status.delivery==="PREPARED" ||
          original.status.delivery==="FAILED_BEFORE_SEND") return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH",409);
        return {fingerprint:accessDigest({core:current.authority_fingerprint,authority_revision,
          scope:decision.scope_revision,policy:decision.policy_revision,field_policy:decision.field_policy_ref}),
          authority_revision,scope_revision:decision.scope_revision,policy_revision:decision.policy_revision,
          field_policy_ref:decision.field_policy_ref,
          valid_until_ms:nativeNoticeValidUntil(current,i.environment,current.actor_lease_until_ms!)};
      }};
    },()=>new CommandSourceAssertionError("COMMAND_STATUS_ASSERTION_AUTHORITY_REQUIRED",403));
    return await this.reads.finish(flight);
  }
  async issue(token: string, input: unknown): Promise<CommandSourceAssertionResponse> {
    let request: CommandSourceAssertionRequest;
    try { request = commandSourceAssertionRequest.parse(snapshot(input, ["schema_version", "binding_digest", "receiver_id",
      "workload_id", "method", "path", "body_utf8", "request_digest", "delivery_sequence", "previous_lease_id"])); }
    catch { return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400); }
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED", 403);
    const entry = this.contexts.get(token);
    if (!entry) return this.recoverIssue(token,request);
    this.issueCurrent(entry);
    if (entry.restored || entry.recovery_required) return this.recoverIssue(token,request,entry.recovery_required===true);
    const s = entry!.selection;
    const current=await this.authorize(entry!.input); this.issueCurrent(entry);
    if(current.fingerprint!==entry!.fingerprint || entry!.expires>current.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    let expectedDigest: unknown;
    try {
      expectedDigest=JSON.parse(entry!.status_body).pm_status_request_digest;
    } catch { return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID",400); }
    // Source-selected original PM reference and payload mapping are independent
    // from Core browser intent. Bind their exact HTTP bytes, never guess them.
    if(request.request_digest!==expectedDigest)return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH",409);
    if (request.binding_digest !== s.binding_digest || request.receiver_id !== s.receiver_id ||
      request.workload_id !== s.workload_id || !s.paths.includes(request.path))
      return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH", 403);
    const binding = { workspace_id: s.workspace_id, environment: s.environment, workload_id: s.workload_id,
      request_digest: pmHttpRequestDigest({ method: request.method, raw_path: Buffer.from(request.path, "utf8"),
        query_string: Buffer.alloc(0), body: Buffer.from(request.body_utf8, "utf8") }, { request_bytes: 1_048_576 }) };
    if (binding.request_digest !== request.request_digest) return fail("COMMAND_STATUS_ASSERTION_REQUEST_DIGEST_MISMATCH", 409);
    const key = `${request.path}:${binding.request_digest}`;
    const issueNew = (): Delivery => {
      // Count EVERY logical issuance, including same-path/digest rotations;
      // a completed Idle poll cannot evade the per-context lifetime quota.
      if (entry!.issued >= this.limits.maximum_requests_per_context || this.pending >= 16)
        return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED", 429);
      const statusClaims=decodeJwt(entry!.status_token!);
      const statusIssued=Number(statusClaims.iat)*1000;
      if (!digest.safeParse(statusClaims.request_digest).success || !Number.isSafeInteger(statusIssued))
        return fail("COMMAND_STATUS_ASSERTION_ISSUER_BINDING_INVALID");
      const link:CommandStatusContextLink={
        context_digest:accessDigest(token),context_nonce:entry!.context_nonce,original_digest:accessDigest(entry!.input.original),
        call_digest:entry!.input.call_digest,binding_digest:s.binding_digest,authority_fingerprint:current.fingerprint,
        receiver_id:s.receiver_id,delivery_sequence:request.delivery_sequence,previous_lease_id:request.previous_lease_id,
        context_expires_at_ms:entry!.expires,status_token_digest:accessDigest(entry!.status_token!),
        status_request_digest:statusClaims.request_digest as string,status_issued_at_ms:statusIssued};
      const rawRequest:PmHttpRequestBytes={method:request.method,raw_path:Buffer.from(request.path,"utf8"),
        query_string:Buffer.alloc(0),body:Buffer.from(request.body_utf8,"utf8")};
      // Microtask boundary ensures the cache and pending ownership exist BEFORE
      // candidate.issue starts, even for synchronous re-entry or lost response.
      entry!.issued++; entry!.pending++; this.pending++;
      const pending = Promise.resolve().then(async () => {
        this.issueCurrent(entry);
        let issued: Issued;
        try { issued=await this.candidate.issueCommandStatus({ ...entry!.actor }, { ...binding }, {...link},rawRequest); }
        catch(error) {
          if(error instanceof C2CustodyPendingError && this.recovery && entry!.last===delivery) {
            // The original lease/link may already be committed. Keep its
            // quota reservation and force an authenticated source + durable
            // link lookup; never call issueNew to replace it on a retry.
            entry!.last=undefined;
            entry!.recovery_required=true;
            return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
          }
          if(error instanceof CurrentHumanLeaseError && ["CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED",
            "CURRENT_HUMAN_CAPACITY_EXHAUSTED","CURRENT_HUMAN_DRAINING"].includes(error.code)) {
            // These exact writer guards run under the DB authority lock
            // BEFORE the lease INSERT. A later retry may proceed after the
            // underlying custody/capacity/drain condition is resolved;
            // ambiguous failures keep their existing delivery/promise.
            if(entry!.last===delivery){
              // Only the writer's proven pre-INSERT refusals can return the
              // reservation. Otherwise repeated recovery polling could use
              // the entire delivery quota without having issued any lease.
              entry!.issued--;
              entry!.last=undefined;
            }
            if(error.code==="CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED")
              {if(this.recovery)entry!.recovery_required=true;return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);}
          }
          throw error;
        }
        const own = decodeJwt(issued.token), issuedAt = Number(own.iat) * 1000;
        if (own.jti !== issued.lease_id || own.sub !== entry!.actor.user_id || own.sid !== entry!.actor.session_id ||
          own.session_revision !== entry!.actor.session_generation || own.purpose !== "pma.identity.v1" ||
          own.workspace_id !== s.workspace_id || own.environment !== s.environment || own.workload_id !== s.workload_id ||
          own.request_digest !== binding.request_digest || own.authority_revision !== issued.authority_revision ||
          Number(own.exp) * 1000 !== issued.expires_at_ms)
          return fail("COMMAND_STATUS_ASSERTION_ISSUER_BINDING_INVALID");
        const { body_utf8: _body, ...echo } = request;
        try { return commandSourceAssertionResponse.parse({ ...echo,
          schema_version: "portal.execution.command-source-assertion-response.v1", assertion: issued.token,
          lease_id: issued.lease_id, issued_at_ms: issuedAt, expires_at_ms: issued.expires_at_ms,
          authority_revision: issued.authority_revision }); }
        catch { return fail("COMMAND_STATUS_ASSERTION_ISSUER_RESPONSE_INVALID"); }
      }).finally(() => { entry!.pending--; this.pending--; this.prune(this.time()); });
      const delivery: Delivery = { sequence: request.delivery_sequence, previous_lease_id: request.previous_lease_id,
        key, binding: { ...binding }, link, response: pending, completed: false };
      entry!.last = delivery;
      return delivery;
    };
    let delivery: Delivery;
    while (true) {
      const previous = entry!.last;
      if (!previous) {
        if (request.delivery_sequence !== 0 || request.previous_lease_id !== null)
          return fail("COMMAND_STATUS_ASSERTION_DELIVERY_SEQUENCE_INVALID", 409);
        delivery = issueNew(); break;
      }
      if (request.delivery_sequence === previous.sequence) {
        if (key !== previous.key || request.previous_lease_id !== previous.previous_lease_id)
          return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH", 409);
        delivery = previous; break;
      }
      if (request.delivery_sequence !== previous.sequence + 1)
        return fail("COMMAND_STATUS_ASSERTION_DELIVERY_SEQUENCE_INVALID", 409);
      if (!previous.completed) return fail("COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED", 409);
      const response = await previous.response;
      this.issueCurrent(entry);
      if (request.previous_lease_id !== response.lease_id) return fail("COMMAND_STATUS_ASSERTION_PREVIOUS_LEASE_MISMATCH", 409);
      // Completion ACK is a historical fact, NOT renewed permission. The next
      // read must freshly authenticate the previous exact terminal custody too.
      const terminal = await this.terminal(entry!, previous.binding, response);
      this.issueCurrent(entry);
      if (!terminal) return fail("COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED", 409);
      // Compare/swap has no await. Concurrent successors share ONE issuance;
      // different bytes for that same sequence refuse on the next iteration.
      if (entry!.last !== previous) continue;
      delivery = issueNew(); break;
    }
    // Failed/ambiguous acquisition stays on this exact sequence and Promise.
    // A terminal source result does NOT make same-sequence retry a new read.
    const response = await delivery.response;
    this.issueCurrent(entry);
    if(entry!.last!==delivery)return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
    await this.revalidate(entry!,binding,response,delivery.link);
    this.issueCurrent(entry);
    if(entry!.last!==delivery)return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
    const final=await this.authorize(entry!.input);this.issueCurrent(entry);
    if(entry!.last!==delivery)return fail("COMMAND_STATUS_ASSERTION_DELIVERY_REQUEST_MISMATCH",409);
    if(final.fingerprint!==entry!.fingerprint || entry!.expires>final.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    if (this.time() >= response.expires_at_ms) return fail("COMMAND_STATUS_ASSERTION_EXPIRED", 403);
    return { ...response };
  }
  /** After a process restart only return the original, still-ISSUED assertion
   * when the authenticated Edge sends the exact previously linked request.
   * This path never creates or rotates a lease or starts a source attempt. */
  private async recoverIssue(token: string, request: CommandSourceAssertionRequest,requireIssued=false): Promise<CommandSourceAssertionResponse> {
    const recovery = this.recovery, resume = this.candidate.resumeCommandStatusIssue;
    if (!recovery || !resume || this.stopped) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    if (this.pending >= 16) return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    this.pending++;
    try {
      const found = await this.pool.query(`SELECT c.lease_id,c.previous_lease_id,c.context_nonce,c.original_digest,c.call_digest,c.binding_digest,
        c.authority_fingerprint,c.request_digest,c.receiver_id,c.context_expires_at_ms,c.status_token_digest,
        c.status_request_digest,c.status_issued_at_ms,l.subject_id,l.session_id,l.session_revision,
        l.workspace_id,l.environment,l.workload_id,f.command_id,f.pm_status_request_digest
        FROM execution_command_status_context_links c
        JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id
        JOIN execution_command_status_original_fingerprints f ON f.original_digest=c.original_digest
        JOIN execution_trusted_commands t ON t.command_id=f.command_id AND t.workspace_id=l.workspace_id
        WHERE c.context_digest=$1 AND c.delivery_sequence=$2 LIMIT 2`, [accessDigest(token),request.delivery_sequence]);
      if (found.rowCount !== 0 && found.rowCount !== 1) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
      let unissued=false;
      let row=found.rows[0];
      if(found.rowCount===0) {
        // A same-process pending or competing ISSUE is not the pre-lease
        // restart case. Absence of its link must never authorize a new ISSUE.
        if(requireIssued)return fail("COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",409);
        // Only a persisted, still-live original preparation may recover the
        // pre-lease window. An arbitrary old context cannot mint authority.
        const prepared=await this.preparations.find(accessDigest(token));
        if(!prepared || request.delivery_sequence!==0 || request.previous_lease_id!==null)
          return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
        // A preparation that lost a cross-process race cannot supersede an
        // already issued original, even if its own short-lived row remains.
        // The transactional issuer repeats this fence under the authority lock.
        const outstanding=await this.pool.query(`SELECT l.lease_id FROM elp210_candidate.leases l
          LEFT JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
          WHERE l.workspace_id=$1 AND l.environment='paper' AND l.workload_id=$2
            AND (c.original_digest=$3 OR l.request_digest=$4)
            AND NOT EXISTS (SELECT 1 FROM execution_command_status_delivery_acks a
              WHERE a.lease_id=l.lease_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
                AND a.session_revision=l.session_revision AND a.workspace_id=l.workspace_id
                AND a.environment=l.environment AND a.workload_id=l.workload_id
                AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
                AND l.phase IN ('COMMITTED','ROLLED_BACK')) LIMIT 1`,
        [prepared.workspace_id,prepared.workload_id,prepared.original_digest,prepared.pm_request_digest]);
        if(outstanding.rowCount) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
        row={...prepared,environment:"paper",request_digest:prepared.pm_request_digest,previous_lease_id:null};
        unissued=true;
      }
      const expires=Number(row.context_expires_at_ms), sessionRevision=Number(row.session_revision);
      const current=()=>{if(this.stopped || !Number.isSafeInteger(expires) || this.time()>=expires)
        return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
        const live=this.contexts.get(token);if(live)this.issueCurrent(live);};
      current();
      if (!Number.isSafeInteger(sessionRevision) || !digest.safeParse(row.authority_fingerprint).success ||
        !digest.safeParse(row.original_digest).success || !digest.safeParse(row.call_digest).success ||
        row.binding_digest!==request.binding_digest || row.request_digest!==request.request_digest ||
        row.pm_status_request_digest!==request.request_digest || row.previous_lease_id!==request.previous_lease_id ||
        row.receiver_id!==request.receiver_id || row.receiver_id!==this.config.audience ||
        row.workload_id!==request.workload_id || row.workload_id!==this.config.workload_id || row.environment!=="paper" ||
        pmHttpRequestDigest({method:request.method,raw_path:Buffer.from(request.path,"utf8"),query_string:Buffer.alloc(0),
          body:Buffer.from(request.body_utf8,"utf8")},{request_bytes:1_048_576})!==request.request_digest)
        return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",403);
      const actor=actorSchema.parse({user_id:row.subject_id,session_id:row.session_id,session_generation:sessionRevision});
      const stored=await this.store.workflowCandidate(row.workspace_id,row.command_id);current();
      if(!stored)return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISSING",404);
      const authorization=commandAuthorization.parse(stored.authorization),
        intent=workflowCommandRecord(stored,row.workspace_id,row.command_id,workflowCommandTarget(stored)).intent;
      const before=await this.authorizeBase(actor,authorization,intent);current();
      if(before.fingerprint!==row.authority_fingerprint || expires>before.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      const signal=AbortSignal.timeout(Math.max(1,Math.min(5000,expires-this.time())));
      const original=await recovery.source.original({authorization,intent,contract:structuredClone(recovery.contract),signal});current();
      if(!original || accessDigest(original)!==row.original_digest || accessDigest({original,call:row.call_digest})!==row.binding_digest ||
        accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(actor),
          original,authorization_digest:accessDigest(authorization),intent_hash:authorization.intent_hash})!==row.call_digest)
        return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH",409);
      const captured={actor,authorization,intent,contract:structuredClone(recovery.contract),original,
        action:"STATUS" as const,call_digest:row.call_digest};
      const beforeIssue=await this.authorize(captured);current();
      if(beforeIssue.fingerprint!==row.authority_fingerprint || expires>beforeIssue.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      if(unissued) {
        await this.restoreOutboundContext(token,captured,row,beforeIssue,true);current();
        const entry=this.contexts.get(token);
        if(!entry)return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
        // The exact PM request digest, not reconstructed source bytes, was
        // pinned before the outgoing STATUS token escaped. issue() also checks
        // the authenticated callback bytes and the native candidate writer.
        entry.status_body=JSON.stringify({pm_status_request_digest:row.pm_request_digest});
        return await this.issue(token,request);
      }
      const binding:CurrentHumanBinding={workspace_id:row.workspace_id,environment:"paper",workload_id:row.workload_id,request_digest:row.request_digest};
      const link:CommandStatusContextLink={context_digest:accessDigest(token),context_nonce:row.context_nonce,
        original_digest:row.original_digest,call_digest:row.call_digest,binding_digest:row.binding_digest,
        authority_fingerprint:row.authority_fingerprint,status_token_digest:row.status_token_digest,
        status_request_digest:row.status_request_digest,status_issued_at_ms:Number(row.status_issued_at_ms),
        receiver_id:row.receiver_id,delivery_sequence:request.delivery_sequence,previous_lease_id:row.previous_lease_id,
        context_expires_at_ms:expires};
      const rawRequest:PmHttpRequestBytes={method:request.method,raw_path:Buffer.from(request.path,"utf8"),
        query_string:Buffer.alloc(0),body:Buffer.from(request.body_utf8,"utf8")};
      const issued=await resume.call(this.candidate,actor,binding,row.lease_id as string,rawRequest,link);current();
      await this.candidate.revalidateIssue(actor,binding,issued,{...link});current();
      const final=await this.authorize(captured);current();
      if(final.fingerprint!==row.authority_fingerprint || expires>final.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      if(this.time()>=issued.expires_at_ms)return fail("COMMAND_STATUS_ASSERTION_EXPIRED",403);
      await this.restoreOutboundContext(token,captured,row,final);current();
      const claims=decodeJwt(issued.token), issuedAt=Number(claims.iat)*1000;
      const {body_utf8:_body,...echo}=request;
      return commandSourceAssertionResponse.parse({...echo,schema_version:"portal.execution.command-source-assertion-response.v1",
        assertion:issued.token,lease_id:issued.lease_id,issued_at_ms:issuedAt,expires_at_ms:issued.expires_at_ms,
        authority_revision:issued.authority_revision});
    } finally {this.pending--;this.prune(this.time());}
  }
  /** Only the authenticated pinned Edge transport may call this seam after
   * verifying the exact raw PM envelope. Acquire/send/timeout are NOT completion.
   * A response digest records that explicit acknowledgement, not Core-produced
   * command STATUS proof. This operation never issues a lease or changes source rows.
   */
  private async recoverCompletion(token: string, request: CommandSourceAssertionCompletionRequest): Promise<CommandSourceAssertionCompletionResponse> {
    const recovery = this.recovery;
    if (!recovery || this.stopped) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
    if (this.pending >= 16) return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    this.pending++;
    try {
      // Only a previously persisted, unambiguous context/lease/command link
      // can be recovered. No token, source body, terminal or ACK is minted.
      const found = await this.pool.query(`SELECT c.context_nonce,c.original_digest,c.call_digest,c.binding_digest,c.authority_fingerprint,
        c.request_digest,c.receiver_id,c.context_expires_at_ms,c.status_token_digest,c.status_request_digest,
        c.status_issued_at_ms,l.subject_id,l.session_id,l.session_revision,
        l.workspace_id,l.environment,l.workload_id,l.expires_at_ms,l.authority_revision,
        f.command_id,f.pm_status_request_digest
        FROM execution_command_status_context_links c
        JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id
        JOIN execution_command_status_original_fingerprints f ON f.original_digest=c.original_digest
        JOIN execution_trusted_commands t ON t.command_id=f.command_id AND t.workspace_id=l.workspace_id
        WHERE c.context_digest=$1 AND c.delivery_sequence=$2 AND c.lease_id=$3 LIMIT 2`,
      [accessDigest(token),request.delivery_sequence,request.lease_id]);
      if (found.rowCount !== 1) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
      const row = found.rows[0];
      const expires = Number(row.context_expires_at_ms), leaseExpires = Number(row.expires_at_ms),
        revision = Number(row.authority_revision), sessionRevision = Number(row.session_revision);
      const current = () => {
        if (this.stopped || !Number.isSafeInteger(expires) || this.time() >= expires)
          return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
      };
      current();
      if (!Number.isSafeInteger(leaseExpires) || !Number.isSafeInteger(revision) || !Number.isSafeInteger(sessionRevision) ||
        !digest.safeParse(row.authority_fingerprint).success || !digest.safeParse(row.original_digest).success ||
        !digest.safeParse(row.call_digest).success || row.binding_digest !== request.binding_digest ||
        row.request_digest !== request.request_digest || row.pm_status_request_digest !== request.request_digest ||
        row.receiver_id !== request.receiver_id || row.receiver_id !== this.config.audience ||
        row.workload_id !== request.workload_id || row.workload_id !== this.config.workload_id || row.environment !== "paper")
        return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH",409);
      const actor = actorSchema.parse({user_id:row.subject_id,session_id:row.session_id,session_generation:sessionRevision});
      const stored = await this.store.workflowCandidate(row.workspace_id,row.command_id); current();
      if (!stored) return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISSING",404);
      const originalRecord = workflowCommandRecord(stored,row.workspace_id,row.command_id,workflowCommandTarget(stored));
      const authorization = commandAuthorization.parse(stored.authorization), intent = originalRecord.intent;
      // Check exact current human access BEFORE fetching any source original.
      const before = await this.authorizeBase(actor,authorization,intent); current();
      if (before.fingerprint !== row.authority_fingerprint || expires > before.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      const signal = AbortSignal.timeout(Math.max(1,Math.min(5000,expires-this.time())));
      const original = await recovery.source.original({authorization,intent,contract:structuredClone(recovery.contract),signal}); current();
      if (!original || accessDigest(original) !== row.original_digest ||
        accessDigest({original,call:row.call_digest}) !== row.binding_digest ||
        accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(actor),
          original,authorization_digest:accessDigest(authorization),intent_hash:authorization.intent_hash}) !== row.call_digest)
        return fail("COMMAND_STATUS_ASSERTION_ORIGINAL_MISMATCH",409);
      const input = {actor,authorization,intent,contract:structuredClone(recovery.contract),original,
        action:"STATUS" as const,call_digest:row.call_digest};
      const verified = await this.authorize(input); current();
      if (verified.fingerprint !== row.authority_fingerprint || expires > verified.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      const binding: CurrentHumanBinding = {workspace_id:row.workspace_id,environment:"paper",
        workload_id:row.workload_id,request_digest:row.request_digest};
      const issued: LeaseIdentity = {lease_id:request.lease_id,expires_at_ms:leaseExpires,authority_revision:revision};
      if (!this.candidate.canReplaceResolvedIssue ||
        !await this.candidate.canReplaceResolvedIssue(actor,binding,issued))
        return fail("COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED",409);
      current();
      if (!await this.candidate.acknowledgeCommandStatusIssue(actor,binding,issued,request.response_digest))
        return fail("COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED",409);
      current();
      const final = await this.authorize(input); current();
      if (final.fingerprint !== row.authority_fingerprint || expires > final.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      await this.restoreOutboundContext(token,input,row,final);current();
      return commandSourceAssertionCompletionResponse.parse({schema_version:"portal.execution.command-source-assertion-completion-response.v1",
        delivery_sequence:request.delivery_sequence,lease_id:request.lease_id,request_digest:request.request_digest,
        response_digest:request.response_digest,completed:true});
    } finally {this.pending--;this.prune(this.time());}
  }
  async complete(token: string, input: unknown): Promise<CommandSourceAssertionCompletionResponse> {
    let request: CommandSourceAssertionCompletionRequest;
    try { request = commandSourceAssertionCompletionRequest.parse(snapshot(input, ["schema_version", "binding_digest", "receiver_id",
      "workload_id", "delivery_sequence", "lease_id", "request_digest", "response_digest"])); }
    catch { return fail("COMMAND_STATUS_ASSERTION_REQUEST_INVALID", 400); }
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED", 403);
    const entry = this.contexts.get(token);
    if (!entry || entry.restored) return this.recoverCompletion(token,request);
    this.current(entry);
    // A cached completion is still a disclosure. Recheck current authority on
    // every retry, including retries after a previous successful Edge ACK.
    const before=await this.authorize(entry!.input);this.current(entry);
    if(before.fingerprint!==entry!.fingerprint || entry!.expires>before.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    const s = entry!.selection, delivery = entry!.last;
    if (request.binding_digest !== s.binding_digest || request.receiver_id !== s.receiver_id || request.workload_id !== s.workload_id)
      return fail("COMMAND_STATUS_ASSERTION_BINDING_MISMATCH", 403);
    if (!delivery || request.delivery_sequence !== delivery.sequence || request.request_digest !== delivery.binding.request_digest)
      return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH", 409);
    const response = await delivery.response; this.current(entry);
    if (entry!.last !== delivery || request.lease_id !== response.lease_id)
      return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH", 409);
    if (delivery.completion && delivery.completion.response_digest !== request.response_digest)
      return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH", 409);
    if (!delivery.completion) delivery.completion = { response_digest: request.response_digest };
    const completion = delivery.completion;
    if (!completion.pending) {
      // Coalesce an exact lost-ACK retry. A refused read-only proof may be
      // checked again after SAME-original source recovery, without any ISSUE.
      const pending = Promise.resolve().then(async () => {
        const terminal = await this.terminal(entry!, delivery.binding, response);
        this.current(entry);
        if (entry!.last !== delivery) return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH", 409);
        if (!terminal) return fail("COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED", 409);
        if(this.pending>=16)return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
        entry!.pending++;this.pending++;
        try {
          // Persist the exact Edge ACK under the same authority lock as the
          // source-terminal recheck. A restart may not infer this from phase.
          if(await this.candidate.acknowledgeCommandStatusIssue({ ...entry!.actor },delivery.binding,
            this.issued(response),request.response_digest)!==true)
            return fail("COMMAND_STATUS_ASSERTION_TERMINAL_NOT_CONFIRMED",409);
        } finally {entry!.pending--;this.pending--;this.prune(this.time());}
        this.current(entry);
        if(entry!.last!==delivery)return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH",409);
        delivery.completed = true;
        return commandSourceAssertionCompletionResponse.parse({
          schema_version: "portal.execution.command-source-assertion-completion-response.v1",
          delivery_sequence: request.delivery_sequence, lease_id: request.lease_id,
          request_digest: request.request_digest, response_digest: request.response_digest, completed: true,
        });
      }).catch(error => { if (!delivery.completed) completion.pending = undefined; throw error; });
      completion.pending = pending;
    }
    const result = await completion.pending; this.current(entry);
    if (entry!.last !== delivery) return fail("COMMAND_STATUS_ASSERTION_COMPLETION_MISMATCH", 409);
    // ACK can commit while access changes. Preserve that durable ACK but do
    // not send its completion response to a requester who lost authority.
    const final=await this.authorize(entry!.input);this.current(entry);
    if(final.fingerprint!==entry!.fingerprint || entry!.expires>final.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    return { ...result };
  }
  private issued(response: CommandSourceAssertionResponse): Issued {
    return { token: response.assertion, lease_id: response.lease_id, expires_at_ms: response.expires_at_ms,
      authority_revision: response.authority_revision };
  }
  private async revalidate(entry:Entry,binding:CurrentHumanBinding,response:CommandSourceAssertionResponse,
    link:CommandStatusContextLink):Promise<void> {
    // Each retry performs live authority I/O even when ISSUE was coalesced.
    // Retain and bound it until the actual check settles, including shutdown.
    if(this.pending>=16)return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED",429);
    this.issueCurrent(entry);entry.pending++;this.pending++;
    try {await this.candidate.revalidateIssue({...entry.actor},{...binding},this.issued(response),{...link});}
    finally {entry.pending--;this.pending--;this.prune(this.time());}
  }
  private async terminal(entry: Entry, binding: CurrentHumanBinding, response: CommandSourceAssertionResponse): Promise<boolean> {
    const before=await this.authorize(entry.input); this.current(entry);
    if(before.fingerprint!==entry.fingerprint || entry.expires>before.valid_until_ms)
      return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
    if (!this.candidate.canReplaceResolvedIssue) return false;
    if (this.pending >= 16) return fail("COMMAND_STATUS_ASSERTION_CAPACITY_EXHAUSTED", 429);
    this.current(entry); entry.pending++; this.pending++;
    try {
      const terminal=await this.candidate.canReplaceResolvedIssue({ ...entry.actor }, { ...binding }, this.issued(response)) === true;
      const final=await this.authorize(entry.input);this.current(entry);
      if(final.fingerprint!==entry.fingerprint || entry.expires>final.valid_until_ms)
        return fail("COMMAND_STATUS_ASSERTION_AUTHORITY_CHANGED",409);
      return terminal;
    }
    finally { entry.pending--; this.pending--; this.prune(this.time()); }
  }
  release(token: string): void { const entry = this.contexts.get(token); if (entry) entry.retired = true; this.prune(this.time()); }
  shutdown(): void { this.stopped = true; for (const entry of this.contexts.values()) entry.retired = true; this.prune(this.time()); }
  snapshot() { return Object.freeze({ contexts: this.contexts.size,
    pending: this.pending, preparing: this.preparing.size, preparation_waiters: this.preparationWaiters, stopped: this.stopped }); }
  private time(): number { const now = this.now(); if (!Number.isSafeInteger(now) || now < 0) return fail("COMMAND_STATUS_ASSERTION_CLOCK_INVALID"); return now; }
  private current(entry: Entry | undefined): void {
    if (this.stopped || !entry || entry.retired || this.time() >= entry.expires)
      fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED", 403);
  }
  private issueCurrent(entry: Entry | undefined): void {
    this.current(entry);
    if(entry!.read_closing || entry!.read_completed)
      fail("COMMAND_STATUS_ASSERTION_CONTEXT_REQUIRED",403);
  }
  private prune(now: number): void {
    for (const [token, entry] of this.contexts) {
      // Expiry is not a delivery ACK or permission to issue a replacement.
      // Persisted custody is never changed by this in-memory cleanup.
      if (!entry.pending && (!entry.last || entry.last.completed) && (entry.retired || now >= entry.expires)) {
        this.contexts.delete(token);
        for(const [key,value] of this.calls)if(value===token)this.calls.delete(key);
      }
    }
  }
}
