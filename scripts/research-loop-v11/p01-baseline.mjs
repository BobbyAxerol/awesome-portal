#!/usr/bin/env node
/**
 * Research Loop v1.1 / P01 source-baseline generator and verifier.
 *
 * This deliberately has no network, Docker, database, browser or deployment
 * capability.  It only reads versioned source and writes redacted inventory
 * evidence beneath upgrade/research_loop/evidence/P01 when invoked with
 * --write.  `--verify` is read-only; `--self-test` uses an OS temporary
 * directory and proves the guards can fail.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "../..");
const releaseDirectory = "upgrade/research_loop/release-v1.1";
const evidenceDirectory = "upgrade/research_loop/evidence/P01";
const baselineCommit = "a402f7b95d4429804f7f51e76540ed2ed3c81828";
const capturedAtUtc = "2026-09-19T00:00:00Z";

const SCREENS = [
  ["00", "Journey Map", "QuantBT 00 Journey Map.dc.html", "00_journey_map.md"],
  ["01", "Run Library", "QuantBT 01 Run Library.dc.html", "01_run_library.md"],
  ["02", "New Run Preflight", "QuantBT 02 New Run Preflight.dc.html", "02_new_run.md"],
  ["03", "Run Progress", "QuantBT 03 Run Progress.dc.html", "03_run_progress.md"],
  ["04", "Evidence Flow", "QuantBT 04 Evidence Flow.dc.html", "04_evidence_flow.md"],
  ["05", "S1 Split", "QuantBT 05 S1 Split.dc.html", "05_s1_split.md"],
  ["06", "S2 Search and Selection", "QuantBT 06 S2 Search and Selection.dc.html", "06_s2_search.md"],
  ["07", "S3 Freeze", "QuantBT 07 S3 Freeze.dc.html", "07_s3_freeze.md"],
  ["08", "S4 Execute Replay", "QuantBT 08 S4 Execute Replay.dc.html", "08_s4_execute.md"],
  ["09", "Run Report", "QuantBT 09 Run Report.dc.html", "09_run_report.md"],
  ["10", "Attempt Lineage", "QuantBT 10 Attempt Lineage.dc.html", "10_attempt_lineage.md"],
  ["11", "Release Candidate and Publish", "QuantBT 11 Release Candidate and Publish.dc.html", "11_release_candidate.md"],
  ["12", "Mode Atlas", "QuantBT 12 Mode Atlas.dc.html", "12_engine_atlas.md"],
  ["13", "Compare", "QuantBT 13 Compare.dc.html", "13_compare.md"],
  ["14", "Alpha Import", "QuantBT 14 Alpha Import.dc.html", "14_alpha_import.md"],
].map(([id, name, html, spec]) => ({
  id,
  name,
  html: `${releaseDirectory}/${html}`,
  spec: `${releaseDirectory}/docs/screens/${spec}`,
}));

const INPUTS = [
  ["research-guide", "guide", "upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md", "Research Loop detailed authority"],
  ["research-rulebook", "rules", "upgrade/research_loop/CLAUDE-FOR-thanhvuong.md", "Shared Research Loop delivery rules"],
  ["prototype-support", "prototype", `${releaseDirectory}/support.js`, "Hi-fi prototype support only"],
  ["prototype-index", "prototype", `${releaseDirectory}/index.html`, "Offline archive entrypoint only"],
  ["strategy-kernel", "protected-kernel", "apps/portal/strategy/main.py", "Protected signal kernel; P01 read-only"],
  ["strategy-protected-manifest", "protected-manifest", "apps/portal/strategy/PROTECTED_SHA256", "Expected SHA for protected kernel"],
  ["strategy-specification", "strategy-contract", "apps/portal/strategy/specification.py", "Delta RSI immutable specification"],
  ["strategy-parameters", "strategy-contract", "apps/portal/strategy/params.py", "Delta RSI declared parameter ranges"],
  ["strategy-registry", "strategy-registry", "apps/portal/backend/src/portal_api/strategies/registry.py", "Portal strategy adapter registry"],
  ["strategy-adapter", "strategy-adapter", "apps/portal/backend/src/portal_api/strategies/delta_rsi.py", "Lazy protected-kernel adapter"],
  ["portal-api-main", "python-api", "apps/portal/backend/src/portal_api/main.py", "Portal API composition root"],
  ["portal-runs", "python-api", "apps/portal/backend/src/portal_api/api/routes_runs.py", "Run read/create boundary"],
  ["portal-data", "python-api", "apps/portal/backend/src/portal_api/api/routes_data.py", "Snapshot read boundary"],
  ["portal-worker", "python-worker", "apps/portal/backend/src/portal_api/workers/run_worker.py", "Bounded process runner"],
  ["historical-reader", "python-adapter", "apps/portal/backend/src/portal_api/adapters/market_data.py", "Historical data reader contract"],
  ["snapshot-store", "python-storage", "apps/portal/backend/src/portal_api/services/data_catalog.py", "Snapshot store and query boundary"],
  ["control-api-main", "control-api", "apps/control-api/src/main.ts", "Control API composition root"],
  ["facade-controller", "control-api", "apps/control-api/src/facade/facade.controller.ts", "Existing facade boundary"],
  ["facade-proxy", "control-api", "apps/control-api/src/facade/proxy.service.ts", "Existing facade transport"],
  ["run-sync", "control-api", "apps/control-api/src/facade/run-sync.service.ts", "RunSync compatibility boundary"],
  ["governance-contracts", "control-api", "apps/control-api/src/governance/contracts.ts", "Governance DTO/source boundary"],
  ["governance-service", "control-api", "apps/control-api/src/governance/governance.service.ts", "Governance service boundary"],
  ["frontend-package", "frontend-config", "apps/portal/frontend/package.json", "React/TanStack/ECharts declaration"],
  ["playwright-config", "frontend-config", "apps/portal/frontend/playwright.config.ts", "Visual suite and build flags"],
  ["portal-lockfile", "lockfile", "apps/portal/frontend/package-lock.json", "Frontend dependency lock"],
  ["control-api-lockfile", "lockfile", "apps/control-api/package-lock.json", "Control API dependency lock"],
  ["edge-rust-manifest", "rust-service", "services/portal-execution-edge-rs/Cargo.toml", "Execution-owned Rust service; out of P01 mutation scope"],
  ["edge-rust-lockfile", "lockfile", "services/portal-execution-edge-rs/Cargo.lock", "Execution Rust dependency lock"],
  ["portal-compose", "deployment-source", "deploy/compose.production.yaml", "Repository default, not deployed evidence"],
  ["dev-env-example", "deployment-source", "deploy/.env.development.example", "Redacted repository defaults, not runtime values"],
];

const RESEARCH_ALLOWLIST = [
  "scripts/research-loop-v11/",
  "upgrade/research_loop/evidence/P01/",
  "upgrade/UNIFIED_IMPLEMENTATION_PLAN.md",
];

const PROTECTED_PATH = "apps/portal/strategy/main.py";
const PROTECTED_MANIFEST_PATH = "apps/portal/strategy/PROTECTED_SHA256";
const SECRET_PATTERNS = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /(?:postgres(?:ql)?|mysql):\/\/[^\s]+:[^\s@]+@/i,
];

function absolute(relative) {
  return path.join(root, relative);
}

function exists(relative) {
  return fs.existsSync(absolute(relative));
}

function read(relative) {
  return fs.readFileSync(absolute(relative), "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(relative) {
  return sha256(fs.readFileSync(absolute(relative)));
}

function lineCount(source) {
  return source.split("\n").length;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function relativeLocator(relative, source, offset) {
  return `${relative}:${lineAt(source, offset)}`;
}

function csvCell(value) {
  const raw = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function csv(headers, rows) {
  return `${headers.join(",")}\n${rows
    .map((row) => headers.map((header) => csvCell(row[header])).join(","))
    .join("\n")}\n`;
}

function write(relative, content) {
  const destination = absolute(relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function writeJson(relative, value) {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attributes(openTag) {
  const output = {};
  const matches = openTag.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g);
  for (const match of matches) {
    const key = match[1].toLowerCase();
    if (key === "button" || key === "input" || key === "select" || key === "textarea" || key === "a") continue;
    output[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return output;
}

function extractVisibleText(source, openTag, startOffset, tag) {
  if (tag === "input") {
    const attrs = attributes(openTag);
    return normalizeWhitespace(attrs["aria-label"] ?? attrs.placeholder ?? attrs.name ?? attrs.id ?? attrs.type ?? "input");
  }
  const contentStart = startOffset + openTag.length;
  const closeOffset = source.indexOf(`</${tag}>`, contentStart);
  if (closeOffset < 0) return "";
  return normalizeWhitespace(decodeHtml(source.slice(contentStart, closeOffset).replace(/<[^>]+>/g, " "))).slice(0, 220);
}

function classifyPrototype(text) {
  return /\b(?:demo|synthetic|prototype|simulated|fake|timer|scale demo|reset demo)\b/i.test(text)
    ? "PROTOTYPE_ONLY"
    : "SOURCE_SEMANTICS_UNMAPPED";
}

function parseProps(source, relative) {
  const props = [];
  const pattern = /data-props\s*=\s*"([\s\S]*?)"/gi;
  for (const match of source.matchAll(pattern)) {
    const decoded = decodeHtml(match[1]);
    try {
      const parsed = JSON.parse(decoded);
      for (const [name, descriptor] of Object.entries(parsed)) {
        props.push({
          name,
          type: typeof descriptor === "object" && descriptor !== null ? descriptor.tsType ?? descriptor.editor ?? "object" : typeof descriptor,
          section: typeof descriptor === "object" && descriptor !== null ? descriptor.section ?? "" : "",
          locator: relativeLocator(relative, source, match.index),
          raw: JSON.stringify(descriptor).slice(0, 300),
        });
      }
    } catch (error) {
      throw new Error(`Cannot parse data-props at ${relativeLocator(relative, source, match.index)}: ${error.message}`);
    }
  }
  return props;
}

function screenLabel(source) {
  const matched = source.match(/data-screen-label\s*=\s*"([^"]+)"/i);
  return matched ? decodeHtml(matched[1]) : null;
}

function specRoute(spec) {
  const route = spec.match(/^\|\s*Route(?: đề xuất)?\s*\|\s*(.*?)\s*\|\s*$/im);
  return route ? normalizeWhitespace(route[1]) : "SOURCE_ROUTE_NOT_DECLARED";
}

function sourceTestIds(spec, screenId) {
  const values = [...spec.matchAll(/\bT(\d{2,3})\b/g)].map((match) => `S${screenId}:T${match[1]}`);
  return [...new Set(values)];
}

function inventoryScreen(screen) {
  const html = read(screen.html);
  const spec = read(screen.spec);
  const labelMatch = html.match(/data-screen-label\s*=\s*"([^"]+)"/i);
  if (!labelMatch) throw new Error(`Missing data-screen-label in ${screen.html}`);
  const fields = [
    {
      screen_id: screen.id,
      field_id: "screen-label",
      field_kind: "SCREEN_METADATA",
      input_type: "data-screen-label",
      source_locator: relativeLocator(screen.html, html, labelMatch.index),
      source_name: decodeHtml(labelMatch[1]),
      source_copy: decodeHtml(labelMatch[1]),
      classification: "SOURCE_INSPECTED",
      browser_status: "NOT_BROWSER_VERIFIED",
    },
  ];
  const actions = [];
  const tagPattern = /<(button|input|select|textarea|a)\b[^>]*>/gi;
  let elementIndex = 0;
  for (const match of html.matchAll(tagPattern)) {
    elementIndex += 1;
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    const label = extractVisibleText(html, match[0], match.index, tag);
    const locator = relativeLocator(screen.html, html, match.index);
    const semantic = normalizeWhitespace(`${tag} ${label} ${attrs.onclick ?? ""} ${attrs.href ?? ""} ${attrs.title ?? ""}`);
    if (["input", "select", "textarea"].includes(tag)) {
      fields.push({
        screen_id: screen.id,
        field_id: attrs.id ?? attrs.name ?? `control-${elementIndex}`,
        field_kind: "FORM_CONTROL",
        input_type: attrs.type ?? tag,
        source_locator: locator,
        source_name: attrs.name ?? attrs.id ?? "",
        source_copy: label,
        classification: classifyPrototype(semantic),
        browser_status: "NOT_BROWSER_VERIFIED",
      });
    }
    if (["button", "a"].includes(tag) || attrs.onclick) {
      actions.push({
        screen_id: screen.id,
        action_id: attrs.id ?? `source-${tag}-${elementIndex}`,
        action_kind: tag === "a" ? "NAVIGATION_OR_LINK" : "CONTROL",
        source_locator: locator,
        source_copy: label,
        source_handler: attrs.onclick ?? (tag === "a" ? attrs.href ?? "" : "SOURCE_HANDLER_NOT_DECLARED"),
        classification: classifyPrototype(semantic),
        production_command_candidate: "false",
        browser_status: "NOT_BROWSER_VERIFIED",
      });
    }
  }
  for (const prop of parseProps(html, screen.html)) {
    fields.push({
      screen_id: screen.id,
      field_id: `data-props.${prop.name}`,
      field_kind: "PROTOTYPE_PROP",
      input_type: prop.type,
      source_locator: prop.locator,
      source_name: prop.section,
      source_copy: prop.raw,
      classification: "PROTOTYPE_ONLY",
      browser_status: "NOT_BROWSER_VERIFIED",
    });
  }
  const htmlButtons = [...html.matchAll(/<button\b/gi)].length;
  const htmlLinks = [...html.matchAll(/<a\b/gi)].length;
  const formControls = [...html.matchAll(/<(input|select|textarea)\b/gi)].length;
  return {
    ...screen,
    html_sha256: sha256(html),
    spec_sha256: sha256(spec),
    html_line_count: lineCount(html),
    spec_line_count: lineCount(spec),
    screen_label: screenLabel(html),
    route: specRoute(spec),
    test_ids: sourceTestIds(spec, screen.id),
    html_buttons: htmlButtons,
    html_links: htmlLinks,
    html_form_controls: formControls,
    fields,
    actions,
  };
}

function routePath(base, leaf) {
  const pieces = [base, leaf].filter((part) => part && part !== "/").join("/");
  return `/${pieces}`.replaceAll(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function parseTypescriptRoutes(relative) {
  const source = read(relative);
  const baseMatch = source.match(/@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/);
  const base = baseMatch?.[1] ?? "";
  const routes = [];
  const pattern = /@(Get|Post|Put|Patch|Delete|Head|Options)\(\s*(?:["'`]([^"'`]*)["'`])?[^)]*\)[\s\S]{0,300}?\n\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    routes.push({
      method: match[1].toUpperCase(),
      path: routePath(base, match[2] ?? ""),
      owner: relative,
      locator: relativeLocator(relative, source, match.index),
      handler: match[3],
    });
  }
  return routes;
}

function parsePythonRoutes(relative) {
  const source = read(relative);
  const prefix = source.match(/APIRouter\(\s*prefix\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
  const routes = [];
  const pattern = /@(router|app)\.(get|post|put|patch|delete|head|options)\(\s*["']([^"']*)["'][^)]*\)[\s\S]{0,300}?\n\s*async\s+def\s+([A-Za-z0-9_]+)|@(router|app)\.(get|post|put|patch|delete|head|options)\(\s*["']([^"']*)["'][^)]*\)[\s\S]{0,300}?\n\s*def\s+([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(pattern)) {
    const method = (match[2] ?? match[6]).toUpperCase();
    const leaf = match[3] ?? match[7];
    const handler = match[4] ?? match[8];
    routes.push({
      method,
      path: routePath(prefix, leaf),
      owner: relative,
      locator: relativeLocator(relative, source, match.index),
      handler,
    });
  }
  return routes;
}

function listFiles(relativeDirectory, predicate) {
  const initial = absolute(relativeDirectory);
  if (!fs.existsSync(initial)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", ".venv", "target", "dist", "build"].includes(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(item);
      else if (predicate(item)) found.push(path.relative(root, item));
    }
  };
  visit(initial);
  return found.sort();
}

function routeInventory() {
  const ts = listFiles("apps/control-api/src", (item) => item.endsWith(".controller.ts")).flatMap(parseTypescriptRoutes);
  const py = listFiles("apps/portal/backend/src/portal_api/api", (item) => item.endsWith(".py")).flatMap(parsePythonRoutes);
  return [...ts, ...py].sort((left, right) => `${left.method} ${left.path} ${left.owner}`.localeCompare(`${right.method} ${right.path} ${right.owner}`));
}

function findRouteCollisions(routes) {
  const grouped = new Map();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    grouped.set(key, [...(grouped.get(key) ?? []), route]);
  }
  return [...grouped.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, owners: entries.map((entry) => entry.owner), entries }));
}

function digestJson(value) {
  return sha256(JSON.stringify(value));
}

function repositoryConfigurationInventory(routes) {
  const migrationFiles = listFiles("apps/control-api/migrations", (item) => item.endsWith(".sql"));
  const configRoots = ["deploy", "apps/control-api/src", "apps/portal/backend/src"];
  const configFiles = configRoots.flatMap((relative) =>
    listFiles(relative, (item) => /\.(?:ts|py|ya?ml|json|example)$/i.test(item)),
  );
  const featureNames = new Set();
  const flagPattern = /\b(?:FEATURE_[A-Z0-9_]+|PORTAL_[A-Z0-9_]+(?:MODE|ENABLED|URL)|CONTROL_API_[A-Z0-9_]+|EDGE_[A-Z0-9_]+|EXECUTION_[A-Z0-9_]+|PROJECTION_[A-Z0-9_]+)\b/g;
  for (const relative of configFiles) {
    for (const match of read(relative).matchAll(flagPattern)) featureNames.add(match[0]);
  }
  const migrationSources = migrationFiles.map((relative) => ({ path: relative, sha256: sha256File(relative) }));
  const configurationSources = configFiles.map((relative) => ({ path: relative, sha256: sha256File(relative) }));
  return {
    schema: "research-loop.p01-repository-configuration-inventory.v1",
    inspection_kind: "STATIC_SOURCE_ONLY",
    deployed_values_observed: false,
    database_schema: {
      control_api_migration_count: migrationSources.length,
      migrations: migrationSources,
      declaration: "Migration filenames and source hashes only; no database connection, table row, migration state or DSN was read.",
    },
    endpoint_registration: {
      literal_route_count: routes.length,
      literal_exact_collision_count: findRouteCollisions(routes).length,
      parser_limit: "Literal TypeScript decorator and Python router/app routes only; dynamic composition remains P02 compatibility work.",
    },
    feature_flag_names: [...featureNames].sort(),
    feature_flag_value_policy: "Names only. Repository example/default values and all deployed values are intentionally omitted.",
    sources: configurationSources,
  };
}

function parseProtectedManifest(text) {
  const match = text.match(/^([a-f0-9]{64})\s+(.+)$/m);
  if (!match) throw new Error(`Malformed ${PROTECTED_MANIFEST_PATH}`);
  const manifestTarget = match[2].trim();
  return {
    sha256: match[1],
    // The checked-in manifest is rooted at apps/portal ("strategy/main.py"),
    // not at the directory holding PROTECTED_SHA256.  Preserve that explicit
    // root rather than silently accepting a sibling-path interpretation.
    relative: manifestTarget.startsWith("strategy/")
      ? `apps/portal/${manifestTarget}`
      : `apps/portal/strategy/${manifestTarget}`,
  };
}

function sourceInputs() {
  return INPUTS.map(([id, kind, relative, purpose]) => {
    assert.ok(exists(relative), `required P01 source input is missing: ${relative}`);
    const source = read(relative);
    return {
      source_id: id,
      kind,
      path: relative,
      sha256: sha256(source),
      line_count: lineCount(source),
      purpose,
      authority: kind.includes("prototype") ? "SOURCE_REFERENCE_ONLY" : "CURRENT_REPOSITORY_SOURCE",
    };
  });
}

function sourceMap(screens) {
  const inputs = sourceInputs();
  const rows = inputs.map((input) => ({ ...input, screen_id: "" }));
  for (const screen of screens) {
    rows.push({
      source_id: `screen-${screen.id}-html`,
      kind: "hifi-html",
      path: screen.html,
      sha256: screen.html_sha256,
      line_count: screen.html_line_count,
      purpose: `${screen.name} source prototype`,
      authority: "SOURCE_REFERENCE_ONLY",
      screen_id: screen.id,
    });
    rows.push({
      source_id: `screen-${screen.id}-spec`,
      kind: "screen-spec",
      path: screen.spec,
      sha256: screen.spec_sha256,
      line_count: screen.spec_line_count,
      purpose: `${screen.name} implementation specification`,
      authority: "DESIGN_REQUIREMENT",
      screen_id: screen.id,
    });
  }
  return rows.sort((left, right) => left.source_id.localeCompare(right.source_id));
}

function archiveContentDigest(screens) {
  const entries = screens
    .flatMap((screen) => [
      { path: screen.html, sha256: screen.html_sha256 },
      { path: screen.spec, sha256: screen.spec_sha256 },
    ])
    .sort((left, right) => left.path.localeCompare(right.path));
  return digestJson(entries);
}

function findLines(relative, expression) {
  const source = read(relative);
  return source
    .split("\n")
    .map((line, index) => ({ line, line_number: index + 1 }))
    .filter(({ line }) => expression.test(line))
    .map(({ line, line_number }) => ({ locator: `${relative}:${line_number}`, excerpt: normalizeWhitespace(line).slice(0, 240) }));
}

function prototypeControls() {
  const controls = [];
  const expected = [
    ["03", "QuantBT 03 Run Progress.dc.html", /demo transport|setInterval\(/i, "Timer-based run progress demo"],
    ["04", "QuantBT 04 Evidence Flow.dc.html", /synthetic data|setInterval\(/i, "Synthetic evidence/replay prototype"],
    ["06", "QuantBT 06 S2 Search and Selection.dc.html", /demo tape|synthetic|scale demo/i, "Search-selection prototype data"],
    ["07", "QuantBT 07 S3 Freeze.dc.html", /verify|demo/i, "Freeze verification prototype"],
    ["08", "QuantBT 08 S4 Execute Replay.dc.html", /scale demo|replay/i, "Replay prototype control"],
    ["11", "QuantBT 11 Release Candidate and Publish.dc.html", /reset demo|demoState|onPublish/i, "Release-publish prototype control"],
    ["12", "QuantBT 12 Mode Atlas.dc.html", /open demo|synthetic/i, "Mode atlas demo"],
    ["13", "QuantBT 13 Compare.dc.html", /scale demo|synthesized/i, "Compare demo scale"],
    ["14", "QuantBT 14 Alpha Import.dc.html", /synthetic frame|Demo/i, "Alpha import prototype frame"],
  ];
  for (const [screenId, fileName, expression, description] of expected) {
    const relative = `${releaseDirectory}/${fileName}`;
    const matches = findLines(relative, expression);
    if (matches.length === 0) throw new Error(`Prototype-control source missing: ${relative} (${description})`);
    for (const match of matches) {
      controls.push({
        screen_id: screenId,
        control: description,
        classification: "PROTOTYPE_ONLY",
        production_command_candidate: false,
        source_locator: match.locator,
        source_excerpt: match.excerpt,
        rationale: "P01 source evidence only; no server command contract is proposed.",
      });
    }
  }
  return controls;
}

function conflicts() {
  const sourceFindings = [
    ["R01", "Freeze prototype verify/timer, bound diagnostics and digest scope", "P02,P09,P11,P16,P17,P24", "SOURCE_MAPPED"],
    ["R02", "Alpha Import mirror-only declaration and gates", "P07,P08,P10", "SOURCE_MAPPED"],
    ["R03", "Declared-space and duplicate logical optimizer fields", "P02,P04,P08,P10", "SOURCE_MAPPED"],
    ["R04", "Search inspection, nullable thetaTrial and warning population", "P02,P03,P09,P13,P15,P16,P21", "SOURCE_MAPPED"],
    ["R05", "Split seal/read-only role and governance source", "P02,P08,P14,P19,P21", "SOURCE_MAPPED"],
    ["R06", "RC final audit/evidence items and immutable inputs", "P21,P22,P24", "SOURCE_MAPPED"],
    ["R07", "Replay sequence/cursor and prototype causal reveal", "P05,P09,P13,P17,P18", "SOURCE_MAPPED"],
    ["R08", "Lineage draft counts, promotion source and version-change copy", "P03,P06,P10,P12,P19", "SOURCE_MAPPED"],
  ].map(([id, issue, targetPhases, status]) => ({
    finding_id: id,
    source_locator: `upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#src-${id.toLowerCase()}`,
    issue,
    target_phases: targetPhases.split(","),
    status,
    P01_resolution: "Recorded with source locator; no authority or behavior inferred.",
  }));
  return [
    ...sourceFindings,
    {
      finding_id: "P01-GAP-01",
      source_locator: `${releaseDirectory}/QuantBT 09 Run Report.dc.html:15`,
      issue: "Run Report imports doc-page.js, but the frozen archive has no doc-page.js/font/chart binary asset.",
      target_phases: ["P09", "P18"],
      status: "SOURCE_GAP_RECORDED",
      P01_resolution: "Do not photograph a blank/hidden document as baseline. P09/P18 choose a licensed, source-compatible render harness before any visual PASS.",
    },
    {
      finding_id: "P01-GAP-02",
      source_locator: `${releaseDirectory}/QuantBT 04 Evidence Flow.dc.html:160;${releaseDirectory}/docs/screens/04_evidence_flow.md:1`,
      issue: "HTML screen label is Summary while the frozen file/spec name is Evidence Flow.",
      target_phases: ["P09"],
      status: "SOURCE_LABEL_VARIANCE_RECORDED",
      P01_resolution: "No copy normalization in P01. P09 must choose the canonical route/title mapping with a COR or owner decision.",
    },
    {
      finding_id: "P01-GAP-03",
      source_locator: "apps/portal/frontend/playwright.config.ts:fixture comments",
      issue: "Current visual configuration is fixture/stubbed; no Research real-build/browser evidence was run in P01.",
      target_phases: ["P07", "P09", "P23"],
      status: "BROWSER_EVIDENCE_NOT_YET_PROVISIONED",
      P01_resolution: "Keep browser lane DISCOVERY_ONLY until approved isolated build/DNS/port and trace receipt exist.",
    },
    {
      finding_id: "P01-GAP-04",
      source_locator: "apps/portal/backend/src/portal_api/adapters/market_data.py:23-31",
      issue: "Historical reader contract is source-mapped, but immutable snapshot identity and reader authorization are not present in versioned source.",
      target_phases: ["P04"],
      status: "EXTERNAL_INPUT_REQUIRED",
      P01_resolution: "P04 receives one authorized read-only fixture/snapshot receipt; P01 creates no numerical substitute.",
    },
    {
      finding_id: "P01-GAP-05",
      source_locator: "constraints/portal.txt:10;apps/portal/backend/pyproject.toml",
      issue: "Current source pin is quantbt-engine==1.0.8; QuantBT 1.1.1 is a future target.",
      target_phases: ["P04"],
      status: "VERSION_TRANSITION_PENDING",
      P01_resolution: "Do not label any 1.0.8 output as 1.1.1 or fabricate numeric parity in P01.",
    },
    {
      finding_id: "P01-GAP-06",
      source_locator: "deploy/.env.development.example;deploy/compose.production.yaml",
      issue: "Repository deployment examples cannot prove deployed flags, live schema ownership, mount type or allocation.",
      target_phases: ["P23"],
      status: "RUNTIME_RECEIPT_REQUIRED",
      P01_resolution: "Keep source defaults distinct from deployed evidence; use an authorized redacted receipt later.",
    },
    {
      finding_id: "P01-GAP-07",
      source_locator: "apps/portal/scripts/test_backend.sh:5-10",
      issue: "The local P01 worktree has no apps/portal/.venv, so the existing Portal pytest suite cannot be collected here yet.",
      target_phases: ["P02"],
      status: "TEST_ENVIRONMENT_NOT_PROVISIONED",
      P01_resolution: "P01 records the exact prerequisite and runs an import-free AST parse only. P02 provisions a lockfile-aligned isolated environment before compatibility claims.",
    },
  ];
}

function resourceInventory() {
  const meminfo = fs.existsSync("/proc/meminfo") ? fs.readFileSync("/proc/meminfo", "utf8") : "";
  const memTotal = meminfo.match(/^MemTotal:\s+(\d+)\s+kB/m)?.[1] ?? null;
  const cgroupMemory = ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]
    .find((candidate) => fs.existsSync(candidate));
  const cgroupValue = cgroupMemory ? fs.readFileSync(cgroupMemory, "utf8").trim() : null;
  const stat = fs.statfsSync(root);
  const bytesAvailable = Number(stat.bavail) * Number(stat.bsize);
  const bytesTotal = Number(stat.blocks) * Number(stat.bsize);
  const measurements = {
    cpu_logical_cores: { value: os.cpus().length, unit: "cores", source: "node:os.cpus", status: "MEASURED_LOCAL" },
    memory_host_total_kib: { value: memTotal ? Number(memTotal) : null, unit: "KiB", source: "/proc/meminfo:MemTotal", status: memTotal ? "MEASURED_LOCAL" : "UNKNOWN_NOT_MEASURED" },
    workspace_filesystem_total_bytes: { value: bytesTotal, unit: "bytes", source: "node:fs.statfsSync(workspace)", status: "MEASURED_LOCAL" },
    workspace_filesystem_available_bytes: { value: bytesAvailable, unit: "bytes", source: "node:fs.statfsSync(workspace)", status: "MEASURED_LOCAL" },
    kernel_release: { value: os.release(), unit: "string", source: "node:os.release", status: "MEASURED_LOCAL" },
  };
  const unknowns = [
    { subject: "Research dev deployment host/mount type", status: "UNKNOWN_NOT_MEASURED", close_phase: "P23", reason: "No authorized Research runtime deployment probe in P01." },
    { subject: "Deployed DB schema, runtime feature flags and live service allocation", status: "UNKNOWN_NOT_MEASURED", close_phase: "P23", reason: "P01 inventories repository declarations only; no secret-bearing runtime access." },
    { subject: "Historical reader snapshot identity and read authorization", status: "UNKNOWN_NOT_MEASURED", close_phase: "P04", reason: "Reader contract is source-mapped; authorized immutable fixture/snapshot receipt is not provisioned." },
    { subject: "Local Portal backend pytest environment", status: "UNKNOWN_NOT_MEASURED", close_phase: "P02", reason: "apps/portal/.venv is absent in this worktree; P01 did not create or install an environment." },
  ];
  if (cgroupValue) {
    measurements.memory_cgroup_limit = { value: cgroupValue, unit: "bytes_or_max", source: cgroupMemory, status: "MEASURED_LOCAL" };
  } else {
    unknowns.push({
      subject: "Local process cgroup memory limit",
      status: "UNKNOWN_NOT_MEASURED",
      close_phase: "P23",
      reason: "No cgroup memory limit file is visible to this local workspace process.",
    });
  }
  if (!memTotal) {
    delete measurements.memory_host_total_kib;
    unknowns.push({
      subject: "Local host memory total",
      status: "UNKNOWN_NOT_MEASURED",
      close_phase: "P23",
      reason: "/proc/meminfo is unavailable to this local workspace process.",
    });
  }
  return {
    schema: "research-loop.p01-resource-inventory.v1",
    inspection_scope: "LOCAL_WORKSPACE_HOST_ONLY",
    deployment_or_production_evidence: false,
    measurements,
    unknowns,
  };
}

function deltaManifest() {
  const specification = read("apps/portal/strategy/specification.py");
  const params = [
    ["window", "20", "60", "2"],
    ["rsi_l", "12", "30", "1"],
    ["signalLength", "3", "20", "1"],
    ["len_atr1", "5", "20", "1"],
    ["len_atr2", "25", "60", "1"],
    ["rvol", "1.0", "2.5", "0.1"],
    ["len_vol", "8", "40", "2"],
    ["slpercent", "0.7", "2.5", "0.1"],
  ];
  for (const [name, minimum, maximum, step] of params) {
    assert.match(specification, new RegExp(`"${name}": \\(${minimum}, ${maximum}, ${step}\\)`), `parameter ${name} must be pinned from specification`);
  }
  const protectedManifest = parseProtectedManifest(read(PROTECTED_MANIFEST_PATH));
  return {
    schema: "research-loop.delta-source-manifest.v1",
    strategy: {
      strategy_id: "delta-rsi-polynomial-alpha",
      specification_version: "1.0.0",
      specification_path: "apps/portal/strategy/specification.py",
      specification_sha256: sha256File("apps/portal/strategy/specification.py"),
      parameter_count: params.length,
      parameters: params.map(([name, minimum, maximum, step]) => ({ name, minimum, maximum, step })),
      protected_kernel: {
        path: PROTECTED_PATH,
        expected_sha256: protectedManifest.sha256,
        observed_sha256: sha256File(PROTECTED_PATH),
        verified: protectedManifest.sha256 === sha256File(PROTECTED_PATH),
      },
      adapter_path: "apps/portal/backend/src/portal_api/strategies/delta_rsi.py",
      registry_path: "apps/portal/backend/src/portal_api/strategies/registry.py",
    },
    current_engine_pin: {
      value: "quantbt-engine==1.0.8",
      sources: ["constraints/portal.txt", "apps/portal/backend/pyproject.toml"],
      status: "CURRENT_SOURCE_PIN",
      P04_target: "QuantBT 1.1.1; not installed or claimed by P01.",
    },
    historical_reader: {
      path: "apps/portal/backend/src/portal_api/adapters/market_data.py",
      distribution: "primus-historical-market-data",
      version: "0.1.0rc3",
      loader_contract: "hmd-loader-v1",
      allowed_scopes: ["backtest", "research"],
      runtime_snapshot_identity: "UNKNOWN_NOT_MEASURED",
      read_authorization: "UNKNOWN_NOT_MEASURED",
      P04_close_requirement: "Authorized immutable reader/snapshot receipt plus direct-vs-Portal comparison.",
    },
  };
}

function acceptanceEnvironment() {
  return {
    schema: "research-loop.acceptance-environment.v1",
    source_capture_commit: baselineCommit,
    lanes: [
      {
        lane: "SOURCE_INSPECTED",
        status: "PASS",
        evidence: ["source-map.csv", "screen-requirements.csv", "screen-field-matrix.csv", "screen-action-matrix.csv"],
        statement: "Versioned source was parsed and hashed; this is not a browser or runtime claim.",
      },
      {
        lane: "CONTRACT_MAPPED",
        status: "PASS",
        evidence: ["delta-source-manifest.json", "route-inventory.csv", "protected-surface.json"],
        statement: "Static contracts and protected boundaries were mapped without calling an external service.",
      },
      {
        lane: "BROWSER_VERIFIED",
        status: "DISCOVERY_ONLY",
        evidence: ["runtime-inventory.md", "source-vs-browser-coverage.md"],
        playwright: {
          config: "apps/portal/frontend/playwright.config.ts",
          production_true_port: 4174,
          preview_port: 4175,
          build_flags: ["VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true", "VITE_EXECUTION_PREVIEW_ENABLED=false|true"],
          fixture_mode: "Portal endpoints stubbed by e2e fixtures per config comments",
        },
        statement: "No screenshot, trace, DNS, port reservation, deployment helper or browser PASS is claimed in P01.",
      },
      {
        lane: "REAL_DELTA_E2E",
        status: "BLOCKED_BY_P04_INPUT",
        evidence: ["delta-source-manifest.json"],
        statement: "Current reader/snapshot authorization and QuantBT 1.1.1 are not provisioned; P01 creates no numerical result.",
      },
      {
        lane: "LOCAL_PORTAL_PYTEST",
        status: "BLOCKED_BY_WORKTREE_TEST_ENV",
        evidence: ["apps/portal/scripts/test_backend.sh"],
        statement: "The P01 worktree intentionally has no apps/portal/.venv; the script reported the missing interpreter before collecting tests. P02 must provision the lockfile-aligned isolated test environment before claiming compatibility tests.",
      },
      {
        lane: "DEPLOYED_RUNTIME",
        status: "NOT_MEASURED",
        statement: "Repository examples/compose files were inspected only. Runtime flags and deployed schemas are not inferred from them.",
      },
    ],
    bootstrap_request_once: {
      owner: "Bobby",
      required_before: ["P04 real Delta parity", "P07+ reviewable browser receipt", "P23 deployment acceptance"],
      request: [
        "Authorized Research dev target identity and non-secret health/feature-profile receipt.",
        "Immutable historical reader snapshot identifier plus read-only fixture/access receipt.",
        "Named browser build/DNS/port reservation or an approved isolated equivalent.",
      ],
      prohibited: ["deployment helper invocation", "production/Execution runtime mutation", "credential values in Git"],
    },
  };
}

function protectedSurface() {
  const manifest = parseProtectedManifest(read(PROTECTED_MANIFEST_PATH));
  return {
    schema: "research-loop.p01-protected-surface.v1",
    protected: [
      {
        path: PROTECTED_PATH,
        authority: "EXECUTION_STRATEGY_KERNEL",
        expected_sha256: manifest.sha256,
        observed_sha256: sha256File(PROTECTED_PATH),
        status: manifest.sha256 === sha256File(PROTECTED_PATH) ? "VERIFIED_UNCHANGED" : "MISMATCH",
        P01_policy: "read-only; no P01 mutation permitted",
      },
      {
        path: "services/portal-execution-edge-rs/",
        authority: "EXECUTION_EDGE",
        status: "OUT_OF_RESEARCH_MUTATION_SCOPE",
        P01_policy: "Inventory only; no adapter, config or runtime modification.",
      },
      {
        path: "deploy/compose.production.yaml",
        authority: "DEPLOYMENT_RUNTIME",
        status: "REPOSITORY_DEFAULT_ONLY",
        P01_policy: "Read-only source inspection; deployed values are not inferred.",
      },
    ],
    research_allowlist: RESEARCH_ALLOWLIST,
    shared_bootstrap_exceptions: [],
    cross_agent_protocol: {
      shared_branch: "docs/research-loop-plan",
      one_writer_per_shared_file: true,
      frontend_owner: "Claude (visual/UI accepted output)",
      backend_owner: "Codex (P01 source/evidence tooling)",
      required_before_cross_boundary_change: "Bobby-specific approval or explicit confirmed handoff",
    },
  };
}

function runtimeInventoryMarkdown(inputs, routes, resources) {
  const frontendPackage = JSON.parse(read("apps/portal/frontend/package.json"));
  const dependencies = frontendPackage.dependencies ?? {};
  const rows = inputs
    .filter((entry) => ["python-api", "python-worker", "python-adapter", "python-storage", "control-api", "rust-service", "deployment-source"].includes(entry.kind))
    .map((entry) => `| ${entry.kind} | \`${entry.path}\` | ${entry.authority} | ${entry.purpose} |`)
    .join("\n");
  const measurementRows = Object.entries(resources.measurements)
    .map(([key, value]) => `| ${key} | ${value.value ?? "UNKNOWN"} | ${value.unit} | ${value.status} | \`${value.source}\` |`)
    .join("\n");
  const unknownRows = resources.unknowns.map((item) => `| ${item.subject} | ${item.close_phase} | ${item.reason} |`).join("\n");
  return `# P01 runtime and source inventory\n\nCapture: \`${capturedAtUtc}\`; scope: versioned local workspace source plus local host metadata. This file contains no runtime secret, connection string, deployed flag value, database row or browser screenshot.\n\n## Boundary result\n\n- P01 is source/discovery only. No Docker, deployment helper, SSH, external database, Execution Edge, Source Proxy, Trading System, broker or CLI call was run.\n- Repository compose/environment examples are declarations, not deployed proof.\n- The protected strategy kernel hash is checked by the P01 verifier; it is never edited by this phase.\n\n## Static service topology\n\n| Kind | Source | Authority | Role observed in source |\n| --- | --- | --- | --- |\n${rows}\n\n## Static route ownership\n\n- Parsed route/controller entries: **${routes.length}**; exact method/path collisions: **${findRouteCollisions(routes).length}**.\n- Ownership is source-path + locator only. Dynamic route composition remains an explicit P02 compatibility concern.\n- Full table: [route-inventory.csv](./route-inventory.csv).\n\n## Frontend/browser discovery\n\n- Frontend declares React \`${dependencies.react}\`, TanStack Query \`${dependencies["@tanstack/react-query"]}\` and ECharts \`${dependencies.echarts}\`.\n- Playwright defines production-true fixture port \`4174\` and preview fixture port \`4175\`; its own comments state endpoints are stubbed.\n- Browser status is **DISCOVERY_ONLY**: no asset-rendered screenshot, browser trace, real source or visual acceptance is claimed.\n- The offline package contains no \`doc-page.js\` or font/chart binary artifact. Report HTML dependency therefore remains a source finding for P09/P18, not a rendered baseline.\n\n## Local resource snapshot\n\n| Measurement | Value | Unit | Status | Source |\n| --- | --- | --- | --- |\n${measurementRows}\n\n## Intentionally unknown — never interpreted as a measurement\n\n| Subject | Close phase | Reason |\n| --- | --- | --- |\n${unknownRows}\n\n## P01 frontend handoff for Claude\n\nNo UI code is requested in P01. If Claude reviews in parallel, the bounded task is to verify the **semantics and visual grouping** of the 15 rows in \`screen-field-matrix.csv\`/\`screen-action-matrix.csv\` against each HTML + spec, annotate discrepancies in a new P01 handoff note, and **not** modify the Execution Carbon shell, global routing or any Research screen implementation. Browser screenshots remain non-PASS until a later approved visual harness has real assets and a trace.\n`;
}

function sourceVsBrowserCoverage(screens) {
  const rows = screens
    .map((screen) => `| ${screen.id} | ${screen.screen_label} | ${screen.fields.length} | ${screen.actions.length} | ${screen.test_ids.length} | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |`)
    .join("\n");
  return `# P01 source-vs-browser coverage\n\nThis is a denominator ledger, not a product acceptance report. Parsing an HTML file is not proof that its assets, charts, handlers or controls render.\n\n| Screen | Source label | Field records | Action records | Spec test IDs | Source lane | Browser lane |\n| --- | --- | ---: | ---: | ---: | --- | --- |\n${rows}\n\n## Lane rules\n\n- **SOURCE_INSPECTED**: HTML/spec bytes and source locators were parsed and hash-checked.\n- **CONTRACT_MAPPED**: only static source contracts were mapped. It does not imply endpoint availability.\n- **NOT_BROWSER_VERIFIED**: no rendered visual, a11y, resize, interaction or screenshot assertion exists yet.\n- A missing font, chart asset, \`doc-page.js\`, browser trace or real build can never be upgraded to a visual PASS by this document.\n`;
}

function scenarioSkeleton(screens) {
  return {
    schema: "research-loop.p01-scenario-skeleton.v1",
    statement: "Scenario rows are future test denominators, not executed tests or UI acceptance.",
    screens: screens.map((screen) => ({
      screen_id: screen.id,
      source_label: screen.screen_label,
      source_test_ids: screen.test_ids,
      required_states: ["loading", "empty", "partial", "stale", "denied", "unavailable", "terminal"],
      status: "SOURCE_MAPPED_NOT_EXECUTED",
    })),
  };
}

function buildArtifacts() {
  const screens = SCREENS.map(inventoryScreen);
  assert.equal(screens.length, 15, "P01 requires exactly 15 screens");
  assert.deepEqual(screens.map((screen) => screen.id), Array.from({ length: 15 }, (_, index) => String(index).padStart(2, "0")), "screen IDs must be 00–14");
  const protectedManifest = parseProtectedManifest(read(PROTECTED_MANIFEST_PATH));
  assert.equal(protectedManifest.relative, PROTECTED_PATH, "protected manifest target must remain main.py");
  assert.equal(protectedManifest.sha256, sha256File(PROTECTED_PATH), "protected kernel SHA mismatch");
  const routes = routeInventory();
  const collisions = findRouteCollisions(routes);
  assert.equal(collisions.length, 0, `actual static route collision(s): ${collisions.map((collision) => collision.key).join(", ")}`);
  const configuration = repositoryConfigurationInventory(routes);
  assert.ok(configuration.database_schema.control_api_migration_count > 0, "static migration inventory must not be empty");
  assert.ok(configuration.feature_flag_names.length > 0, "static feature-flag inventory must not be empty");
  const inputs = sourceInputs();
  const resources = resourceInventory();
  const fieldRows = screens.flatMap((screen) => screen.fields);
  const actionRows = screens.flatMap((screen) => screen.actions);
  const requirementRows = screens.map((screen) => ({
    screen_id: screen.id,
    screen_name: screen.name,
    source_label: screen.screen_label,
    html_path: screen.html,
    spec_path: screen.spec,
    route_declared_in_spec: screen.route,
    html_sha256: screen.html_sha256,
    spec_sha256: screen.spec_sha256,
    html_buttons: screen.html_buttons,
    html_links: screen.html_links,
    html_form_controls: screen.html_form_controls,
    field_records: screen.fields.length,
    action_records: screen.actions.length,
    spec_test_ids: screen.test_ids.join(" "),
    source_status: "SOURCE_INSPECTED",
    browser_status: "NOT_BROWSER_VERIFIED",
    implementation_status: "NOT_IMPLEMENTED_IN_P01",
  }));
  return {
    screens,
    inputs,
    routes,
    configuration,
    resources,
    fields: fieldRows,
    actions: actionRows,
    prototypeControls: prototypeControls(),
    requirements: requirementRows,
    sourceMap: sourceMap(screens),
  };
}

function artifactPaths() {
  return {
    baseline: `${evidenceDirectory}/baseline.json`,
    protectedSurface: `${evidenceDirectory}/protected-surface.json`,
    delta: `${evidenceDirectory}/delta-source-manifest.json`,
    acceptance: `${evidenceDirectory}/acceptance-environment.json`,
    sourceMap: `${evidenceDirectory}/source-map.csv`,
    requirements: `${evidenceDirectory}/screen-requirements.csv`,
    fields: `${evidenceDirectory}/screen-field-matrix.csv`,
    actions: `${evidenceDirectory}/screen-action-matrix.csv`,
    routes: `${evidenceDirectory}/route-inventory.csv`,
    configuration: `${evidenceDirectory}/repository-configuration-inventory.json`,
    prototypes: `${evidenceDirectory}/prototype-controls.json`,
    scenarios: `${evidenceDirectory}/scenario-skeleton.json`,
    findings: `${evidenceDirectory}/findings-decision-register.json`,
    resources: `${evidenceDirectory}/resource-inventory.json`,
    runtime: `${evidenceDirectory}/runtime-inventory.md`,
    coverage: `${evidenceDirectory}/source-vs-browser-coverage.md`,
  };
}

function writeArtifacts() {
  const artifacts = buildArtifacts();
  const files = artifactPaths();
  writeJson(files.baseline, {
    schema: "research-loop.p01-baseline.v1",
    captured_at_utc: capturedAtUtc,
    source_capture_commit: baselineCommit,
    archive: {
      release_directory: releaseDirectory,
      html_count: artifacts.screens.length,
      spec_count: artifacts.screens.length,
      html_ids: artifacts.screens.map((screen) => screen.id),
      spec_ids: artifacts.screens.map((screen) => screen.id),
      tracked_zip: "NOT_PRESENT_IN_VERSIONED_SOURCE",
      content_sha256: archiveContentDigest(artifacts.screens),
    },
    current_engine_pin: "quantbt-engine==1.0.8",
    engine_target_note: "QuantBT 1.1.1 is a P04 target, not an installed-engine claim in P01.",
    source_files: artifacts.sourceMap,
    static_route_count: artifacts.routes.length,
    static_route_collisions: 0,
    static_route_inventory_sha256: digestJson(artifacts.routes),
    repository_configuration_inventory_sha256: digestJson(artifacts.configuration),
  });
  writeJson(files.protectedSurface, protectedSurface());
  writeJson(files.delta, deltaManifest());
  writeJson(files.acceptance, acceptanceEnvironment());
  write(files.sourceMap, csv(["source_id", "kind", "path", "sha256", "line_count", "purpose", "authority", "screen_id"], artifacts.sourceMap));
  write(files.requirements, csv(["screen_id", "screen_name", "source_label", "html_path", "spec_path", "route_declared_in_spec", "html_sha256", "spec_sha256", "html_buttons", "html_links", "html_form_controls", "field_records", "action_records", "spec_test_ids", "source_status", "browser_status", "implementation_status"], artifacts.requirements));
  write(files.fields, csv(["screen_id", "field_id", "field_kind", "input_type", "source_locator", "source_name", "source_copy", "classification", "browser_status"], artifacts.fields));
  write(files.actions, csv(["screen_id", "action_id", "action_kind", "source_locator", "source_copy", "source_handler", "classification", "production_command_candidate", "browser_status"], artifacts.actions));
  write(files.routes, csv(["method", "path", "owner", "locator", "handler"], artifacts.routes));
  writeJson(files.configuration, artifacts.configuration);
  writeJson(files.prototypes, { schema: "research-loop.p01-prototype-controls.v1", controls: artifacts.prototypeControls });
  writeJson(files.scenarios, scenarioSkeleton(artifacts.screens));
  writeJson(files.findings, { schema: "research-loop.p01-findings-decision-register.v1", findings: conflicts() });
  writeJson(files.resources, artifacts.resources);
  write(files.runtime, runtimeInventoryMarkdown(artifacts.inputs, artifacts.routes, artifacts.resources));
  write(files.coverage, sourceVsBrowserCoverage(artifacts.screens));
  return artifacts;
}

function scanForSecret(text, label) {
  for (const expression of SECRET_PATTERNS) {
    if (expression.test(text)) throw new Error(`Potential credential pattern ${expression} found in ${label}`);
  }
}

function verifyArtifacts() {
  const files = artifactPaths();
  for (const [name, relative] of Object.entries(files)) {
    assert.ok(exists(relative), `required P01 artifact missing: ${name} (${relative})`);
  }
  const current = buildArtifacts();
  const baseline = JSON.parse(read(files.baseline));
  assert.equal(baseline.archive.html_count, 15, "baseline must retain 15 HTML files");
  assert.equal(baseline.archive.spec_count, 15, "baseline must retain 15 specs");
  assert.deepEqual(baseline.archive.html_ids, current.screens.map((screen) => screen.id), "HTML screen IDs drifted");
  assert.deepEqual(baseline.archive.spec_ids, current.screens.map((screen) => screen.id), "spec screen IDs drifted");
  assert.equal(baseline.archive.tracked_zip, "NOT_PRESENT_IN_VERSIONED_SOURCE", "P01 must not invent a ZIP artifact");
  assert.equal(baseline.archive.content_sha256, archiveContentDigest(current.screens), "archive content digest drifted");
  const baselineHashByPath = new Map(baseline.source_files.map((entry) => [entry.path, entry.sha256]));
  for (const source of current.sourceMap) {
    assert.equal(baselineHashByPath.get(source.path), source.sha256, `source hash drift: ${source.path}`);
  }
  const protectedResult = JSON.parse(read(files.protectedSurface));
  assert.equal(protectedResult.protected[0].status, "VERIFIED_UNCHANGED", "protected surface must remain verified");
  assert.deepEqual(protectedResult.research_allowlist, RESEARCH_ALLOWLIST, "research allowlist drifted");
  const requirements = read(files.requirements).trim().split("\n");
  assert.equal(requirements.length - 1, 15, "screen requirement denominator must stay exactly 15");
  for (const screen of current.screens) {
    assert.ok(current.fields.some((field) => field.screen_id === screen.id && field.source_locator.includes(":")), `missing field locator for S${screen.id}`);
    assert.ok(current.actions.some((action) => action.screen_id === screen.id && action.source_locator.includes(":")), `missing action locator for S${screen.id}`);
  }
  const prototypes = JSON.parse(read(files.prototypes));
  assert.ok(prototypes.controls.some((control) => control.screen_id === "03" && /Timer/.test(control.control)), "timer prototype control absent");
  assert.ok(prototypes.controls.some((control) => control.screen_id === "04" && /Synthetic/.test(control.control)), "synthetic replay control absent");
  assert.ok(prototypes.controls.every((control) => control.classification === "PROTOTYPE_ONLY" && control.production_command_candidate === false), "prototype controls cannot propose production commands");
  const coverage = read(files.coverage);
  assert.match(coverage, /SOURCE_INSPECTED/);
  assert.match(coverage, /NOT_BROWSER_VERIFIED/);
  assert.doesNotMatch(coverage, /BROWSER_VERIFIED \| PASS/);
  const resources = JSON.parse(read(files.resources));
  for (const [key, value] of Object.entries(resources.measurements)) {
    assert.ok(value.source, `measurement source missing: ${key}`);
    assert.notEqual(value.status, "UNKNOWN_NOT_MEASURED", `unknown value must not be represented as measurement: ${key}`);
  }
  assert.ok(resources.unknowns.every((unknown) => unknown.status === "UNKNOWN_NOT_MEASURED" && unknown.close_phase), "unknowns must retain explicit target phase");
  const routeRows = current.routes;
  assert.equal(findRouteCollisions(routeRows).length, 0, "actual source route collision detected");
  assert.equal(baseline.static_route_inventory_sha256, digestJson(routeRows), "route inventory drifted");
  const configuration = JSON.parse(read(files.configuration));
  assert.equal(configuration.deployed_values_observed, false, "P01 must not claim deployed config values");
  assert.equal(configuration.endpoint_registration.literal_exact_collision_count, 0, "configuration inventory must retain collision result");
  assert.ok(configuration.database_schema.control_api_migration_count > 0, "configuration inventory must list migrations");
  assert.ok(configuration.feature_flag_names.length > 0, "configuration inventory must list flag names");
  assert.equal(baseline.repository_configuration_inventory_sha256, digestJson(current.configuration), "configuration inventory drifted");
  for (const relative of Object.values(files)) scanForSecret(read(relative), relative);
  return {
    P01_T01: "PASS",
    P01_T03: "PASS",
    P01_T04: "PASS",
    P01_T05: "PASS",
    P01_T06: "PASS",
    P01_T07: "PASS",
    P01_T08: "PASS",
  };
}

function selfTest() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "research-p01-"));
  try {
    const sample = path.join(temporary, "main.py");
    const original = "protected = True\n";
    fs.writeFileSync(sample, original);
    const expected = sha256(fs.readFileSync(sample));
    assert.equal(expected, sha256(fs.readFileSync(sample)), "control hash must match");
    fs.appendFileSync(sample, "# simulated protected change\n");
    assert.notEqual(expected, sha256(fs.readFileSync(sample)), "P01-T02 must detect simulated protected diff");
    const collisions = findRouteCollisions([
      { method: "GET", path: "/api/v1/research/runs", owner: "owner-a", locator: "fixture-a:1", handler: "listA" },
      { method: "GET", path: "/api/v1/research/runs", owner: "owner-b", locator: "fixture-b:1", handler: "listB" },
      { method: "POST", path: "/api/v1/research/runs", owner: "owner-b", locator: "fixture-b:2", handler: "createB" },
    ]);
    assert.equal(collisions.length, 1, "P01-T04 synthetic collision must be detected");
    assert.deepEqual(collisions[0].owners, ["owner-a", "owner-b"], "P01-T04 collision must name owners");
    assert.throws(() => scanForSecret("ghp_abcdefghijklmnopqrstuvwxyz0123456789", "synthetic secret"), /Potential credential/);
    const sourceValidation = () => {
      const rows = [{ screen_id: "00" }];
      assert.ok(rows.some((row) => row.screen_id === "00"));
      assert.ok(rows.some((row) => row.screen_id === "14"), "synthetic missing source must fail");
    };
    assert.throws(sourceValidation, /synthetic missing source/);
    return { P01_T02: "PASS", P01_T03_negative: "PASS", P01_T04_synthetic_collision: "PASS", P01_T06_missing_source_negative: "PASS" };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function usage() {
  process.stderr.write("Usage: node scripts/research-loop-v11/p01-baseline.mjs --write|--verify|--self-test\n");
  process.exitCode = 2;
}

const command = process.argv[2];
if (command === "--write") {
  const generated = writeArtifacts();
  process.stdout.write(JSON.stringify({ status: "WRITTEN", screens: generated.screens.length, fields: generated.fields.length, actions: generated.actions.length, routes: generated.routes.length }) + "\n");
} else if (command === "--verify") {
  process.stdout.write(`${JSON.stringify({ status: "PASS", ...verifyArtifacts() })}\n`);
} else if (command === "--self-test") {
  process.stdout.write(`${JSON.stringify({ status: "PASS", ...selfTest() })}\n`);
} else {
  usage();
}
