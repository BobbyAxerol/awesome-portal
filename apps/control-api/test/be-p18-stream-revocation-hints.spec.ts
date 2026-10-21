/**
 * BE-P18 / ELP2-09: the revoke HINT that closes the Fleet realtime "revokeSession is not wired" gap. TEST_ONLY, no PostgreSQL, no
 * timer left running: the REAL `AlphaFleetRealtimeService`, REAL `ScopedReplayHub`, REAL cursor codec, REAL notice source and the REAL
 * `StreamRevocationHints`, over in-memory doubles for the two I/O edges (publication log, authority port); the REAL `AuthService.logout`
 * and `AdminService` over a scripted pool.
 *
 * What is proved: a hint ends the matching stream within the same tick with the terminal frame and leaves every other stream alone; no
 * byte follows it; every counter returns to zero; a failing hint (listener or hub) never fails the caller and never decides authority
 * (the per-poll fence still ends the stream); a hint is not a denylist (a fresh, authorized open afterwards works); nothing secret or
 * identifying reaches the wire or the diagnostics; the hints are bounded. The wiring tests prove that logout, admin revoke/disable/reset
 * and the session retirement hint AFTER their own commit, only on success, and that a throwing hint never breaks them.
 * The SQL-backed halves are in be-p18-stream-revocation-hints.pg.spec.ts (written, NOT run by the author).
 */
import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { STREAM_HINT_MAX_ID_LENGTH, STREAM_HINT_MAX_LISTENERS, StreamRevocationHints, hintSessionEnded, hintUserAuthorityChanged,
  type StreamRevocationListener } from "../src/auth/stream-revocation-hints";
