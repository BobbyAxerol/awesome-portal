/**
 * W1 §4.2 — shared helpers for the per-state real-API probes (GET only).
 *
 * Runs are DISCOVERED at run time from the Run Library (`GET /api/v1/quantbt/runs?status=…`),
 * never hard-coded: a CANCELLED/QUEUED/FAILED run that no longer exists is a
 * skipped (annotated) state, not a red test. Nothing here mutates the server.
 */
import { readFileSync } from "node:fs";

import { expect, type Page, type TestInfo } from "@playwright/test";

export const HOME = `${process.env.HOME}/.config/portal-research-preview`;
export const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN ?? "http://localhost:8095";
export const OUT = process.env.RESEARCH_PREVIEW_RECEIPTS ?? `${HOME}/receipts`;

/** Same shape as a real id, but no run owns it: the NOT_FOUND / DENIED probe (one state, F-04). */
export const ZERO_RUN = `rrun_${"0".repeat(32)}`;

export type StateName = "COMPLETED" | "FAILED" | "CANCELLED" | "QUEUED" | "RUNNING";

/** Every run-scoped route a state is probed on. `tail` is appended to `/research/quantbt/runs/:run/`. */
export const RUN_ROUTES = ["progress", "evidence", "split", "search", "freeze", "execute", "report", "release-candidate"] as const;
export type RunRoute = (typeof RUN_ROUTES)[number];

export const runUrl = (run: string, tail: RunRoute, hash = ""): string => `/research/quantbt/runs/${run}/${tail}${hash}`;

export async function signIn(page: Page): Promise<void> {
  const password = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
  const response = await page.request.post("/api/auth/login", {
    data: { username: "claude-preview", credential: password },
    headers: { origin: ORIGIN },
  });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}

/** Read the API from inside the page (the session cookie is Secure; see the real-api spec). GET only. */
export async function pageGet(page: Page, path: string): Promise<{ status: number; body: any }> {
  /* A relative fetch needs an origin: a blank page has none. */
  if (page.url() === "about:blank") await page.goto("/research/quantbt/runs", { waitUntil: "domcontentloaded" });
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin", method: "GET" });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* non-JSON */
    }
    return { status: response.status, body };
  }, path);
}

/** First run the Library lists with this status (and, optionally, a sealed local RC), or null. */
export async function discoverRun(page: Page, status: StateName, o: { sealed?: boolean } = {}): Promise<string | null> {
  const { status: code, body } = await pageGet(page, `/api/v1/quantbt/runs?status=${status}&limit=50`);
  if (code !== 200 || !Array.isArray(body?.items)) return null;
  const rows = (body.items as { run_id: string; rc?: { kind?: string } | null; row_kind?: string }[]).filter(
    (r) => r.row_kind === undefined || r.row_kind === "LOGICAL_RUN",
  );
  const pick = o.sealed === undefined ? rows[0] : rows.find((r) => (r.rc?.kind === "LOCAL_SEAL") === o.sealed);
  return pick?.run_id ?? null;
}

/** Skip with an annotation when a state has no live run (never fail on absent data). */
export function needRun(testInfo: TestInfo, run: string | null, state: string): asserts run is string {
  if (run === null) {
    testInfo.annotations.push({ type: "skip", description: `no ${state} run in this workspace` });
    testInfo.skip(true, `no ${state} run in this workspace`);
  }
}

export interface Observed {
  requests: string[];
  failures: string[];
  noise: string[];
  /** Count of 409 responses per path: a face that retry-loops shows up here. */
  conflicts: Record<string, number>;
}

export function observe(page: Page): Observed {
  const o: Observed = { requests: [], failures: [], noise: [], conflicts: {} };
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    o.requests.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    if (response.status() >= 400) o.failures.push(`${url.pathname} ${response.status()}`);
    if (response.status() === 409) o.conflicts[url.pathname] = (o.conflicts[url.pathname] ?? 0) + 1;
  });
  page.on("console", (m) => {
    if (m.type() === "error") o.noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => o.noise.push(`pageerror: ${e}`));
  return o;
}

/** The two POSTs that only compute an answer (an estimate of the declaration, a window hint): nothing is stored, no job starts. */
const STATELESS_POSTS = /\/(datasets\/declaration-estimates|runs\/window-suggestions)$/;

/** Read-only guard: abort anything that is not a GET to the API, except the stateless computing POSTs. Call before navigating. */
export async function getOnly(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.continue();
    /* A stateless computing POST carries the stack's public Origin (which the Control API checks on every write); without it the answer is a 403. */
    if (STATELESS_POSTS.test(new URL(request.url()).pathname)) {
      return route.fetch({ headers: { ...request.headers(), origin: ORIGIN } }).then((response) => route.fulfill({ response }), () => route.abort().catch(() => undefined));
    }
    return route.abort();
  });
}

/** The visible text of the screen root (`[data-screen]`), for banner / absence assertions. */
export async function screenText(page: Page): Promise<string> {
  return (await page.locator("[data-screen]").first().textContent()) ?? "";
}

/** `[data-exit]` values in DOM order — the exit bar's contract (W1 §1.3). */
export async function exits(page: Page): Promise<string[]> {
  return page.locator("[data-run-exit-bar] [data-exit]").evaluateAll((els) => els.map((e) => e.getAttribute("data-exit") ?? ""));
}

/** Every href on the page that mentions `needle` (e.g. a missing run id must never appear). */
export async function hrefsContaining(page: Page, needle: string): Promise<string[]> {
  /* The screen only: the shell's top breadcrumb names the route's run id and is W4's (plain text for an unknown run). */
  return page.locator(`main a[href*="${needle}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
}

/** W1 §4.2 "Trial label": no `#350`/`#351`, no bare `trial 350` (a source id is never called a trial). */
export function trialLabelViolations(text: string, o: { ordinal?: number; sourceId?: number } = {}): string[] {
  const bad: string[] = [];
  if (/#\d{2,}\b/.test(text)) bad.push("`#<n>` trial id");
  if (o.sourceId !== undefined && new RegExp(`\\btrial ${o.sourceId}\\b(?! ·)`).test(text)) bad.push(`bare \`trial ${o.sourceId}\``);
  return bad;
}

/** Hash of the current URL, parsed to a plain object (cursor round-trip assertions). */
export function hashKeys(url: string): Record<string, string> {
  const hash = new URL(url).hash.replace(/^#/, "");
  return Object.fromEntries(new URLSearchParams(hash));
}
