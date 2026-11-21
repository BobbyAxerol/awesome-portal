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

const stateOf = (p: SourceProfile): string => (p.state ?? "").trim().toUpperCase();

/** Profiles whose state is PARTIAL, and only those: another non-available state is not a partial one. */
export const partialProfiles = (profiles: readonly SourceProfile[]): number => profiles.filter((p) => stateOf(p) === "PARTIAL").length;

/**
 * The states that are neither AVAILABLE nor PARTIAL, each in its own words and counted ("2 unavailable"), in the
 * order first seen. A profile that states nothing is "state not stated": it is never relabelled partial or ok.
 */
export function otherStateCounts(profiles: readonly SourceProfile[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    const state = stateOf(p);
    if (state === "AVAILABLE" || state === "PARTIAL") continue;
    const word = state === "" ? "state not stated" : state.toLowerCase().replace(/_/g, " ");
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts].map(([word, count]) => ({ word, count }));
}

/** The summary line after "Source health": "2 of 5 partial", then " · 2 unavailable" for any other non-available state. */
export function sourceHealthSummary(profiles: readonly SourceProfile[]): string {
  const others = otherStateCounts(profiles).map(({ word, count }) => ` · ${count} ${word}`).join("");
  return `${partialProfiles(profiles)} of ${profiles.length} partial${others}`;
}
