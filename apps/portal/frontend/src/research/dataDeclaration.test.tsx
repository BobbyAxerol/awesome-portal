/**
 * S02_DATA — the data declaration on Screen 02.
 *
 * The catalog, atlas, registry and preflight documents are the canonical
 * fixtures in `packages/contracts/fixtures`. Where a case needs a catalog shape
 * the fixture does not carry (a sole available dataset, a 29-symbol list), it
 * is derived from the fixture's own dataset, never invented.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  coverageRange,
  coverageShort,
  coverageWarnings,
  foldPlan,
  groupSymbols,
  symbolAxis,
  timeframeChips,
} from "./dataDeclaration";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import { type RunDraft, planCoverage } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- fixtures */

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument; portal_admission: { profiles: never[] } }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const PROFILES = ATLAS_RESPONSE.portal_admission.profiles as Parameters<typeof foldPlan>[2];
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG = fixture<DatasetCatalog>("research-preflight.dataset-catalog.valid.json");
const PREFLIGHT = fixture<PreflightResponse>("research-preflight.response.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

const CRYPTO = CATALOG.datasets.find((item) => item.dataset_id === "crypto-binance-1m")!;
const UNAVAILABLE = CATALOG.datasets.find((item) => item.availability === "unavailable")!;
/** What the backend serves today: one available dataset (plus a listed unavailable one). */
const SOLE: DatasetCatalog = { ...CATALOG, datasets: [CRYPTO, UNAVAILABLE] };

function bound(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    timeframe: "1h",
    ...overrides,
  };
}

/** NewRun with a real draft state, so picks land in the form like they do on the route. */
function Harness(props: { initial: RunDraft; extra?: Partial<React.ComponentProps<typeof NewRun>> }) {
  const [draft, setDraft] = useState(props.initial);
  return (
    <NewRun
      draft={draft}
      patch={(change) => setDraft((previous) => ({ ...previous, ...change }))}
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
      {...props.extra}
    />
  );
}

function mount(initial: RunDraft, extra?: Partial<React.ComponentProps<typeof NewRun>>, step = "data") {
  const view = render(
    <MemoryRouter>
      <Harness initial={initial} extra={{ initialStep: step as never, ...extra }} />
    </MemoryRouter>,
  );
  return view;
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const qa = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];
const symbolInput = () => screen.getByLabelText("Symbol") as HTMLInputElement;
const optionIds = () => qa("[data-symbol-option]").map((node) => node.getAttribute("data-symbol-option"));

/* ------------------------------------------------------------------- pure */

describe("grouped symbols with served coverage", () => {
  it("groups PERPETUAL and QUARTERLY and filters by substring", () => {
    const groups = groupSymbols(CRYPTO.symbols.items, null);
    expect(groups.map((group) => [group.kind, group.items.map((item) => item.symbol)])).toEqual([
      ["PERPETUAL", ["BTCUSDT", "ETHUSDT", "SOLUSDT"]],
      ["QUARTERLY", ["BTCUSDT_210326", "BTCUSDT_260327"]],
    ]);
    expect(groupSymbols(CRYPTO.symbols.items, "210").flatMap((group) => group.items.map((item) => item.symbol))).toEqual(["BTCUSDT_210326"]);
    expect(groupSymbols(CRYPTO.symbols.items, "eth").map((group) => group.kind)).toEqual(["PERPETUAL"]);
    expect(groupSymbols(CRYPTO.symbols.items, "NOPE")).toEqual([]);
  });

  it("a symbol with no served contract kind is its own group, not a guess", () => {
    const single = CATALOG.datasets.find((item) => item.dataset_id === "fixture-single-symbol-1d")!;
    expect(groupSymbols(single.symbols.items, null).map((group) => group.kind)).toEqual(["UNCLASSIFIED"]);
  });

  it("prints the served month range and count; a quarterly bar is visibly shorter on the shared axis", () => {
    const btc = CRYPTO.symbols.items.find((item) => item.symbol === "BTCUSDT")!;
    const quarterly = CRYPTO.symbols.items.find((item) => item.symbol === "BTCUSDT_210326")!;
    expect(coverageShort(btc)).toBe("2020-01 → 2026-09 · 81 mo");
    expect(coverageShort({ ...btc, coverage: null })).toBeNull();
    const axis = symbolAxis(CRYPTO.symbols.items);
    const wide = barGeometry(btc, axis)!;
    const short = barGeometry(quarterly, axis)!;
    expect(wide.width).toBeCloseTo(100 * (81 / 81), 5);
    expect(short.width).toBeLessThan(wide.width / 10);
    expect(short.left).toBeGreaterThan(wide.left);
    expect(barGeometry({ ...btc, coverage: null }, axis)).toBeNull();
  });
});

