/**
 * ELP2-09 `alpha_fleet_overview` named snapshot + SSE stream (Claude, BE-P16). One service, one `ScopedReplayHub` for the whole
 * process, so every cap is a product-wide cap, not a per-user hope.
 *
 * What is bounded, and where it is enforced (each has a test in `be-p16-alpha-fleet-realtime.spec.ts`):
 * - clients, entries, frame bytes, per-client bytes, total bytes, notices per read, source read timeout: the Hub's
 *   `ScopedReplayLimits`. A slow or overflowing client is evicted with a terminal `resync_required`/`SLOW_CLIENT`, its bytes
 *   leave the total, its session slot is released and, when the last client leaves, the poll timer stops;
 * - streams per session (`max_streams_per_session`): the next open is a terminal `unavailable`/`RECONNECT_LIMIT` frame;
 * - cursor: the existing encrypted `sr1` token, fixed-length, <= 4096 characters, expires after the replay window
 *   (<= 300 s) and binds actor, session, policy, field policy, model, query, source set, epoch, generation and baseline;
 * - revoke recheck: the Hub re-resolves CURRENT authority before every source read and inside the `stream.subscribe` DB
 *   transaction before every write; `revokeSession` is only a fast purge hint on top of that;
 * - ordinals: the baseline names the checkpoint ordinal; a notice advances it by exactly one publication revision, and a gap
 *   or a moved head is `resync_required`, never a skipped ordinal;
 * - no start-at-head: a stream without a snapshot cursor is refused (`SNAPSHOT_REQUIRED`).
 *
 * Pairing with the named read (CR-01). Two scopes are involved and they are deliberately NOT merged: the STREAM is gated on the root
 * business scope (`business.read_all` + `stream.subscribe`), the named `GET /manager/fleet` read on an `alpha.read` scope. The
 * snapshot publishes `baseline.revision` (the raw head, what cursors and ordinals count) AND `named_snapshot.lineage_revision` =
 * `managerLineageRevision(<alpha.read scope fingerprint>, head.revision)`, the exact string the named read returns as
 * `lineage.revision` for the same actor, session, workspace, environment, grants and head. The root scope still binds the cursor and the
 * stream identity; READ alone never produces an AVAILABLE stream.
 *
 * The service installs a timer only while at least one client is connected, polls at one bounded cadence regardless of the
 * number of browsers (identical scoped flights coalesce inside the Hub), and never reads a payload document.
 */
import { BeforeApplicationShutdown, Inject, Injectable, OnApplicationShutdown, Optional } from "@nestjs/common";
import type { Pool } from "pg";
import { ControlApiConfig, querySigningKeys } from "../config";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import { AuthService } from "../auth/auth.service";
import type { StreamRevocationHints } from "../auth/stream-revocation-hints";
import { ExecutionReadScopeError, ExecutionReadScopes, type ReadScopePrincipal } from "./read-scope";
import type { ReadDatasetBinding } from "./read-publication";
import { ManagerModelRepository } from "./manager-model.store";
import { managerLineageRevision } from "./manager-model";
import type { ScopedRealtimeFrame, ScopedReplayBinding } from "./realtime.contract";
import { ScopedReplayHub, type ScopedReplayLimits } from "./realtime";
import { ScopedReplayCursorCodec, ScopedReplayError, decodeScopedReplayContinuationWithBinding } from "./scoped-replay-cursor";
import { ALPHA_FLEET_DATASET, ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION, ALPHA_FLEET_NAMED_SNAPSHOT_PATH, ALPHA_FLEET_SNAPSHOT_SCHEMA,
  ALPHA_FLEET_STREAM_MODEL, ALPHA_FLEET_STREAM_PATH, alphaFleetRealtimeQuery, alphaFleetRealtimeSnapshot, alphaFleetStreamQuery,
  serializeFleetFrame, terminalFleetFrame, type AlphaFleetRealtimeSnapshot } from "./alpha-fleet-realtime.contract";
import { ManagerFleetNoticeSource, decodeFleetCoordinate, fleetBaseline, fleetQueryDigest, fleetSourceSetDigest,
  type FleetHead, type FleetRevisionLog, type FleetSelection } from "./alpha-fleet-realtime.source";
import { ScopesFleetAuthority, type AlphaFleetAuthority, type FleetEnvironment } from "./alpha-fleet-realtime.authority";

