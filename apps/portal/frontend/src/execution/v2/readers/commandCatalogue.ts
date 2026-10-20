/**
 * The strict V2 reader of the published command catalogue (UXM-09, fixture lane):
 *
 * - `execution.command-catalog.v1`   `CommandCatalogue` (GET /api/v1/execution/commands/catalog, 200)
 *                                    `execution-operations.v1.schema.json#/$defs/CommandCatalogue`
 *
 * It replaces the lenient V1 reader (`adminCatalog.readCommandCatalogue`, which drops what it cannot read and keeps going) on the command
 * story. The V1 reader stays as it is, for the V1 screens.
 *
 * What this body proves, and what no screen may let it say:
 *
 * - It is a LIST OF REASONS, not a list of things to run. Every constant that decides the page is in the schema (`capability.state`
 *   DISABLED, `portal_reachable` false on every entry, `capability_state` DISABLED, `freshness_state` UNAVAILABLE, `catalogue_revision` 2,
 *   `total_entries` 64). They are READ, not assumed: a body with any other value is not this contract, so it is refused whole rather than
 *   repaired into it. A later revision that widens a constant needs its own reader.
 * - A command that CLAIMS to be sendable is refused, never shown as enabled and never silently clamped to disabled: `portal_reachable`
 *   true, a `classification` of CONNECTED (not a member of the served vocabulary: the service refuses to emit it, and this reader refuses it
 *   under its own name), or `runtime_active` true on the N16B primitive.
 * - It reads the SERVED body (`ServedCommandCatalogue`, BE-P13): `classification` is required on every entry. The pinned extract
 *   (`execution-command-catalog.valid.json`, evidence of the N16B acceptance record) predates it, is schema-valid as `CommandCatalogue`, and is
 *   refused here with `missing_key`: the story and any real response use the served form.
 * - N16B: exactly one entry (`ops/emergency-close`) serves `source_route_state` CURRENT_PRIMITIVE_CONFIRMED, `blocked_reason`
 *   N16B_RUNTIME_ACTIVATION_PENDING and five extra keys (`current_primitive_state`, `current_capability_id`, `accepted_environments`,
 *   `accepted_target_types`, `runtime_active`). The extras exist exactly with that route state (the schema's if/then/else) and are constants:
 *   it is a description of an accepted-but-DARK primitive, never an activation.
 * - The closed vocabulary is closed. No unknown key at any level (a planted `__proto__` is an own key and is refused), no unknown word, no
 *   null where the schema has none, no duplicate operation key. Nothing is defaulted: the V1 reader's "unreadable flag means required" and
 *   "unreadable group means group not stated" do not exist here, because a body that cannot be read is not a catalogue.
 * - The reader exposes CODES, never server prose. The words an operator reads for a `blocked_reason` come from the public dictionary
 *   (`BLOCKED_REASON_TEXT`), not from the body. There is no message field in this contract; one planted in an entry is an unknown key and
 *   voids the read. `http_path`, `source_reference` and `workspace_id` are kept as identifiers (checked as plain text) and are not copy.
 *
 * Stricter than the schema, in NAMED groups only (each is a refusal reason; the conformance suite prints how many schema-valid payloads
 * each one refuses, and a schema-invalid payload must never be read):
 *
 *   text-hygiene          `workspace_id`, `http_path`, `source_reference`, `classification.reason_code` hold no ASCII/C1 control, no zero-width or
 *                         bidi-control character, no lone surrogate, and are not whitespace-only. Length is held in UTF-16 units (<= the schema's).
 *   key-identity          `key` is `command/action` of the same entry, and the body holds no two entries with one `key`.
 *   known-key-set         `key` is one of the 64 published command keys (`F0_COMMAND_KEYS`): `total_entries` is the constant 64, so a key
 *                         outside the set is a command no contract names.
 *   count-identity        `returned_entries` equals `entries.length`.
 *   scope-filter          when `scope.requested_risk_tier` is set, every entry is of that tier (the label is not allowed to lie).
 *   reason-state          each `blocked_reason` is only read beside the `source_route_state` it describes (COMMAND_RELAY_DISABLED beside
 *                         OBSERVED, and so on): the dictionary sentence for the reason would otherwise contradict the route facts.
 *   route-pair            `http_method` and `http_path` are both null or both set; OBSERVED has both; any other state has neither (so the N16B
 *                         primitive, which has no HTTP route, has neither).
 *   primitive-identity    CURRENT_PRIMITIVE_CONFIRMED (and so the N16B extras) only on `ops/emergency-close`; reported as `route_incoherent`.
 *   mutation-ceremony     a mutation tier (R1 to R4) requires owner review, plan and apply; an observed non-GET route requires owner review and
 *                         is never tier R0. Fewer steps than the Portal's own policy would understate what the command costs.
 *   sendable-claim        CONNECTED classification and `runtime_active` true (see above).
 *
 * Answer: `{ kind: "command_catalogue" }`, `{ kind: "unsupported_shape" }` (a readable body of another `schema_version`) or
 * `{ kind: "refused", reason, at }`. `at` is a path built from names this file knows (never from a key in the body), so a planted key
 * cannot reach a screen through it. None throws.
 */