describe("timeframe chips", () => {
  it("every dataset timeframe: declared ones enabled, the rest disabled with their reason", () => {
    const chips = timeframeChips(CRYPTO, ["1h", "4h", "2h"], "1h");
    expect(chips.map((chip) => chip.timeframe)).toEqual(["1min", "5min", "15min", "30min", "1h", "4h", "1d", "2h"]);
    const by = (tf: string) => chips.find((chip) => chip.timeframe === tf)!;
    expect(by("1h")).toMatchObject({ enabled: true, selected: true, disabledReason: null });
    expect(by("4h").enabled).toBe(true);
    expect(by("1d")).toMatchObject({ enabled: false, disabledReason: "not-declared" });
    expect(by("2h")).toMatchObject({ enabled: false, disabledReason: "not-offered" });
  });

  it("with no declaration read nothing is enabled, and the draft's own value stays visible", () => {
    const chips = timeframeChips(CRYPTO, null, "4h");
    expect(chips.every((chip) => !chip.enabled && chip.disabledReason === "declaration-not-published")).toBe(true);
    expect(chips.find((chip) => chip.timeframe === "4h")!.selected).toBe(true);
  });
});

describe("coverage against the declared windows", () => {
  const plan = planCoverage(CATALOG, "crypto-binance-1m", "BTCUSDT_210326");
  const range = coverageRange(plan);
  const windows = (is0: string, hold1: string): Pick<RunDraft, "protocol" | "windows" | "walkForward"> => ({
    protocol: "three_window_decay",
    walkForward: emptyDraft().walkForward,
    windows: {
      is: { start: is0, endExclusive: "2021-02-15T00:00" },
      oos: { start: "2021-02-15T00:00", endExclusive: "2021-03-01T00:00" },
      holdout: { start: "2021-03-01T00:00", endExclusive: hold1 },
    },
  });

  it("a bound before the first served month or after the last warns, naming the side", () => {
    expect(range).not.toBeNull();
    const warnings = coverageWarnings(windows("2021-01-01T00:00", "2021-05-01T00:00"), range);
    expect(warnings.map((warning) => [warning.bound, warning.side])).toEqual([
      ["IS start", "before"],
      ["Holdout end", "after"],
    ]);
  });

  it("bounds inside the served months, an unread coverage and an empty draft warn about nothing", () => {
    expect(coverageWarnings(windows("2021-02-01T00:00", "2021-04-01T00:00"), range)).toEqual([]);
    expect(coverageWarnings(windows("2021-01-01T00:00", "2021-05-01T00:00"), null)).toEqual([]);
    expect(coverageWarnings(windows("", ""), range)).toEqual([]);
  });
});

