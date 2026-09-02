/**
 * Product route for the Execution screens (N29-FE-01).
 *
 * Every read goes through the same-origin HTTP adapter against the declared
 * BFF routes. No query parameter and no registry profile flag may swap real
 * financial data for a fixture on a product route; screens whose contract is
 * not published render a typed unavailable state instead.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CommandCenterSnapshotContainer,
} from "./screens/profileContainers";
import {
  AccountBroker360RichContainer,
  AccountsBindingsRichContainer,
  AlphaFleetRichContainer,
  AlphaThreeSixtyRichContainer,
  FullBlotterRichContainer,
  LiveOverviewRichContainer,
  PaperOverviewRichContainer,
  PaperWorkbenchRichContainer,
  PortfolioListRichContainer,
  PortfolioThreeSixtyRichContainer,
  SandboxOverviewRichContainer,
} from "./screens/recomposeContainers";
import { reviewRouteFor } from "./screens/ApprovalInbox";

import { usePresentation } from "../app/presentation";

import { createHttpApi } from "./api/httpApi";
import type { DeliveryPolicy } from "./profile";
import { NewApprovalRequestContainer } from "./screens/NewApprovalRequest";
import { WaiversRegisterContainer } from "./screens/WaiversRegister";
import { ExecutionSurface, type ExecutionSurfaceKind } from "./ExecutionSurface";
import {
  AdminCatalogueContainer,
  ApprovalInboxContainer,
  CanaryControlRoomContainer,
  GateR1ReviewContainer,
  GateR2ReviewContainer,
  IncidentDetailContainer,
  LiveFullOperationsContainer,
  OperationsQueueContainer,
  PaperExitReviewContainer,
  SandboxCertificationContainer,
  GateLiveReviewContainer,
} from "./screens/containers";

// Product truth: the operations clock is the real one (frozen by the e2e
// harness where determinism is required).

const GOVERNANCE_SCREENS = new Set([
  "EXECUTION_APPROVAL_INBOX_SCREEN",
  "EXECUTION_GATE_R1_REVIEW_SCREEN",
  "EXECUTION_GATE_R2_REVIEW_SCREEN",
  "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
  "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
  "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
  "EXECUTION_WAIVERS_REGISTER_SCREEN",
]);

/**
 * The banner says which source is behind the screen — from the registry's
 * `delivery_profile`, never from a hard-coded word. fixture says fixture,
 * shadow says shadow, source says source (EL-V2-09: the profile never lies).
 */
