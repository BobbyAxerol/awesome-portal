import { EXECUTION_COMMAND_CATALOG } from "./catalog.generated";

export type CommandConnectionState =
  | "CONNECTED"
  | "SUPPORTED_BUT_INACTIVE"
  | "SEMANTICALLY_INCOMPATIBLE";

export interface OperatorTaskDefinition {
  taskId: string;
  taskGroup: string;
  taskTitle: string;
  mode: "READ" | "MUTATION" | "DANGER" | "BLOCKED";
  catalogKey: string | null;
  parameterKeys: readonly string[];
  typedConfirmWord: string | null;
}

const task = (
  taskId: string,
  taskGroup: string,
  taskTitle: string,
  mode: OperatorTaskDefinition["mode"],
  catalogKey: string | null,
  parameterKeys: readonly string[],
  typedConfirmWord: string | null = null,
): OperatorTaskDefinition => ({
  taskId,
  taskGroup,
  taskTitle,
  mode,
  catalogKey,
  parameterKeys,
  typedConfirmWord,
});

/**
 * N27 operator task overlay.  Parameters are registry identifiers or bounded
 * enums/numbers; no row admits a raw URL, shell fragment, SQL or credential.
 */
export const OPERATOR_TASKS: readonly OperatorTaskDefinition[] = [
  task("health", "READ_INSPECT", "System health", "READ", null, ["mode"]),
  task("inspect", "READ_INSPECT", "Alpha / account inspect", "READ", "alpha/inspect", ["alpha_id", "account_id"]),
  task("capital", "READ_INSPECT", "Capital history", "READ", "capital/history", ["portfolio_id", "account_id", "limit"]),
  task("performance", "READ_INSPECT", "Performance & NAV", "READ", "performance/portfolio", ["portfolio_id", "alpha_id", "account_id"]),
  task("sizing", "READ_INSPECT", "Sizing explanations", "READ", "sizing/history", ["alpha_id", "symbol", "limit"]),
  task("broker-read", "READ_INSPECT", "Broker bindings & exposure", "READ", "broker/bindings", ["external_account_ref", "mode", "venue"]),
  task("redis-inspect", "READ_INSPECT", "Redis inspection", "READ", "redis/trading-state", ["mode", "venue"]),
  task("portfolio-create", "PORTFOLIO_CAPITAL", "Create portfolio", "MUTATION", "portfolio/create", ["portfolio_id", "name", "base_currency", "state", "reason"]),
  task("portfolio-state", "PORTFOLIO_CAPITAL", "Portfolio state", "MUTATION", "portfolio/state", ["portfolio_id", "state", "reason"]),
  task("allocation-change", "PORTFOLIO_CAPITAL", "Change allocation", "MUTATION", "allocation/<root>", ["portfolio_id", "account_id", "allocated_capital", "max_capital", "movement_type", "reason"]),
  task("config-plan", "PORTFOLIO_CAPITAL", "Declarative config plan / apply", "MUTATION", "config/plan", ["config_artifact_id", "reason"]),
  task("deployment-state", "DEPLOYMENT_RISK", "Deployment state", "MUTATION", "deployment/state", ["deployment_id", "state", "reason"]),
  task("trading-state", "DEPLOYMENT_RISK", "Trading state per mode/venue", "MUTATION", "risk/state", ["mode", "venue", "state", "reason"]),
  task("risk-profile", "DEPLOYMENT_RISK", "Risk profile", "MUTATION", "risk/profile", ["alpha_id", "mode", "venue", "risk_profile_id", "reason"]),
  task("alpha-register", "DEPLOYMENT_RISK", "Register alpha", "MUTATION", "alpha/register", ["alpha_id", "registration_artifact_id", "reason"]),
  task("account-policy", "ACCOUNT", "Account policy", "MUTATION", "account/policy", ["account_id", "policy_id", "expected_revision", "reason"]),
  task("account-seed-paper", "ACCOUNT", "Seed paper account", "MUTATION", "account/seed-paper", ["alpha_id", "account_id", "venue", "currency", "amount", "account_type", "reason"]),
  task("account-sync", "BROKER_SYNC_RECONCILIATION", "Broker account sync", "MUTATION", "account/sync", ["account_id", "mode", "venue", "reason"]),
  task("reconcile-positions", "BROKER_SYNC_RECONCILIATION", "Reconcile positions", "MUTATION", "account/reconcile-positions", ["account_id", "mode", "venue", "sync_first", "apply", "reason"]),
  task("reconcile-open-orders", "BROKER_SYNC_RECONCILIATION", "Reconcile open orders", "MUTATION", "account/reconcile-open-orders", ["account_id", "mode", "venue", "sync_first", "apply", "reason"]),
  task("broker-reconcile", "BROKER_SYNC_RECONCILIATION", "Aggregate physical reconcile", "MUTATION", "broker/reconcile-positions", ["external_account_ref", "mode", "venue", "domain", "sync_first", "reason"]),
  task("emergency-close", "EMERGENCY_DESTRUCTIVE", "Emergency close", "DANGER", "ops/emergency-close", ["account_id", "alpha_id", "mode", "venue", "reason"], "CLOSE"),
  task("testnet-hard-reset", "EMERGENCY_DESTRUCTIVE", "Shared testnet hard reset", "BLOCKED", null, [], "BINANCE_TESTNET_ONLY"),
  task("lab-reset", "EMERGENCY_DESTRUCTIVE", "Lab reset", "BLOCKED", null, [], null),
] as const;

