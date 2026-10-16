import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionProfileProjectionRepository, ProjectionScalar, ProfileProjectionSnapshot } from "./profile-projection.repository";
import { ManagerRelationOperation, ManagerRelationScalarKind, managerRelationProfileBinding } from "./eds11r-manager-relation.registry";
import type { MaximumDataOperationPrincipal, MaximumDataRelationQuery } from "./maximum-data-operation.service";
import { LocalRealtimeError } from "./profile-realtime.service";
import { AuthorizedExecutionReadScope, ExecutionReadScopes, ExecutionReadScopeError,
  scopeAllowsField, scopeReadPopulation, ReadScopePrincipal, ReadScopeRequirement } from "../execution-v2/read-scope";
import { projectionRowVisible } from "../execution-v2/read-projection";

/** Internal adapters share one publication identity. This is never accepted
 * from a browser, and the source revision is not returned as a scoped digest. */
export async function authorizeRetainedRelation(scopes: ExecutionReadScopes | undefined,
  principal: ReadScopePrincipal, environment: "paper" | "sandbox" | "live", profileId: string,
  sourceId: string, relation: string, snapshot?: Pick<ProfileProjectionSnapshot, "payloadDigest" | "projectionEpoch" | "sourceCatalogueSha256">,
  resource?: ReadScopeRequirement["resource"], action: ReadScopeRequirement["action"] = "alpha.read"): Promise<AuthorizedExecutionReadScope | undefined> {
  if (!scopes) return undefined; // Only old manual constructors; production injects the service.
  // An OWN_ALPHA grant is expressed on the Alpha, not by enumerating every
  // deployment. Authorize its qualified tuple collection, then require the
  // exact deployment before exposing existence; callers still narrow rows to it.
  const tupleDeployment = resource?.kind === "DEPLOYMENT" && action === "alpha.read";
  const result = await scopes.authorize(principal, { environment, profileId }, { action, ...(resource && !tupleDeployment ? { resource } : {}),
    ...(snapshot ? { dataset: { dataset_id: `relation:${sourceId}:${relation}`, source_revision: snapshot.payloadDigest,
      projection_generation: snapshot.projectionEpoch, catalogue_revision: snapshot.sourceCatalogueSha256,
      window: null } } : {}) });
  if (tupleDeployment && result.mode === "SCOPED_V2" &&
      !scopeReadPopulation(result).allowedTuples.some(tuple => tuple.deployment_id === resource.id))
    throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
  return result;
}

export function retainedRelationAction(relation: string): ReadScopeRequirement["action"] {
  if (["accounts", "account_balances", "margin_balances", "account_equity_snapshots", "account_sync_effective", "venue_accounts"].includes(relation)) return "account.read";
  if (["portfolios", "portfolio_equity_snapshots", "portfolio_allocations"].includes(relation)) return "portfolio.read";
  return "alpha.read";
}

/** Every browser-selectable Manager alias needs an explicit purpose. A business
 * ALL population is not custody, audit, technical or parent-child authority.
 * Null entries remain useful in explicit legacy mode; V2 publication must first
 * supply the missing purpose/lineage/finite field contract. No wildcard default. */
export const NAMED_RETAINED_PURPOSES = Object.freeze({
  account_balances: "account.read", account_policies: null, account_reservations: "account.read",
  account_sync_current_state: null, account_sync_effective: null, account_sync_snapshots: null,
  accounts: "account.read", alpha_risk_config: null, alphas: "alpha.read",
  broker_account_sync_current_state: null, broker_account_sync_effective: null, broker_account_sync_snapshots: null,
  broker_sync_state_history: null, broker_sync_valuation_current_state: null, broker_sync_valuation_history: null,
  command_ack_evidence: null, command_journal: null, conditional_order_group_legs: null,
  conditional_order_groups: "alpha.read", dead_letters: null, execution_replay_jobs: null,
  execution_sessions: "alpha.read", fills: "alpha.read", instrument_aliases: null,
  instrument_metadata_history: null, instruments: null, margin_balances: "account.read",
  operator_operations: null, order_bracket_legs: null, order_brackets: "alpha.read", orders: "alpha.read",
  paper_account_seed: "account.read", paper_matcher_config: null, paper_open_orders: "alpha.read",
  performance_projection_current_state: null, portfolio_allocations: "portfolio.read",
  portfolio_audit_current_state: null, portfolio_capital_ledger: "portfolio.read",
  portfolio_equity_snapshots: "portfolio.read", portfolios: "portfolio.read", positions_v2: "alpha.read",
  reconciliation_findings: null, reconciliation_observation_buckets: null, redis_transport_epochs: null,
  risk_grants: "alpha.read", risk_profiles: null, service_heartbeats: null, settlement_calendars: null,
  sizing_decisions: "alpha.read", strategies: "alpha.read", strategy_deployments: "alpha.read",
  traders: null, venue_accounts: null, venues: null,
} satisfies Record<string, ReadScopeRequirement["action"] | null>);

