import { performance } from "perf_hooks";
import { Pool, PoolClient, QueryResultRow } from "pg";
import {
  AppliedSort,
  KeysetPage,
  NormalizedFilter,
  NormalizedKeysetQuery,
  PostgresListResource,
  QueryActorContext,
  QueryContractError,
  QueryScalar,
  QueryTelemetrySink,
  RawKeysetQuery,
  SortDefinition,
} from "./contracts";
import { CursorDirection, KeysetCursorCodec, queryFingerprint } from "./cursor";
import { normalizeKeysetQuery } from "./request";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const DEFAULT_STATEMENT_TIMEOUT_MS = 2_000;
const MAX_STATEMENT_TIMEOUT_MS = 10_000;

interface SqlPart {
  sql: string;
  values: unknown[];
}

class Bindings {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function identifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function tableIdentifier(value: string): string {
  const parts = value.split(".");
  if (parts.length < 1 || parts.length > 2) throw new Error("table must be table or schema.table");
  return parts.map(identifier).join(".");
}

function countValue(raw: unknown): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new QueryContractError("QUERY_COUNT_OVERFLOW", "Query count exceeds the safe response range.", 500);
  }
  return parsed;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function filterSql<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
  filters: readonly NormalizedFilter[],
  bindings: Bindings,
): string[] {
  return filters.map((filter) => {
    const definition = resource.filters[filter.field];
    const column = identifier(definition.column);
    if (filter.op === "in") {
      const placeholders = filter.values.map((value) => bindings.add(value));
      return `${column} IN (${placeholders.join(", ")})`;
    }
    const value = filter.values[0];
    if (filter.op === "contains") {
      return `${column} ILIKE ${bindings.add(`%${escapeLike(String(value))}%`)} ESCAPE '\\'`;
    }
    const operator = { eq: "=", gte: ">=", lte: "<=" }[filter.op];
    if (!operator) throw new Error(`unsupported normalized filter operator: ${filter.op}`);
    return `${column} ${operator} ${bindings.add(value)}`;
  });
}

function keysetSql<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
  sort: readonly AppliedSort[],
  direction: CursorDirection,
  boundary: readonly QueryScalar[],
  bindings: Bindings,
): string {
  const branches: string[] = [];
  for (let index = 0; index < sort.length; index += 1) {
    const equals: string[] = [];
    for (let prior = 0; prior < index; prior += 1) {
      const priorColumn = identifier(resource.sorts[sort[prior].field].column);
      equals.push(`${priorColumn} = ${bindings.add(boundary[prior])}`);
    }
    const current = sort[index];
    const column = identifier(resource.sorts[current.field].column);
    const canonicalGreater = current.direction === "asc";
    const scanGreater = direction === "after" ? canonicalGreater : !canonicalGreater;
    const comparison = `${column} ${scanGreater ? ">" : "<"} ${bindings.add(boundary[index])}`;
    branches.push(`(${[...equals, comparison].join(" AND ")})`);
  }
  return `(${branches.join(" OR ")})`;
}

function boundaryValue(value: unknown, definition: SortDefinition): QueryScalar {
  if (value instanceof Date) return value.toISOString();
  if (definition.kind === "timestamp" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new QueryContractError(
    "QUERY_CURSOR_BOUNDARY_UNAVAILABLE",
    "A stable cursor cannot be produced for this row.",
    500,
  );
}

function rowBoundary<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
  sort: readonly AppliedSort[],
  row: TRow,
): readonly QueryScalar[] {
  return sort.map((item) => {
    const definition = resource.sorts[item.field];
    return boundaryValue(row[definition.column], definition);
  });
}

function validateResource<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
): void {
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(resource.resourceId)) {
    throw new Error("query resource id is invalid");
  }
  tableIdentifier(resource.table);
  if (resource.selectColumns.length === 0 || new Set(resource.selectColumns).size !== resource.selectColumns.length) {
    throw new Error("query resource requires unique selected columns");
  }
  for (const column of resource.selectColumns) identifier(column);
  identifier(resource.workspaceColumn);
  if (!(resource.idSortField in resource.sorts)) throw new Error("id sort field is not defined");
  if (resource.allowedRoles.length === 0) throw new Error("query resource requires an RBAC policy");
  for (const definition of Object.values(resource.sorts)) {
    identifier(definition.column);
    if (!resource.selectColumns.includes(definition.column)) {
      throw new Error("selected columns must include every cursor sort column");
    }
  }
  for (const definition of Object.values(resource.filters)) {
    identifier(definition.column);
    if (definition.operators.includes("contains") && definition.kind !== "text") {
      throw new Error("contains filters require text columns");
    }
  }
  for (const item of resource.defaultSort) {
    if (!(item.field in resource.sorts)) throw new Error("default sort field is not defined");
  }
  const timeout = resource.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 50 || timeout > MAX_STATEMENT_TIMEOUT_MS) {
    throw new Error("query statement timeout is outside the safe range");
  }
}

