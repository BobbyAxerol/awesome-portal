/**
 * S02 linked-window setup, through the real NewRun screen: the four-edge calendar writes both windows that share an
 * instant in ONE patch; the served setup suggestion auto-applies once into an empty draft and never over a typed
 * one; a cloned v1 advanced run carries no guard problems until the reader explicitly chooses v2; and the coverage
 * prefill is the fallback only while no setup is served.
 *
 * Fixtures are the canonical ones (`research-run-setup-options.fixed`, `research-window-suggestion.three-window`,
 * the v2 healthy catalog), read at run time from the repo root; variants patch typed fields only.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { normalizeCatalog } from "./dataDeclarationV2";
import type { DatasetCatalog } from "./datasetClient";
import { NewRun } from "./NewRun";
import { constraintsFrom, emptyDraft } from "./NewRunRoute";
import { type RunDraft, adoptGuardDefaults, blockingProblems, draftFromRequestedSpec, serializeRequestedSpec, usesSpecV2 } from "./runDraft";
import { type SetupOptions, type SetupProfile, type WindowSuggestion, resetSetupRouteMemory } from "./setupClient";
import { researchState } from "./state";
import type { RunSetupState } from "./useRunSetup";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json").atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const OPTIONS = fixture<SetupOptions>("research-run-setup-options.fixed.valid.json");
const SUGGESTION = fixture<WindowSuggestion>("research-window-suggestion.three-window.valid.json");
const V2 = fixture<DatasetCatalog>("research-dataset-catalog.v2.healthy.valid.json");
const OK = researchState({ kind: "ok", rowCount: 1 });
const CONTEXT = OPTIONS.context;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSetupRouteMemory();
});
beforeEach(() => { window.sessionStorage.clear(); });

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const SUGGESTED = (() => {
  const windows = (SUGGESTION.metadata as { patch: { windows: { is: { start_utc_ms: number; end_exclusive_utc_ms: number }; oos: { end_exclusive_utc_ms: number }; holdout: { end_exclusive_utc_ms: number } } } }).patch.windows;
  return [iso(windows.is.start_utc_ms), iso(windows.is.end_exclusive_utc_ms), iso(windows.oos.end_exclusive_utc_ms), iso(windows.holdout.end_exclusive_utc_ms)];
})();

const EDGE_LABELS = ["IS start (A)", "IS end · OOS start (B)", "OOS end · Holdout start (C)", "Holdout end exclusive (D)"] as const;
/* B and C also carry a slider handle of the same name: the input is read by its element type. */
const edge = (label: (typeof EDGE_LABELS)[number]) => screen.getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const edgeValues = () => EDGE_LABELS.map((label) => edge(label).value);
const goTo = (step: string) => { fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement); };
const act2 = async (ms: number) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const served = (options: SetupOptions): RunSetupState => ({ status: "served", options, error: null, retry: () => undefined, invalidate: () => undefined });
const absent: RunSetupState = { status: "absent", options: null, error: null, retry: () => undefined, invalidate: () => undefined };

/** The same merge `useNewRun.patch` performs, with every patch recorded and the latest draft readable. */
function Harness({
  initial,
  setup,
  catalog = null,
  step = "windows",
  record,
  latest,
}: {
  initial: RunDraft;
  setup: RunSetupState;
  catalog?: DatasetCatalog | null;
  step?: "data" | "windows";
  record?: (change: Partial<RunDraft>) => void;
  latest?: { current: RunDraft };
}) {
  const [draft, setDraft] = useState<RunDraft>(initial);
  if (latest) latest.current = draft;
  const patch = useCallback((change: Partial<RunDraft>) => {
    record?.(change);
    setDraft((previous) => ({ ...previous, ...change }));
  }, [record]);
  const limits = useMemo(
    () => constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id, { catalog, datasetId: draft.datasetId, usesSpecV2: usesSpecV2(draft) }),
    [catalog, draft],
  );
  return (
    <MemoryRouter>
      <NewRun
        draft={draft}
        patch={patch}
        limits={limits}
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
        catalog={catalog === null ? null : normalizeCatalog(catalog)}
        initialStep={step}
        setup={setup}
        workspaceId={CONTEXT.workspace_id}
      />
    </MemoryRouter>
  );
}

