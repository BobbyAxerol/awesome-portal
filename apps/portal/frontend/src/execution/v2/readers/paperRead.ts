/**
 * The Paper workbench reader's gate against its published schema (DEBT-UXM07-018).
 *
 * Oracle: `packages/contracts/schemas/execution-paper-read.v1.schema.json`. `readProfileEnvelope` (api/profileRead.ts) is the
 * tolerant envelope reader every profile screen shares: it keeps the members it knows and drops the rest, drops array
 * entries that are not objects, and reads a row's fields one by one. That is right for the V1 screens and wrong for a screen
 * that claims a published contract, because a body that breaks the schema was read as if it kept it. This module says
 * what the schema says about the envelope and the branches the workbench reads, and nothing else.
 *
 * Two kinds of finding, kept apart on purpose:
 *   - `paperReadViolations` lists the places where the body breaks the schema. A non-empty list voids the whole body for the
 *     workbench (`pageState`: "not a paper-workbench profile"); no row of a body that breaks its contract is drawn.
 *   - four members have their own closed readers in `stageFacts.ts` (`stage_facts`, `positions_by_side`, `venue_calendar`,
 *     and the five identity keys inside `deployment`). A breach there demotes that member to "Not published", as the screen
 *     always did, and is NOT a violation here. The conformance suite holds those readers to the same schema.
 *
 * Differences from the schema, all counted in `paperRead.conformance.test.ts` (S = stricter, X = looser):
 *   S-1  `page`, `query`, `exact_total`, `filtered_total`, `aggregates`, `exact_query`, `derived_insights` belong to the Full
 *        Blotter body. The schema allows them in a workbench body; the workbench reads none of them and the server never sends
 *        them, so a body that carries one is refused rather than half-validated.
 *   X-1  the server also sends `read_at_ms`, `as_of_ms`, `panels` (root), `history_windows` (data) and `lineage_scoped_out`
 *        (capability), none of which the published schema lists (it closes each object). They are read (EDS-02 clocks, the
 *        equity downsample envelope) and are the only members tolerated beyond the schema. Schema issue for Codex, see
 *        backend-requests.md.
 */
import type { ProfileEnvelope } from "../../api/profileRead";
import { readProfileEnvelope } from "../../api/profileRead";

export const PAPER_READ_SCHEMAS = [
  "execution.paper-overview.v1",
  "execution.paper-workbench.v1",
  "execution.paper-workbench-vnm.v1",
  "execution.full-blotter.v1",
] as const;
const WORKBENCH_SCHEMAS: ReadonlySet<string> = new Set(["execution.paper-workbench.v1", "execution.paper-workbench-vnm.v1"]);

/** S-1: the Full Blotter's members. */
export const BLOTTER_ONLY_MEMBERS = ["page", "query", "exact_total", "filtered_total", "aggregates", "exact_query", "derived_insights"] as const;
/** X-1: members the server sends and the published schema does not list. */
export const UNPUBLISHED_ROOT_MEMBERS = ["read_at_ms", "as_of_ms", "panels"] as const;
export const UNPUBLISHED_DATA_MEMBERS = ["history_windows"] as const;
export const UNPUBLISHED_CAPABILITY_MEMBERS = ["lineage_scoped_out"] as const;

const ROOT_KEYS = [
  "schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "read_at", "as_of", "state", "freshness",
  "completeness", "actor", "resource", "capabilities", "data",
];
const ROOT_REQUIRED = [
  "schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "read_at", "as_of", "state", "freshness",
  "completeness", "actor", "capabilities", "data",
];
const CAPABILITY_KEYS = [
  "capability_id", "state", "relations", "reason_code", "retryable", "quarantined_rows", "status_map_version", "authority", "formula_version",
  "lineage_rejects",
];
const CAPABILITY_REQUIRED = ["capability_id", "state", "relations", "reason_code", "retryable"];
const LINEAGE_REJECT_KEYS = ["account", "external_account", "deployment", "strategy", "portfolio", "session", "group"];

