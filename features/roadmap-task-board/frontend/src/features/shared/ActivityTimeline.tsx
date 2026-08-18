import { useCallback, useEffect, useState } from "react";
import { Button, Modal, StateView } from "@/components/ui";
import { activityV1, type ActivityEvent, type CollectionName } from "@/lib/api";

type TimelineEvent = ActivityEvent<Record<string, unknown>>;

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    "task.created": "Task created",
    "task.updated": "Task updated",
    "task.reordered": "Task reordered",
    "task.status_changed": "Task status changed",
    "task.deleted": "Task deleted",
    "task.restored": "Task restored",
    "task.snapshot_replaced": "Task snapshot replaced",
    "roadmap_phase.created": "Phase created",
    "roadmap_phase.updated": "Phase updated",
    "roadmap_phase.reordered": "Phase reordered",
    "roadmap_phase.rescheduled": "Phase rescheduled",
    "roadmap_phase.deleted": "Phase deleted",
    "roadmap_phase.restored": "Phase restored",
    "roadmap.snapshot_replaced": "Roadmap snapshot replaced",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function formatTime(value: string): string {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : instant.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
}

function eventDetail(event: TimelineEvent): string | null {
  const changed = event.metadata.changed_fields;
  if (Array.isArray(changed) && changed.every((field) => typeof field === "string")) {
    return changed.length ? `Changed: ${changed.join(", ")}` : null;
  }
  const from = event.metadata.from_status;
  const to = event.metadata.to_status;
  if (typeof from === "string" && typeof to === "string") return `${from} → ${to}`;
  if (event.metadata.source === "legacy_snapshot") return "Compatibility snapshot";
  return null;
}

/**
 * Read-only, on-demand audit history for the V1 workspace.  It deliberately
 * has no polling: a manager opens it or presses Refresh when they need it.
 */
export function ActivityTimeline({
  collection,
  entityId,
  entityLabel,
  open,
  onClose,
}: {
  collection: CollectionName;
  entityId: string;
  entityLabel: string;
  open: boolean;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    setState("loading");
    setError(null);
    try {
      setEvents(await activityV1<Record<string, unknown>>(collection, entityId));
      setState("idle");
    } catch (failure) {
      setState("error");
      setError(failure instanceof Error ? failure.message : "The activity history could not be loaded.");
    }
  }, [collection, entityId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  return (
    <Modal open={open} title={`Activity · ${entityLabel}`} onClose={onClose}>
      <div className="activity-timeline-actions">
        <p>Immutable server audit history. Notes and webhook secrets are never shown here.</p>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={state === "loading"}>Refresh</Button>
      </div>
      {state === "loading" && !events.length ? <StateView kind="loading" message="Loading activity history…" /> : null}
      {state === "error" ? <StateView kind="failed" message={error ?? undefined} /> : null}
      {state !== "loading" && state !== "error" && !events.length ? <StateView kind="empty" message="No activity yet." /> : null}
      {events.length ? (
        <ol className="activity-timeline" data-testid={`activity-timeline-${collection}-${entityId}`}>
          {events.map((event) => {
            const detail = eventDetail(event);
            return (
              <li key={event.id} className="activity-entry">
                <div>
                  <strong>{eventLabel(event.type)}</strong>
                  <span>{formatTime(event.occurred_at)}</span>
                </div>
                <p>{event.actor || "system"}{detail ? ` · ${detail}` : ""}</p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </Modal>
  );
}
