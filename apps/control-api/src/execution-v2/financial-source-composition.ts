import { isIP, type AddressInfo } from "node:net";
import type { Server, ServerOptions } from "node:https";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "./current-human-candidate";
import { createCurrentHumanTransport, type CurrentHumanTransportConfig } from "./current-human-transport";
import type { CurrentHumanRecoveryPort, CurrentHumanReverseRecoveryParticipant } from "./current-human-mutations";
import { FinancialSourceAssertionAuthority, financialSourceAssertionRequest,
  type FinancialSourceAssertionSelection } from "./financial-source-assertion";
import { createFinancialSourceAssertionTransport,
  type FinancialSourceAssertionTransportConfig } from "./financial-source-assertion-transport";

export interface FinancialSourceCompositionConfig {
  candidate: CurrentHumanCandidateConfig;
  assertion_limits: { ttl_ms: number; maximum_contexts: number; maximum_requests_per_context: number };
  assertion_transport: FinancialSourceAssertionTransportConfig;
  current_human_transport: CurrentHumanTransportConfig;
  source_selection: FinancialSourceAssertionSelection;
  shutdown_deadline_ms: number;
}
export type FinancialSourceListenerTarget = { host: string; port: number };
export type FinancialSourceListenerTargets = { assertion: FinancialSourceListenerTarget; reverse: FinancialSourceListenerTarget };
type State = "CREATED" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED";
export class FinancialSourceCompositionError extends Error {
  constructor(readonly code: "FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID" | "FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING" |
    "FINANCIAL_SOURCE_COMPOSITION_START_FAILED" | "FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING" |
    "FINANCIAL_SOURCE_COMPOSITION_CANCELLED") {
    super("The private financial source composition is unavailable.");
  }
}
const failure = (code: FinancialSourceCompositionError["code"]) => new FinancialSourceCompositionError(code);
const selectionSchema = z.object({
  workspace_id: financialSourceAssertionRequest.shape.workload_id, environment: z.literal("paper"),
  workload_id: financialSourceAssertionRequest.shape.workload_id,
  receiver_id: financialSourceAssertionRequest.shape.receiver_id,
  binding_digest: financialSourceAssertionRequest.shape.binding_digest,
  paths: z.array(financialSourceAssertionRequest.shape.path).length(6).refine(paths => new Set(paths).size === paths.length),
}).strict();
const privateHost = (host: string) => typeof host === "string" && (isIP(host) === 4
  ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host)
  : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/iu.test(host)));
const validTarget = (target: FinancialSourceListenerTarget) => target && privateHost(target.host) &&
  Number.isSafeInteger(target.port) && target.port >= 0 && target.port <= 65535;
// Copy caller-owned PEM buffers/arrays before the async candidate factory.
// KeyObjects are immutable handles supplied explicitly by the installer.
function copyTlsValue<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(item => copyTlsValue(item)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyTlsValue(item)])) as T;
  return value;
}
const copyTls = (tls: Pick<ServerOptions, "key" | "cert" | "ca">) => ({
  key: copyTlsValue(tls.key), cert: copyTlsValue(tls.cert), ca: copyTlsValue(tls.ca),
});

/** Explicit Core-only composition, initially UNBOUND. A single real candidate
 * persists ISSUE and supplies the existing authenticated source ENTER/terminal
 * recovery routes. No AppModule/env mounting, account/grant/key creation or
 * automatic listener is introduced. The original context is server-only; its
 * registration is NOT an authorization decision. Candidate ISSUE and EVERY
 * cached delivery re-read the actual Core session/authority/lease.
 *
 * Closing contexts/listeners is not source rollback. Shutdown waits for both
 * transports' REAL pending DB promises and server callbacks, never deletes a
 * lease, never invokes a mutation/drain protocol or closes the shared pool.
 * An expired installation can still be constructed for same-key recovery;
 * the existing candidate itself fences new ISSUE/ENTER by its live DB clock.
 */
export class FinancialSourceComposition {
  private state: State = "CREATED";
  private readonly contexts = new Set<string>();
  private readonly uses = new Set<Promise<unknown>>();
  private readonly sockets = new Set<Duplex>();
  private readonly closing = new Set<Server>();
  private readonly authority: FinancialSourceAssertionAuthority;
  private readonly assertion: ReturnType<typeof createFinancialSourceAssertionTransport>;
  private readonly reverse: ReturnType<typeof createCurrentHumanTransport>;
  private startingPending = 0;
  private stopping?: Promise<void>;