/** Branches that are `Records` (at most 200 `NarrowRecord`s). */
const RECORD_BRANCHES = [
  "deployments", "positions", "sessions", "performance", "account_equity", "portfolio_equity", "orders", "fills", "conditional_groups",
  "conditional_legs", "reconciliation", "command_journal",
];
/** Members with a closed reader of their own; a breach demotes the member, not the body. */
const CLOSED_MEMBERS = ["positions_by_side", "stage_facts", "venue_calendar"];

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/;
const RELATION = /^[a-z][a-z0-9_]{1,127}$/;
const REASON_CODE = /^[A-Z0-9_]{3,128}$/;
const STATUS_MAP_VERSION = /^[a-z0-9.-]{3,64}$/;
const FORMULA_VERSION = /^[a-z0-9.-]{3,96}$/;
const NARROW_NAME = /^(?!record_key$)(?!raw_)(?!.*(?:secret|credential|password|token|dsn)).+$/;
const ANALYTICS_NAME = /^(?!raw_)(?!.*(?:secret|credential|password|token|dsn)).+$/;
const MAX_LISTED = 12;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown, min: number, max: number): value is string => typeof value === "string" && value.length >= min && value.length <= max;
const isInteger = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min;

/** `Scalar`: a string of at most 8192, a number, a boolean or null. */
function isScalar(value: unknown): boolean {
  return value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || isString(value, 0, 8192);
}

/** `NarrowRecord`: 1..40 members, schema-safe names, each a scalar or an array of at most 100 scalars. */
function narrowRecord(value: unknown, at: string, out: string[]): void {
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  const names = Object.keys(value);
  if (names.length < 1) out.push(`${at}: fewer than 1 members`);
  if (names.length > 40) out.push(`${at}: more than 40 members`);
  for (const name of names) {
    if (!NARROW_NAME.test(name)) out.push(`${at}: member name not allowed`);
    const member = value[name];
    if (Array.isArray(member)) {
      if (member.length > 100 || !member.every(isScalar)) out.push(`${at}.${name}: not a bounded array of scalars`);
    } else if (!isScalar(member)) out.push(`${at}.${name}: not a scalar`);
  }
}

function records(value: unknown, at: string, out: string[]): void {
  if (!Array.isArray(value)) return void out.push(`${at}: not an array`);
  if (value.length > 200) out.push(`${at}: more than 200 rows`);
  // Beyond the cap the rest is not walked: the body is already void.
  for (let i = 0; i < Math.min(value.length, 200) && out.length < MAX_LISTED; i += 1) narrowRecord(value[i], `${at}[${i}]`, out);
}

function actor(value: unknown, out: string[]): void {
  if (!isObject(value)) return void out.push("actor: not an object");
  for (const key of Object.keys(value)) if (!["user_id", "username", "roles"].includes(key)) out.push(`actor.${key}: not allowed`);
  if (typeof value.user_id !== "string" || !IDENTIFIER.test(value.user_id)) out.push("actor.user_id: not an identifier");
  if (!isString(value.username, 1, 64)) out.push("actor.username: not 1..64 characters");
  const roles = value.roles;
  if (!Array.isArray(roles) || roles.length !== 1 || (roles[0] !== "ADMIN" && roles[0] !== "USER")) out.push("actor.roles: not exactly one of ADMIN, USER");
}

