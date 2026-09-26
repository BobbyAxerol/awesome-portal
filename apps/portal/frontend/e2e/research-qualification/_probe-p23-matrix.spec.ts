/**
 * M1 — fifteen Research screens × three widths × four states, fixture lane.
 *
 * Per cell: horizontal overflow ≤ 1 px, zero console error/warning/pageerror
 * (a Chrome resource line for a URL the stub deliberately refused is expected
 * and listed, not counted), exactly one `.portal-shell`, no visible bare
 * placeholder text node, the first Tab from the screen's start lands inside the
 * screen, and deep link → back → forward → reload keeps pathname + hash.
 *
 * Healthy cells also check that the evidence cursor survives a tab switch
 * (04) or the return to the hub (05–08) and take one full-page screenshot.
 * Denied cells refuse the primary read with 403, then 404, and require the
 * same neutral copy (F-04). Expired cells answer 401 and require a session
 * state with zero write requests. Every refusal carries a sentinel sentence
 * that no screen may print.
 */
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { freezeClock } from "../fixtures";
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
  SIGN_IN_FRAME,
} from "./harness";
import {
  SCREENS,
  SERVER_PROSE_SENTINEL,
  installLane,
  refusePrimary,
  watchConsole,
  watchNetwork,
  type NetLog,
  type ScreenDef,
} from "./stubs";

type State = "healthy" | "denied" | "unavailable" | "expired";

const START = "/research/quantbt/journey";
const START_FOR_JOURNEY = "/research/quantbt/atlas";

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

