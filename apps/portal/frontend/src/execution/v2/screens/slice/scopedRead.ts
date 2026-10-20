/**
 * The scoped read the slice banner and lists are built from (`portal.execution.manager-scoped.v1`,
 * `components/schemas/ManagerScopedResponse` of `packages/contracts/schemas/execution-manager-scoped.v1.schema.json`,
 * generated `execution-manager-models.d.ts`). FIXTURE ONLY: the slice reads the published synthetic example through this
 * reader; no route serves the body to the browser yet.
 *
 * What it reads: the envelope, `read_scope` (the SCOPED / AUTHORIZED_ONLY / VISIBLE_ROWS_ONLY constants the banner prints),
 * `profile_dispositions`, completeness and reason, the `page` counts, and every item's identity, instances, financial
 * facts, financial totals and availability. What it does not surface: the opaque page cursors beyond "there is one".
 *
 * Boundary rules (the same as the other V2 readers):
 * - the body is `unknown` until every check passes; one bad item voids the read, because a silently dropped row would make
 *   a count or a list a lie;
 * - the contract is closed (`additionalProperties: false`) at every level;
 * - "omitted means withheld/unpublished, null means explicit absence" (the schema's own description): a fact key that is
 *   absent stays absent (`undefined`), a key that is `null` stays `null`, and neither becomes 0 or an empty string;
 * - money and every other figure is an exact decimal STRING (`exactValue`); a number, an exponent or a negative zero voids
 *   the read; times are safe-integer UTC epoch milliseconds;
 * - totals are partitioned by currency and never summed across it (SS-1 below).
 *
 * Stricter than the schema, on purpose and named so the conformance suite can count them:
 * - SS-1 every `financial_totals` entry names its currency, and a currency appears once: a total with no unit cannot be
 *   shown, and two entries for one currency would invite a sum;
 * - SS-2 page: `returned_count` equals the rows, is at most `limit` and at most `visible_count`; `has_more` is true exactly
 *   when `next_cursor` is present (the schema's own description says the runtime enforces this);
 * - SS-3 display safety of every text (whitespace-only, bidi and zero-width characters, C1 controls);
 * - SS-4 a row appears once by ITS DATASET'S identity within an environment (`ROW_IDENTITY`): ALPHA_FLEET by alpha, version and
 *   portfolio; PORTFOLIOS by portfolio; BINDINGS and BINDING_DETAIL by binding. The producer keys its cursor boundary on the
 *   same fields (`resourceKey`, `scoped-manager.reader.ts`: environment, alpha, version, portfolio, binding). One portfolio in
 *   three environments is three rows; two bindings of one environment are two rows; the SAME identity twice is refused;
 * - SS-5 at most 10,000 instances in a body (a 1 MiB body cannot hold more);
 * - SS-6 a negative zero (`-0`, `-0.00`) is not a decimal value: it has no meaning to a reader (the pattern of the schema accepts it);
 * - SS-7 at least one environment disposition is stated (the producer requires it; the schema has no `minItems`): a page that
 *   says nothing about which environments it covers cannot be told apart from one that hid them.
 */
import type { UtcEpochMs } from "../../../screenDataContract";
import { boundedCount, clockMs, exactValue, hasAll, hasOnly, managerText, nullableText, oneOf, record } from "../../readers/managerMetric";

export const MANAGER_SCOPED_SCHEMA = "portal.execution.manager-scoped.v1";
export const SCOPED_SURFACES = ["ALPHA_FLEET", "PORTFOLIOS", "BINDINGS", "BINDING_DETAIL"] as const;
export type ScopedSurface = (typeof SCOPED_SURFACES)[number];
export const SCOPED_ENVIRONMENTS = ["all", "paper", "sandbox", "live"] as const;
export const SCOPED_ITEM_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ScopedItemEnvironment = (typeof SCOPED_ITEM_ENVIRONMENTS)[number];
export const SCOPED_DISPOSITION_STATES = ["PARTIAL", "DENIED", "UNAVAILABLE"] as const;
export const SCOPED_FACT_KINDS = ["ALLOCATION", "INTERNAL_ACCOUNT_BALANCE", "POSITION_PNL"] as const;
export const SCOPED_AVAILABILITY_STATES = ["AVAILABLE", "PARTIAL", "NOT_PUBLISHED"] as const;
export const SCOPED_AVAILABILITY_REASONS = [
  "AUTHORIZED_RETAINED_FACTS", "SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE", "SOURCE_FACTS_NOT_PUBLISHED",
] as const;
export const SCOPED_REASON = "RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY";
export const MAX_SCOPED_ITEMS = 100;
export const MAX_SCOPED_INSTANCES_PER_ITEM = 2000;
export const MAX_SCOPED_FACTS_PER_ITEM = 8000;
export const MAX_SCOPED_TOTALS_PER_ITEM = 200;
export const MAX_SCOPED_POLICY_REVISIONS = 3;
export const MAX_SCOPED_INSTANCES_TOTAL = 10_000;
export const MAX_SCOPED_CURSOR_TEXT = 4096;
export const SCOPED_RESPONSE_BYTES = 1_048_576;

