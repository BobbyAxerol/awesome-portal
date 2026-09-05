import { canonicalOrderStatus } from "../paper-read/order-status-map";
import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  CurrentSourceEnvironment,
  CurrentSourcePageQuery,
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
  ExecutionCurrentSourceProxy,
  managerListManagerV2Path,
  paperManagerV2Path,
  profileManagerV2Path,
} from "./current-source.proxy";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
  ProfileProjectionSnapshot,
  ProjectionScalar,
} from "./profile-projection.repository";

const MANAGER_LIST_SCREENS = new Set([
  "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
  "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
]);
const LOCAL_CURSOR = /^lp1:(\d+):([0-9a-f]{16})$/;
const DECIMAL_FIELD = new Set([
  "total", "locked", "free", "initial", "maintenance", "buying_power",
  "allocated_capital", "max_capital", "signed_qty", "quantity", "avg_px_open",
  "avg_px_close", "realized_pnl", "unrealized_pnl", "mark_price", "notional",
  "peak_qty", "price", "trigger_price", "commission", "position_qty",
  "exposure_long", "exposure_short", "cash_total", "cash_free", "cash_locked",
  "fee_total", "funding_pnl", "gross_pnl", "net_pnl", "equity", "drawdown",
  "total_notional", "margin_initial", "margin_maintenance", "target_quantity",
  "filled_quantity", "open_quantity", "excess_quantity", "average_fill_price",
]);

/**
 * A server-only resource identity recovered from the local, profile-bound
 * projection.  The Edge's current Manager page API deliberately does not
 * accept arbitrary filters, so a detail route must never emulate one by
 * fetching a first global page and filtering it in the BFF.
 */
export interface DeploymentResourceScope {
  readonly deploymentId: string;
  readonly strategyId: string;
  readonly accountId: string;
  readonly mode: ProjectionEnvironment;
  readonly venue: string;
  readonly portfolioId: string | null;
  readonly externalAccountRef: string | null;
  /** A tuple-only relation is safe only when its tuple names one deployment. */
  readonly tupleUnique: boolean;
}

export type DeploymentScopeResolution =
  | {
    readonly state: "FOUND";
    readonly reasonCode: null;
    readonly scope: DeploymentResourceScope;
    readonly deployment: Record<string, ProjectionScalar>;
  }
  | {
    readonly state: "EMPTY" | "PARTIAL" | "UNAVAILABLE";
    readonly reasonCode: string;
    readonly scope?: undefined;
    readonly deployment?: Record<string, ProjectionScalar>;
  };

interface DeploymentScopeQuery {
  /** Internal only; never serialised to the Edge or browser. */
  deploymentScope?: DeploymentResourceScope;
}

type ProductReadQuery = CurrentSourcePageQuery & LocalProductQuery & DeploymentScopeQuery;

