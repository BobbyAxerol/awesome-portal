/**
 * Strict reader of `portal.execution.alpha-lifecycle.v1` (WP-K slice 5; operationId `executionAlphaLifecycleGetV1`): the lifecycle of one alpha.
 *
 * Four sections with the SAME three-way meaning as the approval evidence (omitted = no owning source, `null` = not read, object = published);
 * a count of 0 is a published zero; Net PnL is one currency per figure, kept as the source's exact string and never added across venues or
 * currencies. Named rules stricter than the JSON Schema: LC-1 stages are unique and in the lifecycle order, a DONE stage has an exit that does
 * not precede its entry, LC-2 criteria met never exceeds total and equals the number of met items when items are listed, LC-3 events are
 * unique by id. Never throws: a malformed body is `null`, another schema is `unsupported_shape`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs, exactValue, hasOnly, managerText, oneOf, record } from "./managerMetric";
import type { EvidenceSection } from "./approvalEvidence";

export const ALPHA_LIFECYCLE_SCHEMA = "portal.execution.alpha-lifecycle.v1";
export const LIFECYCLE_STAGES = ["R1", "R2", "PAPER", "SANDBOX", "CANARY", "LIVE"] as const;
export type LifecycleStageId = (typeof LIFECYCLE_STAGES)[number];
export const LIFECYCLE_EVENT_KINDS = ["stage", "decision", "incident", "recall", "flow"] as const;
export type LifecycleEventKind = (typeof LIFECYCLE_EVENT_KINDS)[number];
const STAGE_STATES = ["DONE", "CURRENT", "BLOCKED", "NOT_STARTED"] as const;
const DOMAINS = ["ACTUAL", "PAPER", "SANDBOX"] as const;
const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const MAX_ITEMS = 32;
const MAX_EVENTS = 200;
const MAX_VENUES = 64;

export interface LifecycleCriterion { label: string; observed: string | null; threshold: string | null; met: boolean }
export interface LifecycleStage {
  stage: LifecycleStageId;
  state: (typeof STAGE_STATES)[number];
  enteredAtMs: UtcEpochMs | null;
  exitedAtMs: UtcEpochMs | null;
  daysInStage: number | null;
  criteria: { met: number; total: number; items: readonly LifecycleCriterion[] } | null;
  deciderRole: string | null;
  decidedBy: string | null;
  receiptRef: string | null;
  blockedReason: string | null;
}
export interface LifecycleEvent { eventId: string; kind: LifecycleEventKind; atMs: UtcEpochMs; title: string; actor: string | null; receiptRef: string | null }
export interface LifecycleEvents { total: number; truncated: boolean; items: readonly LifecycleEvent[] }
export type LifecycleRegimeFit = { state: "PUBLISHED"; ratioScale: "FRACTION" | "PERCENT"; exact: string } | { state: "NOT_PUBLISHED"; reasonCode: "INSUFFICIENT_DATA" | "REGIME_MODEL_NOT_PUBLISHED" };
export interface LifecycleVenuePnl { venue: string; economicDomain: (typeof DOMAINS)[number]; currency: string; exact: string; zero: boolean; asOfMs: UtcEpochMs }
export interface AlphaLifecycle {
  workspaceId: string;
  alphaId: string;
  alphaVersionId: string | null;
  readAtMs: UtcEpochMs;
  stages: EvidenceSection<readonly LifecycleStage[]>;
  events: EvidenceSection<LifecycleEvents>;
  regimeFit: EvidenceSection<LifecycleRegimeFit>;
  venueNetPnl: EvidenceSection<readonly LifecycleVenuePnl[]>;
}
export type AlphaLifecycleRead = { kind: "alpha_lifecycle"; lifecycle: AlphaLifecycle } | { kind: "unsupported_shape"; schemaVersion: string | null };

const count = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);
const optionalText = (value: unknown): string | null | undefined => (value === null ? null : managerText(value) ?? undefined);
const optionalId = (value: unknown): string | null | undefined => (value === null ? null : typeof value === "string" && ID.test(value) ? value : undefined);
const optionalClock = (value: unknown): UtcEpochMs | null | undefined => (value === null ? null : clockMs(value) ?? undefined);

function readCriteria(raw: unknown): LifecycleStage["criteria"] | undefined {
  if (raw === null) return null;
  const c = record(raw);
  if (c === null || !hasOnly(c, ["met", "total", "items"]) || !Array.isArray(c.items) || c.items.length > MAX_ITEMS) return undefined;
  const met = count(c.met);
  const total = count(c.total);
  if (met === null || total === null || met > total || c.items.length > total) return undefined; // LC-2
  const items: LifecycleCriterion[] = [];
  for (const entry of c.items) {
    const item = record(entry);
    if (item === null || !hasOnly(item, ["label", "observed", "threshold", "met"]) || typeof item.met !== "boolean") return undefined;
    const label = managerText(item.label);
    const observed = optionalText(item.observed);
    const threshold = optionalText(item.threshold);
    if (label === null || observed === undefined || threshold === undefined) return undefined;
    items.push({ label, observed, threshold, met: item.met });
  }
  if (items.length > 0 && items.filter((item) => item.met).length !== met) return undefined; // LC-2
  return { met, total, items };
}

function readStages(raw: unknown): readonly LifecycleStage[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIFECYCLE_STAGES.length) return null;
  const out: LifecycleStage[] = [];
  let last = -1;
  for (const entry of raw) {
    const s = record(entry);
    if (s === null || !hasOnly(s, ["stage", "state", "entered_at_ms", "exited_at_ms", "days_in_stage", "criteria", "decider_role", "decided_by", "receipt_ref", "blocked_reason"])) return null;
    const stage = oneOf(s.stage, LIFECYCLE_STAGES);
    const state = oneOf(s.state, STAGE_STATES);
    const enteredAtMs = optionalClock(s.entered_at_ms);
    const exitedAtMs = optionalClock(s.exited_at_ms);
    const daysInStage = s.days_in_stage === null ? null : count(s.days_in_stage);
    const criteria = readCriteria(s.criteria);
    const deciderRole = optionalText(s.decider_role);
    const decidedBy = optionalText(s.decided_by);
    const receiptRef = optionalId(s.receipt_ref);
    const blockedReason = optionalText(s.blocked_reason);
    if (stage === null || state === null || enteredAtMs === undefined || exitedAtMs === undefined || (s.days_in_stage !== null && daysInStage === null)
      || criteria === undefined || deciderRole === undefined || decidedBy === undefined || receiptRef === undefined || blockedReason === undefined) return null;
    const index = LIFECYCLE_STAGES.indexOf(stage);
    if (index <= last) return null; // LC-1
    last = index;
    if (enteredAtMs !== null && exitedAtMs !== null && exitedAtMs < enteredAtMs) return null; // LC-1
    if (state === "DONE" && exitedAtMs === null) return null; // LC-1
    out.push({ stage, state, enteredAtMs, exitedAtMs, daysInStage, criteria, deciderRole, decidedBy, receiptRef, blockedReason });
  }
  return out;
}

function readEvents(raw: unknown): LifecycleEvents | null {
  const e = record(raw);
  if (e === null || !hasOnly(e, ["total", "truncated", "items"]) || !Array.isArray(e.items) || e.items.length > MAX_EVENTS || typeof e.truncated !== "boolean") return null;
  const total = count(e.total);
  if (total === null || total < e.items.length || e.truncated !== total > e.items.length) return null;
  const seen = new Set<string>();
  const items: LifecycleEvent[] = [];
  for (const entry of e.items) {
    const item = record(entry);
    if (item === null || !hasOnly(item, ["event_id", "kind", "at_ms", "title", "actor", "receipt_ref"])) return null;
    const eventId = typeof item.event_id === "string" && ID.test(item.event_id) ? item.event_id : null;
    const kind = oneOf(item.kind, LIFECYCLE_EVENT_KINDS);
    const atMs = clockMs(item.at_ms);
    const title = managerText(item.title);
    const actor = optionalText(item.actor);
    const receiptRef = optionalId(item.receipt_ref);
    if (eventId === null || kind === null || atMs === null || title === null || actor === undefined || receiptRef === undefined || seen.has(eventId)) return null; // LC-3
    seen.add(eventId);
    items.push({ eventId, kind, atMs, title, actor, receiptRef });
  }
  return { total, truncated: e.truncated, items };
}

function readRegime(raw: unknown): LifecycleRegimeFit | null {
  const r = record(raw);
  if (r === null || !hasOnly(r, ["state", "ratio_scale", "value", "reason_code"])) return null;
  if (r.state === "PUBLISHED") {
    const scale = oneOf(r.ratio_scale, ["FRACTION", "PERCENT"] as const);
    const value = exactValue(r.value);
    return scale === null || value === null || r.reason_code !== null ? null : { state: "PUBLISHED", ratioScale: scale, exact: value.exact };
  }
  if (r.state === "NOT_PUBLISHED") {
    const reasonCode = oneOf(r.reason_code, ["INSUFFICIENT_DATA", "REGIME_MODEL_NOT_PUBLISHED"] as const);
    return reasonCode === null || r.value !== null || r.ratio_scale !== null ? null : { state: "NOT_PUBLISHED", reasonCode };
  }
  return null;
}

function readVenues(raw: unknown): readonly LifecycleVenuePnl[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_VENUES) return null;
  const out: LifecycleVenuePnl[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const v = record(entry);
    if (v === null || !hasOnly(v, ["venue", "economic_domain", "currency", "net_pnl", "as_of_ms"])) return null;
    const venue = managerText(v.venue);
    const economicDomain = oneOf(v.economic_domain, DOMAINS);
    const currency = managerText(v.currency);
    const value = exactValue(v.net_pnl);
    const asOfMs = clockMs(v.as_of_ms);
    if (venue === null || economicDomain === null || currency === null || value === null || asOfMs === null) return null;
    const key = JSON.stringify([venue, economicDomain, currency]);
    if (seen.has(key)) return null; // one figure per venue, book and currency
    seen.add(key);
    out.push({ venue, economicDomain, currency, exact: value.exact, zero: value.zero, asOfMs });
  }
  return out;
}

function section<T>(body: Record<string, unknown>, key: string, read: (raw: unknown) => T | null): EvidenceSection<T> | null {
  if (!(key in body)) return { state: "NO_SOURCE" };
  if (body[key] === null) return { state: "NOT_READ" };
  const value = read(body[key]);
  return value === null ? null : { state: "PUBLISHED", value };
}

export function readAlphaLifecycleV1(raw: unknown): AlphaLifecycleRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const version = typeof root.schema_version === "string" ? root.schema_version : null;
    if (version !== ALPHA_LIFECYCLE_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
    if (!hasOnly(root, ["schema_version", "workspace_id", "alpha_id", "alpha_version_id", "record_authority", "read_at_ms", "stages", "events", "regime_fit", "venue_net_pnl"])) return null;
    const workspaceId = managerText(root.workspace_id);
    const alphaId = typeof root.alpha_id === "string" && ID.test(root.alpha_id) ? root.alpha_id : null;
    const alphaVersionId = !("alpha_version_id" in root) || root.alpha_version_id === null ? null : typeof root.alpha_version_id === "string" && ID.test(root.alpha_version_id) ? root.alpha_version_id : undefined;
    const readAtMs = clockMs(root.read_at_ms);
    if (workspaceId === null || alphaId === null || alphaVersionId === undefined || readAtMs === null || root.record_authority !== "PORTAL_PROJECTION") return null;
    const stages = section(root, "stages", readStages);
    const events = section(root, "events", readEvents);
    const regimeFit = section(root, "regime_fit", readRegime);
    const venueNetPnl = section(root, "venue_net_pnl", readVenues);
    if (stages === null || events === null || regimeFit === null || venueNetPnl === null) return null;
    return { kind: "alpha_lifecycle", lifecycle: { workspaceId, alphaId, alphaVersionId, readAtMs, stages, events, regimeFit, venueNetPnl } };
  } catch {
    return null;
  }
}

/** Whether the body answers the alpha asked: another alpha's lifecycle is never shown under this one. */
export const alphaLifecycleAnswers = (lifecycle: AlphaLifecycle, alphaId: string): boolean => lifecycle.alphaId === alphaId;

/** The request path (execution base stripped). */
export const alphaLifecyclePath = (alphaId: string, environment?: "paper" | "sandbox" | "live", workspaceId?: string): string | null => {
  if (!ID.test(alphaId)) return null;
  const query = new URLSearchParams();
  if (environment) query.set("environment", environment);
  if (workspaceId) query.set("workspace_id", workspaceId);
  const text = query.toString();
  return `/alphas/${encodeURIComponent(alphaId)}/lifecycle${text === "" ? "" : `?${text}`}`;
};
