import { QueryResultRow } from "pg";
import { z } from "zod";
import { PostgresListResource, RawKeysetQuery } from "../query";

export const MANAGER_LIST_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ManagerListEnvironment = (typeof MANAGER_LIST_ENVIRONMENTS)[number];
export const ALPHA_FLEET_ENVIRONMENTS = ["all", ...MANAGER_LIST_ENVIRONMENTS] as const;
export type AlphaFleetEnvironment = (typeof ALPHA_FLEET_ENVIRONMENTS)[number];

const QuerySchema = z.object({
  workspace_id: z.string().min(1).max(128).optional(),
  environment: z.enum(MANAGER_LIST_ENVIRONMENTS).default("paper"),
  after: z.string().min(1).max(4096).optional(),
  before: z.string().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  sort: z.string().min(1).max(160).optional(),
  search: z.string().trim().min(1).max(128).optional(),
  stage: z.string().trim().min(1).max(64).optional(),
  venue: z.string().trim().min(1).max(64).optional(),
  state: z.string().trim().min(1).max(64).optional(),
  owner: z.string().trim().min(1).max(128).optional(),
  health: z.string().trim().min(1).max(64).optional(),
}).strict();

function assertCursorDirection(
  value: { after?: string; before?: string },
  context: z.RefinementCtx,
) {
  if (value.after && value.before) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "after and before are mutually exclusive" });
  }
}

export const AlphaFleetQuerySchema = QuerySchema.omit({ venue: true, state: true })
  .extend({ environment: z.enum(ALPHA_FLEET_ENVIRONMENTS).default("all") })
  .superRefine(assertCursorDirection);
export const BindingsQuerySchema = QuerySchema.omit({ stage: true, owner: true, health: true })
  .superRefine(assertCursorDirection);

export type AlphaFleetQuery = z.infer<typeof AlphaFleetQuerySchema>;
export type BindingsQuery = z.infer<typeof BindingsQuerySchema>;

export const PortfolioListQuerySchema = z.object({
  workspace_id: z.string().min(1).max(128).optional(),
  environment: z.enum(ALPHA_FLEET_ENVIRONMENTS).default("all"),
}).strict();
export type PortfolioListQuery = z.infer<typeof PortfolioListQuerySchema>;

export interface PortfolioListItem {
  portfolio_id: string;
  name: string;
  owner: string | null;
  state: string;
  base_currency: string;
  environments: readonly ManagerListEnvironment[];
  allocation_count: number;
  deployment_count: number;
  allocated_by_currency: readonly { currency: string; value: string }[];
  updated_at: string;
}

export interface AlphaFleetRow extends QueryResultRow {
  scope_id: string;
  alpha_id: string;
  alpha_label: string;
  version: string;
  stage: string;
  stages: string[];
  stage_filter: string;
  stage_rank: number;
  owner: string | null;
  portfolios: Array<{ portfolio_id: string; name: string; base_currency: string }>;
  deployments: Array<{
    deployment_id: string; stage: string; venue: string; account_id: string;
    portfolio_id: string | null; portfolio_name: string | null; currency: string;
    allocation: string | null; balance_total: string | null; balance_free: string | null;
    balance_locked: string | null; position_fact_count: number;
    realized_pnl: string; unrealized_pnl: string; net_pnl: string; exposure: string;
    state: string; active: boolean; health: string; updated_at: string;
  }>;
  allocations: Array<{ currency: string; value: string }>;
  balances: Array<{ currency: string; total: string; free: string; locked: string }>;
  position_pnl: Array<{ currency: string; realized: string; unrealized: string; net: string }>;
  exposure: Array<{ currency: string; value: string }>;
  health: string;
  attention_reasons: string[];
  metrics_availability: Record<string, { state: string; reason_code: string | null }>;
  updated_at: Date;
}

export interface BindingRow extends QueryResultRow {
  scope_id: string;
  binding_id: string;
  account_id: string;
  venue: string;
  state: string;
  credential_state: string;
  updated_at: Date;
}

export interface AlphaFleetItem {
  alpha_id: string;
  alpha_label: string;
  version: string;
  stage: string;
  stages: readonly string[];
  owner: string | null;
  portfolios: readonly { portfolio_id: string; name: string; base_currency: string }[];
  deployments: AlphaFleetRow["deployments"];
  allocations: AlphaFleetRow["allocations"];
  balances: AlphaFleetRow["balances"];
  position_pnl: AlphaFleetRow["position_pnl"];
  exposure: AlphaFleetRow["exposure"];
  health: string;
  attention_reasons: readonly string[];
  metrics_availability: AlphaFleetRow["metrics_availability"];
  updated_at: string;
}