export function taskClassification(taskDefinition: OperatorTaskDefinition): {
  state: CommandConnectionState;
  reason_code: string;
  source_route: { method: string; path: string } | null;
} {
  if (taskDefinition.catalogKey === "ops/emergency-close") {
    return {
      state: "SUPPORTED_BUT_INACTIVE",
      reason_code: "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED",
      source_route: null,
    };
  }
  if (taskDefinition.taskId === "redis-inspect") {
    return {
      state: "SEMANTICALLY_INCOMPATIBLE",
      reason_code: "DIRECT_REDIS_ACCESS_FORBIDDEN",
      source_route: null,
    };
  }
  if (taskDefinition.taskId === "testnet-hard-reset" || taskDefinition.taskId === "lab-reset") {
    return {
      state: "SEMANTICALLY_INCOMPATIBLE",
      reason_code: "HOST_DESTRUCTIVE_PROCEDURE_NOT_EXPOSED",
      source_route: null,
    };
  }
  if (taskDefinition.catalogKey === null) {
    return {
      state: "SUPPORTED_BUT_INACTIVE",
      reason_code: "TYPED_SOURCE_OPERATION_NOT_PUBLISHED",
      source_route: null,
    };
  }
  const entry = EXECUTION_COMMAND_CATALOG.entries.find(
    (candidate) => candidate.key === taskDefinition.catalogKey,
  );
  if (!entry || entry.http_method === null || entry.http_path === null) {
    return {
      state: "SEMANTICALLY_INCOMPATIBLE",
      reason_code: entry?.blocked_reason ?? "CATALOG_ENTRY_NOT_PUBLISHED",
      source_route: null,
    };
  }
  return {
    state: "SUPPORTED_BUT_INACTIVE",
    reason_code: taskDefinition.catalogKey === "ops/emergency-close"
      ? "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED"
      : "N27_COMMAND_TRANSPORT_NOT_ACTIVATED",
    source_route: { method: entry.http_method, path: entry.http_path },
  };
}

