import { BASE_TASKS_SEED, type SeedTask } from "@/content/seed";

export const TASK_STATUSES = ["Backlog", "Ready", "In Progress", "Validating", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Who a task can be assigned to.
 *
 * `owner` is a TEAM — "Trading + Risk", "SRE", "Data Platform" — and forty-two
 * existing tasks carry one. `assignee` is a PERSON, and the Portal declares
 * exactly three. They are separate fields because collapsing them would have
 * erased the team on every one of those tasks to make room for a name.
 *
 * Mirrors `TASK_ASSIGNEES` in the backend's `domain/constants.py`, which
 * refuses anything outside this list rather than quietly coercing it.
 */
export const UNASSIGNED = "Unassigned";
export const TASK_ASSIGNEES = [UNASSIGNED, "bobby", "stan", "thanhvuong"] as const;
export type TaskAssignee = (typeof TASK_ASSIGNEES)[number];

export function isTaskAssignee(value: string): value is TaskAssignee {
  return (TASK_ASSIGNEES as readonly string[]).includes(value);
}

export interface Task {
  id: string;
  title: string;
  workstream: string;
  phase: string;
  weeks: string;
  priority: string;
  /** The team accountable for the task. Free text, and often a pair. */
  owner: string;
  /** The person doing it. Always one of `TASK_ASSIGNEES`. */
  assignee: TaskAssignee;
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
  assignee: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  query: "",
  workstream: "",
  priority: "",
  phase: "",
  owner: "",
  assignee: "",
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
  const assignee = stringValue(value.assignee, UNASSIGNED);
  return {
    id: stringValue(value.id, fallbackId),
    title: stringValue(value.title, "Untitled task"),
    workstream: stringValue(value.workstream, "General"),
    phase: stringValue(value.phase),
    weeks: stringValue(value.weeks),
    priority: stringValue(value.priority, "P1"),
    owner: stringValue(value.owner, UNASSIGNED),
    /*
     * A record written before this field existed has no assignee, and
     * "Unassigned" is the truthful answer for it — not a guess. An
     * unrecognised name also lands here rather than being invented into the
     * roster; the import path refuses such rows out loud instead.
     */
    assignee: isTaskAssignee(assignee) ? assignee : UNASSIGNED,
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
  const haystack = [task.id, task.title, task.owner, task.assignee, task.workstream, task.weeks, task.notes, task.depends.join(" ")].join(" ").toLowerCase();
  return (
    (!query || haystack.includes(query)) &&
    (!filters.workstream || task.workstream === filters.workstream) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.phase || task.phase === filters.phase) &&
    (!filters.owner || task.owner === filters.owner) &&
    (!filters.assignee || task.assignee === filters.assignee)
  );
}

export function filteredTasks(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => taskMatches(task, filters));
}

export function optionValues(tasks: Task[], field: "workstream" | "priority" | "phase" | "owner" | "assignee"): string[] {
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
    owner: UNASSIGNED,
    assignee: UNASSIGNED,
    status,
    depends: [],
    notes: "",
    created: "",
  };
}

/**
 * How the board groups its lanes.
 *
 * `status` is the flat board — one row of status columns. The others add a
 * lane per value of a field the task schema already carries, so grouping never
 * introduces a second model of milestone, workstream or ownership.
 */
export const TASK_GROUPINGS = ["status", "milestone", "workstream", "owner", "assignee"] as const;
export type TaskGrouping = (typeof TASK_GROUPINGS)[number];

export const GROUPING_LABELS: Record<TaskGrouping, string> = {
  status: "Group by status",
  milestone: "Group by milestone",
  workstream: "Group by workstream",
  owner: "Group by owner",
  assignee: "Group by assignee",
};

/** Field each grouping reads, and what an empty value is called. */
const GROUPING_FIELD: Record<Exclude<TaskGrouping, "status">, { field: keyof Task; empty: string }> = {
  milestone: { field: "phase", empty: "No milestone" },
  workstream: { field: "workstream", empty: "No workstream" },
  owner: { field: "owner", empty: "No owner" },
  assignee: { field: "assignee", empty: "Unassigned" },
};

export interface MilestoneLane {
  /** Lane key; "" is the unassigned lane. */
  id: string;
  label: string;
  tasks: Task[];
  /** Progress counters, computed from real task status only. */
  total: number;
  done: number;
}

/**
 * Groups tasks into lanes by one of the fields the schema already carries.
 *
 * Tasks with no value are kept in an explicit "no …" lane rather than
 * dropped, so the lane counts always add up to the filtered total.
 */
export function groupLanes(tasks: Task[], grouping: Exclude<TaskGrouping, "status">): MilestoneLane[] {
  const { field, empty } = GROUPING_FIELD[grouping];
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const raw = task[field];
    const key = typeof raw === "string" ? raw.trim() : "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      // The unassigned lane sorts last; everything else is natural order, so
      // P2 precedes P10.
      if (a === b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    })
    .map(([id, laneTasks]) => ({
      id,
      label: id || empty,
      tasks: laneTasks,
      total: laneTasks.length,
      done: laneTasks.filter((task) => task.status === "Done").length,
    }));
}

/** Milestone lanes — the original v1 grouping, now one case of `groupLanes`. */
export function milestoneLanes(tasks: Task[]): MilestoneLane[] {
  return groupLanes(tasks, "milestone");
}

export function replaceTask(tasks: Task[], next: Task): Task[] {
  const index = tasks.findIndex((task) => task.id === next.id);
  if (index < 0) return [...tasks, next];
  return tasks.map((task) => (task.id === next.id ? next : task));
}
