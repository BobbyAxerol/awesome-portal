#!/usr/bin/env node
/**
 * Execution V2 route coverage audit (package B3, step 1). Mechanical, offline, deterministic: same tree in, same bytes out.
 *
 * What it joins, per HTTP route:
 *   - control-api  : every `@Controller` + `@Get/@Post/...` in apps/control-api/src/**\/*.controller.ts (same regex as
 *                    scripts/research-loop-v11/p01-baseline.mjs, cross-checked against route-inventory.live.json), and whether
 *                    the controller class is in AppModule's `controllers: [...]` (yes), only behind a dependency key
 *                    (dark:<key>), or declared in a file but absent from the array (declared-not-mounted).
 *   - profiles     : what the guards do under EXECUTION_READ_PROFILE=retained_review_v1 (facade/session.guard.ts +
 *                    execution/retained-read-profile.ts, the real functions are loaded) and native_manager_review_v1
 *                    (execution/native-review-profile.ts).
 *   - frontend     : every string/template literal in apps/portal/frontend/src (non-test) that is a call path, with file:line.
 *   - doubles      : fixture BFF routeTable.ts rows (`real:` column) and the routes the e2e doubles dispatch on.
 *   - contracts    : packages/contracts/openapi/*.openapi.json paths -> file + operationId (schema owner).
 *   - tests        : control-api specs that name the path (or the controller class).
 *
 * Usage:  node scripts/audit/execution-v2-route-coverage.mjs [--json] [--table] [--scope=execution|all]
 *   default: findings + class counts; --table adds the full route table; --json prints everything as JSON.
 * Needs node_modules reachable from apps/control-api (typescript, zod) like every control-api tool. No network, no docker.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const SCOPE = ([...args].find((a) => a.startsWith("--scope=")) ?? "--scope=execution").slice(8);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------------------------------------------------------------- TypeScript on demand (ts-node style, CommonJS) */
const reqCA = createRequire(path.join(ROOT, "apps/control-api/package.json"));
const ts = reqCA("typescript");
export function installTsRequire() {
  const M = reqCA("module");
  if (M._extensions[".ts"]) return;
  M._extensions[".ts"] = (mod, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, experimentalDecorators: true, jsx: ts.JsxEmit.ReactJSX },
    });
    mod._compile(out.outputText, filename);
  };
}
installTsRequire();
const loadTs = (rel) => reqCA(path.join(ROOT, rel));

/* ---------------------------------------------------------------- path templates */
/** Normal form: `{}` for an id parameter, `{*}` for a dynamic segment (any segment). */
const normTemplate = (p) =>
  "/" + p.split("?")[0].split("/").filter((s) => s !== "").map((s) => (/^:|^\{[^*]*\}$/.test(s) ? "{}" : s)).join("/");
const segs = (p) => p.split("/").filter((s) => s !== "");
/** `route` is a served template (`{}` only); `probe` may carry `{}` (id) or `{*}` (anything) and concrete values. */
function matches(route, probe) {
  const a = segs(route), b = segs(probe);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (b[i] === "{*}") continue;
    if (a[i] === "{}") { if (b[i].includes("{*}")) continue; continue; }
    if (a[i] !== b[i]) return false;
  }
  return true;
}
/** Documentation patterns (`{surface}`) cover every literal route of that shape: a `{}` on either side is a wildcard. */
function looseMatches(a, b) {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((seg, i) => seg === y[i] || seg === "{}" || y[i] === "{}" || seg === "{*}" || y[i] === "{*}");
}
const paramCount = (p) => segs(p).filter((s) => s === "{}").length;
/** Most specific served template for a probe: the fewest parameters, then the lexically first. */
function bestRoutes(templates, probe) {
  const hit = templates.filter((t) => matches(t, probe));
  if (hit.length === 0) return [];
  if (segs(probe).some((s) => s === "{*}")) return hit; // a dynamic tail may be any of them
  const min = Math.min(...hit.map(paramCount));
  return hit.filter((t) => paramCount(t) === min);
}

