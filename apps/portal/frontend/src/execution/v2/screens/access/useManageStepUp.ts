/**
 * The owner's step-up state for "Manage grants" (`GET /api/admin/step-up`, `portal.owner-step-up.v1`, the same read the Users screen
 * makes). It is asked only when the page may show the Manage grants tab (an owner who holds the manage capability); for anyone else
 * the read would be a 403 and the row says nothing about step-up. One read on mount, never polled, a late answer after unmount is
 * dropped. A failed read is `null`: no chip, never "required" by guess.
 */
import { useEffect, useState } from "react";

import { stepUp, type StepUpState } from "../../../../features/admin/accountApi";
import type { ManageStepUpState } from "./model";

export type ReadStepUp = () => Promise<StepUpState>;

export function useManageStepUp(enabled: boolean, read: ReadStepUp = stepUp.state): ManageStepUpState {
  const [state, setState] = useState<ManageStepUpState>(null);
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let cancelled = false;
    read().then(
      (value) => {
        if (!cancelled) setState(value.state);
      },
      () => {
        if (!cancelled) setState(null);
      },
    );
    return () => {
      cancelled = true;
    };
    // The reader is a seam, not a dependency: a new function each render must not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return state;
}
