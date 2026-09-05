import { createHash } from "crypto";
import { PortalUser } from "../domain";
import { SCREEN_BFF_CATALOGUE } from "../screen-bff/catalogue";
import { EDS02_GENERATED_SOURCE } from "./eds02-contract-source.generated";

export const EDS02_PANEL_STATES = [
  "READY",
  "EMPTY",
  "PARTIAL",
  "STALE",
  "UNAVAILABLE",
  "DENIED",
  "ERROR",
] as const;

/**
 * These are the source-system ownership labels frozen in the E3 coverage
 * evidence.  They are deliberately not collapsed to a convenient but false
 * single-owner label: `TRADING_SYSTEM_OR_RESEARCH`, for example, remains
 * visibly composite until a source owner publishes a narrower contract.
 */
export const EDS02_SOURCE_AUTHORITIES = [
  "DATA_LAYER_OR_MARKET_SERVICE",
  "MARKET_SERVICE",
  "PORTAL_CONTROL",
  "PORTAL_EDGE",
  "TRADING_SYSTEM",
  "TRADING_SYSTEM_OR_RESEARCH",
] as const;

export type Eds02PanelState = (typeof EDS02_PANEL_STATES)[number];
export type Eds02SourceAuthority = (typeof EDS02_SOURCE_AUTHORITIES)[number];
declare const utcEpochMsBrand: unique symbol;
declare const exactDecimalBrand: unique symbol;
declare const opaqueIdentifierBrand: unique symbol;

export type UtcEpochMs = number & { readonly [utcEpochMsBrand]: "UtcEpochMs" };
export type ExactDecimalString = string & { readonly [exactDecimalBrand]: "ExactDecimal" };
export type OpaqueIdentifier = string & { readonly [opaqueIdentifierBrand]: "OpaqueIdentifier" };

export interface PanelCoverage {
  from_ms: UtcEpochMs | null;
  to_ms: UtcEpochMs | null;
  source_total: string | null;
  filtered_total: string | null;
  returned_count: number;
  truncated: boolean;
  downsampled: boolean;
  has_more: boolean;
  next_cursor: string | null;
  gaps: readonly { from_ms: UtcEpochMs; to_ms: UtcEpochMs; reason_code: string }[];
}

export interface PanelEnvelope<T> {
  state: Eds02PanelState;
  data: T | null;
  clocks: {
    event_time_ms: UtcEpochMs | null;
    source_published_at_ms: UtcEpochMs | null;
    received_at_ms: UtcEpochMs | null;
    ingested_at_ms: UtcEpochMs | null;
    processed_at_ms: UtcEpochMs | null;
    as_of_ms: UtcEpochMs | null;
    read_at_ms: UtcEpochMs;
  };
  coverage: PanelCoverage;
  source_history_semantics: string;
  formula: {
    formula_id: string;
    formula_version: string;
    input_revision: string | null;
    input_digest: string | null;
    composite_read_revision: string | null;
  } | null;
  reason_code: string | null;
  retryable: boolean;
}

interface E3Field {
  field_id: string;
  capability_id: string;
  panel_id: string;
  frontend_field_path: string;
  visible_meaning: string;
  required_or_optional: "REQUIRED" | "OPTIONAL";
  source_system: string;
  source_relation_or_operation: string;
  authority: string;
  delivery_class: string;
  history_requirement: string;
  freshness_requirement: string;
  formula_id: string;
  formula_version: string;
  currency_policy: string;
  timestamp_policy: string;
  edge_operation: string;
  current_status: string;
  missing_reason: string;
  owner: string;
}

interface E3Screen {
  screen_id: string;
  operation_id: string;
  response_contract: string;
  read_capabilities: string[];
  required_surfaces: string[];
}

interface CoverageRow {
  screen_id: string;
  panel_id: string;
  frontend_field_path: string;
  visible_meaning: string;
  required_or_optional: string;
  source_system: string;
  source_relation_or_operation: string;
  authority: string;
  delivery_class: string;
  history_requirement: string;
  freshness_requirement: string;
  formula_id: string;
  formula_version: string;
  currency_policy: string;
  timestamp_policy: string;
  edge_operation: string;
  portal_derivation_allowed: string;
  current_status: string;
  missing_reason: string;
  owner: string;
  capability_id: string;
}