/** Product-facing relation source. With Phase 1 active it never reads AWS-HK. */
@Injectable()
export class ExecutionProductReadSource {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
    @Inject(ExecutionCurrentSourceProxy) private readonly direct: ExecutionCurrentSourceProxy,
  ) {}

  relation(
    principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: ProductReadQuery,
  ): Promise<unknown> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      if (hasLocalQuery(query)) {
        throw new CurrentSourceProxyError("PHASE2_LOCAL_QUERY_REQUIRED", 503, {
          availability: "UNAVAILABLE", retryable: false,
        });
      }
      return this.direct.relation(principal, environment, screenId, sourceId, relation, query);
    }
    return this.localRelation(principal, environment, screenId, sourceId, relation, query);
  }

  /**
   * Resolve one deployment from the full accepted local snapshot.  It is a
   * named Portal operation, not an exposed relation query and not a source
   * call.  Absence from a partial projection is deliberately PARTIAL rather
   * than a false 404.
   */
  async resolveDeploymentScope(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    deploymentId: string,
  ): Promise<DeploymentScopeResolution> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return { state: "UNAVAILABLE", reasonCode: "EDS03_EXACT_RESOURCE_REQUIRES_LOCAL_PROJECTION" };
    }
    if (!isOpaqueId(deploymentId)) {
      return { state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_ID_INVALID" };
    }
    try {
      validateBinding(requestedEnvironment, screenId, "manager.deployments", "strategy_deployments", { limit: 1 });
      const { snapshot, environment } = await this.localSnapshot(requestedEnvironment);
      const deployments = snapshot.document.relations["manager.deployments:strategy_deployments"];
      if (!deployments || deployments.availability === "UNAVAILABLE") {
        return {
          state: "UNAVAILABLE",
          reasonCode: deployments?.reason_code ?? "EDS03_DEPLOYMENT_RELATION_UNAVAILABLE",
        };
      }
      const matches = deployments.items
        .map((row) => row.fields)
        .filter((fields) => fields.deployment_id === deploymentId);
      if (matches.length === 0) {
        return deployments.completeness === "COMPLETE"
          ? { state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_NOT_FOUND" }
          : { state: "PARTIAL", reasonCode: "EDS03_DEPLOYMENT_OUTSIDE_RETAINED_WINDOW" };
      }
      if (matches.length !== 1) {
        return { state: "PARTIAL", reasonCode: "EDS03_DEPLOYMENT_ID_DUPLICATE" };
      }
      const deployment = matches[0];
      const strategyId = textField(deployment.strategy_id);
      const accountId = textField(deployment.account_id);
      const mode = textField(deployment.mode);
      const venue = textField(deployment.venue);
      if (!strategyId || !accountId || !venue || mode !== environment) {
        return {
          state: "PARTIAL",
          reasonCode: "EDS03_DEPLOYMENT_SCOPE_INCOMPLETE",
          deployment,
        };
      }
      const tupleMatches = deployments.items
        .map((row) => row.fields)
        .filter((fields) => fields.strategy_id === strategyId && fields.account_id === accountId &&
          fields.mode === mode && fields.venue === venue);
      const accounts = snapshot.document.relations["manager.accounts:accounts"];
      const accountMatches = accounts?.availability === "AVAILABLE"
        ? accounts.items.map((row) => row.fields).filter((fields) => fields.account_id === accountId)
        : [];
      const externalRefs = [...new Set(accountMatches
        .map((fields) => textField(fields.external_account_ref))
        .filter((value): value is string => value !== null))];
      return {
        state: "FOUND",
        reasonCode: null,
        scope: {
          deploymentId,
          strategyId,
          accountId,
          mode: environment,
          venue,
          portfolioId: textField(deployment.portfolio_id),
          externalAccountRef: externalRefs.length === 1 ? externalRefs[0] : null,
          tupleUnique: tupleMatches.length === 1,
        },
        deployment,
      };
    } catch (error) {
      const reasonCode = error instanceof CurrentSourceProxyError ? error.code : "EDS03_DEPLOYMENT_SCOPE_UNAVAILABLE";
      return { state: "UNAVAILABLE", reasonCode };
    }
  }

  private async localRelation(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: ProductReadQuery,
  ): Promise<unknown> {
    validateBinding(requestedEnvironment, screenId, sourceId, relation, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { snapshot, environment, profileId, projectionWorkspaceId, ageMs } = await this.localSnapshot(requestedEnvironment);
    const projected = snapshot.document.relations[`${sourceId}:${relation}`];
    if (!projected) throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_NOT_AVAILABLE", 503, {
      availability: "UNAVAILABLE", retryable: false,
    });
    if (projected.availability === "UNAVAILABLE") {
      throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_UNAVAILABLE", 503, {
        availability: "UNAVAILABLE", reason_code: projected.reason_code, retryable: false,
      });
    }
    const scoped = query.deploymentScope
      ? scopeRows(relation, projected.items, query.deploymentScope)
      : { items: projected.items, state: "EXACT" as const, reasonCode: null };
    const scopedItems = screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders"
      ? filterAndSort(scoped.items, query)
      : scoped.items;
    const limit = query.limit ?? 100;
    const start = decodeCursor(query.cursor, snapshot.payloadDigest);
    if (start > scopedItems.length) {
      throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_AHEAD", 409, {
        availability: "DEGRADED", retryable: false,
      });
    }
    const rows = scopedItems.slice(start, start + limit);
    const next = start + rows.length < scopedItems.length
      ? encodeCursor(start + rows.length, snapshot.payloadDigest) : null;
    const previous = start > 0
      ? encodeCursor(Math.max(0, start - limit), snapshot.payloadDigest) : null;
    return {
      schema_version: "portal.execution.local-projection-bff.v1",
      authority: "PORTAL_CONTROL_API",
      requested_environment: requestedEnvironment,
      source_environment: environment,
      profile_id: profileId,
      workspace_id: projectionWorkspaceId,
      viewer_workspace_id: principal.workspaceId,
      projection: {
        authority: "SGP_POSTGRESQL",
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
        source_contract_revision: snapshot.document.source_contract_revision,
        source_cursor: snapshot.sourceCursor,
        received_at: snapshot.receivedAt.toISOString(),
        last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
      },
      source: {
        authority: "EXECUTION_CELL",
        profile_id: profileId,
        availability: "AVAILABLE",
        freshness: freshness(ageMs, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS),
        completeness: projected.completeness,
        as_of: projected.as_of,
        data: {
          relation: { schema: "public", relation },
          items: rows.map((row) => ({
            relation: { schema: "public", relation },
            fields: Object.fromEntries(Object.entries(row.fields).map(([name, value]) => [name, tagged(name, value)])),
          })),
          next_cursor: next,
          previous_cursor: previous,
          projected_total_items: projected.items.length,
          filtered_total_items: scopedItems.length,
          scope: query.deploymentScope ? {
            resource_kind: "DEPLOYMENT",
            resource_id: query.deploymentScope.deploymentId,
            state: scoped.state,
            reason_code: scoped.reasonCode,
          } : undefined,
          window_aggregates: screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders"
            ? countByDimensions(projected.items) : null,
        },
      },
    };
  }

  private async localSnapshot(requestedEnvironment: CurrentSourceEnvironment): Promise<{
    snapshot: ProfileProjectionSnapshot;
    environment: ProjectionEnvironment;
    profileId: string;
    projectionWorkspaceId: string;
    ageMs: number;
  }> {
    const environment: ProjectionEnvironment = requestedEnvironment === "canary" ? "live" : requestedEnvironment;
    const profileId = profile(this.config, environment);
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId) {
      throw new CurrentSourceProxyError("N31_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    }
    const snapshot = await this.repository.snapshot(projectionWorkspaceId, environment, profileId);
    if (!snapshot) throw new CurrentSourceProxyError("N31_PROJECTION_NOT_READY", 503, {
      availability: "UNAVAILABLE", retryable: true,
    });
    const ageMs = Date.now() - snapshot.lastSuccessfulRefreshAt.valueOf();
    if (ageMs > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      throw new CurrentSourceProxyError("N31_PROJECTION_STALE_CEILING_EXCEEDED", 503, {
        availability: "UNAVAILABLE", retryable: true,
      });
    }
    return { snapshot, environment, profileId, projectionWorkspaceId, ageMs };
  }
}

