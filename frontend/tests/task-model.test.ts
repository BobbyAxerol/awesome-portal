import { describe, expect, it } from "vitest";
import { BASE_TASKS_SEED } from "../src/content/seed";
import { EMPTY_TASK_FILTERS, cloneTaskSeeds, filteredTasks, nextTaskId, normaliseTask } from "../src/features/tasks/task-model";

describe("task model", () => {
  it("clones the locked seed data without mutating it", () => {
    const tasks = cloneTaskSeeds();
    expect(tasks).toHaveLength(BASE_TASKS_SEED.length);
    tasks[0].title = "Changed in runtime";
    expect(BASE_TASKS_SEED[0].title).not.toBe("Changed in runtime");
  });

  it("keeps compatible records and filters by legacy fields", () => {
    const task = normaliseTask({ id: "ABC-001", title: "Review manifests", status: "In Progress", depends: "ACQ-001, SEC-001" });
    expect(task.status).toBe("In Progress");
    expect(task.depends).toEqual(["ACQ-001", "SEC-001"]);
    expect(filteredTasks([task], { ...EMPTY_TASK_FILTERS, query: "sec-001" })).toEqual([task]);
  });

  it("allocates a stable workstream task ID", () => {
    const tasks = cloneTaskSeeds();
    expect(nextTaskId(tasks, "QuantBT")).toBe("QBT-022");
  });
});
