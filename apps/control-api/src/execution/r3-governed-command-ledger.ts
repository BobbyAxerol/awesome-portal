import { createHash } from "node:crypto";
import { SCREEN_BFF_CATALOGUE } from "../screen-bff/catalogue";
import { executionContractAuthorityInternalCoverage } from "./contract-authority";
import { EXECUTION_COMMAND_CATALOG } from "../operations/catalog.generated";
import { localR0Adapter, OPERATOR_TASKS } from "../operations/operator-tasks";

/** Only these authority states are allowed in the R3 command/governance census. */
export const R3_GOVERNED_COMMAND_STATES = [
  "LOCAL_R0_READ_CONNECTED",
  "READ_ONLY_SUPPORTED",
  "MUTATION_CONNECTED",
  "POLICY_BLOCKED",
  "SOURCE_NOT_COMMISSIONED",
  "NOT_APPLICABLE",
] as const;

export type R3GovernedCommandState = (typeof R3_GOVERNED_COMMAND_STATES)[number];
export type R3GovernedCommandKind = "PORTAL_WORKFLOW" | "OPERATOR_TASK" | "SOURCE_CATALOGUE";

export interface R3GovernedCommandRow {
  readonly id: string;
  readonly kind: R3GovernedCommandKind;
  readonly state: R3GovernedCommandState;
  readonly reasonCode: string;
  readonly owner: "PORTAL_CONTROL" | "TRADING_SYSTEM" | "NOT_APPLICABLE";
  readonly actorRoles: readonly string[];
  readonly browserMutationSecurity: "CSRF_REQUIRED" | "NOT_A_BROWSER_MUTATION";
  readonly stepUp: "ROUTE_POLICY" | "CATALOGUE_POLICY" | "NOT_APPLICABLE";
  readonly idempotency: "PORTAL_REQUEST_KEY" | "PORTAL_RESOURCE_VERSION" | "NOT_APPLICABLE";
  readonly audit: "PORTAL_AUDIT_OUTBOX" | "LOCAL_READ_AUDIT" | "PLAN_AUDIT_ONLY" | "NOT_APPLICABLE";
  readonly planApplyVerify: {
    readonly plan: boolean;
    readonly apply: boolean;
    readonly verify: boolean;
    readonly contract: string;
  };
  /** R3-2 never sends a Trading System command from the Portal. */
  readonly sourceSideEffectRequested: false;
}

export interface R3GovernedCommandLedger {
  readonly schemaVersion: "portal.execution.r3.governed-command-ledger.v1";
  readonly rows: readonly R3GovernedCommandRow[];
  readonly invariants: {
    readonly genericCliRelay: false;
    readonly sourceCommandDispatched: false;
    readonly unclassifiedRows: false;
  };
}

function portalActionRows(): readonly R3GovernedCommandRow[] {
  const screenById = new Map(SCREEN_BFF_CATALOGUE.map((screen) => [screen.screenId, screen]));
  return executionContractAuthorityInternalCoverage().actions.map((action) => {
    const screen = screenById.get(action.screenId);
    if (!screen) throw new Error(`R3-2 action screen missing from catalogue: ${action.screenId}`);
    const portalWorkflow = action.actionKind === "PORTAL_WORKFLOW" && action.currentAvailability === "AVAILABLE";
    const sourceNeeded = action.currentAvailability === "OWNER_ACTION_REQUIRED";
    return Object.freeze({
      id: `portal-action:${action.screenId}/${action.actionId}`,
      kind: "PORTAL_WORKFLOW" as const,
      state: portalWorkflow
        ? "MUTATION_CONNECTED"
        : sourceNeeded ? "SOURCE_NOT_COMMISSIONED" : "POLICY_BLOCKED",
      reasonCode: portalWorkflow ? "PORTAL_AUTHORED_WORKFLOW_CONNECTED" : action.disabledReason,
      owner: portalWorkflow ? "PORTAL_CONTROL" as const : "TRADING_SYSTEM" as const,
      actorRoles: Object.freeze([...screen.requiredRoles].sort()),
      browserMutationSecurity: "CSRF_REQUIRED" as const,
      stepUp: "ROUTE_POLICY" as const,
      idempotency: "PORTAL_RESOURCE_VERSION" as const,
      audit: "PORTAL_AUDIT_OUTBOX" as const,
      planApplyVerify: Object.freeze({
        plan: action.planApplyVerifyContract.includes("plan"),
        apply: action.planApplyVerifyContract.includes("apply"),
        verify: action.planApplyVerifyContract.includes("verify"),
        contract: action.planApplyVerifyContract,
      }),
      sourceSideEffectRequested: false as const,
    } satisfies R3GovernedCommandRow);
  });
}

