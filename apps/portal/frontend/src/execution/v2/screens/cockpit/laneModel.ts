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
import type { ActorsV2, ApprovalV2, LatestOperationV2, LiveParentV2, PaperExitParentV2, R2ParentV2, SectionV2 } from "../../readers/governanceParents";
import { formatAsOf, readAsOf } from "../../boundary";import { holds, V2_CAPABILITY } from "../../shell/roleNav";
import type { InboxActor, InboxRowV2, InboxSlaV2 } from "./inboxRowV2";

/** The step-up offer rules (FE-015/060) live in `stepUp.ts`; the cockpit imports them from here with the rest of the model. */
export { STEP_UP_COPY, stepUpOffer, stepUpRefusalText, type StepUpOffer } from "./stepUp";

/* ── words that several files print ───────────────────────────────────────── */

/** The one reason every decision control carries (UXM-09: no decision write is built in S1). */
export const PREVIEW_REASON = "Preview · not recorded";

export const NOT_PUBLISHED = {
  criteria: "Not published",
  chart: "Not published",
  decisionCall: "Not published",
  lane: "Not published",
  stepUp: "Not published",
  /** The approver count and ladder: the queue row adds them with `creator`, `ladder` and `sla_due_at` (FE-030). */
  approvers: "Not published",
  /** The review clock (`sla_due_at`) on a row that has no SLA (FE-030). */
  clock: "Not published",
  /** The policy version of a request whose read did not carry one (FE-030, with the decision call). */
  policy: "Not published",
  /** The capital rows of an R2 review: no V2 parent carries them (FE-030, "what changes"). */
  capital: "Not published",
} as const;

/** `Not published (FE-xxx)` for a datum, from the id a V2 parent names for it. */
export function notPublishedFor(fe: string): string {
  void fe; // the request id is not copy; it stays with the code that asks for the datum
  return "Not published";
}

/** `17 Oct 09:14Z` (UTC) for an RFC3339 instant; the text as sent when it is not one; `null` when there is none. */
export function instantText(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const at = readAsOf(Date.parse(iso));
  return at === null ? iso : formatAsOf(at);
}

