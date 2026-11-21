/**
 * Overview (Command Center), pure model (UXM-07 S2, flag key `overview`).
 *
 * Every figure is one of three things, and the screen never blurs them:
 *
 * - a COUNT the server stated (incidents and approvals in the ranked list,
 *   operations awaiting acknowledgement, stage counts), with its own
 *   exactness: `~` when the server said it was a floor, "at least" when the
 *   list is a window of a larger one, "Not available" when it did not count;
 * - a CURRENT fact in a currency (allocation, exposure, open-position PnL),
 *   one row per currency, never added across currencies, labelled current and
 *   never a window;
 * - a figure the Manager has not published (NAV, windowed Net PnL, Return,
 *   Drawdown, capital statements, the digest, contributors), named with its
 *   request ids. None is computed here.
 *
 * The ranking is the server's: items stay in the order they arrived, with the
 * rank shown, and the browser applies no second sort.
 */
import type { AlphaFleetSummary, CurrencyValue } from "../../../api/profileRead";
import type { SubscriptionState } from "../../../subscription";
import { countLabel, type Counts, type FleetPanel, type NeedsYouPanel, type TriageItem, type TriageKind, type TodayPanel } from "../../../commandCenter";
import { readDecimal, type BoundaryDecimal } from "../../boundary";
import type { FlagKind } from "../../flagKinds";

/** Request ids behind each unpublished block, as filed in FRONTEND_BACKEND_SYNC. */
export const FE_MONEY = "FE-005/006/013/025";
export const FE_CAPITAL = "FE-017";
export const FE_DIGEST = "FE-024";
/** Fund-level capital events (added, returned) for markers on the performance chart: no published place (the ledger is per portfolio). */
export const FE_CAPITAL_EVENTS = "FE-017";
export const FE_CONTRIBUTORS = "FE-025";
export const FE_RESEARCHER = "FE-026";

export const ROW_CAP = 200;

export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── triage ────────────────────────────────────────────────────────────── */

export const KIND_FLAG: Readonly<Record<TriageKind, { kind: FlagKind; label: string }>> = {
  INCIDENT: { kind: "incident", label: "Incident" },
  APPROVAL: { kind: "approval", label: "Approval" },
  OPERATION: { kind: "operation", label: "Operation" },
};

const SLA_WORD: Readonly<Record<string, string>> = {
  OVERDUE: "Overdue",
  DUE_SOON: "Due soon",
  ON_TRACK: "On track",
  NONE: "No deadline",
};

export interface TriageView {
  id: string;
  kind: TriageKind | null;
  title: string;
  summary: string;
  severity: string | null;
  /** "Overdue since 2026-08-22 11:58:00 UTC" / "On track". Server words and times; no ticking clock. */
  sla: string;
  /** One line for a narrow list: "Overdue since 22 Aug 11:58Z, age 10 min". The full instant stays in `sla`. */
  slaShort: string;
  slaState: string | null;
  /**
   * The state the row is DRAWN in. It is the server's word, except that a deadline the server's own read time has already passed is drawn
   * overdue (red) whatever the word says: an amber "Due soon" beside a date in the past is the contradiction F3a removed.
   */
  slaVisual: string | null;
  rank: number | null;
  href: string | null;
  actionLabel: string;
  age: string | null;
}

export function ageLabel(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "22 Aug 11:58Z" from a UTC ISO instant; anything else is printed as the server sent it. */
function shortInstant(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso.trim());
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return m && month ? `${Number(m[2])} ${month} ${m[3]}Z` : iso;
}

/** The server's age is measured at the item's own `as_of`; beyond this gap from the read time the page states, the two do not describe the same moment. */
export const AGE_COMPARABLE_MS = 5 * 60 * 1000;

/**
 * An item's age is `age_seconds` at its `as_of`. It sits beside "Overdue since ..." and the page's
 * read time, so it is shown only when that `as_of` and the stated read time are within a few
 * minutes of each other. A missing or unparseable instant, or a larger gap, is "not comparable":
 * the age is dropped, never re-computed from the browser clock.
 */
export function comparableAge(item: Pick<TriageItem, "ageSeconds" | "asOf">, readAt: string | null): string | null {
  if (item.ageSeconds === null || item.asOf === null || readAt === null) return null;
  const at = Date.parse(item.asOf);
  const read = Date.parse(readAt);
  if (!Number.isFinite(at) || !Number.isFinite(read) || Math.abs(read - at) > AGE_COMPARABLE_MS) return null;
  return ageLabel(item.ageSeconds);
}

/** Where a deadline sits against the server's reference instant; `null` when either is missing or unreadable. */
export function deadlineRelation(due: string | null, reference: string | null): "before" | "after" | null {
  if (due === null || reference === null) return null;
  const d = Date.parse(due);
  const r = Date.parse(reference);
  if (!Number.isFinite(d) || !Number.isFinite(r) || d === r) return null;
  return d < r ? "before" : "after";
}

