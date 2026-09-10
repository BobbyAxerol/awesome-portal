import type { PoolClient } from "pg";
import type {
  ProfileProjectionDocument,
  ProjectionCompleteness,
  ProjectionEnvironment,
  ProjectionRow,
} from "./profile-projection.repository";

/** A server-only checkpoint. The raw source cursor remains in the legacy coordinator table. */
export interface DurableMirrorRelationCursor {
  relationKey: string;
  sourceCursor: string | null;
}

/**
 * Rows accepted during an incrementally drained source page. They are passed
 * alongside (not embedded in) the bounded JSONB compatibility snapshot.
 */
export type DurableMirrorRetainedRangeRows = Readonly<Record<string, readonly ProjectionRow[]>>;

export interface DurableMirrorCommitInput {
  document: ProfileProjectionDocument;
  sourceEpoch: string;
  sourceCursor: string;
  sourceAsOf: Date | null;
  receivedAt: Date;
  completeness: ProjectionCompleteness;
  projectionEpoch: string;
  projectionSequence: number;
  payloadDigest: string;
  relationCursors: readonly DurableMirrorRelationCursor[];
  retainedRangeRows: DurableMirrorRetainedRangeRows;
}

/**
 * A durable-mirror write is part of the same Portal observation admission as
 * the compatibility snapshot.  A range-row digest conflict is deliberately
 * not an accepted observation: callers must preserve the last committed
 * snapshot/revision and may not publish a local revision tick for it.
 */
export type DurableMirrorCommitResult =
  | { outcome: "COMMITTED" | "DISABLED" }
  | { outcome: "QUARANTINED"; reasonCode: "EDS09B_DURABLE_OBSERVATION_QUARANTINED" };

/**
 * Kept as a narrow injection boundary so the legacy snapshot repository can
 * remain the atomic transaction owner and tests can prove rollback behavior.
 */
export interface DurableMirrorWriter {
  commitAcceptedProjection(
    client: PoolClient,
    input: DurableMirrorCommitInput,
  ): Promise<DurableMirrorCommitResult>;
}

export interface DurableMirrorScope {
  workspaceId: string;
  environment: ProjectionEnvironment;
  profileId: string;
}

/**
 * PHASE 2B (round 2) · the mirror's own account of its completeness.
 *
 * Deliberately an aggregate. `entity_key`, `row_id` and the payload digests
 * that the gap and conflict tables carry are forensic: they name a specific
 * order or position, and no operator screen needs them to learn that a
 * relation is incomplete.
 */
export interface DurableMirrorIntegrityFinding {
  /** A relation that did not arrive, or a row that arrived twice differently. */
  readonly kind: "GAP" | "CONFLICT";
  readonly relation_key: string;
  readonly reason_code: string;
  readonly findings: number;
  readonly first_detected_at_ms: number | null;
  readonly last_detected_at_ms: number | null;
}

export interface DurableMirrorIntegrity {
  /**
   * `READY` only with a current measured revision behind it — a zero count
   * without one would claim a clean mirror that was never looked at.
   * `PARTIAL` when anything was recorded. `UNAVAILABLE` when the mirror is
   * off, has never been measured, or could not be read.
   */
  readonly state: "READY" | "PARTIAL" | "UNAVAILABLE";
  readonly reason_code: string | null;
  readonly measured_revision: string | null;
  readonly measured_at_ms: number | null;
  readonly read_at_ms: number;
  /** Null, never zero, when there is no measurement to count. */
  readonly gap_findings: number | null;
  readonly conflict_findings: number | null;
  readonly total_findings: number | null;
  readonly findings: readonly DurableMirrorIntegrityFinding[];
}
