/**
 * Safe product-route preview for the seventeen reviewed Execution screens.
 *
 * Every read goes through `createFixtureApi`; no HTTP adapter, EventSource or
 * Trading System client is constructed here. Interactive governance and
 * triage actions exercise the real plan/apply/poll UI against an in-memory
 * fixture response whose source-side-effect flag is false.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { usePresentation } from "../app/presentation";

import { account360 } from "./account360.fixtures";
import { alpha360 } from "./alpha360.fixtures";
import { createFixtureApi } from "./api/fixtureApi";
import { BLOTTER_CROSS_FILTER, blotterPage } from "./blotter.fixtures";
import { CC_FIXTURES } from "./commandCenter.fixtures";
import { readCommandCenter } from "./commandCenter";
import { ExecutionSurface, type ExecutionSurfaceKind } from "./ExecutionSurface";
import { GATE_MET, paperWorkbench } from "./paper.fixtures";
import { portfolio360 } from "./portfolio360.fixtures";
import { vnmWorkbench } from "./vnm.fixtures";
import { AccountBroker360 } from "./screens/AccountBroker360";
import { AlphaThreeSixty } from "./screens/AlphaThreeSixty";
import { FullBlotter } from "./screens/FullBlotter";
import { PaperWorkbench } from "./screens/PaperWorkbench";
import { PortfolioThreeSixty } from "./screens/PortfolioThreeSixty";
import {
  AdminCatalogueContainer,
  ApprovalInboxContainer,
  CanaryControlRoomContainer,
  CommandCenterLive,
  GateR1ReviewContainer,
  GateR2ReviewContainer,
  IncidentDetailContainer,
  LiveFullOperationsContainer,
  OperationsQueueContainer,
  PaperExitReviewContainer,
  SandboxCertificationContainer,
} from "./screens/containers";

const QUEUE_NOW = new Date("2026-08-23T09:05:00.000Z");

const GOVERNANCE_SCREENS = new Set([
  "EXECUTION_APPROVAL_INBOX_SCREEN",
  "EXECUTION_GATE_R1_REVIEW_SCREEN",
  "EXECUTION_GATE_R2_REVIEW_SCREEN",
  "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
]);

function PreviewFrame({ screenId, children }: { screenId: string; children: ReactNode }) {
  const kind: ExecutionSurfaceKind = GOVERNANCE_SCREENS.has(screenId)
    ? "governance"
    : "deployments";

  return (
    <ExecutionSurface kind={kind} className="exec-preview-shell">
      {/* One line, English, below the breadcrumb — §7.2's exact treatment. The
          previous banner was a Vietnamese paragraph (violating the UI-English
          rule §3.8) at production-warning volume; the detail it carried now
          lives in the disclosure so the default reading cost is one glance.
          `screenId` remains here until EL-V2-03 moves it into the preview
          inspector. */}
      <aside className="exec-preview-banner" role="status" data-execution-preview="fixture">
        <strong>FIXTURE PREVIEW</strong>
        <span>No live connection · Actions are simulated</span>
        <details className="exec-preview-details">
          <summary>Details</summary>
          <p>
            Local fixture data only. No connection to AWS-HK, the Trading System, any broker or any
            realtime stream. Every action is simulated inside the browser and nothing is sent
            anywhere.
          </p>
        </details>
        <code>{screenId}</code>
      </aside>
      {children}
    </ExecutionSurface>
  );
}

