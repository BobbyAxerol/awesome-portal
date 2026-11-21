/**
 * V2 live-source operations reader: `GET /deployments/{id}/live?panel=&cursor=`
 * when the workspace is SCOPED_V2 (`portal.execution.live-source-operations.v2`,
 * Codex 25218372; `execution-live-full.d.ts`).
 *
 * The body is eleven finite panels of RETAINED observations. It says what it
 * is not: `source_verdict: NOT_ASSERTED`, `runtime.state: null`,
 * `realtime.active: false`, `commands.enabled: false`, `exact_total: null`,
 * `source_as_of_ms: null`. This reader keeps every one of those as a typed
 * absence and never turns them into a number, a freshness word or a green dot:
 *
 * - `exact_total: null` is NOT zero, and a PARTIAL panel's `returnedCount` is
 *   the size of the page, not of the dataset;
 * - `source_as_of_ms: null` + `source_clock_reason` means the source clock is
 *   not scoped, so no "as of" is printed for the panel;
 * - a NOT_PUBLISHED panel has no records and says why (`reasonCode`);
 * - values are exact strings (decimals, int64 counters) or safe integers
 *   (epoch ms); nothing is parsed into a JS number.
 *
 * Strict and closed like `governanceParents.ts`: one malformed panel voids the
 * whole read, because a dropped panel would be read as "nothing there".
 *
 * Two OPTIONAL closed members (BE-P12, FE-066 / FE-067), present only when the request asked `?include=`:
 *
 * - `identity` (`scopedIdentity.ts`): alpha id, portfolio name and the reasons a part is withheld;
 * - `stage_facts` (`execution.stage-facts.v1`): over the viewer's AUTHORIZED population only. The schema allows
 *   what that population can prove and nothing else, and so does this reader: runtime/session observations may be
 *   AVAILABLE without asserting activation. `reconciliation.verdict = OPEN_FINDINGS` is monotone; `NO_OPEN_FINDINGS`,
 *   exact finding/order counts and session completeness remain refused. An absent member is `null` (the original body); a present member that breaks the
 *   schema voids the read, as a malformed panel does.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readStageFacts, type StageFacts } from "../../stageFacts";
import { readScopedIdentityV2, type ScopedIdentityV2 } from "./scopedIdentity";

export const LIVE_SOURCE_V2_SCHEMA = "portal.execution.live-source-operations.v2";
export const LIVE_SOURCE_PANELS = [
  "deployments", "positions", "sessions", "orders", "fills", "accounts", "account_balances", "margin_balances",
  "account_sync", "reconciliation", "broker_sync",
] as const;
export type LiveSourcePanelName = (typeof LIVE_SOURCE_PANELS)[number];

const PANEL_STATES = ["PARTIAL", "NOT_PUBLISHED"] as const;
const PANEL_REASONS = [
  "AUTHORIZED_RETAINED_OBSERVATIONS_ONLY", "NO_AUTHORIZED_RETAINED_OBSERVATION", "SOURCE_PANEL_NOT_CAPTURED",
  "DEPLOYMENT_GRAIN_NOT_PROVEN", "BROKER_PURPOSE_NOT_COMMISSIONED",
] as const;
const GRAINS: Readonly<Record<LiveSourcePanelName, "DEPLOYMENT" | "ACCOUNT" | "NOT_COMMISSIONED">> = {
  deployments: "DEPLOYMENT", positions: "DEPLOYMENT", sessions: "DEPLOYMENT", orders: "DEPLOYMENT", fills: "DEPLOYMENT",
  accounts: "ACCOUNT", account_balances: "ACCOUNT", margin_balances: "ACCOUNT", account_sync: "ACCOUNT",
  reconciliation: "DEPLOYMENT", broker_sync: "NOT_COMMISSIONED",
};

const TEXT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "portfolio_id", "position_id", "order_id", "fill_id", "instrument_id",
  "venue", "currency", "base_currency", "state", "status", "side",
  "runtime_state_since", "runtime_state_changed_at", "execution_session_id", "started_at", "completed_at", "account_type",
  "position_side", "time_in_force", "client_order_id", "order_type", "commission_currency",
] as const;
const DECIMAL_FIELDS = [
  "signed_qty", "quantity", "price", "avg_px_open", "avg_px_close", "mark_price", "notional", "realized_pnl",
  "unrealized_pnl", "total", "locked", "free", "initial", "maintenance",
  "trigger_price", "filled_quantity", "average_fill_price", "commission",
] as const;
const COUNTER_FIELDS = ["submitted_count", "risk_rejected_count", "broker_rejected_count", "filled_count"] as const;
const INSTANT_FIELDS = ["created_at_ms", "updated_at_ms", "trade_time_ms"] as const;
const BOOLEAN_FIELDS = ["reduce_only", "post_only"] as const;
const ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  runtime_state: ["RUNNING", "PAUSED", "HALTED", "STOPPED"], liquidity_side: ["MAKER", "TAKER", "UNKNOWN"],
};
const VALUE_FIELDS: ReadonlySet<string> = new Set([
  ...TEXT_FIELDS, ...DECIMAL_FIELDS, ...COUNTER_FIELDS, ...INSTANT_FIELDS, ...BOOLEAN_FIELDS, ...Object.keys(ENUM_FIELDS), "mode",
]);

/** One published value. `null` on the wire is `absent`: the source did not say, which is not zero. */
export type LiveSourceValueV2 =
  | { kind: "absent" }
  | { kind: "text"; text: string }
  /** The exact string; display unit and precision belong to the screen that knows the field. */
  | { kind: "decimal"; exact: string }
  /** An int64 counter as the exact string; never a JS number. */
  | { kind: "counter"; exact: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "instant"; at: UtcEpochMs };

