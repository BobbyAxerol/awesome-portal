import type {
  CurrentSourceCataloguedOperationPolicy,
} from "./current-source.proxy";
import { EDS11R_MANAGER_RELATION_REGISTRY_SOURCE } from "./eds11r-manager-relation-registry.generated";
import { MAXIMUM_DATA_INTAKE_V1, MaximumDataEnvironment } from "./maximum-data-intake";

export type ManagerRelationScalarKind =
  | "BOOLEAN"
  | "INTEGER"
  | "DECIMAL"
  | "TEXT"
  | "TIMESTAMP";

export interface ManagerRelationFieldSelector {
  readonly name: string;
  readonly kind: ManagerRelationScalarKind;
}

export interface ManagerRelationOperation {
  /** Portal-owned logical name; this is not an Edge relation selector. */
  readonly operationId: string;
  /** Static, browser-safe route component for the one named BFF operation. */
  readonly routeId: string;
  /** Product field identity used by the frontend consumer catalogue. */
  readonly fieldId: string;
  /** Server-only Manager alias. It is never emitted by a controller. */
  readonly sourceId: string;
  /** Server-only exact Manager relation binding. */
  readonly schema: "public";
  /** Server-only exact Manager relation binding. */
  readonly relation: string;
  /** Safe product-field identity used only to derive a Portal resource ID. */
  readonly identityFields: readonly string[];
  readonly identityDisposition: string;
  /** Scalar, non-sensitive fields selected at the Control API boundary. */
  readonly fields: readonly ManagerRelationFieldSelector[];
  readonly sourceHistorySemantics: string;
  readonly sourceRetentionSemantics: string;
  /** Frontend-facing screen ownership, never an Edge upstream route. */
  readonly screenIds: readonly string[];
}

type GeneratedOperation = {
  readonly operation_id: string;
  readonly route_id: string;
  readonly field_id: string;
  readonly source_id: string;
  readonly schema: "public";
  readonly relation: string;
  readonly identity_fields: readonly string[];
  readonly identity_disposition: string;
  readonly fields: readonly { readonly name: string; readonly kind: ManagerRelationScalarKind }[];
  readonly source_history_semantics: string;
  readonly source_retention_semantics: string;
  readonly screen_ids: readonly string[];
};

type GeneratedNonBrowserDisposition = {
  readonly relation_id: string;
  readonly classification: "PROJECTION_INPUT" | "AUDIT_ONLY" | "INTERNAL_ONLY";
  readonly browser_disposition:
    | "PORTAL_PROJECTION_ONLY"
    | "AUDIT_REPOSITORY_ONLY"
    | "NOT_BROWSER_ADMISSIBLE";
};

const generated = EDS11R_MANAGER_RELATION_REGISTRY_SOURCE as unknown as {
  readonly schema_version: string;
  readonly input_digests: Readonly<Record<string, string>>;
  readonly relation_count: number;
  readonly screen_bound_relation_count: number;
  readonly classification_counts: Readonly<Record<string, number>>;
  readonly operations: readonly GeneratedOperation[];
  readonly non_browser_dispositions: readonly GeneratedNonBrowserDisposition[];
};

if (
  generated.schema_version !== "portal.execution.eds11r.manager-relation-registry-source.v1" ||
  generated.relation_count !== 96 ||
  generated.screen_bound_relation_count !== 54 ||
  generated.classification_counts.SCREEN_BOUND !== 54 ||
  generated.classification_counts.PROJECTION_INPUT !== 16 ||
  generated.classification_counts.AUDIT_ONLY !== 13 ||
  generated.classification_counts.INTERNAL_ONLY !== 13 ||
  generated.non_browser_dispositions.length !== 42
) {
  throw new Error("EDS11R generated registry has an unexpected contract shape");
}

function compileOperation(value: GeneratedOperation): ManagerRelationOperation {
  if (
    !/^[A-Za-z][A-Za-z0-9]{2,127}$/.test(value.operation_id) ||
    !/^[a-z][a-z0-9-]{1,127}$/.test(value.route_id) ||
    !/^[A-Za-z][A-Za-z0-9]{2,127}$/.test(value.field_id) ||
    !/^manager\.current\.[a-z][a-z0-9.-]{1,127}$/.test(value.source_id) ||
    !/^[a-z][a-z0-9_]{1,127}$/.test(value.relation) ||
    value.schema !== "public" ||
    value.identity_fields.length === 0 ||
    value.fields.length === 0
  ) {
    throw new Error(`EDS11R generated registry operation is invalid: ${value.operation_id}`);
  }
  const fields = value.fields.map((field) => {
    if (
      !/^[a-z][a-z0-9_]{0,127}$/.test(field.name) ||
      !["BOOLEAN", "INTEGER", "DECIMAL", "TEXT", "TIMESTAMP"].includes(field.kind)
    ) throw new Error(`EDS11R generated registry field is invalid: ${value.operation_id}.${field.name}`);
    return Object.freeze({ name: field.name, kind: field.kind });
  });
  const names = new Set(fields.map((field) => field.name));
  if (!value.identity_fields.every((field) => names.has(field))) {
    throw new Error(`EDS11R identity is outside safe fields: ${value.operation_id}`);
  }
  return Object.freeze({
    operationId: value.operation_id,
    routeId: value.route_id,
    fieldId: value.field_id,
    sourceId: value.source_id,
    schema: value.schema,
    relation: value.relation,
    identityFields: Object.freeze([...value.identity_fields]),
    identityDisposition: value.identity_disposition,
    fields: Object.freeze(fields),
    sourceHistorySemantics: value.source_history_semantics,
    sourceRetentionSemantics: value.source_retention_semantics,
    screenIds: Object.freeze([...value.screen_ids]),
  });
}