/** How far a deadline is from the server's reference instant, in words ("56 days", "3 hours", "12 minutes"); `null` when unreadable. */
export function deadlineGap(due: string | null, reference: string | null): string | null {
  if (due === null || reference === null) return null;
  const d = Date.parse(due);
  const r = Date.parse(reference);
  if (!Number.isFinite(d) || !Number.isFinite(r)) return null;
  const minutes = Math.round(Math.abs(d - r) / 60000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes >= 1440) return plural(Math.round(minutes / 1440), "day");
  if (minutes >= 60) return plural(Math.round(minutes / 60), "hour");
  return plural(Math.max(1, minutes), "minute");
}

export function triageRows(panel: NeedsYouPanel | null, stamp: (iso: string) => string, readAt: string | null): TriageView[] {
  if (panel === null) return [];
  // Order is the server's. See commandCenter.ts, rule 1.
  return panel.items.slice(0, ROW_CAP).map((item: TriageItem) => {
    const word = item.slaState ? SLA_WORD[item.slaState] ?? humanize(item.slaState) : "No deadline published";
    const due = item.slaDueAt ? ` (${item.slaState === "OVERDUE" ? "since" : "due"} ${stamp(item.slaDueAt)})` : "";
    const shortDue = item.slaDueAt
      ? item.slaState === "OVERDUE" ? ` since ${shortInstant(item.slaDueAt)}` : item.slaState === "DUE_SOON" ? `, by ${shortInstant(item.slaDueAt)}` : `, due ${shortInstant(item.slaDueAt)}`
      : "";
    const age = comparableAge(item, readAt);
    // The relation of the deadline to "now" is judged against the SERVER's own read time (or the item's as-of), never the browser clock.
    // A state word that the dates contradict ("Due soon" for a date before the read) is not repeated as a fact: the date and its relation are shown.
    const relation = deadlineRelation(item.slaDueAt, readAt ?? item.asOf);
    const contradicted = relation !== null && ((item.slaState === "DUE_SOON" || item.slaState === "ON_TRACK") && relation === "before" || item.slaState === "OVERDUE" && relation === "after");
    const gap = deadlineGap(item.slaDueAt, readAt ?? item.asOf);
    const slaShortDate = contradicted && item.slaDueAt
      ? `Deadline ${shortInstant(item.slaDueAt)}, ${gap} ${relation === "before" ? "before" : "after"} the read time`
      : null;
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      severity: item.severity,
      sla: `${contradicted && item.slaDueAt ? `Deadline ${stamp(item.slaDueAt)}, ${gap} ${relation === "before" ? "before" : "after"} the read time; the server's state word is ${word}` : `${word}${due}`}${age === null && item.ageSeconds !== null ? ". Age not shown: its as-of time is not comparable with the read time" : ""}`,
      slaShort: `${slaShortDate ?? `${word}${shortDue}`}${age ? `, age ${age}` : ""}`,
      slaState: item.slaState,
      slaVisual: contradicted && relation === "before" ? "OVERDUE" : item.slaState,
      rank: item.rank,
      href: item.href,
      actionLabel: item.actionLabel ?? "Open",
      age,
    };
  });
}

export interface CountView {
  /** What to print. `null` = not counted. */
  text: string | null;
  /** The number is a floor or a window, not a total. */
  approximate: boolean;
}

/** "Needs attention": the panel's own count sentence, never a 0 for a count it did not make. */
export function needsAttention(panel: NeedsYouPanel | null): CountView {
  if (panel === null || panel.state === "unavailable") return { text: null, approximate: false };
  const label = countLabel(panel.counts);
  return label === "not counted" ? { text: null, approximate: false } : { text: label, approximate: label.includes("~") || label.includes("of") };
}

/**
 * Incidents in the ranked list. The list is a window of a larger population
 * when the server truncated it, so the number is then a floor ("at least").
 */
export function openIncidents(panel: NeedsYouPanel | null): { value: number | null; atLeast: boolean } {
  if (panel === null || panel.state === "unavailable") return { value: null, atLeast: false };
  const seen = panel.items.filter((item) => item.kind === "INCIDENT").length;
  return { value: seen, atLeast: windowed(panel.counts) };
}

function windowed(counts: Counts): boolean {
  return counts.truncated !== false || !counts.exactTotal;
}

/* ── per-currency current facts ────────────────────────────────────────── */

export interface CurrencyFact {
  currency: string;
  allocation: BoundaryDecimal | null;
  exposure: BoundaryDecimal | null;
  /** Open-position PnL, net, current. Not a window and not a return. */
  netPositionPnl: BoundaryDecimal | null;
}

function byCurrency(values: readonly CurrencyValue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const value of values) map.set(value.currency, value.value);
  return map;
}

/** No real amount is longer than this; a longer string is refused before BigInt arithmetic can be asked to chew on it. */
const MAX_DECIMAL_CHARS = 64;

function readMoney(raw: string): BoundaryDecimal | null {
  return raw.length > MAX_DECIMAL_CHARS ? null : readDecimal(raw, { unit: "money" });
}

