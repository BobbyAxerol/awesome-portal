/** Scripted lifecycle plus a separately guarded disposable-PG notification
 * test below. Neither is connected Edge/SSE or a durable revoke receipt. */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamRevocationHints } from "../src/auth/stream-revocation-hints";
import { parseStreamRevocationNotification, PgStreamRevocationBridge,
  STREAM_REVOCATION_CHANNEL, STREAM_REVOCATION_PAYLOAD_BYTES } from "../src/auth/stream-revocation-pg";

const ORIGIN = "00000000-0000-4000-8000-000000000001";
const payload = (extra = {}) => JSON.stringify({ version: 1, origin: ORIGIN,
  kind: "SESSION_ENDED", subject_id: "TEST_ONLY-session", ...extra });
class Client extends EventEmitter {
  query = vi.fn(async (_query: unknown) => ({ rows: [] }));
  release = vi.fn();
}
function fixture() {
  const hints = new StreamRevocationHints(), client = new Client();
  const pool = { options: { max: 2, connectionTimeoutMillis: 1_000, query_timeout: 1_000 },
    connect: vi.fn(async () => client), query: vi.fn(async (_query: unknown) => ({ rows: [] })) };
  const bridge = new PgStreamRevocationBridge(pool as unknown as Pool, hints);
  live.push(bridge);
  return { hints, client, pool, bridge };
}
const live: PgStreamRevocationBridge[] = [];
afterEach(async () => { for (const bridge of live.splice(0)) await bridge.close(); vi.useRealTimers(); });

