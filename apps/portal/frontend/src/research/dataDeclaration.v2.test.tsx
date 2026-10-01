/**
 * S02_V2B · the optional data-declaration facts on Screen 02 (DATA_DECLARATION_SPEC §3, §4).
 *
 * The backend serves none of the v2 fields yet. Every reader and screen is tested twice: with the
 * proposed fixtures (value path) and with the canonical v1 fixtures (absent path: today's behaviour).
 * Fixtures are read at run time from the repo root with `readFileSync`, never imported, so the image
 * build context needs no `upgrade/`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import type { DatasetCatalog } from "./datasetClient";
import {
  barGeometry,
  barsLine,
  coverageFor,
  groupSymbols,
  normalizeCatalog,
  profileTrialDefault,
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
  trialsPinned,
} from "./dataDeclaration";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import type { RunDraft } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
const V2 = normalizeCatalog(proposed<unknown>("dataset-catalog.v2.proposed.fixture.json"));
const SYMBOLS_FILE = proposed<{ total: number; next_cursor: string; items: unknown[] }>("dataset-symbols.v2.proposed.fixture.json");
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
const partial = (): DatasetCatalog => ({
  ...V2,
  datasets: [{ ...main, symbols: { ...main.symbols, items: main.symbols.items.slice(0, 10) } }, ...V2.datasets.slice(1)],
});

/* ------------------------------------------------------------- readers */

