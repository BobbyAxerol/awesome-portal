import { createHash } from "node:crypto";
import {
  executionContractAuthorityInternalCoverage,
  type ExecutionContractAuthorityInternalPanelCoverage,
} from "./contract-authority";
import {
  EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS,
  EDS11R_MANAGER_RELATION_OPERATION_REGISTRY,
  managerRelationOperationByRelation,
} from "./eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "./maximum-data-intake";
import { PROFILE_OBSERVATION_OPERATION_ID } from "./profile-projection.catalog";

/** The only R3 classifications permitted in the server-side coverage ledger. */
export const R3_CURRENT_SOURCE_COVERAGE_CLASSIFICATIONS = [
  "COVERED",
  "EMPTY_AUTHORIZED",
  "PARTIAL_AUTHORIZED",
  "SOURCE_GAP_CONFIRMED",
  "NOT_APPLICABLE",
] as const;

export type R3CurrentSourceCoverageClassification =
  (typeof R3_CURRENT_SOURCE_COVERAGE_CLASSIFICATIONS)[number];

type R3SourceBindingKind =
  | "NAMED_MANAGER_OPERATIONS"
  | "PORTAL_PROJECTION_DERIVATION"
  | "PORTAL_CONTROL"
  | "SOURCE_GAP";

export interface R3CurrentSourcePanelCoverage {
  readonly coverageId: string;
  readonly screenId: string;
  readonly panelId: string;
  readonly fieldId: string;
  /** Browser-safe, named same-origin screen BFF operation. */
  readonly namedPortalOperationId: string;
  /** Backend-only source provenance; never serialized by a browser endpoint. */
  readonly sourceBinding: {
    readonly kind: R3SourceBindingKind;
    readonly namedManagerOperationIds: readonly string[];
    readonly serverOnlyManagerRelations: readonly string[];
    readonly fieldAllowlist: readonly string[];
  };
  readonly profiles: readonly string[];
  readonly sourceAuthority: string;
  readonly classification: R3CurrentSourceCoverageClassification;
  readonly classificationReason: string;
  readonly availabilityFreshnessCompletenessAsOf: "PRESERVED_BY_NAMED_BFF_ENVELOPE";
  readonly sourcePageBound: {
    readonly maximumRows: number;
    readonly maximumResponseBytes: number;
  } | null;
  readonly cacheAndStreamInvalidation: {
    readonly cacheScope: "WORKSPACE_PRINCIPAL_ROLE_PROFILE_ADAPTER_REQUEST" | "PORTAL_RECORD_SCOPE" | "NONE";
    readonly revalidationOperationId: string | null;
  };
  readonly frontendConsumer: {
    readonly fieldPath: string;
    readonly screenOperationId: string;
  };
  readonly testFixtureId: string;
}

export interface R3CurrentSourceActionCoverage {
  readonly coverageId: string;
  readonly screenId: string;
  readonly actionId: string;
  readonly actionKind: string;
  readonly classification: R3CurrentSourceCoverageClassification;
  readonly classificationReason: string;
  readonly namedPortalOperationId: string | null;
  readonly testFixtureId: string;
}

export interface R3CurrentSourceRelationCoverage {
  readonly relationId: string;
  readonly classification: R3CurrentSourceCoverageClassification;
  readonly browserDisposition:
    | "NAMED_PORTAL_OPERATION"
    | "PORTAL_PROJECTION_ONLY"
    | "AUDIT_REPOSITORY_ONLY"
    | "NOT_BROWSER_ADMISSIBLE";
  readonly namedManagerOperationId: string | null;
  readonly screenIds: readonly string[];
  readonly fieldAllowlist: readonly string[];
  readonly sourcePageBound: {
    readonly maximumRows: number;
    readonly maximumResponseBytes: number;
  };
}

