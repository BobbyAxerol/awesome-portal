/**
 * Importing a task file, as a reviewed plan rather than a replacement.
 *
 * The previous Import JSON read a file and called `replace()`: whatever the
 * board held was discarded and the file became the board. That is a data-loss
 * button wearing an import label, and it gave no warning and no preview.
 *
 * What this does instead:
 *
 *  - reads one documented shape, and says which shape it found;
 *  - judges every row on its own, so one bad row cannot sink the file and a
 *    bad row is never silently dropped — it is listed with the reason;
 *  - classifies each accepted row as NEW (lands in Backlog) or UPDATE (an id
 *    the board already has), so the count you approve is the count you get;
 *  - never deletes. A task absent from the file stays exactly where it is.
 */
import {
  TASK_ASSIGNEES,
  TASK_STATUSES,
  UNASSIGNED,
  isTaskAssignee,
  isTaskStatus,
  type Task,
  type TaskStatus,
} from "./task-model";

/** The one shape this importer documents, shown verbatim in the dialog. */
export const IMPORT_TEMPLATE = {
  tasks: [
    {
      id: "PLAT-014",
      title: "Wire the release dashboard to the live ledger",
      workstream: "Platform",
      phase: "P2",
      weeks: "W3–W4",
      priority: "P1",
      owner: "Data Platform",
      assignee: "stan",
      status: "Backlog",
      depends: ["PLAT-011"],
      notes: "Blocked until the ledger export lands.",
    },
  ],
} as const;

export interface ImportField {
  name: string;
  required: boolean;
  /** What the field accepts, in the words the dialog shows. */
  accepts: string;
  /** What happens when the row does not carry it. */
  fallback: string;
}

/**
 * The field contract, declared once and rendered by the dialog.
 *
 * Kept as data rather than prose so the documentation cannot drift from the
 * validator underneath it — both read this list.
 */
export const IMPORT_FIELDS: ImportField[] = [
  { name: "title", required: true, accepts: "text, 1–500 characters", fallback: "row is rejected" },
  { name: "id", required: false, accepts: "text, e.g. PLAT-014", fallback: "a new id is generated" },
  { name: "workstream", required: false, accepts: "text", fallback: `"General"` },
  { name: "phase", required: false, accepts: "text, e.g. P2", fallback: `"P0"` },
  { name: "weeks", required: false, accepts: "text, e.g. W3–W4", fallback: "empty" },
  { name: "priority", required: false, accepts: "text, e.g. P1", fallback: `"P1"` },
  { name: "owner", required: false, accepts: "team name, free text", fallback: `"${UNASSIGNED}"` },
  {
    name: "assignee",
    required: false,
    accepts: TASK_ASSIGNEES.join(" · "),
    fallback: `"${UNASSIGNED}"`,
  },
  {
    name: "status",
    required: false,
    accepts: TASK_STATUSES.join(" · "),
    fallback: `"Backlog"`,
  },
  { name: "depends", required: false, accepts: "list of ids, or one comma-separated string", fallback: "empty" },
  { name: "notes", required: false, accepts: "text, up to 8000 characters", fallback: "empty" },
];

export type ImportAction = "create" | "update";

/**
 * What an id that already exists is allowed to do.
 *
 * `new-only` is the default, and it is the default because of what the board
 * holds: the migration tasks are finished and marked Done on production. An
 * import meant to add next quarter's work must not be able to quietly rewrite
 * a completed record because two people picked the same id. In that mode a
 * colliding row is refused by name, and the fix — change the id — is in the
 * refusal.
 *
 * `upsert` stays available for the case it was built for: re-importing a file
 * you already imported, with corrections.
 */
export type ImportMode = "new-only" | "upsert";

export interface ImportAccepted {
  action: ImportAction;
  /** Row number in the file, 1-based — what the reader can actually look at. */
  row: number;
  task: Task;
  /** Present on `update`: what the board holds today, for the preview. */
  existingTitle?: string;
}

export interface ImportRejected {
  row: number;
  /** The row's own title or id when it has one, for pointing at it. */
  label: string;
  reason: string;
}

export interface ImportPlan {
  accepted: ImportAccepted[];
  rejected: ImportRejected[];
  /** Which documented shape the file used. */
  shape: "array" | "object";
}

export class ImportParseError extends Error {}

/**
 * The id prefixes the board already uses.
 *
 * Shown in the dialog so a file of new work can be given a prefix that cannot
 * collide with anything already recorded — which is cheaper than discovering
 * the collision from a refusal afterwards.
 */
