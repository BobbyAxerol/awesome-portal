/**
 * M1 — fifteen Research screens × three widths × the project's component
 * states, fixture lane (FG-07).
 *
 * States: the seven of `src/lib/portalState.ts` (`loading / empty / partial /
 * stale / denied / unavailable / terminal`) plus `healthy` and `expired`
 * (401). Which ones a screen can reach, and how, is `states.ts`; a state a
 * screen cannot reach is NOT_APPLICABLE with its file:line reason and is
 * printed by the first test here, never skipped silently.
 *
 * Per cell: horizontal overflow ≤ 1 px, zero console error/warning/pageerror
 * (a Chrome resource line for a URL the stub deliberately refused is expected
 * and listed, not counted), exactly one `.portal-shell`, no visible bare
 * placeholder text node, the first Tab from the screen's start lands inside the
 * screen, no write request, no request answered by the 501 catch-all, and —
 * FG-07 — the state is visibly distinguishable: the state's own marker is
 * visible and no other state's marker of that screen is. Every stubbed
 * refusal carries a server-prose sentinel that must not be anywhere in
 * `document.body.textContent` (collapsed disclosures included).
 *
 * Healthy, empty, partial, denied, unavailable, terminal and expired cells
 * also check deep link → back → forward → reload keeps pathname + search +
 * hash; healthy cells also check the evidence cursor survives a tab switch
 * (04) or the return to the hub (05–08). Denied cells refuse with 403, then
 * 404, and require the same neutral copy (F-04). Expired cells require the
 * shell's session-expired frame (or session copy in the root) and no write.
 */
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { freezeClock, settle } from "../fixtures";
import {
  HEIGHT,
  WIDTHS,
  contextOptions,
  barePlaceholders,
  cursorKeys,
  firstTab,
  guide,
  horizontalOverflow,
  location,
  open,
  quiet,
  rootText,
  shellCount,
  shotDir,
  writeJson,
  SIGN_IN_FRAME,
} from "./harness";
import { STATES, markersOf, plansFor, type Plan, type Recipe, type State } from "./states";
import {
  SCREENS,
  SERVER_PROSE_SENTINEL,
  hold,
  installLane,
  refusePrimary,
  watchConsole,
  watchNetwork,
  type NetLog,
  type ScreenDef,
} from "./stubs";

const START = "/research/quantbt/journey";
const START_FOR_JOURNEY = "/research/quantbt/atlas";

/** Screens whose source other packages edit during this slice (RULES: PENDING_REBUILD on failure). */
const CONCURRENT = new Set(["01", "02", "11"]);

interface Cell {
  page: Page;
  net: NetLog;
  noise: string[];
  expected: string[];
}

/** One fresh context per cell: own cookie jar, own routes, own listeners. */
async function withCell(browser: Browser, width: number, body: (cell: Cell) => Promise<void>): Promise<void> {
  const context = await browser.newContext(contextOptions({ viewport: { width, height: HEIGHT } }));
  try {
    const page = await context.newPage();
    await body(await boot(page));
  } finally {
    await context.close();
  }
}

async function boot(page: Page): Promise<Cell> {
  await freezeClock(page);
  await installLane(page);
  const net = watchNetwork(page);
  const { noise, expected } = watchConsole(page, net);
  return { page, net, noise, expected };
}

/** Static checks shared by every cell; each failure is a soft expectation. */
async function staticChecks(cell: Cell, s: ScreenDef, tag: string): Promise<void> {
  const { page } = cell;
  const overflow = await horizontalOverflow(page);
  expect.soft(overflow, `${tag} horizontal overflow px`).toBeLessThanOrEqual(1);
  expect.soft(await shellCount(page), `${tag} .portal-shell count`).toBe(1);
  const bare = await barePlaceholders(page, s.root);
  expect.soft(bare, `${tag} bare placeholder text nodes`).toEqual([]);
  const tab = await firstTab(page, s.root);
  if (tab.tabbable > 0) {
    expect.soft(tab.inside, `${tag} first Tab landed on ${tab.landed} (outside the screen; ${tab.tabbable} tabbable inside)`).toBe(true);
  } else {
    test.info().annotations.push({ type: "note", description: `${tag} screen has no tabbable element; first Tab not applicable` });
  }
}

/** Deep link → back → forward → reload keeps pathname + search + hash. */
async function historyCheck(cell: Cell, s: ScreenDef, path: string, tag: string): Promise<void> {
  const { page, net } = cell;
  const start = s.id === "00" ? START_FOR_JOURNEY : START;
  await page.goto(start);
  await quiet(page, net);
  await page.goto(path);
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  const deep = await location(page);
  await page.goBack();
  await quiet(page, net);
  expect.soft(new URL(page.url()).pathname, `${tag} back returns to the previous route`).toBe(start);
  await page.goForward();
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  expect.soft(await location(page), `${tag} forward keeps pathname+search+hash`).toBe(deep);
  await page.reload();
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  expect.soft(await location(page), `${tag} reload keeps pathname+search+hash`).toBe(deep);
}