import { AlphaFleetRealtimeService, type AlphaFleetRealtimeOptions, type FleetStreamSink } from "../src/execution-v2/alpha-fleet-realtime.service";
import type { AlphaFleetAuthority, FleetStreamEligibility } from "../src/execution-v2/alpha-fleet-realtime.authority";
import type { FleetHead, FleetRevisionLog, FleetRevisionRow } from "../src/execution-v2/alpha-fleet-realtime.source";
import { ExecutionReadScopeError, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { scopedRealtimeFrame, type ScopedRealtimeFrame } from "../src/execution-v2/realtime.contract";
import { ScopedReplayCursorCodec, ScopedReplayError } from "../src/execution-v2/scoped-replay-cursor";

const WS = "TEST_ONLY:workspace", PROFILE = "TEST_ONLY:paper", EPOCH = "TEST_ONLY:epoch-1", GEN = "TEST_ONLY:g1", CAT = "sha256:" + "a1".repeat(32);
const SECRET = "TEST_ONLY-never-a-runtime-key-".repeat(3);
const TTL = 300_000;

/* ── doubles (same shape as be-p16-alpha-fleet-realtime.spec.ts; the identity here also binds the session, like the real fingerprint) ─ */
class Log implements FleetRevisionLog {
  rows: FleetRevisionRow[] = [];
  gate: Promise<void> | null = null;
  constructor(count = 3) { for (let i = 1; i <= count; i++) this.publish(); }
  publish() { const n = this.rows.length + 1; this.rows.push({ revision: `TEST_ONLY:fleet-r${n}`, source_sequence: String(n), created_at_ms: 1_800_000_000_000 + n }); }
  async head(): Promise<FleetHead | null> {
    if (this.gate) await this.gate;
    const last = this.rows.at(-1)!;
    return { revision: last.revision, source_epoch: EPOCH, source_sequence: last.source_sequence, projection_generation: GEN,
      payload_digest: "sha256:" + "d4".repeat(32), catalogue_digest: CAT };
  }
  async revisionQualification() { return "SOURCE_VERIFIED"; }
  async revisionMetadataAfter(_w: string, _e: string, _p: string, epoch: string, generation: string, after: string, limit: number) {
    if (epoch !== EPOCH || generation !== GEN) return [];
    return this.rows.filter(r => BigInt(r.source_sequence) > BigInt(after)).slice(0, limit);
  }
}
interface AuthState { revoked: Set<string>; writes: number; }
const hex = (text: string) => `sha256:${Buffer.from(text).toString("hex").padEnd(64, "0").slice(0, 64)}`;
function authority(state: AuthState): AlphaFleetAuthority {
  const stream: FleetStreamEligibility = { eligible: true };
  const identity = (p: ReadScopePrincipal) => hex(`${p.user.userId}|${p.session.sessionId}`);
  const denied = (p: ReadScopePrincipal) => state.revoked.has(p.session.sessionId) || state.revoked.has(p.user.userId);
  return {
    async snapshot(principal, _env, _profile, _dataset, read) {
      if (denied(principal)) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const value = await read();
      return { identity: identity(principal), named_scope_fingerprint: hex(`named|${identity(principal)}`), stream, policy_revision: "TEST_ONLY:policy",
        field_policy_revision: "TEST_ONLY:fields", value };
    },
    async openStream(principal, _env, _profile, _dataset, currentDataset) {
      if (denied(principal)) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const current = async () => {
        if (denied(principal)) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
        await currentDataset();
        return identity(principal);
      };
      return { identity: identity(principal), policy_revision: "TEST_ONLY:policy", field_policy_revision: "TEST_ONLY:fields", guard: {
        currentIdentity: current,
        write: async (expected, send) => {
          if (await current() !== expected) throw new ScopedReplayError("SCOPE_CHANGED");
          state.writes++;
          return send();
        } } };
    },
  };
}
class Sink implements FleetStreamSink {
  chunks: string[] = []; ended = false; gone = false; private listeners: Array<() => void> = [];
  write(chunk: string) { if (this.closed()) return false; this.chunks.push(chunk); return true; }
  end() { this.ended = true; }
  onClose(listener: () => void) { this.listeners.push(listener); }
  closed() { return this.ended || this.gone; }
  get frames(): ScopedRealtimeFrame[] {
    return this.chunks.map(chunk => scopedRealtimeFrame.parse(JSON.parse(chunk.split("\n").find(l => l.startsWith("data: "))!.slice(6))));
  }
  get events() { return this.frames.map(f => [f.event_type, f.reason_code]); }
}

const principal = (user = "u1", session = "s1"): ReadScopePrincipal => ({ user: { userId: user } as never, session: { sessionId: session, sessionVersion: 1 } as never, workspaceId: WS });
const config = { EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE, EXECUTION_EDGE_SANDBOX_PROFILE_ID: undefined, EXECUTION_EDGE_LIVE_PROFILE_ID: undefined, QUERY_CURSOR_TTL_SECONDS: 300 };
const limits = () => ({ maximumClients: 8, maximumEntriesPerClient: 8, maximumFrameBytes: 16384, maximumClientBytes: 65536, maximumTotalBytes: 1_048_576,
  maximumNoticesPerRead: 50, readTimeoutMs: 1000 });

const services: AlphaFleetRealtimeService[] = [];
function harness(hints = new StreamRevocationHints()) {
  const log = new Log();
  const state: AuthState = { revoked: new Set(), writes: 0 };
  const codec = new ScopedReplayCursorCodec("t1", { t1: SECRET }, TTL, () => 1_800_000_100_000);
  const options: AlphaFleetRealtimeOptions = { authority: authority(state), log, codec, limits: limits(), pollMs: 60_000, streamsPerSession: 3,
    replayWindowMs: TTL, now: () => 1_800_000_100_000, hints };
  const service = new AlphaFleetRealtimeService(null as never, null as never, config as never, options);
  services.push(service);
  const cursorOf = async (p: ReadScopePrincipal) => {
    const s = await service.snapshot(p, { environment: "paper" });
    if (s.stream.state !== "AVAILABLE") throw new Error("no stream");
    return s.stream.resume_cursor;
  };
  const open = async (p: ReadScopePrincipal, token?: string) => {
    const sink = new Sink();
    await service.openStream(p, { environment: "paper", cursor: token ?? await cursorOf(p) }, undefined, () => sink);
    await service.settle();
    return sink;
  };
  const idle = { clients: 0, sessions: 0, tracked_identities: 0, queued_bytes: 0, timer: false };
  return { log, state, service, hints, open, cursorOf, idle };
}
afterEach(async () => { for (const s of services.splice(0)) await s.onApplicationShutdown(); });

/* ═══════════════════════════ the hint carrier ═══════════════════════════ */
describe("BE-P18 StreamRevocationHints: total, bounded, id-free", () => {
  it("delivers to every listener, survives a throwing and a rejecting one, and counts them", async () => {
    const hints = new StreamRevocationHints();
    const seen: string[] = [];
    hints.subscribe({ sessionEnded: () => { throw new Error("TEST_ONLY listener broke"); }, userAuthorityChanged: () => { throw new Error("TEST_ONLY listener broke"); } });
    hints.subscribe({ sessionEnded: () => Promise.reject(new Error("TEST_ONLY async broke")) as never, userAuthorityChanged: () => undefined });
    hints.subscribe({ sessionEnded: id => { seen.push(`s:${id}`); }, userAuthorityChanged: id => { seen.push(`u:${id}`); } });
    expect(() => hints.sessionEnded("s1")).not.toThrow();
    expect(() => hints.userAuthorityChanged("u1")).not.toThrow();
    await Promise.resolve(); await Promise.resolve();
    expect(seen).toEqual(["s:s1", "u:u1"]);
    expect(hints.diagnostics()).toMatchObject({ listeners: 3, listener_failures: 3 });
  });
  it("drops an id of the wrong type, empty or over the bound, and never calls a listener with it", () => {
    const hints = new StreamRevocationHints();
    const listener: StreamRevocationListener = { sessionEnded: vi.fn(), userAuthorityChanged: vi.fn() };
    hints.subscribe(listener);
    for (const bad of [undefined, null, 7, {}, "", "x".repeat(STREAM_HINT_MAX_ID_LENGTH + 1)]) { hints.sessionEnded(bad); hints.userAuthorityChanged(bad); }
    expect(listener.sessionEnded).not.toHaveBeenCalled();
    expect(listener.userAuthorityChanged).not.toHaveBeenCalled();
    expect(hints.diagnostics().dropped_ids).toBe(12);
    hints.sessionEnded("x".repeat(STREAM_HINT_MAX_ID_LENGTH));
    expect(listener.sessionEnded).toHaveBeenCalledTimes(1);
  });
  it("refuses listeners over the bound (counted, not thrown), supports unsubscribe, and stores no id", () => {
    const hints = new StreamRevocationHints();
    const make = (): StreamRevocationListener => ({ sessionEnded: vi.fn(), userAuthorityChanged: vi.fn() });
    const offs = Array.from({ length: STREAM_HINT_MAX_LISTENERS }, () => hints.subscribe(make()));
    const refused = make();
    expect(() => hints.subscribe(refused)).not.toThrow();
    hints.sessionEnded("TEST_ONLY-session-id-never-stored");
    expect(refused.sessionEnded).not.toHaveBeenCalled();
    expect(hints.diagnostics()).toMatchObject({ listeners: STREAM_HINT_MAX_LISTENERS, refused_subscriptions: 1 });
    offs[0]!();
    expect(hints.diagnostics().listeners).toBe(STREAM_HINT_MAX_LISTENERS - 1);
    expect(JSON.stringify(hints.diagnostics())).not.toContain("never-stored");
    const same = make();
    hints.subscribe(same); hints.subscribe(same);                       // the same listener is never held twice
    expect(hints.diagnostics().listeners).toBe(STREAM_HINT_MAX_LISTENERS);
  });
  it("the carrier helpers accept a stub without hints, a null carrier and a hints object that throws", () => {
    expect(() => hintSessionEnded({}, "s1")).not.toThrow();
    expect(() => hintUserAuthorityChanged(null, "u1")).not.toThrow();
    expect(() => hintSessionEnded({ streamHints: { sessionEnded: () => { throw new Error("TEST_ONLY"); } } }, "s1")).not.toThrow();
    expect(() => hintUserAuthorityChanged({ streamHints: { userAuthorityChanged: () => { throw new Error("TEST_ONLY"); } } }, "u1")).not.toThrow();
  });
});

/* ═══════════════════════════ the real service + real hub ═══════════════════════════ */
describe("BE-P18 the hint ends open Fleet streams in the same tick", () => {
  it("a session hint writes the terminal frame synchronously, ends the response, and every counter returns to zero", async () => {
    const h = harness();
    const mine = await h.open(principal("u1", "s1"));
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1, tracked_identities: 1, timer: true });
    mine.chunks.length = 0;
    h.hints.sessionEnded("s1");                                     // no await between the hint and the assertions: the same tick
    expect(mine.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(mine.frames[0]).toMatchObject({ terminal: true, resume_cursor: null, quality: null });
    expect(mine.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject(h.idle);
  });
  it("no byte follows the terminal frame: a later publication and poll write nothing and no authority write happens", async () => {
    const h = harness();
    const mine = await h.open(principal());
    mine.chunks.length = 0;
    h.hints.sessionEnded("s1");
    const bytes = mine.chunks.join("").length, writes = h.state.writes;
    h.hints.sessionEnded("s1"); h.hints.userAuthorityChanged("u1");  // repeats are no-ops
    h.log.publish();
    await h.service.pollOnce();
    expect(mine.chunks.join("").length).toBe(bytes);
    expect(mine.events).toHaveLength(1);
    expect(h.state.writes).toBe(writes);
    expect(h.service.diagnostics()).toMatchObject(h.idle);
  });
  it("another session, even of the same user, and another user are untouched and still receive notices", async () => {
    const h = harness();
    const mine = await h.open(principal("u1", "s1")), sibling = await h.open(principal("u1", "s2")), other = await h.open(principal("u2", "s3"));
    for (const s of [mine, sibling, other]) s.chunks.length = 0;
    h.hints.sessionEnded("s1");
    expect(mine.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(sibling.chunks).toEqual([]);
    expect(other.chunks).toEqual([]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 2, sessions: 2, tracked_identities: 2 });
    h.hints.sessionEnded("TEST_ONLY-nobody-holds-this");              // an unknown id is a no-op
    h.log.publish();
    await h.service.pollOnce();
    expect(sibling.frames.map(f => f.event_type)).toEqual(["revalidate"]);
    expect(other.frames.map(f => f.event_type)).toEqual(["revalidate"]);
    expect(mine.events).toHaveLength(1);
  });
  it("a user hint ends every session of that user (all their tabs) and nobody else", async () => {
    const h = harness();
    const a = await h.open(principal("u1", "s1")), b = await h.open(principal("u1", "s2")), b2 = await h.open(principal("u1", "s2")), c = await h.open(principal("u2", "s3"));
    for (const s of [a, b, b2, c]) s.chunks.length = 0;
    h.hints.userAuthorityChanged("u1");
    for (const s of [a, b, b2]) expect(s.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(c.chunks).toEqual([]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1, tracked_identities: 1 });
    h.hints.userAuthorityChanged("u2");
    expect(c.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(h.service.diagnostics()).toMatchObject(h.idle);
  });
  it("a hint that lands while the open is still being authorized ends it before any frame", async () => {
    const h = harness();
    const token = await h.cursorOf(principal());
    let release!: () => void;
    h.log.gate = new Promise<void>(resolve => { release = resolve; });
    const sink = new Sink();
    const opening = h.service.openStream(principal(), { environment: "paper", cursor: token }, undefined, () => sink);
    await Promise.resolve();
    h.hints.sessionEnded("s1");                                       // nothing is subscribed yet: this can only mark the pending open
    expect(sink.chunks).toEqual([]);
    release();
    await opening; await h.service.settle();
    expect(sink.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(h.service.diagnostics()).toMatchObject(h.idle);
  });
  it("a hint is not a denylist: it stores nothing, so an authorized reconnect afterwards streams normally", async () => {
    const h = harness();
    const first = await h.open(principal());
    h.hints.sessionEnded("s1");
    expect(first.ended).toBe(true);
    const again = await h.open(principal());
    expect(again.frames.filter(f => f.terminal)).toEqual([]);          // open, no terminal frame
    again.chunks.length = 0;
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1 });
    h.log.publish();
    await h.service.pollOnce();
    expect(again.frames.map(f => f.event_type)).toEqual(["revalidate"]);
  });
  it("authority never depends on the hint: with the hint failing (listener or hub), the per-poll fence still ends the stream", async () => {
    const hints = new StreamRevocationHints();
    hints.subscribe({ sessionEnded: () => { throw new Error("TEST_ONLY hint broke"); }, userAuthorityChanged: () => { throw new Error("TEST_ONLY hint broke"); } });
    const h = harness(hints);
    const mine = await h.open(principal());
    mine.chunks.length = 0;
    // The hub itself fails to purge: the service swallows it, the caller never sees it, the stream is still open ...
    const hub = (h.service as unknown as { hubValue: { revoke: (p: unknown) => void } }).hubValue;
    vi.spyOn(hub, "revoke").mockImplementation(() => { throw new Error("TEST_ONLY hub broke"); });
    expect(() => hints.sessionEnded("s1")).not.toThrow();
    expect(() => h.service.revokeSession("s1")).not.toThrow();
    expect(() => h.service.revokeUser("u1")).not.toThrow();
    expect(mine.chunks).toEqual([]);
    // ... and the authoritative revoke is caught by the next poll, with nothing delivered under revoked authority.
    h.state.revoked.add("s1");
    h.log.publish();
    const writes = h.state.writes;
    await h.service.pollOnce();
    expect(mine.events).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(h.state.writes).toBe(writes);
    expect(h.service.diagnostics()).toMatchObject(h.idle);
  });
  it("nothing identifying reaches the wire or the diagnostics, and the service unsubscribes on shutdown", async () => {
    const h = harness();
    const mine = await h.open(principal("TEST_ONLY-user-secretish", "TEST_ONLY-session-secretish"));
    mine.chunks.length = 0;
    h.hints.sessionEnded("TEST_ONLY-session-secretish");
    const wire = mine.chunks.join("");
    expect(wire).not.toContain("secretish");
    expect(JSON.stringify(h.hints.diagnostics())).not.toContain("secretish");
    expect(JSON.stringify(h.service.diagnostics())).not.toContain("secretish");
    expect(h.hints.diagnostics().listeners).toBe(1);
    await h.service.onApplicationShutdown();
    expect(h.hints.diagnostics().listeners).toBe(0);
  });
  it("the service takes its hints from the AuthService when no override is given", async () => {
    const carrier = { streamHints: new StreamRevocationHints() };
    const log = new Log(), state: AuthState = { revoked: new Set(), writes: 0 };
    const codec = new ScopedReplayCursorCodec("t1", { t1: SECRET }, TTL, () => 1_800_000_100_000);
    const service = new AlphaFleetRealtimeService(null as never, null as never, config as never,
      { authority: authority(state), log, codec, limits: limits(), pollMs: 60_000, replayWindowMs: TTL, now: () => 1_800_000_100_000 }, carrier);
    services.push(service);
    expect(carrier.streamHints.diagnostics().listeners).toBe(1);
  });
});

/* ═══════════════════════════ the revoking paths ═══════════════════════════ */
const SESSION_ROW = { session_id: "sess-1", session_token_hash: "h", user_id: "user-1", access_subject: null, access_token_expires_at: null, state: "ACTIVE",
  csrf_secret_hash: "c", activation_id: null, session_version: 3, created_at: new Date(0), last_seen_at: new Date(0), idle_expires_at: new Date(1e13),
  absolute_expires_at: new Date(1e13), revoked_at: null, revoke_reason: null };
function scriptedPool(order: string[], opts: { commitFails?: boolean } = {}) {
  const client = {
    query: async (sql: string) => {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q === "COMMIT") { if (opts.commitFails) throw new Error("TEST_ONLY commit lost"); order.push("COMMIT"); }
      if (q.startsWith("UPDATE auth_sessions SET state = 'REVOKED'")) order.push("UPDATE_SESSION");
      if (q.startsWith("SELECT session_id FROM auth_sessions")) return { rows: [{ session_id: SESSION_ROW.session_id }], rowCount: 1 };
      if (q.startsWith("SELECT state FROM auth_sessions")) return { rows: [{ state: "ACTIVE" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };
  return { connect: async () => client, query: async (sql: string) => sql.includes("session_token_hash = $1") ? { rows: [SESSION_ROW], rowCount: 1 } : { rows: [], rowCount: 0 } };
}
const authService = (pool: unknown) => new AuthService(pool as never, { AUTH_MODE: "dev" } as never, new Argon2CredentialService({ memoryKib: 1024, iterations: 1, parallelism: 1 }));
const recorder = (auth: { streamHints: StreamRevocationHints }, order: string[]) => {
  auth.streamHints.subscribe({ sessionEnded: id => { order.push(`hint:session:${id}`); }, userAuthorityChanged: id => { order.push(`hint:user:${id}`); } });
};

describe("BE-P18 logout hints its session after the commit, only on success", () => {
  it("revokes, commits, and only then hints that exact session id", async () => {
    const order: string[] = [], auth = authService(scriptedPool(order));
    recorder(auth, order);
    await auth.logout("TEST_ONLY-session-token");
    expect(order).toEqual(["UPDATE_SESSION", "COMMIT", "hint:session:sess-1"]);
  });
  it("a lost COMMIT is a failed logout and sends no hint (the hint never claims a revoke that did not happen)", async () => {
    const order: string[] = [], auth = authService(scriptedPool(order, { commitFails: true }));
    recorder(auth, order);
    await expect(auth.logout("TEST_ONLY-session-token")).rejects.toThrow("TEST_ONLY commit lost");
    expect(order).toEqual(["UPDATE_SESSION"]);
  });
  it("a throwing hint listener never fails the logout", async () => {
    const order: string[] = [], auth = authService(scriptedPool(order));
    auth.streamHints.subscribe({ sessionEnded: () => { throw new Error("TEST_ONLY listener broke"); }, userAuthorityChanged: () => undefined });
    await expect(auth.logout("TEST_ONLY-session-token")).resolves.toBeUndefined();
    expect(order).toEqual(["UPDATE_SESSION", "COMMIT"]);
    expect(auth.streamHints.diagnostics().listener_failures).toBe(1);
  });
  it("a missing token or an unknown session hints nothing", async () => {
    const order: string[] = [], pool = scriptedPool(order), auth = authService({ ...pool, query: async () => ({ rows: [], rowCount: 0 }) });
    recorder(auth, order);
    await auth.logout(undefined);
    await auth.logout("TEST_ONLY-unknown-token");
    expect(order).toEqual([]);
  });
  it("retiring an invalid session hints it even when the bookkeeping write is deferred by the drain guard, and not when it truly fails", async () => {
    const order: string[] = [], auth = authService(scriptedPool(order));
    recorder(auth, order);
    const retire = (auth as unknown as { retireInvalidSession(id: string, reason: string): Promise<void> }).retireInvalidSession.bind(auth);
    const drain = Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"), { code: "P0001" });
    (auth as unknown as { sessions: { revokeSession: () => Promise<void> } }).sessions = { revokeSession: async () => { throw drain; } };
    await expect(retire("sess-9", "identity_or_generation_revoked")).resolves.toBeUndefined();
    expect(order).toEqual(["hint:session:sess-9"]);
    (auth as unknown as { sessions: { revokeSession: () => Promise<void> } }).sessions = { revokeSession: async () => { throw new Error("TEST_ONLY storage down"); } };
    await expect(retire("sess-10", "identity_or_generation_revoked")).rejects.toThrow("TEST_ONLY storage down");
    // Invalidity was already established by identity/generation, so the hint is still correct on that failure too: it only closes streams.
    expect(order).toEqual(["hint:session:sess-9", "hint:session:sess-10"]);
  });
});

describe("BE-P18 admin revoke, disable and reset hint the user after the sessions are revoked", () => {
  function admin(order: string[], opts: { auditFails?: boolean; missing?: boolean } = {}) {
    const streamHints = new StreamRevocationHints();
    const auth = {
      streamHints,
      users: { findById: async () => opts.missing ? null : { userId: "user-1" }, update: async () => { order.push("UPDATE_USER"); } },
      sessions: { revokeAllForUser: async (_id: string, reason: string) => { order.push(`REVOKE_ALL:${reason}`); } },
      audit: { record: async () => { if (opts.auditFails) throw new Error("TEST_ONLY audit down"); order.push("AUDIT"); } },
    } as unknown as AuthService;
    streamHints.subscribe({ sessionEnded: () => undefined, userAuthorityChanged: id => { order.push(`hint:user:${id}`); } });
    return new AdminService({ query: async () => ({ rows: [], rowCount: 0 }) } as never, {} as never, auth);
  }
  it("revokeSessions hints right after the revoke statement, before the audit row", async () => {
    const order: string[] = [];
    await admin(order).revokeSessions("user-1");
    expect(order).toEqual(["REVOKE_ALL:admin_revoke", "hint:user:user-1", "AUDIT"]);
  });
  it("an audit failure cannot leave the streams open, and an unknown user hints nothing", async () => {
    const order: string[] = [];
    await expect(admin(order, { auditFails: true }).revokeSessions("user-1")).rejects.toThrow("TEST_ONLY audit down");
    expect(order).toEqual(["REVOKE_ALL:admin_revoke", "hint:user:user-1"]);
    const none: string[] = [];
    await expect(admin(none, { missing: true }).revokeSessions("user-2")).rejects.toThrow("user not found");
    expect(none).toEqual([]);
  });
  it("disable hints after its revoke", async () => {
    const order: string[] = [];
    await admin(order).disable("user-1");
    expect(order).toEqual(["UPDATE_USER", "REVOKE_ALL:admin_disable", "hint:user:user-1", "AUDIT"]);
  });
});
