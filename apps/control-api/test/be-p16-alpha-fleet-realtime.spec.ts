/**
 * BE-P16 / ELP2-09 `alpha_fleet_overview`: the named snapshot and the SSE stream. Pure component proofs: the REAL service, REAL
 * `ScopedReplayHub`, REAL encrypted cursor codec and REAL notice source over in-memory doubles for the two I/O edges (the
 * publication log, the authority port). No PostgreSQL, no source, no timer left running. Everything is TEST_ONLY: a notice here is a
 * publication-revision counter, never a financial fact. The SQL and the minted-scope authority are in the PG spec (not run by the author).
 */
import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { alphaFleetRealtimeSnapshot, serializeFleetFrame } from "../src/execution-v2/alpha-fleet-realtime.contract";
import { ManagerFleetNoticeSource, decodeFleetCoordinate, encodeFleetCoordinate, fleetBaseline,
  type FleetHead, type FleetRevisionLog, type FleetRevisionRow } from "../src/execution-v2/alpha-fleet-realtime.source";
import { AlphaFleetRealtimeService, type AlphaFleetRealtimeOptions, type FleetStreamSink } from "../src/execution-v2/alpha-fleet-realtime.service";
import type { AlphaFleetAuthority, FleetStreamEligibility } from "../src/execution-v2/alpha-fleet-realtime.authority";
import { ExecutionReadScopeError, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { scopedRealtimeFrame, type ScopedRealtimeFrame, type ScopedReplayBinding } from "../src/execution-v2/realtime.contract";
import { ScopedReplayCursorCodec, ScopedReplayError } from "../src/execution-v2/scoped-replay-cursor";
import { AlphaFleetRealtimeController } from "../src/execution-v2/alpha-fleet-realtime.controller";
import { Reflector } from "@nestjs/core";
import { managerLineageRevision } from "../src/execution-v2/manager-model";

const WS = "TEST_ONLY:workspace", PROFILE = "TEST_ONLY:paper", EPOCH = "TEST_ONLY:epoch-1", GEN = "TEST_ONLY:g1", CAT = "sha256:" + "a1".repeat(32);
const SECRET = "TEST_ONLY-never-a-runtime-key-".repeat(3);
const TTL = 300_000;

/* ── doubles ──────────────────────────────────────────────────────────────────────────────── */
class Log implements FleetRevisionLog {
  rows: FleetRevisionRow[] = [];
  epoch = EPOCH; generation = GEN; catalogue = CAT;
  qualification: string | null = "SOURCE_VERIFIED";
  headCalls = 0; rowCalls = 0; gate: Promise<void> | null = null; gone = false;
  constructor(count = 7) { for (let i = 1; i <= count; i++) this.publish(); }
  publish() { const n = this.rows.length + 1; this.rows.push({ revision: `TEST_ONLY:fleet-r${n}`, source_sequence: String(n), created_at_ms: 1_800_000_000_000 + n, qualification: "SOURCE_VERIFIED" }); }
  async head(): Promise<FleetHead | null> {
    this.headCalls++;
    if (this.gate) await this.gate;
    const last = this.rows.at(-1);
    if (this.gone || !last) return null;
    return { revision: last.revision, source_epoch: this.epoch, source_sequence: last.source_sequence, projection_generation: this.generation,
      payload_digest: "sha256:" + "d4".repeat(32), catalogue_digest: this.catalogue };
  }
  async revisionQualification() { return this.qualification; }
  async revisionMetadataAfter(_w: string, _e: string, _p: string, epoch: string, generation: string, after: string, limit: number) {
    this.rowCalls++;
    if (epoch !== this.epoch || generation !== this.generation) return [];
    return this.rows.filter(r => BigInt(r.source_sequence) > BigInt(after)).slice(0, limit);
  }
}
interface AuthState { stream: FleetStreamEligibility; revoked: boolean; denyOpen: boolean; writes: number; flip: boolean; }
/** Stands in for the alpha.read scope fingerprint of the named read; the real derivation is proved in be-p17-fleet-pairing.spec.ts. */
const namedScope = (p: ReadScopePrincipal) => `sha256:${(p.user.userId + "a".repeat(64)).slice(0, 64).replace(/[^a-f0-9]/g, "c")}`;
function authority(log: Log, state: AuthState): AlphaFleetAuthority {
  const identity = (p: ReadScopePrincipal) => `sha256:${(p.user.userId + "0".repeat(64)).slice(0, 64).replace(/[^a-f0-9]/g, "e")}`;
  return {
    async snapshot(principal, _env, _profile, _dataset, read) {
      if (state.revoked) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const value = await read();
      return { identity: identity(principal), named_scope_fingerprint: namedScope(principal), stream: state.stream, policy_revision: state.stream.eligible ? "TEST_ONLY:policy" : null,
        field_policy_revision: state.stream.eligible ? "TEST_ONLY:fields" : null, value };
    },
    async openStream(principal, _env, _profile, _dataset, currentDataset) {
      if (state.denyOpen || state.revoked) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const current = async () => {
        if (state.revoked) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
        await currentDataset(); // the lineage fence, exactly as the real guard resolves a NEW scope per call
        return state.flip ? identity(principal) + "x" : identity(principal);
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
  chunks: string[] = []; ended = false; gone = false; backpressure = false; private listeners: Array<() => void> = [];
  write(chunk: string) { if (this.closed()) return false; this.chunks.push(chunk); return !this.backpressure; }
  end() { this.ended = true; }
  onClose(listener: () => void) { this.listeners.push(listener); }
  closed() { return this.ended || this.gone; }
  disconnect() { this.gone = true; for (const l of this.listeners.splice(0)) l(); }
  /** The SSE events a browser would parse. */
  get events() {
    return this.chunks.map(chunk => {
      const lines = chunk.split("\n");
      const id = lines.find(l => l.startsWith("id: "))?.slice(4) ?? null;
      const event = lines.find(l => l.startsWith("event: "))!.slice(7);
      const frame = scopedRealtimeFrame.parse(JSON.parse(lines.find(l => l.startsWith("data: "))!.slice(6)));
      return { id, event, frame };
    });
  }
  get frames(): ScopedRealtimeFrame[] { return this.events.map(e => e.frame); }
}

const principal = (user = "u1", session = "s1"): ReadScopePrincipal => ({ user: { userId: user } as never, session: { sessionId: session, sessionVersion: 1 } as never, workspaceId: WS });
const config = { EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE, EXECUTION_EDGE_SANDBOX_PROFILE_ID: undefined, EXECUTION_EDGE_LIVE_PROFILE_ID: undefined, QUERY_CURSOR_TTL_SECONDS: 300 };
const limits = (patch: Partial<NonNullable<AlphaFleetRealtimeOptions["limits"]>> = {}) => ({ maximumClients: 8, maximumEntriesPerClient: 8, maximumFrameBytes: 16384,
  maximumClientBytes: 65536, maximumTotalBytes: 1_048_576, maximumNoticesPerRead: 50, readTimeoutMs: 1000, ...patch });

const services: AlphaFleetRealtimeService[] = [];
function harness(opts: { count?: number; limits?: ReturnType<typeof limits>; streamsPerSession?: number; clock?: { now: number } } = {}) {
  const log = new Log(opts.count ?? 7);
  const state: AuthState = { stream: { eligible: true }, revoked: false, denyOpen: false, writes: 0, flip: false };
  const clock = opts.clock ?? { now: 1_800_000_100_000 };
  const codec = new ScopedReplayCursorCodec("t1", { t1: SECRET }, TTL, () => clock.now);
  const service = new AlphaFleetRealtimeService(null as never, null as never, config as never,
    { authority: authority(log, state), log, codec, limits: opts.limits ?? limits(), pollMs: 60_000, streamsPerSession: opts.streamsPerSession ?? 2,
      replayWindowMs: TTL, now: () => clock.now });
  services.push(service);
  const snapshot = (p = principal(), query: Record<string, unknown> = { environment: "paper" }) => service.snapshot(p, query);
  const open = async (token: string | undefined, p = principal(), query: Record<string, unknown> = { environment: "paper" }, header?: string) => {
    const sink = new Sink();
    await service.openStream(p, token !== undefined && header === undefined ? { ...query, cursor: token } : query, header ?? undefined, () => sink);
    await service.settle();
    return sink;
  };
  const cursorOf = async (p = principal()) => { const s = await snapshot(p); if (s.stream.state !== "AVAILABLE") throw new Error("no stream"); return s.stream.resume_cursor; };
  return { log, state, clock, codec, service, snapshot, open, cursorOf };
}
afterEach(async () => { for (const s of services.splice(0)) await s.onApplicationShutdown(); vi.useRealTimers(); });

/* ═══════════════════════════ snapshot ═══════════════════════════ */
describe("BE-P16 snapshot: the baseline barrier of the named fleet read", () => {
  it("names the publication it pairs with, the fingerprint and the bounds, and carries no figure", async () => {
    const h = harness();
    const s = await h.snapshot();
    expect(alphaFleetRealtimeSnapshot.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({ dataset: "alpha_fleet_overview", semantics: "NOTIFICATION_ONLY", workspace_id: WS, environment: "paper",
      baseline: { revision: "TEST_ONLY:fleet-r7", projection_generation: GEN, source_epoch: EPOCH, ordinal: "7", catalogue_digest: CAT },
      named_snapshot: { operation_id: "executionManagerFleetGetV1", path: "/api/v1/execution/manager/fleet", lineage_revision: managerLineageRevision(namedScope(principal()), "TEST_ONLY:fleet-r7") },
      source: { notice_origin: "PORTAL_PUBLICATION_REVISION", edge_notice_source: "NOT_COMMISSIONED", qualification: "SOURCE_VERIFIED" } });
    expect(s.stream).toMatchObject({ state: "AVAILABLE", stream_path: "/api/v1/execution/manager/fleet/stream", heartbeat_interval_ms: 60_000,
      replay_window_ms: TTL, max_frame_bytes: 16384, max_streams_per_session: 2 });
    expect(s.quality).toMatchObject({ completeness: "PARTIAL", freshness: "UNKNOWN", coverage: "AUTHORIZED_ONLY", source_as_of_ms: null, confidence: "PROVISIONAL" });
    const keys = (v: unknown): string[] => v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : [];
    expect(keys(s).filter(k => /balance|nav|pnl|amount|price|value|total|equity|fill|order|position/i.test(k))).toEqual([]);
    // The scope fingerprint is a digest, and the resume token is the encrypted opaque kind (not a parseable coordinate).
    expect(s.scope_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    const cursor = s.stream.state === "AVAILABLE" ? s.stream.resume_cursor : "";
    expect(cursor).toMatch(/^sr1\./); expect(cursor.length).toBeLessThanOrEqual(4096);
    expect(cursor).not.toContain("mf1");
  });
  it("reads only head metadata and the qualification scalar, never a payload document", async () => {
    const h = harness();
    await h.snapshot();
    expect(h.log.rowCalls).toBe(0);
  });
  it("two reads at one head issue distinct, equal-length tokens (randomized, fixed-length)", async () => {
    const h = harness();
    const [a, b] = [await h.cursorOf(), await h.cursorOf()];
    expect(a).not.toBe(b); expect(a.length).toBe(b.length);
  });
  it.each([
    ["a viewer without whole-fleet root authority", { eligible: false, reason: "WHOLE_FLEET_AUTHORITY_REQUIRED" }],
    ["a root viewer whose stream.subscribe is not granted", { eligible: false, reason: "STREAM_AUTHORITY_NOT_GRANTED" }],
  ] as const)("%s: the baseline is served and the stream is typed UNAVAILABLE with no cursor", async (_name, stream) => {
    const h = harness(); h.state.stream = stream as FleetStreamEligibility;
    const s = await h.snapshot();
    expect(s.stream).toEqual({ state: "UNAVAILABLE", reason_code: stream.reason, resume_cursor: null });
    expect(s.baseline.ordinal).toBe("7");
  });
  it("a full house is a typed capacity limit, not an error", async () => {
    const h = harness({ limits: limits({ maximumClients: 1 }) });
    await h.open(await h.cursorOf(), principal("u1", "s1"));
    expect((await h.snapshot(principal("u2", "s2"))).stream).toMatchObject({ state: "UNAVAILABLE", reason_code: "STREAM_CAPACITY_REACHED" });
  });
  it("refuses a TEST_ONLY revision, a missing head and an unconfigured profile (503), never a baseline", async () => {
    const h = harness(); h.log.qualification = "TEST_ONLY";
    await expect(h.snapshot()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    const none = harness({ count: 0 });
    await expect(none.snapshot()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    await expect(harness().snapshot(principal(), { environment: "live" })).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
  });
  it("refuses a barrier the publication moved under (409) instead of naming a revision it did not fence", async () => {
    const h = harness();
    const original = h.log.head.bind(h.log);
    let calls = 0;
    h.log.head = async () => { const head = await original(); if (++calls === 2) h.log.publish(); return calls >= 2 ? await original() : head; };
    await expect(h.snapshot()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it("is a closed query: unknown keys 400, another workspace 404, a revoked grant 404", async () => {
    const h = harness();
    for (const bad of [{ environment: "paper", ordinal: "1" }, { environment: "all" }, {}, { environment: "paper", cursor: "x" }])
      await expect(h.snapshot(principal(), bad), JSON.stringify(bad)).rejects.toMatchObject({ status: 400 });
    await expect(h.snapshot(principal(), { environment: "paper", workspace_id: "other" })).rejects.toMatchObject({ status: 404 });
    h.state.revoked = true;
    await expect(h.snapshot()).rejects.toMatchObject({ status: 404 });
  });
});

/* ═══════════════════════════ stream ═══════════════════════════ */
describe("BE-P16 stream: baseline, ordinals, notices, heartbeat, replay", () => {
  it("never starts at head: no cursor is one terminal resync frame and a closed response", async () => {
    const h = harness();
    const sink = await h.open(undefined);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ id: null, event: "resync_required", frame: { reason_code: "SNAPSHOT_REQUIRED", terminal: true, reconnect_required: true } });
    expect(sink.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, timer: false });
  });
  it("opens from the snapshot cursor: the first frame is a heartbeat that carries the next token and no quality", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    expect(sink.events).toHaveLength(1);
    const [first] = sink.events;
    expect(first.event).toBe("heartbeat");
    expect(first.id).toBe(first.frame.resume_cursor);
    expect(first.frame).toMatchObject({ quality: null, projection_generation: GEN, next_action: "RESUME_PORTAL_CURSOR", terminal: false });
    expect(sink.ended).toBe(false);
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1, timer: true });
  });
  it("a newer publication revision is ONE revalidate notice with no figure, then heartbeats again (no repeat)", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish();
    await h.service.pollOnce();
    expect(sink.events.map(e => e.event)).toEqual(["revalidate"]);
    const [notice] = sink.events;
    expect(notice.frame).toMatchObject({ next_action: "READ_NAMED_SNAPSHOT", reason_code: null, terminal: false, projection_generation: GEN });
    expect(notice.frame.quality).toMatchObject({ completeness: "PARTIAL", freshness: "UNKNOWN", source_as_of_ms: null, confidence: "PROVISIONAL" });
    expect(notice.frame.quality!.reasons).toEqual(["PORTAL_PUBLICATION_REVISION_NOTICE", "NO_EDGE_NOTICE_SOURCE", "SOURCE_FRESHNESS_NOT_ATTESTED"]);
    expect(Object.keys(notice.frame).sort()).toEqual(["event_type", "next_action", "projection_generation", "quality", "reason_code", "reconnect_required",
      "resume_cursor", "schema_version", "semantics", "terminal"]);
    expect(notice.id).toBe(notice.frame.resume_cursor);
    await h.service.pollOnce();
    expect(sink.events.map(e => e.event)).toEqual(["revalidate", "heartbeat"]);
  });
  it("advances by exactly one ordinal per revision, in order, and a reconnect with Last-Event-ID replays only what was missed", async () => {
    const h = harness();
    const first = await h.open(await h.cursorOf());
    first.chunks.length = 0;
    h.log.publish(); h.log.publish(); h.log.publish();            // ordinals 8, 9, 10
    await h.service.pollOnce();
    expect(first.events.map(e => e.event)).toEqual(["revalidate", "revalidate", "revalidate"]);
    const ids = first.events.map(e => e.id!);
    expect(new Set(ids).size).toBe(3);
    // The second token resumes after ordinal 9: exactly one notice (ordinal 10) is owed.
    const second = await h.open(undefined, principal("u1", "s9"), { environment: "paper" }, ids[1]);
    expect(second.events.map(e => e.event)).toEqual(["revalidate"]);
    expect(second.events[0].frame.quality!.portal_observed_at_ms).toBe(1_800_000_000_010);
  });
  it("Last-Event-ID takes precedence over ?cursor", async () => {
    const h = harness();
    const good = await h.cursorOf();
    const sink = new Sink();
    await h.service.openStream(principal(), { environment: "paper", cursor: "garbage" }, good, () => sink);
    await h.service.settle();
    expect(sink.events[0].event).toBe("heartbeat");
  });
  it("a gap in the dense ordinals is a resync, never a skipped revision", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish(); h.log.publish();
    h.log.rows.splice(h.log.rows.length - 2, 1);                 // retention loss: ordinal 8 vanished
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["resync_required", "SOURCE_COVERAGE_UNPROVED"]]);
    expect(sink.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, queued_bytes: 0, timer: false });
  });
  it("a head that moved backwards is a resync, not 'nothing new'", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.rows.pop();
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["resync_required", "SOURCE_COVERAGE_UNPROVED"]]);
  });
  it.each([
    ["a new source epoch", (l: Log) => { l.epoch = "TEST_ONLY:epoch-2"; }],
    ["a new projection generation", (l: Log) => { l.generation = "TEST_ONLY:g2"; }],
    ["a new catalogue", (l: Log) => { l.catalogue = "sha256:" + "b9".repeat(32); }],
  ])("%s is a resync with GENERATION_CHANGED, never an 'access revoked'", async (_name, change) => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    change(h.log);
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["resync_required", "GENERATION_CHANGED"]]);
    expect(sink.frames[0]).toMatchObject({ resume_cursor: null, projection_generation: null, quality: null });
  });
  it("refuses an expired, tampered, foreign-actor or foreign-environment token with one terminal resync", async () => {
    const h = harness();
    const token = await h.cursorOf();
    const reasons = async (sink: Sink) => sink.events.map(e => [e.event, e.frame.reason_code]);
    h.clock.now += TTL + 1;
    expect(await reasons(await h.open(token))).toEqual([["resync_required", "CURSOR_INVALID_OR_EXPIRED"]]);
    h.clock.now -= TTL + 1;
    const parts = token.split("."); parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    expect(await reasons(await h.open(parts.join(".")))).toEqual([["resync_required", "CURSOR_INVALID_OR_EXPIRED"]]);
    expect(await reasons(await h.open(token, principal("someone-else", "s2")))).toEqual([["resync_required", "CURSOR_INVALID_OR_EXPIRED"]]);
    // Same token, different environment: the binding differs, so does the profile.
    const sandboxed = new AlphaFleetRealtimeService(null as never, null as never, { ...config, EXECUTION_EDGE_SANDBOX_PROFILE_ID: "TEST_ONLY:sandbox" } as never,
      { authority: authority(h.log, h.state), log: h.log, codec: h.codec, limits: limits(), pollMs: 60_000, replayWindowMs: TTL, now: () => h.clock.now });
    services.push(sandboxed);
    const sink = new Sink();
    await sandboxed.openStream(principal(), { environment: "sandbox", cursor: token }, undefined, () => sink);
    expect(await reasons(sink)).toEqual([["resync_required", "CURSOR_INVALID_OR_EXPIRED"]]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0 });
  });
  it("a token whose scope changed since the snapshot (policy, grants, visible resources) cannot be resumed", async () => {
    const h = harness();
    const token = await h.cursorOf();
    // A different policy revision is part of the binding: simulate by an authority that now reports another one.
    const other = authority(h.log, h.state);
    const wrapped: AlphaFleetAuthority = { snapshot: other.snapshot.bind(other),
      openStream: async (...args) => ({ ...(await other.openStream(...args)), policy_revision: "TEST_ONLY:policy-2" }) };
    const service = new AlphaFleetRealtimeService(null as never, null as never, config as never,
      { authority: wrapped, log: h.log, codec: h.codec, limits: limits(), pollMs: 60_000, replayWindowMs: TTL, now: () => h.clock.now });
    services.push(service);
    const sink = new Sink();
    await service.openStream(principal(), { environment: "paper", cursor: token }, undefined, () => sink);
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["resync_required", "CURSOR_INVALID_OR_EXPIRED"]]);
  });
});