/** Tested cell budgets, NOT production defaults or a certified SLA (the module-wide rule of `realtime.ts`). */
export const ALPHA_FLEET_REALTIME_LIMITS: Readonly<ScopedReplayLimits> = Object.freeze({
  maximumClients: 256, maximumEntriesPerClient: 8, maximumFrameBytes: 16_384, maximumClientBytes: 65_536,
  maximumTotalBytes: 16 * 1_048_576, maximumNoticesPerRead: 50, readTimeoutMs: 5_000 });
export const ALPHA_FLEET_POLL_MS = 5_000;
export const ALPHA_FLEET_STREAMS_PER_SESSION = 4;

export const ALPHA_FLEET_REALTIME_OPTIONS = Symbol("ALPHA_FLEET_REALTIME_OPTIONS");
export interface AlphaFleetRealtimeOptions {
  authority?: AlphaFleetAuthority; log?: FleetRevisionLog; codec?: ScopedReplayCursorCodec; limits?: ScopedReplayLimits;
  pollMs?: number; streamsPerSession?: number; replayWindowMs?: number; now?: () => number;
  /** Overrides the AuthService's hint carrier (tests). Hints are a fast purge only, never authority. */
  hints?: StreamRevocationHints;
}

/** The part of a response the service writes to. The controller wraps `reply.raw`; a test wraps an array. */
export interface FleetStreamSink {
  /** `false` is backpressure: the client is not keeping up, and the Hub evicts it. */
  write(chunk: string): boolean;
  end(): void;
  onClose(listener: () => void): void;
  closed(): boolean;
}