import { F0_COMMAND_KEYS } from "./commandOperation";
import { RISK_TIERS_V2, type RiskTierV2 } from "./operationalQueue";

export const COMMAND_CATALOGUE_SCHEMA = "execution.command-catalog.v1";
export const CATALOGUE_REVISION = 2;
export const CATALOGUE_TOTAL_ENTRIES = 64;
export const CATALOGUE_POLICY_REVISION = "execution.command-catalogue.f0.v2";
export const CATALOGUE_CAPABILITY_REASON = "EX_BE_05B_F0_CONTRACT_ONLY";

export const CATALOGUE_GROUPS = [
  "ACCOUNT_CAPITAL", "ALPHA_DEPLOYMENT", "ORDER_CONTROL", "OPERATIONS_INCIDENTS", "MARKET_REFERENCE", "PLATFORM_DIAGNOSTICS",
] as const;
export type CatalogueGroup = (typeof CATALOGUE_GROUPS)[number];

export const CATALOGUE_ROUTE_STATES = ["OBSERVED", "AMBIGUOUS", "UNPUBLISHED", "DIRECT_ACCESS_PROHIBITED", "CURRENT_PRIMITIVE_CONFIRMED"] as const;
export type CatalogueRouteState = (typeof CATALOGUE_ROUTE_STATES)[number];

export const CATALOGUE_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type CatalogueHttpMethod = (typeof CATALOGUE_HTTP_METHODS)[number];

export const CATALOGUE_BLOCKED_REASONS = [
  "COMMAND_RELAY_DISABLED", "SOURCE_ROUTE_MAPPING_AMBIGUOUS", "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED",
  "TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED", "GENERIC_REDIS_ACCESS_PROHIBITED", "DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED",
  "N16B_RUNTIME_ACTIVATION_PENDING",
] as const;
export type CatalogueBlockedReason = (typeof CATALOGUE_BLOCKED_REASONS)[number];

/** The served vocabulary. CONNECTED is not a member (BE-P13): the service refuses to publish a sendable claim, and so does this reader (`sendable_claim`). */
export const CATALOGUE_CLASSIFICATION_STATES = ["SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"] as const;
export type CatalogueClassificationState = (typeof CATALOGUE_CLASSIFICATION_STATES)[number];

export const CATALOGUE_ENVIRONMENTS = ["PAPER", "SANDBOX", "LIVE"] as const;
export type CatalogueEnvironment = (typeof CATALOGUE_ENVIRONMENTS)[number];

export const CATALOGUE_ENTITY_TYPES = ["ACCOUNT", "BROKER_BINDING", "DEPLOYMENT", "ORDER", "PORTFOLIO", "SYSTEM"] as const;
export type CatalogueEntityType = (typeof CATALOGUE_ENTITY_TYPES)[number];

/** The `source_route_state` each `blocked_reason` may be read beside (group `reason-state`). */
export const REASON_ROUTE_STATES: Readonly<Record<CatalogueBlockedReason, readonly CatalogueRouteState[]>> = {
  COMMAND_RELAY_DISABLED: ["OBSERVED"],
  SOURCE_ROUTE_MAPPING_AMBIGUOUS: ["AMBIGUOUS"],
  TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED: ["UNPUBLISHED"],
  TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED: ["DIRECT_ACCESS_PROHIBITED"],
  GENERIC_REDIS_ACCESS_PROHIBITED: ["DIRECT_ACCESS_PROHIBITED"],
  DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED: ["OBSERVED", "AMBIGUOUS"],
  N16B_RUNTIME_ACTIVATION_PENDING: ["CURRENT_PRIMITIVE_CONFIRMED"],
};

/** The only command that serves the N16B primitive (group `primitive-identity`). */
export const N16B_COMMAND_KEY = "ops/emergency-close";

