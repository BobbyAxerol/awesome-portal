/**
 * POLISH2 — S02 reads honest on a fresh form.
 *
 *  - an empty timeframe is "not declared" and is required; a chosen version
 *    fills it with its FIRST declared timeframe (never a built-in "4h");
 *  - Review prints "not declared" / "not set" for what nobody chose;
 *  - the walk-forward placeholders are the served release defaults, not literals.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import { blockingProblems, validateData, type RunDraft } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG = fixture<unknown>("research-preflight.dataset-catalog.valid.json");
const PREFLIGHT = fixture<PreflightResponse>("research-preflight.response.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const OK = researchState({ kind: "ok", rowCount: 1 });

/** The fixture version declares one timeframe; this one declares two, "4h" first, so "first served" is not "the only one". */
function registryWith(timeframes: string[]): RegistryListResponse {
  const copy = structuredClone(REGISTRY);
  copy.entries[0]!.declaration.timeframes = timeframes;
  return copy;
}

function bound(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  return render(
    <NewRun
      draft={bound({ timeframe: "1h" })}
      patch={vi.fn()}
      limits={constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id)}
      atlas={ATLAS}
      atlasState={OK}
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
      {...overrides}
    />,
  );
}

const go = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
const reviewRows = () => document.querySelector("[data-review-step] [data-review-rows]")!.textContent!;
const row = (label: string) => {
  const rows = [...document.querySelectorAll("[data-review-step] [data-review-rows] > *")];
  return rows.find((node) => node.textContent?.startsWith(label))?.textContent ?? "";
};

/* ------------------------------------------------------------- timeframe */

describe("POLISH2 · 4 — no built-in timeframe", () => {
  it("a fresh draft carries no timeframe, and a timeframe is required before preflight", () => {
    expect(emptyDraft().timeframe).toBe("");
    expect(validateData(bound({ timeframe: "" }), constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id))).toBe("A timeframe is required.");
    expect(blockingProblems(bound({ timeframe: "" }), constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id)).map((p) => p.message)).toContain("A timeframe is required.");
    /* The symbol is reported first, as before. */
    expect(validateData(bound({ symbol: "", timeframe: "" }), constraintsFrom(ATLAS, REGISTRY.entries, ""))).toBe("A symbol is required.");
    /* A chosen one passes. */
    expect(validateData(bound({ timeframe: "1h" }), constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id))).toBeNull();
  });

  it("Review lists only what is declared for an empty timeframe — no trailing separator", () => {
    mount({ draft: bound({ timeframe: "" }) });
    go("review");
    expect(row("dataset · symbol · tf")).toBe("dataset · symbol · tfcrypto-binance-1m · BTCUSDT");
    expect(reviewRows()).not.toMatch(/·\s*$/m);
  });

  it("the Market data step offers no 'selected' chip while the field is empty, and the error waits for an edit", () => {
    mount({ draft: bound({ timeframe: "" }), limits: constraintsFrom(ATLAS, registryWith(["4h", "1h"]).entries, ALPHA.alpha_version_id) });
    go("data");
    expect([...document.querySelectorAll('[data-timeframe-chip][aria-checked="true"]')]).toEqual([]);
    expect(document.querySelector("[data-step-error]")).toBeNull();
    go("route");
    go("data");
    /* U18: leaving is not an edit. */
    expect(document.querySelector("[data-step-error]")).toBeNull();
    fireEvent.change(document.querySelector('input[aria-label="Symbol"]') as HTMLInputElement, { target: { value: "B" } });
    expect(document.querySelector("[data-step-error]")?.textContent).toBe("A timeframe is required.");
  });

  it("a scratch run binds no version, so the dataset's own timeframes can be picked", () => {
    const patch = vi.fn();
    mount({
      draft: { ...emptyDraft(), bound: false, strategyId: "s", datasetId: "crypto-binance-1m", symbol: "BTCUSDT" },
      limits: constraintsFrom(ATLAS, REGISTRY.entries, ""),
      catalog: CATALOG as never,
      patch,
    });
    go("data");
    const chips = [...document.querySelectorAll("[data-timeframe-chip]")] as HTMLElement[];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((chip) => chip.getAttribute("aria-disabled") === "false")).toBe(true);
    fireEvent.click(chips[0]!);
    expect(patch).toHaveBeenCalledWith({ timeframe: chips[0]!.getAttribute("data-timeframe-chip") });
  });
});