@Injectable()
export class AlphaFleetRealtimeService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly log: FleetRevisionLog;
  private readonly authority: AlphaFleetAuthority;
  private codecValue: ScopedReplayCursorCodec | undefined;
  private readonly limits: ScopedReplayLimits;
  private hubValue: ScopedReplayHub | undefined;
  private readonly pollMs: number;
  private readonly streamsPerSession: number;
  private readonly replayWindowMs: number;
  private readonly now: () => number;
  /** session id -> open streams; the only per-user state, and it empties as streams end. */
  private readonly sessions = new Map<string, number>();
  /** One record per reserved open (pending or live), so a revoke hint can name streams by session or user and also reach an open that
   * has not subscribed yet. Bounded by `sessions`: a record exists exactly as long as its slot. */
  private readonly opens = new Set<OpenRecord>();
  private unsubscribeHints: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<void> | null = null;
  private stopped = false;
  private pollFailures = 0;

  constructor(@Inject(EXECUTION_DATA_POOL) pool: Pool, @Inject(ExecutionReadScopes) scopes: ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ALPHA_FLEET_REALTIME_OPTIONS) options: AlphaFleetRealtimeOptions = {},
    @Optional() @Inject(AuthService) auth?: Pick<AuthService, "streamHints">) {
    this.log = options.log ?? new ManagerModelRepository(pool);
    this.authority = options.authority ?? new ScopesFleetAuthority(scopes);
    this.now = options.now ?? Date.now;
    this.replayWindowMs = options.replayWindowMs ?? Math.min(300_000, config.QUERY_CURSOR_TTL_SECONDS * 1000);
    this.codecValue = options.codec;
    this.limits = Object.freeze({ ...(options.limits ?? ALPHA_FLEET_REALTIME_LIMITS) });
    this.pollMs = options.pollMs ?? ALPHA_FLEET_POLL_MS;
    this.streamsPerSession = options.streamsPerSession ?? ALPHA_FLEET_STREAMS_PER_SESSION;
    if (!Number.isSafeInteger(this.pollMs) || this.pollMs < 1 || !Number.isSafeInteger(this.streamsPerSession) || this.streamsPerSession < 1 ||
      this.streamsPerSession > 16) throw new Error("ALPHA_FLEET_REALTIME_BOUND_INVALID");
    // Revoke hints: a session or grant that ended in this process ends its open streams in the same tick. Authority does not depend on it.
    this.unsubscribeHints = (options.hints ?? auth?.streamHints)?.subscribe({
      sessionEnded: sessionId => this.revokeSession(sessionId), userAuthorityChanged: userId => this.revokeUser(userId) }) ?? null;
  }

  /** Built on first use, never at boot: a process that never serves this dataset needs no signing key for it, and an invalid key
   * fails this dataset closed (503 / a terminal frame) instead of stopping the whole application. */
  private get codec(): ScopedReplayCursorCodec {
    return this.codecValue ??= new ScopedReplayCursorCodec(this.config.QUERY_CURSOR_ACTIVE_KEY_ID, querySigningKeys(this.config), this.replayWindowMs, this.now);
  }
  private get hub(): ScopedReplayHub {
    return this.hubValue ??= new ScopedReplayHub(new ManagerFleetNoticeSource(this.log, Math.min(200, this.limits.maximumNoticesPerRead)), this.codec, this.limits);
  }

  /* ───────────────────────── snapshot ───────────────────────── */

  async snapshot(principal: ReadScopePrincipal, raw: unknown): Promise<AlphaFleetRealtimeSnapshot> {
    const { selection, workspace } = this.target(principal, alphaFleetRealtimeQuery.safeParse(raw));
    try {
      const head = await this.qualifiedHead(selection);
      const baseline = fleetBaseline(head, selection);
      const authorized = await this.authority.snapshot(principal, selection.environment, selection.profile_id, datasetOf(head), async () => {
        const current = await this.log.head(selection.workspace_id, selection.environment, selection.profile_id);
        // A publication that moved while the authority was being fenced is not the barrier this response names.
        if (!current || current.revision !== head.revision || current.payload_digest !== head.payload_digest)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        return current;
      });
      const observed = this.now();
      let stream: AlphaFleetRealtimeSnapshot["stream"];
      if (!authorized.stream.eligible) stream = { state: "UNAVAILABLE", reason_code: authorized.stream.reason, resume_cursor: null };
      else if (this.stopped || (this.hubValue?.diagnostics().clients ?? 0) >= this.limits.maximumClients)
        stream = { state: "UNAVAILABLE", reason_code: "STREAM_CAPACITY_REACHED", resume_cursor: null };
      else {
        const binding = bindingFor(selection, head, baseline.snapshot_id, authorized.identity, authorized.policy_revision!, authorized.field_policy_revision!);
        stream = { state: "AVAILABLE", resume_cursor: this.codec.encode(binding, baseline.source_cursor), stream_path: ALPHA_FLEET_STREAM_PATH,
          heartbeat_interval_ms: this.pollMs, replay_window_ms: this.replayWindowMs, max_frame_bytes: this.limits.maximumFrameBytes,
          max_streams_per_session: this.streamsPerSession };
      }
      return alphaFleetRealtimeSnapshot.parse({
        schema_version: ALPHA_FLEET_SNAPSHOT_SCHEMA, dataset: ALPHA_FLEET_DATASET, semantics: "NOTIFICATION_ONLY",
        workspace_id: workspace, environment: selection.environment, scope_fingerprint: authorized.identity,
        baseline: { revision: head.revision, projection_generation: head.projection_generation, source_epoch: head.source_epoch,
          ordinal: baseline.ordinal, catalogue_digest: head.catalogue_digest },
        named_snapshot: { operation_id: ALPHA_FLEET_NAMED_SNAPSHOT_OPERATION, path: ALPHA_FLEET_NAMED_SNAPSHOT_PATH, lineage_revision: managerLineageRevision(authorized.named_scope_fingerprint, head.revision) },
        source: { notice_origin: "PORTAL_PUBLICATION_REVISION", edge_notice_source: "NOT_COMMISSIONED", qualification: "SOURCE_VERIFIED" },
        stream,
        quality: { completeness: "PARTIAL", freshness: "UNKNOWN", coverage: "AUTHORIZED_ONLY", source_as_of_ms: null, portal_observed_at_ms: observed,
          source_set_ref: baseline.source_set_digest, confidence: "PROVISIONAL",
          reasons: ["BASELINE_BARRIER_ONLY", "NO_EDGE_NOTICE_SOURCE", "SOURCE_FRESHNESS_NOT_ATTESTED"] },
      });
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }

  /* ───────────────────────── stream ───────────────────────── */

  /**
   * Validates the request (a bad query is an HTTP error: `begin` has not run), then asks `begin` for the sink and from then on
   * answers EVERYTHING as SSE: an expired cursor, a revoked grant or a full house is one terminal frame and a closed response,
   * because an `EventSource` cannot read an error body.
   */
  async openStream(principal: ReadScopePrincipal, raw: unknown, lastEventId: string | undefined, begin: () => FleetStreamSink): Promise<void> {
    const { selection, query } = this.target(principal, alphaFleetStreamQuery.safeParse(raw));
    const token = lastEventId ?? query.cursor;
    const sink = begin();
    const session = principal.session.sessionId;
    let handle: { close: () => void } | null = null, released = false, reserved = false;
    const open: OpenRecord = { session, user: principal.user.userId, identity: null, revoked: false };
    const finish = () => {
      if (released) return;
      released = true;
      handle?.close();
      if (reserved) {
        const left = (this.sessions.get(session) ?? 1) - 1;
        if (left <= 0) this.sessions.delete(session); else this.sessions.set(session, left);
      }
      this.opens.delete(open);
      this.idleCheck();
    };
    const terminate = (reason: NonNullable<ScopedRealtimeFrame["reason_code"]>) => {
      try { if (!sink.closed()) sink.write(serializeFleetFrame(terminalFleetFrame(reason))); } catch { /* a broken client cannot hold a slot */ }
      try { sink.end(); } catch { /* already closed */ }
      finish();
    };
    if (this.stopped) { terminate("STOPPED"); return; }
    if ((this.sessions.get(session) ?? 0) >= this.streamsPerSession) { terminate("RECONNECT_LIMIT"); return; }
    // Reserve the slot before any await: concurrent opens of one session cannot all pass the check.
    this.sessions.set(session, (this.sessions.get(session) ?? 0) + 1);
    reserved = true;
    this.opens.add(open);
    sink.onClose(finish);
    try {
      // No start-at-head: the only way in is the cursor of a snapshot (or of a previous frame).
      if (!token) { terminate("SNAPSHOT_REQUIRED"); return; }
      const head = await this.qualifiedHead(selection);
      let expected = { epoch: head.source_epoch, generation: head.projection_generation, source_set: fleetSourceSetDigest(selection, head) };
      const authorization = await this.authority.openStream(principal, selection.environment, selection.profile_id, datasetOf(head), async () => {
        const current = await this.log.head(selection.workspace_id, selection.environment, selection.profile_id);
        if (!current) throw new ScopedReplayError("SOURCE_UNAVAILABLE");
        // A new epoch, generation or catalogue is a new lineage: resync, not "access revoked".
        if (current.source_epoch !== expected.epoch || current.projection_generation !== expected.generation ||
          fleetSourceSetDigest(selection, current) !== expected.source_set) throw new ScopedReplayError("GENERATION_CHANGED");
        return datasetOf(current);
      });
      const resolved = decodeScopedReplayContinuationWithBinding(this.codec, token, source => {
        const coordinate = decodeFleetCoordinate(source);
        return bindingFor(selection, head, coordinate.original_snapshot_id, authorization.identity, authorization.policy_revision, authorization.field_policy_revision);
      });
      expected = { epoch: resolved.binding.source_continuity_epoch, generation: resolved.binding.projection_generation, source_set: resolved.binding.source_set_digest };
      if (sink.closed()) { finish(); return; }
      open.identity = authorization.identity;
      handle = await this.hub.subscribe({ binding: resolved.binding, guard: authorization.guard, baselineCursor: resolved.source, lastEventId: token,
        write: frame => {
          if (sink.closed()) return false;
          // `false` = backpressure: the Hub then evicts this client as SLOW_CLIENT and writes the terminal frame itself.
          const accepted = sink.write(serializeFleetFrame(frame));
          if (frame.terminal) { sink.end(); finish(); }
          return accepted;
        } });
      // A revoke hint that landed while this open was still subscribing found no client to end: end it now, before any frame.
      if (open.revoked && open.identity !== null) this.endIdentities(new Set([open.identity]));
      if (released || sink.closed()) { handle.close(); finish(); return; }
      this.ensureTimer();
      void this.pollOnce();
    } catch (error) {
      terminate(reasonOf(error));
    }
  }

  /** Fast purge hint on top of the per-poll and per-write fences: every stream of this session ends with `access_revoked`. Total: it
   * never throws, and an id nobody holds is a no-op. Authority never depends on it. */
  revokeSession(sessionId: string): void { this.endStreams(open => open.session === sessionId); }
  /** Same, for every session of one user (logout of all, password change, disable, a grant of the user revoked or narrowed). */
  revokeUser(userId: string): void { this.endStreams(open => open.user === userId); }

  diagnostics() {
    return { ...(this.hubValue?.diagnostics() ?? IDLE_HUB), sessions: this.sessions.size,
      tracked_identities: new Set([...this.opens].flatMap(open => open.identity === null ? [] : [open.identity])).size, timer: this.timer !== null,
      poll_failures: this.pollFailures, stopped: this.stopped };
  }

  /** One serial, bounded poll. A tick that finds a poll in flight joins it instead of starting another: ticks are skipped, never queued. */
  pollOnce(): Promise<void> {
    if (this.inflight) return this.inflight;
    if (this.stopped) return Promise.resolve();
    const run = (async () => {
      try { await this.hub.poll(); } catch { this.pollFailures++; }
    })().finally(() => { this.inflight = null; this.idleCheck(); });
    this.inflight = run;
    return run;
  }
  /** Resolves when no poll is in flight. Lifecycle and tests only. */
  async settle(): Promise<void> { while (this.inflight) await this.inflight; }

  beforeApplicationShutdown(): void {
    this.stopped = true;
    this.unsubscribeHints?.();
    this.unsubscribeHints = null;
    this.hubValue?.stop();
    this.clearTimer();
  }
  async onApplicationShutdown(): Promise<void> {
    this.beforeApplicationShutdown();
    await this.hubValue?.drain();
  }

  /* ───────────────────────── internals ───────────────────────── */

  private target(principal: ReadScopePrincipal, parsed: { success: true; data: { environment: FleetEnvironment; workspace_id?: string; cursor?: string } } | { success: false }) {
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const { environment, workspace_id } = parsed.data;
    if (workspace_id && workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const profile = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID : environment === "sandbox" ?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!profile) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const selection: FleetSelection = { workspace_id: principal.workspaceId, environment, profile_id: profile };
    return { selection, workspace: principal.workspaceId, query: parsed.data };
  }
  /** The head, only when its revision is SOURCE_VERIFIED: a TEST_ONLY revision is never a baseline, as it is never a fleet read. */
  private async qualifiedHead(selection: FleetSelection): Promise<FleetHead> {
    const head = await this.log.head(selection.workspace_id, selection.environment, selection.profile_id);
    if (!head || await this.log.revisionQualification(selection.workspace_id, selection.environment, selection.profile_id, head.revision) !== "SOURCE_VERIFIED")
      throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
    return head;
  }
  private endStreams(match: (open: OpenRecord) => boolean) {
    try {
      const identities = new Set<string>();
      for (const open of this.opens) if (match(open)) { open.revoked = true; if (open.identity !== null) identities.add(open.identity); }
      this.endIdentities(identities);
    } catch { /* a hint can never fail its caller; the per-poll and per-write fences still end the stream */ }
  }
  private endIdentities(identities: Set<string>) {
    // An identity binds actor and session, so ending an identity ends only the revoked principal's streams.
    if (identities.size) this.hubValue?.revoke(binding => identities.has(binding.principal_scope_digest));
  }
  private ensureTimer() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.pollOnce(), this.pollMs);
    this.timer.unref();
  }
  private clearTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  /** An idle process holds no timer and no poll. */
  private idleCheck() { if ((this.hubValue?.diagnostics().clients ?? 0) === 0) this.clearTimer(); }
}

