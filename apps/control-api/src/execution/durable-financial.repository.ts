import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { ProjectionEnvironment } from "./profile-projection.repository";

export const FINANCIAL_SUBJECT_KINDS = ["alpha", "deployment", "account", "portfolio"] as const;
export type FinancialSubjectKind = (typeof FINANCIAL_SUBJECT_KINDS)[number];
type FinancialStoredSubjectKind = Exclude<FinancialSubjectKind, "alpha"> | "strategy";

const SUBJECT_COLUMNS: Readonly<Record<FinancialStoredSubjectKind, string>> = Object.freeze({
  strategy: "strategy_id",
  deployment: "deployment_id",
  account: "account_id",
  portfolio: "portfolio_id",
});

const EXACT_DECIMAL_SQL = "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$";
const CURRENCY_SQL = "^[A-Z]{3,12}$";
const MAX_DECIMAL_LENGTH = 96;
const MAX_SERIES = 128;

export interface DurableFinancialScope {
  workspaceId: string;
  environment: ProjectionEnvironment;
  profileId: string;
}

export interface DurableFinancialSeriesInput extends DurableFinancialScope {
  relationKey: string;
  valueField: string;
  subject: { kind: FinancialSubjectKind; id: string };
  fromMs: number | null;
  toMs: number | null;
  targetPoints: number;
}

export interface DurableFinancialObservation {
  availability: "AVAILABLE" | "UNAVAILABLE";
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  asOf: Date | null;
  receivedAt: Date;
}

export interface DurableFinancialRevision {
  readModelRevision: string;
  projectionEpoch: string;
  projectionSequence: number;
  payloadDigest: string;
}

export interface DurableFinancialPoint {
  rowId: string;
  at: Date;
  accountId: string | null;
  currency: string;
  value: string;
}

/**
 * Product identifiers never become an arbitrary database predicate.  Alpha is
 * the only product identifier that needs a current-revision identity lookup;
 * the remaining names map to a fixed indexed range-row dimension.
 */
export interface DurableFinancialSubjectResolution {
  state: "AVAILABLE" | "EMPTY" | "UNAVAILABLE";
  reasonCode: string | null;
  resource: { kind: FinancialStoredSubjectKind; id: string } | null;
}

export interface DurableFinancialSeriesRead {
  state: "AVAILABLE" | "PARTIAL" | "EMPTY" | "UNAVAILABLE";
  reasonCode: string | null;
  revision: DurableFinancialRevision | null;
  observation: DurableFinancialObservation | null;
  sourceRows: string | null;
  numericRows: string | null;
  rejectedRows: string | null;
  seriesCount: string;
  oldestAvailableAt: Date | null;
  newestAvailableAt: Date | null;
  points: readonly DurableFinancialPoint[];
  downsample: {
    algorithm: "MIN_MAX_LAST_BUCKET_V1";
    bucketSeconds: number;
    targetPoints: number;
    sourceRows: string;
    returnedRows: number;
  } | null;
}

/**
 * EDS-07's local financial read plane.  It intentionally owns no source
 * transport: all reads are from one committed SGP durable-mirror revision.
 * The Edge/Trading-System current page remains the source authority and is
 * never opened by a browser chart refresh.
 */
