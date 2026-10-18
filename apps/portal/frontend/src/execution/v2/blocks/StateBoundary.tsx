/**
 * StateBoundary: the six states every V2 panel must have, mapped to the shared
 * `PanelState` so the words match every other screen.
 *
 * - loading, empty, insufficient_data, denied, unavailable, terminal: the state
 *   replaces the body. They are different claims and keep different words.
 * - partial, stale: the data is real, so the body stays, under the state line,
 *   and is marked demoted. A partial or stale figure must not read as finished.
 * - ok: the body, nothing else.
 *
 * `denied`, `unavailable` and `terminal` require a reason: a withheld panel
 * with no reason is indistinguishable from a broken one.
 */
import type { ReactNode } from "react";

import type { PanelStatus } from "../../contracts";
import { PanelState } from "../../components/states";
import "../css/blocks.css";

interface StateBoundaryBase {
  /** Rendered when the status is `ok`, `partial` or `stale`. */
  children?: ReactNode;
  /** Optional controls under the state line (retry, a link to My access). */
  actions?: ReactNode;
  /** The screen's own name for the state, when it has a better one. */
  title?: string;
}

export type StateBoundaryProps = StateBoundaryBase &
  (
    | { status: "ok" }
    | { status: "loading" | "empty" | "insufficient_data" | "partial" | "stale"; reason?: string; lastGood?: ReactNode }
    | { status: "denied" | "unavailable" | "terminal"; reason: string; lastGood?: ReactNode }
  );

/** The panel body or the state that replaced it. */
export function StateBoundary(props: StateBoundaryProps) {
  if (props.status === "ok") return <>{props.children}</>;
  const { status, actions, title, children } = props;
  const reason = "reason" in props ? props.reason : undefined;
  const lastGood = "lastGood" in props ? props.lastGood : undefined;
  const keepsBody = status === "partial" || status === "stale";
  return (
    <div className="exec-blk-boundary" data-status={status}>
      <PanelState status={status} reason={reason} lastGood={lastGood} actions={actions} title={title} />
      {keepsBody && children ? (
        <div className="exec-blk-demoted" data-status={status}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface PanelGateProps {
  /** Any panel status; the gate picks the right `StateBoundary` shape. */
  status: PanelStatus;
  /** Why; when a status that needs one has none, the gate says no reason was published. */
  reason?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * `StateBoundary` for a status that arrives as a plain `PanelStatus` value
 * (the common case: it came off a read). Fills the reason that `denied`,
 * `unavailable` and `terminal` require, so a missing one is visible instead of
 * blank.
 */
export function PanelGate({ status, reason, actions, children }: PanelGateProps) {
  switch (status) {
    case "ok":
      return <>{children}</>;
    case "denied":
    case "unavailable":
    case "terminal":
      return <StateBoundary status={status} reason={reason ?? "No reason was published."} actions={actions} />;
    default:
      return (
        <StateBoundary status={status} reason={reason} actions={actions}>
          {children}
        </StateBoundary>
      );
  }
}

export type { PanelStatus };
