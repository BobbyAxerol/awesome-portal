/**
 * Importing a task file.
 *
 * The claims worth defending are the ones the old importer got wrong: it
 * replaced the board wholesale, and it rejected a whole file for one bad row
 * without saying which row. So: nothing is deleted, every row is judged on its
 * own, and a refusal names the row and the reason.
 *
 * The collision rule is the one that matters most here. The board's migration
 * tasks are finished and marked Done on production, so by default a row whose
 * id already exists is REFUSED rather than allowed to rewrite that record;
 * upsert is opt-in, for re-importing a file you already imported.
 */
import { describe, expect, it } from "vitest";

import {
  buildImportPlan,
  describePlan,
  readImportRows,
  ImportParseError,
  IMPORT_FIELDS,
  usedIdPrefixes,
} from "@/features/tasks/taskImport";
import { TASK_ASSIGNEES, normaliseTask, type Task } from "@/features/tasks/task-model";

const nextId = (workstream: string, taken: Set<string>) => {
  let n = 1;
  while (taken.has(`GEN-${n}`)) n += 1;
  return `GEN-${n}`;
};

const board = (): Task[] => [
  normaliseTask({ id: "PLAT-001", title: "Existing task", workstream: "Platform", status: "Done", owner: "SRE" }),
];

describe("reading the file", () => {
  it("accepts a bare array and an object with a tasks list, and says which", () => {
    expect(readImportRows('[{"title":"a"}]').shape).toBe("array");
    expect(readImportRows('{"tasks":[{"title":"a"}]}').shape).toBe("object");
  });

  it("names both shapes when the file is neither, rather than saying 'invalid'", () => {
    expect(() => readImportRows('{"items":[]}')).toThrow(ImportParseError);
    try {
      readImportRows('{"items":[]}');
    } catch (error) {
      expect((error as Error).message).toContain("tasks");
    }
  });

  it("separates unreadable JSON from a readable file of the wrong shape", () => {
    expect(() => readImportRows("{nope")).toThrow(/not valid JSON/);
  });
});

