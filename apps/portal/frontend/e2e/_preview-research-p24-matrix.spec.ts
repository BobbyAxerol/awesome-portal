/**
 * P24-T09 / P24-T13 / FND-20 · the 15-screen acceptance matrix against the REAL preview lane.
 *
 * GET and navigation only. `getOnly` aborts every non-GET /api/ call, and no control that writes is
 * ever clicked: each write control is ENUMERATED (selector + label + disabled + reason) and asserted
 * present / disabled-with-reason, nothing more (check `writes`).
 *
 * One test per (screen cell x run). Every cell records one row per check into the receipt
 * (`P24_MATRIX_RECEIPT`, default upgrade/research_loop/evidence/P24/fe-screen-action-matrix-receipt.json):
 *   load · writes · refresh · deeplink · nav · print · responsive · a11y · console
 * A failing check records FAIL with its evidence and the test fails at the end of the cell, after every
 * other check of the cell has run (nothing is skipped because an earlier step failed).
 *
 *   export RESEARCH_PREVIEW_ORIGIN=$(sed -n 's/^PORTAL_PUBLIC_ORIGIN=//p' ~/.config/portal-research-preview/preview.env)
 *   export RESEARCH_PREVIEW_BASE_URL=http://localhost:8095
 *   npx playwright test -c playwright.research-preview.config.ts _preview-research-p24-matrix   (background)
 *
 * Named `_preview-research-*` so the default visual config ignores it. Runs are DISCOVERED (labels
 * R-WFO-023, R-WFO-027, R-P04-022 + the first FAILED and QUEUED run); an absent state is an annotated skip.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

import { analyze } from "./axeReceipt";
import { usePreferences } from "./fixtures";
import { readPdfText } from "./pdfText";
import { ZERO_RUN, discoverRun, getOnly, hashKeys, pageGet, signIn } from "./w1StateRuns";

/* ----------------------------------------------------------------------------------------------
 * Constants
 * -------------------------------------------------------------------------------------------- */

const ALPHA = process.env.P24_ALPHA ?? "delta-rsi-polynomial-alpha";
const AV = "av_delta_rsi_polynomial_alpha_1_0_0";
const BASE = process.env.RESEARCH_PREVIEW_BASE_URL ?? process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095";
const RECEIPT = process.env.P24_MATRIX_RECEIPT ?? join(process.cwd(), "../../../upgrade/research_loop/evidence/P24/fe-screen-action-matrix-receipt.json");
const ROOT_TIMEOUT_MS = 30_000;
const WIDTHS = [1440, 1280, 390, 360] as const;
const RQ = "/research/quantbt";

type Label = "R-WFO-023" | "R-WFO-027" | "R-P04-022";
type RunKind = Label | "FAILED" | "QUEUED" | "NOT_FOUND";

/** The cursor each full cell opens with: (fold, trial) — S04..S08 carry it in the hash. */
const CURSOR: Record<string, string> = { "R-WFO-023": "fold=3&trial=1", "R-WFO-027": "fold=2&trial=1" };

const RUNS: Partial<Record<RunKind, string>> = {};

/** Words that only the shell (sidebar / top bar) prints. None may reach the PDF text layer. */
const SHELL_WORDS = ["Open navigation", "Collapse sidebar", "Expand sidebar", "Planned modules", "Exit Reviews", "Command Center", "Portal Map", "Primary navigation"];

/** Every control a printed page must not carry (SPEC §1.3 no-print contract + the shell). */
const NO_PRINT_SELECTORS = [
  ".no-print",
  "[data-panel='noprint-bar']",
  ".research-screen [role='tablist']",
  "nav[aria-label='Breadcrumb']",
  "nav[aria-label='Run path']",
  "nav[aria-label='Screen path']",
  ".portal-topbar",
  ".portal-rail",
  ".portal-subnav",
  ".portal-drawer-backdrop",
  "[data-filter-bar]",
  "[data-action='copy-link']",
  "[data-action='copy-yaml']",
  "[data-action='publish']",
  "[data-linked-final-audit] button",
];
/** A button / action link that writes or mutates (matched on its name, in print: must be hidden). */
const WRITE_RE = /\b(seal|publish|save|export|prepare|create|register|parse|cancel|retry|verify now|evaluate grid|sibling|start over|run gates|send to|paper trading|submit|run pinned audit|read audit again)\b/i;

/* ----------------------------------------------------------------------------------------------
 * Receipt
 * -------------------------------------------------------------------------------------------- */

type Status = "PASS" | "FAIL" | "NA";
interface Row {
  cell: string;
  screen: string;
  run: string;
  check: string;
  status: Status;
  evidence: string;
}

function record(row: Row): void {
  mkdirSync(dirname(RECEIPT), { recursive: true });
  const current = existsSync(RECEIPT) ? (JSON.parse(readFileSync(RECEIPT, "utf8")) as { rows?: Row[] }) : {};
  const rows = (current.rows ?? []).filter((r) => !(r.cell === row.cell && r.check === row.check));
  rows.push(row);
  rows.sort((a, b) => a.cell.localeCompare(b.cell, "en", { numeric: true }) || a.check.localeCompare(b.check));
  writeFileSync(RECEIPT, `${JSON.stringify({ receipt: "P24 15-screen action matrix", generated: new Date().toISOString(), base: BASE, rows }, null, 2)}\n`);
}

/* ----------------------------------------------------------------------------------------------
 * Observation (console / failed requests / endpoints)
 * -------------------------------------------------------------------------------------------- */

interface Seen {
  errors: { text: string; url: string }[];
  badStatus: { path: string; status: number }[];
  endpoints: Set<string>;
  failed: string[];
}

