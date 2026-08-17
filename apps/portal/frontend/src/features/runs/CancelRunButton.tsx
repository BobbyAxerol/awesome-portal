/**
 * Cancel control for a run.
 *
 * Renders nothing for a terminal run — there is no action to offer. When the
 * session lacks the right, the reason is shown next to the control rather than
 * swallowed, because "you cannot do this" and "this failed" are different facts.
 */
import { XCircle } from "lucide-react";

import { useCancelRun } from "./useCancelRun";

export function CancelRunButton({
  runId,
  status,
  compact = false,
}: {
  runId: string;
  status: string | null | undefined;
  /** Table rows use the compact form; a screen header uses the full one. */
  compact?: boolean;
}) {
  const cancel = useCancelRun(status);

  if (!cancel.cancellable) return null;

  return (
    <span className="cancel-run">
      <button
        type="button"
        className={`btn-ghost no-print cancel-run-btn${compact ? " cancel-run-compact" : ""}`}
        aria-label={`Hủy run ${runId}`}
        disabled={cancel.pending}
        onClick={(event) => {
          event.stopPropagation();
          cancel.cancel(runId);
        }}
      >
        <XCircle size={compact ? 11 : 13} aria-hidden="true" />
        {compact ? null : cancel.pending ? "Đang hủy…" : "Hủy run"}
      </button>

      {cancel.denied ? (
        <span className="cancel-run-denied" role="alert">
          {cancel.denied}
        </span>
      ) : null}
      {cancel.error ? (
        <span className="cancel-run-error" role="alert">
          {cancel.error}
          {cancel.requestId ? <span className="mono"> · request_id {cancel.requestId}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
