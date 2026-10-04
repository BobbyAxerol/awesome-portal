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
import { coreV2, linkFromLocation } from "./reportClient";
import { useReport } from "./useReport";
import { useReportExport } from "./useReportExport";
import { LinkedAuditConsumer } from "./LinkedAuditConsumer";

export const PRINT_SHEET_ATTRIBUTE = "data-research-print-sheet";

function ReportContainer({ runId }: { runId: string }) {
  const [search] = useSearchParams();
  const requestedRevision = search.get("report_revision");
  const workspaceId = search.get("workspace_id") || undefined;
  const controller = useReport(runId, { workspaceId });
  const exporter = useReportExport(runId, { workspaceId });
  const { hash, search: locationSearch } = useLocation();
  const link = useMemo(() => linkFromLocation(hash, locationSearch), [hash, locationSearch]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(PRINT_SHEET_ATTRIBUTE, "");
    return () => root.removeAttribute(PRINT_SHEET_ATTRIBUTE);
  }, []);

  return <ReportScreen runId={runId} workspaceId={workspaceId} cursor={link.cursor ?? null} window={link.window ?? null} controller={controller} exporter={exporter} requestedRevision={requestedRevision}
    linkedAudit={controller.report ? <LinkedAuditConsumer runId={runId} workspaceId={workspaceId} onSettled={controller.retry} applicable={controller.report.final_audit_applicable} targetKind={coreV2(controller.report.frozen_core)?.final_audit?.audit_target_kind ?? null} /> : undefined} />;
}

export function ReportRoute() {
  const { runId = "" } = useParams();
  const [search] = useSearchParams();
  return <ReportContainer key={`${search.get("workspace_id") ?? ""}|${runId}`} runId={runId} />;
}
