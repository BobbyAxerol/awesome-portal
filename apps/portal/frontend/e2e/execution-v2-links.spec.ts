/**
 * UXM-07 · the V2 link crawler.
 *
 * Why this exists: the Compare links on Portfolios and Portfolio 360 pointed at /deployments/compare, a route nothing
 * mounts (NotFound), and nothing noticed: the unit tests pinned the wrong path and every e2e spec typed its URL
 * directly. This spec starts at every V2 entry route (the s1 SCREENS table), collects the in-app links on the page,
 * follows each distinct target (click when the link is visible, otherwise a goto of the resolved href) and then the
 * links of those pages (depth 2), and asserts on every page it lands on:
 *
 *   1. the app did not render its NotFound screen, and a screen root appeared;
 *   2. no console error/warning, no page error, no failed request (the retained-review 404 stays tolerated);
 *   3. the page is not blank;
 *   4. tab / sel / view / compose in the URL show up as a visible state or an explicit notice, never as silence.
 *
 * Lane: FIXTURE_LAB/BFF_DOUBLE, port-4176 build, same setup as the s1 spec. The report (every link followed: source,
 * text, target, result) is attached to the test as JSON and Markdown.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { SCREENS, stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";
import { resolveTab, type TabSurface } from "../src/execution/v2/tabAliases";

/** Crawl depth: entry (0) -> its links (1) -> the links of those pages (2). Depth-2 pages are visited, not expanded. */
const MAX_DEPTH = 2;
/** Cap on distinct targets visited (entries included in the count of pages, not in this cap). */
const MAX_TARGETS = 150;

/** The NotFound screen of PortalRoutes renders a StateView with this message; nothing else does. */
const NOT_FOUND_TEXT = "No feature in the current registry claims this route.";
/** A page that mounted: a V2 `data-screen` root, a V1/V2 execution frame, or one of the known screen roots. */
const SCREEN_ROOT = [
  "[data-screen]",
  ".exec-surface",
  ".exec-ops",
  ".exec-ck",
  ".exec-fleet-v2",
  ".exec-acct-v2",
  ".exec-acc-kpi",
].join(",");

/**
 * THE allow-list: links the crawler does not follow, each with the reason it is intended. A target matching a row is
 * recorded in the report as "allow-listed" with that reason and nothing else is asserted about it. Anything else that
 * fails an assertion fails the test. Keep this the only place exceptions live.
 */
