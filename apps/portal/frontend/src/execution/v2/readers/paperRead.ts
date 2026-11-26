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
 * Differences from the schema, all counted in `workbench.conformance.test.ts` (S = stricter, X = looser):
 *   S-1  `page`, `query`, `exact_total`, `filtered_total`, `aggregates`, `exact_query`, `derived_insights` belong to the Full
 *        Blotter body. The schema allows them in a workbench body; the workbench reads none of them and the server never sends
 *        them, so a body that carries one is refused rather than half-validated.
 * There is no looser-than-schema entry. Since FE-073 (c02f63d8) the schema lists the five members the server sends: `read_at_ms`,
 * `as_of_ms` and `panels` (root: the EDS-02 clocks and panel envelopes), `data.history_windows` (the equity downsample envelope) and
 * `lineage_scoped_out` (capability). Each is checked exactly as published. `data.account_equity` is `PaperHistoryRecords`, retained
 * history without a row cap; every other branch stays `Records` (at most 200).
 */
import type { ProfileEnvelope } from "../../api/profileRead";
import { readProfileEnvelope } from "../../api/profileRead";

export const PAPER_READ_SCHEMAS = [
  "execution.paper-overview.v1",
  "execution.paper-workbench.v1",
  "execution.paper-workbench-vnm.v1",
  "execution.full-blotter.v1",
] as const;
/** The Paper profiles Core can serve; the same set as `delivery_profile` in execution-paper-read.v1.schema.json. */
export const PAPER_READ_PROFILES = ["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP"] as const;
const WORKBENCH_SCHEMAS: ReadonlySet<string> = new Set(["execution.paper-workbench.v1", "execution.paper-workbench-vnm.v1"]);

/** S-1: the Full Blotter's members. */
export const BLOTTER_ONLY_MEMBERS = ["page", "query", "exact_total", "filtered_total", "aggregates", "exact_query", "derived_insights"] as const;

const ROOT_KEYS = [
  "schema_version", "record_authority", "source_authority", "delivery_profile", "read_profiles", "workspace_id", "read_at", "read_at_ms", "as_of", "as_of_ms",
  "panels", "state", "freshness", "completeness", "actor", "resource", "capabilities", "data",
];
const ROOT_REQUIRED = [
  "schema_version", "record_authority", "source_authority", "delivery_profile", "workspace_id", "read_at", "as_of", "state", "freshness",
  "completeness", "actor", "capabilities", "data",
];
const CAPABILITY_KEYS = [
  "capability_id", "state", "relations", "reason_code", "retryable", "quarantined_rows", "status_map_version", "authority", "formula_version",
  "lineage_rejects", "lineage_scoped_out",
];
const CAPABILITY_REQUIRED = ["capability_id", "state", "relations", "reason_code", "retryable"];
const LINEAGE_REJECT_KEYS = ["account", "external_account", "deployment", "strategy", "portfolio", "session", "group"];

/** Branches that are `Records` (at most 200 `NarrowRecord`s). `account_equity` is not one: it is `PaperHistoryRecords`, retained history without a row cap. */
const RECORD_BRANCHES = [
  "deployments", "positions", "sessions", "performance", "portfolio_equity", "orders", "fills", "conditional_groups",
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
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PANEL_NAME = /^[a-z][a-z0-9_]{0,127}$/;
const PANEL_STATES = ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "DENIED", "ERROR"];
const PANEL_WITH_DATA = ["READY", "PARTIAL", "STALE"];
const CLOCK_KEYS = ["event_time_ms", "source_published_at_ms", "received_at_ms", "ingested_at_ms", "processed_at_ms", "as_of_ms", "read_at_ms"];
const UTC_MS_LIMIT = 8_640_000_000_000_000;

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

/** `PaperHistoryRecords`: retained history, any number of `NarrowRecord`s. The 200-row snapshot cap does not apply and none is invented. */
function historyRecords(value: unknown, at: string, out: string[]): void {
  if (!Array.isArray(value)) return void out.push(`${at}: not an array`);
  for (let i = 0; i < value.length && out.length < MAX_LISTED; i += 1) narrowRecord(value[i], `${at}[${i}]`, out);
}

/** `UtcEpochMs`: an integer within the range of a JavaScript date. */
const isUtcMs = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= UTC_MS_LIMIT;
const isNullableUtcMs = (value: unknown): boolean => value === null || isUtcMs(value);
const hasOnly = (value: Json, keys: readonly string[], at: string, out: string[]): void => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) out.push(`${at}.${key}: not allowed`);
};