/** A draft bound to the fixture's context: Alpha version, dataset, symbol, timeframe, the fixed profile's route and mode. */
const bound = (over: Partial<RunDraft> = {}): RunDraft => ({
  ...emptyDraft(),
  alphaId: CONTEXT.alpha_id,
  alphaVersionId: CONTEXT.alpha_version_id,
  strategyId: CONTEXT.alpha_id,
  datasetId: CONTEXT.dataset_id,
  symbol: CONTEXT.symbol,
  timeframe: CONTEXT.timeframe,
  optimizationMode: "mode_1_decay",
  optimizationSchedule: "global",
  engineReleaseId: ATLAS.current_release.release_id,
  configDigest: "sha256:cfg",
  ...over,
});
const THREE = {
  is: { start: "2026-07-01T00:00", endExclusive: "2026-07-01T12:00" },
  oos: { start: "2026-07-01T12:00", endExclusive: "2026-07-02T00:00" },
  holdout: { start: "2026-07-02T00:00", endExclusive: "2026-07-03T00:00" },
};

/* ------------------------------------------------------------------------------------------------- (1) */

describe("S02 linked edges — one edit of B (or C) writes both windows that share it, in one patch", () => {
  it("B is the IS end and the OOS start: one patch carries both, A, C and D stay", () => {
    const calls: Partial<RunDraft>[] = [];
    const latest = { current: bound({ windows: THREE }) };
    render(<Harness initial={latest.current} setup={absent} record={(change) => calls.push(change)} latest={latest} />);
    fireEvent.change(edge("IS end · OOS start (B)"), { target: { value: "2026-07-01T18:00" } });

    const windowPatches = calls.filter((change) => change.windows !== undefined);
    expect(windowPatches).toHaveLength(1);
    expect(windowPatches[0]!.windows).toEqual({
      is: { start: "2026-07-01T00:00", endExclusive: "2026-07-01T18:00" },
      oos: { start: "2026-07-01T18:00", endExclusive: "2026-07-02T00:00" },
      holdout: { start: "2026-07-02T00:00", endExclusive: "2026-07-03T00:00" },
    });
    /* The draft the screen holds, and what it would send. */
    expect(latest.current.windows.is.endExclusive).toBe("2026-07-01T18:00");
    expect(latest.current.windows.oos.start).toBe("2026-07-01T18:00");
    expect(edgeValues()).toEqual(["2026-07-01T00:00", "2026-07-01T18:00", "2026-07-02T00:00", "2026-07-03T00:00"]);
    const sent = serializeRequestedSpec(latest.current).windows!;
    expect(sent.is.end_exclusive).toBe("2026-07-01T18:00");
    expect(sent.oos.start).toBe("2026-07-01T18:00");
  });

  it("C is the OOS end and the Holdout start; the outer edges are the reader's provenance (touched), the inner ones are not", () => {
    const calls: Partial<RunDraft>[] = [];
    const latest = { current: bound({ windows: THREE }) };
    render(<Harness initial={latest.current} setup={absent} record={(change) => calls.push(change)} latest={latest} />);
    fireEvent.change(edge("OOS end · Holdout start (C)"), { target: { value: "2026-07-01T20:00" } });
    expect(latest.current.windows.oos.endExclusive).toBe("2026-07-01T20:00");
    expect(latest.current.windows.holdout.start).toBe("2026-07-01T20:00");
    expect(calls.filter((change) => change.windows !== undefined)).toHaveLength(1);
    expect(latest.current.coveragePrefill?.touched ?? []).toEqual([]);

    fireEvent.change(edge("IS start (A)"), { target: { value: "2026-06-30T00:00" } });
    fireEvent.change(edge("Holdout end exclusive (D)"), { target: { value: "2026-07-04T00:00" } });
    expect(latest.current.coveragePrefill?.touched).toEqual(expect.arrayContaining(["is.start", "holdout.endExclusive"]));
  });
});

describe("S02 linked edges — a copied draft that is not linked keeps its own OOS and holdout starts", () => {
  it("editing A or D changes only IS start / holdout end; nothing the copy set is rewritten", () => {
    const gapped = bound({
      windows: {
        is: { start: "2026-07-01T00:00", endExclusive: "2026-07-01T12:00" },
        oos: { start: "2026-07-01T13:00", endExclusive: "2026-07-02T00:00" },
        holdout: { start: "2026-07-02T02:00", endExclusive: "2026-07-03T00:00" },
      },
    });
    const latest = { current: gapped };
    render(<Harness initial={gapped} setup={absent} latest={latest} />);
    fireEvent.change(edge("IS start (A)"), { target: { value: "2026-06-30T00:00" } });
    fireEvent.change(edge("Holdout end exclusive (D)"), { target: { value: "2026-07-04T00:00" } });
    expect(latest.current.windows).toEqual({
      is: { start: "2026-06-30T00:00", endExclusive: "2026-07-01T12:00" },
      oos: { start: "2026-07-01T13:00", endExclusive: "2026-07-02T00:00" },
      holdout: { start: "2026-07-02T02:00", endExclusive: "2026-07-04T00:00" },
    });
  });
});

