#!/usr/bin/env node
// Static assets are served from the actual build. Every API reaches owned :8098.
// This is consumer/API acceptance, not a deployed gateway or a visual baseline.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "../../apps/portal/frontend/node_modules/@playwright/test/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = realpathSync(join(root, "apps/portal/frontend/dist"));
const out = process.env.RESEARCH_E17_RECEIPT_DIR;
assert(out?.startsWith("/home/bobby/.local/state/portal-research-e17/"));
const origin = "http://127.0.0.1:8098";
const id = randomUUID(), cells = [], references = [], digest = bytes => createHash("sha256").update(bytes).digest("hex");
const resumeName = process.env.RESEARCH_BROWSER_BASELINE_RECEIPT;
if (resumeName) assert.match(resumeName, /^e11-e17-browser-[a-f0-9-]+\.json$/);
const resume = resumeName ? JSON.parse(readFileSync(join(out, resumeName), "utf8")) : null;
const indexHash = digest(readFileSync(join(assets, "index.html")));
if (resume) { assert.equal(resume.origin, origin); assert.equal(resume.index_sha256, indexHash, "Do not reuse evidence from a different bundle"); }
const runs = {
  fixed: "rrun_3a911fa35a250022def4d9d1e567d1c5", legacy: "rrun_71d45ff4b86492bb5f526e272fcb5112",
  wfo: "rrun_2f8f41dddf41129d5eef84d86903e3b0", reproduction: "rrun_de49e40d12f458aeab9e19ad4ff8f284",
  imported: "rrun_1084d207e57bba4127c8e8b0cf77dc8e",
};
const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const browser = await chromium.launch({ headless: true, executablePath:
  process.env.RESEARCH_BROWSER_EXECUTABLE ?? "/home/bobby/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome" });
