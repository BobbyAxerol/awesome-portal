/**
 * W3 · the shell's side of the self-navigation read (FE-057/058). Lazy-mounted by `PortalShell` behind the raw env string, so a
 * flag-off build emits none of it.
 *
 * Renders nothing. It reads the signed-in session and the address (workspace and the selected ContextBar environment, Codex
 * Q2: never a union of environments), runs `useSelfNavigation`, and hands the shell two things (`SelfNavShellView`):
 *
 * - `tokens`: what a LIVE projection lists, added to the session's capabilities for LISTING by the shell (selfNavGate:
 *   the session part is never touched, the projection only adds entries, never an authority; nothing here is sent back to a
 *   server);
 * - `notice`: when the read expired or failed, the visible line "Navigation unavailable: <reason>" with a Retry control.
 *
 * ARIA and focus parity with the rail: the line is plain content inside the same `<nav>` landmark, the sentence is a polite
 * status, Retry is an ordinary button in the tab order. Nothing here moves focus: not on appearing, not on pressing Retry (the
 * control stays enabled and stays the same element while the read repeats, so focus is not dropped), not on the answer.
 */
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { useSession } from "../../../auth/session";
import { NO_SELF_NAV, type SelfNavShellView } from "../../../app/selfNavView";
import { EXECUTION_V2_SHELL } from "../flags";
import { parseUrlParams } from "../urlState";
import type { SelfNavigationPort } from "./selfNavigationPort";
import { useSelfNavigation } from "./useSelfNavigation";

import "../css/selfnav.css";

export const NAVIGATION_UNAVAILABLE = "Navigation unavailable:";

export function SelfNavigationNotice({ reason, busy, collapsed, onRetry }: { reason: string; busy: boolean; collapsed: boolean; onRetry: () => void }) {
  const sentence = `${NAVIGATION_UNAVAILABLE} ${reason}`;
  return (
    <div className="exec-selfnav" data-selfnav="unavailable" data-collapsed={collapsed}>
      {collapsed ? (
        <p className="sr-only" role="status">{sentence}</p>
      ) : (
        <p className="exec-selfnav-text" role="status">
          <span className="exec-selfnav-lead">{NAVIGATION_UNAVAILABLE}</span> {reason}{busy ? " Checking again." : ""}
        </p>
      )}
      <button
        type="button"
        className="exec-selfnav-retry"
        onClick={onRetry}
        aria-busy={busy}
        aria-label={collapsed ? `${sentence} Retry` : undefined}
        title={collapsed ? sentence : undefined}
      >
        Retry
      </button>
    </div>
  );
}

export interface SelfNavigationProps {
  onView: (view: SelfNavShellView) => void;
  /** Test seams. */
  enabled?: boolean;
  port?: SelfNavigationPort;
  now?: () => number;
}

export default function SelfNavigation({ onView, enabled = EXECUTION_V2_SHELL, port, now }: SelfNavigationProps): null {
  const { principal } = useSession();
  const { search } = useLocation();
  const url = useMemo(() => parseUrlParams(search).value, [search]);
  const view = useSelfNavigation({
    enabled,
    sessionKey: principal?.sessionId ?? null,
    workspaceId: url.workspace_id,
    environment: url.env,
    port,
    now,
  });

  const { unavailable, retry } = view;
  const tokens = view.gate.tokens;
  const notice = useMemo<SelfNavShellView["notice"]>(
    () => unavailable === null
      ? null
      : ({ collapsed }: { collapsed: boolean }): ReactNode => (
          <SelfNavigationNotice reason={unavailable.reason} busy={unavailable.busy} collapsed={collapsed} onRetry={retry} />
        ),
    [unavailable?.reason, unavailable?.busy, retry], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Layout effects: the shell re-renders before paint, so a new scope's first frame never carries the previous scope's tokens.
  useLayoutEffect(() => {
    onView(tokens.size === 0 && notice === null ? NO_SELF_NAV : { tokens, notice });
  }, [tokens, notice, onView]);
  useLayoutEffect(() => () => onView(NO_SELF_NAV), [onView]);
  return null;
}
