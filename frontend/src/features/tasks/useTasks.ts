import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLegacy, putLegacy, type ApiMode } from "@/lib/api";
import { LS_TASKS, storageGet, storageSet } from "@/lib/storage";
import { cloneTaskSeeds, normaliseTasks, type Task } from "./task-model";

function readStoredTasks(): Task[] {
  const stored = storageGet(LS_TASKS);
  if (!stored) return cloneTaskSeeds();
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normaliseTasks(parsed as Record<string, unknown>[]) : cloneTaskSeeds();
  } catch {
    return cloneTaskSeeds();
  }
}

function asLegacyRecords(tasks: Task[]): Record<string, unknown>[] {
  return tasks.map((task) => ({ ...task }));
}

export function useTasks(apiMode: ApiMode) {
  const [tasks, setTasks] = useState<Task[]>(readStoredTasks);
  const current = useRef(tasks);

  useEffect(() => {
    current.current = tasks;
  }, [tasks]);

  const replace = useCallback(
    (next: Task[]) => {
      setTasks(next);
      storageSet(LS_TASKS, JSON.stringify(next));
      if (apiMode === "api") void putLegacy("tasks", asLegacyRecords(next)).catch(() => undefined);
    },
    [apiMode],
  );

  const reset = useCallback(() => replace(cloneTaskSeeds()), [replace]);

  useEffect(() => {
    if (apiMode !== "api") return;
    let active = true;
    void fetchLegacy("tasks")
      .then((items) => {
        if (!active) return;
        if (items.length) {
          const next = normaliseTasks(items);
          setTasks(next);
          storageSet(LS_TASKS, JSON.stringify(next));
          return;
        }
        return putLegacy("tasks", asLegacyRecords(current.current));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiMode]);

  return { tasks, replace, reset };
}
