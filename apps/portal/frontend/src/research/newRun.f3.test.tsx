/**
 * F3 · HiFi parity — Screen 02 New Run (group S02).
 *
 * Every block fails without its change. Atlas, registry and preflight bodies are
 * canonical fixtures from `packages/contracts/fixtures`; where a block needs a
 * registry of a different shape (one ACTIVE entry, a recorded predecessor) it
 * is the canonical entry with the one field that block is about changed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { lineageHref } from "./lineageClient";
import { NewRun, WIZARD_FULL_WIDTH, stepCaption, supersedesFact, timelineRows } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft, soleActiveEntry } from "./NewRunRoute";
import type { PreflightResponse } from "./preflightClient";
import { shortId } from "./researchFormat";
import type { RunDraft } from "./runDraft";
import { forgetRunLabels, rememberRunLabel } from "./runLabels";
import { serializeRequestedSpec } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetRunLabels();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
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
/** The canonical entry serves `run_admission.may_create_run = false`; a step-caption test about "valid" needs one that can run. */
const ADMITTED = REGISTRY.entries.map((entry, index) => (index === 0 ? { ...entry, run_admission: { may_create_run: true, code: null } } : entry));
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });
const RUN_ID = "rrun_3258a4c450816129d2d285f25b801061";

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
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
    ...overrides,
  };
}

/** The screen reads one thing on its own (the P22 lookup for a bound version); it never answers here, so nothing updates outside the test. */
const PENDING = () => new Promise<Response>(() => undefined);

function mount(overrides: Partial<React.ComponentProps<typeof NewRun>> = {}) {
  vi.stubGlobal("fetch", vi.fn(PENDING));
  return render(
    <MemoryRouter>
      <NewRun
        draft={draft()}
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
      />
    </MemoryRouter>,
  );
}

const go = (step: string) => fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement);
const pill = (step: string) => document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement;
const caption = (step: string) => pill(step).querySelector("[data-step-caption]")?.textContent ?? null;

/* ---------------------------------------------------------------- D4 walk */

describe("D4 walk — the copied-from and sibling-of banners name the run, not its wire id", () => {
  it("copied-from prints the server's run label; the full id stays on the span", () => {
    rememberRunLabel(RUN_ID, "R-WFO-020");
    mount({ cloneSource: { runId: RUN_ID, state: OK } });
    const link = document.querySelector('[data-link="clone-source"]') as HTMLElement;
    expect(link.textContent).toBe("R-WFO-020");
    expect(link.textContent).not.toContain("rrun_");
    expect(link.querySelector("[data-run-id]")?.getAttribute("data-run-id")).toBe(RUN_ID);
  });

  it("sibling-of prints the label too", () => {
    rememberRunLabel(RUN_ID, "R-WFO-020");
    mount({ forkSource: { runId: RUN_ID, cellId: "c1", state: "ready", parameters: { a: "1" }, reason: null } });
    expect(document.querySelector('[data-link="fork-source"]')?.textContent).toBe("R-WFO-020");
  });

  it("the loading line names the run the same way", () => {
    rememberRunLabel(RUN_ID, "R-WFO-020");
    mount({ cloneSource: { runId: RUN_ID, state: researchState({ kind: "in-flight", hasAcceptedResponse: false }) } });
    const banner = document.querySelector("[data-clone-source]") as HTMLElement;
    expect(banner.textContent).toContain("Reading the declaration of R-WFO-020");
    expect(banner.textContent).not.toContain("rrun_");
  });

  it("a run no read has labelled keeps the short id — no number is invented", () => {
    mount({ cloneSource: { runId: RUN_ID, state: OK } });
    expect(document.querySelector('[data-link="clone-source"]')?.textContent).toBe(shortId(RUN_ID));
  });
});

