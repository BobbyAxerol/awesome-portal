/**
 * W2A — New Run correctness and fewer words.
 *
 * Test data are the repo's canonical contract fixtures, read from disk; the drafts are built with the
 * route's own `emptyDraft()` and patched, never hand-typed server answers. Nothing here writes to a server.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import type { DatasetCatalog } from "./datasetClient";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft, listedSymbolsFor, soleActiveEntry } from "./NewRunRoute";
import { PreflightApiError, toPreflightRefusal } from "./preflightClient";
import type { PreflightResponse } from "./preflightClient";
import {
  NO_LIMITS,
  type RunDraft,
  advancedProblems,
  blockingProblems,
  draftIsEmpty,
  firstIncompleteStep,
  stepsDone,
  validateData,
  windowProblems,
} from "./runDraft";
import { RUN_DRAFT_STORAGE_KEY, clearRunDraft, readDraftSummary, saveRunDraft } from "./runDraftStore";
import { researchState } from "./state";

beforeEach(() => {
  window.sessionStorage.clear();
});
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
const CATALOG = fixture<DatasetCatalog>("research-preflight.dataset-catalog.valid.json");
const PREFLIGHT = fixture<PreflightResponse>("research-preflight.response.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const OK = researchState({ kind: "ok", rowCount: 1 });

/** Typed builder: the canonical registry entry cloned under another alpha id / lifecycle, so no server shape is invented. */
function entryAs(alphaId: string, versionId: string, lifecycle: string) {
  const copy = structuredClone(ALPHA);
  copy.alpha_id = alphaId;
  copy.alpha_version_id = versionId;
  copy.lifecycle_state = lifecycle as typeof copy.lifecycle_state;
  return copy;
}

const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id, { catalog: CATALOG, datasetId: "crypto-binance-1m" });

function bound(overrides: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyDraft(),
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.strategy_id ?? ALPHA.alpha_id,
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    optunaTrials: "3",
    ...overrides,
  };
}

function advancedEmpty(extra: Partial<RunDraft["walkForward"]> = {}, draft: Partial<RunDraft> = {}): RunDraft {
  const base = bound({ protocol: "advanced", ...draft });
  return { ...base, walkForward: { ...base.walkForward, ...extra } };
}

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  return render(
    <NewRun
      draft={bound()}
      patch={vi.fn()}
      limits={LIMITS}
      atlas={ATLAS}
      atlasState={OK}
      registry={REGISTRY.entries}
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
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const qa = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];

/* ---------------------------------------------------------------- (1) Advanced walk-forward */

