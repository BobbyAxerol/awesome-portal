/**
 * V2 self-access readers: the two ADVISORY projections of the caller's own
 * application permissions (Codex e19ad906, C3, `execution-access.d.ts`):
 *
 * - `GET /api/admin/profile-access/v2/eligibility`
 *   `portal.self-eligibility.v1`, operationId `portalScopedAccessEligibilityGetV1`
 *   (one resource, 1 to 16 existing actions: may the caller go on to the
 *   family's own preview/check for this action?);
 * - `GET /api/admin/profile-access/v2/self-navigation`
 *   `portal.self-navigation.v1`, operationId `portalScopedAccessSelfNavigationGetV1`
 *   (exactly four ordered menu facts and the SELF_ONLY Profile entry).
 *
 * What these bodies are NOT, and what this reader therefore keeps as typed
 * constants a screen cannot turn into a green light:
 *
 * - they are `advisory_only` and `current_only`. `permission: ALLOWED` means
 *   "the caller holds a current own grant for this action on this resource";
 *   family existence, entity existence, source and field qualification,
 *   step-up freshness, challenge availability and command readiness are all
 *   `NOT_CHECKED`, and every API behind them rechecks. Nothing here enables a
 *   control, authorises a request or replaces a 403;
 * - `ENTERABLE` in the navigation is "show the entry", not "the screen has
 *   data": `family_check`, `source_readiness`, `field_readiness` and
 *   `command_readiness` are `NOT_CHECKED` on every item;
 * - `current_read_mode` is Core reader-routing metadata, not a grant;
 *   `SCOPED_CURRENT` is not the `SCOPED_V2` selector;
 * - `self_entry.route` is `null` ("AWAITING_CONSUMER_ROUTER"): the server does
 *   not tell the client where Profile & Access lives.
 *
 * Boundary rules (the same as `accessEffective.ts`):
 * - the body is `unknown` until every check passes. One bad row voids the whole
 *   read, because a silently dropped row would turn into "not allowed" or into
 *   a hidden menu entry;
 * - closed keys everywhere (`additionalProperties: false`);
 * - a readable body of another `schema_version` is `unsupported_shape`, never
 *   fed to these types;
 * - every cross-field rule of the published schema (family and step-up by
 *   action, action/target-kind compatibility, reason by permission, authority
 *   by state, feature order) is
 *   enforced here, so an inconsistent row is refused rather than repaired;
 * - never throws.
 */
import { ACCESS_ENVIRONMENTS, ACCESS_RESOURCE_KINDS, type AccessEnvironment, type AccessResourceKind, type UnsupportedAccessShape } from "./accessEffective";

export const ACCESS_ELIGIBILITY_SCHEMA = "portal.self-eligibility.v1";
export const ACCESS_SELF_NAVIGATION_SCHEMA = "portal.self-navigation.v1";
export const ACCESS_ELIGIBILITY_PATH = "/api/admin/profile-access/v2/eligibility";
export const ACCESS_SELF_NAVIGATION_PATH = "/api/admin/profile-access/v2/self-navigation";

/* ───────────────────────── eligibility vocabulary ───────────────────────── */

export const ELIGIBILITY_FAMILY_CHECKS = [
  "BUSINESS_READ_SCOPE", "CURRENT_AUDIT_READ", "GOVERNANCE_READER", "GOVERNANCE_PLAN", "TECHNICAL_READ_SCOPE", "CAPITAL_PREVIEW",
  "PENDING_CONTROL_PREVIEW", "INSTANCE_REGISTRATION_PREVIEW",
] as const;
export type EligibilityFamilyCheck = (typeof ELIGIBILITY_FAMILY_CHECKS)[number];

/**
 * The 28 actions the projection answers (`AccessEligibilityAction`), each with
 * the family the follow-up check belongs to and whether that follow-up needs a
 * step-up. `null` is "not determined by the action" (the governance decide
 * actions: the plan decides) and is kept as a typed absence, not as `false`.
 */