/** `PaperHistoryWindows`: the equity downsample envelope. `truncated` is the word false: history is never cut to the snapshot page. */
function historyWindows(value: unknown, at: string, out: string[]): void {
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  hasOnly(value, ["account_equity"], at, out);
  if (!Object.hasOwn(value, "account_equity")) return;
  const w = value.account_equity;
  const wat = `${at}.account_equity`;
  if (!isObject(w)) return void out.push(`${wat}: not an object`);
  hasOnly(w, ["days", "basis", "returned_rows", "source_rows", "truncated", "downsample"], wat, out);
  for (const key of ["days", "basis", "returned_rows", "source_rows", "truncated"]) if (!Object.hasOwn(w, key)) out.push(`${wat}.${key}: required`);
  if (Object.hasOwn(w, "days") && !isInteger(w.days, 1)) out.push(`${wat}.days: not an integer of 1 or more`);
  if (Object.hasOwn(w, "basis") && w.basis !== "PORTAL_SGP_HISTORY_MIRROR") out.push(`${wat}.basis: not PORTAL_SGP_HISTORY_MIRROR`);
  for (const key of ["returned_rows", "source_rows"]) if (Object.hasOwn(w, key) && !isInteger(w[key], 0)) out.push(`${wat}.${key}: not an integer of 0 or more`);
  if (Object.hasOwn(w, "truncated") && w.truncated !== false) out.push(`${wat}.truncated: not false`);
  if (!Object.hasOwn(w, "downsample")) return;
  const d = w.downsample;
  const dat = `${wat}.downsample`;
  if (!isObject(d)) return void out.push(`${dat}: not an object`);
  hasOnly(d, ["method", "bucket_seconds", "series_count", "input_rows", "output_rows"], dat, out);
  for (const key of ["method", "bucket_seconds", "series_count", "input_rows", "output_rows"]) if (!Object.hasOwn(d, key)) out.push(`${dat}.${key}: required`);
  if (Object.hasOwn(d, "method") && d.method !== "PER_SERIES_BUCKET_EXTREMA") out.push(`${dat}.method: not PER_SERIES_BUCKET_EXTREMA`);
  for (const key of ["bucket_seconds", "series_count"]) if (Object.hasOwn(d, key) && !isInteger(d[key], 1)) out.push(`${dat}.${key}: not an integer of 1 or more`);
  for (const key of ["input_rows", "output_rows"]) if (Object.hasOwn(d, key) && !isInteger(d[key], 0)) out.push(`${dat}.${key}: not an integer of 0 or more`);
}

const nullableText = (value: unknown, max: number): boolean => value === null || (typeof value === "string" && value.length <= max);

