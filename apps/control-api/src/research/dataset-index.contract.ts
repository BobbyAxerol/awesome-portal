/** B7: safe index metadata only, no candles or source handles. V1 is unchanged. */
import { z } from "zod";
import { ResearchDatasetCatalogSchema } from "./dataset-catalog.contract";
import { ResearchPreflightCreateRequestSchema } from "./preflight.contract";

const Ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().min(0).max(10_000_000);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
export const DatasetId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);
const Symbol = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/);
const Timeframe = z.string().regex(/^[1-9][0-9]*(?:min|m|h|d)$/);
const Availability = z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable() }).strict()
  .refine(value => (value.state === "AVAILABLE") === (value.reason_code === null));
const MissingInstrument = z.object({ state: z.literal("NOT_PUBLISHED"), reason_code: Reason,
  origin: z.literal("HMD_DIRECT"), as_of_utc_ms: z.null(), contract_kind: z.null(),
  display_name: z.null(), underlying: z.null(), base: z.null(), quote: z.null(), settle_currency: z.null(),
  tick_size: z.null(), lot_size: z.null(), contract_multiplier: z.null(), listing_utc_ms: z.null(), expiry_utc_ms: z.null(),
}).strict();
const ClockGridCoverage = z.object({ timeframe: Timeframe, resolution_seconds: Count.positive(),
  availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  origin: z.literal("PORTAL_DERIVED"), as_of_utc_ms: Ms,
  first_bar_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(), last_closed_bar_end_utc_ms: Ms.nullable(),
  bar_count: Count, expected_bar_count: Count, missing_ratio: z.string().regex(/^0\.\d{12}$/).nullable(),
  gap_count: Count, largest_gap_seconds: Ms, duplicate_bar_count: Count,
  coverage_scope: z.literal("INDEXED_RANGE"), indexed_start_utc_ms: Ms, indexed_end_exclusive_utc_ms: Ms,
  closed_bar_policy: z.literal("INTERVAL_END_AT_OR_BEFORE_AS_OF_V1"),
}).strict().superRefine((value, ctx) => {
  const bad = () => ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent indexed coverage" });
  if (value.indexed_start_utc_ms >= value.indexed_end_exclusive_utc_ms || value.indexed_end_exclusive_utc_ms > value.as_of_utc_ms
    || value.bar_count > value.expected_bar_count || (value.availability === "AVAILABLE") !== (value.reason_code === null)) bad();
  if (value.bar_count > 0 && (value.first_bar_utc_ms === null || value.last_bar_utc_ms === null
    || value.last_closed_bar_end_utc_ms === null || value.missing_ratio === null || value.availability !== "AVAILABLE")) bad();
  if (!value.bar_count && (value.first_bar_utc_ms !== null || value.last_bar_utc_ms !== null
    || value.last_closed_bar_end_utc_ms !== null || value.missing_ratio !== null || value.expected_bar_count !== 0)) bad();
  if (value.first_bar_utc_ms !== null && value.last_bar_utc_ms !== null && value.last_closed_bar_end_utc_ms !== null
    && (value.first_bar_utc_ms < value.indexed_start_utc_ms || value.last_bar_utc_ms < value.first_bar_utc_ms
      || value.last_closed_bar_end_utc_ms > value.indexed_end_exclusive_utc_ms
      || value.last_closed_bar_end_utc_ms !== value.last_bar_utc_ms + value.resolution_seconds * 1000)) bad();
  if (value.first_bar_utc_ms !== null && value.last_bar_utc_ms !== null
    && value.expected_bar_count !== (value.last_bar_utc_ms - value.first_bar_utc_ms) / (value.resolution_seconds * 1000) + 1) bad();
  if (value.missing_ratio !== null && value.expected_bar_count && Math.abs(Number(value.missing_ratio)
    - (value.expected_bar_count - value.bar_count) / value.expected_bar_count) > 5.1e-13) bad();
});
const ObservedDailyCoverage = z.object({ timeframe: z.literal("1d"), resolution_seconds: z.literal(86400),
  availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  origin: z.literal("PORTAL_DERIVED"), as_of_utc_ms: Ms,
  first_bar_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(), last_closed_bar_end_utc_ms: z.null(),
  bar_count: Count, expected_bar_count: z.null(), missing_ratio: z.null(),
  gap_count: z.null(), largest_gap_seconds: z.null(), duplicate_bar_count: Count,
  coverage_scope: z.literal("INDEXED_RANGE"), indexed_start_utc_ms: Ms, indexed_end_exclusive_utc_ms: Ms,
  clock_basis: z.literal("OBSERVED_SOURCE_LOCAL_DATE_V1"), source_timezone: z.literal("Asia/Ho_Chi_Minh"),
  closed_bar_policy: z.literal("SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"),
  calendar_availability: z.object({ state: z.literal("NOT_PUBLISHED"), reason_code: z.literal("VN_SESSION_CALENDAR_NOT_PUBLISHED") }).strict(),
}).strict().superRefine((v, ctx) => {
  const aligned = (n: number) => (n + 7 * 3600000) % 86400000 === 0;
  if (v.indexed_start_utc_ms >= v.indexed_end_exclusive_utc_ms || v.indexed_end_exclusive_utc_ms > v.as_of_utc_ms
    || !aligned(v.indexed_start_utc_ms) || !aligned(v.indexed_end_exclusive_utc_ms)
    || (v.availability === "AVAILABLE") !== (v.reason_code === null)
    || (v.availability === "AVAILABLE") !== (v.bar_count > 0)
    || v.bar_count === 0 && (v.first_bar_utc_ms !== null || v.last_bar_utc_ms !== null)
    || v.bar_count > 0 && (v.first_bar_utc_ms === null || v.last_bar_utc_ms === null
      || !aligned(v.first_bar_utc_ms) || !aligned(v.last_bar_utc_ms)
      || v.first_bar_utc_ms < v.indexed_start_utc_ms || v.last_bar_utc_ms < v.first_bar_utc_ms
      || v.last_bar_utc_ms >= v.indexed_end_exclusive_utc_ms
      || v.bar_count > (v.last_bar_utc_ms - v.first_bar_utc_ms) / 86400000 + 1))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent observed-date coverage" });
});
const Coverage = z.union([ClockGridCoverage, ObservedDailyCoverage]);
const LegacyDataset = ResearchDatasetCatalogSchema.shape.datasets.element;
export const IndexedSymbolSchema = LegacyDataset.shape.symbols.shape.items.element.extend({
  coverage_by_timeframe: z.array(Coverage).max(16), coverage_availability: Availability,
  instrument: MissingInstrument,
  quality: z.object({ state: z.literal("NOT_PUBLISHED"), reason_code: z.literal("HMD_QUALITY_IS_TIMEFRAME_SPECIFIC"),
    origin: z.literal("PORTAL_DERIVED"), gap_count: z.null(), missing_ratio: z.null(), duplicate_bar_count: z.null(), as_of_utc_ms: Ms.nullable() }).strict(),
}).strict();
export const ResearchDatasetCatalogV2Schema = z.object({
  schema_version: z.literal("research.dataset-catalog.v2"), catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
  index_availability: Availability,
  datasets: z.array(LegacyDataset.extend({ catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
    asset_class: z.null(), asset_class_availability: Availability,
    timeframes: z.array(z.object({ timeframe: Timeframe, resolution_seconds: Count.positive(),
      availability: z.enum(["available", "unavailable"]), reason_code: Reason.nullable() }).strict()).max(16),
    symbols: LegacyDataset.shape.symbols.extend({ items: z.array(IndexedSymbolSchema).max(256) }),
  })).max(16), coverage_rule: z.string().min(1).max(400),
}).strict().superRefine((v, ctx) => {
  for (const dataset of v.datasets) for (const symbol of dataset.symbols.items) for (const row of symbol.coverage_by_timeframe) {
    const observed = "clock_basis" in row;
    if (observed !== (dataset.dataset_id === "vn-stock-daily")
      || observed && dataset.source_timezone !== "Asia/Ho_Chi_Minh")
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"Coverage belongs to another source date basis"});
  }
});
export type ResearchDatasetCatalogV2 = z.infer<typeof ResearchDatasetCatalogV2Schema>;