export interface R3CurrentSourceCoverageLedger {
  readonly schemaVersion: "portal.execution.r3.current-source-coverage-ledger.v1";
  readonly sourceContract: {
    readonly revision: string;
    readonly catalogueSha256: string;
    readonly catalogueRelationCount: number;
  };
  readonly pageBounds: {
    readonly maximumRows: number;
    readonly maximumResponseBytes: number;
    readonly profileMaximumConcurrency: Readonly<Record<string, number>>;
  };
  readonly panelCoverage: readonly R3CurrentSourcePanelCoverage[];
  readonly actionCoverage: readonly R3CurrentSourceActionCoverage[];
  readonly relationCoverage: readonly R3CurrentSourceRelationCoverage[];
  readonly redaction: {
    readonly browserMayReceiveRawManagerRelation: false;
    readonly browserMayReceiveSourceCursor: false;
    readonly browserMayReceiveSourceOrigin: false;
    readonly browserMayReceiveJwtOrMtlsMaterial: false;
  };
}

const DIRECTLY_COVERED_CURRENT_STATUSES = new Set([
  "CURRENT_PORTAL_BFF_AVAILABLE",
  "EXISTING_SCREEN_ENVELOPE_COMPOSES_NAMED_SOURCE_STATUS",
]);

const RELATION_DISPOSITION_BY_ID = new Map(
  EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS.map((item) => [item.relation_id, item]),
);

/**
 * Builds the canonical R3 coverage graph from exactly the same immutable
 * source contracts used by the screen BFF authority. It is intentionally a
 * server-only artifact: generated runtime evidence exposes a digest/counts,
 * never the Manager relation names included here for engineering audit.
 */
export function createR3CurrentSourceCoverageLedger(): R3CurrentSourceCoverageLedger {
  const internal = executionContractAuthorityInternalCoverage();
  const panelCoverage = internal.panels
    .map(panelCoverageRow)
    .sort((left, right) => left.coverageId.localeCompare(right.coverageId));
  const actionCoverage = internal.actions
    .map((action) => {
      const portalWorkflow = action.actionKind === "PORTAL_WORKFLOW" && action.currentAvailability === "AVAILABLE";
      const sourceGap = action.currentAvailability === "OWNER_ACTION_REQUIRED";
      return Object.freeze({
        coverageId: `${action.screenId}/${action.actionId}`,
        screenId: action.screenId,
        actionId: action.actionId,
        actionKind: action.actionKind,
        classification: portalWorkflow
          ? "COVERED"
          : sourceGap ? "SOURCE_GAP_CONFIRMED" : "NOT_APPLICABLE",
        classificationReason: portalWorkflow
          ? "PORTAL_WORKFLOW_CURRENTLY_AVAILABLE"
          : sourceGap ? action.disabledReason : "COMMAND_PLANE_OUT_OF_R3_1_SCOPE",
        namedPortalOperationId: portalWorkflow ? `portalWorkflow:${action.actionId}` : null,
        testFixtureId: fixtureId("action", action.screenId, action.actionId),
      } satisfies R3CurrentSourceActionCoverage);
    })
    .sort((left, right) => left.coverageId.localeCompare(right.coverageId));
  const relationCoverage = relationCoverageRows();
  if (panelCoverage.length === 0 || relationCoverage.length !== MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount) {
    throw new Error("R3 current-source coverage ledger is incomplete");
  }
  return deepFreeze({
    schemaVersion: "portal.execution.r3.current-source-coverage-ledger.v1",
    sourceContract: {
      revision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
      catalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      catalogueRelationCount: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount,
    },
    pageBounds: {
      maximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
      profileMaximumConcurrency: Object.freeze(Object.fromEntries(
        MAXIMUM_DATA_INTAKE_V1.profiles.map((profile) => [profile.profileId, profile.maximumObservedConcurrency]),
      )),
    },
    panelCoverage,
    actionCoverage,
    relationCoverage,
    redaction: {
      browserMayReceiveRawManagerRelation: false,
      browserMayReceiveSourceCursor: false,
      browserMayReceiveSourceOrigin: false,
      browserMayReceiveJwtOrMtlsMaterial: false,
    },
  } satisfies R3CurrentSourceCoverageLedger);
}

export const R3_CURRENT_SOURCE_COVERAGE_LEDGER = createR3CurrentSourceCoverageLedger();