/** `4 Oct 2026 00:00Z`: the same instant with its year, for the dates a lineage prints beside dated ones (an expiry months away must say which year). */
export function instantWithYear(iso: string | null | undefined): string | null {
  const text = instantText(iso);
  if (text === null || typeof iso !== "string") return text;
  const year = new Date(Date.parse(iso)).getUTCFullYear();
  return Number.isFinite(year) ? text.replace(/^(\d{1,2} [A-Za-z]{3}) /, `$1 ${year} `) : text;
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

/**
 * Families the cockpit names that are not approval gates (RV-10, FE-034): no inbox row, no list route and no executor is published
 * for them. Each is SELECTABLE, and its panel reads only what the contract publishes (see `FamilyPanel`); a request control stays
 * disabled with one reason. `view=<id>` carries the selection in the URL.
 */
export const FAMILY_LANES = [
  { id: "archive", label: "Archive" },
  { id: "reactivation", label: "Reactivation" },
  { id: "capital", label: "Capital" },
] as const;
export type FamilyLane = (typeof FAMILY_LANES)[number]["id"];

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

/** The statuses the published `status` enum closes a request with. */
export const CLOSED_STATUSES: readonly string[] = ["APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"];

/**
 * `open` is PENDING or a row that carries no status; `closed` is one of the
 * published closing statuses; anything else is `unknown`. The enum is matched
 * exactly (no case folding, no trimming): a word this build has never seen is
 * not a decision, so the request stays in Open where someone can see it.
 */
export type RowStatusClass = "open" | "closed" | "unknown";

export function statusClassOf(row: InboxRowV2): RowStatusClass {
  if (row.status === null || row.status === "PENDING") return "open";
  return CLOSED_STATUSES.includes(row.status) ? "closed" : "unknown";
}

export function isClosedRow(row: InboxRowV2): boolean {
  return statusClassOf(row) === "closed";
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

/** The count as printed: never above the quorum ("3 of 2" reads as a broken page). A published count above it says how many were recorded. */
export function shownQuorum(met: number, required: number): string {
  return met > required ? `${required} of ${required} (${met} recorded)` : `${met} of ${required}`;
}

export function quorumText(met: number | null, required: number | null): string | null {
  return met !== null && required !== null ? `${shownQuorum(met, required)} approvers` : null;
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
  return { kind: "unknown", text: "Separation of duty: creator not published." };
}

/**
 * The separation-of-duty line for a V2 parent. The body publishes stored actor
 * ids and whether each is the viewer (`ActorsV2`), and its basis says they are
 * NOT a decision authorization, so this line states the facts and never says
 * "OK" or "you cannot decide": the server rechecks the rule when a decision is
 * planned. Without the section, the creator is `Not published (FE-030)`.
 */
export function separationOfDutyV2(actors: SectionV2<ActorsV2> | null): SodState {
  if (actors === null || actors.availability !== "AVAILABLE") {
    return { kind: "unknown", text: "Separation of duty: creator not published." };
  }
  const you = (flag: boolean | null) => (flag ? " (you)" : "");
  return {
    kind: "unknown",
    text: `Separation of duty is not stated by this read. Requested by ${actors.requesterUserId}${you(actors.viewerIsRequester)}, created by ${actors.artifactCreatorUserId}${you(actors.viewerIsArtifactCreator)}. The server rechecks it when a decision is planned.`,
  };
}

/** A stored actor id as the rail prints it: the id, and `(you)` only where the server said the viewer is that actor. */
export function actorText(id: string, isViewer: boolean | null): string {
  return isViewer ? `${id} (you)` : id;
}

/* ── decided today, lapse clocks, the runway (WP-E) ───────────────────────── */

/** `true` when the decision's UTC calendar day is the UTC day of `nowMs`. A decided_at that is not an instant is not "today". */
export function isDecidedToday(decidedAt: string, nowMs: number): boolean {
  const at = Date.parse(decidedAt);
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return false;
  return new Date(at).toISOString().slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10);
}

/** The decisions of the history read that were made today (UTC), in the order the server sent them (newest first). */
export function decidedToday(rows: readonly DecidedRow[], nowMs: number): DecidedRow[] {
  return rows.filter((row) => isDecidedToday(row.decidedAt, nowMs));
}

/** The runway's shared axis, in days. A drawing scale (the hi-fi's "0 to 45 d"), not a measure: a lapse past it is drawn at the end and says so. */
export const RUNWAY_AXIS_DAYS = 45;
export const RUNWAY_TICKS_DAYS: readonly number[] = [0, 7, 14, 30, 45];
const MINUTES_PER_DAY = 1440;

/**
 * Where a waiver stands against its lapse clock. The anchor is the register's own read time (`read_at`, "the anchor every due
 * display counts from"), never the browser clock. A waiver with no `due_at` closes by an event, and says so; it is not "never".
 */
export type LapseView =
  | { kind: "none"; phrase: string }
  | { kind: "unanchored"; phrase: string }
  | { kind: "lapsed"; minutes: number; phrase: string }
  | { kind: "ahead"; minutes: number; phrase: string; /** Share of the axis, 0..100; a lapse past the axis is 100 with `beyond`. */ offsetPct: number; beyond: boolean };

export const NO_CLOCK = "No clock · closes by event";

export function lapseView(dueAt: string | null, readAt: string | null): LapseView {
  if (dueAt === null) return { kind: "none", phrase: NO_CLOCK };
  const due = Date.parse(dueAt);
  const read = readAt === null ? Number.NaN : Date.parse(readAt);
  if (!Number.isFinite(due)) return { kind: "unanchored", phrase: "Lapse time is not a time this read can state" };
  if (!Number.isFinite(read)) return { kind: "unanchored", phrase: "Lapse time not counted: the read states no time" };
  const minutes = Math.trunc((due - read) / 60_000);
  if (minutes < 0) return { kind: "lapsed", minutes: -minutes, phrase: `lapsed ${formatMinutes(-minutes)} ago` };
  if (minutes === 0) return { kind: "ahead", minutes, phrase: "lapses now", offsetPct: 0, beyond: false };
  const axis = RUNWAY_AXIS_DAYS * MINUTES_PER_DAY;
  return { kind: "ahead", minutes, phrase: `lapses in ${formatMinutes(minutes)}`, offsetPct: Math.min(100, (minutes / axis) * 100), beyond: minutes > axis };
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
  | { kind: "live"; payload: LiveReviewPayload; backbone: GateR2Detail | null }
  /**
   * The V2 parent bodies a SCOPED_V2 workspace answers on the same routes. They
   * are their own kinds, not V1 objects with fields filled in: a V1-shaped value
   * built from a V2 body would carry claims the body never made.
   */
  | { kind: "r2v2"; parent: R2ParentV2 }
  | { kind: "exitv2"; parent: PaperExitParentV2 }
  | { kind: "livev2"; parent: LiveParentV2 };

export interface EvidenceSummary {
  creator: InboxActor | null;
  serverSod: "OK" | "VIOLATION" | null;
  quorumMet: number | null;
  quorumRequired: number | null;
  policyVersion: string | null;
  workspaceId: string | null;
  decided: { outcome: string; by: string; at: string } | null;
  /** The V2 parent's stored actor ids; `null` for V1 and Live reads, which carry none. */
  actors: SectionV2<ActorsV2> | null;
  /** The V2 parent's latest recorded plan (the approval to operation link); `null` for V1 and Live reads. */
  latestOperation: SectionV2<LatestOperationV2> | null;
}

const NONE: EvidenceSummary = {
  creator: null, serverSod: null, quorumMet: null, quorumRequired: null, policyVersion: null, workspaceId: null, decided: null, actors: null, latestOperation: null,
};

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
    actors: null,
    latestOperation: null,
  };
}

