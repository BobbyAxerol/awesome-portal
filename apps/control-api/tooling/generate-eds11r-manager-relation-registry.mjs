#!/usr/bin/env node
/**
 * EDS-11R1 Manager relation registry compiler.
 *
 * The Portal must not read the Trading System catalogue at runtime, and it
 * must never let a browser construct a schema/relation request.  This small,
 * deterministic compiler converts the accepted, sanitised catalogue evidence
 * into a checked-in allowlist of named Portal operations.  It deliberately
 * emits only scalar, non-sensitive fields; JSON/array values and every column
 * marked MAY_CONTAIN_SENSITIVE_STRUCTURED_DATA stay on the source side.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolingDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolingDirectory, "../../..");
const sourcePack = process.env.EDS11R_SOURCE_PACK ?? join(
  repositoryRoot,
  "services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const censusPack = process.env.EDS11R_CENSUS_PACK ?? join(
  repositoryRoot,
  "services/portal-execution-edge-rs/contracts/manager-surface-census-v1",
);
const outputFile = process.env.EDS11R_GENERATED_OUTPUT ?? join(
  toolingDirectory,
  "../src/execution/eds11r-manager-relation-registry.generated.ts",
);
const checkOnly = process.argv.includes("--check");

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function read(directory, name) {
  const absolute = join(directory, name);
  return { absolute, body: readFileSync(absolute, "utf8") };
}

function readJson(directory, name) {
  const file = read(directory, name);
  return { body: JSON.parse(file.body), digest: sha256(file.body) };
}

/** Small RFC-4180 parser; the evidence pack has a stable checked-in header. */
function parseCsv(body, name) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quoted) {
      if (character === '"' && body[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error(`${name}: unterminated quoted CSV value`);
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...records] = rows.filter((candidate) => candidate.some((cell) => cell.length > 0));
  if (!header?.length) throw new Error(`${name}: missing CSV header`);
  return records.map((cells, lineOffset) => {
    if (cells.length !== header.length) {
      throw new Error(`${name}: line ${lineOffset + 2} has ${cells.length} cells; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

function pascalCase(value) {
  return value.split(/[_-]/).filter(Boolean).map((part) =>
    `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
  ).join("");
}

function kebabCase(value) {
  return value.replace(/_/g, "-");
}

function scalarKind(dataType) {
  if (dataType === "timestamp with time zone") return "TIMESTAMP";
  if (dataType === "boolean") return "BOOLEAN";
  if (dataType === "integer" || dataType === "bigint") return "INTEGER";
  if (dataType === "double precision" || dataType === "numeric" || dataType.startsWith("numeric(")) {
    return "DECIMAL";
  }
  if (dataType === "text" || dataType === "uuid" || dataType === "date") return "TEXT";
  return null;
}

const observedIdentityOverrides = Object.freeze({
  "public.account_sync_effective": Object.freeze({
    fields: Object.freeze(["sync_id"]),
    disposition: "SOURCE_OBSERVED_SYNC_ID_NO_DECLARED_PRIMARY_KEY",
  }),
  "public.broker_account_sync_effective": Object.freeze({
    fields: Object.freeze(["sync_id"]),
    disposition: "SOURCE_OBSERVED_SYNC_ID_NO_DECLARED_PRIMARY_KEY",
  }),
  "public.margin_balances": Object.freeze({
    fields: Object.freeze(["account_id", "instrument_id", "currency"]),
    disposition: "DECLARED_UNIQUE_INDEX_COMPOSITE_KEY",
  }),
  "public.paper_matcher_config": Object.freeze({
    fields: Object.freeze(["venue", "instrument_id"]),
    disposition: "DECLARED_UNIQUE_INDEX_COMPOSITE_KEY",
  }),
  "public.risk_profiles": Object.freeze({
    fields: Object.freeze(["strategy_id", "mode", "venue", "instrument_id"]),
    disposition: "DECLARED_UNIQUE_INDEX_COMPOSITE_KEY",
  }),
});

/**
 * The N18 census marks these rows SCREEN_BOUND but predates the rich-screen
 * recomposition and therefore has no concrete screen ID for them.  R1 makes
 * that ownership explicit.  These are Portal presentation bindings only;
 * they do not alter the private Manager capability or widen a source route.
 */
const screenCoverageOverrides = Object.freeze({
  "public.account_policies": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN", "EXECUTION_GATE_R2_REVIEW_SCREEN"],
  "public.account_reservations": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN", "EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.account_sync_current_state": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.account_sync_snapshots": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.alpha_risk_config": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
  "public.alphas": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
  "public.broker_account_sync_current_state": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.broker_account_sync_snapshots": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.broker_sync_state_history": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.broker_sync_valuation_current_state": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.broker_sync_valuation_history": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.command_ack_evidence": ["EXECUTION_ADMIN_ACTION_DRAWER_SCREEN", "EXECUTION_COMMAND_CENTER_SCREEN", "EXECUTION_FULL_BLOTTER_SCREEN"],
  "public.execution_replay_jobs": ["EXECUTION_COMMAND_CENTER_SCREEN"],
  "public.instrument_aliases": ["EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.instrument_metadata_history": ["EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.instruments": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.operator_operations": ["EXECUTION_COMMAND_CENTER_SCREEN", "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
  "public.order_bracket_legs": ["EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.order_brackets": ["EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.paper_account_seed": ["EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.paper_matcher_config": ["EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.paper_open_orders": ["EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  "public.performance_projection_current_state": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.portfolio_allocations": ["EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.portfolio_audit_current_state": ["EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.portfolio_capital_ledger": ["EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.portfolios": ["EXECUTION_PORTFOLIO_360_SCREEN"],
  "public.reconciliation_observation_buckets": ["EXECUTION_INCIDENT_DETAIL_SCREEN", "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
  "public.risk_grants": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_GATE_R2_REVIEW_SCREEN"],
  "public.risk_profiles": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_GATE_R2_REVIEW_SCREEN"],
  "public.service_heartbeats": ["EXECUTION_COMMAND_CENTER_SCREEN"],
  "public.settlement_calendars": ["EXECUTION_PAPER_WORKBENCH_SCREEN", "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN"],
  "public.sizing_decisions": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_GATE_R1_REVIEW_SCREEN"],
  "public.strategies": ["EXECUTION_ALPHA_360_SCREEN", "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
  "public.traders": ["EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
  "public.venue_accounts": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
  "public.venues": ["EXECUTION_ACCOUNT_BROKER_360_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
});

const relationCensus = read(sourcePack, "DATABASE_RELATION_CENSUS.csv");
const columnCatalogue = read(sourcePack, "COLUMN_SEMANTICS_CATALOG.csv");
const managerCensus = readJson(censusPack, "manager-surface-census.v1.json");

const relationMetadata = new Map();
for (const row of parseCsv(relationCensus.body, "DATABASE_RELATION_CENSUS.csv")) {
  relationMetadata.set(`${row.schema}.${row.relation}`, row);
}
const columnsByRelation = new Map();
for (const row of parseCsv(columnCatalogue.body, "COLUMN_SEMANTICS_CATALOG.csv")) {
  const relationId = `${row.schema}.${row.relation}`;
  const fields = columnsByRelation.get(relationId) ?? [];
  fields.push(row);
  columnsByRelation.set(relationId, fields);
}

const allRelations = [...managerCensus.body.relations]
  .sort((left, right) => left.relation_id.localeCompare(right.relation_id));
if (allRelations.length !== 96) {
  throw new Error(`expected exactly 96 Manager relations, received ${allRelations.length}`);
}
const classificationCounts = Object.fromEntries(
  ["SCREEN_BOUND", "PROJECTION_INPUT", "AUDIT_ONLY", "INTERNAL_ONLY"].map((classification) => [
    classification,
    allRelations.filter((relation) => relation.classification === classification).length,
  ]),
);
if (
  classificationCounts.SCREEN_BOUND !== 54 ||
  classificationCounts.PROJECTION_INPUT !== 16 ||
  classificationCounts.AUDIT_ONLY !== 13 ||
  classificationCounts.INTERNAL_ONLY !== 13
) {
  throw new Error(`unexpected Manager relation classification counts: ${JSON.stringify(classificationCounts)}`);
}

const screenBound = allRelations
  .filter((relation) => relation.classification === "SCREEN_BOUND")
  .sort((left, right) => left.relation_id.localeCompare(right.relation_id));
if (screenBound.length !== 54) {
  throw new Error(`expected exactly 54 SCREEN_BOUND relations, received ${screenBound.length}`);
}

const operations = screenBound.map((entry) => {
  const relationId = entry.relation_id;
  const relation = relationId.split(".");
  if (relation.length !== 2 || relation[0] !== "public") {
    throw new Error(`${relationId}: only accepted public relations may compile into the Portal BFF registry`);
  }
  const metadata = relationMetadata.get(relationId);
  const columns = columnsByRelation.get(relationId);
  if (!metadata || !columns) throw new Error(`${relationId}: missing catalogue metadata`);
  const fields = columns
    .map((column) => ({
      name: column.column,
      kind: scalarKind(column.data_type),
      sensitivity: column.sensitivity,
    }))
    .filter((field) => field.kind !== null && !field.sensitivity.includes("MAY_CONTAIN_SENSITIVE_STRUCTURED_DATA"))
    .map(({ name, kind }) => ({ name, kind }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (fields.length === 0) throw new Error(`${relationId}: no safe scalar fields`);
  const declaredPrimaryKey = metadata.primary_key_columns
    ? metadata.primary_key_columns.split("|").filter(Boolean)
    : [];
  const override = observedIdentityOverrides[relationId];
  const identityFields = override ? [...override.fields] : declaredPrimaryKey;
  const identityDisposition = override
    ? override.disposition
    : "DECLARED_PRIMARY_KEY";
  if (identityFields.length === 0 || !identityFields.every((name) => fields.some((field) => field.name === name))) {
    throw new Error(`${relationId}: no safe identity selector`);
  }
  const relationName = relation[1];
  const screenIds = entry.screen_ids.length > 0
    ? [...entry.screen_ids]
    : screenCoverageOverrides[relationId];
  if (!screenIds?.length) throw new Error(`${relationId}: SCREEN_BOUND relation has no Portal screen binding`);
  return {
    operation_id: `manager${pascalCase(relationName)}PageV1`,
    route_id: kebabCase(relationName),
    // A product field identifier, deliberately not the raw `schema.relation`
    // selector which stays server-side in this generated module.
    field_id: `manager${pascalCase(relationName)}Current`,
    source_id: `manager.current.${kebabCase(relationName)}`,
    schema: "public",
    relation: relationName,
    identity_fields: identityFields,
    identity_disposition: identityDisposition,
    fields,
    source_history_semantics: metadata.change_semantics_disposition,
    source_retention_semantics: metadata.retention_disposition,
    screen_ids: [...screenIds].sort(),
  };
});

const nonBrowserDispositions = allRelations
  .filter((entry) => entry.classification !== "SCREEN_BOUND")
  .map((entry) => ({
    relation_id: entry.relation_id,
    classification: entry.classification,
    browser_disposition: entry.classification === "PROJECTION_INPUT"
      ? "PORTAL_PROJECTION_ONLY"
      : entry.classification === "AUDIT_ONLY"
        ? "AUDIT_REPOSITORY_ONLY"
        : "NOT_BROWSER_ADMISSIBLE",
  }));

const routes = new Set();
const operationIds = new Set();
for (const operation of operations) {
  if (routes.has(operation.route_id) || operationIds.has(operation.operation_id)) {
    throw new Error(`duplicate generated operation ${operation.operation_id}`);
  }
  routes.add(operation.route_id);
  operationIds.add(operation.operation_id);
}

const rendered = [
  "/* This file is generated by tooling/generate-eds11r-manager-relation-registry.mjs. Do not edit manually. */",
  "/* Source: accepted sanitized Manager-v2 census and column metadata; no credential, cursor, endpoint or source row is emitted. */",
  `export const EDS11R_MANAGER_RELATION_REGISTRY_SOURCE = ${JSON.stringify({
    schema_version: "portal.execution.eds11r.manager-relation-registry-source.v1",
    input_digests: {
      manager_surface_census: managerCensus.digest,
      database_relation_census: sha256(relationCensus.body),
      column_semantics_catalogue: sha256(columnCatalogue.body),
    },
    relation_count: allRelations.length,
    screen_bound_relation_count: operations.length,
    classification_counts: classificationCounts,
    operations,
    non_browser_dispositions: nonBrowserDispositions,
  }, null, 2)} as const;`,
  "",
].join("\n");

if (checkOnly) {
  if (!existsSync(outputFile) || readFileSync(outputFile, "utf8") !== rendered) {
    throw new Error(`EDS-11R generated manager-relation registry drift: ${outputFile}`);
  }
  process.stdout.write(`EDS-11R manager-relation registry verified: ${outputFile}\n`);
} else {
  writeFileSync(outputFile, rendered, "utf8");
  process.stdout.write(`EDS-11R manager-relation registry written: ${outputFile}\n`);
}
