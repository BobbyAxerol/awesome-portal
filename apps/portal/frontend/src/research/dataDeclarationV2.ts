/**
 * Data declaration v2 readers (DATA_DECLARATION_SPEC §3, §4; B7 index contract).
 *
 * The shapes are the generated `research-dataset-index` ones (catalog v2,
 * symbol page, bar metadata). Every reader still takes `unknown`, keeps only
 * what has the right type and returns null for what is absent, so a server that
 * sends none, or an older one that sends the v1 catalog, leaves the screen as it
 * was. Nothing is derived here: a bar count, a gap count, a fold count or a
 * condition is printed only as the server sent it. The preflight estimate
 * (planned folds, conditions) is not part of the B7 index and keeps its
 * proposed reader below.
 *
 * `dataDeclaration.ts` re-exports everything here, so callers import one module.
 */

import type { components } from "@portal/contracts-research-dataset-index";

import type { CatalogDataset, CatalogSymbol, DatasetCatalog } from "./datasetClient";

/** The generated B7 shapes, named once so readers and tests share them. */
export type IndexSchemas = components["schemas"];
export type DatasetCatalogV2 = IndexSchemas["DatasetCatalogV2"];
export type IndexedSymbol = IndexSchemas["IndexedSymbol"];
export type IndexCoverage = IndexSchemas["Coverage"];
export type IndexSymbolPage = IndexSchemas["SymbolPage"];
export type IndexBarMetadata = IndexSchemas["BarMetadata"];
/** `POST /api/v1/research/datasets/declaration-estimates` (B7/B8 `researchDeclarationEstimatePostV1`). */
export type DeclarationEstimate = IndexSchemas["DeclarationEstimate"];
export type DeclarationCondition = IndexSchemas["DeclarationCondition"];
export type DeclarationWindowEstimate = IndexSchemas["WindowEstimate"];

type Bag = Readonly<Record<string, unknown>>;

