/**
 * P23 qualification lane — page-level measurements shared by the specs.
 *
 * Everything here observes; nothing changes product state except the one
 * temporary `tabindex="-1"` used to place the sequential-focus start point at
 * the screen root (removed again before the check returns).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";

import { settle } from "../fixtures";
import type { NetLog, ScreenDef } from "./stubs";

export const WIDTHS = [1280, 660, 1440] as const;
export const HEIGHT = 900;

/** Options for a context created by hand (the config's `use` only reaches the default one). */
export function contextOptions(extra: BrowserContextOptions = {}): BrowserContextOptions {
  return {
    baseURL: process.env.RESEARCH_QUAL_BASE_URL,
    viewport: { width: 1280, height: HEIGHT },
    locale: "en-US",
    timezoneId: "UTC",
    ...extra,
  };
}

export function shotDir(): string {
  const dir = process.env.P23_SHOT_DIR;
  if (!dir) throw new Error("P23_SHOT_DIR is not set");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(name: string, value: unknown): string {
  const file = join(shotDir(), name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/**
 * Adds one row to `name` as soon as it is known, replacing an earlier row with
 * the same key. Playwright starts a fresh worker after a failed test, so rows
 * held in module state until `afterAll` would lose everything recorded before
 * the failure; writing per row keeps them.
 */
export function upsertRow<T extends object>(name: string, label: string, key: string, row: T): void {
  const file = join(shotDir(), name);
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { rows?: Array<T & { key: string }> }) : {};
  const rows = (current.rows ?? []).filter((r) => r.key !== key);
  rows.push({ key, ...row });
  writeFileSync(file, `${JSON.stringify({ label, rows }, null, 2)}\n`);
}

/** Bounded settle: no `/api/` request in flight, then the repository's `settle`. */
export async function quiet(page: Page, net: NetLog, timeout = 8_000): Promise<void> {
  const drained = () =>
    expect
      .poll(() => net.pending(), { timeout, intervals: [50, 100, 200] })
      .toBe(0)
      .catch(() => {
        /* Every stub answers at once (or after a stated hold), so a request
           still open after `timeout` is one whose finish event Playwright did
           not deliver — seen across history navigation. It is closed here and
           annotated rather than failing the cell; the A1 report counts these. */
        const stuck = net.requests.filter((r) => r.endedAt === null);
        for (const r of stuck) {
          r.endedAt = Date.now();
          r.failure = "no-finish-event";
        }
        test.info().annotations.push({ type: "no-finish-event", description: `${timeout} ms: ${stuck.map((r) => `${r.method} ${r.url}`).join(", ")}` });
      });
  await drained();
  await settle(page);
  await drained();
}

/** Opens a path and waits for the screen root; returns whether the root rendered. */
/**
 * The shell's Frame 01D session-expired presentation (RF01-F3). A Research
 * client that receives a 401 reports it and `AuthGate` replaces the shell with
 * this frame without navigating, so "Sign in again" returns to the same URL.
 */
export const SIGN_IN_FRAME = "[data-testid='access-problem-screen'][data-problem='SESSION_EXPIRED']";

export async function open(page: Page, net: NetLog, path: string, root: string): Promise<boolean> {
  await page.goto(path);
  await page
    .locator(`${root}, ${SIGN_IN_FRAME}`)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => undefined);
  await quiet(page, net);
  return page.locator(root).first().isVisible();
}

/** Client-side navigation through the router, as an in-app link would do. */
export async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState(null, "", to);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, path);
}

export const location = (page: Page): Promise<string> =>
  page.evaluate(() => `${window.location.pathname}${window.location.hash}`);

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export async function shellCount(page: Page): Promise<number> {
  return page.locator(".portal-shell").count();
}

export async function domNodes(page: Page): Promise<number> {
  return page.evaluate(() => document.getElementsByTagName("*").length);
}

