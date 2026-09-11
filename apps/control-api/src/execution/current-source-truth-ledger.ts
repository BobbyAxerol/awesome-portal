import {
  EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS,
  EDS11R_MANAGER_RELATION_OPERATION_REGISTRY,
} from "./eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "./maximum-data-intake";

/**
 * BE-R2-2 deliberately records only transport and catalogue metadata. It is
 * not a source-row inspector, a replay ledger, or an alternate Manager API.
 */
export type CurrentSourceTruthClassification =
  | "AVAILABLE_DIRECT"
  | "AVAILABLE_DERIVED_AT_PORTAL"
  | "AUTHORITATIVE_EMPTY"
  | "PARTIAL"
  | "SOURCE_GAP_CONFIRMED";

type ProfileEnvironment = "paper" | "sandbox" | "live";

export interface CurrentSourceTruthLedgerInput {
  readonly ownerResponse: unknown;
  readonly runtimeManifest: unknown;
  readonly auditEvidence: readonly unknown[];
  readonly generatedAt?: Date;
}

export interface CurrentSourceTruthLedger {
  readonly schema_version: "portal.execution.current-source-truth-ledger.v1";
  readonly generated_at: string;
  readonly audit_scope: "D3_GET_ONLY_MANAGER_METADATA";
  readonly source_contract: {
    readonly revision: string;
    readonly catalogue_sha256: string;
    readonly relation_count: number;
    readonly page_bounds: { readonly maximum_rows: number; readonly maximum_response_bytes: number };
  };
  readonly profile_audits: readonly ProfileAuditTruth[];
  readonly capabilities: readonly CapabilityTruth[];
  readonly relations: readonly RelationTruth[];
  readonly product_operations: readonly ProductOperationTruth[];
  readonly screens: readonly ScreenTruth[];
  readonly live_data_executor_candidate: LiveDataExecutorCandidate;
  readonly runtime_release_reconciliation: RuntimeReleaseReconciliation;
  readonly redaction: {
    readonly raw_business_payload_persisted: false;
    readonly cursor_persisted: false;
    readonly credential_or_certificate_persisted: false;
  };
}

export interface ProfileAuditTruth {
  readonly environment: ProfileEnvironment;
  readonly profile_id: string;
  readonly audience: string;
  readonly classification: "AVAILABLE_DIRECT";
  readonly freshness: string;
  readonly completeness: string;
  readonly as_of_ms: number;
  readonly catalogue_relation_count: number;
  readonly published_capability_count: number;
  readonly business_row_access: "NOT_READ_D3_GET_ONLY";
}

export interface CapabilityTruth {
  readonly capability_id: string;
  /** Immutable E5 field identity; capability_id is intentionally a family. */
  readonly field_id: string;
  readonly product_operation: string;
  readonly classification: CurrentSourceTruthClassification;
  readonly source_state: string;
  readonly profiles: readonly string[];
  readonly safe_screen_consumers: readonly string[];
  readonly owner: string;
  readonly exact_partial_reason: string | null;
  readonly row_page_coverage: RowPageCoverage;
}

export interface RelationTruth {
  readonly relation_id: string;
  readonly classification: CurrentSourceTruthClassification;
  readonly source_state: "CATALOGUE_METADATA_AUDITED";
  readonly named_product_operations: readonly string[];
  readonly safe_screen_consumers: readonly string[];
  readonly owner: "trading_system_owner" | "portal";
  readonly exact_partial_reason: string | null;
  readonly row_page_coverage: RowPageCoverage;
}

export interface ProductOperationTruth {
  readonly operation_id: string;
  readonly field_id: string;
  readonly classification: CurrentSourceTruthClassification;
  readonly source_relation: string;
  readonly safe_screen_consumers: readonly string[];
  readonly exact_partial_reason: string | null;
}

export interface ScreenTruth {
  readonly screen_id: string;
  readonly classification: CurrentSourceTruthClassification;
  readonly capability_ids: readonly string[];
  readonly exact_partial_reasons: readonly string[];
}

export interface RowPageCoverage {
  readonly state: "NOT_READ_D3_GET_ONLY";
  readonly item_count: null;
  readonly page_bound_rows: number;
  readonly page_bound_bytes: number;
  readonly exact_partial_reason: "D3_AUDIT_METADATA_ONLY_NO_BUSINESS_ROW_READ";
}

