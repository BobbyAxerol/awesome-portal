/**
 * Panel states — DS §4g, required on every panel of every screen even where the
 * hi-fi draws only the happy path (DS §9 note 2).
 *
 * The reason each of these is separate: they are different claims about the
 * world. `empty` says the query ran and matched nothing. `unavailable` says we
 * could not ask. `denied` says you may not see it. `insufficient_data` says we
 * have rows but too few to compute honestly. Collapsing any pair of them into a
 * shared blank leaves the reader to guess, and every wrong guess here is a
 * wrong operational decision.
 */
import type { PanelStatus } from "../contracts";
import type { ReactNode } from "react";

const TITLE: Record<Exclude<PanelStatus, "ok">, string> = {
  loading: "Loading",
  empty: "Nothing to show",
  partial: "Partial",
  stale: "Stale",
  denied: "Withheld",
  unavailable: "Unavailable",
  insufficient_data: "Insufficient data",
  terminal: "Failed",
};

/**
 * Layout-stable skeleton.
 *
 * The blocks are shapes, not content, so they are hidden from the
 * accessibility tree and a single `role="status"` announces the word "loading".
 * A screen reader should hear that the panel is loading, not a description of
 * three grey rectangles.
 */
export function PanelSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="exec-skeleton">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="exec-skeleton-block" data-w="short" aria-hidden="true" />
      <div className="exec-skeleton-block" data-w="long" aria-hidden="true" />
      <div className="exec-skeleton-block" data-w="medium" aria-hidden="true" />
    </div>
  );
}

/**
 * A panel that cannot show its data, and says which kind of "cannot".
 *
 * `reason` is required for `denied`, `unavailable` and `terminal`: a withheld
 * panel with no stated reason is indistinguishable from a broken one, and the
 * role-lens contract (WF 5c) requires the required role to be named.
 *
 * `lastGood` renders a demoted last-known value for `stale` and `unavailable`.
 * It is deliberately shown rather than hidden — an operator can act on a number
 * they know is four minutes old, but not on a blank.
 */
export function PanelState({
  status,
  reason,
  lastGood,
  actions,
}: {
  status: Exclude<PanelStatus, "ok">;
  reason?: string;
  lastGood?: ReactNode;
  actions?: ReactNode;
}) {
  if (status === "loading") return <PanelSkeleton />;

  return (
    <div className="exec-state" data-status={status}>
      <span className="exec-state-title">{TITLE[status]}</span>
      {reason ? <span className="exec-state-reason">{reason}</span> : null}
      {lastGood ? <div className="exec-state-lastgood">{lastGood}</div> : null}
      {actions}
    </div>
  );
}

/**
 * The deliberate empty state for a screen or tab that is designed but not in
 * this slice. Dashed, named, and never backfilled with sample data — a
 * commissioned surface showing invented numbers is worse than one showing
 * nothing, because the numbers get believed.
 */
export function CommissionedPanel({ what, slice }: { what: string; slice?: string }) {
  return (
    <div className="exec-state" data-status="empty">
      <span className="exec-chip" data-tone="commissioned">
        COMMISSIONED
      </span>
      <span className="exec-state-reason">
        {what} is designed but not built in this slice{slice ? ` — ${slice}` : ""}. No sample data
        is shown here on purpose.
      </span>
    </div>
  );
}

/**
 * The honest-capping label required by the scale pass (M5).
 *
 * Any ranked or truncated list states its own truncation. `total` is exact —
 * at this system's cardinality an exact count is a millisecond query, so an
 * estimate would be a choice, not a constraint.
 */
export function CapNotice({
  shown,
  total,
  href,
  noun = "items",
}: {
  shown: number;
  total: number;
  href?: string;
  noun?: string;
}) {
  if (shown >= total) return null;
  return (
    <div className="exec-fixtures-caption">
      showing top {shown} of {total} {noun}
      {href ? (
        <>
          {" · "}
          <a className="exec-evidence-link" href={href}>
            view all
          </a>
        </>
      ) : null}
    </div>
  );
}
