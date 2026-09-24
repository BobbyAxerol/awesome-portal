/**
 * `/research/quantbt/runs/:runId/report` — Screen 09 Run Report.
 *
 * The route owns the two hooks and one document attribute. Keying the
 * container on the run means a different run is a fresh read, never a copy of
 * the last run's sheet. The Evidence cursor is read from the hash only to
 * build the way back to Stage 5; this screen never writes the hash.
 *
 * `data-research-print-sheet` on the root element is how the report's print
 * rules hide the module header above it while — and only while — this route
 * is mounted. It changes nothing on screen and touches no shell logic.
 */

import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { ReportScreen } from "./ReportDetail";
import { parseCursor } from "./evidenceCursor";
import { useReport } from "./useReport";
import { useReportExport } from "./useReportExport";

export const PRINT_SHEET_ATTRIBUTE = "data-research-print-sheet";

function ReportContainer({ runId }: { runId: string }) {
  const controller = useReport(runId);
  const exporter = useReportExport(runId);
  const cursor = { ...parseCursor(typeof window === "undefined" ? "" : window.location.hash), stage: "claim" as const };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(PRINT_SHEET_ATTRIBUTE, "");
    return () => root.removeAttribute(PRINT_SHEET_ATTRIBUTE);
  }, []);

  return <ReportScreen runId={runId} cursor={cursor} controller={controller} exporter={exporter} />;
}

export function ReportRoute() {
  const { runId = "" } = useParams();
  return <ReportContainer key={runId} runId={runId} />;
}