/** SS-4: the identity fields of a row, per dataset. The row's environment is always part of it. */
export const ROW_IDENTITY: Readonly<Record<ScopedSurface, readonly ("alpha_id" | "alpha_version_id" | "portfolio_id" | "binding_id")[]>> = {
  ALPHA_FLEET: ["alpha_id", "alpha_version_id", "portfolio_id"],
  PORTFOLIOS: ["portfolio_id"],
  BINDINGS: ["binding_id"],
  BINDING_DETAIL: ["binding_id"],
};

const CURSOR_TEXT = /^[A-Za-z0-9._-]+$/;

const ID_KEYS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "binding_id"] as const;
const NULLABLE_TEXT_KEYS = ["name", "state", "stage", "venue", "currency", "base_currency"] as const;
const DECIMAL_KEYS = ["allocation", "balance_total", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "net_pnl", "exposure"] as const;
const FACT_KEYS = [...ID_KEYS, ...NULLABLE_TEXT_KEYS, ...DECIMAL_KEYS, "updated_at_ms"] as const;
type FactKey = (typeof FACT_KEYS)[number];

/** A fact set: an absent key is WITHHELD (`undefined`), `null` is an explicit absence, a string is exact. Never 0. */
export type ScopedFacts = { readonly [K in FactKey]?: K extends "updated_at_ms" ? UtcEpochMs | null : string | null };

export interface ScopedFinancialFact {
  kind: (typeof SCOPED_FACT_KINDS)[number];
  facts: ScopedFacts;
}

export interface ScopedItem {
  environment: ScopedItemEnvironment;
  identity: ScopedFacts;
  instances: readonly ScopedFacts[];
  financialFacts: readonly ScopedFinancialFact[];
  /** Per currency, from authorized facts attributable to THIS item. Not NAV, not a portfolio total. */
  financialTotals: readonly ScopedFacts[];
  isFullResource: boolean;
  availability: {
    state: (typeof SCOPED_AVAILABILITY_STATES)[number];
    reasonCode: (typeof SCOPED_AVAILABILITY_REASONS)[number];
  };
}

export interface ScopedDisposition {
  environment: ScopedItemEnvironment;
  state: (typeof SCOPED_DISPOSITION_STATES)[number];
  reasonCode: string | null;
}

export interface ScopedRead {
  surface: ScopedSurface;
  workspaceId: string;
  environment: (typeof SCOPED_ENVIRONMENTS)[number];
  readAtMs: UtcEpochMs;
  scope: {
    visibility: "SCOPED";
    coverage: "AUTHORIZED_ONLY";
    totalsScope: "VISIBLE_ROWS_ONLY";
    policyRevisions: readonly string[];
  };
  dispositions: readonly ScopedDisposition[];
  completeness: "PARTIAL";
  reasonCode: typeof SCOPED_REASON;
  page: {
    /** Rows visible to this caller. Not a total: peers the caller may not see are not in any count. */
    visibleCount: number;
    returnedCount: number;
    limit: number;
    hasMore: boolean;
    hasNextCursor: boolean;
    hasPreviousCursor: boolean;
  };
  items: readonly ScopedItem[];
}

export type ScopedReadResult = { kind: "scoped"; read: ScopedRead } | { kind: "unsupported_shape" } | null;

