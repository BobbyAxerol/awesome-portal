/**
 * S02_V2B · the optional data-declaration facts on Screen 02 (DATA_DECLARATION_SPEC §3, §4).
 *
 * B7: the catalog, symbol-page and bar-metadata shapes are the canonical contract fixtures
 * (`packages/contracts/fixtures/research-dataset-catalog.v2.*.valid.json`). Every reader and screen is
 * tested on them (value and typed-absence paths) and on the v1 fixture (an older server: today's
 * behaviour). The preflight estimate is not part of the B7 index and still reads the proposed
 * fixture. Fixtures are read at run time from the repo root with `readFileSync`, never imported,
 * so the image build context needs no `upgrade/`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { type DatasetCatalog, resetDatasetRouteMemory } from "./datasetClient";
import {
  type DatasetCatalogV2,
  type IndexedSymbol,
  asOfLabel,
  barGeometry,
  barsLine,
  coverageAbsence,
  coverageFor,
  datasetExtras,
  estimateFromMetadata,
  expiryDay,
  gapDetail,
  groupSymbols,
  hasInstrumentFacts,
  instrumentAbsence,
  instrumentAbsenceTitle,
  mergeEstimates,
  normalizeCatalog,
  profileTrialDefault,
  qualityNeedsAttention,
  qualityText,
  qualityTitle,
  readBarMetadata,
  readCatalogIndex,
  readCoverageByTimeframe,
  readInstrument,
  readPreflightEstimate,
  readProfiles,
  readQuality,
  readSymbolPage,
  seedPinned,
  selectProfile,
  sortByExpiry,
  symbolListing,
  timeframeChips,
  timeframeFacts,
  timeframeQuality,
  trialsPinned,
  utcDay,
} from "./dataDeclaration";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import type { RunDraft } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetDatasetRouteMemory();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function read<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}
const fx = <T,>(name: string) => read<T>(`packages/contracts/fixtures/${name}`);
const proposed = <T,>(name: string) => read<T>(`upgrade/research_loop/evidence/P21/data-declaration/${name}`);

const ATLAS_RESPONSE = fx<{ atlas: AtlasDocument; portal_admission: { profiles: Record<string, unknown>[] } }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const PROFILES = ATLAS_RESPONSE.portal_admission.profiles as unknown as NonNullable<React.ComponentProps<typeof NewRun>["portalAdmission"]>;
const REGISTRY = fx<RegistryListResponse>("research-alpha-import.registry.valid.json");
const V1 = fx<DatasetCatalog>("research-preflight.dataset-catalog.valid.json");
const catalogFixture = (name: string) => fx<DatasetCatalogV2>(`research-dataset-catalog.v2.${name}.valid.json`);
const CAT_HEALTHY = catalogFixture("healthy");
const CAT_MULTI = catalogFixture("multi-dataset");
const CAT_PARTIAL = catalogFixture("partial-quality");
const CAT_ABSENT = catalogFixture("symbol-absent");
const V2 = normalizeCatalog(CAT_HEALTHY);
const multi = normalizeCatalog(CAT_MULTI);
const UNAVAILABLE_DATASET = multi.datasets.find((entry) => entry.dataset_id === "fixture-unavailable-1h")!;
const ESTIMATE_FILE = proposed<{
  preflight_estimate: Record<string, unknown> & { profiles: unknown[] };
  refused_variants: Record<string, { conditions: unknown[]; planned_folds: unknown; warmup: unknown }>;
}>("preflight-estimate.v2.proposed.fixture.json");
const PREFLIGHT = fx<PreflightResponse>("research-preflight.response.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

const main = V2.datasets[0]!;
const item = (symbol: string) => main.symbols.items.find((entry) => entry.symbol === symbol)!;
const pick = (catalog: DatasetCatalogV2, symbol: string): IndexedSymbol => catalog.datasets[0]!.symbols.items.find((entry) => entry.symbol === symbol)!;
const partialItem = (symbol: string) => pick(CAT_PARTIAL, symbol);
const multiItem = (symbol: string) => pick(CAT_MULTI, symbol);
const absentItem = (symbol: string) => pick(CAT_ABSENT, symbol);
const START = Date.UTC(2025, 5, 1);
const END = Date.UTC(2025, 6, 15);
/** A `GET .../symbols` answer in the canonical shape; the fields a test sets win. */
const symbolPage = (over: Record<string, unknown> = {}) => ({
  schema_version: "research.dataset-symbols.v1",
  dataset_id: "crypto-binance-1m",
  catalog_revision: "a".repeat(64),
  as_of_utc_ms: CAT_HEALTHY.as_of_utc_ms,
  availability: { state: "AVAILABLE", reason_code: null },
  items: [],
  total: null,
  next_cursor: null,
  ...over,
});
/** A `GET .../bar-metadata` answer in the canonical shape; the fields a test sets win. */
const barMetadata = (over: Record<string, unknown> = {}) => ({
  schema_version: "research.dataset-bar-metadata.v1",
  catalog_revision: "a".repeat(64),
  as_of_utc_ms: CAT_HEALTHY.as_of_utc_ms,
  dataset_id: "crypto-binance-1m",
  symbol: "BTCUSDT",
  timeframe: "1h",
  start_utc_ms: START,
  end_exclusive_utc_ms: END,
  scope: "INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION",
  availability: "AVAILABLE",
  reason_code: null,
  bars: 1056,
  first_bar_utc_ms: START,
  last_bar_utc_ms: END - 3_600_000,
  warmup_bars_required: 200,
  warmup_bars_available_before_start: 12000,
  ...over,
});