const DECISION_STATUSES: readonly ApprovalV2["status"][] = ["APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED"];

/**
 * What a V2 approval says for the rail. The stored actor ids are used only
 * when the parent publishes them (`actors`); `creator` stays `null` because a
 * V2 body has no username to compare, and the SoD line is `separationOfDutyV2`.
 * A decision is only reported for a status that is one (an EXPIRED request was
 * not decided), and its decider is named only when the actors section says who.
 */
function approvalSummary(
  approval: ApprovalV2,
  workspaceId: string,
  sections: { actors: SectionV2<ActorsV2> | null; latestOperation: SectionV2<LatestOperationV2> | null },
): EvidenceSummary {
  const { actors, latestOperation } = sections;
  const decider = actors !== null && actors.availability === "AVAILABLE" && actors.decidedByUserId !== null
    ? actorText(actors.decidedByUserId, actors.viewerIsDecidedBy)
    : NOT_PUBLISHED.decisionCall;
  const decided = approval.decidedAt !== null && DECISION_STATUSES.includes(approval.status)
    ? { outcome: approval.status, by: decider, at: new Date(approval.decidedAt).toISOString() }
    : null;
  return {
    ...NONE,
    quorumMet: approval.quorumMet,
    quorumRequired: approval.quorumRequired,
    policyVersion: approval.policyVersion,
    workspaceId,
    decided,
    actors,
    latestOperation,
  };
}

export function summarizeEvidence(data: EvidenceData | null): EvidenceSummary {
  if (data === null) return NONE;
  switch (data.kind) {
    case "r2v2":
    case "exitv2":
      return approvalSummary(data.parent.approval, data.parent.header.workspaceId, data.parent);
    case "livev2":
      return approvalSummary(data.parent.approval, data.parent.header.workspaceId, { actors: null, latestOperation: null });
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
        actors: null,
        latestOperation: null,
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
