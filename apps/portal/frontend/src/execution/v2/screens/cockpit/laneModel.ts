/**
 * Cockpit model: lanes, lenses, who-is-who, SLA and quorum wording, keys.
 *
 * Pure on purpose. The components only draw what these functions answer, so the
 * rules that matter (a creator who is the signed-in person cannot decide; a
 * waiver is never a gate; a minute count is never rounded) are tested without a
 * DOM.
 */
import type { ConditionRow } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import type { LiveReviewPayload } from "../../../api/profileRead";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "../../../api/rows";
import type { ApprovalGate, DecidedRow } from "../../../screens/ApprovalInbox";
import { formatAsOf, readAsOf } from "../../boundary";
import { holds, V2_CAPABILITY } from "../../shell/roleNav";
import type { InboxActor, InboxRowV2, InboxSlaV2 } from "./inboxRowV2";

/* ── words that several files print ───────────────────────────────────────── */

/** The one reason every decision control carries (UXM-09: no decision write is built in S1). */
export const PREVIEW_REASON = "Preview · not recorded";

export const NOT_PUBLISHED = {
  criteria: "Not published (FE-028)",
  chart: "Not published (FE-029)",
  decisionCall: "Not published (FE-030)",
  lane: "Not published (FE-034)",
  stepUp: "Not published (FE-015)",
} as const;

/** `17 Oct 09:14Z` (UTC) for an RFC3339 instant; the text as sent when it is not one; `null` when there is none. */
export function instantText(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const at = readAsOf(Date.parse(iso));
  return at === null ? iso : formatAsOf(at);
}

/** A failed read is never "loading"; a port answer that says so is shown as unavailable. */
export function settledPanel(status: Exclude<PanelStatus, "ok">): Exclude<PanelStatus, "ok" | "loading"> {
  return status === "loading" ? "unavailable" : status;
}

/* ── lanes ────────────────────────────────────────────────────────────────── */