interface OwnerCapability {
  capability_id: string;
  field_id: string;
  status: string;
  operation: string;
  profiles: string[];
  history_semantics: string;
  timestamp_contract: string;
  decimal_contract: string;
  reason_code: string;
  source_revision: string;
  portal_can_proceed: boolean;
}

interface PublicationEntry {
  field_id: string;
  implementation: string;
  publication_state: string;
  typed_status_code: string | null;
  typed_absence_id: string | null;
  profiles: string[];
}

interface ActionCoverageRow {
  screen_id: string;
  action_id: string;
  capability_id: string;
  action_kind: string;
  required_resource_identity: string;
  source_preconditions: string;
  current_availability: string;
  disabled_reason: string;
  plan_apply_verify_contract: string;
  terminal_evidence_target: string;
  owner: string;
}

interface GeneratedSource {
  schema_version: string;
  input_digests: Record<string, string>;
  field_definitions: readonly E3Field[];
  screen_inventory: readonly E3Screen[];
  screen_field_coverage: readonly CoverageRow[];
  action_capability_coverage: readonly ActionCoverageRow[];
  owner_capabilities: readonly OwnerCapability[];
  e5_publication_entries: readonly PublicationEntry[];
  page_bounds: { maximum_page_rows: number; maximum_response_bytes: number; maximum_cursor_bytes: number };
}

const source = EDS02_GENERATED_SOURCE as unknown as GeneratedSource;
const EXACT_DECIMAL_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
/**
 * The V2 browser wire is deliberately narrower than a generic JavaScript
 * safe integer: it must also be representable by `Date`.  Rust can preserve
 * a wider signed `i64` at an Edge boundary, but a value rendered by Portal
 * must be a valid UTC millisecond instant end-to-end.
 */
const MAX_BROWSER_UTC_EPOCH_MS = 8_640_000_000_000_000;

/**
 * E3 is immutable evidence for its 23 frozen screens.  BR-EX-72 was accepted
 * after that handoff and already has current Portal BFFs, so it is registered
 * here as an explicit, fully classified Portal extension rather than silently
 * pretending the list routes are rendered from an unrelated Alpha/Account
 * detail contract.
 */
const CURRENT_PORTAL_SCREEN_EXTENSIONS: Readonly<Record<string, {
  readonly requiredSurfaces: readonly string[];
  readonly fieldIds: readonly string[];
}>> = Object.freeze({
  EXECUTION_ALPHA_FLEET_LIST_SCREEN: {
    requiredSurfaces: ["alpha_fleet_list"],
    fieldIds: [
      "deployment_current", "position_current", "account_current", "account_balances",
      "portfolio_capital", "alpha_activity", "reconciliation_findings", "performance_snapshot",
    ],
  },
  EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN: {
    requiredSurfaces: ["accounts_bindings_list"],
    fieldIds: ["account_current", "venue_accounts", "broker_sync", "account_sync", "reconciliation_findings"],
  },
});

export class ExecutionContractAuthorityError extends Error {
  constructor(readonly code: string, message: string, readonly status = 500) {
    super(message);
  }
}

/** A V2 Portal UTC instant is exact and renderable by every supported browser. */
export function utcEpochMs(value: unknown): UtcEpochMs {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > MAX_BROWSER_UTC_EPOCH_MS) {
    throw new ExecutionContractAuthorityError("EDS02_UTC_EPOCH_MS_INVALID", "UTC epoch milliseconds must be an exact browser-renderable integer.", 400);
  }
  return value as UtcEpochMs;
}