function baseDraft(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

function Harness({ initial, extra = {} }: { initial: RunDraft; extra?: Partial<React.ComponentProps<typeof NewRun>> }) {
  const [draft, setDraft] = useState(initial);
  return (
    <MemoryRouter initialEntries={["/x"]}>
      <NewRun
        draft={draft}
        patch={(change) => setDraft((current) => ({ ...current, ...change }))}
        limits={LIMITS}
        atlas={ATLAS}
        atlasState={OK}
        registry={REGISTRY.entries}
        declarationBound
        preflight={null}
        preflightState={researchState({ kind: "ok", rowCount: 0 })}
        onRunPreflight={vi.fn()}
        mayCreateRun={false}
        canSubmit={false}
        created={null}
        createState={researchState({ kind: "ok", rowCount: 0 })}
        outcomeUnknown={false}
        onSubmit={vi.fn()}
        onRecheck={vi.fn()}
        initialStep="data"
        {...extra}
      />
    </MemoryRouter>
  );
}

const PENDING = () => new Promise<Response>(() => undefined);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const input = () => screen.getByRole("combobox", { name: "Symbol" }) as HTMLInputElement;
/** The healthy dataset, listed in part: five served, 29 in total, the server says it stopped. */
const partial = (): DatasetCatalog => ({
  ...V2,
  datasets: [{ ...main, symbols: { ...main.symbols, items: [...main.symbols.items], total: 29, truncated: true } }, ...V2.datasets.slice(1)],
});

/* ------------------------------------------------------------- readers */

describe("readers: the canonical B7 catalog fixtures", () => {
  it("the fixtures are the generated contract's shapes (a type error here is a contract drift)", () => {
    const typed: DatasetCatalogV2[] = [CAT_HEALTHY, CAT_MULTI, CAT_PARTIAL, CAT_ABSENT];
    expect(typed.every((catalog) => catalog.schema_version === "research.dataset-catalog.v2")).toBe(true);
    const sample: IndexedSymbol = CAT_HEALTHY.datasets[0]!.symbols.items[0]!;
    expect(sample.quality.reason_code).toBe("HMD_QUALITY_IS_TIMEFRAME_SPECIFIC");
  });

  it("instrument: served null with its code and origin is ONE typed absence, never a value", () => {
    const instrument = readInstrument(item("BTCUSDT"))!;
    expect(instrument).toMatchObject({
      state: "NOT_PUBLISHED",
      reasonCode: "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED",
      origin: "HMD_DIRECT",
      tickSize: null,
      lotSize: null,
      contractMultiplier: null,
      listingUtcMs: null,
      expiryUtcMs: null,
    });
    expect(hasInstrumentFacts(instrument)).toBe(false);
    expect(instrumentAbsence(item("BTCUSDT"))).toEqual({ reasonCode: "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED", origin: "HMD_DIRECT" });
    expect(instrumentAbsenceTitle(instrumentAbsence(item("BTCUSDT"))!)).toContain("HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED");
    /* The `_YYMMDD` suffix is never read as an expiry. */
    expect(expiryDay(item("BTCUSDT_210326"))).toBeNull();
    /* A v1 symbol has no instrument block: nothing to say. */
    expect(instrumentAbsence(V1.datasets[0]!.symbols.items[0])).toBeNull();
  });

  it("instrument: if a later server publishes terms they print exactly (synthetic, not a fixture)", () => {
    const published = { symbol: "X", instrument: { state: "PUBLISHED", tick_size: "0.10", lot_size: "0.001", contract_multiplier: "1", expiry_utc_ms: Date.UTC(2021, 2, 26, 8) } };
    expect(readInstrument(published)).toMatchObject({ tickSize: "0.10", lotSize: "0.001", contractMultiplier: "1" });
    expect(hasInstrumentFacts(readInstrument(published))).toBe(true);
    expect(instrumentAbsence(published)).toBeNull();
    expect(expiryDay(published)).toBe("2021-03-26");
    expect(readInstrument({ instrument: { tick_size: 0.1 } })!.tickSize).toBeNull();
  });

  it("coverage_by_timeframe: the exact timeframe or nothing, counts as served; a not-published entry keeps no count", () => {
    const btc = partialItem("BTCUSDT");
    expect(barsLine(coverageFor(item("BTCUSDT"), "1h")!)).toBe("48 of 48 bars · 0 gaps");
    expect(barsLine(coverageFor(btc, "1h")!)).toBe("46 of 48 bars · 1 gap");
    expect(gapDetail(coverageFor(btc, "1h")!)).toContain("missing 0.041666666667");
    expect(coverageFor(item("BTCUSDT"), "4h")).toBeNull();
    /* Not indexed: the array is empty and the symbol says why. */
    expect(readCoverageByTimeframe(multiItem("BTCUSDT"))).toEqual([]);
    expect(coverageAbsence(multiItem("BTCUSDT"))).toEqual({ reasonCode: "HMD_SYMBOL_INTERVAL_NOT_INDEXED" });
    expect(coverageAbsence(item("BTCUSDT"))).toBeNull();
    const notPublished = { coverage_by_timeframe: [{ timeframe: "1h", availability: "NOT_PUBLISHED", reason_code: "X", bar_count: 0, gap_count: 0, expected_bar_count: 0, missing_ratio: "0" }] };
    expect(coverageFor(notPublished, "1h")).toMatchObject({ availability: "NOT_PUBLISHED", reasonCode: "X", barCount: null, gapCount: null });
  });

  it("quality: the aggregate is typed timeframe-specific; the numbers come from the selected timeframe", () => {
    expect(readQuality(item("BTCUSDT"))).toEqual({ state: "NOT_PUBLISHED", reasonCode: "HMD_QUALITY_IS_TIMEFRAME_SPECIFIC", asOfUtcMs: CAT_HEALTHY.as_of_utc_ms });
    expect(timeframeQuality(item("BTCUSDT"), "1h")).toMatchObject({ kind: "served", timeframe: "1h", gapCount: 0, missingRatio: "0.000000000000", duplicateBarCount: 0 });
    expect(qualityNeedsAttention(timeframeQuality(item("BTCUSDT"), "1h")!)).toBe(false);
    const gappy = timeframeQuality(partialItem("BTCUSDT"), "1h")!;
    expect(gappy).toMatchObject({ kind: "served", gapCount: 1, missingRatio: "0.041666666667" });
    expect(qualityNeedsAttention(gappy)).toBe(true);
    expect(qualityText(gappy)).toBe("1 gap");
    expect(qualityTitle(gappy)).toContain("gaps 1");
    expect(qualityTitle(gappy)).toContain("as of");
    /* A timeframe the index has no bars for, and no timeframe at all: the typed code, never a number. */
    expect(timeframeQuality(item("BTCUSDT"), "4h")).toMatchObject({ kind: "absent", gapCount: null, reasonCode: "HMD_QUALITY_IS_TIMEFRAME_SPECIFIC" });
    expect(timeframeQuality(item("BTCUSDT"), "")).toMatchObject({ kind: "absent", timeframe: null });
    expect(timeframeQuality(absentItem("BTCUSDT"), "1h")).toMatchObject({ kind: "absent", reasonCode: "HMD_METADATA_INDEX_NOT_BUILT", asOfUtcMs: null });
    expect(qualityText(timeframeQuality(absentItem("BTCUSDT"), "1h")!)).toBe("quality — not published");
    expect(timeframeQuality({ symbol: "V1ONLY" }, "1h")).toBeNull();
  });

  it("as-of: the date is text and the tooltip says the index is not a live feed", () => {
    const label = asOfLabel(CAT_HEALTHY.as_of_utc_ms)!;
    expect(label.text).toBe(`as of ${utcDay(CAT_HEALTHY.as_of_utc_ms!)}`);
    expect(label.title).toContain("not a live feed");
    expect(asOfLabel(null)).toBeNull();
  });

  it("catalog index: the as-of, or the typed reason the index is not built; null for v1", () => {
    expect(readCatalogIndex(CAT_HEALTHY)).toMatchObject({ state: "AVAILABLE", reasonCode: null, asOfUtcMs: CAT_HEALTHY.as_of_utc_ms });
    expect(readCatalogIndex(CAT_ABSENT)).toMatchObject({ state: "NOT_PUBLISHED", reasonCode: "HMD_METADATA_INDEX_NOT_BUILT", asOfUtcMs: null });
    expect(readCatalogIndex(V1)).toBeNull();
  });

  it("timeframes: v2 objects become names plus facts; a v1 catalog is returned untouched", () => {
    expect(main.timeframes).toContain("1h");
    expect(timeframeFacts(main)!.find((entry) => entry.timeframe === "1h")).toMatchObject({ resolutionSeconds: 3600, availability: "available" });
    expect(timeframeFacts(UNAVAILABLE_DATASET)!.find((entry) => entry.timeframe === "1h")).toMatchObject({ availability: "unavailable", reasonCode: "HMD_DATASET_NOT_AVAILABLE" });
    expect(datasetExtras(UNAVAILABLE_DATASET).unavailableReasonCode).toBe("HMD_DATASET_NOT_AVAILABLE");
    expect(datasetExtras(main)).toMatchObject({ assetClass: null, assetClassAbsence: "HMD_READER_ASSET_CLASS_NOT_PUBLISHED", catalogRevision: CAT_HEALTHY.datasets[0]!.catalog_revision });
    expect(normalizeCatalog(V1)).toEqual(V1);
    expect(timeframeFacts(V1.datasets[0]!)).toBeNull();
  });

  it("quarterlies sort by their served expiry, never by the symbol name", () => {
    const make = (symbol: string, expiry: number | null) => ({ symbol, contract_kind: "QUARTERLY", coverage: null, ...(expiry === null ? {} : { instrument: { expiry_utc_ms: expiry } }) }) as never;
    const sorted = sortByExpiry([make("Z_EARLY", 100), make("A_LATE", 900), make("M_NONE", null)]) as unknown as { symbol: string }[];
    expect(sorted.map((entry) => entry.symbol)).toEqual(["Z_EARLY", "A_LATE", "M_NONE"]);
    /* The canonical catalog serves no expiry: the served order is kept, whatever the suffix says. */
    const served = main.symbols.items.filter((entry) => entry.contract_kind === "QUARTERLY").map((entry) => entry.symbol);
    expect(groupSymbols(main.symbols.items, null).find((entry) => entry.kind === "QUARTERLY")!.items.map((entry) => entry.symbol)).toEqual(served);
    const groups = groupSymbols([make("Z_EARLY", 100), make("A_LATE", 90)], null);
    expect(groups[0]!.items.map((entry) => entry.symbol)).toEqual(["A_LATE", "Z_EARLY"]);
  });

  it("listing: partial when truncated, when the total exceeds what was served, or a cursor is present", () => {
    expect(symbolListing(main)!.partial).toBe(false);
    expect(symbolListing(partial().datasets[0]!)).toMatchObject({ served: 5, total: 29, partial: true });
    expect(symbolListing({ ...main, symbols: { ...main.symbols, total: null, truncated: true } })).toMatchObject({ total: null, partial: true });
    expect(symbolListing({ ...main, symbols: { ...main.symbols, next_cursor: "c" } } as typeof main)!.partial).toBe(true);
    expect(symbolListing(multi.datasets[3]!)).toBeNull();
  });

  it("symbol page: total null stays null (never 0); an unindexed page says why; a non-page is null", () => {
    expect(readSymbolPage(symbolPage({ total: 29, next_cursor: "cur_2" }))).toMatchObject({ total: 29, nextCursor: "cur_2", availability: { state: "AVAILABLE" } });
    expect(readSymbolPage(symbolPage({ total: null }))!.total).toBeNull();
    expect(readSymbolPage(symbolPage({ total: null, items: [], availability: { state: "NOT_PUBLISHED", reason_code: "HMD_METADATA_INDEX_NOT_BUILT" } }))).toMatchObject({
      total: null,
      availability: { state: "NOT_PUBLISHED", reasonCode: "HMD_METADATA_INDEX_NOT_BUILT" },
    });
    expect(readSymbolPage({ nope: 1 })).toBeNull();
  });

  it("bar metadata: counts and warmup as served; a not-published answer keeps no number", () => {
    expect(readBarMetadata(barMetadata())).toMatchObject({ availability: "AVAILABLE", bars: 1056, warmupBarsRequired: 200, warmupBarsAvailableBeforeStart: 12000, startUtcMs: START, endExclusiveUtcMs: END });
    const outside = readBarMetadata(barMetadata({ availability: "NOT_PUBLISHED", reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, first_bar_utc_ms: null, last_bar_utc_ms: null, warmup_bars_available_before_start: null }))!;
    expect(outside).toMatchObject({ availability: "NOT_PUBLISHED", reasonCode: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE", bars: null, firstBarUtcMs: null, warmupBarsRequired: null, warmupBarsAvailableBeforeStart: null });
    /* A number on a not-published answer is not a fact. */
    expect(readBarMetadata(barMetadata({ availability: "NOT_PUBLISHED", bars: 5 }))!.bars).toBeNull();
    expect(readBarMetadata({ schema_version: "other" })).toBeNull();
    expect(readBarMetadata(barMetadata({ bars: "12" }))!.bars).toBeNull();
  });

  it("estimate from metadata: windows and warmup as served; the preflight's own numbers win on merge", () => {
    const meta = readBarMetadata(barMetadata())!;
    const fromIndex = estimateFromMetadata({ is: meta }, "is")!;
    expect(fromIndex.windows.is).toMatchObject({ bars: 1056, startUtcMs: START, endExclusiveUtcMs: END, reasonCode: null });
    expect(fromIndex.warmup).toMatchObject({ barsRequired: 200, barsAvailableBeforeIs: 12000, reasonCode: null });
    expect(fromIndex.plannedFolds).toBeNull();
    expect(estimateFromMetadata({}, null)).toBeNull();
    const preflight = readPreflightEstimate(ESTIMATE_FILE)!;
    const merged = mergeEstimates(preflight, estimateFromMetadata({ is: meta, analysis: meta }, "is"))!;
    expect(merged.windows.is!.bars).toBe(1056);
    expect(merged.windows.analysis!.bars).toBe(1056);
    expect(merged.plannedFolds).toEqual(preflight.plannedFolds);
    expect(mergeEstimates(null, null)).toBeNull();
    expect(mergeEstimates(preflight, null)).toBe(preflight);
  });

  it("estimate: windows, warmup, folds and conditions exactly as sent", () => {
    const estimate = readPreflightEstimate(ESTIMATE_FILE)!;
    expect([estimate.windows.is!.bars, estimate.windows.oos!.bars, estimate.windows.holdout!.bars]).toEqual([1056, 744, 408]);
    expect(estimate.warmup).toEqual({ barsRequired: 200, barsAvailableBeforeIs: 12000 });
    expect(estimate.plannedFolds).toMatchObject({ count: 11, basis: "weekly expanding", minBarsPerFold: 168 });
    expect(estimate.conditions).toHaveLength(5);
    expect(estimate.conditions!.filter((entry) => entry.state === "NOT_PUBLISHED")).toHaveLength(1);
  });

  it("estimate: a non-integer count is absent, never coerced; nothing served is null", () => {
    const odd = readPreflightEstimate({ preflight_estimate: { windows: { is: { bars: "12", first_bar_utc_ms: 1, last_bar_utc_ms: 2 } } } })!;
    expect(odd.windows.is!.bars).toBeNull();
    expect(readPreflightEstimate(PREFLIGHT)).toBeNull();
    expect(readPreflightEstimate({ preflight_estimate: {} })).toBeNull();
  });

  it("the bar follows the chosen timeframe when bars are served, the months otherwise", () => {
    const axis = { first: 2020 * 12, last: 2026 * 12 + 9 };
    const synthetic = {
      symbol: "X",
      contract_kind: "PERPETUAL",
      coverage: { first_month: "2020-01", last_month: "2026-10", months: 82, granularity: "MONTH_PARTITION" },
      coverage_by_timeframe: [{ timeframe: "1h", availability: "AVAILABLE", first_bar_utc_ms: Date.UTC(2024, 0, 1), last_bar_utc_ms: Date.UTC(2024, 5, 30) }],
    } as never;
    const months = barGeometry(synthetic, axis)!;
    const hourly = barGeometry(synthetic, axis, "1h")!;
    expect(hourly.width).toBeLessThan(months.width);
    expect(hourly.left).toBeGreaterThan(months.left);
    expect(barGeometry(synthetic, axis, "4h")).toEqual(months);
  });

  it("timeframe chips: a timeframe the dataset names unavailable is disabled with the server's code", () => {
    const chips = timeframeChips(UNAVAILABLE_DATASET, null, "1h", true);
    expect(chips.find((chip) => chip.timeframe === "1h")).toMatchObject({ enabled: false, disabledReason: "unavailable", reasonCode: "HMD_DATASET_NOT_AVAILABLE" });
    const bybit = timeframeChips(multi.datasets[1]!, null, "1h", true);
    expect(bybit.find((chip) => chip.timeframe === "4h")).toMatchObject({ enabled: true, reasonCode: null });
    /* A v1 dataset has no facts: nothing is marked unavailable. */
    expect(timeframeChips(V1.datasets[0]!, null, "1h", true).every((chip) => chip.reasonCode === null)).toBe(true);
  });
});

describe("profiles (LW-07)", () => {
  const profiles = readProfiles(PROFILES)!;
  const p04 = profiles.find((entry) => entry.profileId.startsWith("p04"))!;
  const p10 = profiles.find((entry) => entry.profileId.startsWith("p10"))!;

  it("reads the served Atlas names, from the array or from the whole block", () => {
    expect(p10).toMatchObject({ granularity: "weekly", windowMode: "expanding", maxSpanDays: 92, folds: { min: 2, max: 16 }, trials: { min: 2, max: 400 }, seed: { state: "fixed", value: 42 } });
    expect(readProfiles({ profiles: PROFILES })!.length).toBe(profiles.length);
    expect(readProfiles(null)).toBeNull();
    expect(trialsPinned(p04)).toBe(1);
    expect(seedPinned(p04)).toBeNull();
  });

  it("random_seed null alone is NOT 'forbidden': it reads unpinned, so the field stays editable", () => {
    expect(p04.seed).toEqual({ state: "unpinned", value: null });
  });

  it("the spec names (the estimate fixture's profiles[]) read the same", () => {
    const spec = readProfiles({ profiles: ESTIMATE_FILE.preflight_estimate.profiles })!;
    expect(spec.find((entry) => entry.profileId.startsWith("p10"))).toMatchObject({ granularity: "weekly", folds: { min: 2, max: 16 }, trials: { min: 2, max: 400, default: null }, seed: { state: "fixed", value: 42 } });
    expect(spec.find((entry) => entry.profileId.startsWith("p04"))!.seed.state).toBe("forbidden");
  });

  it("selects by protocol and route; ambiguity or no match is not a profile", () => {
    const pick = (protocol: string) => selectProfile(profiles, { protocol, executionRoute: "signal_notional", optimizationMode: "mode_1_decay" });
    expect(pick("advanced")!.profileId).toMatch(/^p10/);
    expect(pick("three_window_decay")!.profileId).toMatch(/^p04/);
    expect(pick("nope")).toBeNull();
    expect(selectProfile([p04, p04], { protocol: p04.protocol!, executionRoute: "signal_notional", optimizationMode: "" })).toBeNull();
    expect(selectProfile(null, { protocol: "advanced", executionRoute: "signal_notional", optimizationMode: "" })).toBeNull();
  });

  it("trial default: the fixed count, else the served default (none today), else nothing", () => {
    expect(profileTrialDefault(p04)).toBe(1);
    expect(profileTrialDefault(p10)).toBeNull();
  });
});

/* ------------------------------------------------------------- the picker */

describe("Market data: instrument absence, per-timeframe coverage, quality", () => {
  it("the list says once that instrument terms are not published, with the served code; rows carry no blank columns", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    const once = document.querySelectorAll("[data-instrument-absent-list]");
    expect(once).toHaveLength(1);
    expect(once[0]!.getAttribute("data-instrument-absent-list")).toBe("HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED");
    expect(once[0]!.getAttribute("title")).toContain("HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED");
    expect(once[0]!.getAttribute("title")).toContain("HMD_DIRECT");
    expect(document.querySelectorAll("[data-option-instrument]")).toHaveLength(0);
    expect(q('[data-symbol-option="BTCUSDT_210326"]')!.textContent).not.toMatch(/exp \d{4}/);
    fireEvent.click(q('[data-symbol-option="BTCUSDT"]')!);
    expect(input().value).toBe("BTCUSDT");
  });

  it("the legacy contract kind is labelled as a namespace hint", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-group="QUARTERLY"] > div')!.getAttribute("title")).toContain("namespace hint");
    cleanup();
    render(<Harness initial={baseDraft({ symbol: "BTCUSDT_210326" })} extra={{ catalog: V2 }} />);
    expect(q("[data-contract-kind-hint]")!.getAttribute("title")).toContain("not an instrument fact");
    expect(q("[data-contract-kind-hint]")!.textContent).toBe("quarterly");
  });

  it("the row's coverage is the chosen timeframe's bars; a timeframe the server did not publish says so", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-coverage]')!.textContent).toBe("48 of 48 bars · 0 gaps");
    cleanup();
    render(<Harness initial={baseDraft({ symbol: "", timeframe: "4h" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-coverage]')!.textContent).toContain("4h bars not published");
  });

  it("partial quality: a row with a gap is flagged from the selected timeframe, a clean one is not", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: normalizeCatalog(CAT_PARTIAL) }} />);
    fireEvent.focus(input());
    const chip = q('[data-symbol-option="BTCUSDT"] [data-quality-chip]')!;
    expect(chip.textContent).toBe("1 gap");
    expect(chip.getAttribute("title")).toContain("quality 1h");
    expect(chip.getAttribute("title")).toContain("missing 0.041666666667");
    expect(chip.getAttribute("title")).toContain("as of");
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-coverage]')!.textContent).toBe("46 of 48 bars · 1 gap");
    cleanup();
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q("[data-symbol-option] [data-quality-chip]")).toBeNull();
  });

  it("the picked symbol: ONE instrument absence, the timeframe's gaps, the as-of, the bars", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "BTCUSDT", timeframe: "1h" })} extra={{ catalog: V2 }} />);
    const absent = document.querySelectorAll("[data-instrument-absent]");
    expect(absent).toHaveLength(1);
    expect(absent[0]!.textContent).toBe("instrument — not published");
    expect(absent[0]!.getAttribute("data-instrument-absent")).toBe("HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED");
    expect(absent[0]!.getAttribute("aria-label")).toContain("HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED");
    expect(q("[data-instrument]")).toBeNull();
    const chip = q("[data-symbol-facts] [data-quality-chip]")!;
    expect(chip.getAttribute("data-quality-chip")).toBe("served");
    expect(chip.textContent).toBe("0 gaps");
    const asOf = q("[data-as-of]")!;
    expect(asOf.textContent).toBe(`as of ${utcDay(CAT_HEALTHY.as_of_utc_ms!)}`);
    expect(asOf.getAttribute("title")).toContain("not a live feed");
    const line = q("[data-symbol-coverage]")!;
    expect(line.textContent).toContain("1h · 2026-07-01 → 2026-07-02 · 48 of 48 bars · 0 gaps");
    expect(line.getAttribute("data-coverage-timeframe")).toBe("1h");
  });

  it("an expiry is never read from the symbol name", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "BTCUSDT_210326" })} extra={{ catalog: V2 }} />);
    expect(q("[data-symbol-facts]")!.textContent).not.toMatch(/exp\b|2021-03-26/);
  });

  it("a symbol the index has no bars for reads not published with the served code, never a zero", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "BTCUSDT" })} extra={{ catalog: normalizeCatalog(CAT_ABSENT) }} />);
    const line = q("[data-symbol-coverage]")!;
    expect(line.textContent).toContain("2020-01 → 2026-09 · 81 months · 1h bars not published");
    expect(line.getAttribute("title")).toBe("1h bars not published · HMD_METADATA_INDEX_NOT_BUILT");
    const chip = q("[data-symbol-facts] [data-quality-chip]")!;
    expect(chip.getAttribute("data-quality-chip")).toBe("NOT_PUBLISHED");
    expect(chip.textContent).toBe("quality — not published");
    expect(chip.getAttribute("data-reason-code")).toBe("HMD_METADATA_INDEX_NOT_BUILT");
    expect(q("[data-as-of]")).toBeNull();
    expect(q("[data-symbol-facts]")!.textContent).not.toMatch(/\b0 bars\b|\b0 gaps\b/);
    /* The dataset row says once that the index is not built. */
    expect(q("[data-index-absent]")!.getAttribute("data-index-absent")).toBe("HMD_METADATA_INDEX_NOT_BUILT");
    expect(q("[data-index-as-of]")).toBeNull();
  });

  it("the multi-dataset catalog: a not-indexed symbol says why in the tooltip", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: multi }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-coverage]')!.getAttribute("title")).toBe("1h bars not published · HMD_SYMBOL_INTERVAL_NOT_INDEXED");
  });

  it("absent path: the canonical v1 catalog shows none of it", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: V1 }} />);
    fireEvent.focus(input());
    for (const selector of ["[data-option-instrument]", "[data-instrument-absent-list]", "[data-quality-chip]", "[data-instrument]", "[data-instrument-absent]", "[data-as-of]", "[data-index-absent]", "[data-index-as-of]", "[data-chip=asset-class]"]) {
      expect(q(selector), selector).toBeNull();
    }
    expect(q("[data-symbol-coverage]")!.textContent).toContain("month");
  });
});

