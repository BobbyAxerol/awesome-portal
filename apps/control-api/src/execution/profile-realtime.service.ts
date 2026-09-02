import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionJournalEntry,
  ProfileProjectionSnapshot,
  ProjectionEnvironment,
} from "./profile-projection.repository";

const CURSOR = /^([0-9a-f-]{36}):(\d+)$/;
const REPLAY_LIMIT = 1_000;
const SHARED_POLL_MS = 250;

export type LocalRealtimeKind =
  | "snapshot"
  | "delta"
  | "heartbeat"
  | "auth.expired"
  | "projection.gap";

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
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
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
}

/** One SGP-local projection tail per scope; browser count never increases AWS-HK reads. */
@Injectable()
export class ExecutionProfileRealtimeService implements OnApplicationShutdown {
  private readonly groups = new Map<string, ScopeGroup>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

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
    return envelope("snapshot", snapshot, {
      document: snapshot.document,
    }, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS);
  }

  async subscribe(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    rawCursor: string | undefined,
    emit: Subscriber["emit"],
  ): Promise<() => void> {
    const snapshot = await this.requiredSnapshot(workspaceId, environment, profileId);
    const cursor = parseCursor(rawCursor);
    if (cursor && (cursor.epoch !== snapshot.projectionEpoch || cursor.sequence > snapshot.projectionSequence)) {
      emit(gap(snapshot, "N31_CURSOR_EPOCH_OR_SEQUENCE_MISMATCH",
        this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
      return () => undefined;
    }
    if (!cursor) {
      if (!emit(envelope("snapshot", snapshot, { document: snapshot.document },
        this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS))) return () => undefined;
    } else if (cursor.sequence < snapshot.projectionSequence) {
      const replay = await this.repository.journalAfter(
        workspaceId, environment, profileId, cursor.epoch, cursor.sequence, REPLAY_LIMIT,
      );
      if (!contiguous(replay, cursor.sequence, snapshot.projectionSequence)) {
        emit(gap(snapshot, "N31_CURSOR_HISTORY_EVICTED",
          this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
        return () => undefined;
      }
      for (const entry of replay) {
        if (!emit(delta(entry, snapshot.lastSuccessfulRefreshAt,
          this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS))) return () => undefined;
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
      };
      this.groups.set(key, group);
    }
    const subscriber = { emit };
    group.subscribers.add(subscriber);
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
      last_successful_refresh_at: null, freshness: "UNKNOWN", completeness: "UNKNOWN",
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
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
          this.groups.delete(key);
          continue;
        }
        if (snapshot.projectionSequence <= group.sequence) continue;
        const entries = await this.repository.journalAfter(
          group.workspaceId, group.environment, group.profileId,
          group.epoch, group.sequence, REPLAY_LIMIT,
        );
        if (!contiguous(entries, group.sequence, snapshot.projectionSequence)) {
          this.broadcast(group, gap(snapshot, "N31_PROJECTION_HISTORY_GAP",
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
          this.groups.delete(key);
          continue;
        }
        for (const entry of entries) {
          this.broadcast(group, delta(entry, snapshot.lastSuccessfulRefreshAt,
            this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS));
          group.sequence = entry.projectionSequence;
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private broadcast(group: ScopeGroup, event: LocalRealtimeEnvelope): void {
    for (const subscriber of group.subscribers) {
      if (!subscriber.emit(event)) group.subscribers.delete(subscriber);
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
): LocalRealtimeEnvelope {
  return {
    schema_version: "portal.execution.profile-realtime.v1",
    event_type: "delta", terminal: false, reconnect_required: false,
    workspace_id: entry.workspaceId, environment: entry.environment, profile_id: entry.profileId,
    cursor: `${entry.projectionEpoch}:${entry.projectionSequence}`,
    projection_epoch: entry.projectionEpoch, projection_sequence: entry.projectionSequence,
    payload_digest: entry.payloadDigest, source_as_of: entry.sourceAsOf?.toISOString() ?? null,
    received_at: entry.receivedAt.toISOString(), last_successful_refresh_at: lastRefresh.toISOString(),
    freshness: ageFreshness(Date.now() - lastRefresh.valueOf(), pollIntervalMs),
    completeness: entry.completeness, payload: entry.payload,
  };
}

function envelope(
  eventType: "snapshot",
  snapshot: ProfileProjectionSnapshot,
  payload: Record<string, unknown>,
  pollIntervalMs: number,
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
    freshness: ageFreshness(Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf(), pollIntervalMs),
    completeness: snapshot.completeness, payload,
  };
}

function gap(snapshot: ProfileProjectionSnapshot, reason: string, pollIntervalMs: number): LocalRealtimeEnvelope {
  return {
    ...envelope("snapshot", snapshot, { reason_code: reason }, pollIntervalMs),
    event_type: "projection.gap", terminal: true, reconnect_required: true,
  };
}

function ageFreshness(ageMs: number, pollIntervalMs: number): "FRESH" | "AGING" | "STALE" {
  if (ageMs <= pollIntervalMs * 2) return "FRESH";
  if (ageMs <= pollIntervalMs * 4) return "AGING";
  return "STALE";
}

function scopeKey(workspaceId: string, environment: ProjectionEnvironment, profileId: string): string {
  return `${workspaceId}\0${environment}\0${profileId}`;
}
