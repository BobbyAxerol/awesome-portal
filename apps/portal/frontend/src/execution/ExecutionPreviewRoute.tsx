/**
 * Safe product-route preview for the seventeen reviewed Execution screens.
 *
 * Every read goes through `createFixtureApi`; no HTTP adapter, EventSource or
 * Trading System client is constructed here. Interactive governance and
 * triage actions exercise the real plan/apply/poll UI against an in-memory
 * fixture response whose source-side-effect flag is false.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlphaFleet } from "./screens/AlphaFleet";
import { AccountsBindings } from "./screens/AccountsBindings";
import { BindingDetail } from "./screens/BindingDetail";
import { reviewRouteFor } from "./screens/ApprovalInbox";

import { usePresentation } from "../app/presentation";

import { createFixtureApi } from "./api/fixtureApi";
import { CC_FIXTURES } from "./commandCenter.fixtures";
import { readCommandCenter } from "./commandCenter";
import { ExecutionSurface, type ExecutionSurfaceKind } from "./ExecutionSurface";
import {
  AccountBroker360Preview,
  AlphaThreeSixtyPreview,
  FullBlotterPreview,
  PaperWorkbenchPreview,
  PortfolioThreeSixtyPreview,
} from "./previewControllers";
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

/**
 * The banner says which source is behind the screen — from the registry's
 * `delivery_profile`, never from a hard-coded word. fixture says fixture,
 * shadow says shadow, source says source (EL-V2-09: the profile never lies).
 */
export const PROFILE_BANNER: Record<string, { title: string; line: string; detail: string }> = {
  fixture: {
    title: "FIXTURE PREVIEW",
    line: "No live connection · Actions are simulated",
    detail: "Local fixture data only. No connection to AWS-HK, the Trading System, any broker or any realtime stream. Every action is simulated inside the browser and nothing is sent anywhere.",
  },
  shadow: {
    title: "SHADOW PROJECTION",
    line: "Read-only replay of a BUILDING epoch · not the live source · actions are simulated",
    detail: "Values come from a shadow projection the Portal ingested for parity checks. They are real-shaped but not the promoted epoch; nothing here is live, and no action is sent anywhere.",
  },
  source: {
    title: "SOURCE · READ-ONLY",
    line: "Promoted projection through the Portal boundary · commands remain disabled",
    detail: "Values are read from the promoted projection served by the Portal boundary (SGP). The browser never contacts AWS-HK or the Trading System; command relay stays disabled unless a later authority contract enables it.",
  },
};
export function PreviewBanner({ profile, screenId }: { profile: string | null | undefined; screenId?: string }) {
  const key = profile && PROFILE_BANNER[profile] ? profile : profile ? "unknown" : "fixture";
  const copy = PROFILE_BANNER[key] ?? {
    title: `PROFILE ${String(profile).toUpperCase()}`,
    line: "Unrecognised delivery profile — treated as not live",
    detail: `The registry publishes delivery_profile "${profile}", which this build does not know. It is rendered as not live and nothing is sent anywhere.`,
  };
  return (
    <aside className="exec-preview-banner" role="status" data-execution-preview={key}>
      <strong>{copy.title}</strong>
      <span>{copy.line}</span>
      <details className="exec-preview-details">
        <summary>Details</summary>
        <p>{copy.detail}</p>
      </details>
      {/* EL-V2-03 §4.3: implementation identity lives in an inspector the
          operator opens on purpose, never in the default scan path. */}
      <details className="exec-preview-inspector">
        <summary>Inspector</summary>
        <dl className="exec-preview-inspector-list">
          <div><dt>screen</dt><dd><code data-preview-screen-id>{screenId ?? "—"}</code></dd></div>
          <div><dt>delivery</dt><dd><code>{key}</code></dd></div>
          <div><dt>build flag</dt><dd><code>VITE_EXECUTION_PREVIEW_ENABLED=true</code></dd></div>
        </dl>
      </details>
    </aside>
  );
}
function PreviewFrame({ screenId, profile, children }: { screenId: string; profile?: string | null; children: ReactNode }) {
  const kind: ExecutionSurfaceKind = GOVERNANCE_SCREENS.has(screenId)
    ? "governance"
    : "deployments";

  return (
    <ExecutionSurface kind={kind} className="exec-preview-shell">
      {/* One line, English, below the breadcrumb — §7.2's exact treatment. The
          previous banner was a Vietnamese paragraph (violating the UI-English
          rule §3.8) at production-warning volume; the detail it carried now
          lives in the disclosure so the default reading cost is one glance.
          `screenId` moved into the inspector in EL-V2-03. */}
      <PreviewBanner profile={profile} screenId={screenId} />
      {children}
    </ExecutionSurface>
  );
}

export function ExecutionPreviewRoute({ screenId, profile = null }: { screenId: string; profile?: string | null }) {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
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
      // List routes (no id) carry no entity; a 360 names the entity it resolved.
      case "EXECUTION_ALPHA_360_SCREEN": return params.alphaId ? (params.alphaId === "av_2041" ? "Grid v2.1" : params.alphaId) : null;
      case "EXECUTION_PORTFOLIO_360_SCREEN": return params.portfolioId ?? "PF-CRYPTO";
      case "EXECUTION_ACCOUNT_BROKER_360_SCREEN": return params.accountId ?? search.get("binding") ?? null;
      case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      case "EXECUTION_GATE_R2_REVIEW_SCREEN": return approvalId;
      case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN": return reviewId;
      case "EXECUTION_INCIDENT_DETAIL_SCREEN": return incidentId;
      default: return null;
    }
  }, [screenId, approvalId, reviewId, incidentId, params.alphaId, params.accountId, params.portfolioId, search]);
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
      // EL-V2-05: a row (and the rail's Open) navigates to the review its gate owns.
      content = <ApprovalInboxContainer api={api} onOpenRequest={(id, gate) => navigate(reviewRouteFor({ id, gate }))} />;
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
      content = <PaperWorkbenchPreview deploymentId={deploymentId} variant="vnm" />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
      content = <PaperWorkbenchPreview deploymentId={deploymentId} />;
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
      content = <FullBlotterPreview initialFilter="ALL" />;
      break;
    case "EXECUTION_ALPHA_360_SCREEN":
      // The feature's canonical route (/deployments/alphas, no alphaId) is the
      // fleet list — the entry screen of WF 2a; a row opens the alpha's 360.
      content = params.alphaId ? <AlphaThreeSixtyPreview alphaId={params.alphaId} /> : <AlphaFleet />;
      break;
    case "EXECUTION_PORTFOLIO_360_SCREEN":
      content = <PortfolioThreeSixtyPreview portfolioId={params.portfolioId ?? "PF-CRYPTO"} />;
      break;
    case "EXECUTION_ACCOUNT_BROKER_360_SCREEN":
      // Feature canonical route (/deployments/accounts) = the bindings list,
      // entry screen of WF 1g; ?binding= opens a binding; /:accountId opens
      // the account's 360.
      content = params.accountId
        ? <AccountBroker360Preview accountId={params.accountId} />
        : search.get("binding")
          ? <BindingDetail bindingId={search.get("binding")!} />
          : <AccountsBindings />;
      break;
    case "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN":
      content = <AdminCatalogueContainer api={api} />;
      break;
    default:
      content = null;
  }

  return <PreviewFrame screenId={screenId} profile={profile}>{content}</PreviewFrame>;
}