describe("fold plan is served or absent", () => {
  const advanced = { protocol: "advanced" as const, executionRoute: "signal_notional" as const, optimizationMode: "mode_1_decay", optimizationSchedule: "global" };
  it("a preflight's outer fold count is the server plan", () => {
    expect(foldPlan(advanced, 14, PROFILES)).toEqual({ kind: "server-plan", count: 14, source: "preflight" });
  });
  it("before a preflight, the admitted profile's served fold bounds are a range, never a count", () => {
    expect(foldPlan(advanced, null, PROFILES)).toMatchObject({ kind: "profile-bounds", min: 2, max: 16 });
  });
  it("otherwise a typed absence with its reason, and never a number", () => {
    expect(foldPlan(advanced, null, null)).toMatchObject({ kind: "absent", reason: "server profiles not read" });
    expect(foldPlan({ ...advanced, optimizationMode: "" }, null, PROFILES)).toMatchObject({ kind: "absent", reason: "pick a mode and schedule" });
    expect(foldPlan({ ...advanced, optimizationSchedule: "per_fold_causal" }, null, PROFILES)).toMatchObject({ kind: "absent", reason: "no admitted profile publishes it" });
    /* The fixed qualification profile publishes no fold bounds. */
    expect(foldPlan({ ...advanced, protocol: "three_window_decay" }, null, PROFILES)).toMatchObject({ kind: "absent", reason: "profile publishes no fold bounds" });
  });
});

/* -------------------------------------------------------------- the screen */

describe("dataset identity", () => {
  it("one available dataset: a compact identity row with chips, scopes in the tooltip, unavailable ones disabled with their served reason", () => {
    mount(bound(), { catalog: SOLE });
    expect(q("[data-dataset-select]")).toBeNull();
    const row = screen.getByLabelText("Dataset");
    expect(row.getAttribute("data-dataset-identity")).toBe("crypto-binance-1m");
    expect(within(row).getByText("BINANCE")).toBeTruthy();
    expect(within(row).getByText("CRYPTO_24_7")).toBeTruthy();
    expect(within(row).getByText("UTC")).toBeTruthy();
    expect(within(row).getByText("historical_market_data")).toBeTruthy();
    expect(row.getAttribute("title")).toBe(
      `Usage: backtest, research. Excluded: ${CRYPTO.excluded_scopes.join(", ")}. Listed by the catalog; preflight decides whether a run is admitted.`,
    );
    const off = q(`[data-unavailable-dataset="${UNAVAILABLE.dataset_id}"]`)!;
    expect(off.getAttribute("title")).toBe(UNAVAILABLE.unavailable_reason);
    expect(off.getAttribute("aria-label")).toContain(UNAVAILABLE.unavailable_reason!);
    expect(off.textContent).not.toContain(UNAVAILABLE.unavailable_reason!);
  });

  it("an unchosen sole dataset is one click to use, and the click prefills the coverage", () => {
    mount(bound({ symbol: "BTCUSDT" }), { catalog: SOLE });
    expect(q("[data-dataset-chosen]")!.getAttribute("data-dataset-chosen")).toBe("false");
    fireEvent.click(q('[data-action="use-dataset"]')!);
    expect(q("[data-dataset-chosen]")!.getAttribute("data-dataset-chosen")).toBe("true");
    expect(q("[data-window-prefill-status]")!.textContent).toBe("Bounds prefilled from coverage");
  });

  it("several datasets: a select, with an unavailable one disabled and carrying its reason", () => {
    mount(bound({ datasetId: "crypto-binance-1m" }), { catalog: CATALOG });
    const select = screen.getByLabelText("Dataset") as HTMLSelectElement;
    const off = [...select.options].find((option) => option.value === UNAVAILABLE.dataset_id)!;
    expect(off.disabled).toBe(true);
    expect(off.getAttribute("title")).toBe(UNAVAILABLE.unavailable_reason);
  });
});

