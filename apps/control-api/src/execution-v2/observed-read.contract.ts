import { z } from "zod";

/**
 * Core-observed read lane (owner approval 2026-11-23, design
 * ELP2-10/CORE_DESIGN_OBSERVED_MODE_20261123.md).
 *
 * These numbers are computed by Core from the Edge snapshots it already stores.
 * They are NOT TS-qualified and are NEVER presented as such: the body has its own
 * schema_version, a literal `trust.qualified:false`, `source_confidence:UNKNOWN`
 * and its own authority words. A qualified Manager reader cannot mistake it for a
 * qualified dataset (different schema_version), and nothing here can carry
 * SOURCE_VERIFIED, VERIFIED, PROVISIONAL or TRADING_SYSTEM.
 */
export const OBSERVED_READ_SCHEMA_VERSION = "portal.execution.observed-read.v1" as const;
export const OBSERVED_CALCULATION_REVISION = "core-observed.v1" as const;

/**
 * Conservative diagnostic defaults from the draft design, not an approved
 * production calibration or a source cadence guarantee. The Paper source is
 * irregular; freshness alone proves neither complete coverage nor enough NAV
 * grid points. Return/Drawdown additionally require an explicit coverage policy.
 */
export const OBSERVED_THRESHOLDS = Object.freeze({
  snapshot_refresh_stale_after_ms: 10 * 60 * 1000,
  figure_rows_stale_after_ms: 3 * 3_600_000,
  account_timestamp_spread_max_ms: 2 * 3_600_000,
});

export type ObservedErrorCode =
  | "EXECUTION_OBSERVED_READ_DISABLED"
  | "EXECUTION_OBSERVED_QUERY_INVALID"
  | "EXECUTION_OBSERVED_NOT_AVAILABLE_SCOPED_WORKSPACE";

/** Typed public refusal. The HTTP filter maps `code` and `status` only. */
export class ObservedReadError extends Error {
  constructor(readonly code: ObservedErrorCode, readonly status: number) {
    super("The requested observed read is not available.");
  }
}

const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,18})?$(?![\s\S])/);
const ms = z.number().int().min(0).max(8_640_000_000_000_000);
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/u);
const reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,95}$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$(?![\s\S])/);

export const OBSERVED_FIGURE_IDS = ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const;
export const OBSERVED_METHOD_IDS = {
  NAV: "OBSERVED_NAV_LATEST_EQUITY_PER_ACCOUNT_V1",
  NET_PNL: "OBSERVED_NET_PNL_LATEST_SOURCE_CUMULATIVE_V1",
  RETURN: "OBSERVED_RETURN_NAV_GRID_EQUITY_CHANGE_V1",
  DRAWDOWN: "OBSERVED_DRAWDOWN_NAV_GRID_PEAK_TO_TROUGH_V1",
} as const;
export const OBSERVED_NOT_PUBLISHED_FIGURES = [
  "SCORE", "REGIME", "COMPOSITION", "PORTFOLIO_NAV", "CAPITAL_MARKERS", "STAGE_TIMING", "FUNDING_BUCKET_PNL",
] as const;

