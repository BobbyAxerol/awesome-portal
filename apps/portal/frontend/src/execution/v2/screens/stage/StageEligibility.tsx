/**
 * The caller's own ADVISORY stage-action eligibility, offered to the controls that are already off (FE-068).
 *
 * One provider above a stage screen reads `GET /governance/stage-action-eligibility` and hands the answer to the controls below through
 * `useStageActionReason(action, fallback)`, which returns the sentence a DISABLED control reads with. What this module will never do:
 *
 * - enable a control. The hook returns a string for `DockAction`'s `reason`; there is no boolean here and no way to read `eligible`
 *   as a switch. An `ELIGIBLE` verdict leaves the control's own reason exactly as it was, and the submit still goes through every
 *   current check and the server's own answer;
 * - make up a reason. A read that is missing (no provider), loading, failed, unreadable, or for another workspace answers `null`, and the
 *   control keeps today's generic reason;
 * - remember. The answer lives in this component's state only: it is asked again on mount, on a workspace switch, and when the window
 *   regains focus, a late answer for a workspace the screen has left is dropped, and nothing is cached across sessions, tabs or
 *   reloads (`observed_at_ms` is a Portal evaluation time, not a lease).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { StageAction, StageActionEligibility } from "../../readers/stageActionEligibility";
import { stageActionReason } from "./reasons";

const Eligibility = createContext<StageActionEligibility | null>(null);

export interface StageEligibilityProviderProps {
  api: ExecutionApi;
  /** The workspace the screen is for. Absent: the server resolves the caller's own. */
  workspaceId?: string;
  children: ReactNode;
}

/**
 * The read, as a hook: `null` until an answer for THIS workspace has been read, and again after a failed re-ask. `enabled: false`
 * reads nothing at all (a closed drawer asks nothing) and answers `null`.
 */
export function useStageActionEligibility(api: ExecutionApi, workspaceId?: string, enabled = true): StageActionEligibility | null {
  const [eligibility, setEligibility] = useState<StageActionEligibility | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const ask = useCallback(() => {
    // Single flight: a focus event while a read is out does not start a second one.
    if (inFlight.current) return;
    inFlight.current = true;
    const mine = generation.current;
    const done = (value: StageActionEligibility | null) => {
      // A late answer for a workspace the screen has left is nobody's, and it does not free the new read's slot.
      if (generation.current !== mine) return;
      inFlight.current = false;
      setEligibility(value);
    };
    try {
      Promise.resolve(api.getStageActionEligibility(workspaceId)).then(
        (result) => {
          if (!result.ok || result.value.kind !== "stage_action_eligibility") return done(null);
          const body = result.value.eligibility;
          // A body for another workspace than the one asked is not an answer.
          done(workspaceId !== undefined && workspaceId !== "" && body.workspaceId !== workspaceId ? null : body);
        },
        () => done(null),
      );
    } catch {
      done(null);
    }
  }, [api, workspaceId]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    setEligibility(null);
    if (!enabled) return undefined;
    ask();
    const onFocus = () => ask();
    window.addEventListener("focus", onFocus);
    return () => {
      generation.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [ask, enabled]);

  return eligibility;
}

export default function StageEligibilityProvider({ api, workspaceId, children }: StageEligibilityProviderProps) {
  const eligibility = useStageActionEligibility(api, workspaceId);
  return <Eligibility.Provider value={eligibility}>{children}</Eligibility.Provider>;
}

/** The eligibility a provider above holds, or `null` (no provider, loading, failed). For text only. */
export function useStageEligibility(): StageActionEligibility | null {
  return useContext(Eligibility);
}

/** `(action, fallback) => reason sentence`. Always returns a sentence; never a boolean. */
export function useStageReason(): (action: StageAction, fallback: string) => string {
  const eligibility = useContext(Eligibility);
  return useMemo(() => (action, fallback) => stageActionReason(eligibility, action, fallback), [eligibility]);
}
