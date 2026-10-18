import { z } from "zod";
import { utcMilliseconds, financialStage } from "./foundation.contract";

const text = z.string().min(1).max(160)
  .regex(/^(?=[\s\S]*\S)[^\u0000-\u001f\u007f]+$(?![\s\S])/u, "MANAGER_SEARCH_TEXT_INVALID")
  .refine(v => Buffer.from(v, "utf8").toString("utf8") === v, "MANAGER_SEARCH_TEXT_INVALID");
export const managerSearchText = text;
export const managerSearchMode = z.enum(["PREFIX", "CONTAINS"]);
export const managerWindowPreset = z.enum(["7D", "30D", "90D", "ALL"]);
export const managerExactWindow = z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict()
  .refine(v => v.from_ms < v.to_ms, "MANAGER_WINDOW_INVALID");
export const managerWindowQuery = z.union([managerWindowPreset, managerExactWindow]);
export type ManagerWindowQuery = z.infer<typeof managerWindowQuery>;
export const managerSelectedWindow = z.object({
  requested: managerWindowQuery,
  resolved: managerExactWindow.nullable(),
  selection_basis: z.literal("EXACT_PUBLISHED_METRIC_WINDOW_ONLY"),
  reason_code: z.literal("ALL_HISTORY_WINDOW_NOT_PUBLISHED").nullable(),
}).strict().superRefine((v, c) => {
  if ((v.requested === "ALL") !== (v.resolved === null) ||
    (v.resolved === null) !== (v.reason_code !== null))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_WINDOW_SELECTION_INVALID" });
  if (v.resolved !== null && typeof v.requested === "object" &&
    (v.resolved.from_ms !== v.requested.from_ms || v.resolved.to_ms !== v.requested.to_ms))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_WINDOW_CUSTOM_CHANGED" });
  if (v.resolved !== null && typeof v.requested === "string" && v.requested !== "ALL" &&
    v.resolved.to_ms - v.resolved.from_ms !== ({ "7D": 7, "30D": 30, "90D": 90 } as const)[v.requested] * 86_400_000)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_WINDOW_PRESET_CHANGED" });
});
export type ManagerSelectedWindow = z.infer<typeof managerSelectedWindow>;
export const managerWindowAbsenceReason = z.enum(["EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED"]);
export const managerWindowMissingSummary = z.object({ value: z.null(), status: z.literal("window_not_published"),
  reason_code: managerWindowAbsenceReason }).strict();