export function namedRetainedRelationAction(relation: string): ReadScopeRequirement["action"] {
  const action = Object.hasOwn(NAMED_RETAINED_PURPOSES, relation)
    ? NAMED_RETAINED_PURPOSES[relation as keyof typeof NAMED_RETAINED_PURPOSES] : null;
  if (!action) throw new RetainedOperationError("EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED", 503);
  return action;
}

export async function authorizeNamedRetainedRelation(scopes: ExecutionReadScopes | undefined,
  principal: ReadScopePrincipal, environment: "paper" | "sandbox" | "live", profileId: string,
  operation: ManagerRelationOperation, snapshot?: Pick<ProfileProjectionSnapshot, "payloadDigest" | "projectionEpoch" | "sourceCatalogueSha256">) {
  if (!scopes) return undefined;
  const mode = await scopes.selectionMode(principal);
  const action = mode === "SCOPED_V2" ? namedRetainedRelationAction(operation.relation) : retainedRelationAction(operation.relation);
  const scope = await authorizeRetainedRelation(scopes, principal, environment, profileId,
    operation.sourceId, operation.relation, snapshot, undefined, action);
  // Activation between routing and authorization cannot use a legacy purpose.
  if (scope?.mode === "SCOPED_V2" && namedRetainedRelationAction(operation.relation) !== action)
    throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
  return scope;
}

/** Raw Manager names mapped onto the reviewed public field vocabulary. Never
 * infer identity from display labels or expose custody/technical credentials. */
const RAW_PUBLIC_FIELD: Readonly<Record<string, string>> = Object.freeze({
  total: "balance_total", free: "balance_free", locked: "balance_locked", allocated_capital: "allocation",
  signed_qty: "quantity", position_qty: "quantity", avg_px_open: "price", avg_px_close: "price",
  mark_price: "price", symbol: "instrument_id", mode: "environment", submitted_at: "created_at",
  trade_time: "occurred_at_ms", ts: "timestamp_ms",
});
export function retainedFieldAllowed(scope: AuthorizedExecutionReadScope, name: string): boolean {
  return scope.mode === "LEGACY_COMPATIBILITY" || scopeAllowsField(scope, RAW_PUBLIC_FIELD[name] ?? name);
}
export function scopedRetainedRows<T extends { fields: Record<string, ProjectionScalar> }>(
  scope: AuthorizedExecutionReadScope | undefined, rows: readonly T[]): T[] {
  if (!scope || scope.mode === "LEGACY_COMPATIBILITY") return [...rows];
  return rows.filter(row => projectionRowVisible(scope, row.fields)).map(row => ({ ...row,
    fields: Object.fromEntries(Object.entries(row.fields).filter(([key, value]) => retainedFieldAllowed(scope, key) &&
      (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)))) }));
}
export async function fenceRetainedSnapshot(repository: ExecutionProfileProjectionRepository,
  workspaceId: string, environment: "paper" | "sandbox" | "live", profileId: string, snapshot: ProfileProjectionSnapshot) {
  if (snapshot.document.workspace_id !== workspaceId || snapshot.document.environment !== environment || snapshot.document.profile_id !== profileId)
    throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
  const current = await repository.snapshotMetadata(workspaceId, environment, profileId);
  if (!current || current.payloadDigest !== snapshot.payloadDigest || current.projectionEpoch !== snapshot.projectionEpoch ||
      current.sourceCatalogueSha256 !== snapshot.sourceCatalogueSha256)
    throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
}
export function retainedConfiguredProfile(config: ControlApiConfig, environment: "paper" | "sandbox" | "live") {
  const value = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID :
    environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!value) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  return value;
}