export interface BindingItem {
  binding_id: string;
  account_id: string;
  venue: string;
  state: string;
  credential_state: string;
  updated_at: string;
}

export function alphaFleetResource(): PostgresListResource<AlphaFleetRow, AlphaFleetItem> {
  return {
    resourceId: "execution.alpha-fleet-list.v2",
    table: "execution_alpha_fleet_projection",
    selectColumns: [
      "scope_id", "alpha_id", "alpha_label", "version", "stage", "stages", "stage_filter", "stage_rank", "owner", "portfolios",
      "deployments", "allocations", "balances", "position_pnl", "exposure", "health",
      "attention_reasons", "metrics_availability", "updated_at",
    ],
    workspaceColumn: "scope_id",
    idSortField: "alpha_id",
    filters: {
      alpha_label: { column: "alpha_label", kind: "text", operators: ["contains"], maxLength: 128 },
      stage: { column: "stage_filter", kind: "text", operators: ["contains"], maxLength: 70 },
      owner: { column: "owner", kind: "text", operators: ["eq"], maxLength: 128 },
      health: { column: "health", kind: "text", operators: ["eq"], maxLength: 64 },
    },
    sorts: {
      updated_at: { column: "updated_at", kind: "timestamp" },
      alpha_label: { column: "alpha_label", kind: "text" },
      stage: { column: "stage", kind: "text" },
      stage_rank: { column: "stage_rank", kind: "integer" },
      health: { column: "health", kind: "text" },
      alpha_id: { column: "alpha_id", kind: "text" },
    },
    defaultSort: [{ field: "stage_rank", direction: "desc" }, { field: "alpha_label", direction: "asc" }],
    allowedRoles: ["ADMIN", "USER"],
    statementTimeoutMs: 2_000,
    mapRow: (row) => ({
      alpha_id: row.alpha_id,
      alpha_label: row.alpha_label,
      version: row.version,
      stage: row.stage,
      stages: row.stages,
      owner: row.owner,
      portfolios: row.portfolios,
      deployments: row.deployments,
      allocations: row.allocations,
      balances: row.balances,
      position_pnl: row.position_pnl,
      exposure: row.exposure,
      health: row.health,
      attention_reasons: row.attention_reasons,
      metrics_availability: row.metrics_availability,
      updated_at: row.updated_at.toISOString(),
    }),
  };
}

export function bindingsResource(): PostgresListResource<BindingRow, BindingItem> {
  return {
    resourceId: "execution.bindings-list.v1",
    table: "execution_binding_projection",
    selectColumns: ["scope_id", "binding_id", "account_id", "venue", "state", "credential_state", "updated_at"],
    workspaceColumn: "scope_id",
    idSortField: "binding_id",
    filters: {
      binding_id: { column: "binding_id", kind: "text", operators: ["contains"], maxLength: 128 },
      venue: { column: "venue", kind: "text", operators: ["eq"], maxLength: 64 },
      state: { column: "state", kind: "text", operators: ["eq"], maxLength: 64 },
    },
    sorts: {
      updated_at: { column: "updated_at", kind: "timestamp" },
      venue: { column: "venue", kind: "text" },
      state: { column: "state", kind: "text" },
      binding_id: { column: "binding_id", kind: "text" },
    },
    defaultSort: [{ field: "updated_at", direction: "desc" }],
    allowedRoles: ["ADMIN", "USER"],
    statementTimeoutMs: 2_000,
    mapRow: (row) => ({
      binding_id: row.binding_id,
      account_id: row.account_id,
      venue: row.venue,
      state: row.state,
      credential_state: row.credential_state,
      updated_at: row.updated_at.toISOString(),
    }),
  };
}

export function fleetRawQuery(query: AlphaFleetQuery): RawKeysetQuery {
  return {
    after: query.after,
    before: query.before,
    limit: query.limit,
    sort: query.sort,
    filters: [
      ...(query.search ? [{ field: "alpha_label", op: "contains", value: query.search }] : []),
      ...(query.stage ? [{ field: "stage", op: "contains", value: `|${query.stage.toUpperCase()}|` }] : []),
      ...(query.owner ? [{ field: "owner", op: "eq", value: query.owner }] : []),
      ...(query.health ? [{ field: "health", op: "eq", value: query.health }] : []),
    ],
  };
}

export function bindingsRawQuery(query: BindingsQuery): RawKeysetQuery {
  return {
    after: query.after,
    before: query.before,
    limit: query.limit,
    sort: query.sort,
    filters: [
      ...(query.search ? [{ field: "binding_id", op: "contains", value: query.search }] : []),
      ...(query.venue ? [{ field: "venue", op: "eq", value: query.venue }] : []),
      ...(query.state ? [{ field: "state", op: "eq", value: query.state }] : []),
    ],
  };
}
