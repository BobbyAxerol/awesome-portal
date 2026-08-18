import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Button,
  Checkbox,
  Chip,
  Field,
  Input,
  Modal,
  Select,
  StateView,
  Textarea,
  useToast,
} from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import { LS_BOARD_VIEW, storageGet, storageSet } from "@/lib/storage";
import { workstreamSlots } from "@/lib/workstream";
import { ActivityTimeline } from "../shared/ActivityTimeline";
import {
  EMPTY_TASK_FILTERS,
  GROUPING_LABELS,
  TASK_GROUPINGS,
  TASK_STATUSES,
  filteredTasks,
  groupLanes,
  nextTaskId,
  normaliseTasks,
  optionValues,
  taskDraft,
  type MilestoneLane,
  type Task,
  type TaskFilters,
  type TaskGrouping,
  type TaskStatus,
} from "./task-model";
import { TaskCard } from "./TaskCard";
import { useTasks } from "./useTasks";

type BoardView = "board" | "table";

/** Where a dragged card would land: which column, and before which index. */
interface DropTarget {
  laneId: string;
  status: TaskStatus;
  index: number;
}

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

function TaskEditor({ draft, onChange }: { draft: Task; onChange: (field: keyof Task, value: string | string[]) => void }) {
  return (
    <div className="feature-form-grid">
      <Field label="Title" wide>
        {(field) => <Input {...field} value={draft.title} onChange={(event) => onChange("title", event.target.value)} aria-label="Task title" autoFocus />}
      </Field>
      <Field label="Workstream">
        {(field) => <Input {...field} value={draft.workstream} onChange={(event) => onChange("workstream", event.target.value)} aria-label="Task workstream" />}
      </Field>
      <Field label="Owner">
        {(field) => <Input {...field} value={draft.owner} onChange={(event) => onChange("owner", event.target.value)} aria-label="Task owner" />}
      </Field>
      <Field label="Phase">
        {(field) => <Input {...field} className="input input-mono" value={draft.phase} onChange={(event) => onChange("phase", event.target.value)} aria-label="Task phase" placeholder="P0" />}
      </Field>
      <Field label="Weeks">
        {(field) => <Input {...field} className="input input-mono" value={draft.weeks} onChange={(event) => onChange("weeks", event.target.value)} aria-label="Task weeks" placeholder="W1–W2" />}
      </Field>
      <Field label="Priority">
        {(field) => (
          <Select {...field} value={draft.priority} onChange={(event) => onChange("priority", event.target.value)} aria-label="Task priority">
            {["P0", "P1", "P2", "P3"].map((priority) => <option key={priority}>{priority}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Status">
        {(field) => (
          <Select {...field} value={draft.status} onChange={(event) => onChange("status", event.target.value)} aria-label="Task status">
            {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Depends on (comma-separated IDs)" wide>
        {(field) => (
          <Input
            {...field}
            className="input input-mono"
            value={draft.depends.join(", ")}
            onChange={(event) => onChange("depends", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
            aria-label="Task dependencies"
          />
        )}
      </Field>
      <Field label="Notes" wide>
        {(field) => <Textarea {...field} value={draft.notes} onChange={(event) => onChange("notes", event.target.value)} aria-label="Task notes" rows={4} />}
      </Field>
    </div>
  );
}

export function TaskBoardFeature({
  apiMode,
  portalScreenForTask,
}: {
  apiMode: ApiMode;
  /** Injected by the Portal shell; absent in the standalone app. */
  portalScreenForTask?: (taskId: string) => { href: string; label: string } | null;
}) {
  const { tasks, persistence, syncState, syncError, needsInitialization, pendingMoves, refresh, create, update, move, remove, replace, reset } = useTasks(apiMode);
  const toast = useToast();
  const [view, setView] = useState<BoardView>(initialBoardView);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [activityTaskId, setActivityTaskId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<TaskGrouping>("status");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const visibleTasks = useMemo(() => filteredTasks(tasks, filters), [tasks, filters]);
  const workstreams = useMemo(() => optionValues(tasks, "workstream"), [tasks]);
  const priorities = useMemo(() => optionValues(tasks, "priority"), [tasks]);
  const phases = useMemo(() => optionValues(tasks, "phase"), [tasks]);
  const owners = useMemo(() => optionValues(tasks, "owner"), [tasks]);

  // Identity slots come from the WHOLE task set, not the filtered view, so
  // narrowing the filter cannot repaint the workstreams that survive it.
  const slots = useMemo(() => workstreamSlots(tasks.map((task) => task.workstream)), [tasks]);

  const lanes: MilestoneLane[] = useMemo(
    () =>
      grouping === "status"
        ? [{ id: "", label: "", tasks: visibleTasks, total: visibleTasks.length, done: 0 }]
        : groupLanes(visibleTasks, grouping),
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
      toast("A task needs a title", "bad");
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
        toast(existing ? "Task updated" : "Task created", "good");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  const deleteTask = (task: Task) => {
    if (!window.confirm(`Delete task ${task.id}?`)) return;
    void remove(task.id)
      .then(() => {
        if (editingId === task.id) closeEditor();
        if (activityTaskId === task.id) setActivityTaskId(null);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        toast(`Deleted ${task.id}`, "info");
      })
      .catch((error: Error) => toast(error.message, "bad"));
  };

  /**
   * Moves one task and reports the outcome.
   *
   * On the server workspace the same endpoint that records the transition also
   * queues the owner notification, so the toast says the notification was
   * *queued* — the frontend has no way to know it was delivered, and claiming
   * otherwise would be inventing backend state. No webhook URL or secret is
   * known here, referenced here, or logged here.
   */
  const moveTask = useCallback(
    (taskId: string, status: TaskStatus, position: number) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task || (task.status === status && position < 0)) return;
      const from = task.status;
      void move(taskId, status, position)
        .then(() => {
          if (from === status) return;
          toast(
            persistence === "v1"
              ? `${task.id}: ${from} → ${status} · notification queued for ${task.owner}`
              : `${task.id}: ${from} → ${status}`,
            "good",
          );
        })
        .catch((error: Error) => toast(`${task.id} could not be moved — the change was rolled back. ${error.message}`, "bad"));
    },
    [move, persistence, tasks, toast],
  );

  /** Keyboard equivalent of a drag: one column left or right. */
  const nudgeTask = (task: Task, direction: -1 | 1) => {
    const index = TASK_STATUSES.indexOf(task.status);
    const nextStatus = TASK_STATUSES[index + direction];
    if (!nextStatus) {
      toast(`${task.id} is already in the outermost column`, "info");
      return;
    }
    moveTask(task.id, nextStatus, tasks.filter((item) => item.status === nextStatus).length);
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
      .then(() => toast("Task board imported", "good"))
      .catch(() => toast("That task JSON file is not valid", "bad"));
  };

  const startDrag = (event: DragEvent<HTMLElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  };

  const endDrag = () => {
    setDraggedTaskId(null);
    setDropTarget(null);
  };

  const commitDrop = (event: DragEvent<HTMLElement>, status: TaskStatus, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const taskId = draggedTaskId ?? event.dataTransfer.getData("text/plain");
    endDrag();
    if (taskId) moveTask(taskId, status, index);
  };

  const toggleSelected = (taskId: string, isSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });

  /** Bulk transition: the same per-task move, applied in order. */
  const bulkMove = (status: TaskStatus) => {
    const ids = [...selected];
    setSelected(new Set());
    ids.forEach((id, offset) => {
      const task = tasks.find((item) => item.id === id);
      if (task && task.status !== status) {
        moveTask(id, status, tasks.filter((item) => item.status === status).length + offset);
      }
    });
  };

  const selectableSelection = selected.size > 0;

  const renderColumn = (lane: MilestoneLane, status: TaskStatus) => {
    const tasksForStatus = lane.tasks.filter((task) => task.status === status);
    const laneKey = lane.id || "__all__";
    const isTarget = dropTarget?.laneId === laneKey && dropTarget.status === status;
    const laneSelected = tasksForStatus.filter((task) => selected.has(task.id)).length;

    /** A drop zone between two cards; index is the resulting position. */
    const slotAt = (index: number) => (
      <div
        key={`slot-${index}`}
        className="drop-slot"
        data-active={isTarget && dropTarget.index === index}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropTarget({ laneId: laneKey, status, index });
        }}
        onDrop={(event) => commitDrop(event, status, index)}
      />
    );

    return (
      <section
        key={status}
        className="kanban-col"
        data-testid={lane.id ? `task-column-${lane.id}-${status}` : `task-column-${status}`}
        data-drop-target={isTarget}
        onDragOver={(event) => {
          event.preventDefault();
          setDropTarget({ laneId: laneKey, status, index: tasksForStatus.length });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={(event) => commitDrop(event, status, tasksForStatus.length)}
      >
        <header className="kanban-head">
          <span>{status}</span>
          <span className="kanban-count">
            {laneSelected > 0 && <Chip tone="accent">{laneSelected} selected</Chip>}
            <Chip>{tasksForStatus.length}</Chip>
          </span>
        </header>

        <div className="task-list">
          {slotAt(0)}
          {tasksForStatus.map((task, index) => (
            <div key={task.id} className="task-slot-group">
              <TaskCard
                task={task}
                slot={slots.get(task.workstream) ?? 0}
                pending={pendingMoves.has(task.id)}
                selected={selected.has(task.id)}
                selectable
                onSelect={(isSelected) => toggleSelected(task.id, isSelected)}
                onEdit={() => openEdit(task)}
                onDelete={() => deleteTask(task)}
                onActivity={persistence === "v1" ? () => setActivityTaskId(task.id) : null}
                onNudge={(direction) => nudgeTask(task, direction)}
                onDragStart={(event) => startDrag(event, task.id)}
                onDragEnd={endDrag}
              />
              {slotAt(index + 1)}
            </div>
          ))}
        </div>

        <button type="button" className="add-card-btn" onClick={() => openNew(status)}>
          + Add task
        </button>
      </section>
    );
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
            if (window.confirm("Reset every task back to the defaults?")) {
              void reset().then(() => toast("Task board reset", "good")).catch((error: Error) => toast(error.message, "bad"));
            }
          }}>Reset</Button>
          <Button type="button" onClick={() => openNew()}>+ Add task</Button>
        </div>
      </header>

      <div className={`sync-notice ${syncState === "error" ? "sync-notice-error" : ""}`} role={syncState === "error" ? "alert" : "status"}>
        <span>{syncState === "loading" ? "Loading the workspace…" : syncState === "saving" ? "Saving safely…" : persistence === "v1" ? "Server workspace · versioned & audited" : persistence === "legacy" ? "Compatibility API sync" : "Local-only workspace"}</span>
        {persistence !== "local" && <button type="button" onClick={() => void refresh()}>Refresh</button>}
        {needsInitialization && <button type="button" onClick={() => void replace(tasks).then(() => toast("Server initialized from the local snapshot", "good")).catch((error: Error) => toast(error.message, "bad"))}>Initialize server from local</button>}
        {syncError && <span>{syncError.message}</span>}
      </div>

      <div className="feature-toolbar" aria-label="Task filters">
        <Input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Search ID, title, owner…" aria-label="Search tasks" />
        <Select value={filters.workstream} onChange={(event) => setFilter("workstream", event.target.value)} aria-label="Filter workstream">
          <option value="">All workstreams</option>{workstreams.map((value) => <option key={value}>{value}</option>)}
        </Select>
        <Select value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)} aria-label="Filter priority">
          <option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}
        </Select>
        <Select value={filters.phase} onChange={(event) => setFilter("phase", event.target.value)} aria-label="Filter phase">
          <option value="">All phases</option>{phases.map((value) => <option key={value}>{value}</option>)}
        </Select>
        <Select value={filters.owner} onChange={(event) => setFilter("owner", event.target.value)} aria-label="Filter owner">
          <option value="">All owners</option>{owners.map((value) => <option key={value}>{value}</option>)}
        </Select>
        <Button type="button" variant="ghost" onClick={() => setFilters(EMPTY_TASK_FILTERS)}>Clear</Button>
        <Select
          value={grouping}
          onChange={(event) => setGrouping(event.target.value as TaskGrouping)}
          aria-label="Group tasks"
        >
          {TASK_GROUPINGS.map((value) => (
            <option key={value} value={value}>{GROUPING_LABELS[value]}</option>
          ))}
        </Select>
        <div className="view-toggle" aria-label="Task presentation">
          <button type="button" className={view === "board" ? "active" : ""} onClick={() => setBoardView("board")}>Board</button>
          <button type="button" className={view === "table" ? "active" : ""} onClick={() => setBoardView("table")}>Table</button>
        </div>
      </div>

      {/* Bulk actions appear only when a selection exists — a row action that
        * does nothing is worse than no row action (v0.5 §13). */}
      {selectableSelection && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions" data-testid="bulk-bar">
          <Checkbox
            checked
            indeterminate
            label={`${selected.size} tasks selected`}
            onCheckedChange={() => setSelected(new Set())}
          />
          <span className="bulk-bar-actions">
            <span className="mono-label">Move to</span>
            {TASK_STATUSES.map((status) => (
              <button key={status} type="button" onClick={() => bulkMove(status)}>{status}</button>
            ))}
          </span>
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      {view === "board" ? (
        lanes.length === 0 ? (
          <StateView kind="empty" message="No task matches the filter." />
        ) : (
          lanes.map((lane) => (
            <div key={lane.id || "__all__"} className="milestone-lane" data-testid={`milestone-lane-${lane.id || "unassigned"}`}>
              {grouping !== "status" ? (
                <header className="milestone-lane-head">
                  <span className="milestone-lane-label">{lane.label}</span>
                  <Chip>{lane.done}/{lane.total} done</Chip>
                </header>
              ) : null}
              <div className="kanban phase3-kanban" aria-label={lane.id ? `Kanban ${lane.label}` : "Task kanban board"}>
                {TASK_STATUSES.map((status) => renderColumn(lane, status))}
              </div>
            </div>
          ))
        )
      ) : visibleTasks.length ? (
        <div className="table-wrap phase3-table-wrap">
          <table className="task-table">
            <thead><tr><th /><th>ID</th><th>Title</th><th>Workstream</th><th>Phase</th><th>Weeks</th><th>Priority</th><th>Owner</th><th>Status</th><th>Depends</th><th /></tr></thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.id} data-testid={`task-row-${task.id}`} data-selected={selected.has(task.id)}>
                  <td>
                    <Checkbox
                      checked={selected.has(task.id)}
                      loading={pendingMoves.has(task.id)}
                      label={`Select ${task.id}`}
                      labelHidden
                      onCheckedChange={(isSelected) => toggleSelected(task.id, isSelected)}
                    />
                  </td>
                  <td>{task.id}</td><td>{task.title}</td><td>{task.workstream}</td><td>{task.phase}</td><td>{task.weeks}</td><td>{task.priority}</td><td>{task.owner}</td><td>{task.status}</td><td>{task.depends.join(", ")}</td>
                  <td className="table-actions"><button type="button" onClick={() => openEdit(task)}>Edit</button><button type="button" onClick={() => deleteTask(task)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateView kind="empty" message="No task matches the filter." />}

      <Modal open={draft !== null} title={editingId ? `Edit ${editingId}` : "New task"} onClose={closeEditor}>
        {draft && <TaskEditor draft={draft} onChange={updateDraft} />}
        {/* Cross-link back to the Portal screen this task governs (§P0.23). Only
          * rendered when the host resolved one — Planning has no registry of its
          * own to guess from. */}
        {editingId && portalScreenForTask?.(editingId) ? (
          <p className="task-portal-link">
            <a href={portalScreenForTask(editingId)!.href}>
              Open the Portal screen: {portalScreenForTask(editingId)!.label}
            </a>
          </p>
        ) : null}
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