@Injectable()
export class ExecutionDurableFinancialRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async series(input: DurableFinancialSeriesInput): Promise<DurableFinancialSeriesRead> {
    validateInput(input);
    return this.stableRead(async (client) => {
      const context = await loadContext(client, input);
      if (context.kind === "MISSING_REVISION") return unavailable("EDS07_MIRROR_NOT_READY");
      if (context.kind === "MISSING_RELATION") return unavailable("EDS07_RELATION_NOT_MIRRORED", context.revision);
      if (context.observation.availability === "UNAVAILABLE") {
        return unavailable(context.reasonCode ?? "EDS07_RELATION_UNAVAILABLE", context.revision, context.observation);
      }

      const subject = await resolveSubject(client, input, input.subject, context.revision);
      if (subject.state === "UNAVAILABLE") {
        return unavailable(subject.reasonCode ?? "EDS07_SUBJECT_UNAVAILABLE", context.revision, context.observation);
      }
      if (subject.state === "EMPTY" || subject.resource === null) {
        return empty(context.revision, context.observation, subject.reasonCode);
      }

      const base = buildBaseQuery(input, subject.resource);
      const meta = await client.query<{
        source_rows: string;
        numeric_rows: string;
        series_count: string;
        oldest_available_at: Date | null;
        newest_available_at: Date | null;
      }>(
        `SELECT count(*)::text AS source_rows,
                count(*) FILTER (WHERE ${base.validPredicate})::text AS numeric_rows,
                count(DISTINCT CASE WHEN ${base.validPredicate} THEN ${base.seriesKey} END)::text AS series_count,
                min(ts) FILTER (WHERE ${base.validPredicate}) AS oldest_available_at,
                max(ts) FILTER (WHERE ${base.validPredicate}) AS newest_available_at
           FROM execution_durable_mirror_range_rows
          WHERE ${base.where.join(" AND ")}`,
        base.values,
      );
      const row = meta.rows[0];
      const sourceRows = nonNegativeCount(row?.source_rows ?? "0");
      const numericRows = nonNegativeCount(row?.numeric_rows ?? "0");
      const rejectedRows = subtractNonNegative(sourceRows, numericRows);
      const seriesCount = nonNegativeCount(row?.series_count ?? "0");
      const seriesCountValue = BigInt(seriesCount);
      const observationState = context.observation.completeness === "PARTIAL" ? "PARTIAL" : "AVAILABLE";
      if (numericRows === "0") {
        return {
          state: sourceRows === "0" ? "EMPTY" : "PARTIAL",
          reasonCode: sourceRows === "0" ? null : "EDS07_NON_NUMERIC_OR_CURRENCY_ROW_EXCLUDED",
          revision: context.revision,
          observation: context.observation,
          sourceRows,
          numericRows,
          rejectedRows,
          seriesCount: "0",
          oldestAvailableAt: null,
          newestAvailableAt: null,
          points: [],
          downsample: null,
        };
      }
      if (seriesCountValue > BigInt(MAX_SERIES)) {
        return {
          state: "PARTIAL",
          reasonCode: "EDS07_SCOPE_SERIES_CARDINALITY_EXCEEDED",
          revision: context.revision,
          observation: context.observation,
          sourceRows,
          numericRows,
          rejectedRows,
          seriesCount,
          oldestAvailableAt: row?.oldest_available_at ?? null,
          newestAvailableAt: row?.newest_available_at ?? null,
          points: [],
          downsample: null,
        };
      }

      // Count values are not business decimals, but they may still outgrow a
      // JavaScript number. Keep them exact until after the bounded-series
      // guard, where converting <=128 is safe.
      const sampled = BigInt(numericRows) > BigInt(input.targetPoints);
      const points = sampled
        ? await this.downsampled(client, input, base, Number(seriesCountValue), numericRows, row?.oldest_available_at, row?.newest_available_at)
        : await this.exact(client, base);
      const partial = observationState === "PARTIAL" || rejectedRows !== "0";
      return {
        state: partial ? "PARTIAL" : "AVAILABLE",
        reasonCode: context.observation.completeness === "PARTIAL"
          ? "EDS07_RETAINED_RELATION_PARTIAL"
          : rejectedRows !== "0" ? "EDS07_NON_NUMERIC_OR_CURRENCY_ROW_EXCLUDED" : null,
        revision: context.revision,
        observation: context.observation,
        sourceRows,
        numericRows,
        rejectedRows,
        seriesCount,
        oldestAvailableAt: row?.oldest_available_at ?? null,
        newestAvailableAt: row?.newest_available_at ?? null,
        points: points.rows,
        downsample: points.downsample,
      };
    });
  }

  /**
   * A narrow internal resolution boundary reused by named decision-record
   * BFFs. It never returns a source relation, Edge cursor, or current entity
   * fields to callers.
   */
  async resolveSubject(
    scope: DurableFinancialScope,
    subject: { kind: FinancialSubjectKind; id: string },
  ): Promise<DurableFinancialSubjectResolution> {
    if (!FINANCIAL_SUBJECT_KINDS.includes(subject.kind) || !/^[A-Za-z0-9._:@-]{1,191}$/.test(subject.id)) {
      throw new DurableFinancialReadError("EDS07_FINANCIAL_QUERY_INVALID", 400);
    }
    return this.stableRead(async (client) => {
      const revision = await loadCurrentRevision(client, scope);
      if (!revision) return { state: "UNAVAILABLE", reasonCode: "EDS07_MIRROR_NOT_READY", resource: null };
      return resolveSubject(client, scope, subject, revision);
    });
  }

  private async exact(client: PoolClient, base: BaseQuery): Promise<{
    rows: DurableFinancialPoint[];
    downsample: null;
  }> {
    const result = await client.query<DurableFinancialPoint>(
      `${base.validCte}
       SELECT row_id AS "rowId", ts AS "at", account_id AS "accountId", currency, value
         FROM valid
        ORDER BY series_key ASC, ts ASC, row_id ASC`,
      base.values,
    );
    return { rows: result.rows, downsample: null };
  }

  private async downsampled(
    client: PoolClient,
    input: DurableFinancialSeriesInput,
    base: BaseQuery,
    seriesCount: number,
    sourceRows: string,
    oldestAt: Date | null,
    newestAt: Date | null,
  ): Promise<{
    rows: DurableFinancialPoint[];
    downsample: DurableFinancialSeriesRead["downsample"];
  }> {
    const spanSeconds = Math.max(0, Math.ceil(((newestAt?.valueOf() ?? 0) - (oldestAt?.valueOf() ?? 0)) / 1_000));
    // Each bucket contributes at most min/max/last.  One additional first
    // observed point per series makes the visible range boundary explicit.
    // Reserve that slot before calculating buckets, then make the bucket
    // width one second wider than a whole-span division so an endpoint cannot
    // create a surprise extra bucket and break the response budget.
    const bucketsPerSeries = Math.max(
      1,
      Math.floor((input.targetPoints - seriesCount) / (3 * Math.max(1, seriesCount))),
    );
    const bucketSeconds = Math.max(1, Math.ceil((spanSeconds + 1) / bucketsPerSeries));
    const values = [...base.values, bucketSeconds];
    const bucketParameter = `$${values.length}`;
    const result = await client.query<DurableFinancialPoint>(
      `${base.validCte},
       bounds AS (SELECT min(ts) AS first_ts FROM valid),
       bucketed AS (
         SELECT *, floor(extract(epoch FROM ts - (SELECT first_ts FROM bounds)) / ${bucketParameter})::bigint AS bucket
           FROM valid
       ),
       ranked AS (
         SELECT *,
                row_number() OVER (PARTITION BY series_key, bucket ORDER BY value::numeric ASC, ts ASC, row_id ASC) AS rn_min,
                row_number() OVER (PARTITION BY series_key, bucket ORDER BY value::numeric DESC, ts ASC, row_id ASC) AS rn_max,
                row_number() OVER (PARTITION BY series_key, bucket ORDER BY ts DESC, row_id DESC) AS rn_last
           FROM bucketed
       ), firsts AS (
         SELECT DISTINCT ON (series_key) row_id
           FROM valid
          ORDER BY series_key ASC, ts ASC, row_id ASC
       )
       SELECT row_id AS "rowId", ts AS "at", account_id AS "accountId", currency, value
         FROM ranked
        WHERE rn_min=1 OR rn_max=1 OR rn_last=1
           OR row_id IN (SELECT row_id FROM firsts)
        ORDER BY series_key ASC, ts ASC, row_id ASC`,
      values,
    );
    return {
      rows: result.rows,
      downsample: {
        algorithm: "MIN_MAX_LAST_BUCKET_V1",
        bucketSeconds,
        targetPoints: input.targetPoints,
        sourceRows,
        returnedRows: result.rows.length,
      },
    };
  }

  private async stableRead<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

