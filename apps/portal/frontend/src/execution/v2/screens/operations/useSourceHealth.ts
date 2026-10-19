/**
 * Per-profile source health for the Operations "Source health" panel (OP-7).
 *
 * It is the same `source_health` the Overview prints, read from the
 * `operations` composition. The queue read carries only one integration word,
 * so without this the two screens told different stories (Overview: partial
 * x3, Operations: "nothing is assumed healthy"). One read per mount, no poll:
 * the panel is a summary, and a failed read leaves it saying so, never empty.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";

export interface SourceProfile {
  profile: string;
  state: string | null;
  reasonCode: string | null;
}

export type SourceHealthRead =
  | { phase: "loading" }
  | { phase: "unavailable" }
  | { phase: "ready"; profiles: readonly SourceProfile[] };

export function useSourceHealth(api: ExecutionApi, workspaceId?: string): SourceHealthRead {
  const [state, setState] = useState<SourceHealthRead>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    const unavailable = () => {
      if (live) setState({ phase: "unavailable" });
    };
    try {
      Promise.resolve(api.getOperationalComposition("operations", workspaceId ? { workspace_id: workspaceId } : undefined)).then(
        (result) => {
          if (!live) return;
          setState(result.ok ? { phase: "ready", profiles: result.value.sourceHealth.profiles } : { phase: "unavailable" });
        },
        unavailable,
      );
    } catch {
      unavailable();
    }
    return () => {
      live = false;
    };
  }, [api, workspaceId]);
  return state;
}

/** Profiles whose state is not AVAILABLE: what the summary line counts. */
export const partialProfiles = (profiles: readonly SourceProfile[]): number =>
  profiles.filter((p) => (p.state ?? "").toUpperCase() !== "AVAILABLE").length;
