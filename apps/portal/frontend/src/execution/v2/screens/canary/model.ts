/**
 * Canary control room: the pure view-model. Every sentence the screen prints
 * about a figure is decided here from a `CanaryView` (readCanary.ts), so the
 * rules below are testable without a DOM.
 *
 * The rules (S3 plan s4, D4, D6, D7, D13; CLAUDE.md s3.3):
 * - nothing is computed: no consumed / approved, no days remaining, no "Within
 *   envelope" verdict. `Ready` is the server's boolean and nothing else (see
 *   `rollbackHead`). A fact the body does not carry is `Not published (FE-xxx)`,
 *   and a fact the source did not report is `Not available`;
 * - a chip whose source does not publish is a request id, never a green word;
 * - the four decisions are always drawn and never enabled: there is no command
 *   route, and the reason is the stage dictionary's (D6, D9);
 * - reason codes appear only in Provenance; the sentence is this file's copy
 *   (FE-015 holds the dictionary request), and a code this build has no sentence
 *   for gets one generic sentence, not the code.
 */
import type { StageChipValue, StageChips } from "../../blocks";
import type { BlockerItem } from "../../blocks";
import type { FlagKind } from "../../flagKinds";
import { formatAsOf, readAsOf, type Metric } from "../../boundary";
import type { SpineStageId } from "../../blocks";
import { stageWhy, type StageWhyKey } from "../stage/reasons";
import {
  KPI_KEYS,
  KPI_VALUE_STATES,
  type CanaryView,
  type DecimalFact,
  type KpiFact,
  type KpiKey,
  type LimitFact,
  type LimitKey,
  type PanelFact,
} from "./readCanary";

/** The tab ids, the keys of `tabAliases.ts` surface `canary`. */
export const CANARY_TABS = [
  { id: "envelope", label: "Envelope" },
  { id: "positions-orders", label: "Positions & orders" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "guard-rule", label: "Guard rule" },
] as const;

export const CANARY_TITLE = "Canary control room";
export const ACCESS_PATH = "/administration/profile-access";
/** The most rows a table prints; the rest is a count, never a longer list (CLAUDE.md s8, perf budget). */
export const ROW_CAP = 200;

const FE_RUNTIME = "FE-067" as const;
const FE_ENVELOPE = "FE-071" as const;
const FE_ROWS = "FE-072" as const;

/* ── header ───────────────────────────────────────────────────────────────── */

function timeOf(ms: number | null): string | null {
  const instant = ms === null ? null : readAsOf(ms);
  return instant === null ? null : formatAsOf(instant);
}

function runtimeChip(view: CanaryView): StageChipValue {
  const word = view.runtimeState;
  if (word === null) return { state: "not-published", id: FE_RUNTIME };
  switch (word.toUpperCase()) {
    case "RUNNING":
      return { state: "flag", kind: "ok", label: "Running" };
    case "HALTED":
      return { state: "flag", kind: "attention", label: "Halted" };
    case "STOPPED":
      return { state: "flag", kind: "attention", label: "Stopped" };
    case "PAUSED":
      return { state: "flag", kind: "paused", label: "Paused" };
    default:
      // A word this build has no mapping for is printed as the source wrote it, in a neutral dot: never a green tick.
      return { state: "dot", tone: "mute", text: word };
  }
}

/** The freshness of the broker snapshot, the one the guard rule is about; other panels are not blended into it. */
export function freshnessChip(view: CanaryView): StageChipValue {
  const broker = view.broker;
  if (broker === null) return { state: "not-available", reason: "No source panel in this response" };
  if (broker.state === "suppressed") return { state: "not-available", reason: "Withheld by the server" };
  if (broker.state === "unavailable" || broker.state === "denied" || broker.state === "terminal") {
    return { state: "not-available", reason: "Broker source unavailable" };
  }
  const at = timeOf(broker.asOfMs);
  switch (broker.freshness) {
    case "OK":
      return { state: "dot", tone: "ok", text: at ? `Fresh · ${at}` : "Fresh" };
    case "AGING":
      return { state: "dot", tone: "warn", text: at ? `Aging · ${at}` : "Aging" };
    case "STALE":
      return { state: "dot", tone: "warn", text: at ? `Stale · ${at}` : "Stale" };
    default:
      return { state: "not-available", reason: "Freshness is not stated" };
  }
}