const MUTATION_TIERS: readonly RiskTierV2[] = ["R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING"];

/* ───────────────────────────── types ───────────────────────────── */

export interface CommandCatalogueEntryV2 {
  /** `command/action`, or `command/<root>`. Unique in the body. */
  key: string;
  command: string;
  action: string;
  group: CatalogueGroup;
  /** What the PORTAL is bound by. */
  riskTier: RiskTierV2;
  /** What the source map proposed. Reported, never substituted for the above. */
  sourceRiskTier: RiskTierV2;
  ownerReviewRequired: boolean;
  planRequired: boolean;
  applyRequired: boolean;
  verifyRequired: boolean;
  /** Constant false in revision 2: a body that says anything else is refused. */
  portalReachable: false;
  routeState: CatalogueRouteState;
  httpMethod: CatalogueHttpMethod | null;
  httpPath: string | null;
  blockedReason: CatalogueBlockedReason;
  sourceReference: string;
  /** Required on every served entry. Never CONNECTED. */
  classification: { state: CatalogueClassificationState; reasonCode: string };
  /** `null` for every entry but `ops/emergency-close`: the accepted-but-DARK N16B current primitive, a description and not an activation. */
  currentPrimitive: CatalogueCurrentPrimitive | null;
}

export interface CatalogueCurrentPrimitive {
  state: "ACCEPTED_CURRENT_PRIMITIVE";
  capabilityId: "live.emergency-close";
  acceptedEnvironments: readonly ["LIVE"];
  acceptedTargetTypes: readonly ["ACCOUNT"];
  /** Constant false: accepted for compatibility, not activated. */
  runtimeActive: false;
}

export interface CommandCatalogueScopeV2 {
  workspaceId: string;
  actorUserId: string;
  actorRole: "ADMIN";
  environment: CatalogueEnvironment;
  entity: { type: CatalogueEntityType; id: string } | null;
  requestedRiskTier: RiskTierV2 | null;
  capabilityState: "DISABLED";
  freshnessState: "UNAVAILABLE";
  policyRevision: typeof CATALOGUE_POLICY_REVISION;
}

export interface CommandCatalogueV2 {
  revision: 2;
  deliveryProfile: "fixture";
  capabilityState: "DISABLED";
  capabilityReason: typeof CATALOGUE_CAPABILITY_REASON;
  source: { tradingSystemCommit: string; cliMapSha256: string; openapiSha256: string };
  scope: CommandCatalogueScopeV2;
  totalEntries: 64;
  returnedEntries: number;
  entries: readonly CommandCatalogueEntryV2[];
}

export const CATALOGUE_REFUSALS = [
  "not_an_object", "unknown_key", "missing_key", "constant_mismatch", "bad_enum", "bad_value", "out_of_bounds", "unsafe_text",
  "sendable_claim", "duplicate_operation", "key_mismatch", "unknown_command", "count_mismatch", "scope_mismatch", "reason_state_mismatch",
  "route_incoherent", "ceremony_understated",
] as const;
export type CatalogueRefusal = (typeof CATALOGUE_REFUSALS)[number];

export type CommandCatalogueRead =
  | { kind: "command_catalogue"; catalogue: CommandCatalogueV2 }
  | { kind: "unsupported_shape"; schemaVersion: string | null }
  | { kind: "refused"; reason: CatalogueRefusal; at: string };

/* ───────────────────────────── checks ───────────────────────────── */

type Rec = Record<string, unknown>;

/** Thrown inside this file only; `readCommandCatalogueV2` turns it into `refused` and never lets anything else out. */
class Refusal {
  constructor(readonly reason: CatalogueRefusal, readonly at: string) {}
}

function refuse(reason: CatalogueRefusal, at: string): never {
  throw new Refusal(reason, at);
}

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** Own keys: every required one and none outside required + optional. `at` is the path of the object itself. */
function closed(value: unknown, at: string, required: readonly string[], optional: readonly string[] = []): Rec {
  const r = rec(value);
  if (r === null) return refuse("not_an_object", at);
  const own = Object.keys(r);
  if (!own.every((key) => required.includes(key) || optional.includes(key))) return refuse("unknown_key", at);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(r, key)) return refuse("missing_key", `${at}.${key}`);
  return r;
}

function word<T extends string>(value: unknown, allowed: readonly T[], at: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) return refuse("bad_enum", at);
  return value as T;
}

function constant<T extends string | number | boolean>(value: unknown, expected: T, at: string): T {
  return value === expected ? expected : refuse("constant_mismatch", at);
}

