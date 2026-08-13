#!/usr/bin/env node
/**
 * Phase 2 — extract raw doc-page fragments + seed data from legacy/portal.html
 * into frontend/src/content/. Each fragment is byte-preserved from the golden
 * source; a content-integrity test re-checks SHA-256 against the manifest.
 *
 * Usage: node tooling/content/extract_content.mjs
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GOLDEN = path.join(ROOT, "legacy", "portal.html");
const MANIFEST = path.join(ROOT, "docs", "contracts", "content-integrity-manifest.json");
const OUT = path.join(ROOT, "frontend", "src", "content");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sectionRanges(source) {
  const starts = [...source.matchAll(/<section\b[^>]*\bdata-page-id=("[^"]+"|'[^']+')[^>]*>/g)];
  const result = [];
  for (const start of starts) {
    const pageId = start[1].slice(1, -1);
    let i = start.index + start[0].length;
    let depth = 1;
    while (depth && i < source.length) {
      const openTag = source.indexOf("<section", i);
      const closeTag = source.indexOf("</section>", i);
      if (closeTag === -1) break;
      if (openTag !== -1 && openTag < closeTag) {
        depth += 1;
        i = openTag + 8;
      } else {
        depth -= 1;
        i = closeTag + 10;
      }
    }
    if (depth === 0) {
      result.push({ pageId, inner: source.slice(start.index + start[0].length, i - 10) });
    }
  }
  return result;
}

const source = await readFile(GOLDEN, "utf8");
const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const pages = sectionRanges(source);

// verify each fragment hash matches the stored manifest BEFORE writing
let ok = true;
const expected = new Map(manifest.doc_pages.map((p) => [p.data_page_id, p]));
for (const page of pages) {
  const exp = expected.get(page.pageId);
  const h = sha256(page.inner);
  if (!exp) {
    console.error(`page ${page.pageId} missing from manifest`);
    ok = false;
  } else if (exp.sha256_markup !== h) {
    console.error(`page ${page.pageId} hash mismatch:\n  stored ${exp.sha256_markup}\n  actual ${h}`);
    ok = false;
  }
}
if (manifest.doc_pages.length !== pages.length) {
  console.error(`page count mismatch: manifest=${manifest.doc_pages.length} extracted=${pages.length}`);
  ok = false;
}
if (!ok) {
  console.error("ABORT: fragments do not match golden baseline");
  process.exit(1);
}

// write TS module with raw fragments (exported as template strings)
await mkdir(path.join(OUT, "pages"), { recursive: true });
const entries = [];
for (const page of pages) {
  const slug = page.pageId;
  const file = path.join(OUT, "pages", `${slug}.ts`);
  const title = expected.get(slug)?.data_title ?? slug;
  const escaped = page.inner
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  const module = `/* Auto-generated from legacy/portal.html — DO NOT EDIT.\n * sha256 ${sha256(page.inner)}\n */\nexport const title = ${JSON.stringify(title)};\nexport const html = \`${escaped}\`;\n`;
  await writeFile(file, module, "utf8");
  entries.push(`  "page:${slug}": { sha256: "${sha256(page.inner)}", title: ${JSON.stringify(title)} },`);
}

// write pages index
const index = `/* Auto-generated page index — DO NOT EDIT. */
export interface DocPageMeta {
  id: string;
  title: string;
  sha256: string;
  html: string;
}
${pages.map((p) => `import { html as _${p.pageId.replace(/[^a-zA-Z0-9]/g, "_")}, title as _t${p.pageId.replace(/[^a-zA-Z0-9]/g, "_")} } from "./${p.pageId}";`).join("\n")}

export const DOC_PAGES: DocPageMeta[] = [
${pages.map((p) => `  { id: ${JSON.stringify(p.pageId)}, title: _t${p.pageId.replace(/[^a-zA-Z0-9]/g, "_")}, sha256: ${JSON.stringify(sha256(p.inner))}, html: _${p.pageId.replace(/[^a-zA-Z0-9]/g, "_")} },`).join("\n")}
];
`;
await writeFile(path.join(OUT, "pages", "index.ts"), index, "utf8");
await writeFile(path.join(OUT, "content-integrity-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

// ---- Phase 2: view panels (raw fragments) ----
const VIEW_IDS = ["view-roadmap", "view-board", "view-reports", "view-evidence", "view-portal"];
function viewInner(id) {
  const open = source.indexOf(`id="${id}"`);
  if (open === -1) throw new Error(`view ${id} not found`);
  const tagStart = source.lastIndexOf("<section", open);
  const tagEnd = source.indexOf(">", tagStart) + 1;
  const close = source.indexOf(`</section>`, tagEnd);
  if (close === -1) throw new Error(`view ${id} unbalanced`);
  return source.slice(tagEnd, close);
}
const views = VIEW_IDS.map((id) => ({ id, inner: viewInner(id) }));

// seed data: BASE_TASKS / ROADMAP_PHASES JSON literals
function extractSeed(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\[.*?\\])\\s*;`, "s");
  const m = source.match(re);
  if (!m) throw new Error(`seed ${name} not found`);
  return { raw: m[1], parsed: JSON.parse(m[1]) };
}
const seedTasks = extractSeed("BASE_TASKS");
const seedPhases = extractSeed("ROADMAP_PHASES");

const viewModule = `/* Auto-generated view panels from legacy/portal.html — DO NOT EDIT. */
export interface ViewPanel {
  id: string;
  sha256: string;
  html: string;
}
export const VIEW_PANELS: ViewPanel[] = [
${views.map((v) => `  { id: ${JSON.stringify(v.id)}, sha256: ${JSON.stringify(sha256(v.inner))}, html: \`${v.inner.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\` },`).join("\n")}
];
`;
await writeFile(path.join(OUT, "views.ts"), viewModule, "utf8");

const seedModule = `/* Auto-generated seed data from legacy/portal.html — DO NOT EDIT. */
export interface SeedTask {
  id: string;
  title: string;
  workstream: string;
  phase: string;
  weeks: string;
  priority: string;
  owner: string;
  status: string;
  [key: string]: unknown;
}
export interface SeedPhase {
  id: string;
  name: string;
  start: number;
  end: number;
  owner: string;
  tone: string;
  outcome: string;
  [key: string]: unknown;
}
export const BASE_TASKS_SEED: SeedTask[] = ${JSON.stringify(seedTasks.parsed, null, 2)};
export const ROADMAP_PHASES_SEED: SeedPhase[] = ${JSON.stringify(seedPhases.parsed, null, 2)};
`;
await writeFile(path.join(OUT, "seed.ts"), seedModule, "utf8");

const viewManifest = {
  generated: new Date().toISOString(),
  source: "legacy/portal.html",
  views: views.map((v) => ({ id: v.id, sha256: sha256(v.inner) })),
  seed: {
    BASE_TASKS: { sha256: sha256(seedTasks.raw), count: seedTasks.parsed.length },
    ROADMAP_PHASES: { sha256: sha256(seedPhases.raw), count: seedPhases.parsed.length },
  },
};
await writeFile(path.join(OUT, "content-integrity-views.json"), JSON.stringify(viewManifest, null, 2), "utf8");

console.log(
  `extracted ${views.length} view panels + ${seedTasks.parsed.length} tasks + ${seedPhases.parsed.length} phases -> frontend/src/content/`,
);