function serve(registry: RegistryListResponse) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
    if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(registry);
    if (method === "GET" && url.pathname === "/api/v1/research/datasets") return json(CATALOG);
    if (method === "POST") return json(PREFLIGHT);
    throw new Error(`unexpected request ${method} ${url.pathname}`);
  }));
}
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function route(registry: RegistryListResponse, search: string) {
  serve(registry);
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/new?${search}`]}>
      <NewRunRoute />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen=new-run]")).not.toBeNull());
  await settle();
  await settle();
}

describe("POLISH2 · 4 — the real route", () => {
  it("choosing a version takes its FIRST served declared timeframe", async () => {
    const registry = registryWith(["4h", "1h"]);
    await route(registry, `alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}&step=data`);
    const selected = document.querySelector('[data-timeframe-chip][aria-checked="true"]');
    expect(selected?.getAttribute("data-timeframe-chip")).toBe("4h");
    /* The row still offers the version's whole declared set. */
    expect(document.querySelector('[data-timeframe-chip="1h"]')?.getAttribute("aria-disabled")).toBe("false");
  });

  it("a version that publishes no timeframe leaves the field empty — nothing is invented", async () => {
    const registry = registryWith([]);
    await route(registry, `alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}&step=data`);
    expect(document.querySelector('[data-timeframe-chip][aria-checked="true"]')).toBeNull();
    go("review");
    expect(row("dataset · symbol · tf")).not.toMatch(/·\s*$/);
    expect(row("dataset · symbol · tf")).not.toContain("4h");
  });

  it("with nothing declared an address that names Review opens the first step to fill in, never an empty Review", async () => {
    await route({ ...REGISTRY, entries: [] }, "step=review");
    expect(document.querySelector("[data-review-step]")).toBeNull();
    expect(document.querySelector('[data-step-pill="context"]')?.getAttribute("aria-current")).toBe("step");
  });
});

/* ---------------------------------------------------------- review rows */

describe("POLISH2 · 3 — Review prints what nobody chose as 'not declared' / 'not set'", () => {
  it("no declaration read: parameter_space says 'not declared', not '0 entries'; unset stop and seed say 'not set'", () => {
    mount({ draft: bound({ timeframe: "", parameters: [], optunaTrials: "", earlyStopping: "", randomSeed: "" }) });
    go("review");
    const rows = reviewRows();
    /* Nothing declared is not a row: no "not declared" repeated down the table, and never a made-up 0. */
    expect(row("parameter_space")).toBe("");
    expect(rows).not.toContain("0 entries");
    expect(row("trials · stop · seed")).toBe("");
    expect(rows).not.toContain("not declared");
    expect(rows).not.toContain("none");
  });

  it("a read declaration with entries still counts them; a stop and seed that were set print as set", () => {
    mount({ draft: bound({ timeframe: "1h", earlyStopping: "20", randomSeed: "42", optunaTrials: "400", parameters: [{ name: "x", declaredLow: 1, declaredHigh: 3, dimension: "sweep", low: "1", high: "3" }] }), versionDeclared: true } as never);
    go("review");
    expect(row("trials · stop · seed")).toBe("trials · stop · seed400 trials · stop 20 · seed 42");
    expect(row("parameter_space")).toContain("1 entries");
  });
});

/* ---------------------------------------------------- walk-forward inputs */

describe("POLISH2 · 3 — walk-forward placeholders come from the served release", () => {
  const advanced = (extra: Partial<RunDraft> = {}) => {
    const base = bound({ timeframe: "1h", protocol: "advanced", optimizationMode: "mode_1_decay", optimizationSchedule: "per_fold_causal", ...extra });
    return { ...base, walkForward: { ...base.walkForward, start: "2026-05-01T00:00:00Z", endExclusive: "2026-07-31T00:00:00Z", splitMode: "2026-06-01T00:00:00Z", frequency: "weekly", windowMode: "expanding" } };
  };
  const placeholder = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).getAttribute("placeholder");

  it("guards show the served release_default; inner folds show the served minimum", () => {
    const atlas = structuredClone(ATLAS);
    (atlas.current_release.walk_forward_options!.temporal_guards as { release_default: number }).release_default = 3;
    mount({ atlas, draft: advanced() });
    go("windows");
    for (const label of ["Label horizon (bars)", "Purge (bars)", "Embargo (bars)"]) expect(placeholder(label)).toBe("3");
    expect(placeholder("Minimum inner folds")).toBe(String(ATLAS.current_release.walk_forward_options!.inner_folds!.min_folds_release_default));
  });

  it("an atlas that publishes no inner folds leaves that placeholder empty — no '2' of the form's own", () => {
    const atlas = structuredClone(ATLAS);
    delete (atlas.current_release.walk_forward_options as { inner_folds?: unknown }).inner_folds;
    mount({ atlas, draft: advanced() });
    go("windows");
    expect(screen.getByLabelText("Minimum inner folds").hasAttribute("placeholder")).toBe(false);
    expect(placeholder("Purge (bars)")).toBe(String(ATLAS.current_release.walk_forward_options!.temporal_guards!.release_default));
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
