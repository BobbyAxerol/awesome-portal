/**
 * Drag flow (v1.1 plan §3.4).
 *
 * The claims under test are the ones that are easy to say and easy to get
 * wrong: the card moves *before* the server answers, the move is rolled back
 * to exactly the prior state when the server refuses, the drop position is the
 * one the insertion line showed, and the notification copy never claims
 * delivery the frontend cannot know about.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const task = (id: string, status: string, position: number, owner = "Bobby") => ({
  id,
  title: `Task ${id}`,
  workstream: "Platform",
  phase: "P3",
  weeks: "W1",
  priority: "P1",
  owner,
  status,
  depends: [],
  notes: "",
  created: "2026-08-13",
});

function versioned(item: ReturnType<typeof task>, position: number) {
  return { item, version: 3, position, created_at: "now", updated_at: "now", deleted_at: null };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

/** A promise whose resolution the test controls, so the in-flight state is observable. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drags a card onto a column and drops it there. */
function dragTo(cardId: string, columnTestId: string) {
  const card = screen.getByTestId(`task-card-${cardId}`);
  const column = screen.getByTestId(columnTestId);
  const dataTransfer = { effectAllowed: "", setData: vi.fn(), getData: () => cardId };
  fireEvent.dragStart(card, { dataTransfer });
  fireEvent.dragOver(column, { dataTransfer });
  fireEvent.drop(column, { dataTransfer });
}

describe.sequential("board drag flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv("VITE_ROADMAP_TASK_BOARD_PERSISTENCE", "v1");
    vi.stubEnv("VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY", "false");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function mount() {
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");
    return render(<ToastProvider><TaskBoardFeature apiMode="api" /></ToastProvider>);
  }

  it("moves the card before the server answers, then reconciles", async () => {
    const moved = deferred<Response>();
    const fetchMock = vi.fn((url: string) => {
      if (String(url).endsWith("/move")) return moved.promise;
      return Promise.resolve(response({ items: [versioned(task("API-1", "Ready", 0), 0)] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await screen.findByTestId("task-card-API-1");

    dragTo("API-1", "task-column-In Progress");

    // Optimistic: the card is already in the target column while the request
    // is still open, and it is marked as in flight rather than settled.
    await waitFor(() => {
      const column = screen.getByTestId("task-column-In Progress");
      expect(within(column).getByTestId("task-card-API-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("task-card-API-1").dataset.pending).toBe("true");

    moved.resolve(response({ item: task("API-1", "In Progress", 0), version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }));
    await waitFor(() => expect(screen.getByTestId("task-card-API-1").dataset.pending).toBe("false"));
  });

  it("rolls the card back to its original column when the server refuses", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).endsWith("/move")) {
        return Promise.resolve(response({ error: { code: "version_conflict", message: "stale version" } }, 409));
      }
      return Promise.resolve(response({ items: [versioned(task("API-1", "Ready", 0), 0)] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await screen.findByTestId("task-card-API-1");

    dragTo("API-1", "task-column-Done");

    await waitFor(() => {
      const ready = screen.getByTestId("task-column-Ready");
      expect(within(ready).getByTestId("task-card-API-1")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("task-column-Done")).queryByTestId("task-card-API-1")).toBeNull();
    expect(await screen.findByText(/could not be moved — the change was rolled back/)).toBeInTheDocument();
  });

  it("sends the position the insertion line showed, not an append", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).endsWith("/move")) {
        return Promise.resolve(response({ item: task("API-3", "Ready", 0), version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }));
      }
      return Promise.resolve(
        response({
          items: [
            versioned(task("API-1", "Ready", 0), 0),
            versioned(task("API-2", "Ready", 1), 1),
            versioned(task("API-3", "Backlog", 0), 0),
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = await mount();
    await screen.findByTestId("task-card-API-3");

    // Drop onto the first insertion slot of the Ready column: position 0, in
    // front of API-1, which an append-only drop could not express.
    const readyColumn = screen.getByTestId("task-column-Ready");
    const slot = readyColumn.querySelector(".drop-slot") as HTMLElement;
    const dataTransfer = { effectAllowed: "", setData: vi.fn(), getData: () => "API-3" };
    fireEvent.dragStart(screen.getByTestId("task-card-API-3"), { dataTransfer });
    fireEvent.dragOver(slot, { dataTransfer });
    expect(slot.dataset.active).toBe("true");
    fireEvent.drop(slot, { dataTransfer });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/move"));
      expect(call, "move was not called").toBeDefined();
      expect(JSON.parse(String((call![1] as RequestInit).body))).toMatchObject({ status: "Ready", position: 0 });
    });
    expect(container).toBeTruthy();
  });

  it("says the notification was queued, and never names a webhook", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).endsWith("/move")) {
        return Promise.resolve(response({ item: task("API-1", "Done", 0), version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null }));
      }
      return Promise.resolve(response({ items: [versioned(task("API-1", "Ready", 0, "Thanh Vuong"), 0)] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = await mount();
    await screen.findByTestId("task-card-API-1");

    dragTo("API-1", "task-column-Done");

    // Queued, not delivered: the frontend cannot observe the outbox result, so
    // it must not claim one.
    const toast = await screen.findByText(/notification queued for Thanh Vuong/);
    expect(toast).toBeInTheDocument();
    // No webhook URL, host or secret may reach the DOM.
    expect(container.innerHTML).not.toMatch(/lark|feishu|webhook|hook\.|secret/i);
  });
});

describe("board grouping and bulk actions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv("VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY", "true");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function mountLocal() {
    const { TaskBoardFeature } = await import("../src/features/tasks/TaskBoardFeature");
    const { ToastProvider } = await import("../src/components/ui");
    return render(<ToastProvider><TaskBoardFeature apiMode="local" /></ToastProvider>);
  }

  it("groups by workstream and by owner, not only by milestone", async () => {
    const user = userEvent.setup();
    await mountLocal();

    await user.selectOptions(screen.getByLabelText("Group tasks"), "workstream");
    expect(await screen.findByTestId("milestone-lane-Acquisition")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Group tasks"), "owner");
    // Lane ids come from the seed's real owner values.
    const lanes = document.querySelectorAll("[data-testid^='milestone-lane-']");
    expect(lanes.length).toBeGreaterThan(1);
  });

  it("offers bulk actions only once something is selected", async () => {
    const user = userEvent.setup();
    await mountLocal();
    expect(screen.queryByTestId("bulk-bar")).toBeNull();

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(await screen.findByTestId("bulk-bar")).toBeInTheDocument();
    expect(screen.getByText(/1 tasks selected/)).toBeInTheDocument();
  });

  it("moves a task with the keyboard, so drag is not the only path", async () => {
    const user = userEvent.setup();
    await mountLocal();

    const backlog = screen.getByTestId("task-column-Backlog");
    const first = within(backlog).getAllByTestId(/^task-card-/)[0];
    const id = first.getAttribute("data-testid")!.replace("task-card-", "");

    within(first).getByRole("button", { name: `Open task ${id}` }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

    await waitFor(() => {
      const ready = screen.getByTestId("task-column-Ready");
      expect(within(ready).getByTestId(`task-card-${id}`)).toBeInTheDocument();
    });
  });
});