/** Visible text nodes inside `root` whose whole content is a placeholder token. */
export async function barePlaceholders(page: Page, root: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const scope = document.querySelector(selector) ?? document.querySelector("main#portal-content");
    if (!scope) return [];
    const tokens = new Set(["N/A", "n/a", "undefined", "null", "NaN", "—"]);
    const out: string[] = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (!tokens.has(text)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = window.getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none" || parent.getClientRects().length === 0) continue;
      if (parent.closest("[aria-hidden='true']")) continue;
      /* "—" is also typography (a separator inside a sentence, or a glyph
         beside a stated absence reason). It counts as a placeholder only when
         it is the whole content of its element and nothing next to it says
         why the value is absent. The word tokens always count. */
      if (text === "—") {
        if ((parent.textContent ?? "").trim() !== "—") continue;
        const beside = (parent.parentElement?.textContent ?? "").replace("—", " ");
        if (/(not published|withheld|denied|unavailable|not applicable|not issued|[A-Z][A-Z0-9]*_[A-Z0-9_]{4,})/i.test(beside)) continue;
      }
      const tag = parent.tagName.toLowerCase();
      const hint = parent.getAttribute("data-metric") ?? parent.getAttribute("data-field") ?? parent.className.toString().slice(0, 40);
      const around = ((parent.parentElement as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      out.push(`${JSON.stringify(text)} in <${tag}${hint ? ` ${hint}` : ""}> within "${around}"`);
    }
    return out;
  }, root);
}

export interface FirstTab {
  /** Tabbable elements inside the screen root. */
  tabbable: number;
  /** Where the first Tab from the screen's start landed. */
  landed: string;
  inside: boolean;
}

/**
 * Puts the sequential-focus start point at the screen root and presses Tab
 * once. The shell's own controls precede the screen in DOM order, so the
 * screen's start (not the document's) is the meaningful origin.
 */
export async function firstTab(page: Page, root: string): Promise<FirstTab> {
  const tabbable = await page.evaluate((selector) => {
    const scope = document.querySelector(selector);
    if (!scope) return -1;
    const candidates = scope.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    return Array.from(candidates).filter((el) => el.getClientRects().length > 0).length;
  }, root);
  if (tabbable < 0) return { tabbable: 0, landed: "no screen root", inside: false };
  await page.evaluate((selector) => {
    const scope = document.querySelector<HTMLElement>(selector)!;
    scope.setAttribute("data-p23-had-tabindex", scope.hasAttribute("tabindex") ? scope.getAttribute("tabindex")! : "");
    if (!scope.hasAttribute("tabindex")) scope.setAttribute("tabindex", "-1");
    scope.focus({ preventScroll: true });
  }, root);
  await page.keyboard.press("Tab");
  const result = await page.evaluate((selector) => {
    const scope = document.querySelector<HTMLElement>(selector)!;
    const had = scope.getAttribute("data-p23-had-tabindex");
    if (had === "") scope.removeAttribute("tabindex");
    scope.removeAttribute("data-p23-had-tabindex");
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && active !== scope && scope.contains(active);
    const describe = active
      ? `${active.tagName.toLowerCase()}${active.getAttribute("data-action") ? `[data-action=${active.getAttribute("data-action")}]` : ""}${active.getAttribute("aria-label") ? `[aria-label=${active.getAttribute("aria-label")!.slice(0, 40)}]` : ""} "${(active.textContent ?? "").trim().slice(0, 30)}"`
      : "none";
    return { inside, landed: describe };
  }, root);
  return { tabbable, ...result };
}

/** Screen root text, whitespace-normalised. */
export async function rootText(page: Page, root: string): Promise<string> {
  return page.evaluate((selector) => {
    const scope = (document.querySelector(selector) ?? document.querySelector("main#portal-content")) as HTMLElement | null;
    return (scope?.innerText ?? "").replace(/\s+/g, " ").trim();
  }, root);
}

export async function rootHtml(page: Page, root: string): Promise<string> {
  return page.evaluate((selector) => document.querySelector(selector)?.outerHTML ?? "", root);
}

export interface HeapSample {
  heapUsedBytes: number;
  nodes: number;
}

/** CDP `Performance.getMetrics` JSHeapUsedSize (optionally after a forced GC) + DOM element count. */
export async function heap(page: Page, collectGarbage = false): Promise<HeapSample> {
  const cdp = await page.context().newCDPSession(page);
  try {
    if (collectGarbage) await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("Performance.enable");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const used = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? Number.NaN;
    return { heapUsedBytes: used, nodes: await domNodes(page) };
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
export const mb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);

/** Guide ids travel as annotations only; titles stay descriptive. */
export function guide(id: string): void {
  test.info().annotations.push({ type: "guide", description: id });
}

/** Hash cursor keys (evidenceCursor.ts) as a map. */
export function cursorKeys(locationValue: string): Record<string, string> {
  const hash = locationValue.includes("#") ? locationValue.slice(locationValue.indexOf("#") + 1) : "";
  return Object.fromEntries(new URLSearchParams(hash).entries());
}

export type { ScreenDef };
