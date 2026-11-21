/**
 * Child-audit companion hook: one named page per request, rows of the same
 * filter appended by the server's own `next_cursor`. A changed filter or page
 * size starts over — a cursor is bound to its filter and never replayed on another.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CHILD_AUDIT_DEFAULT_PAGE_SIZE,
  childAuditCompanionApi,
  type ChildAuditCompanionPage,
  type ChildAuditCompanionRow,
  type ChildAuditContext,
} from "./childAuditCompanionClient";
import { toResearchRefusal, type ResearchRefusal } from "./researchRefusal";

export interface ChildAuditFilter {
  foldId: string;
  context: ChildAuditContext | "";
  /** Exact audit_ordinal lookup; mutually exclusive with paging. */
  ordinal: string;
  limit: number;
}

export const EMPTY_CHILD_AUDIT_FILTER: ChildAuditFilter = { foldId: "", context: "", ordinal: "", limit: CHILD_AUDIT_DEFAULT_PAGE_SIZE };

export type ChildAuditCompanionSlot =
  | { state: "idle" }
  | { state: "loading"; page: ChildAuditCompanionPage | null; rows: ChildAuditCompanionRow[] }
  | { state: "ready"; page: ChildAuditCompanionPage; rows: ChildAuditCompanionRow[] }
  | { state: "refused"; refusal: ResearchRefusal; page: ChildAuditCompanionPage | null; rows: ChildAuditCompanionRow[] };

export interface ChildAuditCompanionController {
  slot: ChildAuditCompanionSlot;
  filter: ChildAuditFilter;
  setFilter: (next: ChildAuditFilter) => void;
  /** First page of the current filter (also the retry). */
  read: () => void;
  /** The server's `next_cursor` page, appended. */
  nextPage: () => void;
}

export function useChildAuditCompanion(runId: string, workspaceId?: string): ChildAuditCompanionController {
  const [slot, setSlot] = useState<ChildAuditCompanionSlot>({ state: "idle" });
  const [filter, setFilterState] = useState<ChildAuditFilter>(EMPTY_CHILD_AUDIT_FILTER);
  const controllerRef = useRef<AbortController | null>(null);
  const slotRef = useRef(slot);
  slotRef.current = slot;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const request = useCallback(
    (cursor: string | null, keep: ChildAuditCompanionRow[], keepPage: ChildAuditCompanionPage | null, f: ChildAuditFilter) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setSlot({ state: "loading", page: keepPage, rows: keep });
      const ordinal = f.ordinal.trim() === "" ? undefined : Number(f.ordinal);
      childAuditCompanionApi
        .get(
          runId,
          {
            workspace_id: workspaceId,
            fold_id: f.foldId.trim() || undefined,
            context: f.context || undefined,
            audit_ordinal: ordinal !== undefined && Number.isInteger(ordinal) && ordinal >= 0 ? ordinal : undefined,
            limit: f.limit,
            cursor: cursor ?? undefined,
          },
          controller.signal,
        )
        .then((page) => {
          if (controller.signal.aborted) return;
          setSlot({ state: "ready", page, rows: [...keep, ...page.rows] });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSlot({ state: "refused", refusal: toResearchRefusal(error), page: keepPage, rows: keep });
        });
    },
    [runId, workspaceId],
  );

  const read = useCallback(() => request(null, [], null, filter), [request, filter]);
  const nextPage = useCallback(() => {
    const current = slotRef.current;
    if (current.state !== "ready" || !current.page.next_cursor) return;
    request(current.page.next_cursor, current.rows, current.page, filter);
  }, [request, filter]);
  const setFilter = useCallback((next: ChildAuditFilter) => {
    controllerRef.current?.abort();
    setFilterState(next);
    setSlot({ state: "idle" });
  }, []);

  return { slot, filter, setFilter, read, nextPage };
}