export const LANES = ["all", "r1", "r2", "exit", "live", "waiver"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_LABEL: Readonly<Record<Lane, string>> = {
  all: "All gates",
  r1: "R1",
  r2: "R2",
  exit: "Exit",
  live: "Live",
  waiver: "Waiver",
};

/** Lanes the cockpit will own and the backend has not published. Shown, never selectable. */
export const UNPUBLISHED_LANES = [
  { id: "archive", label: "Archive" },
  { id: "reactivation", label: "Reactivation" },
  { id: "capital", label: "Capital" },
] as const;

/** A gate lane whose evidence read exists. Waiver is a register, not a gate. */
export type EvidenceKind = "r1" | "r2" | "exit" | "live";

export const KIND_TAG: Readonly<Record<EvidenceKind, string>> = { r1: "R1", r2: "R2", exit: "EXIT", live: "LIVE" };

export function kindOfGate(gate: ApprovalGate): EvidenceKind {
  switch (gate) {
    case "R1":
      return "r1";
    case "R2":
      return "r2";
    case "PAPER_EXIT":
    case "SANDBOX_EXIT":
      return "exit";
    case "LIVE_GATE":
      return "live";
  }
}

export function laneOfGate(gate: ApprovalGate): Exclude<Lane, "all" | "waiver"> {
  return kindOfGate(gate);
}

/** The server view a lane asks for (`GET /governance/approvals?view=`); lanes narrow server-side, not in the browser. */
export function serverViewFor(lane: Exclude<Lane, "waiver">): string {
  switch (lane) {
    case "all":
      return "ALL";
    case "r1":
      return "R1";
    case "r2":
      return "R2";
    case "exit":
      return "EXIT_REVIEWS";
    case "live":
      return "LIVE_GATES";
  }
}

/* ── lenses ───────────────────────────────────────────────────────────────── */

export const LENSES = ["open", "needs", "yours", "closed"] as const;
export type Lens = (typeof LENSES)[number];
export const LENS_LABEL: Readonly<Record<Lens, string>> = { open: "Open", needs: "Needs you", yours: "Yours", closed: "Closed" };

/* ── who is who ───────────────────────────────────────────────────────────── */

/** Every identifier the session knows for the signed-in person. */
export interface Principal {
  userIds: readonly string[];
  username: string | null;
}

export const NO_PRINCIPAL: Principal = { userIds: [], username: null };

export function principalOf(input: { principalId?: string | null; userId?: string | null; username?: string | null }): Principal {
  const ids = [input.userId, input.principalId].filter((value): value is string => typeof value === "string" && value.length > 0);
  return { userIds: [...new Set(ids)], username: input.username && input.username.length > 0 ? input.username : null };
}

/**
 * Is this actor the signed-in person? `null` means "cannot tell" (nothing to
 * compare), which is not `false`: the rail says the creator is unknown instead
 * of declaring the separation of duty met.
 *
 * Any match counts as the same person. Where an id and a name disagree the
 * answer is "same", the safe direction for a rule that blocks self-approval.
 */
export function sameActor(actor: InboxActor | null, principal: Principal): boolean | null {
  if (actor === null) return null;
  let comparable = false;
  if (actor.userId !== null && principal.userIds.length > 0) {
    comparable = true;
    if (principal.userIds.includes(actor.userId)) return true;
  }
  if (actor.username !== null && principal.username !== null) {
    comparable = true;
    if (actor.username === principal.username) return true;
  }
  return comparable ? false : null;
}

/** The server marks a row `SELF` when the actor created it; that is as good as a creator match. */
export function isYours(row: InboxRowV2, principal: Principal): boolean {
  return row.inert === "SELF" || sameActor(row.creator, principal) === true || sameActor(row.requester, principal) === true;
}

export function isClosedRow(row: InboxRowV2): boolean {
  return row.status !== null && row.status !== "PENDING";
}

/* ── access ───────────────────────────────────────────────────────────────── */

export type CockpitAccess = { mode: "decisions" } | { mode: "own" } | { mode: "denied" };

/**
 * What the capability set opens. Role names are never read.
 * Any read beyond R1 means the full queue; R1 alone means the person's own
 * requests; no governance read at all is the D9 denied state.
 */
export function deriveAccess(capabilities: ReadonlySet<string>): CockpitAccess {
  const beyondR1 = { anyOf: [V2_CAPABILITY.governanceR2Read, V2_CAPABILITY.governanceLiveRead, V2_CAPABILITY.governanceCanaryRead] };
  if (holds(capabilities, beyondR1)) return { mode: "decisions" };
  if (holds(capabilities, { allOf: [V2_CAPABILITY.governanceR1Read] })) return { mode: "own" };
  return { mode: "denied" };
}

/* ── queue items ──────────────────────────────────────────────────────────── */

export type QueueItem =
  | { kind: "gate"; key: string; row: InboxRowV2 }
  | { kind: "decided"; key: string; row: DecidedRow }
  | { kind: "waiver"; key: string; row: ConditionRow };

/**
 * Gate and decided items for a lane and lens. Server order is kept (the read
 * is sorted by SLA); nothing here re-sorts. Waivers never appear in a gate
 * lane, and gates never appear in the waiver lane.
 */
export function gateItems(input: {
  rows: readonly InboxRowV2[];
  decided: readonly DecidedRow[];
  lane: Exclude<Lane, "waiver">;
  lens: Lens;
  principal: Principal;
}): QueueItem[] {
  const { rows, decided, lane, lens, principal } = input;
  const inLane = (gate: ApprovalGate) => lane === "all" || laneOfGate(gate) === lane;
  if (lens === "closed") {
    const closedHere: QueueItem[] = rows.filter((row) => inLane(row.gate) && isClosedRow(row)).map((row) => ({ kind: "gate", key: row.id, row }));
    const seen = new Set(closedHere.map((item) => item.key));
    const history: QueueItem[] = decided
      .filter((row) => inLane(row.gate) && !seen.has(row.id))
      .map((row) => ({ kind: "decided", key: row.id, row }));
    return [...closedHere, ...history];
  }
  return rows
    .filter((row) => inLane(row.gate) && !isClosedRow(row))
    .filter((row) => (lens === "needs" ? row.needsYou === true : lens === "yours" ? isYours(row, principal) : true))
    .map((row) => ({ kind: "gate", key: row.id, row }));
}

export function waiverItems(rows: readonly ConditionRow[]): QueueItem[] {
  return rows.map((row) => ({ kind: "waiver", key: row.conditionId, row }));
}

export function lensCounts(rows: readonly InboxRowV2[], lane: Exclude<Lane, "waiver">, principal: Principal): Record<Exclude<Lens, "closed">, number> {
  const open = gateItems({ rows, decided: [], lane, lens: "open", principal }).length;
  const needs = gateItems({ rows, decided: [], lane, lens: "needs", principal }).length;
  const yours = gateItems({ rows, decided: [], lane, lens: "yours", principal }).length;
  return { open, needs, yours };
}

/** The signed-in person's own requests, for the researcher view; rows whose ownership is not published are counted, not guessed. */
export function ownRequests(rows: readonly InboxRowV2[], principal: Principal): { own: InboxRowV2[]; unknownOwner: number } {
  const own: InboxRowV2[] = [];
  let unknownOwner = 0;
  for (const row of rows) {
    if (isYours(row, principal)) own.push(row);
    else if (row.creator === null && row.requester === null) unknownOwner += 1;
  }
  return { own, unknownOwner };
}

/* ── SLA and quorum, exactly as published ─────────────────────────────────── */

/** `125` is `2h 5m`, `240` is `4h`, `5` is `5m`. A decomposition, never a rounding. */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.trunc(total));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [days > 0 ? `${days}d` : null, hours > 0 ? `${hours}h` : null, rest > 0 ? `${rest}m` : null].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" ") : "0m";
}

