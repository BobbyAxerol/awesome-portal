/**
 * Research Loop v1.1 · P02 contract harness.
 *
 * This module is deliberately outside `apps/control-api` and `apps/portal`.
 * It freezes the *Research-owned* additions that a later P10 producer may
 * validate before it sends the legacy-compatible request to the unchanged
 * Control-API facade.  It is not a second runtime API, does not accept
 * requests, and does not grant an authority that the existing services lack.
 */

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/;
const CURSOR_ORDER = [
  "fold", "study", "trial", "pick", "params", "trade", "seq", "event_seq",
  "mode", "schedule", "route", "playback_ordinal",
];
const CURSOR_KEYS = new Set(CURSOR_ORDER);
const DECIMAL = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

/**
 * P02 owns the structural, producer-side S02 draft contract.  Dynamic route,
 * manifest and optimizer values remain P04/P10 authority; this freeze only
 * gives a generated client an exact, versioned place for every declared S02
 * payload field.  It deliberately does not turn the current facade into a
 * new endpoint or claim that its present validation understands these fields.
 */
export const REQUESTED_SPEC_V1_SCHEMA_VERSION = "research.requested-spec.v1";
export const REQUESTED_SPEC_V1_S02_FORM_CONTROL_DENOMINATOR = 24;
export const REQUESTED_SPEC_V1_ROUTE_IDS = Object.freeze([
  "signal_notional", "pct_equity", "intrabar_bracket", "dca_ladder", "reactive",
  "event_driven", "native_event_lifecycle", "orders", "fill_replay", "basket",
  "arbitrage", "portfolio", "nautilus_dca_grid", "options",
]);
const REQUESTED_SPEC_ROUTE_IDS = new Set(REQUESTED_SPEC_V1_ROUTE_IDS);
const REQUESTED_SPEC_PROTOCOLS = new Set(["three_window_decay", "advanced"]);
const REQUESTED_SPEC_FIELDS = [
  "schema_version", "alpha_binding", "not_publishable", "strategy_id", "execution_route",
  "route_params", "data", "protocol", "windows", "walk_forward", "optimization_mode",
  "optimization_schedule", "parameter_space_overrides", "optuna_trials", "early_stopping",
  "random_seed", "optimization_config", "client",
];

export class P02ContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "P02ContractError";
    this.code = code;
  }
}

function record(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new P02ContractError(code, `${label} must be an object.`);
  }
  return value;
}

function string(value, code, label, { nullable = false, min = 1, max = 191 } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new P02ContractError(code, `${label} must be a ${min}-${max} character string.`);
  }
  return value;
}

function identifier(value, code, label, options = {}) {
  const text = string(value, code, label, options);
  if (text !== null && !ID.test(text)) {
    throw new P02ContractError(code, `${label} contains unsupported characters.`);
  }
  return text;
}

function exactKeys(value, allowed, code, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new P02ContractError(code, `${label} has an unsupported key: ${key}.`);
    }
  }
}

function requiredKeys(value, required, code, label) {
  for (const key of required) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) {
      throw new P02ContractError(code, `${label} is missing required key: ${key}.`);
    }
  }
}

function absentKey(value, key, code, label) {
  if (Object.hasOwn(value, key)) {
    throw new P02ContractError(code, `${label} must not include ${key} for this discriminator.`);
  }
}

function boolean(value, code, label) {
  if (typeof value !== "boolean") {
    throw new P02ContractError(code, `${label} must be a boolean.`);
  }
  return value;
}