/* ---------------------------------------------------------------- control-api routes */
function walk(dir, pred, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((x, y) => cmp(x.name, y.name))) {
    if (["node_modules", ".git", "dist", "build"].includes(e.name) || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, pred, out);
    else if (pred(rel)) out.push(rel);
  }
  return out;
}
const joinPath = (base, leaf) => ("/" + [base, leaf].filter((x) => x && x !== "/").join("/")).replace(/\/+/g, "/").replace(/\/$/, "") || "/";

/** The Python portal backend (apps/portal/backend): same parse as p01-baseline.mjs `parsePythonRoutes`. */
function pythonRoutes() {
  const out = [];
  for (const file of walk("apps/portal/backend/src/portal_api/api", (f) => f.endsWith(".py"))) {
    const src = read(file);
    const prefix = src.match(/APIRouter\(\s*prefix\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
    const re = /@(router|app)\.(get|post|put|patch|delete|head|options)\(\s*["']([^"']*)["'][^)]*\)/g;
    for (const m of src.matchAll(re)) out.push({ method: m[2].toUpperCase(), path: joinPath(prefix, m[3]), file, cls: "python", handler: "", line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

function controllerRoutes() {
  const files = walk("apps/control-api/src", (f) => f.endsWith(".controller.ts"));
  const routes = [], controllers = [];
  for (const file of files) {
    const src = read(file);
    const base = src.match(/@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/)?.[1] ?? "";
    const cls = /@Controller\([^)]*\)[\s\S]{0,200}?export\s+class\s+([A-Za-z0-9_]+)/.exec(src)?.[1] ?? null;
    controllers.push({ file, cls, base });
    const re = /@(Get|Post|Put|Patch|Delete|Head|Options)\(\s*(?:["'`]([^"'`]*)["'`])?[^)]*\)[\s\S]{0,300}?\n\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split("\n").length;
      routes.push({ method: m[1].toUpperCase(), path: joinPath(base, m[2] ?? ""), file, cls, handler: m[3], line });
    }
  }
  return { routes, controllers };
}

/** controllers[] of AppModule.forRoot: plain entries are mounted, `...(dependencies.K === "..." ? [X] : [])` are dark behind K. */
function mountStatus(controllers) {
  const src = read("apps/control-api/src/app.module.ts");
  const start = src.indexOf("controllers: [");
  let depth = 0, end = start;
  for (let i = src.indexOf("[", start); i < src.length; i++) {
    if (src[i] === "[") depth++;
    if (src[i] === "]" && --depth === 0) { end = i; break; }
  }
  const body = src.slice(start, end);
  const status = new Map();
  for (const m of body.matchAll(/\.\.\.\(dependencies\.([A-Za-z0-9_]+)\s*===\s*"[^"]*"\s*\?\s*\[([^\]]*)\]/g))
    for (const c of m[2].split(",").map((x) => x.trim()).filter(Boolean)) status.set(c, `dark:${m[1]}`);
  const plain = body.replace(/\.\.\.\([^)]*\?[^)]*\)/g, "");
  for (const m of plain.matchAll(/\b([A-Z][A-Za-z0-9]+Controller)\b/g)) if (!status.has(m[1])) status.set(m[1], "yes");
  return Object.fromEntries(controllers.map((c) => [c.cls, status.get(c.cls) ?? "declared-not-mounted"]));
}

/* ---------------------------------------------------------------- profiles */
const HEX32 = "0123456789abcdef0123456789abcdef";
function sample(p, alt) {
  return p.replace(/:([A-Za-z0-9_]+)/g, (_, n) => (alt ? (/ecm|command|capital|recall|registration|instance/i.test(p) ? `ecm_${HEX32}` : "x1") : "x1"));
}
function profiles(routes) {
  const retained = loadTs("apps/control-api/src/execution/retained-read-profile.ts");
  const native = loadTs("apps/control-api/src/execution/native-review-profile.ts");
  const WS = "ws_audit";
  const out = new Map();
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    if (!r.path.startsWith("/api/v1/execution/")) { out.set(key, { retained: "n/a (guard is scoped to /api/v1/execution)", native: "n/a" }); continue; }
    const forms = [sample(r.path, false), sample(r.path, true)];
    let ret;
    if (r.method !== "GET" && r.method !== "HEAD") ret = "refused 403 UDB_RETAINED_REVIEW_MUTATION_DISABLED";
    else ret = forms.some((p) => retained.coreExecutionRead(p)) ? "reads, core-owned (no workspace pin)" : "reads, pinned to the configured workspace";
    const allow = (a, b, c) => forms.some((p) => native.nativeResearchReadAllowed({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS }, r.method, p, {}, a, b, c));
    const nat = allow(false, false, false) ? "allowed" : allow(true, true, true) ? "provider-gated" : "refused 403 NOT_COMMISSIONED";
    out.set(key, { retained: ret, native: nat });
  }
  return out;
}

/* ---------------------------------------------------------------- contracts (schema owners) */
function openapiOps() {
  const ops = [];
  for (const f of walk("packages/contracts/openapi", (x) => x.endsWith(".json"))) {
    let j; try { j = JSON.parse(read(f)); } catch { continue; }
    for (const [p, item] of Object.entries(j.paths ?? {}))
      for (const [m, o] of Object.entries(item)) {
        if (!["get", "post", "put", "patch", "delete"].includes(m)) continue;
        const ok = Object.entries(o.responses ?? {}).find(([c]) => /^2/.test(c))?.[1];
        const ref = ok?.content?.["application/json"]?.schema?.$ref ?? null;
        ops.push({ method: m.toUpperCase(), path: normTemplate(p), file: path.basename(f), op: o.operationId ?? null, schema: ref ? ref.split("/").pop() : null });
      }
  }
  return ops;
}

/* ---------------------------------------------------------------- tests that name a route */
function specIndex() {
  const files = walk("apps/control-api/test", (f) => f.endsWith(".spec.ts"));
  return files.map((f) => {
    const src = read(f);
    const lits = new Set();
    for (const m of src.matchAll(/["'`](\/(?:api|internal)\/[^"'`\s?)]*)/g)) lits.add(normProbe(m[1]));
    return { file: path.basename(f), lits: [...lits], src };
  });
}
function normProbe(s) {
  return "/" + segs(s.replace(/\$\{[^}]*\}/g, "{*}")).map((x) => (x.includes("{*}") ? "{*}" : x)).join("/");
}

/* ---------------------------------------------------------------- frontend call sites (AST) */
/** Files that build in-app links or hold sample data; their paths are router paths. */
const UI_FILE = /(backTo|idLinks|links|presentation|Fixtures|fixtureData|previewControllers|previewRegistry|routes)\.(ts|tsx)$/;
const FE_ROOT = "apps/portal/frontend/src";
const TEST_RE = /\.(test|spec|fixtures|smoke|testbase)\.|testApi\.|\/fixtureBff\/|\/lab\/|\.generated\.test/;
function inScope(rel) {
  if (SCOPE === "all") return true;
  return /^apps\/portal\/frontend\/src\/(execution|auth|portal|app|lib)\//.test(rel);
}
function literalOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      const e = span.expression.getText();
      const idLike = /^(encodeURIComponent|enc)\(/.test(e);
      s += (idLike ? "{}" : "{*}") + span.literal.text;
    }
    return s;
  }
  return null;
}
function methodOf(node) {
  for (let p = node.parent, d = 0; p && d < 8; p = p.parent, d++) {
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText();
      if (/(^|\.)(post|Post)\w*$|\bpost$/.test(callee) || /unknownAwareCapture|captureWrite/.test(callee)) return "POST";
      if (/^fetch$/.test(callee)) {
        const o = p.arguments[1];
        const m = o && ts.isObjectLiteralExpression(o) ? o.properties.map((x) => x.getText()).find((t) => /^method\s*:/.test(t)) : null;
        const v = m && /["'](GET|POST|PUT|PATCH|DELETE)["']/.exec(m)?.[1];
        return v ?? "GET";
      }
      if (/(^|\.)(get|readGet|readGetAt|rawGet|readVersioned|derivation|readSameOrigin)$|fetch\w*$/.test(callee)) return "GET";
    }
  }
  return "ANY";
}
function inJsxAttr(node) {
  for (let p = node.parent; p; p = p.parent) if (ts.isJsxAttribute(p)) return true;
  return false;
}
function frontendCalls(knownFirstSegs) {
  const files = walk(FE_ROOT, (f) => /\.(ts|tsx)$/.test(f) && !TEST_RE.test(f) && inScope(f) && !UI_FILE.test(f));
  const calls = [];
  for (const file of files) {
    const src = read(file);
    // Relative paths (no /api prefix) are calls only where a port builds requests; elsewhere they are router links.
    const portFile = /\/execution\/(api|v2\/readers)\/|selfNavigationPort|rosterReader/.test(file) || (/\bfetch\(/.test(src) && !UI_FILE.test(file));
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        const lit = literalOf(node);
        if (lit && lit.startsWith("/") && !/\s/.test(lit.split("?")[0])) {
          const first = segs(lit.split("?")[0].replace(/\{\*\}/g, "{*}"))[0] ?? "";
          const abs = lit.startsWith("/api/") || lit.startsWith("/__fixture/");
          const rel = !abs && portFile && !lit.endsWith("/") && lit !== "/" && knownFirstSegs.has(first.replace(/\{\*\}$/, ""));
          if ((abs || rel) && !inJsxAttr(node) && !ts.isImportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            let prefix = "";
            for (let q = node.parent, d = 0; q && d < 6; q = q.parent, d++) if (ts.isCallExpression(q) && /(^|\.)derivation$/.test(q.expression.getText())) { prefix = "/derivations"; break; }
            calls.push({ raw: lit, abs, method: methodOf(node), file, line, prefix });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return calls;
}
/** Strip a query, a glued trailing dynamic tail (`/alphas{*}` = a query string) and resolve to a probe. */
function probeOf(call) {
  let p = call.raw.split("?")[0];
  p = p.replace(/\{\*\}$/, (m) => (/[A-Za-z0-9_-]\{\*\}$/.test(call.raw.split("?")[0]) ? "" : m));
  if (!call.abs) p = "/api/v1/execution" + (call.prefix ?? "") + p;
  return normProbe(p);
}
/** Pure UI hrefs share first segments with API paths; these are the router's, not calls. */
const UI_PATH = /^\/(deployments\/(paper|sandbox|live|alphas|portfolios|accounts|blotter|compare)(\/|$)|governance\/(approvals(\/new)?|exit-reviews|waivers)(\/|$|\?))/;

/* ---------------------------------------------------------------- fixture BFF + doubles */
function routeTableRows() {
  const mod = loadTs("apps/portal/frontend/src/fixtureBff/routeTable.ts");
  return mod.ROUTES.map((r) => ({ method: r.method, pattern: r.pattern.replace(/ \[.*\]$/, ""), url: r.url, source: r.source, real: r.real, note: r.note ?? "", status: r.status }));
}
/** Paths the e2e doubles dispatch on: `path === "/x"` and `/^\/x\/[^/]+$/.test(path)`. */
function doubleDispatch() {
  const out = new Map();
  for (const file of walk("apps/portal/frontend/e2e", (f) => /\/bff[A-Za-z]*\.ts$/.test(f) && !/spec/.test(f))) {
    const src = read(file);
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const add = (p, line) => { const k = normProbe(p.startsWith("/api/") ? p : "/api/v1/execution" + p); if (!out.has(k)) out.set(k, []); out.get(k).push(`${file.replace("apps/portal/frontend/", "")}:${line}`); };
    const visit = (n) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
        const [l, r] = [n.left, n.right];
        const id = ts.isIdentifier(l) ? l.text : ts.isIdentifier(r) ? r.text : "";
        const lit = ts.isStringLiteral(r) ? r.text : ts.isStringLiteral(l) ? l.text : null;
        if (/^(path|pathname)$/.test(id) && lit?.startsWith("/") && lit.length > 1) add(lit, sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
      }
      if (ts.isRegularExpressionLiteral(n) && /^\/\^\\\/[a-z]/.test(n.text)) {
        const body = n.text.slice(2, n.text.lastIndexOf("/")).replace(/\$$/, "");
        const p = body.replace(/\\\//g, "/").replace(/\(\[\^\/\]\+\)|\[\^\/\]\+|\[\^\/\]\*/g, "{}").replace(/\(\?:[^)]*\)/g, "{*}");
        if (/^\/[a-z0-9{}*\-/_]+$/.test(p) && !p.endsWith("/") && p !== "/api/v1/execution") add(p, sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/* ---------------------------------------------------------------- run */
const { routes: tsRoutes, controllers } = controllerRoutes();
const pyRoutes = pythonRoutes();
const caRoutes = [...tsRoutes, ...pyRoutes];
const mounts = { ...mountStatus(controllers), python: "yes (portal-backend, python)" };
const ledger = JSON.parse(read("upgrade/research_loop/evidence/P01/route-inventory.live.json"));
const ledgerKeys = new Set(ledger.routes.map((r) => `${r.method} ${r.path}`));
const ownKeys = new Set(caRoutes.map((r) => `${r.method} ${r.path}`));
const ledgerDiff = { onlyLedger: [...ledgerKeys].filter((k) => !ownKeys.has(k)).sort(), onlyParsed: [...ownKeys].filter((k) => !ledgerKeys.has(k)).sort() };
const prof = profiles(tsRoutes);
const oas = openapiOps();
const specs = specIndex();
const rt = routeTableRows();
const dispatch = doubleDispatch();

const caByKey = new Map();
for (const r of caRoutes) {
  const key = `${r.method} ${normTemplate(r.path)}`;
  const mount = mounts[r.cls] ?? "declared-not-mounted";
  const e = caByKey.get(key) ?? { method: r.method, path: normTemplate(r.path), rawPath: r.path, owners: [], mount, profile: prof.get(`${r.method} ${r.path}`) };
  e.owners.push(`${r.file.replace("apps/control-api/src/", "")}:${r.line}`);
  caByKey.set(key, e);
}
const caTemplates = [...new Set([...caByKey.values()].map((e) => e.path))];
const execFirstSegs = new Set();
for (const t of [...caTemplates, ...oas.map((o) => o.path), ...rt.map((r) => normTemplate(r.pattern))]) {
  const m = /^\/api\/v1\/execution\/([^/]+)/.exec(t) ?? /^\/([^/]+)/.exec(t.startsWith("/api") || t.startsWith("/__") ? "" : t);
  if (m) execFirstSegs.add(m[1]);
}
const rawCalls = frontendCalls(execFirstSegs);
const calls = rawCalls.filter((c) => /\/execution\/(api|v2\/readers)\//.test(c.file) || !UI_PATH.test(c.raw)).map((c) => ({ ...c, probe: probeOf(c) })).filter((c) => !["/api/v1/execution", "/derivations", "/api/v1/execution/derivations"].includes(c.probe) && c.probe !== "/api");

// attach frontend callers to served routes
const callersByRoute = new Map();
const unmatched = [], methodMismatch = [];
for (const c of calls) {
  let hit = bestRoutes(caTemplates, c.probe);
  const withMethod = hit.filter((t) => c.method === "ANY" || caByKey.has(`${c.method} ${t}`));
  if (hit.length && withMethod.length === 0) { methodMismatch.push(c); continue; }
  hit = withMethod;
  if (hit.length === 0) { unmatched.push(c); continue; }
  for (const t of hit) {
    const k = c.method === "ANY" ? [...caByKey.keys()].filter((x) => x.endsWith(` ${t}`)) : [`${c.method} ${t}`];
    for (const key of k) { if (!callersByRoute.has(key)) callersByRoute.set(key, []); callersByRoute.get(key).push(c); }
  }
}
/** A leading `~` marks a call whose path has a dynamic segment (it may be any of the routes it matches). */
const fmtCallers = (cs) => [...new Set(cs.map((c) => `${c.probe.includes("{*}") ? "~" : ""}${c.file.replace("apps/portal/frontend/src/", "")}:${c.line}`))].sort();

// routeTable <-> served
const rtRows = rt.map((r) => {
  const probe = normTemplate(r.pattern);
  const served = caTemplates.filter((t) => looseMatches(t, probe) && caByKey.has(`${r.method} ${t}`));
  return { ...r, probe, served };
});
const rtByServed = new Map();
for (const r of rtRows) for (const t of r.served) { const k = `${r.method} ${t}`; if (!rtByServed.has(k)) rtByServed.set(k, []); rtByServed.get(k).push(r); }

// the table
const table = [];
for (const e of [...caByKey.values()].sort((a, b) => cmp(a.path, b.path) || cmp(a.method, b.method))) {
  const key = `${e.method} ${e.path}`;
  const owner = oas.filter((o) => o.method === e.method && looseMatches(e.path, o.path)).map((o) => `${o.file}#${o.op ?? o.schema ?? ""}`);
  const tests = specs.filter((s) => s.lits.some((l) => l.startsWith("/api") && matches(e.path, l) && bestRoutes(caTemplates, l).includes(e.path))).map((s) => s.file);
  // weak evidence: a spec that spells the route's last two literal segments (a relative path or a helper-built URL); marked with `~`
  const lit = segs(e.path).filter((x) => x !== "{}");
  const needle = "/" + lit.slice(-2).join("/");
  const weak = needle.length >= 8 ? specs.filter((sp) => !tests.includes(sp.file) && new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\  const cls = mounts[") + "(?=[\"'`?/])").test(sp.src)).map((sp) => `~${sp.file}`) : [];
  const cls = mounts[caRoutes.find((r) => `${r.method} ${normTemplate(r.path)}` === key)?.cls];
  const dbl = rtByServed.get(key) ?? [];
  table.push({
    route: key, mounted: e.mount, retained: e.profile?.retained ?? "", native: e.profile?.native ?? "",
    callers: fmtCallers(callersByRoute.get(key) ?? []), contract: [...new Set(owner)].sort(), tests: [...new Set([...tests, ...weak])].sort(),
    double: [...new Set(dbl.map((d) => d.real))].sort(), controller: e.owners[0], cls,
  });
}

// (1) frontend calls with no served route
const finding1 = [];
for (const c of unmatched) {
  const rtHit = rtRows.filter((r) => looseMatches(normTemplate(r.pattern), c.probe));
  finding1.push({ probe: c.probe, method: c.method, caller: `${c.file.replace("apps/portal/frontend/src/", "")}:${c.line}`, routeTable: rtHit.map((r) => `${r.method} ${r.pattern} real=${r.real}`) });
}
finding1.sort((a, b) => cmp(a.probe, b.probe) || cmp(a.caller, b.caller));
// served only by control-api behind dark / not mounted, but frontend or doubles call it
const darkCalled = table.filter((t) => !t.mounted.startsWith("yes") && t.callers.length > 0);
// (3) doubles with no real counterpart
const rtNoReal = rtRows.filter((r) => r.served.length === 0 && !/^\/__fixture|\/api\/auth\/|\/api\/v1\/portal\//.test(r.pattern));
const rtClaimsRealButAbsent = rtNoReal.filter((r) => /^control-api/.test(r.real));
const rtNone = rtNoReal.filter((r) => !/^control-api/.test(r.real));
const rtDarkClaimed = rtRows.filter((r) => r.served.length > 0 && r.served.every((t) => !caByKey.get(`${r.method} ${t}`).mount.startsWith("yes")) && /^control-api$/.test(r.real));
const rtPatterns = rtRows.map((r) => r.probe);
const undocumentedDispatch = [...dispatch.entries()].filter(([k]) => !rtPatterns.some((p) => looseMatches(p, k)) ).map(([k, v]) => ({ probe: k, at: v.slice(0, 2), served: bestRoutes(caTemplates, k).length > 0 }));
undocumentedDispatch.sort((a, b) => cmp(a.probe, b.probe));
const noneYetButServed = rtRows.filter((r) => r.real === "none yet" && r.served.length > 0);
const noteLess = rtRows.filter((r) => r.real === "none yet" && r.note === "");

const counts = {
  control_api_routes: caRoutes.length, ledger_routes: ledger.route_count, ledger_equal: ledgerDiff.onlyLedger.length === 0 && ledgerDiff.onlyParsed.length === 0,
  by_mount: Object.fromEntries(["yes (portal", "yes", "dark", "declared-not-mounted"].map((m) => [m === "yes" ? "yes (control-api)" : m === "yes (portal" ? "yes (portal-backend python)" : m, table.filter((t) => (m === "yes" ? t.mounted === "yes" : t.mounted.startsWith(m))).length])),
  control_api_ts_routes: tsRoutes.length, portal_backend_python_routes: pyRoutes.length,
  frontend_call_sites: calls.length, frontend_unmatched_sites: unmatched.length, frontend_method_mismatch_sites: methodMismatch.length,
  routes_called_by_frontend: table.filter((t) => t.callers.length).length,
  routes_with_spec: table.filter((t) => t.tests.some((x) => !x.startsWith("~"))).length, routes_with_weak_spec_evidence_only: table.filter((t) => t.tests.length && t.tests.every((x) => x.startsWith("~"))).length, routes_with_contract: table.filter((t) => t.contract.length).length,
  routeTable_rows: rt.length, routeTable_unserved: rtNoReal.length,
};
const result = { scope: SCOPE, counts, ledgerDiff, finding1_frontend_unserved: finding1, finding1b_method_mismatch: methodMismatch.map((c) => ({ probe: c.probe, method: c.method, caller: `${c.file}:${c.line}` })),
  dark_or_unmounted_but_called: darkCalled.map((t) => ({ route: t.route, mounted: t.mounted, callers: t.callers })),
  finding3_doubles_without_real: { routeTable_none_yet: rtNone.map((r) => ({ route: `${r.method} ${r.pattern}`, real: r.real, note: r.note })), routeTable_claims_control_api_but_unserved: rtClaimsRealButAbsent.map((r) => ({ route: `${r.method} ${r.pattern}`, real: r.real })), routeTable_claims_control_api_but_dark: rtDarkClaimed.map((r) => `${r.method} ${r.pattern}`), double_dispatch_not_in_routeTable: undocumentedDispatch, none_yet_without_note: noteLess.map((r) => r.pattern), none_yet_but_a_controller_serves_it: noneYetButServed.map((r) => `${r.method} ${r.pattern}`) },
  table };

if (args.has("--json")) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); process.exit(0); }
const out = [];
out.push(`# Execution V2 route coverage audit (scope=${SCOPE})`, "", "## Counts", "```json", JSON.stringify(counts, null, 2), "```", "");
if (!counts.ledger_equal) out.push("WARNING: parsed routes differ from route-inventory.live.json", JSON.stringify(ledgerDiff), "");
out.push("## (1) Frontend call sites with no control-api route");
for (const f of finding1) out.push(`- ${f.method} ${f.probe}  <- ${f.caller}${f.routeTable.length ? `  [routeTable: ${f.routeTable.join("; ")}]` : ""}`);
out.push("", "## (1b) Path served, method differs");
for (const c of methodMismatch) out.push(`- ${c.method} ${c.probe} <- ${c.file}:${c.line}`);
out.push("", "## Called by the frontend but dark / not mounted");
for (const d of result.dark_or_unmounted_but_called) out.push(`- ${d.route} [${d.mounted}] <- ${d.callers.join(", ")}`);
out.push("", "## (3) Doubles without a real counterpart");
for (const r of rtNone) out.push(`- routeTable none/other: ${r.method} ${r.pattern} real=${r.real} note=${r.note ? "yes" : "NONE"}`);
for (const r of rtClaimsRealButAbsent) out.push(`- routeTable claims ${r.real} but no controller serves: ${r.method} ${r.pattern}`);
for (const r of rtDarkClaimed) out.push(`- routeTable says real=control-api but the controller is dark/unmounted: ${r.method} ${r.pattern}`);
for (const r of noneYetButServed) out.push(`- routeTable says real="none yet" but a controller serves it (stale): ${r.method} ${r.pattern}`);
for (const d of undocumentedDispatch) out.push(`- double dispatches ${d.probe} (${d.at.join(", ")}) not in routeTable; control-api serves it: ${d.served}`);
if (args.has("--table")) {
  out.push("", "## Route table", "", "| route | mounted | retained_review_v1 | native_manager_review_v1 | frontend callers | contract | control-api specs | double (real:) |", "|---|---|---|---|---|---|---|---|");
  for (const t of table) out.push(`| ${t.route} | ${t.mounted} | ${t.retained} | ${t.native} | ${t.callers.slice(0, 3).join("<br>") || "-"} | ${t.contract.slice(0, 2).join("<br>") || "-"} | ${t.tests.slice(0, 3).join("<br>") || "-"}${t.tests.length > 3 ? ` (+${t.tests.length - 3})` : ""} | ${t.double.join(", ") || "-"} |`);
}
process.stdout.write(out.join("\n") + "\n");