describe("Market data: datasets and timeframes", () => {
  it("an unmounted dataset is disabled with the server's sentence and code; a second available one is chosen by select; listed is not runnable", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: multi }} />);
    const option = document.querySelector('[data-dataset-select] option[value="fixture-unavailable-1h"]') as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.title).toBe("The approved historical source is not mounted on this host.");
    const chip = q('[data-unavailable-dataset="fixture-unavailable-1h"]')!;
    expect(chip.getAttribute("data-reason-code")).toBe("HMD_DATASET_NOT_AVAILABLE");
    expect(chip.getAttribute("title")).toBe("The approved historical source is not mounted on this host. · HMD_DATASET_NOT_AVAILABLE");
    expect(chip.getAttribute("aria-label")).toContain("HMD_DATASET_NOT_AVAILABLE");
    expect((document.querySelector('[data-dataset-select] option[value="fixture-bybit-1h"]') as HTMLOptionElement).disabled).toBe(false);
    expect(q("[data-dataset-identity]")!.getAttribute("title")).toContain("preflight decides whether a run is admitted");
  });

  it("the chosen dataset: asset class is a typed absence in the tooltip, the revision too; the index as-of is a small mono date", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: V2 }} />);
    expect(q("[data-chip=asset-class]")).toBeNull();
    expect(q("[data-chip=quote-currency]")).toBeNull();
    const title = q("[data-dataset-identity]")!.getAttribute("title")!;
    expect(title).toContain(CAT_HEALTHY.datasets[0]!.catalog_revision!);
    expect(title).toContain("HMD_READER_ASSET_CLASS_NOT_PUBLISHED");
    expect(q("[data-index-as-of]")!.textContent).toBe(`as of ${utcDay(CAT_HEALTHY.as_of_utc_ms!)}`);
  });

  it("a timeframe the dataset cannot serve is a disabled chip with its code; the others still pick", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ datasetId: "fixture-unavailable-1h", symbol: "" })} extra={{ catalog: multi }} />);
    const chip = q('[data-timeframe-chip="1h"]') as HTMLButtonElement;
    expect(chip.getAttribute("data-chip-reason")).toBe("unavailable");
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(chip.title).toBe("dataset cannot serve it · HMD_DATASET_NOT_AVAILABLE");
    expect(chip.getAttribute("aria-label")).toBe("1h, dataset cannot serve it · HMD_DATASET_NOT_AVAILABLE");
    fireEvent.click(chip);
    expect(q('[data-timeframe-chip="1h"]')!.getAttribute("aria-disabled")).toBe("true");
  });

  it("a source that publishes no symbol list says so with its served reason", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ datasetId: "fixture-query-any-symbol", symbol: "" })} extra={{ catalog: multi }} />);
    expect(document.body.textContent).toContain("This source answers any symbol by query and publishes no symbol list.");
  });
});

