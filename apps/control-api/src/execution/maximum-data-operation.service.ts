import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { withTransaction } from "../db/pool";
import { accessDigest } from "../execution-v2/access-policy";
import { AccessPolicyError, type AccessActor, type ManagerDomainReadDecision } from "../execution-v2/access.contract";
import { evaluateManagerDomainRead } from "../execution-v2/current-human-snapshot";
import { selectedNativeBusinessReadSelection, selectedNativeBusinessReadInstallationExpiresAtMs,
  type SelectedNativeBusinessReadSource } from "../execution-v2/native-business-read-selected-source";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { ExecutionProfileProjectionRepository } from "./profile-projection.repository";
import { retainedReview } from "./retained-read-profile";
import { retainedOperationPage, authorizeNamedRetainedRelation, retainedConfiguredProfile, retainedRelationAction } from "./retained-operation-page";
import { ExecutionReadScopes, ExecutionReadScopeError, AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
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
  managerRelationOperationByRelation,
} from "./eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1, MaximumDataEnvironment } from "./maximum-data-intake";
import { managerTimestamp } from "./manager-timestamp";

// The continuation repository emits mdc1. plus a UUID (41 ASCII bytes).
// Reserve exactly that public size before persisting a private source cursor.
const CONTINUATION_SIZE_PLACEHOLDER = "mdc1.00000000-0000-4000-8000-000000000000";

const SOURCE_AVAILABILITY = new Set(["AVAILABLE", "UNAVAILABLE"]);
const SOURCE_FRESHNESS = new Set([
  "FRESH", "AGING", "DEGRADED", "STALE", "PAUSED", "UNAVAILABLE", "UNKNOWN",
]);
const SOURCE_COMPLETENESS = new Set([
  "COMPLETE", "PARTIAL", "POLL_BOUNDED", "EVENT_SOURCED", "UNKNOWN",
]);

export interface MaximumDataOperationPrincipal {
  /** Server-only cache/cursor correlation after current native READ, not authority. */
  readonly nativeEpochDigest?: string;
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
  viewerWorkspaceId?: string;
}

export interface MaximumDataDeploymentQuery {
  environment: MaximumDataEnvironment;
  limit: number;
  cursor?: string;
}

export interface MaximumDataRelationQuery extends MaximumDataDeploymentQuery {}

export type NativeManagerOperation = { kind:"DEPLOYMENTS" } | { kind:"RELATION"; route_id:string };

