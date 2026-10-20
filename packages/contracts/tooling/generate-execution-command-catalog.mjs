#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const contractsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(contractsRoot, "../..");
const packRoot = join(
  repoRoot,
  "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack",
);
const cliPath = join(packRoot, "extract/cli-command-map.json");
const openApiPath = join(packRoot, "openapi.sanitized.json");
const fixturePath = join(contractsRoot, "fixtures/execution-command-catalog.valid.json");
// The extract fixture above is pinned byte-for-byte by the N16B acceptance record
// (immutable_bindings.command_catalog_sha256). The served form is a SEPARATE file.
const servedFixturePath = join(contractsRoot, "fixtures/execution-command-catalog.served.valid.json");
const typescriptPath = join(repoRoot, "apps/control-api/src/operations/catalog.generated.ts");
const check = process.argv.includes("--check");

const cliBytes = readFileSync(cliPath);
const openApiBytes = readFileSync(openApiPath);
const cli = JSON.parse(cliBytes.toString("utf8"));
const openApi = JSON.parse(openApiBytes.toString("utf8"));

if (cli.summary?.cli_actions !== 64 || cli.commands?.length !== 64) {
  throw new Error("canonical CLI extract must contain exactly 64 actions");
}

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const normalizePath = (value) =>
  value
    .split("?", 1)[0]
    .replaceAll(/\{[^}]+\}/g, "{}")
    .replaceAll(/\/+$/g, "");

const openApiRoutes = new Map();
for (const [path, methods] of Object.entries(openApi.paths ?? {})) {
  const normalized = normalizePath(path);
  openApiRoutes.set(
    normalized,
    Object.keys(methods)
      .filter((method) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map((method) => ({ method: method.toUpperCase(), path })),
  );
}

const unpublishedOps = new Set([
  "ops/trace-order",
  "ops/dead-letters",
  "ops/findings",
  "ops/streams",
  "ops/command-journal",
  "ops/redis-retention",
  "ops/alerts",
  "ops/alpha-activity",
]);
const genericRedis = new Set(["redis/get", "redis/scan"]);

function groupFor(noun) {
  if (["account", "allocation", "authority", "portfolio", "capital"].includes(noun)) {
    return "ACCOUNT_CAPITAL";
  }
  if (["alpha", "copy", "deployment", "trading-state"].includes(noun)) {
    return "ALPHA_DEPLOYMENT";
  }
  if (["bracket-audit", "order-group", "replay"].includes(noun)) {
    return "ORDER_CONTROL";
  }
  if (noun === "ops") return "OPERATIONS_INCIDENTS";
  if (["market", "symbols"].includes(noun)) return "MARKET_REFERENCE";
  return "PLATFORM_DIAGNOSTICS";
}

function riskFor(key, sourceRisk, route) {
  if (/reset|delete-lab|shared-testnet/i.test(key)) return "BLOCKED";
  if (key === "allocation/<root>") return "R1_PAPER_MUTATION";
  // Source metadata is evidence, not Portal authorization. Any observed HTTP
  // mutation receives at least the Paper mutation floor even when the source
  // CLI labelled the action as a read.
  if (route && route.method !== "GET" && sourceRisk === "R0_READ") {
    return "R1_PAPER_MUTATION";
  }
  return sourceRisk;
}

function exactSourceRoute(command, key) {
  if (unpublishedOps.has(key) || command.http_paths.length === 0) return null;
  const candidates = command.http_paths.flatMap(
    (path) => openApiRoutes.get(normalizePath(path)) ?? [],
  );
  const unique = [...new Map(candidates.map((route) => [`${route.method} ${route.path}`, route])).values()];
  if (unique.length === 1) return unique[0];

  const tokens = command.action
    .split("-")
    .filter((token) => token !== "root" && token.length > 2);
  const actionMatches = unique.filter((route) =>
    tokens.length > 0 && tokens.every((token) => route.path.toLowerCase().includes(token)),
  );
  if (actionMatches.length === 1) return actionMatches[0];

  if (command.action === "list") {
    const reads = unique.filter((route) => route.method === "GET" && !route.path.includes("{}"));
    if (reads.length === 1) return reads[0];
  }
  if (command.action === "inspect") {
    const reads = unique.filter((route) => route.method === "GET" && route.path.includes("{}"));
    if (reads.length === 1) return reads[0];
  }
  return null;
}

const entries = cli.commands.map((command) => {
  const key = `${command.command}/${command.action}`;
  const directOnly = !command.access_paths.includes("HTTP");
  const route = exactSourceRoute(command, key);
  const riskTier = riskFor(key, command.risk_tier_proposed, route);
  const blockedByDefinition = riskTier === "BLOCKED";
  const mutation = ["R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING"].includes(riskTier);
  const emergency = key === "ops/emergency-close" || key === "ops/emergency-close-verify";
  const ownerReviewRequired = mutation || (route !== null && route.method !== "GET");
  let sourceRouteState = "AMBIGUOUS";
  let blockedReason = "SOURCE_ROUTE_MAPPING_AMBIGUOUS";
  if (unpublishedOps.has(key)) {
    sourceRouteState = "UNPUBLISHED";
    blockedReason = "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED";
  } else if (genericRedis.has(key)) {
    sourceRouteState = "DIRECT_ACCESS_PROHIBITED";
    blockedReason = "GENERIC_REDIS_ACCESS_PROHIBITED";
  } else if (directOnly) {
    sourceRouteState = "DIRECT_ACCESS_PROHIBITED";
    blockedReason = "TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED";
  } else if (blockedByDefinition) {
    sourceRouteState = route ? "OBSERVED" : "AMBIGUOUS";
    blockedReason = "DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED";
  } else if (route) {
    sourceRouteState = "OBSERVED";
    blockedReason = "COMMAND_RELAY_DISABLED";
  }
  return {
    key,
    command: command.command,
    action: command.action,
    group: groupFor(command.command),
    risk_tier: riskTier,
    source_risk_tier: command.risk_tier_proposed,
    owner_review_required: ownerReviewRequired,
    plan_required: mutation,
    apply_required: mutation,
    verify_required: emergency,
    portal_reachable: false,
    source_route_state: sourceRouteState,
    http_method: route?.method ?? null,
    http_path: route?.path ?? null,
    blocked_reason: blockedReason,
    source_reference: command.source,
  };
}).sort((left, right) => left.key.localeCompare(right.key));

if (new Set(entries.map((entry) => entry.key)).size !== 64) {
  throw new Error("canonical noun/action keys must be unique");
}
for (const key of unpublishedOps) {
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry || entry.portal_reachable || entry.source_route_state !== "UNPUBLISHED") {
    throw new Error(`unpublished Trading System route became reachable: ${key}`);
  }
}
for (const key of genericRedis) {
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry || entry.blocked_reason !== "GENERIC_REDIS_ACCESS_PROHIBITED") {
    throw new Error(`generic Redis capability was not rejected: ${key}`);
  }
}
for (const entry of entries) {
  const observedHttpMutation = entry.http_method !== null && entry.http_method !== "GET";
  const mutationRisk = [
    "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING",
  ].includes(entry.risk_tier);
  if (observedHttpMutation && (!entry.owner_review_required || entry.risk_tier === "R0_READ")) {
    throw new Error(`Portal policy did not conservatively classify HTTP mutation: ${entry.key}`);
  }
  if (mutationRisk && (!entry.owner_review_required || !entry.plan_required || !entry.apply_required)) {
    throw new Error(`Portal mutation policy lost owner-review/plan/apply: ${entry.key}`);
  }
}