describe("Market data: server symbol search", () => {
  it("a partial list is asked of the server once, debounced, with q, the timeframe and the limit; the answer is top N / total", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      calls.push(String(request));
      return json(symbolPage({ total: 1, items: [item("ETHUSDT")] }));
    }));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    for (const text of ["E", "ET", "ETH"]) fireEvent.change(input(), { target: { value: text } });
    await waitFor(() => expect(q("[data-symbol-caption]")!.textContent).toBe("top 1 / 1"), { timeout: 2000 });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!, "http://localhost");
    expect(url.pathname).toBe("/api/v1/research/datasets/crypto-binance-1m/symbols");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "ETH", timeframe: "1h", limit: "25" });
    expect(q('[data-symbol-option="ETHUSDT"]')).not.toBeNull();
  });

  it("total: null reads top N with no total, never a 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(symbolPage({ total: null, items: [item("ETHUSDT"), item("SOLUSDT")] }))));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "USDT" } });
    await waitFor(() => expect(q("[data-symbol-caption]")).not.toBeNull(), { timeout: 2000 });
    expect(q("[data-symbol-caption]")!.textContent).toBe("top 2");
    expect(q("[data-symbol-caption]")!.textContent).not.toMatch(/\/|\b0\b/);
  });

  it("a total-less empty answer never says the symbol is unlisted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(symbolPage({ total: null, items: [] }))));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ZZZUSDT" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(q("[data-symbol-unlisted]")).toBeNull();
  });

  it("an unindexed page keeps the served list and shows the served code once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(symbolPage({ total: null, items: [], availability: { state: "NOT_PUBLISHED", reason_code: "HMD_METADATA_INDEX_NOT_BUILT" } }))));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "BTC" } });
    await waitFor(() => expect(q("[data-symbol-search-unindexed]")).not.toBeNull(), { timeout: 2000 });
    expect(q("[data-symbol-search-unindexed]")!.textContent).toBe("server search — not published · HMD_METADATA_INDEX_NOT_BUILT");
    expect(q('[data-symbol-option="BTCUSDT"]')).not.toBeNull();
  });

  it("a symbol the catalog did not serve but the server did still gets its facts under the field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(symbolPage({ total: 1, items: [item("ETHUSDT")] }))));
    const sliced = partial();
    sliced.datasets[0]!.symbols.items = sliced.datasets[0]!.symbols.items.filter((entry) => entry.symbol !== "ETHUSDT");
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: sliced }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ETHUSDT" } });
    await waitFor(() => expect(q('[data-symbol-option="ETHUSDT"]')).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(q('[data-symbol-option="ETHUSDT"]')!);
    expect(q("[data-symbol-facts]")).not.toBeNull();
    expect(q("[data-symbol-unlisted]")).toBeNull();
  });

  it("an empty server answer with a total of 0 says the typed symbol is unlisted; a partial list alone never does", async () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "ZZZUSDT" })} extra={{ catalog: partial() }} />);
    expect(q("[data-symbol-unlisted]")).toBeNull();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => json(symbolPage({ total: 0, items: [] }))));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ZZZUSDT" } });
    await waitFor(() => expect(q("[data-symbol-unlisted]")).not.toBeNull(), { timeout: 2000 });
  });

  it("a whole list is never sent to the server", async () => {
    const fetchMock = vi.fn(PENDING);
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "BTC" } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("more: follows the server's keyset cursor with the same filters and appends without duplicates", async () => {
    const calls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request), "http://localhost");
      calls.push(url);
      return url.searchParams.get("cursor")
        ? json(symbolPage({ total: 29, next_cursor: null, items: [item("ETHUSDT"), item("SOLUSDT")] }))
        : json(symbolPage({ total: 29, next_cursor: "cur_2", items: [item("ETHUSDT"), item("BTCUSDT")] }));
    }));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "T" } });
    await waitFor(() => expect(q("[data-symbol-more]")).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(q("[data-symbol-more]")!);
    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 2000 });
    expect(calls[1]!.searchParams.get("cursor")).toBe("cur_2");
    /* The cursor is bound to its filters and limit: they are sent again unchanged. */
    for (const key of ["q", "timeframe", "limit"]) expect(calls[1]!.searchParams.get(key)).toBe(calls[0]!.searchParams.get(key));
    await waitFor(() => expect(q("[data-symbol-more]")).toBeNull());
    expect(document.querySelectorAll('[data-symbol-option="ETHUSDT"]')).toHaveLength(1);
  });

  it("a 404 falls back to the served list silently and is not asked again", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: "NOT_FOUND", message: "x" } }, 404));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "BTC" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.body.textContent).not.toMatch(/404|not found|error/i);
    expect(q('[data-symbol-option="BTCUSDT"]')).not.toBeNull();
    expect(q('[data-symbol-option="SOLUSDT"]')).toBeNull();
    fireEvent.change(input(), { target: { value: "BTCU" } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------- profiles */

describe("Optimization and Walk-forward: profile locking", () => {
  const withProfiles = { portalAdmission: PROFILES };

  it("a profile that fixes the trial count locks the field and names the profile in its tooltip", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ optunaTrials: "1" })} extra={{ ...withProfiles, initialStep: "optimization" }} />);
    const trials = screen.getByLabelText("Optuna trials") as HTMLInputElement;
    expect(trials.readOnly).toBe(true);
    expect(trials.title).toBe("pinned by p04.fixed-qualification.v1");
    expect(q("[data-profile-card]")!.getAttribute("data-profile-card")).toBe("p04.fixed-qualification.v1");
    expect(q("[data-submission-constraints]")).toBeNull();
    expect((screen.getByLabelText("Early stopping") as HTMLInputElement).readOnly).toBe(false);
    expect((screen.getByLabelText("Random seed") as HTMLInputElement).readOnly).toBe(false);
  });

  it("an advanced draft: seed 42 is locked, trials stay editable inside 2-400", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ protocol: "advanced", optunaTrials: "400", randomSeed: "42" })} extra={{ ...withProfiles, initialStep: "optimization" }} />);
    const seed = screen.getByLabelText("Random seed") as HTMLInputElement;
    expect(seed.readOnly).toBe(true);
    expect(seed.title).toBe("pinned by p10.delta-signal-notional-wfo.v1");
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).readOnly).toBe(false);
    expect(q("[data-profile-card]")!.textContent).toContain("trials 2–400");
    expect(q("[data-outside-profile]")).toBeNull();
  });

  it("a value outside the profile stays editable and is named, not replaced", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ optunaTrials: "5" })} extra={{ ...withProfiles, initialStep: "optimization" }} />);
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).readOnly).toBe(false);
    expect(q('[data-outside-profile-field="trials"]')!.textContent).toBe("Trials 5 — profile 1–1. Kept as entered.");
    cleanup();
    render(<Harness initial={baseDraft({ protocol: "advanced", optunaTrials: "400", randomSeed: "7" })} extra={{ ...withProfiles, initialStep: "optimization" }} />);
    expect((screen.getByLabelText("Random seed") as HTMLInputElement).readOnly).toBe(false);
    expect(q('[data-outside-profile-field="random_seed"]')!.textContent).toBe("Seed 7 — profile pins 42. Kept as entered.");
  });

  it("walk-forward: the profile supplies frequency and window mode, pins them, and shows folds and span", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ protocol: "advanced" })} extra={{ ...withProfiles, initialStep: "windows" }} />);
    const frequency = screen.getByLabelText("Frequency") as HTMLSelectElement;
    expect(frequency.value).toBe("weekly");
    expect(frequency.disabled).toBe(true);
    expect(frequency.title).toBe("pinned by p10.delta-signal-notional-wfo.v1");
    expect((screen.getByLabelText("Window mode") as HTMLSelectElement).title).toBe("pinned by p10.delta-signal-notional-wfo.v1");
    expect(q("[data-profile-folds]")!.textContent).toBe("folds 2–16 · span ≤ 92 days");
  });

  it("a copied draft whose frequency differs from the profile keeps it, editable, and says so", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    const draft = baseDraft({ protocol: "advanced" });
    render(<Harness initial={{ ...draft, walkForward: { ...draft.walkForward, frequency: "monthly", windowMode: "expanding" } }} extra={{ ...withProfiles, initialStep: "windows" }} />);
    expect((screen.getByLabelText("Frequency") as HTMLSelectElement).disabled).toBe(false);
    expect(q('[data-outside-profile-field="frequency"]')!.textContent).toBe("Frequency monthly — profile weekly. Kept as entered.");
  });

  it("a disabled profile pins nothing and says why", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    const disabled = PROFILES.map((entry) => (String(entry.profile_id).startsWith("p04") ? { ...entry, state: "DISABLED", reason: "PROFILE_FLAG_OFF" } : entry)) as unknown as typeof PROFILES;
    render(<Harness initial={baseDraft({ optunaTrials: "1" })} extra={{ portalAdmission: disabled, initialStep: "optimization" }} />);
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).readOnly).toBe(false);
    expect(q("[data-profile-card]")!.textContent).toContain("disabled · PROFILE_FLAG_OFF");
    expect(q("[data-submission-constraints]")).toBeNull();
  });

  it("absent path: with no served profiles the single-profile card and notes are the source, as before", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ optunaTrials: "5" })} extra={{ initialStep: "optimization" }} />);
    expect(q("[data-submission-constraints]")).not.toBeNull();
    expect(q("[data-profile-card]")).toBeNull();
    expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).readOnly).toBe(false);
    expect(q('[data-outside-profile-field="trials"]')).not.toBeNull();
    cleanup();
    render(<Harness initial={baseDraft({ protocol: "advanced" })} extra={{ initialStep: "windows" }} />);
    expect((screen.getByLabelText("Frequency") as HTMLSelectElement).disabled).toBe(false);
    expect(q("[data-profile-folds]")).toBeNull();
  });
});