/** 04: another tab keeps fold/params; 05–08: the hub link carries them into 04. */
async function cursorSurvives(cell: Cell, s: ScreenDef, tag: string): Promise<void> {
  const { page, net } = cell;
  const before = cursorKeys(await location(page));
  if (s.id === "04") {
    const other = page.locator(`${s.root} [role='tab'][data-tab][aria-selected='false']`).first();
    await other.click();
  } else {
    await page.locator(`${s.root} [data-action='back-to-hub']`).first().click();
    await page.waitForURL(/\/evidence(#|$)/, { timeout: 10_000 });
  }
  await quiet(page, net);
  const after = cursorKeys(await location(page));
  for (const key of ["fold", "params"] as const) {
    if (before[key] === undefined) continue;
    expect.soft(after[key], `${tag} cursor key ${key} survives ${s.id === "04" ? "tab switch" : "return to hub"}`).toBe(before[key]);
  }
}

function consoleChecks(cell: Cell, tag: string): void {
  expect.soft(cell.noise, `${tag} console error/warning/pageerror`).toEqual([]);
  expect.soft(cell.net.gaps, `${tag} requests answered by the 501 catch-all (fixture gap)`).toEqual([]);
  if (cell.expected.length) {
    test.info().annotations.push({ type: "expected-console", description: `${tag}: ${[...new Set(cell.expected)].join(" | ")}` });
  }
}

/** Elements matching `selector` that are rendered and not hidden. */
async function visibleCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
      if (el.getClientRects().length === 0) return false;
      if (el.closest("[aria-hidden='true'], [hidden]")) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none";
    }).length;
  }, selector);
}

const RETAINING: ReadonlySet<State> = new Set(["healthy", "partial", "stale"]);

/** FG-07: this state's marker is visible and no other state's marker of this screen is. */
async function distinguishable(page: Page, s: ScreenDef, state: State, marker: string, tag: string): Promise<void> {
  await page.locator(marker).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  expect.soft(await visibleCount(page, marker), `${tag} state marker ${marker} visible`).toBeGreaterThan(0);
  const others: string[] = [];
  for (const other of markersOf(s.id)) {
    if (other.state === state || other.marker === marker) continue;
    /* healthy, partial and stale all keep the screen's content (ResearchPanel
       `retainsContent`), so their markers may legitimately coexist; every
       other pair must be exclusive. */
    if (RETAINING.has(state) && RETAINING.has(other.state)) continue;
    if ((await visibleCount(page, other.marker)) > 0) others.push(`${other.state}: ${other.marker}`);
  }
  expect.soft(others, `${tag} markers of other states visible at the same time`).toEqual([]);
}

/** No stubbed server sentence anywhere in the document, collapsed disclosures included. */
async function noServerProse(page: Page, tag: string): Promise<void> {
  const { dom, visible } = await page.evaluate((sentinel) => {
    const body = document.body;
    return { dom: (body.textContent ?? "").includes(sentinel), visible: (body.innerText ?? "").includes(sentinel) };
  }, SERVER_PROSE_SENTINEL);
  if (dom && !visible) test.info().annotations.push({ type: "server-prose", description: `${tag} sentinel is in a collapsed/hidden node only` });
  expect.soft(dom, `${tag} server prose (error.message sentinel) in document.body.textContent${visible ? " — visible" : ""}`).toBe(false);
}

const normalise = (text: string) =>
  text
    .replace(/req_p23_[a-z_]*\d+/g, "req")
    .replace(/\b40[34]\b/g, "40x")
    .trim();

const TITLES: Record<State, string> = {
  healthy: "healthy state is clean at every width",
  loading: "loading state shows its own marker while the primary read is held",
  empty: "empty state shows its own marker for a contract-empty answer",
  partial: "partial state shows its own marker for a declared source gap",
  stale: "stale state keeps accepted content under its own marker",
  denied: "denied state shows one neutral copy for 403 and 404",
  unavailable: "unavailable 503 renders the screen's own state",
  terminal: "terminal refusal renders the screen's own terminal state",
  expired: "expired session renders a sign-in state and sends no write",
};

/** States whose sequence leaves nothing in flight, so the history walk is meaningful. */
const HISTORY: ReadonlySet<State> = new Set(["healthy", "empty", "partial", "unavailable", "terminal"]);

