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
  /** FE-056 display metadata (optional additive keys of `execution.command-tasks.v1`). */
  display: OperatorTaskDisplay;
}

/**
 * One operator-facing short name, one sentence and a scope label per task.
 * Text states only what the task is for, from its catalogue key, parameters and
 * classification; it never claims that the Portal can run the task (that is
 * `state`/`reason_code`).  Bounds are mirrored by the published schema.
 */
export interface OperatorTaskDisplay {
  displayName: string;
  description: string;
  scopeLabel: string;
}

export const OPERATOR_TASK_DISPLAY_BOUNDS = Object.freeze({
  displayName: 80,
  description: 240,
  scopeLabel: 80,
});

const task = (
  taskId: string,
  taskGroup: string,
  taskTitle: string,
  mode: OperatorTaskDefinition["mode"],
  catalogKey: string | null,
  parameterKeys: readonly string[],
  displayName: string,
  scopeLabel: string,
  description: string,
  typedConfirmWord: string | null = null,
): OperatorTaskDefinition => ({
  taskId,
  taskGroup,
  taskTitle,
  mode,
  catalogKey,
  parameterKeys,
  typedConfirmWord,
  display: { displayName, description, scopeLabel },
});

/**
 * N27 operator task overlay.  Parameters are registry identifiers or bounded
 * enums/numbers; no row admits a raw URL, shell fragment, SQL or credential.
 */
export const OPERATOR_TASKS: readonly OperatorTaskDefinition[] = [
  task("health", "READ_INSPECT", "System health", "READ", null, ["mode"], "System health", "System", "Read-only system health check, selectable by mode; no source operation is published for it."),
  task("inspect", "READ_INSPECT", "Alpha / account inspect", "READ", "alpha/inspect", ["alpha_id", "account_id", "mode"], "Alpha / account inspect", "Account · Alpha", "Read-only inspection of an alpha or an account for a mode."),
  task("capital", "READ_INSPECT", "Capital history", "READ", "capital/history", ["portfolio_id", "account_id", "limit"], "Capital history", "Portfolio · Account", "Read-only history of capital movements for a portfolio or an account, limited to a bounded number of rows."),
  task("performance", "READ_INSPECT", "Performance & NAV", "READ", "performance/portfolio", ["portfolio_id", "alpha_id", "account_id"], "Performance and NAV", "Portfolio · Account · Alpha", "Read-only performance and NAV figures for a portfolio, an account or an alpha."),
  task("sizing", "READ_INSPECT", "Sizing explanations", "READ", "sizing/history", ["alpha_id", "symbol", "limit"], "Sizing explanations", "Alpha", "Read-only history of position-sizing explanations for an alpha and symbol, limited to a bounded number of rows."),
  task("broker-read", "READ_INSPECT", "Broker bindings & exposure", "READ", "broker/bindings", ["external_account_ref", "mode", "venue"], "Broker bindings and exposure", "Account · Venue", "Read-only view of the broker binding and exposure behind an external account reference, for a mode and venue."),
  task("redis-inspect", "READ_INSPECT", "Redis inspection", "READ", "redis/trading-state", ["mode", "venue"], "Redis inspection", "Venue", "Direct Redis trading-state inspection; the Portal forbids direct Redis access, so this task cannot be run from here."),
  task("portfolio-create", "PORTFOLIO_CAPITAL", "Create portfolio", "MUTATION", "portfolio/create", ["portfolio_id", "name", "base_currency", "state", "reason"], "Create portfolio", "Portfolio", "Creates a portfolio from an id, name, base currency and initial state, with a recorded reason."),
  task("portfolio-state", "PORTFOLIO_CAPITAL", "Portfolio state", "MUTATION", "portfolio/state", ["portfolio_id", "state", "reason"], "Portfolio state", "Portfolio", "Changes the state of a portfolio, with a recorded reason."),
  task("allocation-change", "PORTFOLIO_CAPITAL", "Change allocation", "MUTATION", "allocation/<root>", ["portfolio_id", "account_id", "allocated_capital", "max_capital", "movement_type", "reason"], "Change allocation", "Portfolio · Account", "Changes the capital allocated to an account within a portfolio (allocated and maximum capital, movement type), with a recorded reason."),
  task("config-plan", "PORTFOLIO_CAPITAL", "Declarative config plan / apply", "MUTATION", "config/plan", ["config_artifact_id", "reason"], "Config plan and apply", "System", "Plans and applies a declarative configuration artifact, with a recorded reason."),
  task("deployment-state", "DEPLOYMENT_RISK", "Deployment state", "MUTATION", "deployment/state", ["deployment_id", "state", "reason"], "Deployment state", "Deployment", "Changes the state of a deployment, with a recorded reason."),
  task("trading-state", "DEPLOYMENT_RISK", "Trading state per mode/venue", "MUTATION", "risk/state", ["mode", "venue", "state", "reason"], "Trading state", "Venue", "Sets the trading state for a mode and venue, with a recorded reason."),
  task("risk-profile", "DEPLOYMENT_RISK", "Risk profile", "MUTATION", "risk/profile", ["alpha_id", "mode", "venue", "risk_profile_id", "reason"], "Risk profile", "Alpha · Venue", "Sets the risk profile applied to an alpha for a mode and venue, with a recorded reason."),
  task("alpha-register", "DEPLOYMENT_RISK", "Register alpha", "MUTATION", "alpha/register", ["alpha_id", "registration_artifact_id", "reason"], "Register alpha", "Alpha", "Registers an alpha from a registration artifact, with a recorded reason."),
  task("account-policy", "ACCOUNT", "Account policy", "MUTATION", "account/policy", ["account_id", "policy_id", "expected_revision", "reason"], "Account policy", "Account", "Updates the policy of an account at an expected revision, with a recorded reason."),
  task("account-seed-paper", "ACCOUNT", "Seed paper account", "MUTATION", "account/seed-paper", ["alpha_id", "account_id", "venue", "currency", "amount", "account_type", "reason"], "Seed paper account", "Account · Alpha · Venue", "Seeds a paper account for an alpha on a venue with a starting amount and currency, with a recorded reason."),
  task("account-sync", "BROKER_SYNC_RECONCILIATION", "Broker account sync", "MUTATION", "account/sync", ["account_id", "mode", "venue", "reason"], "Broker account sync", "Account · Venue", "Synchronises an account with its broker for a mode and venue, with a recorded reason."),
  task("reconcile-positions", "BROKER_SYNC_RECONCILIATION", "Reconcile positions", "MUTATION", "account/reconcile-positions", ["account_id", "mode", "venue", "sync_first", "apply", "reason"], "Reconcile positions", "Account · Venue", "Reconciles the positions of an account with the broker for a mode and venue, optionally syncing first and optionally applying the result."),
  task("reconcile-open-orders", "BROKER_SYNC_RECONCILIATION", "Reconcile open orders", "MUTATION", "account/reconcile-open-orders", ["account_id", "mode", "venue", "sync_first", "apply", "reason"], "Reconcile open orders", "Account · Venue", "Reconciles the open orders of an account with the broker for a mode and venue, optionally syncing first and optionally applying the result."),
  task("broker-reconcile", "BROKER_SYNC_RECONCILIATION", "Aggregate physical reconcile", "MUTATION", "broker/reconcile-positions", ["external_account_ref", "mode", "venue", "domain", "sync_first", "reason"], "Aggregate physical reconcile", "Account · Venue", "Reconciles positions for a broker binding (external account reference) for a mode, venue and domain, optionally syncing first."),
  task("emergency-close", "EMERGENCY_DESTRUCTIVE", "Emergency close", "DANGER", "ops/emergency-close", ["account_id", "alpha_id", "mode", "venue", "reason"], "Emergency close", "Account · Alpha · Venue", "Emergency close for an account or alpha on a mode and venue; needs the typed word CLOSE and two-person approval.", "CLOSE"),
  task("testnet-hard-reset", "EMERGENCY_DESTRUCTIVE", "Shared testnet hard reset", "BLOCKED", null, [], "Shared testnet hard reset", "System", "Host-level hard reset of the shared testnet; blocked in the Portal and not exposed.", "BINANCE_TESTNET_ONLY"),
  task("lab-reset", "EMERGENCY_DESTRUCTIVE", "Lab reset", "BLOCKED", null, [], "Lab reset", "System", "Host-level reset of the lab environment; blocked in the Portal and not exposed.", null),
] as const;

