import { isIP, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { AuthService } from "../auth/auth.service";
import { CurrentViewAuthority, type CurrentViewOperation, type CurrentViewSelection } from "./current-view-authority";
import { CurrentViewEdgeClient, type CurrentViewEdgeClientConfig, type SelectedCurrentViewEdgeRead } from "./current-view-edge-client";
import { createCurrentViewTransport, type CurrentViewTransportConfig } from "./current-view-transport";
import { ExecutionReadScopeError, type ExecutionReadScopes, type ReadScopePrincipal, type HeldNativeReadScopes } from "./read-scope";
import { accessDigest } from "./access-digest";

export interface CurrentViewCompositionConfig {
  authority: { ttl_ms: number; maximum_contexts: number };
  transport: Omit<CurrentViewTransportConfig, "tls"> & { tls: CurrentViewEdgeClientConfig["tls"] };
  edge: CurrentViewEdgeClientConfig;
  shutdown_deadline_ms: number;
}
type State = "CREATED" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED";
export class CurrentViewCompositionError extends Error {
  constructor(readonly code: "CURRENT_VIEW_COMPOSITION_CONFIG_INVALID" | "CURRENT_VIEW_COMPOSITION_NOT_RUNNING" |
    "CURRENT_VIEW_COMPOSITION_START_FAILED" | "CURRENT_VIEW_COMPOSITION_SHUTDOWN_PENDING", readonly status = 503) {
    super("The private current-view composition is not available.");
  }
}
const failure = (code: CurrentViewCompositionError["code"]) => new CurrentViewCompositionError(code);
const copy = (value: string | Buffer) => typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
const privateHost = (host: string) => isIP(host) === 4
  ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host)
  : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/iu.test(host));

/** No duplicate authority evaluator: this only records contexts owned by this
 * composition, so shutdown and a late register result release EXACT custody.
 * It never mutates user/session/grant/source/audit rows or closes shared pools. */