describe("readers: the value path from the proposed fixtures", () => {
  it("instrument: exact decimals as text, expiry from the served instant, null when absent", () => {
    expect(readInstrument(item("BTCUSDT"))).toMatchObject({ tickSize: "0.10", lotSize: "0.001", contractMultiplier: "1", expiryUtcMs: null });
    expect(readInstrument(item("BTCUSDT_210326"))!.expiryUtcMs).toBe(Date.UTC(2021, 2, 26, 8));
    expect(readInstrument(item("BTCUSDT_210625"))).toBeNull();
    expect(readInstrument({ instrument: { tick_size: 0.1 } })!.tickSize).toBeNull();
  });

  it("coverage_by_timeframe: the exact timeframe or nothing, counts as served", () => {
    const bnb = item("BNBUSDT");
    const oneHour = coverageFor(bnb, "1h")!;
    expect(barsLine(oneHour)).toBe("58,197 of 58,214 bars · 3 gaps");
    expect(coverageFor(bnb, "4h")!.barCount).toBe(14550);
    expect(coverageFor(bnb, "5min")).toBeNull();
    expect(coverageFor(item("BTCUSDT_210625"), "1h")).toBeNull();
    expect(barsLine(coverageFor(item("BTCUSDT"), "1h")!)).toBe("59,182 of 59,182 bars · 0 gaps");
  });

  it("quality: the server's word and numbers; an unknown word is kept; absent is null", () => {
    expect(readQuality(item("BNBUSDT"))).toMatchObject({ state: "PARTIAL", gapCount: 3, reasonCode: "GAPS_PRESENT" });
    expect(readQuality(item("BTCUSDT"))!.state).toBe("OK");
    expect(readQuality(item("BTCUSDT_210625"))).toBeNull();
    expect(readQuality({ quality: { state: "STALE_X" } })!.state).toBe("STALE_X");
  });

  it("timeframes: v2 objects become names plus facts; a v1 catalog is returned untouched", () => {
    expect(main.timeframes).toContain("1h");
    expect(timeframeFacts(main)!.find((entry) => entry.timeframe === "1h")).toMatchObject({ resolutionSeconds: 3600, availability: "available" });
    expect(timeframeFacts(V2.datasets[2]!)!.find((entry) => entry.timeframe === "4h")).toMatchObject({ availability: "unavailable", reasonCode: "TIMEFRAME_NOT_BUILT" });
    expect(normalizeCatalog(V1)).toEqual(V1);
    expect(timeframeFacts(V1.datasets[0]!)).toBeNull();
  });

  it("quarterlies sort by their served expiry, never by the symbol name", () => {
    const make = (symbol: string, expiry: number | null) => ({ symbol, contract_kind: "QUARTERLY", coverage: null, ...(expiry === null ? {} : { instrument: { expiry_utc_ms: expiry } }) }) as never;
    const sorted = sortByExpiry([make("Z_EARLY", 100), make("A_LATE", 900), make("M_NONE", null)]) as unknown as { symbol: string }[];
    expect(sorted.map((entry) => entry.symbol)).toEqual(["Z_EARLY", "A_LATE", "M_NONE"]);
    /* No expiry anywhere: the served order is kept, so the v1 picker is unchanged. */
    expect(groupSymbols(V1.datasets[0]!.symbols.items, null)).toEqual(groupSymbols(V1.datasets[0]!.symbols.items, null));
    const groups = groupSymbols([make("Z_EARLY", 100), make("A_LATE", 90)], null);
    expect(groups[0]!.items.map((entry) => entry.symbol)).toEqual(["A_LATE", "Z_EARLY"]);
  });

  it("listing: partial when the total exceeds what was served, or a cursor is present", () => {
    expect(symbolListing(main)!.partial).toBe(false);
    expect(symbolListing(partial().datasets[0]!)).toMatchObject({ served: 10, total: 29, partial: true });
    expect(symbolListing({ ...main, symbols: { ...main.symbols, next_cursor: "c" } } as typeof main)!.partial).toBe(true);
    expect(readSymbolPage(SYMBOLS_FILE)).toMatchObject({ total: 29, nextCursor: "cur_proposed_page_2" });
    expect(readSymbolPage({ nope: 1 })).toBeNull();
  });

  it("the bar follows the chosen timeframe when bars are served, the months otherwise", () => {
    const axis = { first: 2020 * 12, last: 2026 * 12 + 9 };
    const synthetic = {
      symbol: "X",
      contract_kind: "PERPETUAL",
      coverage: { first_month: "2020-01", last_month: "2026-10", months: 82, granularity: "MONTH_PARTITION" },
      coverage_by_timeframe: [{ timeframe: "1h", first_bar_utc_ms: Date.UTC(2024, 0, 1), last_bar_utc_ms: Date.UTC(2024, 5, 30) }],
    } as never;
    const months = barGeometry(synthetic, axis)!;
    const hourly = barGeometry(synthetic, axis, "1h")!;
    expect(hourly.width).toBeLessThan(months.width);
    expect(hourly.left).toBeGreaterThan(months.left);
    expect(barGeometry(synthetic, axis, "4h")).toEqual(months);
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

  it("timeframe chips: a timeframe the dataset names unavailable is disabled with the server's code", () => {
    const bybit = V2.datasets[2]!;
    const chips = timeframeChips(bybit, null, "1h", true);
    expect(chips.find((chip) => chip.timeframe === "4h")).toMatchObject({ enabled: false, disabledReason: "unavailable", reasonCode: "TIMEFRAME_NOT_BUILT" });
    expect(chips.find((chip) => chip.timeframe === "1d")).toMatchObject({ enabled: true, reasonCode: null });
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

describe("Market data: instrument, per-timeframe coverage, quality", () => {
  it("rows carry instrument terms, expiry from the instant and the quality chip; a pick patches the symbol", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-instrument]')!.textContent).toBe("tick 0.10 · lot 0.001 · ×1");
    expect(q('[data-symbol-option="BTCUSDT_210326"] [data-option-instrument]')!.textContent).toContain("exp 2021-03-26");
    expect(q('[data-symbol-option="BNBUSDT"] [data-quality-chip]')!.getAttribute("title")).toContain("gaps 3");
    expect(q('[data-symbol-option="BNBUSDT"] [data-quality-chip]')!.getAttribute("aria-label")).toContain("GAPS_PRESENT");
    expect(q('[data-symbol-option="BTCUSDT_210625"] [data-option-instrument-absent]')!.textContent).toBe("instrument — not published");
    fireEvent.click(q('[data-symbol-option="BTCUSDT"]')!);
    expect(input().value).toBe("BTCUSDT");
  });

  it("the row's coverage is the chosen timeframe's bars; a timeframe the server did not publish says so", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "", timeframe: "4h" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BNBUSDT"] [data-option-coverage]')!.textContent).toContain("14,550 of 14,554 bars · 3 gaps");
    expect(q('[data-symbol-option="BNBUSDT"] [data-option-coverage]')!.getAttribute("title")).toContain("missing 0.000275");
    expect(q('[data-symbol-option="BTCUSDT_210625"] [data-option-coverage]')!.textContent).toContain("2021-03 → 2021-06");
    cleanup();
    render(<Harness initial={baseDraft({ symbol: "", timeframe: "5min" })} extra={{ catalog: V2 }} />);
    fireEvent.focus(input());
    expect(q('[data-symbol-option="BNBUSDT"] [data-option-coverage]')!.textContent).toContain("5min bars not published");
  });

  it("the picked symbol: instrument line, quality chip, and the timeframe's bars and gaps", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "BNBUSDT", timeframe: "1h" })} extra={{ catalog: V2 }} />);
    expect(q("[data-instrument]")!.textContent).toContain("BNBUSDT Perpetual");
    expect(q("[data-instrument]")!.textContent).toContain("tick 0.010");
    expect(q("[data-symbol-facts] [data-quality-chip]")!.getAttribute("data-quality-chip")).toBe("PARTIAL");
    const line = q("[data-symbol-coverage]")!;
    expect(line.textContent).toContain("1h · 2020-02-10 → 2026-10-01 · 58,197 of 58,214 bars · 3 gaps");
    expect(line.getAttribute("data-coverage-timeframe")).toBe("1h");
    expect(line.getAttribute("aria-label")).toContain("largest gap 21,600 s");
  });

  it("what the server left out reads not published, never a zero", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "BTCUSDT_210625" })} extra={{ catalog: V2 }} />);
    expect(q("[data-instrument-absent]")!.textContent).toBe("instrument — not published");
    expect(q("[data-quality-absent]")!.textContent).toBe("quality — not published");
    expect(q("[data-symbol-coverage]")!.textContent).toContain("2021-03 → 2021-06 · 4 months");
    expect(q("[data-symbol-facts]")!.textContent).not.toMatch(/\b0 bars\b/);
  });

  it("absent path: the canonical v1 catalog shows none of it", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: V1 }} />);
    fireEvent.focus(input());
    for (const selector of ["[data-option-instrument]", "[data-option-instrument-absent]", "[data-quality-chip]", "[data-instrument]", "[data-instrument-absent]", "[data-quality-absent]", "[data-chip=asset-class]"]) {
      expect(q(selector), selector).toBeNull();
    }
    expect(q("[data-symbol-coverage]")!.textContent).toContain("month");
  });
});