export function exactDecimal(value: unknown, currency: unknown, scale: unknown): ExactDecimalString {
  if (typeof value !== "string" || !EXACT_DECIMAL_RE.test(value)) {
    throw new ExecutionContractAuthorityError("EDS02_EXACT_DECIMAL_INVALID", "Exact decimal values must be decimal strings.", 400);
  }
  if (typeof currency !== "string" || !/^[A-Z]{3,12}$/.test(currency)) {
    throw new ExecutionContractAuthorityError("EDS02_DECIMAL_CURRENCY_INVALID", "Decimal currency is invalid.", 400);
  }
  if (!Number.isInteger(scale) || (scale as number) < 0 || (scale as number) > 28) {
    throw new ExecutionContractAuthorityError("EDS02_DECIMAL_SCALE_INVALID", "Decimal scale is invalid.", 400);
  }
  const fractionalLength = value.includes(".") ? value.length - value.indexOf(".") - 1 : 0;
  if (fractionalLength !== scale) {
    throw new ExecutionContractAuthorityError("EDS02_DECIMAL_SCALE_MISMATCH", "Decimal scale does not match the exact value.", 400);
  }
  return value as ExactDecimalString;
}

export function opaqueIdentifier(value: unknown): OpaqueIdentifier {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 191) {
    throw new ExecutionContractAuthorityError("EDS02_IDENTIFIER_INVALID", "Identifiers must be non-empty strings.", 400);
  }
  return value as OpaqueIdentifier;
}

function sourceAuthority(value: string): Eds02SourceAuthority {
  if (!(EDS02_SOURCE_AUTHORITIES as readonly string[]).includes(value)) {
    throw new ExecutionContractAuthorityError(
      "EDS02_SOURCE_AUTHORITY_UNCLASSIFIED",
      `E3 source authority ${value} is not classified by the public contract.`,
    );
  }
  return value as Eds02SourceAuthority;
}

/**
 * Makes illegal presentation states impossible at the server boundary.  A
 * complete payload may be READY/PARTIAL/STALE; absence is explicit for all
 * other terminal states.  `READY + null` is deliberately rejected.
 */
export function panelEnvelope<T>(input: PanelEnvelope<T>): PanelEnvelope<T> {
  if (!EDS02_PANEL_STATES.includes(input.state)) {
    throw new ExecutionContractAuthorityError("EDS02_PANEL_STATE_INVALID", "Panel state is invalid.");
  }
  if (!Object.prototype.hasOwnProperty.call(input, "data")) {
    throw new ExecutionContractAuthorityError("EDS02_PANEL_DATA_MISSING", "Panel data must be explicitly present, including when null.");
  }
  const dataRequired = input.state === "READY" || input.state === "PARTIAL" || input.state === "STALE";
  if (dataRequired && (input.data === null || input.data === undefined)) {
    throw new ExecutionContractAuthorityError("EDS02_PANEL_DATA_REQUIRED", `${input.state} panel requires data.`);
  }
  if (!dataRequired && input.data !== null) {
    throw new ExecutionContractAuthorityError("EDS02_PANEL_DATA_FORBIDDEN", `${input.state} panel must not carry data.`);
  }
  return input;
}

function splitPipe(value: string): string[] {
  return value === "NONE" || value === "NOT_APPLICABLE" || value.length === 0
    ? []
    : value.split("|").map((item) => item.trim()).filter(Boolean);
}

function timestampFields(policy: string): string[] {
  const colon = policy.indexOf(":");
  return colon === -1 ? [] : policy.slice(colon + 1).split(",").map((field) => field.trim()).filter(Boolean);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function mapBy<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const itemKey = key(item);
    if (result.has(itemKey)) throw new ExecutionContractAuthorityError("EDS02_GENERATOR_DUPLICATE", `${label} contains duplicate ${itemKey}.`);
    result.set(itemKey, item);
  }
  return result;
}

function publicSourceReadiness(owner: OwnerCapability) {
  return {
    state: owner.status,
    reason_code: owner.reason_code,
    history_semantics: owner.history_semantics,
    timestamp_contract: owner.timestamp_contract,
    decimal_contract: owner.decimal_contract,
    source_revision: owner.source_revision,
    profiles: [...owner.profiles],
    portal_can_proceed: owner.portal_can_proceed,
  };
}

function publicRuntimeDelivery(entry: PublicationEntry) {
  return {
    state: entry.publication_state,
    implementation: entry.implementation,
    typed_status_code: entry.typed_status_code,
    typed_absence_id: entry.typed_absence_id,
    profiles: [...entry.profiles],
    source_probe_performed_by_this_request: false,
  };
}

