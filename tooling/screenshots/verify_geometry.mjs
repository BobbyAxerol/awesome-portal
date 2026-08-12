import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = JSON.parse(readFileSync(path.join(ROOT, "docs/contracts/layout-anchors.json"), "utf8"));

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 640, height: 900 },
];
const ROUTES = [
  ["docs", "#view=docs&page=tong-quan-he-thong"],
  ["roadmap", "#view=roadmap"],
  ["board", "#view=board"],
  ["reports", "#view=reports"],
  ["evidence", "#view=evidence"],
  ["portal", "#view=portal"],
];

const browser = await chromium.launch();
const report = [];
let n = 0;
for (const vp of VIEWPORTS) {
  for (const [name, hash] of ROUTES) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      try { localStorage.setItem("quantPortalTheme", t); } catch {}
      queueMicrotask(() => { document.documentElement.dataset.theme = t; });
    }, "light");
    await page.goto(`http://127.0.0.1:5173/${hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    const geo = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const body = document.body.getBoundingClientRect();
      return {
        viewport: { w: body.width, h: window.innerHeight },
        scrollW: document.documentElement.scrollWidth,
        topbar: pick(".topbar"),
        workspace: pick(".workspace"),
        sidebar: pick(".sidebar"),
        main: pick(".content"),
        mermaidCount: document.querySelectorAll(".mermaid svg, .mermaid[data-processed]").length,
        copyButtons: document.querySelectorAll(".copy-source").length,
        panelShell: pick(".doc-main .view-panel.active") ?? pick(".panel-shell") ?? pick(".view-panel.active"),
      };
    });
    const problems = [];
    if (!geo.topbar) problems.push("missing .topbar");
    if (!geo.workspace) problems.push("missing .workspace");
    if (geo.scrollW > vp.width + 4) problems.push(`horizontal overflow: scrollW=${geo.scrollW} vw=${vp.width}`);
    if (geo.panelShell && geo.panelShell.w < vp.width * 0.4) problems.push(`content too narrow: ${geo.panelShell.w}px`);
    if (name === "docs" && geo.mermaidCount < 1) problems.push("mermaid not rendered");
    report.push({ view: name, vp: vp.name, w: vp.width, scrollW: geo.scrollW, topbar: geo.topbar, panelW: geo.panelShell?.w ?? null, mermaid: geo.mermaidCount, copy: geo.copyButtons, problems });
    n++;
    await context.close();
  }
}
const problems = report.filter((r) => r.problems.length);
writeFileSync(path.join(ROOT, "docs/contracts/geometry-new.json"), JSON.stringify(report, null, 2));
console.log(`measured ${n} layouts, problem views: ${problems.length}`);
for (const p of problems) console.log(`- ${p.view} ${p.vp}: ${p.problems.join("; ")}`);
await browser.close();
