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
      alpha_version_id: identifier(
        research.alpha_version_id,
        "ALPHA_VERSION_ID_INVALID",
        "research.alpha_version_id",
        { nullable: true },
      ),
      preflight_token: string(
        research.preflight_token,
        "PREFLIGHT_TOKEN_REQUIRED",
        "research.preflight_token",
        { min: 16, max: 512 },
      ),
      requested_spec: record(
        research.requested_spec,
        "REQUESTED_SPEC_REQUIRED",
        "research.requested_spec",
      ),
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
