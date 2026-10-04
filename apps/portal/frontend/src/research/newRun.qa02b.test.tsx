/**
 * QA 2026-10-02, second wave · Screen 02 New Run (group S02).
 *
 * What the verification pass found still open after the first wave: the served earliest start (U01),
 * the clipped date inputs (RG1), two fold statements (RG2), a refusal that reddened both bounds (RG3),
 * focus and tab order (U14), the declaration surviving a reload (U15), red on pass-through (U18),
 * Escape in Symbol (R34), a contradicting OOS word (R51), the Review windows format (U12), the repeated
 * route word (R21/T16) and the prefill sentence said three times (T04).
 *
 * Every block fails without its change, and states the value path and the typed absence path. Bodies are
 * the canonical fixtures from `packages/contracts/fixtures`, read at run time with `readFileSync`.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { SymbolCombobox } from "./DataDeclaration";
import { type PreflightEstimate, normalizeCatalog, readDeclarationEstimate, readProfiles } from "./dataDeclaration";
import { EarliestStartOffer, servedEarliestStart } from "./EstimateParts";
import type { EstimateStatus } from "./useDeclarationEstimate";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import { type RunDraft, applyCoveragePrefill, applyOverrides, parameterEntriesFrom, planCoverage, serializeRequestedSpec } from "./runDraft";
import { clearRunDraft as clearScopedDraft, restoreRunDraft as restoreScopedDraft, runDraftScope, runDraftStorageKey, saveRunDraft as saveScopedDraft } from "./runDraftStore";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument; portal_admission: { profiles: Record<string, unknown>[] } }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const PROFILES_RAW = ATLAS_RESPONSE.portal_admission.profiles;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG_V2 = normalizeCatalog(fixture<unknown>("research-dataset-catalog.v2.healthy.valid.json"));
const AVAILABLE = fixture<Record<string, any>>("research-declaration-estimate.v1.available.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const RUNNABLE: readonly RegistryEntry[] = REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, run_admission: { may_create_run: true, code: null } } : entry));
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });
const DRAFT_SCOPE = runDraftScope("principal_qa02b", "ws_qa02b")!;
const RUN_DRAFT_STORAGE_KEY = runDraftStorageKey(DRAFT_SCOPE)!;
const saveRunDraft = (value: RunDraft) => saveScopedDraft(value, DRAFT_SCOPE);
const clearRunDraft = () => clearScopedDraft(DRAFT_SCOPE);
const restoreRunDraft = (base: RunDraft, search: string) => restoreScopedDraft(base, search, DRAFT_SCOPE);
vi.mock("../auth/session", () => ({ useSession: () => ({ principal: { principalId: "principal_qa02b" }, access: { kind: "unavailable", requestId: null } }) }));

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

const THREE = {
  is: { start: "2026-07-01T00:00", endExclusive: "2026-07-01T12:00" },
  oos: { start: "2026-07-01T12:00", endExclusive: "2026-07-02T00:00" },
  holdout: { start: "2026-07-02T00:00", endExclusive: "2026-07-03T00:00" },
};

const PENDING = () => new Promise<Response>(() => undefined);

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  vi.stubGlobal("fetch", vi.fn(PENDING));
  const patch = vi.fn();
  const view = render(
    <MemoryRouter>
      <NewRun
        draft={draft({ windows: THREE })}
        patch={patch}
        limits={LIMITS}
        atlas={ATLAS}
        atlasState={OK}
        registry={RUNNABLE}
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
      />
    </MemoryRouter>,
  );
  return { ...view, patch };
}

it("missing persistence context does not describe the current declaration as a saved draft", () => {
  const view = mount({ onStartOver: vi.fn(), draftPersistenceAvailable: false });
  expect(view.container.querySelector('[data-action="start-over"]')?.getAttribute("title")).toBe("Discard the current declaration and open a blank form");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

const go = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
const pill = (step: string) => document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement;
const q = (selector: string) => document.querySelector(selector);
const qa = (selector: string) => [...document.querySelectorAll(selector)];
const text = (selector: string) => q(selector)?.textContent ?? null;

/** The canonical estimate with the served earliest start (and nothing else) changed. */
function served(earliest: number | null, windows?: Record<string, unknown>[]): EstimateStatus {
  const body = structuredClone(AVAILABLE);
  body.metadata.earliest_start_utc_ms = earliest;
  if (windows) body.metadata.windows = windows;
  const estimate = readDeclarationEstimate(body) as PreflightEstimate;
  return { kind: "served", estimate };
}