export function catalogueEntryClassification(entry: {
  readonly portal_reachable: boolean;
  readonly source_route_state: string;
  readonly http_method: string | null;
  readonly http_path: string | null;
  readonly blocked_reason: string;
}): { state: CommandConnectionState; reason_code: string } {
  if (entry.portal_reachable) {
    return { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" };
  }
  if (entry.source_route_state === "CURRENT_PRIMITIVE_CONFIRMED") {
    return {
      state: "SUPPORTED_BUT_INACTIVE",
      reason_code: "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED",
    };
  }
  if (entry.http_method !== null && entry.http_path !== null &&
      ["OBSERVED", "CURRENT_PRIMITIVE_CONFIRMED"].includes(entry.source_route_state)) {
    return {
      state: "SUPPORTED_BUT_INACTIVE",
      reason_code: entry.source_route_state === "CURRENT_PRIMITIVE_CONFIRMED"
        ? "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED"
        : "N27_COMMAND_TRANSPORT_NOT_ACTIVATED",
    };
  }
  return {
    state: "SEMANTICALLY_INCOMPATIBLE",
    reason_code: entry.blocked_reason,
  };
}

export function operatorTaskCatalogue() {
  const tasks = OPERATOR_TASKS.map((definition) => {
    const source = definition.catalogKey === null
      ? null
      : EXECUTION_COMMAND_CATALOG.entries.find((entry) => entry.key === definition.catalogKey) ?? null;
    return {
      task_id: definition.taskId,
      key: definition.catalogKey,
      task_group: definition.taskGroup,
      task_title: definition.taskTitle,
      tag: definition.mode,
      mode: definition.mode,
      catalog_key: definition.catalogKey,
      scope: taskScope(definition.parameterKeys),
      cli_forms: [],
      meta: source?.source_reference ?? "Portal-curated task; source operation not published",
      params: definition.parameterKeys.map((key) => ({
        key,
        source_registry: registryFor(key),
        constraint: constraintFor(key),
        required: key !== "limit" && key !== "reason" && key !== "apply" && key !== "sync_first",
        default: null,
      })),
      typed_confirm_word: definition.typedConfirmWord,
      authority: {
        required_role: "ADMIN",
        risk_tier: source?.risk_tier ?? (definition.mode === "BLOCKED" ? "BLOCKED" : "UNCLASSIFIED"),
        step_up_required: definition.mode === "MUTATION" || definition.mode === "DANGER",
        two_man_rule: definition.taskId === "emergency-close",
        plan_required: source?.plan_required ?? false,
        apply_required: source?.apply_required ?? false,
        verify_required: source?.verify_required ?? false,
        runtime_active: source?.portal_reachable ?? false,
      },
      unlisted_reason: definition.catalogKey === null ? "CATALOG_ENTRY_NOT_PUBLISHED" : null,
      ...taskClassification(definition),
      source_request_sent: false,
    };
  });
  const counts = tasks.reduce<Record<CommandConnectionState, number>>(
    (result, row) => {
      result[row.state] += 1;
      return result;
    },
    { CONNECTED: 0, SUPPORTED_BUT_INACTIVE: 0, SEMANTICALLY_INCOMPATIBLE: 0 },
  );
  return {
    schema_version: "execution.command-tasks.v1",
    catalogue_revision: 3,
    source_catalogue_revision: EXECUTION_COMMAND_CATALOG.catalogue_revision,
    relay_state: "DISABLED",
    task_groups: [...new Set(tasks.map((row) => row.task_group))],
    total_tasks: tasks.length,
    classification_counts: counts,
    bounds: { catalogue: 64, params_per_task: 8, transcript_lines: 200, preflight_rows: 10, verify_rows: 20 },
    tasks,
  };
}

function registryFor(key: string): string {
  if (key === "portfolio_id") return "portfolios";
  if (key === "account_id") return "accounts";
  if (key === "alpha_id") return "alphas";
  if (key === "deployment_id") return "deployments";
  if (key === "external_account_ref") return "bindings";
  if (key === "venue") return "venues";
  if (key === "mode") return "modes";
  if (key === "symbol") return "symbols";
  if (key.endsWith("artifact_id")) return "artifacts";
  return "server_bounds";
}

function constraintFor(key: string): string {
  if (key === "reason") return "8..2000 UTF-8 characters; credential-like assignments forbidden";
  if (key === "limit") return "integer 1..500";
  if (key === "amount" || key.endsWith("capital")) return "exact decimal string; server policy bound";
  if (key === "expected_revision") return "positive integer; optimistic conflict required";
  return "selected from the named server registry/allowlist";
}

export function operatorTask(taskId: string): OperatorTaskDefinition | null {
  return OPERATOR_TASKS.find((candidate) => candidate.taskId === taskId) ?? null;
}

function taskScope(keys: readonly string[]): string {
  const scopes = ["portfolio", "account", "alpha", "deployment", "binding", "venue"]
    .filter((scope) => keys.some((key) => key.includes(scope)));
  return scopes.length === 0 ? "system" : scopes.join(" · ");
}