function flag(value: unknown, at: string): boolean {
  return typeof value === "boolean" ? value : refuse("bad_value", at);
}

/** C0/C1 controls and DEL, zero-width and bidi-control format characters. */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** Group `text-hygiene`: `min..max` characters (UTF-16 units at most `max`), no unsafe character, well-formed, not whitespace-only. */
function plain(value: unknown, at: string, min: number, max: number): string {
  if (typeof value !== "string") return refuse("bad_value", at);
  if (value.length > max) return refuse("out_of_bounds", at);
  if (UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value) || value.trim().length === 0) return refuse("unsafe_text", at);
  return codePoints(value) < min ? refuse("out_of_bounds", at) : value;
}

function matching(value: unknown, pattern: RegExp, at: string): string {
  return typeof value === "string" && pattern.test(value) ? value : refuse("bad_value", at);
}

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,191}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const KEY = /^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/;
const COMMAND = /^[a-z0-9-]+$/;
const ACTION = /^(?:[a-z0-9-]+|<root>)$/;
const REASON_CODE = /^[A-Z0-9_]{3,120}$/;

/* ───────────────────────────── entry ───────────────────────────── */

const ENTRY_KEYS = [
  "key", "command", "action", "group", "risk_tier", "source_risk_tier", "owner_review_required", "plan_required", "apply_required",
  "verify_required", "portal_reachable", "source_route_state", "http_method", "http_path", "blocked_reason", "source_reference", "classification",
] as const;
/** Present exactly with `source_route_state` CURRENT_PRIMITIVE_CONFIRMED (the schema's if/then/else), absent otherwise. */
const N16B_KEYS = ["current_primitive_state", "current_capability_id", "accepted_environments", "accepted_target_types", "runtime_active"] as const;

/** A one-element array holding exactly `only`. */
function singleton(value: unknown, only: string, at: string): void {
  if (!Array.isArray(value) || value.length !== 1) return refuse("constant_mismatch", at);
  if (value[0] !== only) return refuse("constant_mismatch", `${at}[0]`);
}