describe("symbol picker", () => {
  const open = () => {
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "" }), { catalog: SOLE });
    fireEvent.focus(symbolInput());
  };

  it("opens on focus with every published symbol, grouped, each with its served coverage and a bar", () => {
    open();
    expect(symbolInput().getAttribute("role")).toBe("combobox");
    expect(symbolInput().getAttribute("aria-expanded")).toBe("true");
    expect(optionIds()).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BTCUSDT_210326", "BTCUSDT_260327"]);
    expect(qa("[data-symbol-group]").map((group) => group.getAttribute("data-symbol-group"))).toEqual(["PERPETUAL", "QUARTERLY"]);
    expect(q('[data-symbol-option="BTCUSDT_210326"] [data-option-coverage]')!.textContent).toBe("2021-02 → 2021-03 · 2 mo");
    expect(q('[data-symbol-option="BTCUSDT"] [data-option-coverage]')!.textContent).toBe("2020-01 → 2026-09 · 81 mo");
    expect(qa("[data-coverage-bar]")).toHaveLength(5);
  });

  it("typing filters; the active option follows ArrowDown and Enter picks it, closing the list", () => {
    open();
    fireEvent.change(symbolInput(), { target: { value: "btcusdt" } });
    expect(symbolInput().value).toBe("BTCUSDT");
    expect(optionIds()).toEqual(["BTCUSDT", "BTCUSDT_210326", "BTCUSDT_260327"]);
    fireEvent.keyDown(symbolInput(), { key: "ArrowDown" });
    fireEvent.keyDown(symbolInput(), { key: "ArrowDown" });
    expect(symbolInput().getAttribute("aria-activedescendant")).toBe(q('[data-symbol-option="BTCUSDT_260327"]')!.id);
    fireEvent.keyDown(symbolInput(), { key: "ArrowUp" });
    fireEvent.keyDown(symbolInput(), { key: "Enter" });
    expect(symbolInput().value).toBe("BTCUSDT_210326");
    expect(q("[data-symbol-listbox]")).toBeNull();
    expect(q("[data-symbol-coverage]")!.textContent).toBe("quarterly · 2021-02 → 2021-03 · 2 months");
  });

  it("a click picks, and Escape closes without changing the value", () => {
    open();
    fireEvent.click(q('[data-symbol-option="ETHUSDT"]')!);
    expect(symbolInput().value).toBe("ETHUSDT");
    fireEvent.focus(symbolInput());
    fireEvent.keyDown(symbolInput(), { key: "Escape" });
    expect(q("[data-symbol-listbox]")).toBeNull();
    expect(symbolInput().value).toBe("ETHUSDT");
  });

  it("a typed symbol that is not listed stays the typed unlisted state, never accepted as listed", () => {
    open();
    fireEvent.change(symbolInput(), { target: { value: "DOGEUSDT" } });
    expect(q("[data-symbol-no-match]")).not.toBeNull();
    expect(q("[data-symbol-unlisted]")!.textContent).toContain("DOGEUSDT is not in this dataset");
    expect(q("[data-symbol-coverage]")).toBeNull();
  });

  it("a truncated list says how many of the served total are shown", () => {
    const truncated: DatasetCatalog = {
      ...SOLE,
      datasets: [{ ...CRYPTO, symbols: { ...CRYPTO.symbols, truncated: true, total: 29 } }, UNAVAILABLE],
    };
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "" }), { catalog: truncated });
    fireEvent.focus(symbolInput());
    expect(q("[data-symbol-truncated]")!.textContent).toContain("5 of 29 shown");
  });

  it("a dataset that publishes no symbol list is a plain field with the server's reason", () => {
    const none = CATALOG.datasets.find((item) => item.symbols.state === "NOT_PUBLISHED" && item.availability === "available")!;
    mount(bound({ datasetId: none.dataset_id, symbol: "BTCUSDT" }), { catalog: CATALOG });
    expect(symbolInput().getAttribute("role")).toBeNull();
    expect(screen.getByText(none.symbols.reason!)).toBeTruthy();
  });
});

