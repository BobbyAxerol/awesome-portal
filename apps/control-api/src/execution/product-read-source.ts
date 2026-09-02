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
    query: CurrentSourcePageQuery,
  ): Promise<unknown> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return this.direct.relation(principal, environment, screenId, sourceId, relation, query);
    }
    return this.localRelation(principal, environment, screenId, sourceId, relation, query);
  }

  private async localRelation(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: CurrentSourcePageQuery,
  ): Promise<unknown> {
    validateBinding(requestedEnvironment, screenId, sourceId, relation, query);
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
    const projected = snapshot.document.relations[`${sourceId}:${relation}`];
    if (!projected) throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_NOT_AVAILABLE", 503, {
      availability: "UNAVAILABLE", retryable: false,
    });
    if (projected.availability === "UNAVAILABLE") {
      throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_UNAVAILABLE", 503, {
        availability: "UNAVAILABLE", reason_code: projected.reason_code, retryable: false,
      });
    }
    const limit = query.limit ?? 100;
    const start = decodeCursor(query.cursor, snapshot.payloadDigest);
    if (start > projected.items.length) {
      throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_AHEAD", 409, {
        availability: "DEGRADED", retryable: false,
      });
    }
    const rows = projected.items.slice(start, start + limit);
    const next = start + rows.length < projected.items.length
      ? encodeCursor(start + rows.length, snapshot.payloadDigest) : null;
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
        },
      },
    };
  }
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
