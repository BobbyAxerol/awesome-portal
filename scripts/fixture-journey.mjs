#!/usr/bin/env node
/**
 * Execution V2 fixture JOURNEY WALKER (WP-P). FIXTURE_LAB lane, not acceptance evidence.
 *
 * Walks Overview -> Fleet -> Portfolio -> Alpha 360 -> Account -> Deployment -> Approval -> Operation -> Incident -> audit
 * by FOLLOWING REAL LINKS IN THE DOM (a click on an <a href>), against a LOCAL stack of this checkout
 * (fixture BFF bundle + a built dist behind a tiny static+proxy server on free ports; no docker; never the
 * preview on 8095). One chromium. For every screen and every scenario it asserts / counts:
 *   - no 404/5xx from /api/ or /__fixture/ routes (the retained-review 404 is the known typed one),
 *   - no console errors / page errors,
 *   - the back-link returns (history back lands on the previous screen and it renders),
 *   - no horizontal overflow at 1280 and 660,
 *   - typed-absence cells per screen (leaf text "Not published ...", "Not available", "Unavailable", ...),
 *   - degraded markers in API bodies (quality PARTIAL/STALE, availability UNAVAILABLE, NOT_CONFIGURED ...),
 *   - a link sweep: every distinct internal detail link seen on the journey resolves (200 reads, screen root renders).
 *
 *   node scripts/fixture-journey.mjs --build                         # build fixture bundle + vite dist (heavy), then walk
 *   node scripts/fixture-journey.mjs --dist /path/dist               # reuse a dist
 *   node scripts/fixture-journey.mjs --scenarios positive,denied,stale,empty,missing,zero
 *   node scripts/fixture-journey.mjs --out DIR --label after --sweep 40
 *   node scripts/fixture-journey.mjs --base-url http://127.0.0.1:PORT   # an already running stack (never 8095)
 *
 * Output: DIR/journey-<label>.json and a markdown-ish summary on stdout.
 */
