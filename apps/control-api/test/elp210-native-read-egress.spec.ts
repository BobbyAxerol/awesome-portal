/** PRIVATE NC02 PROPOSAL / NOT_APPLIED / NOT_RUN.
 * Intended location: test/elp210-native-read-egress.spec.ts.
 * Ported actual HTTP tests require a fresh affected gate after lifecycle edits;
 * the peer's earlier receipt is NOT this modified component's test result.
 * Localhost HTTP is TEST_ONLY, not real authority/production delivery/HA.
 * Positive completion uses an actual ServerResponse and real HTTP client.
 * Fault injection stalls actual socket writes; it never fabricates success.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, IncomingMessage, request, ServerResponse, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { NativeReadEgress, NativeReadEgressError, type HeldNativeReadEgressPermit,
  type NativeReadEgressBinding, type NativeReadEgressLimits, type NativeReadEgressWitness } from "../src/execution-v2/native-read-egress";

const body = Buffer.from('{"TEST_ONLY":true}');
const digest = (value: Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const limits = (extra: Partial<NativeReadEgressLimits> = {}): NativeReadEgressLimits => ({
  maximum_response_bytes: 1048576, maximum_inflight: 1, send_timeout_ms: 1000, quiesce_timeout_ms: 500, ...extra,
});
const permit = (payload = body, extra: Partial<NativeReadEgressBinding> = {}): HeldNativeReadEgressPermit => ({
  binding: { lease_id: randomUUID(), attempt_id: randomUUID(), binding_digest: "a".repeat(64), source_digest: "b".repeat(64),
    scope_digest: `sha256:${"c".repeat(64)}`, body_digest: digest(payload), valid_until_ms: Date.now() + 10000, ...extra },
  // TEST_ONLY stand-in: this does NOT prove a durable SENDING/source authority.
  assertCurrent: vi.fn(),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TEST_ONLY_HTTP_DEADLINE")), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("TEST_ONLY_QUIESCENCE_DEADLINE");
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
}
type Received = { complete: boolean; body: Buffer; headers: IncomingHttpHeaders };
type Exchange = { response: ServerResponse; client: ClientRequest; received: Promise<Received> };
async function exchange(run: (context: Exchange) => Promise<void>, method = "GET"): Promise<void> {
  const accepted = deferred<ServerResponse>(), received = deferred<Received>(), sockets = new Set<Socket>();
  const server = createServer((_req, response) => accepted.resolve(response));
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  let client: ClientRequest | undefined;
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    }));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN_ADDRESS");
    client = request({ host: "127.0.0.1", port: address.port, path: "/TEST_ONLY", method, agent: false,
      headers: { connection: "close" } }, reply => {
      const chunks: Buffer[] = [];
      reply.on("data", (chunk: Buffer) => chunks.push(chunk));
      reply.once("end", () => received.resolve({ complete: reply.complete, body: Buffer.concat(chunks), headers: reply.headers }));
      reply.once("error", () => received.resolve({ complete: false, body: Buffer.concat(chunks), headers: reply.headers }));
      reply.once("aborted", () => received.resolve({ complete: false, body: Buffer.concat(chunks), headers: reply.headers }));
    });
    client.on("error", () => received.resolve({ complete: false, body: Buffer.alloc(0), headers: {} }));
    client.end();
    await bounded(run({ response: await bounded(accepted.promise), client, received: received.promise }));
  } finally {
    client?.destroy();
    // ONLY this test's server/socket set; never touch another listener/job.
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await bounded(new Promise<void>(resolve => server.close(() => resolve())));
  }
}
function stallActualSocket(response: ServerResponse): () => void {
  const socket = response.socket;
  if (!socket) throw new Error("TEST_ONLY_SOCKET_MISSING");
  const write = vi.spyOn(socket, "_write").mockImplementation(() => undefined);
  const writev = socket._writev ? vi.spyOn(socket, "_writev").mockImplementation(() => undefined) : undefined;
  return () => { write.mockRestore(); writev?.mockRestore(); };
}

describe("TEST_ONLY finite native read HTTP egress, no installed authority", () => {
  it.each([
    { maximum_response_bytes: 0 }, { maximum_response_bytes: 1048577 }, { maximum_response_bytes: 1.5 },
    { maximum_inflight: 0 }, { maximum_inflight: 129 }, { send_timeout_ms: 0 }, { quiesce_timeout_ms: 0 },
    { send_timeout_ms: 60000, quiesce_timeout_ms: 1 }, { send_timeout_ms: Number.NaN },
  ])("rejects invalid finite limits %j", invalid => {
    expect(() => new NativeReadEgress(limits(invalid))).toThrowError(NativeReadEgressError);
  });

  it("observes genuine finish/writableFinished with exact bounded body and no-store headers", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit();
      const witness = await bounded(egress.send(response, body, held)), result = await bounded(received);
      expect(result.complete).toBe(true); expect(result.body).toEqual(body);
      expect(result.headers["content-length"]).toBe(String(body.length));
      expect(result.headers["cache-control"]).toBe("private, no-store");
      expect(result.headers["x-content-type-options"]).toBe("nosniff");
      expect(result.headers.connection).toBe("close");
      expect(response.writableFinished).toBe(true);
      const observation = egress.consume(witness, response, held);
      expect(observation).toMatchObject({ outcome: "FINISHED", reason: "FINISH_WRITABLE_FINISHED", bytes: body.length,
        semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY", binding: held.binding });
      expect(Object.isFrozen(observation)).toBe(true); expect(Object.isFrozen(observation.binding)).toBe(true);
      await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("copies caller bytes before sending and permits the exact 1 MiB boundary", async () => {
    await exchange(async ({ response, received }) => {
      const payload = Buffer.alloc(1048576, 65), expected = Buffer.from(payload), held = permit(payload);
      const egress = new NativeReadEgress(limits()), pending = egress.send(response, payload, held);
      payload.fill(66);
      const witness = await bounded(pending), actual = await bounded(received);
      // Native byte equality is exact and bounded; a 1MiB JS property-by-
      // property deep comparison itself can consume the whole test deadline.
      expect(actual.body.length).toBe(expected.length);
      expect(actual.body.equals(expected)).toBe(true); expect(actual.complete).toBe(true);
      expect(egress.consume(witness, response, held).binding.body_digest).toBe(digest(expected));
      await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("cannot mint a witness using a fake or unconnected ServerResponse", async () => {
    const egress = new NativeReadEgress(limits());
    await expect(egress.send({} as ServerResponse, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
    const socket = new Socket(), request = new IncomingMessage(socket), response = new ServerResponse(request);
    try { await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" }); }
    finally { socket.destroy(); }
    expect(egress.diagnostics().inflight).toBe(0);
  });

  it.each(["HEAD", "POST"])("refuses method %s before protected bytes/ownership", async method => {
    await exchange(async ({ response }) => {
      const egress = new NativeReadEgress(limits());
      await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
      expect(response.headersSent).toBe(false); expect(egress.diagnostics().inflight).toBe(0);
    }, method);
  });

  it.each(["transfer-encoding", "content-encoding", "trailer"])("refuses preexisting %s framing", async header => {
    await exchange(async ({ response }) => {
      response.setHeader(header, "TEST_ONLY");
      const egress = new NativeReadEgress(limits());
      await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
      expect(response.headersSent).toBe(false); expect(egress.diagnostics().inflight).toBe(0);
    });
  });

  it("refuses a prewritten response and a non-200 response", async () => {
    await exchange(async ({ response }) => {
      const egress = new NativeReadEgress(limits()); response.statusCode = 403;
      await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
      response.statusCode = 200; response.write("TEST_ONLY-existing");
      await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
      expect(egress.diagnostics().inflight).toBe(0);
    });
  });

  it.each(["digest", "expiry", "schema", "newline", "oversize"])("refuses %s bindings without sending or consuming the permit", async kind => {
    await exchange(async ({ response }) => {
      const payload = kind === "oversize" ? Buffer.alloc(1048577) : body;
      const held = permit(payload, kind === "digest" ? { body_digest: `sha256:${"0".repeat(64)}` }
        : kind === "expiry" ? { valid_until_ms: Date.now() - 1 } : kind === "schema" ? { attempt_id: "TEST_ONLY-not-uuid" }
        : kind === "newline" ? { lease_id: `${randomUUID()}\n` } : {});
      const egress = new NativeReadEgress(limits());
      await expect(egress.send(response, payload, held)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_BINDING_REFUSED" });
      expect(response.headersSent).toBe(false); expect(egress.diagnostics().inflight).toBe(0);
      expect(held.assertCurrent).not.toHaveBeenCalled();
    });
  });

  it("sanitizes a throwing binding getter before ownership", async () => {
    await exchange(async ({ response }) => {
      let calls = 0;
      const held = { get binding(): NativeReadEgressBinding { calls++; throw new Error("TEST_ONLY-DO-NOT-EXPOSE"); }, assertCurrent: vi.fn() };
      const egress = new NativeReadEgress(limits());
      await expect(egress.send(response, body, held)).rejects.toMatchObject({
        code: "NATIVE_READ_EGRESS_BINDING_REFUSED", message: "The protected response could not be delivered.",
      });
      expect(response.headersSent).toBe(false); expect(egress.diagnostics().inflight).toBe(0);
      expect(calls).toBe(0);
    });
  });

  it("witness is opaque, response/permit/dispatcher bound and consumed exactly once", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit();
      const witness = await bounded(egress.send(response, body, held)); await bounded(received);
      expect(Object.keys(witness)).toEqual([]); expect(Object.isFrozen(witness)).toBe(true);
      expect(() => egress.consume({ ...witness } as NativeReadEgressWitness, response, held)).toThrowError(NativeReadEgressError);
      expect(() => egress.consume(witness, {} as ServerResponse, held)).toThrowError(NativeReadEgressError);
      expect(() => egress.consume(witness, response, { ...held })).toThrowError(NativeReadEgressError);
      expect(() => new NativeReadEgress(limits()).consume(witness, response, held)).toThrowError(NativeReadEgressError);
      expect(egress.consume(witness, response, held).outcome).toBe("FINISHED");
      expect(() => egress.consume(witness, response, held)).toThrowError(NativeReadEgressError);
      await expect(egress.send(response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESPONSE_REFUSED" });
      await exchange(async other => {
        await expect(new NativeReadEgress(limits()).send(other.response, body, held)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_PERMIT_REFUSED" });
        expect(other.response.headersSent).toBe(false);
      });
    });
  });

  it.each(["throw", "thenable", "binding-change", "framing-change"])("fails closed for an invalid current guard: %s", async kind => {
    await exchange(async ({ response }) => {
      const egress = new NativeReadEgress(limits()), held = permit();
      held.assertCurrent = () => {
        if (kind === "throw") throw new Error("TEST_ONLY-DO-NOT-EXPOSE");
        if (kind === "thenable") return Promise.reject(new Error("TEST_ONLY-DO-NOT-EXPOSE"));
        if (kind === "binding-change") Object.assign(held.binding, { scope_digest: `sha256:${"d".repeat(64)}` });
        if (kind === "framing-change") response.setHeader("transfer-encoding", "TEST_ONLY");
      };
      const witness = await bounded(egress.send(response, body, held)), result = egress.consume(witness, response, held);
      expect(result.outcome).toBe("ABORTED"); expect(response.headersSent).toBe(false);
      expect(egress.diagnostics().inflight).toBe(0);
    });
  });

  it("a genuine finish with failed final currentness remains UNKNOWN, not FINISHED", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit(); let checks = 0;
      held.assertCurrent = () => { if (++checks > 1) throw new Error("TEST_ONLY-REVOKED"); };
      const witness = await bounded(egress.send(response, body, held));
      expect((await bounded(received)).complete).toBe(true); expect(response.writableFinished).toBe(true);
      expect(egress.consume(witness, response, held)).toMatchObject({ outcome: "UNKNOWN", reason: "PERMIT_NOT_CURRENT" });
      await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("actual client abort closes the stalled response rather than minting FINISHED", async () => {
    await exchange(async ({ response, client }) => {
      const restore = stallActualSocket(response), egress = new NativeReadEgress(limits()), held = permit();
      try {
        const pending = egress.send(response, body, held); client.destroy();
        const result = egress.consume(await bounded(pending), response, held);
        expect(result).toMatchObject({ outcome: "ABORTED", reason: "RESPONSE_CLOSED" });
        expect(response.destroyed).toBe(true); expect(egress.diagnostics().inflight).toBe(0);
      } finally { restore(); }
    });
  });

  it("bounded backpressure deadline destroys only the owned response and observes actual closure", async () => {
    await exchange(async ({ response }) => {
      const restore = stallActualSocket(response), egress = new NativeReadEgress(limits({ send_timeout_ms: 50 })), held = permit();
      const socket = response.socket!;
      try {
        const pending = egress.send(response, body, held);
        expect(response.writableFinished).toBe(false); expect(socket.writableLength).toBeGreaterThan(0);
        const result = egress.consume(await bounded(pending), response, held);
        expect(result).toMatchObject({ outcome: "ABORTED", reason: "DEADLINE" });
        expect(response.destroyed && socket.destroyed).toBe(true); expect(egress.diagnostics().inflight).toBe(0);
      } finally { restore(); }
    });
  });

  it("unconfirmed destroy yields UNKNOWN and retains capacity until real quiescence", async () => {
    await exchange(async ({ response }) => {
      const socket = response.socket!;
      const restoreWrites = stallActualSocket(response), destroy = vi.spyOn(response, "destroy").mockReturnValue(response);
      const socketDestroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      const egress = new NativeReadEgress(limits({ send_timeout_ms: 30, quiesce_timeout_ms: 30 })), held = permit();
      try {
        const witness = await bounded(egress.send(response, body, held));
        expect(destroy).toHaveBeenCalledTimes(1); expect(response.writableFinished).toBe(false);
        expect(egress.diagnostics().inflight).toBe(1);
        await exchange(async other => {
          await expect(egress.send(other.response, body, permit())).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_BUSY" });
          expect(other.response.headersSent).toBe(false);
        });
        expect(socketDestroy).toHaveBeenCalled();
        destroy.mockRestore(); socketDestroy.mockRestore(); restoreWrites(); response.destroy(); socket.destroy();
        await until(() => egress.diagnostics().inflight === 0);
        expect(egress.consume(witness, response, held)).toMatchObject({ outcome: "UNKNOWN", reason: "DEADLINE" });
      } finally { destroy.mockRestore(); socketDestroy.mockRestore(); restoreWrites(); response.destroy(); socket.destroy(); }
    });
  });

  it.each(["error", "throw", "incomplete-finish"])("never accepts %s as a positive completion", async kind => {
    await exchange(async ({ response }) => {
      const restore = stallActualSocket(response), egress = new NativeReadEgress(limits()), held = permit();
      const socket = response.socket!;
      const end = kind === "throw" ? vi.spyOn(response, "end").mockImplementation(() => { throw new Error("TEST_ONLY-DO-NOT-EXPOSE"); }) : undefined;
      try {
        const pending = egress.send(response, body, held);
        if (kind === "error") response.emit("error", new Error("TEST_ONLY-DO-NOT-EXPOSE"));
        if (kind === "incomplete-finish") { expect(response.writableFinished).toBe(false); response.emit("finish"); }
        const actual = egress.consume(await bounded(pending), response, held);
        // An injected finish is NEVER positive. Unlike the old peer version,
        // this component also closes the captured socket after Node detaches it.
        expect(actual.outcome).not.toBe("FINISHED");
        expect(actual.reason).toBe(kind === "throw" ? "SEND_THROW" : "RESPONSE_ERROR");
        if (kind === "incomplete-finish") {
          socket.destroy();
          await until(() => egress.diagnostics().inflight === 0);
        }
        expect(egress.diagnostics().inflight).toBe(0);
      } finally { end?.mockRestore(); restore(); }
    });
  });
});

describe("TEST_ONLY same-instance zero-write reservation before SENDING COMMIT", () => {
  it("captures bytes before COMMIT without calling write/end/flush, then dispatches once", async () => {
    await exchange(async ({response,received}) => {
      const egress=new NativeReadEgress(limits()), payload=Buffer.from(body), held=permit(payload);
      const write=vi.spyOn(response,"write"), end=vi.spyOn(response,"end"), flush=vi.spyOn(response,"flushHeaders");
      const reserved=egress.reserveFinite(response,payload,held.binding);
      expect(response.headersSent).toBe(false); expect(write).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled(); expect(flush).not.toHaveBeenCalled();
      expect(egress.diagnostics().inflight).toBe(1); payload.fill(88);
      const witness=await bounded(egress.dispatch(reserved,held));
      expect((await bounded(received)).body.equals(body)).toBe(true);
      expect(egress.consumeReserved(witness,reserved).outcome).toBe("FINISHED");
      await expect(egress.dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
      await expect(egress.cancelUnsent(reserved)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_ALREADY_DISPATCHED"});
    });
  });
  it.each(["COMMIT_ACK_LOST","ROLLBACK_BEFORE_COMMIT"])("retains a genuine unsent witness after %s (orchestration-only, no DB claim)", async fault => {
    await exchange(async ({response,received}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      const end=vi.spyOn(response,"end");
      // TEST_ONLY asynchronous boundary; actual PG ACK-loss qualification is separate.
      try { await Promise.reject(new Error(fault)); } catch {
        const witness=await bounded(egress.cancelUnsent(reserved));
        expect(egress.consumeReserved(witness,reserved)).toMatchObject({
          outcome:"ABORTED",reason:"UNSENT_RESERVATION_QUIESCENT",binding:held.binding});
      }
      expect(end).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      expect((await bounded(received)).body.length).toBe(0);
      expect(egress.diagnostics().inflight).toBe(0);
      await expect(egress.dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
    });
  });
  it("synchronously cancels so a racing dispatch cannot send", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      const cancelled=egress.cancelUnsent(reserved);
      await expect(egress.dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
      expect(egress.consumeReserved(await bounded(cancelled),reserved).outcome).toBe("ABORTED");
    });
  });
  it("does not let another writer claim the reserved response", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      await expect(new NativeReadEgress(limits()).send(response,body,permit())).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESPONSE_REFUSED"});
      expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reserved)),reserved).outcome).toBe("ABORTED");
    });
  });
  it.each(["attempt","body","source","scope"])("does not dispatch a %s-mismatched permit", async mismatch => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      const changed={...held,binding:{...held.binding,
        ...(mismatch==="attempt"?{attempt_id:randomUUID()}:mismatch==="body"?{body_digest:digest(Buffer.from("other"))}:
          mismatch==="source"?{source_digest:"d".repeat(64)}:{scope_digest:"sha256:"+"e".repeat(64)})}};
      await expect(egress.dispatch(reserved,changed)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_BINDING_REFUSED"});
      expect(response.headersSent).toBe(false);
      expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reserved)),reserved).outcome).toBe("ABORTED");
    });
  });
  it("refuses a permit already dispatched on another response without sending the next response", async () => {
    const egress=new NativeReadEgress(limits()), held=permit();
    await exchange(async ({response,received}) => {
      const reserved=egress.reserveFinite(response,body,held.binding);
      expect(egress.consumeReserved(await bounded(egress.dispatch(reserved,held)),reserved).outcome).toBe("FINISHED");
      expect((await bounded(received)).body.equals(body)).toBe(true);
    });
    await exchange(async ({response}) => {
      const reserved=egress.reserveFinite(response,body,held.binding), end=vi.spyOn(response,"end");
      await expect(egress.dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_PERMIT_REFUSED"});
      expect(end).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reserved)),reserved).outcome).toBe("ABORTED");
    });
  });
  it("rejects fake/cross-instance reservations and copied/replayed cancellation witnesses", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      await expect(new NativeReadEgress(limits()).dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
      await expect(egress.cancelUnsent({...reserved})).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
      const witness=await bounded(egress.cancelUnsent(reserved));
      expect(()=>egress.consumeReserved({...witness},reserved)).toThrowError(NativeReadEgressError);
      expect(()=>new NativeReadEgress(limits()).consumeReserved(witness,reserved)).toThrowError(NativeReadEgressError);
      expect(egress.consumeReserved(witness,reserved).outcome).toBe("ABORTED");
      expect(()=>egress.consumeReserved(witness,reserved)).toThrowError(NativeReadEgressError);
    });
  });
  it("keeps UNKNOWN/capacity after unproven closure; NEW later witness requires actual closure", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits({quiesce_timeout_ms:25})), held=permit();
      const socket=response.socket!;
      const destroy=vi.spyOn(response,"destroy").mockReturnValue(response);
      const socketDestroy=vi.spyOn(socket,"destroy").mockReturnValue(socket);
      const reserved=egress.reserveFinite(response,body,held.binding);
      try {
        const first=await bounded(egress.cancelUnsent(reserved));
        expect(egress.consumeReserved(first,reserved).outcome).toBe("UNKNOWN");
        expect(egress.diagnostics().inflight).toBe(1);
        expect(egress.observeClosed(reserved)).toBeNull();
        await exchange(async other=>{
          expect(()=>egress.reserveFinite(other.response,body,permit().binding)).toThrowError(NativeReadEgressError);
          expect(other.response.headersSent).toBe(false);
        });
        destroy.mockRestore(); socketDestroy.mockRestore(); response.destroy(); socket.destroy();
        await until(()=>egress.diagnostics().inflight===0);
        const later=await bounded(egress.cancelUnsent(reserved));
        expect(later).not.toBe(first);
        expect(egress.consumeReserved(later,reserved)).toMatchObject({outcome:"ABORTED",reason:"UNSENT_RESERVATION_QUIESCENT"});
      } finally {destroy.mockRestore();socketDestroy.mockRestore();response.destroy();socket.destroy();}
    });
  });
  it("never calls a contaminated response an unsent response", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits()), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      response.write("TEST_ONLY_FOREIGN_WRITER");
      expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reserved)),reserved).outcome).toBe("UNKNOWN");
      expect(egress.diagnostics().inflight).toBe(0);
    });
  });
  it("expires an undispatched reservation without sending and retains its recovery witness", async () => {
    await exchange(async ({response}) => {
      const egress=new NativeReadEgress(limits({send_timeout_ms:25})), held=permit(), reserved=egress.reserveFinite(response,body,held.binding);
      await until(()=>egress.diagnostics().inflight===0);
      expect(response.headersSent).toBe(false);
      expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reserved)),reserved).outcome).toBe("ABORTED");
      await expect(egress.dispatch(reserved,held)).rejects.toMatchObject({code:"NATIVE_READ_EGRESS_RESERVATION_REFUSED"});
    });
  });
});

describe("NC02 closure accounting and opaque same-instance recovery / TEST_ONLY local HTTP", () => {
  it("never issues FINISHED if the second current guard crosses expiry inside genuine finish", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit(), reserved = egress.reserveFinite(response, body, held.binding);
      let now = Date.now(), calls = 0;
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const guarded = { binding: held.binding, assertCurrent() {
        if (++calls === 2) {
          now = held.binding.valid_until_ms;
          // Restore after finish's complete synchronous currentness decision.
          queueMicrotask(() => clock.mockRestore());
        }
      } };
      try {
        const observation = egress.consumeReserved(await bounded(egress.dispatch(reserved, guarded)), reserved);
        expect(calls).toBe(2); expect(response.writableFinished).toBe(true);
        expect(observation).toMatchObject({ outcome: "UNKNOWN", reason: "PERMIT_NOT_CURRENT" });
        const actual = await bounded(received); expect(actual.complete).toBe(true); expect(actual.body.equals(body)).toBe(true);
        await until(() => egress.diagnostics().inflight === 0);
        expect(observation.outcome).toBe("UNKNOWN");
      } finally { clock.mockRestore(); }
    });
  });

  it("sends zero headers/body when the synchronous current guard crosses the exact UTC deadline", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit(), reserved = egress.reserveFinite(response, body, held.binding);
      let now = Date.now();
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const end = vi.spyOn(response, "end");
      const guarded = { binding: held.binding, assertCurrent() { now = held.binding.valid_until_ms; } };
      let pending: Promise<NativeReadEgressWitness>;
      try { pending = egress.dispatch(reserved, guarded); }
      finally { clock.mockRestore(); }
      const observation = egress.consumeReserved(await bounded(pending!), reserved);
      expect(observation.outcome).not.toBe("FINISHED"); expect(observation.reason).toBe("PERMIT_NOT_CURRENT");
      expect(end).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      const actual = await bounded(received); expect(actual.body.length).toBe(0); expect(actual.headers).toEqual({});
      await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("rechecks time directly before end even when host header assembly crosses the deadline", async () => {
    await exchange(async ({ response, received }) => {
      const egress = new NativeReadEgress(limits()), held = permit(), reserved = egress.reserveFinite(response, body, held.binding);
      let now = Date.now();
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const original = response.setHeader;
      const header = vi.spyOn(response, "setHeader").mockImplementation(function (this: ServerResponse, name, value) {
        const result = original.call(this, name, value);
        if (name === "x-content-type-options") now = held.binding.valid_until_ms;
        return result;
      });
      const end = vi.spyOn(response, "end");
      let pending: Promise<NativeReadEgressWitness>;
      try { pending = egress.dispatch(reserved, held); }
      finally { clock.mockRestore(); header.mockRestore(); }
      expect(egress.consumeReserved(await bounded(pending!), reserved).outcome).not.toBe("FINISHED");
      expect(end).not.toHaveBeenCalled(); expect(response.headersSent).toBe(false);
      expect((await bounded(received)).body.length).toBe(0);
      await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("clears every owned quiescence timer after genuine finish then network end and physical closure", async () => {
    await exchange(async ({ response, client, received }) => {
      const socket = response.socket!, ended = deferred<void>(); socket.once("end", () => ended.resolve());
      const destroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      const schedule = vi.spyOn(globalThis, "setTimeout"), cancel = vi.spyOn(globalThis, "clearTimeout");
      const egress = new NativeReadEgress(limits({ quiesce_timeout_ms: 9000 })), held = permit();
      const reserved = egress.reserveFinite(response, body, held.binding);
      try {
        expect(egress.consumeReserved(await bounded(egress.dispatch(reserved, held)), reserved).outcome).toBe("FINISHED");
        expect((await bounded(received)).body.equals(body)).toBe(true);
        client.destroy(); await bounded(ended.promise);
        // The actual peer FIN triggers socketEnd while captured close is stalled.
        const timers = schedule.mock.calls.flatMap((args, index) => args[1] === 9000 ? [schedule.mock.results[index].value] : []);
        expect(timers.length).toBeGreaterThanOrEqual(2);
        expect(egress.diagnostics().inflight).toBe(1);
        destroy.mockRestore(); response.destroy(); socket.destroy();
        await until(() => egress.diagnostics().inflight === 0);
        for (const timer of timers) expect(cancel).toHaveBeenCalledWith(timer);
        expect(egress.consumeReserved(egress.observeClosed(reserved)!, reserved).outcome).toBe("FINISHED");
      } finally { destroy.mockRestore(); schedule.mockRestore(); cancel.mockRestore(); response.destroy(); socket.destroy(); }
    });
  });

  it("copies and authenticates intrinsic Buffer bytes without reading a caller-controlled length getter", async () => {
    await exchange(async ({ response, received }) => {
      const payload = Buffer.from(body), held = permit(payload), egress = new NativeReadEgress(limits()); let calls = 0;
      Object.defineProperty(payload, "length", { get() { calls++; throw new Error("TEST_ONLY_PRIVATE_LENGTH"); } });
      const reservation = egress.reserveFinite(response, payload, held.binding);
      const witness = await bounded(egress.dispatch(reservation, held));
      expect((await bounded(received)).body.equals(body)).toBe(true);
      expect(egress.consumeReserved(witness, reservation)).toMatchObject({ outcome: "FINISHED", bytes: body.length });
      expect(calls).toBe(0); await until(() => egress.diagnostics().inflight === 0);
    });
  });

  it("keeps admission after genuine FINISHED until the captured socket physically closes, preserving FINISHED", async () => {
    await exchange(async ({ response, received }) => {
      const socket = response.socket!, destroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      const egress = new NativeReadEgress(limits({ quiesce_timeout_ms: 100 })), held = permit();
      const reservation = egress.reserveFinite(response, body, held.binding);
      try {
        const witness = await bounded(egress.dispatch(reservation, held));
        expect((await bounded(received)).body.equals(body)).toBe(true);
        expect(egress.consumeReserved(witness, reservation)).toMatchObject({ outcome: "FINISHED", reason: "FINISH_WRITABLE_FINISHED" });
        expect(egress.diagnostics().inflight).toBe(1); expect(egress.observeClosed(reservation)).toBeNull();
        await exchange(async other => {
          expect(() => egress.reserveFinite(other.response, body, permit().binding)).toThrowError(NativeReadEgressError);
          expect(other.response.headersSent).toBe(false);
        });
        destroy.mockRestore(); socket.destroy();
        await until(() => egress.diagnostics().inflight === 0);
        const closed = egress.observeClosed(reservation)!;
        expect(egress.consumeReserved(closed, reservation)).toMatchObject({ outcome: "FINISHED", reason: "FINISH_WRITABLE_FINISHED" });
      } finally { destroy.mockRestore(); response.destroy(); socket.destroy(); }
    });
  });

  it("only actual late response+socket closure yields a NEW ABORTED observation after dispatched UNKNOWN", async () => {
    await exchange(async ({ response }) => {
      const socket = response.socket!, restoreWrites = stallActualSocket(response);
      const responseDestroy = vi.spyOn(response, "destroy").mockReturnValue(response);
      const socketDestroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      const egress = new NativeReadEgress(limits({ send_timeout_ms: 25, quiesce_timeout_ms: 25 })), held = permit();
      const reservation = egress.reserveFinite(response, body, held.binding);
      try {
        const witness = await bounded(egress.dispatch(reservation, held));
        const original = egress.consumeReserved(witness, reservation);
        expect(original).toMatchObject({ outcome: "UNKNOWN", reason: "DEADLINE" });
        expect(responseDestroy).toHaveBeenCalled(); expect(socketDestroy).toHaveBeenCalled();
        expect(egress.observeClosed(reservation)).toBeNull(); expect(egress.diagnostics().inflight).toBe(1);
        await expect(egress.dispatch(reservation, held)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_RESERVATION_REFUSED" });
        responseDestroy.mockRestore(); socketDestroy.mockRestore(); restoreWrites(); response.destroy(); socket.destroy();
        await until(() => egress.diagnostics().inflight === 0);
        const later = egress.observeClosed(reservation)!;
        expect(later).not.toBe(witness);
        expect(egress.consumeReserved(later, reservation)).toMatchObject({ outcome: "ABORTED", reason: "CAPTURED_RESPONSE_SOCKET_CLOSED",
          semantics: "LOCAL_CORE_HTTP_EGRESS_ONLY", binding: held.binding });
        expect(original).toMatchObject({ outcome: "UNKNOWN", reason: "DEADLINE" });
        expect(() => egress.consumeReserved(later, reservation)).toThrowError(NativeReadEgressError);
      } finally { responseDestroy.mockRestore(); socketDestroy.mockRestore(); restoreWrites(); response.destroy(); socket.destroy(); }
    });
  });

  it("no reservation clone, new dispatcher, TTL or JSON-shaped state can attest physical closure", async () => {
    await exchange(async ({ response }) => {
      const socket = response.socket!, responseDestroy = vi.spyOn(response, "destroy").mockReturnValue(response);
      const socketDestroy = vi.spyOn(socket, "destroy").mockReturnValue(socket);
      const egress = new NativeReadEgress(limits({ send_timeout_ms: 25, quiesce_timeout_ms: 25 })), held = permit();
      const reservation = egress.reserveFinite(response, body, held.binding);
      try {
        expect(egress.consumeReserved(await bounded(egress.cancelUnsent(reservation)), reservation).outcome).toBe("UNKNOWN");
        expect(egress.observeClosed(reservation)).toBeNull();
        expect(() => new NativeReadEgress(limits()).observeClosed(reservation)).toThrowError(NativeReadEgressError);
        expect(() => egress.observeClosed({ ...reservation })).toThrowError(NativeReadEgressError);
        expect(() => egress.observeClosed(JSON.parse('{"outcome":"ABORTED","responseClosed":true,"socketClosed":true}'))).toThrowError(NativeReadEgressError);
        expect(response.destroyed).toBe(false); expect(socket.destroyed).toBe(false);
        responseDestroy.mockRestore(); socketDestroy.mockRestore(); response.destroy(); socket.destroy();
        await until(() => egress.diagnostics().inflight === 0);
        expect(egress.consumeReserved(egress.observeClosed(reservation)!, reservation).outcome).toBe("ABORTED");
      } finally { responseDestroy.mockRestore(); socketDestroy.mockRestore(); response.destroy(); socket.destroy(); }
    });
  });

  it("unsent cancellation explicitly closes the captured socket even if response.destroy throws", async () => {
    await exchange(async ({ response }) => {
      const socket = response.socket!, socketDestroy = vi.spyOn(socket, "destroy");
      const responseDestroy = vi.spyOn(response, "destroy").mockImplementation(() => { throw new Error("TEST_ONLY_PRIVATE_DESTROY"); });
      const egress = new NativeReadEgress(limits({ quiesce_timeout_ms: 25 })), held = permit();
      const reservation = egress.reserveFinite(response, body, held.binding);
      try {
        const pending = egress.cancelUnsent(reservation);
        expect(socketDestroy).toHaveBeenCalled();
        const witness = await bounded(pending), observed = egress.consumeReserved(witness, reservation);
        // If Node has not closed the response object too, physical socket close
        // alone must stay UNKNOWN/admitted, never be called an unsent ABORTED.
        if (!response.destroyed) { expect(observed.outcome).toBe("UNKNOWN"); expect(egress.diagnostics().inflight).toBe(1); }
        else { expect(observed.outcome).toBe("ABORTED"); await until(() => egress.diagnostics().inflight === 0); }
        expect(response.headersSent).toBe(false);
      } finally { responseDestroy.mockRestore(); socketDestroy.mockRestore(); response.destroy(); socket.destroy(); }
    });
  });

  it("requires the exact captured request/socket at dispatch after reservation, not a replacement socket", async () => {
    await exchange(async ({ response }) => {
      const socket = response.socket!, foreign = new Socket(), held = permit(), egress = new NativeReadEgress(limits());
      const reservation = egress.reserveFinite(response, body, held.binding), requestSocket = response.req.socket;
      const foreignDestroy = vi.spyOn(foreign, "destroy");
      try {
        response.req.socket = foreign;
        // Dispatch checks synchronously. Restore before unrelated later Node
        // request-cleanup handlers so that this fault does not reassign their
        // own cleanup target or falsely attribute Node cleanup to the adapter.
        queueMicrotask(() => { response.req.socket = requestSocket; });
        const witness = await bounded(egress.dispatch(reservation, held));
        expect(egress.consumeReserved(witness, reservation)).toMatchObject({ outcome: "ABORTED", reason: "SEND_THROW" });
        expect(response.headersSent).toBe(false); expect(foreignDestroy).not.toHaveBeenCalled();
        await until(() => egress.diagnostics().inflight === 0);
      } finally { response.req.socket = requestSocket; foreignDestroy.mockRestore(); foreign.destroy(); response.destroy(); socket.destroy(); }
    });
  });

  it.each(["limits", "binding", "permit"] as const)("rejects %s accessor/Proxy boundaries without evaluating their code", async kind => {
    await exchange(async ({ response }) => {
      let calls = 0;
      const malicious = new Proxy({}, { get() { calls++; throw new Error("TEST_ONLY_PRIVATE_GET"); },
        getPrototypeOf() { calls++; throw new Error("TEST_ONLY_PRIVATE_PROTO"); }, ownKeys() { calls++; throw new Error("TEST_ONLY_PRIVATE_KEYS"); } });
      const egress = new NativeReadEgress(limits());
      if (kind === "limits") expect(() => new NativeReadEgress(malicious as NativeReadEgressLimits)).toThrowError(NativeReadEgressError);
      if (kind === "binding") expect(() => egress.reserveFinite(response, body, malicious as NativeReadEgressBinding)).toThrowError(NativeReadEgressError);
      if (kind === "permit") await expect(egress.send(response, body, malicious as HeldNativeReadEgressPermit)).rejects.toMatchObject({ code: "NATIVE_READ_EGRESS_PERMIT_REFUSED" });
      expect(calls).toBe(0); expect(response.headersSent).toBe(false); expect(egress.diagnostics().inflight).toBe(0);
    });
  });
});