interface OpenRecord { readonly session: string; readonly user: string; identity: string | null; revoked: boolean; }

const IDLE_HUB = { clients: 0, queued_bytes: 0, source_flights: 0, pending_subscriptions: 0, timed_out_flights: 0, browser_source_calls: 0, semantics: "NOTIFICATION_ONLY" as const };

const datasetOf = (head: FleetHead): ReadDatasetBinding => ({ dataset_id: ALPHA_FLEET_DATASET, source_revision: head.revision,
  projection_generation: head.projection_generation, catalogue_revision: head.catalogue_digest, window: null });

function bindingFor(selection: FleetSelection, head: FleetHead, snapshotId: string, identity: string, policy: string, fieldPolicy: string): ScopedReplayBinding {
  return { workspace_id: selection.workspace_id, environment: selection.environment, profile_id: selection.profile_id, principal_scope_digest: identity,
    app_policy_revision: policy, field_policy_revision: fieldPolicy, model_revision: ALPHA_FLEET_STREAM_MODEL,
    schema_revision: "portal.execution.scoped-realtime.v1", dataset: ALPHA_FLEET_DATASET, query_digest: fleetQueryDigest(selection),
    source_set_digest: fleetSourceSetDigest(selection, head), source_continuity_epoch: head.source_epoch,
    projection_generation: head.projection_generation, snapshot_id: snapshotId, window: null };
}

/** Every failure before a subscription is one finite reason; adapter or SQL prose never reaches the wire. */
function reasonOf(error: unknown): NonNullable<ScopedRealtimeFrame["reason_code"]> {
  if (error instanceof ScopedReplayError) return error.code;
  if (error instanceof ExecutionReadScopeError) {
    if ([403, 404, 409].includes(error.status)) return "ACCESS_CHANGED";
  }
  return "SOURCE_UNAVAILABLE";
}