describe("bounded cross-process revoke notification", () => {
  it("accepts only the exact versioned id-only envelope within UTF8 bounds", () => {
    expect(parseStreamRevocationNotification(payload())).toMatchObject({ kind: "SESSION_ENDED" });
    for (const bad of [null, {}, "{", payload({ token: "TEST_ONLY-never-permitted" }),
      payload({ version: 2 }), payload({ origin: "not-a-uuid" }), payload({ kind: "GRANT" }),
      payload({ subject_id: "" }), payload({ subject_id: "x".repeat(257) }),
      payload({ subject_id: "bad\nidentifier" }), " ".repeat(STREAM_REVOCATION_PAYLOAD_BYTES + 1),
      payload({ subject_id: "😀".repeat(256) })]) {
      expect(parseStreamRevocationNotification(bad)).toBeNull();
    }
  });

  it("requires its own bounded two-socket pool rather than deadlocking a shared pool", () => {
    for (const options of [{ max: 1, connectionTimeoutMillis: 1_000, query_timeout: 1_000 },
      { max: 2 }, { max: 2, connectionTimeoutMillis: 0, query_timeout: 1_000 },
      { max: 2, connectionTimeoutMillis: 1_001, query_timeout: 1_000 },
      { max: 2, connectionTimeoutMillis: 1_000, query_timeout: 1_001 }]) {
      expect(() => new PgStreamRevocationBridge({ options } as Pool, new StreamRevocationHints()))
        .toThrow("STREAM_REVOCATION_POOL_BOUNDS_INVALID");
    }
  });

  it("fans out matching remote hints without echo and leaves other channel/self/invalid payloads alone", async () => {
    const { bridge, hints, client, pool } = fixture();
    const session = vi.fn(), user = vi.fn();
    hints.subscribe({ sessionEnded: session, userAuthorityChanged: user });
    await bridge.start(); await bridge.start();
    expect(client.query).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith({ text: `LISTEN ${STREAM_REVOCATION_CHANNEL}` });
    client.emit("notification", { channel: "some_other_channel", payload: payload() });
    client.emit("notification", { channel: STREAM_REVOCATION_CHANNEL, payload: payload({ origin: bridge.origin }) });
    client.emit("notification", { channel: STREAM_REVOCATION_CHANNEL, payload: payload({ token: "bad" }) });
    expect(session).not.toHaveBeenCalled();
    client.emit("notification", { channel: STREAM_REVOCATION_CHANNEL, payload: payload() });
    client.emit("notification", { channel: STREAM_REVOCATION_CHANNEL, payload: payload({ kind: "USER_AUTHORITY_CHANGED", subject_id: "TEST_ONLY-user" }) });
    expect(session).toHaveBeenCalledExactlyOnceWith("TEST_ONLY-session");
    expect(user).toHaveBeenCalledExactlyOnceWith("TEST_ONLY-user");
    expect(pool.query).not.toHaveBeenCalled();
    expect(bridge.diagnostics()).toMatchObject({ received: 2, invalid: 1, pending: 0 });
    expect(JSON.stringify(bridge.diagnostics())).not.toContain("TEST_ONLY-");
  });

  it("publishes after synchronous local fanout with parameterized SQL, and failures never undo the local hint", async () => {
    const { bridge, hints, pool } = fixture();
    const local = vi.fn(); hints.subscribe({ sessionEnded: local, userAuthorityChanged: vi.fn() });
    await bridge.start();
    hints.sessionEnded("TEST_ONLY-session");
    expect(local).toHaveBeenCalledExactlyOnceWith("TEST_ONLY-session");
    const statement = pool.query.mock.calls[0][0] as { text: string; values: string[] };
    expect(statement.text).toBe("SELECT pg_notify($1, $2)");
    expect(statement.values[0]).toBe(STREAM_REVOCATION_CHANNEL);
    expect(JSON.parse(statement.values[1])).toEqual({ version: 1, origin: bridge.origin,
      kind: "SESSION_ENDED", subject_id: "TEST_ONLY-session" });
    expect(pool.options.query_timeout).toBe(1_000);
    await Promise.resolve(); await Promise.resolve();
    pool.query.mockImplementation(() => { throw new Error("TEST_ONLY-db-offline"); });
    expect(() => hints.sessionEnded("TEST_ONLY-second")).not.toThrow();
    expect(local).toHaveBeenCalledTimes(2);
    expect(bridge.diagnostics().failures).toBe(1);
  });

  it("has no unbounded publication queue and cleanup detaches the publisher", async () => {
    const { bridge, hints, pool, client } = fixture();
    const settle: Array<() => void> = [];
    pool.query.mockImplementation(() => new Promise(resolve => { settle.push(() => resolve({ rows: [] })); }));
    await bridge.start();
    for (let n = 0; n < 10; n++) hints.sessionEnded(`TEST_ONLY-${n}`);
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(bridge.diagnostics()).toMatchObject({ pending: 4, dropped: 6 });
    settle.forEach(resolve => resolve());
    await bridge.close();
    expect(client.release).toHaveBeenCalledWith(true);
    expect(client.listenerCount("notification")).toBe(0);
    expect(client.listenerCount("error")).toBe(0);
    expect(client.listenerCount("end")).toBe(0);
    hints.sessionEnded("TEST_ONLY-after-close");
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(bridge.diagnostics()).toMatchObject({ pending: 0, stopped: true, reconnect_scheduled: false });
  });

  it("reconnects after transport loss and cancels reconnect during shutdown", async () => {
    vi.useFakeTimers();
    const { bridge, client, pool } = fixture();
    await bridge.start();
    client.emit("error", new Error("TEST_ONLY-disconnect"));
    expect(bridge.diagnostics()).toMatchObject({ listening: false, reconnect_scheduled: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(bridge.diagnostics().listening).toBe(true);
    client.emit("end");
    await bridge.close();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });

  it("discards a socket obtained after shutdown without ever LISTENing", async () => {
    const { bridge, pool, client } = fixture();
    let deliver!: (client: Client) => void;
    pool.connect.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    const starting = bridge.start(), closing = bridge.close();
    deliver(client); await starting; await closing;
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(true);
    expect(bridge.diagnostics()).toMatchObject({ listening: false, connecting: false, stopped: true });
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PG notification through two independent disposable database pools", () => {
  it("delivers the exact remote hint once, without echo, then closes all checked-out sockets", async () => {
    let target: URL;
    try { target = new URL(process.env.TEST_DATABASE_URL!); }
    catch { throw new Error("STREAM_HINT_DISPOSABLE_DATABASE_REQUIRED"); }
    if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !/^control-api-test-postgres-[0-9]+$/u.test(target.hostname) || target.pathname !== "/portal_control_test") {
      throw new Error("STREAM_HINT_DISPOSABLE_DATABASE_REQUIRED");
    }
    const options = { connectionString: target.toString(), max: 2, connectionTimeoutMillis: 1_000,
      query_timeout: 1_000, statement_timeout: 1_000, application_name: "TEST_ONLY-stream-revocation-hints" };
    const a = new Pool(options), b = new Pool(options), local = new StreamRevocationHints(), remote = new StreamRevocationHints();
    a.on("error", () => undefined); b.on("error", () => undefined);
    const sender = new PgStreamRevocationBridge(a, local), receiver = new PgStreamRevocationBridge(b, remote);
    const subject = `TEST_ONLY:${randomUUID()}`, localEvents: string[] = [], remoteEvents: string[] = [];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const received = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("STREAM_HINT_DISPOSABLE_DELIVERY_TIMEOUT")), 2_500);
      remote.subscribe({ sessionEnded: id => { remoteEvents.push(id); if (id === subject) resolve(); },
        userAuthorityChanged: () => undefined });
    });
    // No unhandled rejection if startup/CPU scheduling outlasts the waiter.
    void received.catch(() => undefined);
    local.subscribe({ sessionEnded: id => { localEvents.push(id); }, userAuthorityChanged: () => undefined });
    try {
      await Promise.all([sender.start(), receiver.start()]);
      expect(sender.diagnostics().listening).toBe(true);
      expect(receiver.diagnostics().listening).toBe(true);
      local.sessionEnded(subject);
      await received;
      // Allow a bounded extra event-loop turn for an accidental re-publish;
      // this test is one tiny notification, never a performance/load proof.
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(localEvents).toEqual([subject]);
      expect(remoteEvents).toEqual([subject]);
      expect(sender.diagnostics()).toMatchObject({ published: 1, received: 0, pending: 0 });
      expect(receiver.diagnostics()).toMatchObject({ published: 0, received: 1, pending: 0 });
    } finally {
      if (timeout) clearTimeout(timeout);
      await Promise.all([sender.close(), receiver.close()]);
      await Promise.all([a.end(), b.end()]);
    }
    expect(a.totalCount).toBe(0); expect(b.totalCount).toBe(0);
  });
});
