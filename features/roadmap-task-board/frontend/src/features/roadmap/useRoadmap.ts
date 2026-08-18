import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createV1,
  deleteV1,
  fetchLegacyCollection,
  listV1,
  patchV1,
  persistenceMode,
  putLegacy,
  replaceV1,
  type ApiMode,
  type PersistenceMode,
  type VersionedItem,
} from "@/lib/api";
import { LS_PHASES, storageGet, storageSet } from "@/lib/storage";
import { cloneRoadmapSeeds, normalisePhase, normalisePhases, type RoadmapPhase } from "./roadmap-model";

export interface RoadmapRecord {
  phase: RoadmapPhase;
  version: number | null;
  position: number;
}

export class RoadmapSyncError extends Error {
  readonly conflict: boolean;

  constructor(message: string, conflict = false) {
    super(message);
    this.name = "RoadmapSyncError";
    this.conflict = conflict;
  }
}

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

function toRecord(entry: VersionedItem<RoadmapPhase>): RoadmapRecord {
  return { phase: normalisePhase({ ...entry.item }), version: entry.version, position: entry.position };
}

function toRecords(phases: RoadmapPhase[]): RoadmapRecord[] {
  return phases.map((phase, position) => ({ phase, version: null, position }));
}

function orderedPhases(records: RoadmapRecord[]): RoadmapPhase[] {
  return [...records]
    .sort((left, right) => left.position - right.position || left.phase.id.localeCompare(right.phase.id))
    .map((record) => record.phase);
}

type RoadmapPatch = Omit<RoadmapPhase, "id">;

function patchForPhase(phase: RoadmapPhase): RoadmapPatch {
  const { id: _id, ...patch } = phase;
  return patch;
}

function samePhasePatch(left: RoadmapPhase, right: RoadmapPhase): boolean {
  return JSON.stringify(patchForPhase(left)) === JSON.stringify(patchForPhase(right));
}

function errorMessage(error: unknown): RoadmapSyncError {
  if (error instanceof Error) {
    return new RoadmapSyncError(error.message, "code" in error && (error as { code?: string }).code === "version_conflict");
  }
  return new RoadmapSyncError("The roadmap could not be synced. Try again.");
}

export function useRoadmap(apiMode: ApiMode) {
  const mode = persistenceMode(apiMode);
  const initial = useMemo(() => toRecords(readStoredPhases()), []);
  const [records, setRecords] = useState<RoadmapRecord[]>(initial);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [syncError, setSyncError] = useState<RoadmapSyncError | null>(null);
  const [needsInitialization, setNeedsInitialization] = useState(false);
  const recordsRef = useRef(records);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const writeLocal = useCallback((next: RoadmapRecord[]) => {
    setRecords(next);
    storageSet(LS_PHASES, JSON.stringify(orderedPhases(next)));
  }, []);

  const refresh = useCallback(async () => {
    if (mode === "local") return;
    setSyncState("loading");
    setSyncError(null);
    try {
      if (mode === "v1") {
        const items = await listV1<RoadmapPhase>("roadmap");
        if (items.length) {
          writeLocal(items.map(toRecord));
          setNeedsInitialization(false);
        } else {
          // Importing a browser snapshot into a shared v1 workspace is an
          // explicit action, never a side effect of visiting this route.
          setNeedsInitialization(true);
        }
      } else {
        const collection = await fetchLegacyCollection("roadmap");
        if (collection.initialized) writeLocal(toRecords(normalisePhases(collection.items)));
        else await putLegacy("roadmap", asLegacyRecords(orderedPhases(recordsRef.current)));
        setNeedsInitialization(false);
      }
      setSyncState("idle");
    } catch (error) {
      setSyncError(errorMessage(error));
      setSyncState("error");
    }
  }, [mode, writeLocal]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async (phase: RoadmapPhase) => {
    const current = recordsRef.current;
    const localRecord: RoadmapRecord = { phase, version: null, position: current.length };
    if (mode === "v1" && needsInitialization) {
      throw new RoadmapSyncError("The server workspace is empty. Initialize it from local data before editing.");
    }
    if (mode === "local") {
      writeLocal([...current, localRecord]);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") writeLocal([...current, toRecord(await createV1<RoadmapPhase>("roadmap", phase))]);
      else {
        const next = [...current, localRecord];
        writeLocal(next);
        await putLegacy("roadmap", asLegacyRecords(orderedPhases(next)));
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [mode, needsInitialization, writeLocal]);

  const update = useCallback(async (phase: RoadmapPhase, previousId = phase.id) => {
    const current = recordsRef.current;
    const target = current.find((record) => record.phase.id === previousId);
    if (!target) return create(phase);
    if (mode === "v1" && needsInitialization) {
      throw new RoadmapSyncError("The server workspace is empty. Initialize it from local data before editing.");
    }
    if (previousId !== phase.id && mode === "v1") {
      throw new RoadmapSyncError("API v1 keeps a phase id immutable. Create a new phase and delete the old one.");
    }
    if (mode === "local") {
      writeLocal(current.map((record) => record.phase.id === previousId ? { ...record, phase } : record));
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        if (target.version === null) throw new RoadmapSyncError("This phase has no server version yet — reload.");
        if (samePhasePatch(target.phase, phase)) {
          writeLocal(current);
        } else {
          const updated = await patchV1<RoadmapPhase>("roadmap", previousId, patchForPhase(phase), target.version);
          writeLocal(current.map((record) => record.phase.id === previousId ? toRecord(updated) : record));
        }
      } else {
        const next = current.map((record) => record.phase.id === previousId ? { ...record, phase } : record);
        writeLocal(next);
        await putLegacy("roadmap", asLegacyRecords(orderedPhases(next)));
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [create, mode, needsInitialization, writeLocal]);

  const remove = useCallback(async (phaseId: string) => {
    const current = recordsRef.current;
    const target = current.find((record) => record.phase.id === phaseId);
    if (!target) return;
    if (mode === "v1" && needsInitialization) {
      throw new RoadmapSyncError("The server workspace is empty. Initialize it from local data before editing.");
    }
    const next = current.filter((record) => record.phase.id !== phaseId);
    if (mode === "local") {
      writeLocal(next);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        if (target.version === null) throw new RoadmapSyncError("This phase has no server version yet — reload.");
        await deleteV1<RoadmapPhase>("roadmap", phaseId, target.version);
        writeLocal((await listV1<RoadmapPhase>("roadmap")).map(toRecord));
      } else {
        await putLegacy("roadmap", asLegacyRecords(orderedPhases(next)));
        writeLocal(next);
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [mode, needsInitialization, writeLocal]);

  const replace = useCallback(async (nextPhases: RoadmapPhase[]) => {
    const next = toRecords(nextPhases);
    if (mode === "local") {
      writeLocal(next);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        writeLocal((await replaceV1<RoadmapPhase>("roadmap", nextPhases)).map(toRecord));
        setNeedsInitialization(false);
      }
      else {
        writeLocal(next);
        await putLegacy("roadmap", asLegacyRecords(nextPhases));
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [mode, writeLocal]);

  const reset = useCallback(() => replace(cloneRoadmapSeeds()), [replace]);

  return {
    phases: orderedPhases(records),
    persistence: mode as PersistenceMode,
    syncState,
    syncError,
    needsInitialization,
    refresh,
    create,
    update,
    remove,
    replace,
    reset,
  };
}