describe("Advanced walk-forward is as strict as Three-Window", () => {
  it("lists every missing required field, each by name", () => {
    const messages = advancedProblems(advancedEmpty({ start: "", endExclusive: "", splitMode: "", frequency: "", windowMode: "" }), { temporalGuardsRequired: true });
    expect(messages).toEqual([
      "Analysis start is required.",
      "Analysis end is required.",
      "First OOS instant is required.",
      "Frequency is required.",
      "Window mode is required.",
      "Label horizon is required.",
      "Purge is required.",
      "Embargo is required.",
    ]);
  });

  it("the guards are required only where the screen offers them", () => {
    const base = advancedEmpty({ start: "2026-01-01T00:00", endExclusive: "2026-06-01T00:00", splitMode: "2026-03-01T00:00", frequency: "weekly", windowMode: "expanding" });
    expect(advancedProblems(base, { temporalGuardsRequired: false })).toEqual([]);
    expect(advancedProblems(base, { temporalGuardsRequired: true })).toHaveLength(3);
  });

  it("a first OOS instant outside the analysis is refused", () => {
    const messages = advancedProblems(advancedEmpty({ start: "2026-01-01T00:00", endExclusive: "2026-06-01T00:00", splitMode: "2027-01-01T00:00", frequency: "weekly", windowMode: "expanding", labelHorizonBars: "0", purgeBars: "0", embargoBars: "0" }), { temporalGuardsRequired: true });
    expect(messages).toEqual(["First OOS instant must fall inside the analysis."]);
  });

  it("the mode is required for both protocols and the step is in error, Review lists them and Preflight is off", () => {
    const draft = advancedEmpty({ start: "2026-01-01T00:00", endExclusive: "2026-06-01T00:00", splitMode: "", frequency: "weekly", windowMode: "expanding" });
    expect(blockingProblems(draft, LIMITS).map((problem) => problem.message)).toEqual(
      expect.arrayContaining(["First OOS instant is required.", "Label horizon is required.", "Choose an optimization mode."]),
    );
    mount({ draft });
    go("review");
    const links = qa('[data-blocking-link="windows"]');
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect((q('[data-action="preflight"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-action="preflight"]')!.getAttribute("title")).toBeTruthy();
    /* Each error is a link to the step that owns it. */
    fireEvent.click(links[0]!);
    expect(q('[data-step-pill="windows"]')!.getAttribute("aria-current")).toBe("step");
  });

  it("three-window messages name the window and flag an IS/OOS overlap", () => {
    const draft = bound({
      windows: {
        is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" },
        oos: { start: "2026-02-01T00:00", endExclusive: "2026-04-01T00:00" },
        holdout: { start: "2026-04-01T00:00", endExclusive: "" },
      },
    });
    expect(windowProblems(draft)).toEqual(["Holdout end is required.", "OOS overlaps IS: it starts before IS ends."]);
    const reversed = bound({ windows: { ...draft.windows, is: { start: "2026-03-01T00:00", endExclusive: "2026-01-01T00:00" } } });
    expect(windowProblems(reversed)).toContain("IS must end after it starts.");
  });
});

/* ---------------------------------------------------------------- (2) symbols */

describe("a symbol the dataset does not list is not valid", () => {
  it("is refused with one short message when the catalog served the whole list", () => {
    expect(listedSymbolsFor(CATALOG, "crypto-binance-1m")).toContain("BTCUSDT");
    expect(validateData(bound({ symbol: "zzz" }), LIMITS)).toBe("ZZZ is not a listed symbol.");
    expect(validateData(bound({ symbol: "btcusdt" }), LIMITS)).toBeNull();
    expect(blockingProblems(bound({ symbol: "ZZZ" }), LIMITS).filter((problem) => problem.step === "data")).toHaveLength(1);
  });

  it("is not judged when the list is partial (only the server's search can say), and a search miss refuses it", () => {
    const partial = structuredClone(CATALOG);
    partial.datasets[0]!.symbols = { ...partial.datasets[0]!.symbols, truncated: true };
    expect(listedSymbolsFor(partial, "crypto-binance-1m")).toBeNull();
    expect(listedSymbolsFor(CATALOG, "")).toBeNull();
    const limits = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id, { catalog: partial, datasetId: "crypto-binance-1m", unlistedSymbol: "ZZZ" });
    expect(validateData(bound({ symbol: "XRPUSDT" }), limits)).toBeNull();
    expect(validateData(bound({ symbol: "ZZZ" }), limits)).toBe("ZZZ is not a listed symbol.");
  });

  it("choosing a dataset does not flash 'A symbol is required.'", () => {
    const draft = bound({ symbol: "", datasetId: "" });
    const patch = vi.fn();
    mount({ draft, patch, catalog: CATALOG });
    go("data");
    const select = q("[data-dataset-select]") as HTMLSelectElement | null;
    if (select) fireEvent.change(select, { target: { value: "crypto-binance-1m" } });
    else fireEvent.click(q("[data-dataset-identity]") as HTMLElement);
    expect(document.body.textContent).not.toContain("A symbol is required.");
    expect(q('[data-step-pill="data"]')!.getAttribute("data-step-state")).not.toBe("error");
  });

  it("an unlisted symbol shows one message, not the same sentence twice", () => {
    mount({ draft: bound({ symbol: "ZZZ" }), catalog: CATALOG });
    go("data");
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "ZZZ" } });
    const text = document.body.textContent ?? "";
    expect(text.split("ZZZ is not a listed symbol").length - 1).toBe(1);
  });
});

/* ---------------------------------------------------------------- (3) draft */

