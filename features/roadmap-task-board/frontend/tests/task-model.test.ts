import { describe, expect, it } from "vitest";
import { BASE_TASKS_SEED } from "../src/content/seed";
import {
  EMPTY_TASK_FILTERS,
  cloneTaskSeeds,
  filteredTasks,
  milestoneLanes,
  nextTaskId,
  normaliseTask,
  type Task,
  type TaskStatus,
} from "../src/features/tasks/task-model";

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

describe("milestone grouping", () => {
  const task = (id: string, phase: string, status: TaskStatus = "Backlog"): Task => ({
    id,
    title: id,
    workstream: "Platform",
    phase,
    weeks: "",
    priority: "P1",
    owner: "bobby",
    status,
    depends: [],
    notes: "",
    created: "2026-08-16",
  });

  it("groups tasks by the phase field the schema already carries", () => {
    const lanes = milestoneLanes([task("A", "P1"), task("B", "P0"), task("C", "P1")]);
    expect(lanes.map((lane) => lane.id)).toEqual(["P0", "P1"]);
    expect(lanes[1].tasks.map((t) => t.id)).toEqual(["A", "C"]);
  });

  it("keeps unassigned tasks in an explicit lane, sorted last", () => {
    const lanes = milestoneLanes([task("A", ""), task("B", "P0")]);
    expect(lanes.map((lane) => lane.id)).toEqual(["P0", ""]);
    expect(lanes[1].label).toBe("Chưa gán milestone");
  });

  it("never drops a task, so lane counts add up to the input", () => {
    const tasks = [task("A", "P1"), task("B", ""), task("C", "P2"), task("D", "P1")];
    const lanes = milestoneLanes(tasks);
    expect(lanes.reduce((sum, lane) => sum + lane.total, 0)).toBe(tasks.length);
  });

  it("counts done against real status only", () => {
    const lanes = milestoneLanes([task("A", "P1", "Done"), task("B", "P1", "Validating")]);
    expect(lanes[0].done).toBe(1);
    expect(lanes[0].total).toBe(2);
  });

  it("orders milestones naturally rather than lexically", () => {
    const lanes = milestoneLanes([task("A", "P10"), task("B", "P2")]);
    expect(lanes.map((lane) => lane.id)).toEqual(["P2", "P10"]);
  });

  it("returns no lanes for an empty task list", () => {
    expect(milestoneLanes([])).toEqual([]);
  });
});