/* ------------------------------------------------------------------------------------------------- (2) */

describe("S02 setup suggestion — auto-applied once into an empty draft, never over a typed one", () => {
  const posted: unknown[] = [];
  function stubSuggestion() {
    posted.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if ((init?.method ?? "GET").toUpperCase() === "POST" && url.pathname === "/api/v1/research/runs/window-suggestions") {
        posted.push(JSON.parse(String(init?.body)));
        return json(SUGGESTION);
      }
      return json({ error: { code: "NOT_FOUND", message: "not found" } }, 404);
    }));
  }
  const action = (name: string) => document.querySelector(`[data-action="${name}"]`) as HTMLButtonElement;

  it("all window fields empty: the first suggestion applies itself once; Reset restores empty and nothing is asked again", async () => {
    stubSuggestion();
    render(<Harness initial={bound()} setup={served(OPTIONS)} />);
    expect(document.querySelector("[data-window-setup]")).not.toBeNull();
    await waitFor(() => expect(edgeValues()).toEqual(SUGGESTED));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ profile_id: "p04.fixed-qualification.v1", options_revision: OPTIONS.source_revision, alpha_version_id: CONTEXT.alpha_version_id });
    /* B and C are shared: IS end = OOS start, OOS end = Holdout start, as the calendar's four edges say. */
    await waitFor(() => expect(action("reset-suggestion").disabled).toBe(false));

    fireEvent.click(action("reset-suggestion"));
    expect(edgeValues()).toEqual(["", "", "", ""]);
    await act2(150);
    /* Once: neither the re-render after Reset nor the settle asks again. */
    expect(posted).toHaveLength(1);
    expect(edgeValues()).toEqual(["", "", "", ""]);
  });

  it("a user-typed window: the suggestion is shown but NOT applied until Apply is clicked", async () => {
    stubSuggestion();
    render(<Harness initial={bound({ windows: { ...bound().windows, is: { start: "2026-01-01T00:00", endExclusive: "" } } })} setup={served(OPTIONS)} />);
    await act2(150);
    /* Nothing was asked on its own, and nothing was written. */
    expect(posted).toHaveLength(0);
    expect(edgeValues()).toEqual(["2026-01-01T00:00", "", "", ""]);

    fireEvent.click(action("suggest-windows"));
    await waitFor(() => expect(document.querySelector("[data-window-setup]")?.getAttribute("data-suggestion-state")).toBe("proposal"));
    expect(posted).toHaveLength(1);
    expect(edgeValues()).toEqual(["2026-01-01T00:00", "", "", ""]);
    expect(action("apply-suggestion").disabled).toBe(false);

    fireEvent.click(action("apply-suggestion"));
    expect(edgeValues()).toEqual(SUGGESTED);
    /* Reset puts back what Apply replaced: the reader's own start, not a blank. */
    fireEvent.click(action("reset-suggestion"));
    expect(edgeValues()).toEqual(["2026-01-01T00:00", "", "", ""]);
  });
});

/* ------------------------------------------------------------------------------------------------- (3) */