/** Server-only correlation after current READ, never an authority grant. */
export function nativeManagerDataEpoch(input:{
  actor:AccessActor;workspace_id:string;environment:"paper"|"sandbox"|"live";
  decision:ManagerDomainReadDecision;source:ReturnType<typeof selectedNativeBusinessReadSelection>;
  operation_id:string;base_query:Readonly<{limit:number}>;
}):string {
  return accessDigest({schema_version:"portal.native-manager-data-epoch.v1",
    actor:input.actor,workspace_id:input.workspace_id,environment:input.environment,
    authority_fingerprint:input.decision.authority_fingerprint,
    scope_digest:input.decision.scope_digest,field_policy_sha256:input.decision.field_policy_sha256,
    source_identity_digest:input.source.source_identity_digest,domain:input.source.domain,
    operation_id:input.operation_id,base_query:input.base_query});
}

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
    @Optional() @Inject(CONTROL_API_CONFIG) private readonly config?: ControlApiConfig,
    @Optional() @Inject(ExecutionProfileProjectionRepository) private readonly projection?: ExecutionProfileProjectionRepository,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(CONTROL_API_POOL) private readonly nativeCorePool?: Pool,
  ) {}

  async deploymentPage(
    principal: MaximumDataOperationPrincipal,
    query: MaximumDataDeploymentQuery,
  ) {
    const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > operation.pageBounds.maximumRows) {
      throw new MaximumDataOperationError("EDS01_OPERATION_QUERY_INVALID", 400);
    }
    const operationScope = await this.authorizeOperation(principal, managerRelationOperationByRelation(operation.relation)!, query);
    const read = async () => {
    if (retainedReview(this.config) || operationScope?.mode === "SCOPED_V2") {
      const page = await retainedOperationPage(this.config!, this.projection!, principal,
        managerRelationOperationByRelation(operation.relation)!, query, this.readScopes);
      return { ...page, schema_version: "portal.execution.maximum-data.deployment-page.v1",
        publication_revision: operation.publicationRevision, logical_operation_id: operation.logicalOperationId,
        field_id: operation.fieldId, records: page.records.map(row => row.values) };
    }
    return this.prepareDeploymentData(principal,query);
    };
    return operationScope && this.readScopes ? this.readScopes.deliver(operationScope, read) : read();
  }

  /** Same safe DTO/source/cache path, authority is resolved by the caller above. */
  private async prepareDeploymentData(principal:MaximumDataOperationPrincipal,query:MaximumDataDeploymentQuery){
    const operation=MAXIMUM_DATA_DEPLOYMENT_OPERATION;
    const binding = maximumDataDeploymentBinding(query.environment);
    const scope = continuationScope(principal, query.environment);
    const sourceCursor = query.cursor
      ? await this.continuations.resolve(scope, query.cursor)
      : undefined;

    const response = await this.currentSource.relationForNamedOperation(
      { user: principal.user, session: principal.session, workspaceId: principal.workspaceId,
        ...(principal.nativeEpochDigest !== undefined ? { nativeEpochDigest: principal.nativeEpochDigest } : {}) },
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
    const operationScope = await this.authorizeOperation(principal, operation, query);
    const read = async () => {
    if (retainedReview(this.config) || operationScope?.mode === "SCOPED_V2")
      return retainedOperationPage(this.config!, this.projection!, principal, operation, query, this.readScopes);
    return this.prepareRelationData(principal,operation,query);
    };
    return operationScope && this.readScopes ? this.readScopes.deliver(operationScope, read) : read();
  }

  private async prepareRelationData(principal:MaximumDataOperationPrincipal,operation:ManagerRelationOperation,
    query:MaximumDataRelationQuery){
    const binding = managerRelationProfileBinding(query.environment);
    const scope = relationContinuationScope(principal, query.environment, operation);
    const sourceCursor = query.cursor
      ? await this.continuations.resolve(scope, query.cursor)
      : undefined;
    const response = await this.currentSource.relationForCataloguedOperation(
      { user: principal.user, session: principal.session, workspaceId: principal.workspaceId,
        ...(principal.nativeEpochDigest !== undefined ? { nativeEpochDigest: principal.nativeEpochDigest } : {}) },
      query.environment,
      managerRelationOperationPolicy(operation, query.environment),
      { limit: query.limit, ...(sourceCursor ? { cursor: sourceCursor } : {}) },
    );
    return this.translateRelationPage(response, operation, query, scope, binding.profileId);
  }

  /** PRIVATE selected consumer preparation. Genuine selected source and actual
   * current Core domain READ are mandatory; no ENTITY/ROOT inference or switch
   * on epoch JSON. Existing public methods keep their full readScopes behavior.
   * This returns private bytes only; Candidate still owns final authorization
   * and physical send after the last source/cache await. */
  async prepareNativeManagerPage(expectedPool:Pool,principal:MaximumDataOperationPrincipal,
    operation:NativeManagerOperation,query:MaximumDataDeploymentQuery,source:SelectedNativeBusinessReadSource){
    if(!this.nativeCorePool||this.nativeCorePool!==expectedPool)
      throw new MaximumDataOperationError("NATIVE_MANAGER_READ_UNAVAILABLE",503);
    const selected=selectedNativeBusinessReadSelection(source);
    const relation=operation.kind==="RELATION"?managerRelationOperationByRoute(operation.route_id):undefined;
    if(operation.kind!=="DEPLOYMENTS"&&!relation||!Number.isInteger(query.limit)||query.limit<1||query.limit>200||
      !["paper","sandbox","live"].includes(query.environment)||
      query.cursor!==undefined&&(typeof query.cursor!=="string"||query.cursor.length<1||query.cursor.length>128))
      throw new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED",403);
    const profile=operation.kind==="DEPLOYMENTS"?maximumDataDeploymentBinding(query.environment).profileId:
      managerRelationProfileBinding(query.environment).profileId;
    const catalogue=operation.kind==="DEPLOYMENTS"?MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256:
      MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
    if(selected.binding.subject!==principal.user.userId||selected.human.portal_user_id!==principal.user.userId||
      selected.binding.workspace_id!==principal.workspaceId||selected.binding.environment!==query.environment||
      selected.domain.profile_id!==profile||selected.domain.catalogue_sha256!==catalogue.slice(7)||
      Date.now()>=selectedNativeBusinessReadInstallationExpiresAtMs(source))
      throw new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED",403);
    const actor:AccessActor={user_id:principal.user.userId,session_id:principal.session.sessionId,
      session_generation:principal.session.sessionVersion};
    let decision:ManagerDomainReadDecision;
    try {
      decision=await withTransaction(this.nativeCorePool,db=>evaluateManagerDomainRead(db,{
        actor,workspace_id:principal.workspaceId,environment:query.environment,domain:selected.domain}));
    } catch(error) {
      // The existing HTTP filter handles MaximumDataOperationError, not the
      // private policy exception. Preserve its finite public reason/status;
      // a genuine current revoke must not become an opaque500 or legacy read.
      // Unexpected exceptions remain unexpected; never serialize their text.
      if(error instanceof AccessPolicyError) throw new MaximumDataOperationError(error.code,error.status);
      throw error;
    }
    if(decision.actor.user_id!==actor.user_id||decision.actor.session_id!==actor.session_id||
      decision.actor.session_generation!==actor.session_generation||
      decision.field_policy_sha256!==selected.domain.field_policy_sha256||Date.now()>=decision.valid_until_ms)
      throw new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED",403);
    const nativeEpochDigest=nativeManagerDataEpoch({actor,workspace_id:principal.workspaceId,
      environment:query.environment,decision,source:selected,
      operation_id:operation.kind==="DEPLOYMENTS"?MAXIMUM_DATA_DEPLOYMENT_OPERATION.logicalOperationId:relation!.operationId,
      base_query:{limit:query.limit}});
    const privatePrincipal={...principal,nativeEpochDigest};
    const dto=operation.kind==="DEPLOYMENTS"?await this.prepareDeploymentData(privatePrincipal,query):
      await this.prepareRelationData(privatePrincipal,relation!,query);
    return {decision,dto,nativeEpochDigest};
  }

  private async authorizeOperation(principal: MaximumDataOperationPrincipal, operation: ManagerRelationOperation,
    query: MaximumDataRelationQuery): Promise<AuthorizedExecutionReadScope | undefined> {
    if (!this.readScopes) return undefined;
    if (!this.config) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    if (!retainedReview(this.config) && this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      // Explicit current-source legacy reads do not require a retained workspace
      // or local snapshot. Mint current actor/membership authority, not a routing
      // probe; deliver() rechecks it before and after source work. V2/sticky
      // activation cannot mint this dataset-less collection capability and must
      // fail before upstream (including after deletion of an activated policy).
      const scope = await this.readScopes.authorize(principal,
        { environment: query.environment, profileId: managerRelationProfileBinding(query.environment).profileId },
        { action: retainedRelationAction(operation.relation) });
      if (scope.mode !== "LEGACY_COMPATIBILITY")
        throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      return scope;
    }
    if (!this.projection) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const profile = retainedConfiguredProfile(this.config, query.environment);
    if (principal.workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const snapshot = await this.projection.snapshotMetadata(principal.workspaceId, query.environment, profile);
    // A V2 caller without a qualified local population fails here. It never
    // takes a source first-page path whose hidden population cannot be scoped.
    return authorizeNamedRetainedRelation(this.readScopes, principal, query.environment, profile,
      operation, snapshot ?? undefined);
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
    if (!Array.isArray(data.items) || data.items.length > query.limit || data.items.length > operation.pageBounds.maximumRows) {
      throw sourceContractRejected();
    }
    const records = data.items.map((item) => deploymentRecord(item));
    const sourceCursor = optionalCursor(data.next_cursor, operation.pageBounds.maximumCursorBytes);
    const nextCursor = sourceCursor ? CONTINUATION_SIZE_PLACEHOLDER : null;
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
    if (sourceCursor) result.page.next_cursor = await this.continuations.issue(scope, sourceCursor);
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
    if (!Array.isArray(data.items) || data.items.length > query.limit || data.items.length > MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows) {
      throw relationSourceContractRejected();
    }
    const records = data.items.map((item) => managerRelationRecord(item, operation));
    const sourceCursor = optionalCursor(data.next_cursor, MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumCursorBytes);
    const nextCursor = sourceCursor ? CONTINUATION_SIZE_PLACEHOLDER : null;
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
    if (sourceCursor) result.page.next_cursor = await this.continuations.issue(scope, sourceCursor);
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
    ...(principal.nativeEpochDigest !== undefined ? { nativeEpochDigest: principal.nativeEpochDigest } : {}),
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
    ...(principal.nativeEpochDigest !== undefined ? { nativeEpochDigest: principal.nativeEpochDigest } : {}),
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
    const kind = operation.fields.find(f => f.name === field)?.kind;
    const key = kind === "TIMESTAMP" ? managerTimestamp(asRelationObject(fields[field]).value)?.identity : String(value);
    if (key === undefined) throw relationSourceContractRejected();
    return `${field}\u0000${key}`;
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
  return managerTimestamp(value)?.milliseconds ?? null;
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