  private constructor(private readonly candidate: CurrentHumanCandidate, private readonly config: FinancialSourceCompositionConfig) {
    this.authority = new FinancialSourceAssertionAuthority(candidate, config.assertion_limits);
    this.assertion = createFinancialSourceAssertionTransport({ issue: (context, input) => {
      if (this.state !== "RUNNING") return Promise.reject(failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING"));
      return this.authority.issue(context, input);
    }, complete: (context, input) => {
      if (this.state !== "RUNNING") return Promise.reject(failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING"));
      return this.authority.complete(context, input);
    } }, config.assertion_transport);
    this.reverse = createCurrentHumanTransport(candidate, config.current_human_transport);
    for (const { server } of [this.assertion, this.reverse]) {
      const track = (socket: Duplex) => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); };
      server.on("connection", track); server.on("secureConnection", track);
      server.on("error", () => {
        if (this.state === "RUNNING") { this.state = "FAILED"; this.stopAdmission(); this.closeListeners(); }
      });
    }
  }

  /** Startup routing only. The existing global mutation coordinator must
   * register this exact Candidate BEFORE a principal can issue. No transport,
   * source request, lease, separate candidate or source ACK is synthesized. */
  reverseRecoveryParticipant(recovery: CurrentHumanRecoveryPort): CurrentHumanReverseRecoveryParticipant {
    if (this.state !== "CREATED" || !recovery || typeof recovery.recover !== "function")
      throw failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID");
    return Object.freeze({ candidate: this.candidate, workload_id: this.config.candidate.source.workload_id, recovery });
  }