/** Browser-safe deploy evidence only; full provenance remains server-only. */
export function r3CurrentSourceCoverageEvidence() {
  const classifications = countBy(
    R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage,
    (row) => row.classification,
  );
  return Object.freeze({
    schema_version: R3_CURRENT_SOURCE_COVERAGE_LEDGER.schemaVersion,
    ledger_sha256: `sha256:${sha256(JSON.stringify(R3_CURRENT_SOURCE_COVERAGE_LEDGER))}`,
    panel_coverage_count: R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage.length,
    action_coverage_count: R3_CURRENT_SOURCE_COVERAGE_LEDGER.actionCoverage.length,
    relation_coverage_count: R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage.length,
    panel_classifications: classifications,
    source_page_bounds: {
      maximum_rows: R3_CURRENT_SOURCE_COVERAGE_LEDGER.pageBounds.maximumRows,
      maximum_response_bytes: R3_CURRENT_SOURCE_COVERAGE_LEDGER.pageBounds.maximumResponseBytes,
    },
    redaction: R3_CURRENT_SOURCE_COVERAGE_LEDGER.redaction,
  });
}

function panelCoverageRow(panel: ExecutionContractAuthorityInternalPanelCoverage): R3CurrentSourcePanelCoverage {
  const sourceBinding = resolveSourceBinding(panel.sourceRelationOrOperation, panel.dataOperationId);
  const classification = classifyPanel(panel, sourceBinding);
  const sourceBound = sourceBinding.kind === "NAMED_MANAGER_OPERATIONS" ||
    sourceBinding.kind === "PORTAL_PROJECTION_DERIVATION";
  return Object.freeze({
    coverageId: `${panel.screenId}/${panel.panelId}/${panel.fieldId}`,
    screenId: panel.screenId,
    panelId: panel.panelId,
    fieldId: panel.fieldId,
    namedPortalOperationId: panel.dataOperationId,
    sourceBinding,
    profiles: Object.freeze([...panel.sourceProfiles].sort()),
    sourceAuthority: panel.sourceSystem,
    classification,
    classificationReason: classificationReason(panel, sourceBinding, classification),
    availabilityFreshnessCompletenessAsOf: "PRESERVED_BY_NAMED_BFF_ENVELOPE",
    sourcePageBound: sourceBound ? Object.freeze({
      maximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
    }) : null,
    cacheAndStreamInvalidation: sourceBound ? Object.freeze({
      cacheScope: "WORKSPACE_PRINCIPAL_ROLE_PROFILE_ADAPTER_REQUEST" as const,
      revalidationOperationId: PROFILE_OBSERVATION_OPERATION_ID,
    }) : sourceBinding.kind === "PORTAL_CONTROL" ? Object.freeze({
      cacheScope: "PORTAL_RECORD_SCOPE" as const,
      revalidationOperationId: null,
    }) : Object.freeze({
      cacheScope: "NONE" as const,
      revalidationOperationId: null,
    }),
    frontendConsumer: Object.freeze({
      fieldPath: panel.frontendFieldPath,
      screenOperationId: panel.dataOperationId,
    }),
    testFixtureId: fixtureId("panel", panel.screenId, panel.panelId, panel.fieldId),
  } satisfies R3CurrentSourcePanelCoverage);
}

