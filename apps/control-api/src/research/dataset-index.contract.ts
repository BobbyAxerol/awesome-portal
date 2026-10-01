/** B7: safe index metadata only, no candles or source handles. V1 is unchanged. */
import { z } from "zod";
import { ResearchDatasetCatalogSchema } from "./dataset-catalog.contract";

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
const Coverage = z.object({ timeframe: Timeframe, resolution_seconds: Count.positive(),
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
}).strict();
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
export const BarMetadataSchema = z.object({ schema_version: z.literal("research.dataset-bar-metadata.v1"),
  catalog_revision: Digest.nullable(), as_of_utc_ms: Ms.nullable(), dataset_id: DatasetId, symbol: Symbol, timeframe: Timeframe,
  start_utc_ms: Ms, end_exclusive_utc_ms: Ms, scope: z.literal("INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION"),
  availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(), bars: Count.nullable(),
  first_bar_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(), warmup_bars_required: Count.max(100_000),
  warmup_bars_available_before_start: Count.max(100_000).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.start_utc_ms >= value.end_exclusive_utc_ms
    || (value.availability === "AVAILABLE") !== (value.reason_code === null)
    || (value.availability === "AVAILABLE") !== (value.bars !== null)
    || (value.availability === "AVAILABLE") !== (value.warmup_bars_available_before_start !== null)
    || value.availability === "AVAILABLE" && (value.catalog_revision === null || value.as_of_utc_ms === null)
    || value.warmup_bars_available_before_start !== null && value.warmup_bars_available_before_start > value.warmup_bars_required) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent indexed window metadata" });
  }
});