const Z = (iso: string) => Date.parse(`${iso}:00Z`);

/* ------------------------------------------------------------- U01 · the served earliest start */

describe("U01 — the served earliest start is offered, never computed", () => {
  it("value path: reads the served instant as a draft instant", () => {
    const status = served(Z("2020-01-13T12:00"));
    expect(status.kind === "served" && servedEarliestStart(status.estimate)).toBe("2020-01-13T12:00");
  });

  it("three windows: an IS start before it offers one click that puts the served instant in the IS start", () => {
    const { patch } = mount({
      draft: draft({ windows: { ...THREE, is: { start: "2020-01-01T00:00", endExclusive: "2020-06-01T00:00" } } }),
      estimateStatus: served(Z("2020-01-13T12:00")),
    });
    go("windows");
    const offer = q("[data-earliest-start-offer]") as HTMLElement;
    expect(offer.getAttribute("data-earliest-start-offer")).toBe("2020-01-13T12:00");
    expect(offer.textContent).toBe("Start at 2020-01-13 12:00 · full warmup");
    expect(offer.getAttribute("title")).toContain("CONTIGUOUS_INDEXED_WARMUP_BARS_V1");
    fireEvent.click(offer);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]![0].windows.is.start).toBe("2020-01-13T12:00");
    /* The click is the reader's own edit: the field stops reading as a coverage prefill. */
    expect(patch.mock.calls[0]![0].coveragePrefill.touched).toContain("is.start");
  });

  it("advanced: the analysis start gets the same offer", () => {
    const { patch } = mount({
      draft: draft({ protocol: "advanced", walkForward: { start: "2020-01-01T00:00", endExclusive: "2020-06-01T00:00", splitMode: "2020-03-01T00:00", frequency: "weekly", windowMode: "expanding" } }),
      estimateStatus: served(Z("2020-01-13T12:00")),
    });
    go("windows");
    fireEvent.click(q("[data-advanced-window] [data-earliest-start-offer], [data-earliest-start-offer]") as HTMLElement);
    expect(patch.mock.calls[0]![0].walkForward.start).toBe("2020-01-13T12:00");
    expect(patch.mock.calls[0]![0].walkForward.endExclusive).toBe("2020-06-01T00:00");
  });

  it("typed absence: a start at or after it, no served earliest, or an estimate that is not served offer nothing", () => {
    const early = draft({ windows: { ...THREE, is: { start: "2020-01-01T00:00", endExclusive: "2020-06-01T00:00" } } });
    mount({ draft: early, estimateStatus: served(Z("2020-01-01T00:00")) });
    go("windows");
    expect(q("[data-earliest-start-offer]")).toBeNull();
    cleanup();
    mount({ draft: early, estimateStatus: served(null) });
    go("windows");
    expect(q("[data-earliest-start-offer]")).toBeNull();
    cleanup();
    mount({ draft: early, estimateStatus: { kind: "pending" } });
    go("windows");
    expect(q("[data-earliest-start-offer]")).toBeNull();
    cleanup();
    mount({ draft: early, estimateStatus: { kind: "error", failure: "network", status: null, code: null, requestId: null } });
    go("windows");
    expect(q("[data-earliest-start-offer]")).toBeNull();
  });

  it("a served instant that is not a whole minute is not offered", () => {
    const status = served(Z("2020-01-13T12:00") + 1000);
    expect(status.kind === "served" && servedEarliestStart(status.estimate)).toBeNull();
    const { container } = render(<EarliestStartOffer estimate={status.kind === "served" ? status.estimate : null} start="2020-01-01T00:00" onUse={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

/* ------------------------------------------------------------------------ RG1 · date input width */

describe("RG1 — the date inputs keep room for their time and the UTC suffix", () => {
  it("every datetime field of the advanced row holds at least 232 px before the row wraps", () => {
    mount({ draft: draft({ protocol: "advanced", walkForward: { start: "2026-07-01T00:00", endExclusive: "2026-07-03T00:00", splitMode: "2026-07-02T00:00", frequency: "weekly", windowMode: "expanding" } }) });
    go("windows");
    const labels = qa("[data-advanced-window] label").filter((label) => label.querySelector("input[type=datetime-local]"));
    expect(labels.length).toBe(3);
    for (const label of labels) expect(parseInt((label as HTMLElement).style.minWidth, 10)).toBeGreaterThanOrEqual(232);
  });
});

/* ------------------------------------------------------------------ RG2 · one fold statement */

describe("RG2 — one fold statement per protocol", () => {
  const folds = (count: number | null) => {
    const status = served(Z("2026-07-01T00:00"));
    if (status.kind !== "served") throw new Error("unreachable");
    return { kind: "served", estimate: { ...status.estimate, plannedFolds: { count, basis: "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1", minBarsPerFold: null, reasonCode: count === null ? "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" : null } } } as EstimateStatus;
  };
  const withProfiles = { portalAdmission: PROFILES_RAW as never };

  it("three windows: 'no outer folds' stands alone; the planner's count and its absence are not printed beside it", () => {
    const status = folds(1);
    mount({ ...withProfiles, estimateStatus: status, estimate: status.kind === "served" ? status.estimate : null });
    go("windows");
    expect(text("[data-fold-plan]")).toContain("no outer folds");
    expect(q("[data-planned-folds]")).toBeNull();
    cleanup();
    const absent = folds(null);
    mount({ ...withProfiles, estimateStatus: absent, estimate: absent.kind === "served" ? absent.estimate : null });
    go("windows");
    expect(q("[data-planned-folds]")).toBeNull();
  });

  it("advanced: the served count prints as '≈ N folds' and the basis word is the tooltip, not the line", () => {
    const status = folds(9);
    mount({ draft: draft({ protocol: "advanced", walkForward: { start: "2026-07-01T00:00", endExclusive: "2026-07-03T00:00", splitMode: "2026-07-02T00:00", frequency: "weekly", windowMode: "expanding" } }), estimateStatus: status, estimate: status.kind === "served" ? status.estimate : null });
    go("windows");
    const line = q("[data-planned-folds='served']")!;
    expect(line.textContent!.trim()).toBe("≈ 9 folds");
    expect(line.getAttribute("title")).toContain("P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1");
  });
});

/* ------------------------------------------------------------------ RG3 · the refusal binds one bound */

describe("RG3 — a refusal reddens only the bound it names and says its served sentence", () => {
  const refused = (fieldPath: readonly string[]): EstimateStatus => ({ kind: "refused", code: "WINDOW_BOUND_NOT_ALIGNED", fieldPath, message: "ignored", requestId: "req_1" });
  const border = (selector: string) => (q(selector) as HTMLElement).style.borderColor;

  it("windows.holdout.end_exclusive: the holdout end is red, its start and the other windows are not", () => {
    mount({ estimateStatus: refused(["windows", "holdout", "end_exclusive"]) });
    go("windows");
    expect(border('[aria-label="Holdout end exclusive"]')).toBe("var(--bad)");
    expect(border('[aria-label="Holdout start"]')).not.toBe("var(--bad)");
    expect(border('[aria-label="IS start"]')).not.toBe("var(--bad)");
    expect(border('[aria-label="IS end exclusive"]')).not.toBe("var(--bad)");
  });

  it("windows.is.start: only the IS start", () => {
    mount({ estimateStatus: refused(["windows", "is", "start"]) });
    go("windows");
    expect(border('[aria-label="IS start"]')).toBe("var(--bad)");
    expect(border('[aria-label="IS end exclusive"]')).not.toBe("var(--bad)");
  });

  it("a path that names the window only (no bound) still marks the whole window", () => {
    mount({ estimateStatus: refused(["windows", "oos"]) });
    go("windows");
    expect(border('[aria-label="OOS start"]')).toBe("var(--bad)");
    expect(border('[aria-label="OOS end exclusive"]')).toBe("var(--bad)");
  });

  it("the served sentence of the typed code sits under the code; a code with no sentence adds none", () => {
    mount({ estimateStatus: refused(["windows", "holdout", "end_exclusive"]) });
    go("windows");
    expect(text("[data-estimate-field-refusal]")).toBe("WINDOW_BOUND_NOT_ALIGNED · windows.holdout.end_exclusive");
    expect(text("[data-estimate-refusal-sentence]")).toBe("Align window bounds to the selected UTC bar interval.");
    cleanup();
    mount({ estimateStatus: { ...refused(["windows", "holdout", "end_exclusive"]), code: "SOME_OTHER_CODE" } as EstimateStatus });
    go("windows");
    expect(q("[data-estimate-refusal-sentence]")).toBeNull();
  });
});

/* ------------------------------------------------------------------------ U14 · focus and tab order */

describe("U14 — the step tabs are one tab stop, and the symbol popup does not swallow Tab", () => {
  it("roving tabindex: only the current step is tabbable, and the arrow keys move the stop", () => {
    mount();
    expect(qa("[role=tab]").map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1", "-1", "-1"]);
    fireEvent.keyDown(pill("context"), { key: "ArrowRight" });
    expect(qa("[role=tab]").map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1", "-1", "-1", "-1", "-1"]);
  });

  const symbols = CATALOG_V2.datasets[0]!.symbols;
  const items = symbols.state === "PUBLISHED" ? symbols.items : [];
  const Combo = ({ value = "", onChange = vi.fn() }: { value?: string; onChange?: (symbol: string) => void }) => (
    <SymbolCombobox value={value} symbols={items} total={items.length} truncated={false} bad={false} onChange={onChange} />
  );
  const input = () => q('input[aria-label="Symbol"]') as HTMLInputElement;

  it("focus moving on inside the popup keeps it open; leaving the combobox closes it", () => {
    render(<Combo />);
    fireEvent.focus(input());
    expect(q("[data-symbol-listbox]")).not.toBeNull();
    const inside = document.createElement("button");
    q("[data-symbol-listbox]")!.appendChild(inside);
    fireEvent.blur(input(), { relatedTarget: inside });
    expect(q("[data-symbol-listbox]")).not.toBeNull();
    fireEvent.blur(input(), { relatedTarget: document.body });
    expect(q("[data-symbol-listbox]")).toBeNull();
  });
});

/* ------------------------------------------------------------------------ R34 · Escape in Symbol */

describe("R34 — Escape drops what was typed and keeps the chosen symbol", () => {
  const symbols = CATALOG_V2.datasets[0]!.symbols;
  const items = symbols.state === "PUBLISHED" ? symbols.items : [];
  function Harness({ initial, onChange }: { initial: string; onChange: (symbol: string) => void }) {
    const [value, setValue] = (require("react") as typeof import("react")).useState(initial);
    return (
      <SymbolCombobox
        value={value}
        symbols={items}
        total={items.length}
        truncated={false}
        bad={false}
        onChange={(symbol) => {
          onChange(symbol);
          setValue(symbol);
        }}
      />
    );
  }
  const input = () => q('input[aria-label="Symbol"]') as HTMLInputElement;

  it("value path: typed text on top of a chosen symbol goes back to it, and the popup closes", () => {
    const onChange = vi.fn();
    render(<Harness initial="BTCUSDT" onChange={onChange} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ZZZ" } });
    expect(input().value).toBe("ZZZ");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("BTCUSDT");
    expect(q("[data-symbol-listbox]")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith("BTCUSDT");
  });

  it("typed absence: with nothing chosen before, Escape clears the typed query", () => {
    render(<Harness initial="" onChange={vi.fn()} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ZZZUSDT" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("");
  });

  it("a field with no symbol list behaves the same: Escape returns to what was chosen", () => {
    function Bare() {
      const [value, setValue] = (require("react") as typeof import("react")).useState("");
      return <SymbolCombobox value={value} symbols={[]} total={null} truncated={false} bad={false} onChange={setValue} />;
    }
    render(<Bare />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "BTC" } });
    expect(input().value).toBe("BTC");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("");
  });

  it("a symbol picked from the list is the new anchor", () => {
    render(<Harness initial="" onChange={vi.fn()} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ETH" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    const picked = input().value;
    expect(picked).toMatch(/^ETH/);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "QQQ" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe(picked);
  });
});

/* ------------------------------------------------------------------------ U15 · reload keeps the draft */

describe("U15 — the declaration survives a reload", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("value path: a saved draft comes back over the empty one", () => {
    const held = draft({ symbol: "ETHUSDT", windows: THREE });
    saveRunDraft(held);
    expect(window.sessionStorage.getItem(RUN_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(restoreRunDraft(emptyDraft(), "?step=data")).toEqual(held);
  });

  it("clearing drops it (leaving the form inside the app)", () => {
    saveRunDraft(draft());
    clearRunDraft();
    expect(restoreRunDraft(emptyDraft(), "")).toBeNull();
  });

  it("typed absence: nothing stored, unreadable JSON, a wrong shape, or a link that owns the declaration restore nothing", () => {
    expect(restoreRunDraft(emptyDraft(), "")).toBeNull();
    window.sessionStorage.setItem(RUN_DRAFT_STORAGE_KEY, "{not json");
    expect(restoreRunDraft(emptyDraft(), "")).toBeNull();
    window.sessionStorage.setItem(RUN_DRAFT_STORAGE_KEY, JSON.stringify({ symbol: "X" }));
    expect(restoreRunDraft(emptyDraft(), "")).toBeNull();
    saveRunDraft(draft());
    expect(restoreRunDraft(emptyDraft(), "?from=rrun_1")).toBeNull();
    expect(restoreRunDraft(emptyDraft(), "?fork=cell_1")).toBeNull();
    expect(restoreRunDraft(emptyDraft(), "?av=another_version")).toBeNull();
    expect(restoreRunDraft(emptyDraft(), `?av=${ALPHA.alpha_version_id}`)).not.toBeNull();
  });

  it("storage that throws never breaks the form", () => {
    const blocked = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveRunDraft(draft())).not.toThrow();
    expect(() => clearRunDraft()).not.toThrow();
    expect(restoreRunDraft(emptyDraft(), "")).toBeNull();
    blocked.mockRestore();
  });
});

describe("U15 — on the route: a reload restores the declaration, leaving the form drops it", () => {
  const notFound = () => new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "x" } }), { status: 404, headers: { "content-type": "application/json" } });
  const route = (search = "?step=data") =>
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new${search}${search ? "&" : "?"}workspace_id=ws_qa02b`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );

  it("a stored draft is on screen after a reload, an edit is stored, and leaving inside the app keeps it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFound()));
    saveRunDraft(draft({ symbol: "ETHUSDT", alphaId: "", alphaVersionId: "" }));
    const view = route();
    await waitFor(() => expect((q('input[aria-label="Symbol"]') as HTMLInputElement).value).toBe("ETHUSDT"));
    fireEvent.change(q('input[aria-label="Symbol"]') as HTMLInputElement, { target: { value: "SOLUSDT" } });
    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem(RUN_DRAFT_STORAGE_KEY)!).draft.symbol).toBe("SOLUSDT"));
    view.unmount();
    /* Autosave: a link out of the wizard and back, or the browser Back button, finds the declaration where it was left. */
    expect(JSON.parse(window.sessionStorage.getItem(RUN_DRAFT_STORAGE_KEY)!).draft.symbol).toBe("SOLUSDT");
    clearRunDraft();
    expect(window.sessionStorage.getItem(RUN_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("typed absence: with nothing stored, or a ?from= link, the form opens empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => notFound()));
    route();
    await waitFor(() => expect(q('input[aria-label="Symbol"]')).not.toBeNull());
    expect((q('input[aria-label="Symbol"]') as HTMLInputElement).value).toBe("");
    cleanup();
    saveRunDraft(draft({ symbol: "ETHUSDT" }));
    route("?step=data&from=rrun_1");
    await waitFor(() => expect(q('input[aria-label="Symbol"]')).not.toBeNull());
    expect((q('input[aria-label="Symbol"]') as HTMLInputElement).value).toBe("");
  });

  it("a restored explicit pin survives a registry arriving after the draft", async () => {
    const overrides = [{ name: "window", kind: "pin" as const, value: 16 }];
    const parameters = applyOverrides(parameterEntriesFrom(ALPHA.declaration.parameter_space), overrides);
    saveRunDraft(draft({ parameters, windows: THREE }));
    let releaseRegistry!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.split("?")[0] === "/api/v1/research/alphas") return new Promise<Response>(resolve => { releaseRegistry = resolve; });
      if (path.includes("atlas")) return Promise.resolve(new Response(JSON.stringify(ATLAS_RESPONSE), { headers: { "content-type": "application/json" } }));
      return Promise.resolve(notFound());
    }));
    route("?step=parameters");
    await waitFor(() => expect(releaseRegistry).toBeTypeOf("function"));
    expect(serializeRequestedSpec(restoreRunDraft(emptyDraft(), "")!).parameter_space_overrides).toEqual(overrides);
    releaseRegistry(new Response(JSON.stringify(REGISTRY), { headers: { "content-type": "application/json" } }));
    await waitFor(() => expect((q('input[aria-label="window value"]') as HTMLInputElement)?.value).toBe("16"));
    expect(serializeRequestedSpec(restoreRunDraft(emptyDraft(), "")!).parameter_space_overrides).toEqual(overrides);
  });
});

/* ------------------------------------------------------------------------ U18 · pass-through is not an error */

describe("U18 — passing through a step does not turn it red", () => {
  const empty = () => draft({ symbol: "", datasetId: "", windows: { is: { start: "", endExclusive: "" }, oos: { start: "", endExclusive: "" }, holdout: { start: "", endExclusive: "" } } });

  it("walking Market data and Walk-forward without typing leaves them 'in progress'; Review still lists every problem", () => {
    mount({ draft: empty() });
    for (const step of ["strategy", "route", "data", "windows", "parameters", "optimization"]) go(step);
    for (const step of ["data", "windows"]) {
      expect(pill(step).getAttribute("data-step-state")).not.toBe("error");
      expect(pill(step).querySelector("[data-step-caption]")!.textContent).toBe("in progress");
    }
    go("review");
    expect(document.body.textContent).toContain("A symbol is required.");
  });

  it("a value that is there and wrong is not hidden by walking past: leaving the step shows it", () => {
    mount({ draft: draft({ timeframe: "4h" }), limits: { ...LIMITS, declaredTimeframes: ["1h"] as const } });
    go("data");
    go("route");
    expect(pill("data").getAttribute("data-step-state")).toBe("error");
  });

  it("a window with a bound still empty is unfinished, not wrong", () => {
    mount({ draft: draft({ windows: { ...THREE, oos: { start: "", endExclusive: "" } } }) });
    go("windows");
    go("route");
    expect(pill("windows").getAttribute("data-step-state")).toBe("incomplete");
  });

  it("an edit on the step is what engages it: the same step turns red once the reader types in it", () => {
    mount({ draft: empty() });
    go("data");
    expect(pill("data").getAttribute("data-step-state")).not.toBe("error");
    fireEvent.change(q('input[aria-label="Symbol"]') as HTMLInputElement, { target: { value: "" } });
    fireEvent.change(q('input[aria-label="Symbol"]') as HTMLInputElement, { target: { value: "X" } });
    fireEvent.change(q('input[aria-label="Symbol"]') as HTMLInputElement, { target: { value: "" } });
    /* The mocked patch does not change the draft; the engagement is the reader's edit, not the value. */
    expect(pill("data").getAttribute("data-step-state")).toBe("error");
  });
});

/* ------------------------------------------------------------------------ R51 · the OOS word */

describe("R51 — the forecast does not say 'no held-out window' beside three declared windows", () => {
  it("mode_5 says the served state, 'OOS: not applicable'; the served enum is the tooltip", () => {
    mount({ draft: draft({ windows: THREE, optimizationMode: "mode_5_full_robust", optimizationSchedule: "global" }) });
    go("review");
    const line = q("[data-forecast-oos='NOT_APPLICABLE']") as HTMLElement;
    expect(line.textContent).toBe("OOS: not applicable");
    expect(line.getAttribute("title")).toBe("NOT_APPLICABLE");
    expect(document.body.textContent).not.toContain("no held-out window");
  });

  it("the other served states keep their Atlas words", () => {
    mount({ draft: draft({ windows: THREE, optimizationMode: "mode_1_decay", optimizationSchedule: "global" }) });
    go("review");
    expect(text("[data-forecast-oos]")).toBe("OOS: retrospective");
  });
});

/* ------------------------------------------------------------------------ U12 · Review windows row */

describe("U12 — the Review windows row prints the instants the form prints", () => {
  it("IS / OOS / holdout starts and the holdout end are instants, not dates", () => {
    mount({ draft: draft({ windows: { is: { start: "2020-03-01T00:00", endExclusive: "2024-01-01T00:00" }, oos: { start: "2024-01-01T00:00", endExclusive: "2025-01-01T00:00" }, holdout: { start: "2025-01-01T00:00", endExclusive: "2026-06-01T00:00" } } }) });
    go("review");
    const rows = qa("[data-review-rows] > *").map((row) => row.textContent ?? "");
    expect(rows.find((row) => row.toLowerCase().startsWith("windows"))).toContain("IS 2020-03-01T00:00 → OOS 2024-01-01T00:00 → holdout 2025-01-01T00:00 → end 2026-06-01T00:00");
  });

  it("typed absence: an empty window is left out of the row, never a slice of nothing", () => {
    mount({ draft: draft({ windows: { ...THREE, holdout: { start: "", endExclusive: "" } } }) });
    go("review");
    const row = qa("[data-review-rows] > *").map((entry) => entry.textContent ?? "").find((entry) => entry.toLowerCase().startsWith("windows"))!;
    expect(row).not.toContain("holdout");
    expect(row).not.toContain("end ");
    expect(row).not.toContain("not declared");
  });
});

/* ------------------------------------------------------------------------ R21 · T16 · route words */

describe("R21 / T16 — a word the route says twice is printed once", () => {
  it("pct_equity: family 'signal', contract and backend both 'legacy': the panel prints 'legacy' once", () => {
    mount({ draft: draft({ executionRoute: "pct_equity" }) });
    go("route");
    const panel = q('[data-route-panel="pct_equity"]') as HTMLElement;
    expect(panel.textContent!.match(/legacy/g)!.length).toBe(1);
    expect(q("[data-route-backend]")).toBeNull();
  });

  it("a route whose backend differs from its contract keeps both", () => {
    mount({ draft: draft({ executionRoute: "signal_notional" }) });
    go("route");
    expect(text("[data-route-backend]")).toBe("native_vectorized");
  });
});

/* ------------------------------------------------------------------------ T04 · prefill said once */

describe("T04 — that bounds were prefilled is said once", () => {
  const plan = planCoverage(CATALOG_V2, "crypto-binance-1m", "BTCUSDT", "1h");
  const prefilled = () => {
    const base = draft({ windows: { is: { start: "", endExclusive: "" }, oos: { start: "", endExclusive: "" }, holdout: { start: "", endExclusive: "" } } });
    return { ...base, ...applyCoveragePrefill(base, plan) };
  };

  it("value path: Market data prints no prefill sentence; Walk-forward has the one note and short edge captions", () => {
    expect(plan.state).toBe("ready");
    mount({ draft: prefilled(), catalog: CATALOG_V2 });
    go("data");
    expect(q("[data-window-prefill-status]")).toBeNull();
    go("windows");
    expect(qa("[data-prefill-source]").length).toBe(1);
    const captions = qa("[data-prefill-caption]").map((node) => node.textContent);
    expect(captions).toEqual(["prefilled · first 1h bar", "prefilled · end of the last 1h bar"]);
  });

  it("typed absence: a reason nothing could be prefilled is still printed on Market data", () => {
    mount({ draft: draft({ symbol: "BTCUSDT" }), catalog: CATALOG_V2, limits: LIMITS });
    go("data");
    mount({ draft: draft({ datasetId: "not-a-dataset" }), catalog: CATALOG_V2 });
    cleanup();
    mount({ draft: draft({ datasetId: "not-a-dataset" }), catalog: CATALOG_V2 });
    go("data");
    expect(text("[data-window-prefill-status]")).toContain("not-a-dataset");
  });
});

/* ---------------------------------------------------------------------------------- profiles are read */

describe("the profile table used above is the served one", () => {
  it("p04 serves no fold bounds (the three-window protocol has no outer folds)", () => {
    const profiles = readProfiles(PROFILES_RAW)!;
    expect(profiles.some((profile) => profile.protocol === "three_window_decay")).toBe(true);
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