describe("the draft is autosaved and summarised", () => {
  it("readDraftSummary answers null for nothing saved or an empty draft", () => {
    expect(readDraftSummary()).toBeNull();
    saveRunDraft(emptyDraft());
    expect(readDraftSummary()).toBeNull();
    expect(draftIsEmpty(emptyDraft())).toBe(true);
  });

  it("reports the steps done and the step it resumes on", () => {
    saveRunDraft(bound({ symbol: "" }));
    const summary = readDraftSummary()!;
    expect(summary.step).toBe("data");
    expect(summary.stepNumber).toBe(4);
    expect(summary.total).toBe(7);
    expect(summary.stepsDone).toBeGreaterThanOrEqual(3);
    expect(stepsDone(bound({ symbol: "" })).has("data")).toBe(false);
    clearRunDraft();
    expect(readDraftSummary()).toBeNull();
  });

  it("never throws on a stored shape from an older build or on blocked storage", () => {
    window.sessionStorage.setItem(RUN_DRAFT_STORAGE_KEY, JSON.stringify({ windows: {}, walkForward: {}, parameters: [], alphaVersionId: "av_1" }));
    expect(() => readDraftSummary()).not.toThrow();
    const blocked = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readDraftSummary()).toBeNull();
    blocked.mockRestore();
  });

  it("an empty draft resumes on the first step; a complete one on Review", () => {
    expect(firstIncompleteStep(emptyDraft(), NO_LIMITS)).toBe("context");
    const done = bound({
      optimizationMode: "mode_1_decay",
      optimizationSchedule: "global",
      windows: {
        is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" },
        oos: { start: "2026-03-01T00:00", endExclusive: "2026-04-01T00:00" },
        holdout: { start: "2026-04-01T00:00", endExclusive: "2026-05-01T00:00" },
      },
    });
    expect(firstIncompleteStep(done, NO_LIMITS)).toBe("review");
  });
});

describe("one history entry per step", () => {
  function Probe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <span data-probe-search>{location.search}</span>
        <button type="button" data-probe-back onClick={() => navigate(-1)}>back</button>
      </>
    );
  }
  function serve() {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets") return json(CATALOG);
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }));
  }

  it("Next and Back walk the steps and the browser Back follows them", async () => {
    serve();
    render(
      <MemoryRouter initialEntries={["/research/quantbt/runs/new"]}>
        <NewRunRoute />
        <Probe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(q("[data-screen=new-run]")).not.toBeNull());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    fireEvent.click(q('[data-action="step-next"]') as HTMLElement);
    await waitFor(() => expect(q("[data-probe-search]")!.textContent).not.toBe(""));
    const first = q("[data-probe-search]")!.textContent;
    fireEvent.click(q('[data-action="step-next"]') as HTMLElement);
    await waitFor(() => expect(q("[data-probe-search]")!.textContent).not.toBe(first));
    fireEvent.click(q("[data-probe-back]") as HTMLElement);
    await waitFor(() => expect(q("[data-probe-search]")!.textContent).toBe(first));
  });
});

/* ---------------------------------------------------------------- (4) Back / Next, versions */

describe("Back and Next skip the steps with nothing left to choose", () => {
  it("a bound run walks Context → Route: the pinned Strategy step is kept as a pill, not a stop", () => {
    mount();
    expect(q('[data-step-pill="strategy"]')!.textContent).toContain("pinned");
    expect(q('[data-action="step-back"]')).toBeNull();
    fireEvent.click(q('[data-action="step-next"]') as HTMLElement);
    expect(q('[data-step-pill="route"]')!.getAttribute("aria-current")).toBe("step");
    expect(q('[data-action="step-back"]')!.textContent).toContain("Context");
    /* The pill still reaches the step. */
    go("strategy");
    expect(q('[data-step-pill="strategy"]')!.getAttribute("aria-current")).toBe("step");
  });

  it("a scratch run keeps its Strategy step as a stop", () => {
    mount({ draft: bound({ bound: false }) });
    fireEvent.click(q('[data-action="step-next"]') as HTMLElement);
    expect(q('[data-step-pill="strategy"]')!.getAttribute("aria-current")).toBe("step");
  });

  it("the Review step has Back and no Next", () => {
    mount();
    go("review");
    expect(q('[data-action="step-next"]')).toBeNull();
    expect(q('[data-action="step-back"]')).not.toBeNull();
  });

  it("choosing an alpha with one version picks the version", () => {
    const patch = vi.fn();
    mount({ draft: bound({ alphaId: "", alphaVersionId: "" }), patch });
    fireEvent.change(screen.getByLabelText("Alpha"), { target: { value: ALPHA.alpha_id } });
    expect(patch).toHaveBeenCalledWith({ alphaId: ALPHA.alpha_id, alphaVersionId: ALPHA.alpha_version_id, strategyId: "" });
  });

  it("the alpha select does not offer the receipt alphas that cannot create runs", () => {
    const registry = [...REGISTRY.entries, entryAs("s14-ui-receipt", "av_receipt_ui", "ACTIVE"), entryAs("s14-api-receipt", "av_receipt_api", "ACTIVE")];
    mount({ draft: bound({ alphaId: "", alphaVersionId: "" }), registry });
    const options = [...(screen.getByLabelText("Alpha") as HTMLSelectElement).options].map((option) => option.value);
    expect(options).toContain(ALPHA.alpha_id);
    expect(options).not.toContain("s14-ui-receipt");
    expect(options).not.toContain("s14-api-receipt");
  });

  it("a receipt alpha is never the one ACTIVE version a plain visit opens on", () => {
    const registry = [entryAs("s14-ui-receipt", "av_receipt_ui", "ACTIVE")];
    expect(soleActiveEntry(registry)).toBeNull();
    expect(soleActiveEntry([...registry, entryAs("alpha-real", "av_real", "ACTIVE")])?.alpha_id).toBe("alpha-real");
  });
});

