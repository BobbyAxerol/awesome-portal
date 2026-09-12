import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionRefreshHealth,
  ProfileProjectionJournalEntry,
  ProfileProjectionSnapshot,
  ProjectionEnvironment,
} from "./profile-projection.repository";
import {
  PROFILE_OBSERVATION_OPERATION_ID,
  profileObservationRevalidation,
} from "./profile-projection.catalog";

const CURSOR = /^([0-9a-f-]{36}):(\d+)$/;
const REPLAY_LIMIT = 1_000;
const SHARED_POLL_MS = 250;
// Health changes are durable and need not be polled at the 250ms journal-tail
// cadence.  One bounded second keeps a recovering panel responsive without
// turning status observation into a PostgreSQL hot loop.
const HEALTH_CHECK_MS = 1_000;
const MAX_SCOPE_GROUPS = 16;
const MAX_SUBSCRIBERS_PER_SCOPE = 256;
const MAX_PENDING_PER_SCOPE = 32;

export type LocalRealtimeKind =
  | "snapshot"
  | "delta"
  | "heartbeat"
  | "auth.expired"
  | "projection.gap";

/**
 * Additive v1 provenance for the local revision feed.  It intentionally names
 * the Portal observation, not a Trading System Event: the Manager plane only
 * publishes bounded current pages and has not accepted source replay,
 * correction, acknowledgement or global ordering semantics.
 */
export interface PortalObservationDescriptor {
  authority: "PORTAL_OBSERVATION";
  semantics: "BOUNDED_CURRENT_PAGE";
  derived: false;
  operation_id: typeof PROFILE_OBSERVATION_OPERATION_ID;
  scope: {
    workspace_id: string;
    environment: ProjectionEnvironment;
    profile_id: string;
    resource_kind: "PROFILE";
    resource_id: string;
    venue: null;
  };
  source: {
    contract_revision: string | null;
    /** Exact accepted Manager catalogue digest; null only for legacy rows. */
    catalogue_revision: string | null;
    as_of_ms: number | null;
    received_at_ms: number;
  };
  coverage: {
    kind: "CURRENT_PROFILE_PROJECTION";
    relation_count: number | null;
  };
}

export interface LocalRealtimeEnvelope {
  schema_version: "portal.execution.profile-realtime.v1";
  event_type: LocalRealtimeKind;
  terminal: boolean;
  reconnect_required: boolean;
  workspace_id: string;
  environment: ProjectionEnvironment;
  profile_id: string;
  cursor: string | null;
  projection_epoch: string | null;
  projection_sequence: number | null;
  payload_digest: string | null;
  source_as_of: string | null;
  received_at: string;
  last_successful_refresh_at: string | null;
  availability: "AVAILABLE" | "DEGRADED" | "UNKNOWN";
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  /**
   * Portal-local source-coordinator status.  It is not a Trading System Event,
   * raw source cursor, retry handle, or browser instruction to call AWS-HK.
   */
  recovery: {
    state: "HEALTHY" | "RECOVERING";
    reason_code: string | null;
    retry_not_before: string | null;
  } | null;
  /** Null for transport heartbeats/session-expiry, never a source Event. */
  observation: PortalObservationDescriptor | null;
  payload: Record<string, unknown>;
}

interface Subscriber {
  emit: (event: LocalRealtimeEnvelope) => boolean;
  sequence: number;
}

interface ScopeGroup {
  workspaceId: string;
  environment: ProjectionEnvironment;
  profileId: string;
  epoch: string;
  sequence: number;
  subscribers: Set<Subscriber>;
  health: ProfileProjectionRefreshHealth;
  statusSignature: string;
  nextHealthCheckAt: number;
  snapshot: ProfileProjectionSnapshot;
}

