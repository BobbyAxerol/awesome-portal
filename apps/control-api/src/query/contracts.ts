import { Role } from "../domain";

export const FILTER_OPERATORS = ["eq", "in", "contains", "gte", "lte"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type SortDirection = "asc" | "desc";
export type QueryScalar = string | number | boolean;
export type QueryScalarKind = "text" | "enum" | "timestamp" | "integer" | "boolean" | "decimal";

export interface RawFilterInput {
  field: unknown;
  op: unknown;
  value: unknown;
}

export interface RawKeysetQuery {
  after?: unknown;
  before?: unknown;
  limit?: unknown;
  sort?: unknown;
  filters?: unknown;
}

export interface AppliedFilter {
  field: string;
  op: FilterOperator;
  value: string;
}

export interface AppliedSort {
  field: string;
  direction: SortDirection;
}

export interface KeysetPage<T> {
  rows: readonly T[];
  total_count: number;
  filtered_count: number;
  next_cursor: string | null;
  prev_cursor: string | null;
  has_more: boolean;
  has_previous: boolean;
  applied_filters: readonly AppliedFilter[];
  applied_sort: readonly AppliedSort[];
}

/** Exact, server-computed totals; consumers must never recompute these from a page. */
export interface CurrencyAggregate {
  currency: string | null;
  row_count: number;
  quantity_count: number;
  quantity: string;
  notional_count: number;
  notional: string;
  invalid_numeric_count: number;
}

export const RETENTION_AVAILABILITIES = [
  "HOT",
  "PARTIAL_HOT",
  "COLD_REQUESTABLE",
  "PURGED",
  "UNKNOWN",
] as const;
export type RetentionAvailability = (typeof RETENTION_AVAILABILITIES)[number];

/**
 * Page-level availability is explicit so an empty projection page is never
 * silently interpreted as an ordinary empty data set.
 */
export interface ProjectionPageRetention {
  availability: RetentionAvailability;
  policy_version: string;
}

/**
 * The normalized public shape for a projection-backed list once its narrow
 * screen endpoint is approved. It deliberately extends the published keyset
 * vocabulary and retains server-side aggregates as exact decimal strings.
 */
export interface ProjectionKeysetPage<T> extends KeysetPage<T> {
  aggregates_by_currency: readonly CurrencyAggregate[];
  retention: ProjectionPageRetention;
}

export interface QueryActorContext {
  actorId: string;
  workspaceId: string;
  role: Role;
}

export interface FilterDefinition {
  column: string;
  kind: QueryScalarKind;
  operators: readonly FilterOperator[];
  enumValues?: readonly string[];
  maxLength?: number;
  maxItems?: number;
}

export interface SortDefinition {
  column: string;
  kind: QueryScalarKind;
}

/**
 * Trusted-server, exact tuple visibility, not a browser filter or grant.
 * The authority fingerprint must include the caller's current policy context;
 * the query service additionally binds the exact columns and tuples to cursors.
 * An empty tuple set means no rows, never an unconstrained query. Columns need
 * not be selected: applying a predicate must not expose its private identifiers.
 */
export interface PostgresRowScope {
  columns: readonly string[];
  allowedTuples: readonly (readonly QueryScalar[])[];
  fingerprint: string;
}

export interface PostgresListResource<TRow extends Record<string, unknown>, TItem> {
  resourceId: string;
  table: string;
  selectColumns: readonly string[];
  workspaceColumn: string;
  idSortField: string;
  filters: Readonly<Record<string, FilterDefinition>>;
  sorts: Readonly<Record<string, SortDefinition>>;
  defaultSort: readonly AppliedSort[];
  allowedRoles: readonly Role[];
  /**
   * Server-computed row visibility, applied to every count/page/cursor query.
   *
   * This is deliberately not a client filter: it is used for finite policy
   * domains such as Governance gates, where a caller may have workspace access
   * but not authority to learn rows for an ungranted gate.
   */
  rowVisibility?: {
    column: string;
    allowedValues: readonly QueryScalar[];
  };
  /** Optional only for compatibility; Execution adapters must supply a minted scope. */
  rowScope?: PostgresRowScope;
  statementTimeoutMs?: number;
  maxFilters?: number;
  mapRow: (row: TRow) => TItem;
}

export interface NormalizedFilter extends AppliedFilter {
  values: readonly QueryScalar[];
}

export interface NormalizedKeysetQuery {
  after: string | null;
  before: string | null;
  limit: number;
  filters: readonly NormalizedFilter[];
  sort: readonly AppliedSort[];
}

export interface QueryTelemetrySample {
  resource_id: string;
  direction: "initial" | "after" | "before";
  duration_ms: number;
  total_count: number;
  filtered_count: number;
  returned_rows: number;
  page_limit: number;
}

export type QueryTelemetrySink = (sample: QueryTelemetrySample) => void;

export class QueryContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "QueryContractError";
  }
}
