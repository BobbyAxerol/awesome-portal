// Layout probe for Operations and the routed Incident page (WP-B). Chromium only, one browser. Not part of any Playwright project or vitest.
//   node scripts/probe-operations-layout.mjs http://127.0.0.1:<port> [outfile.json] [shots-dir]
// The server is YOUR local vite of this worktree (VITE_EXECUTION_PREVIEW_ENABLED=true, VITE_EXECUTION_V2_SCREENS naming `ops`) with a
// fixture BFF (FIXTURE_REVIEW_PROFILE=populated) on port 8000 behind /api. It never targets the shared preview stack.
// Per route and width it prints: document horizontal overflow, elements past the viewport, cells with a descendant sticking out of its cell,
// figures (times, counts) that wrap onto a second line, panels whose content overflows them, and the computed font sizes by region.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2];
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("pass a local http origin, e.g. http://127.0.0.1:5191");
const out = process.argv[3] ?? null;
const shots = process.argv[4] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const WIDTHS = [1440, 1280, 1024, 660, 390];
const INC = "inc_TEST_ONLY_fx_mismatch";
const ROUTES = [
  ["commands", "/execution/operations", "table.exec-cards"],
  ["commands-lens-all", "/execution/operations?lens=all&range=all", "table.exec-cards"],
  ["drawer-unknown", "/execution/operations?lens=all&range=all&sel=op_TEST_ONLY_s01", "[data-section='Receipt']"],
  ["exceptions", "/execution/operations?view=exceptions", "table.exec-cards"],
  ["audit", "/execution/operations?view=audit", "table.exec-cards"],
  ["incident-page", `/execution/operations/incidents/${INC}`, "[data-page='incident'] [aria-label='Resolution gates']"],
  ["incident-peek", `/execution/operations/incidents/${INC}?peek=1`, ".exec-ops-rail"],
];

function measure() {
  const px = (el) => getComputedStyle(el).fontSize;
  const doc = document.documentElement;
  const sizesOf = (root, filter = () => true) => {
    const sizes = {};
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest(".exec-blk-sr, .exec-flag-sr") || !filter(node.parentElement)) continue;
      const size = px(node.parentElement);
      sizes[size] = (sizes[size] ?? 0) + 1;
    }
    return sizes;
  };
  const tables = [...document.querySelectorAll("table.exec-cards")].map((table) => {
    const wrap = table.closest(".exec-cards-wrap");
    const clipped = [];
    const wrapped = [];
    for (const td of table.querySelectorAll("tbody td")) {
      const cell = td.getBoundingClientRect();
      for (const el of td.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || el.closest(".exec-blk-sr, .exec-flag-sr")) continue;
        if (r.right > cell.right + 1.5 || r.left < cell.left - 1.5) clipped.push(`${td.dataset.l}: ${el.className || el.tagName} ${Math.round(r.right - cell.right)}px`);
      }
      for (const el of td.querySelectorAll("time, .exec-ops-time, .exec-flag")) {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(px(el)) * 1.3;
        if (el.getBoundingClientRect().height > lh * 1.6) wrapped.push(`${td.dataset.l}: ${el.textContent.trim().slice(0, 28)}`);
      }
    }
    return {
      label: table.getAttribute("aria-label"),
      rows: table.querySelectorAll("tbody tr").length,
      wrapOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 0,
      fontSizes: sizesOf(table.querySelector("tbody") ?? table),
      clippedCount: clipped.length,
      clipped: [...new Set(clipped)].slice(0, 6),
      wrappedCount: wrapped.length,
      wrapped: [...new Set(wrapped)].slice(0, 6),
    };
  });
  const loose = [];
  for (const el of document.querySelectorAll("main *, [data-screen] *")) {
    if (el.closest(".exec-cards-wrap, .exec-blk-sr, .exec-flag-sr")) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > doc.clientWidth + 1.5) loose.push(`${el.tagName}.${String(el.className).slice(0, 40)} +${Math.round(r.right - doc.clientWidth)}`);
  }
  // A panel or drawer body whose content is wider than the box it sits in.
  const spill = [];
  for (const el of document.querySelectorAll(".exec-blk-panel, .exec-dock, .exec-dock-body, .exec-ops-panel, .exec-opi-op, .exec-opi-gate")) {
    if (el.scrollWidth > el.clientWidth + 1.5) spill.push(`${String(el.className).slice(0, 40)} +${el.scrollWidth - el.clientWidth}`);
  }
  const region = (selector) => {
    const root = document.querySelector(selector);
    return root ? sizesOf(root) : null;
  };
  const kpis = [...document.querySelectorAll(".exec-blk-kpi")].map((tile) => {
    const box = tile.getBoundingClientRect();
    const stick = [...tile.querySelectorAll(".exec-blk-kpi-value, .exec-blk-kpi-note")].filter((el) => el.getBoundingClientRect().right > box.right + 1.5).length;
    return { label: tile.querySelector(".exec-blk-kpi-label")?.textContent, height: Math.round(box.height), sticks: stick };
  });
  return {
    docOverflow: doc.scrollWidth - doc.clientWidth,
    pastViewport: [...new Set(loose)].slice(0, 8),
    spill: [...new Set(spill)].slice(0, 8),
    tables,
    kpis,
    drawerSizes: region(".exec-dock"),
    incidentSizes: region("[data-page='incident']"),
    panelHeadSizes: (() => {
      const o = {};
      for (const el of document.querySelectorAll(".exec-blk-ph-title")) { const s = px(el); o[s] = (o[s] ?? 0) + 1; }
      return o;
    })(),
  };
}

const browser = await chromium.launch();
const results = [];
try {
  for (const [name, path, ready] of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
      await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
      await page.waitForSelector(ready, { timeout: 25_000 }).catch(() => errors.push(`nothing measurable at ${path}`));
      await page.waitForTimeout(1200);
      const result = await page.evaluate(measure);
      if (shots) await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
      results.push({ route: name, width, ...result, consoleErrors: errors.slice(0, 3) });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
for (const r of results) {
  const tables = r.tables.map((t) => `${t.label}[rows ${t.rows}, wrap +${t.wrapOverflow}, sizes ${JSON.stringify(t.fontSizes)}, clipped ${t.clippedCount}${t.clippedCount ? ` ${JSON.stringify(t.clipped.slice(0, 2))}` : ""}, wrapped ${t.wrappedCount}${t.wrappedCount ? ` ${JSON.stringify(t.wrapped.slice(0, 2))}` : ""}]`).join(" ");
  console.log(`${r.route} @${r.width}: doc +${r.docOverflow}; past viewport ${r.pastViewport.length}${r.pastViewport.length ? ` ${JSON.stringify(r.pastViewport.slice(0, 2))}` : ""}; spill ${r.spill.length}${r.spill.length ? ` ${JSON.stringify(r.spill.slice(0, 3))}` : ""}; kpis ${r.kpis.length} sticking ${r.kpis.filter((k) => k.sticks > 0).length}; ${tables}${r.drawerSizes ? `; drawer ${JSON.stringify(r.drawerSizes)}` : ""}${r.incidentSizes ? `; incident ${JSON.stringify(r.incidentSizes)}; heads ${JSON.stringify(r.panelHeadSizes)}` : ""}${r.consoleErrors.length ? `; console ${JSON.stringify(r.consoleErrors)}` : ""}`);
}
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