export const ELIGIBILITY_ACTION_RULES = {
  "alpha.read": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.read": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.read_restricted": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "portfolio.discover_linked": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "account.read": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "binding.read": { family: "BUSINESS_READ_SCOPE", stepUp: false },
  "audit.read": { family: "CURRENT_AUDIT_READ", stepUp: false },
  "governance.r1.read": { family: "GOVERNANCE_READER", stepUp: false },
  "governance.r2.read": { family: "GOVERNANCE_READER", stepUp: false },
  "governance.canary.read": { family: "GOVERNANCE_READER", stepUp: false },
  "governance.live.read": { family: "GOVERNANCE_READER", stepUp: false },
  "governance.r1.decide": { family: "GOVERNANCE_PLAN", stepUp: null },
  "governance.r2.decide": { family: "GOVERNANCE_PLAN", stepUp: null },
  "governance.canary.decide": { family: "GOVERNANCE_PLAN", stepUp: null },
  "governance.live.decide": { family: "GOVERNANCE_PLAN", stepUp: null },
  "maintenance.read": { family: "TECHNICAL_READ_SCOPE", stepUp: false },
  "development.read": { family: "TECHNICAL_READ_SCOPE", stepUp: false },
  "capital.fund": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.initial_grant": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.top_up": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.immediate_decrease": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.recall_partial": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.recall_full": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.adjust_target_budget": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.set_root_limit": { family: "CAPITAL_PREVIEW", stepUp: true },
  "capital.apply_pending": { family: "PENDING_CONTROL_PREVIEW", stepUp: true },
  "capital.cancel_remaining": { family: "PENDING_CONTROL_PREVIEW", stepUp: true },
  "deployment.register": { family: "INSTANCE_REGISTRATION_PREVIEW", stepUp: true },
} as const satisfies Record<string, { family: EligibilityFamilyCheck; stepUp: boolean | null }>;
export type EligibilityAction = keyof typeof ELIGIBILITY_ACTION_RULES;
export const ELIGIBILITY_ACTIONS = Object.keys(ELIGIBILITY_ACTION_RULES) as readonly EligibilityAction[];

/**
 * Which resource kinds each action is compatible with: the target rules Codex
 * published in `AccessEligibility.allOf` (d0789674; 28 `if kind in [...]` blocks,
 * from the producer's `RULES[action].kinds`). Request-target compatibility only,
 * never resource existence or a permit. Held here as a typed copy because the
 * schema states it as an `if/then/else` per action; `accessSelf.conformance.test.ts`
 * compares this table with those blocks word for word, so a kind added to the
 * contract fails there, not on a screen.
 *
 * A row whose action is compatible with `resource.kind` may be anything except
 * ACTION_TARGET_UNSUPPORTED. A row whose action is not compatible is
 * UNAVAILABLE with ACTION_TARGET_UNSUPPORTED, or POLICY_PENDING when the current
 * producer cannot establish policy; never ALLOWED, never another reason.
 */
