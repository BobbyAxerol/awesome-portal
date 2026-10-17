/** PRIVATE UNMOUNTED finite HTTP/1 egress primitive.
 * Ported from the peer component; changed closure/accounting needs a new gate.
 * This is NOT authority,
 * a durable receipt store, terminal signer, recovery protocol or SSE lifetime.
 */
import { createHash } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { z } from "zod";

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/), rawHash = z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/);
const bindingSchema = z.object({ lease_id: uuid, attempt_id: uuid, binding_digest: rawHash, source_digest: rawHash,
  scope_digest: hash, body_digest: hash, valid_until_ms: z.number().int().positive().safe() }).strict();
export type NativeReadEgressBinding = z.infer<typeof bindingSchema>;

/** Supplied ONLY by the actual installed trusted composition, after its durable
 * SENDING commit and authenticated held-source admission. Shape validation does
 * not authenticate a source. Never construct this from request JSON/config.
 * The permit must hold all Core/native/app/field currentness until settlement;
 * its synchronous check must include the actual source's current validity.
 * No release() exists: a local observation NEVER clears a source obligation.
 */
export interface HeldNativeReadEgressPermit {
  readonly binding: Readonly<NativeReadEgressBinding>;
  assertCurrent(): void;
}
export interface NativeReadEgressLimits {
  maximum_response_bytes: number; maximum_inflight: number;
  send_timeout_ms: number; quiesce_timeout_ms: number;
}
export class NativeReadEgressError extends Error {
  constructor(readonly code: string) { super("The protected response could not be delivered."); }
}
export type NativeReadEgressObservation = Readonly<{
  binding: Readonly<NativeReadEgressBinding>; bytes: number;
  outcome: "FINISHED" | "ABORTED" | "UNKNOWN";
  reason: "FINISH_WRITABLE_FINISHED" | "RESPONSE_CLOSED" | "RESPONSE_ERROR" | "SEND_THROW" | "DEADLINE" | "PERMIT_NOT_CURRENT" | "UNSENT_RESERVATION_QUIESCENT" | "CAPTURED_RESPONSE_SOCKET_CLOSED";
  /** FINISHED means local Core egress/OS handoff, NOT browser receipt/ACK.
   * ABORTED means no further writes by this closed transport; a previously
   * accepted prefix is NOT recalled or claimed never to have been observed. */
  semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY";
}>;
declare const witnessBrand: unique symbol;
export type NativeReadEgressWitness = Readonly<{ readonly [witnessBrand]: true }>;
declare const reservationBrand: unique symbol;
export type NativeReadEgressReservation = Readonly<{ readonly [reservationBrand]: true }>;
type ReservationState = {
  response: ServerResponse; request: IncomingMessage; socket: Socket; payload: Buffer; binding: Readonly<NativeReadEgressBinding>;
  deadline: number; phase: "RESERVED" | "DISPATCHED" | "CANCELLED";
  responseClosed: boolean; socketClosed: boolean; released: boolean; contaminated: boolean;
  last?: NativeReadEgressObservation; waiter: Promise<NativeReadEgressWitness>;
  resolve: (value: NativeReadEgressWitness) => void; cleanup: () => void;
  abort: () => void;
};
const responses = new WeakSet<ServerResponse>(), permits = new WeakSet<object>();
const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const deny = (code: string): never => { throw new NativeReadEgressError(code); };
/** Private inputs are descriptors, not deserializers: inspect no getters or
 * Proxy traps. Actual Node response/socket objects are trusted host inputs. */