function capability(value: unknown, at: string, out: string[]): void {
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  for (const key of Object.keys(value)) {
    if (!CAPABILITY_KEYS.includes(key) && !(UNPUBLISHED_CAPABILITY_MEMBERS as readonly string[]).includes(key)) out.push(`${at}.${key}: not allowed`);
  }
  for (const key of CAPABILITY_REQUIRED) if (!Object.hasOwn(value, key)) out.push(`${at}.${key}: required`);
  if (Object.hasOwn(value, "capability_id") && (typeof value.capability_id !== "string" || !IDENTIFIER.test(value.capability_id))) out.push(`${at}.capability_id: not an identifier`);
  if (Object.hasOwn(value, "state") && !["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"].includes(value.state as string)) out.push(`${at}.state: not a published word`);
  if (Object.hasOwn(value, "relations")) {
    const relations = value.relations;
    if (!Array.isArray(relations) || relations.length < 1 || relations.length > 8 || new Set(relations).size !== relations.length
      || !relations.every((r) => typeof r === "string" && RELATION.test(r))) out.push(`${at}.relations: not 1..8 unique relation names`);
  }
  if (Object.hasOwn(value, "reason_code") && value.reason_code !== null && (typeof value.reason_code !== "string" || !REASON_CODE.test(value.reason_code))) out.push(`${at}.reason_code: not a reason code`);
  if (Object.hasOwn(value, "retryable") && value.retryable !== false) out.push(`${at}.retryable: not false`);
  if (Object.hasOwn(value, "quarantined_rows") && !isInteger(value.quarantined_rows, 1)) out.push(`${at}.quarantined_rows: not an integer of 1 or more`);
  if (Object.hasOwn(value, "status_map_version") && (typeof value.status_map_version !== "string" || !STATUS_MAP_VERSION.test(value.status_map_version))) out.push(`${at}.status_map_version: pattern`);
  if (Object.hasOwn(value, "authority") && value.authority !== null && value.authority !== "DERIVED" && value.authority !== "TRADING_SYSTEM") out.push(`${at}.authority: not a published word`);
  if (Object.hasOwn(value, "formula_version") && value.formula_version !== null && (typeof value.formula_version !== "string" || !FORMULA_VERSION.test(value.formula_version))) out.push(`${at}.formula_version: pattern`);
  if (Object.hasOwn(value, "lineage_rejects")) {
    const rejects = value.lineage_rejects;
    if (!isObject(rejects)) out.push(`${at}.lineage_rejects: not an object`);
    else {
      const keys = Object.keys(rejects);
      if (keys.length < 1 || keys.length > 7 || !keys.every((k) => LINEAGE_REJECT_KEYS.includes(k) && isInteger(rejects[k], 1))) out.push(`${at}.lineage_rejects: not 1..7 known sources with a count of 1 or more`);
    }
  }
}

function data(value: unknown, out: string[]): void {
  if (!isObject(value)) return void out.push("data: not an object");
  const keys = Object.keys(value);
  if (keys.length < 1) out.push("data: fewer than 1 members");
  for (const key of keys) {
    if (out.length >= MAX_LISTED) return;
    const member = value[key];
    const at = `data.${key}`;
    if (RECORD_BRANCHES.includes(key)) records(member, at, out);
    else if (key === "deployment") {
      // A `NarrowRecord`. The five identity keys inside it, and the rules that tie them, are `readDeploymentIdentity`'s: a breach demotes the identity.
      if (member !== null) narrowRecord(member, at, out);
    } else if (key === "observation_gate") {
      if (member !== null) narrowRecord(member, at, out);
    } else if (key === "query_analytics") {
      if (member === null) continue;
      if (!isObject(member)) out.push(`${at}: not an object`);
      else {
        const names = Object.keys(member);
        if (names.length < 1 || names.length > 40 || !names.every((n) => ANALYTICS_NAME.test(n))) out.push(`${at}: not 1..40 safe member names`);
      }
    } else if (CLOSED_MEMBERS.includes(key)) {
      // Demoted by its own reader (stageFacts.ts); an absent or null value is the typed absence.
    } else if ((UNPUBLISHED_DATA_MEMBERS as readonly string[]).includes(key)) {
      if (!isObject(member)) out.push(`${at}: not an object`);
    } else out.push(`${at}: not a member of a paper workbench body`);
  }
}

