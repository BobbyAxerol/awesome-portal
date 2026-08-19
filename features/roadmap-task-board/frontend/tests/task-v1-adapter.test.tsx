import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const task = {
  id: "API-1",
  title: "Versioned task",
  workstream: "Platform",
  phase: "P3",
  weeks: "W1",
  priority: "P1",
  owner: "Bobby",
  status: "Ready",
  depends: [],
  notes: "",
  created: "2026-08-13",
};

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe.sequential("Task Board v1 adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv("VITE_ROADMAP_TASK_BOARD_PERSISTENCE", "v1");
    vi.stubEnv("VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY", "false");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads a versioned task then PATCHes only mutable fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ item: task, version: 3, position: 0, created_at: "now", updated_at: "now", deleted_at: null }] }))
      .mockResolvedValueOnce(response({ item: { ...task, title: "Updated title" }, version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }));
    vi.stubGlobal("fetch", fetchMock);
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");
    const user = userEvent.setup();

    render(<ToastProvider><TaskBoardFeature apiMode="api" /></ToastProvider>);
    await screen.findByTestId("task-card-API-1");
    await user.click(screen.getByRole("button", { name: "Open task API-1" }));
    await user.clear(screen.getByLabelText("Task title"));
    await user.type(screen.getByLabelText("Task title"), "Updated title");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(fetchMock.mock.calls[1]?.[0]).toBe("api/v1/tasks/API-1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(String(options.body))).toEqual({
      title: "Updated title",
      workstream: "Platform",
      phase: "P3",
      weeks: "W1",
      priority: "P1",
      owner: "Bobby",
      notes: "",
      depends: [],
      created: "2026-08-13",
      expected_version: 3,
    });
  });

  it("does not auto-import browser state into an empty server workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");

    render(<ToastProvider><TaskBoardFeature apiMode="api" /></ToastProvider>);
    expect(await screen.findByRole("button", { name: "Initialize server from local" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the transition command instead of PATCH when a task status changes", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-portal_csrf=csrf-token",
    );
    const doneTask = { ...task, status: "Done" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ item: task, version: 3, position: 0, created_at: "now", updated_at: "now", deleted_at: null }] }))
      .mockResolvedValueOnce(response({ item: doneTask, version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }))
      .mockResolvedValueOnce(response({ items: [{ item: doneTask, version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");
    const user = userEvent.setup();

    render(<ToastProvider><TaskBoardFeature apiMode="api" /></ToastProvider>);
    await screen.findByTestId("task-card-API-1");
    await user.click(screen.getByRole("button", { name: "Open task API-1" }));
    await user.selectOptions(screen.getByLabelText("Task status"), "Done");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("api/v1/tasks/API-1/transition");
    const transitionOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(transitionOptions.body))).toEqual({ status: "Done", expected_version: 3 });
    expect(
      (transitionOptions.headers as Record<string, string>)["x-portal-csrf"],
    ).toBe("csrf-token");
    expect(transitionOptions.credentials).toBe("same-origin");
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("api/v1/tasks/API-1");
  });

  it("loads immutable activity only when a manager explicitly opens the timeline", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ item: task, version: 3, position: 0, created_at: "now", updated_at: "now", deleted_at: null }] }))
      .mockResolvedValueOnce(response({
        items: [{
          id: "evt-1",
          entity_type: "task",
          entity_id: "API-1",
          type: "task.status_changed",
          actor: "bobby",
          occurred_at: "2026-08-13T10:00:00Z",
          before: null,
          after: null,
          metadata: { from_status: "Ready", to_status: "Done" },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");
    const user = userEvent.setup();

    render(<ToastProvider><TaskBoardFeature apiMode="api" /></ToastProvider>);
    await screen.findByTestId("task-card-API-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // v1.1: activity is reachable straight from the card, without opening the
    // editor first — the modal keeps its own Activity button as well.
    await user.click(screen.getByRole("button", { name: "Activity" }));

    expect(await screen.findByText("Task status changed")).toBeInTheDocument();
    expect(screen.getByTestId("activity-timeline-tasks-API-1")).toHaveTextContent("Ready → Done");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("api/v1/tasks/API-1/activity");
  });
});