/* ═══════════════════════════ revoke recheck ═══════════════════════════ */
describe("BE-P16 revoke recheck: current authority before every read and every write", () => {
  it("a grant revoked after the open ends the stream on the next poll, before any further frame", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish();
    h.state.revoked = true;
    const writes = h.state.writes;
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(sink.frames[0]).toMatchObject({ resume_cursor: null, projection_generation: null, quality: null, next_action: "SIGN_IN_OR_REQUEST_ACCESS" });
    expect(h.state.writes).toBe(writes);                          // nothing was delivered under revoked authority
    expect(sink.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, tracked_identities: 0, timer: false });
  });
  it("authority that changes between the read fence and the write fence delivers nothing", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish();
    const writes = h.state.writes;
    h.state.flip = true;                                           // identity differs from the one the stream was bound to
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(h.state.writes).toBe(writes);
  });
  it("revokeSession purges that session's streams at once, without waiting for a poll, and leaves the others", async () => {
    const h = harness();
    const mine = await h.open(await h.cursorOf(principal("u1", "s1")), principal("u1", "s1"));
    const other = await h.open(await h.cursorOf(principal("u2", "s2")), principal("u2", "s2"));
    mine.chunks.length = 0; other.chunks.length = 0;
    h.service.revokeSession("s1");
    expect(mine.events.map(e => [e.event, e.frame.reason_code])).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(other.events).toEqual([]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1, tracked_identities: 1 });
  });
  it("an open without current authority is a terminal frame (an EventSource cannot read a 404 body), and holds no slot", async () => {
    const h = harness();
    const token = await h.cursorOf();
    h.state.denyOpen = true;
    const sink = await h.open(token);
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["access_revoked", "ACCESS_CHANGED"]]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0 });
  });
});