describe("Market data: datasets and timeframes", () => {
  it("an unmounted dataset is disabled with the server's sentence and code; a mounted second one is chosen by select", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: V2 }} />);
    const option = document.querySelector('[data-dataset-select] option[value="fx-oanda-1m"]') as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.title).toContain("This dataset is not mounted on the approved reader.");
    const chip = q('[data-unavailable-dataset="fx-oanda-1m"]')!;
    expect(chip.getAttribute("data-reason-code")).toBe("DATASET_NOT_MOUNTED");
    expect(chip.getAttribute("title")).toBe("This dataset is not mounted on the approved reader. · DATASET_NOT_MOUNTED");
    expect(chip.getAttribute("aria-label")).toContain("DATASET_NOT_MOUNTED");
    expect((document.querySelector('[data-dataset-select] option[value="crypto-bybit-1m"]') as HTMLOptionElement).disabled).toBe(false);
  });

  it("the chosen dataset's asset class and quote currency are chips; the catalog revision is in the tooltip", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft()} extra={{ catalog: V2 }} />);
    expect(q("[data-chip=asset-class]")!.textContent).toBe("CRYPTO_DERIVATIVE");
    expect(q("[data-chip=quote-currency]")!.textContent).toBe("USDT");
    expect(q("[data-dataset-identity]")!.getAttribute("title")).toContain("catrev_8f2c1d04a9b7");
  });

  it("a timeframe the dataset cannot serve is a disabled chip with its code; the others still pick", () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ datasetId: "crypto-bybit-1m", symbol: "ETHUSDT" })} extra={{ catalog: V2 }} />);
    const chip = q('[data-timeframe-chip="4h"]') as HTMLButtonElement;
    expect(chip.getAttribute("data-chip-reason")).toBe("unavailable");
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(chip.title).toBe("dataset cannot serve it · TIMEFRAME_NOT_BUILT");
    expect(chip.getAttribute("aria-label")).toBe("4h, dataset cannot serve it · TIMEFRAME_NOT_BUILT");
    fireEvent.click(chip);
    expect(q('[data-timeframe-chip="4h"]')!.getAttribute("data-chip-state")).toBe("disabled");
  });
});

