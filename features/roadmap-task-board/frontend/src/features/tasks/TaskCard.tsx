/**
 * Task card.
 *
 * Two things beyond display: it is the drag source, and it is the keyboard
 * path for moving a task. Drag-and-drop is a mouse-only affordance, so the
 * same move is reachable with the arrow keys on a focused card — otherwise the
 * board's primary action would be unavailable to a keyboard user (v0.4 §26.4).
 */
import type { DragEvent, KeyboardEvent } from "react";

import { Checkbox, Chip } from "@/components/ui";
import { workstreamVar } from "@/lib/workstream";

import type { Task, TaskStatus } from "./task-model";

function statusTone(status: TaskStatus): "neutral" | "accent" | "good" | "bad" {
  if (status === "Done") return "good";
  if (status === "In Progress") return "accent";
  if (status === "Validating") return "bad";
  return "neutral";
}

export interface TaskCardProps {
  task: Task;
  /** Identity slot of the task's workstream; 0 is the neutral overflow slot. */
  slot: number;
  /** A move for this task is in flight. */
  pending: boolean;
  selected: boolean;
  selectable: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onActivity: (() => void) | null;
  /** Keyboard move: -1 one column left, +1 one column right. */
  onNudge: (direction: -1 | 1) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function TaskCard({
  task,
  slot,
  pending,
  selected,
  selectable,
  onSelect,
  onEdit,
  onDelete,
  onActivity,
  onNudge,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit();
      return;
    }
    // Alt keeps the plain arrows free for scrolling the column.
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      onNudge(event.key === "ArrowLeft" ? -1 : 1);
    }
  };

  return (
    <article
      className="task-card phase3-task-card"
      data-testid={`task-card-${task.id}`}
      data-pending={pending}
      data-selected={selected}
      style={{ "--task-hue": workstreamVar(slot) } as React.CSSProperties}
      draggable={!pending}
      aria-busy={pending || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="task-card-head">
        {selectable && (
          <Checkbox
            checked={selected}
            loading={pending}
            label={`Chọn ${task.id}`}
            labelHidden
            onCheckedChange={onSelect}
          />
        )}
        <button
          type="button"
          className="task-open"
          aria-label={`Mở task ${task.id}`}
          onClick={onEdit}
          onKeyDown={onKeyDown}
        >
          <span className="task-id mono">{task.id}</span>
          <span className="task-title">{task.title}</span>
        </button>
        <button
          type="button"
          className="task-del"
          aria-label={`Xóa task ${task.id}`}
          onClick={onDelete}
        >
          ×
        </button>
      </div>

      <div className="task-meta">
        <Chip tone={statusTone(task.status)}>{task.priority}</Chip>
        {task.phase && <Chip>{task.phase}</Chip>}
        {task.weeks && <Chip>{task.weeks}</Chip>}
        <Chip>{task.owner}</Chip>
      </div>

      {task.workstream && (
        <p className="task-workstream">
          <span className="task-workstream-swatch" aria-hidden="true" />
          {task.workstream}
        </p>
      )}
      {task.depends.length > 0 && <p className="task-depends">Depends: {task.depends.join(", ")}</p>}

      <div className="task-card-foot">
        {pending ? <span className="task-pending mono">đang lưu…</span> : <span />}
        {onActivity && (
          <button type="button" className="task-activity" onClick={onActivity}>
            Activity
          </button>
        )}
      </div>
    </article>
  );
}