export interface LiveDataExecutorCandidate {
  readonly classification: "PARTIAL";
  readonly source_state: "RAW_PAPER_CANDIDATE_AUDIT_ONLY";
  readonly inventory_basis: "DEPLOYED_RUNTIME_MANIFEST_METADATA_ONLY";
  readonly application_relation_count: number;
  readonly application_column_count: number;
  readonly portal_authority: false;
  readonly live_manager_substitute: false;
  readonly portal_direct_database_access: false;
  readonly exact_partial_reason: "LIVE_DATA_EXECUTOR_IS_NOT_A_MANAGER_PUBLISHED_PORTAL_AUTHORITY";
}

export interface RuntimeReleaseReconciliation {
  readonly state: "ALIGNED" | "PROVENANCE_DISCREPANCY";
  readonly declared_catalogue_sha256: string;
  readonly runtime_catalogue_sha256: string;
  readonly declared_edge_image_digest: string;
  readonly runtime_edge_image_digest: string;
  readonly discrepancies: readonly string[];
  readonly running_image_changed: false;
}

type JsonObject = Record<string, unknown>;

const PROFILE_BY_ENVIRONMENT = new Map(
  MAXIMUM_DATA_INTAKE_V1.profiles.map((profile) => [profile.environment, profile]),
);
const COVERAGE: RowPageCoverage = Object.freeze({
  state: "NOT_READ_D3_GET_ONLY",
  item_count: null,
  page_bound_rows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
  page_bound_bytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
  exact_partial_reason: "D3_AUDIT_METADATA_ONLY_NO_BUSINESS_ROW_READ",
});
// The D3 observation is deliberately pinned to the currently published
// metadata surface. A count change is a source-contract change, not a reason
// to silently widen this audit or claim a different capability set.
const CURRENT_MANAGER_METADATA_CAPABILITY_COUNT = 5;

/**
 * Produces a deterministic, redacted ledger from committed source metadata
 * plus three D3 GET-only evidence documents. Any attempt to feed a raw row,
 * cursor, token, certificate, or incomplete audit document is rejected.
 */
export function createCurrentSourceTruthLedger(
  input: CurrentSourceTruthLedgerInput,
): CurrentSourceTruthLedger {
  const ownerResponse = object(input.ownerResponse, "owner response");
  const runtimeManifest = object(input.runtimeManifest, "runtime manifest");
  const audits = validateAudits(input.auditEvidence);
  const capabilities = capabilityTruth(ownerResponse);
  const relations = relationTruth();
  const productOperations = productOperationTruth();
  const screens = screenTruth(capabilities);
  const runtimeReconciliation = reconcileRuntime(ownerResponse, runtimeManifest);
  const liveDataExecutorCandidate = candidateFromRuntimeManifest(runtimeManifest);
  const generatedAt = input.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("current-source truth ledger generation time is invalid");
  }
  const ledger: CurrentSourceTruthLedger = {
    schema_version: "portal.execution.current-source-truth-ledger.v1",
    generated_at: generatedAt.toISOString(),
    audit_scope: "D3_GET_ONLY_MANAGER_METADATA",
    source_contract: {
      revision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
      catalogue_sha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      relation_count: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount,
      page_bounds: {
        maximum_rows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
        maximum_response_bytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
      },
    },
    profile_audits: audits,
    capabilities,
    relations,
    product_operations: productOperations,
    screens,
    live_data_executor_candidate: liveDataExecutorCandidate,
    runtime_release_reconciliation: runtimeReconciliation,
    redaction: {
      raw_business_payload_persisted: false,
      cursor_persisted: false,
      credential_or_certificate_persisted: false,
    },
  };
  assertLedgerRedacted(ledger);
  return deepFreeze(ledger);
}