function plainFields(input: unknown, names: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || types.isProxy(input) || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
  const keys = Reflect.ownKeys(input);
  if (keys.length !== names.length || keys.some(key => typeof key !== "string" || !names.includes(key)))
    return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
  const result: Record<string, unknown> = Object.create(null);
  for (const name of names) {
    const field = Object.getOwnPropertyDescriptor(input, name);
    if (!field?.enumerable || !Object.hasOwn(field, "value")) return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
    result[name] = field.value;
  }
  return result;
}
const bindingKeys = ["lease_id", "attempt_id", "binding_digest", "source_digest", "scope_digest", "body_digest", "valid_until_ms"] as const;
function bindingFrom(input: unknown): NativeReadEgressBinding {
  const fields = plainFields(input, bindingKeys);
  if (bindingKeys.some(key => key === "valid_until_ms" ? typeof fields[key] !== "number" : typeof fields[key] !== "string"))
    return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
  const parsed = bindingSchema.safeParse(fields);
  if (!parsed.success) return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
  return parsed.data;
}
function permitFrom(input: unknown): { binding: NativeReadEgressBinding; check: () => void } {
  if (!input || typeof input !== "object" || types.isProxy(input) || permits.has(input))
    return deny("NATIVE_READ_EGRESS_PERMIT_REFUSED");
  const fields = plainFields(input, ["binding", "assertCurrent"]);
  if (typeof fields.assertCurrent !== "function" || types.isProxy(fields.assertCurrent))
    return deny("NATIVE_READ_EGRESS_PERMIT_REFUSED");
  return { binding: bindingFrom(fields.binding), check: fields.assertCurrent as () => void };
}
/** Destroy only the captured transport. A foreign reassignment must not make
 * this component close someone else's socket; missing response closure then
 * remains UNKNOWN with admission held. */
function closeOwned(state: ReservationState): void {
  if (state.response.socket === state.socket || state.response.socket === null) {
    try { state.response.destroy(); } catch { /* physical close must still be observed */ }
  }
  try { state.socket.destroy(); } catch { /* physical close must still be observed */ }
}

function limitsFrom(input: unknown): Readonly<NativeReadEgressLimits> {
  try {
    const data = plainFields(input, ["maximum_response_bytes", "maximum_inflight", "send_timeout_ms", "quiesce_timeout_ms"]);
    if (Object.values(data).some(value => typeof value !== "number" || !Number.isSafeInteger(value))) throw new Error();
    const parsed = data as unknown as NativeReadEgressLimits;
    if (parsed.maximum_response_bytes < 1 || parsed.maximum_response_bytes > 1048576 || parsed.maximum_inflight < 1 || parsed.maximum_inflight > 128 ||
      parsed.send_timeout_ms < 1 || parsed.quiesce_timeout_ms < 1 || parsed.send_timeout_ms + parsed.quiesce_timeout_ms > 60000) throw new Error();
    return Object.freeze({ ...parsed });
  } catch { return deny("NATIVE_READ_EGRESS_LIMITS_INVALID"); }
}

/** Exclusive owner of ONE finite GET response, with no application callback.
 * Do not call while holding Core row locks. The trusted controller must disable
 * Nest's automatic response (e.g. @Res()/reply.hijack) and give no other writer
 * access to this response. Body bytes must already be safely scoped/serialized.
 * This method ends HTTP; it MUST NOT be used for an indefinite SSE connection.
 * A later per-frame transport requires a fresh bounded permit for each frame.
 */
export class NativeReadEgress {
  private inflight = 0;
  private readonly reservations = new WeakMap<object, ReservationState>();
  private readonly witnesses = new WeakMap<object, { response: ServerResponse; permit?: HeldNativeReadEgressPermit;
    reservation?: NativeReadEgressReservation; observation: NativeReadEgressObservation }>();
  private readonly limits: Readonly<NativeReadEgressLimits>;
  constructor(limits: NativeReadEgressLimits) {
    this.limits = limitsFrom(limits);
  }

  diagnostics(): Readonly<{ inflight: number }> { return Object.freeze({ inflight: this.inflight }); }

