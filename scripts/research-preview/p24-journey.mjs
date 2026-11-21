#!/usr/bin/env node
// P24 · real product journey on the Research preview (research-portal.primusspark.com = :8095).
// Drives the product UI in a real browser, one stage per invocation, with a screenshot at each step:
//   import   S14: paste a source, Parse, Gates, (Register draft with --register)
//   create   S02: preflight + create a run (--spec fixed|wfo|causal|scratch), then follow S03 to a terminal state
//   evidence S04-S09 screenshots for a run id (read only)
//   rc       S11: declare, seal, publish for a run id (--declare --seal --publish, each its own flag)
// No credentials are printed; the login password comes from the 0600 file the preview script wrote.
// Usage: RESEARCH_PREVIEW_ORIGIN=$(sed -n 's/^PORTAL_PUBLIC_ORIGIN=//p' ~/.config/portal-research-preview/preview.env) \
//        node p24-journey.mjs <stage> <outDir> [--flag value ...]
import { chromium } from "../../apps/portal/frontend/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const BASE = process.env.RESEARCH_PREVIEW_BASE_URL ?? "http://localhost:8095";
const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN;
const [stage, out, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
if (!stage || !out || !ORIGIN) {
  console.error("usage: node p24-journey.mjs <import|create|evidence|rc> <outDir> [--flag value]; RESEARCH_PREVIEW_ORIGIN must be set");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const SAMPLE_SOURCE = (version) => `# p24 journey sample alpha
ALPHA_CONTRACT = {"schema_version":"research.alpha-source.v1","version":"${version}","entrypoint":"generate_signals","timeframes":["1h"],"required_columns":["open","high","low","close","volume"],"warmup_bars":32,"determinism":{"seed_required":true},"parameter_space":{"window":{"kind":"int_range","low":8,"high":64,"step":1}}}
def generate_signals(context):
    return context
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" } });
const page = await ctx.newPage();
const log = [];
const writes = [];
page.on("console", (m) => { if (m.type() === "error") log.push(`console: ${m.text().slice(0, 140)}`); });
page.on("response", (r) => {
  const q = r.request();
  if (q.method() !== "GET" && r.url().includes("/api/")) writes.push(`${q.method()} ${new URL(r.url()).pathname} ${r.status()}`);
});
const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: "claude-preview", credential: readFileSync(`${HOME}/claude-preview.password`, "utf8").trim() },
  headers: { origin: ORIGIN },
});
console.log("login", login.status());
// Writes carry the stack's public Origin (the Control API checks it); reads go straight through.
await page.route("**/api/**", (route) => {
  const r = route.request();
  if (r.method() === "GET") return route.continue();
  return route.fetch({ headers: { ...r.headers(), origin: ORIGIN } }).then((res) => route.fulfill({ response: res }));
});
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const idOf = (url) => new URL(url).pathname.split("/")[4];

if (stage === "import") {
  const version = flags.version ?? "0.1.0";
  await page.goto(`${BASE}/research/quantbt/alpha-import`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("import-0-empty");
  await page.locator("textarea").first().fill(SAMPLE_SOURCE(version));
  await shot("import-1-pasted");
  await page.getByRole("button", { name: /^parse/i }).first().click();
  await page.waitForTimeout(3000);
  await shot("import-2-parsed");
  const gates = page.getByRole("button", { name: /gates|continue to gates/i }).first();
  console.log("gates button:", await gates.count());
  if (await gates.count()) { await gates.click(); await page.waitForTimeout(3000); await shot("import-3-gates"); }
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log("main:", text.slice(0, 600));
}

if (stage === "evidence") {
  const run = flags.run;
  for (const [k, seg] of [["s03", "progress"], ["s04", "evidence"], ["s05", "split"], ["s06", "search"], ["s07", "freeze"], ["s08", "execute"], ["s09", "report"], ["s11", "release-candidate"]]) {
    await page.goto(`${BASE}/research/quantbt/runs/${run}/${seg}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await shot(`evidence-${k}`);
  }
}

console.log("writes:", writes.join(" | "));
console.log("console errors:", log.length, JSON.stringify(log.slice(0, 3)));
writeFileSync(`${out}/${stage}-writes.json`, JSON.stringify({ stage, flags, writes, console: log }, null, 2));
await browser.close();