export const ELIGIBILITY_ACTION_KINDS = {
  "alpha.read": ["ALPHA", "ALPHA_VERSION", "DEPLOYMENT"],
  "portfolio.read": ["PORTFOLIO"],
  "portfolio.read_restricted": ["PORTFOLIO"],
  "portfolio.discover_linked": ["PORTFOLIO"],
  "account.read": ["ACCOUNT"],
  "binding.read": ["BINDING"],
  "audit.read": ["ROOT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"],
  "governance.r1.read": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.r2.read": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.canary.read": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.live.read": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.r1.decide": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.r2.decide": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.canary.decide": ["PORTFOLIO", "DEPLOYMENT"],
  "governance.live.decide": ["PORTFOLIO", "DEPLOYMENT"],
  "maintenance.read": ["ROOT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT", "ALPHA", "ALPHA_VERSION", "BINDING"],
  "development.read": ["ROOT", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT", "ALPHA", "ALPHA_VERSION", "BINDING"],
  "capital.fund": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.initial_grant": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.top_up": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.immediate_decrease": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.recall_partial": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.recall_full": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.adjust_target_budget": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.set_root_limit": ["ROOT", "PORTFOLIO", "DEPLOYMENT"],
  "capital.apply_pending": ["PORTFOLIO", "DEPLOYMENT"],
  "capital.cancel_remaining": ["PORTFOLIO", "DEPLOYMENT"],
  "deployment.register": ["PORTFOLIO"],
} as const satisfies Record<EligibilityAction, readonly AccessResourceKind[]>;
export const MAX_ELIGIBILITY_ACTIONS = 16;

export const ELIGIBILITY_UNAVAILABLE_REASONS = ["NO_CURRENT_PERMISSION", "POLICY_PENDING", "FIELD_POLICY_PENDING", "ACTION_TARGET_UNSUPPORTED"] as const;
export type EligibilityUnavailableReason = (typeof ELIGIBILITY_UNAVAILABLE_REASONS)[number];
export const ELIGIBILITY_ALLOWED_AUTHORITIES = ["VERSIONED_CURRENT", "LEGACY_COMPATIBILITY", "APP_ONLY"] as const;
export type EligibilityAllowedAuthority = (typeof ELIGIBILITY_ALLOWED_AUTHORITIES)[number];

/** The three checks the projection never made. Constants on the wire; a screen must not print them as passed. */
export interface EligibilityUnchecked {
  stepUpFreshness: "NOT_CHECKED";
  challengeAvailability: "NOT_CHECKED";
  commandReadiness: "NOT_CHECKED";
}

interface EligibilityRowBase {
  action: EligibilityAction;
  /** Where the follow-up check lives. Not run here. */
  familyCheck: EligibilityFamilyCheck;
  /** Whether the follow-up needs a step-up; `null` when the action alone does not say (governance decide). */
  stepUpRequired: boolean | null;
  unchecked: EligibilityUnchecked;
}

/**
 * The caller holds a current own grant. Advice only: the family check, the
 * entity, the source and the command itself are all still to be checked, by
 * the API that is called next.
 */
export interface EligibilityAllowed extends EligibilityRowBase {
  permission: "ALLOWED";
  reasonClass: "FAMILY_CHECK_REQUIRED";
  publicCopyKey: "FAMILY_CHECK_REQUIRED";
  /** Opaque id of the caller's own matched grant. */
  grantRef: string;
  authorityMode: EligibilityAllowedAuthority;
}

/** No current permission, and the published reason. Never a guess from a 403. */
export interface EligibilityUnavailable extends EligibilityRowBase {
  permission: "UNAVAILABLE";
  reasonClass: EligibilityUnavailableReason;
  /** Always equal to `reasonClass` (the schema pins it); the key the UI copy is chosen by. */
  publicCopyKey: EligibilityUnavailableReason;
  grantRef: null;
  authorityMode: "NOT_ESTABLISHED";
}

export type EligibilityRow = EligibilityAllowed | EligibilityUnavailable;

export interface AccessEligibility {
  workspaceId: string;
  environment: AccessEnvironment;
  resource: { kind: AccessResourceKind; id: string };
  currentOnly: true;
  advisoryOnly: true;
  /** In the order the server answered; one row per requested action, never repeated. */
  actions: readonly EligibilityRow[];
}

/* ───────────────────────── navigation vocabulary ───────────────────────── */

/** Exactly these four, in exactly this order (`prefixItems` + `items: false`). */
export const SELF_NAV_FEATURES = ["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS", "EXECUTION_BLOTTER"] as const;
export type SelfNavFeature = (typeof SELF_NAV_FEATURES)[number];
export const SELF_NAV_STATES = ["ENTERABLE", "HIDDEN"] as const;
export type SelfNavState = (typeof SELF_NAV_STATES)[number];
export const SELF_NAV_AUTHORITIES = ["SCOPED_CURRENT", "APP_ONLY", "NOT_ESTABLISHED"] as const;
export type SelfNavAuthority = (typeof SELF_NAV_AUTHORITIES)[number];
export const SELF_NAV_READ_MODES = ["LEGACY_COMPATIBILITY", "SCOPED_V2", "NOT_ESTABLISHED"] as const;
export type SelfNavReadMode = (typeof SELF_NAV_READ_MODES)[number];

export interface SelfNavUnchecked {
  familyCheck: "NOT_CHECKED";
  sourceReadiness: "NOT_CHECKED";
  fieldReadiness: "NOT_CHECKED";
  commandReadiness: "NOT_CHECKED";
}

export interface SelfNavItem {
  feature: SelfNavFeature;
  /** `ENTERABLE` is "list the entry"; the screen behind it still gets its own data, or its own refusal. */
  state: SelfNavState;
  /** `NOT_ESTABLISHED` exactly when HIDDEN. Operations is never `APP_ONLY` (it needs the audit read). */
  authorityMode: SelfNavAuthority;
  unchecked: SelfNavUnchecked;
}

export interface AccessSelfNavigation {
  workspaceId: string;
  environment: AccessEnvironment;
  currentOnly: true;
  advisoryOnly: true;
  /** Core reader routing for this workspace. Metadata, not a grant: `SCOPED_CURRENT` is not `SCOPED_V2`. */
  currentReadMode: SelfNavReadMode;
  /** Four items, in `SELF_NAV_FEATURES` order. */
  features: readonly SelfNavItem[];
  /** The Profile & Access entry is always allowed for the caller; where it lives is not published. */
  selfEntry: { feature: "PROFILE_ACCESS"; mode: "SELF_ONLY"; route: null; consumerState: "AWAITING_CONSUMER_ROUTER" };
}

export type AccessEligibilityRead = { kind: "eligibility"; eligibility: AccessEligibility } | UnsupportedAccessShape;
export type AccessSelfNavigationRead = { kind: "navigation"; navigation: AccessSelfNavigation } | UnsupportedAccessShape;

/* ───────────────────────── low-level checks ───────────────────────── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** Exactly these own keys: no more, no fewer (a planted `__proto__` is an own key and so is refused). */
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(r, key)) ? r : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