function operatorTaskRows(): readonly R3GovernedCommandRow[] {
  return OPERATOR_TASKS.map((task) => {
    const localAdapter = localR0Adapter(task.taskId);
    const blockedHostProcedure = task.taskId === "redis-inspect" ||
      task.taskId === "testnet-hard-reset" || task.taskId === "lab-reset";
    const sourceCatalogue = task.catalogKey === null
      ? null
      : EXECUTION_COMMAND_CATALOG.entries.find((entry) => entry.key === task.catalogKey) ?? null;
    const localRead = task.mode === "READ" && localAdapter !== null;
    const readOnly = task.mode === "READ" && !blockedHostProcedure;
    const state: R3GovernedCommandState = localRead
      ? "LOCAL_R0_READ_CONNECTED"
      : blockedHostProcedure ? "NOT_APPLICABLE"
        : readOnly ? "READ_ONLY_SUPPORTED"
          : sourceCatalogue === null ? "SOURCE_NOT_COMMISSIONED" : "POLICY_BLOCKED";
    const reasonCode = localRead
      ? "PHASE2_LOCAL_PROJECTION_TASK_ACTIVE_WHEN_FEATURE_ENABLED"
      : blockedHostProcedure ? "DIRECT_OR_DESTRUCTIVE_HOST_PROCEDURE_NOT_EXPOSED"
        : readOnly ? "READ_ONLY_SUPPORTED_NO_SOURCE_COMMAND_RELAY"
          : sourceCatalogue === null ? "CATALOG_ENTRY_NOT_PUBLISHED"
            : "COMMAND_RELAY_DISABLED";
    return Object.freeze({
      id: `operator-task:${task.taskId}`,
      kind: "OPERATOR_TASK" as const,
      state,
      reasonCode,
      owner: localRead ? "PORTAL_CONTROL" as const
        : state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" as const : "TRADING_SYSTEM" as const,
      actorRoles: Object.freeze(["ADMIN"]),
      browserMutationSecurity: task.mode === "READ" || task.mode === "BLOCKED"
        ? "NOT_A_BROWSER_MUTATION" as const : "CSRF_REQUIRED" as const,
      stepUp: task.mode === "MUTATION" || task.mode === "DANGER"
        ? "CATALOGUE_POLICY" as const : "NOT_APPLICABLE" as const,
      idempotency: task.mode === "MUTATION" || task.mode === "DANGER"
        ? "PORTAL_REQUEST_KEY" as const : "NOT_APPLICABLE" as const,
      audit: localRead ? "LOCAL_READ_AUDIT" as const
        : state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" as const : "PLAN_AUDIT_ONLY" as const,
      planApplyVerify: Object.freeze({
        plan: sourceCatalogue?.plan_required ?? false,
        apply: sourceCatalogue?.apply_required ?? false,
        verify: sourceCatalogue?.verify_required ?? false,
        contract: sourceCatalogue === null ? "NOT_PUBLISHED" : "execution.command-catalogue.f0.v2",
      }),
      sourceSideEffectRequested: false as const,
    } satisfies R3GovernedCommandRow);
  });
}

function sourceCatalogueRows(): readonly R3GovernedCommandRow[] {
  return EXECUTION_COMMAND_CATALOG.entries.map((entry) => Object.freeze({
    id: `source-catalogue:${entry.key}`,
    kind: "SOURCE_CATALOGUE" as const,
    state: entry.http_method === null || entry.http_path === null
      ? "SOURCE_NOT_COMMISSIONED" as const : "POLICY_BLOCKED" as const,
    reasonCode: entry.http_method === null || entry.http_path === null
      ? entry.blocked_reason : "COMMAND_RELAY_DISABLED",
    owner: "TRADING_SYSTEM" as const,
    actorRoles: Object.freeze(["ADMIN"]),
    browserMutationSecurity: entry.http_method === "GET" ? "NOT_A_BROWSER_MUTATION" as const : "CSRF_REQUIRED" as const,
    stepUp: entry.risk_tier === "R0_READ" ? "NOT_APPLICABLE" as const : "CATALOGUE_POLICY" as const,
    idempotency: entry.http_method === "GET" ? "NOT_APPLICABLE" as const : "PORTAL_REQUEST_KEY" as const,
    audit: "PLAN_AUDIT_ONLY" as const,
    planApplyVerify: Object.freeze({
      plan: entry.plan_required,
      apply: entry.apply_required,
      verify: entry.verify_required,
      contract: "execution.command-catalogue.f0.v2",
    }),
    sourceSideEffectRequested: false as const,
  } satisfies R3GovernedCommandRow));
}

export function createR3GovernedCommandLedger(): R3GovernedCommandLedger {
  const rows = [...portalActionRows(), ...operatorTaskRows(), ...sourceCatalogueRows()]
    .sort((left, right) => left.id.localeCompare(right.id));
  if (rows.length === 0 || new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error("R3-2 governed command inventory is incomplete");
  }
  if (!rows.every((row) => R3_GOVERNED_COMMAND_STATES.includes(row.state))) {
    throw new Error("R3-2 governed command inventory has an invalid state");
  }
  return Object.freeze({
    schemaVersion: "portal.execution.r3.governed-command-ledger.v1",
    rows: Object.freeze(rows),
    invariants: Object.freeze({
      genericCliRelay: false as const,
      sourceCommandDispatched: false as const,
      unclassifiedRows: false as const,
    }),
  } satisfies R3GovernedCommandLedger);
}

export const R3_GOVERNED_COMMAND_LEDGER = createR3GovernedCommandLedger();

export function r3GovernedCommandEvidence() {
  const counts = Object.fromEntries(R3_GOVERNED_COMMAND_STATES.map((state) => [
    state,
    R3_GOVERNED_COMMAND_LEDGER.rows.filter((row) => row.state === state).length,
  ]));
  const body = JSON.stringify(R3_GOVERNED_COMMAND_LEDGER);
  return Object.freeze({
    schema_version: R3_GOVERNED_COMMAND_LEDGER.schemaVersion,
    ledger_sha256: `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`,
    row_count: R3_GOVERNED_COMMAND_LEDGER.rows.length,
    state_counts: Object.freeze(counts),
    invariants: R3_GOVERNED_COMMAND_LEDGER.invariants,
    redaction: Object.freeze({
      source_route: false,
      source_host: false,
      source_credential: false,
      command_payload: false,
    }),
  });
}