export function chipsOf(view: CanaryView): StageChips {
  return {
    runtime: runtimeChip(view),
    freshness: freshnessChip(view),
    // The three source panels exist, but no reconciliation verdict is published (FE-072): no "Clean".
    reconciliation: { state: "not-published", id: FE_ROWS },
  };
}

export const LOADING_CHIPS: StageChips = { runtime: { state: "loading" }, freshness: { state: "loading" }, reconciliation: { state: "loading" } };

/** The stages whose spine node navigates; the Canary node is where the reader is. */
export const SPINE_ROUTES: Readonly<Partial<Record<SpineStageId, (deploymentId: string) => string>>> = {
  paper: (id) => `/deployments/paper/${encodeURIComponent(id)}`,
  sandbox: (id) => `/deployments/sandbox/${encodeURIComponent(id)}`,
  live: (id) => `/deployments/live/${encodeURIComponent(id)}`,
};

/* ── trial ────────────────────────────────────────────────────────────────── */

export type TrialFact =
  | { kind: "day"; day: number; total: number; ticks: number }
  | { kind: "unstated"; durationDays: number | null; proposed: boolean };

/** Day N of M only when both are published and consistent; otherwise "not stated". `ticks` is the strip length (<= 90). */
export function trialOf(view: CanaryView): TrialFact {
  const { dayIndex, durationDays } = view;
  if (dayIndex !== null && durationDays !== null && dayIndex <= durationDays) {
    return { kind: "day", day: dayIndex, total: durationDays, ticks: Math.min(durationDays, 90) };
  }
  return { kind: "unstated", durationDays, proposed: view.proposalOnly };
}

/* ── KPI ──────────────────────────────────────────────────────────────────── */

export const KPI_LABEL: Readonly<Record<KpiKey, string>> = {
  capital_consumed: "Capital consumed",
  gross_notional: "Gross notional",
  daily_pnl: "Daily PnL",
  open_orders: "Open orders",
  broker_equity: "Broker equity",
};

export type KpiCell =
  | { key: KpiKey; label: string; kind: "not-published"; fe: typeof FE_ROWS }
  | { key: KpiKey; label: string; kind: "absent"; reason: string; basis?: string }
  | { key: KpiKey; label: string; kind: "metric"; metric: Metric | null; suffix?: string; signed: boolean; basis?: string };

function absentWhy(panel: PanelFact): string {
  switch (panel.state) {
    case "suppressed":
      return "withheld by the server";
    case "denied":
      return "not permitted";
    case "stale":
      return "source stale and no value published";
    case "partial":
      return "no value published";
    case "empty":
    case "insufficient_data":
      return "no value published";
    default:
      return "source unavailable";
  }
}

function decimalMetric(fact: DecimalFact, partial: boolean): Metric | null {
  if (fact.kind === "unreadable") return null;
  const { decimal } = fact;
  return { kind: "value", decimal, partial, publishedZero: decimal.zero, tone: partial ? "neutral" : decimal.tone, reasonCode: null };
}

function printed(fact: DecimalFact | null): string | null {
  return fact !== null && fact.kind === "value" ? fact.decimal.display : null;
}

function capOf(view: CanaryView, key: LimitKey): string | null {
  return printed(view.envelope?.limits.find((l) => l.key === key)?.value ?? null);
}