describe("timeframe chips on the screen", () => {
  const chip = (tf: string) => q(`[data-timeframe-chip="${tf}"]`)!;

  it("shows every dataset timeframe; the version-declared one is enabled, the others say why not", () => {
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "BTCUSDT" }), { catalog: SOLE });
    expect(qa("[data-timeframe-chip]").map((node) => node.getAttribute("data-timeframe-chip"))).toEqual(["1min", "5min", "15min", "30min", "1h", "4h", "1d"]);
    expect(chip("1h").getAttribute("aria-checked")).toBe("true");
    expect(chip("1h").getAttribute("aria-disabled")).toBe("false");
    expect(chip("4h").getAttribute("aria-disabled")).toBe("true");
    expect(chip("4h").getAttribute("title")).toBe(`not declared by ${ALPHA.version_label}`);
    expect(chip("4h").getAttribute("aria-label")).toBe(`4h, not declared by ${ALPHA.version_label}`);
  });

  it("the catalog and the version spell the day alike (1d), so the daily chip is selectable (BR-F4-01 closed)", () => {
    const daily = { ...LIMITS, declaredTimeframes: ["1h", "4h", "1d"] as const };
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "BTCUSDT" }), { catalog: SOLE, limits: daily });
    expect(chip("1d").getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(chip("1d"));
    expect(chip("1d").getAttribute("aria-checked")).toBe("true");
  });

  it("a version timeframe the dataset does not offer is shown disabled, 'not offered by dataset'", () => {
    const odd = { ...LIMITS, declaredTimeframes: ["1h", "2h"] as const };
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "BTCUSDT" }), { catalog: SOLE, limits: odd });
    expect(chip("2h").getAttribute("data-chip-reason")).toBe("not-offered");
    expect(chip("2h").getAttribute("title")).toBe("not offered by dataset");
  });

  it("picking an enabled chip selects it; a disabled chip changes nothing", () => {
    const two = { ...LIMITS, declaredTimeframes: ["1h", "4h"] as const };
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "BTCUSDT" }), { catalog: SOLE, limits: two });
    fireEvent.click(chip("1d"));
    expect(chip("1h").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(chip("4h"));
    expect(chip("4h").getAttribute("aria-checked")).toBe("true");
    expect(chip("1h").getAttribute("aria-checked")).toBe("false");
  });
});

describe("coverage on the window timeline", () => {
  const threeWindows = (is0: string, hold1: string): Partial<RunDraft> => ({
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT_210326",
    windows: {
      is: { start: is0, endExclusive: "2021-02-15T00:00" },
      oos: { start: "2021-02-15T00:00", endExclusive: "2021-03-01T00:00" },
      holdout: { start: "2021-03-01T00:00", endExclusive: hold1 },
    },
  });

  it("draws the served coverage as the first row on the same axis and warns about a bound outside it, with the served months", () => {
    mount(bound(threeWindows("2021-01-01T00:00", "2021-05-01T00:00")), { catalog: SOLE });
    const rail = q("[data-review-rail]")!;
    expect(within(rail).getByText("BTCUSDT_210326 2021-02 → 2021-03")).toBeTruthy();
    expect(qa("[data-window-timeline] [data-timeline-row]")[0]!.getAttribute("data-timeline-row")).toBe("coverage");
    const warning = rail.querySelector('[data-coverage-warning="IS start"]')!;
    expect(warning.textContent).toContain("IS start 2021-01-01T00:00 is before served coverage");
    expect(warning.textContent).toContain("2021-02 → 2021-03");
    expect(rail.querySelector('[data-coverage-warning="Holdout end"]')!.getAttribute("data-warning-side")).toBe("after");
    /* The IS bar starts left of the coverage bar: one axis for both. */
    const left = (key: string) => parseFloat((q(`[data-timeline-segment="${key}"]`) as HTMLElement).style.left);
    expect(left("is")).toBe(0);
    expect(left("coverage")).toBeGreaterThan(0);
  });

  it("no warning when every bound is inside the served months; no coverage row without a catalog", () => {
    mount(bound(threeWindows("2021-02-01T00:00", "2021-04-01T00:00")), { catalog: SOLE });
    expect(q("[data-coverage-warnings]")).toBeNull();
    expect(q('[data-timeline-row="coverage"]')).not.toBeNull();
    cleanup();
    mount(bound(threeWindows("2021-01-01T00:00", "2021-05-01T00:00")), { catalog: null });
    expect(q('[data-timeline-row="coverage"]')).toBeNull();
    expect(q("[data-coverage-warnings]")).toBeNull();
  });

  it("shows what a window timeline without coverage always showed: windows alone, unchanged geometry", () => {
    mount(bound(threeWindows("2021-01-01T00:00", "2021-05-01T00:00")), { catalog: null });
    expect(parseFloat((q('[data-timeline-segment="is"]') as HTMLElement).style.left)).toBe(0);
  });
});

