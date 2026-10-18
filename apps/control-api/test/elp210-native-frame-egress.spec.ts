/** NF-TRANSPORT-TEST — actual owned socket primitive regressions.
 * Canonical integration and execution receipts belong to the ELP2-09 packet.
 * Actual loopback HTTP, TEST_ONLY permits. No source authorization, SQL/PM ACK,
 * durable settlement, browser delivery acknowledgement or installed SSE claim.
 * In particular a consumed physical FINISHED MUST NOT unlock frame 2 here.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, request, ServerResponse, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { NativeReadEgress, NativeReadEgressError, type HeldNativeReadFrameEgressPermit,
  type NativeReadEgressBinding, type NativeReadEgressLimits, type NativeReadEgressStream,
  type NativeReadEgressFrameWitness, type NativeReadEgressFrameReservation,
  type NativeReadEgressReservation, type NativeReadEgressWitness } from "../src/execution-v2/native-read-egress";

const frame = Buffer.from('event: revalidate\ndata: {"TEST_ONLY":"µs"}\n\n');
const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const limits = (extra: Partial<NativeReadEgressLimits> = {}): NativeReadEgressLimits => ({
  maximum_response_bytes: 1048576, maximum_inflight: 1, send_timeout_ms: 1500, quiesce_timeout_ms: 100, ...extra,
});
function binding(payload = frame): NativeReadEgressBinding {
  return { lease_id: randomUUID(), attempt_id: randomUUID(), binding_digest: "a".repeat(64), source_digest: "b".repeat(64),
    scope_digest: `sha256:${"c".repeat(64)}`, body_digest: digest(payload), valid_until_ms: Date.now() + 10000 };
}
function held(egress: NativeReadEgress, stream: NativeReadEgressStream, payload = frame): HeldNativeReadFrameEgressPermit {
  return { binding: binding(payload), delivery: egress.nextFrameDelivery(stream),
    // Shape is TEST_ONLY transport input, NEVER current app/source authority.
    assertCurrent: vi.fn() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, milliseconds = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TEST_ONLY_FRAME_DEADLINE")), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 3000;
  while (!check()) {
    if (Date.now() >= end) throw new Error("TEST_ONLY_FRAME_QUIESCENCE_DEADLINE");
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
}
type HttpContext = { response: ServerResponse; client: ClientRequest;
  peer: { headers: IncomingHttpHeaders | null; chunks: Buffer[]; ended: boolean; complete: boolean } };
/** Unlike the finite helper, observes data BEFORE HTTP end: SSE stays open.
 * Own ephemeral listener/socket set only. No global closeAllConnections(). */
async function withHttp(run: (context: HttpContext) => Promise<void>): Promise<void> {
  const accepted = deferred<ServerResponse>(), sockets = new Set<Socket>();
  const peer: HttpContext["peer"] = { headers: null, chunks: [], ended: false, complete: false };
  const server = createServer((_request, response) => accepted.resolve(response));
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  let client: ClientRequest | undefined;
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    }));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_FRAME_ADDRESS");
    client = request({ host: "127.0.0.1", port: address.port, path: "/TEST_ONLY_FRAME", method: "GET", agent: false,
      headers: { connection: "close" } }, reply => {
      peer.headers = reply.headers;
      reply.on("data", (chunk: Buffer) => peer.chunks.push(Buffer.from(chunk)));
      reply.once("end", () => { peer.ended = true; peer.complete = reply.complete; });
      reply.on("error", () => undefined); // expected deliberately aborted streams
    });
    client.on("error", () => undefined); // before-header abort is an expected negative
    client.end();
    await bounded(run({ response: await bounded(accepted.promise), client, peer }));
  } finally {
    client?.destroy();
    for (const socket of sockets) socket.destroy();
    await bounded(new Promise<void>(resolve => server.close(() => resolve())));
  }
}
const bytesReceived = (peer: HttpContext["peer"]) => peer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
function stallSocket(response: ServerResponse): () => void {
  const socket = response.socket;
  if (!socket) throw new Error("TEST_ONLY_FRAME_SOCKET");
  const write = vi.spyOn(socket, "_write").mockImplementation(() => undefined);
  const writev = socket._writev ? vi.spyOn(socket, "_writev").mockImplementation(() => undefined) : undefined;
  return () => { write.mockRestore(); writev?.mockRestore(); };
}
type WriteCallback = (error?: Error | null) => void;