/** The caption under a KPI: the envelope's own cap (proposed while a draft), printed, never divided into a percentage. */
function kpiBasis(view: CanaryView, key: KpiKey, panel: PanelFact): string | undefined {
  const proposed = view.envelope?.status === "DRAFT";
  const word = proposed ? "Proposed cap" : "Envelope cap";
  const parts: string[] = [];
  if (key === "capital_consumed") {
    const cap = capOf(view, "capital");
    if (cap !== null) parts.push(`${word} ${cap}`);
  } else if (key === "gross_notional") {
    const cap = capOf(view, "grossNotional");
    if (cap !== null) parts.push(`${word} ${cap}`);
  } else if (key === "daily_pnl") {
    const cap = capOf(view, "dailyLoss");
    if (cap !== null) parts.push(`Daily loss cap ${cap}`);
  } else if (key === "open_orders") {
    const cap = capOf(view, "openOrders");
    if (cap !== null) parts.push(`Max ${cap}`);
  }
  if (panel.state === "stale") {
    const at = timeOf(panel.asOfMs);
    parts.push(at === null ? "Stale" : `Stale · as of ${at}`);
  }
  return parts.length === 0 ? undefined : parts.join(" · ");
}

export function kpiCells(view: CanaryView): readonly KpiCell[] {
  return KPI_KEYS.map((key): KpiCell => {
    const label = KPI_LABEL[key];
    if (view.proposalOnly) return { key, label, kind: "not-published", fe: FE_ROWS };
    const fact: KpiFact | null = view.kpis[key];
    if (fact === null) return { key, label, kind: "absent", reason: "not in this response" };
    if (fact.value === null || !KPI_VALUE_STATES.includes(fact.panel.state)) return { key, label, kind: "absent", reason: absentWhy(fact.panel), basis: kpiBasis(view, key, fact.panel) };
    return {
      key,
      label,
      kind: "metric",
      metric: decimalMetric(fact.value, fact.panel.state === "partial"),
      suffix: fact.currency ?? undefined,
      signed: key === "daily_pnl",
      basis: kpiBasis(view, key, fact.panel),
    };
  });
}

/* ── envelope ─────────────────────────────────────────────────────────────── */

const LIMIT_LABEL: Readonly<Record<LimitKey, string>> = {
  capital: "Capital cap",
  grossNotional: "Gross notional cap",
  dailyLoss: "Daily loss cap",
  openOrders: "Open orders (max)",
  duration: "Duration (days)",
};

const LIMIT_MONEY: Readonly<Record<LimitKey, boolean>> = { capital: true, grossNotional: true, dailyLoss: true, openOrders: false, duration: false };

/** The column heading for the envelope's own value: a draft is "Proposed", never "Approved". */
export function envelopeColumn(view: CanaryView): string {
  const status = view.envelope?.status ?? null;
  if (status === "DRAFT") return "Proposed";
  if (status === "APPROVED" || status === "ACTIVE") return "Approved";
  return "Envelope";
}

export interface LimitRow {
  key: LimitKey;
  label: string;
  value: DecimalFact | null;
  /** The cap `envelope_compliance.limits` states, when it states one; `null` = not in this response (FE-071). */
  limit: DecimalFact | null;
  /** The consumed figure keyed by this cap's published name, when the compliance panel states one; `null` = not published (FE-071). */
  consumed: DecimalFact | null;
  /** The server's used ratio, when one is published; `undefined` otherwise (the gauge then says so). */
  usedRatio: string | undefined;
}

export function limitRows(view: CanaryView): readonly LimitRow[] {
  const currency = view.envelope?.currency ?? null;
  const compliance = view.complianceFacts;
  return (view.envelope?.limits ?? []).map((l: LimitFact) => ({
    key: l.key,
    label: LIMIT_MONEY[l.key] && currency !== null ? `${LIMIT_LABEL[l.key]} (${currency})` : LIMIT_LABEL[l.key],
    value: l.value,
    limit: compliance?.limits[l.key] ?? null,
    consumed: compliance?.consumed?.byLimit[l.key] ?? null,
    usedRatio: l.usedRatio,
  }));
}