// Presence is not qualified availability: the metric's own complete envelope
// remains authoritative. No sample amount or fabricated publication appears here.
export const managerP1Options = z.object({
  temporal_mode: z.literal("CURRENT_ONLY"),
  search: z.object({ fields: z.array(z.literal("name")).max(1),
    modes: z.array(managerSearchMode).max(2), maximum_text_length: z.literal(160),
    normalization: z.literal("JS_TO_LOWER_CASE_NO_UNICODE_NORMALIZATION") }).strict(),
  sort_fields: z.array(z.enum(["alpha_id", "alpha_version_id", "name", "owner_user_id", "portfolio_id",
    "lifecycle", "venue", "health", "source_state", "allocation", "net_pnl", "unrealized_pnl",
    "balance_total", "equity_30d_end_value", "return_30d_pct", "score", "stage_presence"])).max(17),
  group_fields: z.array(z.enum(["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "venue", "health", "source_state", "lifecycle"])).max(8),
  // Finite projection-owned metric vocabulary; not all BUSINESS_READ_FIELDS.
  metric_keys: z.array(z.enum(["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score"])).max(7),
  economic_partition_required_for: z.array(z.enum(["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"])).max(5),
  window: z.object({ custom_supported: z.literal(true),
    interpretation: z.literal("MATCH_ONLY_NO_READ_TIME_CALCULATION"),
    independent_metrics: z.array(z.enum(["allocation", "balance_total", "unrealized_pnl"])).max(3),
    presets: z.array(z.object({ value: managerWindowPreset,
      resolved: managerExactWindow.nullable(),
      // METRIC_SPECIFIC means at least one scoped fact has this exact window;
      // it never promises complete census, methodology or a numeric metric.
      data_state: z.enum(["METRIC_SPECIFIC", "NOT_PUBLISHED"]),
      reason_code: z.enum(["EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED"]).nullable(),
    }).strict().superRefine((v, c) => {
      if (v.data_state === "METRIC_SPECIFIC" && (v.resolved === null || v.reason_code !== null) ||
        v.data_state === "NOT_PUBLISHED" && v.reason_code === null ||
        v.value === "ALL" && (v.resolved !== null || v.reason_code !== "ALL_HISTORY_WINDOW_NOT_PUBLISHED"))
        c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_WINDOW_OPTION_INVALID" });
    })).length(4),
  }).strict(),
  stage_environment: z.array(z.object({ environment: z.enum(["paper", "sandbox", "live"]),
    stages: z.array(financialStage).min(1).max(2) }).strict()).length(3),
  unavailable_fields: z.tuple([
    z.object({ field: z.literal("current_stage"), reason_code: z.literal("CURRENT_STAGE_GRAIN_NOT_PUBLISHED") }).strict(),
    z.object({ field: z.literal("days_in_stage"), reason_code: z.literal("STAGE_ENTRY_TIME_NOT_PUBLISHED") }).strict(),
  ]),
}).strict().superRefine((v, c) => {
  const unique = (items: readonly string[]) => new Set(items).size === items.length;
  for (const [key, items] of Object.entries({ sort_fields: v.sort_fields, group_fields: v.group_fields,
    metric_keys: v.metric_keys, economic_partition_required_for: v.economic_partition_required_for,
    independent_metrics: v.window.independent_metrics }))
    if (!unique(items)) c.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "MANAGER_OPTION_DUPLICATE" });
  const equal = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(k => b.includes(k));
  const money = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"];
  const stocks = ["allocation", "balance_total", "unrealized_pnl"];
  const metricKeys = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score"];
  const groupKeys = ["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "venue", "health", "source_state", "lifecycle"];
  if (!equal(v.economic_partition_required_for, v.metric_keys.filter(key => money.includes(key))) ||
    !equal(v.window.independent_metrics, v.metric_keys.filter(key => stocks.includes(key))) ||
    !equal(v.metric_keys, v.sort_fields.filter(key => metricKeys.includes(key))) ||
    !equal(v.group_fields, v.sort_fields.filter(key => groupKeys.includes(key))) ||
    (v.search.fields.length === 1) !== v.sort_fields.includes("name"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_OPTION_FIELD_SET_MISMATCH" });
  if (v.search.fields.length === 0 ? v.search.modes.length !== 0 :
    v.search.modes.length !== 2 || !v.search.modes.includes("PREFIX") || !v.search.modes.includes("CONTAINS"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_OPTION_SEARCH_MISMATCH" });
  if (JSON.stringify(v.window.presets.map(p => p.value)) !== JSON.stringify(["7D", "30D", "90D", "ALL"]))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_OPTION_PRESET_ORDER" });
  const stages = [{ environment: "paper", stages: ["PAPER"] }, { environment: "sandbox", stages: ["SANDBOX"] },
    { environment: "live", stages: ["CANARY", "LIVE"] }];
  if (JSON.stringify(v.stage_environment) !== JSON.stringify(stages))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_OPTION_STAGE_MAP" });
});
export type ManagerP1Options = z.infer<typeof managerP1Options>;

/** Runtime counterpart of the finite seven-key JSON conditional matrix. This
 * validates producer consistency, not authorization of browser-supplied keys. */
export function validateManagerP1Response(v: {
  environment: string; query_options: Pick<ManagerP1Options, "metric_keys">;
  selected_window: ManagerSelectedWindow | null;
  items: Array<{ metrics: Record<string, unknown>; stage_presence: string[]; children: Array<{ stage: string }> }>;
  scores: { raw: { status: string; reason_code?: string }; direct_nav: { status: string; reason_code?: string };
    composition: { status: string; reason_code?: string }; reason_code: string };
}, c: z.RefinementCtx): void {
  const expected = v.query_options.metric_keys;
  const stages = v.environment === "paper" ? ["PAPER"] : v.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
  for (let i = 0; i < v.items.length; i++) {
    const row = v.items[i], actual = Object.keys(row.metrics);
    const expectedSet = new Set<string>(expected);
    if (actual.length !== expected.length || actual.some(key => !expectedSet.has(key)))
      c.addIssue({ code: z.ZodIssueCode.custom, path: ["items", i, "metrics"], message: "MANAGER_METRIC_KEYS_MISMATCH" });
    if (row.stage_presence.some(stage => !stages.includes(stage)) || row.children.some(child => !stages.includes(child.stage)))
      c.addIssue({ code: z.ZodIssueCode.custom, path: ["items", i], message: "MANAGER_ENVIRONMENT_STAGE_MISMATCH" });
  }
  const missing = [v.scores.raw, v.scores.direct_nav, v.scores.composition].filter(s => s.status === "window_not_published");
  if (missing.length && (v.selected_window === null || missing.some(s =>
    s.reason_code !== (v.selected_window!.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED"))))
    c.addIssue({ code: z.ZodIssueCode.custom, path: ["scores"], message: "MANAGER_SCORE_WINDOW_ABSENCE_MISMATCH" });
  if (managerWindowAbsenceReason.safeParse(v.scores.reason_code).success &&
    (missing.length !== 3 || v.selected_window === null ||
      v.scores.reason_code !== (v.selected_window.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED")))
    c.addIssue({ code: z.ZodIssueCode.custom, path: ["scores", "reason_code"], message: "MANAGER_SCORE_REASON_MISMATCH" });
  if (missing.length === 3 && v.selected_window !== null &&
    v.scores.reason_code !== (v.selected_window.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED"))
    c.addIssue({ code: z.ZodIssueCode.custom, path: ["scores", "reason_code"], message: "MANAGER_SCORE_REASON_REQUIRED" });
}
