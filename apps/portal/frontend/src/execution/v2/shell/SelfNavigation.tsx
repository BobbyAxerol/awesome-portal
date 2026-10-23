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
import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSession } from "../../../auth/session";
import { NO_SELF_NAV, type SelfNavShellView } from "../../../app/selfNavView";
import { EXECUTION_V2_SHELL } from "../flags";
import type { SelfContextCandidate } from "../readers/accessSelfContext";
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

/** Words of the chooser. NEW copy (not yet approved): recorded in the BE-P7 consumer receipt. */
export const WORKSPACE_CHOOSER = {
  lead: "Choose a workspace.",
  body: "You belong to more than one. Navigation loads once you choose.",
  group: "Workspaces",
  unaddressable: "This workspace id cannot be put in the address.",
} as const;

/** The address holds a workspace id of at most 128 characters without control characters (`urlState` workspace_id codec). */
export function canAddress(workspaceId: string): boolean {
  return workspaceId.length <= 128 && !/[\u0000-\u001f]/.test(workspaceId);
}

/**
 * The member has several workspaces and the Portal picked none (`AMBIGUOUS`): the candidates, in the order the Portal published
 * them, as plain buttons. Choosing one writes `workspace_id` into the address (the controller does that); nothing here ever chooses
 * for the member, and nothing is read until they do. Same landmark and focus rules as the notice: plain content inside the rail's
 * `<nav>`, ordinary buttons in the tab order, no focus moved on appearing.
 */
export function SelfNavigationChooser({ candidates, collapsed, onChoose }: { candidates: readonly SelfContextCandidate[]; collapsed: boolean; onChoose: (workspaceId: string) => void }) {
  const sentence = `${WORKSPACE_CHOOSER.lead} ${WORKSPACE_CHOOSER.body}`;
  return (
    <div className="exec-selfnav" data-selfnav="choose" data-collapsed={collapsed}>
      {collapsed ? (
        <p className="sr-only" role="status">{sentence}</p>
      ) : (
        <p className="exec-selfnav-text" role="status">
          <span className="exec-selfnav-lead">{WORKSPACE_CHOOSER.lead}</span> {WORKSPACE_CHOOSER.body}
        </p>
      )}
      <div className="exec-selfnav-choices" role="group" aria-label={WORKSPACE_CHOOSER.group}>
        {candidates.map((candidate) => {
          const addressable = canAddress(candidate.workspaceId);
          return (
            <button
              key={candidate.workspaceId}
              type="button"
              className="exec-selfnav-choice"
              onClick={() => onChoose(candidate.workspaceId)}
              disabled={!addressable}
              title={addressable ? candidate.workspaceId : WORKSPACE_CHOOSER.unaddressable}
              aria-label={addressable ? candidate.workspaceId : `${candidate.workspaceId}. ${WORKSPACE_CHOOSER.unaddressable}`}
            >
              {candidate.workspaceId}
            </button>
          );
        })}
      </div>
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
  const location = useLocation();
  const search = location.search;
  const navigate = useNavigate();
  const url = useMemo(() => parseUrlParams(search).value, [search]);
  const view = useSelfNavigation({
    enabled,
    sessionKey: principal?.sessionId ?? null,
    workspaceId: url.workspace_id,
    environment: url.env,
    port,
    now,
  });

  const { unavailable, retry, chooser, selfEntry } = view;
  const tokens = view.gate.tokens;
  // The member's choice goes into the address as `workspace_id` (the rest of the address kept) and is a new history entry, so Back returns to the chooser.
  const pathname = location.pathname;
  const choose = useCallback((workspaceId: string) => {
    const next = new URLSearchParams(search);
    next.set("workspace_id", workspaceId);
    navigate({ pathname, search: `?${next.toString()}` });
  }, [navigate, pathname, search]);
  const candidates = chooser?.candidates ?? null;
  const notice = useMemo<SelfNavShellView["notice"]>(
    () => candidates !== null
      ? ({ collapsed }: { collapsed: boolean }): ReactNode => <SelfNavigationChooser candidates={candidates} collapsed={collapsed} onChoose={choose} />
      : unavailable === null
        ? null
        : ({ collapsed }: { collapsed: boolean }): ReactNode => (
            <SelfNavigationNotice reason={unavailable.reason} busy={unavailable.busy} collapsed={collapsed} onRetry={retry} />
          ),
    [candidates, choose, unavailable?.reason, unavailable?.busy, retry], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const entryWorkspace = selfEntry?.workspaceId ?? null;
  const entry = useMemo(() => (entryWorkspace === null ? null : { workspaceId: entryWorkspace }), [entryWorkspace]);
  // Layout effects: the shell re-renders before paint, so a new scope's first frame never carries the previous scope's tokens.
  const resolvedWorkspace = view.resolvedWorkspaceId;
  useLayoutEffect(() => {
    onView(tokens.size === 0 && notice === null && entry === null && resolvedWorkspace === null ? NO_SELF_NAV : { tokens, notice, selfEntry: entry, workspaceId: resolvedWorkspace });
  }, [tokens, notice, entry, resolvedWorkspace, onView]);
  useLayoutEffect(() => () => onView(NO_SELF_NAV), [onView]);
  return null;
}
