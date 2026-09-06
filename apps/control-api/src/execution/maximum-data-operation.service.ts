import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionCurrentSourceProxy } from "./current-source.proxy";
import {
  MaximumDataContinuationRepository,
  MaximumDataContinuationScope,
} from "./maximum-data-continuation.repository";
import {
  MAXIMUM_DATA_DEPLOYMENT_OPERATION,
  maximumDataDeploymentBinding,
  maximumDataDeploymentPolicy,
} from "./maximum-data-operation.registry";
import {
  ManagerRelationScalarKind,
  ManagerRelationOperation,
  managerRelationOperationByRoute,
  managerRelationOperationPolicy,
  managerRelationProfileBinding,
} from "./eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1, MaximumDataEnvironment } from "./maximum-data-intake";

const SOURCE_AVAILABILITY = new Set(["AVAILABLE", "UNAVAILABLE"]);
const SOURCE_FRESHNESS = new Set([
  "FRESH", "AGING", "DEGRADED", "STALE", "PAUSED", "UNAVAILABLE", "UNKNOWN",
]);
const SOURCE_COMPLETENESS = new Set([
  "COMPLETE", "PARTIAL", "POLL_BOUNDED", "EVENT_SOURCED", "UNKNOWN",
]);

export interface MaximumDataOperationPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

export interface MaximumDataDeploymentQuery {
  environment: MaximumDataEnvironment;
  limit: number;
  cursor?: string;
}

export interface MaximumDataRelationQuery extends MaximumDataDeploymentQuery {}

export class MaximumDataOperationError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

/**
 * One named E5 vertical.  It accepts a browser session only to mint a
 * short-lived server-side delegated assertion through ExecutionCurrentSourceProxy;
 * no source address, relation, schema, credential, mTLS material, record key
 * or source cursor ever crosses the same-origin response boundary.
 */
@Injectable()
export class MaximumDataOperationService {
  constructor(
    @Inject(ExecutionCurrentSourceProxy) private readonly currentSource: ExecutionCurrentSourceProxy,
    @Inject(MaximumDataContinuationRepository)
    private readonly continuations: MaximumDataContinuationRepository,
  ) {}

  async deploymentPage(
    principal: MaximumDataOperationPrincipal,
    query: MaximumDataDeploymentQuery,
  ) {
    const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > operation.pageBounds.maximumRows) {
      throw new MaximumDataOperationError("EDS01_OPERATION_QUERY_INVALID", 400);
    }
    const binding = maximumDataDeploymentBinding(query.environment);
    const scope = continuationScope(principal, query.environment);
    const sourceCursor = query.cursor
      ? await this.continuations.resolve(scope, query.cursor)
      : undefined;