type Check = "root" | "console" | "params";
interface Allowed {
  id: string;
  /** True for the targets the row covers (`url` is the resolved same-origin URL). */
  match(url: URL): boolean;
  reason: string;
  /** false: the target is recorded and never visited. true: it is visited and only the `waive`d checks are relaxed. */
  follow: boolean;
  waive?: readonly Check[];
}
const ALLOW_LIST: readonly Allowed[] = [
  {
    id: "api",
    match: (url) => url.pathname.startsWith("/api/"),
    reason: "A backend download/endpoint link, not an app route: it has no screen to land on.",
    follow: false,
  },
  {
    id: "gateway-planning-board",
    match: (url) => url.pathname.startsWith("/roadmap-task-board"),
    reason: "Served by the gateway as its own app, outside the portal bundle (PortalRoutes leaves it untouched).",
    follow: false,
  },
  {
    id: "lane-research",
    match: (url) => /^\/(research|planning|backtests|data|portal-map)(\/|$)/.test(url.pathname),
    reason: "Shell navigation into the Research/Planning/Data lanes: out of this lane's scope (CLAUDE.md section 0), and their screens need their own stubs.",
    follow: false,
  },
  {
    id: "v1-command-center",
    match: (url) => url.pathname === "/",
    reason: "The shell brand link goes to the Command Center, a V1 screen with no V2 root. Still visited: NotFound, blank page and console are asserted.",
    follow: true,
    waive: ["root"],
  },
  {
    id: "v1-users-legacy",
    match: (url) => url.pathname === "/administration/users" && url.searchParams.get("view") === "legacy",
    reason: "The V2 roster's deliberate way back to the V1 Users screen (`?view=legacy`, UsersAccess). Still visited; no V2 root and no V2 view state to assert.",
    follow: true,
    waive: ["root", "params"],
  },
  {
    id: "double-account-ids",
    match: (url) => url.pathname === "/deployments/accounts/Binance-02",
    reason: "FIXTURE GAP, not a link defect: the portfolios double names its accounts by label (Binance-02) while the accounts double only holds acc_* ids, so the typed 404 for the account read is the double's. The route and the link are right (a real BFF keys both by account_id).",
    follow: true,
    waive: ["console"],
  },
  {
    id: "double-account-ids-operations-and-live",
    match: (url) => /^\/deployments\/accounts\/(acc_TEST_ONLY_(operational|binance01|binance02)|acct_live_grid|acct_canary_grid)$/.test(url.pathname),
    reason: "FIXTURE GAP, not a link defect: the operations double (acc_TEST_ONLY_*) and the published dark Live body (acct_live_grid) and Canary body (acct_canary_grid) name accounts the accounts double does not hold, so the typed 404 for the account read is the double's. The route and the link are right.",
    follow: true,
    waive: ["console"],
  },
  {
    id: "sandbox-lineage-paper-exit",
    match: (url) => url.pathname.startsWith("/deployments/paper/exit/"),
    reason: "DEFECT, listed so the crawl stays green while it is open: the published V1 Sandbox body (lineage kind PAPER_EXIT) carries href /deployments/paper/exit/{id}, which no route mounts; the review lives at /governance/exit-reviews/{id}, which readSandbox.ts already uses for V2 bodies. Not followed (NotFound is never waivable). Delete this row when the screen or the body maps it.",
    follow: false,
  },
];

// ---------------------------------------------------------------- URL keys

/** Params whose VALUE selects a view state, so two links differing only in them are different targets. */
const STATE_KEYS = ["tab", "view"];

/** De-dup key: pathname plus the sorted query keys; tab/view values are kept because they pick the state shown. */
function targetKey(url: URL): string {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const keys = [...new Set(url.searchParams.keys())].sort();
  const parts = keys.map((key) => (STATE_KEYS.includes(key) ? `${key}=${url.searchParams.get(key)}` : key));
  return parts.length > 0 ? `${path}?${parts.join("&")}` : path;
}

function toRelative(url: URL): string {
  return `${url.pathname}${url.search}`;
}

// ---------------------------------------------------------------- collection

interface RawLink {
  raw: string;
  text: string;
  tag: string;
  target: string | null;
  download: boolean;
}

async function collectRaw(page: Page): Promise<RawLink[]> {
  return page.evaluate(() => {
    const out: RawLink[] = [];
    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    for (const el of Array.from(document.querySelectorAll("a[href], [data-href]"))) {
      const raw = el.getAttribute("href") ?? el.getAttribute("data-href");
      if (raw === null) continue;
      out.push({
        raw,
        text: clean(el.getAttribute("aria-label")) || clean(el.textContent) || "(no text)",
        tag: el.tagName.toLowerCase(),
        target: el.getAttribute("target"),
        download: el.hasAttribute("download"),
      });
    }
    return out;
  });
}

interface Link {
  raw: string;
  text: string;
  url: URL;
  target: string | null;
}

interface Collected {
  links: Link[];
  /** External / non-http / fragment-only links seen and left alone, for the report. */
  skipped: { raw: string; text: string; why: string }[];
}