describe("NF-TRANSPORT / actual loopback HTTP only, no settlement authority", () => {
  it("open/reserve write zero bytes, freeze string delivery 1 and occupy one slot", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), write = vi.spyOn(response, "write"), end = vi.spyOn(response, "end");
      const flush = vi.spyOn(response, "flushHeaders"), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding);
      expect(permit.delivery).toMatchObject({ kind: "SSE_FRAME", frame_ordinal: "1" });
      expect(permit.delivery.stream_id).toMatch(/^[a-f0-9-]{36}$/);
      expect(Object.isFrozen(permit.delivery)).toBe(true);
      expect(e.frameDelivery(reservation)).toEqual(permit.delivery);
      expect(write).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled(); expect(flush).not.toHaveBeenCalled();
      expect(response.headersSent).toBe(false); expect(peer.headers).toBeNull(); expect(e.diagnostics().inflight).toBe(1);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
      expect(() => e.reserveFrame(stream, frame, binding())).toThrowError(NativeReadEgressError);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
      expect(e.consumeFrame(e.observeFrameClosed(reservation)!, reservation)).toMatchObject({ outcome: "ABORTED" });
    });
  });

  it("global response ownership prevents same/cross-instance finite or stream double owners", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), other = new NativeReadEgress(limits()), stream = e.openStream(response);
      expect(() => e.openStream(response)).toThrowError(NativeReadEgressError);
      expect(() => other.openStream(response)).toThrowError(NativeReadEgressError);
      expect(() => other.reserveFinite(response, frame, binding())).toThrowError(NativeReadEgressError);
      expect(() => e.reserveFinite(response, frame, binding())).toThrowError(NativeReadEgressError);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("SAME instance cap counts idle streams and finite reservations together, in both directions", async () => {
    const e = new NativeReadEgress(limits());
    await withHttp(async first => {
      const stream = e.openStream(first.response);
      await withHttp(async second => {
        expect(() => e.openStream(second.response)).toThrowError(NativeReadEgressError);
        expect(() => e.reserveFinite(second.response, frame, binding())).toThrowError(NativeReadEgressError);
        expect(second.response.headersSent).toBe(false); expect(e.diagnostics().inflight).toBe(1);
      });
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
    await withHttp(async first => {
      const finite = e.reserveFinite(first.response, frame, binding());
      await withHttp(async second => {
        expect(() => e.openStream(second.response)).toThrowError(NativeReadEgressError);
        expect(second.response.headersSent).toBe(false); expect(e.diagnostics().inflight).toBe(1);
      });
      expect(e.consumeReserved(await bounded(e.cancelUnsent(finite)), finite).outcome).toBe("ABORTED");
      await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("copies exact 1MiB encoded bytes before caller mutation; write(false) still means accepted backpressure", async () => {
    await withHttp(async ({ response, peer }) => {
      const payload = Buffer.alloc(1048576, 65); payload.write("data: ", 0); payload.write("\n\n", payload.length - 2);
      const expected = Buffer.from(payload), e = new NativeReadEgress(limits()), stream = e.openStream(response);
      const permit = held(e, stream, payload), reservation = e.reserveFrame(stream, payload, permit.binding);
      payload.fill(66); const write = vi.spyOn(response, "write");
      const observation = e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation);
      await until(() => bytesReceived(peer) === expected.length);
      expect(Buffer.concat(peer.chunks).equals(expected)).toBe(true);
      expect(write.mock.results[0]?.value).toBe(false); // actual Node write, not a simulated callback
      expect(observation).toMatchObject({ outcome: "FINISHED", bytes: expected.length, binding: { body_digest: digest(expected) } });
      expect(response.writableEnded).toBe(false); expect(e.diagnostics().inflight).toBe(1);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("uses intrinsic Buffer bytes without invoking an own length getter", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), payload = Buffer.from(frame);
      const permit = held(e, stream, payload); let calls = 0;
      Object.defineProperty(payload, "length", { get() { calls++; throw new Error("TEST_ONLY_PRIVATE_LENGTH"); } });
      const reservation = e.reserveFrame(stream, payload, permit.binding);
      expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation).outcome).toBe("FINISHED");
      await until(() => bytesReceived(peer) === frame.length);
      expect(Buffer.concat(peer.chunks).equals(frame)).toBe(true); expect(calls).toBe(0);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("rejects empty/oversize/hash/expired bindings before reserving a slot or writing", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), write = vi.spyOn(response, "write");
      const bad: Array<{ payload: Buffer; input: NativeReadEgressBinding }> = [
        { payload: Buffer.alloc(0), input: binding(Buffer.alloc(0)) },
        { payload: Buffer.alloc(1048577), input: binding(Buffer.alloc(1048577)) },
        { payload: frame, input: { ...binding(), body_digest: `sha256:${"0".repeat(64)}` } },
        { payload: frame, input: { ...binding(), valid_until_ms: Date.now() - 1 } },
      ];
      for (const item of bad) expect(() => e.reserveFrame(stream, item.payload, item.input)).toThrowError(NativeReadEgressError);
      expect(write).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      expect(e.nextFrameDelivery(stream).frame_ordinal).toBe("1");
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("refuses caller framing before stream ownership without writing or consuming capacity", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), write = vi.spyOn(response, "write");
      for (const name of ["content-length", "transfer-encoding", "content-encoding", "trailer"]) {
        response.setHeader(name, "TEST_ONLY");
        expect(() => e.openStream(response)).toThrowError(NativeReadEgressError); response.removeHeader(name);
      }
      expect(write).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false); expect(e.diagnostics().inflight).toBe(0);
      const stream = e.openStream(response); e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("rejects wrong attempt/source/scope/body/stream and malformed ordinal with zero writes", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), write = vi.spyOn(response, "write");
      for (const delta of [{ attempt_id: randomUUID() }, { source_digest: "d".repeat(64) },
        { scope_digest: `sha256:${"e".repeat(64)}` }, { body_digest: digest(Buffer.from("wrong")) }]) {
        await expect(e.dispatchFrame(reservation, { ...permit, binding: { ...permit.binding, ...delta } }))
          .rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_BINDING_REFUSED" });
      }
      for (const ordinal of ["2", "01", "1\n", "9223372036854775808", 1]) {
        await expect(e.dispatchFrame(reservation, { ...permit, delivery: { ...permit.delivery, frame_ordinal: ordinal } } as
          HeldNativeReadFrameEgressPermit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_BINDING_REFUSED" });
      }
      await expect(e.dispatchFrame(reservation, { ...permit, delivery: { ...permit.delivery, stream_id: randomUUID() } }))
        .rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_BINDING_REFUSED" });
      expect(write).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("rejects accessor/Proxy frame inputs with zero trap or getter calls", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream); let calls = 0;
      const poison = new Proxy({}, { get() { calls++; throw new Error("PRIVATE"); },
        getPrototypeOf() { calls++; throw new Error("PRIVATE"); }, ownKeys() { calls++; throw new Error("PRIVATE"); } });
      expect(() => e.reserveFrame(stream, poison as Buffer, permit.binding)).toThrowError(NativeReadEgressError);
      expect(() => e.reserveFrame(stream, frame, poison as NativeReadEgressBinding)).toThrowError(NativeReadEgressError);
      const reservation = e.reserveFrame(stream, frame, permit.binding);
      const accessor = { ...permit }; Object.defineProperty(accessor, "delivery", { enumerable: true, get() { calls++; throw new Error("PRIVATE"); } });
      for (const bad of [poison, accessor, { ...permit, delivery: poison }]) {
        await expect(e.dispatchFrame(reservation, bad as HeldNativeReadFrameEgressPermit)).rejects.toBeInstanceOf(NativeReadEgressError);
      }
      expect(calls).toBe(0); expect(response.headersSent).toBe(false);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("actual callback completion publishes exact SSE headers but cannot unlock frame 2 even after consume/close readback", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), end = vi.spyOn(response, "end"), flush = vi.spyOn(response, "flushHeaders");
      const observation = e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation);
      await until(() => bytesReceived(peer) === frame.length);
      expect(observation).toMatchObject({ outcome: "FINISHED", reason: "FRAME_WRITE_CALLBACK_COMPLETED",
        semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY", binding: permit.binding, delivery: permit.delivery });
      expect(peer.headers).toMatchObject({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-store",
        "x-content-type-options": "nosniff" });
      expect(peer.headers?.["content-length"]).toBeUndefined(); expect(peer.headers?.["content-encoding"]).toBeUndefined();
      expect(end).not.toHaveBeenCalled(); expect(flush).not.toHaveBeenCalled(); expect(peer.ended).toBe(false);
      expect(Object.isFrozen(observation) && Object.isFrozen(observation.binding) && Object.isFrozen(observation.delivery)).toBe(true);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
      expect(() => e.reserveFrame(stream, frame, binding())).toThrowError(NativeReadEgressError);
      expect(e.observeFrameClosed(reservation)).toBeNull(); expect(e.diagnostics().inflight).toBe(1);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
      expect(e.consumeFrame(e.observeFrameClosed(reservation)!, reservation).outcome).toBe("FINISHED");
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
      expect(observation.outcome).toBe("FINISHED");
    });
  });

  it("opaque witnesses are owner/reservation-bound, family-separated and one-use", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), other = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding);
      expect(() => other.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
      expect(() => e.nextFrameDelivery({ ...stream })).toThrowError(NativeReadEgressError);
      await expect(other.dispatchFrame(reservation, permit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESERVATION_REFUSED" });
      await expect(e.dispatchFrame({ ...reservation }, permit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESERVATION_REFUSED" });
      const witness = await bounded(e.dispatchFrame(reservation, permit));
      expect(Object.keys(witness)).toEqual([]); expect(Object.isFrozen(witness)).toBe(true);
      expect(() => e.consumeFrame({ ...witness } as NativeReadEgressFrameWitness, reservation)).toThrowError(NativeReadEgressError);
      expect(() => other.consumeFrame(witness, reservation)).toThrowError(NativeReadEgressError);
      expect(() => e.consumeFrame(witness, {} as NativeReadEgressFrameReservation)).toThrowError(NativeReadEgressError);
      expect(() => e.consumeReserved(witness as unknown as NativeReadEgressWitness,
        reservation as unknown as NativeReadEgressReservation)).toThrowError(NativeReadEgressError);
      expect(e.consumeFrame(witness, reservation).outcome).toBe("FINISHED");
      expect(() => e.consumeFrame(witness, reservation)).toThrowError(NativeReadEgressError);
      e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
    });
  });

  it("requires the genuine write callback as well as its normal return (delayed real callback)", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), callbackSeen = deferred<void>();
      const original = response.write.bind(response); let releaseCallback: (() => void) | undefined, settled = false;
      const write = vi.spyOn(response, "write").mockImplementation(((bytes: Buffer, callback: WriteCallback) =>
        original(bytes, error => { releaseCallback = () => callback(error); callbackSeen.resolve(); })) as ServerResponse["write"]);
      try {
        const pending = e.dispatchFrame(reservation, permit); void pending.then(() => { settled = true; });
        await bounded(callbackSeen.promise); await until(() => bytesReceived(peer) === frame.length);
        expect(settled).toBe(false); expect(write.mock.results[0]?.type).toBe("return");
        releaseCallback!();
        expect(e.consumeFrame(await bounded(pending), reservation).outcome).toBe("FINISHED");
      } finally { write.mockRestore(); e.closeStream(stream); await until(() => e.diagnostics().inflight === 0); }
    });
  });

  it("synchronous callback followed by throw cannot manufacture FINISHED", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding);
      const write = vi.spyOn(response, "write").mockImplementation(((_bytes: Buffer, callback: WriteCallback) => {
        callback(); throw new Error("TEST_ONLY_PRIVATE_AFTER_CALLBACK");
      }) as ServerResponse["write"]);
      try {
        expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation))
          .toMatchObject({ outcome: "ABORTED", reason: "SEND_THROW" });
        expect(bytesReceived(peer)).toBe(0); await until(() => e.diagnostics().inflight === 0);
      } finally { write.mockRestore(); }
    });
  });

  it("invalid normal return after an actual write still cannot publish FINISHED", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), original = response.write.bind(response);
      const write = vi.spyOn(response, "write").mockImplementation(((bytes: Buffer, callback: WriteCallback) => {
        original(bytes, callback); return undefined as unknown as boolean;
      }) as ServerResponse["write"]);
      try {
        expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation))
          .toMatchObject({ outcome: "ABORTED", reason: "SEND_THROW" });
        await until(() => e.diagnostics().inflight === 0);
      } finally { write.mockRestore(); }
    });
  });

  it("an error at the real callback is a physical abort, never a positive receipt", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), original = response.write.bind(response);
      const write = vi.spyOn(response, "write").mockImplementation(((bytes: Buffer, callback: WriteCallback) =>
        original(bytes, () => callback(new Error("TEST_ONLY_CALLBACK_ERROR")))) as ServerResponse["write"]);
      try {
        expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation))
          .toMatchObject({ outcome: "ABORTED", reason: "RESPONSE_ERROR" });
        await until(() => e.diagnostics().inflight === 0);
      } finally { write.mockRestore(); }
    });
  });

  it("a duplicate callback poisons/closes the owner without opening another frame", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), original = response.write.bind(response);
      const write = vi.spyOn(response, "write").mockImplementation(((bytes: Buffer, callback: WriteCallback) =>
        original(bytes, error => { callback(error); callback(error); })) as ServerResponse["write"]);
      try {
        const observation = e.consumeFrame(await bounded(e.dispatchFrame(reservation, permit)), reservation);
        // First real completion may already be FINISHED; the duplicate cannot
        // revoke that historical observation or grant any next-frame authority.
        expect(observation.outcome).toBe("FINISHED"); await until(() => e.diagnostics().inflight === 0);
        expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
        expect(() => e.reserveFrame(stream, frame, binding())).toThrowError(NativeReadEgressError);
      } finally { write.mockRestore(); }
    });
  });

  it("non-undefined guards fail closed without thenable getter assimilation", async () => {
    for (const kind of ["rejected-promise", "then-getter"]) await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream); let getterCalls = 0;
      const reservation = e.reserveFrame(stream, frame, permit.binding), write = vi.spyOn(response, "write");
      const guarded = { ...permit, assertCurrent() {
        return kind === "rejected-promise" ? Promise.reject(new Error("TEST_ONLY_PRIVATE_GUARD"))
          : { get then() { getterCalls++; throw new Error("TEST_ONLY_PRIVATE_THEN_GETTER"); } };
      } };
      expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, guarded)), reservation))
        // Before any write, the physical witness records actual dual-close
        // quiescence, not the authorization check that initiated the close.
        .toMatchObject({ outcome: "ABORTED", reason: "UNSENT_RESERVATION_QUIESCENT" });
      expect(write).not.toHaveBeenCalled(); expect(bytesReceived(peer)).toBe(0); expect(response.headersSent).toBe(false);
      expect(getterCalls).toBe(0); await until(() => e.diagnostics().inflight === 0);
      expect(response.destroyed && response.req.socket.destroyed).toBe(true);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
    });
  });

  it("recaptures binding/delivery/check identity after the current guard, before any write", async () => {
    for (const kind of ["binding", "delivery", "check"]) await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), original = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, original.binding), write = vi.spyOn(response, "write");
      const guarded = { binding: { ...original.binding }, delivery: { ...original.delivery }, assertCurrent() {
        if (kind === "binding") guarded.binding.scope_digest = `sha256:${"d".repeat(64)}`;
        if (kind === "delivery") guarded.delivery.frame_ordinal = "2";
        if (kind === "check") guarded.assertCurrent = () => undefined;
      } };
      expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, guarded)), reservation))
        .toMatchObject({ outcome: "ABORTED", reason: "UNSENT_RESERVATION_QUIESCENT" });
      expect(write).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      expect(bytesReceived(peer)).toBe(0);
      await until(() => e.diagnostics().inflight === 0);
      expect(response.destroyed && response.req.socket.destroyed).toBe(true);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
    });
  });

  it("revocation at the genuine callback cannot become FINISHED even after a real write", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream); let checks = 0;
      const reservation = e.reserveFrame(stream, frame, permit.binding);
      const guarded = { ...permit, assertCurrent() { if (++checks > 1) throw new Error("TEST_ONLY_REVOKED"); } };
      expect(e.consumeFrame(await bounded(e.dispatchFrame(reservation, guarded)), reservation))
        .toMatchObject({ outcome: "ABORTED", reason: "PERMIT_NOT_CURRENT" });
      expect(checks).toBe(2); await until(() => e.diagnostics().inflight === 0);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
    });
  });

  it("rechecks the exact UTC deadline after a synchronous guard before the first write", async () => {
    await withHttp(async ({ response, peer }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), write = vi.spyOn(response, "write");
      let now = Date.now(); const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      // TEST_ONLY clock boundary, not a genuine source/calibration proof.
      const guarded = { ...permit, assertCurrent() { now = permit.binding.valid_until_ms; } };
      let pending: Promise<NativeReadEgressFrameWitness>;
      try { pending = e.dispatchFrame(reservation, guarded); } finally { clock.mockRestore(); }
      expect(e.consumeFrame(await bounded(pending!), reservation))
        .toMatchObject({ outcome: "ABORTED", reason: "UNSENT_RESERVATION_QUIESCENT" });
      expect(write).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false); expect(bytesReceived(peer)).toBe(0);
      await until(() => e.diagnostics().inflight === 0);
      expect(response.destroyed && response.req.socket.destroyed).toBe(true);
      expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
    });
  });

  it("injected finish/drain do not replace a stalled real write callback", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits({ send_timeout_ms: 40 })), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), restore = stallSocket(response);
      try {
        const pending = e.dispatchFrame(reservation, permit);
        response.emit("drain"); response.emit("finish");
        expect(e.consumeFrame(await bounded(pending), reservation).outcome).not.toBe("FINISHED");
        expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
        // An injected finish may detach Node's response. If exact response
        // closure is no longer observed, UNKNOWN must keep its logical slot;
        // do not make zero admission a prerequisite for this negative.
        e.closeStream(stream);
      } finally { restore(); }
    });
  });

  it("actual peer disconnect aborts a stalled write and poisons every later frame", async () => {
    await withHttp(async ({ response, client }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), restore = stallSocket(response);
      try {
        const pending = e.dispatchFrame(reservation, permit); client.destroy();
        expect(e.consumeFrame(await bounded(pending), reservation).outcome).toBe("ABORTED");
        await until(() => e.diagnostics().inflight === 0);
        expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
        await expect(e.dispatchFrame(reservation, permit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESERVATION_REFUSED" });
      } finally { restore(); }
    });
  });

  it("UNKNOWN is immutable and capacity-held; only NEW actual dual-close readback becomes ABORTED", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits({ send_timeout_ms: 30, quiesce_timeout_ms: 30 }));
      const stream = e.openStream(response), permit = held(e, stream), reservation = e.reserveFrame(stream, frame, permit.binding);
      const socket = response.socket!, restore = stallSocket(response);
      const responseDestroy = vi.spyOn(response, "destroy").mockReturnValue(response);
      const socketDestroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      try {
        const first = await bounded(e.dispatchFrame(reservation, permit)), old = e.consumeFrame(first, reservation);
        expect(old).toMatchObject({ outcome: "UNKNOWN", reason: "DEADLINE" }); expect(Object.isFrozen(old)).toBe(true);
        expect(e.observeFrameClosed(reservation)).toBeNull(); expect(e.diagnostics().inflight).toBe(1);
        expect(() => new NativeReadEgress(limits()).observeFrameClosed(reservation)).toThrowError(NativeReadEgressError);
        expect(() => e.observeFrameClosed({ ...reservation })).toThrowError(NativeReadEgressError);
        expect(() => e.observeFrameClosed({ outcome: "ABORTED", responseClosed: true, socketClosed: true } as
          unknown as NativeReadEgressFrameReservation)).toThrowError(NativeReadEgressError);
        expect(response.destroyed).toBe(false); expect(socket.destroyed).toBe(false);
        // Event flags alone are not genuine destroyed state or release proof.
        response.emit("close"); socket.emit("close");
        expect(e.observeFrameClosed(reservation)).toBeNull(); expect(e.diagnostics().inflight).toBe(1);
        expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
        await withHttp(async other => {
          expect(() => e.openStream(other.response)).toThrowError(NativeReadEgressError);
          expect(() => e.reserveFinite(other.response, frame, binding())).toThrowError(NativeReadEgressError);
          expect(other.response.headersSent).toBe(false);
        });
        responseDestroy.mockRestore(); socketDestroy.mockRestore(); restore(); response.destroy(); socket.destroy();
        await until(() => e.diagnostics().inflight === 0);
        const later = e.observeFrameClosed(reservation)!; expect(later).not.toBe(first);
        expect(e.consumeFrame(later, reservation)).toMatchObject({ outcome: "ABORTED", reason: "CAPTURED_RESPONSE_SOCKET_CLOSED" });
        expect(() => e.consumeFrame(later, reservation)).toThrowError(NativeReadEgressError);
        expect(old).toMatchObject({ outcome: "UNKNOWN", reason: "DEADLINE" });
        expect(() => e.nextFrameDelivery(stream)).toThrowError(NativeReadEgressError);
      } finally { responseDestroy.mockRestore(); socketDestroy.mockRestore(); restore(); response.destroy(); socket.destroy(); }
    });
  });

  it("wrong captured request/socket refuses dispatch and never closes the foreign socket", async () => {
    await withHttp(async ({ response }) => {
      const e = new NativeReadEgress(limits()), stream = e.openStream(response), permit = held(e, stream);
      const reservation = e.reserveFrame(stream, frame, permit.binding), original = response.req.socket, foreign = new Socket();
      const foreignDestroy = vi.spyOn(foreign, "destroy"), write = vi.spyOn(response, "write");
      try {
        response.req.socket = foreign;
        await expect(e.dispatchFrame(reservation, permit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESERVATION_REFUSED" });
        expect(write).not.toHaveBeenCalled(); response.req.socket = original;
        e.closeStream(stream); await until(() => e.diagnostics().inflight === 0);
        expect(foreignDestroy).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      } finally { response.req.socket = original; foreignDestroy.mockRestore(); foreign.destroy(); }
    });
  });
});
