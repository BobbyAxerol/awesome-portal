#!/usr/bin/env node
/**
 * Execution V2 layout-quality audit (UXM-07). FIXTURE_LAB lane, not acceptance evidence.
 *
 * Visits every Execution V2 route at 1440/1280/1024/660/390 against a LOCAL stack of this checkout:
 * a vite build with the V2 screens on + the fixture BFF (FIXTURE_REVIEW_PROFILE=populated) behind a tiny
 * static+proxy server on free ports. No docker, never touches the preview on 8095, not a Playwright test
 * project (lives in scripts/, so no default project can pick it up).
 *
 * Run (from the repo root; needs apps/portal/frontend/node_modules, e.g. a symlink, and
 * features/roadmap-task-board/frontend/node_modules for the build):
 *
 *   node scripts/layout-audit.mjs --build                      # build dist + fixture bundle, then audit
 *   node scripts/layout-audit.mjs                              # reuse the dist from the last --build
 *   node scripts/layout-audit.mjs --out /path/dir --label after
 *   node scripts/layout-audit.mjs --base-url http://127.0.0.1:PORT   # audit an already running stack
 *   node scripts/layout-audit.mjs --only /execution,/deployments/blotter --widths 1440,390
 *
 * Output (default dir = $LAYOUT_AUDIT_OUT or ./.layout-audit): findings-<label>.json, shots-<label>/*.png
 * (findings are outlined in red in the screenshot). Metrics, per route x width:
 *   overflowPx   max(documentElement, main) scrollWidth - clientWidth
 *   clipped      elements with overflow hidden / ellipsis whose content is wider than the box, without a title
 *                (scrolling containers are listed separately as `scroll`, intended)
 *   wrapped      short figures (text with a digit, <= 40 chars) that render on more than one line
 *   fontOutliers off-scale sizes, cells differing from their column mode, non-mono numbers in a mono column,
 *                sub-labels larger than the primary text in the same cell
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

const OUT = resolve(opt("out", process.env.LAYOUT_AUDIT_OUT ?? join(ROOT, ".layout-audit")));
const LABEL = opt("label", "run");
const DIST = resolve(opt("dist", join(OUT, "dist")));
const WIDTHS = opt("widths", "1440,1280,1024,660,390").split(",").map(Number);
const SHOT_WIDTHS = new Set(opt("shot-widths", "1440,1024,390").split(",").map(Number));
const SCREENS = "shell,fleet,cockpit,ops,profile,portfolios,compare,alpha,replay,account,overview,blotter,admin,users,workbench,sandbox,canary,live,request";

const ROUTES = [
  ["overview", "/execution"],
  ["fleet-table", "/deployments/alphas"], ["fleet-board", "/deployments/alphas?view=board"], ["fleet-map", "/deployments/alphas?view=map"],
  ["portfolios", "/deployments/portfolios"], ["portfolio-360", "/deployments/portfolios/pf_TEST_ONLY_core"],
  ["compare", "/deployments/compare?in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite"],
  ["compare-pair", "/deployments/compare?in=pf_TEST_ONLY_satellite,pf_scale_006"], ["compare-alphas", "/deployments/compare?kind=alpha&in=alpha_scale_001,alpha_scale_002"],
  ["alpha-360-btc", "/deployments/alphas/alpha_btc_trend"], ["alpha-activity", "/deployments/alphas/alpha_a?tab=activity"], ["alpha-replay-btc", "/deployments/alphas/alpha_btc_trend?tab=replay"],
  ["alpha-360", "/deployments/alphas/alpha_a"], ["alpha-orders", "/deployments/alphas/alpha_a?tab=orders"],
  ["alpha-deployments", "/deployments/alphas/alpha_a?tab=deployments"], ["alpha-replay", "/deployments/alphas/alpha_a?tab=replay"],
  ["accounts", "/deployments/accounts"], ["account-360", "/deployments/accounts/acc_bnc_core"],
  ["paper", "/deployments/paper/dep_paper_01"], ["sandbox", "/deployments/sandbox/dep_sandbox_01"],
  ["canary", "/deployments/live/dep_canary_01/canary"], ["live", "/deployments/live/dep_live_01"],
  ["operations", "/execution/operations"], ["blotter", "/deployments/blotter"],
  ["approvals", "/governance/approvals"], ["new-approval", "/governance/approvals/new"],
  ["profile-access", "/administration/profile-access"], ["admin-actions", "/administration/actions"], ["users", "/administration/users"],
];
const only = opt("only", null)?.split(",");
const routes = only ? ROUTES.filter(([, p]) => only.includes(p.split("?")[0]) || only.includes(p)) : ROUTES;

// Allowed type scale = the --exec-font-* roles (src/execution/execution.css) over the --text-* tokens (styles/tokens.css).
const ALLOWED_SIZES = [10, 11, 12, 13, 14, 15, 22, 23, 24, 18, 30];
const log = (...a) => console.error("[layout-audit]", ...a);

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
if (!base) {
  if (!existsSync(join(DIST, "index.html")) || !existsSync(join(BFF, "dist/server.mjs"))) throw new Error("no dist: run with --build first");
  bffProc = spawn("node", ["dist/server.mjs"], { cwd: BFF, env: { ...process.env, PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated" } });
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

/** Runs in the page. Returns the findings for the current viewport and tags offenders with data-la-flag. */
function inPage(allowed) {
  const out = { docOverflowPx: 0, mainOverflowPx: 0, scroll: [], clipped: [], wrapped: [], fonts: [], fontStats: {} };
  const de = document.documentElement;
  out.docOverflowPx = Math.max(0, de.scrollWidth - de.clientWidth);
  const main = document.querySelector("main") ?? document.querySelector("[data-screen]") ?? document.body;
  out.mainOverflowPx = Math.max(0, main.scrollWidth - main.clientWidth);
  const SKIP = (el) => el.closest("script,style,svg,[aria-hidden='true'],[data-fixture-banner],.portal-skip-link") || /^FIXTURE DATA/.test((el.textContent || "").trim().slice(0, 12));
  const path = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.body && i < 5; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      const tid = n.getAttribute("data-testid") || n.getAttribute("data-screen");
      if (tid) s += `[${tid}]`;
      else if (n.classList.length) s += "." + [...n.classList].slice(0, 2).join(".");
      parts.unshift(s);
      if (tid) break;
    }
    return parts.join(" > ");
  };
  const txt = (el, n = 60) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, n);
  const flag = (el, kind) => { el.setAttribute("data-la-flag", kind); };
  const hasTitle = (el) => !!el.closest("[title],[aria-label]") || !!el.querySelector("[title]");
  const all = [...document.querySelectorAll("body *")];

  // (2) overflow / clipping
  for (const el of all) {
    if (SKIP(el)) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if (ox === "visible") {
      // content spilling out of a box that does not clip it (overlaps neighbours / escapes the cell)
      const sp = el.scrollWidth - el.clientWidth;
      if (sp > 5 && el.clientWidth > 2 && el.clientHeight > 2 && cs.display !== "inline" && cs.display !== "contents" && !/table-row|table$|table-row-group/.test(cs.display) && (el.textContent || "").trim()) {
        const kids = [...el.children];
        // known benign: the journey-spine chevron is a ::after pseudo-element that sits on the seam by design
        if (el.classList.contains("exec-blk-spine-node")) continue;
        if (!kids.some((k) => k.scrollWidth - k.clientWidth > 1 && k.clientWidth > 2)) { out.clipped.push({ sel: path(el), text: txt(el), by: sp, kind: "spills-out-of-box", title: hasTitle(el) }); flag(el, "clip"); }
      }
      continue;
    }
    const by = el.scrollWidth - el.clientWidth;
    if (by <= 1 || el.clientWidth <= 2 || el.clientHeight <= 2) continue; // 1px boxes are the visually-hidden (sr-only) pattern
    const rec = { sel: path(el), text: txt(el), by, overflowX: ox, ellipsis: cs.textOverflow === "ellipsis", title: hasTitle(el) };
    if (ox === "auto" || ox === "scroll") { out.scroll.push({ ...rec, intended: true, exec_cards_wrap: el.classList.contains("exec-cards-wrap") }); continue; }
    rec.kind = rec.ellipsis ? (rec.title ? "ellipsis-with-title" : "ellipsis-no-title") : "clipped-no-scroll";
    if (rec.kind !== "ellipsis-with-title") flag(el, "clip");
    out.clipped.push(rec);
  }
  // vertical text clipping is out of scope; elements that stick out of the viewport without a clipping ancestor:
  const vw = de.clientWidth;
  for (const el of all) {
    if (SKIP(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right <= vw + 1) continue;
    let p = el.parentElement, clippedByAncestor = false;
    for (; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") { clippedByAncestor = true; break; } }
    if (clippedByAncestor) continue;
    if (el.children.length && [...el.children].some((c) => c.getBoundingClientRect().right > vw + 1)) continue; // report the deepest only
    out.clipped.push({ sel: path(el), text: txt(el), by: Math.round(r.right - vw), kind: "escapes-viewport", title: false });
    flag(el, "clip");
  }

  // leaves with direct text
  const leaves = [];
  for (const el of all) {
    if (SKIP(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || getComputedStyle(el).visibility === "hidden") continue;
    leaves.push({ el, own });
  }
  const lineCount = (own) => {
    const tops = new Set();
    for (const n of own) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top / 3)); }
    return tops.size;
  };
  // (3) wrapped figures
  for (const { el, own } of leaves) {
    const t = own.map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    if (t.length > 40 || !/\d/.test(t)) continue;
    // prose-like (3+ words made of letters) is not a figure
    if ((t.match(/[A-Za-z]{3,}/g) || []).length >= 3) continue;
    const n = lineCount(own);
    if (n > 1) { out.wrapped.push({ sel: path(el), text: t, lines: n, inTable: !!el.closest("table,[role=table],[role=grid]") }); flag(el, "wrap"); }
  }
  // (4) fonts
  const role = (fam) => (/mono|courier|menlo/i.test(fam) ? "mono" : /newsreader|georgia|serif/i.test(fam) && !/sans/i.test(fam) ? "display" : "body");
  const isNum = (t) => /^[\s+\-−$€%]*\d[\d.,:\s%/xX×+\-−$€A-Za-z]{0,18}$/.test(t) && /\d/.test(t) && t.length <= 22 && (t.match(/[A-Za-z]{3,}/g) || []).length === 0;
  const recs = leaves.map(({ el, own }) => {
    const cs = getComputedStyle(el);
    const t = own.map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    return { el, t, fs: parseFloat(cs.fontSize), fam: role(cs.fontFamily), fw: cs.fontWeight, tnum: /tabular/.test(cs.fontVariantNumeric), num: isNum(t) };
  });
  const bump = (k) => { out.fontStats[k] = (out.fontStats[k] || 0) + 1; };
  for (const r of recs) bump(`${r.fs}px/${r.fam}/${r.fw}`);
  const push = (r, why, extra = {}) => { out.fonts.push({ sel: path(r.el), text: r.t.slice(0, 50), fs: r.fs, fam: r.fam, fw: r.fw, why, ...extra }); flag(r.el, "font"); };
  const seen = new Set();
  for (const r of recs) if (!allowed.includes(r.fs)) { push(r, "off-scale"); seen.add(r.el); }
  // per-table column analysis
  const mode = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) || 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]; };
  for (const table of document.querySelectorAll("table")) {
    if (SKIP(table)) continue;
    const rows = [...table.querySelectorAll("tbody tr")];
    const cols = new Map();
    for (const tr of rows) [...tr.children].forEach((td, i) => {
      const cellLeaves = recs.filter((r) => td.contains(r.el));
      if (!cellLeaves.length) return;
      (cols.get(i) || cols.set(i, []).get(i)).push({ td, leaves: cellLeaves, primary: cellLeaves[0] });
    });
    for (const [i, cells] of cols) {
      if (cells.length < 3) continue;
      const fsMode = mode(cells.map((c) => c.primary.fs));
      const famMode = mode(cells.map((c) => c.primary.fam));
      const famShare = cells.filter((c) => c.primary.fam === famMode).length / cells.length;
      for (const c of cells) {
        const p = c.primary;
        if (p.fs !== fsMode && !seen.has(p.el)) { push(p, "col-size-differs", { col: i, colMode: fsMode }); seen.add(p.el); }
        if (famMode === "mono" && famShare >= 0.5 && p.fam !== "mono" && p.num && !seen.has(p.el)) { push(p, "number-not-mono", { col: i }); seen.add(p.el); }
        if (famMode !== "mono" && p.fam === "mono" && p.num && famShare >= 0.5 && false) { /* mono numbers in a prose column are by design */ }
        for (const s of c.leaves.slice(1)) if ((p.num || p.fam === "mono") && !s.num && s.fs > p.fs && !seen.has(s.el)) { push(s, "sublabel-bigger-than-primary", { primaryFs: p.fs }); seen.add(s.el); }
      }
    }
  }
  // KPI / tile groups: secondary text bigger than the first leaf of the same parent block
  for (const blk of document.querySelectorAll("[class*='kpi'],[class*='tile'],[class*='stat']")) {
    if (SKIP(blk) || blk.closest("table")) continue;
    const ls = recs.filter((r) => blk.contains(r.el));
    if (ls.length < 2) continue;
    const big = ls.reduce((a, b) => (b.fs > a.fs ? b : a));
    const figure = ls.find((r) => r.num && r.fam === "mono");
    if (figure) for (const s of ls) if (s !== figure && s.fs > figure.fs && !s.num && !seen.has(s.el)) { push(s, "label-bigger-than-figure", { primaryFs: figure.fs }); seen.add(s.el); }
  }
  // mono vs body: numeric leaf outside tables in the same parent as mono numerics
  for (const r of recs) if (r.num && r.fam === "body" && !r.el.closest("table") && !seen.has(r.el)) {
    const sib = recs.filter((q) => q.el.parentElement === r.el.parentElement && q !== r && q.num);
    if (sib.some((q) => q.fam === "mono")) { push(r, "number-not-mono(sibling-mono)"); seen.add(r.el); }
  }
  out.fontLeafCount = recs.length;
  return out;
}