    const response = await this.currentSource.relationForNamedOperation(
      { user: principal.user, session: principal.session, workspaceId: principal.workspaceId },
      query.environment,
      binding.screenId,
      operation.sourceId,
      operation.relation,
      { limit: query.limit, ...(sourceCursor ? { cursor: sourceCursor } : {}) },
      maximumDataDeploymentPolicy(query.environment),
    );
    return this.translateDeploymentPage(response, query, scope);
  }

  /**
   * EDS-11R1's only browser-selectable value is a static Portal operation
   * route.  It resolves through the generated 54-operation registry; neither
   * a schema nor a Manager relation/cursor can be supplied by the caller.
   */
  async relationPage(
    principal: MaximumDataOperationPrincipal,
    routeId: string,
    query: MaximumDataRelationQuery,
  ) {
    const operation = managerRelationOperationByRoute(routeId);
    if (!operation) throw new MaximumDataOperationError("EDS11R_OPERATION_NOT_FOUND", 404);
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows) {
      throw new MaximumDataOperationError("EDS11R_OPERATION_QUERY_INVALID", 400);
    }
    const binding = managerRelationProfileBinding(query.environment);
    const scope = relationContinuationScope(principal, query.environment, operation);
    const sourceCursor = query.cursor
      ? await this.continuations.resolve(scope, query.cursor)
      : undefined;
    const response = await this.currentSource.relationForCataloguedOperation(
      { user: principal.user, session: principal.session, workspaceId: principal.workspaceId },
      query.environment,
      managerRelationOperationPolicy(operation, query.environment),
      { limit: query.limit, ...(sourceCursor ? { cursor: sourceCursor } : {}) },
    );
    return this.translateRelationPage(response, operation, query, scope, binding.profileId);
  }

  private async translateDeploymentPage(
    response: unknown,
    query: MaximumDataDeploymentQuery,
    scope: MaximumDataContinuationScope,
  ) {
    const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
    const binding = maximumDataDeploymentBinding(query.environment);
    const bff = asObject(response);
    if (
      bff.schema_version !== "portal.execution.current-source-bff.v2" ||
      bff.authority !== "PORTAL_CONTROL_API" ||
      bff.requested_environment !== query.environment ||
      bff.source_environment !== query.environment ||
      bff.profile_id !== binding.profileId
    ) throw sourceContractRejected();

    const source = asObject(bff.source);
    if (
      source.contract_version !== operation.sourceContractRevision ||
      source.authority !== "EXECUTION_CELL" ||
      source.profile_id !== binding.profileId ||
      source.catalogue_sha256 !== operation.sourceCatalogueSha256 ||
      !SOURCE_AVAILABILITY.has(string(source.availability))
    ) throw sourceContractRejected();

    // Manager authoritative unavailability remains an error rather than a
    // fabricated empty page.  Most source failures arrive as typed HTTP
    // statuses from the proxy; this covers a defensively decoded 2xx envelope.
    if (source.availability !== "AVAILABLE") {
      throw new MaximumDataOperationError("EDS01_SOURCE_UNAVAILABLE", 503);
    }

    const freshness = source.freshness;
    const completeness = source.completeness;
    const asOfMs = timestampMilliseconds(source.as_of);
    if (
      typeof freshness !== "string" || !SOURCE_FRESHNESS.has(freshness) ||
      typeof completeness !== "string" || !SOURCE_COMPLETENESS.has(completeness) ||
      asOfMs === null
    ) throw sourceContractRejected();

    const data = asObject(source.data);
    const relation = asObject(data.relation);
    if (relation.schema !== operation.schema || relation.relation !== operation.relation) {
      throw sourceContractRejected();
    }
    if (!Array.isArray(data.items) || data.items.length > operation.pageBounds.maximumRows) {
      throw sourceContractRejected();
    }
    const records = data.items.map((item) => deploymentRecord(item));
    const sourceCursor = optionalCursor(data.next_cursor, operation.pageBounds.maximumCursorBytes);
    const nextCursor = sourceCursor
      ? await this.continuations.issue(scope, sourceCursor)
      : null;
    const state = pageState(freshness, completeness, records.length);

    const result = {
      schema_version: "portal.execution.maximum-data.deployment-page.v1",
      publication_revision: operation.publicationRevision,
      logical_operation_id: operation.logicalOperationId,
      field_id: operation.fieldId,
      record_authority: "PORTAL_CONTROL_API",
      environment: query.environment,
      profile_id: binding.profileId,
      source_contract_revision: operation.sourceContractRevision,
      source_catalogue_sha256: operation.sourceCatalogueSha256,
      source_history_semantics: operation.sourceHistorySemantics,
      source_health: {
        availability: source.availability,
        freshness,
        completeness,
        as_of_ms: asOfMs,
        global_sequence: null,
        retention_floor_ms: null,
        retention_floor_status: "UNDECLARED_BY_MANAGER_ENVELOPE",
        correction_observability: "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
        replay_eligible: false,
      },
      page: {
        next_cursor: nextCursor,
        has_more: nextCursor !== null,
        total_unknown: true,
        maximum_page_rows: operation.pageBounds.maximumRows,
        maximum_response_bytes: operation.pageBounds.maximumResponseBytes,
        truncated: false,
      },
      state,
      records,
    };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > operation.pageBounds.maximumResponseBytes) {
      throw new MaximumDataOperationError("EDS01_RESPONSE_TOO_LARGE", 502);
    }
    return result;
  }

  private async translateRelationPage(
    response: unknown,
    operation: ManagerRelationOperation,
    query: MaximumDataRelationQuery,
    scope: MaximumDataContinuationScope,
    expectedProfileId: string,
  ) {
    const bff = asRelationObject(response);
    if (
      bff.schema_version !== "portal.execution.current-source-bff.v2" ||
      bff.authority !== "PORTAL_CONTROL_API" ||
      bff.requested_environment !== query.environment ||
      bff.source_environment !== query.environment ||
      bff.profile_id !== expectedProfileId
    ) throw relationSourceContractRejected();

    const source = asRelationObject(bff.source);
    if (
      source.contract_version !== MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision ||
      source.authority !== "EXECUTION_CELL" ||
      source.profile_id !== expectedProfileId ||
      source.catalogue_sha256 !== MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest ||
      !SOURCE_AVAILABILITY.has(string(source.availability))
    ) throw relationSourceContractRejected();
    if (source.availability !== "AVAILABLE") {
      throw new MaximumDataOperationError("EDS11R_SOURCE_UNAVAILABLE", 503);
    }

    const freshness = source.freshness;
    const completeness = source.completeness;
    const asOfMs = timestampMilliseconds(source.as_of);
    if (
      typeof freshness !== "string" || !SOURCE_FRESHNESS.has(freshness) ||
      typeof completeness !== "string" || !SOURCE_COMPLETENESS.has(completeness) ||
      asOfMs === null
    ) throw relationSourceContractRejected();

    const data = asRelationObject(source.data);
    const relation = asRelationObject(data.relation);
    if (relation.schema !== operation.schema || relation.relation !== operation.relation) {
      throw relationSourceContractRejected();
    }
    if (!Array.isArray(data.items) || data.items.length > MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows) {
      throw relationSourceContractRejected();
    }
    const records = data.items.map((item) => managerRelationRecord(item, operation));
    const sourceCursor = optionalCursor(data.next_cursor, MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumCursorBytes);
    const nextCursor = sourceCursor
      ? await this.continuations.issue(scope, sourceCursor)
      : null;
    const state = pageState(freshness, completeness, records.length);
    const result = {
      schema_version: "portal.execution.eds11r.manager-relation-page.v1",
      publication_revision: "portal.execution.eds11r.named-operation-manifest.v1",
      logical_operation_id: operation.operationId,
      field_id: operation.fieldId,
      record_authority: "PORTAL_CONTROL_API",
      environment: query.environment,
      profile_id: expectedProfileId,
      source_contract_revision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
      source_catalogue_sha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      source_history_semantics: operation.sourceHistorySemantics,
      source_retention_semantics: operation.sourceRetentionSemantics,
      source_health: {
        availability: source.availability,
        freshness,
        completeness,
        as_of_ms: asOfMs,
        global_sequence: null,
        retention_floor_ms: null,
        retention_floor_status: "UNDECLARED_BY_MANAGER_ENVELOPE",
        correction_observability: "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
        replay_eligible: false,
      },
      page: {
        next_cursor: nextCursor,
        has_more: nextCursor !== null,
        total_unknown: true,
        maximum_page_rows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
        maximum_response_bytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
        truncated: false,
      },
      state,
      records,
    };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes) {
      throw new MaximumDataOperationError("EDS11R_RESPONSE_TOO_LARGE", 502);
    }
    return result;
  }
}

