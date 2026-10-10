import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionProfileProjectionRepository, ProjectionScalar } from "./profile-projection.repository";
import { ManagerRelationOperation, ManagerRelationScalarKind, managerRelationProfileBinding } from "./eds11r-manager-relation.registry";
import type { MaximumDataOperationPrincipal, MaximumDataRelationQuery } from "./maximum-data-operation.service";
import { LocalRealtimeError } from "./profile-realtime.service";

export class RetainedOperationError extends LocalRealtimeError {}

/** Named local observation page. Never resolves an Edge cursor or writes a
 * continuation/cache/job. The signature binds actor, operation, profile,
 * workspace, page size and immutable view revision; expiry/key rotation apply. */
export async function retainedOperationPage(config: ControlApiConfig,
  repository: ExecutionProfileProjectionRepository, principal: MaximumDataOperationPrincipal,
  operation: ManagerRelationOperation, query: MaximumDataRelationQuery) {
  if (principal.workspaceId !== config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
    throw new RetainedOperationError("WORKSPACE_NOT_FOUND", 404);
  }
  const profile = managerRelationProfileBinding(query.environment).profileId;
  const snapshot = await repository.snapshot(principal.workspaceId, query.environment, profile);
  if (!snapshot) throw new RetainedOperationError("UDB_RETAINED_PROFILE_NOT_CAPTURED", 503);
  const relation = Object.values(snapshot.document.relations).find(r => r.relation === operation.relation);
  const items = relation?.availability === "AVAILABLE" ? relation.items : [];
  if (items.length > 10000) throw new RetainedOperationError("UDB_RETAINED_VIEW_ROW_BOUND", 503);
  const records = items.map(item => {
    const values: Record<string, string | number | boolean | null> = {};
    for (const field of operation.fields) {
      if (field.name in item.fields) values[field.name] = scalar(field.kind, item.fields[field.name]);
    }
    const identity = operation.identityFields.map(name => {
      if (values[name] === null || values[name] === undefined) throw new RetainedOperationError("UDB_RETAINED_ROW_IDENTITY_NOT_CAPTURED", 503);
      return `${name}\u0000${String(values[name])}`;
    });
    return { resource_id: `por1_${createHash("sha256").update(`${operation.operationId}\u0000${identity.join("\u0001")}`).digest("hex")}`, values };
  }).sort((a, b) => a.resource_id.localeCompare(b.resource_id));
  const binding = JSON.stringify([principal.workspaceId, principal.user.userId, principal.user.role,
    query.environment, profile, operation.operationId, query.limit, snapshot.payloadDigest]);
  const keys = querySigningKeys(config);
  const mac = (prefix: string, key: string) => createHmac("sha256", key).update(binding).update("\u0000" + prefix).digest("base64url");
  let offset = 0;
  if (query.cursor) {
    const match = /^ur1\.([A-Za-z0-9_-]{1,32})\.(\d{1,5})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(query.cursor);
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
    reason_code: captured ? "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" : "UDB_RETAINED_PANEL_NOT_CAPTURED",
    source_health: { availability: relation?.reason_code === "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" ? "UNAVAILABLE" : relation?.availability ?? "UNAVAILABLE", freshness: "STALE", completeness: "PARTIAL",
      as_of_ms: relation?.as_of ? Date.parse(relation.as_of) : null, global_sequence: null, retention_floor_ms: null,
      retention_floor_status: "UNDECLARED_BY_MANAGER_ENVELOPE", correction_observability: "NOT_OBSERVABLE_FROM_MANAGER_PAGE", replay_eligible: false },
    page: { next_cursor: next, has_more: hasMore, total_unknown: true, maximum_page_rows: 200,
      maximum_response_bytes: 1048576, truncated: false },
    state: captured ? "PARTIAL" : "UNAVAILABLE", records: page,
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 1048576) throw new RetainedOperationError("EDS11R_RESPONSE_TOO_LARGE", 502);
  return result;
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
