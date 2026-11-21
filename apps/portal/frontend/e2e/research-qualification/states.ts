/**
 * P23 qualification lane — which of the project's component states each of
 * the fifteen Research screens can actually reach, and how the fixture lane
 * puts it there (FG-07).
 *
 * The seven states are the project's (`loading / empty / partial / stale /
 * denied / unavailable / terminal`, `src/lib/portalState.ts`), plus `healthy`
 * and `expired` (401). A state a screen's client cannot produce is
 * NOT_APPLICABLE with the file:line that proves it — never skipped silently.
 * Reachability was read from the client code of the working tree on
 * 2026-09-29; the file:line references are to that tree.
 *
 * Every body below is typed against `packages/contracts/generated/*.d.ts`
 * (directly, or through the typed builders in `stubs.ts`), so a contract
 * change that makes one stale fails `tsc -p e2e/research-qualification`.
 */
import type { Page } from "@playwright/test";

import type { components as AlphaImportC } from "../../../../../packages/contracts/generated/research-alpha-import";
import type { components as EvidenceC } from "../../../../../packages/contracts/generated/research-evidence";
import type { components as FreezeC } from "../../../../../packages/contracts/generated/research-freeze";
import type { components as LineageC } from "../../../../../packages/contracts/generated/research-attempt-lineage";
import type { components as SearchC } from "../../../../../packages/contracts/generated/research-search";
import type { components as SplitC } from "../../../../../packages/contracts/generated/research-split";

import { spaNavigate } from "./harness";
import {
  ALPHA,
  EVIDENCE_RUN,
  RC_ID,
  RC_RUN,
  compareAttempts,
  contractFixture,
  foundation,
  hold,
  progressRead,
  rcCompose,
  rcPublication,
  refusePrimary,
  replayWindow,
  serve,
  type RunLibrary,
  type ScreenDef,
} from "./stubs";

type EvidenceHub = EvidenceC["schemas"]["EvidenceHub"];
type SplitDetail = SplitC["schemas"]["SplitDetail"];
type SearchDetail = SearchC["schemas"]["SearchDetail"];
type FreezeDetail = FreezeC["schemas"]["FreezeDetail"];
type Registry = AlphaImportC["schemas"]["RegistryListResponse"];
type Lineage = LineageC["schemas"]["AttemptLineageResponse"];

export const STATES = ["healthy", "loading", "empty", "partial", "stale", "denied", "unavailable", "terminal", "expired"] as const;
export type State = (typeof STATES)[number];

/** What the cell does after the deep link opened (stale needs a sequence). */
export interface ActContext {
  page: Page;
  s: ScreenDef;
  /** Waits until no `/api/` request is in flight (the harness `quiet`). */
  quiet: () => Promise<void>;
}

export interface Recipe {
  /** Deep link when it differs from the screen's own (`ScreenDef.path`). */
  path?: string;
  /** The read refused in denied/unavailable/terminal/expired, when it differs from `ScreenDef.primary`. */
  primary?: RegExp;
  /** Status + typed code of the refusal (denied/unavailable/terminal/expired). */
  refuse?: { status: number; code?: string };
  /** Route overrides installed before the page opens. */
  arrange?: (page: Page) => Promise<void>;
  /** Parks the primary read while the cell is measured (loading). */
  holdPrimary?: boolean;
  /** Brings the measured panel into view right after every open (a hidden wizard step), before the marker wait. */
  reveal?: (page: Page) => Promise<void>;
  /** Sequence after the page opened; the cell is measured when it returns. */
  act?: (ctx: ActContext) => Promise<void>;
  /** Visible element unique to this state inside the page. */
  marker: string;
  /** Where the client produces it. */
  source: string;
}

export type Plan = { state: State; kind: "RUN"; recipe: Recipe } | { state: State; kind: "NOT_APPLICABLE"; reason: string };

/* ----------------------------------------------------------------- helpers */

const run = (state: State, recipe: Recipe): Plan => ({ state, kind: "RUN", recipe });
const na = (state: State, reason: string): Plan => ({ state, kind: "NOT_APPLICABLE", reason });
const refusal = (state: State, status: number, marker: string, source: string, extra: Partial<Recipe> = {}): Plan =>
  run(state, { refuse: { status }, marker, source, ...extra });