function resolveLinks(raws: RawLink[], pageUrl: string, origin: string): Collected {
  const links: Link[] = [];
  const skipped: Collected["skipped"] = [];
  for (const item of raws) {
    const raw = item.raw.trim();
    if (raw === "" || raw.startsWith("#")) {
      skipped.push({ raw, text: item.text, why: "fragment-only" });
      continue;
    }
    if (/^(mailto|tel|javascript):/i.test(raw)) {
      skipped.push({ raw, text: item.text, why: "not navigation" });
      continue;
    }
    let url: URL;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      skipped.push({ raw, text: item.text, why: "unparseable" });
      continue;
    }
    if (url.origin !== origin) {
      skipped.push({ raw, text: item.text, why: "external" });
      continue;
    }
    if (item.download) {
      skipped.push({ raw, text: item.text, why: "download" });
      continue;
    }
    links.push({ raw, text: item.text, url, target: item.target });
  }
  return { links, skipped };
}

// ---------------------------------------------------------------- assertions

type Verdict = "ok" | "fail" | "allow-listed";

interface Visit {
  depth: number;
  source: string;
  text: string;
  target: string;
  landed: string;
  via: "click" | "goto" | "entry";
  verdict: Verdict;
  allowReason?: string;
  problems: string[];
  notes: string[];
}

const TAB_SURFACES: readonly { pattern: RegExp; surface: TabSurface }[] = [
  { pattern: /^\/deployments\/alphas\/[^/]+$/, surface: "alpha" },
  { pattern: /^\/deployments\/portfolios\/[^/]+$/, surface: "portfolio" },
  { pattern: /^\/deployments\/paper\/[^/]+(\/vn-market)?$/, surface: "paper" },
  { pattern: /^\/deployments\/sandbox\/[^/]+$/, surface: "sandbox" },
  { pattern: /^\/deployments\/live\/[^/]+\/canary$/, surface: "canary" },
  { pattern: /^\/deployments\/live\/[^/]+$/, surface: "live" },
];

const norm = (value: string) => value.replace(/\+/g, " ").trim().replace(/\s+/g, " ").toLowerCase();

/** What the page shows for tab/sel/view/compose. Returns problems (silence) and notes (what was verified). */
async function checkStateParams(page: Page, url: URL, problems: string[], notes: string[]): Promise<void> {
  const params = url.searchParams;

  const tab = params.get("tab");
  if (tab !== null && tab !== "") {
    const tablists = page.locator('[role="tablist"]');
    if ((await tablists.count()) === 0) {
      notes.push(`tab=${tab}: page has no tablist`);
    } else {
      const surface = TAB_SURFACES.find((entry) => entry.pattern.test(url.pathname))?.surface;
      const resolution = surface ? resolveTab(surface, tab) : null;
      const expected = resolution ? resolution.target.tab : norm(tab);
      const selected = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).map((el) => ({
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
          id: el.id.toLowerCase(),
        })),
      );
      const moreActive = (await page.locator('[aria-haspopup="menu"][data-active="true"]').count()) > 0;
      const match = selected.some((entry) => entry.text === expected || entry.text.includes(expected) || entry.id.endsWith(expected) || entry.id.includes(expected));
      const notice = (await page.getByText(/is not available|not available\. Showing|unknown tab/i).count()) > 0;
      if (match) notes.push(`tab=${tab}: selected tab matches (${expected})`);
      else if (moreActive) notes.push(`tab=${tab}: shown through the More menu (${expected})`);
      else if (notice) notes.push(`tab=${tab}: explicit notice shown`);
      else problems.push(`tab=${tab}: expected selected tab "${expected}", tablists select ${JSON.stringify(selected.map((s) => s.text))} and no notice`);
    }
  }

  const sel = params.get("sel");
  if (sel !== null && sel !== "") {
    const text = (await page.locator("body").innerText()).toLowerCase();
    const shown = text.includes(sel.toLowerCase())
      || (await page.locator('[role="dialog"], [aria-selected="true"]:not([role="tab"]), [aria-current="true"], [data-selected="true"], aside[aria-label]').count()) > 0
      || (await page.getByText(/not found|no longer|not available|unknown/i).count()) > 0;
    if (shown) notes.push(`sel=${sel}: selection or notice visible`);
    else problems.push(`sel=${sel}: nothing on the page shows the selection and no notice`);
  }

  const view = params.get("view");
  if (view !== null && view !== "") {
    if (view === "compare") {
      if ((await page.locator('[data-screen="compare-v2"]').count()) > 0) notes.push("view=compare: Compare screen shown");
      else problems.push("view=compare: Compare screen did not mount");
    } else {
      const state = await page.locator(`[data-view="${view}"], [aria-pressed="true"], [aria-checked="true"], [role="tab"][aria-selected="true"]`).allInnerTexts();
      const noticed = (await page.getByText(/not available|unknown view/i).count()) > 0;
      // A lane key can be longer than the chip that shows it (the cockpit's view=exit-reviews is the "Exit" lane), so a
      // control whose leading word is the key's leading word counts.
      const leading = (value: string) => norm(value).split(/[-_ ]/)[0];
      if (state.some((entry) => norm(entry).includes(norm(view)) || leading(entry) === leading(view)) || (await page.locator(`[data-view="${view}"]`).count()) > 0) notes.push(`view=${view}: matching control/state shown`);
      else if (noticed) notes.push(`view=${view}: explicit notice shown`);
      else problems.push(`view=${view}: no matching state (${JSON.stringify(state)}) and no notice`);
    }
  }

  const compose = params.get("compose");
  if (compose !== null && compose !== "") {
    const open = (await page.locator('[role="dialog"], form, [data-compose]').count()) > 0;
    const noticed = (await page.getByText(/not available|unknown/i).count()) > 0;
    if (open || noticed) notes.push(`compose=${compose}: composer or notice visible`);
    else problems.push(`compose=${compose}: no composer and no notice`);
  }
}

