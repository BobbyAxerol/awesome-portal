import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createV1,
  deleteV1,
  fetchLegacyCollection,
  listV1,
  moveTaskV1,
  patchV1,
  persistenceMode,
  putLegacy,
  replaceV1,
  transitionTaskV1,
  type ApiMode,
  type VersionedItem,
} from "@/lib/api";
import { LS_TASKS, storageGet, storageSet } from "@/lib/storage";
import { TASK_STATUSES, cloneTaskSeeds, normaliseTask, normaliseTasks, type Task, type TaskStatus } from "./task-model";

export interface TaskRecord {
  task: Task;
  version: number | null;
  position: number;
}

export class TaskSyncError extends Error {
  readonly conflict: boolean;

  constructor(message: string, conflict = false) {
    super(message);
    this.name = "TaskSyncError";
    this.conflict = conflict;
  }
}

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

function toRecord(entry: VersionedItem<Task>): TaskRecord {
  return { task: normaliseTask({ ...entry.item }), version: entry.version, position: entry.position };
}

function toRecords(tasks: Task[]): TaskRecord[] {
  return tasks.map((task, position) => ({ task, version: null, position }));
}

function orderedTasks(records: TaskRecord[]): Task[] {
  return [...records]
    .sort((left, right) => {
      const statusOrder = TASK_STATUSES.indexOf(left.task.status) - TASK_STATUSES.indexOf(right.task.status);
      return statusOrder || left.position - right.position || left.task.id.localeCompare(right.task.id);
    })
    .map((record) => record.task);
}

type TaskPatch = Pick<Task, "title" | "workstream" | "phase" | "weeks" | "priority" | "owner" | "notes" | "depends" | "created">;

function patchForTask(task: Task): TaskPatch {
  const { title, workstream, phase, weeks, priority, owner, notes, depends, created } = task;
  return { title, workstream, phase, weeks, priority, owner, notes, depends, created };
}

function sameTaskPatch(left: Task, right: Task): boolean {
  return JSON.stringify(patchForTask(left)) === JSON.stringify(patchForTask(right));
}

function moveRecords(records: TaskRecord[], taskId: string, nextStatus: TaskStatus, requestedPosition: number): TaskRecord[] {
  const target = records.find((record) => record.task.id === taskId);
  if (!target) return records;
  const oldStatus = target.task.status;
  const source = records
    .filter((record) => record.task.status === oldStatus && record.task.id !== taskId)
    .sort((left, right) => left.position - right.position || left.task.id.localeCompare(right.task.id));
  const destination = (nextStatus === oldStatus ? source : records.filter((record) => record.task.status === nextStatus))
    .sort((left, right) => left.position - right.position || left.task.id.localeCompare(right.task.id));
  destination.splice(Math.min(Math.max(0, requestedPosition), destination.length), 0, {
    ...target,
    task: { ...target.task, status: nextStatus },
  });
  return TASK_STATUSES.flatMap((status) => {
    const group = status === nextStatus ? destination : status === oldStatus ? source : records
      .filter((record) => record.task.status === status)
      .sort((left, right) => left.position - right.position || left.task.id.localeCompare(right.task.id));
    return group.map((record, position) => ({ ...record, position }));
  });
}

function errorMessage(error: unknown): TaskSyncError {
  if (error instanceof Error) {
    return new TaskSyncError(error.message, "code" in error && (error as { code?: string }).code === "version_conflict");
  }
  return new TaskSyncError("Không thể đồng bộ task. Hãy thử lại.");
}