const terminal400 = (code: string, marker: string, source: string, extra: Partial<Recipe> = {}): Plan =>
  run("terminal", { refuse: { status: 400, code }, marker, source, ...extra });
const loading = (marker: string, source: string, extra: Partial<Recipe> = {}): Plan => run("loading", { holdPrimary: true, marker, source, ...extra });
const expired = (): Plan => run("expired", { refuse: { status: 401 }, marker: SIGN_IN, source: "auth/AuthGate.tsx:79-84,105-106 · auth/AccessProblemScreen.tsx:91" });

/** The shell's Frame 01D (the screen root is replaced on 401). */
export const SIGN_IN = "[data-testid='access-problem-screen'][data-problem='SESSION_EXPIRED']";

const RE_SPLIT = /\/api\/v1\/quantbt\/runs\/[^/?]+\/split(\?|$)/;
const RE_SEARCH = /\/api\/v1\/quantbt\/runs\/[^/?]+\/search(\?|$)/;
const RE_ATLAS = /\/api\/v1\/research\/quantbt\/atlas(\?|$)/;
const RE_REGISTRY = /\/api\/v1\/research\/alphas(\?|$)/;
const RE_REPLAY = /\/api\/v1\/quantbt\/runs\/[^/?]+\/execute\/replay(\?|$)/;
const RE_COMPARE = /\/api\/v1\/research\/alphas\/[^/?]+\/compare(\?|$)/;
const RE_COMPOSE = /\/api\/v1\/quantbt\/runs\/[^/?]+\/release-candidate(\?|$)/;
const RE_PUBLICATION = /\/api\/v1\/research\/release-candidates\/[^/?]+\/publication(\?|$)/;

/** 409 on a re-read over an accepted, cached body, reached by leaving and returning through history. */
function staleViaHistory(re: RegExp, code: string, leave: string): Recipe["act"] {
  return async ({ page, s, quiet }) => {
    await refusePrimary(page, re, 409, code);
    await page.locator(`${s.root} ${leave}`).first().click();
    await page.waitForURL((url) => !url.pathname.endsWith(new URL(s.path, "http://x").pathname), { timeout: 10_000 });
    await quiet();
    await page.goBack();
    await page.locator(s.root).first().waitFor({ state: "visible", timeout: 15_000 });
    await quiet();
  };
}

/* ------------------------------------------------------------ body builders */

const registryEmpty = (): Registry => ({ ...foundation<Registry>("alpha-registry.json"), entries: [] });

const evidenceEmpty = (): EvidenceHub => ({ ...foundation<EvidenceHub>("evidence-hub.json"), metrics: [] });

const splitNotReady = (): SplitDetail => ({ ...foundation<SplitDetail>("split-detail.json"), readiness: "NOT_READY" });

const searchNotReady = (): SearchDetail => ({ ...foundation<SearchDetail>("search-detail.json"), readiness: "NOT_READY" });

function freezeNoChecks(): FreezeDetail {
  const base = foundation<FreezeDetail>("freeze-detail.json");
  return { ...base, freeze: { ...base.freeze, integrity: { ...base.freeze.integrity, checks: [] } } };
}

function progressPartial() {
  const base = progressRead("RUNNING");
  return { ...base, progress: { ...base.progress!, source: { ...base.progress!.source, partial: true } } };
}

function replayEmpty() {
  const base = replayWindow(EVIDENCE_RUN, 0);
  return {
    ...base,
    equity_replay: {
      ...base.equity_replay,
      emitted_point_count: 0,
      items: [],
      page: { ...base.equity_replay.page, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false },
    },
  };
}

function lineageEmpty(): Lineage {
  const base = contractFixture<Lineage>("research-attempt-lineage.empty");
  return contractFixture<Lineage>("research-attempt-lineage.empty", [[base.alpha.alpha_id, ALPHA]]);
}