export interface LiveSourceRecordV2 {
  observationId: string;
  values: Readonly<Record<string, LiveSourceValueV2>>;
}

export interface LiveSourcePanelV2 {
  name: LiveSourcePanelName;
  state: (typeof PANEL_STATES)[number];
  reasonCode: (typeof PANEL_REASONS)[number];
  /** Why there is no source clock: the panel has no "as of". */
  sourceClockReason: "SOURCE_CLOCK_NOT_SCOPED";
  provenance: {
    datasetId: string | null;
    purpose: "alpha.read" | "account.read" | null;
    fieldPolicyRef: string | null;
    projectionBasis: "SAME_RETAINED_DOCUMENT";
    sourceCompleteness: "UNKNOWN";
    historySemantics: "BOUNDED_RETAINED_NOT_FULL_HISTORY";
  };
  grain: "DEPLOYMENT" | "ACCOUNT" | "NOT_COMMISSIONED";
  /** The size of THIS page. `exact_total` is null on the wire: the dataset size is not published. */
  returnedCount: number;
  limit: 200;
  hasMore: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
  records: readonly LiveSourceRecordV2[];
}

export interface LiveSourceOperationsV2 {
  workspaceId: string;
  profileId: string;
  deploymentId: string;
  /** When the Portal read this; a Portal clock, not source freshness. */
  observedAt: UtcEpochMs;
  /** `null` on the wire: runtime activation is not asserted, so no run state is printed. */
  runtimeReasonCode: "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED";
  realtimeActive: false;
  commandsEnabled: false;
  panels: Readonly<Record<LiveSourcePanelName, LiveSourcePanelV2>>;
  /** `null` = the body carries none (the original body, or `include=identity` was not asked). */
  identity: ScopedIdentityV2 | null;
  /** `null` = the body carries none. Scoped observations, never activation, global counts or complete sessions. */
  stageFacts: StageFacts | null;
}

type Rec = Record<string, unknown>;

/** Exactly `false` (see governanceParents.ts: one operator per contract flag, and this reader refuses anything else). */
const isFalse = (value: unknown): boolean => value === false;

/** Epoch milliseconds, never before 1970 (`minimum: 0` in the schema). */
function instant(value: unknown): UtcEpochMs | null {
  const at = readUtcEpochMs(value);
  return at !== null && at >= 0 ? at : null;
}

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(r, key)) ? r : null;
}
function text(value: unknown, max = 4096): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}
function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : text(value) ?? undefined;
}

const CURSOR = /^lps2\.[A-Za-z0-9_-]{1,32}\.[0-9]{1,8}\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/;
const OBSERVATION = /^por1_[0-9a-f]{64}$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const COUNTER = /^(?:0|[1-9]\d*)$/;

function cursor(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && value.length <= 128 && CURSOR.test(value) ? value : undefined;
}