function facts(raw: unknown): ScopedFacts | null {
  const f = record(raw);
  if (f === null || !hasOnly(f, FACT_KEYS)) return null;
  const out: Record<string, string | number | null> = {};
  for (const key of Object.keys(f)) {
    const value = f[key];
    if ((ID_KEYS as readonly string[]).includes(key)) {
      const text = managerText(value);
      if (text === null) return null;
      out[key] = text;
    } else if ((NULLABLE_TEXT_KEYS as readonly string[]).includes(key)) {
      const text = nullableText(value);
      if (text === undefined) return null;
      out[key] = text;
    } else if ((DECIMAL_KEYS as readonly string[]).includes(key)) {
      if (value === null) out[key] = null;
      else {
        const exact = exactValue(value);
        if (exact === null) return null;
        out[key] = exact.exact;
      }
    } else {
      // updated_at_ms
      if (value === null) out[key] = null;
      else {
        const ms = clockMs(value);
        if (ms === null) return null;
        out[key] = ms;
      }
    }
  }
  return out as ScopedFacts;
}

function factsList(raw: unknown, max: number): ScopedFacts[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: ScopedFacts[] = [];
  for (const entry of raw) {
    const read = facts(entry);
    if (read === null) return null;
    out.push(read);
  }
  return out;
}

function item(raw: unknown): ScopedItem | null {
  const it = record(raw);
  const keys = ["environment", "identity", "instances", "financial_facts", "financial_totals", "is_full_resource", "financial_availability"] as const;
  if (it === null || !hasOnly(it, keys) || !hasAll(it, keys)) return null;
  const environment = oneOf(it.environment, SCOPED_ITEM_ENVIRONMENTS);
  const identity = facts(it.identity);
  const instances = factsList(it.instances, MAX_SCOPED_INSTANCES_PER_ITEM);
  const totals = factsList(it.financial_totals, MAX_SCOPED_TOTALS_PER_ITEM);
  if (environment === null || identity === null || instances === null || totals === null || typeof it.is_full_resource !== "boolean") return null;
  if (!Array.isArray(it.financial_facts) || it.financial_facts.length > MAX_SCOPED_FACTS_PER_ITEM) return null;
  const financialFacts: ScopedFinancialFact[] = [];
  for (const entry of it.financial_facts) {
    const fact = record(entry);
    if (fact === null || !hasOnly(fact, ["kind", "facts"]) || !hasAll(fact, ["kind", "facts"])) return null;
    const kind = oneOf(fact.kind, SCOPED_FACT_KINDS);
    const inner = facts(fact.facts);
    if (kind === null || inner === null) return null;
    financialFacts.push({ kind, facts: inner });
  }
  // SS-1: a total names its currency, once.
  const seen = new Set<string>();
  for (const total of totals) {
    if (typeof total.currency !== "string" || seen.has(total.currency)) return null;
    seen.add(total.currency);
  }
  const availability = record(it.financial_availability);
  if (availability === null || !hasOnly(availability, ["state", "reason_code"]) || !hasAll(availability, ["state", "reason_code"])) return null;
  const state = oneOf(availability.state, SCOPED_AVAILABILITY_STATES);
  const reasonCode = oneOf(availability.reason_code, SCOPED_AVAILABILITY_REASONS);
  if (state === null || reasonCode === null) return null;
  return { environment, identity, instances, financialFacts, financialTotals: totals, isFullResource: it.is_full_resource, availability: { state, reasonCode } };
}

function cursorPresent(value: unknown): boolean | null {
  if (value === null) return false;
  return typeof value === "string" && value.length >= 1 && value.length <= MAX_SCOPED_CURSOR_TEXT && CURSOR_TEXT.test(value) ? true : null;
}

