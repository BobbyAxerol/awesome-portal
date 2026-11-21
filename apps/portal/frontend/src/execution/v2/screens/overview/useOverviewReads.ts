/**
 * The reads behind the Overview, and the Command Centre stream gate.
 *
 * - the command-center COMPOSITION (`getOperationalComposition`): the snapshot
 *   plus per-profile source health, re-read on the projection cadence. A failed
 *   re-read keeps the last good snapshot and reports `stale` (a flaky read does
 *   not blank the page);
 * - the Fleet register, 50 alphas (`getAlphaFleet`): its summary carries the
 *   current per-currency allocation and exposure and the stage counts;
 * - the operations queue (V2, `listOperationalQueueV2`), one row: its
 *   `filteredCount` is the server's count of operations awaiting
 *   acknowledgement, from the same snapshot as its page.
 *
 * Stream semantics are V1's (`useCommandCentreStream`): nothing connects unless
 * the snapshot publishes `stream_available`; the gate's sentence is shown when
 * it does not. A realtime notification is only ever a reason to re-read. It is
 * not an event, is never counted and never appears in a feed.
 */
import { useEffect, useMemo, useState } from "react";

import type { ExecutionApi, Result } from "../../../api/ports";
import type { AlphaFleetItem, AlphaFleetSummary } from "../../../api/profileRead";
import { readCommandCenter, type CommandCenter } from "../../../commandCenter";
import type { PanelStatus } from "../../../contracts";
import type { OperationalComposition } from "../../../operationalComposition";
import type { SseFactory } from "../../../sse";
import { useCommandCentreStream } from "../../../commandCenterStream";
import { PROJECTION_POLL_MS, usePollTick } from "../../../useRevision";
import type { OperationalQueueV2 } from "../../readers/operationalQueue";
import { fetchCommandCenterResume } from "./stream";

export type Read<T> =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; value: T; stale: string | null };

const failure = (result: Extract<Result<unknown>, { ok: false }>): Extract<Read<never>, { phase: "error" }> => ({
  phase: "error",
  status: result.status === "loading" ? "unavailable" : result.status,
  reason: result.reason,
});

/**
 * Run `read` now and whenever `deps` change. With `keep`, a failed re-read of
 * the same identity leaves the last good value on screen, marked stale.
 */
function useRead<T>(read: () => Promise<Result<T>>, deps: readonly unknown[], identity: string, keep: boolean, enabled = true): Read<T> {
  const [state, setState] = useState<Read<T>>({ phase: "loading" });
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    // A read that is not enabled asks nothing and stays "loading"; the caller does not render it.
    if (!enabled) return undefined;
    let cancelled = false;
    const same = last === identity;
    if (!same) {
      setState({ phase: "loading" });
      setLast(identity);
    }
    read().then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setState({ phase: "ready", value: result.value, stale: null });
        else setState((prev) => (keep && prev.phase === "ready" && same ? { ...prev, stale: result.reason } : failure(result)));
      },
      () => {
        if (!cancelled) setState((prev) => (keep && prev.phase === "ready" && same ? { ...prev, stale: "PORTAL_READ_FAILED" } : { phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" }));
      },
    );
    return () => {
      cancelled = true;
    };
    // `read` closes over the deps listed; the identity string is what says the question changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export interface FleetRegister {
  items: readonly AlphaFleetItem[];
  summary: AlphaFleetSummary | null;
  totalCount: number;
  freshness: string;
  completeness: string;
}

export interface OverviewReads {
  composition: Read<OperationalComposition>;
  /** The snapshot inside the composition, or null when the composition carried none the reader accepts. */
  snapshot: CommandCenter | null;
  snapshotUnreadable: boolean;
  fleet: Read<FleetRegister>;
  operations: Read<OperationalQueueV2 | "unsupported">;
  stream: ReturnType<typeof useCommandCentreStream>;
  reload(): void;
}

const defaultFactory: SseFactory = (url) => new EventSource(url);

export function useOverviewReads(api: ExecutionApi, workspaceId: string | undefined, sseFactory: SseFactory | null | undefined): OverviewReads {
  const tick = usePollTick(PROJECTION_POLL_MS);
  const [manual, setManual] = useState(0);
  const scope = `${workspaceId ?? ""}`;

  const composition = useRead(
    () => api.getOperationalComposition("command-center", workspaceId ? { workspace_id: workspaceId } : undefined),
    [api, tick, manual, scope],
    `composition|${scope}`,
    true,
  );
  const fleet = useRead<FleetRegister>(
    () => api.getAlphaFleet({ limit: 50 }).then((result): Result<FleetRegister> =>
      result.ok
        ? {
            ok: true,
            value: {
              items: result.value.page.rows,
              summary: result.value.summary ?? null,
              totalCount: result.value.page.totalCount,
              freshness: result.value.freshness,
              completeness: result.value.completeness,
            },
          }
        : result),
    [api, manual],
    "fleet",
    true,
  );
  const operations = useRead<OperationalQueueV2 | "unsupported">(
    () => api.listOperationalQueueV2({ workspaceId, triageState: "UNACKNOWLEDGED", limit: 1 }).then((result): Result<OperationalQueueV2 | "unsupported"> =>
      result.ok ? { ok: true, value: result.value.kind === "queue" ? result.value.queue : "unsupported" } : result),
    [api, tick, manual, scope],
    `operations|${scope}`,
    true,
  );

  const snapshot = useMemo(
    () => (composition.phase === "ready" ? readCommandCenter(composition.value.data.command_center) : null),
    [composition],
  );
  const factory = useMemo<SseFactory | null>(
    () => (sseFactory === undefined ? (typeof EventSource === "undefined" ? null : defaultFactory) : sseFactory),
    [sseFactory],
  );
  const stream = useCommandCentreStream({ snapshot, factory, fetchSnapshot: fetchCommandCenterResume });

  return {
    composition,
    snapshot,
    snapshotUnreadable: composition.phase === "ready" && snapshot === null,
    fleet,
    operations,
    stream,
    reload: () => setManual((n) => n + 1),
  };
}
