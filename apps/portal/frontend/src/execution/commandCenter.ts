/**
 * Phase 9 — Command Center snapshot reader (`execution.command-center-snapshot.v1`).
 *
 * Codex delivered this backend dark: `GET /api/v1/execution/command-center`
 * answers with real shapes and honest states, while the incident, operation
 * and fleet sources behind it are not claimed to be live. That distinction is
 * the whole design of this reader, so it is worth stating what it means here:
 * every field below is real, and none of it says the underlying system is.
 *
 * Four rules this file exists to keep, each of which is easy to break by
 * writing the obvious code instead:
 *
 *   1. **The ranking is the server's.** `TriageItem.rank` arrives ordered by
 *      `command-center.triage-rank.v1`. Sorting the array here — even by that
 *      same rank, even "just to be safe" — makes the browser a second ranking
 *      authority, and the first time the two disagree the screen is wrong in a
 *      way nobody can see. Items are rendered in the order they arrive.
 *   2. **`observed_total_count` is not a total.** When `exact_total` is false
 *      it is the number of items the server actually saw, which is a floor,
 *      not a count. It renders with a `~` and never as a plain figure.
 *   3. **Authority and freshness are per panel.** Four panels, four verdicts.
 *      Rolling them into one page-level badge is exactly the "global green
 *      flag" the master plan forbids.
 *   4. **`null` is a value.** A missing total renders as `—`. Rendering `0`
 *      for "we do not know" is the failure this whole cluster is built to
 *      avoid.
 */
import type { Authority, FreshnessState, PanelStatus } from "./contracts";

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export const TRIAGE_KINDS = ["INCIDENT", "APPROVAL", "OPERATION"] as const;
export type TriageKind = (typeof TRIAGE_KINDS)[number];

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SLA_STATES = ["OVERDUE", "DUE_SOON", "ON_TRACK", "NONE"] as const;
export type SlaState = (typeof SLA_STATES)[number];

export const FLEET_CODES = [
  "LIVE_FULL",
  "LIVE_CANARY",
  "SANDBOX",
  "PAPER",
  "BROKER_SYNC_ISSUES",
  "OPEN_FINDINGS",
] as const;
export type FleetCode = (typeof FLEET_CODES)[number];

export const TODAY_KINDS = ["REVIEW_DUE", "CONDITION_EXPIRY", "VERIFIED_OPERATION"] as const;
export type TodayKind = (typeof TODAY_KINDS)[number];

const AUTHORITIES = ["PORTAL", "EXECUTION", "BROKER", "DERIVED"] as const;
const FRESHNESS = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"] as const;

/**
 * The contract's five panel states, mapped onto the nine this cluster renders.
 *
 * `ready` is the only one that renames; the rest are the same word. An
 * unrecognised value maps to `unavailable` rather than to `ok`, because a state
 * we cannot read is not a state we can vouch for.
 */
const PANEL_STATE: Record<string, PanelStatus> = {
  ready: "ok",
  empty: "empty",
  partial: "partial",
  stale: "stale",
  unavailable: "unavailable",
};

export function readPanelState(raw: unknown): PanelStatus {
  const key = typeof raw === "string" ? raw : "";
  return PANEL_STATE[key] ?? "unavailable";
}

/** What every panel carries regardless of what it holds. */
export interface PanelHeader {
  state: PanelStatus;
  authority: Authority | null;
  asOf: string | null;
  freshness: FreshnessState | null;
}

function readHeader(o: Record<string, unknown>): PanelHeader {
  return {
    state: readPanelState(o.panel_state),
    authority: pick(o.authority, AUTHORITIES),
    asOf: str(o.as_of),
    freshness: pick(o.freshness_state, FRESHNESS),
  };
}

/**
 * How many there are, and how much of that number is a claim.
 *
 * `total` may be null and `exactTotal` may be false, and those are different
 * unknowns: the first is "we did not count", the second is "we counted what we
 * could see". `observed` is only meaningful in the second case.
 */
export interface Counts {
  exactTotal: boolean;
  total: number | null;
  observed: number | null;
  returned: number | null;
  truncated: boolean | null;
  limit: number | null;
}

function readCounts(o: Record<string, unknown>): Counts {
  return {
    // Deny-by-default: an absent flag is not an exact count.
    exactTotal: o.exact_total === true,
    total: int(o.total_count),
    observed: int(o.observed_total_count),
    returned: int(o.returned_count),
    truncated: typeof o.truncated === "boolean" ? o.truncated : null,
    limit: int(o.limit),
  };
}

/**
 * The one sentence a panel's counts are allowed to say.
 *
 * Built here rather than in the screen so all four panels phrase the same
 * uncertainty the same way, and so the `~` can never be dropped by a caller
 * formatting a number itself.
 */