describe("fold plan on the rail", () => {
  const advanced = (): RunDraft => bound({
    protocol: "advanced",
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
  });

  it("a served preflight count reads '≈ N outer folds · server plan'", () => {
    mount(advanced(), { preflight: { ...PREFLIGHT, resource_estimate: { ...PREFLIGHT.resource_estimate, outer_fold_count: 9 } }, portalAdmission: PROFILES });
    expect(q("[data-fold-plan]")!.getAttribute("data-fold-plan")).toBe("server-plan");
    expect(q("[data-fold-plan]")!.textContent).toBe("≈ 9 outer folds · server plan · preflight");
  });

  it("before a preflight the admitted profile's served bounds show as a range", () => {
    mount(advanced(), { portalAdmission: PROFILES });
    expect(q("[data-fold-plan]")!.getAttribute("data-fold-plan")).toBe("profile-bounds");
    expect(q("[data-fold-plan]")!.textContent).toContain("folds 2–16");
    expect(q("[data-fold-plan]")!.textContent).not.toContain("≈");
  });

  it("with nothing served it is a typed absence, not a number", () => {
    mount(advanced(), { portalAdmission: null });
    expect(q("[data-fold-plan]")!.getAttribute("data-fold-plan")).toBe("absent");
    expect(q("[data-fold-plan]")!.textContent).toContain("outer folds — not published");
    expect(q("[data-fold-plan]")!.textContent).not.toMatch(/\d/);
  });
});

describe("the review rail declares nothing it was not given", () => {
  /* The row's value cell (its last child), without the label. */
  const row = (label: string) => q(`[data-review-row="${label}"]`)!.lastElementChild as HTMLElement;

  it("a fresh form: parameter_space and trials · stop · seed show no digit, only 'not declared'", () => {
    mount({ ...emptyDraft(), optunaTrials: "1" }, { declarationBound: false });
    expect(row("parameter_space").textContent).not.toMatch(/\d/);
    expect(row("parameter_space").textContent).toContain("no version chosen");
    /* Even the release's autofilled trial count stays out until a version is chosen. */
    expect(row("trials · stop · seed").textContent).not.toMatch(/\d/);
    expect(qa('[data-review-row="trials · stop · seed"] [data-not-declared]')).toHaveLength(3);
  });

  it("with a version and its values, the real numbers appear, including a real 0 the version published", () => {
    mount(bound({ optunaTrials: "400", earlyStopping: "20", randomSeed: "42" }), { declarationBound: true });
    expect(row("trials · stop · seed").textContent).toBe("400 · 20 · 42");
    expect(row("parameter_space").textContent).toContain("0 entries · 0 swept · 0 pinned");
  });

  it("a value the step has not supplied says so on its own, not as a default", () => {
    mount(bound({ optunaTrials: "400", earlyStopping: "", randomSeed: "" }), { declarationBound: true });
    expect(row("trials · stop · seed").textContent).toBe("400 · not set · not set");
    expect(row("trials · stop · seed").textContent).not.toMatch(/none/);
  });

  it("a scratch run is its own declaration", () => {
    mount({ ...emptyDraft(), bound: false, strategyId: "s", optunaTrials: "400", randomSeed: "42" }, { declarationBound: false });
    expect(row("trials · stop · seed").textContent).toBe("400 · not set · 42");
  });
});