function validateAudits(documents: readonly unknown[]): readonly ProfileAuditTruth[] {
  if (documents.length !== 3) {
    throw new Error("current-source truth ledger requires exactly Paper, Sandbox and Live D3 audits");
  }
  const audits = documents.map((document) => {
    assertAuditMetadataOnly(document);
    const value = object(document, "D3 audit evidence");
    if (
      string(value.schema_version, "D3 audit schema") !==
        "portal.execution.d3.manager-audit-evidence.v1" ||
      string(value.audit_scope, "D3 audit scope") !== "D3_GET_ONLY_MANAGER_METADATA" ||
      value.business_rows_read !== false ||
      value.raw_business_payload_persisted !== false ||
      value.runtime_mutation !== false
    ) {
      throw new Error("D3 audit evidence is not a redacted GET-only Manager audit");
    }
    const profile = object(value.profile, "D3 audit profile");
    const environment = string(profile.environment, "D3 audit environment") as ProfileEnvironment;
    const expected = PROFILE_BY_ENVIRONMENT.get(environment);
    if (
      !expected ||
      string(profile.profile_id, "D3 audit profile id") !== expected.profileId ||
      string(profile.audience, "D3 audit audience") !== expected.audience
    ) {
      throw new Error("D3 audit profile binding is not exact");
    }
    const catalogue = object(object(value.manager, "D3 audit manager").catalogue, "D3 audit catalogue");
    const capabilities = object(object(value.manager, "D3 audit manager").capabilities, "D3 audit capabilities");
    if (
      string(catalogue.contract_version, "D3 audit contract") !==
        MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision ||
      string(catalogue.catalogue_sha256, "D3 audit catalogue digest") !==
        MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest ||
      integer(catalogue.relation_count, "D3 audit relation count") !==
        MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount ||
      !positiveInteger(catalogue.as_of_ms, "D3 audit catalogue as_of_ms") ||
      !nonEmptyString(catalogue.availability) ||
      !nonEmptyString(catalogue.freshness) ||
      !nonEmptyString(catalogue.completeness) ||
      integer(capabilities.published_capability_count, "D3 audit capability count") !==
        CURRENT_MANAGER_METADATA_CAPABILITY_COUNT
    ) {
      throw new Error("D3 audit metadata contract drifted");
    }
    return {
      environment,
      profile_id: expected.profileId,
      audience: expected.audience,
      classification: "AVAILABLE_DIRECT" as const,
      freshness: string(catalogue.freshness, "D3 audit freshness"),
      completeness: string(catalogue.completeness, "D3 audit completeness"),
      as_of_ms: integer(catalogue.as_of_ms, "D3 audit catalogue as_of_ms"),
      catalogue_relation_count: integer(catalogue.relation_count, "D3 audit relation count"),
      published_capability_count: integer(
        capabilities.published_capability_count,
        "D3 audit capability count",
      ),
      business_row_access: "NOT_READ_D3_GET_ONLY" as const,
    };
  });
  const expectedEnvironments: ProfileEnvironment[] = ["paper", "sandbox", "live"];
  const distinct = new Set(audits.map((audit) => audit.environment));
  if (distinct.size !== 3 || !expectedEnvironments.every((environment) => distinct.has(environment))) {
    throw new Error("D3 audit evidence must contain one exact Paper, Sandbox and Live profile");
  }
  return Object.freeze(
    [...audits].sort((left, right) => left.environment.localeCompare(right.environment)),
  );
}

function capabilityTruth(ownerResponse: JsonObject): readonly CapabilityTruth[] {
  if (string(ownerResponse.schema_version, "owner response schema") !== "portal.execution.edge-owner-response.v2") {
    throw new Error("owner response schema drifted");
  }
  const rows = array(ownerResponse.capabilities, "owner response capabilities").map((value) => {
    const capability = object(value, "owner response capability");
    const status = string(capability.status, "owner capability status");
    const classification = classificationForOwnerStatus(status);
    const reason = string(capability.reason_code, "owner capability reason");
    const exactPartialReason = classification === "SOURCE_GAP_CONFIRMED" || classification === "PARTIAL"
      ? reason
      : null;
    return {
      capability_id: string(capability.capability_id, "owner capability id"),
      field_id: string(capability.field_id, "owner capability field id"),
      product_operation: string(capability.operation, "owner capability operation"),
      classification,
      source_state: status,
      profiles: strings(capability.profiles, "owner capability profiles"),
      safe_screen_consumers: strings(capability.impacted_screens, "owner capability screens"),
      owner: ownerForCapabilityStatus(status),
      exact_partial_reason: exactPartialReason,
      row_page_coverage: COVERAGE,
    } as CapabilityTruth;
  });
  if (rows.length !== MAXIMUM_DATA_INTAKE_V1.returnPack.frozenFieldMappingCount) {
    throw new Error("owner capability coverage is not the accepted 34-field mapping");
  }
  unique(rows.map((row) => row.field_id), "owner capability field id");
  unique(rows.map((row) => row.product_operation), "owner capability operation");
  return Object.freeze([...rows].sort((left, right) => left.field_id.localeCompare(right.field_id)));
}