function readEntry(raw: unknown, at: string): CommandCatalogueEntryV2 {
  const r = closed(raw, at, ENTRY_KEYS, N16B_KEYS);
  const key = matching(r.key, KEY, `${at}.key`);
  const command = matching(r.command, COMMAND, `${at}.command`);
  const action = matching(r.action, ACTION, `${at}.action`);
  const group = word(r.group, CATALOGUE_GROUPS, `${at}.group`);
  const riskTier = word(r.risk_tier, RISK_TIERS_V2, `${at}.risk_tier`);
  const sourceRiskTier = word(r.source_risk_tier, RISK_TIERS_V2, `${at}.source_risk_tier`);
  const ownerReviewRequired = flag(r.owner_review_required, `${at}.owner_review_required`);
  const planRequired = flag(r.plan_required, `${at}.plan_required`);
  const applyRequired = flag(r.apply_required, `${at}.apply_required`);
  const verifyRequired = flag(r.verify_required, `${at}.verify_required`);
  // The schema's `const false`. A `true` is a command CLAIMING it can be sent: refused, not clamped.
  if (r.portal_reachable === true) return refuse("sendable_claim", `${at}.portal_reachable`);
  constant(r.portal_reachable, false, `${at}.portal_reachable`);
  const routeState = word(r.source_route_state, CATALOGUE_ROUTE_STATES, `${at}.source_route_state`);
  const httpMethod = r.http_method === null ? null : word(r.http_method, CATALOGUE_HTTP_METHODS, `${at}.http_method`);
  const httpPath = r.http_path === null ? null : plain(r.http_path, `${at}.http_path`, 1, 512);
  const blockedReason = word(r.blocked_reason, CATALOGUE_BLOCKED_REASONS, `${at}.blocked_reason`);
  const sourceReference = plain(r.source_reference, `${at}.source_reference`, 1, 256);

  const c = closed(r.classification, `${at}.classification`, ["state", "reason_code"]);
  // CONNECTED is a sendable claim under its own name, not an unknown word.
  if (c.state === "CONNECTED") return refuse("sendable_claim", `${at}.classification.state`);
  const state = word(c.state, CATALOGUE_CLASSIFICATION_STATES, `${at}.classification.state`);
  const classification = { state, reasonCode: matching(c.reason_code, REASON_CODE, `${at}.classification.reason_code`) };

  // N16B extras: all five exactly when the route state is CURRENT_PRIMITIVE_CONFIRMED, none otherwise.
  let currentPrimitive: CatalogueCurrentPrimitive | null = null;
  if (routeState === "CURRENT_PRIMITIVE_CONFIRMED") {
    for (const field of N16B_KEYS) if (!Object.prototype.hasOwnProperty.call(r, field)) return refuse("missing_key", `${at}.${field}`);
    constant(r.current_primitive_state, "ACCEPTED_CURRENT_PRIMITIVE", `${at}.current_primitive_state`);
    constant(r.current_capability_id, "live.emergency-close", `${at}.current_capability_id`);
    singleton(r.accepted_environments, "LIVE", `${at}.accepted_environments`);
    singleton(r.accepted_target_types, "ACCOUNT", `${at}.accepted_target_types`);
    // Only the published `false` is "not active". A boolean `true` is an activation claim, refused under the sendable-claim name; anything else is not this contract.
    if (r.runtime_active !== false) return refuse(typeof r.runtime_active === "boolean" ? "sendable_claim" : "constant_mismatch", `${at}.runtime_active`);
    currentPrimitive = {
      state: "ACCEPTED_CURRENT_PRIMITIVE", capabilityId: "live.emergency-close", acceptedEnvironments: ["LIVE"], acceptedTargetTypes: ["ACCOUNT"], runtimeActive: false,
    };
  } else if (N16B_KEYS.some((field) => Object.prototype.hasOwnProperty.call(r, field))) {
    return refuse("unknown_key", at);
  }

  // key-identity
  if (key !== `${command}/${action}`) return refuse("key_mismatch", `${at}.key`);
  // known-key-set
  if (!(F0_COMMAND_KEYS as readonly string[]).includes(key)) return refuse("unknown_command", `${at}.key`);
  // reason-state
  if (!REASON_ROUTE_STATES[blockedReason].includes(routeState)) return refuse("reason_state_mismatch", `${at}.blocked_reason`);
  // route-pair
  if ((httpMethod === null) !== (httpPath === null)) return refuse("route_incoherent", `${at}.http_method`);
  if ((routeState === "OBSERVED") !== (httpMethod !== null)) return refuse("route_incoherent", `${at}.source_route_state`);
  // primitive-identity: the N16B primitive is served for ops/emergency-close and for no other command.
  if (routeState === "CURRENT_PRIMITIVE_CONFIRMED" && key !== N16B_COMMAND_KEY) return refuse("route_incoherent", `${at}.source_route_state`);
  // mutation-ceremony
  if (MUTATION_TIERS.includes(riskTier) && !(ownerReviewRequired && planRequired && applyRequired)) return refuse("ceremony_understated", `${at}.risk_tier`);
  if (httpMethod !== null && httpMethod !== "GET" && (!ownerReviewRequired || riskTier === "R0_READ")) return refuse("ceremony_understated", `${at}.http_method`);

  return {
    key, command, action, group, riskTier, sourceRiskTier, ownerReviewRequired, planRequired, applyRequired, verifyRequired,
    portalReachable: false, routeState, httpMethod, httpPath, blockedReason, sourceReference, classification, currentPrimitive,
  };
}

/* ───────────────────────────── catalogue ───────────────────────────── */

const ROOT_KEYS = [
  "schema_version", "catalogue_revision", "delivery_profile", "capability", "source", "scope", "total_entries", "returned_entries", "entries",
] as const;
const SCOPE_KEYS = [
  "workspace_id", "actor_user_id", "actor_role", "environment", "entity", "requested_risk_tier", "capability_state", "freshness_state", "policy_revision",
] as const;

function readScope(raw: unknown): CommandCatalogueScopeV2 {
  const r = closed(raw, "$.scope", SCOPE_KEYS);
  const workspaceId = plain(r.workspace_id, "$.scope.workspace_id", 3, 96);
  const actorUserId = matching(r.actor_user_id, IDENTIFIER, "$.scope.actor_user_id");
  const actorRole = constant(r.actor_role, "ADMIN", "$.scope.actor_role");
  const environment = word(r.environment, CATALOGUE_ENVIRONMENTS, "$.scope.environment");
  let entity: CommandCatalogueScopeV2["entity"] = null;
  if (r.entity !== null) {
    const e = closed(r.entity, "$.scope.entity", ["type", "id"]);
    entity = { type: word(e.type, CATALOGUE_ENTITY_TYPES, "$.scope.entity.type"), id: matching(e.id, IDENTIFIER, "$.scope.entity.id") };
  }
  const requestedRiskTier = r.requested_risk_tier === null ? null : word(r.requested_risk_tier, RISK_TIERS_V2, "$.scope.requested_risk_tier");
  const capabilityState = constant(r.capability_state, "DISABLED", "$.scope.capability_state");
  const freshnessState = constant(r.freshness_state, "UNAVAILABLE", "$.scope.freshness_state");
  const policyRevision = constant(r.policy_revision, CATALOGUE_POLICY_REVISION, "$.scope.policy_revision");
  return { workspaceId, actorUserId, actorRole, environment, entity, requestedRiskTier, capabilityState, freshnessState, policyRevision };
}

