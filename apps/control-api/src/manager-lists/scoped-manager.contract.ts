import { z } from "zod";

// These are purpose-built public DTOs. Raw relation selectors, credentials,
// global projection counts and physical-account identifiers never enter them.
const text = z.string().min(1).refine(value => [...value].length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value));
const decimal = z.string().max(128).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const cursor = z.string().min(1).max(4096).regex(/^[A-Za-z0-9._-]+$(?![\s\S])/);
export const managerScopedFactsSchema = z.object({
  alpha_id: text.optional(), alpha_version_id: text.optional(), portfolio_id: text.optional(),
  deployment_id: text.optional(), account_id: text.optional(), binding_id: text.optional(),
  name: text.nullable().optional(), state: text.nullable().optional(), stage: text.nullable().optional(),
  venue: text.nullable().optional(), currency: text.nullable().optional(), base_currency: text.nullable().optional(),
  allocation: decimal.nullable().optional(), balance_total: decimal.nullable().optional(),
  balance_free: decimal.nullable().optional(), balance_locked: decimal.nullable().optional(),
  realized_pnl: decimal.nullable().optional(), unrealized_pnl: decimal.nullable().optional(),
  net_pnl: decimal.nullable().optional(), exposure: decimal.nullable().optional(),
  updated_at_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
}).strict();
export const managerScopedItemSchema = z.object({
  environment: z.enum(["paper", "sandbox", "live"]),
  identity: managerScopedFactsSchema,
  instances: z.array(managerScopedFactsSchema).max(2_000),
  financial_facts: z.array(z.object({
    kind: z.enum(["ALLOCATION", "INTERNAL_ACCOUNT_BALANCE", "POSITION_PNL"]),
    facts: managerScopedFactsSchema,
  }).strict()).max(8_000),
  financial_totals: z.array(managerScopedFactsSchema).max(200),
  is_full_resource: z.boolean(),
  financial_availability: z.object({ state: z.enum(["AVAILABLE", "PARTIAL", "NOT_PUBLISHED"]),
    reason_code: z.enum(["AUTHORIZED_RETAINED_FACTS", "SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE", "SOURCE_FACTS_NOT_PUBLISHED"]) }).strict(),
}).strict();
export const scopedManagerResponseSchema = z.object({
  schema_version: z.literal("portal.execution.manager-scoped.v1"),
  surface: z.enum(["ALPHA_FLEET", "PORTFOLIOS", "BINDINGS", "BINDING_DETAIL"]),
  workspace_id: text, environment: z.enum(["all", "paper", "sandbox", "live"]),
  record_authority: z.literal("PORTAL_PROJECTION"), source_authority: z.literal("TRADING_SYSTEM"),
  read_at_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  read_scope: z.object({ visibility: z.literal("SCOPED"), coverage: z.literal("AUTHORIZED_ONLY"),
    totals_scope: z.literal("VISIBLE_ROWS_ONLY"), policy_revisions: z.array(text).max(3) }).strict(),
  completeness: z.literal("PARTIAL"), reason_code: z.literal("RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY"),
  profile_dispositions: z.array(z.object({ environment: z.enum(["paper", "sandbox", "live"]),
    state: z.enum(["PARTIAL", "DENIED", "UNAVAILABLE"]), reason_code: text.nullable() }).strict()).min(1).max(3),
  page: z.object({ visible_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), returned_count: z.number().int().nonnegative().max(100),
    limit: z.number().int().min(1).max(100), maximum_response_bytes: z.literal(1048576),
    has_more: z.boolean(), next_cursor: cursor.nullable(), previous_cursor: cursor.nullable() }).strict(),
  items: z.array(managerScopedItemSchema).max(100),
}).strict().superRefine((value, context) => {
  if (value.items.length !== value.page.returned_count || value.page.returned_count > value.page.limit ||
    value.page.visible_count < value.page.returned_count || value.page.has_more !== (value.page.next_cursor !== null) ||
    value.page.returned_count === 0 && (value.page.next_cursor !== null || value.page.previous_cursor !== null))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_PAGE_INCONSISTENT", path: ["page"] });
});
export type ScopedManagerItem = z.infer<typeof managerScopedItemSchema>;
export type ScopedManagerResponse = z.infer<typeof scopedManagerResponseSchema>;