function integer(value, code, label, { nullable = false, min = 0, max = 2_147_483_647 } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new P02ContractError(code, `${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function decimalString(value, code, label) {
  const text = string(value, code, label, { min: 1, max: 96 });
  if (!DECIMAL.test(text)) {
    throw new P02ContractError(code, `${label} must be an exact decimal string.`);
  }
  return text;
}

function oneOf(value, values, code, label) {
  if (!values.includes(value)) {
    throw new P02ContractError(code, `${label} has an unsupported value.`);
  }
  return value;
}

function scalar(value, code, label) {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new P02ContractError(code, `${label} must be a string, finite number, or boolean.`);
}

function interval(value, code, label) {
  const candidate = record(value, code, label);
  exactKeys(candidate, ["start", "end_exclusive"], `${code}_UNKNOWN_FIELD`, label);
  requiredKeys(candidate, ["start", "end_exclusive"], `${code}_MISSING_FIELD`, label);
  return Object.freeze({
    start: string(candidate.start, code, `${label}.start`, { min: 1, max: 64 }),
    end_exclusive: string(candidate.end_exclusive, code, `${label}.end_exclusive`, { min: 1, max: 64 }),
  });
}

function alphaBinding(value) {
  if (value === null) return null;
  const binding = record(value, "REQUESTED_SPEC_ALPHA_BINDING_INVALID", "requested_spec.alpha_binding");
  exactKeys(
    binding,
    ["alpha_id", "alpha_version_id"],
    "REQUESTED_SPEC_ALPHA_BINDING_UNKNOWN_FIELD",
    "requested_spec.alpha_binding",
  );
  requiredKeys(
    binding,
    ["alpha_id", "alpha_version_id"],
    "REQUESTED_SPEC_ALPHA_BINDING_MISSING_FIELD",
    "requested_spec.alpha_binding",
  );
  return Object.freeze({
    alpha_id: identifier(binding.alpha_id, "REQUESTED_SPEC_ALPHA_ID_INVALID", "requested_spec.alpha_binding.alpha_id"),
    alpha_version_id: identifier(
      binding.alpha_version_id,
      "REQUESTED_SPEC_ALPHA_VERSION_ID_INVALID",
      "requested_spec.alpha_binding.alpha_version_id",
    ),
  });
}

function routeParams(value, executionRoute) {
  const params = record(value, "REQUESTED_SPEC_ROUTE_PARAMS_REQUIRED", "requested_spec.route_params");
  const allowed = ["intrabar", "portfolio", "reactive", "dca"];
  exactKeys(params, allowed, "REQUESTED_SPEC_ROUTE_PARAMS_UNKNOWN_FIELD", "requested_spec.route_params");
  const expected = {
    intrabar_bracket: "intrabar",
    portfolio: "portfolio",
    reactive: "reactive",
    dca_ladder: "dca",
  }[executionRoute];
  if (!expected) {
    if (Object.keys(params).length !== 0) {
      throw new P02ContractError(
        "REQUESTED_SPEC_ROUTE_PARAMS_FORBIDDEN",
        `requested_spec.route_params must be empty for ${executionRoute}.`,
      );
    }
    return Object.freeze({});
  }
  requiredKeys(params, [expected], "REQUESTED_SPEC_ROUTE_PARAMS_MISSING_FIELD", "requested_spec.route_params");
  for (const key of allowed) {
    if (key !== expected) absentKey(params, key, "REQUESTED_SPEC_ROUTE_PARAMS_FORBIDDEN", "requested_spec.route_params");
  }

  if (expected === "intrabar") {
    const input = record(params.intrabar, "REQUESTED_SPEC_INTRABAR_INVALID", "requested_spec.route_params.intrabar");
    exactKeys(input, ["level_mode", "same_bar_policy", "tick_size"], "REQUESTED_SPEC_INTRABAR_UNKNOWN_FIELD", "requested_spec.route_params.intrabar");
    requiredKeys(input, ["level_mode", "same_bar_policy", "tick_size"], "REQUESTED_SPEC_INTRABAR_MISSING_FIELD", "requested_spec.route_params.intrabar");
    return Object.freeze({
      intrabar: Object.freeze({
        level_mode: oneOf(input.level_mode, ["hlc_conservative", "ohlc_path", "close_only"], "REQUESTED_SPEC_INTRABAR_LEVEL_MODE_INVALID", "requested_spec.route_params.intrabar.level_mode"),
        same_bar_policy: oneOf(input.same_bar_policy, ["stop_first", "target_first", "ambiguity_flag"], "REQUESTED_SPEC_INTRABAR_SAME_BAR_POLICY_INVALID", "requested_spec.route_params.intrabar.same_bar_policy"),
        tick_size: decimalString(input.tick_size, "REQUESTED_SPEC_INTRABAR_TICK_INVALID", "requested_spec.route_params.intrabar.tick_size"),
      }),
    });
  }
  if (expected === "portfolio") {
    const input = record(params.portfolio, "REQUESTED_SPEC_PORTFOLIO_INVALID", "requested_spec.route_params.portfolio");
    exactKeys(input, ["mode", "sizing"], "REQUESTED_SPEC_PORTFOLIO_UNKNOWN_FIELD", "requested_spec.route_params.portfolio");
    requiredKeys(input, ["mode", "sizing"], "REQUESTED_SPEC_PORTFOLIO_MISSING_FIELD", "requested_spec.route_params.portfolio");
    return Object.freeze({
      portfolio: Object.freeze({
        mode: oneOf(input.mode, ["longshort", "market_neutral", "directional", "equal_weight", "risk_parity", "beta_neutral"], "REQUESTED_SPEC_PORTFOLIO_MODE_INVALID", "requested_spec.route_params.portfolio.mode"),
        sizing: oneOf(input.sizing, ["equal_weight", "risk_parity", "vol_target", "kelly_fraction", "fixed_notional", "atr_risk", "min_variance", "score_weighted"], "REQUESTED_SPEC_PORTFOLIO_SIZING_INVALID", "requested_spec.route_params.portfolio.sizing"),
      }),
    });
  }
  if (expected === "reactive") {
    const input = record(params.reactive, "REQUESTED_SPEC_REACTIVE_INVALID", "requested_spec.route_params.reactive");
    exactKeys(input, ["runtime", "audit_mode"], "REQUESTED_SPEC_REACTIVE_UNKNOWN_FIELD", "requested_spec.route_params.reactive");
    requiredKeys(input, ["runtime", "audit_mode"], "REQUESTED_SPEC_REACTIVE_MISSING_FIELD", "requested_spec.route_params.reactive");
    return Object.freeze({
      reactive: Object.freeze({
        runtime: oneOf(input.runtime, ["R0", "R1", "R2", "R3", "R3B"], "REQUESTED_SPEC_REACTIVE_RUNTIME_INVALID", "requested_spec.route_params.reactive.runtime"),
        audit_mode: oneOf(input.audit_mode, ["minimal", "standard", "audit"], "REQUESTED_SPEC_REACTIVE_AUDIT_MODE_INVALID", "requested_spec.route_params.reactive.audit_mode"),
      }),
    });
  }
  const input = record(params.dca, "REQUESTED_SPEC_DCA_INVALID", "requested_spec.route_params.dca");
  exactKeys(input, ["base_order_usd", "safety_orders", "step_scale"], "REQUESTED_SPEC_DCA_UNKNOWN_FIELD", "requested_spec.route_params.dca");
  requiredKeys(input, ["base_order_usd", "safety_orders", "step_scale"], "REQUESTED_SPEC_DCA_MISSING_FIELD", "requested_spec.route_params.dca");
  return Object.freeze({
    dca: Object.freeze({
      base_order_usd: decimalString(input.base_order_usd, "REQUESTED_SPEC_DCA_BASE_ORDER_INVALID", "requested_spec.route_params.dca.base_order_usd"),
      safety_orders: integer(input.safety_orders, "REQUESTED_SPEC_DCA_SAFETY_ORDERS_INVALID", "requested_spec.route_params.dca.safety_orders", { min: 0 }),
      step_scale: decimalString(input.step_scale, "REQUESTED_SPEC_DCA_STEP_SCALE_INVALID", "requested_spec.route_params.dca.step_scale"),
    }),
  });
}

function parameterOverride(value, index) {
  const label = `requested_spec.parameter_space_overrides[${index}]`;
  const candidate = record(value, "REQUESTED_SPEC_PARAMETER_OVERRIDE_INVALID", label);
  exactKeys(candidate, ["name", "kind", "low", "high", "value"], "REQUESTED_SPEC_PARAMETER_OVERRIDE_UNKNOWN_FIELD", label);
  requiredKeys(candidate, ["name", "kind"], "REQUESTED_SPEC_PARAMETER_OVERRIDE_MISSING_FIELD", label);
  const kind = oneOf(candidate.kind, ["sweep", "pin"], "REQUESTED_SPEC_PARAMETER_OVERRIDE_KIND_INVALID", `${label}.kind`);
  if (kind === "sweep") {
    requiredKeys(candidate, ["low", "high"], "REQUESTED_SPEC_PARAMETER_OVERRIDE_MISSING_FIELD", label);
    absentKey(candidate, "value", "REQUESTED_SPEC_PARAMETER_OVERRIDE_FORBIDDEN_FIELD", label);
    return Object.freeze({
      name: identifier(candidate.name, "REQUESTED_SPEC_PARAMETER_NAME_INVALID", `${label}.name`),
      kind,
      low: scalar(candidate.low, "REQUESTED_SPEC_PARAMETER_VALUE_INVALID", `${label}.low`),
      high: scalar(candidate.high, "REQUESTED_SPEC_PARAMETER_VALUE_INVALID", `${label}.high`),
    });
  }
  requiredKeys(candidate, ["value"], "REQUESTED_SPEC_PARAMETER_OVERRIDE_MISSING_FIELD", label);
  absentKey(candidate, "low", "REQUESTED_SPEC_PARAMETER_OVERRIDE_FORBIDDEN_FIELD", label);
  absentKey(candidate, "high", "REQUESTED_SPEC_PARAMETER_OVERRIDE_FORBIDDEN_FIELD", label);
  return Object.freeze({
    name: identifier(candidate.name, "REQUESTED_SPEC_PARAMETER_NAME_INVALID", `${label}.name`),
    kind,
    value: scalar(candidate.value, "REQUESTED_SPEC_PARAMETER_VALUE_INVALID", `${label}.value`),
  });
}

/**
 * Validates the versioned S02 payload shape.  This is intentionally structural:
 * P04 remains the authority for installed-manifest options/ceilings and P10
 * remains the authority for the authenticated producer and current API path.
 */
export function assertRequestedSpecV1(value) {
  const spec = record(value, "REQUESTED_SPEC_REQUIRED", "research.requested_spec");
  exactKeys(spec, REQUESTED_SPEC_FIELDS, "REQUESTED_SPEC_UNKNOWN_FIELD", "research.requested_spec");
  requiredKeys(
    spec,
    ["schema_version", "alpha_binding", "not_publishable", "strategy_id", "execution_route", "route_params", "data", "protocol", "optimization_mode", "optimization_schedule", "parameter_space_overrides", "optuna_trials", "early_stopping", "random_seed", "optimization_config", "client"],
    "REQUESTED_SPEC_MISSING_FIELD",
    "research.requested_spec",
  );
  if (spec.schema_version !== REQUESTED_SPEC_V1_SCHEMA_VERSION) {
    throw new P02ContractError(
      "REQUESTED_SPEC_SCHEMA_VERSION_UNSUPPORTED",
      `requested_spec.schema_version must be ${REQUESTED_SPEC_V1_SCHEMA_VERSION}.`,
    );
  }
  const binding = alphaBinding(spec.alpha_binding);
  const notPublishable = boolean(spec.not_publishable, "REQUESTED_SPEC_NOT_PUBLISHABLE_INVALID", "requested_spec.not_publishable");
  if ((binding === null) !== notPublishable) {
    throw new P02ContractError(
      "REQUESTED_SPEC_BINDING_PUBLISHABILITY_CONFLICT",
      "requested_spec.alpha_binding and requested_spec.not_publishable must agree.",
    );
  }
  const executionRoute = oneOf(spec.execution_route, REQUESTED_SPEC_V1_ROUTE_IDS, "REQUESTED_SPEC_ROUTE_INVALID", "requested_spec.execution_route");
  const protocol = oneOf(spec.protocol, [...REQUESTED_SPEC_PROTOCOLS], "REQUESTED_SPEC_PROTOCOL_INVALID", "requested_spec.protocol");
  const data = record(spec.data, "REQUESTED_SPEC_DATA_REQUIRED", "requested_spec.data");
  exactKeys(data, ["dataset_id", "symbol", "timeframe"], "REQUESTED_SPEC_DATA_UNKNOWN_FIELD", "requested_spec.data");
  requiredKeys(data, ["dataset_id", "symbol", "timeframe"], "REQUESTED_SPEC_DATA_MISSING_FIELD", "requested_spec.data");
  const client = record(spec.client, "REQUESTED_SPEC_CLIENT_REQUIRED", "requested_spec.client");
  exactKeys(client, ["engine_release_id", "config_digest"], "REQUESTED_SPEC_CLIENT_UNKNOWN_FIELD", "requested_spec.client");
  requiredKeys(client, ["engine_release_id", "config_digest"], "REQUESTED_SPEC_CLIENT_MISSING_FIELD", "requested_spec.client");
  const configDigest = string(client.config_digest, "REQUESTED_SPEC_CONFIG_DIGEST_INVALID", "requested_spec.client.config_digest", { min: 64, max: 64 });
  if (!SHA256.test(configDigest)) {
    throw new P02ContractError("REQUESTED_SPEC_CONFIG_DIGEST_INVALID", "requested_spec.client.config_digest must be lowercase SHA-256 hex.");
  }
  const optimizationConfig = record(spec.optimization_config, "REQUESTED_SPEC_OPTIMIZATION_CONFIG_INVALID", "requested_spec.optimization_config");
  for (const [key, candidate] of Object.entries(optimizationConfig)) {
    identifier(key, "REQUESTED_SPEC_OPTIMIZATION_CONFIG_KEY_INVALID", "requested_spec.optimization_config key");
    scalar(candidate, "REQUESTED_SPEC_OPTIMIZATION_CONFIG_VALUE_INVALID", `requested_spec.optimization_config.${key}`);
  }
  if (!Array.isArray(spec.parameter_space_overrides)) {
    throw new P02ContractError("REQUESTED_SPEC_PARAMETER_OVERRIDES_INVALID", "requested_spec.parameter_space_overrides must be an array.");
  }
  const normalized = {
    schema_version: spec.schema_version,
    alpha_binding: binding,
    not_publishable: notPublishable,
    strategy_id: identifier(spec.strategy_id, "REQUESTED_SPEC_STRATEGY_ID_INVALID", "requested_spec.strategy_id"),
    execution_route: executionRoute,
    route_params: routeParams(spec.route_params, executionRoute),
    data: Object.freeze({
      dataset_id: identifier(data.dataset_id, "REQUESTED_SPEC_DATASET_ID_INVALID", "requested_spec.data.dataset_id"),
      symbol: string(data.symbol, "REQUESTED_SPEC_SYMBOL_INVALID", "requested_spec.data.symbol", { min: 1, max: 64 }),
      timeframe: identifier(data.timeframe, "REQUESTED_SPEC_TIMEFRAME_INVALID", "requested_spec.data.timeframe"),
    }),
    protocol,
    optimization_mode: identifier(spec.optimization_mode, "REQUESTED_SPEC_OPTIMIZATION_MODE_INVALID", "requested_spec.optimization_mode"),
    optimization_schedule: identifier(spec.optimization_schedule, "REQUESTED_SPEC_OPTIMIZATION_SCHEDULE_INVALID", "requested_spec.optimization_schedule"),
    parameter_space_overrides: Object.freeze(spec.parameter_space_overrides.map(parameterOverride)),
    optuna_trials: integer(spec.optuna_trials, "REQUESTED_SPEC_TRIALS_INVALID", "requested_spec.optuna_trials", { min: 1 }),
    early_stopping: integer(spec.early_stopping, "REQUESTED_SPEC_EARLY_STOPPING_INVALID", "requested_spec.early_stopping", { nullable: true, min: 1 }),
    random_seed: integer(spec.random_seed, "REQUESTED_SPEC_RANDOM_SEED_INVALID", "requested_spec.random_seed", { nullable: true, min: 0 }),
    optimization_config: Object.freeze({ ...optimizationConfig }),
    client: Object.freeze({
      engine_release_id: identifier(client.engine_release_id, "REQUESTED_SPEC_ENGINE_RELEASE_ID_INVALID", "requested_spec.client.engine_release_id"),
      config_digest: configDigest,
    }),
  };
  if (protocol === "three_window_decay") {
    requiredKeys(spec, ["windows"], "REQUESTED_SPEC_WINDOWS_REQUIRED", "research.requested_spec");
    absentKey(spec, "walk_forward", "REQUESTED_SPEC_PROTOCOL_FIELD_FORBIDDEN", "research.requested_spec");
    const windows = record(spec.windows, "REQUESTED_SPEC_WINDOWS_INVALID", "requested_spec.windows");
    exactKeys(windows, ["is", "oos", "holdout"], "REQUESTED_SPEC_WINDOWS_UNKNOWN_FIELD", "requested_spec.windows");
    requiredKeys(windows, ["is", "oos", "holdout"], "REQUESTED_SPEC_WINDOWS_MISSING_FIELD", "requested_spec.windows");
    return Object.freeze({
      ...normalized,
      windows: Object.freeze({
        is: interval(windows.is, "REQUESTED_SPEC_WINDOW_INVALID", "requested_spec.windows.is"),
        oos: interval(windows.oos, "REQUESTED_SPEC_WINDOW_INVALID", "requested_spec.windows.oos"),
        holdout: interval(windows.holdout, "REQUESTED_SPEC_WINDOW_INVALID", "requested_spec.windows.holdout"),
      }),
    });
  }
  requiredKeys(spec, ["walk_forward"], "REQUESTED_SPEC_WALK_FORWARD_REQUIRED", "research.requested_spec");
  absentKey(spec, "windows", "REQUESTED_SPEC_PROTOCOL_FIELD_FORBIDDEN", "research.requested_spec");
  const walkForward = record(spec.walk_forward, "REQUESTED_SPEC_WALK_FORWARD_INVALID", "requested_spec.walk_forward");
  exactKeys(walkForward, ["start", "end_exclusive", "split_mode", "frequency", "window_mode"], "REQUESTED_SPEC_WALK_FORWARD_UNKNOWN_FIELD", "requested_spec.walk_forward");
  requiredKeys(walkForward, ["start", "end_exclusive", "split_mode", "frequency", "window_mode"], "REQUESTED_SPEC_WALK_FORWARD_MISSING_FIELD", "requested_spec.walk_forward");
  return Object.freeze({
    ...normalized,
    walk_forward: Object.freeze({
      start: string(walkForward.start, "REQUESTED_SPEC_WALK_FORWARD_VALUE_INVALID", "requested_spec.walk_forward.start", { min: 1, max: 64 }),
      end_exclusive: string(walkForward.end_exclusive, "REQUESTED_SPEC_WALK_FORWARD_VALUE_INVALID", "requested_spec.walk_forward.end_exclusive", { min: 1, max: 64 }),
      split_mode: identifier(walkForward.split_mode, "REQUESTED_SPEC_WALK_FORWARD_VALUE_INVALID", "requested_spec.walk_forward.split_mode"),
      frequency: identifier(walkForward.frequency, "REQUESTED_SPEC_WALK_FORWARD_VALUE_INVALID", "requested_spec.walk_forward.frequency"),
      window_mode: identifier(walkForward.window_mode, "REQUESTED_SPEC_WALK_FORWARD_VALUE_INVALID", "requested_spec.walk_forward.window_mode"),
    }),
  });
}

/**
 * Validates only the Research-owned supplemental envelope.  `strategy_id`,
 * `dataset_id`, and `protocol` remain top-level legacy fields because the
 * unchanged facade reads exactly those fields when it receives a 202/run_id.
 */
export function assertResearchRunRequestV1(value) {
  const request = record(value, "RESEARCH_REQUEST_OBJECT_REQUIRED", "research request");
  // This is a producer-side freeze, so it must reject unowned top-level data
  // rather than silently turning a future form field into a de-facto wire
  // contract.  The unchanged facade itself is intentionally not modified.
  exactKeys(
    request,
    ["strategy_id", "dataset_id", "protocol", "research_contract_version", "research"],
    "RESEARCH_REQUEST_UNKNOWN_FIELD",
    "research request",
  );
  for (const field of ["strategy_id", "dataset_id", "protocol"]) {
    identifier(request[field], "LEGACY_COMPATIBILITY_FIELD_REQUIRED", field);
  }
  if (request.research_contract_version !== "research.run-request.v1") {
    throw new P02ContractError(
      "RESEARCH_CONTRACT_VERSION_UNSUPPORTED",
      "research_contract_version must be research.run-request.v1.",
    );
  }
  const research = record(request.research, "RESEARCH_ENVELOPE_REQUIRED", "research");
  exactKeys(
    research,
    ["client_intent_id", "alpha_version_id", "preflight_token", "requested_spec"],
    "RESEARCH_ENVELOPE_UNKNOWN_FIELD",
    "research",
  );
  const requestedSpec = assertRequestedSpecV1(
    research.requested_spec,
  );
  const researchAlphaVersionId = identifier(
    research.alpha_version_id,
    "ALPHA_VERSION_ID_INVALID",
    "research.alpha_version_id",
    { nullable: true },
  );
  if (requestedSpec.strategy_id !== request.strategy_id
    || requestedSpec.data.dataset_id !== request.dataset_id
    || requestedSpec.protocol !== request.protocol) {
    throw new P02ContractError(
      "RESEARCH_REQUEST_LEGACY_MIRROR_MISMATCH",
      "requested_spec strategy_id, data.dataset_id, and protocol must exactly mirror the legacy compatibility fields.",
    );
  }
  if (researchAlphaVersionId !== (requestedSpec.alpha_binding?.alpha_version_id ?? null)) {
    throw new P02ContractError(
      "RESEARCH_REQUEST_ALPHA_VERSION_MISMATCH",
      "research.alpha_version_id must exactly mirror requested_spec.alpha_binding.alpha_version_id (or null for scratch).",
    );
  }
  const normalized = {
    strategy_id: request.strategy_id,
    dataset_id: request.dataset_id,
    protocol: request.protocol,
    research_contract_version: request.research_contract_version,
    research: {
      client_intent_id: identifier(
        research.client_intent_id,
        "CLIENT_INTENT_ID_REQUIRED",
        "research.client_intent_id",
      ),
      alpha_version_id: researchAlphaVersionId,
      preflight_token: string(
        research.preflight_token,
        "PREFLIGHT_TOKEN_REQUIRED",
        "research.preflight_token",
        { min: 16, max: 512 },
      ),
      requested_spec: requestedSpec,
    },
  };
  return normalized;
}

/**
 * P02 identity mapping: Research's alpha version is descriptive; the
 * existing facade and governance gate bind to its execution subject/strategy.
 */
export function assertIdentityBinding(value) {
  const binding = record(value, "IDENTITY_BINDING_REQUIRED", "identity binding");
  exactKeys(
    binding,
    ["workspace_id", "research_alpha_id", "strategy_adapter_id", "execution_subject_id", "actor_user_id"],
    "IDENTITY_BINDING_UNKNOWN_FIELD",
    "identity binding",
  );
  const normalized = {
    workspace_id: identifier(binding.workspace_id, "WORKSPACE_ID_INVALID", "workspace_id"),
    research_alpha_id: identifier(binding.research_alpha_id, "RESEARCH_ALPHA_ID_INVALID", "research_alpha_id"),
    strategy_adapter_id: identifier(binding.strategy_adapter_id, "STRATEGY_ADAPTER_ID_INVALID", "strategy_adapter_id"),
    execution_subject_id: identifier(binding.execution_subject_id, "EXECUTION_SUBJECT_ID_INVALID", "execution_subject_id"),
    actor_user_id: identifier(binding.actor_user_id, "ACTOR_ID_INVALID", "actor_user_id"),
  };
  if (normalized.strategy_adapter_id !== normalized.execution_subject_id) {
    throw new P02ContractError(
      "EXECUTION_SUBJECT_STRATEGY_MISMATCH",
      "execution_subject_id must exactly equal strategy_adapter_id for unchanged R1 compatibility.",
    );
  }
  return normalized;
}

/** Creates the exact strict payload already owned by Governance. */
export function createExactR1Payload({ binding, request_key, evidence_run_id, methodology_claim_id, summary }) {
  const identity = assertIdentityBinding(binding);
  if (!REQUEST_KEY.test(string(request_key, "REQUEST_KEY_INVALID", "request_key", { min: 3, max: 192 }))) {
    throw new P02ContractError("REQUEST_KEY_INVALID", "request_key contains unsupported characters.");
  }
  const payload = {
    schema_version: "governance.approval-create-request.v1",
    workspace_id: identity.workspace_id,
    request_key,
    gate: "R1",
    alpha_id: identity.execution_subject_id,
    evidence_run_id: identifier(evidence_run_id, "EVIDENCE_RUN_ID_INVALID", "evidence_run_id"),
    methodology_claim_id: identifier(
      methodology_claim_id,
      "METHODOLOGY_CLAIM_ID_INVALID",
      "methodology_claim_id",
    ),
    summary: string(summary, "R1_SUMMARY_INVALID", "summary", { min: 8, max: 2000 }),
  };
  return Object.freeze(payload);
}

/**
 * Canonical optimizer semantics for future producers.  The existing runtime
 * accepts no Research aliases today; this validator fails duplicated logical
 * aliases rather than silently choosing one.  Strategy and sampler seeds are
 * separately named scopes and may intentionally differ.
 */
export function validateOptimizerBindings(value) {
  const input = record(value, "OPTIMIZER_BINDING_REQUIRED", "optimizer binding");
  const optimizer = record(input.optimizer, "OPTIMIZER_REQUIRED", "optimizer");
  const seeds = record(input.seeds, "SEEDS_REQUIRED", "seeds");
  const aliasPairs = [
    ["trial_budget", "optuna_trials"],
    ["early_stop", "optuna_early_stopping"],
  ];
  for (const [canonical, alias] of aliasPairs) {
    if (optimizer[canonical] !== undefined && optimizer[alias] !== undefined) {
      throw new P02ContractError(
        "OPTIMIZER_ALIAS_CONFLICT",
        `${canonical} and ${alias} name the same logical optimizer value; send one canonical value only.`,
      );
    }
  }
  for (const key of ["strategy_seed", "sampler_seed"]) {
    const number = seeds[key];
    if (!Number.isInteger(number) || number < 0 || number > 2_147_483_647) {
      throw new P02ContractError("SEED_SCOPE_INVALID", `${key} must be a non-negative signed-32-bit integer.`);
    }
  }
  return Object.freeze({
    trial_budget: optimizer.trial_budget ?? optimizer.optuna_trials ?? null,
    early_stop: optimizer.early_stop ?? optimizer.optuna_early_stopping ?? null,
    strategy_seed: seeds.strategy_seed,
    sampler_seed: seeds.sampler_seed,
  });
}

function cursorValue(key, value) {
  const decoded = value;
  if (!decoded || decoded.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(decoded)) {
    throw new P02ContractError("CURSOR_VALUE_INVALID", `${key} has an invalid value.`);
  }
  return decoded;
}

/**
 * Research cursor codecs are URL-only inspection state.  They neither read
 * nor mutate runtime data.  A bare trial id is refused when caller context
 * says it is ambiguous across studies.
 */
export function parseResearchCursor(raw, { ambiguousTrialIds = [] } = {}) {
  const params = new URLSearchParams(String(raw).replace(/^#?\??/, ""));
  const result = {};
  for (const [key, value] of params.entries()) {
    if (!CURSOR_KEYS.has(key)) {
      throw new P02ContractError("CURSOR_UNSUPPORTED_KEY", `Unsupported Research cursor key: ${key}.`);
    }
    if (Object.hasOwn(result, key)) {
      throw new P02ContractError("CURSOR_DUPLICATE_KEY", `Research cursor key is repeated: ${key}.`);
    }
    result[key] = cursorValue(key, value);
  }
  if (result.seq && result.event_seq && result.seq !== result.event_seq) {
    throw new P02ContractError("CURSOR_SEQUENCE_CONFLICT", "seq and event_seq cannot disagree.");
  }
  if (result.trial && ambiguousTrialIds.includes(result.trial) && !result.study) {
    throw new P02ContractError("CURSOR_STUDY_REQUIRED", "A study is required for an ambiguous trial reference.");
  }
  return Object.freeze(result);
}

export function serializeResearchCursor(value) {
  const cursor = record(value, "CURSOR_OBJECT_REQUIRED", "Research cursor");
  const params = new URLSearchParams();
  for (const key of CURSOR_ORDER) {
    const candidate = cursor[key];
    if (candidate === undefined || candidate === null || candidate === "") continue;
    params.set(key, cursorValue(key, candidate));
  }
  return params.toString();
}