/**
 * Characters an id must not contain: C0/C1 controls and DEL (the schema forbids C0 and DEL), and, stricter than the schema, zero-width
 * and bidi-control format characters, which can reorder or hide the id a screen prints (same set as accessEffective.ts).
 */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const encoder = new TextEncoder();

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/**
 * The caller-selector text the server accepts and echoes (`workspace_id`,
 * `resource.id`): 1 to 256 codepoints, no ASCII control, well-formed UTF-16 and
 * at most 256 UTF-8 bytes. The schema can say only the first two; the server
 * enforces all four on the way in and on the way out, so the reader does too.
 * Stricter than both: not whitespace-only and none of `UNSAFE_TEXT`.
 */
function selectorText(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1024 || UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value)) return null;
  return codePoints(value) <= 256 && encoder.encode(value).length <= 256 ? value : null;
}

/** An opaque id the server stored as canonical text: 1 to 256 codepoints, no ASCII control, well-formed. Not held to the byte limit. */
function opaqueId(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1024 || UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value)) return null;
  return codePoints(value) <= 256 ? value : null;
}

/* ───────────────────────── eligibility reader ───────────────────────── */

const ROW_KEYS = [
  "action", "permission", "reason_class", "public_copy_key", "grant_ref", "authority_mode", "step_up_required", "step_up_freshness",
  "challenge_availability", "command_readiness", "family_check",
] as const;
const ALL_REASONS = ["FAMILY_CHECK_REQUIRED", ...ELIGIBILITY_UNAVAILABLE_REASONS] as const;