describe("S02 guards — a cloned v1 advanced run, and the explicit choice of v2", () => {
  const WFO: SetupProfile = {
    ...structuredClone(OPTIONS.profiles[0]!),
    profile_id: "p10.delta-signal-notional-wfo.v1",
    protocol: "advanced",
    optimization_schedule: "global",
    requested_spec_versions: ["research.requested-spec.v1", "research.requested-spec.v2"],
    trial_count: { min: 1, max: 50 },
    trial_default: 10,
    seed_policy: "OPTIONAL",
    random_seed: null,
    fold_bounds: { min: 2, max: 16 },
    frequencies: ["weekly", "monthly"],
    window_modes: ["expanding", "rolling"],
    temporal_guards: {
      policy: "V1_ABSENT_V2_EXPLICIT",
      defaults: { label_horizon_bars: 3, purge_bars: 2, embargo_bars: 1 },
      max_bars: 10000,
      zero_semantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD",
    },
  };
  const wfoOptions: SetupOptions = { ...structuredClone(OPTIONS), profiles: [WFO] };
  const v1Draft = (): RunDraft => {
    const base = bound({ protocol: "advanced" });
    const original = { ...base, walkForward: { start: "2026-01-01T00:00", endExclusive: "2026-06-01T00:00", splitMode: "2026-03-01T00:00", frequency: "weekly", windowMode: "expanding" } };
    /* A clone: the draft is read back from the serialized v1 spec, so it carries no v2 field at all. */
    return draftFromRequestedSpec(serializeRequestedSpec(original), original);
  };
  const guard = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

  it("has no 'is required' problem, shows no guard error, and serializes schema v1", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const latest = { current: v1Draft() };
    render(<Harness initial={latest.current} setup={served(wfoOptions)} latest={latest} />);
    expect(usesSpecV2(latest.current)).toBe(false);
    expect(guard("Label horizon (bars)").value).toBe("");
    const limits = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id, { catalog: null, datasetId: latest.current.datasetId, usesSpecV2: false });
    expect(blockingProblems(latest.current, limits).map((problem) => problem.message).filter((message) => /guard|horizon|purge|embargo/i.test(message))).toEqual([]);
    goTo("review");
    expect(document.body.textContent).not.toMatch(/(Label horizon|Purge|Embargo) is required/);
    const spec = serializeRequestedSpec(latest.current);
    expect(spec.schema_version).toBe("research.requested-spec.v1");
    expect(JSON.stringify(spec.walk_forward)).not.toMatch(/label_horizon|purge|embargo/);
  });

  it("'Use v2 guards' fills the EMPTY guard fields with the served defaults and declares v2; a later typed value is kept", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const latest = { current: v1Draft() };
    render(<Harness initial={latest.current} setup={served(wfoOptions)} latest={latest} />);
    const button = document.querySelector('[data-action="adopt-guard-defaults"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect([guard("Label horizon (bars)").value, guard("Purge (bars)").value, guard("Embargo (bars)").value]).toEqual(["3", "2", "1"]);
    expect(usesSpecV2(latest.current)).toBe(true);
    expect(serializeRequestedSpec(latest.current).schema_version).toBe("research.requested-spec.v2");
    /* It is a one-way, explicit choice: the button is gone once v2 is declared. */
    expect(document.querySelector('[data-action="adopt-guard-defaults"]')).toBeNull();

    fireEvent.change(guard("Purge (bars)"), { target: { value: "7" } });
    expect([guard("Label horizon (bars)").value, guard("Purge (bars)").value, guard("Embargo (bars)").value]).toEqual(["3", "7", "1"]);
  });

  it("with one guard already typed the button stays, fills only the other two and keeps the typed one", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const latest = { current: v1Draft() };
    render(<Harness initial={latest.current} setup={served(wfoOptions)} latest={latest} />);
    fireEvent.change(guard("Purge (bars)"), { target: { value: "7" } });
    fireEvent.click(document.querySelector('[data-action="adopt-guard-defaults"]') as HTMLButtonElement);
    expect([guard("Label horizon (bars)").value, guard("Purge (bars)").value, guard("Embargo (bars)").value]).toEqual(["3", "7", "1"]);
    expect(document.querySelector('[data-action="adopt-guard-defaults"]')).toBeNull();
  });

  it("adoptGuardDefaults never overwrites a typed guard (the pure rule behind the button)", () => {
    const typed = { ...v1Draft().walkForward, purgeBars: "7" };
    const adopted = adoptGuardDefaults(typed, { labelHorizonBars: 3, purgeBars: 2, embargoBars: 1 });
    expect([adopted.labelHorizonBars, adopted.purgeBars, adopted.embargoBars, adopted.declaredV2]).toEqual(["3", "7", "1", true]);
  });
});

/* ------------------------------------------------------------------------------------------------- (4) */

describe("S02 coverage prefill is the fallback, not the rule", () => {
  const DS = V2.datasets[0]!.dataset_id;
  const EXACT = { lower: "2026-07-01T00:00", upper: "2026-07-03T00:00" };
  const pickSymbol = () => {
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "BTCUSDT" } });
    goTo("windows");
  };

  it("setup absent: picking a symbol still fills the outer bounds A and D from the coverage", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Harness initial={{ ...emptyDraft(), datasetId: DS, timeframe: "1h" }} setup={absent} catalog={V2} step="data" />);
    pickSymbol();
    expect(edgeValues()).toEqual([EXACT.lower, "", "", EXACT.upper]);
    expect(document.querySelector("[data-prefill-source]")?.textContent).toContain("Prefilled from");
  });

  it("setup served: the same pick fills nothing; the suggestion owns the windows", () => {
    /* The suggestion call never answers here, so only the prefill could have written a value. */
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Harness initial={{ ...bound(), symbol: "", datasetId: DS }} setup={served(OPTIONS)} catalog={V2} step="data" />);
    pickSymbol();
    expect(edgeValues()).toEqual(["", "", "", ""]);
    expect(document.querySelector("[data-prefill-source]")).toBeNull();
  });
});