const compiled = generated.operations.map(compileOperation);
const byRoute = new Map<string, ManagerRelationOperation>();
const byOperation = new Map<string, ManagerRelationOperation>();
for (const operation of compiled) {
  if (byRoute.has(operation.routeId) || byOperation.has(operation.operationId)) {
    throw new Error(`EDS11R generated registry contains a duplicate: ${operation.operationId}`);
  }
  byRoute.set(operation.routeId, operation);
  byOperation.set(operation.operationId, operation);
}
if (byRoute.size !== 54 || byOperation.size !== 54) {
  throw new Error("EDS11R generated registry does not cover all screen-bound relations");
}

export const EDS11R_MANAGER_RELATION_OPERATION_REGISTRY = Object.freeze(compiled);

/** Server-only explicit disposition of every non-browser Manager relation. */
export const EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS = Object.freeze(
  generated.non_browser_dispositions.map((disposition) => Object.freeze({ ...disposition })),
);

export const EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST = Object.freeze({
  schemaVersion: "portal.execution.eds11r.named-operation-manifest.v1",
  sourceRegistrySchemaVersion: generated.schema_version,
  sourceInputDigests: Object.freeze({ ...generated.input_digests }),
  relationCount: generated.relation_count,
  screenBoundRelationCount: compiled.length,
  nonBrowserClassificationCounts: Object.freeze({
    projectionInput: generated.classification_counts.PROJECTION_INPUT,
    auditOnly: generated.classification_counts.AUDIT_ONLY,
    internalOnly: generated.classification_counts.INTERNAL_ONLY,
  }),
  sourceCatalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
  sourceContractRevision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
  browserContract: "portal.execution.eds11r.manager-relation-page.v1",
});

/** Returns a server-owned static operation; arbitrary relation strings never resolve. */
export function managerRelationOperationByRoute(routeId: string): ManagerRelationOperation | null {
  return byRoute.get(routeId) ?? null;
}

export function managerRelationOperationById(operationId: string): ManagerRelationOperation | null {
  return byOperation.get(operationId) ?? null;
}

export function managerRelationProfileBinding(environment: MaximumDataEnvironment) {
  const profile = MAXIMUM_DATA_INTAKE_V1.profiles.find((candidate) => candidate.environment === environment);
  if (!profile) throw new Error(`EDS11R environment is not accepted: ${environment}`);
  return profile;
}

/**
 * This manifest intentionally omits `schema`, `relation`, `sourceId`, source
 * keys and transport internals. It is safe for the same-origin frontend
 * catalogue and carries enough information to bind product panels by name.
 */
export function browserManagerRelationOperationManifest() {
  return {
    schema_version: EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.schemaVersion,
    source_catalogue_sha256: EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.sourceCatalogueSha256,
    source_contract_revision: EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.sourceContractRevision,
    screen_bound_relation_count: EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.screenBoundRelationCount,
    non_browser_classification_counts: EDS11R_MANAGER_RELATION_REGISTRY_MANIFEST.nonBrowserClassificationCounts,
    operations: EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map((operation) => ({
      operation_id: operation.operationId,
      route_id: operation.routeId,
      field_id: operation.fieldId,
      identity_disposition: operation.identityDisposition,
      fields: operation.fields.map((field) => ({ name: field.name, kind: field.kind })),
      screen_ids: operation.screenIds,
    })),
  };
}

export function managerRelationOperationPolicy(
  operation: ManagerRelationOperation,
  environment: MaximumDataEnvironment,
): CurrentSourceCataloguedOperationPolicy {
  const binding = managerRelationProfileBinding(environment);
  return {
    operationId: operation.operationId,
    sourceId: operation.sourceId,
    relation: operation.relation,
    adapterRevision: "PORTAL_EDS11R_MANAGER_RELATION_V1",
    maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
    sourceMaximumConcurrency: 4,
    profileMaximumConcurrency: binding.maximumObservedConcurrency,
  };
}
