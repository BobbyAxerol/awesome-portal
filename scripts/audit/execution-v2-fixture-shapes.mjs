#!/usr/bin/env node
/**
 * Execution V2 fixture shape audit (package B3, step 1, item 2). Offline and deterministic.
 *
 * Every canonical fixture in packages/contracts/fixtures is a published example. This parses each one, by its `schema_version`, with
 *   (a) the published contract: every openapi component schema whose `schema_version` is that constant (Ajv 2020, the openapi document
 *       is the schema root so `$ref`s resolve; `*.negative.json` must be REJECTED, anything else ACCEPTED);
 *   (b) the frontend reader: every exported `read*` function of every apps/portal/frontend/src/execution/{v2/readers,api} module whose
 *       source names that schema_version (a fixture is accepted when the reader returns a non-null value, rejected on null / ok:false /
 *       throw), plus the strict readers generated into siblings.generated.ts;
 *   (c) the control-api zod response schemas: every exported zod schema of every apps/control-api/src module whose source names that
 *       schema_version (safeParse).
 * and prints, per family, who accepts it and where the three sides disagree. The published contract wins: a disagreement is reported as
 * "reader/zod rejects a contract-valid fixture" (fix the loser), or "contract rejects its own fixture" (fix the fixture).
 *
 * Usage: node scripts/audit/execution-v2-fixture-shapes.mjs [--json] [--all]   (default lists only disagreements and uncovered families)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const reqCA = createRequire(path.join(ROOT, "apps/control-api/package.json"));
const ts = reqCA("typescript");
{
  const M = reqCA("module");
  M._extensions[".ts"] = (mod, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true, jsx: ts.JsxEmit.ReactJSX } });
    mod._compile(out.outputText, filename);
  };
}
const Ajv2020 = reqCA("ajv/dist/2020").default ?? reqCA("ajv/dist/2020");
const addFormats = reqCA("ajv-formats");
const list = (dir, pred) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : list(`${dir}/${e.name}`, pred)) : pred(`${dir}/${e.name}`) ? [`${dir}/${e.name}`] : [])).sort(cmp);

/* fixtures, by schema_version */
const fixtures = [];
for (const f of list("packages/contracts/fixtures", (x) => x.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { continue; }
  const value = j && typeof j === "object" && "lane" in j && "value" in j ? j.value : j;
  const sv = value && typeof value === "object" && !Array.isArray(value) && typeof value.schema_version === "string" ? value.schema_version : null;
  if (sv) fixtures.push({ file: path.basename(f), sv, value, negative: /\.negative\.json$/.test(f) });
}
const families = [...new Set(fixtures.map((f) => f.sv))].sort(cmp);

/* (a) contract schemas by schema_version const */
const contractSchemas = new Map(); // sv -> [{doc, name, validate}]
const ajvFor = () => { const a = new Ajv2020({ strict: false, allErrors: false }); addFormats(a); return a; };
for (const f of list("packages/contracts/openapi", (x) => x.endsWith(".json"))) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const schemas = doc.components?.schemas ?? {};
  const names = Object.entries(schemas).filter(([, s]) => typeof s?.properties?.schema_version?.const === "string").map(([n, s]) => [n, s.properties.schema_version.const]);
  if (names.length === 0) continue;
  const ajv = ajvFor();
  const id = `urn:doc:${path.basename(f)}`;
  try { ajv.addSchema({ ...doc, $id: id }); } catch { continue; }
  for (const [name, sv] of names) {
    let validate; try { validate = ajv.compile({ $ref: `${id}#/components/schemas/${name}` }); } catch { continue; }
    if (!contractSchemas.has(sv)) contractSchemas.set(sv, []);
    contractSchemas.get(sv).push({ doc: path.basename(f), name, validate });
  }
}

