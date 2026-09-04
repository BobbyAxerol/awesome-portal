import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";

const SOURCE_ID = /^[a-z][a-z0-9.-]{1,127}$/;
const PROFILE_ID = /^[A-Z][A-Z0-9_]{2,127}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const FRESHNESS = new Set([
  "FRESH", "AGING", "DEGRADED", "STALE", "PAUSED", "UNAVAILABLE", "UNKNOWN",
]);
const COMPLETENESS = new Set([
  "COMPLETE", "PARTIAL", "POLL_BOUNDED", "EVENT_SOURCED", "UNKNOWN",
]);

export interface SharedReadScope {
  sourceId: string;
  profileId: string;
  workspaceId: string;
  principalId: string;
  principalRole: string;
  adapterRevision: string;
  requestPath: string;
  /**
   * A named, source-qualified operation may be stricter than the cell-wide
   * defaults.  These values are part of the server-owned scope and never come
   * from a browser query.  Omitting them preserves the existing N21 policy.
   */
  admission?: Readonly<{
    sourceMaximumConcurrency: number;
    profileMaximumConcurrency: number;
  }>;
}

export interface SharedReadMetadata {
  authority: string;
  freshness: string;
  completeness: string;
  asOf: string;
}

export interface SharedReadCacheValue {
  body: unknown;
  etag: string;
  metadata: SharedReadMetadata;
  storedAt: string;
  expiresAt: string;
}