function continuationScope(
  principal: MaximumDataOperationPrincipal,
  environment: MaximumDataEnvironment,
): MaximumDataContinuationScope {
  const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
  return {
    operationId: operation.logicalOperationId,
    workspaceId: principal.workspaceId,
    principalId: principal.user.userId,
    principalRole: principal.user.role,
    environment,
    profileId: maximumDataDeploymentBinding(environment).profileId,
    sourceContractRevision: operation.sourceContractRevision,
    sourceCatalogueSha256: operation.sourceCatalogueSha256,
  };
}

function relationContinuationScope(
  principal: MaximumDataOperationPrincipal,
  environment: MaximumDataEnvironment,
  operation: ManagerRelationOperation,
): MaximumDataContinuationScope {
  return {
    operationId: operation.operationId,
    workspaceId: principal.workspaceId,
    principalId: principal.user.userId,
    principalRole: principal.user.role,
    environment,
    profileId: managerRelationProfileBinding(environment).profileId,
    sourceContractRevision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
    sourceCatalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
  };
}

type SafeManagerScalar = boolean | number | string | null;

function managerRelationRecord(
  value: unknown,
  operation: ManagerRelationOperation,
): { resource_id: string; values: Record<string, SafeManagerScalar> } {
  const record = asRelationObject(value);
  const relation = asRelationObject(record.relation);
  if (relation.schema !== operation.schema || relation.relation !== operation.relation) {
    throw relationSourceContractRejected();
  }
  const fields = asRelationObject(record.fields);
  const values: Record<string, SafeManagerScalar> = {};
  for (const field of operation.fields) {
    if (!(field.name in fields)) continue;
    values[field.name] = decodeManagerScalar(field.kind, fields[field.name]);
  }
  const identity = operation.identityFields.map((field) => {
    const value = values[field];
    if (value === undefined || value === null) throw relationSourceContractRejected();
    return `${field}\u0000${String(value)}`;
  });
  return {
    // This Portal-generated digest is not the raw Manager `record_key`. It is
    // stable only within the named product operation and its documented safe
    // identity fields, so it cannot be replayed as an upstream key.
    resource_id: `por1_${createHash("sha256")
      .update(`${operation.operationId}\u0000${identity.join("\u0001")}`, "utf8")
      .digest("hex")}`,
    values,
  };
}

