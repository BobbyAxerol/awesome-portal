/**
 * Screen 09's bounded export — one job per format, polled only while it can
 * still change.
 *
 * What sends a request:
 *
 *  - the reader pressing Export JSON or Export CSV (one POST; a duplicate
 *    click while a job is pending sends nothing, and the server returns the
 *    same job for a duplicate that does arrive);
 *  - one status read per format every `intervalMs` while that job is
 *    `QUEUED` or `RUNNING`, and while the page is visible.
 *
 * What stops it: a terminal state (`READY`/`FAILED`), a refusal, the route
 * unmounting, or the page hiding — polling picks up again when the page is
 * visible and the job is still pending. A `409` on create keeps whatever job
 * is already held and asks for nothing else. `READY` exposes the server's
 * opaque `download_href`; nothing is downloaded by this hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  EXPORT_FORMATS,
  exportPending,
  reportApi,
  toReportRefusal,
  type ExportFormat,
  type ExportJob,
  type ReportRefusal,
} from "./reportClient";

/** The one polling interval the handoff allows. */
export const EXPORT_POLL_MS = 2000;

export interface ExportSlot {
  job: ExportJob | null;
  refusal: ReportRefusal | null;
  creating: boolean;
  /** Set when a status read was refused; polling that job has stopped. */
  pollStopped: boolean;
}

export interface ReportExportController {
  slots: Record<ExportFormat, ExportSlot>;
  request: (format: ExportFormat) => void;
  /** Every request this controller has sent, for the screen's own receipt. */
  requestCount: number;
}

const EMPTY: ExportSlot = { job: null, refusal: null, creating: false, pollStopped: false };

function emptySlots(): Record<ExportFormat, ExportSlot> {
  return Object.fromEntries(EXPORT_FORMATS.map((format) => [format, EMPTY])) as Record<ExportFormat, ExportSlot>;
}

function pageVisible(): boolean {
  return typeof document === "undefined" || !document.hidden;
}

export function useReportExport(
  runId: string,
  options: { workspaceId?: string; intervalMs?: number } = {},
): ReportExportController {
  const { workspaceId } = options;
  const intervalMs = options.intervalMs ?? EXPORT_POLL_MS;
  const [slots, setSlots] = useState<Record<ExportFormat, ExportSlot>>(emptySlots);
  const [visible, setVisible] = useState(pageVisible);
  const [tick, setTick] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setVisible(pageVisible());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const patch = useCallback((format: ExportFormat, next: Partial<ExportSlot>) => {
    setSlots((previous) => ({ ...previous, [format]: { ...previous[format], ...next } }));
  }, []);

  const request = useCallback(
    (format: ExportFormat) => {
      const slot = slotsRef.current[format];
      /* A pending job is the answer to a second click; nothing else is sent. */
      if (slot.creating || exportPending(slot.job)) return;
      patch(format, { creating: true, refusal: null });
      setRequestCount((n) => n + 1);
      reportApi
        .exportCreate(runId, format, { workspaceId })
        .then((job) => {
          if (!mounted.current) return;
          patch(format, { job, creating: false, pollStopped: false });
        })
        .catch((error: unknown) => {
          if (!mounted.current) return;
          /* The job already held (if any) is kept, including on a 409. */
          patch(format, { creating: false, refusal: toReportRefusal(error, "export") });
        });
    },
    [patch, runId, workspaceId],
  );

  const pendingKey = EXPORT_FORMATS.filter((format) => exportPending(slots[format].job) && !slots[format].pollStopped)
    .map((format) => `${format}:${slots[format].job!.job_id}`)
    .join(",");

  useEffect(() => {
    if (!visible || pendingKey === "") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const due = EXPORT_FORMATS.filter(
        (format) => exportPending(slotsRef.current[format].job) && !slotsRef.current[format].pollStopped,
      );
      setRequestCount((n) => n + due.length);
      void Promise.allSettled(
        due.map((format) =>
          reportApi.exportStatus(runId, slotsRef.current[format].job!.job_id, { workspaceId, signal: controller.signal }),
        ),
      ).then((results) => {
        if (controller.signal.aborted || !mounted.current) return;
        setSlots((previous) => {
          const next = { ...previous };
          results.forEach((result, index) => {
            const format = due[index]!;
            next[format] =
              result.status === "fulfilled"
                ? { ...previous[format], job: result.value, refusal: null }
                : { ...previous[format], refusal: toReportRefusal(result.reason, "export"), pollStopped: true };
          });
          return next;
        });
        setTick((n) => n + 1);
      });
    }, intervalMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [intervalMs, pendingKey, runId, tick, visible, workspaceId]);

  return { slots, request, requestCount };
}