/** `PanelEnvelope` (EDS-02): a panel's own state, clocks, coverage, history semantics, formula lineage and refusal reason. */
function panel(value: unknown, at: string, out: string[]): void {
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  const members = ["state", "data", "clocks", "coverage", "source_history_semantics", "formula", "reason_code", "retryable"];
  hasOnly(value, members, at, out);
  for (const key of members) if (!Object.hasOwn(value, key)) out.push(`${at}.${key}: required`);
  if (Object.hasOwn(value, "state")) {
    if (!PANEL_STATES.includes(value.state as string)) out.push(`${at}.state: not a published word`);
    // A panel that says it has data carries some; one that says it has none carries null.
    else if (Object.hasOwn(value, "data")) {
      const withData = PANEL_WITH_DATA.includes(value.state as string);
      if (withData && value.data === null) out.push(`${at}.data: null in a ${String(value.state)} panel`);
      if (!withData && value.data !== null) out.push(`${at}.data: not null in a ${String(value.state)} panel`);
    }
  }
  if (Object.hasOwn(value, "clocks")) {
    const clocks = value.clocks;
    if (!isObject(clocks)) out.push(`${at}.clocks: not an object`);
    else {
      hasOnly(clocks, CLOCK_KEYS, `${at}.clocks`, out);
      for (const key of CLOCK_KEYS) {
        if (!Object.hasOwn(clocks, key)) out.push(`${at}.clocks.${key}: required`);
        else if (key === "read_at_ms" ? !isUtcMs(clocks[key]) : !isNullableUtcMs(clocks[key])) out.push(`${at}.clocks.${key}: not a UTC epoch millisecond${key === "read_at_ms" ? "" : " or null"}`);
      }
    }
  }
  if (Object.hasOwn(value, "coverage")) {
    const c = value.coverage;
    const cat = `${at}.coverage`;
    if (!isObject(c)) out.push(`${cat}: not an object`);
    else {
      const keys = ["from_ms", "to_ms", "source_total", "filtered_total", "returned_count", "truncated", "downsampled", "has_more", "next_cursor", "gaps"];
      hasOnly(c, keys, cat, out);
      for (const key of keys) if (!Object.hasOwn(c, key)) out.push(`${cat}.${key}: required`);
      for (const key of ["from_ms", "to_ms"]) if (Object.hasOwn(c, key) && !isNullableUtcMs(c[key])) out.push(`${cat}.${key}: not a UTC epoch millisecond or null`);
      for (const key of ["source_total", "filtered_total"]) {
        const total = c[key];
        if (Object.hasOwn(c, key) && total !== null && (typeof total !== "string" || !/^[0-9]+$/.test(total))) out.push(`${cat}.${key}: not a digit string or null`);
      }
      const returned = c.returned_count;
      if (Object.hasOwn(c, "returned_count") && !(isInteger(returned, 0) && returned <= 200)) out.push(`${cat}.returned_count: not an integer 0..200`);
      for (const key of ["truncated", "downsampled", "has_more"]) if (Object.hasOwn(c, key) && typeof c[key] !== "boolean") out.push(`${cat}.${key}: not a boolean`);
      if (Object.hasOwn(c, "next_cursor") && !nullableText(c.next_cursor, 4096)) out.push(`${cat}.next_cursor: not a string of at most 4096 or null`);
      if (Object.hasOwn(c, "gaps")) {
        const gaps = c.gaps;
        if (!Array.isArray(gaps) || gaps.length > 200) out.push(`${cat}.gaps: not an array of at most 200`);
        else {
          for (let i = 0; i < gaps.length && out.length < MAX_LISTED; i += 1) {
            const g: unknown = gaps[i];
            const gat = `${cat}.gaps[${i}]`;
            if (!isObject(g)) { out.push(`${gat}: not an object`); continue; }
            hasOnly(g, ["from_ms", "to_ms", "reason_code"], gat, out);
            for (const key of ["from_ms", "to_ms", "reason_code"]) if (!Object.hasOwn(g, key)) out.push(`${gat}.${key}: required`);
            for (const key of ["from_ms", "to_ms"]) if (Object.hasOwn(g, key) && !isUtcMs(g[key])) out.push(`${gat}.${key}: not a UTC epoch millisecond`);
            if (Object.hasOwn(g, "reason_code") && !isString(g.reason_code, 1, 191)) out.push(`${gat}.reason_code: not 1..191 characters`);
          }
        }
      }
    }
  }
  if (Object.hasOwn(value, "source_history_semantics") && !isString(value.source_history_semantics, 1, 256)) out.push(`${at}.source_history_semantics: not 1..256 characters`);
  if (Object.hasOwn(value, "formula") && value.formula !== null) {
    const f = value.formula;
    const fat = `${at}.formula`;
    if (!isObject(f)) out.push(`${fat}: not an object or null`);
    else {
      const keys = ["formula_id", "formula_version", "input_revision", "input_digest", "composite_read_revision"];
      hasOnly(f, keys, fat, out);
      for (const key of keys) if (!Object.hasOwn(f, key)) out.push(`${fat}.${key}: required`);
      for (const key of ["formula_id", "formula_version"]) if (Object.hasOwn(f, key) && !isString(f[key], 1, 191)) out.push(`${fat}.${key}: not 1..191 characters`);
      for (const key of ["input_revision", "composite_read_revision"]) if (Object.hasOwn(f, key) && !nullableText(f[key], 256)) out.push(`${fat}.${key}: not a string of at most 256 or null`);
      const digest = f.input_digest;
      if (Object.hasOwn(f, "input_digest") && digest !== null && (typeof digest !== "string" || !DIGEST.test(digest))) out.push(`${fat}.input_digest: not a sha256 digest or null`);
    }
  }
  if (Object.hasOwn(value, "reason_code") && !nullableText(value.reason_code, 128)) out.push(`${at}.reason_code: not a string of at most 128 or null`);
  if (Object.hasOwn(value, "retryable") && typeof value.retryable !== "boolean") out.push(`${at}.retryable: not a boolean`);
}