async function arrange(page: Page, r: Recipe, primary: RegExp): Promise<{ held: boolean }> {
  if (r.arrange) await r.arrange(page);
  if (r.refuse) await refusePrimary(page, primary, r.refuse.status, r.refuse.code);
  if (r.holdPrimary) {
    await hold(page, primary);
    return { held: true };
  }
  return { held: false };
}

/** healthy / loading / empty / partial / stale / unavailable / terminal. */
async function stateCell(cell: Cell, s: ScreenDef, state: State, r: Recipe, width: number): Promise<void> {
  const { page, net } = cell;
  const tag = `[s${s.id} ${state} ${width}]`;
  const path = r.path ?? s.path;
  const primary = r.primary ?? s.primary;
  const { held } = await arrange(page, r, primary);
  if (held) {
    await page.goto(path);
    if (r.reveal) await r.reveal(page);
    await page.locator(r.marker).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await settle(page);
    expect.soft(await page.locator(s.root).first().isVisible(), `${tag} screen root renders while the read is held`).toBe(true);
  } else {
    const rendered = await open(page, net, path, s.root);
    expect.soft(rendered, `${tag} screen root renders`).toBe(true);
    if (r.reveal) await r.reveal(page);
  }
  if (r.act) {
    await r.act({ page, s, quiet: () => quiet(page, net) });
    await page.locator(r.marker).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    await settle(page);
  }
  await distinguishable(page, s, state, r.marker, tag);
  await staticChecks(cell, s, tag);
  await noServerProse(page, tag);
  await page.screenshot({ path: join(shotDir(), `s${s.id}-${state}-${width}.png`), fullPage: true });
  if (HISTORY.has(state)) {
    await historyCheck(cell, s, path, tag);
    await noServerProse(page, `${tag} after history`);
  }
  if (state === "healthy" && s.cursor) await cursorSurvives(cell, s, tag);
  expect.soft(cell.net.writes().map((q) => `${q.method} ${q.url}`), `${tag} write requests`).toEqual([]);
  consoleChecks(cell, tag);
}

async function deniedCell(cell: Cell, s: ScreenDef, r: Recipe, width: number): Promise<void> {
  const { page, net } = cell;
  const tag = `[s${s.id} denied ${width}]`;
  const path = r.path ?? s.path;
  const primary = r.primary ?? s.primary;
  if (r.arrange) await r.arrange(page);
  const lift403 = await refusePrimary(page, primary, 403);
  const rendered = await open(page, net, path, s.root);
  expect.soft(rendered, `${tag} screen root renders under 403`).toBe(true);
  if (r.reveal) await r.reveal(page);
  await distinguishable(page, s, "denied", r.marker, `${tag} 403`);
  const text403 = await rootText(page, s.root);
  await staticChecks(cell, s, `${tag} 403`);
  await noServerProse(page, `${tag} 403`);
  await page.screenshot({ path: join(shotDir(), `s${s.id}-denied403-${width}.png`), fullPage: true });
  await historyCheck(cell, s, path, `${tag} 403`);
  await lift403();
  await refusePrimary(page, primary, 404);
  await open(page, net, path, s.root);
  if (r.reveal) await r.reveal(page);
  await distinguishable(page, s, "denied", r.marker, `${tag} 404`);
  const text404 = await rootText(page, s.root);
  await noServerProse(page, `${tag} 404`);
  await page.screenshot({ path: join(shotDir(), `s${s.id}-denied404-${width}.png`), fullPage: true });
  expect.soft(normalise(text404), `${tag} 404 copy equals 403 copy (F-04)`).toBe(normalise(text403));
  const [n403, n404] = [normalise(text403), normalise(text404)];
  let at = 0;
  while (at < n403.length && n403[at] === n404[at]) at += 1;
  test.info().annotations.push({
    type: "denied-copy",
    description: n403 === n404 ? `${tag} identical` : `${tag} first difference at ${at} — 403: …${n403.slice(Math.max(0, at - 40), at + 140)}… || 404: …${n404.slice(Math.max(0, at - 40), at + 140)}…`,
  });
  expect.soft(cell.net.writes().map((q) => `${q.method} ${q.url}`), `${tag} write requests`).toEqual([]);
  consoleChecks(cell, tag);
}

