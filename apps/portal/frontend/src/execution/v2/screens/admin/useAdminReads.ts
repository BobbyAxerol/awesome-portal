/**
 * The four reads behind Admin Actions, each with its own state so one failure
 * does not take the others down (a catalogue that cannot be joined still
 * leaves the task list, and the page says so).
 *
 * - `getOperatorTasks`            the list on screen (the primary read);
 * - `getCommandCatalogue`         the route and reason join (ADMIN only);
 * - `getOperationalComposition`   the command authority and the redacted journal;
 * - `getActivationCapabilities`   the first reason nothing is live.
 *
 * None of them polls: the catalogue is a revisioned document and the screen
 * offers a Refresh instead of a timer. `reload` re-asks all four.
 *
 * A refresh that fails (not denied) after a good read keeps that read and marks
 * it `stale` with the reason, so the screen can show the last good rows demoted
 * instead of blanking them. A first read that fails has nothing to keep, and a
 * denial is a fact about now: it replaces what was shown. A change of API or
 * workspace is a different session of reads: nothing carries over.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { CommandCatalogue } from "../../../adminCatalog";
import type { ExecutionApi, Result } from "../../../api/ports";
import type { OperatorTaskCatalogue } from "../../../api/profileRead";
import type { PanelStatus } from "../../../contracts";
import type { OperationalComposition } from "../../../operationalComposition";
import type { StagedActivation } from "../../../stagedActivation";

export type ReadState<T> =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; value: T; warnings: readonly string[]; stale?: { reason: string } };

const loading = { phase: "loading" } as const;

function settle<T>(result: Result<T>, prev: ReadState<T>): ReadState<T> {
  if (result.ok) return { phase: "ready", value: result.value, warnings: result.warnings ?? [] };
  if (prev.phase === "ready" && result.status !== "denied") return { ...prev, stale: { reason: result.reason } };
  return { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

const failed = <T,>(prev: ReadState<T>): ReadState<T> =>
  prev.phase === "ready" ? { ...prev, stale: { reason: "PORTAL_READ_FAILED" } } : { phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" };

export interface AdminReads {
  tasks: ReadState<OperatorTaskCatalogue>;
  catalogue: ReadState<CommandCatalogue>;
  composition: ReadState<OperationalComposition>;
  activation: ReadState<StagedActivation>;
  reload(): void;
}

export function useAdminReads(api: ExecutionApi, workspaceId?: string): AdminReads {
  const [tasks, setTasks] = useState<ReadState<OperatorTaskCatalogue>>(loading);
  const [catalogue, setCatalogue] = useState<ReadState<CommandCatalogue>>(loading);
  const [composition, setComposition] = useState<ReadState<OperationalComposition>>(loading);
  const [activation, setActivation] = useState<ReadState<StagedActivation>>(loading);
  const [tick, setTick] = useState(0);

  const scope = useRef({ api, workspaceId });
  // On the render where the scope changes, the states above still hold the old session's reads (they are
  // reset in the effect below). Nothing of them may reach the caller: report loading until the reset lands.
  const switching = scope.current.api !== api || scope.current.workspaceId !== workspaceId;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    if (scope.current.api !== api || scope.current.workspaceId !== workspaceId) {
      scope.current = { api, workspaceId };
      setTasks(loading);
      setCatalogue(loading);
      setComposition(loading);
      setActivation(loading);
    }
    const scoped = api.withReadSignal?.(controller.signal) ?? api;
    const run = <T>(read: () => Promise<Result<T>>, set: Dispatch<SetStateAction<ReadState<T>>>) => {
      read().then(
        (result) => { if (!cancelled) set((prev) => settle(result, prev)); },
        () => { if (!cancelled) set((prev) => failed(prev)); },
      );
    };
    run(() => scoped.getOperatorTasks(), setTasks);
    run(() => scoped.getCommandCatalogue(workspaceId ? { workspaceId } : undefined), setCatalogue);
    run(() => scoped.getOperationalComposition("admin-action-drawer"), setComposition);
    run(() => scoped.getActivationCapabilities(), setActivation);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, workspaceId, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  if (switching) return { tasks: loading, catalogue: loading, composition: loading, activation: loading, reload };
  return { tasks, catalogue, composition, activation, reload };
}