function relationTruth(): readonly RelationTruth[] {
  const rows: RelationTruth[] = [];
  for (const operation of EDS11R_MANAGER_RELATION_OPERATION_REGISTRY) {
    rows.push({
      relation_id: `public.${operation.relation}`,
      classification: "AVAILABLE_DIRECT",
      source_state: "CATALOGUE_METADATA_AUDITED",
      named_product_operations: [operation.operationId],
      safe_screen_consumers: [...operation.screenIds].sort(),
      owner: "trading_system_owner",
      exact_partial_reason: null,
      row_page_coverage: COVERAGE,
    });
  }
  for (const disposition of EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS) {
    rows.push({
      relation_id: disposition.relation_id,
      classification: "PARTIAL",
      source_state: "CATALOGUE_METADATA_AUDITED",
      named_product_operations: [],
      safe_screen_consumers: [],
      owner: "portal",
      exact_partial_reason: disposition.browser_disposition,
      row_page_coverage: COVERAGE,
    });
  }
  if (rows.length !== MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount) {
    throw new Error("truth ledger relation registry is not the accepted 96-relation catalogue");
  }
  unique(rows.map((row) => row.relation_id), "truth ledger relation id");
  return Object.freeze(rows.sort((left, right) => left.relation_id.localeCompare(right.relation_id)));
}

function productOperationTruth(): readonly ProductOperationTruth[] {
  const rows = EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map((operation) => ({
    operation_id: operation.operationId,
    field_id: operation.fieldId,
    classification: "AVAILABLE_DIRECT" as const,
    source_relation: `public.${operation.relation}`,
    safe_screen_consumers: [...operation.screenIds].sort(),
    exact_partial_reason: null,
  }));
  unique(rows.map((row) => row.operation_id), "truth ledger operation id");
  return Object.freeze(rows.sort((left, right) => left.operation_id.localeCompare(right.operation_id)));
}

function screenTruth(capabilities: readonly CapabilityTruth[]): readonly ScreenTruth[] {
  const byScreen = new Map<string, CapabilityTruth[]>();
  for (const capability of capabilities) {
    for (const screen of capability.safe_screen_consumers) {
      const rows = byScreen.get(screen) ?? [];
      rows.push(capability);
      byScreen.set(screen, rows);
    }
  }
  if (byScreen.size !== MAXIMUM_DATA_INTAKE_V1.returnPack.frozenScreenCount) {
    throw new Error("truth ledger screen coverage is not the accepted frozen screen set");
  }
  return Object.freeze(
    [...byScreen.entries()]
      .map(([screenId, rows]) => {
        const classifications = rows.map((row) => row.classification);
        const classification = classifications.includes("SOURCE_GAP_CONFIRMED")
          ? "SOURCE_GAP_CONFIRMED"
          : classifications.includes("PARTIAL")
            ? "PARTIAL"
            : classifications.every((value) => value === "AVAILABLE_DERIVED_AT_PORTAL")
              ? "AVAILABLE_DERIVED_AT_PORTAL"
              : "AVAILABLE_DIRECT";
        return {
          screen_id: screenId,
          classification,
          capability_ids: [...new Set(rows.map((row) => row.capability_id))].sort(),
          exact_partial_reasons: rows
            .map((row) => row.exact_partial_reason)
            .filter((reason): reason is string => reason !== null)
            .sort(),
        } as ScreenTruth;
      })
      .sort((left, right) => left.screen_id.localeCompare(right.screen_id)),
  );
}

function candidateFromRuntimeManifest(runtimeManifest: JsonObject): LiveDataExecutorCandidate {
  const tuple = object(runtimeManifest.runtime_tuple, "runtime manifest tuple");
  const tradingSystem = object(tuple.trading_system, "runtime manifest trading system");
  if (string(runtimeManifest.schema_version, "runtime manifest schema") !==
    "portal.execution.maximum-data.e7.deployed-runtime-manifest.v1") {
    throw new Error("runtime manifest schema drifted");
  }
  return Object.freeze({
    classification: "PARTIAL",
    source_state: "RAW_PAPER_CANDIDATE_AUDIT_ONLY",
    inventory_basis: "DEPLOYED_RUNTIME_MANIFEST_METADATA_ONLY",
    application_relation_count: positiveInteger(
      tradingSystem.application_relation_count,
      "runtime application relation count",
    ),
    application_column_count: positiveInteger(
      tradingSystem.application_column_count,
      "runtime application column count",
    ),
    portal_authority: false,
    live_manager_substitute: false,
    portal_direct_database_access: false,
    exact_partial_reason: "LIVE_DATA_EXECUTOR_IS_NOT_A_MANAGER_PUBLISHED_PORTAL_AUTHORITY",
  });
}

