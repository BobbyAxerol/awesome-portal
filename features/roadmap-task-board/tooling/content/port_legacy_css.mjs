#!/usr/bin/env node
/**
 * Phase 2 — port legacy view-panel CSS onto Fund Paper tokens.
 * One-off regenerate: node tooling/content/port_legacy_css.mjs
 * Drops rules that would collide with the new shell (topbar/sidebar/etc)
 * and skips @media print (the new print.css owns print behaviour).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(path.join(ROOT, "legacy", "portal.html"), "utf8");
const st = source.match(/<style>([\s\S]*?)<\/style>/)[1];

const NEED = [
  "panel-shell", "panel-header", "action-btn", "roadmap-card", "week-header",
  "kanban", "task-table", "task-card", "status-banner", "status-dot",
  "report-grid", "evidence-grid", "status-pill", "portal-layout", "portal-rail",
  "portal-stage", "portal-screen", "mermaid-hint", "dependency-card",
  "view-toggle", "board-toolbar", "roadmap-toolbar", "artifact-toolbar",
  "mini-btn", "diagram-card", "eyebrow", "pr-", "phase-", "priority-",
  "workstream-badge", "collapsible", "report-block", "evidence-", "mermaid",
  "legend", "tab-btn", "doc-", "pr-label", "pr-ico", "pr-item", "pr-foot",
  "print-balance", "section",
];

/* shell-owned class names that must never be touched by legacy rules */
const BLACKLIST = [
  "topbar", "sidebar", "sync-badge", "icon-btn", "context-tabs", "toc-rail",
  "navtab", "brand", "workspace", "content", "doc-article", "search-result",
  "mono-label", "modal-backdrop", "modal-panel", "toast", "badge-", "chip",
  "btn-primary", "btn-ghost", "nav-item", "input",
];

const isClean = (selector) => {
  const parts = selector.split(",").map((p) => p.trim());
  return parts.every((p) => !BLACKLIST.some((b) => p.includes(b)));
};

const flatRules = st.match(/[^{}]+\{[^{}]*\}/g) ?? [];
const kept = [];
for (const raw of flatRules) {
  const rule = raw.trim();
  if (rule.startsWith("@") || rule.startsWith("/*")) continue;
  const selector = rule.slice(0, rule.indexOf("{"));
  if (!NEED.some((n) => selector.includes(n))) continue;
  if (!isClean(selector)) continue;
  kept.push(rule);
}

const mediaBlocks = [...st.matchAll(/@media([^{]+)\{([\s\S]*?)\n\}/g)];
const keptMedia = [];
for (const mb of mediaBlocks) {
  if (mb[1].trim() === "print" || mb[1].trim().startsWith("print")) continue;
  const innerRules = mb[2].match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const inner = innerRules.filter(
    (r) => !r.trim().startsWith("@") && NEED.some((n) => r.slice(0, r.indexOf("{")).includes(n)) && isClean(r.slice(0, r.indexOf("{"))),
  );
  if (inner.length) keptMedia.push(`@media${mb[1]}{\n${inner.join("\n")}\n}`);
}

let css = [...kept, ...keptMedia].join("\n");
const MAP = {
  "--bg": "--paper-sunken",
  "--surface": "--paper-raised",
  "--text": "--ink",
  "--muted": "--ink-soft",
  "--border": "--line",
  "--primary": "--accent",
  "--success": "--good",
  "--warning": "--accent-2",
  "--danger": "--bad",
  "--nav": "--paper-sunken",
  "--nav-hover": "--line-soft",
  "--nav-text": "--ink-soft",
  "--top-h": "56px",
  "--sidebar-w": "280px",
  "--right-w": "0px",
};
for (const [k, v] of Object.entries(MAP)) {
  css = css.split(`var(${k})`).join(`var(${v})`);
}

const header = `/* Ported from legacy/portal.html view-panel styles, mapped onto Fund Paper tokens.
 * Regenerate: node tooling/content/port_legacy_css.mjs — raw hex only in tokens.css. */\n`;
writeFileSync(path.join(ROOT, "frontend", "src", "styles", "legacy-views.css"), header + css);
const vars = [...new Set([...css.matchAll(/var\(--([a-z-0-9]+)\)/g)].map((m) => m[1]))];
console.log(`rules: ${kept.length}, media: ${keptMedia.length}, chars: ${css.length}, vars: ${vars.join(", ")}`);