/* (b) frontend readers and (c) control-api zod, found by the schema_version literal in their source */
const feFiles = [...list("apps/portal/frontend/src/execution/v2/readers", (x) => /\.ts$/.test(x) && !/\.test\.|testbase|\.fixtures\./.test(x)), ...list("apps/portal/frontend/src/execution/api", (x) => /\.ts$/.test(x) && !/\.test\./.test(x))];
const caFiles = list("apps/control-api/src", (x) => /\.ts$/.test(x) && !/\.d\.ts$/.test(x));
const srcCache = new Map();
const src = (f) => srcCache.get(f) ?? (srcCache.set(f, fs.readFileSync(path.join(ROOT, f), "utf8")), srcCache.get(f));
const mentions = (files, sv) => files.filter((f) => code(f).includes(`"${sv}"`) || code(f).includes(`'${sv}'`) || code(f).includes(`\`${sv}\``));
const mods = new Map();
function load(f) {
  if (!mods.has(f)) { try { mods.set(f, reqCA(path.join(ROOT, f))); } catch (e) { mods.set(f, { __loadError: String(e.message ?? e).split("\n")[0].slice(0, 120) }); } }
  return mods.get(f);
}
const accepts = (r) => r !== null && r !== undefined && !(typeof r === "object" && ("ok" in r) && r.ok === false);
const isZod = (x) => x && typeof x === "object" && typeof x.safeParse === "function" && x._def;
/** A zod export is a response schema for `sv` only when its shape declares `schema_version` as that literal (request, query and patch schemas never do). */
function declaresSchemaVersion(z, sv, depth = 0) {
  if (!z || !z._def || depth > 6) return false;
  const d = z._def;
  const shape = typeof d.shape === "function" ? d.shape() : d.shape;
  if (shape && typeof shape === "object") {
    const f = shape.schema_version?._def;
    return !!f && (f.value === sv || (Array.isArray(f.values) && f.values.includes(sv)));
  }
  const inner = d.schema ?? d.innerType ?? d.type ?? null;
  if (d.options) return [...(d.options instanceof Map ? d.options.values() : d.options)].some((o) => declaresSchemaVersion(o, sv, depth + 1));
  if (d.left) return declaresSchemaVersion(d.left, sv, depth + 1) || declaresSchemaVersion(d.right, sv, depth + 1);
  return inner ? declaresSchemaVersion(inner, sv, depth + 1) : false;
}
/** Source with comments removed, so a doc comment naming a schema does not make a module its reader. */
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function feVerdicts(fx) {
  const out = [];
  for (const f of mentions(feFiles, fx.sv)) {
    const m = load(f);
    if (m.__loadError) { out.push({ file: f, state: "not-loadable", why: m.__loadError }); continue; }
    const fns = Object.entries(m).filter(([n, v]) => typeof v === "function" && /^(read|parse)[A-Z]/.test(n));
    if (fns.length === 0) continue;
    const results = fns.map(([n, fn]) => { try { const r = fn(JSON.parse(JSON.stringify(fx.value))); return [n, accepts(r)]; } catch { return [n, false]; } });
    out.push({ file: f, state: results.some(([, ok]) => ok) ? "accepts" : "rejects", via: results.filter(([, ok]) => ok).map(([n]) => n) });
  }
  const sib = load("apps/portal/frontend/src/execution/v2/readers/siblings.generated.ts");
  for (const [id, spec] of Object.entries(sib.SIBLINGS ?? {})) if (spec.schemaVersion === fx.sv) {
    let ok; try { ok = accepts(spec.read(JSON.parse(JSON.stringify(fx.value)))); } catch { ok = false; }
    out.push({ file: `siblings.generated.ts#${id}`, state: ok ? "accepts" : "rejects", via: ["SIBLINGS." + id] });
  }
  return out;
}
function zodVerdicts(fx) {
  const out = [];
  for (const f of mentions(caFiles, fx.sv)) {
    const m = load(f);
    if (m.__loadError) { out.push({ file: f, state: "not-loadable", why: m.__loadError }); continue; }
    const schemas = Object.entries(m).filter(([, v]) => isZod(v) && declaresSchemaVersion(v, fx.sv));
    if (schemas.length === 0) continue;
    const ok = schemas.filter(([, s]) => s.safeParse(JSON.parse(JSON.stringify(fx.value))).success).map(([n]) => n);
    out.push({ file: f, state: ok.length ? "accepts" : "rejects", via: ok });
  }
  return out;
}

