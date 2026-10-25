// Layout probe for Portfolios and Portfolio 360 (chromium only, one browser). Not part of any Playwright project or the vitest run.
//   node scripts/probe-portfolios-layout.mjs http://127.0.0.1:<port> [outfile.json]
// The server is YOUR local vite dev/preview of this worktree with `VITE_EXECUTION_V2_SCREENS` naming `portfolios` and a fixture BFF
// (FIXTURE_REVIEW_PROFILE=populated) behind /api. It never targets the shared preview stack.
// Per route and width it prints: document horizontal overflow, table-wrapper overflow (a scroll region is allowed to overflow),
// clipped cells (a descendant that sticks out of its cell), figures that wrap onto a second line, and the set of computed font
// sizes inside the cells of each table.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const base = argv[0];
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("pass a local http origin, e.g. http://127.0.0.1:48124");
const out = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
const WIDTHS = (opt("widths") ?? "1440,1280,1024,660,390").split(",").map(Number);
// WP-F1 added the Overview and the 360 tabs. `--only name,name` runs a subset; `--widths 1440,1024` a subset of widths.
const ALL_ROUTES = [
  ["overview", "/execution"],
  ["portfolios", "/deployments/portfolios"],
  ["portfolio-360-scale", "/deployments/portfolios/pf_scale_018"],
  ["portfolio-360-suite", "/deployments/portfolios/pf_TEST_ONLY_core"],
  ["portfolio-360-allocations", "/deployments/portfolios/pf_scale_018?tab=allocations"],
  ["portfolio-360-alphas", "/deployments/portfolios/pf_scale_018?tab=alphas"],
  ["portfolio-360-accounts", "/deployments/portfolios/pf_scale_018?tab=accounts"],
  ["portfolio-360-risk", "/deployments/portfolios/pf_scale_018?tab=risk"],
  ["portfolio-360-people", "/deployments/portfolios/pf_scale_018?tab=people"],
];
const onlyNames = opt("only")?.split(",") ?? null;
const ROUTES = onlyNames ? ALL_ROUTES.filter(([name]) => onlyNames.includes(name)) : ALL_ROUTES;

