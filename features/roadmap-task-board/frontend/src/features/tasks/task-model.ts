import { BASE_TASKS_SEED, type SeedTask } from "@/content/seed";

export const TASK_STATUSES = ["Backlog", "Ready", "In Progress", "Validating", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  workstream: string;
  phase: string;
  weeks: string;
  priority: string;
  owner: string;
  status: TaskStatus;
  depends: string[];
  notes: string;
  created: string;
}

export interface TaskFilters {
  query: string;
  workstream: string;
  priority: string;
  phase: string;
  owner: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  query: "",
  workstream: "",
  priority: "",
  phase: "",
  owner: "",
};

const TASK_PREFIXES: Record<string, string> = {
  Acquisition: "ACQ",
  Security: "SEC",
  "Historical Data": "DATA",
  QuantBT: "QBT",
  "Alpha Runtime": "ALPHA",
  "Streaming Data": "STREAM",
  "Trading System": "TRD",
  Monitoring: "MON",
  Operations: "OPS",
  "Manager Platform": "MGR",
  Platform: "PLAT",
  "Stakeholder Reporting": "REPT",
  Reporting: "REPT",
  "Live Certification": "LIVE",
};

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/** Converts legacy/API records without changing their persisted schema. */
export function normaliseTask(value: Record<string, unknown>, fallbackId = "TASK-001"): Task {
  const status = stringValue(value.status, "Backlog");
  return {
    id: stringValue(value.id, fallbackId),
    title: stringValue(value.title, "Untitled task"),
    workstream: stringValue(value.workstream, "General"),
    phase: stringValue(value.phase),
    weeks: stringValue(value.weeks),
    priority: stringValue(value.priority, "P1"),
    owner: stringValue(value.owner, "Unassigned"),
    status: isTaskStatus(status) ? status : "Backlog",
    depends: listValue(value.depends),
    notes: stringValue(value.notes),
    created: stringValue(value.created),
  };
}

export function normaliseTasks(items: Record<string, unknown>[]): Task[] {
  return items.map((item, index) => normaliseTask(item, `TASK-${String(index + 1).padStart(3, "0")}`));
}

export function cloneTaskSeeds(seed: SeedTask[] = BASE_TASKS_SEED): Task[] {
  return normaliseTasks(seed.map((task) => ({ ...task })));
}

export function taskMatches(task: Task, filters: TaskFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  const haystack = [task.id, task.title, task.owner, task.workstream, task.weeks, task.notes, task.depends.join(" ")].join(" ").toLowerCase();
  return (
    (!query || haystack.includes(query)) &&
    (!filters.workstream || task.workstream === filters.workstream) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.phase || task.phase === filters.phase) &&
    (!filters.owner || task.owner === filters.owner)
  );
}

export function filteredTasks(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => taskMatches(task, filters));
}

export function optionValues(tasks: Task[], field: "workstream" | "priority" | "phase" | "owner"): string[] {
  return [...new Set(tasks.map((task) => task[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function nextTaskId(tasks: Task[], workstream: string): string {
  const prefix = TASK_PREFIXES[workstream] ?? (workstream.trim() ? workstream.trim().slice(0, 4).toUpperCase() : "TASK");
  let largest = 0;
  const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}-0*(\\d+)$`);
  for (const task of tasks) {
    const match = matcher.exec(task.id);
    if (match) largest = Math.max(largest, Number(match[1]));
  }
  return `${prefix}-${String(largest + 1).padStart(3, "0")}`;
}

export function taskDraft(status: TaskStatus = "Backlog"): Task {
  return {
    id: "",
    title: "",
    workstream: "General",
    phase: "",
    weeks: "",
    priority: "P1",
    owner: "Unassigned",
    status,
    depends: [],
    notes: "",
    created: "",
  };
}

/** How the board groups its columns. */
export type TaskGrouping = "status" | "milestone";

export interface MilestoneLane {
  /** Milestone key; "" is the unassigned lane. */
  id: string;
  label: string;
  tasks: Task[];
  /** Progress counters, computed from real task status only. */
  total: number;
  done: number;
}

/**
 * Groups tasks into milestone lanes.
 *
 * `phase` is the milestone field the task schema already carries; grouping
 * does not introduce a second one. Tasks without a phase are kept in an
 * explicit "chưa gán milestone" lane rather than dropped, so the lane counts
 * always add up to the filtered total.
 */
export function milestoneLanes(tasks: Task[]): MilestoneLane[] {
  const byPhase = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.phase.trim();
    const bucket = byPhase.get(key);
    if (bucket) bucket.push(task);
    else byPhase.set(key, [task]);
  }

  return [...byPhase.entries()]
    .sort(([a], [b]) => {
      // The unassigned lane sorts last; everything else is natural order.
      if (a === b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    })
    .map(([id, laneTasks]) => ({
      id,
      label: id || "Chưa gán milestone",
      tasks: laneTasks,
      total: laneTasks.length,
      done: laneTasks.filter((task) => task.status === "Done").length,
    }));
}

export function replaceTask(tasks: Task[], next: Task): Task[] {
  const index = tasks.findIndex((task) => task.id === next.id);
  if (index < 0) return [...tasks, next];
  return tasks.map((task) => (task.id === next.id ? next : task));
}