/* run */
const rows = [];
for (const sv of families) {
  const own = fixtures.filter((f) => f.sv === sv);
  const row = { schema_version: sv, valid: own.filter((f) => !f.negative).length, negative: own.filter((f) => f.negative).length, contract: [...new Set((contractSchemas.get(sv) ?? []).map((c) => `${c.doc}#${c.name}`))], problems: [], coverage: {} };
  const fe = new Set(), ca = new Set();
  for (const fx of own) {
    const cs = contractSchemas.get(sv) ?? [];
    if (cs.length) {
      const pass = cs.some((c) => c.validate(JSON.parse(JSON.stringify(fx.value))));
      const why = (() => { const e = cs[0].validate.errors?.[0]; return e ? ` (${e.instancePath || "/"} ${e.message})` : ""; })();
      if (!fx.negative && !pass) row.problems.push(`${fx.file}: the published contract REJECTS its own fixture${why}`);
      if (fx.negative && pass) row.problems.push(`${fx.file}: a negative fixture is ACCEPTED by the contract`);
    }
    const fv = feVerdicts(fx), zv = zodVerdicts(fx);
    for (const v of fv) { fe.add(v.file); if (v.state === "rejects" && !fx.negative && (contractSchemas.get(sv) ?? []).some((c) => c.validate(fx.value))) row.problems.push(`${fx.file}: frontend reader ${v.file} REJECTS a contract-valid fixture`); if (v.state === "accepts" && fx.negative) row.problems.push(`${fx.file}: frontend reader ${v.file} ACCEPTS a negative fixture`); if (v.state === "not-loadable") row.coverage[v.file] = `not loadable (${v.why})`; }
    for (const v of zv) { ca.add(v.file); if (v.state === "rejects" && !fx.negative && (contractSchemas.get(sv) ?? []).some((c) => c.validate(fx.value))) row.problems.push(`${fx.file}: control-api schema ${v.file} REJECTS a contract-valid fixture`); if (v.state === "accepts" && fx.negative) row.problems.push(`${fx.file}: control-api schema ${v.file} ACCEPTS a negative fixture`); if (v.state === "not-loadable") row.coverage[v.file] = `not loadable (${v.why})`; }
  }
  row.frontend_readers = [...fe].sort(cmp); row.control_api_schemas = [...ca].sort(cmp); row.problems = [...new Set(row.problems)].sort(cmp);
  rows.push(row);
}
const summary = {
  fixtures_with_schema_version: fixtures.length, families: families.length,
  families_with_contract_schema: rows.filter((r) => r.contract.length).length,
  families_with_frontend_reader: rows.filter((r) => r.frontend_readers.length).length,
  families_with_control_api_zod: rows.filter((r) => r.control_api_schemas.length).length,
  families_with_problems: rows.filter((r) => r.problems.length).length,
};
if (args.has("--json")) { console.log(JSON.stringify({ summary, rows }, null, 2)); process.exit(0); }
console.log("# Execution V2 fixture shape audit\n\n```json\n" + JSON.stringify(summary, null, 2) + "\n```\n");
console.log("## Disagreements");
for (const r of rows.filter((x) => x.problems.length)) { console.log(`- ${r.schema_version}`); for (const p of r.problems) console.log(`    - ${p}`); }
console.log("\n## Families with a fixture but no contract schema, no frontend reader or no control-api schema");
for (const r of rows) {
  const gaps = [r.contract.length ? null : "no contract schema", r.frontend_readers.length ? null : "no frontend reader", r.control_api_schemas.length ? null : "no control-api zod"].filter(Boolean);
  if (gaps.length && (args.has("--all") || r.valid > 0)) console.log(`- ${r.schema_version} (${r.valid} valid, ${r.negative} negative): ${gaps.join(", ")}`);
}
const notLoadable = rows.flatMap((r) => Object.entries(r.coverage).map(([f, w]) => `${f}: ${w}`));
if (notLoadable.length) { console.log("\n## Modules that could not be loaded outside their test harness"); for (const l of [...new Set(notLoadable)].sort(cmp)) console.log(`- ${l}`); }
