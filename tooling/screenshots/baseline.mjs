/* Phase 1 — baseline screenshots + layout anchor geometry.
 * Serves legacy/portal.html on a loopback port, then captures full-page
 * screenshots for 6 views x 4 viewports x 2 themes and records geometry
 * anchors (topbar, sidebar, content, board columns, roadmap rows).
 * Usage: node tooling/screenshots/baseline.mjs [--out docs/contracts]
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORTAL = path.join(ROOT, "legacy", "portal.html");
const OUT = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? path.join(ROOT, "docs", "contracts");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];
const VIEWS = ["docs", "roadmap", "board", "reports", "evidence", "portal"];
const DOC_PAGE = "quantitative-trading-ecosystem";

const server = createServer(async (req, res) => {
  try {
    const body = await readFile(PORTAL);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("missing portal");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const anchors = {};

async function anchorsFor(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const columns = [...document.querySelectorAll(".kanban-col")].map((c) => ({
      title: c.querySelector(".kanban-head span")?.textContent?.trim() ?? "",
      box: box(c),
      cards: c.querySelectorAll(".task-card").length,
    }));
    const rows = [...document.querySelectorAll(".roadmap-row")].map((r) => box(r));
    return {
      topbar: box(document.querySelector(".topbar")),
      sidebar: box(document.querySelector(".sidebar")),
      brand: box(document.querySelector(".brand")),
      syncBadge: box(document.querySelector("#syncBadge")),
      workspace: box(document.querySelector(".workspace")),
      content: box(document.querySelector(".content")),
      boardColumns: columns,
      roadmapRows: rows,
      activePanel: box(document.querySelector(".view-panel.active")),
    };
  });
}

for (const vp of VIEWPORTS) {
  anchors[vp.name] = {};
  for (const theme of THEMES) {
    anchors[vp.name][theme] = {};
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((t) => {
      try { localStorage.setItem("quantPortalTheme", t); } catch {}
      localStorage.setItem("quantBoardViewV1", "kanban");
    }, theme);
    const page = await context.newPage();
    let seq = 0;
    for (const view of VIEWS) {
      const hash = view === "docs" ? `#view=docs&page=${DOC_PAGE}` : `#view=${view}`;
      // legacy portal applies the hash only on boot (no hashchange listener),
      // so force a fresh document load per view via a unique query param.
      await page.goto(`${BASE}/?shot=${++seq}${hash}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1500);
      try {
        await page.waitForFunction(
          () => document.querySelectorAll(".mermaid:not([data-processed])").length === 0,
          { timeout: 8000 },
        );
      } catch {}
      await page.waitForTimeout(800);
      const shotDir = path.join(OUT, "screenshots");
      await mkdir(shotDir, { recursive: true });
      await page.screenshot({
        path: path.join(shotDir, `${vp.name}-${view}-${theme}.png`),
        fullPage: true,
      });
      anchors[vp.name][theme][view] = await anchorsFor(page);
    }
    await context.close();
  }
}
await browser.close();
server.close();

await mkdir(OUT, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(OUT, "content-integrity-manifest.json"), "utf-8"));
await writeFile(
  path.join(OUT, "layout-anchors.json"),
  JSON.stringify(
    {
      generated_for: manifest.source_sha256,
      note: "geometry anchors (px, CSS pixels) — compare position/size, not pixels",
      anchors,
    },
    null,
    2,
  ),
);
console.log("screenshots + layout-anchors.json written to", OUT);