/* ------------------------------------------------------------- estimate */

describe("Review rail: the preflight estimate", () => {
  const estimate = readPreflightEstimate(ESTIMATE_FILE)!;
  const threeWindows = baseDraft({
    windows: {
      is: { start: "2025-06-01T00:00", endExclusive: "2025-07-15T00:00" },
      oos: { start: "2025-07-15T00:00", endExclusive: "2025-08-15T00:00" },
      holdout: { start: "2025-08-15T00:00", endExclusive: "2025-09-01T00:00" },
    },
  });

  it("bars beside each window, the warmup chip, the planned folds and the five conditions", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={threeWindows} extra={{ estimate }} />);
    expect(q('[data-window-bars="is"]')!.textContent).toBe("1,056 bars");
    expect(q('[data-window-bars="oos"]')!.textContent).toBe("744 bars");
    expect(q('[data-window-bars="holdout"]')!.textContent).toBe("408 bars");
    expect(q('[data-window-bars="is"]')!.title).toContain("first 2025-06-01 00:00");
    expect(q("[data-warmup-chip]")!.textContent).toBe("warmup 200");
    expect(q("[data-warmup-chip]")!.title).toBe("warmup 200 bars required · 12,000 available before IS");
    /* RG2: the basis word is the tooltip, not the line. */
    expect(q("[data-planned-folds]")!.textContent).toBe("≈ 11 folds");
    expect(q("[data-planned-folds]")!.title).toContain("the server decides");
    expect(document.querySelectorAll("[data-condition]")).toHaveLength(5);
    const absent = q('[data-condition="coverage_covers_windows"]')!;
    expect(absent.getAttribute("data-condition-state")).toBe("NOT_PUBLISHED");
    expect(absent.textContent).toContain("not published · ESTIMATE_NOT_COMPUTED");
    expect(q('[data-condition="bars_sufficient"]')!.title).toBe("observed 2208 bars · required >= 1200 bars");
    expect(q("[data-review-rail]")!.textContent).not.toMatch(/\b0 bars\b/);
  });

  it.each(Object.keys(ESTIMATE_FILE.refused_variants))("a failing %s condition reads ✗ with its reason code and observed against required", (key) => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    const failing = readPreflightEstimate({ preflight_estimate: { conditions: ESTIMATE_FILE.refused_variants[key]!.conditions } })!;
    render(<Harness initial={baseDraft()} extra={{ estimate: failing }} />);
    const row = q(`[data-condition="${key}"]`)!;
    expect(row.getAttribute("data-condition-state")).toBe("FAIL");
    expect(row.textContent).toContain("✗");
    expect(row.textContent).toMatch(/ESTIMATE_[A-Z_]+/);
    expect(row.title).toMatch(/^observed .+ · required .+ · ESTIMATE_/);
    expect(row.getAttribute("aria-label")).toContain("not met");
    expect(document.querySelectorAll('[data-condition-state="FAIL"]')).toHaveLength(1);
  });

  it("folds with no count read not published with the server's reason; a window without bars reads not published, never 0", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    const none = readPreflightEstimate({
      preflight_estimate: {
        planned_folds: { count: null, reason_code: "ESTIMATE_FOLDS_BELOW_PROFILE_MIN" },
        windows: { is: { first_bar_utc_ms: 1, last_bar_utc_ms: 2 } },
      },
    })!;
    render(<Harness initial={baseDraft()} extra={{ estimate: none }} />);
    expect(q('[data-planned-folds="absent"]')!.textContent).toBe("folds — not published · ESTIMATE_FOLDS_BELOW_PROFILE_MIN");
    expect(q('[data-window-bars="is"]')!.textContent).toBe("bars — not published");
  });

  it("an advanced draft prints the windows on one line", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ protocol: "advanced" })} extra={{ estimate }} />);
    expect(q("[data-window-bars-line]")!.textContent).toContain("1,056 bars");
  });

  it("absent path: no estimate renders none of it", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={threeWindows} />);
    for (const selector of ["[data-window-bars]", "[data-warmup-chip]", "[data-planned-folds]", "[data-conditions]", "[data-estimate-strip]"]) {
      expect(q(selector), selector).toBeNull();
    }
  });
});