function panels(value: unknown, out: string[]): void {
  if (!isObject(value)) return void out.push("panels: not an object");
  const names = Object.keys(value);
  if (names.length > 34) out.push("panels: more than 34 panels");
  for (const name of names) {
    if (out.length >= MAX_LISTED) return;
    if (!PANEL_NAME.test(name)) out.push("panels: panel name not allowed");
    else panel(value[name], `panels.${name}`, out);
  }
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
    if (!CAPABILITY_KEYS.includes(key)) out.push(`${at}.${key}: not allowed`);
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
  // Both count rows a lineage rule kept out: `lineage_rejects` the rows it refused, `lineage_scoped_out` the rows outside the requested scope.
  for (const name of ["lineage_rejects", "lineage_scoped_out"]) {
    if (!Object.hasOwn(value, name)) continue;
    const counts = value[name];
    if (!isObject(counts)) out.push(`${at}.${name}: not an object`);
    else {
      const keys = Object.keys(counts);
      if (keys.length < 1 || keys.length > 7 || !keys.every((k) => LINEAGE_REJECT_KEYS.includes(k) && isInteger(counts[k], 1))) out.push(`${at}.${name}: not 1..7 known sources with a count of 1 or more`);
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
    else if (key === "account_equity") historyRecords(member, at, out);
    else if (key === "history_windows") historyWindows(member, at, out);
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
    } else out.push(`${at}: not a member of a paper workbench body`);
  }
}

/** Where `raw` breaks the paper-read schema for a workbench body; empty = it keeps it. At most 12 are listed. */
export function paperReadViolations(raw: unknown): readonly string[] {
  const out: string[] = [];
  if (!isObject(raw)) return ["root: not an object"];
  for (const key of Object.keys(raw)) {
    if (!ROOT_KEYS.includes(key)) out.push(`${key}: not allowed`);
  }
  for (const key of ROOT_REQUIRED) if (!Object.hasOwn(raw, key)) out.push(`${key}: required`);
  const version = raw.schema_version;
  if (Object.hasOwn(raw, "schema_version") && !(PAPER_READ_SCHEMAS as readonly string[]).includes(version as string)) out.push("schema_version: not a paper-read version");
  if (Object.hasOwn(raw, "record_authority") && raw.record_authority !== "PORTAL_CONTROL") out.push("record_authority: not PORTAL_CONTROL");
  if (Object.hasOwn(raw, "source_authority") && raw.source_authority !== "TRADING_SYSTEM") out.push("source_authority: not TRADING_SYSTEM");
  if (Object.hasOwn(raw, "delivery_profile") && !(PAPER_READ_PROFILES as readonly unknown[]).includes(raw.delivery_profile)) out.push(`delivery_profile: not one of ${PAPER_READ_PROFILES.join(", ")}`);
  if (Object.hasOwn(raw, "read_profiles") && !(Array.isArray(raw.read_profiles) && raw.read_profiles.length >= 1 && raw.read_profiles.length <= 2
    && new Set(raw.read_profiles).size === raw.read_profiles.length && raw.read_profiles.every((v) => (PAPER_READ_PROFILES as readonly unknown[]).includes(v)))) out.push(`read_profiles: not a unique list of ${PAPER_READ_PROFILES.join(", ")}`);
  if (Object.hasOwn(raw, "workspace_id") && (typeof raw.workspace_id !== "string" || !IDENTIFIER.test(raw.workspace_id))) out.push("workspace_id: not an identifier");
  if (Object.hasOwn(raw, "read_at") && typeof raw.read_at !== "string") out.push("read_at: not a string");
  if (Object.hasOwn(raw, "as_of") && raw.as_of !== null && typeof raw.as_of !== "string") out.push("as_of: not a string or null");
  if (Object.hasOwn(raw, "read_at_ms") && !isUtcMs(raw.read_at_ms)) out.push("read_at_ms: not a UTC epoch millisecond");
  if (Object.hasOwn(raw, "as_of_ms") && !isNullableUtcMs(raw.as_of_ms)) out.push("as_of_ms: not a UTC epoch millisecond or null");
  if (Object.hasOwn(raw, "panels")) panels(raw.panels, out);
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