/** Deep link → back → forward → reload keeps pathname + hash. */
async function historyCheck(cell: Cell, s: ScreenDef, tag: string): Promise<void> {
  const { page, net } = cell;
  const start = s.id === "00" ? START_FOR_JOURNEY : START;
  await page.goto(start);
  await quiet(page, net);
  await page.goto(s.path);
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  const deep = await location(page);
  await page.goBack();
  await quiet(page, net);
  expect.soft(new URL(page.url()).pathname, `${tag} back returns to the previous route`).toBe(start);
  await page.goForward();
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  expect.soft(await location(page), `${tag} forward keeps pathname+hash`).toBe(deep);
  await page.reload();
  await page.locator(`${s.root}, ${SIGN_IN_FRAME}`).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  await quiet(page, net);
  expect.soft(await location(page), `${tag} reload keeps pathname+hash`).toBe(deep);
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

const normalise = (text: string) =>
  text
    .replace(/req_p23_[a-z_]*\d+/g, "req")
    .replace(/\b40[34]\b/g, "40x")
    .trim();

for (const s of SCREENS) {
  test.describe(`screen ${s.id} ${s.title}`, () => {
    test(`healthy state is clean at every width`, async ({ browser }) => {
      guide("P23-T15");
      for (const width of WIDTHS) {
        const tag = `[s${s.id} healthy ${width}]`;
        await test.step(`${width}px`, async () => {
          await withCell(browser, width, async (cell) => {
          const { page } = cell;
          const rendered = await open(page, cell.net, s.path, s.root);
          expect.soft(rendered, `${tag} screen root renders`).toBe(true);
          await staticChecks(cell, s, tag);
          await page.screenshot({ path: join(shotDir(), `s${s.id}-healthy-${width}.png`), fullPage: true });
          await historyCheck(cell, s, tag);
          if (s.cursor) await cursorSurvives(cell, s, tag);
          expect.soft(cell.net.writes().map((r) => `${r.method} ${r.url}`), `${tag} write requests`).toEqual([]);
          consoleChecks(cell, tag);
          });
        });
      }
    });

    test(`denied state shows one neutral copy for 403 and 404`, async ({ browser }) => {
      guide("P23-T15");
      for (const width of WIDTHS) {
        const tag = `[s${s.id} denied ${width}]`;
        await test.step(`${width}px`, async () => {
          await withCell(browser, width, async (cell) => {
          const { page } = cell;
          const lift403 = await refusePrimary(page, s.primary, 403);
          const rendered = await open(page, cell.net, s.path, s.root);
          expect.soft(rendered, `${tag} screen root renders under 403`).toBe(true);
          const text403 = await rootText(page, s.root);
          await staticChecks(cell, s, `${tag} 403`);
          await historyCheck(cell, s, `${tag} 403`);
          await lift403();
          await refusePrimary(page, s.primary, 404);
          await open(page, cell.net, s.path, s.root);
          const text404 = await rootText(page, s.root);
          expect.soft(text403.includes(SERVER_PROSE_SENTINEL) || text404.includes(SERVER_PROSE_SENTINEL), `${tag} server prose rendered on screen`).toBe(false);
          expect.soft(normalise(text404), `${tag} 404 copy equals 403 copy (F-04)`).toBe(normalise(text403));
          const [n403, n404] = [normalise(text403), normalise(text404)];
          let at = 0;
          while (at < n403.length && n403[at] === n404[at]) at += 1;
          test.info().annotations.push({
            type: "denied-copy",
            description: n403 === n404 ? `${tag} identical` : `${tag} first difference at ${at} — 403: …${n403.slice(Math.max(0, at - 40), at + 140)}… || 404: …${n404.slice(Math.max(0, at - 40), at + 140)}…`,
          });
          expect.soft(cell.net.writes().map((r) => `${r.method} ${r.url}`), `${tag} write requests`).toEqual([]);
          consoleChecks(cell, tag);
          });
        });
      }
    });

    test(`unavailable 503 renders the screen's own state`, async ({ browser }) => {
      guide("P23-T15");
      for (const width of WIDTHS) {
        const tag = `[s${s.id} unavailable ${width}]`;
        await test.step(`${width}px`, async () => {
          await withCell(browser, width, async (cell) => {
          const { page } = cell;
          await refusePrimary(page, s.primary, 503);
          const rendered = await open(page, cell.net, s.path, s.root);
          expect.soft(rendered, `${tag} screen root renders under 503`).toBe(true);
          await staticChecks(cell, s, tag);
          await historyCheck(cell, s, tag);
          const text = await rootText(page, s.root);
          expect.soft(text.includes(SERVER_PROSE_SENTINEL), `${tag} server prose rendered on screen`).toBe(false);
          expect.soft(cell.net.writes().map((r) => `${r.method} ${r.url}`), `${tag} write requests`).toEqual([]);
          consoleChecks(cell, tag);
          });
        });
      }
    });

    test(`expired session renders a sign-in state and sends no write`, async ({ browser }) => {
      guide("P23-T15");
      for (const width of WIDTHS) {
        const tag = `[s${s.id} expired ${width}]`;
        await test.step(`${width}px`, async () => {
          await withCell(browser, width, async (cell) => {
          const { page } = cell;
          await refusePrimary(page, s.primary, 401);
          const rendered = await open(page, cell.net, s.path, s.root);
          /*
           * X3 2026-09-26 (VD-P23-02): the decided sign-in state is the shell's
           * Frame 01D — every Research client reports a 401 and AuthGate
           * replaces the shell without navigating. A screen that still keeps
           * its own root must carry the session copy there instead. Either is
           * a sign-in state; which one each screen used is annotated.
           */
          const frame = await page.locator(SIGN_IN_FRAME).first().isVisible();
          test.info().annotations.push({ type: "sign-in", description: `${tag} ${frame ? "Frame 01D" : rendered ? "screen root" : "neither"}` });
          expect.soft(frame || rendered, `${tag} a sign-in state renders under 401 (Frame 01D or the screen root)`).toBe(true);
          if (frame) {
            expect.soft(new URL(page.url()).pathname, `${tag} Frame 01D keeps the reader's URL`).toBe(new URL(s.path, "http://x").pathname);
          } else {
            await staticChecks(cell, s, tag);
          }
          await historyCheck(cell, s, tag);
          const text = frame ? await rootText(page, SIGN_IN_FRAME) : await rootText(page, s.root);
          const sessionState = /session/i.test(text) && /(sign in|sign-in|signed out|ended|expired)/i.test(text);
          expect.soft(sessionState, `${tag} session-expired copy on screen; saw: ${text.slice(0, 160)}`).toBe(true);
          expect.soft(text.includes(SERVER_PROSE_SENTINEL), `${tag} server prose rendered on screen`).toBe(false);
          expect.soft(cell.net.writes().map((r) => `${r.method} ${r.url}`), `${tag} write requests`).toEqual([]);
          consoleChecks(cell, tag);
          });
        });
      }
    });
  });
}