function readValue(field: string, value: unknown): LiveSourceValueV2 | null {
  if (value === null) return { kind: "absent" };
  if (field === "mode") return value === "live" ? { kind: "text", text: "live" } : null;
  if ((BOOLEAN_FIELDS as readonly string[]).includes(field)) return typeof value === "boolean" ? { kind: "boolean", value } : null;
  if (Object.hasOwn(ENUM_FIELDS, field)) return typeof value === "string" && ENUM_FIELDS[field]!.includes(value) ? { kind: "text", text: value } : null;
  if ((TEXT_FIELDS as readonly string[]).includes(field)) {
    const t = text(value);
    return t === null ? null : { kind: "text", text: t };
  }
  if ((DECIMAL_FIELDS as readonly string[]).includes(field)) {
    return typeof value === "string" && value.length <= 96 && DECIMAL.test(value) && !/^-0+(\.0+)?$/.test(value)
      ? { kind: "decimal", exact: value }
      : null;
  }
  if ((COUNTER_FIELDS as readonly string[]).includes(field)) {
    return typeof value === "string" && value.length <= 20 && COUNTER.test(value) ? { kind: "counter", exact: value } : null;
  }
  const at = instant(value);
  return at === null ? null : { kind: "instant", at };
}

function readRecord(value: unknown): LiveSourceRecordV2 | null {
  const r = closed(value, ["observation_id", "values"]);
  const values = rec(r?.values);
  if (r === null || values === null || typeof r.observation_id !== "string" || !OBSERVATION.test(r.observation_id)) return null;
  const out: Record<string, LiveSourceValueV2> = {};
  for (const [field, raw] of Object.entries(values)) {
    if (!VALUE_FIELDS.has(field)) return null;
    const read = readValue(field, raw);
    if (read === null) return null;
    out[field] = read;
  }
  return { observationId: r.observation_id, values: out };
}

function readPanel(name: LiveSourcePanelName, value: unknown): LiveSourcePanelV2 | null {
  const p = closed(value, [
    "state", "reason_code", "source_as_of_ms", "source_clock_reason", "provenance", "grain", "exact_total", "limit",
    "returned_count", "has_more", "next_cursor", "previous_cursor", "records",
  ]);
  const prov = closed(p?.provenance, [
    "dataset_id", "purpose", "field_contract_revision", "field_policy_ref", "projection_basis", "source_revision",
    "source_cursor", "source_completeness", "history_semantics",
  ]);
  if (p === null || prov === null) return null;
  const state = (PANEL_STATES as readonly unknown[]).includes(p.state) ? p.state as (typeof PANEL_STATES)[number] : null;
  const reasonCode = (PANEL_REASONS as readonly unknown[]).includes(p.reason_code) ? p.reason_code as (typeof PANEL_REASONS)[number] : null;
  const datasetId = nullableText(prov.dataset_id);
  const fieldPolicyRef = nullableText(prov.field_policy_ref);
  const purpose = prov.purpose === null || prov.purpose === "alpha.read" || prov.purpose === "account.read" ? prov.purpose : undefined;
  const next = cursor(p.next_cursor);
  const previous = cursor(p.previous_cursor);
  if (
    state === null || reasonCode === null || datasetId === undefined || fieldPolicyRef === undefined || purpose === undefined
    || next === undefined || previous === undefined || p.grain !== GRAINS[name] || p.exact_total !== null || p.limit !== 200
    || p.source_as_of_ms !== null || p.source_clock_reason !== "SOURCE_CLOCK_NOT_SCOPED"
    || prov.field_contract_revision !== "portal.execution.live-source-fields.v2" || prov.projection_basis !== "SAME_RETAINED_DOCUMENT"
    || prov.source_revision !== null || prov.source_cursor !== null || prov.source_completeness !== "UNKNOWN"
    || prov.history_semantics !== "BOUNDED_RETAINED_NOT_FULL_HISTORY" || typeof p.has_more !== "boolean"
    || !Array.isArray(p.records) || p.records.length > 200
    || typeof p.returned_count !== "number" || !Number.isSafeInteger(p.returned_count) || p.returned_count !== p.records.length
  ) return null;
  // A panel the source never captured has nothing to page; a page that has more has somewhere to go.
  // Schema allOf (execution-operations.v1 LiveSourceOperationsReadV2 panels): NOT_PUBLISHED has no records, no more
  // page and both cursors null; and has_more is true exactly when next_cursor is a string.
  if (state === "NOT_PUBLISHED" && (p.records.length !== 0 || p.has_more || next !== null || previous !== null)) return null;
  if (p.has_more !== (next !== null)) return null;
  const records: LiveSourceRecordV2[] = [];
  for (const entry of p.records) {
    const read = readRecord(entry);
    if (read === null) return null;
    records.push(read);
  }
  if (new Set(records.map((record) => record.observationId)).size !== records.length) return null;
  return {
    name, state, reasonCode, sourceClockReason: "SOURCE_CLOCK_NOT_SCOPED",
    provenance: {
      datasetId, purpose, fieldPolicyRef, projectionBasis: "SAME_RETAINED_DOCUMENT", sourceCompleteness: "UNKNOWN",
      historySemantics: "BOUNDED_RETAINED_NOT_FULL_HISTORY",
    },
    grain: GRAINS[name], returnedCount: records.length, limit: 200, hasMore: p.has_more, nextCursor: next, previousCursor: previous, records,
  };
}