function readEligibilityRow(raw: unknown, resourceKind: AccessResourceKind): EligibilityRow | null {
  const row = closed(raw, ROW_KEYS);
  if (row === null) return null;
  const action = oneOf(row.action, ELIGIBILITY_ACTIONS);
  const permission = oneOf(row.permission, ["ALLOWED", "UNAVAILABLE"] as const);
  const reasonClass = oneOf(row.reason_class, ALL_REASONS);
  const publicCopyKey = oneOf(row.public_copy_key, ALL_REASONS);
  const familyCheck = oneOf(row.family_check, ELIGIBILITY_FAMILY_CHECKS);
  if (
    action === null || permission === null || reasonClass === null || publicCopyKey === null || familyCheck === null
    || row.step_up_freshness !== "NOT_CHECKED" || row.challenge_availability !== "NOT_CHECKED" || row.command_readiness !== "NOT_CHECKED"
  ) return null;
  // The action fixes its family and its step-up requirement (schema allOf: one if/then per action).
  const rule = ELIGIBILITY_ACTION_RULES[action];
  if (familyCheck !== rule.family || row.step_up_required !== rule.stepUp) return null;
  // The copy key is the reason, always.
  if (publicCopyKey !== reasonClass) return null;
  // The action must fit the kind of resource asked about (schema allOf target rules, d0789674): a compatible kind never answers
  // ACTION_TARGET_UNSUPPORTED; an incompatible one is UNAVAILABLE with ACTION_TARGET_UNSUPPORTED or POLICY_PENDING, never ALLOWED.
  const compatible = (ELIGIBILITY_ACTION_KINDS[action] as readonly AccessResourceKind[]).includes(resourceKind);
  if (compatible ? reasonClass === "ACTION_TARGET_UNSUPPORTED" : permission !== "UNAVAILABLE" || (reasonClass !== "ACTION_TARGET_UNSUPPORTED" && reasonClass !== "POLICY_PENDING")) return null;
  const unchecked: EligibilityUnchecked = { stepUpFreshness: "NOT_CHECKED", challengeAvailability: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" };
  const base = { action, familyCheck, stepUpRequired: rule.stepUp as boolean | null, unchecked };
  if (permission === "ALLOWED") {
    const grantRef = opaqueId(row.grant_ref);
    const authorityMode = oneOf(row.authority_mode, ELIGIBILITY_ALLOWED_AUTHORITIES);
    if (reasonClass !== "FAMILY_CHECK_REQUIRED" || grantRef === null || authorityMode === null) return null;
    return { ...base, permission, reasonClass, publicCopyKey: "FAMILY_CHECK_REQUIRED", grantRef, authorityMode };
  }
  const unavailable = oneOf(reasonClass, ELIGIBILITY_UNAVAILABLE_REASONS);
  if (unavailable === null || row.grant_ref !== null || row.authority_mode !== "NOT_ESTABLISHED") return null;
  return { ...base, permission, reasonClass: unavailable, publicCopyKey: unavailable, grantRef: null, authorityMode: "NOT_ESTABLISHED" };
}

/**
 * Eligibility body -> typed read. `null` is "malformed" and must render as
 * unavailable; another `schema_version` is `unsupported_shape`.
 */
export function readAccessEligibility(raw: unknown): AccessEligibilityRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_ELIGIBILITY_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, ["schema_version", "workspace_id", "environment", "resource", "current_only", "advisory_only", "actions"]);
  const resource = closed(body?.resource, ["kind", "id"]);
  if (body === null || resource === null) return null;
  const workspaceId = selectorText(body.workspace_id);
  const environment = oneOf(body.environment, ACCESS_ENVIRONMENTS);
  const kind = oneOf(resource.kind, ACCESS_RESOURCE_KINDS);
  const resourceId = selectorText(resource.id);
  if (
    workspaceId === null || environment === null || kind === null || resourceId === null
    || body.current_only !== true || body.advisory_only !== true
    || !Array.isArray(body.actions) || body.actions.length < 1 || body.actions.length > MAX_ELIGIBILITY_ACTIONS
  ) return null;
  const actions: EligibilityRow[] = [];
  for (const entry of body.actions) {
    const row = readEligibilityRow(entry, kind);
    if (row === null) return null;
    actions.push(row);
  }
  // One row per action (schema allOf: every action `contains` at most once).
  if (new Set(actions.map((row) => row.action)).size !== actions.length) return null;
  return {
    kind: "eligibility",
    eligibility: { workspaceId, environment, resource: { kind, id: resourceId }, currentOnly: true, advisoryOnly: true, actions },
  };
}

