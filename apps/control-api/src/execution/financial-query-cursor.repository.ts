import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { ProjectionEnvironment } from "./profile-projection.repository";

const CURSOR_PREFIX = "fqc1.";
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface FinancialQueryCursorScope {
  operationId: string;
  workspaceId: string;
  principalId: string;
  principalRole: string;
  environment: ProjectionEnvironment;
  profileId: string;
  queryFingerprint: string;
}

export class FinancialQueryCursorError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

/**
 * `kc1.*` durable-mirror cursors are integrity protected, not encrypted.
 * They belong in Portal storage so a browser receives only an unguessable
 * `fqc1.<uuid>` handle bound to one user, workspace, profile and named BFF.
 */
@Injectable()
export class ExecutionFinancialQueryCursorRepository {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async issue(scope: FinancialQueryCursorScope, durableCursor: string): Promise<string> {
    validateScope(scope);
    if (!validDurableCursor(durableCursor)) throw invalidCursor();
    const cursorId = randomUUID();
    const principalDigest = digest(scope.principalId, scope.principalRole);
    await this.pool.query(
      `WITH expired AS (
         DELETE FROM execution_financial_query_cursors
          WHERE expires_at <= clock_timestamp()
       ), overflow AS (
         DELETE FROM execution_financial_query_cursors
          WHERE cursor_id IN (
            SELECT cursor_id
              FROM execution_financial_query_cursors
             WHERE operation_id=$1 AND workspace_id=$2 AND principal_digest=$3
               AND environment=$4 AND profile_id=$5 AND query_fingerprint=$6
             ORDER BY issued_at DESC, cursor_id DESC
             OFFSET 127
          )
       )
       INSERT INTO execution_financial_query_cursors
         (cursor_id,operation_id,workspace_id,principal_digest,environment,profile_id,
          query_fingerprint,durable_cursor,issued_at,expires_at)
       VALUES ($7::uuid,$1,$2,$3,$4,$5,$6,$8,clock_timestamp(),
               clock_timestamp() + ($9::integer * interval '1 second'))`,
      [
        scope.operationId,
        scope.workspaceId,
        principalDigest,
        scope.environment,
        scope.profileId,
        scope.queryFingerprint,
        cursorId,
        durableCursor,
        this.config.QUERY_CURSOR_TTL_SECONDS,
      ],
    );
    return `${CURSOR_PREFIX}${cursorId}`;
  }

  async resolve(scope: FinancialQueryCursorScope, opaqueCursor: string): Promise<string> {
    validateScope(scope);
    const cursorId = parseCursor(opaqueCursor);
    const result = await this.pool.query<{ durable_cursor: string }>(
      `SELECT durable_cursor
         FROM execution_financial_query_cursors
        WHERE cursor_id=$1::uuid AND operation_id=$2 AND workspace_id=$3
          AND principal_digest=$4 AND environment=$5 AND profile_id=$6
          AND query_fingerprint=$7 AND expires_at > clock_timestamp()`,
      [
        cursorId,
        scope.operationId,
        scope.workspaceId,
        digest(scope.principalId, scope.principalRole),
        scope.environment,
        scope.profileId,
        scope.queryFingerprint,
      ],
    );
    const durableCursor = result.rows[0]?.durable_cursor;
    if (!durableCursor || !validDurableCursor(durableCursor)) throw invalidCursor();
    return durableCursor;
  }
}

function validateScope(scope: FinancialQueryCursorScope): void {
  if (
    !/^[A-Za-z][A-Za-z0-9]{2,127}$/.test(scope.operationId) ||
    !/^[A-Za-z0-9._:@-]{1,128}$/.test(scope.workspaceId) ||
    !/^[A-Za-z0-9._:@-]{1,191}$/.test(scope.principalId) ||
    !/^[A-Za-z0-9._:@-]{1,191}$/.test(scope.principalRole) ||
    !["paper", "sandbox", "live"].includes(scope.environment) ||
    !/^(?:PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$/.test(scope.profileId) ||
    !/^sha256:[0-9a-f]{64}$/.test(scope.queryFingerprint)
  ) throw new Error("EDS07 financial cursor scope is invalid");
}

function validDurableCursor(value: string): boolean {
  return value.startsWith("kc1.") && Buffer.byteLength(value, "utf8") <= 4_096;
}

function parseCursor(value: string): string {
  if (!value.startsWith(CURSOR_PREFIX)) throw invalidCursor();
  const cursorId = value.slice(CURSOR_PREFIX.length);
  if (!CURSOR_ID.test(cursorId)) throw invalidCursor();
  return cursorId;
}

function digest(principalId: string, principalRole: string): string {
  return `sha256:${createHash("sha256")
    .update(`${principalId}\0${principalRole}`, "utf8")
    .digest("hex")}`;
}

function invalidCursor(): FinancialQueryCursorError {
  return new FinancialQueryCursorError("EDS07_CURSOR_INVALID_OR_EXPIRED", 400);
}