/* -------------------------------------------------------- the real route */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function serve(options: { registry?: readonly RegistryEntry[]; label?: string | null } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url.pathname}${url.search}`);
    if (url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
    if (url.pathname === "/api/v1/research/alphas") return json({ ...REGISTRY, entries: options.registry ?? REGISTRY.entries });
    if (url.pathname === "/api/v1/research/datasets") return json(CATALOG);
    if (url.pathname.endsWith("/requested-spec")) {
      return json({
        schema_version: "research.run-requested-spec.v1",
        run_id: RUN_ID,
        requested_spec: serializeRequestedSpec(draft()),
        requested_spec_digest: "sha256:" + "a".repeat(64),
        alpha_id: ALPHA.alpha_id,
        alpha_version_id: ALPHA.alpha_version_id,
        execution_profile_id: "p10.delta-signal-notional-wfo.v1",
        created_at_utc_ms: 1790000000000,
        clone: { intent_kind: "NEW", requires_fresh_preflight: true },
      });
    }
    if (url.pathname === "/api/v1/quantbt/runs") {
      return json({ items: options.label ? [{ run_id: RUN_ID, display_label: options.label }] : [] });
    }
    return json({ error: { code: "RESEARCH_NOT_FOUND", message: "not found" }, request_id: "req_1" }, 404);
  }));
  return calls;
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-probe-search>{location.search}</span>
      <span data-probe-path>{location.pathname}</span>
      <button type="button" data-probe-back onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

async function mountRoute(entries: string[], index?: number) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <NewRunRoute />
      <Probe />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen=new-run]")).not.toBeNull());
  await settle();
}

describe("D4 walk — a cold ?from= link asks for the label", () => {
  it("reads the run's label by id and prints it in the banner", async () => {
    const calls = serve({ label: "R-WFO-020" });
    await mountRoute([`/research/quantbt/runs/new?from=${RUN_ID}`]);
    await waitFor(() => expect(document.querySelector('[data-link="clone-source"]')?.textContent).toBe("R-WFO-020"));
    expect(calls.some((call) => call.startsWith("GET /api/v1/quantbt/runs?") && call.includes(`ids=${RUN_ID}`))).toBe(true);
  });
});

/* ------------------------------------------------------------------ 02-2 */

describe("02-2 — frame and typography", () => {
  it("the screen draws no horizontal frame of its own: the shell owns the gutter (HiFi x=272)", () => {
    mount();
    const root = document.querySelector("[data-screen=new-run]") as HTMLElement;
    expect(root.className).not.toMatch(/(^|\s)px-/);
  });

  it("panel titles are Inter (the body face), not the serif an h2 inherits", () => {
    mount();
    const title = document.querySelector("[data-step-card] h2") as HTMLElement;
    expect(title.style.fontFamily).toBe("var(--font-body)");
    expect(title.className).toContain("font-semibold");
    expect(title.className).toContain("uppercase");
  });

  it("the installed-release line is the header's right-hand block, not a floater inside the title row", () => {
    mount();
    const note = document.querySelector("[data-release-note]") as HTMLElement;
    expect(note.parentElement?.tagName).toBe("HEADER");
    expect(note.parentElement?.className).toContain("items-end");
    expect(note.parentElement?.firstElementChild?.querySelector("h1")?.textContent).toBe("New Run");
  });
});

/* ------------------------------------------------------------------ 02-4 */

describe("02-4 — nothing is reported before a choice", () => {
  const blank = () => draft({ alphaId: "", alphaVersionId: "", strategyId: "" });

  it("a bound form with no version shows no passport and no 'not reported' labels", () => {
    mount({ draft: blank() });
    expect(document.querySelector("[data-passport]")).toBeNull();
    expect(document.querySelector("[data-missing-constraints]")).toBeNull();
    expect(document.querySelector("[data-declaration-bound]")).toBeNull();
    expect(document.body.textContent).not.toContain("not reported");
  });

  it("the passport appears once a version is chosen", () => {
    mount();
    expect(document.querySelector("[data-passport]")).not.toBeNull();
  });

  it("a scratch run keeps its banner and has no passport either", () => {
    mount({ draft: { ...blank(), bound: false } });
    expect(document.querySelector("[data-scratch-banner]")).not.toBeNull();
    expect(document.querySelector("[data-passport]")).toBeNull();
  });
});

describe("02-4 — the single ACTIVE version is preselected", () => {
  const active = (suffix: string, state: RegistryEntry["lifecycle_state"] = "ACTIVE"): RegistryEntry => ({
    ...ALPHA,
    alpha_id: `alpha-${suffix}`,
    alpha_version_id: `av_${suffix}_0_1_0`,
    lifecycle_state: state,
  });

  it("soleActiveEntry: exactly one ACTIVE entry, wherever it sits among the others", () => {
    expect(soleActiveEntry([active("a", "SUPERSEDED"), active("b")])?.alpha_id).toBe("alpha-b");
    expect(soleActiveEntry([active("a"), active("b")])).toBeNull();
    expect(soleActiveEntry([active("a", "DRAFT")])).toBeNull();
    expect(soleActiveEntry([])).toBeNull();
  });

  it("a plain visit to a registry with one ACTIVE version opens bound to it", async () => {
    serve({ registry: [active("only"), active("older", "SUPERSEDED")] });
    await mountRoute(["/research/quantbt/runs/new"]);
    await waitFor(() => expect((screen.getByLabelText("Alpha") as HTMLSelectElement).value).toBe("alpha-only"));
    expect((screen.getByLabelText("Alpha version") as HTMLSelectElement).value).toBe("av_only_0_1_0");
    expect(document.querySelector("[data-binding-chip]")?.textContent).toContain("PUBLISHABLE");
  });

  it("two ACTIVE versions: the reader chooses, nothing is bound", async () => {
    serve({ registry: [active("one"), active("two")] });
    await mountRoute(["/research/quantbt/runs/new"]);
    expect((screen.getByLabelText("Alpha") as HTMLSelectElement).value).toBe("");
    expect(document.querySelector("[data-passport]")).toBeNull();
  });

  it("an explicit ?alpha=&av= link wins over the preselection", async () => {
    serve({ registry: [active("only"), active("other", "DRAFT")] });
    await mountRoute(["/research/quantbt/runs/new?alpha=alpha-other&av=av_other_0_1_0"]);
    await waitFor(() => expect((screen.getByLabelText("Alpha") as HTMLSelectElement).value).toBe("alpha-other"));
  });
});

/* ------------------------------------------------------------ 02-5 / 02-5b */

describe("02-5 — supersedes, as a typed fact", () => {
  const entry = (supersedes: string | null | undefined, state: "RECORDED" | "HISTORICAL_NOT_RECORDED" | undefined) =>
    ({ supersedes, supersedes_state: state }) as Pick<RegistryEntry, "supersedes" | "supersedes_state">;

  it("a recorded predecessor is named by its version label when the registry lists it", () => {
    const older = { ...ALPHA, alpha_version_id: "av_alpha_demo_0_2_0", version_label: "av_0_2_0" };
    expect(supersedesFact(entry("av_alpha_demo_0_2_0", "RECORDED"), [older, ALPHA])).toEqual({ kind: "version", text: "av_0_2_0", code: null });
    expect(supersedesFact(entry("av_unlisted_0_1_0", "RECORDED"), [ALPHA])).toEqual({ kind: "version", text: "av_unlisted_0_1_0", code: null });
  });

  it("RECORDED with no predecessor is a first version; HISTORICAL_NOT_RECORDED claims nothing and carries the server's code", () => {
    expect(supersedesFact(entry(null, "RECORDED"), [])?.kind).toBe("none");
    expect(supersedesFact(entry(null, "HISTORICAL_NOT_RECORDED"), [])).toEqual({ kind: "absent", text: "not recorded", code: "HISTORICAL_NOT_RECORDED" });
    expect(supersedesFact(entry(undefined, undefined), [])).toEqual({ kind: "absent", text: "not reported", code: null });
    expect(supersedesFact(null, [])).toBeNull();
  });

  it("the passport prints supersedes; a historical row shows the typed absence", () => {
    mount({ registry: [{ ...ALPHA, supersedes: null, supersedes_state: "HISTORICAL_NOT_RECORDED" }] });
    const fact = document.querySelector("[data-supersedes]") as HTMLElement;
    expect(fact.getAttribute("data-supersedes")).toBe("absent");
    expect(fact.textContent).toContain("not recorded");
    /* The code is the tooltip, not part of the line. */
    expect(fact.textContent).not.toContain("HISTORICAL_NOT_RECORDED");
    expect(fact.querySelector("[data-supersedes-code]")?.getAttribute("title")).toBe("HISTORICAL_NOT_RECORDED");
    expect(fact.textContent).not.toMatch(/\b0\b|—/);
  });
});

describe("02-5b — where this version goes next", () => {
  it("lineage, runs of the alpha and import-a-version are links with real targets", () => {
    mount();
    const links = document.querySelector("[data-passport-links]") as HTMLElement;
    expect(links.querySelector('[data-action="open-lineage"]')?.getAttribute("href")).toBe(lineageHref(ALPHA.alpha_id, { av: ALPHA.alpha_version_id }));
    expect(links.querySelector('[data-link="alpha-runs"]')?.getAttribute("href")).toBe(`/research/quantbt/runs?alpha=${encodeURIComponent(ALPHA.alpha_id)}`);
    expect(links.querySelector('[data-link="import-version"]')?.getAttribute("href")).toBe("/research/quantbt/alpha-import");
    /* The library filters by alpha, so the link does not claim a version filter. */
    expect(links.textContent).not.toContain("av_ →");
  });

  it("no links before a version is chosen", () => {
    mount({ draft: draft({ alphaId: "", alphaVersionId: "", strategyId: "" }) });
    expect(document.querySelector("[data-passport-links]")).toBeNull();
  });

  it("the lifecycle value carries the release-candidate note as a tooltip and is not printed as a sentence", () => {
    mount({ registry: [{ ...ALPHA, lifecycle_state: "ACTIVE" }] });
    const state = document.querySelector("[data-lifecycle-state]") as HTMLElement;
    expect(state.textContent).toBe("ACTIVE");
    expect(state.getAttribute("title")).toContain("compose a release candidate");
    expect(document.body.textContent).not.toContain("compose a release candidate");
  });

  it("a DRAFT version says, in its tooltip, that it cannot compose one", () => {
    mount({ registry: [{ ...ALPHA, lifecycle_state: "DRAFT" }] });
    expect(document.querySelector("[data-lifecycle-state]")?.getAttribute("title")).toContain("cannot compose");
  });
});

/* ------------------------------------------------------------------ 02-7 */

describe("02-7 — live captions", () => {
  const base = { step: "data" as const, current: false, hasError: false, visited: true, contextChosen: true, reviewCaption: "preflight pending" };

  it("stepCaption: valid · needs attention · not visited, and Review carries the preflight's state", () => {
    expect(stepCaption(base)).toEqual({ state: "valid", caption: "valid" });
    expect(stepCaption({ ...base, hasError: true })).toEqual({ state: "error", caption: "needs attention" });
    expect(stepCaption({ ...base, visited: false })).toEqual({ state: "not-visited", caption: "not visited" });
    expect(stepCaption({ ...base, current: true })).toEqual({ state: "current", caption: "valid" });
    expect(stepCaption({ ...base, step: "review", current: true })).toEqual({ state: "current", caption: "preflight pending" });
    expect(stepCaption({ ...base, step: "review" }).state).toBe("visited");
    expect(stepCaption({ ...base, step: "review", visited: false }).state).toBe("not-visited");
  });

  it("Context is not valid while no version is chosen", () => {
    const context = { ...base, step: "context" as const, contextChosen: false };
    expect(stepCaption(context)).toEqual({ state: "incomplete", caption: "no version chosen" });
    expect(stepCaption({ ...context, current: true })).toEqual({ state: "current", caption: "no version chosen" });
    expect(stepCaption({ ...context, contextChosen: true }).caption).toBe("valid");
  });

  it("the bar prints them: a visited passing step says valid, a visited failing one needs attention, an unvisited one is not visited", () => {
    mount({ draft: draft({ symbol: "" }), registry: ADMITTED });
    expect(caption("context")).toBe("valid");
    expect(caption("data")).toBe("not visited");
    go("data");
    /* On the step, nothing typed yet: not "needs attention" and never "valid". */
    expect(caption("data")).toBe("in progress");
    go("route");
    expect(caption("data")).toBe("needs attention");
    expect(caption("route")).toBe("valid");
    expect(caption("strategy")).toBe("not visited");
  });

  it("Review reads pending, then issued once the server's preflight exists, refused when it refused", () => {
    const { unmount } = mount();
    expect(caption("review")).toBe("preflight pending");
    unmount();
    mount({ preflight: PREFLIGHT });
    expect(caption("review")).toBe("preflight issued");
    cleanup();
    mount({ preflightRefusal: { code: "RESEARCH_PREFLIGHT_INVALID", gate: null, fieldPath: null, requestId: null, copy: "refused", status: 400 } as never });
    expect(caption("review")).toBe("preflight refused");
  });

  function narrow(width: number) {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: () => void) {}
      observe() { this.callback(); }
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() { return (this as HTMLElement).getAttribute("role") === "tablist" ? width : 0; },
    });
  }

  it("below the full width the other seven pills collapse to their mark and keep a name; the current one keeps its text", () => {
    narrow(WIZARD_FULL_WIDTH - 1);
    mount({ registry: ADMITTED });
    expect(document.querySelector("[role=tablist]")?.getAttribute("data-wizard-compact")).toBe("true");
    expect(document.querySelectorAll("[role=tab]")).toHaveLength(8);
    expect(document.querySelectorAll("[data-step-caption]")).toHaveLength(1);
    expect(pill("context").textContent).toContain("Context");
    expect(pill("route").textContent).toBe("3");
    expect(pill("route").getAttribute("aria-label")).toBe("Route — not visited");
    expect(pill("route").getAttribute("title")).toBe("Route — not visited");
    expect(screen.getByRole("tab", { name: /Market data/ })).toBeTruthy();
    go("route");
    expect(pill("route").textContent).toContain("Route");
    expect(pill("context").textContent).toBe("✓");
  });

  it("at the full width every pill keeps its caption", () => {
    narrow(WIZARD_FULL_WIDTH + 200);
    mount();
    expect(document.querySelector("[role=tablist]")?.getAttribute("data-wizard-compact")).toBeNull();
    expect(document.querySelectorAll("[data-step-caption]")).toHaveLength(8);
  });
});

/* ---------------------------------------------------------------- 02-10a */

describe("02-10a — the window timeline is proportional bars", () => {
  const three = (overrides: Partial<RunDraft["windows"]> = {}) => ({
    protocol: "three_window_decay" as const,
    walkForward: emptyDraft().walkForward,
    windows: {
      is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" },
      oos: { start: "2026-03-01T00:00", endExclusive: "2026-04-01T00:00" },
      holdout: { start: "2026-04-01T00:00", endExclusive: "2026-05-01T00:00" },
      ...overrides,
    },
  });

  it("each window is a segment placed and sized by its own dates inside the common frame", () => {
    const rows = timelineRows(three());
    const total = Date.parse("2026-05-01T00:00Z") - Date.parse("2026-01-01T00:00Z");
    const share = (from: string, to: string) => ((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / total) * 100;
    const [is, oos, holdout] = rows.map((row) => row.segments[0]!);
    expect(is!.left).toBe(0);
    expect(is!.width).toBeCloseTo(share("2026-01-01T00:00", "2026-03-01T00:00"), 6);
    expect(oos!.left).toBeCloseTo(is!.width, 6);
    expect(holdout!.left + holdout!.width).toBeCloseTo(100, 6);
    expect(rows.map((row) => row.tone)).toEqual(["var(--role-is)", "var(--role-oos)", "var(--role-holdout)"]);
    expect(rows[0]!.segments[0]!.title).toBe("IS [2026-01-01T00:00, 2026-03-01T00:00)");
  });

  it("a window with a missing or reversed edge draws nothing and the others still draw", () => {
    const rows = timelineRows(three({ oos: { start: "", endExclusive: "2026-04-01T00:00" }, holdout: { start: "2026-05-01T00:00", endExclusive: "2026-04-01T00:00" } }));
    expect(rows[0]!.segments).toHaveLength(1);
    expect(rows[1]!.segments).toHaveLength(0);
    expect(rows[1]!.text).toBe("not declared → 2026-04-01T00:00");
    expect(rows[2]!.segments).toHaveLength(0);
  });

  it("an empty declaration draws three empty tracks and says not declared", () => {
    const rows = timelineRows({ protocol: "three_window_decay", walkForward: emptyDraft().walkForward, windows: emptyDraft().windows });
    expect(rows.every((row) => row.segments.length === 0)).toBe(true);
    expect(rows[0]!.text).toBe("not declared → not declared");
  });

  it("advanced: one span, split at the first OOS instant into an IS part and an OOS part", () => {
    const rows = timelineRows({
      protocol: "advanced",
      windows: emptyDraft().windows,
      walkForward: { ...emptyDraft().walkForward, start: "2026-01-01T00:00", endExclusive: "2026-01-11T00:00", splitMode: "2026-01-04T00:00" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.segments.map((segment) => [segment.tone, Math.round(segment.left), Math.round(segment.width)])).toEqual([
      ["var(--role-is)", 0, 30],
      ["var(--role-oos)", 30, 70],
    ]);
  });

  it("advanced without a usable first OOS instant is one neutral bar — the split is not guessed", () => {
    const rows = timelineRows({
      protocol: "advanced",
      windows: emptyDraft().windows,
      walkForward: { ...emptyDraft().walkForward, start: "2026-01-01T00:00", endExclusive: "2026-01-11T00:00", splitMode: "" },
    });
    expect(rows[0]!.segments).toEqual([expect.objectContaining({ left: 0, width: 100, tone: "var(--line-strong)" })]);
  });

  it("the rail draws the tracks, keeps the exact dates as text and gives each track an accessible name", () => {
    mount({ draft: draft({ windows: three().windows }) });
    const rail = document.querySelector("[data-window-timeline]") as HTMLElement;
    expect(rail.querySelectorAll("[data-timeline-segment]")).toHaveLength(3);
    const segment = rail.querySelector('[data-timeline-segment="oos"]') as HTMLElement;
    expect(segment.style.left).not.toBe("");
    expect(segment.style.width).not.toBe("");
    expect(rail.querySelector('[data-timeline-text="is"]')?.textContent).toBe("2026-01-01T00:00 → 2026-03-01T00:00");
    expect(rail.querySelector('[data-timeline-track="is"]')?.getAttribute("aria-label")).toBe("IS 2026-01-01T00:00 → 2026-03-01T00:00");
  });

  it("no per-window bar count is printed: the server publishes none (CG-FG-S02-02)", () => {
    mount({ draft: draft({ windows: three().windows }) });
    expect(document.querySelector("[data-window-timeline]")?.textContent).not.toMatch(/\bbars\b/);
  });
});

/* ------------------------------------------------------------------ 02-9 */

describe("02-9 — the gold claim-forecast card", () => {
  it("is drawn in the holdout gold with the card's own shadow", () => {
    mount();
    const card = document.querySelector("[data-claim-forecast]") as HTMLElement;
    expect(card.style.borderColor).toBe("var(--role-holdout)");
    expect(card.style.boxShadow).toBe("var(--shadow-e2)");
    expect(card.querySelector("h4")?.textContent).toBe("Claim forecast");
  });

  it("before a preflight the payload digest is pending, not a made-up hash", () => {
    mount();
    expect(document.querySelector("[data-payload-digest]")?.getAttribute("data-payload-digest")).toBe("pending");
    expect(document.querySelector("[data-claim-forecast]")?.textContent).toContain("payload sha256 · after preflight");
  });

  it("with a preflight it prints the server's requested_spec_digest, shortened, the whole value in the title", () => {
    mount({ preflight: PREFLIGHT });
    const digest = document.querySelector("[data-payload-digest]") as HTMLElement;
    expect(digest.getAttribute("data-payload-digest")).toBe(PREFLIGHT.requested_spec_digest);
    expect(digest.getAttribute("title")).toBe(PREFLIGHT.requested_spec_digest);
    expect(digest.textContent).toBe(`payload sha256:${PREFLIGHT.requested_spec_digest.replace(/^sha256:/, "").slice(0, 8)}`);
  });

  it("lists mode × schedule, source, the forecast claim, and the cert ceiling as 'not published' with the server's reason", () => {
    mount();
    const text = document.querySelector("[data-claim-forecast]")?.textContent ?? "";
    expect(text).toContain("mode × schedule");
    expect(text).toContain("mode_1_decay × global");
    expect(text).toContain("source");
    /* Picking a mode sets its default schedule; the card says so instead of claiming the reader chose it. */
    expect(text).toContain("mode default");
    expect(text).not.toContain("chosen in Walk-forward step");
    expect(text).toContain("claim (forecast)");
    expect(document.querySelector("[data-cert-ceiling-absent]")?.textContent).toBe("not published");
    expect(document.querySelector("[data-cert-cap-reason]")?.getAttribute("title")?.length).toBeGreaterThan(20);
  });

  it("the augmentation paragraph is the card's tooltip, not printed text", () => {
    mount();
    const card = document.querySelector("[data-claim-forecast]") as HTMLElement;
    expect(card.getAttribute("title")).toContain("never changes it");
    expect(card.textContent).not.toContain("never changes it");
  });
});

/* ----------------------------------------------------------------- 02-11 */

describe("02-11 — one heading on the route card", () => {
  it("the card is titled 'Execution route — how orders come to exist' and the panel around it has no second heading", () => {
    mount();
    go("route");
    const headings = [...document.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings).toContain("Execution route — how orders come to exist");
    const panel = document.querySelector('[data-research-panel="engine routes"]') as HTMLElement;
    expect(panel.querySelector("h2, h3")).toBeNull();
    expect(headings.filter((text) => /route/i.test(text ?? "") && text !== "Execution route — how orders come to exist")).toEqual([]);
  });

  it("the atlas link is inside the route card and nowhere else", () => {
    mount();
    expect(document.querySelector('[data-link="atlas"]')).toBeNull();
    go("route");
    const link = document.querySelector('[data-link="atlas"]') as HTMLElement;
    expect(link.getAttribute("href")).toBe("/research/quantbt/atlas");
    expect(link.closest("[data-step-card]")?.getAttribute("data-step-card")).toBe("Execution route — how orders come to exist");
    expect(link.textContent).toBe("full route atlas →");
  });

  it("an unavailable Atlas keeps the card's heading and the link, and withholds the grid", () => {
    mount({ atlas: null, atlasState: researchState({ kind: "transport", status: 503, retryable: false }) });
    go("route");
    expect(document.querySelector("[data-step-card] h2")?.textContent).toBe("Execution route — how orders come to exist");
    expect(document.querySelector('[data-link="atlas"]')).not.toBeNull();
    expect(document.querySelector("[data-route-grid]")).toBeNull();
  });

  it("'Data' is 'Market data' on the pill and the card", () => {
    mount();
    expect(pill("data").textContent).toContain("Market data");
    go("data");
    expect(document.querySelector("[data-step-card] h2")?.textContent).toBe("Market data");
  });
});

/* ----------------------------------------------------------------- 02-16 */

describe("02-16 — the summary table is the Review step's main panel", () => {
  it("on Review the rows sit in the main column and the rail does not repeat them", () => {
    mount();
    go("review");
    const main = document.querySelector("[data-review-step]") as HTMLElement;
    const table = main.querySelector("[data-review-rows]") as HTMLElement;
    expect(table).not.toBeNull();
    expect(main.querySelector("[data-step-card]")?.getAttribute("data-step-card")).toBe("Review & run");
    for (const label of ["alpha binding", "execution route", "strategy_id", "dataset · symbol · tf", "protocol", "windows", "parameter_space", "mode × schedule", "trials · stop · seed", "optimization_config"]) {
      expect(table.querySelector(`[data-review-row="${label}"]`), label).not.toBeNull();
    }
    expect(document.querySelector("[data-review-rail] [data-review-rows]")).toBeNull();
    /* The rail still carries the timeline and the forecast. */
    expect(document.querySelector("[data-review-rail] [data-window-timeline]")).not.toBeNull();
    expect(document.querySelector("[data-review-rail] [data-claim-forecast]")).not.toBeNull();
  });

  it("on every other step the rail keeps its compact rows", () => {
    mount();
    expect(document.querySelector("[data-review-rail] [data-review-rows]")).not.toBeNull();
    go("data");
    expect(document.querySelector("[data-review-rail] [data-review-rows]")).not.toBeNull();
    expect(document.querySelector("[data-review-rail] [data-review-row=\"windows\"]")).toBeNull();
  });

  it("the windows row names the three starts by day, or says not declared", () => {
    mount({ draft: draft({ windows: { is: { start: "2026-01-01T00:00", endExclusive: "2026-03-01T00:00" }, oos: { start: "2026-03-01T00:00", endExclusive: "2026-04-01T00:00" }, holdout: { start: "", endExclusive: "" } } }) });
    go("review");
    expect(document.querySelector('[data-review-row="windows"]')?.textContent).toContain("IS 2026-01-01 → OOS 2026-03-01 → holdout not declared");
  });

  it("the primary action is still below the table, not buried under panels", () => {
    mount();
    go("review");
    const main = document.querySelector("[data-review-step]") as HTMLElement;
    const order = [...main.querySelectorAll("[data-review-rows], [data-action=preflight]")].map((node) => node.hasAttribute("data-review-rows") ? "rows" : "preflight");
    expect(order).toEqual(["rows", "preflight"]);
  });
});

/* ----------------------------------------------------------------- 02-18 */

describe("02-18 — the step is written to the address", () => {
  it("the screen reports the step the reader is on", () => {
    const onStepChange = vi.fn();
    mount({ onStepChange });
    expect(onStepChange).toHaveBeenLastCalledWith("context");
    go("windows");
    expect(onStepChange).toHaveBeenLastCalledWith("windows");
  });

  it("picking a step writes ?step= (replace), keeps other parameters, and context leaves the address clean", async () => {
    serve();
    await mountRoute(["/elsewhere", "/research/quantbt/runs/new?route=signal_notional"], 1);
    const search = () => document.querySelector("[data-probe-search]")?.textContent;
    expect(search()).toBe("?route=signal_notional");
    go("data");
    await waitFor(() => expect(search()).toBe("?route=signal_notional&step=data"));
    go("review");
    await waitFor(() => expect(search()).toBe("?route=signal_notional&step=review"));
    go("context");
    await waitFor(() => expect(search()).toBe("?route=signal_notional"));
    /* Replace, not push: Back leaves the form, it does not walk the steps. */
    fireEvent.click(document.querySelector("[data-probe-back]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-probe-path]")?.textContent).toBe("/elsewhere"));
  });

  it("opening on ?step= does not rewrite the address", async () => {
    serve();
    await mountRoute(["/research/quantbt/runs/new?step=optimization"]);
    expect(document.querySelector("[data-probe-search]")?.textContent).toBe("?step=optimization");
    expect(pill("optimization").getAttribute("aria-selected")).toBe("true");
  });
});