class OwnedAuthority extends CurrentViewAuthority {
  constructor(auth: AuthService, scopes: ExecutionReadScopes, options: CurrentViewCompositionConfig["authority"],
    private readonly active: () => boolean, private readonly owned: Set<string>) { super(auth, scopes, options); }
  override async register(...args: Parameters<CurrentViewAuthority["register"]>) {
    if (!this.active()) throw failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING");
    const registered = await super.register(...args);
    if (!this.active()) { super.release(registered.original_context); throw failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING"); }
    this.owned.add(registered.original_context);
    return registered;
  }
  override release(token: string): void { this.owned.delete(token); super.release(token); }
}

/** Actual Core factory over its existing AuthService + ExecutionReadScopes.
 * Import/construction never bind a port. start needs an explicit private IP;
 * no AppModule mounting, trust generation, accounts/grants or source selection
 * is implicit. Only authenticated SERVER callers pass principals/selections.
 * HISTORY still needs an explicitly commissioned independent-purpose mapping;
 * neither this lifecycle nor CURRENT/STREAM substitutes for it. REPLAY is not
 * a finite read and its additional per-frame purpose fence remains closed. */
export class CurrentViewCoreComposition {
  private state: State = "CREATED";
  private readonly contexts = new Set<string>();
  private readonly reads = new Set<Promise<unknown>>();
  private readonly aborts = new Set<AbortController>();
  private readonly sockets = new Set<Duplex>();
  private readonly authority: OwnedAuthority;
  private readonly client: CurrentViewEdgeClient;
  private readonly transport: ReturnType<typeof createCurrentViewTransport>;
  private readonly workload: string;
  private readonly edgeResponseBytes: number;
  private readonly shutdownMs: number;
  private starting?: Promise<AddressInfo>;
  private startingPending = false;
  private stopping?: Promise<void>;
  constructor(auth: AuthService, private readonly scopes: ExecutionReadScopes, config: CurrentViewCompositionConfig) {
    if (!Number.isSafeInteger(config.shutdown_deadline_ms) || config.shutdown_deadline_ms < 1 || config.shutdown_deadline_ms > 5000)
      throw failure("CURRENT_VIEW_COMPOSITION_CONFIG_INVALID");
    this.shutdownMs = config.shutdown_deadline_ms;
    this.workload = config.transport.peer.workload_id;
    this.edgeResponseBytes = config.edge.limits.response_bytes;
    this.authority = new OwnedAuthority(auth, scopes, { ...config.authority }, () => this.state === "RUNNING", this.contexts);
    this.client = new CurrentViewEdgeClient(this.authority, config.edge);
    this.transport = createCurrentViewTransport(this.authority, { ...config.transport,
      tls: { key: copy(config.transport.tls.key), cert: copy(config.transport.tls.cert), ca: copy(config.transport.tls.ca) } });
    this.transport.server.on("connection", socket => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); });
    this.transport.server.on("secureConnection", socket => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); });
    this.transport.server.on("error", () => { if (this.state === "RUNNING") { this.state = "FAILED"; this.stopAdmission(); } });
  }
  start(target: { host: string; port: number }): Promise<AddressInfo> {
    if (this.state !== "CREATED" || !privateHost(target.host) || !Number.isSafeInteger(target.port) || target.port < 0 || target.port > 65535)
      return Promise.reject(failure("CURRENT_VIEW_COMPOSITION_CONFIG_INVALID"));
    // Port zero is explicit ephemeral selection, useful only for local cells;
    // the returned actual address must be pinned before a peer can use it.
    this.state = "STARTING"; this.startingPending = true;
    this.starting = new Promise<AddressInfo>((resolve, reject) => {
      const server = this.transport.server;
      const settled = () => { this.startingPending = false; server.off("error", onError); server.off("close", onClose); };
      const onError = () => { settled(); if (this.state === "STARTING") this.state = "FAILED"; reject(failure("CURRENT_VIEW_COMPOSITION_START_FAILED")); };
      const onClose = () => { settled(); reject(failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING")); };
      server.once("error", onError);
      server.once("close", onClose);
      server.listen(target.port, target.host, () => {
        settled();
        const address = server.address();
        if (this.state !== "STARTING" || !address || typeof address === "string") {
          server.close(); reject(failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING")); return;
        }
        this.state = "RUNNING"; resolve({ ...address });
      });
    });
    return this.starting;
  }
  read(principal: ReadScopePrincipal, selection: SelectedCurrentViewEdgeRead, operation: CurrentViewOperation,
    signal?: AbortSignal, native?: HeldNativeReadScopes): Promise<{ status: 200; body: Buffer }> {
    if (this.state !== "RUNNING") return Promise.reject(failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING"));
    const abort = new AbortController(), cancel = () => abort.abort();
    this.aborts.add(abort); signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const pending = this.client.read(principal, this.workload, selection, operation, abort.signal, native).finally(() => {
      this.reads.delete(pending); this.aborts.delete(abort); signal?.removeEventListener("abort", cancel);
    });
    this.reads.add(pending);
    return pending;
  }
  /** Compound BFF delivery fence, outside the individual grain reads. A
   * revocation between account and balances must invalidate the ENTIRE reply,
   * not return an earlier authorized grain beside a newer one. Same ordinary
   * CurrentViewAuthority, same real principal, same tracked shutdown custody. */
  deliver<T>(principal: ReadScopePrincipal, selection: CurrentViewSelection, operation: CurrentViewOperation,
    read: () => Promise<T>): Promise<T> {
    if (this.state !== "RUNNING") return Promise.reject(failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING"));
    const pending = this.authority.withOriginalContext(principal, this.workload, selection, operation, async context => {
      const request = { original_context: context.original_context, workload_id: this.workload,
        operation, resource_ref: selection.resource_ref };
      const decision = await this.authority.resolve(request);
      return this.authority.deliver({ ...request, decision_digest: decision.decision_digest }, async () => {
        if (this.state !== "RUNNING") throw failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING");
        const result = await read();
        if (this.state !== "RUNNING") throw failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING");
        return result;
      });
    }).finally(() => { this.reads.delete(pending); });
    this.reads.add(pending); return pending;
  }
  hasNativeCurrentRelations(): boolean { return this.scopes.hasNativeCurrentRelations(); }
  /** Private configured bound, not an upstream capability or authorization. */
  currentReadResponseLimit(): number { return this.edgeResponseBytes; }

  /** One native physical response for the complete BFF. Exact requirements
   * deduplicate, not source resources/datasets/field proofs. An internal query
   * callback can read only a selection supplied before native admission. */
  deliverNative(principal: ReadScopePrincipal, selections: readonly CurrentViewSelection[], response: ServerResponse,
    build: (read: (selection: SelectedCurrentViewEdgeRead) => Promise<{ status: 200; body: Buffer }>) => Promise<Buffer>,
    validation?: { validateAfterEnter?: () => Promise<void>; validateBeforeDispatch?: () => void }): Promise<void> {
    const active = () => { if (this.state !== "RUNNING") throw failure("CURRENT_VIEW_COMPOSITION_NOT_RUNNING"); };
    active();
    if (!this.hasNativeCurrentRelations()) return Promise.reject(new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503));
    const actor = structuredClone(principal), selected = structuredClone(selections);
    const pending = (async () => {
      if (!Array.isArray(selected) || selected.length < 1 || selected.length > 128)
        throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT", 503);
      const originals = new Map<string, CurrentViewSelection>();
      for (const item of selected) {
        if (!Array.isArray(item.fields)) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
        const key = accessDigest({ binding: item.binding, requirement: item.read_requirement });
        const previous = originals.get(key);
        if (previous) originals.set(key, { ...previous, fields: [...new Set([...previous.fields, ...item.fields])],
          ...((previous.detail_fields || item.detail_fields) ?
            { detail_fields: [...new Set([...(previous.detail_fields ?? []), ...(item.detail_fields ?? [])])] } : {}) });
        else originals.set(key, structuredClone(item));
      }
      if (originals.size > 4) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT", 503);
      const scopes = [];
      for (const item of originals.values()) { active(); scopes.push(await this.authority.prepareNativeCurrent(actor, item)); }
      active();
      const allowed = new Set(selected.map(item => accessDigest(item)));
      await this.scopes.deliverNativeTogether(scopes, response, async ticket => {
        active();
        const bytes = await build(async input => {
          const captured = structuredClone(input);
          if (!allowed.has(accessDigest(captured.authority))) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
          active();
          return this.read(actor, captured, "CURRENT", undefined, ticket);
        });
        active(); return bytes;
      }, {
        validateAfterEnter: async () => { active(); await validation?.validateAfterEnter?.(); active(); },
        validateBeforeDispatch: () => {
          active();
          const result: unknown = validation?.validateBeforeDispatch?.();
          if (result !== undefined) {
            if (result && typeof (result as { then?: unknown }).then === "function") void Promise.resolve(result).catch(() => undefined);
            throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
          }
          active();
        },
      });
    })().finally(() => { this.reads.delete(pending); });
    this.reads.add(pending); return pending;
  }
  snapshot() {
    const address = this.transport.server.address();
    return Object.freeze({ state: this.state, owned_contexts: this.contexts.size, pending_reads: this.reads.size,
      edge_in_flight: this.client.snapshot().in_flight, policy_in_flight: this.transport.snapshot().in_flight,
      listener: address && typeof address !== "string" ? { address: address.address, port: address.port } : null });
  }
  private stopAdmission(): void {
    for (const token of this.contexts) this.authority.release(token);
    for (const abort of this.aborts) abort.abort();
    for (const socket of this.sockets) socket.destroy();
  }
  shutdown(): Promise<void> {
    if (this.state === "STOPPED") return Promise.resolve();
    if (this.stopping) return this.stopping;
    this.state = "STOPPING"; this.stopAdmission();
    this.stopping = this.drain().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  private async drain(): Promise<void> {
    const until = performance.now() + this.shutdownMs;
    let listenerClosed = false;
    this.transport.server.close(() => { listenerClosed = true; });
    while (true) {
      if (!this.reads.size && !this.transport.snapshot().in_flight && !this.sockets.size && listenerClosed && !this.startingPending && !this.transport.server.listening) break;
      if (performance.now() >= until) throw failure("CURRENT_VIEW_COMPOSITION_SHUTDOWN_PENDING");
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    this.stopAdmission(); this.state = "STOPPED";
  }
}
