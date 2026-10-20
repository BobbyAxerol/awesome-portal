/**
 * The reads behind Live operations, through the version-aware port (`getLiveFullVersioned`).
 *
 * `useLiveRead` is the first read: the body the route answers (V1, V2 or `unsupported`). It reads once
 * when the screen opens and again on `reload()`; nothing refreshes by itself.
 *
 * `usePanelPaging` is the keyset `Load more` of a V2 body. Each of the ten pageable panels has its own
 * continuation, issued by the server for that panel, and the continuation is passed back unchanged
 * (opaque, never parsed, never put in the page URL). A page answers all eleven panels, so only the
 * requested one is taken; the others are ignored, not merged. A continuation the server no longer
 * accepts (a refusal that carries a cursor code: `CURSOR_EXPIRED`, `INVALID_CURSOR`,
 * `EXECUTION_READ_CURSOR_INVALID`) restarts THAT panel from its first page and says so; any other failure
 * (network, 404, 5xx, denied) is reported as it is and the rows already shown stay, as they do when the
 * restart itself fails. At most `ROW_CAP` rows are ever held for a panel: past that the screen sends the
 * operator to the Blotter instead of growing the list without bound.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExecutionApi, Result } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { unsupportedText, type LiveFullVersionRead, type StageInclude } from "../../readers/dispatch";
import type { LiveSourceOperationsV2, LiveSourcePanelName, LiveSourceRecordV2 } from "../../readers/liveSourceOperations";
import { readCursorFailure } from "../../../cursorFailure";
import { ROW_CAP, panelTitle } from "./model";

/**
 * BE-P12: the FIRST read asks for the deployment's identity and its stage facts; the legacy body already carries both and
 * ignores the query. The keyset pages that follow do not ask again (they take one panel and leave the rest).
 */
const LIVE_INCLUDE: readonly StageInclude[] = ["identity", "stage_facts"];

export type LiveReadState =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; read: LiveFullVersionRead };

export interface LiveReadHandle {
  state: LiveReadState;
  reload(): void;
}

