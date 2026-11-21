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
import { reasonWords } from "../../api/governanceContext";
import { PanelState } from "../../components/states";
import { isSourcePending } from "../../soon";
import { captureReasonText } from "../screens/stage/reasons";
import { GapWhy } from "./notPublished";
import "../css/blocks.css";

interface StateBoundaryBase {
  /** Rendered when the status is `ok`, `partial` or `stale`. */
  children?: ReactNode;
  /** Optional controls under the state line (retry, a link to My access). */
  actions?: ReactNode;
  /** The screen's own name for the state, when it has a better one. */
  title?: string;
  /**
   * `partial`/`stale` with no reason: skip the generic "The source gave no
   * reason." state line and render the demoted body alone. For a screen that
   * already states the freshness itself (a chip in its header) and would
   * otherwise say it twice. The body is still marked demoted; a state that does
   * carry a reason, and every other status, is unaffected.
   */
  quiet?: boolean;
}

export type StateBoundaryProps = StateBoundaryBase &
  (
    | { status: "ok" }
    | { status: "loading" | "empty" | "insufficient_data" | "partial" | "stale"; reason?: string; lastGood?: ReactNode }
    | { status: "denied" | "unavailable" | "terminal"; reason: string; lastGood?: ReactNode }
  );

const REASON_CODE = /^([A-Z][A-Z0-9_]{5,})(?::\s*\1)?$/;

/**
 * A reason that is only a published code, said in the approved plain words (`STAGE_REASON_WHY` through `captureReasonText`, then the
 * governance dictionary) with the code kept for the disclosure. A reason that is already prose passes through as it came; a code with
 * no approved wording has no `text`: the state word stands alone and the code is behind the disclosure.
 */
export function plainReason(reason: string | undefined): { text: string | undefined; code: string | null } {
  const match = reason === undefined ? null : REASON_CODE.exec(reason.trim());
  if (match === null) return { text: reason, code: null };
  const code = match[1];
  const words = captureReasonText(code) ?? reasonWords(code);
  const text = words === null || words === code ? undefined : words.charAt(0).toUpperCase() + words.slice(1);
  return { text, code };
}

/** The panel body or the state that replaced it. */
export function StateBoundary(props: StateBoundaryProps) {
  if (props.status === "ok") return <>{props.children}</>;
  const { status, actions, title, children, quiet = false } = props;
  const lastGood = "lastGood" in props ? props.lastGood : undefined;
  const keepsBody = status === "partial" || status === "stale";
  // A state that keeps the body still owes the reader a sentence: a bare "Stale" says nothing.
  const given = "reason" in props ? props.reason : undefined;
  const silent = quiet && keepsBody && given === undefined && actions === undefined && lastGood === undefined;
  const reason = given === undefined && keepsBody ? "The source gave no reason." : given;
  // A published code is not for the reader: the state line says it in words and the code waits behind the "?" (RV-06).
  const plain = plainReason(reason);
  const soon = plain.code !== null && title === undefined && isSourcePending(plain.code) && (status === "unavailable" || status === "insufficient_data" || status === "empty");
  return (
    <div className="exec-blk-boundary" data-status={status}>
      {silent ? null : (
        <PanelState status={status} reason={plain.text} lastGood={lastGood} actions={actions} title={title ?? (soon ? "Soon" : undefined)} />
      )}
      {!silent && plain.code !== null ? <GapWhy name="Why, reason" rows={[plain.code]} /> : null}
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