/** One row per currency present in any of the three lists; a missing cell stays missing. */
export function currencyFacts(summary: AlphaFleetSummary | null): CurrencyFact[] {
  if (summary === null) return [];
  const allocation = byCurrency(summary.allocationByCurrency);
  const exposure = byCurrency(summary.exposureByCurrency);
  const pnl = new Map(summary.currentPositionPnlByCurrency.map((row) => [row.currency, row.net] as const));
  const currencies = [...new Set([...allocation.keys(), ...exposure.keys(), ...pnl.keys()])].sort((a, b) => a.localeCompare(b));
  const read = (raw: string | undefined) => (raw === undefined ? null : readMoney(raw));
  return currencies.map((currency) => ({
    currency,
    allocation: read(allocation.get(currency)),
    exposure: read(exposure.get(currency)),
    netPositionPnl: read(pnl.get(currency)),
  }));
}

/** Stage words in the lifecycle order, then any other the server sent. */
const STAGE_ORDER = ["PAPER", "SANDBOX", "CANARY", "LIVE"] as const;

/**
 * One entry per lifecycle stage, plus any other stage the server sent. A stage
 * the summary does not list has `count: null` ("Not available"), never 0: the
 * server omits a stage exactly when it did not read that stage's environment
 * completely (FE-048, control-api `fleetStageCounts`), and lists a completely
 * read stage with its exact count, so a published 0 is a fact and stays 0
 * (the fleet lens counts follow the same rule). Nothing downstream adds these up.
 */
export function stageCounts(summary: AlphaFleetSummary | null): { stage: string; label: string; count: number | null }[] {
  if (summary === null) return [];
  const rest = Object.keys(summary.stageCounts).filter((stage) => !(STAGE_ORDER as readonly string[]).includes(stage)).sort();
  return [...STAGE_ORDER, ...rest].map((stage) => ({ stage, label: humanize(stage), count: summary.stageCounts[stage] ?? null }));
}

/* ── command center panels ─────────────────────────────────────────────── */

export interface FleetCellView { label: string; value: number | null; href: string | null; code: string | null }

export function fleetCells(panel: FleetPanel | null): FleetCellView[] {
  return panel === null ? [] : panel.cells.map((cell) => ({ label: cell.label, value: cell.value, href: cell.href, code: cell.code }));
}

/** Cells that count something other than deployments: they are never part of the deployment total. */
const ISSUE_CODES: readonly string[] = ["BROKER_SYNC_ISSUES", "OPEN_FINDINGS"];

/** The Command Centre fleet cells in two units: deployments (by state) and open issues. Never merged, never summed. */
export function fleetCellGroups(panel: FleetPanel | null): { deployments: FleetCellView[]; issues: FleetCellView[] } {
  const cells = fleetCells(panel);
  return { deployments: cells.filter((c) => c.code === null || !ISSUE_CODES.includes(c.code)), issues: cells.filter((c) => c.code !== null && ISSUE_CODES.includes(c.code)) };
}

export function todayRows(panel: TodayPanel | null): TodayPanel["items"] {
  return panel === null ? [] : panel.items.slice(0, ROW_CAP);
}

/** QUIET is "nothing needs you" with the read time; it is only claimed when the server's panel says ready and empty. */
export function modeOf(panel: NeedsYouPanel | null, serverMode: string | null): "busy" | "quiet" | "degraded" | "unknown" {
  if (panel === null || panel.state === "unavailable" || panel.state === "partial" || panel.state === "stale") return panel === null ? "unknown" : "degraded";
  if (panel.items.length > 0) return "busy";
  return serverMode === "QUIET" || panel.state === "empty" ? "quiet" : "unknown";
}

/* ── the stream, in words ──────────────────────────────────────────────── */

/**
 * One sentence for the stream's state. Only a stream that is delivering in order says "Live";
 * a gap, a rebuild, a drop or a failure says that the values are the last good read.
 */
export function streamSentence(live: SubscriptionState): { text: string; tone: "live" | "wait" | "lost" } {
  switch (live.phase) {
    case "live":
      return { text: `Live, ${live.freshness.toLowerCase()}${live.note ? `, ${live.note}` : ""}`, tone: "live" };
    case "idle":
    case "snapshotting":
      return { text: "Reading the first snapshot. Values are as read.", tone: "wait" };
    case "reconnecting":
      return { text: `Reconnecting. Values are as last read${live.lastGoodAsOf ? `, as of ${live.lastGoodAsOf}` : ""}.`, tone: "wait" };
    case "gap":
    case "epoch_changed":
      return { text: `${live.note ?? "Continuity was lost."} Values are the last good read, not the current state.`, tone: "lost" };
    case "auth_expired":
      return { text: live.note ?? "Session expired. Sign in again to resume the live stream; values below are as read.", tone: "lost" };
    case "source_lost":
      return { text: `${live.note ?? "Source lost. Values are as last read."}${live.lastGoodAsOf ? ` Last good as of ${live.lastGoodAsOf}.` : ""}`, tone: "lost" };
    default:
      return { text: `${live.note ?? "The stream failed."} Values are as last read.`, tone: "lost" };
  }
}