let verdict = "FAILED";
async function read(page, path) {
  const result = await page.evaluate(async target => {
    const response = await fetch(target, { credentials: "same-origin" });
    return { status: response.status, body: await response.json() };
  }, path);
  assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body.error)}`);
  return result.body;
}
async function summary(page, run, retained) {
  const response = await read(page, `/api/v1/quantbt/runs/${run}/${retained ? "current-source/evidence" : "evidence"}`);
  const facts = response.summary_analytics;
  assert(facts);
  await page.waitForSelector("[data-summary-trade-count]", { timeout: 20000 });
  assert.equal(await page.locator("[data-summary-trade-count]").getAttribute("data-trade-scope"), facts.total_trade_count.scope);
  const count = page.locator("[data-summary-trade-count] [data-exact]");
  if (facts.total_trade_count.state === "AVAILABLE") assert.equal(await count.getAttribute("data-exact"), facts.total_trade_count.value);
  const is = page.locator('[data-chart-table="equity-is"] tbody tr');
  if (facts.in_sample_equity.state === "AVAILABLE") {
    await page.waitForSelector('[data-chart-table="equity-is"]', { state: "attached" });
    assert.equal(await is.count(), facts.in_sample_equity.points.length);
    assert.equal(await is.first().locator("td").last().textContent(), facts.in_sample_equity.points[0].equity);
  } else assert.equal(await is.count(), 0);
  const rolling = page.locator('[data-series-panel="ROLLING_SHARPE_63"]');
  assert.equal(await rolling.getAttribute("data-series-state"), facts.rolling_sharpe_63.state === "AVAILABLE" ? "ready" : "absent");
  for (const [label, key] of [["win rate", "win_rate"], ["payoff", "payoff_ratio"], ["avg holding", "average_hold_seconds"],
    ["turnover", "turnover_notional"], ["max consec loss", "max_consecutive_losses"], ["exposure", "exposure_fraction"]]) {
    const fact = facts.behaviour[key], tile = page.locator(`[data-behavior-tile="${label}"]`);
    if (fact.state === "AVAILABLE") assert.equal(await tile.locator("[data-exact]").getAttribute("data-exact"), fact.value);
    else { assert.equal(await tile.locator("[data-exact]").count(), 0); assert((await tile.innerHTML()).includes(fact.reason_code)); }
  }
  return { schema_version: facts.schema_version, api_digest: digest(JSON.stringify(facts)),
    is: facts.in_sample_equity.state, rolling: facts.rolling_sharpe_63.state, total_scope: facts.total_trade_count.scope };
}
const plan = [
  { name: "E12-Journey", path: "/research/quantbt/journey", screen: "journey-map" },
  { name: "E11-Library", path: "/research/quantbt/runs", screen: "run-library" },
  { name: "E11-Fixed", run: runs.fixed, stage: "evidence", screen: "evidence-flow", summary: false },
  { name: "E11-WFO", run: runs.wfo, stage: "evidence", screen: "evidence-flow", summary: true },
  { name: "E14-Split", run: runs.wfo, stage: "split", screen: "split-detail" },
  { name: "E14-Search", run: runs.wfo, stage: "search", screen: "search-detail" },
  { name: "E14-Report", run: runs.fixed, stage: "report", screen: "run-report" },
  { name: "E15-Progress", run: runs.fixed, stage: "progress", screen: "run-progress" },
  { name: "E16-P04", run: runs.fixed, stage: "execute", screen: "execute-replay" },
  { name: "E16-Legacy", run: runs.legacy, stage: "execute", screen: "execute-replay" },
  { name: "E16-WFO-Reveal", run: runs.wfo, stage: "execute", screen: "execute-replay" },
  { name: "E17-Imported", run: runs.imported, stage: "evidence", screen: "evidence-flow" },
  { name: "E16-P04-Freeze", run: runs.fixed, stage: "freeze", screen: "freeze-detail" },
  { name: "E17-Freeze", run: runs.imported, stage: "freeze", screen: "freeze-detail" },
  { name: "E13-Lineage", path: "/research/quantbt/alphas/delta-rsi-polynomial-alpha/lineage?attempt=ratt_de49e40d12f458aeab9e19ad4ff8f284", screen: "attempt-lineage" },
];
try {
  for (const width of [1280, 660]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "x-dev-access-email": "e17-owner@azdag.com" } });
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (url.pathname.startsWith("/api/")) {
        assert(["GET", "HEAD"].includes(req.method()), `Acceptance must not write: ${req.method()} ${url.pathname}`);
        return route.continue();
      }
      const candidate = resolve(assets, `.${decodeURIComponent(url.pathname)}`);
      let target = candidate.startsWith(assets + sep) && existsSync(candidate) && extname(candidate) ? candidate : join(assets, "index.html");
      assert(realpathSync(target).startsWith(assets + sep));
      return route.fulfill({ status: 200, contentType: mime[extname(target)] ?? "application/octet-stream", body: readFileSync(target) });
    });
    for (const item of plan) {
      const accepted = resume?.cells.find(cell => cell.verdict === "PASS" && cell.name === item.name && cell.width === width);
      if (accepted) { cells.push(accepted); console.log("BROWSER_PRIOR_PASS", item.name, width); continue; }
      const page = await context.newPage(), requests = [], errors = [], pending = [];
      const cell = { name: item.name, width, path: item.path ?? `/research/quantbt/runs/${item.run}/${item.stage}`, verdict: "FAILED", requests, errors };
      cells.push(cell);
      page.on("pageerror", error => errors.push(String(error)));
      page.on("console", msg => { if (["error", "warning"].includes(msg.type()) && !msg.text().startsWith("Failed to load resource:")) errors.push(`${msg.type()}: ${msg.text()}`); });
      page.on("response", response => {
        if (!new URL(response.url()).pathname.startsWith("/api/")) return;
        pending.push((async () => {
          const entry = { path: new URL(response.url()).pathname, method: response.request().method(), status: response.status() };
          if (entry.status >= 400) { const body = await response.json(); entry.refusal = body.error?.code; assert(entry.refusal, "Untyped API refusal"); }
          requests.push(entry);
        })());
      });
      await page.goto(origin + cell.path, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForSelector(`[data-screen="${item.screen}"]`, { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      if (item.summary !== undefined) cell.facts = await summary(page, item.run, item.summary);
      if (item.stage === "execute" && item.name.startsWith("E16-") && item.name !== "E16-WFO-Reveal") {
        const response = await read(page, `/api/v1/quantbt/runs/${item.run}/execute/replay`);
        assert.equal(response.candle_overview.state, "AVAILABLE");
        const strip = page.locator('[data-candle-overview="AVAILABLE"] [data-overview]');
        await strip.waitFor();
        assert.equal(await strip.locator("svg line").count(), response.candle_overview.emitted_bucket_count);
        cell.buckets = response.candle_overview.emitted_bucket_count;
      }
      if (item.name === "E17-Freeze") {
        assert((await page.locator(`[data-screen="${item.screen}"]`).innerText()).includes("imported source and adapter contract"));
      }
      if (item.stage === "freeze") {
        const response = await read(page, `/api/v1/quantbt/runs/${item.run}/freeze`);
        assert.equal(response.engine_pin.state, "AVAILABLE");
        const pin = page.locator('[data-chain-link="ENGINE_PIN"]');
        assert.equal(await pin.getAttribute("data-chain-link-state"), "PUBLISHED");
        assert((await pin.innerText()).includes(response.engine_pin.engine_version));
        if (item.name === "E17-Freeze") {
          const source = page.locator('[data-chain-link="STRATEGY_SOURCE"]');
          assert((await source.innerText()).includes("SOURCE_CODE_SHA256"));
          assert(!(await source.innerText()).includes("PROTECTED_SHA256"));
        }
      }
      if (item.name === "E13-Lineage") {
        await page.waitForSelector('[data-attempt="ratt_de49e40d12f458aeab9e19ad4ff8f284"]');
        assert.equal(await page.locator('[data-attempt="ratt_de49e40d12f458aeab9e19ad4ff8f284"]').count(), 1);
        for (const [attempt, depth] of [["ratt_71d45ff4b86492bb5f526e272fcb5112", "0"],
          ["ratt_d9fcdb76659132495676f30e2c986709", "1"], ["ratt_de49e40d12f458aeab9e19ad4ff8f284", "2"]]) {
          assert.equal(await page.locator(`[data-attempt="${attempt}"]`).getAttribute("data-depth"), depth);
        }
        cell.lineage = "PERSISTED_ROOT_CLONE_REPRODUCTION_DEPTH_0_1_2";
      }
      if (item.name === "E16-WFO-Reveal") {
        const button = page.getByRole("button", { name: /reveal/i });
        await button.click();
        await page.waitForSelector("[data-reveal-note]");
        assert((await page.locator("[data-overview-caption]").innerText()).includes("revealed"));
        cell.reveal = "COMPLETED_BUCKETS_ONLY";
      }
      cell.overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(cell.overflow, 0, `${item.name} at ${width} overflows`);
      await Promise.all(pending);
      assert(requests.every(req => !req.path.includes("/internal/") && ["GET", "HEAD"].includes(req.method)));
      assert(!requests.some(req => [401, 403, 500, 502, 503].includes(req.status)), `${item.name} unhealthy API response`);
      assert.deepEqual(errors, [], `${item.name} console errors`);
      const shot = `${id}-${item.name}-${width}.png`;
      await page.screenshot({ path: join(out, shot), fullPage: true });
      cell.screenshot = { name: shot, sha256: digest(readFileSync(join(out, shot))) };
      if (item.name === "E11-Fixed" || item.name === "E16-P04") {
        const viewport = `${id}-${item.name}-${width}-viewport.jpg`;
        await page.screenshot({ path: join(out, viewport), type: "jpeg", quality: 65 });
        cell.viewport_screenshot = { name: viewport, sha256: digest(readFileSync(join(out, viewport))) };
      }
      cell.verdict = "PASS";
      console.log("BROWSER_PASS", item.name, width, "overflow", cell.overflow);
      await page.close();
    }
    await context.close();
  }
  // Render the exact approved reference HTML. This is a reference receipt,
  // not a pixel-parity assertion or permission to change Claude's design.
  for (const width of [1280, 660]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", route => {
      const scheme = new URL(route.request().url()).protocol;
      return ["file:", "data:", "blob:"].includes(scheme) ? route.continue() : route.abort("blockedbyclient");
    });
    for (const file of ["QuantBT 04 Evidence Flow.dc.html", "QuantBT 08 S4 Execute Replay.dc.html"]) {
      const page = await context.newPage(), path = join(root, "upgrade/research_loop/release-v1.1", file);
      await page.goto(pathToFileURL(path).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => ({ width: innerWidth, body_height: document.body.scrollHeight,
        body_font: getComputedStyle(document.body).fontFamily, headings: [...document.querySelectorAll("h1,h2")].map(el => el.textContent).slice(0, 8) }));
      const name = `${id}-hifi-${file.startsWith("QuantBT 04") ? "S04" : "S08"}-${width}.png`;
      await page.screenshot({ path: join(out, name), fullPage: true });
      references.push({ file, width, sha256: digest(readFileSync(path)), geometry,
        screenshot: { name, sha256: digest(readFileSync(join(out, name))) }, claim: "REFERENCE_RENDER_ONLY_NOT_PIXEL_PARITY" });
      await page.close();
    }
    await context.close();
  }
  verdict = "PASS";
} finally {
  await browser.close();
  const document = JSON.stringify({ schema_version: "research.e11-e17.browser-receipt.v1", verdict,
    recorded_at_utc: new Date().toISOString(), source_sha: process.env.RESEARCH_SOURCE_SHA ?? null, origin,
    scope: "REAL_API_BROWSER_CONSUMER_STATIC_ASSET_HARNESS_NOT_DEPLOYMENT_OR_VISUAL_BASELINE",
    api_double: false, index_sha256: indexHash,
    resumed_from: resume ? { filename: resumeName, sha256: digest(readFileSync(join(out, resumeName))) } : null,
    runs, cells, references }, null, 2) + "\n";
  const name = `e11-e17-browser-${id}.json`;
  writeFileSync(join(out, name), document, { mode: 0o600 });
  console.log("BROWSER_RECEIPT", name, digest(document), verdict, `${cells.filter(cell => cell.verdict === "PASS").length}/${cells.length}`);
}
