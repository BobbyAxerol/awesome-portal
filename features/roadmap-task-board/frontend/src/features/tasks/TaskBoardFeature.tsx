import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, Chip, Input, Modal, StateView, useToast } from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import { LS_BOARD_VIEW, storageGet, storageSet } from "@/lib/storage";
import { ActivityTimeline } from "../shared/ActivityTimeline";
import {
  EMPTY_TASK_FILTERS,
  TASK_STATUSES,
  filteredTasks,
  milestoneLanes,
  nextTaskId,
  normaliseTasks,
  optionValues,
  taskDraft,
  type Task,
  type TaskFilters,
  type TaskGrouping,
  type TaskStatus,
} from "./task-model";
import { useTasks } from "./useTasks";

type BoardView = "board" | "table";

function initialBoardView(): BoardView {
  return storageGet(LS_BOARD_VIEW) === "table" ? "table" : "board";
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status: TaskStatus): "neutral" | "accent" | "good" | "bad" {
  if (status === "Done") return "good";
  if (status === "In Progress") return "accent";
  if (status === "Validating") return "bad";
  return "neutral";
}

function TaskCard({ task, onEdit, onDelete, onDragStart, onDragEnd }: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      className="task-card phase3-task-card"
      data-testid={`task-card-${task.id}`}
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Edit task ${task.id}`}
      onClick={() => onEdit(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(task);
        }
      }}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="task-del"
        aria-label={`Delete task ${task.id}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(task);
        }}
      >
        ×
      </button>
      <p className="task-id">{task.id}</p>
      <h3 className="task-title">{task.title}</h3>
      <div className="task-meta">
        <Chip tone={statusTone(task.status)}>{task.priority}</Chip>
        {task.phase && <Chip>{task.phase}</Chip>}
        {task.weeks && <Chip>{task.weeks}</Chip>}
        <Chip>{task.owner}</Chip>
      </div>
      {task.workstream && <p className="feature-card-note">{task.workstream}</p>}
      {task.depends.length > 0 && <p className="task-depends">Depends: {task.depends.join(", ")}</p>}
    </article>
  );
}