const LOCAL_R0_ADAPTER = Object.freeze({
  inspect: "admin.inspect",
  capital: "admin.performance",
  performance: "admin.performance",
  "broker-read": "admin.broker-read",
} as const);

export type LocalR0TaskId = keyof typeof LOCAL_R0_ADAPTER;

export function localR0Adapter(taskId: string): string | null {
  return taskId in LOCAL_R0_ADAPTER ? LOCAL_R0_ADAPTER[taskId as LocalR0TaskId] : null;
}

export function taskClassification(taskDefinition: OperatorTaskDefinition, localR0Enabled = false): {
  state: CommandConnectionState;
  reason_code: string;
  source_route: { method: string; path: string } | null;
} {
  if (localR0Enabled && localR0Adapter(taskDefinition.taskId) !== null) {
    return {
      state: "CONNECTED",
      reason_code: "PHASE2_LOCAL_PROJECTION_TASK_ACTIVE",
      source_route: null,
    };
  }
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

export function operatorTaskCatalogue(localR0Enabled = false) {
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
      display_name: definition.display.displayName,
      description: definition.display.description,
      scope_label: definition.display.scopeLabel,
      params: definition.parameterKeys.map((key) => ({
        key,
        source_registry: registryFor(key),
        constraint: constraintFor(key),
        required: definition.mode === "READ"
          ? false : key !== "limit" && key !== "reason" && key !== "apply" && key !== "sync_first",
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
        runtime_active: taskClassification(definition, localR0Enabled).state === "CONNECTED"
          ? true : source?.portal_reachable ?? false,
      },
      unlisted_reason: definition.catalogKey === null ? "CATALOG_ENTRY_NOT_PUBLISHED" : null,
      ...taskClassification(definition, localR0Enabled),
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
    relay_state: localR0Enabled ? "LOCAL_R0_ONLY" : "DISABLED",
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
  if (key === "limit") return "integer 1..200";
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