function readBody(root: Rec): CommandCatalogueV2 {
  const r = closed(root, "$", ROOT_KEYS);
  constant(r.schema_version, COMMAND_CATALOGUE_SCHEMA, "$.schema_version");
  const revision = constant(r.catalogue_revision, CATALOGUE_REVISION, "$.catalogue_revision");
  const deliveryProfile = constant(r.delivery_profile, "fixture", "$.delivery_profile");
  const capability = closed(r.capability, "$.capability", ["state", "reason"]);
  const capabilityState = constant(capability.state, "DISABLED", "$.capability.state");
  const capabilityReason = constant(capability.reason, CATALOGUE_CAPABILITY_REASON, "$.capability.reason");
  const source = closed(r.source, "$.source", ["trading_system_commit", "cli_map_sha256", "openapi_sha256", "generated_from_read_only_extract"]);
  const tradingSystemCommit = matching(source.trading_system_commit, COMMIT, "$.source.trading_system_commit");
  const cliMapSha256 = matching(source.cli_map_sha256, HASH, "$.source.cli_map_sha256");
  const openapiSha256 = matching(source.openapi_sha256, HASH, "$.source.openapi_sha256");
  constant(source.generated_from_read_only_extract, true, "$.source.generated_from_read_only_extract");
  const scope = readScope(r.scope);
  const totalEntries = constant(r.total_entries, CATALOGUE_TOTAL_ENTRIES, "$.total_entries");
  const returned = r.returned_entries;
  if (typeof returned !== "number" || !Number.isInteger(returned)) return refuse("bad_value", "$.returned_entries");
  if (returned < 0 || returned > CATALOGUE_TOTAL_ENTRIES) return refuse("out_of_bounds", "$.returned_entries");
  if (!Array.isArray(r.entries)) return refuse("bad_value", "$.entries");
  if (r.entries.length > CATALOGUE_TOTAL_ENTRIES) return refuse("out_of_bounds", "$.entries");

  const entries: CommandCatalogueEntryV2[] = [];
  const seen = new Set<string>();
  r.entries.forEach((raw: unknown, index: number) => {
    const entry = readEntry(raw, `$.entries[${index}]`);
    if (seen.has(entry.key)) return refuse("duplicate_operation", `$.entries[${index}].key`);
    seen.add(entry.key);
    // scope-filter
    if (scope.requestedRiskTier !== null && entry.riskTier !== scope.requestedRiskTier) return refuse("scope_mismatch", `$.entries[${index}].risk_tier`);
    entries.push(entry);
  });
  // count-identity
  if (returned !== entries.length) return refuse("count_mismatch", "$.returned_entries");

  return {
    revision, deliveryProfile, capabilityState, capabilityReason,
    source: { tradingSystemCommit, cliMapSha256, openapiSha256 },
    scope, totalEntries, returnedEntries: returned, entries,
  };
}

export function readCommandCatalogueV2(raw: unknown): CommandCatalogueRead {
  try {
    const root = rec(raw);
    if (root === null) return { kind: "refused", reason: "not_an_object", at: "$" };
    const schemaVersion = root.schema_version;
    if (typeof schemaVersion === "string" && schemaVersion !== COMMAND_CATALOGUE_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
    return { kind: "command_catalogue", catalogue: readBody(root) };
  } catch (error) {
    if (error instanceof Refusal) return { kind: "refused", reason: error.reason, at: error.at };
    // A hostile getter or proxy: still a refusal, never a throw.
    return { kind: "refused", reason: "bad_value", at: "$" };
  }
}

/** The catalogue, or `null` for anything else (a refusal or another schema version). */
export function catalogueOf(raw: unknown): CommandCatalogueV2 | null {
  const read = readCommandCatalogueV2(raw);
  return read.kind === "command_catalogue" ? read.catalogue : null;
}