import { spawn, execFileSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FE = join(ROOT, "apps/portal/frontend");
const BFF = join(ROOT, "apps/portal/fixture-bff");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const log = (...a) => console.error("[fixture-journey]", ...a);

const OUT = resolve(opt("out", process.env.FIXTURE_JOURNEY_OUT ?? join(ROOT, ".fixture-journey")));
const LABEL = opt("label", "run");
const DIST = resolve(opt("dist", join(OUT, "dist")));
const SCENARIOS = opt("scenarios", "positive,denied,stale,empty,missing,zero").split(",");
const SWEEP_MAX = Number(opt("sweep", "40"));
const SCREENS = "shell,fleet,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request";
const PROFILE = opt("profile", "populated");

mkdirSync(OUT, { recursive: true });
if (flag("build")) {
  log("building fixture bff + vite dist");
  execFileSync("node", ["build.mjs"], { cwd: BFF, stdio: "inherit" });
  execFileSync("npx", ["vite", "build", "--outDir", DIST, "--emptyOutDir"], {
    cwd: FE, stdio: "inherit",
    env: { ...process.env, VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true", VITE_EXECUTION_PREVIEW_ENABLED: "true", VITE_EXECUTION_V2_SCREENS: SCREENS },
  });
}

let bffProc = null, web = null, base = opt("base-url", null);
if (base && /:8095\b/.test(base)) throw new Error("refusing to walk the live preview (port 8095)");
if (!base) {
  if (!existsSync(join(DIST, "index.html")) || !existsSync(join(BFF, "dist/server.mjs"))) throw new Error("no dist: run with --build, or pass --dist");
  bffProc = spawn("node", ["dist/server.mjs"], { cwd: BFF, env: { ...process.env, PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: PROFILE, FIXTURE_WRITES: "doubles", FIXTURE_REBASE_TIME: flag("no-rebase") ? "0" : "1" } });
  const bffPort = await new Promise((res, rej) => {
    let buf = "";
    bffProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/on 127\.0\.0\.1:(\d+)/); if (m) res(Number(m[1])); });
    bffProc.on("exit", (c) => rej(new Error("fixture bff exited " + c)));
    setTimeout(() => rej(new Error("fixture bff start timeout")), 15000);
  });
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
  web = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__fixture/")) {
      const up = httpRequest({ host: "127.0.0.1", port: bffPort, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
      return;
    }
    let f = join(DIST, decodeURIComponent(url.pathname));
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => web.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${web.address().port}`;
  log("serving", base, "bff", bffPort);
}

const { chromium } = await import(pathToFileURL(join(FE, "node_modules/playwright/index.mjs")).href);

/* ── in-page measurements ─────────────────────────────────────────────────── */

/** Runs in the page: typed-absence cells (leaf elements whose own text is a typed absence) + overflow. */
function inPage() {
  const ABSENCE = /^(Not published|Not available|Unavailable|Not reported|Not applied|Not in source|Not read|Not configured|No source|Source not published)\b/i;
  const root = document.querySelector("main") ?? document.body;
  const texts = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.closest("script,style,svg,[aria-hidden='true'],[data-fixture-banner]")) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(" ");
    if (!own || own.length > 120) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (ABSENCE.test(own)) texts.push(own.replace(/\s+/g, " ").slice(0, 70));
  }
  const de = document.documentElement;
  const screenRoot = document.querySelector("[data-screen]") ?? document.querySelector("main > *") ;
  return {
    absences: texts.length,
    absenceTexts: texts,
    overflowPx: Math.max(0, de.scrollWidth - de.clientWidth, root.scrollWidth - root.clientWidth),
    screen: screenRoot?.getAttribute?.("data-screen") ?? screenRoot?.className?.toString().split(" ")[0] ?? null,
    heading: (document.querySelector("h1,h2")?.textContent ?? "").trim().slice(0, 80),
    notFound: /not found|FIXTURE_ROUTE_NOT_SERVED|could not be loaded/i.test(root.innerText.slice(0, 4000)) && !root.querySelector("table tbody tr"),
    // text that says a link target does not exist, a scoped list is empty by construction, or a value was never filled in
    badText: [...new Set((root.innerText.match(/ACCOUNT_NOT_FOUND|not in the projected population|No loaded order matches|\bundefined\b|\bNaN\b|\[object Object\]|PORTFOLIO_NOT_FOUND|ALPHA_NOT_FOUND|DEPLOYMENT_NOT_FOUND|EXECUTION_READ_NOT_AVAILABLE/g)) ?? [])],
    textLength: root.innerText.length,
  };
}

/** Degradation markers inside one JSON body: where a value says PARTIAL, STALE, UNAVAILABLE, NOT_CONFIGURED, DENIED ... */
const DEGRADED_VALUES = new Set(["PARTIAL", "STALE", "UNAVAILABLE", "NOT_CONFIGURED", "DEGRADED", "DENIED", "MISSING", "FAILED", "ERROR", "UNKNOWN", "INCOMPLETE", "UNVERIFIED", "NOT_QUALIFIED", "BLOCKED"]);
const DEGRADED_KEYS = new Set(["completeness", "freshness", "availability", "state", "status", "verification", "health_state", "quality_state", "source_state", "confidence", "freshness_state", "completeness_state", "reason_code"]);
function scanDegraded(value, path, into, depth = 0) {
  if (depth > 12 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const v of value.slice(0, 40)) scanDegraded(v, path + "[]", into, depth + 1); return; }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      const upper = v.toUpperCase();
      if (DEGRADED_KEYS.has(k) && (DEGRADED_VALUES.has(upper) || (k === "reason_code" && /NOT_CONFIGURED|UNAVAILABLE|NOT_PUBLISHED|SOURCE_|STALE|LAG/.test(upper)))) {
        const key = `${path}.${k}=${v}`;
        into.set(key, (into.get(key) ?? 0) + 1);
      }
      if (k === "reasons") continue;
    } else if (k === "reasons" && Array.isArray(v) && v.length && !(v.length === 1 && v[0] === "FIXTURE_LAB_SYNTHETIC")) {
      const key = `${path}.reasons=${v.slice(0, 3).join("|")}`;
      into.set(key, (into.get(key) ?? 0) + 1);
    } else scanDegraded(v, `${path}.${k}`, into, depth + 1);
  }
}

const KNOWN_TYPED_404 = [/retained-review/];

/** Instants later than now+1min in a served body, except under a deadline key (due, expires, valid_until, next_*, ceiling ...). Mirrors time-rebase.ts futureInstants. */
const DEADLINE_KEY = /(^|_)(due|expires?|expiry|valid_until|until|deadline|next|ceiling|retention_floor|renew|rotate|opens|review|scheduled|planned)(_|$)/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
function futureInstants(value, limit, path = "", key = "") {
  if (DEADLINE_KEY.test(key)) return [];
  if (typeof value === "string") return ISO.test(value) && Date.parse(value) > limit ? [`${path}=${value}`] : [];
  if (typeof value === "number") return key.endsWith("_ms") && Number.isInteger(value) && value >= 1.5e12 && value <= 4e12 && value > limit ? [`${path}=${new Date(value).toISOString()}`] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => futureInstants(item, limit, `${path}[]`, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => futureInstants(v, limit, `${path}.${k}`, k));
  return [];
}

/* ── a visited screen ─────────────────────────────────────────────────────── */

function newTracker(page, denied = false) {
  const state = { responses: [], consoleErrors: [], pageErrors: [], degraded: new Map(), future: new Map() };
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") && !u.pathname.startsWith("/__fixture/")) return;
    const rec = { status: r.status(), path: u.pathname, method: r.request().method() };
    state.responses.push(rec);
    if (r.status() === 200 && r.request().method() === "GET" && (r.headers()["content-type"] ?? "").includes("json")) {
      try {
        const json = await r.json();
        const where = u.pathname.replace(/\/api\/v1\/execution/, "").replace(/\/[A-Za-z]+_[A-Za-z0-9_:.-]+/g, "/:id");
        scanDegraded(json, where, state.degraded);
        for (const hit of futureInstants(json, Date.now() + 60_000, where).slice(0, 3)) state.future.set(hit.split("=")[0], hit);
      } catch { /* body gone */ }
    }
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // a failed-resource line for a known typed 404 (the retained-review read) or a denied scenario's 403 is the browser echoing the response, not a script error
    const where = m.location()?.url ?? "";
    if (KNOWN_TYPED_404.some((re) => re.test(where))) return;
    if (denied && /status of 403/.test(m.text())) return;
    state.consoleErrors.push(`${m.text().slice(0, 160)} ${where.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)}`);
  });
  page.on("pageerror", (e) => state.pageErrors.push(String(e.message).slice(0, 200)));
  return state;
}

const drain = (state) => {
  const out = { responses: state.responses.splice(0), consoleErrors: state.consoleErrors.splice(0), pageErrors: state.pageErrors.splice(0), degraded: new Map(state.degraded), future: [...state.future.values()] };
  state.degraded.clear();
  state.future.clear();
  return out;
};

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function measure(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  const wide = await page.evaluate(inPage);
  await page.setViewportSize({ width: 660, height: 900 });
  await page.waitForTimeout(250);
  const narrow = await page.evaluate(inPage);
  await page.setViewportSize({ width: 1280, height: 900 });
  return { ...wide, overflow1280: wide.overflowPx, overflow660: narrow.overflowPx };
}

const stripOrigin = (u) => { const x = new URL(u, base); return x.pathname + x.search; };

/** All internal anchors on the current page: [{href, text}] */
const anchors = (page) => page.evaluate(() => [...document.querySelectorAll("a[href]")]
  .filter((a) => a.getAttribute("href").startsWith("/") && !a.closest("[aria-hidden='true']"))
  .map((a) => ({ href: a.getAttribute("href"), text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50), inNav: !!a.closest("nav,aside,header,[role=navigation]") })));

/* ── the journey ──────────────────────────────────────────────────────────── */
// Each step: where the link is found (the current page first, then the `hub` page), the href pattern, a name.
const STEPS = [
  { id: "fleet", re: /^\/deployments\/alphas(\?|$)/, hub: null, navOk: true },
  { id: "portfolio", re: /^\/deployments\/portfolios\/[^/?]+/, hub: "/deployments/portfolios" },
  { id: "alpha", re: /^\/deployments\/alphas\/[^/?]+/, hub: "/deployments/alphas" },
  { id: "account", re: /^\/deployments\/accounts\/[^/?]+/, hub: "/deployments/accounts" },
  { id: "deployment", re: /^\/deployments\/(paper|sandbox|live)\/[^/?]+/, hub: "/deployments/alphas/alpha_btc_trend?tab=deployments" },
  { id: "approval", re: /^\/governance\/approvals\/(?!new)[^/?]+/, hub: "/governance/approvals" },
  { id: "operation", re: /^\/execution\/operations(\?|$)/, hub: null, navOk: true },
  { id: "incident", re: /^\/execution\/operations\/incidents\/[^/?]+/, hub: "/execution/operations" },
  // the Audit view of the Operations screen is a tab (a button that sets ?view=audit), not an anchor
  { id: "audit", tab: /^Audit$/, hub: "/execution/operations" },
];

async function findAndFollow(page, step) {
  if (step.tab) {
    let via = "page";
    let tab = page.getByRole("tab", { name: step.tab }).first();
    if (!(await tab.count())) tab = page.getByRole("button", { name: step.tab }).first();
    if (!(await tab.count()) && step.hub) {
      await page.goto(base + step.hub, { waitUntil: "domcontentloaded" });
      await settle(page);
      via = "hub:" + step.hub;
      tab = page.getByRole("tab", { name: step.tab }).first();
      if (!(await tab.count())) tab = page.getByRole("button", { name: step.tab }).first();
    }
    if (!(await tab.count())) return { found: false };
    await tab.click({ timeout: 8000 }).catch(() => {});
    await settle(page);
    return { found: true, href: "(tab " + step.tab.source + ")", via };
  }
  const pick = async () => {
    const list = await anchors(page);
    return list.find((a) => step.re.test(a.href) && (step.navOk || !a.inNav)) ?? list.find((a) => step.re.test(a.href)) ?? null;
  };
  let hit = await pick();
  let via = "page";
  if (!hit && step.hub) {
    await page.goto(base + step.hub, { waitUntil: "domcontentloaded" });
    await settle(page);
    hit = await pick();
    via = "hub:" + step.hub;
  }
  if (!hit) return { found: false };
  await page.locator(`a[href="${hit.href}"]`).first().click({ timeout: 8000 }).catch(async () => { await page.goto(base + hit.href); });
  await settle(page);
  return { found: true, href: hit.href, via };
}

async function walk(browser, scenario) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const tracker = newTracker(page, scenario === "denied");
  const set = await page.request.post(base + "/__fixture/scenario", { data: { scenario } });
  if (!set.ok()) throw new Error(`scenario ${scenario}: ${set.status()}`);
  const screens = [];
  const seenHrefs = new Map();
  const problems = [];

  const record = async (id, expectedHref, extra = {}) => {
    const m = await measure(page);
    const d = drain(tracker);
    const bad = d.responses.filter((r) => r.status >= 400 && !KNOWN_TYPED_404.some((re) => re.test(r.path)));
    // a denied scenario answers 403 on purpose for administration / blotter / users reads
    const unexpected = bad.filter((r) => !(scenario === "denied" && r.status === 403));
    const rec = { id, url: stripOrigin(page.url()), ...extra, screen: m.screen, heading: m.heading, absences: m.absences, absenceTexts: m.absenceTexts,
      overflow1280: m.overflow1280, overflow660: m.overflow660, notFound: m.notFound, badText: m.badText,
      apiBad: unexpected.map((r) => `${r.status} ${r.method} ${r.path}`), apiDenied: bad.length - unexpected.length,
      consoleErrors: d.consoleErrors, pageErrors: d.pageErrors,
      future: d.future.slice(0, 6),
      degraded: [...d.degraded.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(opt("deg", "12"))) };
    screens.push(rec);
    for (const a of await anchors(page)) if (!a.inNav && !seenHrefs.has(a.href)) seenHrefs.set(a.href, id);
    return rec;
  };

  await page.goto(base + "/execution", { waitUntil: "domcontentloaded" });
  await settle(page);
  await record("overview");
  let previous = "overview";
  for (const step of STEPS) {
    const before = stripOrigin(page.url());
    const res = await findAndFollow(page, step);
    if (!res.found) { problems.push(`${step.id}: NO_LINK_FOUND (after ${previous})`); screens.push({ id: step.id, missing: true }); continue; }
    const rec = await record(step.id, res.href, { via: res.via, from: previous });
    if (rec.badText?.length) problems.push(`${step.id}: page text says ${rec.badText.join(", ")}`);
    // the back-link: history back must land on a rendering screen (the page we came from when we clicked on it)
    if (res.via === "page" && !res.href.startsWith("(tab")) {
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page);
      const back = stripOrigin(page.url());
      const ok = back === before;
      const b = await page.evaluate(inPage);
      rec.backLink = ok && b.textLength > 200 ? "OK" : `FAIL(${back} vs ${before}, text=${b.textLength})`;
      drain(tracker);
      if (!ok || b.textLength <= 200) problems.push(`${step.id}: back-link ${rec.backLink}`);
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page);
      drain(tracker);
    } else rec.backLink = "n/a (hub)";
    previous = step.id;
  }

  // Link sweep: every distinct internal detail link seen on the journey must resolve.
  const sweep = [];
  const detail = [...seenHrefs.keys()].filter((h) => /^\/(deployments\/(alphas|portfolios|accounts|paper|sandbox|live)\/|execution\/operations\/incidents\/|governance\/approvals\/)[^/?]+/.test(h) && !/\/new(\?|$)/.test(h));
  const visit = async (href) => {
    await page.goto(base + href, { waitUntil: "domcontentloaded" });
    await settle(page);
    const m = await page.evaluate(inPage);
    const d = drain(tracker);
    const bad = d.responses.filter((r) => r.status >= 400 && !KNOWN_TYPED_404.some((re) => re.test(r.path)) && !(scenario === "denied" && r.status === 403));
    const firstError = [...d.pageErrors, ...d.consoleErrors][0] ?? null;
    return { m, d, bad, firstError, ok: bad.length === 0 && !m.notFound && m.textLength > 200 };
  };
  for (const href of detail.slice(0, SWEEP_MAX)) {
    let r = await visit(href);
    // a lazy chunk aborted by the previous navigation is a harness race, not a broken link: look again once
    if (!r.ok && r.bad.length === 0 && /dynamically imported|preload CSS/.test(r.firstError ?? "")) r = await visit(href);
    sweep.push({ href, from: seenHrefs.get(href), ok: r.ok && r.m.badText.length === 0, badText: r.m.badText, bad: r.bad.map((x) => `${x.status} ${x.path}`).slice(0, 3), notFound: r.m.notFound, errors: r.d.consoleErrors.length + r.d.pageErrors.length, firstError: r.firstError });
  }
  await ctx.close();
  return { scenario, screens, problems, sweep, sweepTotal: detail.length };
}

const browser = await chromium.launch();
const results = [];
for (const scenario of SCENARIOS) {
  log("scenario", scenario);
  try { results.push(await walk(browser, scenario)); } catch (e) { results.push({ scenario, fatal: String(e.message) }); log("fatal", scenario, e.message); }
}
// cross-screen ties (scripts/fixture-ties.mjs) on the positive default, then leave the lane in its configured default
let ties = null;
if (!flag("no-ties")) {
  try {
    const c = await browser.newContext();
    await c.request.post(base + "/__fixture/scenario", { data: { scenario: "positive" } });
    const { runTies } = await import(pathToFileURL(join(ROOT, "scripts/fixture-ties.mjs")).href);
    ties = await runTies(async (p) => { const r = await c.request.get(base + p); return { status: r.status(), body: await r.json().catch(() => null) }; });
    await c.close();
  } catch (e) { ties = { checked: 0, mismatches: [`ties did not run: ${e.message}`], skipped: [] }; }
}
try { const c = await browser.newContext(); await c.request.post(base + "/__fixture/scenario", { data: { reset: true } }); await c.close(); } catch { /* ignore */ }
await browser.close();
web?.close();
bffProc?.kill();

writeFileSync(join(OUT, `journey-${LABEL}.json`), JSON.stringify({ generated: new Date().toISOString(), base, profile: PROFILE, results }, null, 1));

/* ── report ───────────────────────────────────────────────────────────────── */
for (const r of results) {
  console.log(`\n## scenario ${r.scenario}`);
  if (r.fatal) { console.log("FATAL", r.fatal); continue; }
  console.log("| screen | url | absences | ovf1280 | ovf660 | bad api | console | back | future | degraded markers |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const s of r.screens) {
    if (s.missing) { console.log(`| ${s.id} | NO LINK | | | | | | | |`); continue; }
    console.log(`| ${s.id} | ${s.url.slice(0, 60)} | ${s.absences} | ${s.overflow1280} | ${s.overflow660} | ${s.apiBad.length ? s.apiBad.slice(0, 2).join("; ") : "0"}${s.apiDenied ? ` (+${s.apiDenied} denied)` : ""} | ${s.consoleErrors.length + s.pageErrors.length} | ${s.backLink ?? ""} | ${s.future.length} | ${s.degraded.length} |`);
  }
  console.log(`total absences: ${r.screens.reduce((n, s) => n + (s.absences ?? 0), 0)}; problems: ${r.problems.length ? r.problems.join("; ") : "none"}`);
  const failed = r.sweep.filter((x) => !x.ok);
  console.log(`link sweep: ${r.sweep.length}/${r.sweepTotal} detail links followed, ${failed.length} failed${failed.length ? ": " + failed.slice(0, 12).map((x) => `${x.href} [${x.bad.join(",") || (x.badText?.length ? "text: " + x.badText.join("|") : x.notFound ? "not-found text" : "no render")}${x.firstError ? " err: " + x.firstError.slice(0, 100) : ""}] from ${x.from}`).join("; ") : ""}`);
}
if (ties) {
  console.log(`\n## ties (positive): ${ties.checked} checked, ${ties.mismatches.length} mismatches, ${ties.skipped.length} skipped`);
  for (const m of ties.mismatches) console.log("MISMATCH", m);
  for (const s of ties.skipped) console.log("skipped", s);
}
process.exit(0);