function buildStaticAuthority() {
  const catalogueById = mapBy(SCREEN_BFF_CATALOGUE, (item) => item.screenId, "SCREEN_BFF_CATALOGUE");
  const e3Screens = mapBy(source.screen_inventory, (item) => item.screen_id, "E3 screen inventory");
  const fieldsById = mapBy(source.field_definitions, (field) => field.field_id, "E3 field definitions");
  const fieldsByKey = mapBy(
    source.field_definitions,
    (field) => `${field.panel_id}|${field.capability_id}|${field.source_relation_or_operation}`,
    "E3 field definitions",
  );
  const ownerByField = mapBy(source.owner_capabilities, (item) => item.field_id, "owner capability evidence");
  const publicationByField = mapBy(source.e5_publication_entries, (item) => item.field_id, "E5 publication evidence");

  const currentPortalExtensionIds = Object.keys(CURRENT_PORTAL_SCREEN_EXTENSIONS);
  if (!sameSet([...e3Screens.keys()], [...catalogueById.keys()].filter((id) => !currentPortalExtensionIds.includes(id)))) {
    throw new ExecutionContractAuthorityError("EDS02_SCREEN_CATALOGUE_DRIFT", "E3 screen inventory differs from SCREEN_BFF_CATALOGUE outside declared current Portal extensions.");
  }
  if (!currentPortalExtensionIds.every((id) => catalogueById.has(id))) {
    throw new ExecutionContractAuthorityError("EDS02_EXTENSION_SCREEN_MISSING", "A current Portal screen extension is absent from SCREEN_BFF_CATALOGUE.");
  }
  if (source.field_definitions.length !== ownerByField.size || source.field_definitions.length !== publicationByField.size) {
    throw new ExecutionContractAuthorityError("EDS02_FIELD_EVIDENCE_DRIFT", "Every E3 field must have owner and E5 publication evidence.");
  }

  const coverageByScreen = new Map<string, CoverageRow[]>();
  for (const coverage of source.screen_field_coverage) {
    const screen = catalogueById.get(coverage.screen_id);
    if (!screen) throw new ExecutionContractAuthorityError("EDS02_COVERAGE_SCREEN_UNKNOWN", `Unknown coverage screen ${coverage.screen_id}.`);
    const field = fieldsByKey.get(`${coverage.panel_id}|${coverage.capability_id}|${coverage.source_relation_or_operation}`);
    if (!field) {
      throw new ExecutionContractAuthorityError("EDS02_COVERAGE_FIELD_UNKNOWN", `Coverage panel ${coverage.screen_id}/${coverage.panel_id} has no E3 field.`);
    }
    const rows = coverageByScreen.get(coverage.screen_id) ?? [];
    rows.push(coverage);
    coverageByScreen.set(coverage.screen_id, rows);
  }

  for (const [screenId, extension] of Object.entries(CURRENT_PORTAL_SCREEN_EXTENSIONS)) {
    const rows = extension.fieldIds.map((fieldId) => {
      const field = fieldsById.get(fieldId);
      if (!field) throw new ExecutionContractAuthorityError("EDS02_EXTENSION_FIELD_UNKNOWN", `Portal extension ${screenId} references unknown field ${fieldId}.`);
      return {
        screen_id: screenId,
        panel_id: field.panel_id,
        frontend_field_path: field.frontend_field_path,
        visible_meaning: field.visible_meaning,
        required_or_optional: field.required_or_optional,
        source_system: field.source_system,
        source_relation_or_operation: field.source_relation_or_operation,
        authority: field.authority,
        delivery_class: field.delivery_class,
        history_requirement: field.history_requirement,
        freshness_requirement: field.freshness_requirement,
        formula_id: field.formula_id,
        formula_version: field.formula_version,
        currency_policy: field.currency_policy,
        timestamp_policy: field.timestamp_policy,
        edge_operation: field.edge_operation,
        portal_derivation_allowed: "false",
        current_status: field.current_status,
        missing_reason: field.missing_reason,
        owner: field.owner,
        capability_id: field.capability_id,
      } satisfies CoverageRow;
    });
    coverageByScreen.set(screenId, rows);
  }

  const actionsByScreen = new Map<string, ActionCoverageRow[]>();
  for (const action of source.action_capability_coverage) {
    if (!catalogueById.has(action.screen_id)) {
      throw new ExecutionContractAuthorityError("EDS02_ACTION_SCREEN_UNKNOWN", `Action ${action.action_id} has unknown screen ${action.screen_id}.`);
    }
    const rows = actionsByScreen.get(action.screen_id) ?? [];
    rows.push(action);
    actionsByScreen.set(action.screen_id, rows);
  }

  const screens = SCREEN_BFF_CATALOGUE.map((screen) => {
    const e3 = e3Screens.get(screen.screenId);
    const extension = CURRENT_PORTAL_SCREEN_EXTENSIONS[screen.screenId];
    if (e3 && (
      e3.operation_id !== screen.dataApi.operationId ||
      e3.response_contract !== screen.dataApi.responseContract ||
      !sameSet(e3.read_capabilities, screen.readCapabilities)
    )) {
      throw new ExecutionContractAuthorityError("EDS02_SCREEN_OPERATION_DRIFT", `Screen ${screen.screenId} differs from E3 operation evidence.`);
    }
    if (!e3 && !extension) {
      throw new ExecutionContractAuthorityError("EDS02_SCREEN_UNCLASSIFIED", `Screen ${screen.screenId} lacks E3 or declared Portal extension coverage.`);
    }
    const panels = (coverageByScreen.get(screen.screenId) ?? []).map((coverage) => {
      const field = fieldsByKey.get(`${coverage.panel_id}|${coverage.capability_id}|${coverage.source_relation_or_operation}`)!;
      const owner = ownerByField.get(field.field_id);
      const publication = publicationByField.get(field.field_id);
      if (!owner || !publication) {
        throw new ExecutionContractAuthorityError("EDS02_FIELD_EVIDENCE_MISSING", `Field ${field.field_id} has incomplete evidence.`);
      }
      return {
        panel_id: coverage.panel_id,
        field_id: field.field_id,
        frontend_field_path: coverage.frontend_field_path,
        visible_meaning: coverage.visible_meaning,
        required: coverage.required_or_optional === "REQUIRED",
        source_authority: sourceAuthority(coverage.source_system),
        contract_readiness: "CLASSIFIED" as const,
        source_readiness: publicSourceReadiness(owner),
        runtime_delivery: publicRuntimeDelivery(publication),
        source_history_semantics: coverage.history_requirement,
        freshness_requirement: coverage.freshness_requirement,
        value_contract: {
          utc_epoch_ms_fields: timestampFields(coverage.timestamp_policy),
          opaque_identifier: "STRING_ONLY" as const,
          exact_decimal_policy: coverage.currency_policy,
        },
        coverage_contract: {
          dimensions: [
            "from_ms", "to_ms", "source_total", "filtered_total", "returned_count",
            "truncated", "downsampled", "has_more", "next_cursor", "gaps",
          ],
        },
        formula_lineage: coverage.formula_id === "NONE" ? null : {
          formula_id: coverage.formula_id,
          formula_version: coverage.formula_version,
          input_revision_field: "input_revision",
          input_digest_field: "input_digest",
          composite_read_revision_field: "composite_read_revision",
        },
      };
    });
    const actions = (actionsByScreen.get(screen.screenId) ?? []).map((action) => ({
      action_id: action.action_id,
      capability_id: action.capability_id,
      action_kind: action.action_kind,
      required_resource_identity: splitPipe(action.required_resource_identity),
      source_preconditions: splitPipe(action.source_preconditions),
      availability: action.current_availability,
      reason_code: action.disabled_reason === "NOT_APPLICABLE" ? null : action.disabled_reason,
      plan_apply_verify_contract: action.plan_apply_verify_contract,
      terminal_evidence_kind: action.terminal_evidence_target.includes(":")
        ? "SOURCE_OR_PORTAL_EVIDENCE"
        : action.terminal_evidence_target,
      owner: action.owner,
      // The frontend owns location/URL resolution.  A semantic action never
      // carries an href or server-injected browser target.
    }));
    return {
      screen_id: screen.screenId,
      resource: { kind: screen.resourceKind, required: screen.resourceRequired },
      operation: {
        operation_id: screen.dataApi.operationId,
        method: screen.dataApi.method,
        response_contract: screen.dataApi.responseContract,
      },
      required_surfaces: e3 ? [...e3.required_surfaces] : [...extension!.requiredSurfaces],
      contract_readiness: "CLASSIFIED" as const,
      panel_count: panels.length,
      action_count: actions.length,
      panels,
      actions,
    };
  });

  const screenDataManifest = {
    schema_version: "portal.execution.screen-data-manifest.v1",
    input_digests: source.input_digests,
    screen_count: screens.length,
    field_definition_count: source.field_definitions.length,
    screens,
  };
  const actionManifest = {
    schema_version: "portal.execution.action-manifest.v1",
    action_count: source.action_capability_coverage.length,
    actions: screens.flatMap((screen) => screen.actions.map((action) => ({ ...action, source_screen_id: screen.screen_id }))),
  };
  return {
    screenDataManifest,
    actionManifest,
    generatedDigests: {
      screen_data_manifest: digest(screenDataManifest),
      action_manifest: digest(actionManifest),
      composite: digest({ screenDataManifest, actionManifest }),
    },
  };
}