/* ═══════════════════════════ caps and product-wide eviction ═══════════════════════════ */
describe("BE-P16 caps: every bound is enforced and every exit releases everything", () => {
  it.each(["TEST_ONLY", null, "UNKNOWN"])("does not stream across an unqualified intermediate revision (%s)", async qualification => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish(); h.log.rows.at(-1)!.qualification = qualification;
    h.log.publish();
    h.log.rowCalls = 0;
    await h.service.pollOnce();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["resync_required", "SOURCE_COVERAGE_UNPROVED"]]);
    expect(h.log.rowCalls).toBe(1);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, timer: false });
  });
  it("streams per session: the next open is a terminal RECONNECT_LIMIT, and a closed stream frees its slot", async () => {
    const h = harness({ streamsPerSession: 2 });
    const a = await h.open(await h.cursorOf()), b = await h.open(await h.cursorOf());
    const c = await h.open(await h.cursorOf());
    expect(c.events.map(e => [e.event, e.frame.reason_code])).toEqual([["unavailable", "RECONNECT_LIMIT"]]);
    expect(c.frames[0]).toMatchObject({ next_action: "WAIT", terminal: true, reconnect_required: false });
    expect(h.service.diagnostics()).toMatchObject({ clients: 2, sessions: 1 });
    a.disconnect();
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1 });
    const d = await h.open(await h.cursorOf());
    expect(d.events[0].event).toBe("heartbeat");
    void b;
  });
  it("concurrent opens of one session cannot all pass the cap", async () => {
    const h = harness({ streamsPerSession: 2 });
    const tokens = [await h.cursorOf(), await h.cursorOf(), await h.cursorOf(), await h.cursorOf()];
    const sinks = tokens.map(() => new Sink());
    await Promise.all(tokens.map((token, i) => h.service.openStream(principal(), { environment: "paper", cursor: token }, undefined, () => sinks[i])));
    await h.service.settle();
    const live = sinks.filter(s => !s.ended);
    expect(live).toHaveLength(2);
    expect(sinks.filter(s => s.ended).every(s => s.events[0].frame.reason_code === "RECONNECT_LIMIT")).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 2, sessions: 1 });
  });
  it("the whole product is bounded: client N+1 of any session is refused by the shared Hub", async () => {
    const h = harness({ limits: limits({ maximumClients: 2 }), streamsPerSession: 4 });
    const tokens = [await h.cursorOf(principal("u1", "s1")), await h.cursorOf(principal("u2", "s2")), await h.cursorOf(principal("u3", "s3"))];
    await h.open(tokens[0], principal("u1", "s1"));
    await h.open(tokens[1], principal("u2", "s2"));
    // The snapshot itself says so once the house is full (see the snapshot suite); a token minted earlier is still refused by the Hub.
    const refused = await h.open(tokens[2], principal("u3", "s3"));
    expect(refused.events.map(e => [e.event, e.frame.reason_code])).toEqual([["unavailable", "RECONNECT_LIMIT"]]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 2, sessions: 2 });
  });
  it("a slow client is evicted with SLOW_CLIENT and takes its bytes, slot, identity and the timer with it", async () => {
    const h = harness();
    const sink = new Sink(); sink.backpressure = true;
    await h.service.openStream(principal(), { environment: "paper", cursor: await h.cursorOf() }, undefined, () => sink);
    await h.service.settle();
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["heartbeat", null], ["resync_required", "SLOW_CLIENT"]]);
    expect(sink.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0, sessions: 0, tracked_identities: 0, timer: false, source_flights: 0 });
  });
  it.each([
    ["entries per client", { maximumEntriesPerClient: 2 }],
    ["bytes per client", { maximumClientBytes: 8192 }],
    ["total bytes", { maximumClientBytes: 8192, maximumTotalBytes: 8192 }],
  ])("a client over its %s bound is evicted with SLOW_CLIENT, never truncated or split, and everything is released", async (_name, patch) => {
    const h = harness({ limits: limits({ maximumFrameBytes: 8192, maximumClientBytes: 65536, maximumTotalBytes: 1_048_576, ...patch }) });
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish(); h.log.publish(); h.log.publish();
    await h.service.pollOnce();
    expect(sink.events.at(-1)!.frame).toMatchObject({ event_type: "resync_required", reason_code: "SLOW_CLIENT", terminal: true });
    expect(sink.events.filter(e => e.event === "revalidate").length).toBeLessThan(3);
    expect(sink.ended).toBe(true);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0, sessions: 0, tracked_identities: 0, timer: false });
  });
  it("a client that goes away (socket close) frees everything, and an idle process holds no timer", async () => {
    const h = harness();
    const a = await h.open(await h.cursorOf(principal("u1", "s1")), principal("u1", "s1"));
    const b = await h.open(await h.cursorOf(principal("u2", "s2")), principal("u2", "s2"));
    expect(h.service.diagnostics()).toMatchObject({ clients: 2, sessions: 2, timer: true });
    a.disconnect();
    expect(h.service.diagnostics()).toMatchObject({ clients: 1, sessions: 1, timer: true });
    b.disconnect();
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, tracked_identities: 0, queued_bytes: 0, timer: false });
  });
  it("a socket that closed while the open was in flight never becomes a subscriber", async () => {
    const h = harness();
    const token = await h.cursorOf();
    const sink = new Sink();
    let release!: () => void;
    h.log.gate = new Promise<void>(resolve => { release = resolve; });
    const opening = h.service.openStream(principal(), { environment: "paper", cursor: token }, undefined, () => sink);
    sink.disconnect();
    release();
    await opening; await h.service.settle();
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, tracked_identities: 0, timer: false });
    expect(sink.chunks).toEqual([]);
  });
  it("identical flights coalesce: N browsers on one scope cost one source read per tick, not N", async () => {
    const h = harness({ limits: limits({ maximumClients: 16 }), streamsPerSession: 8 });
    const sinks: Sink[] = [];
    const token = await h.cursorOf();
    for (let i = 0; i < 5; i++) sinks.push(await h.open(token, principal("u1", `s${i}`)));
    for (const s of sinks) s.chunks.length = 0;
    h.log.publish();
    h.log.rowCalls = 0;
    await h.service.pollOnce();
    expect(h.log.rowCalls).toBe(1);
    for (const s of sinks) expect(s.events.map(e => e.event)).toEqual(["revalidate"]);
  });
  it("ticks never overlap: a slow source holds one poll, and the next tick joins it", async () => {
    const h = harness();
    const sink = await h.open(await h.cursorOf());
    sink.chunks.length = 0;
    h.log.publish();
    let release!: () => void;
    h.log.gate = new Promise<void>(resolve => { release = resolve; });
    const first = h.service.pollOnce(), second = h.service.pollOnce();
    expect(second).toBe(first);
    release();
    await first;
    expect(sink.events.map(e => e.event)).toEqual(["revalidate"]);
  });
  it("the timer polls at the bounded cadence only while someone is connected", async () => {
    vi.useFakeTimers();
    const log = new Log(); const state: AuthState = { stream: { eligible: true }, revoked: false, denyOpen: false, writes: 0, flip: false };
    const clock = { now: 1_800_000_100_000 };
    const codec = new ScopedReplayCursorCodec("t1", { t1: SECRET }, TTL, () => clock.now);
    const service = new AlphaFleetRealtimeService(null as never, null as never, config as never,
      { authority: authority(log, state), log, codec, limits: limits(), pollMs: 1000, replayWindowMs: TTL, now: () => clock.now });
    services.push(service);
    expect(service.diagnostics().timer).toBe(false);
    const sink = new Sink();
    const baseline = await service.snapshot(principal(), { environment: "paper" });
    if (baseline.stream.state !== "AVAILABLE") throw new Error("no stream");
    await service.openStream(principal(), { environment: "paper", cursor: baseline.stream.resume_cursor }, undefined, () => sink);
    await service.settle();
    sink.chunks.length = 0;
    log.publish();
    await vi.advanceTimersByTimeAsync(1000);
    await service.settle();
    expect(sink.events.map(e => e.event)).toEqual(["revalidate"]);
    sink.disconnect();
    expect(service.diagnostics().timer).toBe(false);
    log.publish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sink.events).toHaveLength(1);
  });
});

