import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../src/components/ui";
import { LS_TASKS } from "../src/lib/storage";
import { TaskBoardFeature } from "../src/features/tasks/TaskBoardFeature";

describe("TaskBoardFeature", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates a task and persists the established localStorage schema", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><TaskBoardFeature apiMode="local" /></ToastProvider>);

    await user.click(screen.getAllByRole("button", { name: "+ Add task" })[0]);
    await user.type(screen.getByLabelText("Task title"), "Traceable Phase 3 task");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    expect(await screen.findByText("Traceable Phase 3 task")).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(LS_TASKS) ?? "[]") as Array<{ title: string; status: string; depends: string[] }>;
    expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Traceable Phase 3 task", status: "Backlog", depends: [] })]));
  });

  it("moves a legacy task between Kanban statuses with drag and drop", () => {
    const transfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(() => "ALPHA-001"),
    };
    render(<ToastProvider><TaskBoardFeature apiMode="local" /></ToastProvider>);

    fireEvent.dragStart(screen.getByTestId("task-card-ALPHA-001"), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId("task-column-Ready"), { dataTransfer: transfer });

    const stored = JSON.parse(window.localStorage.getItem(LS_TASKS) ?? "[]") as Array<{ id: string; status: string }>;
    expect(stored.find((task) => task.id === "ALPHA-001")?.status).toBe("Ready");
  });
});
