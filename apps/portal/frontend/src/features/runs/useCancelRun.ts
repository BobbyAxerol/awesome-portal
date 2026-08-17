/**
 * Cancel a run.
 *
 * Cancelling is destructive and irreversible, so it confirms first and it is
 * only offered while the run can still be cancelled. `isTerminal` is the single
 * authority for that: a COMPLETED/FAILED/CANCELLED run has nothing to stop, and
 * offering a control that cannot work is worse than not offering it (v0.5 §13 —
 * a row action appears only when the action really exists).
 *
 * Writes are ADMIN-only at the gateway. This hook does not decide that; it
 * surfaces what the server answered, and a 403 reads as "not permitted" rather
 * than as a failure of the run.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PortalApiError, api, isTerminal } from "../../lib/api";

export interface CancelState {
  /** Whether a Cancel control should exist for this run at all. */
  cancellable: boolean;
  /** True while the request is in flight. */
  pending: boolean;
  /** Set when the session may not cancel — distinct from a failed cancel. */
  denied: string | null;
  /** Any other failure, in the server's words. */
  error: string | null;
  requestId: string | null;
  /** Asks for confirmation, then cancels. */
  cancel: (runId: string) => void;
}

/**
 * `window.confirm` rather than a custom modal.
 *
 * It cannot be missed, cannot be styled away, and cannot be dismissed by a
 * stray click — which is the point for an irreversible action. A prettier
 * dialog here would trade safety for polish.
 */
function confirmCancel(runId: string): boolean {
  return window.confirm(
    `Hủy run ${runId}?\n\nRun đang chạy sẽ bị dừng và không thể tiếp tục. ` +
      `Artifact đã ghi vẫn được giữ.`,
  );
}

export function useCancelRun(status: string | null | undefined): CancelState {
  const queryClient = useQueryClient();
  const [denied, setDenied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (runId: string) => api.cancelRun(runId),
    onSuccess: (_result, runId) => {
      // The server owns the next state (CANCELLING, then CANCELLED), so the
      // queries are invalidated rather than patched with a guess.
      void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    onError: (failure: unknown) => {
      if (failure instanceof PortalApiError && failure.isForbidden) {
        setDenied(failure.message || "Không đủ quyền hủy run. Mutation là ADMIN-only ở gateway.");
        return;
      }
      setError(failure instanceof Error ? failure.message : "Không hủy được run.");
      setRequestId(failure instanceof PortalApiError ? failure.requestId : null);
    },
  });

  return {
    // `null`/unknown status is NOT treated as cancellable: without a state we
    // cannot say the run is still running.
    cancellable: typeof status === "string" && status.length > 0 && !isTerminal(status),
    pending: mutation.isPending,
    denied,
    error,
    requestId,
    cancel: (runId: string) => {
      if (mutation.isPending) return;
      setDenied(null);
      setError(null);
      setRequestId(null);
      if (!confirmCancel(runId)) return;
      mutation.mutate(runId);
    },
  };
}