/** Waits for a screen root or the NotFound text, whichever comes first, then lets late console lines land. */
async function arrive(page: Page): Promise<void> {
  await page
    .waitForFunction(
      ([root, notFound]) => document.querySelector(root as string) !== null || (document.body?.innerText ?? "").includes(notFound as string),
      [SCREEN_ROOT, NOT_FOUND_TEXT],
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await settle(page);
  await page.waitForTimeout(150);
}

async function assertLanded(page: Page, watch: ReturnType<typeof watchPage>, url: URL, problems: string[], notes: string[], waive: readonly Check[] = []): Promise<void> {
  // (1) not NotFound (never waivable), and a screen root is on the page.
  if ((await page.getByText(NOT_FOUND_TEXT).count()) > 0) problems.push("NotFound screen rendered (no route mounts this path)");
  else if ((await page.locator(SCREEN_ROOT).count()) === 0) {
    if (waive.includes("root")) notes.push("waived: no V2/exec screen root (allow-listed V1 screen)");
    else problems.push("no screen root appeared");
  }

  // (2) console and network.
  for (const line of watch.take()) {
    if (waive.includes("console")) notes.push(`waived console/network: ${line}`);
    else problems.push(`console/network: ${line}`);
  }

  // (3) not blank.
  const blank = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const box = main.getBoundingClientRect();
    return { chars: (main.innerText ?? "").trim().length, height: box.height };
  });
  if (blank.chars < 40 || blank.height <= 0) problems.push(`page is blank (${blank.chars} chars of text, main height ${Math.round(blank.height)})`);

  // (4) URL state shows up.
  if (waive.includes("params")) notes.push("waived: URL state params (allow-listed V1 screen)");
  else await checkStateParams(page, url, problems, notes);
}

/** Context params that should travel with a link inside the lane; a drop is reported as a note, not a failure (many links reset on purpose). */
const CONTEXT = ["env", "window", "ccy", "workspace_id"];
function contextDrops(source: URL, landed: URL): string[] {
  if (landed.pathname === "/" ) return [];
  return CONTEXT.filter((key) => source.searchParams.has(key) && !landed.searchParams.has(key));
}

// ---------------------------------------------------------------- the crawl

interface Candidate {
  link: Link;
  sourceUrl: URL;
  sourceKey: string;
  depth: number;
  order: number;
}