function countQuery<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
  workspaceId: string,
  filters: readonly NormalizedFilter[],
): SqlPart {
  const bindings = new Bindings();
  const where = [`${identifier(resource.workspaceColumn)} = ${bindings.add(workspaceId)}`];
  where.push(...filterSql(resource, filters, bindings));
  return {
    sql: `SELECT COUNT(*)::text AS count FROM ${tableIdentifier(resource.table)} WHERE ${where.join(" AND ")}`,
    values: bindings.values,
  };
}

function pageQuery<TRow extends Record<string, unknown>, TItem>(input: {
  resource: PostgresListResource<TRow, TItem>;
  workspaceId: string;
  query: NormalizedKeysetQuery;
  direction: "initial" | CursorDirection;
  boundary: readonly QueryScalar[] | null;
}): SqlPart {
  const bindings = new Bindings();
  const where = [
    `${identifier(input.resource.workspaceColumn)} = ${bindings.add(input.workspaceId)}`,
    ...filterSql(input.resource, input.query.filters, bindings),
  ];
  if (input.direction !== "initial" && input.boundary) {
    where.push(
      keysetSql(input.resource, input.query.sort, input.direction, input.boundary, bindings),
    );
  }
  const order = input.query.sort.map((item) => {
    const canonical = item.direction.toUpperCase();
    const effective = input.direction === "before"
      ? canonical === "ASC" ? "DESC" : "ASC"
      : canonical;
    return `${identifier(input.resource.sorts[item.field].column)} ${effective}`;
  });
  const limit = bindings.add(input.query.limit + 1);
  const projection = input.resource.selectColumns.map(identifier).join(", ");
  return {
    sql: `SELECT ${projection} FROM ${tableIdentifier(input.resource.table)} WHERE ${where.join(" AND ")} ORDER BY ${order.join(", ")} LIMIT ${limit}`,
    values: bindings.values,
  };
}

function edgeExistenceQuery<TRow extends Record<string, unknown>, TItem>(input: {
  resource: PostgresListResource<TRow, TItem>;
  workspaceId: string;
  query: NormalizedKeysetQuery;
  direction: CursorDirection;
  boundary: readonly QueryScalar[];
}): SqlPart {
  const bindings = new Bindings();
  const where = [
    `${identifier(input.resource.workspaceColumn)} = ${bindings.add(input.workspaceId)}`,
    ...filterSql(input.resource, input.query.filters, bindings),
    keysetSql(input.resource, input.query.sort, input.direction, input.boundary, bindings),
  ];
  return {
    sql: `SELECT 1 FROM ${tableIdentifier(input.resource.table)} WHERE ${where.join(" AND ")} LIMIT 1`,
    values: bindings.values,
  };
}

export class ControlPlaneQueryService {
  constructor(
    private readonly pool: Pool,
    private readonly cursors: KeysetCursorCodec,
    private readonly telemetry?: QueryTelemetrySink,
  ) {}