export function countLabel(counts: Counts): string {
  const { exactTotal, total, observed, returned } = counts;
  if (exactTotal && total != null) {
    return returned != null && returned < total ? `${returned} of ${total}` : `${total}`;
  }
  if (observed != null) {
    // A floor, not a total. The tilde and the word "seen" both say so, because
    // the tilde alone is easy to read as rounding.
    return returned != null && returned < observed
      ? `${returned} of ~${observed} seen`
      : `~${observed} seen`;
  }
  // Never 0. "We did not count" is a different claim from "there are none".
  return "—";
}

export interface TriageItem {
  id: string;
  kind: TriageKind | null;
  title: string;
  summary: string;
  severity: Severity | null;
  slaState: SlaState | null;
  slaDueAt: string | null;
  authority: Authority | null;
  asOf: string | null;
  href: string | null;
  actionLabel: string | null;
  /** The server's position. Displayed, never used to sort. */
  rank: number | null;
  ageSeconds: number | null;
}

export interface NeedsYouPanel extends PanelHeader {
  counts: Counts;
  formulaVersion: string | null;
  items: readonly TriageItem[];
}

export interface FleetCell {
  code: FleetCode | null;
  label: string;
  /** `null` means unknown. It is rendered as `—`, never as 0. */
  value: number | null;
  href: string | null;
}

export interface FleetPanel extends PanelHeader {
  exactTotal: boolean;
  totalDeployments: number | null;
  cells: readonly FleetCell[];
}

export interface Pin {
  slot: number | null;
  entityId: string | null;
  label: string;
  href: string | null;
  /** What the pin points at, and whether it can be shown at all. */
  targetLabel: string | null;
  targetAvailable: boolean;
  targetAuthority: Authority | null;
  targetAsOf: string | null;
  targetFreshness: FreshnessState | null;
}

export interface PinnedPanel extends PanelHeader {
  total: number | null;
  limit: number | null;
  items: readonly Pin[];
}

export interface TodayItem {
  id: string;
  kind: TodayKind | null;
  label: string;
  scheduledAt: string | null;
  authority: Authority | null;
  href: string | null;
}

export interface TodayPanel extends PanelHeader {
  counts: Counts;
  items: readonly TodayItem[];
}

export interface CommandCenter {
  workspaceId: string | null;
  readAt: string | null;
  actorName: string | null;
  /** `BUSY` or `QUIET` — the greeting's own state, not a health verdict. */
  mode: string | null;
  deliveryProfile: string | null;
  /**
   * Dark by construction. Every identity field is published as null and
   * `streamAvailable` is false, which is what tells the screen to render no
   * EventSource control at all rather than a disabled one.
   */
  streamAvailable: boolean;
  /** Resume point, when the snapshot publishes one. Null while dark. */
  cursor: string | null;
  projectionEpoch: string | null;
  projectionSequence: number | null;
  needsYou: NeedsYouPanel | null;
  fleet: FleetPanel | null;
  pinned: PinnedPanel | null;
  today: TodayPanel | null;
  warnings: readonly { code: string; message: string }[];
}

function readTriageItem(raw: unknown): TriageItem | null {
  const o = obj(raw);
  const id = str(o?.id);
  if (!o || !id) return null;
  return {
    id,
    kind: pick(o.kind, TRIAGE_KINDS),
    title: str(o.title) ?? id,
    summary: str(o.summary) ?? "",
    severity: pick(o.severity, SEVERITIES),
    slaState: pick(o.sla_state, SLA_STATES),
    slaDueAt: str(o.sla_due_at),
    authority: pick(o.authority, AUTHORITIES),
    asOf: str(o.as_of),
    href: str(o.href),
    actionLabel: str(o.action_label),
    rank: int(o.rank),
    ageSeconds: int(o.age_seconds),
  };
}