describe("route step", () => {
  it("admitted routes are cards; the rest sit under one line with the served reason as a tooltip, not inline", () => {
    mount(bound(), { limits: LIMITS }, "route");
    const blockedIds = Object.keys(LIMITS.blockedRoutes);
    expect(blockedIds.length).toBeGreaterThan(0);
    const grid = q("[data-route-grid]")!;
    expect(grid.querySelectorAll("[data-route-card]")).toHaveLength(ATLAS.routes.length - blockedIds.length);
    expect(grid.querySelector("[data-route-blocked]")).toBeNull();
    const summary = q("[data-routes-not-admitted-summary]")!;
    expect(summary.textContent).toBe(`${blockedIds.length} routes not admitted`);
    const folded = q("[data-routes-not-admitted]")!;
    for (const id of blockedIds) {
      const card = folded.querySelector(`[data-route-card="${id}"]`) as HTMLButtonElement;
      expect(card.disabled).toBe(true);
      expect(card.getAttribute("title")).toBe(LIMITS.blockedRoutes[id]);
      expect(card.textContent).not.toContain(LIMITS.blockedRoutes[id]!.slice(0, 20));
    }
    expect(q("[data-step-card] header")!.textContent).toContain(`${ATLAS.routes.length - blockedIds.length} of ${ATLAS.routes.length} routes admitted`);
  });

  it("selecting an admitted card sets the route; nothing is folded when every route is admitted", () => {
    mount(bound(), { limits: { ...LIMITS, blockedRoutes: {} } }, "route");
    expect(q("[data-routes-not-admitted]")).toBeNull();
    const target = qa("[data-route-card]").find((card) => card.getAttribute("data-selected") === "false")!;
    fireEvent.click(target);
    expect(q(`[data-route-card="${target.getAttribute("data-route-card")}"]`)!.getAttribute("data-selected")).toBe("true");
  });
});

describe("less text on the data step", () => {
  it("the old paragraph, dataset facts line and coverage rule sentence are gone; the facts are tooltips and chips", () => {
    mount(bound({ datasetId: "crypto-binance-1m", symbol: "BTCUSDT" }), { catalog: SOLE });
    const card = q('[data-step-card="Market data"]')!;
    expect(card.textContent).not.toContain("are checked in this form");
    expect(card.textContent).not.toContain(SOLE.coverage_rule);
    expect(card.textContent).not.toContain("Version timeframes not published");
    expect(card.querySelector(`[title="${SOLE.coverage_rule}"]`)).not.toBeNull();
    const warmup = q('[data-declaration-fact="warmup bars"]')!;
    expect(warmup.textContent).toContain("32");
    expect(warmup.getAttribute("title")).toContain("before the analysis start");
    expect(q('[data-declaration-fact="required columns"]')).not.toBeNull();
  });
});

/* ------------------------------------------------------ the real route */

describe("the route preselects the only available dataset", () => {
  function serve(catalog: DatasetCatalog) {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets/catalog-v2") return json({ error: { code: "NOT_FOUND", message: "not found" } }, 404);
      if (method === "GET" && url.pathname === "/api/v1/research/datasets") return json(catalog);
      throw new Error(`unexpected request ${method} ${url.pathname}`);
    }));
  }
  async function route(catalog: DatasetCatalog) {
    serve(catalog);
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new?step=data&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(q('[data-review-row="alpha binding"]')!.textContent).toContain(ALPHA.version_label));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  it("one available dataset is chosen without a click; two are not", async () => {
    await route(SOLE);
    expect(q("[data-dataset-identity]")!.getAttribute("data-dataset-chosen")).toBe("true");
    cleanup();
    await route(CATALOG);
    expect((screen.getByLabelText("Dataset") as HTMLSelectElement).value).toBe("");
  });

  it("lists the symbols of the preselected dataset at once", async () => {
    await route(SOLE);
    fireEvent.focus(symbolInput());
    expect(optionIds()).toHaveLength(5);
  });
});