/** The first read of a deployment's Live body. A new deployment or workspace is another question: the old answer is dropped. */
export function useLiveRead(api: ExecutionApi, deploymentId: string, workspaceId: string | undefined): LiveReadHandle {
  const [tick, setTick] = useState(0);
  const key = `${deploymentId}|${workspaceId ?? ""}|${tick}`;
  const [held, setHeld] = useState<{ key: string; state: LiveReadState }>({ key, state: { phase: "loading" } });

  useEffect(() => {
    const abort = new AbortController();
    setHeld({ key, state: { phase: "loading" } });
    const scoped = api.withReadSignal?.(abort.signal) ?? api;
    void scoped
      .getLiveFullVersioned(deploymentId, workspaceId ? { workspaceId, include: LIVE_INCLUDE } : { include: LIVE_INCLUDE })
      .then((result) => {
        if (abort.signal.aborted) return;
        setHeld({
          key,
          state: result.ok
            ? { phase: "ready", read: result.value }
            : { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason },
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) setHeld({ key, state: { phase: "error", status: "unavailable", reason: "The read failed before the Portal answered." } });
      });
    return () => abort.abort();
  }, [api, deploymentId, workspaceId, key]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  // Hide an old answer for one frame after the question changed.
  return { state: held.key === key ? held.state : { phase: "loading" }, reload };
}

/* ── keyset paging of the V2 panels ───────────────────────────────────────── */

export interface PanelPage {
  records: readonly LiveSourceRecordV2[];
  hasMore: boolean;
  /** The server's continuation for this panel. Opaque. */
  nextCursor: string | null;
  loading: boolean;
  /** Why the last `Load more` failed. The rows already shown stay. */
  error: string | null;
  /** One line after a restart (an expired continuation). */
  notice: string | null;
}

/**
 * Whether a refusal says the continuation itself is no longer usable. Anything else is not a reason to
 * throw the loaded rows away: it is an error to report. Codes are matched as whole tokens.
 */
export function isCursorRestart(reason: string): boolean {
  return readCursorFailure(reason) !== null || /(^|[^A-Z_])EXECUTION_READ_CURSOR_INVALID([^A-Z_]|$)/.test(reason);
}

export interface PanelPaging {
  page(name: LiveSourcePanelName): PanelPage;
  loadMore(name: LiveSourcePanelName): void;
}

const NO_PAGE: PanelPage = { records: [], hasMore: false, nextCursor: null, loading: false, error: null, notice: null };

function firstPage(v2: LiveSourceOperationsV2 | null, name: LiveSourcePanelName): PanelPage {
  const panel = v2?.panels[name];
  if (panel === undefined) return NO_PAGE;
  return { records: panel.records, hasMore: panel.hasMore, nextCursor: panel.nextCursor, loading: false, error: null, notice: null };
}

interface Held {
  base: LiveSourceOperationsV2 | null;
  pages: Partial<Record<LiveSourcePanelName, PanelPage>>;
}

export function usePanelPaging(api: ExecutionApi, deploymentId: string, workspaceId: string | undefined, v2: LiveSourceOperationsV2 | null): PanelPaging {
  const [held, setHeld] = useState<Held>({ base: v2, pages: {} });
  // A new first read (reload, another deployment) starts every panel over.
  const own = held.base === v2 ? held.pages : {};
  const ownRef = useRef(own);
  ownRef.current = own;
  const baseRef = useRef(v2);
  baseRef.current = v2;
  const busy = useRef(new Set<LiveSourcePanelName>());
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    busy.current = new Set();
    controller.current?.abort();
    controller.current = new AbortController();
    setHeld({ base: v2, pages: {} });
    return () => controller.current?.abort();
  }, [v2]);

  const patch = useCallback((name: LiveSourcePanelName, base: LiveSourceOperationsV2 | null, change: (current: PanelPage) => PanelPage) => {
    setHeld((h) => {
      if (h.base !== base) return h;
      const current = h.pages[name] ?? firstPage(base, name);
      return { base, pages: { ...h.pages, [name]: change(current) } };
    });
  }, []);

  const page = useCallback((name: LiveSourcePanelName): PanelPage => own[name] ?? firstPage(v2, name), [own, v2]);

  const loadMore = useCallback(
    (name: LiveSourcePanelName) => {
      const base = baseRef.current;
      const current = ownRef.current[name] ?? firstPage(base, name);
      const after = current.nextCursor;
      if (base === null || after === null || busy.current.has(name) || current.records.length >= ROW_CAP) return;
      busy.current.add(name);
      const abort = controller.current ?? new AbortController();
      const scoped = api.withReadSignal?.(abort.signal) ?? api;
      const options = (cursor: string | null) => ({ ...(workspaceId ? { workspaceId } : {}), panel: name, ...(cursor === null ? {} : { cursor }) });
      patch(name, base, (c) => ({ ...c, loading: true, error: null }));

      const take = (result: Result<LiveFullVersionRead>): { records: readonly LiveSourceRecordV2[]; hasMore: boolean; nextCursor: string | null } | { failure: string } => {
        if (!result.ok) return { failure: result.reason };
        const read = result.value;
        if (read.kind === "unsupported") return { failure: unsupportedText(read) };
        if (read.kind !== "v2") return { failure: "The next page came back as another version of this body, so it is not shown." };
        const next = read.value.panels[name];
        return { records: next.records, hasMore: next.hasMore, nextCursor: next.nextCursor };
      };

      void (async () => {
        try {
          const result = await scoped.getLiveFullVersioned(deploymentId, options(after));
          if (abort.signal.aborted) return;
          const got = take(result);
          if (!("failure" in got)) {
            patch(name, base, (c) => {
              const known = new Set(c.records.map((r) => r.observationId));
              const merged = [...c.records, ...got.records.filter((r) => !known.has(r.observationId))];
              // Never hold more than the cap; rows cut off here are still "more available".
              const records = merged.slice(0, ROW_CAP);
              return { ...c, records, hasMore: got.hasMore || records.length < merged.length, nextCursor: got.nextCursor, loading: false, error: null, notice: null };
            });
            return;
          }
          // A continuation the server rejects by its cursor code: restart THIS panel from its first page. Any other
          // failure (network, 404, 5xx, denied, rate limited, terminal) is reported and the loaded rows stay.
          if (!result.ok && isCursorRestart(result.reason)) {
            const again = take(await scoped.getLiveFullVersioned(deploymentId, options(null)));
            if (abort.signal.aborted) return;
            if (!("failure" in again)) {
              patch(name, base, (c) => ({
                ...c, records: again.records, hasMore: again.hasMore, nextCursor: again.nextCursor, loading: false, error: null,
                notice: `The continuation for ${panelTitle(name).toLowerCase()} expired, so the list restarted from its first page.`,
              }));
              return;
            }
          }
          patch(name, base, (c) => ({ ...c, loading: false, error: got.failure }));
        } catch {
          if (!abort.signal.aborted) patch(name, base, (c) => ({ ...c, loading: false, error: "The page could not be read." }));
        } finally {
          busy.current.delete(name);
        }
      })();
    },
    [api, deploymentId, workspaceId, patch],
  );

  return useMemo(() => ({ page, loadMore }), [page, loadMore]);
}