export interface ComplianceNotes {
  /** Headroom the server states for a cap, printed under the cap's label. */
  headroom: readonly { key: LimitKey; label: string; value: DecimalFact }[];
  /** Consumed or headroom figures under a name that is not a cap's published name, listed with that name. */
  other: readonly { group: "Consumed" | "Headroom"; name: string; exact: string }[];
  /** `false` is "not verified"; `true` is "verified"; `null` = not stated. */
  baseRiskProfile: "verified" | "not-verified" | null;
}

/** The compliance figures that have no column: the published headroom, unmatched keys, and the base risk profile flag. */
export function complianceNotes(view: CanaryView): ComplianceNotes {
  const c = view.complianceFacts;
  const headroom = (Object.keys(LIMIT_LABEL) as LimitKey[]).flatMap((key) => {
    const value = c?.headroom?.byLimit[key];
    return value === undefined ? [] : [{ key, label: LIMIT_LABEL[key], value }];
  });
  const other = [
    ...(c?.consumed?.other ?? []).map((f) => ({ group: "Consumed" as const, name: f.key, exact: f.exact })),
    ...(c?.headroom?.other ?? []).map((f) => ({ group: "Headroom" as const, name: f.key, exact: f.exact })),
  ];
  const verified = c?.baseRiskProfileVerified ?? null;
  return { headroom, other, baseRiskProfile: verified === null ? null : verified ? "verified" : "not-verified" };
}

/* ── blockers ─────────────────────────────────────────────────────────────── */

export const BLOCKER_SENTENCES: Readonly<Record<string, string>> = {
  PRODUCTION_COMMAND_INACTIVE: "Production commands are closed on this build, so no decision can be sent.",
  CANARY_OWNER_GATE_REQUIRED: "The Canary owner has not signed off yet.",
  LIVE_SOURCE_UNAVAILABLE: "The live source is not available, so no live figure can be shown.",
  BASE_RISK_PROFILE_UNVERIFIED: "The base risk profile is not verified yet.",
  BROKER_SYNC_UNAVAILABLE: "Broker data is not available, which blocks scale-up.",
  PROTECTIVE_CAPABILITY_UNAVAILABLE: "Protective actions are not available on this build.",
};

/** One sentence for a code this build has no copy for; the code itself goes to Provenance. */
export const UNTRANSLATED_BLOCKER = "The server gave a reason for this that is not translated yet.";
export const DRAFT_ENVELOPE_BLOCKER = "The envelope is a draft: it is proposed, not effective.";

export function blockerItems(view: CanaryView): readonly BlockerItem[] {
  return view.blockers.map((b, index) => {
    if (b.code === null) return { key: `draft-${index}`, text: DRAFT_ENVELOPE_BLOCKER, code: null };
    const sentence = Object.hasOwn(BLOCKER_SENTENCES, b.code) ? BLOCKER_SENTENCES[b.code] : UNTRANSLATED_BLOCKER;
    return { key: b.code, text: sentence, code: b.code };
  });
}

/* ── decisions ────────────────────────────────────────────────────────────── */

export interface DecisionSpec {
  label: string;
  hint: string;
  /** Always a stage-dictionary key: there is no command route, so no decision is ever enabled. */
  why: StageWhyKey;
}

export const DECISIONS: readonly DecisionSpec[] = [
  { label: "Hold", hint: "Keep the envelope unchanged.", why: "liveClosed" },
  { label: "Reduce", hint: "Lower the approved caps.", why: "liveClosed" },
  { label: "Rollback", hint: "Return to Paper and close positions.", why: "liveClosed" },
  { label: "Request scale", hint: "Ask for a larger envelope.", why: "liveClosed" },
];

export const decisionReason = (spec: DecisionSpec): string => stageWhy(spec.why);

/* ── rollback readiness ───────────────────────────────────────────────────── */

export type RollbackStatus =
  | { kind: "not-published" }
  | { kind: "flag"; flag: FlagKind; label: string };

export interface RollbackItem {
  key: "flatten" | "twin" | "broker" | "drill";
  label: string;
  note: string;
  status: RollbackStatus;
  /** The check date line: the published instant, or `null` = `Not published (FE-071)`. */
  checked: string | null;
  /** What `checked` is called ("Checked", "Last update"). */
  checkedWord: string;
}