export function readManagerScoped(raw: unknown): ScopedReadResult {
  const body = record(raw);
  if (body === null) return null;
  if (body.schema_version !== MANAGER_SCOPED_SCHEMA) {
    return typeof body.schema_version === "string" && body.schema_version.length > 0 ? { kind: "unsupported_shape" } : null;
  }
  const keys = [
    "schema_version", "surface", "workspace_id", "environment", "record_authority", "source_authority", "read_at_ms", "read_scope",
    "profile_dispositions", "completeness", "reason_code", "page", "items",
  ] as const;
  if (!hasOnly(body, keys) || !hasAll(body, keys)) return null;
  const surface = oneOf(body.surface, SCOPED_SURFACES);
  const workspaceId = managerText(body.workspace_id);
  const environment = oneOf(body.environment, SCOPED_ENVIRONMENTS);
  const readAtMs = clockMs(body.read_at_ms);
  if (surface === null || workspaceId === null || environment === null || readAtMs === null) return null;
  if (body.record_authority !== "PORTAL_PROJECTION" || body.source_authority !== "TRADING_SYSTEM") return null;
  if (body.completeness !== "PARTIAL" || body.reason_code !== SCOPED_REASON) return null;

  const scope = record(body.read_scope);
  const scopeKeys = ["visibility", "coverage", "totals_scope", "policy_revisions"] as const;
  if (scope === null || !hasOnly(scope, scopeKeys) || !hasAll(scope, scopeKeys)) return null;
  if (scope.visibility !== "SCOPED" || scope.coverage !== "AUTHORIZED_ONLY" || scope.totals_scope !== "VISIBLE_ROWS_ONLY") return null;
  if (!Array.isArray(scope.policy_revisions) || scope.policy_revisions.length > MAX_SCOPED_POLICY_REVISIONS) return null;
  const policyRevisions: string[] = [];
  for (const entry of scope.policy_revisions) {
    const text = managerText(entry);
    if (text === null) return null;
    policyRevisions.push(text);
  }

  // SS-7: at least one disposition.
  if (!Array.isArray(body.profile_dispositions) || body.profile_dispositions.length < 1 || body.profile_dispositions.length > 3) return null;
  const dispositions: ScopedDisposition[] = [];
  for (const entry of body.profile_dispositions) {
    const d = record(entry);
    if (d === null || !hasOnly(d, ["environment", "state", "reason_code"]) || !hasAll(d, ["environment", "state", "reason_code"])) return null;
    const dEnv = oneOf(d.environment, SCOPED_ITEM_ENVIRONMENTS);
    const dState = oneOf(d.state, SCOPED_DISPOSITION_STATES);
    const dReason = nullableText(d.reason_code);
    if (dEnv === null || dState === null || dReason === undefined) return null;
    dispositions.push({ environment: dEnv, state: dState, reasonCode: dReason });
  }

  const pg = record(body.page);
  const pageKeys = ["visible_count", "returned_count", "limit", "maximum_response_bytes", "has_more", "next_cursor", "previous_cursor"] as const;
  if (pg === null || !hasOnly(pg, pageKeys) || !hasAll(pg, pageKeys)) return null;
  const visibleCount = boundedCount(pg.visible_count, Number.MAX_SAFE_INTEGER);
  const returnedCount = boundedCount(pg.returned_count, 100);
  const limit = boundedCount(pg.limit, 100);
  const hasNext = cursorPresent(pg.next_cursor);
  const hasPrevious = cursorPresent(pg.previous_cursor);
  if (visibleCount === null || returnedCount === null || limit === null || limit < 1 || hasNext === null || hasPrevious === null) return null;
  if (pg.maximum_response_bytes !== SCOPED_RESPONSE_BYTES || typeof pg.has_more !== "boolean") return null;

  if (!Array.isArray(body.items) || body.items.length > MAX_SCOPED_ITEMS) return null;
  const items: ScopedItem[] = [];
  const identities = new Set<string>();
  let instanceTotal = 0;
  for (const entry of body.items) {
    const read = item(entry);
    if (read === null) return null;
    // SS-4: a row appears once by its dataset's identity (never by fields the dataset does not carry).
    const tuple = JSON.stringify([read.environment, ...ROW_IDENTITY[surface].map((key) => read.identity[key] ?? null)]);
    if (identities.has(tuple)) return null;
    identities.add(tuple);
    instanceTotal += read.instances.length;
    if (instanceTotal > MAX_SCOPED_INSTANCES_TOTAL) return null;
    items.push(read);
  }
  // SS-2: the page agrees with its rows.
  if (returnedCount !== items.length || returnedCount > limit || returnedCount > visibleCount) return null;
  if (pg.has_more !== hasNext) return null;

  return {
    kind: "scoped",
    read: {
      surface,
      workspaceId,
      environment,
      readAtMs,
      scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totalsScope: "VISIBLE_ROWS_ONLY", policyRevisions },
      dispositions,
      completeness: "PARTIAL",
      reasonCode: SCOPED_REASON,
      page: { visibleCount, returnedCount, limit, hasMore: pg.has_more, hasNextCursor: hasNext, hasPreviousCursor: hasPrevious },
      items,
    },
  };
}