interface LocalProductQuery {
  status?: string;
  statuses?: readonly string[];
  venue?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  sort?: "submitted_at_desc" | "submitted_at_asc" | "updated_at_desc";
}

function hasLocalQuery(query: LocalProductQuery & DeploymentScopeQuery): boolean {
  return query.status !== undefined || query.statuses !== undefined || query.venue !== undefined || query.symbol !== undefined ||
    query.side !== undefined || query.sort !== undefined || query.deploymentScope !== undefined;
}

type ScopedRows = {
  readonly items: readonly { fields: Record<string, ProjectionScalar> }[];
  readonly state: "EXACT" | "PARTIAL";
  readonly reasonCode: string | null;
};

/**
 * Scope rows before local keyset pagination.  A row with an explicit
 * deployment_id wins.  Relations without that id may use the complete
 * four-part tuple only when that tuple names exactly one deployment; this is
 * intentionally narrower than the historical two-of-four heuristic.
 */
function scopeRows(
  relation: string,
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  scope: DeploymentResourceScope,
): ScopedRows {
  if (relation === "strategy_deployments") {
    return exactRows(rows, (fields) => fields.deployment_id === scope.deploymentId);
  }
  if (["accounts", "account_balances", "margin_balances", "account_sync_effective", "venue_accounts"].includes(relation)) {
    return exactRows(rows, (fields) => fields.account_id === scope.accountId);
  }
  if (relation === "broker_account_sync_effective") {
    if (!scope.externalAccountRef) {
      return { items: [], state: "PARTIAL", reasonCode: "EDS03_EXTERNAL_ACCOUNT_REF_UNAVAILABLE" };
    }
    return exactRows(rows, (fields) => fields.external_account_ref === scope.externalAccountRef);
  }
  if (relation === "portfolio_equity_snapshots") {
    if (!scope.portfolioId) {
      return { items: [], state: "PARTIAL", reasonCode: "EDS03_PORTFOLIO_SCOPE_UNAVAILABLE" };
    }
    return exactRows(rows, (fields) => fields.portfolio_id === scope.portfolioId);
  }
  const explicit = rows.filter((row) => row.fields.deployment_id !== undefined);
  if (explicit.length > 0) {
    return exactRows(rows, (fields) => fields.deployment_id === scope.deploymentId);
  }
  if (!scope.tupleUnique) {
    return { items: [], state: "PARTIAL", reasonCode: "EDS03_DEPLOYMENT_SCOPE_AMBIGUOUS" };
  }
  return exactRows(rows, (fields) => fields.strategy_id === scope.strategyId &&
    fields.account_id === scope.accountId && fields.mode === scope.mode && fields.venue === scope.venue);
}

