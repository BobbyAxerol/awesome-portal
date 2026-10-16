import { z } from "zod";
import { exactDecimal, executionEnvironment, utcMilliseconds } from "./foundation.contract";

/** Purpose-specific public vocabulary, intersected with the caller's field
 * policy BEFORE validation. This is not a permission preset or source proof. */
export const HISTORY_IDENTIFIER_FIELDS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id",
  "account_id", "strategy_id", "instrument_id", "order_id", "fill_id", "position_id"] as const;
export const HISTORY_DECIMAL_FIELDS = ["quantity", "price", "notional", "allocation", "balance_total", "balance_free",
  "balance_locked", "realized_pnl", "unrealized_pnl", "net_pnl", "exposure", "equity", "drawdown", "return"] as const;
export const HISTORY_TEXT_FIELDS = ["currency", "base_currency", "side"] as const;
// JSON Schema maxLength counts Unicode code points, not UTF-16 code units.
const boundedText = z.string().min(1).refine(value => [...value].length <= 256, "TEXT_TOO_LONG");
const text = boundedText.refine(value => !/[\u0000-\u001f\u007f]/.test(value), "TEXT_CONTROL_CHARACTER");
// JS `$` can match before a final newline; don't accept that as decimal bytes.
const historyDecimal = exactDecimal.refine(value => !/[\r\n]/.test(value), "DECIMAL_TRAILING_LINE_BREAK");
const rowShape = {
  ...Object.fromEntries(HISTORY_IDENTIFIER_FIELDS.map(key => [key, text.nullable().optional()])),
  ...Object.fromEntries(HISTORY_DECIMAL_FIELDS.map(key => [key, historyDecimal.nullable().optional()])),
  ...Object.fromEntries(HISTORY_TEXT_FIELDS.map(key => [key, text.nullable().optional()])),
  timestamp_ms: utcMilliseconds,
};
export const historyRowSchema = z.object(rowShape).strict();
export const HISTORY_PUBLIC_FIELDS = new Set(Object.keys(rowShape));
export const historyV2Schema = z.object({
  schema_version: z.literal("portal.execution.timeseries-history.v2"),
  authority: z.literal("PORTAL_SGP_HISTORY_MIRROR"), environment: executionEnvironment,
  profile_id: text, relation_key: text, state: z.enum(["AVAILABLE", "EMPTY"]),
  completeness: z.literal("PARTIAL"), reason_code: z.literal("N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY"),
  read_scope: z.object({ visibility: z.literal("SCOPED"), coverage: z.literal("AUTHORIZED_ONLY"),
    policy_revision: boundedText }).strict(),
  coverage: z.object({ basis: z.literal("EXACT_AUTHORIZED_RETAINED_RANGE"),
    row_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), oldest_ms: utcMilliseconds.nullable(),
    newest_ms: utcMilliseconds.nullable(), range: z.literal("START_INCLUSIVE_END_EXCLUSIVE") }).strict(),
  page: z.object({ returned_count: z.number().int().min(0).max(2000), limit: z.number().int().min(1).max(2000),
    maximum_response_bytes: z.literal(1048576), has_more: z.boolean(),
    next_cursor: z.string().min(1).max(4096).regex(/^[A-Za-z0-9._-]+$(?![\s\S])/).nullable() }).strict(),
  items: z.array(historyRowSchema).max(2000),
}).strict().superRefine((value, ctx) => {
  const invalid = (path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom,
    path, message: "HISTORY_RESPONSE_INCONSISTENT" });
  if (value.page.returned_count !== value.items.length || value.items.length > value.page.limit) invalid(["page", "returned_count"]);
  if (value.page.has_more !== (value.page.next_cursor !== null)) invalid(["page", "next_cursor"]);
  if ((value.state === "EMPTY") !== (value.coverage.row_count === 0)) invalid(["state"]);
  if (value.coverage.row_count < value.items.length) invalid(["coverage", "row_count"]);
  if (value.coverage.row_count === 0) {
    if (value.coverage.oldest_ms !== null || value.coverage.newest_ms !== null || value.page.has_more) invalid(["coverage"]);
  } else if (value.coverage.oldest_ms === null || value.coverage.newest_ms === null ||
      value.coverage.oldest_ms > value.coverage.newest_ms) invalid(["coverage"]);
});
