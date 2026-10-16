import { z } from "zod";

// Pure wire validators shared by serving code and the networkless contract gate.
const adapterText = z.string().min(1).refine(value => [...value].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value));
const adapterDecimal = z.string().max(128).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const adapterTime = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const scopedAdapterFieldsSchema = z.object({
  alpha_id: adapterText.nullable().optional(), alpha_version_id: adapterText.nullable().optional(),
  strategy_id: adapterText.nullable().optional(), portfolio_id: adapterText.nullable().optional(),
  deployment_id: adapterText.nullable().optional(), account_id: adapterText.nullable().optional(),
  binding_id: adapterText.nullable().optional(), instrument_id: adapterText.nullable().optional(),
  position_id: adapterText.nullable().optional(), order_id: adapterText.nullable().optional(), fill_id: adapterText.nullable().optional(),
  name: adapterText.nullable().optional(), state: adapterText.nullable().optional(), status: adapterText.nullable().optional(),
  stage: adapterText.nullable().optional(), venue: adapterText.nullable().optional(), currency: adapterText.nullable().optional(),
  base_currency: adapterText.nullable().optional(), side: adapterText.nullable().optional(),
  quantity: adapterDecimal.nullable().optional(), price: adapterDecimal.nullable().optional(), notional: adapterDecimal.nullable().optional(),
  allocation: adapterDecimal.nullable().optional(), balance_total: adapterDecimal.nullable().optional(),
  balance_free: adapterDecimal.nullable().optional(), balance_locked: adapterDecimal.nullable().optional(),
  realized_pnl: adapterDecimal.nullable().optional(), unrealized_pnl: adapterDecimal.nullable().optional(),
  net_pnl: adapterDecimal.nullable().optional(), equity: adapterDecimal.nullable().optional(),
  timestamp_ms: adapterTime.nullable().optional(), occurred_at_ms: adapterTime.nullable().optional(),
  created_at: adapterTime.nullable().optional(), updated_at: adapterTime.nullable().optional(),
}).strict();
export const scopedAdapterGroupSchema = z.object({ state: z.enum(["PARTIAL", "EMPTY", "UNAVAILABLE"]), completeness: z.literal("PARTIAL"),
  freshness: z.literal("UNKNOWN"), as_of_ms: z.null(), returned_count: z.number().int().min(0).max(200), truncated: z.boolean(),
  reason_code: z.enum(["AUTHORIZED_RETAINED_FACTS", "RETAINED_FACTS_NOT_PUBLISHED"]), items: z.array(scopedAdapterFieldsSchema).max(200) }).strict();
export const scopedAdapterResponseSchema = z.object({ schema_version: z.literal("portal.execution.profile-read-adapter.v2"),
  capability_id: z.enum(["admin.inspect", "admin.performance", "admin.broker-read", "event.order-lifecycle"]),
  authority: z.literal("PORTAL_SGP_PROJECTION"), workspace_id: adapterText, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: adapterText, visibility: z.literal("SCOPED"), coverage: z.literal("AUTHORIZED_ONLY"), policy_revision: adapterText,
  bounds: z.object({ maximum_rows_per_relation: z.literal(200), maximum_response_bytes: z.literal(1048576) }).strict(),
  relations: z.record(z.enum(["strategies", "deployments", "accounts", "positions", "reconciliation", "performance", "account_equity",
    "portfolio_equity", "balances", "margin", "account_sync", "broker_sync", "venue_accounts", "orders", "fills", "sessions",
    "command_journal", "conditional_order_groups", "conditional_order_group_legs"]), scopedAdapterGroupSchema),
}).strict();