function exactRows(
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  predicate: (fields: Record<string, ProjectionScalar>) => boolean,
): ScopedRows {
  return { items: rows.filter((row) => predicate(row.fields)), state: "EXACT", reasonCode: null };
}

function textField(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isOpaqueId(value: string): boolean {
  return value.length > 0 && value.length <= 191 && !/[\u0000-\u001f]/.test(value);
}

function filterAndSort(
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  query: LocalProductQuery,
) {
  const equals = (value: ProjectionScalar | undefined, expected: string | undefined) =>
    expected === undefined || String(value ?? "").toUpperCase() === expected.toUpperCase();
  // A canonical query word must match the raw source word too (P4-F): the
  // projection still holds e.g. RISK_REJECTED, which the map reads REJECTED.
  const statusEquals = (value: ProjectionScalar | undefined, expected: string | undefined) => {
    if (expected === undefined) return true;
    const raw = String(value ?? "").toUpperCase();
    return raw === expected.toUpperCase() || canonicalOrderStatus(raw) === expected.toUpperCase();
  };
  const selected = rows.filter((row) =>
    statusEquals(row.fields.status, query.status) &&
    (query.statuses === undefined || query.statuses.some((status) => statusEquals(row.fields.status, status))) &&
    equals(row.fields.venue, query.venue) &&
    equals(row.fields.symbol, query.symbol) && equals(row.fields.side, query.side));
  const sort = query.sort ?? "submitted_at_desc";
  const field = sort === "updated_at_desc" ? "updated_at" : "submitted_at";
  const direction = sort === "submitted_at_asc" ? 1 : -1;
  return [...selected].sort((left, right) => direction * (
    String(left.fields[field] ?? "").localeCompare(String(right.fields[field] ?? "")) ||
    String(left.fields.order_id ?? "").localeCompare(String(right.fields.order_id ?? ""))
  ));
}

function countByDimensions(rows: readonly { fields: Record<string, ProjectionScalar> }[]) {
  const dimensions = ["status", "venue", "side"] as const;
  return Object.fromEntries(dimensions.map((dimension) => [dimension, rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row.fields[dimension] ?? "UNKNOWN");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {})]));
}

function validateBinding(
  environment: CurrentSourceEnvironment,
  screenId: string,
  sourceId: string,
  relation: string,
  query: CurrentSourcePageQuery,
): void {
  if (MANAGER_LIST_SCREENS.has(screenId)) {
    managerListManagerV2Path(environment, screenId, sourceId, relation, query);
  } else if (environment === "paper") {
    paperManagerV2Path(screenId, sourceId, relation, query);
  } else {
    profileManagerV2Path(environment, screenId, sourceId, relation, query);
  }
}

function profile(config: ControlApiConfig, environment: ProjectionEnvironment): string {
  const value = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!value) throw new CurrentSourceProxyError("N31_PROFILE_NOT_CONFIGURED", 503);
  return value;
}

function freshness(ageMs: number, pollIntervalMs: number): "FRESH" | "AGING" | "STALE" {
  if (ageMs <= pollIntervalMs * 2) return "FRESH";
  if (ageMs <= pollIntervalMs * 4) return "AGING";
  return "STALE";
}

function encodeCursor(offset: number, digest: string): string {
  return `lp1:${offset}:${digest.slice("sha256:".length, "sha256:".length + 16)}`;
}

function decodeCursor(cursor: string | undefined, digest: string): number {
  if (!cursor) return 0;
  const match = LOCAL_CURSOR.exec(cursor);
  if (!match || match[2] !== digest.slice("sha256:".length, "sha256:".length + 16)) {
    throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  }
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  return value;
}

function tagged(name: string, value: ProjectionScalar): { kind: string; value: ProjectionScalar } {
  if (value === null) return { kind: "NULL", value };
  if (Array.isArray(value)) return { kind: "ARRAY", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  if (typeof value !== "string") {
    throw new CurrentSourceProxyError("N31_PROJECTION_SCALAR_INVALID", 500);
  }
  if (DECIMAL_FIELD.has(name) && /^-?\d+(?:\.\d+)?$/.test(value)) return { kind: "DECIMAL", value };
  if ((name === "ts" || name === "trade_time" || name.endsWith("_at")) &&
      !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return { kind: "TIMESTAMP", value };
  }
  return { kind: "TEXT", value };
}