const quality = z.object({
  completeness: z.enum(["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]),
  reasons: z.array(reason).max(16),
}).strict();

export const observedFigure = z.object({
  figure_id: z.enum(OBSERVED_FIGURE_IDS),
  method_id: z.enum([
    OBSERVED_METHOD_IDS.NAV, OBSERVED_METHOD_IDS.NET_PNL, OBSERVED_METHOD_IDS.RETURN, OBSERVED_METHOD_IDS.DRAWDOWN,
  ]),
  value: decimal.nullable(),
  unit: z.enum(["MONEY", "FRACTION"]),
  currency: text,
  basis: text,
  window: z.object({ from_ts_ms: ms, to_ts_ms: ms }).strict().nullable(),
  availability: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]),
  reason_code: reason.nullable(),
  quality,
  accounts_total: z.number().int().min(0).max(10_000),
  accounts_reported: z.number().int().min(0).max(10_000),
  oldest_ts_ms: ms.nullable(),
  newest_ts_ms: ms.nullable(),
  caveats: z.array(reason).max(8),
  source_confidence: z.literal("UNKNOWN"),
  calculation_revision: z.literal(OBSERVED_CALCULATION_REVISION),
  policy_revision: z.literal("NONE"),
}).strict().superRefine((figure, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (figure.method_id !== OBSERVED_METHOD_IDS[figure.figure_id]) issue("METHOD_FIGURE_MISMATCH");
  if ((figure.figure_id === "NAV" || figure.figure_id === "NET_PNL") !== (figure.unit === "MONEY")) issue("UNIT_FIGURE_MISMATCH");
  if (figure.availability === "UNAVAILABLE" ? figure.value !== null : figure.value === null) issue("VALUE_AVAILABILITY_MISMATCH");
  if (figure.availability !== "AVAILABLE" && figure.reason_code === null) issue("REASON_REQUIRED");
  if (figure.accounts_reported > figure.accounts_total) issue("ACCOUNT_COUNT_INVALID");
  if (figure.window && figure.window.from_ts_ms > figure.window.to_ts_ms) issue("WINDOW_ORDER_INVALID");
  if (figure.oldest_ts_ms !== null && figure.newest_ts_ms !== null && figure.oldest_ts_ms > figure.newest_ts_ms) issue("TIMESTAMP_ORDER_INVALID");
});
export type ObservedFigure = z.infer<typeof observedFigure>;

export const observedNotPublished = z.object({
  figure: z.enum([...OBSERVED_FIGURE_IDS, ...OBSERVED_NOT_PUBLISHED_FIGURES]),
  reason_code: reason,
}).strict();

export const observedReadResponse = z.object({
  schema_version: z.literal(OBSERVED_READ_SCHEMA_VERSION),
  surface: z.literal("FUND"),
  workspace_id: text,
  environment: z.enum(["paper", "sandbox", "live"]),
  trust: z.object({
    class: z.literal("CORE_OBSERVED_NOT_QUALIFIED"),
    qualified: z.literal(false),
    source_confidence: z.literal("UNKNOWN"),
    label_code: z.literal("OBSERVED_BY_CORE_FROM_EDGE_SNAPSHOT"),
    not_ts_qualified: z.literal(true),
  }).strict(),
  record_authority: z.literal("PORTAL_OBSERVATION"),
  source_authority: z.literal("EDGE_SNAPSHOT_VIA_CORE"),
  observation_semantics: z.literal("BOUNDED_CURRENT_WINDOW"),
  access_mode: z.literal("LEGACY_COMPATIBILITY"),
  coverage: z.literal("WORKSPACE_WHOLE_POPULATION"),
  as_of: z.object({
    read_at_ms: ms,
    snapshot_source_as_of_ms: ms.nullable(),
    snapshot_received_ms: ms.nullable(),
    last_refresh_ms: ms.nullable(),
    oldest_figure_ts_ms: ms.nullable(),
    newest_figure_ts_ms: ms.nullable(),
  }).strict(),
  projection: z.object({
    profile_id: text,
    epoch_id: text.nullable(),
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    payload_digest: digest.nullable(),
    source_catalogue_sha256: digest.nullable(),
  }).strict(),
  quality,
  figures: z.array(observedFigure).max(64),
  not_published: z.array(observedNotPublished).max(64),
}).strict().superRefine((body, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const seen = new Set<string>();
  for (const figure of body.figures) {
    const key = `${figure.figure_id}|${figure.currency}`;
    if (seen.has(key)) issue("DUPLICATE_FIGURE_PARTITION");
    seen.add(key);
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 1_048_576) issue("RESPONSE_TOO_LARGE");
});
export type ObservedReadResponse = z.infer<typeof observedReadResponse>;

export const observedOverviewQuery = z.object({
  environment: z.enum(["paper", "sandbox", "live"]).default("paper"),
  workspace_id: text.optional(),
}).strict();
export type ObservedOverviewQuery = z.infer<typeof observedOverviewQuery>;