const browser = await chromium.launch();
const results = [];
const shotDir = join(OUT, `shots-${LABEL}`);
mkdirSync(shotDir, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const [name, path] of routes) {
  const page = await ctx.newPage();
  const bad = [];
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) bad.push(r.status() + " " + new URL(r.url()).pathname); });
  try {
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
  } catch (e) { results.push({ name, path, width: 0, error: String(e.message).slice(0, 120) }); await page.close(); continue; }
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(450);
    await page.evaluate(() => document.querySelectorAll("[data-la-flag]").forEach((e) => e.removeAttribute("data-la-flag")));
    const r = await page.evaluate(inPage, ALLOWED_SIZES);
    const rec = { name, path, width, apiErrors: [...new Set(bad)].slice(0, 4), ...r };
    rec.metrics = {
      overflowPx: Math.max(r.docOverflowPx, r.mainOverflowPx),
      clipped: r.clipped.length, wrapped: r.wrapped.length, fontOutliers: r.fonts.length, scrollContainers: r.scroll.length,
    };
    if (SHOT_WIDTHS.has(width)) {
      await page.addStyleTag({ content: "[data-la-flag]{outline:2px solid #f0f !important;outline-offset:-1px}" });
      const file = join(shotDir, `${name}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      rec.screenshot = file;
    }
    results.push(rec);
  }
  await page.close();
  log(name, results.filter((x) => x.name === name).map((x) => `${x.width}:${x.metrics?.overflowPx}/${x.metrics?.clipped}/${x.metrics?.wrapped}/${x.metrics?.fontOutliers}`).join(" "));
}
await browser.close();
web?.close();
bffProc?.kill();
const jsonFile = join(OUT, `findings-${LABEL}.json`);
writeFileSync(jsonFile, JSON.stringify({ generated: new Date().toISOString(), base, allowedSizes: ALLOWED_SIZES, widths: WIDTHS, results }, null, 1));
log("wrote", jsonFile);
process.exit(0);
