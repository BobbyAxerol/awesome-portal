/**
 * Hand-authored, ADDITIVE Manager relation operations that are NOT in the generated 54-operation registry.
 *
 * The generated registry compiles only SCREEN_BOUND relations of the sanitised census and refuses JSON values.
 * `domain_events` is PROJECTION_INPUT there, and its useful content sits in the jsonb `payload` column, which the
 * Manager serves only as a per-key allow-list (TS W2, 23 top-level keys). This module is the single place that
 * says which of those keys Portal may see and how they are typed. The generated file, its counts (96/54/16/13/13/42)
 * and `managerRelationOperationByRelation` are untouched: extra operations resolve only by route or operation id and
 * are served only by the native tuple-A path (the legacy/retained relation page refuses them).
 *
 * Owner decision (15 Nov 2026): Portal sees the projector payload keys below and NEVER `raw` or `payload.error_message`.
 */
import type { ManagerRelationFieldSelector, ManagerRelationOperation, ManagerRelationScalarKind } from "./eds11r-manager-relation.registry";

export interface ManagerPayloadProjectionKey {
  /** Top-level key inside the jsonb column. */
  readonly key: string;
  /** Flattened Portal field name. */
  readonly field: string;
  readonly kind: ManagerRelationScalarKind;
}

export interface ManagerPayloadProjection {
  readonly column: "payload";
  readonly keys: readonly ManagerPayloadProjectionKey[];
}

/** Exactly the 23 keys of the owner decision, with the kinds the projector writes (JSON numbers arrive as INTEGER or DECIMAL). */
const PAYLOAD_KEYS: readonly (readonly [string, ManagerRelationScalarKind])[] = Object.freeze([
  ["order_id", "TEXT"], ["client_order_id", "TEXT"], ["venue_order_id", "TEXT"], ["strategy_id", "TEXT"],
  ["account_id", "TEXT"], ["mode", "TEXT"], ["venue", "TEXT"], ["instrument_id", "TEXT"], ["symbol", "TEXT"],
  ["side", "TEXT"], ["position_side", "TEXT"], ["order_type", "TEXT"], ["time_in_force", "TEXT"],
  ["quantity", "DECIMAL"], ["price", "DECIMAL"], ["trigger_price", "DECIMAL"], ["status", "TEXT"],
  ["reduce_only", "BOOLEAN"], ["post_only", "BOOLEAN"], ["intent", "TEXT"], ["execution_session_id", "TEXT"],
  ["risk_grant_id", "TEXT"], ["error_code", "TEXT"],
] as const);

const PAYLOAD_PROJECTION: ManagerPayloadProjection = Object.freeze({
  column: "payload" as const,
  keys: Object.freeze(PAYLOAD_KEYS.map(([key, kind]) => Object.freeze({ key, field: `payload_${key}`, kind }))),
});

/**
 * Scalar columns of public.domain_events that Portal may see. Kinds come from the census column catalogue
 * (uuid/text -> TEXT, timestamptz -> TIMESTAMP). Never listed: `raw`, `payload` (only its allow-listed keys, flattened),
 * `instrument_metadata_version` (flagged MAY_CONTAIN_SENSITIVE_STRUCTURED_DATA by the census). The two `portal_*`
 * ledger columns are not in the October census pack; a field that the source does not advertise is simply absent.
 */
const SCALAR_FIELDS: readonly ManagerRelationFieldSelector[] = Object.freeze([
  ["canonical_contract_version", "TEXT"], ["causation_id", "TEXT"], ["client_order_id", "TEXT"], ["correlation_id", "TEXT"],
  ["created_at", "TIMESTAMP"], ["decision_digest", "TEXT"], ["engine_version", "TEXT"], ["event_id", "TEXT"],
  ["event_ts", "TIMESTAMP"], ["event_type", "TEXT"], ["account_id", "TEXT"], ["instrument_id", "TEXT"],
  ["message_type", "TEXT"], ["mode", "TEXT"], ["portal_event_operation", "TEXT"], ["portal_supersedes_event_id", "TEXT"],
  ["producer", "TEXT"], ["schema_version", "TEXT"], ["strategy_id", "TEXT"], ["trace_id", "TEXT"],
  ["trade_id", "TEXT"], ["trader_id", "TEXT"], ["venue", "TEXT"], ["venue_order_id", "TEXT"],
].map(([name, kind]) => Object.freeze({ name: name!, kind: kind as ManagerRelationScalarKind })));

const DOMAIN_EVENTS: ManagerRelationOperation = Object.freeze({
  operationId: "managerDomainEventsPageV1",
  routeId: "domain-events",
  fieldId: "managerDomainEventsCurrent",
  sourceId: "manager.current.domain-events",
  schema: "public" as const,
  relation: "domain_events",
  identityFields: Object.freeze(["event_id"]),
  identityDisposition: "DECLARED_PRIMARY_KEY",
  fields: Object.freeze([
    ...SCALAR_FIELDS,
    ...PAYLOAD_PROJECTION.keys.map((k) => Object.freeze({ name: k.field, kind: k.kind })),
    // Derived by Core, not a source column: the allow-listed payload keys whose value had the wrong kind (shown as null).
    Object.freeze({ name: "payload_unreadable_keys", kind: "TEXT" as const }),
  ].sort((a, b) => a.name.localeCompare(b.name))),
  sourceHistorySemantics: "E2_REQUIRED_NO_DML_OR_ROW_HISTORY_PROBE",
  sourceRetentionSemantics: "NOT_QUERIED_E1_NO_BUSINESS_ROW_ACCESS",
  screenIds: Object.freeze(["EXECUTION_ORDER_ACTIVITY_TIMELINE"]),
  payloadProjection: PAYLOAD_PROJECTION,
});

/** Operations outside the 54: counted separately, resolved by route/id only. */
export const EDS11R_MANAGER_EXTRA_OPERATIONS: readonly ManagerRelationOperation[] = Object.freeze([DOMAIN_EVENTS]);