export function usedIdPrefixes(tasks: Task[]): string[] {
  const prefixes = new Set<string>();
  for (const task of tasks) {
    const match = /^([A-Za-z]+)-/.exec(task.id);
    if (match) prefixes.add(match[1].toUpperCase());
  }
  return [...prefixes].sort();
}

function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Reads the file's top level.
 *
 * Both documented shapes are accepted — a bare array, and `{ "tasks": [...] }`
 * — because the second is what a person hand-writes and the first is what the
 * board's own Export produces. Anything else throws with the two shapes named,
 * rather than "invalid JSON", which tells nobody what to fix.
 */
export function readImportRows(text: string): { rows: unknown[]; shape: "array" | "object" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportParseError("That file is not valid JSON.");
  }
  if (Array.isArray(parsed)) return { rows: parsed, shape: "array" };
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
    return { rows: (parsed as { tasks: unknown[] }).tasks, shape: "object" };
  }
  throw new ImportParseError(
    'Expected either a list of tasks, or an object with a "tasks" list. This file is neither.',
  );
}

/**
 * Turns rows into a plan against the board as it stands.
 *
 * `nextId` is passed in rather than computed here so the caller can keep the
 * board's own numbering rule; ids handed out inside one file must not collide,
 * which is why generated ids are tracked as they are issued.
 */
export function buildImportPlan(
  rows: unknown[],
  existing: Task[],
  nextId: (workstream: string, taken: Set<string>) => string,
  shape: "array" | "object" = "object",
  mode: ImportMode = "new-only",
): ImportPlan {
  const byId = new Map(existing.map((task) => [task.id, task]));
  const taken = new Set(existing.map((task) => task.id));
  const seenInFile = new Set<string>();
  const accepted: ImportAccepted[] = [];
  const rejected: ImportRejected[] = [];

  rows.forEach((raw, index) => {
    const row = index + 1;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      rejected.push({ row, label: `Row ${row}`, reason: "Not a task object." });
      return;
    }
    const value = raw as Record<string, unknown>;
    const id = readText(value.id, "");
    const title = readText(value.title, "");
    const label = title || id || `Row ${row}`;

    if (!title) {
      rejected.push({ row, label, reason: "A task needs a title." });
      return;
    }
    if (id && seenInFile.has(id)) {
      rejected.push({ row, label, reason: `The file uses id ${id} more than once.` });
      return;
    }

    const assignee = readText(value.assignee, UNASSIGNED);
    if (!isTaskAssignee(assignee)) {
      // Named rather than coerced: an import that quietly reassigns somebody's
      // work is worse than one that refuses a row and says why.
      rejected.push({
        row,
        label,
        reason: `"${assignee}" is not one of ${TASK_ASSIGNEES.join(", ")}.`,
      });
      return;
    }

    const rawStatus = readText(value.status, "Backlog");
    if (!isTaskStatus(rawStatus)) {
      rejected.push({ row, label, reason: `"${rawStatus}" is not one of ${TASK_STATUSES.join(", ")}.` });
      return;
    }
    const status: TaskStatus = rawStatus;

    const workstream = readText(value.workstream, "General");
    const current = id ? byId.get(id) : undefined;
    if (current && mode === "new-only") {
      rejected.push({
        row,
        label,
        reason: `${id} already exists on the board ("${current.title}", ${current.status}). Give this task a different id, or switch to "Add and update".`,
      });
      return;
    }
    const resolvedId = id || nextId(workstream, taken);
    taken.add(resolvedId);
    if (id) seenInFile.add(id);

    accepted.push({
      action: current ? "update" : "create",
      row,
      existingTitle: current?.title,
      task: {
        id: resolvedId,
        title,
        workstream,
        phase: readText(value.phase, "P0"),
        weeks: readText(value.weeks, ""),
        priority: readText(value.priority, "P1"),
        owner: readText(value.owner, UNASSIGNED),
        assignee,
        status,
        depends: readList(value.depends),
        notes: readText(value.notes, ""),
        created: current?.created ?? "",
      },
    });
  });

  return { accepted, rejected, shape };
}

/** One line of plain English for the dialog's headline. */
export function describePlan(plan: ImportPlan): string {
  const created = plan.accepted.filter((entry) => entry.action === "create").length;
  const updated = plan.accepted.length - created;
  const parts: string[] = [];
  if (created) parts.push(`${created} new ${created === 1 ? "task" : "tasks"} into Backlog`);
  if (updated) parts.push(`${updated} existing ${updated === 1 ? "task" : "tasks"} updated`);
  if (plan.rejected.length) parts.push(`${plan.rejected.length} rejected`);
  return parts.length ? parts.join(" · ") : "Nothing to apply";
}