export function ExecutionPreviewRoute({ screenId }: { screenId: string }) {
  const params = useParams();
  const api = useMemo(() => createFixtureApi(), []);
  const commandCenter = useMemo(() => readCommandCenter(CC_FIXTURES.busy), []);

  const { setEntityLabel } = usePresentation();
  const approvalId = params.approvalId ?? (screenId.includes("R2") ? "AP-352" : "AP-201");
  const deploymentId = params.deploymentId ?? (screenId.includes("SANDBOX") ? "dep_77" : "dep_88");
  const reviewId = params.reviewId ?? "EX-771";
  const incidentId = params.incidentId ?? "inc_fixture_44";

  // The breadcrumb tail (§4.3): the entity this preview resolved, by the name
  // an operator uses. Only set where the fixture cast has one — an invented
  // name would be a second feature model.
  const entity = useMemo(() => {
    switch (screenId) {
      case "EXECUTION_PAPER_WORKBENCH_SCREEN": return "Carry v3.2";
      case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN": return "VnMomo v0.9";
      case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN": return "MM v1.1";
      case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN": return "Grid v2.1";
      case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN": return "Grid v2.1";
      case "EXECUTION_ALPHA_360_SCREEN": return "Grid v2.1";
      case "EXECUTION_PORTFOLIO_360_SCREEN": return "PF-CRYPTO";
      case "EXECUTION_ACCOUNT_BROKER_360_SCREEN": return "acct-live-grid-v21";
      case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      case "EXECUTION_GATE_R2_REVIEW_SCREEN": return approvalId;
      case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN": return reviewId;
      case "EXECUTION_INCIDENT_DETAIL_SCREEN": return incidentId;
      default: return null;
    }
  }, [screenId, approvalId, reviewId, incidentId]);
  useEffect(() => {
    setEntityLabel(entity);
    // A stale "Carry v3.2" over the Blotter would be the breadcrumb lying
    // about where the reader is: the producer clears its own label.
    return () => setEntityLabel(null);
  }, [entity, setEntityLabel]);

  let content: ReactNode;
  switch (screenId) {
    case "EXECUTION_COMMAND_CENTER_SCREEN":
      content = commandCenter ? <CommandCenterLive snapshot={commandCenter} /> : null;
      break;
    case "EXECUTION_OPERATIONS_QUEUE_SCREEN":
      content = <OperationsQueueContainer api={api} now={QUEUE_NOW} />;
      break;
    case "EXECUTION_INCIDENT_DETAIL_SCREEN":
      content = <IncidentDetailContainer api={api} incidentId={incidentId} />;
      break;
    case "EXECUTION_APPROVAL_INBOX_SCREEN":
      content = <ApprovalInboxContainer api={api} />;
      break;
    case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      content = <GateR1ReviewContainer api={api} approvalId={approvalId} />;
      break;
    case "EXECUTION_GATE_R2_REVIEW_SCREEN":
      content = <GateR2ReviewContainer api={api} approvalId={approvalId} />;
      break;
    case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN":
      content = <PaperExitReviewContainer api={api} reviewId={reviewId} />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN":
      content = <PaperWorkbench {...vnmWorkbench({ deploymentId })} />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
      content = <PaperWorkbench {...paperWorkbench({ ...GATE_MET, deploymentId })} />;
      break;
    case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN":
      content = <SandboxCertificationContainer api={api} deploymentId={deploymentId} />;
      break;
    case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN":
      content = <CanaryControlRoomContainer api={api} deploymentId={deploymentId} />;
      break;
    case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN":
      content = <LiveFullOperationsContainer api={api} deploymentId={deploymentId} />;
      break;
    case "EXECUTION_FULL_BLOTTER_SCREEN":
      content = (
        <FullBlotter
          envelope={{ authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" }}
          page={blotterPage("FILLED")}
          filter="FILLED"
          crossFilter={BLOTTER_CROSS_FILTER}
        />
      );
      break;
    case "EXECUTION_ALPHA_360_SCREEN":
      content = <AlphaThreeSixty {...alpha360({ alphaId: params.alphaId ?? "alpha_grid_v21" })} />;
      break;
    case "EXECUTION_PORTFOLIO_360_SCREEN":
      content = (
        <PortfolioThreeSixty
          {...portfolio360({ portfolioId: params.portfolioId ?? "PF-MAIN" })}
        />
      );
      break;
    case "EXECUTION_ACCOUNT_BROKER_360_SCREEN":
      content = <AccountBroker360 {...account360({ accountId: params.accountId ?? "acct_paper_grid_v21" })} />;
      break;
    case "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN":
      content = <AdminCatalogueContainer api={api} />;
      break;
    default:
      content = null;
  }

  return <PreviewFrame screenId={screenId}>{content}</PreviewFrame>;
}
