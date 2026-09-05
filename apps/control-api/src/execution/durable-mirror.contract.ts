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