function measure() {
  const px = (el) => getComputedStyle(el).fontSize;
  const doc = document.documentElement;
  const tables = [...document.querySelectorAll("table.exec-cards")].map((table) => {
    const wrap = table.closest(".exec-cards-wrap");
    const sizes = {};
    const numericSizes = {};
    const clipped = [];
    const wrapped = [];
    for (const td of table.querySelectorAll("tbody td")) {
      const cell = td.getBoundingClientRect();
      const numeric = td.getAttribute("data-numeric") === "true";
      const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest(".exec-blk-sr")) continue;
        const size = px(node.parentElement);
        sizes[size] = (sizes[size] ?? 0) + 1;
        if (numeric) numericSizes[size] = (numericSizes[size] ?? 0) + 1;
      }
      for (const el of td.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || el.closest(".exec-blk-sr")) continue;
        if (r.right > cell.right + 1.5 || r.left < cell.left - 1.5) clipped.push(`${td.dataset.l}: ${el.className || el.tagName} ${Math.round(r.right - cell.right)}px`);
      }
      for (const el of td.querySelectorAll(".exec-pf-num, .exec-mgr-num, .exec-pf-score-val")) {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(px(el)) * 1.3;
        if (el.getBoundingClientRect().height > lh * 1.6) wrapped.push(`${td.dataset.l}: ${el.textContent.trim().slice(0, 24)}`);
      }
    }
    return {
      label: table.getAttribute("aria-label"),
      rows: table.querySelectorAll("tbody tr").length,
      wrapOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 0,
      tableWidth: Math.round(table.getBoundingClientRect().width),
      fontSizes: sizes,
      numericFontSizes: numericSizes,
      clipped: [...new Set(clipped)].slice(0, 12),
      clippedCount: clipped.length,
      wrappedFigures: [...new Set(wrapped)].slice(0, 12),
      wrappedCount: wrapped.length,
    };
  });
  const loose = [];
  for (const el of document.querySelectorAll("main *, [data-screen] *")) {
    if (el.closest(".exec-cards-wrap") || el.closest(".exec-blk-sr")) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > doc.clientWidth + 1.5) loose.push(`${el.tagName}.${String(el.className).slice(0, 40)} +${Math.round(r.right - doc.clientWidth)}`);
  }
  const sizesIn = (selector) => {
    const out = {};
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest(".exec-blk-sr")) continue;
        const size = px(node.parentElement);
        out[size] = (out[size] ?? 0) + 1;
      }
    }
    return out;
  };
  const kpis = [...document.querySelectorAll(".exec-pf-kpi")];
  const kpiTiles = kpis.map((tile) => {
    const box = tile.getBoundingClientRect();
    const stick = [...tile.querySelectorAll(".exec-pf-kpi-value *")].filter((el) => el.getBoundingClientRect().right > box.right + 1.5).length;
    return { label: tile.querySelector(".exec-pf-kpi-label")?.textContent, height: Math.round(box.height), figureSticksOut: stick };
  });
  // Scroll regions inside panels (a table wider than its panel scrolls, and fades): a figure behind that fade is clipped in practice.
  const scrollRegions = [...document.querySelectorAll(".exec-cards-wrap, .exec-ov-contrib-wrap")].map((el) => ({ label: el.querySelector("table")?.getAttribute("aria-label") ?? el.className, over: el.scrollWidth - el.clientWidth })).filter((r) => r.over > 1);
  const blocks = {
    scrollRegions,
    kpiValueFontSizes: sizesIn(".exec-pf-kpi-value"),
    capitalFontSizes: sizesIn(".exec-pf-captable td"),
    contributorFontSizes: sizesIn(".exec-ov-contrib tbody td"),
    kpiTiles,
  };
  return {
    blocks,
    docOverflow: doc.scrollWidth - doc.clientWidth,
    pastViewport: [...new Set(loose)].slice(0, 8),
    tables,
    stickyIdentity: [...document.querySelectorAll("table.exec-cards")].map((t) => {
      const cell = t.querySelector("tbody td[data-l='Portfolio']");
      return cell ? getComputedStyle(cell).position : null;
    }),
  };
}

const browser = await chromium.launch();
const results = [];
try {
  for (const [name, path] of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
      await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 60_000 });
      // A route that draws neither a table nor KPI tiles is reported as such instead of stopping the run.
      await page.waitForSelector("table.exec-cards, .exec-pf-kpis, .exec-ov-kpis", { timeout: 20_000 }).catch(() => errors.push(`nothing measurable at ${path}`));
      await page.waitForTimeout(3500);
      const result = await page.evaluate(measure);
      results.push({ route: name, width, ...result, consoleErrors: errors.slice(0, 3) });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
for (const r of results) {
  const tables = r.tables.map((t) => `${t.label}[rows ${t.rows}, wrap +${t.wrapOverflow}, sizes ${JSON.stringify(t.fontSizes)}, numeric ${JSON.stringify(t.numericFontSizes)}, clipped ${t.clippedCount}${t.clippedCount ? ` ${JSON.stringify(t.clipped.slice(0, 3))}` : ""}, wrapped ${t.wrappedCount}]`).join(" ");
  const k = r.blocks ? `; kpi sizes ${JSON.stringify(r.blocks.kpiValueFontSizes)} tiles ${r.blocks.kpiTiles.length} sticking ${r.blocks.kpiTiles.filter((t) => t.figureSticksOut > 0).length} heights ${[...new Set(r.blocks.kpiTiles.map((t) => t.height))].join("/")}; scroll regions ${JSON.stringify(r.blocks.scrollRegions)}; capital ${JSON.stringify(r.blocks.capitalFontSizes)}; contributors ${JSON.stringify(r.blocks.contributorFontSizes)}` : "";
  console.log(`${r.route} @${r.width}: doc +${r.docOverflow}; past viewport ${r.pastViewport.length}; sticky ${JSON.stringify(r.stickyIdentity)}; ${tables}${k}`);
}
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