  async list<TRow extends QueryResultRow, TItem>(
    resource: PostgresListResource<TRow, TItem>,
    actor: QueryActorContext,
    raw: RawKeysetQuery,
  ): Promise<KeysetPage<TItem>> {
    validateResource(resource);
    if (!resource.allowedRoles.includes(actor.role)) {
      throw new QueryContractError("QUERY_FORBIDDEN", "Access denied.", 403);
    }
    if (!actor.actorId || !actor.workspaceId) {
      throw new QueryContractError("QUERY_SCOPE_REQUIRED", "Authenticated workspace scope is required.", 403);
    }
    const query = normalizeKeysetQuery(resource, raw);
    const fingerprint = queryFingerprint({
      resourceId: resource.resourceId,
      limit: query.limit,
      filters: query.filters,
      sort: query.sort,
    });
    const direction = query.after ? "after" : query.before ? "before" : "initial";
    const token = query.after ?? query.before;
    const boundary = token && direction !== "initial"
      ? this.cursors.decode(token, {
          resourceId: resource.resourceId,
          workspaceId: actor.workspaceId,
          direction,
          queryFingerprint: fingerprint,
          boundarySize: query.sort.length,
        })
      : null;

    const client = await this.pool.connect();
    const started = performance.now();
    let inTransaction = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      inTransaction = true;
      await client.query("SELECT set_config('statement_timeout', $1, true)", [
        `${resource.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS}ms`,
      ]);
      const totalSql = countQuery(resource, actor.workspaceId, []);
      const totalResult = await client.query<{ count: string }>(totalSql.sql, totalSql.values);
      const totalCount = countValue(totalResult.rows[0]?.count);
      const filteredCount = query.filters.length === 0
        ? totalCount
        : await this.filteredCount(client, resource, actor.workspaceId, query.filters);
      const pageSql = pageQuery({
        resource,
        workspaceId: actor.workspaceId,
        query,
        direction,
        boundary,
      });
      const pageResult = await client.query<TRow>(pageSql.sql, pageSql.values);
      const hasExtra = pageResult.rows.length > query.limit;
      const selected = pageResult.rows.slice(0, query.limit);
      const canonicalRows = direction === "before" ? selected.reverse() : selected;
      const firstBoundary = canonicalRows[0]
        ? rowBoundary(resource, query.sort, canonicalRows[0])
        : boundary;
      const lastBoundary = canonicalRows.at(-1)
        ? rowBoundary(resource, query.sort, canonicalRows.at(-1)!)
        : boundary;
      const hasPrevious = direction === "before"
        ? hasExtra
        : direction === "after" && firstBoundary
          ? await this.existsBeyond(
              client,
              resource,
              actor.workspaceId,
              query,
              "before",
              firstBoundary,
            )
          : false;
      const hasMore = direction === "before" && lastBoundary
        ? await this.existsBeyond(
            client,
            resource,
            actor.workspaceId,
            query,
            "after",
            lastBoundary,
          )
        : hasExtra;
      await client.query("COMMIT");
      inTransaction = false;

      const cursorInput = {
        resource_id: resource.resourceId,
        workspace_id: actor.workspaceId,
        query_fingerprint: fingerprint,
      } as const;
      const previousCursor = hasPrevious && firstBoundary
        ? this.cursors.encode({
            ...cursorInput,
            direction: "before",
            boundary: firstBoundary,
          })
        : null;
      const nextCursor = hasMore && lastBoundary
        ? this.cursors.encode({
            ...cursorInput,
            direction: "after",
            boundary: lastBoundary,
          })
        : null;
      const rows = canonicalRows.map(resource.mapRow);

      this.emitTelemetry({
        resource_id: resource.resourceId,
        direction,
        duration_ms: Number((performance.now() - started).toFixed(3)),
        total_count: totalCount,
        filtered_count: filteredCount,
        returned_rows: rows.length,
        page_limit: query.limit,
      });
      return {
        rows,
        total_count: totalCount,
        filtered_count: filteredCount,
        next_cursor: nextCursor,
        prev_cursor: previousCursor,
        has_more: hasMore,
        has_previous: hasPrevious,
        applied_filters: query.filters.map(({ field, op, value }) => ({ field, op, value })),
        applied_sort: query.sort,
      };
    } catch (error) {
      if (inTransaction) await this.rollback(client);
      if ((error as { code?: string }).code === "57014") {
        throw new QueryContractError("QUERY_TIMEOUT", "Query exceeded its bounded execution time.", 503);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async filteredCount<TRow extends Record<string, unknown>, TItem>(
    client: PoolClient,
    resource: PostgresListResource<TRow, TItem>,
    workspaceId: string,
    filters: readonly NormalizedFilter[],
  ): Promise<number> {
    const filteredSql = countQuery(resource, workspaceId, filters);
    const result = await client.query<{ count: string }>(filteredSql.sql, filteredSql.values);
    return countValue(result.rows[0]?.count);
  }

  private async existsBeyond<TRow extends Record<string, unknown>, TItem>(
    client: PoolClient,
    resource: PostgresListResource<TRow, TItem>,
    workspaceId: string,
    query: NormalizedKeysetQuery,
    direction: CursorDirection,
    boundary: readonly QueryScalar[],
  ): Promise<boolean> {
    const edgeSql = edgeExistenceQuery({
      resource,
      workspaceId,
      query,
      direction,
      boundary,
    });
    const result = await client.query(edgeSql.sql, edgeSql.values);
    return result.rowCount === 1;
  }

  private emitTelemetry(sample: Parameters<QueryTelemetrySink>[0]): void {
    try {
      this.telemetry?.(sample);
    } catch {
      // Observability is deliberately fail-open for completed read-only queries.
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure. A broken connection is discarded by pg.
    }
  }
}
