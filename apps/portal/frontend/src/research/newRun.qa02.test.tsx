/**
 * QA 2026-10-02 · Screen 02 New Run (group S02) — the fixes after the browser walk.
 *
 * Every block fails without its change and states the value path AND the typed
 * absence path where the fix reads a served fact. Atlas, registry, catalog and
 * preflight bodies are the canonical fixtures from `packages/contracts/fixtures`
 * (read at run time with `readFileSync`, never imported); where a block needs a
 * different shape it is the canonical document with the one field changed.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { normalizeCatalog, profileTimeframes, readProfiles, timeframeChips } from "./dataDeclaration";
import { NewRun, instantText, stepCaption, timelineRows } from "./NewRun";
import { constraintsFrom, emptyDraft } from "./NewRunRoute";
import {
  type RunDraft,
  blockingProblems,
  earlyStoppingInvalid,
  parameterStatus,
  parameterEntriesFrom,
  randomSeedInvalid,
  validateOptimization,
} from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument; portal_admission: { profiles: Record<string, unknown>[] } }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const PROFILES_RAW = ATLAS_RESPONSE.portal_admission.profiles;
const PROFILES = readProfiles(PROFILES_RAW)!;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG_V2 = normalizeCatalog(fixture<unknown>("research-dataset-catalog.v2.healthy.valid.json"));
const ALPHA = REGISTRY.entries[0]!;
const RUNNABLE: readonly RegistryEntry[] = REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, run_admission: { may_create_run: true, code: null } } : entry));
const BLOCKED: readonly RegistryEntry[] = REGISTRY.entries.map((entry, index) =>
  index === 0 ? { ...entry, run_admission: { may_create_run: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" as const } } : entry,
);
const NO_ADMISSION: readonly RegistryEntry[] = REGISTRY.entries.map((entry, index) => {
  if (index !== 0) return entry;
  const { run_admission: _drop, ...rest } = entry;
  return rest as RegistryEntry;
});
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const LIMITS_3TF = { ...LIMITS, declaredTimeframes: ["1h", "4h", "1d"] as const };
const OK = researchState({ kind: "ok", rowCount: 1 });

function draft(overrides: Partial<RunDraft> = {}): RunDraft {
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
    optunaTrials: "1",
    randomSeed: "42",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

/** The screen reads one thing on its own (the P22 lookup for a bound version); it never answers here. */
const PENDING = () => new Promise<Response>(() => undefined);

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  vi.stubGlobal("fetch", vi.fn(PENDING));
  const patch = vi.fn();
  const onRunPreflight = vi.fn();
  const view = render(
    <MemoryRouter>
      <NewRun
        draft={draft()}
        patch={patch}
        limits={LIMITS}
        atlas={ATLAS}
        atlasState={OK}
        registry={RUNNABLE}
        preflight={null}
        preflightState={researchState({ kind: "ok", rowCount: 0 })}
        onRunPreflight={onRunPreflight}
        mayCreateRun={false}
        canSubmit={false}
        created={null}
        createState={researchState({ kind: "ok", rowCount: 0 })}
        outcomeUnknown={false}
        onSubmit={vi.fn()}
        onRecheck={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { ...view, patch, onRunPreflight };
}

const go = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
const pill = (step: string) => document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement;
const caption = (step: string) => pill(step).querySelector("[data-step-caption]")?.textContent ?? null;
const q = (selector: string) => document.querySelector(selector);
const qa = (selector: string) => [...document.querySelectorAll(selector)];
const chip = (tf: string) => q(`[data-timeframe-chip="${tf}"]`) as HTMLElement | null;

/* ------------------------------------------------ U02 · N11 · N17 · timeframe vs profile */

describe("U02 — the timeframe chips follow the admitted profile's timeframe", () => {
  const fit = { protocol: "three_window_decay", executionRoute: "signal_notional", optimizationMode: "" };

  it("reads `portal_admission.profiles[].timeframe`; the profiles that fit the declaration decide", () => {
    expect(PROFILES.map((profile) => profile.timeframe)).toEqual(["1h", "1h"]);
    expect(profileTimeframes(PROFILES, fit)).toEqual({ timeframes: ["1h"], profileIds: ["p04.fixed-qualification.v1"] });
    expect(profileTimeframes(PROFILES, { ...fit, protocol: "advanced" })).toEqual({ timeframes: ["1h"], profileIds: ["p10.delta-signal-notional-wfo.v1"] });
  });

  it("typed absence: nothing served, nothing matching, or a profile with no timeframe restricts nothing", () => {
    expect(profileTimeframes(null, fit)).toBeNull();
    /* No admitted profile exists for mode_2: the browser does not invent a restriction for it. */
    expect(profileTimeframes(PROFILES, { ...fit, optimizationMode: "mode_2_sbb" })).toBeNull();
    const silent = readProfiles(PROFILES_RAW.map((row) => ({ ...row, timeframe: null })))!;
    expect(silent.map((profile) => profile.timeframe)).toEqual([null, null]);
    expect(profileTimeframes(silent, fit)).toBeNull();
    const disabled = readProfiles(PROFILES_RAW.map((row) => ({ ...row, state: "DISABLED" })))!;
    expect(profileTimeframes(disabled, fit)).toBeNull();
  });

  it("a chip outside the profile is disabled with `no-profile` and names the profile that pins the timeframe", () => {
    const chips = timeframeChips(CATALOG_V2.datasets[0]!, ["1h", "4h", "1d"], "1h", false, profileTimeframes(PROFILES, fit));
    const by = (tf: string) => chips.find((entry) => entry.timeframe === tf)!;
    expect(by("1h")).toMatchObject({ enabled: true, disabledReason: null, detail: null });
    expect(by("4h")).toMatchObject({ enabled: false, disabledReason: "no-profile", detail: "p04.fixed-qualification.v1 pins 1h" });
    expect(by("1d")).toMatchObject({ enabled: false, disabledReason: "no-profile" });
    /* An older reason wins: not declared by the version is not re-labelled as a profile problem. */
    const narrow = timeframeChips(CATALOG_V2.datasets[0]!, ["1h"], "1h", false, profileTimeframes(PROFILES, fit));
    expect(narrow.find((entry) => entry.timeframe === "4h")!.disabledReason).toBe("not-declared");
    /* Without a fit nothing changes. */
    expect(timeframeChips(CATALOG_V2.datasets[0]!, ["1h", "4h", "1d"], "1h", false, null).find((entry) => entry.timeframe === "4h")!.enabled).toBe(true);
  });

  it("on the screen: 4h and 1d are disabled, the reason is visible text, and a click changes nothing", () => {
    const { patch } = mount({ draft: draft({ timeframe: "1h" }), limits: LIMITS_3TF, catalog: CATALOG_V2, portalAdmission: PROFILES_RAW as never });
    go("data");
    expect(chip("1h")!.getAttribute("aria-disabled")).toBe("false");
    for (const tf of ["4h", "1d"]) {
      expect(chip(tf)!.getAttribute("aria-disabled")).toBe("true");
      expect(chip(tf)!.getAttribute("data-chip-reason")).toBe("no-profile");
    }
    const reason = [...qa("[data-timeframe-reason]")].find((node) => node.getAttribute("data-timeframe-reason") === "4h,1d")!;
    expect(reason.textContent).toBe("4h · 1d — no admitted profile covers it · p04.fixed-qualification.v1 pins 1h");
    patch.mockClear();
    fireEvent.click(chip("4h")!);
    expect(patch).not.toHaveBeenCalled();
  });

  it("the not-declared timeframes also say why on screen, not only in a tooltip (R38)", () => {
    mount({ draft: draft({ timeframe: "1h" }), limits: LIMITS, catalog: CATALOG_V2 });
    go("data");
    const line = qa("[data-timeframe-reason]").find((node) => node.getAttribute("data-timeframe-reason")!.includes("1min"))!;
    expect(line.textContent).toMatch(/^1min · 5min · 15min · 30min · 4h · 1d — not declared by /);
  });

  it("typed absence on the screen: profiles served without a timeframe leave 4h and 1d choosable", () => {
    const silent = PROFILES_RAW.map((row) => ({ ...row, timeframe: null }));
    mount({ draft: draft({ timeframe: "1h" }), limits: LIMITS_3TF, catalog: CATALOG_V2, portalAdmission: silent as never });
    go("data");
    expect(chip("4h")!.getAttribute("aria-disabled")).toBe("false");
    expect(qa("[data-timeframe-reason]").map((node) => node.textContent).join("|")).not.toContain("no admitted profile");
    expect(chip("4h")!.getAttribute("data-chip-reason")).toBeNull();
  });
});

/* ------------------------------------------------------------ U03 · N12 · run admission */

describe("U03 — a version that cannot create runs says so on Context", () => {
  it("value path: the served code becomes one line, the code is the tooltip, and the step caption follows", () => {
    mount({ registry: BLOCKED });
    const line = q('[data-run-admission="refused"]') as HTMLElement;
    expect(line.textContent).toBe("runscannot create runs — no executor is installed for this version");
    expect(line.getAttribute("title")).toBe("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE");
    go("route");
    expect(caption("context")).toBe("cannot create runs");
    expect(pill("context").getAttribute("data-step-state")).toBe("incomplete");
  });

  it("an admitted version shows nothing and reads valid", () => {
    mount({ registry: RUNNABLE });
    expect(q("[data-run-admission]")).toBeNull();
    go("route");
    expect(caption("context")).toBe("valid");
  });

  it("typed absence: a registry row that carries no run_admission claims nothing either way", () => {
    mount({ registry: NO_ADMISSION });
    expect(q("[data-run-admission]")).toBeNull();
    go("route");
    expect(caption("context")).toBe("valid");
  });

  it("a code this client has no sentence for still refuses, in neutral words", () => {
    const odd = REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, run_admission: { may_create_run: false, code: null } } : entry));
    mount({ registry: odd });
    expect(q('[data-run-admission="refused"]')!.textContent).toContain("cannot create runs — run admission refused");
  });

  it("the alpha list marks an alpha none of whose versions can run (U22)", () => {
    mount({ registry: BLOCKED });
    const select = screen.getByLabelText("Alpha") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toContain(`${ALPHA.display_name ?? ALPHA.alpha_id} · cannot create runs`);
    cleanup();
    mount({ registry: RUNNABLE });
    const ok = screen.getByLabelText("Alpha") as HTMLSelectElement;
    expect([...ok.options].map((option) => option.textContent).join("|")).not.toContain("cannot create runs");
  });

  it("stepCaption: blocked reads 'cannot create runs' but never hides 'no version chosen'", () => {
    const base = { step: "context" as const, current: false, hasError: false, visited: true, reviewCaption: "preflight pending" };
    expect(stepCaption({ ...base, contextChosen: true, contextBlocked: true })).toEqual({ state: "incomplete", caption: "cannot create runs" });
    expect(stepCaption({ ...base, contextChosen: false, contextBlocked: true }).caption).toBe("no version chosen");
    expect(stepCaption({ ...base, contextChosen: true }).caption).toBe("valid");
  });
});