  /** Refusals before ownership produce NO witness/terminal. The actual provider
   * remains responsible for its already-durable source obligation on that path.
   * Once owned, every path resolves an opaque observation; UNKNOWN never means
   * permission to release, retry sending or discard the durable attempt.
   */
  /** Capture before the SENDING transaction, write NOTHING. Only this instance
   * owns the copied bytes and actual response/socket; a reservation is not an
   * app/native permit, COMMIT receipt or permission to send. The caller must
   * persist/reconcile its SAME lease, including an ambiguous SENDING COMMIT. */
  reserveFinite(response: ServerResponse, body: Buffer, input: NativeReadEgressBinding): NativeReadEgressReservation {
    if (!(response instanceof ServerResponse) || !(response.req instanceof IncomingMessage)
      || !(response.socket instanceof Socket) || response.req.socket !== response.socket
      || response.req.method !== "GET" || response.statusCode !== 200 || response.headersSent
      || response.req.aborted || response.writableEnded || response.destroyed || response.socket.destroyed
      || response.hasHeader("transfer-encoding") || response.hasHeader("content-encoding") || response.hasHeader("trailer")
      || responses.has(response)) return deny("NATIVE_READ_EGRESS_RESPONSE_REFUSED");
    const parsed = bindingFrom(input);
    if (types.isProxy(body) || !Buffer.isBuffer(body)) return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
    // Copy intrinsic bytes FIRST, then authenticate the private copy. Neither
    // an own length getter nor concurrent caller-owned backing can change the
    // payload after its binding digest is checked.
    let payload: Buffer;
    try {
      const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!.call(body) as number;
      if (byteLength > this.limits.maximum_response_bytes) return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
      payload = Buffer.alloc(byteLength); Uint8Array.prototype.set.call(payload, body);
    } catch { return deny("NATIVE_READ_EGRESS_BINDING_REFUSED"); }
    if (parsed.body_digest !== digest(payload) || parsed.valid_until_ms <= Date.now())
      return deny("NATIVE_READ_EGRESS_BINDING_REFUSED");
    if (this.inflight >= this.limits.maximum_inflight) return deny("NATIVE_READ_EGRESS_BUSY");
    const binding = Object.freeze(parsed), socket = response.socket;
    const reservation = Object.freeze({}) as NativeReadEgressReservation;
    let resolve!: (value: NativeReadEgressWitness) => void;
    const waiter = new Promise<NativeReadEgressWitness>(done => { resolve = done; });
    const state: ReservationState = { response, request: response.req, socket, payload, binding,
      deadline: performance.now() + Math.min(this.limits.send_timeout_ms, binding.valid_until_ms - Date.now()),
      phase: "RESERVED", responseClosed: false, socketClosed: false, released: false, contaminated: false,
      waiter, resolve, cleanup: () => undefined, abort: () => undefined };
    let timer: ReturnType<typeof setTimeout> | undefined, quiesce: ReturnType<typeof setTimeout> | undefined;
    const observe = (outcome: "ABORTED" | "UNKNOWN") => {
      // Never upgrade a witness already handed to a caller. Later actual
      // closure is available through a NEW one-use witness for this reservation.
      state.last = Object.freeze({ binding, bytes: payload.length, outcome,
        reason: outcome === "ABORTED" ? "UNSENT_RESERVATION_QUIESCENT" : "RESPONSE_CLOSED",
        semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY" as const });
      state.resolve(this.reservationWitness(reservation, state));
    };
    const release = () => {
      if (state.released) return; state.released = true; this.inflight--; state.cleanup();
    };
    const closed = () => {
      if (state.phase === "DISPATCHED") return;
      if (state.responseClosed && state.socketClosed && response.destroyed && socket.destroyed) {
        state.phase = "CANCELLED";
        state.contaminated ||= response.headersSent || response.writableEnded;
        observe(state.contaminated ? "UNKNOWN" : "ABORTED"); release();
      }
    };
    const responseClose = () => { state.responseClosed = true; if (state.phase === "RESERVED") state.abort(); closed(); };
    const socketClose = () => { state.socketClosed = true; if (state.phase === "RESERVED") state.abort(); closed(); };
    const error = () => { if (state.phase === "RESERVED") state.abort(); };
    state.cleanup = () => {
      clearTimeout(timer); clearTimeout(quiesce);
      response.removeListener("close", responseClose); response.removeListener("error", error);
      socket.removeListener("close", socketClose); socket.removeListener("end", error);
    };
    state.abort = () => {
      if (state.phase === "DISPATCHED") return deny("NATIVE_READ_EGRESS_ALREADY_DISPATCHED");
      if (state.phase === "RESERVED") {
        state.phase = "CANCELLED"; clearTimeout(timer);
        state.contaminated ||= response.headersSent || response.writableEnded;
        quiesce = setTimeout(() => { if (!state.released) observe("UNKNOWN"); }, this.limits.quiesce_timeout_ms);
        // No end/write/flushHeaders was called. We do not accept a timeout,
        // exception or DB state as proof of transport closure.
        closeOwned(state);
      }
      closed();
    };
    responses.add(response); this.inflight++; this.reservations.set(reservation, state);
    response.on("close", responseClose); response.on("error", error);
    socket.on("close", socketClose); socket.on("end", error);
    timer = setTimeout(state.abort, Math.max(1, Math.ceil(state.deadline - performance.now())));
    return reservation;
  }

  private reservationWitness(reservation: NativeReadEgressReservation, state: ReservationState): NativeReadEgressWitness {
    if (!state.last) return deny("NATIVE_READ_EGRESS_WITNESS_REFUSED");
    const witness = Object.freeze({}) as NativeReadEgressWitness;
    this.witnesses.set(witness, { response: state.response, reservation, observation: state.last });
    return witness;
  }

  cancelUnsent(reservation: NativeReadEgressReservation): Promise<NativeReadEgressWitness> {
    const state = this.reservations.get(reservation);
    if (!state) return Promise.reject(new NativeReadEgressError("NATIVE_READ_EGRESS_RESERVATION_REFUSED"));
    if (state.phase === "DISPATCHED") return Promise.reject(new NativeReadEgressError("NATIVE_READ_EGRESS_ALREADY_DISPATCHED"));
    state.abort(); // Synchronous permanent dispatch fence, BEFORE any await.
    return state.last ? Promise.resolve(this.reservationWitness(reservation, state)) : state.waiter;
  }

  consumeReserved(witness: NativeReadEgressWitness, reservation: NativeReadEgressReservation): NativeReadEgressObservation {
    const actual = this.witnesses.get(witness);
    if (!actual || actual.reservation !== reservation || !this.reservations.has(reservation))
      return deny("NATIVE_READ_EGRESS_WITNESS_REFUSED");
    this.witnesses.delete(witness); return actual.observation;
  }

  /** Same-instance recovery observation only. No TTL, restart, shaped DTO or
   * current .destroyed boolean can manufacture the two captured close events.
   * Old UNKNOWN witnesses stay UNKNOWN. A new witness is finite local evidence
   * for authenticated SAME-attempt source recovery, never source release/ACK.
   * A valid FINISHED is preserved, never relabeled ABORTED after socket close. */
  observeClosed(reservation: NativeReadEgressReservation): NativeReadEgressWitness | null {
    const state = this.reservations.get(reservation);
    if (!state) return deny("NATIVE_READ_EGRESS_RESERVATION_REFUSED");
    if (state.phase === "RESERVED" || !state.responseClosed || !state.socketClosed ||
      !state.response.destroyed || !state.socket.destroyed || !state.released || !state.last) return null;
    if (state.last.outcome !== "FINISHED") state.last = Object.freeze({ binding: state.binding, bytes: state.payload.length,
      outcome: "ABORTED", reason: "CAPTURED_RESPONSE_SOCKET_CLOSED", semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY" });
    return this.reservationWitness(reservation, state);
  }

  /** Compatible finite adapter. The installed Candidate instead reserves before
   * SENDING, awaits physical COMMIT AND pool release, and only then dispatches. */
  send(response: ServerResponse, body: Buffer, permit: HeldNativeReadEgressPermit): Promise<NativeReadEgressWitness> {
    try {
      // Preserve pre-ownership refusals, including throwing getters.
      const held = permitFrom(permit);
      return this.dispatch(this.reserveFinite(response, body, held.binding), permit);
    } catch (error) { return Promise.reject(error); }
  }

  dispatch(reservation: NativeReadEgressReservation, permit: HeldNativeReadEgressPermit): Promise<NativeReadEgressWitness> {
    const state = this.reservations.get(reservation);
    if (!state || state.phase !== "RESERVED" || state.released)
      return Promise.reject(new NativeReadEgressError("NATIVE_READ_EGRESS_RESERVATION_REFUSED"));
    let held: ReturnType<typeof permitFrom>;
    try {
      held = permitFrom(permit);
    } catch (error) { return Promise.reject(error); }
    if (!Object.keys(state.binding).every(key =>
      state.binding[key as keyof NativeReadEgressBinding] === held.binding[key as keyof NativeReadEgressBinding]))
      return Promise.reject(new NativeReadEgressError("NATIVE_READ_EGRESS_BINDING_REFUSED"));
    const { response, socket, binding, payload } = state, bytes = payload.length;
    state.phase = "DISPATCHED"; state.cleanup(); permits.add(permit);
    return new Promise(resolve => {
      let settled = false, released = false, aborting = false;
      let sendTimer: ReturnType<typeof setTimeout> | undefined, quiesceTimer: ReturnType<typeof setTimeout> | undefined;
      let reason: NativeReadEgressObservation["reason"] = "RESPONSE_CLOSED";
      const deadline = state.deadline;
      const timeCurrent = () => Date.now() < binding.valid_until_ms && performance.now() < deadline;
      const current = () => {
        if (!timeCurrent()) return false;
        try {
          const result: unknown = held.check.call(permit);
          if (result !== undefined) {
            // Silence a genuine rejected async guard without reflecting a
            // user-controlled then/catch getter or assimilating a thenable.
            if (types.isPromise(result)) void Promise.prototype.then.call(result, undefined, () => undefined);
            return false;
          }
          const next = permitFromCurrent();
          return Object.keys(binding).every(key => binding[key as keyof NativeReadEgressBinding] === next[key as keyof NativeReadEgressBinding]) && timeCurrent();
        } catch { return false; }
      };
      const permitFromCurrent = () => {
        const fields = plainFields(permit, ["binding", "assertCurrent"]);
        if (fields.assertCurrent !== held.check) return deny("NATIVE_READ_EGRESS_PERMIT_REFUSED");
        return bindingFrom(fields.binding);
      };
      const releaseLocal = () => {
        if (released) return; released = true; state.released = true; this.inflight--;
        clearTimeout(sendTimer); clearTimeout(quiesceTimer);
        response.removeListener("finish", finish); response.removeListener("error", error); response.removeListener("close", close);
        socket.removeListener("close", socketClose); socket.removeListener("end", socketEnd);
      };
      const settle = (outcome: NativeReadEgressObservation["outcome"], why: NativeReadEgressObservation["reason"]) => {
        if (settled) return; settled = true; clearTimeout(sendTimer); clearTimeout(quiesceTimer);
        const witness = Object.freeze({}) as NativeReadEgressWitness;
        const observation = Object.freeze({ binding, bytes, outcome, reason: why, semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY" as const });
        state.last = observation;
        this.witnesses.set(witness, { response, permit, reservation, observation }); resolve(witness);
      };
      const quiescent = () => state.responseClosed && state.socketClosed && response.destroyed && socket.destroyed;
      const maybeQuiescent = () => {
        if (!quiescent()) return;
        // A prior witness is immutable. Late actual closure may support a NEW
        // same-instance observation, but cannot rewrite previous UNKNOWN.
        settle("ABORTED", reason);
        if (state.last?.outcome !== "FINISHED") state.last = Object.freeze({ binding, bytes,
          outcome: "ABORTED", reason: "CAPTURED_RESPONSE_SOCKET_CLOSED", semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY" });
        releaseLocal();
      };
      const abort = (why: NativeReadEgressObservation["reason"]) => {
        if (released) return;
        if (!aborting) {
          aborting = true; reason = why; clearTimeout(sendTimer);
          clearTimeout(quiesceTimer);
          quiesceTimer = setTimeout(() => { settle("UNKNOWN", reason); maybeQuiescent(); }, this.limits.quiesce_timeout_ms);
          // Only destroy the exact owned response. No shared-server shutdown,
          // Pool/source release, global socket mutation or foreign cleanup.
          closeOwned(state);
        }
        maybeQuiescent();
      };
      const finish = () => {
        if (released) return;
        if (aborting) {
          // A late genuine finish is also local quiescence, but cannot upgrade
          // the failed deadline/currentness path into FINISHED authority.
          if (response.writableFinished && socket.writableLength === 0) { settle("UNKNOWN", reason); maybeQuiescent(); }
          else maybeQuiescent();
          return;
        }
        // Node's own finish listener may already have detached response.socket.
        // Inspect the captured transport too: an injected/early event must not
        // turn still-queued protected bytes into positive completion.
        if (!response.writableFinished || socket.writableLength !== 0) { abort("RESPONSE_ERROR"); return; }
        if (!current()) {
          // Transport did finish, but actual held currentness is uncertain.
          // Preserve UNKNOWN rather than turn a failed guard into SERVED.
          settle("UNKNOWN", "PERMIT_NOT_CURRENT");
          clearTimeout(quiesceTimer);
          quiesceTimer = setTimeout(() => { closeOwned(state); maybeQuiescent(); }, this.limits.quiesce_timeout_ms);
          return;
        }
        settle("FINISHED", "FINISH_WRITABLE_FINISHED");
        // Completion is a local handoff fact. Admission still owns the exact
        // socket until BOTH actual close events, including successful sends.
        clearTimeout(quiesceTimer);
        quiesceTimer = setTimeout(() => { closeOwned(state); maybeQuiescent(); }, this.limits.quiesce_timeout_ms);
        maybeQuiescent();
      };
      const error = () => abort("RESPONSE_ERROR");
      const close = () => { state.responseClosed = true; if (!released && state.last?.outcome !== "FINISHED") abort("RESPONSE_CLOSED"); maybeQuiescent(); };
      const socketClose = () => { state.socketClosed = true; if (!released && state.last?.outcome !== "FINISHED") abort("RESPONSE_CLOSED"); maybeQuiescent(); };
      // A remote abort can expose read-end before close while a write is
      // backpressured. Do not wait for that write's deadline to stop this sender.
      const socketEnd = () => { if (!released) abort("RESPONSE_CLOSED"); };
      response.on("finish", finish); response.on("error", error); response.on("close", close);
      socket.on("close", socketClose); socket.on("end", socketEnd);
      sendTimer = setTimeout(() => abort("DEADLINE"), Math.max(1, Math.ceil(deadline - performance.now())));
      if (!current()) { abort("PERMIT_NOT_CURRENT"); return; }
      try {
        // Sync guard must not itself have written or changed ownership.
        if (response.req !== state.request || response.socket !== socket || response.req.socket !== socket || socket.destroyed ||
          response.req.method !== "GET" || response.req.aborted || response.headersSent || response.writableEnded || response.destroyed || response.statusCode !== 200
          || response.hasHeader("transfer-encoding") || response.hasHeader("content-encoding") || response.hasHeader("trailer")) { abort("SEND_THROW"); return; }
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.shouldKeepAlive = false;
        response.setHeader("connection", "close");
        response.setHeader("content-length", bytes);
        response.setHeader("cache-control", "private, no-store");
        response.setHeader("x-content-type-options", "nosniff");
        // end() owns the only finite body; later callers cannot enqueue a
        // second protected chunk. finish+writableFinished is observed above.
        if (!timeCurrent()) { abort("PERMIT_NOT_CURRENT"); return; }
        response.end(payload);
      } catch { abort("SEND_THROW"); }
    });
  }

  /** One-use capability readback for the actual terminal producer. A copied
   * DTO, another dispatcher/response/permit, or replay cannot mint a terminal.
   * UNKNOWN remains an observation requiring genuine recovery, never a release.
   */
  consume(witness: NativeReadEgressWitness, response: ServerResponse, permit: HeldNativeReadEgressPermit): NativeReadEgressObservation {
    const actual = this.witnesses.get(witness);
    if (!actual || actual.response !== response || actual.permit !== permit) return deny("NATIVE_READ_EGRESS_WITNESS_REFUSED");
    this.witnesses.delete(witness); return actual.observation;
  }
}
