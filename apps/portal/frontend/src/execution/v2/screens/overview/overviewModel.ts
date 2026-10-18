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
import type { AlphaFleetItem, AlphaFleetSummary, CurrencyValue } from "../../../api/profileRead";
import type { SubscriptionState } from "../../../subscription";
import { countLabel, type Counts, type FleetPanel, type NeedsYouPanel, type TriageItem, type TriageKind, type TodayPanel } from "../../../commandCenter";
import { readDecimal, type BoundaryDecimal } from "../../boundary";
import type { FlagKind } from "../../flagKinds";

/** Request ids behind each unpublished block, as filed in FRONTEND_BACKEND_SYNC. */
export const FE_MONEY = "FE-005/006/013/025";
export const FE_CAPITAL = "FE-017";
export const FE_DIGEST = "FE-024";
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
  slaState: string | null;
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

export function triageRows(panel: NeedsYouPanel | null, stamp: (iso: string) => string): TriageView[] {
  if (panel === null) return [];
  // Order is the server's. See commandCenter.ts, rule 1.
  return panel.items.slice(0, ROW_CAP).map((item: TriageItem) => {
    const word = item.slaState ? SLA_WORD[item.slaState] ?? humanize(item.slaState) : "No deadline published";
    const due = item.slaDueAt ? ` (${item.slaState === "OVERDUE" ? "since" : "due"} ${stamp(item.slaDueAt)})` : "";
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      severity: item.severity,
      sla: `${word}${due}`,
      slaState: item.slaState,
      rank: item.rank,
      href: item.href,
      actionLabel: item.actionLabel ?? "Open",
      age: ageLabel(item.ageSeconds),
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

export function stageCounts(summary: AlphaFleetSummary | null): { stage: string; label: string; count: number }[] {
  if (summary === null) return [];
  const known: string[] = STAGE_ORDER.filter((stage) => stage in summary.stageCounts);
  const rest = Object.keys(summary.stageCounts).filter((stage) => !known.includes(stage)).sort();
  return [...known, ...rest].map((stage) => ({ stage, label: humanize(stage), count: summary.stageCounts[stage] ?? 0 }));
}

/* ── command center panels ─────────────────────────────────────────────── */

export function fleetCells(panel: FleetPanel | null): { label: string; value: number | null; href: string | null }[] {
  return panel === null ? [] : panel.cells.map((cell) => ({ label: cell.label, value: cell.value, href: cell.href }));
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

/* ── fleet rows (researcher variant) ───────────────────────────────────── */

export interface OwnRow {
  alphaId: string;
  label: string;
  version: string;
  stages: readonly string[];
  allocations: readonly { currency: string; decimal: BoundaryDecimal | null }[];
  pnl: readonly { currency: string; decimal: BoundaryDecimal | null }[];
  health: string;
}

export function ownRows(items: readonly AlphaFleetItem[]): OwnRow[] {
  return items.slice(0, ROW_CAP).map((item) => ({
    alphaId: item.alphaId,
    label: item.alphaLabel,
    version: item.version,
    stages: item.stages.length > 0 ? item.stages : [item.stage],
    allocations: item.allocations.map((a) => ({ currency: a.currency, decimal: readMoney(a.value) })),
    pnl: item.positionPnl.map((p) => ({ currency: p.currency, decimal: readMoney(p.net) })),
    health: item.health,
  }));
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
