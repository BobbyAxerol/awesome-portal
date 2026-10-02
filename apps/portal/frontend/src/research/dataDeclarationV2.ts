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
  };
}

/* ------------------------------------------------------- profiles (LW-07) */

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
  const policy = bag(row.seed_policy);
  const policyState = text(policy?.state)?.toLowerCase();
  const seedValue = num(policy?.value) ?? num(row.random_seed);
  const seed: ProfilePins["seed"] =
    policyState === "fixed" && seedValue !== null
      ? { state: "fixed", value: seedValue }
      : policyState === "forbidden" || policyState === "free"
        ? { state: policyState, value: null }
        : seedValue !== null
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
  draft: { protocol: string; executionRoute: string; optimizationMode: string },
): ProfilePins | null {
  if (profiles === null) return null;
  const matches = profiles.filter(
    (profile) =>
      profile.protocol === draft.protocol
      && profile.executionRoute === draft.executionRoute
      && (draft.optimizationMode === "" || profile.optimizationMode === null || profile.optimizationMode === draft.optimizationMode),
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** The trial count a profile fixes (min = max), or its served default; else none. */
export function profileTrialDefault(profile: ProfilePins | null): number | null {
  if (profile === null || !profile.enabled || profile.trials === null) return null;
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
}

export interface EstimateCondition {
  key: string;
  /** `PASS`, `FAIL` or `NOT_PUBLISHED`; any other word is read as not published. */
  state: "PASS" | "FAIL" | "NOT_PUBLISHED";
  reasonCode: string | null;
  observed: string | null;
  required: string | null;
}

export interface PreflightEstimate {
  windows: Readonly<Partial<Record<"is" | "oos" | "holdout" | "analysis", EstimateWindow>>>;
  warmup: { barsRequired: number | null; barsAvailableBeforeIs: number | null; reasonCode?: string | null } | null;
  plannedFolds: { count: number | null; basis: string | null; minBarsPerFold: number | null; reasonCode: string | null } | null;
  conditions: readonly EstimateCondition[] | null;
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
  return { windows: out, warmup, plannedFolds: null, conditions: null };
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
  };
}