interface BaseQuery {
  values: unknown[];
  where: string[];
  validPredicate: string;
  seriesKey: string;
  validCte: string;
}

function buildBaseQuery(
  input: DurableFinancialSeriesInput,
  subject: { kind: FinancialStoredSubjectKind; id: string },
): BaseQuery {
  const subjectColumn = SUBJECT_COLUMNS[subject.kind];
  const values: unknown[] = [input.workspaceId, input.environment, input.profileId, input.relationKey];
  const where = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4"];
  if (input.fromMs !== null) {
    values.push(new Date(input.fromMs).toISOString());
    where.push(`ts >= $${values.length}::timestamptz`);
  }
  if (input.toMs !== null) {
    values.push(new Date(input.toMs).toISOString());
    where.push(`ts <= $${values.length}::timestamptz`);
  }
  values.push(subject.id);
  where.push(`${subjectColumn}=$${values.length}`);
  values.push(input.valueField, "currency");
  const valueParameter = `$${values.length - 1}`;
  const currencyParameter = `$${values.length}`;
  const value = `fields->>${valueParameter}`;
  const currency = `fields->>${currencyParameter}`;
  const validPredicate = `(${value} ~ '${EXACT_DECIMAL_SQL}' AND length(${value}) <= ${MAX_DECIMAL_LENGTH} AND ${currency} ~ '${CURRENCY_SQL}')`;
  const seriesKey = `concat(COALESCE(NULLIF(account_id, ''), 'scope'), '|', ${currency})`;
  const validCte = `WITH scoped AS (
      SELECT row_id, ts, account_id, ${value} AS value, ${currency} AS currency, ${seriesKey} AS series_key
        FROM execution_durable_mirror_range_rows
       WHERE ${where.join(" AND ")}
    ), valid AS (
      SELECT row_id, ts, account_id, value, currency, series_key
        FROM scoped
       WHERE value ~ '${EXACT_DECIMAL_SQL}' AND length(value) <= ${MAX_DECIMAL_LENGTH} AND currency ~ '${CURRENCY_SQL}'
    )`;
  return { values, where, validPredicate, seriesKey, validCte };
}