const STATIC_AUTHORITY = buildStaticAuthority();

export function executionContractAuthorityEvidence() {
  return {
    schema_version: "portal.execution.contract-authority.v1",
    generated_source_schema: source.schema_version,
    generated_digests: STATIC_AUTHORITY.generatedDigests,
    screen_count: STATIC_AUTHORITY.screenDataManifest.screen_count,
    field_definition_count: STATIC_AUTHORITY.screenDataManifest.field_definition_count,
    action_count: STATIC_AUTHORITY.actionManifest.action_count,
  };
}

export function executionContractAuthority(user: PortalUser, workspaceId: string) {
  const permittedScreenIds = new Set(
    SCREEN_BFF_CATALOGUE
      .filter((screen) => screen.requiredRoles.includes(user.role))
      .map((screen) => screen.screenId),
  );
  const screens = STATIC_AUTHORITY.screenDataManifest.screens.filter((screen) => permittedScreenIds.has(screen.screen_id));
  const actions = STATIC_AUTHORITY.actionManifest.actions.filter((action) => permittedScreenIds.has(action.source_screen_id));
  const screenDataManifest = {
    ...STATIC_AUTHORITY.screenDataManifest,
    screen_count: screens.length,
    screens,
  };
  const actionManifest = {
    ...STATIC_AUTHORITY.actionManifest,
    action_count: actions.length,
    actions,
  };
  return {
    schema_version: "portal.execution.contract-authority.v1",
    record_authority: "PORTAL_CONTROL",
    workspace_id: workspaceId,
    read_at_ms: utcEpochMs(Date.now()),
    actor: { user_id: user.userId, username: user.username, roles: [user.role] },
    page_bounds: { ...source.page_bounds },
    clock_contract: {
      wire_type: "UTC_EPOCH_MS",
      fields: [
        "event_time_ms", "source_published_at_ms", "received_at_ms", "ingested_at_ms",
        "processed_at_ms", "as_of_ms", "read_at_ms",
      ],
      display_policy: "FRONTEND_UTC_FORMATTER_ONLY",
    },
    exact_value_contract: {
      identifier: "OPAQUE_STRING_ONLY",
      sequence_and_large_identifier: "STRING_ONLY",
      monetary_and_financial_value: "EXACT_DECIMAL_STRING_WITH_CURRENCY_AND_SCALE",
    },
    panel_envelope_contract: {
      states: [...EDS02_PANEL_STATES],
      ready_requires_non_null_data: true,
      partial_and_stale_require_non_null_data: true,
      terminal_absence_requires_null_data: true,
    },
    screen_data_manifest: screenDataManifest,
    action_manifest: actionManifest,
    generated_digests: {
      ...STATIC_AUTHORITY.generatedDigests,
      authorized_screen_data_manifest: digest(screenDataManifest),
      authorized_action_manifest: digest(actionManifest),
    },
    redaction: {
      raw_source_relation: false,
      source_cursor: false,
      upstream_origin: false,
      credential_or_certificate: false,
      browser_direct_source_access: false,
      semantic_action_contains_url: false,
    },
  };
}