/* -------------------------------------------------------- the real route */

describe("the route", () => {
  function serve(body: { preflight: unknown; catalog: unknown }) {
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(request), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets/catalog-v2") return json({ error: { code: "NOT_FOUND", message: "not found" } }, 404);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets") return json(body.catalog);
      if (method === "POST") return json(body.preflight);
      throw new Error(`unexpected request ${method} ${url.pathname}`);
    }));
  }
  async function mountRoute(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(q("[data-screen=new-run]")).not.toBeNull());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  }
  const entry = `/research/quantbt/runs/new?step=optimization&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`;

  it("fills the trial count the profile fixes, and nothing the profile does not serve", async () => {
    serve({ preflight: PREFLIGHT, catalog: V1 });
    await mountRoute(entry);
    /* A fresh draft is a three-window one: p04 fixes one trial. */
    await waitFor(() => expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).value).toBe("1"));
    expect((screen.getByLabelText("Random seed") as HTMLInputElement).value).toBe("");
    expect(q("[data-profile-card]")!.getAttribute("data-profile-card")).toBe("p04.fixed-qualification.v1");
  });

  it("without served profiles the route keeps the old trial default (absent path)", async () => {
    const { portal_admission: _dropped, ...withoutBlock } = ATLAS_RESPONSE;
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request), "http://localhost");
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json(withoutBlock);
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets") return json(V1);
      return json(PREFLIGHT);
    }));
    await mountRoute(entry);
    await waitFor(() => expect((screen.getByLabelText("Optuna trials") as HTMLInputElement).value).toBe(String(ATLAS.current_release.submission_constraints.accepted_trial_count)));
    expect(q("[data-profile-card]")).toBeNull();
  });
});