/** Where `raw` breaks the paper-read schema for a workbench body; empty = it keeps it. At most 12 are listed. */
export function paperReadViolations(raw: unknown): readonly string[] {
  const out: string[] = [];
  if (!isObject(raw)) return ["root: not an object"];
  for (const key of Object.keys(raw)) {
    if (!ROOT_KEYS.includes(key) && !(UNPUBLISHED_ROOT_MEMBERS as readonly string[]).includes(key)) out.push(`${key}: not allowed`);
  }
  for (const key of ROOT_REQUIRED) if (!Object.hasOwn(raw, key)) out.push(`${key}: required`);
  const version = raw.schema_version;
  if (Object.hasOwn(raw, "schema_version") && !(PAPER_READ_SCHEMAS as readonly string[]).includes(version as string)) out.push("schema_version: not a paper-read version");
  if (Object.hasOwn(raw, "record_authority") && raw.record_authority !== "PORTAL_CONTROL") out.push("record_authority: not PORTAL_CONTROL");
  if (Object.hasOwn(raw, "source_authority") && raw.source_authority !== "TRADING_SYSTEM") out.push("source_authority: not TRADING_SYSTEM");
  if (Object.hasOwn(raw, "delivery_profile") && raw.delivery_profile !== "PAPER_BINANCE_USDM") out.push("delivery_profile: not PAPER_BINANCE_USDM");
  if (Object.hasOwn(raw, "workspace_id") && (typeof raw.workspace_id !== "string" || !IDENTIFIER.test(raw.workspace_id))) out.push("workspace_id: not an identifier");
  if (Object.hasOwn(raw, "read_at") && typeof raw.read_at !== "string") out.push("read_at: not a string");
  if (Object.hasOwn(raw, "as_of") && raw.as_of !== null && typeof raw.as_of !== "string") out.push("as_of: not a string or null");
  if (Object.hasOwn(raw, "state") && !["ready", "empty", "stale", "partial", "unavailable"].includes(raw.state as string)) out.push("state: not a published word");
  if (Object.hasOwn(raw, "freshness") && !["FRESH", "AGING", "STALE", "UNKNOWN"].includes(raw.freshness as string)) out.push("freshness: not a published word");
  if (Object.hasOwn(raw, "completeness") && raw.completeness !== "COMPLETE" && raw.completeness !== "PARTIAL") out.push("completeness: not a published word");
  if (Object.hasOwn(raw, "actor")) actor(raw.actor, out);
  // `resource` travels with the two workbench versions and with no other.
  const workbench = typeof version === "string" && WORKBENCH_SCHEMAS.has(version);
  if (workbench && !Object.hasOwn(raw, "resource")) out.push("resource: required");
  if (!workbench && Object.hasOwn(raw, "resource")) out.push("resource: not allowed");
  if (Object.hasOwn(raw, "resource")) {
    const resource = raw.resource;
    if (!isObject(resource) || Object.keys(resource).some((k) => k !== "kind" && k !== "id") || resource.kind !== "DEPLOYMENT"
      || typeof resource.id !== "string" || !IDENTIFIER.test(resource.id)) out.push("resource: not a DEPLOYMENT with an identifier");
  }
  if (Object.hasOwn(raw, "capabilities")) {
    const capabilities = raw.capabilities;
    if (!Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > 20) out.push("capabilities: not 1..20 items");
    else capabilities.forEach((c, i) => capability(c, `capabilities[${i}]`, out));
  }
  if (Object.hasOwn(raw, "data")) {
    data(raw.data, out);
    if (isObject(raw.data)) for (const key of BLOTTER_ONLY_MEMBERS) if (Object.hasOwn(raw.data, key)) out.push(`data.${key}: a Full Blotter member (S-1)`);
  }
  return out.slice(0, MAX_LISTED);
}

/**
 * The workbench's reader of `GET /screens/paper/{id}[/vn-market]`: the shared envelope reader, plus the schema verdict. A body that
 * is not an object, or has no `schema_version` and `state`, is still `null` (unreadable); a body the envelope reader can read but the
 * schema rejects is returned WITH its violations, so the screen can say "not a paper-workbench profile" and draw none of it.
 */
export function readPaperWorkbenchProfile(raw: unknown): ProfileEnvelope | null {
  const envelope = readProfileEnvelope(raw);
  if (envelope === null) return null;
  const violations = paperReadViolations(raw);
  return violations.length === 0 ? envelope : { ...envelope, schemaViolations: violations };
}