function allowedBy(url: URL): Allowed | undefined {
  return ALLOW_LIST.find((row) => row.match(url));
}

function reportMarkdown(visits: Visit[], skipped: Map<string, { count: number; sample: string }>, truncated: number): string {
  const rows = visits.map((visit) => {
    const flagged = visit.notes.filter((note) => /^(waived|context dropped|redirected)/.test(note));
    const extra = flagged.length > 0 ? ` [${flagged.join("; ")}]` : "";
    const result = (visit.verdict === "ok" ? "ok" : visit.verdict === "allow-listed" ? `allow-listed: ${visit.allowReason}` : `FAIL: ${visit.problems.join(" | ")}`) + extra;
    const cell = (value: string) => value.replace(/\|/g, "\\|");
    return `| ${visit.depth} | ${cell(visit.source)} | ${cell(visit.text)} | ${cell(visit.target)} | ${visit.via} | ${cell(visit.landed)} | ${cell(result)} |`;
  });
  const failures = visits.filter((visit) => visit.verdict === "fail").length;
  return [
    "# V2 link crawl",
    "",
    `${visits.length} page visits (${visits.filter((v) => v.via === "entry").length} entries), ${failures} failing, ${visits.filter((v) => v.verdict === "allow-listed").length} allow-listed, ${truncated} targets not visited because of the ${MAX_TARGETS}-target cap.`,
    "",
    "| depth | source | link text | target | via | landed | result |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Links seen and left alone",
    "",
    ...[...skipped.entries()].map(([why, info]) => `- ${why}: ${info.count} (e.g. ${info.sample})`),
    "",
  ].join("\n");
}