  static async create(pool: Pool, input: FinancialSourceCompositionConfig): Promise<FinancialSourceComposition> {
    if (!input || !input.candidate?.installation_scope || input.candidate.installation_scope.environment !== "paper" ||
      !Number.isSafeInteger(input.candidate.limits?.ttl_ms) || input.candidate.limits.ttl_ms < 1000 || input.candidate.limits.ttl_ms > 30_000 ||
      !Number.isSafeInteger(input.shutdown_deadline_ms) || input.shutdown_deadline_ms < 1 || input.shutdown_deadline_ms > 5000)
      throw failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID");
    let selection: FinancialSourceAssertionSelection;
    try { selection = selectionSchema.parse(input.source_selection); }
    catch { throw failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID"); }
    if (selection.workspace_id !== input.candidate.installation_scope.workspace_id ||
      selection.workload_id !== input.candidate.source?.workload_id ||
      selection.workload_id !== input.assertion_transport?.peer?.workload_id)
      throw failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID");
    const config: FinancialSourceCompositionConfig = {
      candidate: { ...input.candidate, source: { ...input.candidate.source }, limits: { ...input.candidate.limits },
        installation_scope: { ...input.candidate.installation_scope },
        ...(input.candidate.native_read_custody ? { native_read_custody: { ...input.candidate.native_read_custody,
          domain: { ...input.candidate.native_read_custody.domain } } } : {}) },
      assertion_limits: { ...input.assertion_limits }, source_selection: selection,
      assertion_transport: { ...input.assertion_transport, tls: copyTls(input.assertion_transport.tls),
        peer: { ...input.assertion_transport.peer }, limits: { ...input.assertion_transport.limits } },
      current_human_transport: { ...input.current_human_transport, tls: copyTls(input.current_human_transport.tls),
        limits: { ...input.current_human_transport.limits } },
      shutdown_deadline_ms: input.shutdown_deadline_ms,
    };
    const candidate = await CurrentHumanCandidate.create(pool, config.candidate);
    return new FinancialSourceComposition(candidate, config);
  }

  async start(targets: FinancialSourceListenerTargets): Promise<{ assertion: AddressInfo; reverse: AddressInfo }> {
    if (this.state !== "CREATED" || !targets || !validTarget(targets.assertion) || !validTarget(targets.reverse) ||
      (targets.assertion.port !== 0 && targets.assertion.host === targets.reverse.host && targets.assertion.port === targets.reverse.port))
      throw failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID");
    const selected = { assertion: { ...targets.assertion }, reverse: { ...targets.reverse } };
    this.state = "STARTING";
    try {
      const assertion = await this.listen(this.assertion.server, selected.assertion);
      if (this.state !== "STARTING") throw failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING");
      const reverse = await this.listen(this.reverse.server, selected.reverse);
      if (this.state !== "STARTING") throw failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING");
      this.state = "RUNNING";
      return { assertion, reverse };
    } catch (error) {
      if (this.state === "STARTING") this.state = "FAILED";
      this.stopAdmission(); this.closeListeners();
      throw error instanceof FinancialSourceCompositionError ? error : failure("FINANCIAL_SOURCE_COMPOSITION_START_FAILED");
    }
  }

  /** Explicit server-owner use only; normal startup remains UNBOUND. Aborting
   * retires admission immediately, but NEVER releases pending callback/source
   * ownership or closes the reverse listener needed for original settlement. */
  withPrincipal<T>(actor: AccessActor,
    use: (originalContext: string, registration: Readonly<{ expires_at_ms: number }>) => T | Promise<T>,
    options: { signal?: AbortSignal } = {}): Promise<T> {
    if (this.state !== "RUNNING" || typeof use !== "function") return Promise.reject(failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING"));
    const signal = options.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) return Promise.reject(failure("FINANCIAL_SOURCE_COMPOSITION_CONFIG_INVALID"));
    if (signal?.aborted) return Promise.reject(failure("FINANCIAL_SOURCE_COMPOSITION_CANCELLED"));
    let context: string, registration: Readonly<{ expires_at_ms: number }>;
    try {
      const selected = this.authority.register(actor, this.config.source_selection);
      context = selected.original_context;
      registration = Object.freeze({ expires_at_ms: selected.expires_at_ms });
    }
    catch (error) { return Promise.reject(error); }
    this.contexts.add(context);
    const retire = () => { this.authority.release(context); this.contexts.delete(context); };
    signal?.addEventListener("abort", retire, { once: true });
    const pending = Promise.resolve().then(() => {
      if (signal?.aborted) throw failure("FINANCIAL_SOURCE_COMPOSITION_CANCELLED");
      if (this.state !== "RUNNING") throw failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING");
      return use(context, registration);
    }).then(result => {
      if (signal?.aborted) throw failure("FINANCIAL_SOURCE_COMPOSITION_CANCELLED");
      if (this.state !== "RUNNING") throw failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING");
      return result;
    }).finally(() => { signal?.removeEventListener("abort", retire); retire(); this.uses.delete(pending); });
    this.uses.add(pending);
    return pending;
  }

  snapshot() {
    const listener = (server: Server) => { const address = server.address();
      return address && typeof address !== "string" ? { address: address.address, port: address.port } : null; };
    return Object.freeze({ state: this.state, owned_contexts: this.contexts.size, pending_uses: this.uses.size,
      closing_listeners: this.closing.size,
      authority: this.authority.snapshot(), assertion: this.assertion.snapshot(), reverse: this.reverse.snapshot(),
      listeners: { assertion: listener(this.assertion.server), reverse: listener(this.reverse.server) } });
  }

  shutdown(): Promise<void> {
    if (this.state === "STOPPED") return Promise.resolve();
    if (this.stopping) return this.stopping;
    this.state = "STOPPING"; this.stopAdmission(); this.closeListeners();
    this.stopping = this.drain().finally(() => { this.stopping = undefined; });
    return this.stopping;
  }

  private listen(server: Server, target: FinancialSourceListenerTarget): Promise<AddressInfo> {
    this.startingPending++;
    return new Promise((resolve, reject) => {
      let done = false;
      const settled = () => { if (done) return false; done = true;
        this.startingPending--; server.off("error", onError); server.off("close", onClose); return true; };
      const onError = () => { if (settled()) reject(failure("FINANCIAL_SOURCE_COMPOSITION_START_FAILED")); };
      const onClose = () => { if (settled()) reject(failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING")); };
      server.once("error", onError); server.once("close", onClose);
      try { server.listen(target.port, target.host, () => {
        if (!settled()) { this.closeListeners(); return; }
        const address = server.address();
        if (this.state !== "STARTING" || !address || typeof address === "string") {
          this.closeListeners(); reject(failure("FINANCIAL_SOURCE_COMPOSITION_NOT_RUNNING")); return;
        }
        resolve({ ...address });
      }); } catch { onError(); }
    });
  }
  private stopAdmission(): void {
    this.authority.shutdown();
    for (const socket of this.sockets) socket.destroy();
  }
  private closeListeners(): void {
    for (const { server } of [this.assertion, this.reverse]) {
      if (this.closing.has(server)) continue;
      this.closing.add(server);
      server.close(() => { this.closing.delete(server); });
    }
  }
  private async drain(): Promise<void> {
    const until = performance.now() + this.config.shutdown_deadline_ms;
    while (this.uses.size || this.authority.snapshot().pending || this.assertion.snapshot().in_flight ||
      this.reverse.snapshot().in_flight || this.sockets.size || this.closing.size || this.startingPending ||
      this.assertion.server.listening || this.reverse.server.listening) {
      if (performance.now() >= until) throw failure("FINANCIAL_SOURCE_COMPOSITION_SHUTDOWN_PENDING");
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    this.state = "STOPPED";
  }
}