describe("BE-P16 boot", () => {
  it("constructing the service needs no signing key; an unusable key fails THIS dataset closed, not the application", async () => {
    const log = new Log(); const state: AuthState = { stream: { eligible: true }, revoked: false, denyOpen: false, writes: 0, flip: false };
    const service = new AlphaFleetRealtimeService(null as never, null as never, { ...config, QUERY_CURSOR_ACTIVE_KEY_ID: "missing", QUERY_CURSOR_KEYS_JSON: undefined } as never,
      { authority: authority(log, state), log, limits: limits(), pollMs: 60_000, now: () => 1_800_000_100_000 });
    services.push(service);
    expect(service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, timer: false, stopped: false });
    await expect(service.snapshot(principal(), { environment: "paper" })).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    const sink = new Sink();
    await service.openStream(principal(), { environment: "paper", cursor: "TEST_ONLY.token" }, undefined, () => sink);
    expect(sink.events.map(e => [e.event, e.frame.reason_code])).toEqual([["unavailable", "SOURCE_UNAVAILABLE"]]);
    expect(service.diagnostics()).toMatchObject({ clients: 0, sessions: 0 });
    await service.onApplicationShutdown();                       // never built a Hub, and stopping one that does not exist is a no-op
  });
});

describe("BE-P16 shutdown", () => {
  it("stops every stream with STOPPED, refuses new opens, offers no new baseline stream, and leaves nothing running", async () => {
    const h = harness();
    const a = await h.open(await h.cursorOf());
    a.chunks.length = 0;
    await h.service.onApplicationShutdown();
    expect(a.events.map(e => [e.event, e.frame.reason_code])).toEqual([["unavailable", "STOPPED"]]);
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, timer: false, stopped: true });
    const late = await h.open(await h.cursorOf().catch(() => "x"));
    expect(late.events.map(e => [e.event, e.frame.reason_code])).toEqual([["unavailable", "STOPPED"]]);
    expect((await h.snapshot()).stream).toMatchObject({ state: "UNAVAILABLE", reason_code: "STREAM_CAPACITY_REACHED" });
  });
});