const catalog = {
  schema_version: "execution.command-catalog.v1",
  catalogue_revision: 2,
  delivery_profile: "fixture",
  capability: {
    state: "DISABLED",
    reason: "EX_BE_05B_F0_CONTRACT_ONLY",
  },
  source: {
    trading_system_commit: cli.provenance.trading_system_commit,
    cli_map_sha256: sha256(cliBytes),
    openapi_sha256: sha256(openApiBytes),
    generated_from_read_only_extract: true,
  },
  scope: {
    workspace_id: "fixture-workspace",
    actor_user_id: "fixture-admin",
    actor_role: "ADMIN",
    environment: "PAPER",
    entity: null,
    requested_risk_tier: null,
    capability_state: "DISABLED",
    freshness_state: "UNAVAILABLE",
    policy_revision: "execution.command-catalogue.f0.v2",
  },
  total_entries: entries.length,
  returned_entries: entries.length,
  entries,
};

// The served catalogue is NOT the raw extract: ExecutionOperationsService.catalogue()
// applies n16bCatalogueEntry() and catalogueEntryClassification() to every entry.
// The served fixture is the same function of the same extract, so a consumer
// reads what the service emits. Keep both functions identical to
// apps/control-api/src/operations/{current-protective.acceptance,operator-tasks}.ts;
// apps/control-api/test/be-p13-catalogue.spec.ts compares the live service output
// with this fixture entry by entry, so drift fails there, not in a consumer.
function servedEntry(entry) {
  const accepted = entry.key !== "ops/emergency-close" ? entry : {
    ...entry,
    blocked_reason: "N16B_RUNTIME_ACTIVATION_PENDING",
    source_route_state: "CURRENT_PRIMITIVE_CONFIRMED",
    current_primitive_state: "ACCEPTED_CURRENT_PRIMITIVE",
    current_capability_id: "live.emergency-close",
    accepted_environments: ["LIVE"],
    accepted_target_types: ["ACCOUNT"],
    runtime_active: false,
    portal_reachable: false,
  };
  let classification;
  if (accepted.source_route_state === "CURRENT_PRIMITIVE_CONFIRMED") {
    classification = { state: "SUPPORTED_BUT_INACTIVE", reason_code: "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED" };
  } else if (accepted.http_method !== null && accepted.http_path !== null && accepted.source_route_state === "OBSERVED") {
    classification = { state: "SUPPORTED_BUT_INACTIVE", reason_code: "N27_COMMAND_TRANSPORT_NOT_ACTIVATED" };
  } else {
    classification = { state: "SEMANTICALLY_INCOMPATIBLE", reason_code: accepted.blocked_reason };
  }
  if (accepted.portal_reachable) throw new Error(`catalogue entry became reachable: ${entry.key}`);
  return { ...accepted, classification };
}
const servedCatalog = { ...catalog, entries: catalog.entries.map(servedEntry) };
const servedJson = `${JSON.stringify(servedCatalog, null, 2)}\n`;
const json = `${JSON.stringify(catalog, null, 2)}\n`;
const ts = `/* Generated by packages/contracts/tooling/generate-execution-command-catalog.mjs. */\n` +
  `/* Source is the immutable read-only Trading System contract pack. */\n` +
  `export const EXECUTION_COMMAND_CATALOG = ${JSON.stringify(catalog, null, 2)} as const;\n`;

function emit(path, expected) {
  if (check) {
    if (readFileSync(path, "utf8") !== expected) {
      throw new Error(`generated command catalogue drifted: ${path}`);
    }
  } else {
    writeFileSync(path, expected, "utf8");
  }
}

emit(fixturePath, json);
emit(servedFixturePath, servedJson);
emit(typescriptPath, ts);
console.log(check ? "execution command catalogue is current" : "generated execution command catalogue");