export type SharedReadAdmission =
  | { kind: "CACHE_HIT"; cacheKey: string; value: SharedReadCacheValue }
  | { kind: "FOLLOWER"; cacheKey: string }
  | { kind: "LEADER"; cacheKey: string; leaderId: string; leaseId: string; waitMs: number }
  | { kind: "DENIED"; cacheKey: string; reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED" | "N21_SHARED_RATE_BUDGET_EXHAUSTED" };

interface CacheRow {
  response_body: unknown;
  etag: string;
  authority: string;
  freshness: string;
  completeness: string;
  as_of: Date;
  stored_at: Date;
  expires_at: Date;
}

interface SharedReadIdentity {
  cacheKey: string;
  requestDigest: string;
  principalDigest: string;
}

/**
 * PostgreSQL-backed admission/coalescing authority shared by all Control API
 * replicas in one Portal cell. PostgreSQL time is authoritative, so replica
 * clock skew cannot create a source burst or extend a cache entry.
 */
@Injectable()
export class ExecutionSharedReadRepository {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async begin(scope: SharedReadScope): Promise<SharedReadAdmission> {
    validateScope(scope);
    const identity = sharedReadIdentity(scope);
    const leaderId = `bff:${randomUUID()}`;
    const leaseId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cached = await this.cache(client, scope, identity, true);
      if (cached) {
        await client.query("COMMIT");
        return { kind: "CACHE_HIT", cacheKey: identity.cacheKey, value: cached };
      }
      const flight = await client.query<{ leader_id: string }>(
        `INSERT INTO execution_shared_read_flights
           (cache_key, source_id, profile_id, workspace_id, principal_digest,
            adapter_revision, request_digest, leader_id, started_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),
                 clock_timestamp() + ($9::integer * interval '1 millisecond'))
         ON CONFLICT (cache_key) DO UPDATE SET
           source_id=EXCLUDED.source_id, profile_id=EXCLUDED.profile_id,
           workspace_id=EXCLUDED.workspace_id, principal_digest=EXCLUDED.principal_digest,
           adapter_revision=EXCLUDED.adapter_revision, request_digest=EXCLUDED.request_digest,
           leader_id=EXCLUDED.leader_id, started_at=EXCLUDED.started_at,
           expires_at=EXCLUDED.expires_at
         WHERE execution_shared_read_flights.expires_at <= clock_timestamp()
         RETURNING leader_id`,
        [
          identity.cacheKey, scope.sourceId, scope.profileId, scope.workspaceId,
          identity.principalDigest, scope.adapterRevision, identity.requestDigest,
          leaderId, this.config.EXECUTION_EDGE_CURRENT_SOURCE_LEASE_TTL_MS,
        ],
      );
      if (flight.rows.length === 0 || flight.rows[0].leader_id !== leaderId) {
        await client.query("COMMIT");
        return { kind: "FOLLOWER", cacheKey: identity.cacheKey };
      }
      const admission = await this.acquireQuota(client, scope, leaseId, leaderId);
      if (admission.kind === "DENIED") {
        await client.query(
          "DELETE FROM execution_shared_read_flights WHERE cache_key=$1 AND leader_id=$2",
          [identity.cacheKey, leaderId],
        );
        await client.query("COMMIT");
        return { ...admission, cacheKey: identity.cacheKey };
      }
      await client.query("COMMIT");
      return {
        kind: "LEADER",
        cacheKey: identity.cacheKey,
        leaderId,
        leaseId,
        waitMs: admission.waitMs,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async waitForLeader(scope: SharedReadScope, cacheKey: string): Promise<SharedReadCacheValue | null> {
    validateScope(scope);
    const identity = sharedReadIdentity(scope);
    if (identity.cacheKey !== cacheKey) throw new Error("N21 shared-read cache key scope drift");
    const deadline = Date.now() + this.config.EXECUTION_EDGE_CURRENT_SOURCE_COALESCE_WAIT_MS;
    while (Date.now() <= deadline) {
      const cached = await this.cache(this.pool, scope, identity, false);
      if (cached) return cached;
      const active = await this.pool.query<{ active: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM execution_shared_read_flights
           WHERE cache_key=$1 AND expires_at > clock_timestamp()
         ) AS active`,
        [cacheKey],
      );
      if (!active.rows[0]?.active) {
        // The leader publishes the cache row and deletes its flight in one
        // statement. That commit can land between the cache lookup above and
        // this flight lookup. Re-read once after observing the flight gone so
        // a follower cannot mistake a completed flight for a failed flight.
        return this.cache(this.pool, scope, identity, false);
      }
      await delay(Math.min(25, Math.max(1, deadline - Date.now())));
    }
    return null;
  }

  async complete(
    scope: SharedReadScope,
    admission: Extract<SharedReadAdmission, { kind: "LEADER" }>,
    body: unknown,
  ): Promise<SharedReadCacheValue> {
    const identity = sharedReadIdentity(scope);
    if (identity.cacheKey !== admission.cacheKey) throw new Error("N21 leader scope drift");
    const metadata = sourceMetadata(body);
    const serialized = JSON.stringify(body);
    const responseBytes = Buffer.byteLength(serialized, "utf8");
    if (responseBytes < 2 || responseBytes > this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES) {
      throw new Error("N21 shared-read response exceeds cache bound");
    }
    const etag = `"sha256-${sha256(serialized)}"`;
    const result = await this.pool.query<CacheRow>(
      `WITH owned AS (
         SELECT 1 FROM execution_shared_read_flights
         WHERE cache_key=$1 AND leader_id=$2 AND expires_at > clock_timestamp()
       ), upserted AS (
         INSERT INTO execution_shared_read_cache
           (cache_key,source_id,profile_id,workspace_id,principal_digest,
            adapter_revision,request_digest,etag,authority,freshness,completeness,
            as_of,response_body,response_bytes,stored_at,expires_at)
         SELECT $1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,
                clock_timestamp(),clock_timestamp() + ($16::integer * interval '1 millisecond')
         FROM owned
         ON CONFLICT (cache_key) DO UPDATE SET
           etag=EXCLUDED.etag, authority=EXCLUDED.authority,
           freshness=EXCLUDED.freshness, completeness=EXCLUDED.completeness,
           as_of=EXCLUDED.as_of, response_body=EXCLUDED.response_body,
           response_bytes=EXCLUDED.response_bytes, stored_at=EXCLUDED.stored_at,
           expires_at=EXCLUDED.expires_at
         RETURNING response_body,etag,authority,freshness,completeness,as_of,stored_at,expires_at
       ), released_flight AS (
         DELETE FROM execution_shared_read_flights WHERE cache_key=$1 AND leader_id=$2
       ), released_lease AS (
         DELETE FROM execution_shared_admission_leases WHERE lease_id=$17 AND owner_id=$2
       ) SELECT * FROM upserted`,
      [
        identity.cacheKey, admission.leaderId, scope.sourceId, scope.profileId,
        scope.workspaceId, identity.principalDigest, scope.adapterRevision,
        identity.requestDigest, etag, metadata.authority, metadata.freshness,
        metadata.completeness, metadata.asOf, serialized, responseBytes,
        this.config.EXECUTION_EDGE_CURRENT_SOURCE_CACHE_TTL_MS, admission.leaseId,
      ],
    );
    if (result.rows.length !== 1) throw new Error("N21 shared-read leader lease expired");
    return cacheValue(result.rows[0]);
  }

  async fail(admission: Extract<SharedReadAdmission, { kind: "LEADER" }>): Promise<void> {
    await this.pool.query(
      `WITH released_flight AS (
         DELETE FROM execution_shared_read_flights WHERE cache_key=$1 AND leader_id=$2
       ) DELETE FROM execution_shared_admission_leases WHERE lease_id=$3 AND owner_id=$2`,
      [admission.cacheKey, admission.leaderId, admission.leaseId],
    );
  }

  private async acquireQuota(
    client: PoolClient,
    scope: SharedReadScope,
    leaseId: string,
    ownerId: string,
  ): Promise<{ kind: "ACCEPTED"; waitMs: number } | { kind: "DENIED"; reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED" | "N21_SHARED_RATE_BUDGET_EXHAUSTED" }> {
    const maximumRps = this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND;
    const defaultMaximumConcurrency = this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY;
    const sourceMaximumConcurrency = scope.admission?.sourceMaximumConcurrency ?? defaultMaximumConcurrency;
    const profileMaximumConcurrency = scope.admission?.profileMaximumConcurrency ?? defaultMaximumConcurrency;
    const scopes: Array<["SOURCE" | "PROFILE", string, number]> = [
      ["SOURCE", scope.sourceId, sourceMaximumConcurrency],
      ["PROFILE", `${scope.sourceId}:${scope.profileId}`, profileMaximumConcurrency],
    ];
    for (const [kind, key, maximumConcurrency] of scopes) {
      await client.query(
        `INSERT INTO execution_shared_admission_state
           (scope_kind,scope_key,maximum_rps,maximum_concurrency,next_permit_at,updated_at)
         VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp())
         ON CONFLICT (scope_kind,scope_key) DO UPDATE SET
           maximum_rps=EXCLUDED.maximum_rps,
           maximum_concurrency=EXCLUDED.maximum_concurrency,
           updated_at=clock_timestamp()`,
        [kind, key, maximumRps, maximumConcurrency],
      );
    }
    const locked = await client.query<{ scope_kind: string; scope_key: string; next_permit_at: Date; now: Date }>(
      `SELECT scope_kind,scope_key,next_permit_at,clock_timestamp() AS now
       FROM execution_shared_admission_state
       WHERE (scope_kind='SOURCE' AND scope_key=$1)
          OR (scope_kind='PROFILE' AND scope_key=$2)
       ORDER BY scope_kind,scope_key FOR UPDATE`,
      [scope.sourceId, `${scope.sourceId}:${scope.profileId}`],
    );
    if (locked.rows.length !== 2) throw new Error("N21 shared quota state incomplete");
    await client.query(
      "DELETE FROM execution_shared_admission_leases WHERE expires_at <= clock_timestamp()",
    );
    const counts = await client.query<{ source_count: number; profile_count: number }>(
      `SELECT
         count(*) FILTER (WHERE source_id=$1)::integer AS source_count,
         count(*) FILTER (WHERE source_id=$1 AND profile_id=$2)::integer AS profile_count
       FROM execution_shared_admission_leases`,
      [scope.sourceId, scope.profileId],
    );
    if (
      counts.rows[0].source_count >= sourceMaximumConcurrency ||
      counts.rows[0].profile_count >= profileMaximumConcurrency
    ) {
      return { kind: "DENIED", reasonCode: "N21_SHARED_CONCURRENCY_EXHAUSTED" };
    }
    const databaseNow = locked.rows[0].now.getTime();
    const scheduledAt = Math.max(databaseNow, ...locked.rows.map((row) => row.next_permit_at.getTime()));
    const waitMs = Math.max(0, scheduledAt - databaseNow);
    if (waitMs > this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS) {
      return { kind: "DENIED", reasonCode: "N21_SHARED_RATE_BUDGET_EXHAUSTED" };
    }
    const intervalMs = Math.ceil(1_000 / maximumRps);
    await client.query(
      `UPDATE execution_shared_admission_state
       SET next_permit_at=$3::timestamptz + ($4::integer * interval '1 millisecond'),
           updated_at=clock_timestamp()
       WHERE (scope_kind='SOURCE' AND scope_key=$1)
          OR (scope_kind='PROFILE' AND scope_key=$2)`,
      [scope.sourceId, `${scope.sourceId}:${scope.profileId}`, new Date(scheduledAt), intervalMs],
    );
    await client.query(
      `INSERT INTO execution_shared_admission_leases
         (lease_id,source_id,profile_id,owner_id,acquired_at,expires_at)
       VALUES ($1,$2,$3,$4,clock_timestamp(),
               clock_timestamp() + ($5::integer * interval '1 millisecond'))`,
      [leaseId, scope.sourceId, scope.profileId, ownerId,
        this.config.EXECUTION_EDGE_CURRENT_SOURCE_LEASE_TTL_MS],
    );
    return { kind: "ACCEPTED", waitMs };
  }

  private async cache(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
    scope: SharedReadScope,
    identity: SharedReadIdentity,
    lock: boolean,
  ): Promise<SharedReadCacheValue | null> {
    const result = await queryable.query<CacheRow>(
      `SELECT response_body,etag,authority,freshness,completeness,as_of,stored_at,expires_at
       FROM execution_shared_read_cache
       WHERE cache_key=$1 AND source_id=$2 AND profile_id=$3 AND workspace_id=$4
         AND principal_digest=$5 AND adapter_revision=$6 AND request_digest=$7
         AND expires_at > clock_timestamp()${lock ? " FOR SHARE" : ""}`,
      [identity.cacheKey, scope.sourceId, scope.profileId, scope.workspaceId,
        identity.principalDigest, scope.adapterRevision, identity.requestDigest],
    );
    return result.rows[0] ? cacheValue(result.rows[0]) : null;
  }
}

export function sharedReadIdentity(scope: SharedReadScope): SharedReadIdentity {
  validateScope(scope);
  const principalDigest = `sha256:${sha256(`${scope.principalId}\0${scope.principalRole}`)}`;
  const requestDigest = `sha256:${sha256(scope.requestPath)}`;
  const cacheKey = `sha256:${sha256([
    "N21", scope.sourceId, scope.profileId, scope.workspaceId, principalDigest,
    scope.adapterRevision, requestDigest,
  ].join("\0"))}`;
  return { cacheKey, requestDigest, principalDigest };
}

export function sourceMetadata(body: unknown): SharedReadMetadata {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("N21 source provenance is not an object");
  }
  const record = body as Record<string, unknown>;
  const authority = record.authority;
  const freshness = record.freshness;
  const completeness = record.completeness;
  const asOf = record.as_of;
  if (
    typeof authority !== "string" || authority.length < 1 || authority.length > 128 ||
    typeof freshness !== "string" || !FRESHNESS.has(freshness) ||
    typeof completeness !== "string" || !COMPLETENESS.has(completeness) ||
    typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf))
  ) {
    throw new Error("N21 source provenance is incomplete or invalid");
  }
  return { authority, freshness, completeness, asOf: new Date(asOf).toISOString() };
}

function validateScope(scope: SharedReadScope): void {
  if (
    !SOURCE_ID.test(scope.sourceId) || !PROFILE_ID.test(scope.profileId) ||
    !IDENTIFIER.test(scope.workspaceId) || !IDENTIFIER.test(scope.principalId) ||
    !IDENTIFIER.test(scope.principalRole) || !IDENTIFIER.test(scope.adapterRevision) ||
    scope.requestPath.length < 1 || Buffer.byteLength(scope.requestPath, "utf8") > 8_192 ||
    (scope.admission !== undefined && (
      !Number.isInteger(scope.admission.sourceMaximumConcurrency) ||
      !Number.isInteger(scope.admission.profileMaximumConcurrency) ||
      scope.admission.sourceMaximumConcurrency < 1 ||
      scope.admission.profileMaximumConcurrency < 1 ||
      scope.admission.sourceMaximumConcurrency > 512 ||
      scope.admission.profileMaximumConcurrency > 512
    ))
  ) throw new Error("N21 shared-read scope is invalid");
}

function cacheValue(row: CacheRow): SharedReadCacheValue {
  return {
    body: row.response_body,
    etag: row.etag,
    metadata: {
      authority: row.authority,
      freshness: row.freshness,
      completeness: row.completeness,
      asOf: row.as_of.toISOString(),
    },
    storedAt: row.stored_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve the original error */ }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
