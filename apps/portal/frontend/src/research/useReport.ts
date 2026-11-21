/**
 * Screen 09's report read — one request on arrival, and one more only when
 * the reader asks.
 *
 * A sealed report is immutable, so the hook never polls it, never refetches
 * on focus and never refetches on a re-render. What it does keep is the last
 * exact copy it was given, per run and workspace, so a remount revalidates
 * with `If-None-Match` instead of downloading the same revision again. That
 * copy is never shown before the server answers: a `304` is the server saying
 * "this reader may see it, and it is still current"; any refusal drops it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PortalApiError } from "../lib/api";
import { DENY_NO_REPORT, useEvidenceReadsAllowed } from "./useEvidenceReadsAllowed";

import {
  NOT_MODIFIED,
  reportApi,
  reportState,
  toReportRefusal,
  isReportUnavailable,
  type ReportDetail,
  type ReportRead,
  type ReportRefusal,
  type ReportUnavailable,
} from "./reportClient";
import { researchState, type ResearchState } from "./state";

/**
 * The last exact copy per `workspace|run`. In memory only — nothing the
 * reader can edit, and nothing that survives a reload.
 */
const held = new Map<string, ReportRead>();

/** For tests: forget every held copy. */
export function forgetHeldReports(): void {
  held.clear();
}

/** The sentence for a known run whose full Report is not delivered (§54); the server's reason code stays in the tooltip. */
export const NATIVE_REPORT_BANNER = "A full Report is not delivered for this recipe.";

const UNEXPECTED_304: ReportRefusal = {
  code: null,
  message: "The server said the report is unchanged, but no copy is held here. Read it again.",
  status: 304,
  requestId: null,
  state: "unavailable",
  mayRetry: true,
  terminal: false,
};

export interface ReportController {
  report: ReportDetail | null;
  /** §54: the typed absence of a known run's full Report (native recipe); null when a Report or a refusal answered. */
  unavailable?: ReportUnavailable | null;
  refusal: ReportRefusal | null;
  state: ResearchState;
  inFlight: boolean;
  /** True when the last answer was a 304 that kept the copy in hand. */
  notModified: boolean;
  /** Every request this controller has sent, for the screen's own receipt. */
  requestCount: number;
  /** Read again, revalidating the copy in hand with its ETag. */
  retry: () => void;
}

export function useReport(runId: string, options: { workspaceId?: string } = {}): ReportController {
  const { workspaceId } = options;
  const key = `${workspaceId ?? ""}|${runId}`;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [unavailable, setUnavailable] = useState<ReportUnavailable | null>(null);
  const [refusal, setRefusal] = useState<ReportRefusal | null>(null);
  const [inFlight, setInFlight] = useState(true);
  const [notModified, setNotModified] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [generation, setGeneration] = useState(0);
  const current = useRef<ReportRead | null>(null);
  const reads = useEvidenceReadsAllowed(runId, DENY_NO_REPORT, workspaceId);

  useEffect(() => {
    if (reads === "wait") return;
    /* A run with no sealed report to read (queued, failed, cancelled): the read is not sent; the 404 it would
       have answered is the same typed refusal, so the screen draws the library row's own face as before. */
    if (reads !== "allow") {
      held.delete(key);
      current.current = null;
      setReport(null);
      setUnavailable(null);
      setRefusal(toReportRefusal(new PortalApiError("Research report was not found.", 404, "RESEARCH_REPORT_NOT_FOUND", null), "report"));
      setInFlight(false);
      return;
    }
    const controller = new AbortController();
    const copy = current.current ?? held.get(key) ?? null;
    setInFlight(true);
    setRequestCount((n) => n + 1);
    reportApi
      .detail(runId, { workspaceId, etag: copy?.etag ?? null, signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return;
        if (answer === NOT_MODIFIED) {
          if (copy === null) {
            setRefusal(UNEXPECTED_304);
            return;
          }
          current.current = copy;
          if (isReportUnavailable(copy)) {
            setReport(null);
            setUnavailable(copy);
          } else {
            setUnavailable(null);
            setReport(copy);
          }
          setNotModified(true);
          setRefusal(null);
          return;
        }
        held.set(key, answer);
        current.current = answer;
        if (isReportUnavailable(answer)) {
          setReport(null);
          setUnavailable(answer);
        } else {
          setUnavailable(null);
          setReport(answer);
        }
        setNotModified(false);
        setRefusal(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const next = toReportRefusal(error, "report");
        /* Authority or existence changed: nothing is kept, here or held. */
        if (next.terminal) {
          held.delete(key);
          current.current = null;
        }
        setRefusal(next);
      })
      .finally(() => {
        if (!controller.signal.aborted) setInFlight(false);
      });
    return () => controller.abort();
  }, [generation, key, reads, runId, workspaceId]);

  const keeps = refusal !== null && report !== null && !refusal.terminal;
  const state: ResearchState = refusal
    ? { state: refusal.state, reason: refusal.message, mayRetry: refusal.mayRetry, retainsContent: keeps }
    : unavailable !== null && !inFlight
      ? { state: "empty", reason: NATIVE_REPORT_BANNER, detail: unavailable.availability.reason_code, mayRetry: false, retainsContent: false }
    : report === null
      ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
      : inFlight
        ? researchState({ kind: "in-flight", hasAcceptedResponse: true })
        : reportState(report);

  return {
    report: refusal && !keeps ? null : report,
    unavailable: refusal ? null : unavailable,
    refusal,
    state,
    inFlight,
    notModified,
    requestCount,
    retry: useCallback(() => setGeneration((n) => n + 1), []),
  };
}