async function loadContext(
  client: PoolClient,
  input: DurableFinancialScope & { relationKey: string },
): Promise<
  | { kind: "MISSING_REVISION" }
  | { kind: "MISSING_RELATION"; revision: DurableFinancialRevision }
  | { kind: "READY"; revision: DurableFinancialRevision; observation: DurableFinancialObservation; reasonCode: string | null }
> {
  const current = await loadCurrentRevision(client, input);
  if (!current) return { kind: "MISSING_REVISION" };
  const observation = await client.query<{
    availability: "AVAILABLE" | "UNAVAILABLE";
    reason_code: string | null;
    completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
    freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
    as_of: Date | null;
  }>(
    `SELECT o.availability,o.reason_code,o.completeness,o.freshness,o.as_of
       FROM execution_durable_mirror_observations o
       JOIN execution_durable_mirror_revisions r ON r.batch_id=o.batch_id
      WHERE r.read_model_revision=$1::uuid AND o.workspace_id=$2 AND o.environment=$3
        AND o.profile_id=$4 AND o.relation_key=$5`,
    [current.readModelRevision, input.workspaceId, input.environment, input.profileId, input.relationKey],
  );
  const observationRow = observation.rows[0];
  if (!observationRow) return { kind: "MISSING_RELATION", revision: current };
  return {
    kind: "READY",
    revision: current,
    reasonCode: observationRow.reason_code,
    observation: {
      availability: observationRow.availability,
      completeness: observationRow.completeness,
      freshness: observationRow.freshness,
      asOf: observationRow.as_of,
      receivedAt: current.receivedAt,
    },
  };
}

async function loadCurrentRevision(
  client: PoolClient,
  input: DurableFinancialScope,
): Promise<(DurableFinancialRevision & { receivedAt: Date }) | null> {
  const revision = await client.query<{
    read_model_revision: string;
    projection_epoch: string;
    projection_sequence: string;
    payload_digest: string;
    received_at: Date;
  }>(
    `SELECT r.read_model_revision::text,r.projection_epoch::text,r.projection_sequence::text,b.payload_digest,b.received_at
       FROM execution_durable_mirror_revisions r
       JOIN execution_durable_mirror_batches b ON b.batch_id=r.batch_id
      WHERE r.workspace_id=$1 AND r.environment=$2 AND r.profile_id=$3 AND r.is_current=true`,
    [input.workspaceId, input.environment, input.profileId],
  );
  const revisionRow = revision.rows[0];
  if (!revisionRow) return null;
  return {
    readModelRevision: revisionRow.read_model_revision,
    projectionEpoch: revisionRow.projection_epoch,
    projectionSequence: Number(revisionRow.projection_sequence),
    payloadDigest: revisionRow.payload_digest,
    receivedAt: revisionRow.received_at,
  };
}