function compareEmpty() {
  const base = compareAttempts();
  if (base.result.mode !== "attempts") throw new Error("research-compare.attempts is not an attempts result");
  return {
    ...base,
    availability: { state: "NOT_PUBLISHED" as const, reason_code: "P20_ALPHA_HAS_NO_COMPAREABLE_PRIMARY_RUN" },
    result: { ...base.result, attempts: [], fold_series: [], coverage: { ...base.result.coverage, total_attempts: 0 } },
  } satisfies ReturnType<typeof compareAttempts>;
}

function comparePartial() {
  const base = compareAttempts();
  if (base.result.mode !== "attempts") throw new Error("research-compare.attempts is not an attempts result");
  return {
    ...base,
    result: { ...base.result, coverage: { state: "PARTIAL" as const, total_attempts: 5, reason_code: "P20_BOUNDED_ATTEMPT_LIMIT_REACHED" } },
  } satisfies ReturnType<typeof compareAttempts>;
}

const composePartial = () => ({ ...rcCompose(), availability: { state: "PARTIAL" as const, reason_code: "P21_SOURCE_DEGRADED_EVIDENCE" } }) satisfies ReturnType<typeof rcCompose>;

/* ------------------------------------------------------------------- plan */

const PLAN: Record<string, readonly Plan[]> = {
  /* S00 journey map — JourneyMap.tsx, foundationRoutes.tsx, foundationClient.ts */
  "00": (() => {
    const p = (state: string) => `[data-research-panel='journey'][data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "JourneyMap.tsx:356" }),
      loading(p("loading"), "foundationRoutes.tsx:60,75"),
      run("empty", { refuse: { status: 404, code: "RESEARCH_FOUNDATION_NOT_FOUND" }, marker: p("empty"), source: "foundationClient.ts:212,250 (a typed foundation NOT_FOUND is `empty`)" }),
      na("partial", "foundationRoutes.tsx:83 — an OK journey read always resolves to rowCount 1 with no declaredUnavailable"),
      run("stale", { refuse: { status: 503 }, marker: p("stale"), source: "foundationRoutes.tsx:134-141 — a failed live read shows the bundled v3 map as stale" }),
      refusal("denied", 403, p("denied"), "foundationClient.ts:297-309 · researchRefusal.ts:152"),
      na("unavailable", "foundationRoutes.tsx:134-141 — a 503 on the journey read is rendered as the stale bundled map (see stale), so `unavailable` never renders"),
      terminal400("RESEARCH_FOUNDATION_INVALID", p("terminal"), "foundationClient.ts:208-222,249"),
      expired(),
    ];
  })(),

  /* S12 engine atlas — EngineAtlas.tsx, foundationRoutes.tsx */
  "12": (() => {
    const p = (state: string) => `[data-research-panel^='atlas'][data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "EngineAtlas.tsx:1469-1477" }),
      loading(p("loading"), "foundationRoutes.tsx:190-192"),
      run("empty", { refuse: { status: 404, code: "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND" }, marker: p("empty"), source: "foundationClient.ts:226-236,251-253" }),
      na("partial", "foundationRoutes.tsx:83 — an OK atlas read always resolves to rowCount 1"),
      run("stale", {
        /* An in-app link to another release: the accepted atlas stays while the new read is in flight. */
        act: async ({ page }) => {
          await hold(page, RE_ATLAS, (url) => url.searchParams.get("release_id") === "er_quantbt_108");
          await spaNavigate(page, "/research/quantbt/atlas?release_id=er_quantbt_108");
        },
        marker: p("stale"),
        source: "foundationRoutes.tsx:75,184,192 · state.ts:114",
      }),
      refusal("denied", 403, p("denied"), "foundationClient.ts:297-309"),
      refusal("unavailable", 503, p("unavailable"), "researchRefusal.ts:158,178"),
      terminal400("RESEARCH_FOUNDATION_INVALID", p("terminal"), "foundationClient.ts:211,249"),
      expired(),
    ];
  })(),

  /* S02 new run — NewRun.tsx, NewRunRoute.tsx. The atlas is visible only on
     `?step=route` ("engine routes" panel); the context step shows the
     registry's "version declaration" panel (NewRunRoute.tsx:376,382). */
  "02": (() => {
    const route = "/research/quantbt/runs/new?step=route";
    const r = (state: string) => `[data-research-panel='engine routes'][data-state='${state}']`;
    const d = (state: string) => `[data-research-panel='version declaration'][data-state='${state}']`;
    return [
      run("healthy", { marker: d("available"), source: "NewRun.tsx version declaration panel · NewRunRoute.tsx:382" }),
      loading(r("loading"), "NewRunRoute.tsx:113-114", { path: route, primary: RE_ATLAS }),
      run("empty", { arrange: (page) => serve(page, RE_REGISTRY, registryEmpty), marker: d("empty"), source: "NewRunRoute.tsx:155 · state.ts:143-148" }),
      na("partial", "NewRunRoute.tsx:125,155 · usePreflight.ts:138 — atlas, registry and preflight OK paths only carry rowCount"),
      na("stale", "NewRunRoute.tsx:117-141,148-170 — atlas and registry are read once (effect deps []); usePreflight.ts:127 and useNewRun.ts:173 run with hasAcceptedResponse:false"),
      refusal("denied", 403, r("denied"), "NewRunRoute.tsx:129-135 · researchRefusal.ts:152", { path: route, primary: RE_ATLAS }),
      refusal("unavailable", 503, r("unavailable"), "NewRunRoute.tsx:129-135", { path: route, primary: RE_ATLAS }),
      terminal400("RESEARCH_FOUNDATION_INVALID", r("terminal"), "foundationClient.ts:211", { path: route, primary: RE_ATLAS }),
      expired(),
    ];
  })(),

  /* S14 alpha import — AlphaImport.tsx, useAlphaImport.ts. The three wizard
     panels are `empty` by design on load; only the registry panel is measured.
     It lives in the hidden step-3 tabpanel (AlphaImport.tsx:1137-1142), so every
     cell opens that step first. */
  "14": (() => {
    const p = (state: string) => `[data-research-panel='alpha registry'][data-state='${state}']`;
    const reveal = async (page: Page) => {
      await page.locator("#ai-tab-3").click();
    };
    const plans: Plan[] = [
      run("healthy", { marker: p("available"), source: "AlphaImport.tsx:1260-1261" }),
      loading(p("loading"), "useAlphaImport.ts:90-92"),
      run("empty", { arrange: (page) => serve(page, RE_REGISTRY, registryEmpty), marker: p("empty"), source: "useAlphaImport.ts:102 · state.ts:143-148" }),
      na("partial", "useAlphaImport.ts:102 — an OK registry read only carries rowCount"),
      na("stale", "useAlphaImport.ts:97-113,252 — loadRegistry re-reads without an in-flight state; step writes use hasAcceptedResponse:false"),
      refusal("denied", 403, p("denied"), "alphaImportClient.ts:287-291"),
      refusal("unavailable", 503, p("unavailable"), "alphaImportClient.ts:287"),
      terminal400("RESEARCH_ALPHA_IMPORT_INVALID", p("terminal"), "alphaImportClient.ts:148,248"),
      expired(),
    ];
    return plans.map((plan) => (plan.kind === "RUN" && plan.state !== "expired" ? { ...plan, recipe: { ...plan.recipe, reveal } } : plan));
  })(),

  /* S01 run library — RunLibrary.tsx, useRunLibrary.ts. Loading and empty do
     not use ResearchPanel; they carry their own markers. */
  "01": (() => {
    const lib = (state: string) => `[data-research-panel='run library'][data-state='${state}']`;
    return [
      run("healthy", { marker: "[data-research-panel='runs'][data-state='available']", source: "RunLibrary.tsx:2238-2239" }),
      loading("[data-skeleton][aria-label='Loading runs']", "RunLibrary.tsx:1479,2218 · useRunLibrary.ts:583-584"),
      run("empty", {
        arrange: (page) =>
          serve(page, /\/api\/v1\/quantbt\/runs(\?|$)/, () => {
            const base = foundation<RunLibrary>("run-library.json");
            return {
              ...base,
              items: [],
              page: { ...base.page, total_rows: 0, filtered_rows: 0, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false },
              counters: { logical_runs: 0, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 0 },
              status_counts: { COMPLETED: 0, RUNNING: 0, FAILED: 0, QUEUED: 0, DRAFT: 0, CANCELLED: 0, RECOVERY_REQUIRED: 0 },
              claim_ledger: { issued: 0, not_issued: 0, pending_source: 0, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0 },
            } satisfies RunLibrary;
          }),
        marker: "[data-empty]",
        source: "RunLibrary.tsx:87,2220-2224",
      }),
      na("partial", "useRunLibrary.ts:585 — an OK list read only carries rowCount"),
      na("stale", "useRunLibrary.ts:579-585 — stale is reached only through a 409 over accepted rows, and the list read publishes no 409 (research-run-library.d.ts: 400/401/403/404/503); an in-flight refetch stays `available`"),
      refusal("denied", 403, lib("denied"), "useRunLibrary.ts:582 · RunLibrary.tsx:2283"),
      refusal("unavailable", 503, lib("unavailable"), "researchRefusal.ts:178"),
      terminal400("RESEARCH_RUN_LIBRARY_INVALID", lib("terminal"), "researchRefusal.ts:90-91,134 · RunLibrary.tsx:1951"),
      expired(),
    ];
  })(),

  /* S03 run progress — RunProgress.tsx, useRunProgress.ts. Its own notice
     carries `data-research-state`; no `data-state`. */
  "03": (() => {
    const n = (state: string) => `[data-research-state='${state}']`;
    const progress = /\/api\/v1\/research\/runs\/[^/?]+\/progress(\?|$)/;
    return [
      /* The status pill reads `current`, which every answer carries; healthy is the root with no state notice. */
      run("healthy", { marker: "[data-screen='run-progress']:not([data-run-not-found]):not(:has([data-research-state], [data-run-not-found]))", source: "RunProgress.tsx:2085-2087 (notice only when not available)" }),
      loading(n("loading"), "useRunProgress.ts:623-624 · RunProgress.tsx:2087", { primary: progress }),
      run("empty", { arrange: (page) => serve(page, progress, () => ({ ...progressRead("RUNNING"), progress: null })), marker: n("empty"), source: "useRunProgress.ts:632-638 · RunProgress.tsx:2087" }),
      run("partial", { arrange: (page) => serve(page, progress, progressPartial), marker: "[data-source-partial]", source: "useRunProgress.ts:625-631,642 · RunProgress.tsx:2063" }),
      na("stale", "useRunProgress.ts:620-643 — nothing re-reads as in-flight over an accepted snapshot and isStale is never set; progressClient.ts:294-297 forces a 409 to terminal"),
      refusal("denied", 403, "[data-run-not-found]", "RunProgress.tsx:1951-1957"),
      refusal("unavailable", 503, n("unavailable"), "researchRefusal.ts:158,178"),
      terminal400("RESEARCH_PROGRESS_INVALID", n("terminal"), "progressClient.ts:294-297 · researchRefusal.ts:160", { primary: progress }),
      expired(),
    ];
  })(),

  /* S04 evidence hub — EvidenceFlow.tsx, useEvidence.ts */
  "04": (() => {
    const p = (state: string) => `[data-screen='evidence-flow'] [data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "useEvidence.ts:260-263" }),
      loading(p("loading"), "useEvidence.ts:262 · EvidenceFlow.tsx:431"),
      run("empty", { arrange: (page) => serve(page, /\/api\/v1\/quantbt\/runs\/[^/?]+\/evidence(\?|$)/, evidenceEmpty), marker: p("empty"), source: "useEvidence.ts:263 · state.ts:143-149" }),
      na("partial", "useEvidence.ts:258-264 — declaredUnavailable is never passed to researchState"),
      na("stale", "EvidenceFlow.tsx:4196-4207 · useEvidence.ts:109-127 — the hub is re-read only by the reread control, which renders only in recoverable states, so no read lands over an accepted hub"),
      refusal("denied", 403, "[data-run-not-found]", "EvidenceFlow.tsx:4144,3786-3800"),
      refusal("unavailable", 503, p("unavailable"), "EvidenceFlow.tsx:4195-4205"),
      terminal400("RESEARCH_EVIDENCE_INVALID", p("terminal"), "researchRefusal.ts:72,134"),
      expired(),
    ];
  })(),

  /* S05 split — SplitDetail.tsx, useSplit.ts */
  "05": (() => {
    const p = (state: string) => `[data-screen='split-detail'] [data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "useSplit.ts:203" }),
      loading(p("loading"), "useSplit.ts:181"),
      na("empty", "useSplit.ts:183,203 — rowCount is fixed at 1"),
      run("partial", { arrange: (page) => serve(page, RE_SPLIT, splitNotReady), marker: p("partial"), source: "useSplit.ts:161-163,184-201" }),
      run("stale", { act: staleViaHistory(RE_SPLIT, "RESEARCH_SPLIT_CONFLICT", "[data-action='next-stage']"), marker: p("stale"), source: "useSplit.ts:145,208-239 · researchRefusal.ts:75,157" }),
      refusal("denied", 403, "[data-run-not-found]", "SplitDetail.tsx:1493,398-411"),
      refusal("unavailable", 503, p("unavailable"), "SplitDetail.tsx:1502"),
      terminal400("RESEARCH_SPLIT_INVALID", p("terminal"), "researchRefusal.ts:77,134"),
      expired(),
    ];
  })(),

  /* S06 search — SearchDetail.tsx, useSearch.ts */
  "06": (() => {
    const p = (state: string) => `[data-screen='search-detail'] [data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "useSearch.ts:199" }),
      loading(p("loading"), "useSearch.ts:180"),
      na("empty", "useSearch.ts:199 — rowCount is max(1, …)"),
      run("partial", { arrange: (page) => serve(page, RE_SEARCH, searchNotReady), marker: p("partial"), source: "useSearch.ts:186-194" }),
      run("stale", { act: staleViaHistory(RE_SEARCH, "RESEARCH_SEARCH_CONFLICT", "[data-action='back-to-split']"), marker: p("stale"), source: "useSearch.ts:148,204-235 · researchRefusal.ts:80" }),
      refusal("denied", 403, "[data-run-not-found]", "SearchDetail.tsx:1878,1880"),
      refusal("unavailable", 503, p("unavailable"), "researchRefusal.ts:178"),
      terminal400("RESEARCH_SEARCH_INVALID", p("terminal"), "researchRefusal.ts:82"),
      expired(),
    ];
  })(),

  /* S07 freeze — FreezeDetail.tsx, useFreeze.ts */
  "07": (() => {
    const p = (state: string) => `[data-screen='freeze-detail'] [data-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "useFreeze.ts:272-278" }),
      loading(p("loading"), "useFreeze.ts:266-267"),
      run("empty", { arrange: (page) => serve(page, /\/api\/v1\/quantbt\/runs\/[^/?]+\/freeze(\?|$)/, freezeNoChecks), marker: p("empty"), source: "useFreeze.ts:275-278" }),
      na("partial", "useFreeze.ts:260-279 — no path produces partial"),
      na("stale", "research-freeze.d.ts — the freeze GET publishes 400/401/403/404/503 and no 409 (researchRefusal.ts:83-86 has no RESEARCH_FREEZE_CONFLICT); useFreeze.ts:176 reaches stale only through a non-contract 409"),
      refusal("denied", 403, "[data-stage-denied]", "FreezeRoute.tsx:27-29 · StageDenied.tsx:14,24"),
      refusal("unavailable", 503, p("unavailable"), "FreezeDetail.tsx:1702-1718"),
      terminal400("RESEARCH_FREEZE_INVALID", p("terminal"), "researchRefusal.ts:86,134"),
      expired(),
    ];
  })(),

  /* S08 execute replay — ExecuteDetail.tsx, useReplay.ts, replayClient.ts.
     A retrospective-equity route with samples is always `partial`. */
  "08": (() => {
    const p = (state: string) => `[data-screen='execute-replay'] [data-state='${state}']`;
    return [
      run("healthy", { marker: p("partial"), source: "replayClient.ts:430-435" }),
      loading(p("loading"), "useReplay.ts:360-361"),
      run("empty", { arrange: (page) => serve(page, RE_REPLAY, replayEmpty), marker: p("empty"), source: "replayClient.ts:427-428" }),
      run("partial", { marker: p("partial"), source: "replayClient.ts:430 — the healthy body is the partial state" }),
      run("stale", {
        act: async ({ page, s }) => {
          await hold(page, RE_REPLAY, (url) => url.searchParams.has("cursor"));
          await page.locator(`${s.root} [data-action='next-window']`).first().click();
        },
        marker: p("stale"),
        source: "useReplay.ts:362-363 · replayClient.ts:406-407 · state.ts:114",
      }),
      refusal("denied", 403, "[data-stage-denied]", "ExecuteRoute.tsx:69-70 · StageDenied.tsx:14"),
      refusal("unavailable", 503, p("unavailable"), "replayClient.ts:343,408-409"),
      terminal400("RESEARCH_REPLAY_CURSOR_INVALID", p("terminal"), "replayClient.ts:336,410-412"),
      expired(),
    ];
  })(),

  /* S09 run report — ReportDetail.tsx, useReport.ts, reportClient.ts */
  "09": (() => {
    const p = (state: string) => `[data-report-state='${state}']`;
    return [
      run("healthy", { marker: p("partial"), source: "reportClient.ts:379-386 — the retained-WFO fixture declares gaps" }),
      loading(p("loading"), "useReport.ts:115-116 · ReportDetail.tsx:1305"),
      na("empty", "reportClient.ts:379-390 · useReport.ts:113-119 — reportState returns only partial or available"),
      run("partial", { marker: p("partial"), source: "reportClient.ts:381 — the healthy body is the partial state" }),
      na("stale", "useReport.ts:112-118 · ReportDetail.tsx:1307 — retry (the only re-read) renders only when mayRetry, i.e. with no report held; reportClient.ts:345-349 maps a 409 on the read to terminal"),
      refusal("denied", 403, p("denied"), "reportClient.ts:293-296,349"),
      refusal("unavailable", 503, p("unavailable"), "reportClient.ts:297 · ReportDetail.tsx:1309"),
      terminal400("RESEARCH_REPORT_INVALID", p("terminal"), "reportClient.ts:291,349-351"),
      expired(),
    ];
  })(),

  /* S10 attempt lineage — LineageDetail.tsx, useLineage.ts, lineageClient.ts */
  "10": (() => {
    const p = (state: string) => `[data-lineage-state='${state}']`;
    return [
      run("healthy", { marker: p("partial"), source: "lineageClient.ts:413-417 · LineageDetail.tsx:2284-2293 — the healthy fixture declares two gaps" }),
      loading(p("loading"), "useLineage.ts:114-115 · LineageDetail.tsx:1993"),
      run("empty", { arrange: (page) => serve(page, /\/api\/v1\/research\/alphas\/[^/?]+\/lineage(\?|$)/, lineageEmpty), marker: p("empty"), source: "lineageClient.ts:403-407" }),
      run("partial", { marker: p("partial"), source: "lineageClient.ts:413 — the healthy body is the partial state" }),
      na("stale", "useLineage.ts:94,111-118 · LineageDetail.tsx:1948 — retry renders only when mayRetry, never with a lineage held; loadOlder uses its own older.inFlight"),
      refusal("denied", 403, p("denied"), "lineageClient.ts:329-330,368-370"),
      refusal("unavailable", 503, p("unavailable"), "lineageClient.ts:331 · LineageDetail.tsx:1951"),
      terminal400("RESEARCH_LINEAGE_INVALID", p("terminal"), "lineageClient.ts:327,371-373"),
      expired(),
    ];
  })(),

  /* S11 release candidate — ReleaseCandidateDetail.tsx, useReleaseCandidate.ts,
     useReleaseCandidatePublication.ts (edited concurrently by package A1/A2). */
  "11": (() => {
    const p = (state: string) => `[data-rc-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "releaseCandidateClient.ts:512" }),
      loading("[data-rc-notice='loading']", "useReleaseCandidate.ts:232-233 · ReleaseCandidateDetail.tsx:649", { primary: RE_COMPOSE }),
      na("empty", "releaseCandidateClient.ts:499-513 — composeState returns only partial or available"),
      run("partial", { arrange: (page) => serve(page, RE_COMPOSE, composePartial), marker: p("partial"), source: "releaseCandidateClient.ts:500-507" }),
      run("stale", {
        /* Compose stale is not reachable (useReleaseCandidate.ts:230-234); the
           publication sub-read is: a DELIVERED mirror polls every 60 s, and a
           poll that does not answer keeps the last read as stale. */
        arrange: async (page) => {
          await serve(page, RE_COMPOSE, () => rcCompose(RC_RUN, RC_ID, true));
          await serve(page, RE_PUBLICATION, () => rcPublication(RC_ID, true));
        },
        act: async ({ page, quiet }) => {
          await refusePrimary(page, RE_PUBLICATION, 503);
          await page.clock.fastForward(61_000);
          await quiet();
        },
        marker: "[data-publication-read='stale']",
        source: "useReleaseCandidatePublication.ts:110,214 · ReleaseCandidateDetail.tsx:1330-1337",
      }),
      refusal("denied", 403, p("denied"), "releaseCandidateClient.ts:396-397 · ReleaseCandidateDetail.tsx:663"),
      refusal("unavailable", 503, p("unavailable"), "releaseCandidateClient.ts:398 · ReleaseCandidateDetail.tsx:659"),
      terminal400("RESEARCH_RELEASE_CANDIDATE_INVALID", p("terminal"), "releaseCandidateClient.ts:394,426-435", { primary: RE_COMPOSE }),
      expired(),
    ];
  })(),

  /* S13 compare — CompareDetail.tsx, useCompare.ts, compareClient.ts */
  "13": (() => {
    const p = (state: string) => `[data-compare-state='${state}']`;
    return [
      run("healthy", { marker: p("available"), source: "compareClient.ts:353" }),
      loading("[data-compare-notice='loading']", "useCompare.ts:134-135 · CompareDetail.tsx:902"),
      run("empty", { arrange: (page) => serve(page, RE_COMPARE, compareEmpty), marker: p("empty"), source: "compareClient.ts:336-340" }),
      run("partial", { arrange: (page) => serve(page, RE_COMPARE, comparePartial), marker: p("partial"), source: "compareClient.ts:328,345-348" }),
      run("stale", {
        act: async ({ page, s, quiet }) => {
          await page.locator(`${s.root} [data-mode-option='markets']`).first().click();
          await quiet();
          await hold(page, RE_COMPARE, (url) => (url.searchParams.get("mode") ?? "attempts") === "attempts");
          await page.locator(`${s.root} [data-mode-option='attempts']`).first().click();
        },
        marker: p("stale"),
        source: "useCompare.ts:88-89,136-137 · CompareDetail.tsx:838 · state.ts:114",
      }),
      refusal("denied", 403, p("denied"), "compareClient.ts:295-296"),
      refusal("unavailable", 503, p("unavailable"), "compareClient.ts:297 · CompareDetail.tsx:917"),
      terminal400("RESEARCH_COMPARE_INVALID", p("terminal"), "compareClient.ts:293 · lineageClient.ts:371-373"),
      expired(),
    ];
  })(),
};

export function plansFor(id: string): readonly Plan[] {
  const plans = PLAN[id];
  if (!plans) throw new Error(`no state plan for screen ${id}`);
  const states = plans.map((p) => p.state);
  if (states.join(",") !== STATES.join(",")) throw new Error(`screen ${id}: plan states ${states.join(",")} ≠ ${STATES.join(",")}`);
  return plans;
}

/** Markers of every RUN state of a screen, for the exclusivity check. */
export function markersOf(id: string): Array<{ state: State; marker: string }> {
  return plansFor(id).flatMap((p) => (p.kind === "RUN" ? [{ state: p.state, marker: p.recipe.marker }] : []));
}
