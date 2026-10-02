/**
 * `/research/quantbt/runs/:runId/report` — Screen 09 Run Report.
 *
 * The route owns the two hooks and one document attribute. Keying the
 * container on the run means a different run is a fresh read, never a copy of
 * the last run's sheet. The Evidence cursor and `?window=` are read from the
 * URL only to build the ways back; a page opened with none carries none (W1
 * B3), and this screen never writes the hash.
 *
 * `data-research-print-sheet` on the root element is how the report's print
 * rules hide the module header above it while — and only while — this route
 * is mounted. It changes nothing on screen and touches no shell logic.
 */

import { useEffect, useMemo } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import { ReportScreen } from "./ReportDetail";
import { linkFromLocation } from "./reportClient";
import { useReport } from "./useReport";
import { useReportExport } from "./useReportExport";

export const PRINT_SHEET_ATTRIBUTE = "data-research-print-sheet";

function ReportContainer({ runId }: { runId: string }) {
  const [search] = useSearchParams();
  const requestedRevision = search.get("report_revision");
  const controller = useReport(runId);
  const exporter = useReportExport(runId);
  const { hash, search: locationSearch } = useLocation();
  const link = useMemo(() => linkFromLocation(hash, locationSearch), [hash, locationSearch]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(PRINT_SHEET_ATTRIBUTE, "");
    return () => root.removeAttribute(PRINT_SHEET_ATTRIBUTE);
  }, []);

  return <ReportScreen runId={runId} cursor={link.cursor ?? null} window={link.window ?? null} controller={controller} exporter={exporter} requestedRevision={requestedRevision} />;
}

export function ReportRoute() {
  const { runId = "" } = useParams();
  return <ReportContainer key={runId} runId={runId} />;
}