/**
 * `stage_facts` of the schema (`execution-operations.v1` LiveSourceOperationsReadV2): the V1 fact vocabulary, closed, with
 * scoped observations allowed, but global counts, NO_OPEN_FINDINGS and session completeness refused. `null` = refused.
 */
export function readLiveStageFactsV2(raw: unknown): StageFacts | null {
  const facts = readStageFacts(raw);
  if (facts === null) return null;
  const { reconciliation, sessions } = facts;
  if (
    (reconciliation.verdict.availability === "AVAILABLE" && reconciliation.verdict.value === "NO_OPEN_FINDINGS")
    || reconciliation.openFindingCount.availability !== "NOT_PUBLISHED" || reconciliation.unknownOrderCount.availability !== "NOT_PUBLISHED"
    || sessions.sourceComplete === true
  ) return null;
  return facts;
}

const LIVE_KEYS = [
  "schema_version", "workspace_id", "environment", "profile_id", "deployment_id", "record_authority", "source_verdict",
  "visibility", "coverage", "observed_at_ms", "source_side_effect_requested", "runtime_activation_requested", "data",
  "runtime", "realtime", "commands",
] as const;

/** The body's keys: the sixteen, plus whichever of the two opt-in members it carries. */
function liveBody(raw: unknown): Rec | null {
  const r = rec(raw);
  if (r === null) return null;
  const extra = (["identity", "stage_facts"] as const).filter((key) => Object.hasOwn(r, key));
  return closed(r, [...LIVE_KEYS, ...extra]);
}

export function readLiveSourceOperationsV2(raw: unknown): LiveSourceOperationsV2 | null {
  const r = liveBody(raw);
  if (r === null || r.schema_version !== LIVE_SOURCE_V2_SCHEMA) return null;
  const hasFacts = Object.hasOwn(r, "stage_facts");
  const identity = readScopedIdentityV2(r.identity, Object.hasOwn(r, "identity"));
  const stageFacts = hasFacts ? readLiveStageFactsV2(r.stage_facts) : null;
  if (identity === undefined || (hasFacts && stageFacts === null)) return null;
  const workspaceId = text(r.workspace_id);
  const profileId = text(r.profile_id);
  const deploymentId = text(r.deployment_id);
  const observedAt = instant(r.observed_at_ms);
  const runtime = closed(r.runtime, ["state", "reason_code"]);
  const realtime = closed(r.realtime, ["active", "reason_code"]);
  const commands = closed(r.commands, ["enabled", "reason_code"]);
  const data = closed(r.data, LIVE_SOURCE_PANELS);
  if (
    workspaceId === null || profileId === null || deploymentId === null || observedAt === null || data === null
    || r.environment !== "live" || r.record_authority !== "PORTAL_RETAINED_OBSERVATION" || r.source_verdict !== "NOT_ASSERTED"
    || r.visibility !== "SCOPED" || r.coverage !== "AUTHORIZED_ONLY" || r.source_side_effect_requested !== false
    || r.runtime_activation_requested !== false
    || runtime === null || runtime.state !== null || runtime.reason_code !== "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED"
    || realtime === null || !isFalse(realtime.active) || realtime.reason_code !== "FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"
    || commands === null || !isFalse(commands.enabled) || commands.reason_code !== "READ_NOT_COMMAND_AUTHORITY"
  ) return null;
  const panels = {} as Record<LiveSourcePanelName, LiveSourcePanelV2>;
  for (const name of LIVE_SOURCE_PANELS) {
    const panel = readPanel(name, data[name]);
    if (panel === null) return null;
    panels[name] = panel;
  }
  return {
    workspaceId, profileId, deploymentId, observedAt, runtimeReasonCode: "SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED",
    realtimeActive: false, commandsEnabled: false, panels, identity, stageFacts,
  };
}