/** The row for one action, or `undefined` when the caller did not ask about it. Absence is not "not allowed". */
export function eligibilityRow(eligibility: AccessEligibility, action: EligibilityAction): EligibilityRow | undefined {
  return eligibility.actions.find((row) => row.action === action);
}

/* ───────────────────────── navigation reader ───────────────────────── */

const NAV_ITEM_KEYS = ["feature", "state", "authority_mode", "family_check", "source_readiness", "field_readiness", "command_readiness"] as const;

function readNavItem(raw: unknown, expected: SelfNavFeature): SelfNavItem | null {
  const item = closed(raw, NAV_ITEM_KEYS);
  if (item === null) return null;
  const state = oneOf(item.state, SELF_NAV_STATES);
  const authorityMode = oneOf(item.authority_mode, SELF_NAV_AUTHORITIES);
  if (
    item.feature !== expected || state === null || authorityMode === null || item.family_check !== "NOT_CHECKED"
    || item.source_readiness !== "NOT_CHECKED" || item.field_readiness !== "NOT_CHECKED" || item.command_readiness !== "NOT_CHECKED"
  ) return null;
  // HIDDEN has no authority; ENTERABLE has one of the two real modes. Operations needs the audit read, so never APP_ONLY.
  if ((state === "HIDDEN") !== (authorityMode === "NOT_ESTABLISHED")) return null;
  if (expected === "EXECUTION_OPERATIONS" && authorityMode === "APP_ONLY") return null;
  return {
    feature: expected, state, authorityMode,
    unchecked: { familyCheck: "NOT_CHECKED", sourceReadiness: "NOT_CHECKED", fieldReadiness: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" },
  };
}

/**
 * Self-navigation body -> typed read. `null` is "malformed"; another
 * `schema_version` is `unsupported_shape`.
 */
export function readAccessSelfNavigation(raw: unknown): AccessSelfNavigationRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_SELF_NAVIGATION_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, ["schema_version", "workspace_id", "environment", "current_only", "advisory_only", "current_read_mode", "features", "self_entry"]);
  if (body === null) return null;
  const workspaceId = selectorText(body.workspace_id);
  const environment = oneOf(body.environment, ACCESS_ENVIRONMENTS);
  const currentReadMode = oneOf(body.current_read_mode, SELF_NAV_READ_MODES);
  const entry = closed(body.self_entry, ["feature", "mode", "permission", "route", "consumer_state"]);
  if (
    workspaceId === null || environment === null || currentReadMode === null || body.current_only !== true || body.advisory_only !== true
    || !Array.isArray(body.features) || body.features.length !== SELF_NAV_FEATURES.length
    || entry === null || entry.feature !== "PROFILE_ACCESS" || entry.mode !== "SELF_ONLY" || entry.permission !== "ALLOWED"
    || entry.route !== null || entry.consumer_state !== "AWAITING_CONSUMER_ROUTER"
  ) return null;
  const features: SelfNavItem[] = [];
  for (let index = 0; index < SELF_NAV_FEATURES.length; index += 1) {
    const item = readNavItem(body.features[index], SELF_NAV_FEATURES[index]!);
    if (item === null) return null;
    features.push(item);
  }
  return {
    kind: "navigation",
    navigation: {
      workspaceId, environment, currentOnly: true, advisoryOnly: true, currentReadMode, features,
      selfEntry: { feature: "PROFILE_ACCESS", mode: "SELF_ONLY", route: null, consumerState: "AWAITING_CONSUMER_ROUTER" },
    },
  };
}