function TaskEditor({ draft, onChange }: { draft: Task; onChange: (field: keyof Task, value: string | string[]) => void }) {
  return (
    <div className="feature-form-grid">
      <label className="feature-field feature-field-wide">
        <span>Title</span>
        <Input value={draft.title} onChange={(event) => onChange("title", event.target.value)} aria-label="Task title" autoFocus />
      </label>
      <label className="feature-field">
        <span>Workstream</span>
        <Input value={draft.workstream} onChange={(event) => onChange("workstream", event.target.value)} aria-label="Task workstream" />
      </label>
      <label className="feature-field">
        <span>Owner</span>
        <Input value={draft.owner} onChange={(event) => onChange("owner", event.target.value)} aria-label="Task owner" />
      </label>
      <label className="feature-field">
        <span>Phase</span>
        <Input value={draft.phase} onChange={(event) => onChange("phase", event.target.value)} aria-label="Task phase" placeholder="P0" />
      </label>
      <label className="feature-field">
        <span>Weeks</span>
        <Input value={draft.weeks} onChange={(event) => onChange("weeks", event.target.value)} aria-label="Task weeks" placeholder="W1–W2" />
      </label>
      <label className="feature-field">
        <span>Priority</span>
        <select value={draft.priority} onChange={(event) => onChange("priority", event.target.value)} aria-label="Task priority">
          {["P0", "P1", "P2", "P3"].map((priority) => <option key={priority}>{priority}</option>)}
        </select>
      </label>
      <label className="feature-field">
        <span>Status</span>
        <select value={draft.status} onChange={(event) => onChange("status", event.target.value)} aria-label="Task status">
          {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
      </label>
      <label className="feature-field feature-field-wide">
        <span>Depends on (comma-separated IDs)</span>
        <Input value={draft.depends.join(", ")} onChange={(event) => onChange("depends", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} aria-label="Task dependencies" />
      </label>
      <label className="feature-field feature-field-wide">
        <span>Notes</span>
        <textarea value={draft.notes} onChange={(event) => onChange("notes", event.target.value)} aria-label="Task notes" rows={4} />
      </label>
    </div>
  );
}

export function TaskBoardFeature({ apiMode }: { apiMode: ApiMode }) {
  const { tasks, persistence, syncState, syncError, needsInitialization, refresh, create, update, move, remove, replace, reset } = useTasks(apiMode);
  const toast = useToast();
  const [view, setView] = useState<BoardView>(initialBoardView);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [activityTaskId, setActivityTaskId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<TaskGrouping>("status");

  const visibleTasks = useMemo(() => filteredTasks(tasks, filters), [tasks, filters]);
  const workstreams = useMemo(() => optionValues(tasks, "workstream"), [tasks]);
  const priorities = useMemo(() => optionValues(tasks, "priority"), [tasks]);
  const phases = useMemo(() => optionValues(tasks, "phase"), [tasks]);
  const owners = useMemo(() => optionValues(tasks, "owner"), [tasks]);

  // Milestone lanes are derived from the `phase` field the schema already
  // carries; grouping never introduces a second milestone model.
  const lanes = useMemo(
    () =>
      grouping === "milestone"
        ? milestoneLanes(visibleTasks)
        : [{ id: "", label: "", tasks: visibleTasks, total: visibleTasks.length, done: 0 }],
    [grouping, visibleTasks],
  );

  const setBoardView = (next: BoardView) => {
    setView(next);
    storageSet(LS_BOARD_VIEW, next);
  };

  const setFilter = (field: keyof TaskFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }));

  const openNew = (status: TaskStatus = "Backlog") => {
    setEditingId(null);
    setDraft(taskDraft(status));
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setDraft({ ...task, depends: [...task.depends] });
  };

  const closeEditor = () => {
    setEditingId(null);
    setDraft(null);
  };

  const updateDraft = (field: keyof Task, value: string | string[]) => {
    setDraft((current) => current ? ({ ...current, [field]: value } as Task) : current);
  };

  const saveDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      toast("Cần nhập title cho task", "bad");
      return;
    }
    const existing = editingId ? tasks.find((task) => task.id === editingId) : undefined;
    const next: Task = {
      ...draft,
      id: existing?.id ?? nextTaskId(tasks, draft.workstream),
      title,
      workstream: draft.workstream.trim() || "General",
      owner: draft.owner.trim() || "Unassigned",
      depends: draft.depends.map((item) => item.trim()).filter(Boolean),
      created: existing?.created || draft.created || today(),
    };
    void (existing ? update(next) : create(next))
      .then(() => {
        closeEditor();
        toast(existing ? "Task đã cập nhật" : "Task đã tạo", "good");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const deleteTask = (task: Task) => {
    if (!window.confirm(`Xóa task ${task.id}?`)) return;
    void remove(task.id)
      .then(() => {
        if (editingId === task.id) closeEditor();
        if (activityTaskId === task.id) setActivityTaskId(null);
        toast(`Đã xóa ${task.id}`, "info");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const moveTask = (taskId: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    const position = tasks.filter((item) => item.status === status).length;
    void move(taskId, status, position)
      .then(() => toast(`${task.id} → ${status}`, "good"))
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const importTasks = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
        return replace(normaliseTasks(parsed as Record<string, unknown>[]));
      })
      .then(() => toast("Đã import task board", "good"))
      .catch(() => toast("File JSON task không hợp lệ", "bad"));
  };

  const startDrag = (event: DragEvent<HTMLElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  };

  const dropOnStatus = (event: DragEvent<HTMLElement>, status: TaskStatus) => {
    event.preventDefault();
    const taskId = draggedTaskId ?? event.dataTransfer.getData("text/plain");
    if (taskId) moveTask(taskId, status);
    setDraggedTaskId(null);
  };

  return (
    <section className="feature-surface" data-testid="task-board-feature">
      <header className="feature-header">
        <div>
          <p className="mono-label">Phase 4 · {persistence === "v1" ? "audited server workspace" : persistence === "legacy" ? "compatibility sync" : "local-first workspace"}</p>
          <h1>Migration task board</h1>
          <p>Board, table and editor preserve the existing task schema and <code>quantPortalTasksV1</code> key.</p>
        </div>
        <div className="feature-actions">
          <Button type="button" variant="ghost" onClick={() => downloadJson("quant-migration-tasks.json", tasks)}>Export JSON</Button>
          <label className="btn-ghost file-button">Import JSON<input type="file" accept="application/json" onChange={importTasks} /></label>
          <Button type="button" variant="ghost" onClick={() => {
            if (window.confirm("Reset toàn bộ trạng thái task về bản mặc định?")) {
              void reset().then(() => toast("Task board đã reset", "good")).catch((error: Error) => toast(error.message, "bad"));
            }
          }}>Reset</Button>
          <Button type="button" onClick={() => openNew()}>+ Add task</Button>
        </div>
      </header>

      <div className={`sync-notice ${syncState === "error" ? "sync-notice-error" : ""}`} role={syncState === "error" ? "alert" : "status"}>
        <span>{syncState === "loading" ? "Đang tải workspace…" : syncState === "saving" ? "Đang lưu an toàn…" : persistence === "v1" ? "Server workspace · versioned & audited" : persistence === "legacy" ? "Compatibility API sync" : "Local-only workspace"}</span>
        {persistence !== "local" && <button type="button" onClick={() => void refresh()}>Refresh</button>}
        {needsInitialization && <button type="button" onClick={() => void replace(tasks).then(() => toast("Đã khởi tạo server từ snapshot local", "good")).catch((error: Error) => toast(error.message, "bad"))}>Initialize server from local</button>}
        {syncError && <span>{syncError.message}</span>}
      </div>

      <div className="feature-toolbar" aria-label="Task filters">
        <Input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Search ID, title, owner…" aria-label="Search tasks" />
        <select value={filters.workstream} onChange={(event) => setFilter("workstream", event.target.value)} aria-label="Filter workstream">
          <option value="">All workstreams</option>{workstreams.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)} aria-label="Filter priority">
          <option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select value={filters.phase} onChange={(event) => setFilter("phase", event.target.value)} aria-label="Filter phase">
          <option value="">All phases</option>{phases.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select value={filters.owner} onChange={(event) => setFilter("owner", event.target.value)} aria-label="Filter owner">
          <option value="">All owners</option>{owners.map((value) => <option key={value}>{value}</option>)}
        </select>
        <Button type="button" variant="ghost" onClick={() => setFilters(EMPTY_TASK_FILTERS)}>Clear</Button>
        <select
          value={grouping}
          onChange={(event) => setGrouping(event.target.value as TaskGrouping)}
          aria-label="Group tasks"
        >
          <option value="status">Nhóm theo status</option>
          <option value="milestone">Nhóm theo milestone</option>
        </select>
        <div className="view-toggle" aria-label="Task presentation">
          <button type="button" className={view === "board" ? "active" : ""} onClick={() => setBoardView("board")}>Board</button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setBoardView("table")}>Table</button>
        </div>
      </div>

      {view === "board" ? (
        lanes.length === 0 ? (
          <StateView kind="empty" message="Không có task khớp bộ lọc." />
        ) : (
          lanes.map((lane) => (
            <div key={lane.id || "__all__"} className="milestone-lane" data-testid={`milestone-lane-${lane.id || "unassigned"}`}>
              {grouping === "milestone" ? (
                <header className="milestone-lane-head">
                  <span className="milestone-lane-label">{lane.label}</span>
                  <Chip>{lane.done}/{lane.total} done</Chip>
                </header>
              ) : null}
              <div className="kanban phase3-kanban" aria-label={grouping === "milestone" ? `Kanban ${lane.label}` : "Task kanban board"}>
                {TASK_STATUSES.map((status) => {
                  const tasksForStatus = lane.tasks.filter((task) => task.status === status);
                  return (
                    <section
                      key={status}
                      className="kanban-col"
                      data-testid={grouping === "milestone" ? `task-column-${lane.id || "unassigned"}-${status}` : `task-column-${status}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => dropOnStatus(event, status)}
                    >
                      <header className="kanban-head"><span>{status}</span><Chip>{tasksForStatus.length}</Chip></header>
                      <div className="task-list">
                        {tasksForStatus.map((task) => <TaskCard key={task.id} task={task} onEdit={openEdit} onDelete={deleteTask} onDragStart={startDrag} onDragEnd={() => setDraggedTaskId(null)} />)}
                      </div>
                      <button type="button" className="add-card-btn" onClick={() => openNew(status)}>+ Add task</button>
                    </section>
                  );
                })}
              </div>
            </div>
          ))
        )
      ) : visibleTasks.length ? (
        <div className="table-wrap phase3-table-wrap">
          <table className="task-table">
            <thead><tr><th>ID</th><th>Title</th><th>Workstream</th><th>Phase</th><th>Weeks</th><th>Priority</th><th>Owner</th><th>Status</th><th>Depends</th><th /></tr></thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.id} data-testid={`task-row-${task.id}`}>
                  <td>{task.id}</td><td>{task.title}</td><td>{task.workstream}</td><td>{task.phase}</td><td>{task.weeks}</td><td>{task.priority}</td><td>{task.owner}</td><td>{task.status}</td><td>{task.depends.join(", ")}</td>
                  <td className="table-actions"><button type="button" onClick={() => openEdit(task)}>Edit</button><button type="button" onClick={() => deleteTask(task)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateView kind="empty" message="Không có task khớp bộ lọc." />}

      <Modal open={draft !== null} title={editingId ? `Edit ${editingId}` : "New task"} onClose={closeEditor}>
        {draft && <TaskEditor draft={draft} onChange={updateDraft} />}
        <div className="modal-actions">
          {editingId && draft && <Button type="button" variant="ghost" onClick={() => deleteTask(draft)}>Delete</Button>}
          {editingId && persistence === "v1" && <Button type="button" variant="ghost" onClick={() => setActivityTaskId(editingId)}>Activity</Button>}
          <span />
          <Button type="button" variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button type="button" onClick={saveDraft}>Save task</Button>
        </div>
      </Modal>
      <ActivityTimeline
        collection="tasks"
        entityId={activityTaskId ?? ""}
        entityLabel={activityTaskId ?? "Task"}
        open={activityTaskId !== null}
        onClose={() => setActivityTaskId(null)}
      />
    </section>
  );
}