function observe(page: Page, seen: Seen): void {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    seen.endpoints.add(`${response.request().method()} ${url.pathname.replace(/rrun_[0-9a-f]{32}/g, "{run}").replace(/rc_[0-9A-Z]{26}/g, "{rc}")}`);
    if (response.status() >= 400) seen.badStatus.push({ path: url.pathname, status: response.status() });
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    /* A navigation away aborts in-flight polls; only count real failures of API GETs on a settled page. */
    if (url.pathname.startsWith("/api/") && request.failure()?.errorText !== "net::ERR_ABORTED") seen.failed.push(`${request.method()} ${url.pathname} ${request.failure()?.errorText}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") seen.errors.push({ text: m.text(), url: m.location().url });
  });
  page.on("pageerror", (e) => seen.errors.push({ text: `pageerror: ${e}`, url: "" }));
}

/**
 * Expected 4xx per run kind. A run that is not COMPLETED has no sealed evidence, so the face asks its
 * evidence endpoints and is told 404/409 (W1 §4.2, QA D6); an unknown run is told 404/403 everywhere.
 * Nothing else is tolerated: a 4xx on a COMPLETED run, or any 5xx, fails the cell.
 */
function expected4xx(kind: RunKind, path: string, status: number): boolean {
  /* Codex linked-audit read (P24): a run whose final audit is not reusable answers a typed 409 on every screen that mounts
   * the panel. It is a documented state, but it still reaches the console as a red error: recorded as a finding (F-CONSOLE-409). */
  if (status === 409 && /\/quantbt\/runs\/rrun_[0-9a-f]{32}\/final-audit$/.test(path)) return true;
  if (kind === "NOT_FOUND") return [403, 404].includes(status) && path.includes(ZERO_RUN);
  if (kind === "QUEUED" || kind === "FAILED") return [404, 409].includes(status) && /\/(current-source|report|release-candidate|evidence|execution|runs\/rrun_)/.test(path);
  return false;
}

/* ----------------------------------------------------------------------------------------------
 * Cell definitions
 * -------------------------------------------------------------------------------------------- */

interface NavProbe {
  label: string;
  /** Locator of the control (must resolve to >= 1, the first is clicked). */
  loc: (page: Page, run: string) => Locator;
  /** `route`: lands on another route (then Back); `hash`: stays on the route and changes the hash/search. */
  kind: "route" | "state";
  /** Expected pathname (RegExp or string, matched against pathname). `route` only. */
  path?: (run: string) => RegExp;
  /** Expected search substring after the click. */
  search?: RegExp;
  /** Expected hash keys after the click. */
  hash?: Record<string, string>;
  /** The cursor (fold, trial) of the opening URL must survive the click. */
  cursor?: boolean;
  /** A GET-only control to press first (a wizard tab) so the control renders. */
  pre?: (page: Page) => Promise<void>;
  /** Run kinds this probe applies to (default: all). */
  only?: RunKind[];
  /** Screen root expected after a `route` click. */
  root?: string;
}

interface WriteExpect {
  /** A GET-only control to press first (a wizard tab) so the control renders. */
  pre?: (page: Page) => Promise<void>;
  /** Human label of the control family. */
  name: string;
  find: (page: Page) => Locator;
  /** `present` = a control exists and is enabled; `disabled` = exists, disabled WITH a reason; `any` = exists in either state; `absent` = must not exist. */
  mode: "present" | "disabled" | "any" | "absent";
}

interface Cell {
  id: string;
  screen: string;
  title: string;
  root: string;
  /** `run`: one cell per run kind; `global`: once. */
  scope: "run" | "global";
  path: (run: string, label: string) => string;
  /** One state change by GET-only controls; returns the sig-relevant description. The URL afterwards is the deep link. */
  act?: (page: Page, label: string) => Promise<void>;
  nav?: NavProbe[];
  writes?: (kind: RunKind) => WriteExpect[];
  /** Print probe applies (all screens); false only where print is meaningless. */
  print?: boolean;
  /** Run kinds this cell covers beyond the two full runs. */
  states?: RunKind[];
}

const run = (r: string) => `${RQ}/runs/${r}`;
const byName = (name: string | RegExp, role: "button" | "link" | "tab" = "button") => (page: Page) => page.getByRole(role, { name });
const hashPath = (r: string, tail: string, label: string, extra = "") => `${run(r)}/${tail}#stage=${tail === "evidence" ? "search" : tail}&${CURSOR[label] ?? "fold=1&trial=1"}${extra}`;

/** Stage tab cell of the S04 hub. */
function hubCell(stage: string, extra: Partial<Cell> = {}): Cell {
  return {
    id: `S04:${stage}`,
    screen: "S04",
    title: `Evidence hub · ${stage}`,
    root: "[data-screen='evidence-flow']",
    scope: "run",
    path: (r, label) => `${run(r)}/evidence#stage=${stage}&${CURSOR[label] ?? "fold=1&trial=1"}`,
    act: async (page) => {
      await page.getByRole("button", { name: "next fold" }).first().click();
      await settle(page);
    },
    ...extra,
  };
}

const HUB_NAV: NavProbe[] = [
  { label: "fold stepper: previous fold", kind: "state", loc: byName("previous fold"), cursor: false },
  { label: "report link keeps cursor", kind: "route", loc: (p) => p.locator("[data-run-header] a[href$='/report'], a[href*='/report#']").first(), path: (r) => new RegExp(`${run(r)}/report$`), cursor: true, root: "[data-screen='run-report']" },
  { label: "promotion link keeps cursor", kind: "route", loc: (p) => p.locator("a[href*='/release-candidate']").first(), path: (r) => new RegExp(`${run(r)}/release-candidate$`), cursor: true, root: "[data-screen='release-candidate']" },
  { label: "runs (library) link", kind: "route", loc: (p) => p.locator("a[href$='/research/quantbt/runs']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
  { label: "attempt lineage link", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`${RQ}/alphas/[^/]+/lineage$`), root: "[data-screen='attempt-lineage']" },
];

const HUB_TABS = [
  ["summary", /Summary/],
  ["split", /^S1/],
  ["search", /^S2/],
  ["freeze", /^S3/],
  ["execute", /^S4/],
  ["claim", /^S5/],
  ["atlas", /Atlas/],
] as const;

async function settle(page: Page): Promise<void> {
  /* live screens poll, so the network never idles for long: a short wait, then a fixed settle */
  await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function ready(page: Page, root: string): Promise<void> {
  await page.locator(root).first().waitFor({ state: "visible", timeout: ROOT_TIMEOUT_MS });
  await settle(page);
}

/** Deep-dive screens' common probes (breadcrumb to the hub, stage prev/next, copy). */
const deep = (stage: "split" | "search" | "freeze" | "execute", prev: string | null, next: string | null): NavProbe[] => {
  const probes: NavProbe[] = [
    { label: "breadcrumb Evidence Flow keeps cursor", kind: "route", loc: (p) => p.locator("a[href*='/evidence#stage=']").first(), path: (r) => new RegExp(`${run(r)}/evidence$`), cursor: true, root: "[data-screen='evidence-flow']" },
  ];
  if (prev) probes.push({ label: `prev stage (${prev})`, kind: "route", loc: (p) => p.locator(`a[href*='/${prev}#stage=']`).first(), path: (r) => new RegExp(`${run(r)}/${prev}$`), cursor: true });
  if (next) probes.push({ label: `next stage (${next})`, kind: "route", loc: (p) => p.locator(`a[href*='/${next}#stage=']`).first(), path: (r) => new RegExp(`${run(r)}/${next}$`), cursor: true });
  void stage;
  return probes;
};

const CELLS: Cell[] = [
  /* ---- S00 ---- */
  {
    id: "S00",
    screen: "S00",
    title: "Journey map",
    root: "[data-screen='journey-map']",
    scope: "global",
    path: () => `${RQ}/journey`,
    nav: [
      { label: "card: Run Library", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href$='/runs']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
      { label: "card: New Run", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href$='/runs/new']").first(), path: () => new RegExp(`${RQ}/runs/new$`), root: "[data-screen='new-run']" },
      { label: "card: Alpha Import", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href$='/alpha-import']").first(), path: () => new RegExp(`${RQ}/alpha-import$`), root: "[data-screen='alpha-import']" },
      { label: "card: Engine Atlas", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href$='/atlas']").first(), path: () => new RegExp(`${RQ}/atlas$`), root: "[data-screen='engine-atlas']" },
      { label: "card: run-picking (Run Progress) lands on the Library with ?to=", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href*='to=run_progress']").first(), path: () => new RegExp(`${RQ}/runs$`), search: /to=run_progress/, root: "[data-screen='run-library']" },
      { label: "card: run-picking (Compare) lands on the Library with ?to=", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a[href*='to=compare_runs']").first(), path: () => new RegExp(`${RQ}/runs$`), search: /to=compare_runs/, root: "[data-screen='run-library']" },
      { label: "back link (Run Library)", kind: "route", loc: (p) => p.locator("[data-screen='journey-map'] a", { hasText: "Run Library" }).first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
    ],
    writes: () => [],
  },
  /* ---- S01 ---- */
  {
    id: "S01",
    screen: "S01",
    title: "Run Library",
    root: "[data-screen='run-library']",
    scope: "global",
    path: () => `${RQ}/runs`,
    act: async (page) => {
      await page.getByPlaceholder(/filter runs/i).or(page.getByLabel(/filter runs/i)).first().fill("R-WFO-023");
      await page.waitForTimeout(600);
      await settle(page);
    },
    nav: [
      { label: "header: + new run", kind: "route", loc: (p) => p.locator("a[href$='/runs/new']").first(), path: () => new RegExp(`${RQ}/runs/new$`), root: "[data-screen='new-run']" },
      { label: "header: journey map", kind: "route", loc: (p) => p.locator("a[href$='/journey']").first(), path: () => new RegExp(`${RQ}/journey$`), root: "[data-screen='journey-map']" },
      { label: "header: attempt lineage", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`${RQ}/alphas/[^/]+/lineage$`), root: "[data-screen='attempt-lineage']" },
      { label: "card: open evidence", kind: "route", loc: (p) => p.locator("a[href*='/evidence']").first(), path: () => new RegExp(`${RQ}/runs/rrun_[0-9a-f]{32}/evidence$`), root: "[data-screen='evidence-flow']" },
      { label: "card: open S1", kind: "route", loc: (p) => p.locator("a[href$='/split']").first(), path: () => new RegExp(`/split$`), root: "[data-screen='split-detail']" },
      { label: "card: open S2", kind: "route", loc: (p) => p.locator("a[href$='/search']").first(), path: () => new RegExp(`/search$`), root: "[data-screen='search-detail']" },
      { label: "card: open S3", kind: "route", loc: (p) => p.locator("a[href$='/freeze']").first(), path: () => new RegExp(`/freeze$`), root: "[data-screen='freeze-detail']" },
      { label: "card: open S4", kind: "route", loc: (p) => p.locator("a[href$='/execute']").first(), path: () => new RegExp(`/execute$`), root: "[data-screen='execute-replay']" },
      { label: "card: open S5 (report)", kind: "route", loc: (p) => p.locator("a[href$='/report']").first(), path: () => new RegExp(`/report$`), root: "[data-screen='run-report']" },
      { label: "card: watch progress (RUNNING/QUEUED)", kind: "route", loc: (p) => p.locator("a[href$='/progress']").first(), path: () => new RegExp(`/progress$`), root: "[data-screen='run-progress']" },
      { label: "card: rc chip", kind: "route", loc: (p) => p.locator("a[href*='/release-candidates/rc_']").first(), path: () => new RegExp(`${RQ}/release-candidates/rc_[0-9A-Z]{26}$`) },
    ],
    writes: () => [{ name: "+ new run (link, creates nothing)", find: (p) => p.locator("a[href$='/runs/new']"), mode: "present" }],
  },
  /* ---- S02 ---- */
  {
    id: "S02",
    screen: "S02",
    title: "New Run",
    root: "[data-screen='new-run']",
    scope: "global",
    path: () => `${RQ}/runs/new`,
    act: async (page) => {
      await page.getByRole("tab", { name: /^Route/ }).click();
      await settle(page);
    },
    nav: [
      { label: "back: Run Library", kind: "route", loc: (p) => p.locator("a[href$='/runs']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
      { label: "Import a version", kind: "route", loc: (p) => p.locator("a[href$='/alpha-import']").first(), path: () => new RegExp(`${RQ}/alpha-import$`), root: "[data-screen='alpha-import']" },
      { label: "lineage link", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`/lineage$`), root: "[data-screen='attempt-lineage']" },
      { label: "runs of this alpha", kind: "route", loc: (p) => p.locator("a[href*='/runs?alpha=']").first(), path: () => new RegExp(`${RQ}/runs$`), search: /alpha=/, root: "[data-screen='run-library']" },
      { label: "wizard tab: Walk-forward", kind: "state", loc: byName(/^Walk-forward/, "tab"), search: /step=windows/ },
      { label: "wizard tab: Parameters", kind: "state", loc: byName(/^Parameters/, "tab"), search: /step=parameters/ },
      { label: "wizard tab: Optimization", kind: "state", loc: byName(/^Optimization/, "tab"), search: /step=optimization/ },
      { label: "wizard tab: Review & run", kind: "state", loc: byName(/^Review/, "tab"), search: /step=review/ },
    ],
    writes: () => [
      { name: "Start over (drops the LOCAL draft only)", find: byName(/^Start over/), mode: "present" },
      { name: "Create run (Review & run step)", find: byName(/create run/i), mode: "any" },
    ],
  },
  /* ---- S03 ---- */
  {
    id: "S03",
    screen: "S03",
    title: "Run Progress",
    root: "[data-screen='run-progress']",
    scope: "run",
    path: (r, label) => `${run(r)}/progress#fold=${CURSOR[label]?.match(/fold=(\d+)/)?.[1] ?? "1"}`,
    act: async (page) => {
      await page.getByRole("button", { name: /^fold_02/ }).first().click();
      await settle(page);
    },
    nav: [
      { label: "back: Library", kind: "route", loc: (p) => p.locator("a[href$='/research/quantbt/runs']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
      { label: "Evidence Flow → keeps fold", kind: "route", loc: (p) => p.getByRole("link", { name: /^Evidence Flow/ }).first(), path: (r) => new RegExp(`${run(r)}/evidence$`), cursor: true, root: "[data-screen='evidence-flow']" },
      { label: "stage rail: Stage 1 Split", kind: "route", loc: (p) => p.locator("[data-stage-rail] a[href*='/split#']").first(), path: (r) => new RegExp(`${run(r)}/split$`), cursor: true, root: "[data-screen='split-detail']" },
      { label: "stage rail: Stage 2 Search", kind: "route", loc: (p) => p.locator("[data-stage-rail] a[href*='/search#']").first(), path: (r) => new RegExp(`${run(r)}/search$`), cursor: true, root: "[data-screen='search-detail']" },
      { label: "stage rail: Stage 3 Freeze", kind: "route", loc: (p) => p.locator("[data-stage-rail] a[href*='/freeze#']").first(), path: (r) => new RegExp(`${run(r)}/freeze$`), cursor: true, root: "[data-screen='freeze-detail']" },
      { label: "stage rail: Stage 4 Execute", kind: "route", loc: (p) => p.locator("[data-stage-rail] a[href*='/execute#']").first(), path: (r) => new RegExp(`${run(r)}/execute$`), cursor: true, root: "[data-screen='execute-replay']" },
      { label: "stage rail: Stage 5 Claim", kind: "route", loc: (p) => p.locator("[data-stage-rail] a[href*='stage=claim']").first(), path: (r) => new RegExp(`${run(r)}/evidence$`), hash: { stage: "claim" }, cursor: true, root: "[data-screen='evidence-flow']" },
      { label: "fold row: fold_03", kind: "state", loc: byName(/^fold_03/), hash: { fold: "3" } },
      { label: "tab: Stage log", kind: "state", loc: byName(/^Stage log/, "tab") },
    ],
    writes: (kind) => [
      { name: "Cancel run", find: byName(/^cancel/i), mode: kind === "QUEUED" ? "any" : "absent" },
      { name: "Retry run", find: byName(/^retry/i), mode: "any" },
      { name: "Copy link (clipboard only)", find: (p) => p.locator("[data-action='copy-link']"), mode: "any" },
    ],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S04 ---- */
  ...HUB_TABS.map(([stage]) =>
    hubCell(stage, {
      nav:
        stage === "summary"
          ? [
              ...HUB_TABS.filter(([s]) => s !== "summary").map(
                ([s, name]): NavProbe => ({ label: `stage tab: ${s}`, kind: "state", loc: byName(name, "tab"), hash: { stage: s }, cursor: true }),
              ),
              ...HUB_NAV,
              { label: "reset to θ*", kind: "state", loc: byName(/reset to/), hash: { fold: "!" } },
            ]
          : [
              ...(["split", "search", "freeze", "execute"].includes(stage)
                ? [
                    { label: `deep dive → S${["split", "search", "freeze", "execute"].indexOf(stage) + 1}`, kind: "route", loc: (p: Page) => p.locator(`[data-deep-dive] a, a:has-text('Open S')`).first(), path: (r: string) => new RegExp(`${run(r)}/${stage}$`), cursor: true } as NavProbe,
                  ]
                : []),
              ...(stage === "search" ? [{ label: "stage nav ← S1 Split", kind: "state", loc: (p: Page) => p.locator("[data-stage-prev], a:has-text('← S1')").first(), hash: { stage: "split" }, cursor: true } as NavProbe] : []),
              ...HUB_NAV.slice(0, 2),
            ],
      writes: (kind) =>
        stage === "claim"
          ? [
              { name: "Send to Approval Gate", find: byName(/^Send to Approval Gate/), mode: "any" },
              { name: "Register for Paper Trading", find: byName(/^Register for Paper Trading/), mode: "any" },
            ]
          : [],
      states: stage === "summary" ? ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"] : undefined,
    }),
  ),
  /* ---- S05 ---- */
  {
    id: "S05",
    screen: "S05",
    title: "S1 Split",
    root: "[data-screen='split-detail']",
    scope: "run",
    path: (r, label) => hashPath(r, "split", label),
    act: async (page) => {
      await page.getByRole("button", { name: /^F1/ }).first().click();
      await settle(page);
    },
    nav: [
      ...deep("split", null, "search"),
      { label: "window link: IS → S4 window=is", kind: "route", loc: (p) => p.locator("a[href*='window=is']").first(), path: (r) => new RegExp(`${run(r)}/execute$`), hash: { window: "is" }, cursor: false, root: "[data-screen='execute-replay']" },
      { label: "window link: OOS → S4 window=oos", kind: "route", loc: (p) => p.locator("a[href*='window=oos']").first(), path: (r) => new RegExp(`${run(r)}/execute$`), hash: { window: "oos" }, cursor: false, root: "[data-screen='execute-replay']" },
      { label: "fold chip F2", kind: "state", loc: byName(/^F2/), hash: { fold: "2" } },
      { label: "series → hub summary", kind: "route", loc: (p) => p.locator("a[href*='stage=summary']").first(), path: (r) => new RegExp(`${run(r)}/evidence$`), root: "[data-screen='evidence-flow']" },
      { label: "this alpha's attempts → lineage", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`/lineage$`), root: "[data-screen='attempt-lineage']" },
    ],
    writes: () => [],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S06 ---- */
  {
    id: "S06",
    screen: "S06",
    title: "S2 Search",
    root: "[data-screen='search-detail']",
    scope: "run",
    path: (r, label) => hashPath(r, "search", label),
    act: async (page) => {
      /* a trial chip (every run) moves the cursor's trial; fold chips exist only on a causal run */
      await page.locator("main button[title^='trial ']").nth(1).click();
      await settle(page);
    },
    nav: [
      ...deep("search", "split", "freeze"),
      { label: "Engine Atlas → (mode/schedule, run)", kind: "route", loc: (p) => p.locator("a[href*='/atlas']").first(), path: () => new RegExp(`${RQ}/atlas$`), root: "[data-screen='engine-atlas']" },
      { label: "θ* sealed in S3", kind: "route", loc: (p) => p.getByRole("link", { name: /sealed in S3/ }).first(), path: (r) => new RegExp(`${run(r)}/freeze$`), cursor: true },
      { label: "trial chip (second) moves the cursor trial", kind: "state", loc: (p) => p.locator("main button[title^='trial ']").nth(1), search: undefined, hash: { pick: "*" } },
      { label: "fold button F1 (causal run only)", kind: "state", only: ["R-WFO-027"], loc: (p) => p.locator("main button[title^='study ']").nth(0), hash: { fold: "1" } },
    ],
    writes: () => [],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S07 ---- */
  {
    id: "S07",
    screen: "S07",
    title: "S3 Freeze",
    root: "[data-screen='freeze-detail']",
    scope: "run",
    path: (r, label) => hashPath(r, "freeze", label),
    nav: [
      ...deep("freeze", "search", "execute"),
      { label: "attempt lineage →", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`/lineage$`), root: "[data-screen='attempt-lineage']" },
      { label: "propose new attempt → (?from=, a form, writes nothing)", kind: "route", loc: (p) => p.locator("a[href*='runs/new?from=']").first(), path: () => new RegExp(`${RQ}/runs/new$`), search: /from=rrun_/, root: "[data-screen='new-run']" },
      { label: "child audit → S4", kind: "route", loc: (p) => p.getByRole("link", { name: /child audit/ }).first(), path: (r) => new RegExp(`${run(r)}/execute$`), cursor: true },
    ],
    writes: () => [
      { name: "evaluate grid (what-if)", find: byName(/evaluate grid/), mode: "any" },
      { name: "create sibling attempt", find: byName(/create sibling attempt/), mode: "any" },
      { name: "verify now (POSTs a verification receipt)", find: byName(/^verify now/), mode: "any" },
    ],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S08 ---- */
  {
    id: "S08",
    screen: "S08",
    title: "S4 Execute / Replay",
    root: "[data-screen='execute-replay']",
    scope: "run",
    path: (r, label) => hashPath(r, "execute", label),
    act: async (page) => {
      /* the fold stepper only exists on the OOS window: switch the window, then pick a fold chip */
      await page.getByRole("button", { name: /^IS$/ }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: /^F1 ·/ }).click();
      await settle(page);
    },
    nav: [
      ...deep("execute", "freeze", null),
      { label: "next: Run Report → keeps cursor", kind: "route", loc: (p) => p.getByRole("link", { name: /Run Report/ }).first(), path: (r) => new RegExp(`${run(r)}/report$`), cursor: true, root: "[data-screen='run-report']" },
      { label: "window switch: OOS (after IS)", pre: (p) => p.getByRole("button", { name: /^IS$/ }).click(), kind: "state", loc: byName(/^OOS$/), hash: { window: "oos" } },
      { label: "window switch: IS", kind: "state", loc: byName(/^IS$/), hash: { window: "is" } },
      { label: "fold stepper: next fold (OOS window)", kind: "state", loc: byName("next fold"), hash: { fold: "!" } },
      { label: "fold chip F1", kind: "state", loc: byName(/^F1 ·/), hash: { fold: "1" } },
      { label: "Split ↗", kind: "route", loc: (p) => p.getByRole("link", { name: /^Split/ }).first(), path: (r) => new RegExp(`${run(r)}/split$`), root: "[data-screen='split-detail']" },
    ],
    writes: () => [{ name: "holdout window (disabled, reason in title)", find: byName(/^holdout/), mode: "any" }],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S09 ---- */
  {
    id: "S09",
    screen: "S09",
    title: "Run Report",
    root: "[data-screen='run-report']",
    scope: "run",
    path: (r) => `${run(r)}/report`,
    nav: [
      { label: "← Hub", kind: "route", loc: (p) => p.getByRole("link", { name: /Hub/ }).first(), path: (r) => new RegExp(`${run(r)}/evidence$`), root: "[data-screen='evidence-flow']" },
      { label: "← Execute", kind: "route", loc: (p) => p.getByRole("link", { name: /Execute/ }).first(), path: (r) => new RegExp(`${run(r)}/execute$`), root: "[data-screen='execute-replay']" },
      { label: "Release →", kind: "route", loc: (p) => p.getByRole("link", { name: /^Release/ }).first(), path: (r) => new RegExp(`${run(r)}/release-candidate$`), root: "[data-screen='release-candidate']" },
      { label: "Lineage", kind: "route", loc: (p) => p.getByRole("link", { name: /^Lineage/ }).first(), path: () => new RegExp(`/lineage$`), search: /run=rrun_/, root: "[data-screen='attempt-lineage']" },
    ],
    writes: () => [
      { name: "Export JSON", find: byName(/^Export JSON/), mode: "any" },
      { name: "Export CSV", find: byName(/^Export CSV/), mode: "any" },
      { name: "Read audit again (linked final audit panel; write-capable, not clicked)", find: (p) => p.locator("[data-linked-final-audit] button", { hasText: /Read audit again/ }), mode: "any" },
      { name: "Run pinned audit (linked final audit panel; write-capable, not clicked)", find: (p) => p.locator("[data-linked-final-audit] button", { hasText: /Run pinned audit/ }), mode: "any" },
      { name: "Print (window.print, not a write; not clicked)", find: byName(/^Print/), mode: "any" },
    ],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S10 ---- */
  {
    id: "S10",
    screen: "S10",
    title: "Attempt lineage",
    root: "[data-screen='attempt-lineage']",
    scope: "run",
    path: (r) => `${RQ}/alphas/${ALPHA}/lineage?av=${AV}&run=${r}`,
    nav: [
      { label: "Library", kind: "route", loc: (p) => p.locator("a[href*='/runs?group=1&alpha=']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
      { label: "New run", kind: "route", loc: (p) => p.getByRole("link", { name: /^New run/ }).first(), path: () => new RegExp(`${RQ}/runs/new$`), root: "[data-screen='new-run']" },
      { label: "Compare", kind: "route", loc: (p) => p.getByRole("link", { name: /^Compare/ }).first(), path: () => new RegExp(`/compare$`), root: "[data-screen='compare']" },
      { label: "Import version", kind: "route", loc: (p) => p.getByRole("link", { name: /^Import version/ }).first(), path: () => new RegExp(`${RQ}/alpha-import$`), root: "[data-screen='alpha-import']" },
      { label: "Open run in Evidence", kind: "route", loc: (p) => p.getByRole("link", { name: /^Open R-.* in Evidence/ }).first(), path: () => new RegExp(`/evidence$`), root: "[data-screen='evidence-flow']" },
      { label: "rc chip → S11", kind: "route", loc: (p) => p.locator("a[href*='/release-candidate']").first(), path: () => new RegExp(`/release-candidate$`), root: "[data-screen='release-candidate']" },
      { label: "action: Report", kind: "route", loc: (p) => p.getByRole("link", { name: /^Report$/ }).first(), path: () => new RegExp(`/report$`), root: "[data-screen='run-report']" },
      { label: "action: Freeze", kind: "route", loc: (p) => p.getByRole("link", { name: /^Freeze$/ }).first(), path: () => new RegExp(`/freeze$`), root: "[data-screen='freeze-detail']" },
      { label: "action: Clone (?from=, a form)", kind: "route", loc: (p) => p.getByRole("link", { name: /^Clone$/ }).first(), path: () => new RegExp(`${RQ}/runs/new$`), search: /from=rrun_/, root: "[data-screen='new-run']" },
    ],
    writes: () => [{ name: "Clone / Declare in New run (links to a form, create nothing)", find: (p) => p.locator("a[href*='runs/new']"), mode: "present" }],
  },
  /* ---- S11 ---- */
  {
    id: "S11",
    screen: "S11",
    title: "Release candidate",
    root: "[data-screen='release-candidate']",
    scope: "run",
    path: (r) => `${run(r)}/release-candidate`,
    nav: [
      { label: "Evidence", kind: "route", loc: (p) => p.locator("a[href$='/evidence']").first(), path: (r) => new RegExp(`${run(r)}/evidence$`), root: "[data-screen='evidence-flow']" },
      { label: "Report", kind: "route", loc: (p) => p.locator("a[href$='/report']").first(), path: (r) => new RegExp(`${run(r)}/report$`), root: "[data-screen='run-report']" },
      { label: "Lineage", kind: "route", loc: (p) => p.locator("a[href*='/lineage']").first(), path: () => new RegExp(`/lineage$`), root: "[data-screen='attempt-lineage']" },
      { label: "Engine Atlas", kind: "route", loc: (p) => p.locator("a[href$='/atlas']").first(), path: () => new RegExp(`${RQ}/atlas$`), root: "[data-screen='engine-atlas']" },
      { label: "evidence pack: Freeze & integrity", kind: "route", loc: (p) => p.getByRole("link", { name: /Freeze & integrity/ }).first(), path: (r) => new RegExp(`${run(r)}/freeze$`), root: "[data-screen='freeze-detail']" },
      { label: "evidence pack: Replay", kind: "route", loc: (p) => p.getByRole("link", { name: /^Replay/ }).first(), path: (r) => new RegExp(`${run(r)}/execute$`), root: "[data-screen='execute-replay']" },
      { label: "evidence pack: Split & chronology", kind: "route", loc: (p) => p.getByRole("link", { name: /Split & chronology/ }).first(), path: (r) => new RegExp(`${run(r)}/split$`), root: "[data-screen='split-detail']" },
      { label: "Compare", kind: "route", loc: (p) => p.getByRole("link", { name: /^Compare/ }).first(), path: () => new RegExp(`/compare$`), root: "[data-screen='compare']" },
    ],
    writes: (kind) => [
      { name: "Read audit again (linked final audit panel; write-capable, not clicked)", find: (p) => p.locator("[data-linked-final-audit] button", { hasText: /Read audit again/ }), mode: "any" },
      { name: "Run pinned audit (linked final audit panel; write-capable, not clicked)", find: (p) => p.locator("[data-linked-final-audit] button", { hasText: /Run pinned audit/ }), mode: "any" },
      { name: "Publish (POST publish)", find: byName(/^Publish/), mode: "any" },
      { name: "Seal / Prepare local RC", find: byName(/^(Seal|Prepare)/i), mode: "any" },
      { name: "copy yaml (clipboard only)", find: (p) => p.locator("[data-action='copy-yaml']"), mode: "any" },
    ],
    states: ["R-P04-022", "FAILED", "QUEUED", "NOT_FOUND"],
  },
  /* ---- S12 ---- */
  ...(["modes", "routes", "claims"] as const).map(
    (tab): Cell => ({
      id: `S12:${tab}`,
      screen: "S12",
      title: `Engine Atlas · ${tab}`,
      root: "[data-screen='engine-atlas']",
      scope: "global",
      path: () => `${RQ}/atlas#tab=${tab}`,
      nav:
        tab === "modes"
          ? [
              { label: "tab: Execution routes", kind: "state", loc: byName("Execution routes", "tab"), hash: { tab: "routes" } },
              { label: "tab: Claims by contract", kind: "state", loc: byName("Claims by contract", "tab"), hash: { tab: "claims" } },
              { label: "tab: WFO modes", kind: "state", loc: byName("WFO modes", "tab") },
              { label: "Declare a run in <mode> → New Run ?mode=", kind: "route", loc: (p) => p.getByRole("link", { name: /^Declare a run in mode_1/ }).first(), path: () => new RegExp(`${RQ}/runs/new$`), search: /mode=mode_1_decay/, root: "[data-screen='new-run']" },
              { label: "Runs of <mode> → Library ?mode=", kind: "route", loc: (p) => p.locator("a[href*='runs?mode=mode_1_decay']").first(), path: () => new RegExp(`${RQ}/runs$`), search: /mode=mode_1_decay/, root: "[data-screen='run-library']" },
              { label: "Journey", kind: "route", loc: (p) => p.locator("a[href$='/journey']").first(), path: () => new RegExp(`${RQ}/journey$`), root: "[data-screen='journey-map']" },
              { label: "Library", kind: "route", loc: (p) => p.locator("a[href$='/runs']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
              { label: "New run", kind: "route", loc: (p) => p.locator("a[href*='runs/new?step=route']").first(), path: () => new RegExp(`${RQ}/runs/new$`), search: /step=route/, root: "[data-screen='new-run']" },
            ]
          : [],
      writes: () => [],
    }),
  ),
  /* ---- S13 ---- */
  ...([
    ["attempts", ""],
    ["markets", "?mode=markets"],
    ["pair", "?mode=pair"],
    ["pair-runs", "?mode=pair&runs=@A,@B"],
  ] as const).map(
    ([mode, q]): Cell => ({
      id: `S13:${mode}`,
      screen: "S13",
      title: `Compare · ${mode}`,
      root: "[data-screen='compare']",
      scope: "global",
      path: () => `${RQ}/alphas/${ALPHA}/compare${q.replace("@A", RUNS["R-WFO-027"] ?? "").replace("@B", RUNS["R-WFO-023"] ?? "")}`,
      nav:
        mode === "attempts"
          ? [
              { label: "tab: Markets", kind: "state", loc: byName("Markets", "tab"), search: /mode=markets/ },
              { label: "tab: Pair", kind: "state", loc: byName("Pair", "tab"), search: /mode=pair/ },
              { label: "tab: Attempts", kind: "state", loc: byName("Attempts", "tab") },
              { label: "Library", kind: "route", loc: (p) => p.locator("a[href*='/runs?group=1&alpha=']").first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
              { label: "Lineage →", kind: "route", loc: (p) => p.getByRole("link", { name: /^Lineage/ }).first(), path: () => new RegExp(`/lineage$`), root: "[data-screen='attempt-lineage']" },
              { label: "run link → evidence", kind: "route", loc: (p) => p.locator("a[href$='/evidence']").first(), path: () => new RegExp(`/evidence$`), root: "[data-screen='evidence-flow']" },
              { label: "Run report link", kind: "route", loc: (p) => p.locator("a[href$='/report']").first(), path: () => new RegExp(`/report$`), root: "[data-screen='run-report']" },
              { label: "Release candidate link", kind: "route", loc: (p) => p.locator("a[href$='/release-candidate']").first(), path: () => new RegExp(`/release-candidate$`), root: "[data-screen='release-candidate']" },
            ]
          : [],
      writes: () => [],
    }),
  ),
  /* ---- S14 ---- */
  {
    id: "S14",
    screen: "S14",
    title: "Alpha Import",
    root: "[data-screen='alpha-import']",
    scope: "global",
    path: () => `${RQ}/alpha-import`,
    act: async (page) => {
      await page.getByRole("tab", { name: /Register/ }).click();
      await page.waitForTimeout(300);
    },
    nav: [
      { label: "Journey", kind: "route", loc: (p) => p.locator("a[href$='/journey']").first(), path: () => new RegExp(`${RQ}/journey$`), root: "[data-screen='journey-map']" },
      { label: "New run →", kind: "route", loc: (p) => p.getByRole("link", { name: /^New run/ }).first(), path: () => new RegExp(`${RQ}/runs/new$`), root: "[data-screen='new-run']" },
      { label: "registry strip (step 3): Library", pre: (p) => p.getByRole("tab", { name: /Register/ }).click(), kind: "route", loc: (p) => p.getByRole("link", { name: /^Library/ }).first(), path: () => new RegExp(`${RQ}/runs$`), root: "[data-screen='run-library']" },
      { label: "registry strip (step 3): lineage →", pre: (p) => p.getByRole("tab", { name: /Register/ }).click(), kind: "route", loc: (p) => p.getByRole("link", { name: /^lineage/ }).first(), path: () => new RegExp(`/lineage$`), search: /av=/, root: "[data-screen='attempt-lineage']" },
      { label: "registry strip (step 3): run →", pre: (p) => p.getByRole("tab", { name: /Register/ }).click(), kind: "route", loc: (p) => p.getByRole("link", { name: /^run →/ }).first(), path: () => new RegExp(`${RQ}/runs/new$`), search: /av=/, root: "[data-screen='new-run']" },
    ],
    writes: () => [
      { name: "Parse (POST parse) · step 1", pre: (p) => p.getByRole("tab", { name: /Source/ }).click(), find: byName(/^Parse/), mode: "disabled" },
      { name: "Run gates (POST gates) · step 2", pre: (p) => p.getByRole("tab", { name: /Gates/ }).click(), find: byName(/^Run gates/), mode: "disabled" },
      { name: "Register draft (POST register) · step 3", pre: (p) => p.getByRole("tab", { name: /Register/ }).click(), find: byName(/^Register draft/), mode: "disabled" },
    ],
  },
];

/* ----------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------- */

/** A screen that opens with only `#fold=N` (S03) preserves exactly that; trial/params are added by the hub. */
const definedOnly = (c: { fold?: string; trial?: string }) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));

const cursorOf = (url: string) => {
  const k = hashKeys(url);
  return { fold: k.fold, trial: k.trial };
};

/** Stable description of what the screen shows: route, hash, selected tab / pressed / current controls, heading. */
async function sig(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const t = (e: Element) => (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const q = (s: string) => [...document.querySelectorAll(s)].map(t);
    const u = new URL(location.href);
    return {
      screen: document.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null,
      path: u.pathname,
      search: u.search,
      hash: u.hash,
      tabs: q("main [role='tab'][aria-selected='true']"),
      pressed: q("main [aria-pressed='true']"),
      current: q("main [aria-current]:not([aria-current='false'])"),
      selected: q("main [data-selected='true']"),
      cursor: q("[data-cursor-summary]"),
      filter: [...document.querySelectorAll<HTMLInputElement>("main input[type='text'], main input:not([type])")].map((i) => i.value),
      heading: document.querySelector("main h1, main [data-page-title]")?.textContent?.trim().slice(0, 60) ?? null,
    };
  });
}

function diff(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Object.keys(a)
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(a[k])} != ${JSON.stringify(b[k])}`);
}

async function describeWrite(l: Locator): Promise<{ n: number; disabled: boolean; reason: string; label: string }> {
  const n = await l.count();
  if (n === 0) return { n, disabled: false, reason: "", label: "" };
  const first = l.first();
  const info = await first.evaluate((el) => {
    const e = el as HTMLButtonElement;
    const described = e.getAttribute("aria-describedby");
    const descText = described ? (document.getElementById(described)?.textContent ?? "") : "";
    const sibling = (e.parentElement?.textContent ?? "").replace(e.textContent ?? "", "").trim();
    return {
      disabled: e.disabled || e.getAttribute("aria-disabled") === "true",
      title: e.getAttribute("title") ?? "",
      described: descText,
      sibling: sibling.slice(0, 160),
      label: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
    };
  });
  return { n, disabled: info.disabled, reason: (info.title || info.described || info.sibling).trim(), label: info.label };
}

/** Every control whose NAME writes or mutates, with disabled/reason, for the receipt (never clicked). */
async function enumerateWrites(page: Page): Promise<string[]> {
  return page.evaluate((src) => {
    const re = new RegExp(src, "i");
    return [...document.querySelectorAll("main button, main a[href], main [role='button']")]
      .map((e) => {
        const el = e as HTMLButtonElement;
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
        const reason = (el.getAttribute("title") || "").slice(0, 70);
        return { tag: el.tagName.toLowerCase(), action: el.getAttribute("data-action") ?? "", name, disabled: el.disabled || el.getAttribute("aria-disabled") === "true", reason };
      })
      .filter((c) => re.test(c.name) || re.test(c.action))
      .map((c) => `${c.tag}${c.action ? `[data-action=${c.action}]` : ""} "${c.name}"${c.disabled ? ` DISABLED(${c.reason || "no reason"})` : ""}`);
  }, WRITE_RE.source);
}

/* ----------------------------------------------------------------------------------------------
 * Discovery
 * -------------------------------------------------------------------------------------------- */

async function discoverLabel(page: Page, label: Label): Promise<string | null> {
  const { status, body } = await pageGet(page, "/api/v1/quantbt/runs?status=COMPLETED&limit=50");
  if (status !== 200 || !Array.isArray(body?.items)) return null;
  return (body.items as { run_id: string; display_label?: string }[]).find((r) => r.display_label === label)?.run_id ?? null;
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" } });
  const page = await context.newPage();
  await signIn(page);
  for (const label of ["R-WFO-023", "R-WFO-027", "R-P04-022"] as Label[]) RUNS[label] = (await discoverLabel(page, label)) ?? undefined;
  RUNS.FAILED = (await discoverRun(page, "FAILED")) ?? undefined;
  RUNS.QUEUED = (await discoverRun(page, "QUEUED")) ?? undefined;
  RUNS.NOT_FOUND = ZERO_RUN;
  await context.close();
});

async function coldContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" }, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await getOnly(page);
  await signIn(page);
  await usePreferences(page, "research");
  return { context, page };
}

/* ----------------------------------------------------------------------------------------------
 * The cell battery
 * -------------------------------------------------------------------------------------------- */

interface Spec {
  cell: Cell;
  kind: RunKind;
  full: boolean;
}

const failures = new Map<string, string[]>();

async function battery({ page, browser }: { page: Page; browser: Browser }, testInfo: TestInfo, spec: Spec): Promise<void> {
  const { cell, kind, full } = spec;
  const runId = kind === "NOT_FOUND" ? ZERO_RUN : (RUNS[kind] ?? "");
  if (cell.scope === "run" && !runId) {
    testInfo.annotations.push({ type: "skip", description: `no ${kind} run in this workspace` });
    testInfo.skip(true, `no ${kind} run in this workspace`);
  }
  const label = kind;
  const cellId = `${cell.id}@${cell.scope === "run" ? kind : "-"}`;
  const url0 = cell.path(runId, label);
  const out: string[] = [];
  const seen: Seen = { errors: [], badStatus: [], endpoints: new Set(), failed: [] };
  const step = async (check: string, fn: () => Promise<string | void>) => {
    const t0 = Date.now();
    try {
      const evidence = (await fn()) ?? "";
      record({ cell: cellId, screen: cell.screen, run: kind, check, status: "PASS", evidence: `${String(evidence).slice(0, 1400)} [${Math.round((Date.now() - t0) / 1000)}s]` });
    } catch (error) {
      const message = String((error as Error).message ?? error).replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim()).slice(0, 14).join(" ").replace(/\s+/g, " ").slice(0, 1400);
      record({ cell: cellId, screen: cell.screen, run: kind, check, status: "FAIL", evidence: `${message} [${Math.round((Date.now() - t0) / 1000)}s]` });
      out.push(`${check}: ${message}`);
    }
  };
  const na = (check: string, why: string) => record({ cell: cellId, screen: cell.screen, run: kind, check, status: "NA", evidence: why });

  await getOnly(page);
  await signIn(page);
  await usePreferences(page, "research");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  observe(page, seen);

  /* ---- load ---- */
  await step("load", async () => {
    await page.goto(url0);
    await ready(page, cell.root);
    const text = (await page.locator("main").first().innerText()).slice(0, 20_000);
    const bad = /\b(undefined|NaN|\[object Object\])\b/.exec(text);
    expect(bad?.[0] ?? null, "no raw undefined/NaN/[object Object] in the screen text").toBeNull();
    if (kind === "NOT_FOUND") {
      expect(text, "unknown run is typed, not blank").toMatch(/Run not available|not found|not available/i);
      const hrefs = await page.locator(`main a[href*="${ZERO_RUN}"]`).count();
      expect(hrefs, "no link to the missing run").toBe(0);
    }
    const screen = await page.locator("[data-screen]").first().getAttribute("data-screen");
    return `data-screen=${screen}; ${cell.scope === "run" ? `run ${kind}=${runId.slice(0, 13)}…` : "global"}; ${url0.replace(RQ, "")}`;
  });

  /* ---- writes (never clicked) ---- */
  await step("writes", async () => {
    const lines: string[] = [];
    const expects = cell.writes?.(kind) ?? [];
    for (const w of expects) {
      if (w.pre) await w.pre(page);
      const d = await describeWrite(w.find(page));
      if (w.mode === "absent") {
        expect(d.n, `${w.name}: absent in this state`).toBe(0);
        lines.push(`${w.name}: absent`);
        continue;
      }
      if (w.mode === "present") expect(d.n, `${w.name}: present`).toBeGreaterThan(0);
      if (w.mode === "disabled") {
        expect(d.n, `${w.name}: present`).toBeGreaterThan(0);
        expect(d.disabled, `${w.name}: disabled`).toBe(true);
      }
      if (d.n > 0 && d.disabled) expect(d.reason.length, `${w.name}: disabled WITH a reason`).toBeGreaterThan(3);
      lines.push(`${w.name}: ${d.n === 0 ? "not rendered in this state" : d.disabled ? `DISABLED (${d.reason.slice(0, 60)})` : "enabled"}`);
    }
    const all = await enumerateWrites(page);
    return `NOT_RUN_WRITE · ${lines.join(" | ")} || enumerated: ${all.join(" ; ")}`.slice(0, 900);
  });

  /* ---- act -> final URL (refresh, deep link) ---- */
  let finalUrl = page.url();
  let before: Record<string, unknown> = {};
  if (cell.act && full && kind !== "NOT_FOUND") {
    await step("act", async () => {
      await cell.act!(page, label);
      finalUrl = page.url();
      before = await sig(page);
      return `state change by GET-only control; ${finalUrl.replace(BASE, "").replace(RQ, "")}`;
    });
  } else {
    before = await sig(page);
    finalUrl = page.url();
  }

  await step("refresh", async () => {
    await page.reload();
    await ready(page, cell.root);
    const after = await sig(page);
    const d = diff(before, after);
    expect(d, `state after reload equals state before (${JSON.stringify(before.hash)}${JSON.stringify(before.search)})`).toEqual([]);
    return `reload kept ${before.path}${before.search ?? ""}${before.hash ?? ""} · tab=${JSON.stringify(before.tabs)} pressed=${JSON.stringify(before.pressed)}`;
  });

  await step("deeplink", async () => {
    const cold = await coldContext(browser);
    const seenCold: Seen = { errors: [], badStatus: [], endpoints: new Set(), failed: [] };
    observe(cold.page, seenCold);
    try {
      await cold.page.goto(finalUrl);
      await ready(cold.page, cell.root);
      const after = await sig(cold.page);
      const d = diff(await sig(page), after);
      /* the cold context shares no storage with the live one, so a local draft (S02) is not carried */
      expect(d, "cold open of the final URL renders the same state").toEqual([]);
      seen.errors.push(...seenCold.errors);
      seen.badStatus.push(...seenCold.badStatus);
      for (const e of seenCold.endpoints) seen.endpoints.add(e);
      return `cold context opened ${finalUrl.replace(BASE, "").replace(RQ, "")} → same screen state`;
    } finally {
      await cold.context.close();
    }
  });

  /* ---- navigation controls ---- */
  if (full && cell.nav?.length && kind !== "NOT_FOUND") {
    await step("nav", async () => {
      const results: string[] = [];
      const problems: string[] = [];
      for (const probe of cell.nav!) {
        if (probe.only && !probe.only.includes(kind)) continue;
        /* restart from the cell's URL for each probe so one probe never poisons the next */
        await page.goto(url0);
        await ready(page, cell.root);
        const startCursor = cursorOf(page.url());
        const startUrl = page.url();
        try {
          if (probe.pre) await probe.pre(page);
          const target = probe.loc(page, runId);
          const n = await target.count();
          if (n === 0) {
            // a control a state legitimately lacks is recorded (not silently skipped) and counted as a finding
            problems.push(`${probe.label}: control not found`);
            continue;
          }
          const el = target.first();
          if (await el.isDisabled().catch(() => false)) {
            problems.push(`${probe.label}: control is disabled`);
            continue;
          }
          await el.scrollIntoViewIfNeeded().catch(() => undefined);
          await el.click({ timeout: 8_000 });
          if (probe.kind === "route") {
            await page.waitForURL((u) => (probe.path ? probe.path(runId).test(u.pathname) : u.href !== startUrl), { timeout: 15_000 });
            const u = new URL(page.url());
            if (probe.search) expect(u.search, `${probe.label}: search`).toMatch(probe.search);
            if (probe.hash) for (const [k, v] of Object.entries(probe.hash)) expect(hashKeys(page.url())[k], `${probe.label}: hash ${k}`).toBe(v);
            if (probe.cursor) {
              const c = cursorOf(page.url());
              expect(c, `${probe.label}: cursor preserved in hash`).toMatchObject(definedOnly(startCursor));
            }
            await ready(page, probe.root ?? "main");
            results.push(`${probe.label} → ${u.pathname.replace(RQ, "")}${u.search}${u.hash.slice(0, 40)}`);
          } else {
            await page.waitForTimeout(500);
            const u = new URL(page.url());
            if (probe.search) expect(u.search, `${probe.label}: search`).toMatch(probe.search);
            if (probe.hash) {
              for (const [k, v] of Object.entries(probe.hash)) {
                const got = hashKeys(page.url())[k];
                if (v === "*") expect(got, `${probe.label}: hash ${k} set`).toBeTruthy();
                else if (v === "!") expect(got, `${probe.label}: hash ${k} changed`).not.toBe((startCursor as Record<string, string | undefined>)[k]);
                else expect(got, `${probe.label}: hash ${k}`).toBe(v);
              }
            }
            if (probe.cursor) {
              const c = cursorOf(page.url());
              expect(c, `${probe.label}: cursor preserved`).toMatchObject(definedOnly(startCursor));
            }
            if (!probe.hash && !probe.search) {
              const selected = await el.getAttribute("aria-selected");
              const pressed = await el.getAttribute("aria-pressed");
              expect(selected === "true" || pressed === "true" || page.url() !== startUrl, `${probe.label}: control took effect`).toBe(true);
            }
            results.push(`${probe.label} → ${u.search}${u.hash.slice(0, 50)}`);
          }
        } catch (error) {
          problems.push(`${probe.label}: ${String((error as Error).message).replace(/\x1b\[[0-9;]*m/g, "").split("\n")[0].slice(0, 160)}`);
        }
      }
      if (problems.length) throw new Error(`${problems.length} of ${cell.nav!.length} controls failed: ${problems.join(" ; ")} || passed: ${results.join(" ; ")}`);
      return `${results.length}/${cell.nav!.length} controls: ${results.join(" ; ")}`;
    });
  } else {
    na("nav", full ? (cell.nav?.length ? "no navigation on a missing run: only the typed Library link exists (asserted in load)" : "no navigation controls on this cell (stage/tab covered by sibling cells)") : "state cell: nav covered by the completed-run cells");
  }

  /* ---- print ---- */
  if (full && kind !== "NOT_FOUND") {
    await step("print", async () => {
      await page.goto(finalUrl);
      await ready(page, cell.root);
      await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
      await page.waitForTimeout(300);
      const visibleNoPrint = await page.evaluate(
        ([selectors, writeSrc]) => {
          const re = new RegExp(writeSrc as string, "i");
          const shown = (e: Element) => {
            const r = (e as HTMLElement).getBoundingClientRect();
            const cs = getComputedStyle(e);
            return cs.display !== "none" && cs.visibility !== "hidden" && (r.width > 0 || r.height > 0);
          };
          const found: string[] = [];
          for (const s of selectors as string[]) for (const e of document.querySelectorAll(s)) if (shown(e)) found.push(`${s} «${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}» ${e.outerHTML.replace(/\s+/g, " ").slice(0, 110)}`);
          for (const e of document.querySelectorAll("main button, main [role='button']")) {
            const name = (e.getAttribute("aria-label") || e.textContent || "").trim();
            if (re.test(name) && shown(e)) found.push(`write-control «${name.slice(0, 30)}»`);
          }
          return [...new Set(found)];
        },
        [NO_PRINT_SELECTORS, WRITE_RE.source] as const,
      );
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      const parsed = readPdfText(pdf);
      const squeezed = parsed.text.join("\n").replace(/\s+/g, "").toLowerCase();
      const allowed: Record<string, string[]> = { S00: ["Command Center", "Portal Map"] };
      const shellHits = SHELL_WORDS.filter((w) => !(allowed[cell.screen] ?? []).includes(w)).filter((w) => squeezed.includes(w.replace(/\s+/g, "").toLowerCase()));
      await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
      expect(parsed.pages, "pdf has pages").toBeGreaterThan(0);
      expect(squeezed.length, "pdf has a text layer").toBeGreaterThan(10);
      expect(shellHits, "no sidebar/top-bar text in the PDF text layer").toEqual([]);
      expect(visibleNoPrint, "no no-print control is visible in print").toEqual([]);
      return `pages=${parsed.pages}; text-layer chars=${squeezed.length}; shell words in PDF: 0; no-print controls visible: 0`;
    });
  } else na("print", kind === "NOT_FOUND" ? "no report to print for a missing run" : "state cell: print asserted on the completed-run cells");

  /* ---- responsive ---- */
  await step("responsive", async () => {
    await page.goto(finalUrl);
    await ready(page, cell.root);
    const rows: string[] = [];
    const bad: string[] = [];
    for (const width of full ? WIDTHS : ([1440, 390] as const)) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(350);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      rows.push(`${width}:${m.sw}/${m.cw}`);
      if (Math.max(m.sw, m.bw) > m.cw + 1) bad.push(`${width}px: scrollWidth ${m.sw} (body ${m.bw}) > ${m.cw}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(bad, "no horizontal page overflow").toEqual([]);
    return `scrollWidth/clientWidth ${rows.join(" ")}`;
  });

  /* ---- a11y ---- */
  await step("a11y", async () => {
    await page.goto(finalUrl);
    await ready(page, cell.root);
    const rows: string[] = [];
    const failing: string[] = [];
    for (const width of full ? ([1440, 390] as const) : ([1440] as const)) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      const result = await analyze(page, "body");
      const bad = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      const moderate = result.violations.filter((v) => v.impact === "moderate").length;
      rows.push(`${width}: critical/serious ${bad.reduce((n, v) => n + v.nodes.length, 0)} nodes, moderate rules ${moderate}, axe ${result.axe_version}`);
      for (const v of bad) failing.push(`${width}px ${v.impact}:${v.rule} ×${v.nodes.length} e.g. ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.summary.slice(0, 80)}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(failing, "axe: 0 critical/serious").toEqual([]);
    return rows.join(" | ");
  });

  /* ---- console ---- */
  await step("console", async () => {
    const unexpectedStatus = seen.badStatus.filter((b) => !expected4xx(kind, b.path, b.status));
    const expectedStatus = seen.badStatus.filter((b) => expected4xx(kind, b.path, b.status));
    const unexpectedErrors = seen.errors.filter((e) => {
      const m = /status of (\d{3})/.exec(e.text);
      if (m) {
        const path = e.url ? new URL(e.url).pathname : "";
        return !expected4xx(kind, path, Number(m[1]));
      }
      return true;
    });
    const endpoints = [...seen.endpoints].sort();
    const note = `GET endpoints: ${endpoints.join(", ")}`;
    expect(unexpectedErrors.map((e) => `${e.text.slice(0, 120)} @ ${e.url}`), "console errors").toEqual([]);
    expect(unexpectedStatus.map((b) => `${b.status} ${b.path}`), "failed API requests").toEqual([]);
    expect(seen.failed, "network failures").toEqual([]);
    const exp = [...new Set(expectedStatus.map((b) => `${b.status} ${b.path.replace(/rrun_[0-9a-f]{32}/, "{run}")}`))];
    return `0 unexpected console errors / failed requests${exp.length ? `; documented expected 4xx for ${kind}: ${exp.join(", ")}` : ""}. ${note}`;
  });

  expect(out, `${cellId}: failed checks`).toEqual([]);
}

/* ----------------------------------------------------------------------------------------------
 * Generation
 * -------------------------------------------------------------------------------------------- */

test.describe("P24 15-screen matrix", () => {
  test.setTimeout(300_000);
  /* a missing control must fail in seconds, never wait out the test timeout */
  test.use({ actionTimeout: 10_000, navigationTimeout: 30_000 });
  for (const cell of CELLS) {
    if (cell.scope === "global") {
      test(`${cell.id} ${cell.title}`, async ({ page, browser }, info) => battery({ page, browser }, info, { cell, kind: "R-WFO-023", full: true }));
      continue;
    }
    for (const label of ["R-WFO-023", "R-WFO-027"] as Label[]) {
      test(`${cell.id} ${cell.title} · ${label}`, async ({ page, browser }, info) => battery({ page, browser }, info, { cell, kind: label, full: true }));
    }
    for (const kind of cell.states ?? []) {
      test(`${cell.id} ${cell.title} · state ${kind}`, async ({ page, browser }, info) => battery({ page, browser }, info, { cell, kind, full: false }));
    }
  }
});