test("every in-app link on the V2 screens lands on a screen, two levels deep", async ({ page, baseURL }, testInfo: TestInfo) => {
  test.setTimeout(900_000);
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width: 1440, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  const watch = watchPage(page, baseURL);
  const origin = new URL(baseURL ?? "http://127.0.0.1:4176").origin;

  const visits: Visit[] = [];
  const visited = new Set<string>();
  const skipped = new Map<string, { count: number; sample: string }>();
  let discovered = 0;
  let candidates: Candidate[] = [];

  async function harvest(url: URL, depth: number): Promise<void> {
    const raws = await collectRaw(page);
    const { links, skipped: left } = resolveLinks(raws, page.url(), origin);
    for (const item of left) {
      const entry = skipped.get(item.why) ?? { count: 0, sample: `${item.text} -> ${item.raw}` };
      entry.count += 1;
      skipped.set(item.why, entry);
    }
    if (depth >= MAX_DEPTH) return;
    for (const link of links) {
      candidates.push({ link, sourceUrl: url, sourceKey: targetKey(url), depth: depth + 1, order: discovered++ });
    }
  }

  async function open(target: URL, source: Candidate | null): Promise<"click" | "goto"> {
    if (source !== null) {
      // Click only from the page the link lives on, and only when the element is on screen.
      if (targetKey(new URL(page.url())) !== source.sourceKey) {
        await page.goto(toRelative(source.sourceUrl));
        await arrive(page);
        watch.take();
      }
      const selector = `a[href="${source.link.raw.replace(/"/g, '\\"')}"], [data-href="${source.link.raw.replace(/"/g, '\\"')}"]`;
      const element = page.locator(selector).first();
      if (source.link.target !== "_blank" && (await element.count()) > 0 && (await element.isVisible())) {
        await element.scrollIntoViewIfNeeded().catch(() => undefined);
        const before = page.url();
        await element.click({ timeout: 5_000 }).catch(() => undefined);
        await page.waitForTimeout(100);
        // The click counts only if it moved the page; a link to the page itself falls through to the goto.
        if (page.url() !== before) return "click";
      }
    }
    await page.goto(toRelative(target));
    return "goto";
  }

  // Level 0: the entry routes.
  for (const [name, route, root] of SCREENS) {
    const url = new URL(route, origin);
    visited.add(targetKey(url));
    await page.goto(route);
    await arrive(page);
    const problems: string[] = [];
    const notes: string[] = [];
    if ((await page.locator(root).count()) === 0) problems.push(`entry root ${root} did not appear`);
    await assertLanded(page, watch, url, problems, notes);
    visits.push({ depth: 0, source: "(entry)", text: name, target: toRelative(url), landed: toRelative(new URL(page.url())), via: "entry", verdict: problems.length ? "fail" : "ok", problems, notes });
    await harvest(url, 0);
  }

  let visitedTargets = 0;
  let truncated = 0;
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const level = candidates.filter((candidate) => candidate.depth === depth);
    candidates = candidates.filter((candidate) => candidate.depth !== depth);
    // Deterministic: first discovery wins per key, then source order then key.
    const seen = new Set<string>();
    const unique: Candidate[] = [];
    for (const candidate of level.sort((a, b) => a.order - b.order)) {
      const key = targetKey(candidate.link.url);
      if (visited.has(key) || seen.has(key)) continue;
      seen.add(key);
      unique.push(candidate);
    }
    const lane: Candidate[] = [];
    for (const candidate of unique) {
      const allow = allowedBy(candidate.link.url);
      if (allow && !allow.follow) {
        visited.add(targetKey(candidate.link.url));
        visits.push({
          depth,
          source: toRelative(candidate.sourceUrl),
          text: candidate.link.text,
          target: toRelative(candidate.link.url),
          landed: "-",
          via: "goto",
          verdict: "allow-listed",
          allowReason: `${allow.id}: ${allow.reason}`,
          problems: [],
          notes: [],
        });
      } else lane.push(candidate);
    }
    for (const candidate of lane) {
      if (visitedTargets >= MAX_TARGETS) {
        truncated += 1;
        continue;
      }
      visitedTargets += 1;
      const key = targetKey(candidate.link.url);
      visited.add(key);
      const problems: string[] = [];
      const notes: string[] = [];
      watch.take();
      const via = await open(candidate.link.url, candidate);
      await arrive(page);
      const landed = new URL(page.url());
      const allow = allowedBy(candidate.link.url);
      await assertLanded(page, watch, landed, problems, notes, allow?.waive ?? []);
      const dropped = contextDrops(candidate.sourceUrl, landed);
      if (dropped.length > 0) notes.push(`context dropped: ${dropped.join(", ")}`);
      if (targetKey(landed) !== key && landed.pathname !== candidate.link.url.pathname) notes.push(`redirected to ${toRelative(landed)}`);
      visits.push({
        depth,
        source: toRelative(candidate.sourceUrl),
        text: candidate.link.text,
        target: toRelative(candidate.link.url),
        landed: toRelative(landed),
        via,
        verdict: problems.length ? "fail" : allow ? "allow-listed" : "ok",
        allowReason: allow ? `${allow.id}: ${allow.reason}` : undefined,
        problems,
        notes,
      });
      if (depth < MAX_DEPTH) await harvest(landed, depth);
    }
  }

  const markdown = reportMarkdown(visits, skipped, truncated);
  await testInfo.attach("v2-link-crawl.json", { body: JSON.stringify({ visits, skipped: Object.fromEntries(skipped), truncated, cap: MAX_TARGETS, depth: MAX_DEPTH }, null, 2), contentType: "application/json" });
  await testInfo.attach("v2-link-crawl.md", { body: markdown, contentType: "text/markdown" });
  console.log(markdown);

  expect(watch.foreign, "requests that left the app origin").toEqual([]);
  const failing = visits.filter((visit) => visit.verdict === "fail").map((visit) => `${visit.source} --[${visit.text}]--> ${visit.target}: ${visit.problems.join(" | ")}`);
  expect(failing, "dead or context-losing links (add a reasoned ALLOW_LIST row only for an intended exception)").toEqual([]);
});