export class RetainedOperationError extends LocalRealtimeError {}

/** Named local observation page. Never resolves an Edge cursor or writes a
 * continuation/cache/job. The signature binds actor, operation, profile,
 * workspace, page size and immutable view revision; expiry/key rotation apply. */
export async function retainedOperationPage(config: ControlApiConfig,
  repository: ExecutionProfileProjectionRepository, principal: MaximumDataOperationPrincipal,
  operation: ManagerRelationOperation, query: MaximumDataRelationQuery, scopes?: ExecutionReadScopes) {
  if (principal.workspaceId !== config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
    throw new RetainedOperationError("WORKSPACE_NOT_FOUND", 404);
  }
  const profile = scopes ? retainedConfiguredProfile(config, query.environment) : managerRelationProfileBinding(query.environment).profileId;
  const metadata = scopes ? await repository.snapshotMetadata(principal.workspaceId, query.environment, profile) : null;
  const scope = await authorizeNamedRetainedRelation(scopes, principal, query.environment, profile, operation, metadata ?? undefined);
  const snapshot = scope?.mode === "SCOPED_V2" ? await repository.rawSnapshot(principal.workspaceId, query.environment, profile)
    : await repository.snapshot(principal.workspaceId, query.environment, profile);
  if (scope?.mode === "SCOPED_V2" && snapshot && (snapshot.payloadDigest !== metadata?.payloadDigest ||
      snapshot.projectionEpoch !== metadata?.projectionEpoch || snapshot.sourceCatalogueSha256 !== metadata?.sourceCatalogueSha256))
    throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
  if (!snapshot) throw new RetainedOperationError("UDB_RETAINED_PROFILE_NOT_CAPTURED", 503);
  const read = async () => {
  const scoped = scope?.mode === "SCOPED_V2";
  // Named catalogue aliases (`manager.current.*`) and the legacy ingestion
  // keys (`manager.*`) name the same registered relation. Resolve only a unique
  // retained relation; a duplicate is not authority to choose the first one.
  const matchingRelations = Object.values(snapshot.document.relations).filter(r => r.relation === operation.relation);
  if (scoped && matchingRelations.length > 1) throw new RetainedOperationError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
  const relation = matchingRelations[0];
  const rawItems = relation?.availability === "AVAILABLE" ? relation.items : [];
  if (rawItems.length > 10000) throw new RetainedOperationError("UDB_RETAINED_VIEW_ROW_BOUND", 503);
  const items = scopedRetainedRows(scope, rawItems);
  const records = items.map(item => {
    const values: Record<string, string | number | boolean | null> = {};
    for (const field of operation.fields) {
      if (field.name in item.fields) values[field.name] = scalar(field.kind, item.fields[field.name]);
    }
    const identity = operation.identityFields.map(name => {
      if (values[name] === null || values[name] === undefined) throw new RetainedOperationError(scoped ? "EXECUTION_READ_FIELD_POLICY_PENDING" : "UDB_RETAINED_ROW_IDENTITY_NOT_CAPTURED", 503);
      return `${name}\u0000${String(values[name])}`;
    });
    return { resource_id: `por1_${createHash("sha256").update(`${operation.operationId}\u0000${identity.join("\u0001")}`).digest("hex")}`, values };
  }).sort((a, b) => a.resource_id.localeCompare(b.resource_id));
  const binding = JSON.stringify([principal.workspaceId, principal.user.userId, principal.user.role,
    principal.session.sessionId, principal.session.sessionVersion, query.environment, profile, operation.operationId,
    query.limit, snapshot.payloadDigest, snapshot.projectionEpoch, snapshot.sourceCatalogueSha256, scope?.fingerprint ?? null]);
  const keys = querySigningKeys(config);
  const mac = (prefix: string, key: string) => createHmac("sha256", key).update(binding).update("\u0000" + prefix).digest("base64url");
  let offset = 0;
  if (query.cursor) {
    const match = /^ur1\.([A-Za-z0-9_-]{1,32})\.(\d{1,5})\.(\d{10})\.([A-Za-z0-9_-]{43})$(?![\s\S])/.exec(query.cursor);
    if (!match || !keys[match[1]] || Number(match[3]) <= Math.floor(Date.now() / 1000)) throw invalidCursor();
    const expected = Buffer.from(mac(query.cursor.slice(0, query.cursor.lastIndexOf(".")), keys[match[1]]));
    const received = Buffer.from(match[4]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw invalidCursor();
    offset = Number(match[2]);
    if (offset < 1 || offset >= records.length) throw invalidCursor();
  }
  const page = records.slice(offset, offset + query.limit);
  const hasMore = offset + page.length < records.length;
  const prefix = `ur1.${config.QUERY_CURSOR_ACTIVE_KEY_ID}.${offset + page.length}.${Math.floor(Date.now() / 1000) + config.QUERY_CURSOR_TTL_SECONDS}`;
  const next = hasMore ? `${prefix}.${mac(prefix, keys[config.QUERY_CURSOR_ACTIVE_KEY_ID])}` : null;
  const captured = records.length > 0;
  const result = {
    schema_version: "portal.execution.eds11r.manager-relation-page.v1",
    publication_revision: "portal.execution.eds11r.named-operation-manifest.v1",
    logical_operation_id: operation.operationId, field_id: operation.fieldId,
    record_authority: "PORTAL_CONTROL_API", read_profile: "retained_review_v1",
    record_basis: "PORTAL_RETAINED_OBSERVATION", environment: query.environment, profile_id: profile,
    source_contract_revision: snapshot.document.source_contract_revision,
    source_catalogue_sha256: snapshot.sourceCatalogueSha256,
    source_history_semantics: "BOUNDED_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_REPLAY",
    source_retention_semantics: "LOCAL_CAPTURE_ONLY_NO_TOTAL_HISTORY_CLAIM",
    reason_code: scoped ? "AUTHORIZED_RETAINED_OBSERVATIONS_ONLY" : captured ? "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" : "UDB_RETAINED_PANEL_NOT_CAPTURED",
    source_health: { availability: scoped ? captured ? "AVAILABLE" : "UNAVAILABLE"
      : relation?.reason_code === "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" ? "UNAVAILABLE" : relation?.availability ?? "UNAVAILABLE", freshness: "STALE", completeness: "PARTIAL",
      as_of_ms: scoped ? null : relation?.as_of ? Date.parse(relation.as_of) : null, global_sequence: null, retention_floor_ms: null,
      retention_floor_status: "UNDECLARED_BY_MANAGER_ENVELOPE", correction_observability: "NOT_OBSERVABLE_FROM_MANAGER_PAGE", replay_eligible: false },
    page: { next_cursor: next, has_more: hasMore, total_unknown: true, maximum_page_rows: 200,
      maximum_response_bytes: 1048576, truncated: false },
    state: captured || scoped ? "PARTIAL" : "UNAVAILABLE", records: page,
    ...(scoped ? { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", read_scope: {
      visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: scope.policyRevision } } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 1048576) throw new RetainedOperationError("EDS11R_RESPONSE_TOO_LARGE", 502);
  if (scoped) await fenceRetainedSnapshot(repository, principal.workspaceId, query.environment, profile, snapshot);
  return result;
  };
  return scope && scopes ? scopes.deliver(scope, read) : read();
}
function invalidCursor() { return new RetainedOperationError("UDB_RETAINED_CURSOR_INVALID_OR_STALE", 400); }
function scalar(kind: ManagerRelationScalarKind, value: ProjectionScalar): string | number | boolean | null {
  if (value === null) return null;
  if (kind === "TIMESTAMP" && typeof value === "string") {
    const ms = Date.parse(value); if (Number.isSafeInteger(ms)) return ms;
  }
  if (kind === "TEXT" && typeof value === "string" && Buffer.byteLength(value) <= 4096) return value;
  if (kind === "BOOLEAN" && typeof value === "boolean") return value;
  if ((kind === "DECIMAL" || kind === "INTEGER") && typeof value === "string" && value.length <= 96 &&
    (kind === "DECIMAL" ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^-?(?:0|[1-9]\d*)$/).test(value)) return value;
  if (kind === "INTEGER" && typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  // Never downcast a decimal, infer a timestamp or return arbitrary JSON.
  throw new RetainedOperationError("UDB_RETAINED_SCALAR_CONTRACT_REJECTED", 503);
}