export function rollbackItems(view: CanaryView): readonly RollbackItem[] {
  const broker = freshnessChip(view);
  const brokerStatus: RollbackStatus =
    broker.state === "dot"
      ? { kind: "flag", flag: broker.tone === "ok" ? "ok" : broker.tone === "warn" ? "stale" : "na", label: broker.text.split(" · ")[0] ?? broker.text }
      : { kind: "flag", flag: "na", label: "Not available" };
  const brokerAt = view.broker !== null && view.broker.state !== "unavailable" ? timeOf(view.broker.asOfMs) : null;
  return [
    { key: "flatten", label: "Flatten plan prepared", note: "", status: { kind: "not-published" }, checked: null, checkedWord: "Checked" },
    { key: "twin", label: "Paper twin running", note: "Same alpha, simulated", status: { kind: "not-published" }, checked: null, checkedWord: "Checked" },
    { key: "broker", label: "Broker data fresh", note: "", status: brokerStatus, checked: brokerAt, checkedWord: "Last update" },
    { key: "drill", label: "Last rollback drill", note: "", status: { kind: "not-published" }, checked: null, checkedWord: "Last drill" },
  ];
}

/**
 * Is a published `ready: true` contradicted by the same response? Any one of these is enough:
 * the readiness panel is not `ok`; its own freshness is STALE; it lists blocker codes; the broker snapshot,
 * which a rollback leans on, is stale. A contradicted `true` is never printed as Ready.
 */
export function rollbackContradicted(view: CanaryView): boolean {
  const panel = view.rollback;
  if (panel === null || panel.state !== "ok" || panel.freshness === "STALE") return true;
  if (view.rollbackBlockerCodes.length > 0) return true;
  const broker = view.broker;
  return broker !== null && (broker.state === "stale" || broker.freshness === "STALE");
}

/**
 * The head flag of the Rollback panel. `Ready` is `rollback_readiness.ready` being the boolean `true` AND the
 * response not contradicting it (`rollbackContradicted`); a `false` is "Not ready"; a missing or non-boolean
 * `ready` prints nothing about readiness. The panel's own state still speaks first when the source did not
 * report: an unavailable, withheld, partial or stale panel is that, whatever `ready` says.
 */
export function rollbackHead(view: CanaryView): { kind: "not-published" } | { kind: "flag"; flag: FlagKind; label: string } {
  const panel = view.rollback;
  if (panel === null) return { kind: "not-published" };
  switch (panel.state) {
    case "partial":
      return { kind: "flag", flag: "partial", label: "Partial" };
    case "stale":
      return { kind: "flag", flag: "stale", label: "Stale" };
    case "suppressed":
      return { kind: "flag", flag: "na", label: "Withheld" };
    case "unavailable":
    case "denied":
    case "terminal":
      return { kind: "flag", flag: "na", label: "Not available" };
    default:
      if (view.rollbackReady === true) {
        return rollbackContradicted(view) ? { kind: "flag", flag: "partial", label: "Not confirmed" } : { kind: "flag", flag: "ok", label: "Ready" };
      }
      if (view.rollbackReady === false) return { kind: "flag", flag: "attention", label: "Not ready" };
      return { kind: "not-published" };
  }
}

/* ── guard rule ───────────────────────────────────────────────────────────── */

export type GuardCell = { flag: FlagKind; label: string };

export interface GuardRow {
  condition: string;
  scaleUp: GuardCell;
  protective: GuardCell;
  now: GuardCell;
}

function blocks(group: { brokerSyncBlocks: boolean } | null): GuardCell {
  if (group === null) return { flag: "na", label: "Not available" };
  return group.brokerSyncBlocks ? { flag: "attention", label: "Blocked" } : { flag: "ok", label: "Allowed" };
}

