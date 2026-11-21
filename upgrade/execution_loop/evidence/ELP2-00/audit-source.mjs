// Read-only ELP2-00 census. Emits metadata JSON; never imports application code.
// Run from any cwd: node upgrade/execution_loop/evidence/ELP2-00/audit-source.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(root, "apps/control-api/package.json"));
const ts = require("typescript");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const digest = (p) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const decorators = (node) => ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
const calls = (node) => decorators(node).map((d) => d.expression).filter(ts.isCallExpression);
const named = (call, name) => ts.isIdentifier(call.expression) && call.expression.text === name;
const literal = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
const guards = (node) => calls(node).filter((c) => named(c, "UseGuards")).flatMap((c) => c.arguments.map((a) => a.getText()));
const normalize = (p) => p.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "{}").replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "");
const verbs = new Set(["Get", "Post", "Put", "Patch", "Delete", "All", "Options", "Head"]);
const warnings = [], routes = [];
const sourceRoot = "apps/control-api/src";
const moduleText = read(`${sourceRoot}/app.module.ts`);
const module = ts.createSourceFile("app.module.ts", moduleText, ts.ScriptTarget.Latest, true);
const registered = new Set();
// Includes the DynamicModule returned by AppModule.register(), not just @Module.
const collectControllers = (node) => {
  if (ts.isPropertyAssignment(node) && node.name.getText(module) === "controllers" && ts.isArrayLiteralExpression(node.initializer)) {
    for (const element of node.initializer.elements) registered.add(element.getText(module));
  }
  ts.forEachChild(node, collectControllers);
};
collectControllers(module);
for (const file of walk(sourceRoot).filter((f) => f.endsWith(".controller.ts"))) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  for (const cls of source.statements.filter(ts.isClassDeclaration)) {
    const controller = calls(cls).find((c) => named(c, "Controller"));
    if (!controller) continue;
    const prefix = controller.arguments.length ? literal(controller.arguments[0]) : "";
    if (prefix === null) { warnings.push(`${file}: unresolved controller prefix`); continue; }
    for (const method of cls.members.filter(ts.isMethodDeclaration)) for (const call of calls(method)) {
      if (!ts.isIdentifier(call.expression) || !verbs.has(call.expression.text)) continue;
      const argument = call.arguments[0];
      const suffixes = !argument ? [""] : ts.isArrayLiteralExpression(argument) ? argument.elements.map(literal) : [literal(argument)];
      if (suffixes.some((s) => s === null)) { warnings.push(`${file}: unresolved method path`); continue; }
      for (const suffix of suffixes) routes.push({ method: call.expression.text.toUpperCase(), path: `${prefix}/${suffix}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
        controller: cls.name?.text, handler: method.name.getText(source), file,
        line: source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1,
        guards: [...guards(cls), ...guards(method)], registered: registered.has(cls.name?.text) });
    }
  }
}
const openapiFiles = [...walk("packages/contracts/openapi").filter((f) => f.endsWith(".openapi.json")), "apps/portal/registry/openapi/portal-api.openapi.json"];
const operations = new Map();
for (const file of openapiFiles) {
  const document = JSON.parse(read(file));
  for (const [url, item] of Object.entries(document.paths ?? {})) for (const [verb, operation] of Object.entries(item)) {
    if (!verbs.has(verb[0].toUpperCase() + verb.slice(1))) continue;
    const key = `${verb.toUpperCase()} ${normalize(url)}`;
    operations.set(key, [...operations.get(key) ?? [], { file, operation_id: operation.operationId ?? null }]);
  }
}
const execution = routes.filter((r) => r.path.startsWith("/api/v1/execution"));
for (const route of execution) route.direct_openapi = operations.get(`${route.method} ${normalize(route.path)}`) ?? [];
const registryFile = `${sourceRoot}/execution/eds11r-manager-relation-registry.generated.ts`;
const registryText = read(registryFile);
const registry = JSON.parse(registryText.slice(registryText.indexOf("= {") + 2).replace(/\s+as const;?\s*$/, "").trim());
const executionSpecs = openapiFiles.filter((f) => path.basename(f).startsWith("execution-"));
const assert = (condition, message) => { if (!condition) throw Error(message); };
assert(execution.length > 0, "Execution route census empty");
assert(execution.every((r) => r.registered), "Execution controller missing AppModule registration");
assert(execution.every((r) => r.guards.includes("SessionGuard")), "Execution route has no SessionGuard decorator");
assert(new Set(execution.map((r) => `${r.method} ${r.path}`)).size === execution.length, "Duplicate Execution route declaration");
assert(registry.operations.length === registry.screen_bound_relation_count, "Named-operation count mismatch");
assert(Object.values(registry.classification_counts).reduce((a, b) => a + b, 0) === registry.relation_count, "Relation classification partition mismatch");
assert(registry.non_browser_dispositions.length + registry.operations.length === registry.relation_count, "Unclassified relation");
const controllerCounts = Object.fromEntries([...new Set(execution.map((r) => r.file))].sort().map((file) => [file, execution.filter((r) => r.file === file).length]));
const inputFiles = walk("upgrade/execution_loop").filter((f) => !f.includes("/evidence/") && !/(README|AGENT_WORKING_RULES|PHASE_PACKET_TEMPLATE)/.test(f));
const proofFiles = [...new Set(execution.map((r) => r.file)), registryFile, `${sourceRoot}/app.module.ts`,
  `${sourceRoot}/auth/owner-access.service.ts`, `${sourceRoot}/admin/owner-access.guard.ts`,
  `${sourceRoot}/admin/governance-grants.service.ts`, `${sourceRoot}/manager-lists/contracts.ts`,
  `${sourceRoot}/manager-lists/manager-lists.repository.ts`, `${sourceRoot}/manager-lists/manager-lists.service.ts`,
  `${sourceRoot}/execution/shared-read.repository.ts`, `${sourceRoot}/execution/current-source.proxy.ts`,
  "services/portal-execution-edge-rs/crates/edge-service/src/main.rs",
  "upgrade/execution_loop/evidence/ELP2-00/audit-source.mjs", ...openapiFiles];
console.log(JSON.stringify({ schema_version: "portal.elp2-00.source-census.v1", observed_at_utc: new Date().toISOString(),
  source: { root, branch: git("branch", "--show-current"), commit: git("rev-parse", "HEAD") }, warnings,
  counts: { execution_controllers: Object.keys(controllerCounts).length, execution_route_patterns: execution.length,
    execution_get: execution.filter((r) => r.method === "GET").length, execution_post: execution.filter((r) => r.method === "POST").length,
    execution_direct_openapi_matches: execution.filter((r) => r.direct_openapi.length > 0).length,
    execution_without_direct_openapi: execution.filter((r) => r.direct_openapi.length === 0).length,
    admin_routes: routes.filter((r) => r.path.startsWith("/api/admin")).length,
    auth_routes: routes.filter((r) => r.path.startsWith("/api/auth")).length,
    execution_openapi_files: executionSpecs.length, scanned_openapi_files: openapiFiles.length,
    registered_execution_patterns: execution.filter((r) => r.registered).length },
  controller_counts: controllerCounts,
  relation_registry: { relation_count: registry.relation_count, named_operations: registry.operations.length,
    classifications: registry.classification_counts, input_digests: registry.input_digests },
  input_sha256: Object.fromEntries(inputFiles.map((p) => [p, digest(p)])),
  code_sha256: Object.fromEntries(proofFiles.map((p) => [p, digest(p)])), routes: execution,
  adjacent_routes: routes.filter((r) => r.path.startsWith("/api/admin") || r.path.startsWith("/api/auth") || r.path.startsWith("/api/v1/governance") || r.method === "ALL")
}, null, 2));