describe("building the plan", () => {
  it("sends a new task to Backlog and leaves the rest of the board alone", () => {
    const plan = buildImportPlan([{ title: "Fresh work" }], board(), nextId);
    expect(plan.rejected).toEqual([]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.accepted[0].action).toBe("create");
    expect(plan.accepted[0].task.status).toBe("Backlog");
    // Nothing in the plan refers to the existing task, so nothing can remove it.
    expect(plan.accepted.some((entry) => entry.task.id === "PLAT-001")).toBe(false);
  });

  it("refuses a colliding id by default, naming the task it would have overwritten", () => {
    // The default exists because the migration tasks are Done on production: a
    // file of new work must not be able to rewrite a finished record.
    const plan = buildImportPlan([{ id: "PLAT-001", title: "Renamed" }], board(), nextId);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected[0].reason).toContain("PLAT-001 already exists");
    expect(plan.rejected[0].reason).toContain("Existing task");
    expect(plan.rejected[0].reason).toContain("Done");
  });

  it("updates that task in upsert mode, and shows the title being replaced", () => {
    const plan = buildImportPlan([{ id: "PLAT-001", title: "Renamed" }], board(), nextId, "object", "upsert");
    expect(plan.accepted[0].action).toBe("update");
    expect(plan.accepted[0].existingTitle).toBe("Existing task");
    expect(plan.accepted[0].task.id).toBe("PLAT-001");
  });

  it("adds new work beside finished tasks without touching them, in either mode", () => {
    for (const mode of ["new-only", "upsert"] as const) {
      const plan = buildImportPlan([{ id: "NEWQ-001", title: "Next quarter" }], board(), nextId, "object", mode);
      expect(plan.accepted).toHaveLength(1);
      expect(plan.accepted[0].action).toBe("create");
      expect(plan.accepted[0].task.status).toBe("Backlog");
      // The Done task is nowhere in the plan, so nothing can rewrite it.
      expect(plan.accepted.some((entry) => entry.task.id === "PLAT-001")).toBe(false);
    }
  });

  it("judges each row on its own: one bad row does not sink the file", () => {
    const plan = buildImportPlan(
      [{ title: "Good" }, { title: "" }, { title: "Also good" }],
      board(),
      nextId,
    );
    expect(plan.accepted).toHaveLength(2);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].row).toBe(2);
    expect(plan.rejected[0].reason).toContain("title");
  });

  it("refuses an assignee outside the roster instead of quietly reassigning it", () => {
    const plan = buildImportPlan([{ title: "x", assignee: "mallory" }], board(), nextId);
    expect(plan.accepted).toHaveLength(0);
    expect(plan.rejected[0].reason).toContain("mallory");
    for (const person of TASK_ASSIGNEES) {
      expect(plan.rejected[0].reason).toContain(person);
    }
  });

  it("accepts every declared assignee", () => {
    const rows = TASK_ASSIGNEES.map((person) => ({ title: `for ${person}`, assignee: person }));
    const plan = buildImportPlan(rows, board(), nextId);
    expect(plan.rejected).toEqual([]);
    expect(plan.accepted.map((entry) => entry.task.assignee)).toEqual([...TASK_ASSIGNEES]);
  });

  it("refuses an unknown status rather than silently filing it under Backlog", () => {
    const plan = buildImportPlan([{ title: "x", status: "Shipped" }], board(), nextId);
    expect(plan.rejected[0].reason).toContain("Shipped");
  });

  it("refuses a row that repeats an id already used earlier in the same file", () => {
    const plan = buildImportPlan(
      [{ id: "NEW-1", title: "first" }, { id: "NEW-1", title: "second" }],
      board(),
      nextId,
    );
    expect(plan.accepted).toHaveLength(1);
    expect(plan.rejected[0].reason).toContain("more than once");
  });

  it("rejects a row that is not an object at all", () => {
    const plan = buildImportPlan(["nope", 7, null], board(), nextId);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected.map((entry) => entry.row)).toEqual([1, 2, 3]);
  });

  it("gives generated ids that cannot collide with each other", () => {
    const plan = buildImportPlan([{ title: "a" }, { title: "b" }, { title: "c" }], board(), nextId);
    const ids = plan.accepted.map((entry) => entry.task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads depends as a list or as one comma-separated string", () => {
    const plan = buildImportPlan(
      [{ title: "a", depends: ["X-1", "X-2"] }, { title: "b", depends: "Y-1, Y-2" }],
      board(),
      nextId,
    );
    expect(plan.accepted[0].task.depends).toEqual(["X-1", "X-2"]);
    expect(plan.accepted[1].task.depends).toEqual(["Y-1", "Y-2"]);
  });
});

describe("what the dialog tells the reader", () => {
  it("summarises new, updated and rejected counts in one line", () => {
    const plan = buildImportPlan(
      [{ title: "new one" }, { id: "PLAT-001", title: "changed" }, { title: "" }],
      board(),
      nextId,
      "object",
      "upsert",
    );
    const text = describePlan(plan);
    expect(text).toContain("1 new task into Backlog");
    expect(text).toContain("1 existing task updated");
    expect(text).toContain("1 rejected");
  });

  it("says so plainly when there is nothing to apply", () => {
    expect(describePlan({ accepted: [], rejected: [], shape: "array" })).toBe("Nothing to apply");
  });

  it("lists the id prefixes already on the board, so new work can avoid them", () => {
    expect(usedIdPrefixes(board())).toEqual(["PLAT"]);
    expect(usedIdPrefixes([])).toEqual([]);
  });

  it("documents every field the validator actually reads", () => {
    // The dialog renders IMPORT_FIELDS; if a field is added to the validator
    // and not to this list the documentation silently stops being complete.
    const documented = new Set(IMPORT_FIELDS.map((field) => field.name));
    for (const field of ["title", "id", "workstream", "phase", "weeks", "priority", "owner", "assignee", "status", "depends", "notes"]) {
      expect(documented.has(field), `${field} is not documented`).toBe(true);
    }
  });
});