/** The item for a feature. Always present: the reader refuses a body that does not carry all four. */
export function selfNavItem(navigation: AccessSelfNavigation, feature: SelfNavFeature): SelfNavItem {
  return navigation.features[SELF_NAV_FEATURES.indexOf(feature)]!;
}

/** The features to list, in menu order. A courtesy filter: the server still refuses every route. */
export function enterableSelfNavFeatures(navigation: AccessSelfNavigation): readonly SelfNavFeature[] {
  return navigation.features.filter((item) => item.state === "ENTERABLE").map((item) => item.feature);
}

/* ───────────────────────── requests ───────────────────────── */

export interface EligibilityRequest {
  workspaceId: string;
  environment: AccessEnvironment;
  resource: { kind: AccessResourceKind; id: string };
  /** 1 to 16, no repeats. */
  actions: readonly EligibilityAction[];
}

export interface SelfNavigationRequest {
  workspaceId: string;
  environment: AccessEnvironment;
}

function validEligibilityRequest(request: EligibilityRequest): boolean {
  return selectorText(request.workspaceId) !== null && oneOf(request.environment, ACCESS_ENVIRONMENTS) !== null
    && oneOf(request.resource.kind, ACCESS_RESOURCE_KINDS) !== null && selectorText(request.resource.id) !== null
    && request.actions.length >= 1 && request.actions.length <= MAX_ELIGIBILITY_ACTIONS
    && request.actions.every((action) => oneOf(action, ELIGIBILITY_ACTIONS) !== null)
    && new Set(request.actions).size === request.actions.length;
}

/**
 * The request URL, or `null` when the request would be refused by the server's
 * strict query (unknown action, repeated action, 17 actions, a selector the
 * server would reject). The query is exactly five keys; `actions` is ONE comma
 * separated value (form, explode=false), never a repeated key.
 */
export function accessEligibilityUrl(request: EligibilityRequest): string | null {
  if (!validEligibilityRequest(request)) return null;
  const query = [
    `workspace_id=${encodeURIComponent(request.workspaceId)}`,
    `environment=${request.environment}`,
    `resource_kind=${request.resource.kind}`,
    `resource_id=${encodeURIComponent(request.resource.id)}`,
    `actions=${request.actions.map((action) => encodeURIComponent(action)).join(",")}`,
  ];
  return `${ACCESS_ELIGIBILITY_PATH}?${query.join("&")}`;
}

/** The request URL, or `null` for a selector the server would reject. The query is exactly `workspace_id` and `environment`. */
export function accessSelfNavigationUrl(request: SelfNavigationRequest): string | null {
  if (selectorText(request.workspaceId) === null || oneOf(request.environment, ACCESS_ENVIRONMENTS) === null) return null;
  return `${ACCESS_SELF_NAVIGATION_PATH}?workspace_id=${encodeURIComponent(request.workspaceId)}&environment=${request.environment}`;
}

/**
 * True when the body answers THIS request: same workspace, environment,
 * resource and the same set of actions. A body that reads is not yet a body
 * for the question that was asked (a late answer for another resource, a cache
 * hit); a screen checks this before showing a row under a control.
 */
export function eligibilityAnswers(eligibility: AccessEligibility, request: EligibilityRequest): boolean {
  return eligibility.workspaceId === request.workspaceId && eligibility.environment === request.environment
    && eligibility.resource.kind === request.resource.kind && eligibility.resource.id === request.resource.id
    && eligibility.actions.length === request.actions.length
    && request.actions.every((action) => eligibility.actions.some((row) => row.action === action));
}

/** True when the body answers THIS request (same workspace and environment). */
export function navigationAnswers(navigation: AccessSelfNavigation, request: SelfNavigationRequest): boolean {
  return navigation.workspaceId === request.workspaceId && navigation.environment === request.environment;
}