/* ═══════════════════════════ the notice source on its own ═══════════════════════════ */
describe("BE-P16 notice source and coordinate", () => {
  const sel = { workspace_id: WS, environment: "paper" as const, profile_id: PROFILE };
  const headOf = (log: Log) => log.head() as Promise<FleetHead>;
  const bindingOf = async (log: Log, patch: Partial<ScopedReplayBinding> = {}): Promise<{ binding: ScopedReplayBinding; cursor: string }> => {
    const head = await headOf(log), baseline = fleetBaseline(head, sel);
    return { cursor: baseline.source_cursor, binding: { workspace_id: WS, environment: "paper", profile_id: PROFILE, principal_scope_digest: "sha256:" + "e1".repeat(32),
      app_policy_revision: "p", field_policy_revision: "f", model_revision: "portal.alpha-fleet-realtime.stream.v1", schema_revision: "portal.execution.scoped-realtime.v1",
      dataset: "alpha_fleet_overview", query_digest: baseline.query_digest, source_set_digest: baseline.source_set_digest, source_continuity_epoch: head.source_epoch,
      projection_generation: head.projection_generation, snapshot_id: baseline.snapshot_id, window: null, ...patch } };
  };
  it("the coordinate is canonical, closed and bounded; any other spelling is invalid", async () => {
    const log = new Log(), { cursor } = await bindingOf(log);
    expect(decodeFleetCoordinate(cursor)).toMatchObject({ version: 1, baseline_ordinal: "7", after_ordinal: "7" });
    expect(cursor.length).toBeLessThanOrEqual(2048);
    for (const bad of ["", "mf1.", cursor + "=", cursor.replace("mf1.", "mo1."), "mf1." + Buffer.from('{"version":1}').toString("base64url"),
      "mf1." + Buffer.from(JSON.stringify({ ...decodeFleetCoordinate(cursor), extra: 1 })).toString("base64url"),
      "mf1." + Buffer.from(JSON.stringify({ ...decodeFleetCoordinate(cursor), after_ordinal: "6" })).toString("base64url")])
      expect(() => decodeFleetCoordinate(bad), bad).toThrow(ScopedReplayError);
    expect(() => encodeFleetCoordinate({ ...decodeFleetCoordinate(cursor), baseline_ordinal: "08" })).toThrow(ScopedReplayError);
  });
  it("is stateless across baselines and bounded by the requested limit; a dense page is caught up only at the head", async () => {
    const log = new Log(), source = new ManagerFleetNoticeSource(log, 200), { binding, cursor } = await bindingOf(log);
    expect(await source.read(binding, cursor, 10)).toEqual({ notices: [], next_cursor: cursor, caught_up: true });
    for (let i = 0; i < 5; i++) log.publish();
    const page = await source.read(binding, cursor, 3);
    expect(page.notices).toHaveLength(3); expect(page.caught_up).toBe(false);
    expect(page.next_cursor).toBe(page.notices.at(-1)!.resume_cursor);
    const rest = await source.read(binding, page.next_cursor!, 3);
    expect(rest.notices).toHaveLength(2); expect(rest.caught_up).toBe(true);
    expect(decodeFleetCoordinate(rest.next_cursor!)).toMatchObject({ baseline_ordinal: "7", after_ordinal: "12" });
  });
  it("refuses a binding that does not belong to the coordinate or the dataset (never answers across scopes)", async () => {
    const log = new Log(), source = new ManagerFleetNoticeSource(log), { binding, cursor } = await bindingOf(log);
    for (const patch of [{ dataset: "execution_profile_observation" as const }, { model_revision: "other" }, { snapshot_id: "sha256:" + "0f".repeat(32) },
      { query_digest: "sha256:" + "0f".repeat(32) }, { profile_id: "TEST_ONLY:other" }, { window: { from_ms: 1, to_ms: 2 } }])
      await expect(source.read({ ...binding, ...patch }, cursor, 5), JSON.stringify(patch)).rejects.toMatchObject({ code: "SCOPE_CHANGED" });
    await expect(source.read({ ...binding, source_set_digest: "sha256:" + "0f".repeat(32) }, cursor, 5)).rejects.toMatchObject({ code: "GENERATION_CHANGED" });
  });
  it("honours abort, a missing head and a bad limit without touching rows", async () => {
    const log = new Log(), source = new ManagerFleetNoticeSource(log), { binding, cursor } = await bindingOf(log);
    const aborted = new AbortController(); aborted.abort();
    await expect(source.read(binding, cursor, 5, aborted.signal)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    await expect(source.read(binding, cursor, 201)).rejects.toMatchObject({ code: "SOURCE_COVERAGE_UNPROVED" });
    log.gone = true;
    await expect(source.read(binding, cursor, 5)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(log.rowCalls).toBe(0);
    expect(() => new ManagerFleetNoticeSource(log, 0)).toThrow("FLEET_NOTICE_BOUND_INVALID");
    expect(() => new ManagerFleetNoticeSource(log, 201)).toThrow("FLEET_NOTICE_BOUND_INVALID");
  });
  it("serializes a frame exactly as the published wire form", () => {
    const frame = scopedRealtimeFrame.parse({ schema_version: "portal.execution.scoped-realtime.v1", semantics: "NOTIFICATION_ONLY", event_type: "heartbeat", terminal: false,
      reconnect_required: false, resume_cursor: "TEST_ONLY.token", projection_generation: GEN, quality: null, next_action: "RESUME_PORTAL_CURSOR", reason_code: null });
    expect(serializeFleetFrame(frame)).toBe(`id: TEST_ONLY.token\nevent: heartbeat\ndata: ${JSON.stringify(frame)}\n\n`);
  });
});

/* ═══════════════════════════ the HTTP surface ═══════════════════════════ */
describe("BE-P16 controller: closed routes, no-store, SSE headers, errors before the stream and frames after it", () => {
  const raw = () => {
    const listeners: Record<string, Array<() => void>> = {};
    const written: string[] = [];
    const res = { headersSent: false, destroyed: false, writableEnded: false, written,
      writeHead: vi.fn((_status: number, _headers: Record<string, string>) => { res.headersSent = true; }),
      flushHeaders: vi.fn(), write: vi.fn((chunk: string) => { written.push(chunk); return true; }),
      end: vi.fn(() => { res.writableEnded = true; for (const l of listeners.close ?? []) l(); }),
      once: vi.fn((event: string, l: () => void) => { (listeners[event] ??= []).push(l); }) };
    return res;
  };
  const request = (extra: Record<string, unknown> = {}) => ({ portalUser: { userId: "u1" }, portalSession: { sessionId: "s1", sessionVersion: 1 }, portalWorkspaceId: WS,
    headers: {}, ...extra }) as never;
  const controller = (h: ReturnType<typeof harness>, canRead = true) =>
    new AlphaFleetRealtimeController(h.service, { canReadExecution: async () => canRead } as never);

  it("is session-guarded and every route is a closed GET", () => {
    const reflector = new Reflector();
    expect(reflector.get("__guards__", AlphaFleetRealtimeController)?.map((g: { name: string }) => g.name)).toEqual(["SessionGuard"]);
    expect(Reflect.getMetadata("path", AlphaFleetRealtimeController)).toBe("/api/v1/execution/manager/fleet");
    const proto = AlphaFleetRealtimeController.prototype;
    expect(Reflect.getMetadata("path", proto.snapshot)).toBe("/realtime-snapshot");
    expect(Reflect.getMetadata("path", proto.stream)).toBe("/stream");
    expect(Reflect.getMetadata("__headers__", proto.snapshot)).toEqual([{ name: "Cache-Control", value: "private, no-store" }]);
  });
  it("serves the snapshot through the service and refuses a workspace the caller cannot read before any work", async () => {
    const h = harness();
    expect((await controller(h).snapshot(request(), { environment: "paper" })).dataset).toBe("alpha_fleet_overview");
    await expect(controller(h, false).snapshot(request(), { environment: "paper" })).rejects.toMatchObject({ status: 404 });
    await expect(controller(h).snapshot(request(), [])).rejects.toMatchObject({ status: 400 });
    expect(h.log.headCalls).toBeGreaterThan(0);
  });
  it("opens the stream with the SSE headers, hijacks once, and writes the SSE wire form", async () => {
    const h = harness();
    const response = raw(), hijack = vi.fn();
    await controller(h).stream(request(), { raw: response, hijack } as never, { environment: "paper", cursor: await h.cursorOf() });
    await h.service.settle();
    expect(hijack).toHaveBeenCalledTimes(1);
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store", "x-accel-buffering": "no", "x-content-type-options": "nosniff" }));
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(response.written).toHaveLength(1);
    expect(response.written[0]).toMatch(/^id: sr1\..*\nevent: heartbeat\ndata: \{.*\}\n\n$/s);
    expect(h.service.diagnostics().clients).toBe(1);
  });
  it("refuses a bad query or Last-Event-ID as an ordinary HTTP error BEFORE headers, with nothing hijacked", async () => {
    const h = harness();
    for (const [query, headers] of [[{ environment: "paper", ordinal: "1" }, {}], [{ environment: "paper" }, { "last-event-id": "x".repeat(4097) }],
      [{ environment: "paper" }, { "last-event-id": ["a", "b"] }], [{ environment: "paper" }, { "last-event-id": "" }]] as const) {
      const response = raw(), hijack = vi.fn();
      await expect(controller(h).stream(request({ headers }), { raw: response, hijack } as never, query), JSON.stringify([query, headers])).rejects.toMatchObject({ status: 400 });
      expect(hijack).not.toHaveBeenCalled(); expect(response.writeHead).not.toHaveBeenCalled();
    }
    const response = raw(), hijack = vi.fn();
    await expect(controller(h, false).stream(request(), { raw: response, hijack } as never, { environment: "paper" })).rejects.toMatchObject({ status: 404 });
    expect(hijack).not.toHaveBeenCalled();
  });
  it("after the stream is open every failure is a terminal frame on the same response, which is then ended", async () => {
    const h = harness();
    const response = raw();
    await controller(h).stream(request(), { raw: response, hijack: vi.fn() } as never, { environment: "paper" });
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(response.written).toHaveLength(1);
    expect(response.written[0]).toMatch(/^event: resync_required\ndata: .*SNAPSHOT_REQUIRED.*\n\n$/s);
    expect(response.written[0]).not.toMatch(/^id: /);
    expect(response.end).toHaveBeenCalled();
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0 });
  });
  it("a client that disconnects releases its slot", async () => {
    const h = harness();
    const response = raw();
    await controller(h).stream(request(), { raw: response, hijack: vi.fn() } as never, { environment: "paper", cursor: await h.cursorOf() });
    await h.service.settle();
    expect(h.service.diagnostics().clients).toBe(1);
    response.writableEnded = true; response.destroyed = true;
    response.once.mock.calls.filter(([event]) => event === "close").forEach(([, listener]) => listener());
    expect(h.service.diagnostics()).toMatchObject({ clients: 0, sessions: 0, timer: false });
  });
});
