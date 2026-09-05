import type { components } from "@portal/contracts-screen-data";

export type ContractAuthorityResponse = components["schemas"]["ContractAuthorityResponse"];
export type GeneratedPanelEnvelope = components["schemas"]["PanelEnvelope"];
export type GeneratedExactDecimal = components["schemas"]["ExactDecimal"];

declare const utcEpochMsBrand: unique symbol;
declare const exactDecimalBrand: unique symbol;
declare const opaqueIdentifierBrand: unique symbol;

export type UtcEpochMs = number & { readonly [utcEpochMsBrand]: "UtcEpochMs" };
export type ExactDecimalString = string & { readonly [exactDecimalBrand]: "ExactDecimal" };
export type OpaqueIdentifier = string & { readonly [opaqueIdentifierBrand]: "OpaqueIdentifier" };

export const EDS02_PANEL_STATES = [
  "READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "DENIED", "ERROR",
] as const;
type PanelState = (typeof EDS02_PANEL_STATES)[number];

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const DATE_RANGE_MS = 8_640_000_000_000_000;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const UTC_CLOCK_FIELDS = [
  "event_time_ms",
  "source_published_at_ms",
  "received_at_ms",
  "ingested_at_ms",
  "processed_at_ms",
  "as_of_ms",
  "read_at_ms",
] as const;
const COVERAGE_FIELDS = [
  "from_ms",
  "to_ms",
  "source_total",
  "filtered_total",
  "returned_count",
  "truncated",
  "downsampled",
  "has_more",
  "next_cursor",
  "gaps",
] as const;
const SOURCE_AUTHORITIES = [
  "DATA_LAYER_OR_MARKET_SERVICE",
  "MARKET_SERVICE",
  "PORTAL_CONTROL",
  "PORTAL_EDGE",
  "TRADING_SYSTEM",
  "TRADING_SYSTEM_OR_RESEARCH",
] as const;
const DELIVERY_PROFILES = ["PAPER", "SANDBOX", "LIVE", "CANARY"] as const;
const ACTION_AVAILABILITY = ["AVAILABLE", "DISABLED", "OWNER_ACTION_REQUIRED", "TYPED_UNAVAILABLE"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function identifier(value: unknown): value is string {
  return boundedText(value, 191);
}

function nullableUtcEpochMs(value: unknown): boolean {
  return value === null || readUtcEpochMs(value) !== null;
}

function nullableUnsignedInteger(value: unknown): boolean {
  return value === null || (typeof value === "string" && /^[0-9]+$/.test(value));
}

function exactMembers(values: unknown, expected: readonly string[]): boolean {
  return Array.isArray(values) && values.length === expected.length &&
    new Set(values).size === expected.length && values.every((value) => typeof value === "string" && expected.includes(value));
}

function validProfiles(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= DELIVERY_PROFILES.length &&
    new Set(value).size === value.length && value.every((profile) => DELIVERY_PROFILES.includes(profile as never));
}

function validSourceReadiness(value: unknown): boolean {
  const readiness = record(value);
  return readiness !== null && exactKeys(readiness, [
    "state", "reason_code", "history_semantics", "timestamp_contract", "decimal_contract",
    "source_revision", "profiles", "portal_can_proceed",
  ]) && boundedText(readiness.state, 128) && boundedText(readiness.reason_code, 128) &&
    boundedText(readiness.history_semantics, 256) && readiness.timestamp_contract === "UTC_EPOCH_MS" &&
    readiness.decimal_contract === "EXACT_DECIMAL_STRING" && boundedText(readiness.source_revision, 256) &&
    validProfiles(readiness.profiles) && typeof readiness.portal_can_proceed === "boolean";
}

function validRuntimeDelivery(value: unknown): boolean {
  const delivery = record(value);
  return delivery !== null && exactKeys(delivery, [
    "state", "implementation", "typed_status_code", "typed_absence_id", "profiles",
    "source_probe_performed_by_this_request",
  ]) && boundedText(delivery.state, 128) && boundedText(delivery.implementation, 128) &&
    (delivery.typed_status_code === null || boundedText(delivery.typed_status_code, 128)) &&
    (delivery.typed_absence_id === null || boundedText(delivery.typed_absence_id, 128)) &&
    validProfiles(delivery.profiles) && delivery.source_probe_performed_by_this_request === false;
}

function validFormulaLineage(value: unknown): boolean {
  if (value === null) return true;
  const lineage = record(value);
  return lineage !== null && exactKeys(lineage, [
    "formula_id", "formula_version", "input_revision_field", "input_digest_field", "composite_read_revision_field",
  ]) && identifier(lineage.formula_id) && identifier(lineage.formula_version) &&
    lineage.input_revision_field === "input_revision" && lineage.input_digest_field === "input_digest" &&
    lineage.composite_read_revision_field === "composite_read_revision";
}

function validPanelDefinition(value: unknown): boolean {
  const panel = record(value);
  if (!panel || !exactKeys(panel, [
    "panel_id", "field_id", "frontend_field_path", "visible_meaning", "required", "source_authority",
    "contract_readiness", "source_readiness", "runtime_delivery", "source_history_semantics",
    "freshness_requirement", "value_contract", "coverage_contract", "formula_lineage",
  ])) return false;
  const valueContract = record(panel.value_contract);
  const coverageContract = record(panel.coverage_contract);
  return identifier(panel.panel_id) && identifier(panel.field_id) && boundedText(panel.frontend_field_path, 256) &&
    boundedText(panel.visible_meaning, 512) && typeof panel.required === "boolean" &&
    SOURCE_AUTHORITIES.includes(panel.source_authority as never) && panel.contract_readiness === "CLASSIFIED" &&
    validSourceReadiness(panel.source_readiness) && validRuntimeDelivery(panel.runtime_delivery) &&
    boundedText(panel.source_history_semantics, 256) && boundedText(panel.freshness_requirement, 256) &&
    valueContract !== null && exactKeys(valueContract, ["utc_epoch_ms_fields", "opaque_identifier", "exact_decimal_policy"]) &&
    Array.isArray(valueContract.utc_epoch_ms_fields) && valueContract.utc_epoch_ms_fields.length <= 8 &&
    new Set(valueContract.utc_epoch_ms_fields).size === valueContract.utc_epoch_ms_fields.length &&
    valueContract.utc_epoch_ms_fields.every((field) => typeof field === "string" && field.endsWith("_ms")) &&
    valueContract.opaque_identifier === "STRING_ONLY" && boundedText(valueContract.exact_decimal_policy, 256) &&
    coverageContract !== null && exactKeys(coverageContract, ["dimensions"]) &&
    exactMembers(coverageContract.dimensions, COVERAGE_FIELDS) && validFormulaLineage(panel.formula_lineage);
}

/** V2 accepts only safe integer epoch milliseconds; never ISO or a number-like string. */
export function readUtcEpochMs(value: unknown): UtcEpochMs | null {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= DATE_RANGE_MS
    ? value as UtcEpochMs
    : null;
}

/** UTC-only `datetime64[ms]`; the browser timezone has no influence on output. */
export function formatUtcEpochMs(value: UtcEpochMs): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number, width = 2) => String(part).padStart(width, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)} UTC`;
}

/** Financial values and large sequences must not cross the browser as numbers. */
export function readExactDecimal(value: unknown, currency: unknown, scale: unknown): ExactDecimalString | null {
  if (typeof value !== "string" || !DECIMAL.test(value)) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3,12}$/.test(currency)) return null;
  if (!Number.isInteger(scale) || (scale as number) < 0 || (scale as number) > 28) return null;
  const decimalPlaces = value.includes(".") ? value.length - value.indexOf(".") - 1 : 0;
  return decimalPlaces === scale ? value as ExactDecimalString : null;
}

export function readOpaqueIdentifier(value: unknown): OpaqueIdentifier | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 191
    ? value as OpaqueIdentifier
    : null;
}

function readCoverage(value: unknown): boolean {
  const coverage = record(value);
  if (!coverage || !COVERAGE_FIELDS.every((key) => hasOwn(coverage, key))) return false;
  if (!nullableUtcEpochMs(coverage.from_ms) || !nullableUtcEpochMs(coverage.to_ms)) return false;
  if (!nullableUnsignedInteger(coverage.source_total) || !nullableUnsignedInteger(coverage.filtered_total)) return false;
  if (!Number.isInteger(coverage.returned_count) || (coverage.returned_count as number) < 0 || (coverage.returned_count as number) > 200) return false;
  if (typeof coverage.truncated !== "boolean" || typeof coverage.downsampled !== "boolean" || typeof coverage.has_more !== "boolean") return false;
  if (coverage.next_cursor !== null && !boundedText(coverage.next_cursor, 4096)) return false;
  if (!Array.isArray(coverage.gaps) || coverage.gaps.length > 200) return false;
  return coverage.gaps.every((gap) => {
    const item = record(gap);
    return item !== null && hasOwn(item, "from_ms") && hasOwn(item, "to_ms") && hasOwn(item, "reason_code") &&
      readUtcEpochMs(item.from_ms) !== null && readUtcEpochMs(item.to_ms) !== null && identifier(item.reason_code);
  });
}

function readFormula(value: unknown): boolean {
  if (value === null) return true;
  const formula = record(value);
  if (!formula || !["formula_id", "formula_version", "input_revision", "input_digest", "composite_read_revision"].every((key) => hasOwn(formula, key))) return false;
  return identifier(formula.formula_id) && identifier(formula.formula_version) &&
    (formula.input_revision === null || boundedText(formula.input_revision, 256)) &&
    (formula.input_digest === null || (typeof formula.input_digest === "string" && DIGEST.test(formula.input_digest))) &&
    (formula.composite_read_revision === null || boundedText(formula.composite_read_revision, 256));
}

/** Runtime decoder for the dynamic panel envelope used by EDS-03+ BFF reads. */
export function readGeneratedPanelEnvelope(value: unknown): GeneratedPanelEnvelope | null {
  const item = record(value);
  if (!item || !EDS02_PANEL_STATES.includes(item.state as PanelState)) return null;
  if (!hasOwn(item, "data")) return null;
  const state = item.state as PanelState;
  const dataPresent = item.data !== null && item.data !== undefined;
  if ((state === "READY" || state === "PARTIAL" || state === "STALE") && !dataPresent) return null;
  if ((state === "EMPTY" || state === "UNAVAILABLE" || state === "DENIED" || state === "ERROR") && dataPresent) return null;
  const clocks = record(item.clocks);
  if (!clocks || !UTC_CLOCK_FIELDS.every((key) => hasOwn(clocks, key))) return null;
  if (readUtcEpochMs(clocks.read_at_ms) === null) return null;
  for (const key of UTC_CLOCK_FIELDS.filter((key) => key !== "read_at_ms")) {
    if (!nullableUtcEpochMs(clocks[key])) return null;
  }
  if (!readCoverage(item.coverage) || !boundedText(item.source_history_semantics, 256) || !readFormula(item.formula)) return null;
  if (item.reason_code !== null && !boundedText(item.reason_code, 128)) return null;
  if (typeof item.retryable !== "boolean") return null;
  return item as GeneratedPanelEnvelope;
}

function validSemanticAction(value: unknown, sourceScreenRequired: boolean): boolean {
  const action = record(value);
  const requiredKeys = [
    "action_id", "capability_id", "action_kind", "required_resource_identity", "source_preconditions",
    "availability", "reason_code", "plan_apply_verify_contract", "terminal_evidence_kind", "owner",
    ...(sourceScreenRequired ? ["source_screen_id"] : []),
  ];
  return action !== null && exactKeys(action, requiredKeys) && identifier(action.action_id) && identifier(action.capability_id) &&
    boundedText(action.action_kind, 128) && Array.isArray(action.required_resource_identity) &&
    action.required_resource_identity.length <= 8 && new Set(action.required_resource_identity).size === action.required_resource_identity.length &&
    action.required_resource_identity.every(identifier) && Array.isArray(action.source_preconditions) &&
    action.source_preconditions.length <= 12 && new Set(action.source_preconditions).size === action.source_preconditions.length &&
    action.source_preconditions.every(identifier) && ACTION_AVAILABILITY.includes(action.availability as never) &&
    (action.reason_code === null || boundedText(action.reason_code, 128)) && boundedText(action.plan_apply_verify_contract, 256) &&
    boundedText(action.terminal_evidence_kind, 128) && boundedText(action.owner, 128) &&
    (!sourceScreenRequired || identifier(action.source_screen_id));
}

function validScreenManifest(value: unknown): boolean {
  const screen = record(value);
  if (!screen || !exactKeys(screen, ["screen_id", "resource", "operation", "required_surfaces", "contract_readiness", "panel_count", "action_count", "panels", "actions"])) return false;
  const resource = record(screen.resource);
  const operation = record(screen.operation);
  if (!identifier(screen.screen_id) || !resource || !operation || !exactKeys(resource, ["kind", "required"]) || !exactKeys(operation, ["operation_id", "method", "response_contract"]) || !identifier(resource.kind) || typeof resource.required !== "boolean") return false;
  if (!identifier(operation.operation_id) || !["GET", "POST"].includes(operation.method as string) || !identifier(operation.response_contract)) return false;
  if (!Array.isArray(screen.required_surfaces) || screen.required_surfaces.length === 0 || screen.required_surfaces.length > 6 || !screen.required_surfaces.every(identifier)) return false;
  if (screen.contract_readiness !== "CLASSIFIED" || !Array.isArray(screen.panels) || !Array.isArray(screen.actions)) return false;
  return Number.isInteger(screen.panel_count) && screen.panel_count === screen.panels.length &&
    Number.isInteger(screen.action_count) && screen.action_count === screen.actions.length &&
    screen.panels.every(validPanelDefinition) && screen.actions.every((action) => validSemanticAction(action, false));
}

/**
 * Narrow authority decoder: metadata only. It refuses forbidden source or
 * route material before a screen can use the contract as a binding guide.
 */
export function readContractAuthority(value: unknown): ContractAuthorityResponse | null {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "schema_version", "record_authority", "workspace_id", "read_at_ms", "actor", "page_bounds",
      "clock_contract", "exact_value_contract", "panel_envelope_contract", "screen_data_manifest",
      "action_manifest", "generated_digests", "redaction",
    ]) ||
    item.schema_version !== "portal.execution.contract-authority.v1" ||
    item.record_authority !== "PORTAL_CONTROL" ||
    !identifier(item.workspace_id) ||
    readUtcEpochMs(item.read_at_ms) === null
  ) return null;
  const screenManifest = record(item.screen_data_manifest);
  const actionManifest = record(item.action_manifest);
  const screens = screenManifest?.screens;
  const actions = actionManifest?.actions;
  const redaction = record(item.redaction);
  const actor = record(item.actor);
  const pageBounds = record(item.page_bounds);
  const clocks = record(item.clock_contract);
  const exactValues = record(item.exact_value_contract);
  const panelContract = record(item.panel_envelope_contract);
  const digests = record(item.generated_digests);
  if (!screenManifest || !actionManifest || !Array.isArray(screens) || !Array.isArray(actions) || !redaction || !actor || !pageBounds || !clocks || !exactValues || !panelContract || !digests) return null;
  if (!exactKeys(actor, ["user_id", "username", "roles"]) || !identifier(actor.user_id) || !boundedText(actor.username, 64) || !Array.isArray(actor.roles) || actor.roles.length !== 1 || !["ADMIN", "USER"].includes(actor.roles[0] as string)) return null;
  if (!exactKeys(pageBounds, ["maximum_page_rows", "maximum_response_bytes", "maximum_cursor_bytes", "total_history_cap"]) || pageBounds.maximum_page_rows !== 200 || pageBounds.maximum_response_bytes !== 1_048_576 || pageBounds.maximum_cursor_bytes !== 4_096 || pageBounds.total_history_cap !== false) return null;
  if (!exactKeys(clocks, ["wire_type", "fields", "display_policy"]) || clocks.wire_type !== "UTC_EPOCH_MS" || clocks.display_policy !== "FRONTEND_UTC_FORMATTER_ONLY" || !exactMembers(clocks.fields, UTC_CLOCK_FIELDS)) return null;
  if (!exactKeys(exactValues, ["identifier", "sequence_and_large_identifier", "monetary_and_financial_value"]) || exactValues.identifier !== "OPAQUE_STRING_ONLY" || exactValues.sequence_and_large_identifier !== "STRING_ONLY" || exactValues.monetary_and_financial_value !== "EXACT_DECIMAL_STRING_WITH_CURRENCY_AND_SCALE") return null;
  if (!exactKeys(panelContract, ["states", "ready_requires_non_null_data", "partial_and_stale_require_non_null_data", "terminal_absence_requires_null_data"]) || !exactMembers(panelContract.states, EDS02_PANEL_STATES) || panelContract.ready_requires_non_null_data !== true || panelContract.partial_and_stale_require_non_null_data !== true || panelContract.terminal_absence_requires_null_data !== true) return null;
  if (!exactKeys(screenManifest, ["schema_version", "input_digests", "screen_count", "field_definition_count", "screens"]) || screenManifest.schema_version !== "portal.execution.screen-data-manifest.v1" || screenManifest.field_definition_count !== 34 || !Number.isInteger(screenManifest.screen_count) || screenManifest.screen_count !== screens.length) return null;
  const inputDigests = record(screenManifest.input_digests);
  if (!inputDigests || Object.keys(inputDigests).length === 0 || !Object.values(inputDigests).every((digest) => typeof digest === "string" && DIGEST.test(digest))) return null;
  if (!exactKeys(actionManifest, ["schema_version", "action_count", "actions"]) || actionManifest.schema_version !== "portal.execution.action-manifest.v1" || !Number.isInteger(actionManifest.action_count) || actionManifest.action_count !== actions.length) return null;
  if (!exactKeys(digests, ["screen_data_manifest", "action_manifest", "composite", "authorized_screen_data_manifest", "authorized_action_manifest"]) || !Object.values(digests).every((digest) => typeof digest === "string" && DIGEST.test(digest))) return null;
  if (!exactKeys(redaction, ["raw_source_relation", "source_cursor", "upstream_origin", "credential_or_certificate", "browser_direct_source_access", "semantic_action_contains_url"])) return null;
  for (const key of ["raw_source_relation", "source_cursor", "upstream_origin", "credential_or_certificate", "browser_direct_source_access", "semantic_action_contains_url"]) {
    if (redaction[key] !== false) return null;
  }
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["source_relation_or_operation", "path_template", "\"href\""]) {
    if (serialized.includes(forbidden)) return null;
  }
  if (!screens.every(validScreenManifest) || new Set(screens.map((screen) => (screen as { screen_id: string }).screen_id)).size !== screens.length) return null;
  if (!actions.every((action) => validSemanticAction(action, true)) || new Set(actions.map((action) => (action as { action_id: string }).action_id)).size !== actions.length) return null;
  const screenActionKeys = new Set(screens.flatMap((screen) => {
    const entry = screen as { screen_id: string; actions: { action_id: string }[] };
    return entry.actions.map((action) => `${entry.screen_id}/${action.action_id}`);
  }));
  const manifestActionKeys = new Set(actions.map((action) => {
    const entry = action as { source_screen_id: string; action_id: string };
    return `${entry.source_screen_id}/${entry.action_id}`;
  }));
  if (screenActionKeys.size !== manifestActionKeys.size || [...screenActionKeys].some((key) => !manifestActionKeys.has(key))) return null;
  return item as ContractAuthorityResponse;
}