export function useTasks(apiMode: ApiMode) {
  const mode = persistenceMode(apiMode);
  const initial = useMemo(() => toRecords(readStoredTasks()), []);
  const [records, setRecords] = useState<TaskRecord[]>(initial);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [syncError, setSyncError] = useState<TaskSyncError | null>(null);
  const [needsInitialization, setNeedsInitialization] = useState(false);
  /** Task ids whose move is in flight — the board shows these as pending. */
  const [pendingMoves, setPendingMoves] = useState<ReadonlySet<string>>(() => new Set());
  const recordsRef = useRef(records);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const writeLocal = useCallback((next: TaskRecord[]) => {
    setRecords(next);
    storageSet(LS_TASKS, JSON.stringify(orderedTasks(next)));
  }, []);

  const refresh = useCallback(async () => {
    if (mode === "local") return;
    setSyncState("loading");
    setSyncError(null);
    try {
      if (mode === "v1") {
        const items = await listV1<Task>("tasks");
        if (items.length) {
          writeLocal(items.map(toRecord));
          setNeedsInitialization(false);
        } else {
          // A v1 workspace must only receive browser data after an explicit
          // user decision.  Auto-importing on page load could overwrite a
          // newly provisioned shared workspace with an old browser snapshot.
          setNeedsInitialization(true);
        }
      } else {
        const collection = await fetchLegacyCollection("tasks");
        if (collection.initialized) writeLocal(toRecords(normaliseTasks(collection.items)));
        else await putLegacy("tasks", asLegacyRecords(orderedTasks(recordsRef.current)));
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

  const create = useCallback(async (task: Task) => {
    const current = recordsRef.current;
    const localRecord: TaskRecord = { task, version: null, position: current.filter((record) => record.task.status === task.status).length };
    if (mode === "v1" && needsInitialization) {
      throw new TaskSyncError("Server workspace trống. Hãy khởi tạo từ dữ liệu local trước khi chỉnh sửa.");
    }
    if (mode === "local") {
      writeLocal([...current, localRecord]);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        const created = await createV1<Task>("tasks", task);
        writeLocal([...current, toRecord(created)]);
      } else {
        const next = [...current, localRecord];
        writeLocal(next);
        await putLegacy("tasks", asLegacyRecords(orderedTasks(next)));
      }
      setSyncState("idle");
    } catch (error) {
      setSyncError(errorMessage(error));
      setSyncState("error");
      throw errorMessage(error);
    }
  }, [mode, needsInitialization, writeLocal]);

  const update = useCallback(async (task: Task) => {
    const current = recordsRef.current;
    const target = current.find((record) => record.task.id === task.id);
    if (!target) return create(task);
    if (mode === "v1" && needsInitialization) {
      throw new TaskSyncError("Server workspace trống. Hãy khởi tạo từ dữ liệu local trước khi chỉnh sửa.");
    }
    if (mode === "local") {
      writeLocal(current.map((record) => record.task.id === task.id ? { ...record, task } : record));
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        if (target.version === null) throw new TaskSyncError("Task chưa có phiên bản server; hãy tải lại.");
        let latest: VersionedItem<Task> = {
          item: target.task,
          version: target.version,
          position: target.position,
          created_at: "",
          updated_at: "",
          deleted_at: null,
        };
        if (!sameTaskPatch(target.task, task)) {
          latest = await patchV1<Task>("tasks", task.id, patchForTask(task), latest.version);
        }
        if (task.status !== target.task.status) {
          await transitionTaskV1<Task>(task.id, task.status, latest.version);
          writeLocal((await listV1<Task>("tasks")).map(toRecord));
        } else {
          writeLocal(current.map((record) => record.task.id === task.id ? toRecord(latest) : record));
        }
      } else {
        const next = current.map((record) => record.task.id === task.id ? { ...record, task } : record);
        writeLocal(next);
        await putLegacy("tasks", asLegacyRecords(orderedTasks(next)));
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [create, mode, needsInitialization, writeLocal]);

  const move = useCallback(async (taskId: string, status: TaskStatus, position: number) => {
    const current = recordsRef.current;
    const target = current.find((record) => record.task.id === taskId);
    if (!target) return;
    if (mode === "v1" && needsInitialization) {
      throw new TaskSyncError("Server workspace trống. Hãy khởi tạo từ dữ liệu local trước khi chỉnh sửa.");
    }
    // Optimistic: the card lands where it was dropped before the request goes
    // out. `snapshot` is captured verbatim so a failure restores exactly the
    // prior state — recomputing it on rollback would silently absorb whatever
    // else changed in between.
    const snapshot = current;
    const locallyMoved = moveRecords(current, taskId, status, position);
    writeLocal(locallyMoved);
    if (mode === "local") return;

    setPendingMoves((pending) => new Set(pending).add(taskId));
    setSyncState("saving");
    try {
      if (mode === "v1") {
        if (target.version === null) throw new TaskSyncError("Task chưa có phiên bản server; hãy tải lại.");
        await moveTaskV1<Task>(taskId, status, position, target.version);
        // The server owns positions across the whole column, so its list
        // replaces the optimistic guess once it arrives.
        const refreshed = await listV1<Task>("tasks");
        writeLocal(refreshed.map(toRecord));
      } else {
        await putLegacy("tasks", asLegacyRecords(orderedTasks(locallyMoved)));
      }
      setSyncState("idle");
    } catch (error) {
      writeLocal(snapshot);
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    } finally {
      setPendingMoves((pending) => {
        const next = new Set(pending);
        next.delete(taskId);
        return next;
      });
    }
  }, [mode, needsInitialization, writeLocal]);

  const remove = useCallback(async (taskId: string) => {
    const current = recordsRef.current;
    const target = current.find((record) => record.task.id === taskId);
    if (!target) return;
    if (mode === "v1" && needsInitialization) {
      throw new TaskSyncError("Server workspace trống. Hãy khởi tạo từ dữ liệu local trước khi chỉnh sửa.");
    }
    const next = current.filter((record) => record.task.id !== taskId);
    if (mode === "local") {
      writeLocal(next);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        if (target.version === null) throw new TaskSyncError("Task chưa có phiên bản server; hãy tải lại.");
        await deleteV1<Task>("tasks", taskId, target.version);
        writeLocal((await listV1<Task>("tasks")).map(toRecord));
      } else {
        await putLegacy("tasks", asLegacyRecords(orderedTasks(next)));
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

  const replace = useCallback(async (nextTasks: Task[]) => {
    const next = toRecords(nextTasks);
    if (mode === "local") {
      writeLocal(next);
      return;
    }
    setSyncState("saving");
    try {
      if (mode === "v1") {
        writeLocal((await replaceV1<Task>("tasks", nextTasks)).map(toRecord));
        setNeedsInitialization(false);
      }
      else {
        writeLocal(next);
        await putLegacy("tasks", asLegacyRecords(nextTasks));
      }
      setSyncState("idle");
    } catch (error) {
      const syncFailure = errorMessage(error);
      setSyncError(syncFailure);
      setSyncState("error");
      throw syncFailure;
    }
  }, [mode, writeLocal]);

  const reset = useCallback(() => replace(cloneTaskSeeds()), [replace]);

  return {
    tasks: orderedTasks(records),
    persistence: mode,
    syncState,
    syncError,
    needsInitialization,
    pendingMoves,
    refresh,
    create,
    update,
    move,
    remove,
    replace,
    reset,
  };
}
