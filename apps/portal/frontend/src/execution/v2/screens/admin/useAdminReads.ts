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
 */
import { useCallback, useEffect, useState } from "react";

import type { CommandCatalogue } from "../../../adminCatalog";
import type { ExecutionApi, Result } from "../../../api/ports";
import type { OperatorTaskCatalogue } from "../../../api/profileRead";
import type { PanelStatus } from "../../../contracts";
import type { OperationalComposition } from "../../../operationalComposition";
import type { StagedActivation } from "../../../stagedActivation";

export type ReadState<T> =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; value: T; warnings: readonly string[] };

const loading = { phase: "loading" } as const;

function settle<T>(result: Result<T>): ReadState<T> {
  if (result.ok) return { phase: "ready", value: result.value, warnings: result.warnings ?? [] };
  return { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

const failed = (): ReadState<never> => ({ phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" });

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

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const scoped = api.withReadSignal?.(controller.signal) ?? api;
    const run = <T>(read: () => Promise<Result<T>>, set: (state: ReadState<T>) => void) => {
      read().then(
        (result) => { if (!cancelled) set(settle(result)); },
        () => { if (!cancelled) set(failed()); },
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
  return { tasks, catalogue, composition, activation, reload };
}
