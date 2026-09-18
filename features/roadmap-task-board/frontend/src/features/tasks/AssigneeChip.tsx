import { TASK_ASSIGNEES, UNASSIGNED, type TaskAssignee } from "./task-model";

/**
 * The person a task is assigned to, drawn the same way everywhere.
 *
 * Colour is derived from the roster position rather than hashed from the name,
 * so the three people keep the same colour for the life of the board and a
 * reader can learn them. Colour is never the only signal — the name is always
 * printed beside it, because a board read at a glance by one person is still
 * read carefully by another.
 *
 * `Unassigned` is drawn as its own muted state rather than as an empty chip:
 * "nobody has picked this up" is a fact, and §3.3 is clear that a missing
 * value must not be rendered as a blank that could be mistaken for a bug.
 */
export function AssigneeChip({ assignee, compact = false }: { assignee: TaskAssignee; compact?: boolean }) {
  const unassigned = assignee === UNASSIGNED;
  const slot = Math.max(0, TASK_ASSIGNEES.indexOf(assignee));
  return (
    <span
      className={`assignee-chip${compact ? " assignee-chip-compact" : ""}`}
      data-assignee={assignee}
      data-slot={slot}
      data-unassigned={unassigned}
      title={unassigned ? "Nobody has picked this up yet" : `Assigned to ${assignee}`}
    >
      <span className="assignee-dot" aria-hidden="true">
        {unassigned ? "·" : assignee.slice(0, 1).toUpperCase()}
      </span>
      {/*
       * On a card the name is dropped when nobody is assigned.
       *
       * Every task starts unassigned, so printing the word on every card put a
       * second line on all of them and made "nobody" the loudest thing on the
       * board. The dashed ring still holds the slot, so absence is visible and
       * distinguishable from a card that simply does not show the field — and
       * the screen reader still hears the full state from the title.
       */}
      {compact && unassigned ? null : <span className="assignee-name">{assignee}</span>}
    </span>
  );
}
