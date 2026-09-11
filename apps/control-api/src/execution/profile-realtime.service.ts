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
}

/** One SGP-local projection tail per scope; browser count never increases AWS-HK reads. */
@Injectable()
export class ExecutionProfileRealtimeService implements OnApplicationShutdown {
  private readonly groups = new Map<string, ScopeGroup>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly counters = {
    groupsStarted: 0,
    subscriptions: 0,
    resumedSubscriptions: 0,
    snapshotEmissions: 0,
    deltaEmissions: 0,
    statusEmissions: 0,
    slowReaderDrops: 0,
    gapEmissions: 0,
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
    const health = await this.repository.refreshHealth(workspaceId, environment, profileId);
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
    const snapshot = await this.requiredSnapshot(workspaceId, environment, profileId);
    const health = await this.repository.refreshHealth(workspaceId, environment, profileId);
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
      const replay = await this.repository.journalAfter(
        workspaceId, environment, profileId, cursor.epoch, cursor.sequence, REPLAY_LIMIT,
      );
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

    const key = scopeKey(workspaceId, environment, profileId);
    let group = this.groups.get(key);
    if (!group) {
      group = {
        workspaceId, environment, profileId,
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
    const subscriber = { emit };
    group.subscribers.add(subscriber);
    this.counters.subscriptions += 1;
    this.ensureTimer();
    return () => {
      group!.subscribers.delete(subscriber);
      if (group!.subscribers.size === 0) this.groups.delete(key);
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
      },
      counters: { ...this.counters },
    };
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), SHARED_POLL_MS);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const [key, group] of this.groups) {
        const snapshot = await this.repository.snapshot(group.workspaceId, group.environment, group.profileId)
          .catch(() => null);
        if (!snapshot || snapshot.projectionEpoch !== group.epoch) {
          if (snapshot) this.broadcast(group, gap(snapshot, "N31_PROJECTION_EPOCH_CHANGED",
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, group.health));
          this.groups.delete(key);
          continue;
        }
        if (Date.now() >= group.nextHealthCheckAt) {
          group.health = await this.repository.refreshHealth(
            group.workspaceId, group.environment, group.profileId,
          ).catch(() => group.health);
          group.nextHealthCheckAt = Date.now() + HEALTH_CHECK_MS;
        }
        const nextSignature = freshnessSignature(
          snapshot, group.health, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
        );
        if (nextSignature !== group.statusSignature) {
          this.broadcast(group, statusSnapshot(
            snapshot, group.health, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
          ));
          group.statusSignature = nextSignature;
          this.counters.statusEmissions += group.subscribers.size;
        }
        if (snapshot.projectionSequence <= group.sequence) continue;
        const entries = await this.repository.journalAfter(
          group.workspaceId, group.environment, group.profileId,
          group.epoch, group.sequence, REPLAY_LIMIT,
        );
        if (!contiguous(entries, group.sequence, snapshot.projectionSequence)) {
          this.broadcast(group, gap(snapshot, "N31_PROJECTION_HISTORY_GAP",
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, group.health));
          this.groups.delete(key);
          continue;
        }
        for (const entry of entries) {
          this.broadcast(group, delta(entry, snapshot.lastSuccessfulRefreshAt,
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS, group.health));
          group.sequence = entry.projectionSequence;
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private broadcast(group: ScopeGroup, event: LocalRealtimeEnvelope): void {
    let delivered = 0;
    for (const subscriber of group.subscribers) {
      if (!subscriber.emit(event)) {
        group.subscribers.delete(subscriber);
        this.counters.slowReaderDrops += 1;
      } else {
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
    const snapshot = await this.repository.snapshot(workspaceId, environment, profileId);
    if (!snapshot) throw new LocalRealtimeError("N31_PROJECTION_NOT_READY", 503);
    return snapshot;
  }
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