export const PROFILE_BANNER: Record<string, { title: string; line: string; detail: string }> = {
  http: {
    title: "PORTAL READS · SAME-ORIGIN",
    line: "Every read is a same-origin Portal BFF call · commands go through the relay",
    detail: "The browser calls only the Portal's declared /api/v1/execution routes on this origin. It never contacts AWS-HK, the Trading System, any broker or any database directly; screens whose contract is not published render a typed unavailable state instead of substitute data.",
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
export function PreviewBanner({ profile, screenId, registryWord }: { profile: string | null | undefined; screenId?: string; registryWord?: string | null }) {
  const key = profile && PROFILE_BANNER[profile] ? profile : profile ? "unknown" : "http";
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
          {registryWord && registryWord !== key ? (
            <div><dt>registry says</dt><dd><code>{registryWord}</code> — stale metadata, amendment is codex&apos;s</dd></div>
          ) : null}
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
      {/* N29-FE-01: the transport is same-origin HTTP unconditionally, so the
          banner states that truth. The registry still publishes
          delivery_profile "fixture" for these screens — stale metadata whose
          amendment is codex's (consolidated request); shown in the inspector
          as drift, never used to pick a data source. */}
      <PreviewBanner profile="http" screenId={screenId} registryWord={profile} />
      {children}
    </ExecutionSurface>
  );
}



export function ExecutionPreviewRoute({ screenId, profile = null, policy = null }: { screenId: string; profile?: string | null; policy?: DeliveryPolicy | null }) {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  // N29: the preview finally owns an HTTP consumer. The registry's delivery
  // profile decides; `?api=http` forces the same-origin BFF for the browser
  // smoke (preview builds only — this route exists only behind the flag).
  // N29-FE-01: the product transport is the same-origin BFF, unconditionally.
  // No query parameter and no registry profile flag may swap real financial
  // data for a fixture on a product route; the fixture port lives on only in
  // unit tests and the fixture lab.
  const api = useMemo(() => createHttpApi({ policy }), [policy]);

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
      case "EXECUTION_PAPER_WORKBENCH_SCREEN": return params.deploymentId ? "Carry v3.2" : null;
      case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN": return "VnMomo v0.9";
      case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN": return params.deploymentId ? `${params.deploymentId} · certification` : null;
      // Live Full and Canary share an alpha; the crumb names the deployment and the room.
      case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN": return `${deploymentId} · canary`;
      case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN": return params.deploymentId ? `${params.deploymentId} · live full` : null;
      // List routes (no id) carry no entity; a 360 names the entity it resolved.
      case "EXECUTION_ALPHA_360_SCREEN": return params.alphaId ? (params.alphaId === "av_2041" ? "Grid v2.1" : params.alphaId) : null;
      // List route (no id) carries no entity; the id is never invented (P4-A).
      case "EXECUTION_PORTFOLIO_360_SCREEN": return params.portfolioId ?? null;
      case "EXECUTION_ACCOUNT_BROKER_360_SCREEN": return params.accountId ?? search.get("binding") ?? null;
      case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      case "EXECUTION_GATE_R2_REVIEW_SCREEN":
      case "EXECUTION_GATE_LIVE_REVIEW_SCREEN": return approvalId;
      case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN": return reviewId;
      case "EXECUTION_INCIDENT_DETAIL_SCREEN": return incidentId;
      default: return null;
    }
  }, [screenId, approvalId, reviewId, incidentId, params.alphaId, params.accountId, params.portfolioId, params.deploymentId, search]);
  useEffect(() => {
    setEntityLabel(entity);
    // A stale "Carry v3.2" over the Blotter would be the breadcrumb lying
    // about where the reader is: the producer clears its own label.
    return () => setEntityLabel(null);
  }, [entity, setEntityLabel]);

  let content: ReactNode;
  switch (screenId) {
    case "EXECUTION_COMMAND_CENTER_SCREEN":
      content = <CommandCenterSnapshotContainer api={api} />;
      break;
    case "EXECUTION_OPERATIONS_QUEUE_SCREEN":
      content = <OperationsQueueContainer api={api} now={new Date()} />;
      break;
    case "EXECUTION_INCIDENT_DETAIL_SCREEN":
      content = <IncidentDetailContainer api={api} incidentId={incidentId} />;
      break;
    case "EXECUTION_APPROVAL_INBOX_SCREEN":
      // EL-V2-05: a row (and the rail's Open) navigates to the review its gate owns.
      content = <ApprovalInboxContainer api={api} onOpenRequest={(id, gate) => navigate(reviewRouteFor({ id, gate }))} />;
      break;
    case "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN":
      content = <NewApprovalRequestContainer api={api} />;
      break;
    case "EXECUTION_GATE_LIVE_REVIEW_SCREEN":
      content = <GateLiveReviewContainer api={api} approvalId={approvalId} />;
      break;
    case "EXECUTION_WAIVERS_REGISTER_SCREEN":
      content = <WaiversRegisterContainer api={api} />;
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
      content = <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} variant="vnm" />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
      // Feature canonical route (/deployments/paper) = the paper list, entry
      // of WF 1c; /:deploymentId opens that deployment's workbench. The
      // sidebar must never land an operator inside one alpha unasked.
      content = params.deploymentId ? <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} /> : <PaperOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN":
      // Feature canonical route (/deployments/sandbox) = the sandbox overview,
      // entry screen of WF 1d; /:deploymentId opens that certification.
      content = params.deploymentId
        ? <SandboxCertificationContainer api={api} deploymentId={deploymentId} />
        : <SandboxOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN":
      content = <CanaryControlRoomContainer api={api} deploymentId={deploymentId} />;
      break;
    case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN":
      // Feature canonical route (/deployments/live) = the live overview, entry
      // screen of WF 1f/1e; /:deploymentId opens that deployment's workbench.
      content = params.deploymentId ? <LiveFullOperationsContainer api={api} deploymentId={deploymentId} /> : <LiveOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_FULL_BLOTTER_SCREEN":
      content = <FullBlotterRichContainer api={api} />;
      break;
    case "EXECUTION_ALPHA_FLEET_LIST_SCREEN":
      content = <AlphaFleetRichContainer api={api} />;
      break;
    case "EXECUTION_ALPHA_360_SCREEN":
      // The feature's canonical route (/deployments/alphas, no alphaId) is the
      // fleet list — the entry screen of WF 2a; a row opens the alpha's 360.
      content = params.alphaId ? <AlphaThreeSixtyRichContainer api={api} alphaId={params.alphaId} /> : <AlphaFleetRichContainer api={api} />;
      break;
    case "EXECUTION_PORTFOLIO_360_SCREEN":
      // Feature canonical route (/deployments/portfolios) = the real portfolio
      // register; /:portfolioId opens that portfolio's 360. The default derives
      // from data, never from a canonical-cast constant (P4-A / BR-EX-76).
      content = params.portfolioId
        ? <PortfolioThreeSixtyRichContainer api={api} portfolioId={params.portfolioId} />
        : <PortfolioListRichContainer api={api} />;
      break;
    case "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN":
      content = search.get("binding")
        ? <AccountsBindingsRichContainer api={api} bindingId={search.get("binding")} />
        : <AccountsBindingsRichContainer api={api} />;
      break;
    case "EXECUTION_ACCOUNT_BROKER_360_SCREEN":
      // Feature canonical route (/deployments/accounts) = the bindings list,
      // entry screen of WF 1g; ?binding= opens a binding; /:accountId opens
      // the account's 360.
      content = params.accountId
        ? <AccountBroker360RichContainer api={api} accountId={params.accountId} />
        : search.get("binding")
          ? <AccountsBindingsRichContainer api={api} bindingId={search.get("binding")} />
          : <AccountsBindingsRichContainer api={api} />;
      break;
    case "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN":
      content = <AdminCatalogueContainer api={api} />;
      break;
    default:
      content = null;
  }

  return <PreviewFrame screenId={screenId} profile={profile}>{content}</PreviewFrame>;
}