describe("Market data: server symbol search", () => {
  it("a partial list is asked of the server once, debounced, with q and the chosen timeframe; the answer is top N / total", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      calls.push(String(request));
      return json({ total: 1, next_cursor: null, items: [item("BNBUSDT")] });
    }));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    for (const text of ["B", "BN", "BNB"]) fireEvent.change(input(), { target: { value: text } });
    await waitFor(() => expect(q("[data-symbol-caption]")!.textContent).toBe("top 1 / 1"), { timeout: 2000 });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!, "http://localhost");
    expect(url.pathname).toBe("/api/v1/research/datasets/crypto-binance-1m/symbols");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "BNB", timeframe: "1h", limit: "25" });
    expect(q('[data-symbol-option="BNBUSDT"]')).not.toBeNull();
  });

  it("a symbol the catalog did not serve but the server did still gets its facts under the field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ total: 1, next_cursor: null, items: [item("BNBUSDT")] })));
    const sliced = partial();
    sliced.datasets[0]!.symbols.items = sliced.datasets[0]!.symbols.items.filter((entry) => entry.symbol !== "BNBUSDT");
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: sliced }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "BNBUSDT" } });
    await waitFor(() => expect(q('[data-symbol-option="BNBUSDT"]')).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(q('[data-symbol-option="BNBUSDT"]')!);
    expect(q("[data-instrument]")!.textContent).toContain("BNBUSDT Perpetual");
    expect(q("[data-symbol-unlisted]")).toBeNull();
  });

  it("an empty server answer for the typed symbol says it is unlisted; a partial list alone never does", async () => {
    vi.stubGlobal("fetch", vi.fn(PENDING));
    render(<Harness initial={baseDraft({ symbol: "ZZZUSDT" })} extra={{ catalog: partial() }} />);
    expect(q("[data-symbol-unlisted]")).toBeNull();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => json({ total: 0, next_cursor: null, items: [] })));
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

  it("more: follows the server's cursor and appends without duplicates", async () => {
    const calls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request), "http://localhost");
      calls.push(url);
      return url.searchParams.get("cursor")
        ? json({ total: 29, next_cursor: null, items: [item("BNBUSDT"), item("DOGEUSDT")] })
        : json({ total: 29, next_cursor: "cur_2", items: [item("BNBUSDT"), item("BTCUSDT")] });
    }));
    render(<Harness initial={baseDraft({ symbol: "" })} extra={{ catalog: partial() }} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "B" } });
    await waitFor(() => expect(q("[data-symbol-more]")).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(q("[data-symbol-more]")!);
    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 2000 });
    expect(calls[1]!.searchParams.get("cursor")).toBe("cur_2");
    await waitFor(() => expect(q("[data-symbol-more]")).toBeNull());
    expect(document.querySelectorAll('[data-symbol-option="BNBUSDT"]')).toHaveLength(1);
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
    expect(q('[data-symbol-option="BNBUSDT"]')).toBeNull();
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
    expect(q("[data-planned-folds]")!.textContent).toBe("≈ 11 folds · weekly expanding");
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