async function expiredCell(cell: Cell, s: ScreenDef, r: Recipe, width: number): Promise<void> {
  const { page, net } = cell;
  const tag = `[s${s.id} expired ${width}]`;
  const path = r.path ?? s.path;
  await refusePrimary(page, r.primary ?? s.primary, 401);
  const rendered = await open(page, net, path, s.root);
  /*
   * X3 2026-09-26 (VD-P23-02): the decided sign-in state is the shell's
   * Frame 01D — every Research client reports a 401 and AuthGate replaces
   * the shell without navigating. A screen that still keeps its own root
   * must carry the session copy there instead. Either is a sign-in state;
   * which one each screen used is annotated.
   */
  const frame = await page.locator(SIGN_IN_FRAME).first().isVisible();
  test.info().annotations.push({ type: "sign-in", description: `${tag} ${frame ? "Frame 01D" : rendered ? "screen root" : "neither"}` });
  expect.soft(frame || rendered, `${tag} a sign-in state renders under 401 (Frame 01D or the screen root)`).toBe(true);
  if (frame) {
    await distinguishable(page, s, "expired", r.marker, tag);
    expect.soft(new URL(page.url()).pathname, `${tag} Frame 01D keeps the reader's URL`).toBe(new URL(path, "http://x").pathname);
    expect.soft(await horizontalOverflow(page), `${tag} horizontal overflow px`).toBeLessThanOrEqual(1);
  } else {
    await staticChecks(cell, s, tag);
  }
  await noServerProse(page, tag);
  await page.screenshot({ path: join(shotDir(), `s${s.id}-expired-${width}.png`), fullPage: true });
  await historyCheck(cell, s, path, tag);
  const text = frame ? await rootText(page, SIGN_IN_FRAME) : await rootText(page, s.root);
  const sessionState = /session/i.test(text) && /(sign in|sign-in|signed out|ended|expired)/i.test(text);
  expect.soft(sessionState, `${tag} session-expired copy on screen; saw: ${text.slice(0, 160)}`).toBe(true);
  await noServerProse(page, `${tag} after history`);
  expect.soft(cell.net.writes().map((q) => `${q.method} ${q.url}`), `${tag} write requests`).toEqual([]);
  consoleChecks(cell, tag);
}

/* --------------------------------------------------------------- the table */

test("state applicability table lists every screen and state, with a file:line reason for each NOT_APPLICABLE", () => {
  guide("P23-T15");
  const rows = SCREENS.map((s) => ({ id: s.id, title: s.title, plans: plansFor(s.id) }));
  const cell = (p: Plan) => (p.kind === "RUN" ? "RUN" : "NOT_APPLICABLE");
  const lines = [
    `| screen | ${STATES.join(" | ")} |`,
    `|---|${STATES.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| S${r.id} ${r.title} | ${r.plans.map(cell).join(" | ")} |`),
    "",
    "| screen | state | NOT_APPLICABLE reason |",
    "|---|---|---|",
    ...rows.flatMap((r) => r.plans.flatMap((p) => (p.kind === "NOT_APPLICABLE" ? [`| S${r.id} | ${p.state} | ${p.reason} |`] : []))),
  ];
  const table = lines.join("\n");
  console.log(`\nState applicability (FG-07):\n${table}\n`);
  writeJson(
    "state-applicability.json",
    rows.map((r) => ({
      screen: r.id,
      title: r.title,
      states: Object.fromEntries(r.plans.map((p) => [p.state, p.kind === "RUN" ? { kind: "RUN", marker: p.recipe.marker, source: p.recipe.source } : { kind: "NOT_APPLICABLE", reason: p.reason }])),
    })),
  );
  test.info().annotations.push({ type: "state-applicability", description: table });
  for (const r of rows) {
    for (const p of r.plans) {
      if (p.kind === "NOT_APPLICABLE") expect.soft(p.reason, `S${r.id} ${p.state} reason names a file:line`).toMatch(/\.(tsx?|d\.ts)(:\d+)?/);
      else expect.soft(p.recipe.source, `S${r.id} ${p.state} source names a file:line`).toMatch(/\.(tsx?|d\.ts):\d+/);
    }
  }
});

/* ---------------------------------------------------------------- the cells */

for (const s of SCREENS) {
  test.describe(`screen ${s.id} ${s.title}`, () => {
    for (const plan of plansFor(s.id)) {
      if (plan.kind !== "RUN") continue;
      const { state, recipe } = plan;
      test(TITLES[state], async ({ browser }) => {
        guide("P23-T15");
        guide("FG-07");
        if (CONCURRENT.has(s.id)) test.info().annotations.push({ type: "concurrent-edit", description: `S${s.id} source is edited by another package during this slice; a failure caused by that edit is PENDING_REBUILD` });
        test.info().annotations.push({ type: "state-source", description: `${state}: ${recipe.source}` });
        for (const width of WIDTHS) {
          await test.step(`${width}px`, async () => {
            await withCell(browser, width, async (cell) => {
              if (state === "denied") await deniedCell(cell, s, recipe, width);
              else if (state === "expired") await expiredCell(cell, s, recipe, width);
              else await stateCell(cell, s, state, recipe, width);
            });
          });
        }
      });
    }
  });
}