const Workspace = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional();
export const IndexedCatalogQuery = z.object({ workspace_id: Workspace }).strict();
export const SymbolPageQuery = z.object({ workspace_id: Workspace, q: z.string().regex(/^[A-Za-z0-9_-]{0,32}$/).default(""),
  kind: z.enum(["PERPETUAL", "QUARTERLY"]).optional(), timeframe: Timeframe.optional(),
  cursor: z.string().min(1).max(4096).optional(), limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
export const SymbolPageSchema = z.object({ schema_version: z.literal("research.dataset-symbols.v1"), dataset_id: DatasetId,
  catalog_revision: Digest, as_of_utc_ms: Ms.nullable(), availability: Availability, items: z.array(IndexedSymbolSchema).max(200),
  total: z.number().int().min(0).max(256).nullable(), next_cursor: z.string().max(4096).nullable(),
}).strict();
export const BarMetadataQuery = z.object({ workspace_id: Workspace, symbol: Symbol, timeframe: Timeframe,
  start_utc_ms: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  end_exclusive_utc_ms: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  warmup_bars: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict().refine(value => value.start_utc_ms < value.end_exclusive_utc_ms);
const VerifiedRange = z.object({ start_utc_ms: Ms, end_exclusive_utc_ms: Ms,
  basis: z.enum(["INDEXED_TARGET_BAR_RANGE_V1", "INDEXED_OBSERVED_LOCAL_DATE_RANGE_V1"]) }).strict().refine(value => value.start_utc_ms < value.end_exclusive_utc_ms);
export const BarMetadataSchema = z.object({ schema_version: z.literal("research.dataset-bar-metadata.v1"),
  catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(), dataset_id: DatasetId, symbol: Symbol, timeframe: Timeframe,
  start_utc_ms: Ms, end_exclusive_utc_ms: Ms, scope: z.literal("INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION"),
  availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(), bars: Count.nullable(),
  first_bar_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(), warmup_bars_required: Count.max(100_000),
  warmup_bars_available_before_start: Count.max(100_000).nullable(),
  verified_range: VerifiedRange.nullable().optional(), earliest_start_with_warmup_utc_ms: Ms.nullable().optional(),
  clock_basis: z.literal("OBSERVED_SOURCE_LOCAL_DATE_V1").optional(),
  source_timezone: z.literal("Asia/Ho_Chi_Minh").optional(), warmup_start_utc_ms: Ms.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const range = value.verified_range;
  const observed = value.dataset_id === "vn-stock-daily";
  const observedClock = (n: number) => (n + 7 * 3600000) % 86400000 === 0;
  if (observed && (value.timeframe !== "1d" || value.clock_basis !== "OBSERVED_SOURCE_LOCAL_DATE_V1"
      || value.source_timezone !== "Asia/Ho_Chi_Minh" || value.warmup_start_utc_ms === undefined
      || !observedClock(value.start_utc_ms) || !observedClock(value.end_exclusive_utc_ms)
      || range != null && (range.basis !== "INDEXED_OBSERVED_LOCAL_DATE_RANGE_V1"
        || !observedClock(range.start_utc_ms) || !observedClock(range.end_exclusive_utc_ms))
      || value.first_bar_utc_ms !== null && !observedClock(value.first_bar_utc_ms)
      || value.last_bar_utc_ms !== null && !observedClock(value.last_bar_utc_ms)
      || value.earliest_start_with_warmup_utc_ms != null && !observedClock(value.earliest_start_with_warmup_utc_ms)
      || value.warmup_start_utc_ms != null && (range == null || !observedClock(value.warmup_start_utc_ms)
        || value.warmup_start_utc_ms < range.start_utc_ms || value.warmup_start_utc_ms > value.start_utc_ms)
      || value.availability === "AVAILABLE" && value.warmup_bars_required > 0 && value.warmup_start_utc_ms == null)
    || !observed && (value.clock_basis !== undefined || value.source_timezone !== undefined
      || value.warmup_start_utc_ms !== undefined || range?.basis === "INDEXED_OBSERVED_LOCAL_DATE_RANGE_V1")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incorrect dataset date basis" });
  }
  const measuredRefusal = value.availability === "NOT_PUBLISHED"
    && value.reason_code === "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" && range != null
    && value.start_utc_ms >= range.start_utc_ms && value.end_exclusive_utc_ms <= range.end_exclusive_utc_ms
    && value.warmup_bars_required > 0 && value.bars !== null && value.warmup_bars_available_before_start !== null;
  const measured = value.availability === "AVAILABLE" || measuredRefusal;
  if (value.start_utc_ms >= value.end_exclusive_utc_ms
    || (value.availability === "AVAILABLE") !== (value.reason_code === null)
    || measured !== (value.bars !== null) || measured !== (value.warmup_bars_available_before_start !== null)
    || (measured || range != null) && (value.catalog_revision === null || value.as_of_utc_ms === null)
    || value.warmup_bars_available_before_start !== null && value.warmup_bars_available_before_start > value.warmup_bars_required
    || measuredRefusal && value.warmup_bars_available_before_start! >= value.warmup_bars_required
    || range != null && value.availability === "NOT_PUBLISHED" && value.reason_code !== "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    || range != null && (value.as_of_utc_ms === null || range.end_exclusive_utc_ms > value.as_of_utc_ms)
    || value.earliest_start_with_warmup_utc_ms != null && (range == null
      || value.earliest_start_with_warmup_utc_ms < range.start_utc_ms
      || value.earliest_start_with_warmup_utc_ms >= range.end_exclusive_utc_ms)
    || !measured && (value.first_bar_utc_ms !== null || value.last_bar_utc_ms !== null)
    || measured && value.bars === 0 && (value.first_bar_utc_ms !== null || value.last_bar_utc_ms !== null)
    || measured && value.bars! > 0 && (value.first_bar_utc_ms === null || value.last_bar_utc_ms === null
      || value.first_bar_utc_ms < value.start_utc_ms || value.last_bar_utc_ms < value.first_bar_utc_ms
      || value.last_bar_utc_ms >= value.end_exclusive_utc_ms)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent indexed window metadata" });
  }
});

export const DeclarationEstimateRequestSchema = ResearchPreflightCreateRequestSchema;
const WindowEstimate = z.object({ window: z.enum(["IS", "OOS", "HOLDOUT", "SPAN"]),
  start_utc_ms: Ms, end_exclusive_utc_ms: Ms, availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(), bars: Count.nullable(), first_bar_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(),
  warmup_bars_required: Count.max(100_000), warmup_bars_available_before_start: Count.max(100_000).nullable(),
}).strict();
export const DeclarationMetadataSchema = z.object({
  schema_version: z.literal("research.declaration-metadata.v1"), catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(),
  requested_spec_digest: Digest,
  scope: z.literal("INDEX_ESTIMATE_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION"), windows: z.array(WindowEstimate).min(1).max(3),
  planned_folds: z.object({ availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
    count: z.number().int().min(1).max(128).nullable(), basis: z.literal("P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1"),
    min_train_bars: Count.nullable(), min_oos_bars: Count.nullable(),
    items: z.array(z.object({ ordinal: z.number().int().min(1).max(128),
      train: z.object({ start_utc_ms: Ms, end_exclusive_utc_ms: Ms, bars: Count }).strict(),
      outer_oos: z.object({ start_utc_ms: Ms, end_exclusive_utc_ms: Ms, bars: Count }).strict(),
    }).strict()).max(128).optional() }).strict(),
  earliest_start_utc_ms: Ms.nullable(), earliest_start_basis: z.enum(["CONTIGUOUS_INDEXED_WARMUP_BARS_V1", "OBSERVED_INDEXED_WARMUP_BARS_V1"]),
}).strict().superRefine((v, ctx) => {
  const plan = v.planned_folds;
  if (plan.items && (plan.availability !== "AVAILABLE" || plan.items.length !== plan.count
    || plan.items.some((fold, i) => fold.ordinal !== i + 1
      || fold.train.start_utc_ms >= fold.train.end_exclusive_utc_ms
      || fold.outer_oos.start_utc_ms >= fold.outer_oos.end_exclusive_utc_ms
      || fold.train.end_exclusive_utc_ms > fold.outer_oos.start_utc_ms)))
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Inconsistent engine fold geometry"});
  for (const row of [v.planned_folds, ...v.windows]) {
    if ((row.availability === "AVAILABLE") !== (row.reason_code === null)
      || ("bars" in row && (row.availability === "AVAILABLE") !== (row.bars !== null))
      || ("count" in row && (row.availability === "AVAILABLE") !== (row.count !== null)))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent declaration availability" });
  }
});
export const DeclarationConditionSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/),
  state: z.enum(["PASS", "FAIL", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  observed: z.string().max(200).nullable(), required: z.string().max(200),
}).strict().refine(v => (v.state === "PASS") === (v.reason_code === null));
export const DeclarationEstimateSchema = z.object({ schema_version: z.literal("research.declaration-estimate.v1"),
  metadata: DeclarationMetadataSchema, profile_id: DatasetId.nullable(),
  conditions: z.array(DeclarationConditionSchema).min(1).max(32), ready_for_preflight: z.boolean(),
}).strict().refine(v => v.ready_for_preflight === v.conditions.every(row => row.state === "PASS"));