export interface SlaView {
  phrase: string;
  /** The same wording with raw minutes, for the title and the rail. */
  detail: string;
  /** Share of the budget used, unrounded, capped at 100 for the bar. */
  fill: number;
  overdue: boolean;
  dueSoon: boolean;
}

/**
 * The verdict (`OVERDUE`, `DUE_SOON`) is the server's. The amounts are the
 * arithmetic of its own age and budget and are printed as published, not
 * rounded to hours.
 */
export function slaView(sla: InboxSlaV2 | null): SlaView | null {
  if (sla === null || sla.budgetMinutes <= 0) return null;
  const remaining = sla.budgetMinutes - sla.ageMinutes;
  const overdue = sla.state === "OVERDUE" || sla.state === "EXPIRED";
  const dueSoon = sla.state === "DUE_SOON";
  const phrase = remaining >= 0 ? (overdue ? "due now" : `${formatMinutes(remaining)} left`) : `${overdue ? "overdue" : "past budget"} ${formatMinutes(-remaining)}`;
  return {
    phrase,
    detail: `${sla.ageMinutes} of ${sla.budgetMinutes} min used`,
    fill: Math.min(100, (sla.ageMinutes / sla.budgetMinutes) * 100),
    overdue,
    dueSoon,
  };
}

export function quorumText(met: number | null, required: number | null): string | null {
  return met !== null && required !== null ? `${met} of ${required} approvers` : null;
}

/** Meter cells, capped so a large quorum cannot fill the pane; the text beside the meter always carries the true numbers. */
export const QUORUM_CELL_CAP = 12;

export function quorumCells(met: number | null, required: number | null): boolean[] {
  if (met === null || required === null || required <= 0 || required > QUORUM_CELL_CAP) return [];
  return Array.from({ length: required }, (_, index) => index < met);
}

/* ── separation of duty ───────────────────────────────────────────────────── */

export type SodState =
  | { kind: "violation"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "unknown"; text: string };

function actorLabel(actor: InboxActor): string {
  return actor.username ?? actor.userId ?? "unknown";
}

/**
 * Creator against the signed-in person first (it can say why), then the
 * server's own statement. A creator who is the signed-in person blocks, and the
 * sentence says so; nothing here ever reports "OK" for a creator it could not
 * read.
 */