function bag(value: unknown): Bag | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Bag) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A finite number; a numeric string is NOT one. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A non-negative whole number (a bar, gap or fold count). */
function count(value: unknown): number | null {
  const n = num(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

/** An exact decimal kept as text (`0.10`, `0.000412`). A number is refused: it would drop the zeros. */
function decimal(value: unknown): string | null {
  return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? value : null;
}

/** Month index (`year * 12 + month - 1`) of an epoch-ms instant, in UTC. */
export function utcMonthIndex(ms: number): number {
  const date = new Date(ms);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** `2026-10-01` from epoch ms, in UTC. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `2026-10-01 21:00` from epoch ms, in UTC. */
export function utcMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/** An exact integer with thousands separators; every digit stays. */
export function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ------------------------------------------------------------ instrument */

export interface InstrumentFacts {
  /** The served state word (`NOT_PUBLISHED` today); an unknown word is kept as written. */
  state: string | null;
  reasonCode: string | null;
  /** Where the fact would come from (`HMD_DIRECT`): the origin is explicit on the wire. */
  origin: string | null;
  displayName: string | null;
  contractKind: string | null;
  underlying: string | null;
  base: string | null;
  quote: string | null;
  settleCurrency: string | null;
  tickSize: string | null;
  lotSize: string | null;
  contractMultiplier: string | null;
  listingUtcMs: number | null;
  expiryUtcMs: number | null;
}

/** `symbols[].instrument`, or null when the server did not send one. */
export function readInstrument(item: unknown): InstrumentFacts | null {
  const raw = bag(bag(item)?.instrument);
  if (raw === null) return null;
  return {
    state: text(raw.state),
    reasonCode: text(raw.reason_code),
    origin: text(raw.origin),
    displayName: text(raw.display_name),
    contractKind: text(raw.contract_kind),
    underlying: text(raw.underlying),
    base: text(raw.base),
    quote: text(raw.quote),
    settleCurrency: text(raw.settle_currency),
    tickSize: decimal(raw.tick_size),
    lotSize: decimal(raw.lot_size),
    contractMultiplier: decimal(raw.contract_multiplier),
    listingUtcMs: num(raw.listing_utc_ms),
    expiryUtcMs: num(raw.expiry_utc_ms),
  };
}

/** Whether the instrument carries any official fact (terms, names, listing or expiry). */
export function hasInstrumentFacts(instrument: InstrumentFacts | null): boolean {
  return (
    instrument !== null &&
    [
      instrument.displayName,
      instrument.underlying,
      instrument.base,
      instrument.quote,
      instrument.settleCurrency,
      instrument.tickSize,
      instrument.lotSize,
      instrument.contractMultiplier,
      instrument.listingUtcMs,
      instrument.expiryUtcMs,
    ].some((fact) => fact !== null)
  );
}

export interface InstrumentAbsence {
  /** The served code (`HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED`), or null when none was sent. */
  reasonCode: string | null;
  origin: string | null;
}

/**
 * The one typed absence for a symbol's instrument: the server sent an
 * `instrument` block and it carries no official fact. null when the block is
 * absent (a v1 catalog: nothing to say) or when it does carry facts.
 */
export function instrumentAbsence(item: unknown): InstrumentAbsence | null {
  const instrument = readInstrument(item);
  if (instrument === null || hasInstrumentFacts(instrument)) return null;
  return { reasonCode: instrument.reasonCode, origin: instrument.origin };
}

/** The tooltip of the absence chip: the served code and origin, never a guess at a value. */
export function instrumentAbsenceTitle(absence: InstrumentAbsence): string {
  return ["instrument terms (tick, lot, multiplier, listing, expiry) not published", absence.reasonCode, absence.origin ? `origin ${absence.origin}` : null]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** `tick 0.10 · lot 0.001 · ×1` from the served terms; a term the server left out is left out, never zeroed. */
export function instrumentTerms(instrument: InstrumentFacts): string {
  return [
    instrument.tickSize ? `tick ${instrument.tickSize}` : null,
    instrument.lotSize ? `lot ${instrument.lotSize}` : null,
    instrument.contractMultiplier ? `×${instrument.contractMultiplier}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** `2021-03-26` when the server published an expiry, else null (the name is never parsed). */
export function expiryDay(item: unknown): string | null {
  const expiry = readInstrument(item)?.expiryUtcMs ?? null;
  return expiry === null ? null : utcDay(expiry);
}

/**
 * Soonest served expiry first; an item that carries none keeps its place after
 * those that do, and items without any expiry keep the served order.
 */
export function sortByExpiry<T>(items: readonly T[]): readonly T[] {
  return items
    .map((item, index) => ({ item, index, expiry: readInstrument(item)?.expiryUtcMs ?? null }))
    .sort((a, b) => {
      if (a.expiry !== null && b.expiry !== null && a.expiry !== b.expiry) return a.expiry - b.expiry;
      if ((a.expiry === null) !== (b.expiry === null)) return a.expiry === null ? 1 : -1;
      return a.index - b.index;
    })
    .map((row) => row.item);
}

/* ------------------------------------------------------- per-timeframe */

export interface TimeframeCoverage {
  timeframe: string;
  /** `AVAILABLE`, or `NOT_PUBLISHED` with its code; no count of a not-published entry is ever kept. */
  availability: string;
  reasonCode: string | null;
  asOfUtcMs: number | null;
  firstBarUtcMs: number | null;
  lastBarUtcMs: number | null;
  barCount: number | null;
  expectedBarCount: number | null;
  missingRatio: string | null;
  gapCount: number | null;
  largestGapSeconds: number | null;
  duplicateBarCount: number | null;
  /** The range the counts were taken over (`INDEXED_RANGE`); the counts say nothing outside it. */
  indexedStartUtcMs: number | null;
  indexedEndExclusiveUtcMs: number | null;
}

/** `symbols[].coverage_by_timeframe[]`, or null when the server did not send the array. */
export function readCoverageByTimeframe(item: unknown): readonly TimeframeCoverage[] | null {
  const raw = bag(item)?.coverage_by_timeframe;
  if (!Array.isArray(raw)) return null;
  const out: TimeframeCoverage[] = [];
  for (const entry of raw) {
    const row = bag(entry);
    const timeframe = text(row?.timeframe);
    if (row === null || timeframe === null) continue;
    /* A `NOT_PUBLISHED` entry still carries typed numbers on the wire; they are not facts. */
    const published = row.availability === "AVAILABLE";
    out.push({
      timeframe,
      availability: text(row.availability) ?? "NOT_PUBLISHED",
      reasonCode: text(row.reason_code),
      asOfUtcMs: num(row.as_of_utc_ms),
      firstBarUtcMs: published ? num(row.first_bar_utc_ms) : null,
      lastBarUtcMs: published ? num(row.last_bar_utc_ms) : null,
      barCount: published ? count(row.bar_count) : null,
      expectedBarCount: published ? count(row.expected_bar_count) : null,
      missingRatio: published ? decimal(row.missing_ratio) : null,
      gapCount: published ? count(row.gap_count) : null,
      largestGapSeconds: published ? count(row.largest_gap_seconds) : null,
      duplicateBarCount: published ? count(row.duplicate_bar_count) : null,
      indexedStartUtcMs: published ? num(row.indexed_start_utc_ms) : null,
      indexedEndExclusiveUtcMs: published ? num(row.indexed_end_exclusive_utc_ms) : null,
    });
  }
  return out;
}

/** `symbols[].coverage_availability`: why a symbol has no per-timeframe bars (`HMD_SYMBOL_INTERVAL_NOT_INDEXED`). */
export function coverageAbsence(item: unknown): { reasonCode: string | null } | null {
  const raw = bag(bag(item)?.coverage_availability);
  return raw !== null && raw.state === "NOT_PUBLISHED" ? { reasonCode: text(raw.reason_code) } : null;
}

/** The coverage the server published for exactly this timeframe, or null. */
export function coverageFor(item: unknown, timeframe: string): TimeframeCoverage | null {
  return readCoverageByTimeframe(item)?.find((entry) => entry.timeframe === timeframe) ?? null;
}

/** `59,182 of 59,182 bars · 0 gaps` from the served counts; null when none was served. */
export function barsLine(coverage: TimeframeCoverage): string | null {
  const parts: string[] = [];
  if (coverage.barCount !== null && coverage.expectedBarCount !== null) {
    parts.push(`${group(coverage.barCount)} of ${group(coverage.expectedBarCount)} bars`);
  } else if (coverage.barCount !== null) {
    parts.push(`${group(coverage.barCount)} bars`);
  }
  if (coverage.gapCount !== null) parts.push(`${group(coverage.gapCount)} gap${coverage.gapCount === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The rest of the gap story, for a tooltip: missing ratio, the largest gap, duplicates, and the as-of of the counts. */
export function gapDetail(coverage: TimeframeCoverage): string | null {
  const parts = [
    coverage.missingRatio !== null ? `missing ${coverage.missingRatio}` : null,
    coverage.largestGapSeconds !== null ? `largest gap ${group(coverage.largestGapSeconds)} s` : null,
    coverage.duplicateBarCount !== null ? `duplicates ${group(coverage.duplicateBarCount)}` : null,
    coverage.asOfUtcMs !== null ? `as of ${utcMinute(coverage.asOfUtcMs)} UTC` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* -------------------------------------------------------------- quality */

/** `symbols[].quality`: typed `HMD_QUALITY_IS_TIMEFRAME_SPECIFIC`, never a number of its own. */
export interface AggregateQuality {
  state: string;
  reasonCode: string | null;
  asOfUtcMs: number | null;
}

/** The aggregate quality block, or null when absent. An unknown state word is kept as the server wrote it. */
export function readQuality(item: unknown): AggregateQuality | null {
  const raw = bag(bag(item)?.quality);
  const state = text(raw?.state);
  if (raw === null || state === null) return null;
  return { state, reasonCode: text(raw.reason_code), asOfUtcMs: num(raw.as_of_utc_ms) };
}

/**
 * What the picked timeframe says about a symbol's bars: its gaps, missing
 * ratio and duplicates as served, or the typed reason there are none. The
 * aggregate block is not read for numbers: the server types it as
 * timeframe-specific, so the numbers live in `coverage_by_timeframe`.
 */
export interface SymbolQuality {
  kind: "served" | "absent";
  timeframe: string | null;
  gapCount: number | null;
  missingRatio: string | null;
  duplicateBarCount: number | null;
  asOfUtcMs: number | null;
  /** The served code when absent (`HMD_QUALITY_IS_TIMEFRAME_SPECIFIC`, `HMD_SYMBOL_INTERVAL_NOT_INDEXED`, ...). */
  reasonCode: string | null;
}

/** null when the symbol carries no quality fact at all (a v1 catalog). */
export function timeframeQuality(item: unknown, timeframe: string): SymbolQuality | null {
  const aggregate = readQuality(item);
  const frames = readCoverageByTimeframe(item);
  if (aggregate === null && frames === null) return null;
  const frame = timeframe === "" ? null : (frames?.find((entry) => entry.timeframe === timeframe) ?? null);
  if (frame !== null && frame.availability === "AVAILABLE" && frame.gapCount !== null) {
    return {
      kind: "served",
      timeframe,
      gapCount: frame.gapCount,
      missingRatio: frame.missingRatio,
      duplicateBarCount: frame.duplicateBarCount,
      asOfUtcMs: frame.asOfUtcMs ?? aggregate?.asOfUtcMs ?? null,
      reasonCode: null,
    };
  }
  return {
    kind: "absent",
    timeframe: timeframe === "" ? null : timeframe,
    gapCount: null,
    missingRatio: null,
    duplicateBarCount: null,
    asOfUtcMs: frame?.asOfUtcMs ?? aggregate?.asOfUtcMs ?? null,
    reasonCode: frame?.reasonCode ?? coverageAbsence(item)?.reasonCode ?? aggregate?.reasonCode ?? null,
  };
}

/** Whether the served numbers show anything worth the eye: a gap, a missing share or a duplicate. */
export function qualityNeedsAttention(quality: SymbolQuality): boolean {
  return (
    quality.kind === "served" &&
    ((quality.gapCount ?? 0) > 0 || (quality.duplicateBarCount ?? 0) > 0 || (quality.missingRatio !== null && Number(quality.missingRatio) > 0))
  );
}

/** `1 gap` / `0 gaps`: the chip text, from the served count only. */
export function qualityText(quality: SymbolQuality): string {
  if (quality.kind === "absent" || quality.gapCount === null) return "quality — not published";
  return `${group(quality.gapCount)} gap${quality.gapCount === 1 ? "" : "s"}`;
}

/** The tooltip of a quality chip: the timeframe it is for, every number it rests on, the as-of, or the served code. */
export function qualityTitle(quality: SymbolQuality): string {
  const frame = quality.timeframe ? ` ${quality.timeframe}` : "";
  const detail = [
    quality.gapCount !== null ? `gaps ${group(quality.gapCount)}` : null,
    quality.missingRatio !== null ? `missing ${quality.missingRatio}` : null,
    quality.duplicateBarCount !== null ? `duplicates ${group(quality.duplicateBarCount)}` : null,
    quality.asOfUtcMs !== null ? `as of ${utcMinute(quality.asOfUtcMs)} UTC` : null,
    quality.reasonCode,
  ].filter((part): part is string => part !== null);
  const head = quality.kind === "served" ? `quality${frame}` : `quality${frame} not published`;
  return detail.length > 0 ? `${head} · ${detail.join(" · ")}` : head;
}

/** `as of 2026-07-02`: the index is an explicit operator run, not a live feed, so the date stays on screen. */
export function asOfLabel(asOfUtcMs: number | null): { text: string; title: string } | null {
  return asOfUtcMs === null
    ? null
    : { text: `as of ${utcDay(asOfUtcMs)}`, title: `index as of ${utcMinute(asOfUtcMs)} UTC · an explicit index run, not a live feed` };
}

/** Whether a listed symbol carries any v2 extra. */
export function hasDeclarationFacts(item: unknown): boolean {
  const row = bag(item);
  return row !== null && (row.instrument !== undefined || row.coverage_by_timeframe !== undefined || row.quality !== undefined);
}

/* ----------------------------------------------------- dataset timeframes */

export interface TimeframeFact {
  timeframe: string;
  resolutionSeconds: number | null;
  /** `available`, or the server's word for why not. */
  availability: string;
  reasonCode: string | null;
}

/**
 * v2 publishes a dataset's `timeframes` as objects; v1 as strings. The catalog
 * is normalised once at the read: `timeframes` stays the list of names every
 * reader already uses, and the objects move to `timeframe_facts`. A v1 catalog
 * comes back as it was.
 */
export function normalizeCatalog(raw: unknown): DatasetCatalog {
  const catalog = raw as DatasetCatalog;
  const datasets = bag(raw)?.datasets;
  if (!Array.isArray(datasets)) return catalog;
  return {
    ...catalog,
    datasets: datasets.map((dataset) => {
      const row = bag(dataset);
      const timeframes = row?.timeframes;
      if (row === null || !Array.isArray(timeframes) || !timeframes.some((entry) => typeof entry === "object" && entry !== null)) {
        return dataset as CatalogDataset;
      }
      const facts: TimeframeFact[] = [];
      for (const entry of timeframes) {
        if (typeof entry === "string") {
          facts.push({ timeframe: entry, resolutionSeconds: null, availability: "available", reasonCode: null });
          continue;
        }
        const fact = bag(entry);
        const name = text(fact?.timeframe);
        if (fact === null || name === null) continue;
        facts.push({
          timeframe: name,
          resolutionSeconds: num(fact.resolution_seconds),
          availability: text(fact.availability) ?? "available",
          reasonCode: text(fact.reason_code),
        });
      }
      return { ...row, timeframes: facts.map((fact) => fact.timeframe), timeframe_facts: facts } as unknown as CatalogDataset;
    }),
  };
}

/** The per-timeframe facts a normalised dataset carries, or null for a v1 dataset. */
export function timeframeFacts(dataset: unknown): readonly TimeframeFact[] | null {
  const facts = bag(dataset)?.timeframe_facts;
  return Array.isArray(facts) ? (facts as readonly TimeframeFact[]) : null;
}

/** Dataset-level v2 identity extras (all optional). */
export interface DatasetExtras {
  /** Null today: the reader publishes none, and `assetClassAbsence` carries the served code. */
  assetClass: string | null;
  assetClassAbsence: string | null;
  catalogRevision: string | null;
  asOfUtcMs: number | null;
  /** The first code a timeframe of an unavailable dataset carries (`HMD_DATASET_NOT_AVAILABLE`). */
  unavailableReasonCode: string | null;
}

export function datasetExtras(dataset: unknown): DatasetExtras {
  const row = bag(dataset);
  const asset = bag(row?.asset_class_availability);
  return {
    assetClass: text(row?.asset_class),
    assetClassAbsence: asset?.state === "NOT_PUBLISHED" ? text(asset.reason_code) : null,
    catalogRevision: text(row?.catalog_revision),
    asOfUtcMs: num(row?.as_of_utc_ms),
    unavailableReasonCode: timeframeFacts(dataset)?.find((fact) => fact.reasonCode !== null)?.reasonCode ?? null,
  };
}

/** The catalog-level index facts (`index_availability`, `as_of_utc_ms`, `catalog_revision`); null for a v1 catalog. */
export interface CatalogIndexFacts {
  /** `AVAILABLE`, or `NOT_PUBLISHED` with the served code (`HMD_METADATA_INDEX_NOT_BUILT`). */
  state: string;
  reasonCode: string | null;
  asOfUtcMs: number | null;
  catalogRevision: string | null;
}

export function readCatalogIndex(catalog: unknown): CatalogIndexFacts | null {
  const root = bag(catalog);
  const index = bag(root?.index_availability);
  const state = text(index?.state);
  if (root === null || index === null || state === null) return null;
  return { state, reasonCode: text(index.reason_code), asOfUtcMs: num(root.as_of_utc_ms), catalogRevision: text(root.catalog_revision) };
}

/* --------------------------------------------------------------- symbols */

/** What the symbol list says about being partial: served so far, the total, and the cursor. */
export interface SymbolListing {
  served: number;
  total: number | null;
  nextCursor: string | null;
  /** More exist than were served: the server must be asked, not the local list. */
  partial: boolean;
}

export function symbolListing(dataset: CatalogDataset | null): SymbolListing | null {
  if (dataset === null || dataset.symbols.state !== "PUBLISHED") return null;
  const served = dataset.symbols.items.length;
  const total = count(dataset.symbols.total);
  const nextCursor = text(bag(dataset.symbols)?.next_cursor);
  /* `truncated` is the server saying it stopped listing; `total: null` alone says only that the count is unknown. */
  return {
    served,
    total,
    nextCursor,
    partial: nextCursor !== null || dataset.symbols.truncated === true || (total !== null && total > served),
  };
}

export interface SymbolPage {
  items: readonly CatalogSymbol[];
  /** Null when timeframe coverage is incomplete: the count is unknown, never 0. */
  total: number | null;
  nextCursor: string | null;
  /** `NOT_PUBLISHED` (with its code) when the index has nothing to page; the items are then not a listing. */
  availability: { state: "AVAILABLE" | "NOT_PUBLISHED"; reasonCode: string | null };
  asOfUtcMs: number | null;
}

/** A `GET .../symbols` answer, or null when it is not one. */
export function readSymbolPage(raw: unknown): SymbolPage | null {
  const body = bag(raw);
  if (body === null || !Array.isArray(body.items)) return null;
  const items = body.items.filter((item): item is CatalogSymbol => text(bag(item)?.symbol) !== null);
  const availability = bag(body.availability);
  return {
    items,
    total: count(body.total),
    nextCursor: text(body.next_cursor),
    availability: availability?.state === "NOT_PUBLISHED" ? { state: "NOT_PUBLISHED", reasonCode: text(availability.reason_code) } : { state: "AVAILABLE", reasonCode: null },
    asOfUtcMs: num(body.as_of_utc_ms),
  };
}

/* ---------------------------------------------------------- bar metadata */

/**
 * `GET .../bar-metadata` for one declared window. Counts are index-only facts
 * (`INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION`): they are shown, never used
 * to allow or block a run. A `NOT_PUBLISHED` answer keeps no number.
 */
export interface BarMetadata {
  availability: "AVAILABLE" | "NOT_PUBLISHED";
  /** `WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE`, ... when not published. */
  reasonCode: string | null;
  /** The exact half-open UTC bounds the server used. */
  startUtcMs: number | null;
  endExclusiveUtcMs: number | null;
  bars: number | null;
  firstBarUtcMs: number | null;
  lastBarUtcMs: number | null;
  warmupBarsRequired: number | null;
  warmupBarsAvailableBeforeStart: number | null;
  asOfUtcMs: number | null;
  catalogRevision: string | null;
  /**
   * Remediation facts, present ONLY when the index published them (also on a
   * refused window): the range the index verified, and the earliest start that
   * still leaves the full warmup. Absent means absent: nothing is derived.
   */
  verifiedRange?: { startUtcMs: number; endExclusiveUtcMs: number; basis: string } | null;
  earliestStartWithWarmupUtcMs?: number | null;
}

function readVerifiedRange(value: unknown): { startUtcMs: number; endExclusiveUtcMs: number; basis: string } | null {
  const range = bag(value);
  const start = num(range?.start_utc_ms);
  const end = num(range?.end_exclusive_utc_ms);
  const basis = text(range?.basis);
  return start === null || end === null || basis === null ? null : { startUtcMs: start, endExclusiveUtcMs: end, basis };
}

export function readBarMetadata(raw: unknown): BarMetadata | null {
  const body = bag(raw);
  if (body === null || body.schema_version !== "research.dataset-bar-metadata.v1") return null;
  const published = body.availability === "AVAILABLE";
  return {
    availability: published ? "AVAILABLE" : "NOT_PUBLISHED",
    reasonCode: text(body.reason_code),
    startUtcMs: num(body.start_utc_ms),
    endExclusiveUtcMs: num(body.end_exclusive_utc_ms),
    bars: published ? count(body.bars) : null,
    firstBarUtcMs: published ? num(body.first_bar_utc_ms) : null,
    lastBarUtcMs: published ? num(body.last_bar_utc_ms) : null,
    warmupBarsRequired: published ? count(body.warmup_bars_required) : null,
    warmupBarsAvailableBeforeStart: published ? count(body.warmup_bars_available_before_start) : null,
    asOfUtcMs: num(body.as_of_utc_ms),
    catalogRevision: text(body.catalog_revision),
    ...publishedRemediation(body),
  };
}

/** The two optional remediation fields, only when the body carries them; legacy bodies add no key. */
function publishedRemediation(body: Bag): Pick<BarMetadata, "verifiedRange" | "earliestStartWithWarmupUtcMs"> {
  const out: { verifiedRange?: BarMetadata["verifiedRange"]; earliestStartWithWarmupUtcMs?: number | null } = {};
  const range = readVerifiedRange(body.verified_range);
  if (range !== null) out.verifiedRange = range;
  const earliest = num(body.earliest_start_with_warmup_utc_ms);
  if (earliest !== null) out.earliestStartWithWarmupUtcMs = earliest;
  return out;
}

/* ------------------------------------------------------- profiles (LW-07) */

/** The served account of a percent-equity profile: allocation is a FRACTION OF LIVE EQUITY, not currency units. */
export interface ProfileAccount {
  initialCapital: number;
  leverage: number;
  allocPerTrade: number;
  allocationUnit: string;
  oneWayFeeRate: number;
  slippage: number;
  fundingEnabled: boolean;
  sizingAuthority: string;
}

export interface ProfilePins {
  profileId: string;
  enabled: boolean;
  /** The server's reason this profile is not enabled. */
  reason: string | null;
  protocol: string | null;
  executionRoute: string | null;
  optimizationMode: string | null;
  trials: { min: number; max: number; default: number | null } | null;
  /** `fixed` pins a value, `forbidden` pins none and refuses one, `free` leaves it open; `unpinned` = not stated. */
  seed: { state: "fixed" | "forbidden" | "free" | "unpinned"; value: number | null };
  folds: { min: number; max: number } | null;
  granularity: string | null;
  windowMode: string | null;
  maxSpanDays: number | null;
  /** The bar timeframe the profile is admitted for (`portal_admission.profiles[].timeframe`); null when not served. */
  timeframe: string | null;
  /** `requested_spec_versions`: the spec versions this profile admits; null when the server did not say (any). */
  requestedSpecVersions: readonly string[] | null;
  /** `frequencies` / `window_modes`: the lists a profile admits; null when only the single pin (or nothing) was served. */
  frequencies: readonly string[] | null;
  windowModes: readonly string[] | null;
  /** The served `trial_default`; null when the server sent none (never invented). */
  trialDefault: number | null;
  /** `early_stopping_policy`: `FORBIDDEN` is the only served word; null when not stated. */
  earlyStopping: "forbidden" | null;
  /** `inner_validation`: the served word while inner/per-fold selection is not admitted (`NOT_ADMITTED_GLOBAL_RETENTION_ONLY`); null when not stated. */
  innerValidation: string | null;
  /** `optimization_schedule` as served (e.g. `per_fold_causal`); null when not stated. */
  optimizationSchedule: string | null;
  /** `trial_scope` as served (`PER_OUTER_FOLD_STUDY`): `trials` then count per study, not per run; null when not stated. */
  trialScope: string | null;
  /** `max_total_trials`: the served whole-run cap; null when not served (never derived from trials x folds). */
  maxTotalTrials: number | null;
  /** `inner_constraints`: what the inner folds of a causal profile must declare; null when not served. */
  innerConstraints: {
    folds: { min: number; max: number };
    frequencies: readonly string[];
    windowModes: readonly string[];
    trainWindowPattern: string | null;
  } | null;
  /**
   * S02 setup options only (`profilePinsFromSetup`); absent on an Atlas profile. Never inferred.
   * `FORBIDDEN`/`LOCKED` are `seed.state`; `REQUIRED`/`OPTIONAL` leave the seed open (`free`) and say which here.
   */
  seedRequirement?: "required" | "optional" | null;
  /** The parameter pins the profile admits (`allowed_pin_names`); an empty list admits none. Null: not served. */
  allowedPinNames?: readonly string[] | null;
  /** `FIXED_NO_OVERRIDES`, `DECLARED_PINS_ONLY` or `DELTA_SEARCH_WITH_QUALIFIED_PINS` as served. */
  parameterPolicy?: string | null;
  /** The profile's temporal-guard policy; null when it was not served. */
  temporalGuards?: ProfileTemporalGuards | null;
  /** The protocol has a separate holdout (Fixed); false for Advanced. Not whether a sealed holdout was evaluated. */
  independentHoldout?: boolean | null;
  /** `account_model` / `account` of a percent-equity recipe: the engine's account inputs, exactly as served (never defaulted). */
  accountModel?: string | null;
  account?: ProfileAccount | null;
}

/** `V1_ABSENT_V2_EXPLICIT`: v1 carries no guard; a v2 declaration may adopt the published defaults. `NOT_APPLICABLE`: no guards. */
export interface ProfileTemporalGuards {
  policy: "V1_ABSENT_V2_EXPLICIT" | "NOT_APPLICABLE";
  defaults: { labelHorizonBars: number; purgeBars: number; embargoBars: number } | null;
  maxBars: number | null;
  /** A zero guard applies no temporal guard: a 0 default is never presented as protective. */
  zeroSemantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD";
}

/** The schedule whose profile is the distinct immutable causal one. */
export const SCHEDULE_PER_FOLD_CAUSAL = "per_fold_causal";
/** `inner_validation` of a profile that admits inner folds (the causal profile); the global ones serve `NOT_ADMITTED_GLOBAL_RETENTION_ONLY`. */
export const INNER_VALIDATION_REQUIRED = "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY";

/** Whether the served profile is the causal one: it names the schedule AND requires the nested inner validation. Never inferred from v2. */
export function isCausalProfile(profile: ProfilePins | null): boolean {
  return profile !== null && profile.optimizationSchedule === SCHEDULE_PER_FOLD_CAUSAL && profile.innerValidation === INNER_VALIDATION_REQUIRED;
}

/** Whether the profile refuses inner (per-fold causal) selection: it says so with a non-required `inner_validation`. */
export function refusesInner(profile: ProfilePins | null): boolean {
  return profile !== null && profile.innerValidation !== null && profile.innerValidation !== INNER_VALIDATION_REQUIRED;
}

/** The served profile that names the per-fold causal schedule for this declaration's protocol, route and mode; null when none was served. */
export function causalScheduleProfile(
  profiles: readonly ProfilePins[] | null,
  draft: { protocol: string; executionRoute: string; optimizationMode: string },
): ProfilePins | null {
  return profileFamily(profiles, draft).find((profile) => profile.optimizationSchedule === SCHEDULE_PER_FOLD_CAUSAL) ?? null;
}

function readInnerConstraints(raw: unknown): ProfilePins["innerConstraints"] {
  const row = bag(raw);
  const folds = range(row?.fold_bounds);
  if (row === null || folds === null) return null;
  return {
    folds,
    frequencies: words(row.frequencies) ?? [],
    windowModes: words(row.window_modes) ?? [],
    trainWindowPattern: text(row.train_window_pattern),
  };
}

export const SPEC_V1 = "research.requested-spec.v1";
export const SPEC_V2 = "research.requested-spec.v2";

function words(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return out.length > 0 ? out : null;
}

function range(raw: unknown): { min: number; max: number } | null {
  const row = bag(raw);
  const min = num(row?.min);
  const max = num(row?.max);
  return min !== null && max !== null ? { min, max } : null;
}

/**
 * One profile. The Atlas serves `trial_count`, `random_seed`, `fold_bounds`,
 * `frequency`, `window_mode`; the spec's names (`trial_range`, `seed_policy`,
 * `fold_range`, `fold_granularity`) win when a server sends them. A
 * `random_seed` of null alone does not say "forbidden", so it reads `unpinned`
 * and the field stays editable.
 */
export function readProfile(raw: unknown): ProfilePins | null {
  const row = bag(raw);
  const profileId = text(row?.profile_id);
  if (row === null || profileId === null) return null;
  const trialRange = bag(row.trial_range);
  const trialBase = range(trialRange ?? row.trial_count);
  /* The contract serves `seed_policy` as a word: `LOCKED` (the value is `random_seed`) or `FORBIDDEN`. The
     object form (`{state, value}`) an earlier proposal used is still read. */
  const policy = bag(row.seed_policy);
  const policyState = (text(row.seed_policy) ?? text(policy?.state))?.toLowerCase();
  const seedValue = num(policy?.value) ?? num(row.random_seed);
  const seed: ProfilePins["seed"] =
    (policyState === "fixed" || policyState === "locked") && seedValue !== null
      ? { state: "fixed", value: seedValue }
      : policyState === "forbidden" || policyState === "free"
        ? { state: policyState, value: null }
        : policyState === undefined && seedValue !== null
          ? { state: "fixed", value: seedValue }
          : { state: "unpinned", value: null };
  return {
    profileId,
    enabled: row.state === "ENABLED",
    reason: text(row.reason),
    protocol: text(row.protocol),
    executionRoute: text(row.execution_route),
    optimizationMode: text(row.optimization_mode),
    trials: trialBase === null ? null : { ...trialBase, default: count(trialRange?.default) },
    seed,
    folds: range(row.fold_range ?? row.fold_bounds),
    granularity: text(row.fold_granularity) ?? text(row.frequency),
    windowMode: text(row.window_mode),
    maxSpanDays: count(row.max_span_days),
    timeframe: text(row.timeframe),
    requestedSpecVersions: words(row.requested_spec_versions),
    frequencies: words(row.frequencies),
    windowModes: words(row.window_modes),
    trialDefault: count(row.trial_default),
    earlyStopping: text(row.early_stopping_policy)?.toUpperCase() === "FORBIDDEN" ? "forbidden" : null,
    innerValidation: text(row.inner_validation),
    optimizationSchedule: text(row.optimization_schedule),
    trialScope: text(row.trial_scope),
    maxTotalTrials: count(row.max_total_trials),
    innerConstraints: readInnerConstraints(row.inner_constraints),
  };
}

/**
 * The timeframes the admitted profiles that fit this declaration cover.
 *
 * Read from the served `timeframe` of every ENABLED profile matching the
 * protocol and route (and the mode, once one is chosen). Null — nothing to
 * restrict by — when profiles were not served, none matches, or any match does
 * not name a timeframe: a fact the server left out is not a restriction the
 * browser may invent.
 */
export function profileTimeframes(
  profiles: readonly ProfilePins[] | null,
  draft: { protocol: string; executionRoute: string; optimizationMode: string },
): { timeframes: readonly string[]; profileIds: readonly string[] } | null {
  if (profiles === null) return null;
  const matches = profiles.filter(
    (profile) =>
      profile.enabled
      && profile.protocol === draft.protocol
      && profile.executionRoute === draft.executionRoute
      && (draft.optimizationMode === "" || profile.optimizationMode === null || profile.optimizationMode === draft.optimizationMode),
  );
  if (matches.length === 0 || matches.some((profile) => profile.timeframe === null)) return null;
  return {
    timeframes: [...new Set(matches.map((profile) => profile.timeframe as string))],
    profileIds: matches.map((profile) => profile.profileId),
  };
}

/** The served profiles (an array, or an object carrying `profiles`), or null when none was served. */
export function readProfiles(admission: unknown): readonly ProfilePins[] | null {
  const profiles = Array.isArray(admission) ? admission : bag(admission)?.profiles;
  if (!Array.isArray(profiles)) return null;
  return profiles.flatMap((entry) => readProfile(entry) ?? []);
}

/**
 * The one profile that matches what the draft declares: protocol and route
 * always, the optimization mode once one is chosen. No match, or several, is
 * "not identified": the form never picks one for the reader.
 */
export function selectProfile(
  profiles: readonly ProfilePins[] | null,
  draft: { protocol: string; executionRoute: string; optimizationMode: string; specVersion?: string; optimizationSchedule?: string; trials?: string | number | null },
): ProfilePins | null {
  if (profiles === null) return null;
  const family = profileFamily(profiles, draft).filter(
    (profile) => draft.specVersion === undefined || profile.requestedSpecVersions === null || profile.requestedSpecVersions.includes(draft.specVersion),
  );
  /* A profile that names the draft's schedule is the one. The causal profile is never chosen for another
     schedule (nor for none), and with no profile naming the schedule the family stands as before. */
  const schedule = draft.optimizationSchedule ?? "";
  const named = schedule === "" ? [] : family.filter((profile) => profile.optimizationSchedule === schedule);
  const matches = named.length > 0 ? named : family.filter((profile) => profile.optimizationSchedule !== SCHEDULE_PER_FOLD_CAUSAL);
  if (matches.length === 1) return matches[0]!;
  /* The Alpha-bound setup also lists the profiles disabled for this Alpha (e.g. the VN fixed one beside the Delta fixed one):
     among several candidates the one enabled for it is the declaration's profile. */
  const enabled = matches.filter((profile) => profile.enabled);
  if (enabled.length === 1) return enabled[0]!;
  /* Several enabled profiles of one protocol, mode and schedule differ by what they admit (a fixed one-trial check beside a 3+ trial
     search): the trial count the draft declares names the one whose range holds it. No count yet is "not identified". */
  const declared = draft.trials === undefined || draft.trials === null || String(draft.trials).trim() === "" ? null : Number(draft.trials);
  if (declared === null || !Number.isInteger(declared)) return null;
  const holding = enabled.filter((profile) => profile.trials !== null && declared >= profile.trials.min && declared <= profile.trials.max);
  return holding.length === 1 ? holding[0]! : null;
}

/** Every profile that fits protocol, route and mode, whatever requested-spec version it admits. */
export function profileFamily(
  profiles: readonly ProfilePins[] | null,
  draft: { protocol: string; executionRoute: string; optimizationMode: string },
): readonly ProfilePins[] {
  return (profiles ?? []).filter(
    (profile) =>
      profile.protocol === draft.protocol
      && profile.executionRoute === draft.executionRoute
      && (draft.optimizationMode === "" || profile.optimizationMode === null || profile.optimizationMode === draft.optimizationMode),
  );
}

/** The spec version a draft serializes as, in the contract's own words. */
export function specVersionOf(usesV2: boolean): string {
  return usesV2 ? SPEC_V2 : SPEC_V1;
}

/** What a profile admits for a walk-forward choice: its served list, else its single pin, else nothing stated. */
export function admittedFrequencies(profile: ProfilePins | null): readonly string[] | null {
  return profile?.frequencies ?? (profile?.granularity ? [profile.granularity] : null);
}

export function admittedWindowModes(profile: ProfilePins | null): readonly string[] | null {
  return profile?.windowModes ?? (profile?.windowMode ? [profile.windowMode] : null);
}

/** Whether a profile serves requested-spec v2 (the temporal controls: label horizon, purge, embargo). */
export function admitsSpecV2(profile: ProfilePins | null): boolean {
  return profile !== null && profile.enabled && profile.requestedSpecVersions !== null && profile.requestedSpecVersions.includes(SPEC_V2);
}

/** The trial count a profile fixes (min = max), or its served default; else none. */
export function profileTrialDefault(profile: ProfilePins | null): number | null {
  if (profile === null || !profile.enabled || profile.trials === null) return null;
  if (profile.trialDefault !== null) return profile.trialDefault;
  if (profile.trials.min === profile.trials.max) return profile.trials.min;
  return profile.trials.default;
}

/** The trial count when the profile fixes it (min = max), else null. */
export function trialsPinned(profile: ProfilePins | null): number | null {
  return profile !== null && profile.enabled && profile.trials !== null && profile.trials.min === profile.trials.max
    ? profile.trials.min
    : null;
}

/** The seed a profile fixes, or null. */
export function seedPinned(profile: ProfilePins | null): number | null {
  return profile !== null && profile.enabled && profile.seed.state === "fixed" ? profile.seed.value : null;
}

/* ------------------------------------------------------ preflight estimate */

export interface EstimateWindow {
  bars: number | null;
  firstBarUtcMs: number | null;
  lastBarUtcMs: number | null;
  /** Index metadata only: the exact half-open UTC bounds the server used, and why there is no count. */
  startUtcMs?: number | null;
  endExclusiveUtcMs?: number | null;
  reasonCode?: string | null;
  asOfUtcMs?: number | null;
  /** Bar-metadata only, when the index published it: the range it verified (a refused window's remediation). */
  verifiedRange?: { startUtcMs: number; endExclusiveUtcMs: number; basis: string } | null;
}

export interface EstimateCondition {
  key: string;
  /** `PASS`, `FAIL` or `NOT_PUBLISHED`; any other word is read as not published. */
  state: "PASS" | "FAIL" | "NOT_PUBLISHED";
  reasonCode: string | null;
  observed: string | null;
  required: string | null;
}

/**
 * One engine-planned outer fold, as `metadata.planned_folds.items[]` served it: actual half-open UTC bounds
 * and indexed bar counts of the train and the outer OOS span. Never derived from frequency or count.
 */
export interface PlannedFold {
  ordinal: number;
  train: { startUtcMs: number; endExclusiveUtcMs: number; bars: number };
  outerOos: { startUtcMs: number; endExclusiveUtcMs: number; bars: number };
}

function foldSpan(raw: unknown): PlannedFold["train"] | null {
  const row = bag(raw);
  const start = num(row?.start_utc_ms);
  const end = num(row?.end_exclusive_utc_ms);
  const bars = count(row?.bars);
  return start === null || end === null || bars === null || end <= start ? null : { startUtcMs: start, endExclusiveUtcMs: end, bars };
}

/**
 * `planned_folds.items`, or null when the planner published none (`NOT_PUBLISHED`, no `items`, an empty
 * list, or any item that is not a complete fold: a partial list would draw a plan that is not the engine's).
 */
export function readPlannedFolds(raw: unknown): readonly PlannedFold[] | null {
  const folds = bag(raw);
  if (folds === null || folds.availability !== "AVAILABLE" || !Array.isArray(folds.items) || folds.items.length === 0) return null;
  const out: PlannedFold[] = [];
  for (const entry of folds.items) {
    const row = bag(entry);
    const ordinal = count(row?.ordinal);
    const train = foldSpan(row?.train);
    const outerOos = foldSpan(row?.outer_oos);
    if (ordinal === null || train === null || outerOos === null) return null;
    out.push({ ordinal, train: { ...train }, outerOos: { ...outerOos } });
  }
  return out;
}

export interface PreflightEstimate {
  windows: Readonly<Partial<Record<"is" | "oos" | "holdout" | "analysis", EstimateWindow>>>;
  warmup: { barsRequired: number | null; barsAvailableBeforeIs: number | null; reasonCode?: string | null } | null;
  plannedFolds: {
    count: number | null;
    basis: string | null;
    minBarsPerFold: number | null;
    reasonCode: string | null;
    /** The served planner minimums (`min_train_bars`, `min_oos_bars`); null when not published. */
    minTrainBars?: number | null;
    minOosBars?: number | null;
  } | null;
  conditions: readonly EstimateCondition[] | null;
  /** The engine's per-fold geometry (`planned_folds.items`); null when not published, never synthesized. */
  plannedFoldItems?: readonly PlannedFold[] | null;
  /** Where this came from: the declaration-estimate route (`estimate`) or the per-window bar metadata (`metadata`). */
  source?: "estimate" | "metadata";
  /** Served `ready_for_preflight`: information only, never permission to create a run. */
  readyForPreflight?: boolean | null;
  /** The profile the estimate was computed for, as served. */
  profileId?: string | null;
  earliestStartUtcMs?: number | null;
  /** The served basis word of `earliestStartUtcMs` (tooltip only). */
  earliestStartBasis?: string | null;
}

function estimateWindow(raw: unknown): EstimateWindow | null {
  const row = bag(raw);
  if (row === null) return null;
  return { bars: count(row.bars), firstBarUtcMs: num(row.first_bar_utc_ms), lastBarUtcMs: num(row.last_bar_utc_ms) };
}

/**
 * The optional `preflight_estimate` block of a preflight answer (or a dry-run),
 * or null when it carries none: then the screen shows nothing new.
 */
export function readPreflightEstimate(source: unknown): PreflightEstimate | null {
  const raw = bag(bag(source)?.preflight_estimate);
  if (raw === null) return null;
  const windows = bag(raw.windows);
  const out: { is?: EstimateWindow; oos?: EstimateWindow; holdout?: EstimateWindow } = {};
  for (const key of ["is", "oos", "holdout"] as const) {
    const window = estimateWindow(windows?.[key]);
    if (window !== null) out[key] = window;
  }
  const warmup = bag(raw.warmup);
  const folds = bag(raw.planned_folds);
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions.flatMap((entry): EstimateCondition[] => {
        const row = bag(entry);
        const key = text(row?.key);
        if (row === null || key === null) return [];
        const state = row.state === "PASS" || row.state === "FAIL" ? row.state : "NOT_PUBLISHED";
        return [{ key, state, reasonCode: text(row.reason_code), observed: text(row.observed), required: text(row.required) }];
      })
    : null;
  const estimate: PreflightEstimate = {
    windows: out,
    warmup: warmup === null ? null : { barsRequired: count(warmup.bars_required), barsAvailableBeforeIs: count(warmup.bars_available_before_is) },
    plannedFolds: folds === null ? null : { count: count(folds.count), basis: text(folds.basis), minBarsPerFold: count(folds.min_bars_per_fold), reasonCode: text(folds.reason_code) },
    conditions,
  };
  const empty =
    Object.keys(out).length === 0 && estimate.warmup === null && estimate.plannedFolds === null && (conditions === null || conditions.length === 0);
  return empty ? null : estimate;
}

/* ------------------------------------------- window counts from bar metadata */

/** One declared window's served metadata, keyed by the window it was asked for. */
export type WindowMetadata = Readonly<Partial<Record<"is" | "oos" | "holdout" | "analysis", BarMetadata>>>;

/**
 * The window part of an estimate from bar-metadata answers: bars per window and
 * the warmup (taken from the first window, the only one asked for warmup). No
 * fold plan and no conditions: the index serves neither.
 */
export function estimateFromMetadata(windows: WindowMetadata, warmupWindow: "is" | "analysis" | null): PreflightEstimate | null {
  const out: { is?: EstimateWindow; oos?: EstimateWindow; holdout?: EstimateWindow; analysis?: EstimateWindow } = {};
  for (const key of ["is", "oos", "holdout", "analysis"] as const) {
    const meta = windows[key];
    if (meta === undefined) continue;
    out[key] = {
      bars: meta.bars,
      firstBarUtcMs: meta.firstBarUtcMs,
      lastBarUtcMs: meta.lastBarUtcMs,
      startUtcMs: meta.startUtcMs,
      endExclusiveUtcMs: meta.endExclusiveUtcMs,
      reasonCode: meta.availability === "AVAILABLE" ? null : meta.reasonCode,
      asOfUtcMs: meta.asOfUtcMs,
      ...(meta.verifiedRange ? { verifiedRange: meta.verifiedRange } : {}),
    };
  }
  const first = warmupWindow === null ? undefined : windows[warmupWindow];
  const warmup =
    first === undefined
      ? null
      : {
          barsRequired: first.warmupBarsRequired,
          barsAvailableBeforeIs: first.warmupBarsAvailableBeforeStart,
          reasonCode: first.availability === "AVAILABLE" ? null : first.reasonCode,
        };
  if (Object.keys(out).length === 0 && warmup === null) return null;
  /* The earliest start with warmup is served on the warmup-carrying (first) window only, and only when published. */
  const earliest = first?.earliestStartWithWarmupUtcMs ?? null;
  return {
    windows: out,
    warmup,
    plannedFolds: null,
    conditions: null,
    ...(earliest !== null ? { earliestStartUtcMs: earliest, earliestStartBasis: first?.verifiedRange?.basis ?? null } : {}),
  };
}

/* ------------------------------------------ declaration estimate (POST route) */

const ESTIMATE_WINDOW: Readonly<Record<string, "is" | "oos" | "holdout" | "analysis">> = {
  IS: "is",
  OOS: "oos",
  HOLDOUT: "holdout",
  SPAN: "analysis",
};

/**
 * `research.declaration-estimate.v1`: windows (IS/OOS/HOLDOUT, or the one SPAN),
 * the served fold plan and the conditions. A window or fold plan that is
 * `NOT_PUBLISHED` keeps its code and no number. `ready_for_preflight` is carried
 * as information; the preflight's `run_admission` stays the authority.
 * Null when the body is not an estimate: the screen then falls back to the
 * per-window bar metadata.
 */
export function readDeclarationEstimate(raw: unknown): PreflightEstimate | null {
  const body = bag(raw);
  const metadata = bag(body?.metadata);
  if (body === null || metadata === null || body.schema_version !== "research.declaration-estimate.v1") return null;
  const windows: { -readonly [K in "is" | "oos" | "holdout" | "analysis"]?: BarMetadata } = {};
  let first: "is" | "analysis" | null = null;
  const entries = Array.isArray(metadata.windows) ? metadata.windows : [];
  entries.forEach((entry, index) => {
    const row = bag(entry);
    const key = typeof row?.window === "string" ? ESTIMATE_WINDOW[row.window] : undefined;
    if (row === null || key === undefined) return;
    const published = row.availability === "AVAILABLE";
    windows[key] = {
      availability: published ? "AVAILABLE" : "NOT_PUBLISHED",
      reasonCode: text(row.reason_code),
      startUtcMs: num(row.start_utc_ms),
      endExclusiveUtcMs: num(row.end_exclusive_utc_ms),
      bars: published ? count(row.bars) : null,
      firstBarUtcMs: published ? num(row.first_bar_utc_ms) : null,
      lastBarUtcMs: published ? num(row.last_bar_utc_ms) : null,
      warmupBarsRequired: published ? count(row.warmup_bars_required) : null,
      warmupBarsAvailableBeforeStart: published ? count(row.warmup_bars_available_before_start) : null,
      asOfUtcMs: num(metadata.as_of_utc_ms),
      catalogRevision: text(metadata.catalog_revision),
    };
    if (index === 0 && (key === "is" || key === "analysis")) first = key;
  });
  const base = estimateFromMetadata(windows, first) ?? { windows: {}, warmup: null, plannedFolds: null, conditions: null };
  const folds = bag(metadata.planned_folds);
  const foldsPublished = folds?.availability === "AVAILABLE";
  const conditions = Array.isArray(body.conditions)
    ? body.conditions.flatMap((entry): EstimateCondition[] => {
        const row = bag(entry);
        const key = text(row?.key);
        if (row === null || key === null) return [];
        const state = row.state === "PASS" || row.state === "FAIL" ? row.state : "NOT_PUBLISHED";
        return [{ key, state, reasonCode: text(row.reason_code), observed: text(row.observed), required: text(row.required) }];
      })
    : null;
  return {
    ...base,
    plannedFolds:
      folds === null
        ? null
        : {
            count: foldsPublished ? count(folds.count) : null,
            basis: text(folds.basis),
            minBarsPerFold: null,
            reasonCode: text(folds.reason_code),
            minTrainBars: foldsPublished ? count(folds.min_train_bars) : null,
            minOosBars: foldsPublished ? count(folds.min_oos_bars) : null,
          },
    conditions,
    plannedFoldItems: readPlannedFolds(folds),
    source: "estimate",
    readyForPreflight: typeof body.ready_for_preflight === "boolean" ? body.ready_for_preflight : null,
    profileId: text(body.profile_id),
    earliestStartUtcMs: num(metadata.earliest_start_utc_ms),
    earliestStartBasis: text(metadata.earliest_start_basis),
  };
}

/**
 * The preflight's own estimate wins per window and for the warmup (it is the
 * authority); the index metadata fills only what the preflight did not name.
 */
export function mergeEstimates(preflight: PreflightEstimate | null, metadata: PreflightEstimate | null): PreflightEstimate | null {
  if (metadata === null) return preflight;
  if (preflight === null) return metadata;
  return {
    windows: { ...metadata.windows, ...preflight.windows },
    warmup: preflight.warmup ?? metadata.warmup,
    plannedFolds: preflight.plannedFolds,
    conditions: preflight.conditions,
    ...(preflight.plannedFoldItems !== undefined ? { plannedFoldItems: preflight.plannedFoldItems } : {}),
    /* The preflight's own served earliest start wins; the index's fills only when it published one. */
    ...(preflight.earliestStartUtcMs != null
      ? { earliestStartUtcMs: preflight.earliestStartUtcMs, earliestStartBasis: preflight.earliestStartBasis ?? null }
      : metadata.earliestStartUtcMs != null
        ? { earliestStartUtcMs: metadata.earliestStartUtcMs, earliestStartBasis: metadata.earliestStartBasis ?? null }
        : {}),
  };
}

/**
 * The outer-fold requirement of the selected profile, judged by the declaration-estimate before any preflight: `profile_folds` FAIL says the
 * engine-planned plan has too few or too many folds for what the profile admits. A sentence naming both numbers, or null when it holds (or is not served).
 */
export function foldCountProblem(estimate: Pick<PreflightEstimate, "conditions"> | null): string | null {
  const condition = estimate?.conditions?.find((entry) => entry.key === "profile_folds" && entry.state === "FAIL") ?? null;
  if (condition === null) return null;
  const observed = condition.observed ?? "?";
  const required = condition.required ?? "the profile's range";
  return `The profile needs ${required} outer folds; this plan has ${observed}. Use a finer frequency or a longer span.`;
}