export function readCommandCenter(raw: unknown): CommandCenter | null {
  const root = obj(raw);
  if (!root) return null;
  const panels = obj(root.panels);
  const snapshot = obj(root.snapshot);

  const needsRaw = obj(panels?.needs_you);
  const fleetRaw = obj(panels?.fleet_health);
  const pinnedRaw = obj(panels?.pinned_watchlist);
  const todayRaw = obj(panels?.today);

  return {
    workspaceId: str(root.workspace_id),
    readAt: str(root.read_at),
    actorName: str(obj(root.actor)?.username) ?? str(obj(root.actor)?.user_id),
    mode: str(root.mode),
    deliveryProfile: str(root.delivery_profile),
    // Absent is not available. A stream nobody published is not a stream.
    streamAvailable: snapshot?.stream_available === true,
    // Null throughout revision 2 by construction — the dark snapshot publishes
    // no identity. Read anyway, because the day it does the transport needs
    // exactly these three and nothing else in this file would carry them.
    cursor: str(snapshot?.cursor),
    projectionEpoch: str(snapshot?.projection_epoch),
    projectionSequence: int(snapshot?.projection_sequence),
    needsYou: needsRaw
      ? {
          ...readHeader(needsRaw),
          counts: readCounts(needsRaw),
          formulaVersion: str(needsRaw.formula_version),
          // Order preserved. See rule 1 at the top of this file.
          items: (Array.isArray(needsRaw.items) ? needsRaw.items : [])
            .map(readTriageItem)
            .filter((i): i is TriageItem => i !== null),
        }
      : null,
    fleet: fleetRaw
      ? {
          ...readHeader(fleetRaw),
          exactTotal: fleetRaw.exact_total === true,
          totalDeployments: int(fleetRaw.total_deployments),
          cells: (Array.isArray(fleetRaw.cells) ? fleetRaw.cells : []).flatMap((c) => {
            const o = obj(c);
            if (!o) return [];
            const code = pick(o.code, FLEET_CODES);
            return [
              {
                code,
                label: str(o.label) ?? code ?? "",
                value: int(o.value),
                href: str(o.href),
              },
            ];
          }),
        }
      : null,
    pinned: pinnedRaw
      ? {
          ...readHeader(pinnedRaw),
          total: int(pinnedRaw.total_count),
          limit: int(pinnedRaw.limit),
          items: (Array.isArray(pinnedRaw.items) ? pinnedRaw.items : []).flatMap((p) => {
            const o = obj(p);
            if (!o) return [];
            return [
              {
                slot: int(o.slot),
                entityId: str(o.entity_id),
                label: str(o.label) ?? str(o.entity_id) ?? "",
                href: str(o.href),
                targetLabel: str(o.target_label),
                // Only the literal "available" is available.
                targetAvailable: o.target_state === "available",
                targetAuthority: pick(o.target_authority, AUTHORITIES),
                targetAsOf: str(o.target_as_of),
                targetFreshness: pick(o.target_freshness_state, FRESHNESS),
              },
            ];
          }),
        }
      : null,
    today: todayRaw
      ? {
          ...readHeader(todayRaw),
          counts: readCounts(todayRaw),
          items: (Array.isArray(todayRaw.items) ? todayRaw.items : []).flatMap((t) => {
            const o = obj(t);
            const id = str(o?.id);
            if (!o || !id) return [];
            return [
              {
                id,
                kind: pick(o.kind, TODAY_KINDS),
                label: str(o.label) ?? id,
                scheduledAt: str(o.scheduled_at),
                authority: pick(o.authority, AUTHORITIES),
                href: str(o.href),
              },
            ];
          }),
        }
      : null,
    warnings: (Array.isArray(root.warnings) ? root.warnings : []).flatMap((w) => {
      const o = obj(w);
      const code = str(o?.code);
      return code ? [{ code, message: str(o?.message) ?? "" }] : [];
    }),
  };
}

/* ---------------------------------------------------------------------------
 * B10 — the activation seam
 * ------------------------------------------------------------------------ */

/**
 * The route the Command Centre stream is served on.
 *
 * `realtime.controller.ts` mounts it and proxies upstream. It exists, it is
 * reachable, and that is precisely why the check below has to be explicit:
 * "the route is there" is not "the stream is published".
 */
export const COMMAND_CENTER_STREAM = "/api/v1/execution/command-center/stream";

export interface StreamGate {
  allowed: boolean;
  /** What the screen tells the operator. Never blank. */
  reason: string;
}

/**
 * May this snapshot's stream be opened?
 *
 * Codex's stop gates say it plainly: do not create an EventSource while
 * `stream_available=false`. Every published fixture carries false today, so the
 * honest state of this screen is snapshot-only — and the point of this function
 * is that flipping the flag is the ONLY thing that changes that. No delivery
 * policy, no local override and no retry loop can talk its way past it.
 *
 * The other two conditions are the reducer's preconditions rather than
 * permissions: a stream resumes from a cursor inside an epoch, and without
 * either there is nothing to resume from. They are reported separately because
 * "not published yet" and "we hold no resume point" call for different things
 * from whoever is reading.
 */
export function streamGate(snapshot: CommandCenter | null): StreamGate {
  if (!snapshot) {
    return { allowed: false, reason: "No snapshot has been read, so there is nothing to resume from." };
  }
  if (!snapshot.streamAvailable) {
    return {
      allowed: false,
      // Deliberately not "live updates are off" — that sounds like a setting.
      // The stream is not published for this profile, and no control here
      // changes that.
      reason:
        "This profile publishes no live stream — snapshot only; reload to re-read.",
    };
  }
  return { allowed: true, reason: "The stream is published for this profile." };
}
