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

function riskFor(key, sourceRisk) {
  if (/reset|delete-lab|shared-testnet/i.test(key)) return "BLOCKED";
  if (key === "allocation/<root>") return "R1_PAPER_MUTATION";
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
  const riskTier = riskFor(key, command.risk_tier_proposed);
  const blockedByDefinition = riskTier === "BLOCKED";
  const mutation = ["R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING"].includes(riskTier);
  const emergency = key === "ops/emergency-close" || key === "ops/emergency-close-verify";
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
    plan_required: emergency,
    apply_required: emergency || mutation,
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

const catalog = {
  schema_version: "execution.command-catalog.v1",
  catalogue_revision: 1,
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
  entries,
};

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
emit(typescriptPath, ts);
console.log(check ? "execution command catalogue is current" : "generated execution command catalogue");