/** One SGP-local projection tail per scope; browser count never increases AWS-HK reads. */
@Injectable()
export class ExecutionProfileRealtimeService implements OnApplicationShutdown {
  private readonly groups = new Map<string, ScopeGroup>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly jobs = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, number>();
  private stopped = false;
  private readonly counters = {
    groupsStarted: 0,
    subscriptions: 0,
    resumedSubscriptions: 0,
    snapshotEmissions: 0,
    deltaEmissions: 0,
    statusEmissions: 0,
    slowReaderDrops: 0,
    gapEmissions: 0,
    metadataReads: 0,
    bootstrapReads: 0,
    journalReads: 0,
    readFailures: 0,
  };

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  async snapshot(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<LocalRealtimeEnvelope> {
    const snapshot = await this.requiredSnapshot(workspaceId, environment, profileId);
    const health = await localRead(this.repository.refreshHealth(workspaceId, environment, profileId));
    return envelope(
      "snapshot",
      snapshot,
      cursorPayload(snapshot),
      this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
      health,
    );
  }

  async subscribe(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    rawCursor: string | undefined,
    emit: Subscriber["emit"],
  ): Promise<() => void> {
    return this.serialize(scopeKey(workspaceId, environment, profileId), async () =>
      this.subscribeLocked(workspaceId, environment, profileId, rawCursor, emit));
  }

  private async subscribeLocked(
    workspaceId: string, environment: ProjectionEnvironment, profileId: string,
    rawCursor: string | undefined, emit: Subscriber["emit"],
  ): Promise<() => void> {
    if (this.stopped) throw new LocalRealtimeError("N31_SERVICE_STOPPED", 503);
    const key = scopeKey(workspaceId, environment, profileId);
    const existing = this.groups.get(key);
    if ((!existing && this.groups.size >= MAX_SCOPE_GROUPS) ||
        (existing && existing.subscribers.size >= MAX_SUBSCRIBERS_PER_SCOPE)) {
      throw new LocalRealtimeError("N31_SUBSCRIBER_LIMIT", 429);
    }
    // A join cannot advance past deltas owed to already attached subscribers.
    if (existing) await this.tickGroup(key, existing);
    const active = this.groups.get(key);
    const snapshot = active?.snapshot ?? await this.requiredSnapshot(workspaceId, environment, profileId);
    const health = active?.health ?? await localRead(this.repository.refreshHealth(workspaceId, environment, profileId));
    const cursor = parseCursor(rawCursor);
    if (cursor && (cursor.epoch !== snapshot.projectionEpoch || cursor.sequence > snapshot.projectionSequence)) {
      emit(gap(snapshot, "N31_CURSOR_EPOCH_OR_SEQUENCE_MISMATCH",
        this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, health));
      this.counters.gapEmissions += 1;
      return () => undefined;
    }
    if (!cursor) {
      if (!emit(envelope(
        "snapshot",
        snapshot,
        cursorPayload(snapshot),
        this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
        health,
      ))) return () => undefined;
      this.counters.snapshotEmissions += 1;
    } else if (cursor.sequence < snapshot.projectionSequence) {
      this.counters.resumedSubscriptions += 1;
      const replay = (await localRead(this.repository.journalAfter(
        workspaceId, environment, profileId, cursor.epoch, cursor.sequence, REPLAY_LIMIT,
      ))).filter(entry => entry.projectionSequence <= snapshot.projectionSequence);
      if (!contiguous(replay, cursor.sequence, snapshot.projectionSequence)) {
        emit(gap(snapshot, "N31_CURSOR_HISTORY_EVICTED",
          this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, health));
        this.counters.gapEmissions += 1;
        return () => undefined;
      }
      for (const entry of replay) {
        if (!emit(delta(entry, snapshot.lastSuccessfulRefreshAt,
          this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, health))) return () => undefined;
        this.counters.deltaEmissions += 1;
      }
    }

    if (this.stopped) throw new LocalRealtimeError("N31_SERVICE_STOPPED", 503);
    let group = this.groups.get(key);
    if (!group) {
      group = {
        workspaceId, environment, profileId,
        snapshot: thinSnapshot(snapshot),
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        subscribers: new Set(),
        health,
        statusSignature: freshnessSignature(
          snapshot, health, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
        ),
        nextHealthCheckAt: Date.now() + HEALTH_CHECK_MS,
      };
      this.groups.set(key, group);
      this.counters.groupsStarted += 1;
    }
    const subscriber = { emit, sequence: snapshot.projectionSequence };
    group.subscribers.add(subscriber);
    this.counters.subscriptions += 1;
    this.ensureTimer();
    return () => {
      group!.subscribers.delete(subscriber);
      if (group!.subscribers.size === 0 && this.groups.get(key) === group) this.groups.delete(key);
      if (this.groups.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  heartbeat(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): LocalRealtimeEnvelope {
    return {
      schema_version: "portal.execution.profile-realtime.v1",
      event_type: "heartbeat", terminal: false, reconnect_required: false,
      workspace_id: workspaceId, environment, profile_id: profileId,
      cursor: null, projection_epoch: null, projection_sequence: null, payload_digest: null,
      source_as_of: null, received_at: new Date().toISOString(),
      last_successful_refresh_at: null, availability: "UNKNOWN", freshness: "UNKNOWN", completeness: "UNKNOWN",
      recovery: null, observation: null,
      payload: {},
    };
  }

  authExpired(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): LocalRealtimeEnvelope {
    return {
      ...this.heartbeat(workspaceId, environment, profileId),
      event_type: "auth.expired", terminal: true, reconnect_required: false,
    };
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    for (const group of this.groups.values()) this.terminate(group, "N31_SERVICE_STOPPED");
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.groups.clear();
  }

  /**
   * Admin-safe process telemetry.  It intentionally exposes bounded local
   * counters and fixed environment-independent thresholds only; no user,
   * source relation, cursor, JWT, mTLS material, request path or business row
   * enters this diagnostic surface.
   */
  diagnostics(): Record<string, unknown> {
    const activeSubscribers = [...this.groups.values()]
      .reduce((total, group) => total + group.subscribers.size, 0);
    return {
      active_scope_groups: this.groups.size,
      active_subscribers: activeSubscribers,
      local_tail_poll_ms: SHARED_POLL_MS,
      health_check_ms: HEALTH_CHECK_MS,
      thresholds: {
        slow_reader_policy: "TERMINAL_PROJECTION_GAP",
        reconnect_policy: "PORTAL_CURSOR_RESUME_ONLY",
        browser_source_calls: 0,
        maximum_scope_groups: MAX_SCOPE_GROUPS,
        maximum_subscribers_per_scope: MAX_SUBSCRIBERS_PER_SCOPE,
      },
      counters: { ...this.counters },
    };
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(() => undefined); }, SHARED_POLL_MS);
    this.timer.unref();
  }

  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const count = this.pending.get(key) ?? 0;
    if (this.stopped || count >= MAX_PENDING_PER_SCOPE ||
        (!this.jobs.has(key) && this.jobs.size >= MAX_SCOPE_GROUPS)) {
      return Promise.reject(new LocalRealtimeError("N31_SUBSCRIBER_LIMIT", 429));
    }
    this.pending.set(key, count + 1);
    const next = (this.jobs.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
    this.jobs.set(key, next);
    void next.finally(() => {
      const left = (this.pending.get(key) ?? 1) - 1;
      if (left) this.pending.set(key, left); else this.pending.delete(key);
      if (this.jobs.get(key) === next) this.jobs.delete(key);
    }).catch(() => undefined);
    return next;
  }

  private async tick(): Promise<void> {
    // Independent bounded scopes: one slow Paper read cannot block Live/Sandbox.
    await Promise.all([...this.groups].map(([key, group]) => {
      if (this.jobs.has(key)) return Promise.resolve();
      return this.serialize(key, () => this.tickGroup(key, group)).catch(() => {
        this.terminate(group, "N31_LOCAL_READ_FAILED");
      });
    }));
  }

  private async tickGroup(key: string, group: ScopeGroup): Promise<void> {
    if (this.groups.get(key) !== group || this.stopped) return;
    try {
      this.counters.metadataReads += 1;
      const metadata = await localRead(this.repository.snapshotMetadata(group.workspaceId, group.environment, group.profileId));
      if (this.groups.get(key) !== group || this.stopped) return;
      if (!metadata) { this.terminate(group, "N31_PROJECTION_NOT_READY"); return; }
      if (metadata.projectionEpoch !== group.epoch || metadata.projectionSequence < group.sequence) {
        this.terminate(group, "N31_PROJECTION_EPOCH_CHANGED"); return;
      }
      let snapshot = { ...group.snapshot, ...metadata };
      if (Date.now() >= group.nextHealthCheckAt) {
        group.health = await localRead(this.repository.refreshHealth(group.workspaceId, group.environment, group.profileId));
        group.nextHealthCheckAt = Date.now() + HEALTH_CHECK_MS;
      }
      if (this.groups.get(key) !== group || this.stopped) return;
      if (snapshot.projectionSequence > group.sequence) {
        // Full provenance/relation count is reloaded only on a real revision.
        const changed = await localRead(this.repository.snapshot(group.workspaceId,group.environment,group.profileId));
        if (!changed || changed.projectionEpoch !== group.epoch) { this.terminate(group,"N31_PROJECTION_EPOCH_CHANGED"); return; }
        snapshot = changed;
        this.counters.journalReads += 1;
        // A commit after the metadata read is handled next tick, not a false gap.
        const entries = (await localRead(this.repository.journalAfter(
          group.workspaceId, group.environment, group.profileId, group.epoch, group.sequence, REPLAY_LIMIT,
        ))).filter(entry => entry.projectionSequence <= snapshot.projectionSequence);
        if (this.groups.get(key) !== group || this.stopped) return;
        if (!contiguous(entries, group.sequence, snapshot.projectionSequence)) {
          this.terminate(group, "N31_PROJECTION_HISTORY_GAP"); return;
        }
        for (const entry of entries) {
          this.broadcast(group, delta(entry, snapshot.lastSuccessfulRefreshAt,
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, group.health));
          group.sequence = entry.projectionSequence;
        }
      }
      group.snapshot = thinSnapshot(snapshot);
      const signature = freshnessSignature(snapshot, group.health, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS);
      // Status follows data; it is not permission to skip an undelivered delta.
      if (signature !== group.statusSignature && this.groups.get(key) === group) {
        this.broadcast(group, statusSnapshot(snapshot, group.health, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
        group.statusSignature = signature;
        this.counters.statusEmissions += group.subscribers.size;
      }
    } catch {
      this.counters.readFailures += 1;
      this.terminate(group, "N31_LOCAL_READ_FAILED");
    }
  }

  private terminate(group: ScopeGroup, reason: string): void {
    this.broadcast(group, gap(group.snapshot, reason, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
      { ...group.health, state: "RECOVERING", reasonCode: reason }));
    group.subscribers.clear();
    const key = scopeKey(group.workspaceId, group.environment, group.profileId);
    if (this.groups.get(key) === group) this.groups.delete(key);
    if (!this.groups.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private broadcast(group: ScopeGroup, event: LocalRealtimeEnvelope): void {
    let delivered = 0;
    for (const subscriber of group.subscribers) {
      // A concurrent join may already have bootstrapped this revision.
      if (event.event_type === "delta" && event.projection_sequence! <= subscriber.sequence) continue;
      let accepted = false;
      try { accepted = subscriber.emit(event); } catch { /* isolate a broken downstream */ }
      if (!accepted || event.terminal) {
        group.subscribers.delete(subscriber);
        if (!accepted) this.counters.slowReaderDrops += 1;
        else delivered += 1;
      } else {
        if (event.event_type === "delta") subscriber.sequence = event.projection_sequence!;
        delivered += 1;
      }
    }
    if (event.event_type === "delta") this.counters.deltaEmissions += delivered;
    if (event.event_type === "projection.gap") this.counters.gapEmissions += delivered;
    // A backpressured downstream must not leave an empty tail group/timer in
    // memory.  It has already received a terminal gap at the controller
    // boundary, so removing this local group cannot discard a resumable
    // browser subscription.
    if (group.subscribers.size === 0) {
      this.groups.delete(scopeKey(group.workspaceId, group.environment, group.profileId));
      if (this.groups.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }

  private async requiredSnapshot(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<ProfileProjectionSnapshot> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      throw new LocalRealtimeError("N31_LOCAL_PROJECTION_DISABLED", 503);
    }
    this.counters.bootstrapReads += 1;
    const snapshot = await localRead(this.repository.snapshot(workspaceId, environment, profileId));
    if (!snapshot) throw new LocalRealtimeError("N31_PROJECTION_NOT_READY", 503);
    return snapshot;
  }
}

/** Retain provenance/count only, not multi-megabyte business rows per tail. */
function thinSnapshot(snapshot: ProfileProjectionSnapshot): ProfileProjectionSnapshot {
  return { ...snapshot, document: { ...snapshot.document,
    relations: Object.fromEntries(Object.entries(snapshot.document.relations)
      .map(([key, value]) => [key, { ...value, items: [] }])),
  } };
}

/** Detach failed streams promptly; late PG completions cannot mutate the group. */
async function localRead<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LocalRealtimeError("N31_LOCAL_READ_TIMEOUT", 503)), 2_000);
      timer.unref();
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export class LocalRealtimeError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

function parseCursor(value: string | undefined): { epoch: string; sequence: number } | null {
  if (!value) return null;
  const match = CURSOR.exec(value);
  if (!match) throw new LocalRealtimeError("N31_CURSOR_INVALID", 400);
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence)) throw new LocalRealtimeError("N31_CURSOR_INVALID", 400);
  return { epoch: match[1], sequence };
}

function contiguous(entries: readonly ProfileProjectionJournalEntry[], after: number, target: number): boolean {
  if (entries.length !== target - after) return false;
  return entries.every((entry, index) => entry.projectionSequence === after + index + 1);
}

function delta(
  entry: ProfileProjectionJournalEntry,
  lastRefresh: Date,
  pollIntervalMs: number,
  health: ProfileProjectionRefreshHealth,
): LocalRealtimeEnvelope {
  return {
    schema_version: "portal.execution.profile-realtime.v1",
    event_type: "delta", terminal: false, reconnect_required: false,
    workspace_id: entry.workspaceId, environment: entry.environment, profile_id: entry.profileId,
    cursor: `${entry.projectionEpoch}:${entry.projectionSequence}`,
    projection_epoch: entry.projectionEpoch, projection_sequence: entry.projectionSequence,
    payload_digest: entry.payloadDigest, source_as_of: entry.sourceAsOf?.toISOString() ?? null,
    received_at: entry.receivedAt.toISOString(), last_successful_refresh_at: lastRefresh.toISOString(),
    availability: availabilityFor(health),
    freshness: freshnessFor(Date.now() - lastRefresh.valueOf(), pollIntervalMs, health),
    completeness: entry.completeness,
    recovery: recoveryEnvelope(health),
    observation: observationFromEntry(entry),
    payload: safeObservationPayload(entry),
  };
}

/**
 * The screen BFF already owns the data snapshot. Realtime bootstrap therefore
 * returns only cursor/provenance metadata; copying the complete hot projection
 * here would send the same multi-megabyte document a second time on every
 * screen mount and recovery.
 */
function cursorPayload(snapshot: ProfileProjectionSnapshot): Record<string, unknown> {
  return {
    snapshot_mode: "CURSOR_ONLY",
    relation_count: Object.keys(snapshot.document.relations).length,
    source_contract_revision: snapshot.document.source_contract_revision,
    source_catalogue_sha256: snapshot.sourceCatalogueSha256 ?? snapshot.document.source_catalogue_sha256 ?? null,
  };
}

function envelope(
  eventType: "snapshot",
  snapshot: ProfileProjectionSnapshot,
  payload: Record<string, unknown>,
  pollIntervalMs: number,
  health: ProfileProjectionRefreshHealth,
): LocalRealtimeEnvelope {
  return {
    schema_version: "portal.execution.profile-realtime.v1",
    event_type: eventType, terminal: false, reconnect_required: false,
    workspace_id: snapshot.document.workspace_id, environment: snapshot.document.environment,
    profile_id: snapshot.document.profile_id,
    cursor: `${snapshot.projectionEpoch}:${snapshot.projectionSequence}`,
    projection_epoch: snapshot.projectionEpoch, projection_sequence: snapshot.projectionSequence,
    payload_digest: snapshot.payloadDigest, source_as_of: snapshot.sourceAsOf?.toISOString() ?? null,
    received_at: snapshot.receivedAt.toISOString(),
    last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
    availability: availabilityFor(health),
    freshness: freshnessFor(Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf(), pollIntervalMs, health),
    completeness: snapshot.completeness,
    recovery: recoveryEnvelope(health),
    observation: observationFromSnapshot(snapshot),
    payload,
  };
}

function observationFromSnapshot(snapshot: ProfileProjectionSnapshot): PortalObservationDescriptor {
  return {
    authority: "PORTAL_OBSERVATION",
    semantics: "BOUNDED_CURRENT_PAGE",
    derived: false,
    operation_id: PROFILE_OBSERVATION_OPERATION_ID,
    scope: {
      workspace_id: snapshot.document.workspace_id,
      environment: snapshot.document.environment,
      profile_id: snapshot.document.profile_id,
      resource_kind: "PROFILE",
      resource_id: snapshot.document.profile_id,
      venue: null,
    },
    source: {
      contract_revision: snapshot.document.source_contract_revision,
      catalogue_revision: snapshot.sourceCatalogueSha256 ?? snapshot.document.source_catalogue_sha256 ?? null,
      as_of_ms: utcMs(snapshot.sourceAsOf),
      received_at_ms: snapshot.receivedAt.valueOf(),
    },
    coverage: {
      kind: "CURRENT_PROFILE_PROJECTION",
      relation_count: Object.keys(snapshot.document.relations).length,
    },
  };
}

function observationFromEntry(entry: ProfileProjectionJournalEntry): PortalObservationDescriptor {
  return {
    authority: entry.observationAuthority,
    semantics: entry.observationSemantics,
    derived: false,
    operation_id: PROFILE_OBSERVATION_OPERATION_ID,
    scope: {
      workspace_id: entry.workspaceId,
      environment: entry.environment,
      profile_id: entry.profileId,
      resource_kind: "PROFILE",
      resource_id: entry.profileId,
      venue: null,
    },
    source: {
      contract_revision: entry.sourceContractRevision,
      catalogue_revision: entry.sourceCatalogueSha256,
      as_of_ms: utcMs(entry.sourceAsOf),
      received_at_ms: entry.receivedAt.valueOf(),
    },
    coverage: {
      kind: "CURRENT_PROFILE_PROJECTION",
      relation_count: null,
    },
  };
}

/**
 * The persisted journal is server-side.  Its older payload shape contained
 * private Manager relation keys; return only the named screen identifiers,
 * fixed observation operation, and a locally bound revalidation hint even
 * while a short legacy journal window still exists after the additive
 * migration.  Do not trust a persisted operation list: rederive it from the
 * frozen Portal registry so a legacy/forensic row cannot turn SSE into a
 * browser-side generic query surface.
 */
function safeObservationPayload(entry: ProfileProjectionJournalEntry): Record<string, unknown> {
  const candidates = entry.payload.affected_screen_ids;
  const affectedScreenIds = Array.isArray(candidates)
    ? candidates.filter((item): item is string => typeof item === "string" && /^[A-Z0-9_]{3,128}$/.test(item))
    : [];
  const revalidation = profileObservationRevalidation(affectedScreenIds, {
    projectionEpoch: entry.projectionEpoch,
    projectionSequence: entry.projectionSequence,
    payloadDigest: entry.payloadDigest,
  });
  return {
    schema_version: "portal.execution.observation-revision.v1",
    observation_authority: entry.observationAuthority,
    observation_semantics: entry.observationSemantics,
    operation_id: PROFILE_OBSERVATION_OPERATION_ID,
    affected_screen_ids: revalidation.affected_screen_ids,
    revalidation,
  };
}

function utcMs(value: Date | null): number | null {
  return value ? value.valueOf() : null;
}

function statusSnapshot(
  snapshot: ProfileProjectionSnapshot,
  health: ProfileProjectionRefreshHealth,
  pollIntervalMs: number,
): LocalRealtimeEnvelope {
  return envelope("snapshot", snapshot, {
    snapshot_mode: "STATUS_ONLY",
    reason_code: health.reasonCode,
    resnapshot_not_before: health.retryNotBefore?.toISOString() ?? null,
  }, pollIntervalMs, health);
}

function gap(
  snapshot: ProfileProjectionSnapshot,
  reason: string,
  pollIntervalMs: number,
  health: ProfileProjectionRefreshHealth,
): LocalRealtimeEnvelope {
  return {
    ...envelope("snapshot", snapshot, { reason_code: reason }, pollIntervalMs, health),
    event_type: "projection.gap", terminal: true, reconnect_required: true,
  };
}

function freshnessFor(
  ageMs: number,
  pollIntervalMs: number,
  health: ProfileProjectionRefreshHealth,
): "FRESH" | "AGING" | "STALE" {
  // A current projection remains safe to render while its coordinator is
  // recovering, but must never be labelled fresh.  The browser retains its
  // own panel and waits for a Portal-local revision/status update.
  if (health.state === "RECOVERING") return "STALE";
  return ageFreshness(ageMs, pollIntervalMs);
}

function ageFreshness(ageMs: number, pollIntervalMs: number): "FRESH" | "AGING" | "STALE" {
  if (ageMs <= pollIntervalMs * 2) return "FRESH";
  if (ageMs <= pollIntervalMs * 4) return "AGING";
  return "STALE";
}

function availabilityFor(health: ProfileProjectionRefreshHealth): "AVAILABLE" | "DEGRADED" {
  return health.state === "RECOVERING" ? "DEGRADED" : "AVAILABLE";
}

function recoveryEnvelope(health: ProfileProjectionRefreshHealth): LocalRealtimeEnvelope["recovery"] {
  return {
    state: health.state,
    reason_code: health.reasonCode,
    retry_not_before: health.retryNotBefore?.toISOString() ?? null,
  };
}

function freshnessSignature(
  snapshot: ProfileProjectionSnapshot,
  health: ProfileProjectionRefreshHealth,
  pollIntervalMs: number,
): string {
  return [
    availabilityFor(health),
    freshnessFor(Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf(), pollIntervalMs, health),
    health.state,
    health.reasonCode ?? "",
    health.retryNotBefore?.toISOString() ?? "",
  ].join("|");
}

function scopeKey(workspaceId: string, environment: ProjectionEnvironment, profileId: string): string {
  return `${workspaceId}\0${environment}\0${profileId}`;
}