export function guardRows(view: CanaryView): readonly GuardRow[] {
  const chip = freshnessChip(view);
  const now: GuardCell =
    chip.state === "dot"
      ? { flag: chip.tone === "ok" ? "ok" : chip.tone === "warn" ? "stale" : "na", label: chip.text.split(" · ")[0] ?? chip.text }
      : { flag: "na", label: "Not available" };
  return [{ condition: "Broker snapshot is stale", scaleUp: blocks(view.scaleUp), protective: blocks(view.protective), now }];
}

/** The rule in a sentence, from the two groups' own flags (never from the `guard_semantics` string). */
export function guardSentence(view: CanaryView): string {
  const { protective, scaleUp } = view;
  if (protective === null || scaleUp === null) return "The guard rule for this deployment was not published.";
  if (!protective.brokerSyncBlocks && scaleUp.brokerSyncBlocks) {
    return "A stale broker snapshot blocks scale-up and does not block protective actions. Staleness limits what the Portal can see. Guardrails still run at the venue.";
  }
  return protective.brokerSyncBlocks
    ? "A stale broker snapshot blocks every action on this deployment, including protective ones."
    : "A stale broker snapshot blocks no action on this deployment.";
}

/* ── banners ──────────────────────────────────────────────────────────────── */

export interface Banner {
  key: string;
  text: string;
}

function allPanels(view: CanaryView): readonly PanelFact[] {
  const list: (PanelFact | null)[] = [
    view.compliance, view.internal, view.broker, view.difference, view.positions.panel, view.orders.panel, view.series, view.rollback,
    ...Object.values(view.kpis).map((k) => k?.panel ?? null),
  ];
  return list.filter((p): p is PanelFact => p !== null);
}

export function bannersOf(view: CanaryView): readonly Banner[] {
  const out: Banner[] = [];
  if (view.proposalOnly) {
    out.push({ key: "proposal", text: "This response states the Canary proposal only. Runtime figures are not part of it." });
  }
  if (view.declaredStage !== null && view.declaredStage !== "LIVE_CANARY") {
    out.push({ key: "stage", text: "This deployment does not declare the Canary stage. Its Live operations are on the Live screen." });
  }
  const brokerStale = view.broker !== null && (view.broker.freshness === "STALE" || view.broker.state === "stale");
  if (brokerStale) {
    const asymmetric = view.scaleUp?.brokerSyncBlocks === true && view.protective?.brokerSyncBlocks === false;
    out.push({
      key: "guarded",
      text: asymmetric ? "Broker data is stale. Scale-up is blocked. Protective actions stay open." : "Broker data is stale.",
    });
  }
  const panels = allPanels(view);
  if (!brokerStale && panels.some((p) => p.state === "stale")) {
    out.push({ key: "stale", text: "Some figures are stale. The source has not updated within its freshness budget." });
  }
  if (panels.some((p) => p.state === "partial")) {
    out.push({ key: "partial", text: "Some figures are missing. The source reported only part of what this screen shows." });
  }
  return out;
}

/* ── panel state words ────────────────────────────────────────────────────── */

/** One line for a source panel's state, for a place that has no rows to show (Positions, Orders, Series). */
export function panelLine(panel: PanelFact | null): string {
  if (panel === null) return "Not in this response";
  switch (panel.state) {
    case "ok":
      return "The source reported this panel";
    case "partial":
      return "Partial: the source reported only part of it";
    case "stale":
      return "Stale: the source has not updated within its freshness budget";
    case "suppressed":
      return "Withheld by the server";
    case "denied":
      return "Not permitted";
    case "empty":
      return "The source reported it empty";
    default:
      return "Source unavailable";
  }
}

export const FE = { runtime: FE_RUNTIME, envelope: FE_ENVELOPE, rows: FE_ROWS, series: "FE-029", names: "FE-066" } as const;

export function subtitleIds(view: CanaryView): readonly string[] {
  return [
    view.venue,
    view.portfolioId === null ? null : `Portfolio ${view.portfolioId}`,
    view.accountId === null ? null : `Account ${view.accountId}`,
  ].filter((part): part is string => part !== null);
}
