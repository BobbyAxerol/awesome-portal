import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { MaximumDataEnvironment } from "./maximum-data-intake";

const CONTINUATION_PREFIX = "mdc1.";
const CONTINUATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPERATION_ID = /^[A-Za-z][A-Za-z0-9]{2,127}$/;
const PROFILE_ID = /^(?:PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$/;
const CATALOGUE_SHA256 = /^sha256:[0-9a-f]{64}$/;

export interface MaximumDataContinuationScope {
  operationId: string;
  workspaceId: string;
  principalId: string;
  principalRole: string;
  environment: MaximumDataEnvironment;
  profileId: string;
  sourceContractRevision: string;
  sourceCatalogueSha256: string;
}

export class MaximumDataContinuationError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

/**
 * Source Manager cursors are relation-bound private tokens.  This repository
 * keeps them in Portal PostgreSQL and binds every lookup to the one named
 * operation, authenticated principal, workspace and profile.  The browser
 * only receives a short Portal handle and cannot replay it cross-scope.
 */
@Injectable()
export class MaximumDataContinuationRepository {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async issue(scope: MaximumDataContinuationScope, sourceCursor: string): Promise<string> {
    validateScope(scope);
    if (!validCursor(sourceCursor)) throw invalidContinuation();
    const continuationId = randomUUID();
    const principalDigest = digest(scope.principalId, scope.principalRole);
    await this.pool.query(
      `WITH expired AS (
         DELETE FROM execution_manager_operation_continuations
         WHERE expires_at <= clock_timestamp()
       ), overflow AS (
         DELETE FROM execution_manager_operation_continuations
         WHERE continuation_id IN (
           SELECT continuation_id
           FROM execution_manager_operation_continuations
           WHERE operation_id=$1 AND workspace_id=$2 AND principal_digest=$3
             AND environment=$4 AND profile_id=$5
           ORDER BY issued_at DESC, continuation_id DESC
           OFFSET 127
         )
       )
       INSERT INTO execution_manager_operation_continuations
         (continuation_id,operation_id,workspace_id,principal_digest,environment,
          profile_id,source_contract_revision,source_catalogue_sha256,source_cursor,
          issued_at,expires_at)
       VALUES ($6,$1,$2,$3,$4,$5,$7,$8,$9,clock_timestamp(),
               clock_timestamp() + ($10::integer * interval '1 second'))`,
      [
        scope.operationId,
        scope.workspaceId,
        principalDigest,
        scope.environment,
        scope.profileId,
        continuationId,
        scope.sourceContractRevision,
        scope.sourceCatalogueSha256,
        sourceCursor,
        this.config.QUERY_CURSOR_TTL_SECONDS,
      ],
    );
    return `${CONTINUATION_PREFIX}${continuationId}`;
  }

  async resolve(scope: MaximumDataContinuationScope, opaqueCursor: string): Promise<string> {
    validateScope(scope);
    const continuationId = parseOpaqueCursor(opaqueCursor);
    const result = await this.pool.query<{ source_cursor: string }>(
      `SELECT source_cursor
       FROM execution_manager_operation_continuations
       WHERE continuation_id=$1 AND operation_id=$2 AND workspace_id=$3
         AND principal_digest=$4 AND environment=$5 AND profile_id=$6
         AND source_contract_revision=$7 AND source_catalogue_sha256=$8
         AND expires_at > clock_timestamp()`,
      [
        continuationId,
        scope.operationId,
        scope.workspaceId,
        digest(scope.principalId, scope.principalRole),
        scope.environment,
        scope.profileId,
        scope.sourceContractRevision,
        scope.sourceCatalogueSha256,
      ],
    );
    if (result.rows.length !== 1 || !validCursor(result.rows[0].source_cursor)) {
      throw invalidContinuation();
    }
    return result.rows[0].source_cursor;
  }
}

function validateScope(scope: MaximumDataContinuationScope): void {
  if (
    !OPERATION_ID.test(scope.operationId) ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(scope.workspaceId) ||
    !/^[A-Za-z0-9._:-]{1,191}$/.test(scope.principalId) ||
    !/^[A-Za-z0-9._:-]{1,191}$/.test(scope.principalRole) ||
    !["paper", "sandbox", "live"].includes(scope.environment) ||
    !PROFILE_ID.test(scope.profileId) ||
    !CATALOGUE_SHA256.test(scope.sourceCatalogueSha256) ||
    scope.sourceContractRevision.length < 1 ||
    scope.sourceContractRevision.length > 190
  ) throw new Error("EDS01 continuation scope is invalid");
}

function validCursor(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= 4_096;
}

function parseOpaqueCursor(value: string): string {
  if (!value.startsWith(CONTINUATION_PREFIX)) throw invalidContinuation();
  const continuationId = value.slice(CONTINUATION_PREFIX.length);
  if (!CONTINUATION_ID.test(continuationId)) throw invalidContinuation();
  return continuationId;
}

function digest(principalId: string, principalRole: string): string {
  return `sha256:${createHash("sha256")
    .update(`${principalId}\0${principalRole}`, "utf8")
    .digest("hex")}`;
}

function invalidContinuation(): MaximumDataContinuationError {
  return new MaximumDataContinuationError("EDS01_CURSOR_INVALID_OR_EXPIRED", 400);
}
