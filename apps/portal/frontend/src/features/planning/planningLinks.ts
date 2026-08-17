/**
 * Canonical Portal→Planning deep links (U05 exit gate, v0.4 §P0.23).
 *
 * One place builds these, so a Portal screen that wants to hand off to Planning
 * cannot invent a route. The segments come from Planning's own route table
 * (`@/embedded/planningRoutes`), which is also what the standalone hash router
 * reads — so a view cannot exist under one addressing scheme only.
 *
 * A task deep link carries the id in the query string rather than the path:
 * Planning's board addresses a task by selection, not by route, and inventing a
 * `/planning/board/:taskId` route here would be a second routing model.
 */
import { planningPath } from "@/embedded/planningRoutes";

export const PLANNING_TASK_ROUTE = {
  roadmap: planningPath("roadmap"),
  board: planningPath("board"),
  /** Board, with one task pre-selected. */
  task: (taskId: string) => `${planningPath("board")}?task=${encodeURIComponent(taskId)}`,
};

/** The query key Planning reads to pre-select a task. */
export const TASK_QUERY_KEY = "task";
