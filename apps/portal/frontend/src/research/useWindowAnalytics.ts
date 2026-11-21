/**
 * Screen 04 · the completed-window analytics of one run, read once per (window, fold) the reader opens.
 *
 * One request per selector, aborted when the run or workspace changes, never polled: the block is immutable at its revision. A refusal
 * keeps its status and code so the screen can tell "this window has no block" (typed absence in a 200) from "this server cannot answer"
 * (404/405/501: the screen then falls back to what it showed before this read existed) from a real failure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalApiError } from "../lib/api";
import { windowExecutionApi, type WindowExecutionPage, type WindowScope } from "./windowExecutionClient";

export type WindowSlot =
  | { state: "loading" }
  | { state: "ready"; page: WindowExecutionPage }
  | { state: "unavailable" }
  | { state: "failed"; status: number | null; code: string | null };

export const scopeKey = (scope: WindowScope): string => `${scope.window}|${scope.foldId ?? ""}`;

/** A server that does not have the route (older preview): the screen keeps its previous source for this window. */
const isMissingRoute = (error: unknown): boolean => error instanceof PortalApiError && [404, 405, 501].includes(error.status) && (error.code === null || !error.code.startsWith("RESEARCH_"));

export interface WindowAnalyticsController {
  slot: (scope: WindowScope | null) => WindowSlot | null;
  ensure: (scope: WindowScope) => void;
}

export function useWindowAnalytics(runId: string, workspaceId?: string): WindowAnalyticsController {
  const [slots, setSlots] = useState<ReadonlyMap<string, WindowSlot>>(new Map());
  const asked = useRef<Set<string>>(new Set());
  const controllers = useRef<Set<AbortController>>(new Set());

  /* A new run (or workspace) is a new question: every answer belongs to the old one, and any read still in flight is dropped. */
  useEffect(() => {
    asked.current = new Set();
    setSlots(new Map());
    return () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current = new Set();
    };
  }, [runId, workspaceId]);

  const ensure = useCallback(
    (scope: WindowScope) => {
      const key = scopeKey(scope);
      if (asked.current.has(key)) return;
      asked.current.add(key);
      const controller = new AbortController();
      controllers.current.add(controller);
      setSlots((previous) => new Map(previous).set(key, { state: "loading" }));
      windowExecutionApi
        .analytics(runId, scope, { workspaceId, signal: controller.signal })
        .then((page) => {
          if (controller.signal.aborted) return;
          setSlots((previous) => new Map(previous).set(key, { state: "ready", page }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSlots((previous) =>
            new Map(previous).set(
              key,
              isMissingRoute(error)
                ? { state: "unavailable" }
                : { state: "failed", status: error instanceof PortalApiError ? error.status : null, code: error instanceof PortalApiError ? error.code : null },
            ),
          );
        })
        .finally(() => controllers.current.delete(controller));
    },
    [runId, workspaceId],
  );

  const slot = useCallback((scope: WindowScope | null) => (scope === null ? null : (slots.get(scopeKey(scope)) ?? null)), [slots]);
  return useMemo(() => ({ slot, ensure }), [slot, ensure]);
}

export const IDLE_WINDOW_ANALYTICS: WindowAnalyticsController = { slot: () => null, ensure: () => undefined };