/* ---------------------------------------------------------------- (5) read-only session */

describe("a 403 is one short state", () => {
  const refusal403 = toPreflightRefusal(new PreflightApiError("SERVER-PROSE", 403, "RESEARCH_PREFLIGHT_INVALID", "req_ro", {}));

  it("Review says 'Read-only session.' once, with the code in the tooltip", () => {
    mount({
      preflightRefusal: refusal403,
      estimateStatus: { kind: "error", failure: "client-error", status: 403, code: "SESSION_REQUIRED", requestId: null },
      createState: { state: "denied", reason: "x", mayRetry: false, retainsContent: false },
    });
    go("review");
    const notes = qa("[data-read-only-session]");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toBe("Read-only session.");
    expect(notes[0]!.getAttribute("title")).toContain("RESEARCH_PREFLIGHT_INVALID");
    expect(document.body.textContent!.match(/Read-only session\./g)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("SERVER-PROSE");
    expect(q("[data-refusal-copy]")).toBeNull();
    expect(q('[data-research-panel="run"]')).toBeNull();
  });

  it("a session that can write shows nothing of it", () => {
    mount({ preflight: PREFLIGHT });
    go("review");
    expect(q("[data-read-only-session]")).toBeNull();
  });
});

/* ---------------------------------------------------------------- (7) fewer words */

describe("fewer words", () => {
  it("the rail shows only on Review, and the other steps do not restate the declaration", () => {
    mount();
    for (const step of ["context", "route", "parameters", "optimization"]) {
      go(step);
      expect(q("[data-review-rail]"), step).toBeNull();
    }
    go("review");
    expect(q("[data-review-rail]")).not.toBeNull();
    expect(qa("[data-review-rail] [data-review-rows]")).toHaveLength(0);
  });

  it("Review rows omit what nobody declared instead of repeating 'not declared'", () => {
    mount({ draft: emptyDraft() });
    go("review");
    expect(q("[data-review-rows]")!.textContent).not.toContain("not declared");
    expect(q("[data-review-rows]")!.textContent).not.toContain("NO VERSION CHOSEN");
  });

  it("no helper text exposes a regex or says 'preflight only for now'", () => {
    mount({ draft: advancedEmpty({ windowMode: "rolling", trainWindow: "30D" }, { optimizationMode: "mode_1_decay", optimizationSchedule: "per_fold_causal" }) });
    go("windows");
    expect(document.body.textContent).not.toMatch(/\^\[1-9\]/);
    expect(document.body.textContent).not.toContain("preflight only for now");
  });

  it("the release defaults are one summary line with a toggle", () => {
    mount();
    go("optimization");
    const details = q("[data-optimizer-defaults]") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const fields = ATLAS.current_release.optimizer_defaults.groups.flatMap((group) => group.fields);
    expect(details.querySelector("summary")!.textContent).toContain(`${fields.length} fields`);
    /* The same source and lock state on every row is said once in the summary, not on each row. */
    const kinds = new Set(fields.map((field) => `${field.value_source}|${field.override_state}`));
    if (kinds.size === 1) expect(details.querySelector("summary")!.textContent!.toLowerCase()).toContain("locked");
    expect(details.textContent).not.toContain("RELEASE_DEFAULT");
  });
});