function reconcileRuntime(
  ownerResponse: JsonObject,
  runtimeManifest: JsonObject,
): RuntimeReleaseReconciliation {
  const tuple = object(runtimeManifest.runtime_tuple, "runtime manifest tuple");
  const manager = object(tuple.manager_v2, "runtime manifest manager");
  const edge = object(tuple.portal_execution_edge, "runtime manifest edge");
  const runtimeDigest = string(manager.catalogue_digest, "runtime catalogue digest");
  const declaredDigest = MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
  const runtimeEdgeDigest = string(edge.edge_image_digest, "runtime edge image digest");
  const declaredEdgeDigest = string(ownerResponse.image_digest, "owner edge image digest");
  const discrepancies = [
    ...(runtimeDigest === declaredDigest ? [] : ["RUNTIME_CATALOGUE_DIGEST_DIFFERS_FROM_ACTIVE_PORTAL_PIN"]),
    ...(string(ownerResponse.catalogue_digest, "owner response catalogue digest") === declaredDigest
      ? []
      : ["RETURN_PACK_CATALOGUE_DIGEST_DIFFERS_FROM_ACTIVE_PORTAL_PIN"]),
    ...(runtimeEdgeDigest === declaredEdgeDigest ? [] : ["RUNTIME_EDGE_IMAGE_DIGEST_DIFFERS_FROM_RETURN_PACK"]),
  ];
  return Object.freeze({
    state: discrepancies.length === 0 ? "ALIGNED" : "PROVENANCE_DISCREPANCY",
    declared_catalogue_sha256: declaredDigest,
    runtime_catalogue_sha256: runtimeDigest,
    declared_edge_image_digest: declaredEdgeDigest,
    runtime_edge_image_digest: runtimeEdgeDigest,
    discrepancies: Object.freeze(discrepancies),
    running_image_changed: false,
  });
}

function classificationForOwnerStatus(status: string): CurrentSourceTruthClassification {
  switch (status) {
    case "AVAILABLE_DIRECT":
      return "AVAILABLE_DIRECT";
    case "AVAILABLE_DERIVED_AT_PORTAL":
      return "AVAILABLE_DERIVED_AT_PORTAL";
    case "OWNER_ACTION_REQUIRED":
    case "CONTRACT_INCOMPATIBLE":
      return "SOURCE_GAP_CONFIRMED";
    default:
      return "PARTIAL";
  }
}

function ownerForCapabilityStatus(status: string): "portal" | "trading_system_owner" {
  return status === "AVAILABLE_DERIVED_AT_PORTAL" ? "portal" : "trading_system_owner";
}

function assertLedgerRedacted(value: unknown, path = "ledger"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLedgerRedacted(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (
        new Set([
          "token",
          "jwt",
          "certificate",
          "private_key",
          "client_key",
          "cursor",
          "trace_id",
          "items",
          "record_key",
          "payload",
        ]).has(key.toLowerCase())
      ) {
        throw new Error(`truth ledger redaction rejected field: ${path}.${key}`);
      }
      assertLedgerRedacted(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (value.includes("-----BEGIN") || /^eyJ[A-Za-z0-9_-]+\./.test(value))) {
    throw new Error(`truth ledger redaction rejected credential-like value at ${path}`);
  }
}

function assertAuditMetadataOnly(value: unknown, path = "D3 audit evidence"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertAuditMetadataOnly(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const forbidden = new Set([
    "items",
    "record_key",
    "next_cursor",
    "relations",
    "safe_columns",
    "fields",
    "trace_id",
    "token",
    "jwt",
    "certificate",
    "private_key",
    "payload",
  ]);
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) {
      throw new Error(`D3 audit must not persist source-row or credential field: ${path}.${key}`);
    }
    assertAuditMetadataOnly(nested, `${path}.${key}`);
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  const values = array(value, label).map((entry) => string(entry, label));
  unique(values, label);
  return Object.freeze([...values].sort());
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || typeof value !== "number") throw new Error(`${label} must be an integer`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const number = integer(value, label);
  if (number <= 0) throw new Error(`${label} must be positive`);
  return number;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