export function separationOfDuty(input: { creator: InboxActor | null; serverSod: "OK" | "VIOLATION" | null; principal: Principal }): SodState {
  const { creator, serverSod, principal } = input;
  const same = sameActor(creator, principal);
  if (same === true) return { kind: "violation", text: "Separation of duty: you created this request, so you cannot decide it." };
  if (serverSod === "VIOLATION") return { kind: "violation", text: "Separation of duty: the server reports you may not decide this request." };
  if (same === false && creator !== null) {
    const me = principal.username ?? principal.userIds[0] ?? "you";
    return { kind: "ok", text: `Separation of duty OK · created by ${actorLabel(creator)}, you are ${me}` };
  }
  if (serverSod === "OK") return { kind: "ok", text: "Separation of duty OK (server statement); the creator is not published." };
  return { kind: "unknown", text: "Separation of duty: creator Not published (FE-030)." };
}

/* ── keys ─────────────────────────────────────────────────────────────────── */

/** J moves down, K moves up; nothing selected starts at the first or last row. Out of range stays put. */
export function stepSelection(keys: readonly string[], current: string | null, direction: "next" | "previous"): string | null {
  if (keys.length === 0) return null;
  const at = current === null ? -1 : keys.indexOf(current);
  if (at < 0) return direction === "next" ? keys[0] : keys[keys.length - 1];
  const target = direction === "next" ? at + 1 : at - 1;
  return target >= 0 && target < keys.length ? keys[target] : current;
}

export const DECISION_KEYS = { a: "Approve", r: "Deny", n: "Note" } as const;

/* ── what one evidence read gives the rail ────────────────────────────────── */

export type EvidenceData =
  | { kind: "r1"; detail: GateR1Detail }
  | { kind: "r2"; detail: GateR2Detail }
  | { kind: "exit"; detail: PaperExitDetail }
  | { kind: "live"; payload: LiveReviewPayload; backbone: GateR2Detail | null };

export interface EvidenceSummary {
  creator: InboxActor | null;
  serverSod: "OK" | "VIOLATION" | null;
  quorumMet: number | null;
  quorumRequired: number | null;
  policyVersion: string | null;
  workspaceId: string | null;
  decided: { outcome: string; by: string; at: string } | null;
}

const NONE: EvidenceSummary = { creator: null, serverSod: null, quorumMet: null, quorumRequired: null, policyVersion: null, workspaceId: null, decided: null };

function published(value: string | null | undefined): string | null {
  // V1's placeholders for a missing word are not words.
  return value && value !== "unknown" && value !== "unversioned" ? value : null;
}

function r2Summary(detail: GateR2Detail, workspaceId: string | null): EvidenceSummary {
  const author = published(detail.planAuthor);
  return {
    creator: author === null ? null : { userId: null, username: author },
    serverSod: detail.eligibility.separationOfDuties,
    quorumMet: detail.quorumMet,
    quorumRequired: detail.quorumRequired,
    policyVersion: published(detail.policyVersion),
    workspaceId: detail.workspaceId ?? workspaceId,
    decided: null,
  };
}

export function summarizeEvidence(data: EvidenceData | null): EvidenceSummary {
  if (data === null) return NONE;
  switch (data.kind) {
    case "r1": {
      const d = data.detail;
      const name = published(d.creator);
      return {
        creator: name === null && d.creatorId === null ? null : { userId: d.creatorId, username: name },
        serverSod: d.eligibility.separationOfDuties,
        quorumMet: d.quorumMet,
        quorumRequired: d.quorumRequired,
        policyVersion: published(d.policyVersion),
        workspaceId: d.workspaceId,
        decided: d.decided ? { outcome: d.decided.outcome, by: d.decided.by, at: d.decided.at } : null,
      };
    }
    case "r2":
      return r2Summary(data.detail, null);
    case "live":
      return data.backbone === null ? { ...NONE, workspaceId: data.payload.workspaceId } : r2Summary(data.backbone, data.payload.workspaceId);
    case "exit": {
      const d = data.detail;
      return { ...NONE, serverSod: d.eligibility.separationOfDuties, quorumMet: d.quorumMet, quorumRequired: d.quorumRequired, workspaceId: d.workspaceId };
    }
  }
}