async function resolveSubject(
  client: PoolClient,
  scope: DurableFinancialScope,
  subject: { kind: FinancialSubjectKind; id: string },
  revision: DurableFinancialRevision,
): Promise<DurableFinancialSubjectResolution> {
  if (subject.kind !== "alpha") {
    return { state: "AVAILABLE", reasonCode: null, resource: { kind: subject.kind, id: subject.id } };
  }
  const relationKey = "manager.strategies:strategies";
  const observation = await client.query<{
    availability: "AVAILABLE" | "UNAVAILABLE";
    completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
    reason_code: string | null;
  }>(
    `SELECT o.availability,o.completeness,o.reason_code
       FROM execution_durable_mirror_observations o
       JOIN execution_durable_mirror_revisions r ON r.batch_id=o.batch_id
      WHERE r.read_model_revision=$1::uuid AND o.workspace_id=$2 AND o.environment=$3
        AND o.profile_id=$4 AND o.relation_key=$5`,
    [revision.readModelRevision, scope.workspaceId, scope.environment, scope.profileId, relationKey],
  );
  const observed = observation.rows[0];
  if (!observed || observed.availability === "UNAVAILABLE") {
    return {
      state: "UNAVAILABLE",
      reasonCode: observed?.reason_code ?? "EDS07_ALPHA_IDENTITY_NOT_MIRRORED",
      resource: null,
    };
  }
  const identities = await client.query<{ strategy_id: string }>(
    `SELECT DISTINCT strategy_id
       FROM execution_durable_mirror_current_entities
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
        AND last_read_model_revision=$5::uuid AND strategy_id IS NOT NULL
        AND (strategy_id=$6 OR fields->>'alpha_id'=$6)
      ORDER BY strategy_id ASC
      LIMIT 2`,
    [scope.workspaceId, scope.environment, scope.profileId, relationKey, revision.readModelRevision, subject.id],
  );
  if (identities.rows.length === 1) {
    return { state: "AVAILABLE", reasonCode: null, resource: { kind: "strategy", id: identities.rows[0]!.strategy_id } };
  }
  if (identities.rows.length > 1) {
    return { state: "UNAVAILABLE", reasonCode: "EDS07_ALPHA_SUBJECT_AMBIGUOUS", resource: null };
  }
  return {
    state: observed.completeness === "COMPLETE" ? "EMPTY" : "UNAVAILABLE",
    reasonCode: observed.completeness === "COMPLETE"
      ? "EDS07_ALPHA_SUBJECT_NOT_FOUND"
      : "EDS07_ALPHA_SUBJECT_UNRESOLVED_PARTIAL",
    resource: null,
  };
}

function unavailable(
  reasonCode: string,
  revision: DurableFinancialRevision | null = null,
  observation: DurableFinancialObservation | null = null,
): DurableFinancialSeriesRead {
  return {
    state: "UNAVAILABLE",
    reasonCode,
    revision,
    observation,
    sourceRows: null,
    numericRows: null,
    rejectedRows: null,
    seriesCount: "0",
    oldestAvailableAt: null,
    newestAvailableAt: null,
    points: [],
    downsample: null,
  };
}

function empty(
  revision: DurableFinancialRevision,
  observation: DurableFinancialObservation,
  reasonCode: string | null,
): DurableFinancialSeriesRead {
  return {
    state: "EMPTY",
    reasonCode,
    revision,
    observation,
    sourceRows: "0",
    numericRows: "0",
    rejectedRows: "0",
    seriesCount: "0",
    oldestAvailableAt: null,
    newestAvailableAt: null,
    points: [],
    downsample: null,
  };
}

function subtractNonNegative(left: string, right: string): string {
  const value = BigInt(left) - BigInt(right);
  return (value < 0n ? 0n : value).toString();
}

function nonNegativeCount(value: string): string {
  if (!/^\d+$/.test(value)) throw new DurableFinancialReadError("EDS07_FINANCIAL_COUNT_INVALID", 500);
  return BigInt(value).toString();
}

function validateInput(input: DurableFinancialSeriesInput): void {
  if (
    !FINANCIAL_SUBJECT_KINDS.includes(input.subject.kind) ||
    !/^[A-Za-z0-9._:@-]{1,191}$/.test(input.subject.id) ||
    !/^[a-z][a-z0-9._:-]{1,191}$/.test(input.relationKey) ||
    !/^[a-z][a-z0-9_]{0,95}$/.test(input.valueField) ||
    !Number.isSafeInteger(input.targetPoints) || input.targetPoints < 512 || input.targetPoints > 4096 ||
    (input.fromMs !== null && (!Number.isSafeInteger(input.fromMs) || Math.abs(input.fromMs) > 8_640_000_000_000_000)) ||
    (input.toMs !== null && (!Number.isSafeInteger(input.toMs) || Math.abs(input.toMs) > 8_640_000_000_000_000)) ||
    (input.fromMs !== null && input.toMs !== null && input.fromMs > input.toMs)
  ) {
    throw new DurableFinancialReadError("EDS07_FINANCIAL_QUERY_INVALID", 400);
  }
}

export class DurableFinancialReadError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
