import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs", "contracts", "screenshots-new");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 640, height: 900 },
];
const ROUTES = [
  "docs", "tong-quan-he-thong",
  "roadmap", null,
  "board", null,
  "reports", null,
  "evidence", null,
  "portal", null,
];
const THEMES = ["light", "dark"];

const browser = await chromium.launch();
const failures = [];
const logs = [];
let n = 0;
for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    for (let i = 0; i < ROUTES.length; i += 2) {
      const name = ROUTES[i];
      const pageId = ROUTES[i + 1];
      const hash = pageId ? `#view=docs&page=${pageId}` : `#view=${name}`;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      page.on("pageerror", (e) => logs.push(`[${name} ${vp.name} ${theme}] pageerror: ${e.message.slice(0, 120)}`));
      page.on("console", (m) => { if (m.type() === "error") logs.push(`[${name} ${vp.name} ${theme}] console: ${m.text().slice(0, 160)}`); });
      try {
        await page.addInitScript((t) => {
          try { localStorage.setItem("quantPortalTheme", t); } catch {}
          queueMicrotask(() => { document.documentElement.dataset.theme = t; });
        }, theme);
        await page.goto(`http://127.0.0.1:5173/${hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(theme === "dark" ? 3500 : 1800);
        const file = `${name}-${vp.width}x${vp.height}-${theme}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        n++;
      } catch (e) {
        failures.push(`${name} ${vp.name} ${theme}: ${String(e.message).split("\n")[0]}`);
      } finally {
        await context.close().catch(() => {});
      }
    }
  }
}
console.log(`new screenshots: ${n}, failures: ${failures.length}`);
if (logs.length) writeFileSync(path.join(OUT, "console-logs.txt"), logs.join("\n"));
if (failures.length) console.log(failures.join("\n"));
await browser.close();