/* --------------------------------------------------------------- U04 · in-flight preflight */

describe("U04 — Run preflight locks while the request is in flight", () => {
  const windows = {
    is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" },
    oos: { start: "2026-03-01T00:00", endExclusive: "2026-04-01T00:00" },
    holdout: { start: "2026-04-01T00:00", endExclusive: "2026-05-01T00:00" },
  };
  const ready = () => mount({ draft: draft({ randomSeed: "42", windows }) });
  const button = () => q('[data-action="preflight"]') as HTMLButtonElement;

  it("idle: enabled, labelled, one click sends one request", () => {
    const { onRunPreflight } = ready();
    go("review");
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe("Run preflight");
    expect(button().getAttribute("aria-busy")).toBeNull();
    fireEvent.click(button());
    expect(onRunPreflight).toHaveBeenCalledTimes(1);
  });

  it("in flight: disabled, busy, says so, and a second click sends nothing", () => {
    const { onRunPreflight } = mount({ draft: draft({ randomSeed: "42", windows }), preflightPending: true });
    go("review");
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().textContent).toBe("Running preflight…");
    expect(q("[data-preflight-running]")).not.toBeNull();
    fireEvent.click(button());
    fireEvent.click(button());
    expect(onRunPreflight).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------- U05 · validation */

describe("U05 — early stopping and the seed are validated, not silently dropped", () => {
  const limits = { ...LIMITS, seedRequired: false };

  it("early stopping: empty is fine; a whole number of at least 1 is fine; the rest is refused", () => {
    expect(["", "  ", "1", "20"].map(earlyStoppingInvalid)).toEqual([false, false, false, false]);
    expect(["abc", "0", "-3", "2.5", "1e"].map(earlyStoppingInvalid)).toEqual([true, true, true, true, true]);
  });

  it("seed: empty or an integer is fine; text and fractions are refused", () => {
    expect(["", "42", "0", "-7"].map(randomSeedInvalid)).toEqual([false, false, false, false]);
    expect(["abc", "4.2"].map(randomSeedInvalid)).toEqual([true, true]);
  });

  it("the optimization validator names each, after the trial rules", () => {
    expect(validateOptimization(draft({ earlyStopping: "abc" }), limits)).toBe("Early stopping must be a whole number of at least 1.");
    expect(validateOptimization(draft({ randomSeed: "x1" }), limits)).toBe("Random seed must be a whole number.");
    expect(validateOptimization(draft({ earlyStopping: "20" }), limits)).toBeNull();
    expect(validateOptimization(draft({ optunaTrials: "0", earlyStopping: "abc" }), limits)).toBe("Trials must be a whole number of at least 1.");
    /* It blocks preflight: the serializer would have sent `early_stopping: null`. */
    expect(blockingProblems(draft({ earlyStopping: "abc" }), limits).map((problem) => problem.step)).toContain("optimization");
  });

  it("on the screen: the field is marked invalid, the step reads needs attention, and the message is printed once", () => {
    mount({ draft: draft({ earlyStopping: "abc" }), limits });
    go("optimization");
    const input = screen.getByLabelText("Early stopping") as HTMLInputElement;
    /* The reader types (the draft prop is controlled and stays "abc"): that is what engages the step. */
    fireEvent.change(input, { target: { value: "abcd" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(qa("[data-step-error]").map((node) => node.textContent)).toEqual(["Early stopping must be a whole number of at least 1."]);
    expect(pill("optimization").getAttribute("data-step-state")).toBe("error");
    expect(q("[data-review-rail] [data-blocking]")).toBeNull();
  });

  it("a valid value shows no error", () => {
    mount({ draft: draft({ earlyStopping: "20" }), limits });
    go("optimization");
    fireEvent.change(screen.getByLabelText("Early stopping"), { target: { value: "20" } });
    expect(q("[data-step-error]")).toBeNull();
    expect((screen.getByLabelText("Early stopping") as HTMLInputElement).getAttribute("aria-invalid")).toBeNull();
  });
});

/* ------------------------------------------------------------ U06 · dark theme error fill */

describe("U06 — an error box takes the theme's own error fill", () => {
  it("--bad-bg-soft has no Operations value (it fell back to the light value); --bad-bg has one in both themes", () => {
    mount({ draft: draft({ windows: { is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" }, oos: { start: "2026-02-01T00:00", endExclusive: "2026-04-01T00:00" }, holdout: { start: "2026-04-01T00:00", endExclusive: "2026-05-01T00:00" } } }) });
    go("windows");
    go("route");
    go("windows");
    const error = q("[data-step-error]") as HTMLElement;
    expect(error.textContent).toBe("OOS must begin exactly where IS ends.");
    expect(error.style.background).toBe("var(--bad-bg)");
    expect(error.outerHTML).not.toContain("bad-bg-soft");
    const tokens = readFileSync(join(__dirname, "..", "styles", "tokens.css"), "utf8");
    const operations = tokens.slice(tokens.indexOf(':root[data-theme="operations"]'));
    expect(operations).toContain("--bad-bg:");
    expect(operations.slice(0, operations.indexOf("}"))).not.toContain("--bad-bg-soft");
  });
});

/* ------------------------------------------------------------------ U07 · schedule source */

describe("U07 — the forecast says whether the schedule is the mode's default", () => {
  const mode = ATLAS.modes.find((item) => item.mode_id === "mode_1_decay")!;
  const other = mode.valid_schedules.find((schedule) => schedule !== mode.default_schedule)!;
  const source = () => qa("[data-claim-forecast] span").find((node) => node.textContent === "source")!.nextElementSibling!.textContent;

  it("the default reads 'mode default'; a schedule the reader moved to reads 'chosen'", () => {
    mount({ draft: draft({ optimizationSchedule: mode.default_schedule }) });
    expect(source()).toBe("mode default");
    cleanup();
    mount({ draft: draft({ optimizationSchedule: other }) });
    expect(source()).toBe("chosen");
  });
});

/* ----------------------------------------------------------------- U08 · not-admitted routes */

describe("U08 — a not-admitted route keeps its reason on screen", () => {
  const limits = { ...LIMITS, blockedRoutes: { options: "options is deferred.", orders: "orders: not admitted in P04." } };

  it("focus and hover show the reason of that route, once; the chips carry no raw status word", () => {
    mount({ limits });
    go("route");
    const orders = q('[data-route-blocked][data-route-card="orders"]') as HTMLElement;
    expect(orders.textContent).toBe("orders");
    fireEvent.focus(orders);
    expect(q('[data-route-blocked-reason="orders"]')!.textContent).toBe("orders — orders: not admitted in P04.");
    fireEvent.mouseEnter(q('[data-route-blocked][data-route-card="options"]')!);
    expect(qa("[data-route-blocked-reason]").map((node) => node.getAttribute("data-route-blocked-reason"))).toEqual(["options"]);
    expect(q("[data-routes-not-admitted]")!.textContent).not.toMatch(/DEFERRED|LEGACY|SUPPORTED|\d\/\d/);
  });

  it("nothing is printed until the reader points at a chip", () => {
    mount({ limits });
    go("route");
    expect(q("[data-route-blocked-reason]")).toBeNull();
  });
});

/* ------------------------------------------------------------------ U09 · scratch */

describe("U09 — scratch keeps no ignored ids and names itself in words", () => {
  const scratch = () => draft({ bound: false, strategyId: "free" });

  it("no Alpha / Version inputs (the serializer sends alpha_binding: null), the pill is words, not a token", () => {
    mount({ draft: scratch() });
    expect(screen.queryByLabelText("Alpha")).toBeNull();
    expect(screen.queryByLabelText("Alpha version")).toBeNull();
    const badge = q("[data-binding-chip]") as HTMLElement;
    expect(badge.textContent).toBe("Scratch — cannot be published");
    expect(badge.getAttribute("data-binding-chip")).toBe("NOT_PUBLISHABLE");
    expect(q("[data-scratch-banner]")!.textContent).toBe("Scratch — no release candidate can come from it.");
    expect(document.body.textContent).not.toContain("NOT_PUBLISHABLE");
  });

  it("bound: the two selects are there", () => {
    mount();
    expect(screen.getByLabelText("Alpha")).toBeTruthy();
    expect(screen.getByLabelText("Alpha version")).toBeTruthy();
  });

  it("the data-step facts say 'not declared' in scratch, 'no version chosen' only for a bound run with no version (R39)", () => {
    mount({ draft: scratch(), limits: { ...LIMITS, requiredColumns: null, warmupBars: null, seedRequired: null } });
    go("data");
    expect(q('[data-declaration-fact="warmup bars"]')!.textContent).toContain("not declared");
    expect(q('[data-declaration-fact="warmup bars"]')!.textContent).not.toContain("no version chosen");
    cleanup();
    mount({ draft: draft({ alphaVersionId: "" }), limits: { ...LIMITS, requiredColumns: null, warmupBars: null, seedRequired: null } });
    go("data");
    expect(q('[data-declaration-fact="warmup bars"]')!.textContent).toContain("no version chosen");
  });
});

/* ------------------------------------------------------------------------ U10 · symbol note */

describe("U10 — 'not listed' is one short line, and not while the popup has a match", () => {
  it("BTC matches listed symbols: no 'not listed' line and no second prefill sentence", () => {
    mount({ draft: draft({ symbol: "BTC" }), catalog: CATALOG_V2 });
    go("data");
    expect(q("[data-symbol-unlisted]")).toBeNull();
    expect(q("[data-window-prefill-status]")?.textContent ?? "").not.toContain("listed symbols");
  });

  it("ZZZUSDT matches nothing: one line, the consequence in the tooltip, and the status line does not repeat it", () => {
    mount({ draft: draft({ symbol: "ZZZUSDT" }), catalog: CATALOG_V2 });
    go("data");
    expect(q("[data-symbol-unlisted]")!.textContent).toBe("ZZZUSDT is not a listed symbol");
    expect(q("[data-window-prefill-status]")).toBeNull();
    expect(q('[data-step-card="Market data"]')!.textContent).not.toContain("nothing is prefilled");
  });
});

/* ------------------------------------------------------------- U11 · T17-T19 · print once */

describe("U11 — a problem is printed once", () => {
  const overlap = () =>
    draft({
      windows: {
        is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" },
        oos: { start: "2026-02-01T00:00", endExclusive: "2026-04-01T00:00" },
        holdout: { start: "2026-04-01T00:00", endExclusive: "2026-05-01T00:00" },
      },
    });
  const count = (text: string) => (document.body.textContent!.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;

  it("on the step it belongs to: inline only, the rail does not echo it", () => {
    mount({ draft: overlap() });
    go("windows");
    go("route");
    go("windows");
    expect(count("OOS must begin exactly where IS ends.")).toBe(1);
    expect(q("[data-review-rail] [data-blocking]")).toBeNull();
  });

  it("on another step: the rail names it, once", () => {
    mount({ draft: overlap() });
    go("windows");
    go("route");
    expect(count("OOS must begin exactly where IS ends.")).toBe(1);
    expect(q("[data-review-rail] [data-blocking]")!.textContent).toBe("OOS must begin exactly where IS ends.");
  });

  it("on Review: one list in the main panel, one disabled reason, none in the rail", () => {
    mount({ draft: overlap() });
    go("review");
    expect(count("OOS must begin exactly where IS ends.")).toBe(1);
    expect(qa("[data-blocking]")).toHaveLength(1);
    expect(q("[data-review-rail] [data-blocking]")).toBeNull();
    expect((q('[data-action="preflight"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-disabled-reason="create-run"]')).toBeNull();
  });

  it("the window wording is short (T17)", () => {
    const emptyHoldout = draft({ windows: { ...overlap().windows, holdout: { start: "", endExclusive: "" } } });
    expect(blockingProblems(emptyHoldout, LIMITS).find((problem) => problem.step === "windows")!.message).toBe("Holdout end is required.");
  });

  it("a refused parameter is named once, in its row, with its own cause (T19, R55-R56)", () => {
    const entries = parameterEntriesFrom({ a: { kind: "int", low: 10, high: 50, step: 1 } } as never);
    const row = (low: string, high: string, extra: Partial<(typeof entries)[number]> = {}) => ({ ...entries[0]!, low, high, ...extra });
    expect(parameterStatus(row("3", "50")).text).toBe("outside the declared space — refused");
    expect(parameterStatus(row("10", "70")).text).toBe("outside the declared space — refused");
    expect(parameterStatus(row("abc", "50")).text).toBe("not a number — refused");
    expect(parameterStatus(row("40", "20")).text).toBe("high must be above low — refused");
    expect(parameterStatus(row("x", "", { dimension: "pin" })).text).toBe("pin value is not a number — refused");
    expect(parameterStatus(row("20", "30")).text).toBe("narrowed — allowed");

    mount({ draft: draft({ parameters: [row("3", "50")] }) });
    go("parameters");
    fireEvent.change(screen.getByLabelText("a low"), { target: { value: "3" } });
    expect(q('[data-parameter-status="a"]')!.textContent).toBe("outside the declared space — refused");
    expect(q("[data-step-error]")).toBeNull();
    expect(count("outside the declared space")).toBe(1);
  });
});

/* -------------------------------------------------------------- U12 · U13 · instants and UTC */

describe("U12 / U13 — one instant format, and the zone is stated", () => {
  it("instantText prints the minute the form prints; anything else is shown as it is", () => {
    expect(instantText("2026-06-01T00:00:00Z")).toBe("2026-06-01T00:00");
    expect(instantText("2026-06-01T00:00:00.000Z")).toBe("2026-06-01T00:00");
    expect(instantText("2026-06-01T00:00")).toBe("2026-06-01T00:00");
    /* A second that is not zero is information: it is kept. */
    expect(instantText("2026-06-01T00:00:30Z")).toBe("2026-06-01T00:00:30Z");
    expect(instantText("2026-06-01T00:00:00+07:00")).toBe("2026-06-01T00:00:00+07:00");
    expect(instantText("2026-06-01")).toBe("2026-06-01");
  });

  it("a copied run's windows read like a typed one's in the timeline", () => {
    const copied = draft({ windows: { is: { start: "2026-06-01T00:00:00Z", endExclusive: "2026-07-01T00:00:00Z" }, oos: { start: "2026-07-01T00:00:00Z", endExclusive: "2026-08-01T00:00:00Z" }, holdout: { start: "2026-08-01T00:00:00Z", endExclusive: "2026-09-01T00:00:00Z" } } });
    expect(timelineRows(copied).map((row) => row.text)).toEqual([
      "2026-06-01T00:00 → 2026-07-01T00:00",
      "2026-07-01T00:00 → 2026-08-01T00:00",
      "2026-08-01T00:00 → 2026-09-01T00:00",
    ]);
    expect(timelineRows(draft()).map((row) => row.text)).toEqual(["not declared → not declared", "not declared → not declared", "not declared → not declared"]);
  });

  it("each datetime input carries 'UTC' beside it (3 windows x 2 + advanced 3)", () => {
    mount();
    go("windows");
    expect(qa("[data-utc-suffix]")).toHaveLength(6);
    expect(qa("[data-utc-suffix]").every((node) => node.textContent === "UTC")).toBe(true);
    cleanup();
    mount({ draft: draft({ protocol: "advanced" }) });
    go("windows");
    expect(qa("[data-utc-suffix]")).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ U16 · narrow parameters */

describe("U16 — the parameter table names each cell when it is too narrow for a header", () => {
  const space = parameterEntriesFrom({ len: { kind: "int", low: 5, high: 50, step: 1 }, mult: { kind: "float", low: 1, high: 3, step: 0.5 } } as never);
  const width = (px: number) => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: () => void) {}
      observe() { this.callback(); }
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() { return (this as HTMLElement).hasAttribute("data-parameter-table") ? px : 0; },
    });
  };

  it("wide: the header row, no per-cell labels", () => {
    width(900);
    mount({ draft: draft({ parameters: space }) });
    go("parameters");
    expect(q("[data-parameter-header]")).not.toBeNull();
    expect(q("[data-parameter-compact]")).toBeNull();
  });

  it("narrow: no header; every row's cells carry their own label, so no column drifts away from its value", () => {
    width(560);
    mount({ draft: draft({ parameters: space }) });
    go("parameters");
    expect(q("[data-parameter-header]")).toBeNull();
    expect(q("[data-parameter-compact]")).not.toBeNull();
    const row = q('[data-parameter="len"]') as HTMLElement;
    for (const label of ["declared", "low", "high", "step"]) expect(within(row).getAllByText(label).length).toBeGreaterThan(0);
    /* The controls are unchanged. */
    expect(screen.getByLabelText("len low")).toBeTruthy();
    expect(screen.getByLabelText("len high")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------ U17 · mode */

describe("U17 — the mode select prints the short name", () => {
  it("each option is the display name (the id is its tooltip); the value is still the id", () => {
    mount();
    go("windows");
    const select = screen.getByLabelText("Optimization mode") as HTMLSelectElement;
    const options = [...select.options].filter((option) => option.value !== "");
    expect(options.map((option) => option.textContent)).toEqual(ATLAS.modes.map((mode) => mode.display_name));
    expect(options.map((option) => option.value)).toEqual(ATLAS.modes.map((mode) => mode.mode_id));
    expect(options.every((option) => option.getAttribute("title") === option.value)).toBe(true);
    expect(select.title).toBe("mode_1_decay");
  });

  it("T06: a schedule the mode does not admit explains itself in the option tooltip, not in a paragraph", () => {
    mount({ draft: draft({ optimizationMode: "mode_2_sbb", optimizationSchedule: "global" }) });
    go("windows");
    const bad = q('option[data-invalid-schedule="per_fold_decay"]') as HTMLOptionElement;
    const served = ATLAS.modes.find((mode) => mode.mode_id === "mode_2_sbb")!.invalid_schedules!.find((entry) => entry.schedule === "per_fold_decay")!.reason;
    expect(bad.disabled).toBe(true);
    expect(bad.textContent).toBe("per_fold_decay · not admitted");
    expect(bad.title).toBe(served);
    expect(q('[data-step-card="Walk-forward"]')!.textContent).not.toContain(served);
  });
});

/* -------------------------------------------------------------------------- U19 · U20 */

describe("U19 / U20 — one refusal banner, neutral locked chips, a repeated sentence said once", () => {
  it("U19: after a refusal there is one alert and the six panels stay folded", () => {
    const refusal = { code: "RESEARCH_PREFLIGHT_INVALID", gate: "G_MOCK", fieldPath: ["data", "symbol"], requestId: "req-1", copy: "Preflight cannot accept a field of this declaration. Fix it and run preflight again.", status: 400, state: "terminal" } as never;
    mount({ preflightRefusal: refusal, preflightState: { state: "terminal", reason: "Preflight cannot accept a field of this declaration. Fix it and run preflight again.", mayRetry: false, retainsContent: false } });
    go("review");
    expect((q("[data-preflight-preview]") as HTMLDetailsElement).open).toBe(false);
    expect(qa("[data-refusal-copy]")).toHaveLength(1);
  });

  it("U20: LOCKED rows are not drawn in the error colour; a sentence shared by 3+ rows is a tooltip, a unique one stays printed", () => {
    mount();
    go("optimization");
    const groups = ATLAS.current_release.optimizer_defaults.groups;
    const all = groups.flatMap((group) => group.fields);
    const counts = new Map<string, number>();
    for (const field of all) counts.set(field.detail, (counts.get(field.detail) ?? 0) + 1);
    const repeated = [...counts].find(([, n]) => n >= 3)![0];
    const details = q("[data-optimizer-defaults]") as HTMLDetailsElement;
    details.open = true;
    expect(details.textContent).not.toContain(repeated);
    expect(qa(`[data-optimizer-defaults] [title="${repeated}"]`).length).toBeGreaterThanOrEqual(3);
    expect(qa("[data-optimizer-defaults] [data-override-state=LOCKED] span").every((node) => !(node as HTMLElement).style.color.includes("--bad"))).toBe(true);
    for (const field of all.filter((item) => counts.get(item.detail) === 1)) expect(details.textContent).toContain(field.detail);
  });
});

/* --------------------------------------------------------------------------- U21 · T-text */

describe("U21 and the text pass — less words, no debug lines", () => {
  it("U21: a bound run with no version has set no strategy; the caption says 'not set', not 'valid'", () => {
    const base = { step: "strategy" as const, current: false, hasError: false, visited: true, contextChosen: false, reviewCaption: "x" };
    expect(stepCaption(base)).toEqual({ state: "incomplete", caption: "not set" });
    expect(stepCaption({ ...base, contextChosen: true }).caption).toBe("valid");
    mount({ draft: draft({ alphaVersionId: "" }) });
    go("strategy");
    go("route");
    expect(caption("strategy")).toBe("not set");
  });

  it("T01/T02: the pin hint is ≤ 8 words, absent with no version; the protocol sentence is a tooltip", () => {
    mount({ draft: draft({ alphaVersionId: "" }) });
    go("strategy");
    expect(q('[data-step-card="Strategy & protocol"]')!.textContent).not.toContain("pinned to");
    cleanup();
    mount();
    go("strategy");
    const card = q('[data-step-card="Strategy & protocol"]') as HTMLElement;
    expect(card.textContent).toContain("pinned to the alpha id");
    expect(card.textContent).not.toContain("the server admits no other");
    expect(card.textContent).not.toContain("Showing only the protocols");
    expect(q('[role="group"][aria-label="Protocol"]')!.getAttribute("title")).toBe("Only the protocols the installed engine release certifies are offered.");
  });

  it("T08: the empty parameter table says one short thing, by cause", () => {
    mount({ draft: draft({ parameters: [] }) });
    go("parameters");
    expect(q("[data-no-parameters]")!.textContent).toBe("No parameter space declared.");
    cleanup();
    mount({ draft: draft({ alphaVersionId: "", parameters: [] }) });
    go("parameters");
    expect(q("[data-no-parameters]")!.textContent).toBe("No version chosen.");
  });

  it("T09: the Context page has no 'declaration read for av_…' debug line", () => {
    mount({ registry: RUNNABLE });
    expect(document.body.textContent).not.toContain("declaration read for");
    expect(q("[data-declaration-bound]")).toBeNull();
  });

  it("T10/T11: the early-stopping hint is plain, and the optimization step does not restate 'nothing serialized'", () => {
    mount();
    go("optimization");
    expect(q('[data-step-card="Optimization"]')!.textContent).toContain("Trials without gain before stopping");
    expect(q('[data-step-card="Optimization"]')!.textContent).not.toContain("nothing serialized");
    expect(q('[data-step-card="Optimization"]')!.textContent).not.toContain("untouched fields not serialized");
  });

  it("T13: the served split rule is a tooltip on the field, not a paragraph (advanced)", () => {
    mount({ draft: draft({ protocol: "advanced" }) });
    go("windows");
    const rule = ATLAS.current_release.walk_forward_options!.split_mode_rule;
    expect(q('[data-step-card="Walk-forward"]')!.textContent).not.toContain(rule);
    expect(screen.getByLabelText("First OOS instant").closest("label")!.getAttribute("title")).toBe(rule);
  });

  it("T04: the rail no longer repeats the prefill sentence", () => {
    mount();
    go("windows");
    expect(q("[data-window-prefill-rail]")).toBeNull();
  });

  it("N02: a three-window run has no outer folds; that is said as a fact, an advanced run's absence stays 'not published'", () => {
    mount({ portalAdmission: PROFILES_RAW as never });
    const three = q("[data-fold-plan]") as HTMLElement;
    expect(three.getAttribute("data-fold-plan")).toBe("absent");
    expect(three.textContent).toBe("no outer folds · three-window protocol");
    cleanup();
    mount({ draft: draft({ protocol: "advanced", optimizationMode: "mode_2_sbb", optimizationSchedule: "global" }), portalAdmission: PROFILES_RAW as never });
    expect((q("[data-fold-plan]") as HTMLElement).textContent).toContain("outer folds — not published");
  });

});

/* ------------------------------------------------------------------------------ route text */

describe("T16 — the route method note", () => {
  it("is a plain sentence per method", () => {
    mount();
    go("route");
    expect(q("[data-route-method-note]")!.textContent).toBe("Walk-forward searches strategy parameters.");
  });
});