function decodeManagerScalar(
  expectedKind: ManagerRelationScalarKind,
  encoded: unknown,
): SafeManagerScalar {
  const value = asRelationObject(encoded);
  if (value.kind === "NULL") {
    if (value.value !== null) throw relationSourceContractRejected();
    return null;
  }
  if (value.kind !== expectedKind) throw relationSourceContractRejected();
  if (expectedKind === "BOOLEAN") {
    if (typeof value.value !== "boolean") throw relationSourceContractRejected();
    return value.value;
  }
  if (expectedKind === "TIMESTAMP") {
    const milliseconds = timestampMilliseconds(value.value);
    if (milliseconds === null) throw relationSourceContractRejected();
    return milliseconds;
  }
  if (expectedKind === "TEXT") {
    if (typeof value.value !== "string" || Buffer.byteLength(value.value, "utf8") > 4_096) {
      throw relationSourceContractRejected();
    }
    return value.value;
  }
  if (expectedKind === "DECIMAL") {
    if (
      typeof value.value !== "string" ||
      value.value.length > 96 ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.value)
    ) throw relationSourceContractRejected();
    return value.value;
  }
  if (expectedKind === "INTEGER") {
    const integer = typeof value.value === "number"
      ? Number.isSafeInteger(value.value) ? String(value.value) : null
      : typeof value.value === "string" ? value.value : null;
    if (!integer || integer.length > 96 || !/^-?(?:0|[1-9]\d*)$/.test(integer)) {
      throw relationSourceContractRejected();
    }
    // Bigints remain strings to prevent JavaScript precision loss in a
    // product DTO. A consumer can safely format a counter after an explicit
    // range check; it cannot silently downcast an accounting value.
    return integer;
  }
  throw relationSourceContractRejected();
}

function deploymentRecord(value: unknown): Record<string, unknown> {
  const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
  const record = asObject(value);
  const relation = asObject(record.relation);
  if (relation.schema !== operation.schema || relation.relation !== operation.relation) {
    throw sourceContractRejected();
  }
  const fields = asObject(record.fields);
  const output: Record<string, unknown> = {};
  for (const field of operation.allowedFields) {
    if (!(field in fields)) continue;
    const decoded = decodeField(field, fields[field]);
    if (decoded !== undefined) output[field] = decoded;
  }
  if (typeof output.deployment_id !== "string" || output.deployment_id.length < 1) {
    throw sourceContractRejected();
  }
  return output;
}

function decodeField(field: string, encoded: unknown): unknown {
  const value = asObject(encoded);
  const kind = value.kind;
  if (kind === "NULL") return null;
  if (field === "active") {
    if (kind !== "BOOLEAN" || typeof value.value !== "boolean") throw sourceContractRejected();
    return value.value;
  }
  if (field === "created_at" || field === "updated_at") {
    if (kind !== "TIMESTAMP" || typeof value.value !== "string") throw sourceContractRejected();
    const milliseconds = timestampMilliseconds(value.value);
    if (milliseconds === null) throw sourceContractRejected();
    return milliseconds;
  }
  if (kind !== "TEXT" || typeof value.value !== "string") throw sourceContractRejected();
  if (Buffer.byteLength(value.value, "utf8") > 4_096) throw sourceContractRejected();
  return value.value;
}

function optionalCursor(value: unknown, maximumBytes: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw sourceContractRejected();
  }
  return value;
}

function pageState(
  freshness: string,
  completeness: string,
  recordCount: number,
): "POPULATED" | "EMPTY" | "PARTIAL" | "STALE" {
  if (freshness === "STALE" || freshness === "PAUSED" || freshness === "UNAVAILABLE") return "STALE";
  if (completeness !== "COMPLETE") return "PARTIAL";
  return recordCount === 0 ? "EMPTY" : "POPULATED";
}

function timestampMilliseconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 8_640_000_000_000_000) return null;
  return parsed;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw sourceContractRejected();
  return value as Record<string, unknown>;
}

function asRelationObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw relationSourceContractRejected();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sourceContractRejected(): MaximumDataOperationError {
  return new MaximumDataOperationError("EDS01_SOURCE_CONTRACT_REJECTED", 502);
}

function relationSourceContractRejected(): MaximumDataOperationError {
  return new MaximumDataOperationError("EDS11R_SOURCE_CONTRACT_REJECTED", 502);
}