function resolveSourceBinding(source: string, screenOperationId: string): R3CurrentSourcePanelCoverage["sourceBinding"] {
  if (source.startsWith("public.")) {
    const relations = source.split("+").map((item) => item.replace(/^public\./, ""));
    const operations = relations.map((relation) => managerRelationOperationByRelation(relation));
    const projectionOnly = relations.filter((relation) => {
      const disposition = RELATION_DISPOSITION_BY_ID.get(`public.${relation}`);
      return disposition?.browser_disposition === "PORTAL_PROJECTION_ONLY";
    });
    if (operations.some((operation, index) => operation === null && !projectionOnly.includes(relations[index]!))) {
      throw new Error(`R3 panel source relation lacks a named or projection disposition: ${source}`);
    }
    const namedOperations = operations.filter((operation): operation is NonNullable<typeof operation> => operation !== null);
    const fieldAllowlist = namedOperations.flatMap((operation) => operation.fields.map((field) => field.name));
    return Object.freeze({
      kind: projectionOnly.length > 0 ? "PORTAL_PROJECTION_DERIVATION" : "NAMED_MANAGER_OPERATIONS",
      namedManagerOperationIds: Object.freeze(namedOperations.map((operation) => operation.operationId).sort()),
      serverOnlyManagerRelations: Object.freeze(relations.map((relation) => `public.${relation}`).sort()),
      fieldAllowlist: Object.freeze([...new Set(fieldAllowlist)].sort()),
    });
  }
  if (source.startsWith("portal-control:")) {
    return Object.freeze({
      kind: "PORTAL_CONTROL",
      namedManagerOperationIds: Object.freeze([]),
      serverOnlyManagerRelations: Object.freeze([]),
      fieldAllowlist: Object.freeze([screenOperationId]),
    });
  }
  if (source === "manager-v2.envelope") {
    return Object.freeze({
      kind: "PORTAL_PROJECTION_DERIVATION",
      namedManagerOperationIds: Object.freeze([]),
      serverOnlyManagerRelations: Object.freeze([]),
      fieldAllowlist: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: "SOURCE_GAP",
    namedManagerOperationIds: Object.freeze([]),
    serverOnlyManagerRelations: Object.freeze([]),
    fieldAllowlist: Object.freeze([]),
  });
}

function classifyPanel(
  panel: ExecutionContractAuthorityInternalPanelCoverage,
  binding: R3CurrentSourcePanelCoverage["sourceBinding"],
): R3CurrentSourceCoverageClassification {
  if (!panel.portalCanProceed || binding.kind === "SOURCE_GAP") return "SOURCE_GAP_CONFIRMED";
  if (DIRECTLY_COVERED_CURRENT_STATUSES.has(panel.currentStatus)) return "COVERED";
  // Existing current pages are useful and admissible even where the source
  // does not prove a sequence/replay/mark-provenance contract. Preserve that
  // limitation as a partial state rather than throwing current facts away.
  return "PARTIAL_AUTHORIZED";
}

function classificationReason(
  panel: ExecutionContractAuthorityInternalPanelCoverage,
  binding: R3CurrentSourcePanelCoverage["sourceBinding"],
  classification: R3CurrentSourceCoverageClassification,
): string {
  if (classification === "SOURCE_GAP_CONFIRMED") {
    return binding.kind === "SOURCE_GAP"
      ? panel.currentStatus
      : `PORTAL_CANNOT_PROCEED:${panel.currentStatus}`;
  }
  if (classification === "COVERED") return panel.currentStatus;
  return `${panel.currentStatus}:CURRENT_PAGE_NOT_REPLAY_OR_FULL_HISTORY`;
}

function relationCoverageRows(): readonly R3CurrentSourceRelationCoverage[] {
  const named = EDS11R_MANAGER_RELATION_OPERATION_REGISTRY.map((operation) => Object.freeze({
    relationId: `public.${operation.relation}`,
    classification: "COVERED" as const,
    browserDisposition: "NAMED_PORTAL_OPERATION" as const,
    namedManagerOperationId: operation.operationId,
    screenIds: Object.freeze([...operation.screenIds].sort()),
    fieldAllowlist: Object.freeze(operation.fields.map((field) => field.name).sort()),
    sourcePageBound: Object.freeze({
      maximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
    }),
  } satisfies R3CurrentSourceRelationCoverage));
  const nonBrowser = EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS.map((relation) => Object.freeze({
    relationId: relation.relation_id,
    classification: relation.browser_disposition === "PORTAL_PROJECTION_ONLY"
      ? "COVERED" as const : "NOT_APPLICABLE" as const,
    browserDisposition: relation.browser_disposition === "PORTAL_PROJECTION_ONLY"
      ? "PORTAL_PROJECTION_ONLY" as const
      : relation.browser_disposition,
    namedManagerOperationId: null,
    screenIds: Object.freeze([]),
    fieldAllowlist: Object.freeze([]),
    sourcePageBound: Object.freeze({
      maximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
    }),
  } satisfies R3CurrentSourceRelationCoverage));
  const rows = [...named, ...nonBrowser].sort((left, right) => left.relationId.localeCompare(right.relationId));
  if (new Set(rows.map((row) => row.relationId)).size !== rows.length) {
    throw new Error("R3 relation coverage has duplicate relation IDs");
  }
  return Object.freeze(rows);
}

function fixtureId(...parts: readonly string[]): string {
  return `r3.current-source.${parts.map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join(".")}`;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const label = key(item);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
