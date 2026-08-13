import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLegacy, putLegacy, type ApiMode } from "@/lib/api";
import { LS_PHASES, storageGet, storageSet } from "@/lib/storage";
import { cloneRoadmapSeeds, normalisePhases, type RoadmapPhase } from "./roadmap-model";

function readStoredPhases(): RoadmapPhase[] {
  const stored = storageGet(LS_PHASES);
  if (!stored) return cloneRoadmapSeeds();
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normalisePhases(parsed as Record<string, unknown>[]) : cloneRoadmapSeeds();
  } catch {
    return cloneRoadmapSeeds();
  }
}

function asLegacyRecords(phases: RoadmapPhase[]): Record<string, unknown>[] {
  return phases.map((phase) => ({ ...phase }));
}

export function useRoadmap(apiMode: ApiMode) {
  const [phases, setPhases] = useState<RoadmapPhase[]>(readStoredPhases);
  const current = useRef(phases);

  useEffect(() => {
    current.current = phases;
  }, [phases]);

  const replace = useCallback(
    (next: RoadmapPhase[]) => {
      setPhases(next);
      storageSet(LS_PHASES, JSON.stringify(next));
      if (apiMode === "api") void putLegacy("roadmap", asLegacyRecords(next)).catch(() => undefined);
    },
    [apiMode],
  );

  const reset = useCallback(() => replace(cloneRoadmapSeeds()), [replace]);

  useEffect(() => {
    if (apiMode !== "api") return;
    let active = true;
    void fetchLegacy("roadmap")
      .then((items) => {
        if (!active) return;
        if (items.length) {
          const next = normalisePhases(items);
          setPhases(next);
          storageSet(LS_PHASES, JSON.stringify(next));
          return;
        }
        return putLegacy("roadmap", asLegacyRecords(current.current));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiMode]);

  return { phases, replace, reset };
}
