/**
 * Authority, freshness and status badges — the labels that appear on every
 * Execution panel.
 *
 * These four exist together because they are the four things the spec refuses
 * to let a screen merge: who owns a number (Authority), how old it is
 * (Freshness), what a row's outcome was (Status), and what stage a deployment
 * is in (Environment). A single "health" badge would be smaller and would
 * destroy the distinction (spec §5.2, guide §6).
 */
import type {
  Authority,
  BrokerSync,
  Envelope,
  FreshnessState,
  OperationStatus,
  OrderStatus,
  PromotionStage,
  RuntimeState,
} from "../contracts";

/* -------------------------------------------------------------------------
 * Age formatting
 * ---------------------------------------------------------------------- */

/**
 * Compact age, e.g. `0.9s`, `4m`, `2h`, `3d`.
 *
 * Sub-minute ages keep one decimal because broker-sync freshness is argued
 * about in seconds, and rounding `0.9s` to `1s` erases the margin an operator
 * is actually reading.
 */
export function formatAge(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return null;
  if (seconds < 60) return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/* -------------------------------------------------------------------------
 * AuthorityBadge
 * ---------------------------------------------------------------------- */

/**
 * `AUTHORITY · as_of · age` on every data panel.
 *
 * Deliberately one tone for all four authorities: the hi-fi differentiates them
 * by the word, and a hue-coded authority would be invisible to a reader who
 * cannot separate the hues. DS §4's `--authority-*` colours are superseded here
 * — recorded as a delta in EXECUTION_SCALE_AND_REFINE.md.
 *
 * A DERIVED value without a formula version is rendered as a stated gap rather
 * than silently omitted, because guide §6 requires derived analytics to carry
 * their formula version and a missing one is a real finding.
 */
export function AuthorityBadge({ envelope }: { envelope: Envelope }) {
  const age = formatAge(envelope.ageSeconds);
  const derivedWithoutFormula = envelope.authority === "DERIVED" && !envelope.formulaVersion;

  // `as_of` is when the data was true; `readAt` is when we fetched it. The
  // contract pack is explicit that the connector must never present its own
  // read time as Trading System authority, so a missing as_of says so instead
  // of quietly borrowing readAt — otherwise a fast read of a two-hour-old row
  // renders as two seconds fresh.
  const parts: string[] = [envelope.asOf ?? "as_of not published"];
  if (age) parts.push(`age ${age}`);
  if (envelope.digest) parts.push(envelope.digest.slice(0, 19) + "…");
  if (envelope.formulaVersion) parts.push(envelope.formulaVersion);

  const title = [
    `Authority: ${envelope.authority}`,
    envelope.asOf ? `as_of ${envelope.asOf} (when the data was true)` : "as_of not published",
    envelope.readAt ? `read ${envelope.readAt} (connector read time, not authority)` : null,
    envelope.digest ? `digest ${envelope.digest}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <span className="exec-authority" data-authority={envelope.authority} title={title}>
      <span className="exec-authority-name">{envelope.authority}</span>
      <span className="exec-authority-meta">· {parts.join(" · ")}</span>
      {derivedWithoutFormula ? (
        <span className="exec-authority-missing"> · formula version not published</span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * FreshnessIndicator
 * ---------------------------------------------------------------------- */

const FRESHNESS_TEXT: Record<FreshnessState, string> = {
  OK: "fresh",
  AGING: "aging",
  STALE: "stale",
  PAUSED: "paused",
  UNKNOWN: "age unknown",
};

/**
 * Dot plus age. The threshold that produced the state lives in the venue
 * registry and is passed in already resolved — the client never decides what
 * "stale" means for a venue, because that is policy, not presentation.
 *
 * `PAUSED` renders as a hollow dot and says why: outside a venue's session the
 * clock is stopped, and showing STALE there would cry wolf every night.
 */
export function FreshnessIndicator({
  state,
  ageSeconds,
  reason,
}: {
  state: FreshnessState;
  ageSeconds?: number | null;
  /** Why the clock is in this state, e.g. `VN MARKET closed until 09:00 ICT`. */
  reason?: string;
}) {
  const age = formatAge(ageSeconds);
  return (
    <span className="exec-freshness" data-state={state} title={reason ?? FRESHNESS_TEXT[state]}>
      <span className="exec-freshness-dot" aria-hidden="true" />
      <span>
        {age ? `${age} · ` : ""}
        {FRESHNESS_TEXT[state]}
        {reason ? ` · ${reason}` : ""}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------
 * StatusChip
 * ---------------------------------------------------------------------- */

export type ChipTone = "good" | "bad" | "warn" | "mute" | "commissioned";

/**
 * Tone lookup for every status vocabulary that reaches a chip.
 *
 * The single rule encoded here: PARTIAL is never `good`. It appears in two
 * vocabularies (a partly-filled order, a partly-applied command) and in both it
 * means "some of what you asked for happened", which is a warning.
 */
const ORDER_TONE: Record<OrderStatus, ChipTone> = {
  INITIALIZED: "mute",
  SUBMITTED: "mute",
  ACCEPTED: "mute",
  REJECTED: "bad",
  // Refused by the risk authority. Same weight as a venue rejection: the order
  // did not happen and somebody decided that.
  DENIED: "bad",
  PENDING_UPDATE: "mute",
  PENDING_CANCEL: "mute",
  PARTIALLY_FILLED: "warn",
  FILLED: "good",
  CANCELED: "mute",
  EXPIRED: "mute",
  TRIGGERED: "mute",
};

const OPERATION_TONE: Record<OperationStatus, ChipTone> = {
  PLANNED: "mute",
  AWAITING_APPLY: "warn",
  APPLIED_UNVERIFIED: "warn",
  VERIFIED: "good",
  PARTIAL: "warn",
  FAILED: "bad",
};

const RUNTIME_TONE: Record<RuntimeState, ChipTone> = {
  ACTIVE: "good",
  REDUCING: "warn",
  HALTED: "mute",
  ARCHIVED: "mute",
};

const SYNC_TONE: Record<BrokerSync, ChipTone> = {
  OK: "good",
  STALE: "warn",
  MISMATCH: "bad",
  // The sync attempt itself failed. Bad rather than warn: we do not know the
  // broker's state at all, which is worse than knowing it and disagreeing.
  ERROR: "bad",
  UNKNOWN: "mute",
};

export function StatusChip({
  label,
  tone = "mute",
  title,
}: {
  label: string;
  tone?: ChipTone;
  title?: string;
}) {
  return (
    <span className="exec-chip" data-tone={tone} title={title}>
      {label}
    </span>
  );
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <StatusChip label={status} tone={ORDER_TONE[status]} />;
}

export function OperationStatusChip({ status }: { status: OperationStatus }) {
  const title =
    status === "APPLIED_UNVERIFIED" || status === "AWAITING_APPLY"
      ? "Accepted, not confirmed. 202 is not success."
      : undefined;
  return <StatusChip label={status} tone={OPERATION_TONE[status]} title={title} />;
}

/** One of the four fields. Never combine with stage, readiness or sync. */
export function RuntimeStateChip({ state }: { state: RuntimeState }) {
  return <StatusChip label={state} tone={RUNTIME_TONE[state]} />;
}

/** One of the four fields. `MISMATCH` suppresses broker-derived values. */
export function BrokerSyncChip({ sync }: { sync: BrokerSync }) {
  const title =
    sync === "MISMATCH"
      ? "Local and broker disagree. Broker-derived values are withheld until reconciled."
      : undefined;
  return <StatusChip label={`SYNC ${sync}`} tone={SYNC_TONE[sync]} title={title} />;
}

/* -------------------------------------------------------------------------
 * EnvironmentBadge
 * ---------------------------------------------------------------------- */

const STAGE_LABEL: Record<PromotionStage, string> = {
  PAPER_OBSERVATION: "PAPER",
  SANDBOX_VALIDATION: "SANDBOX",
  LIVE_CANARY: "LIVE · CANARY",
  LIVE_FULL: "LIVE",
};

/**
 * Promotion stage as an outline chip. Canary reads `LIVE · CANARY` rather than
 * `CANARY` because it IS live money (decision D2); shortening it would be the
 * one abbreviation on this surface that could cost real capital.
 */
export function EnvironmentBadge({ stage }: { stage: PromotionStage }) {
  return (
    <span className="exec-env" data-stage={stage} title={stage}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** Authority word only, for dense table headers that cannot fit the full badge. */
export function AuthorityWord({ authority }: { authority: Authority }) {
  return <span className="exec-authority-name">{authority}</span>;
}
