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
import { PanelState } from "./components/states";

import { createHttpApi } from "./api/httpApi";
import { contractFor, useExecutionRuntime } from "./useExecutionRuntime";
import { isAvailable, unavailableSentence } from "./screenContracts";
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
/**
 * A route that needs an identifier and did not get one.
 *
 * Never a fixture id in its place: presenting `dep_88` because the URL named
 * nothing is the breadcrumb defect one layer down — the screen would answer
 * confidently about a record the reader never asked for.
 */
/** The alpha segment of a composite deployment id, or the id when it has none. */
function shortDeployment(id: string | undefined): string | null {
  if (!id) return null;
  const head = id.split(":")[0];
  return head.length > 0 ? head : id;
}

function MissingRouteId({ what }: { what: string }) {
  return <PanelState status="unavailable" reason={`This route named no ${what}, so there is nothing to open.`} />;
}

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
  /*
   * PHASE 6 (round 2) · the workspace the URL names, sent to the reads that
   * accept one.
   *
   * dev holds one PENDING R1 approval. The inbox showed "0 PENDING" and the
   * review answered APPROVAL_NOT_FOUND, because the approval lives in a
   * workspace that is not the reader's own and no screen ever forwarded the
   * `workspace_id` the URL already carried. Omitting it still means "my own
   * workspace", which is the right default; dropping one the caller supplied
   * was not a default, it was a discard.
   */
  const routeWorkspaceId = search.get("workspace_id") ?? undefined;
  /*
   * Phase 3 · 11-6. The server publishes, per screen, whether it serves it and
   * why not. Every screen on dev reads AVAILABLE today, so this branch cannot
   * be signed off by eye here — but the mechanism has to exist before the
   * first TYPED_UNAVAILABLE arrives, or the screen will invent a sentence for
   * it. The catalogue is read once per page load, shared with every screen.
   */
  const runtime = useExecutionRuntime(api);
  const contract = contractFor(runtime, screenId);

  const { setEntityLabel } = usePresentation();
  /*
   * These fell back to reviewed-cast ids — `AP-201`/`AP-352` and
   * `dep_88`/`dep_77` — so a route reached without its own id would have
   * fetched a fixture record and presented it as the one asked for. Every
   * template that uses them (`/deployments/paper/:deploymentId`,
   * `…/vn-market`, `…/canary`, the three gate routes) requires the id, so the
   * fallback was unreachable; it was a landmine waiting for a fourth route,
   * not a feature. Absent now means absent, and the branches below say so.
   */
  const approvalId = params.approvalId ?? null;
  const deploymentId = params.deploymentId ?? null;
  /*
   * No identifier in the URL means no subject — not a showcase one.
   *
   * These fell back to `EX-771` and `inc_fixture_44`, ids from the reviewed
   * cast. Entering the register at its own route therefore fetched a review
   * that has never existed on dev, got a 404, and told the operator that a
   * specific review was missing. The register being empty and one review being
   * gone are different facts, and only the second was ever shown.
   */
  const reviewId = params.reviewId ?? null;
  const incidentId = params.incidentId ?? null;

  /*
   * The breadcrumb tail (§4.3): the entity this route opened, named by its own
   * identifier.
   *
   * It used to name the reviewed fixture cast — any paper deployment became
   * "Carry v3.2", the VNM workbench was always "VnMomo v0.9", and alpha
   * `av_2041` became "Grid v2.1". On the showcase those were the records on
   * screen. On dev the owner opened
   * `adaptive_hma_cpp_00115m` and the crumb read "Deployments / Paper Trading /
   * Carry v3.2" — the trail naming a deployment that was not the one open.
   *
   * The shell cannot know a display name, and the comment here already said an
   * invented one would be a second feature model; the mistake was treating the
   * cast as if it were not invented. The identifier is what this route
   * resolved, and it matches the masthead the reader is looking at. The
   * fixture-id fallbacks (`dep_88`, `AP-201`) are deliberately not used here
   * either: a crumb must never name a record the URL did not.
   */
  const entity = useMemo(() => {
    switch (screenId) {
      /*
       * A paper deployment id is composite — `alpha:env:VENUE:account` — and
       * printing all ninety-odd characters made the trail unreadable and
       * repeated what the masthead below already shows in full. The leading
       * segment is the alpha, which is the name the masthead itself puts in
       * large type, so the crumb says that and nothing invented. The VN market
       * view names itself, because it and the workbench are different screens
       * on the same deployment and the trail is how a reader tells them apart.
       */
      case "EXECUTION_PAPER_WORKBENCH_SCREEN": return shortDeployment(params.deploymentId);
      case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN": {
        const short = shortDeployment(params.deploymentId);
        return short ? `${short} · VN market` : null;
      }
      case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN": return params.deploymentId ? `${params.deploymentId} · certification` : null;
      // Live Full and Canary share an alpha; the crumb names the deployment and the room.
      case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN": return params.deploymentId ? `${params.deploymentId} · canary` : null;
      case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN": return params.deploymentId ? `${params.deploymentId} · live full` : null;
      // List routes (no id) carry no entity; a 360 names the entity it resolved.
      case "EXECUTION_ALPHA_360_SCREEN": return params.alphaId ?? null;
      // List route (no id) carries no entity; the id is never invented (P4-A).
      case "EXECUTION_PORTFOLIO_360_SCREEN": return params.portfolioId ?? null;
      case "EXECUTION_ACCOUNT_BROKER_360_SCREEN": return params.accountId ?? search.get("binding") ?? null;
      /*
       * A binding opens on the register's own route with `?binding=`, so the
       * trail said "Deployments / Accounts & Bindings" over a page about one
       * binding and named nothing. Same rule as every other detail route: the
       * tail is the record the URL opened.
       */
      case "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN": return search.get("binding");
      case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      case "EXECUTION_GATE_R2_REVIEW_SCREEN":
      case "EXECUTION_GATE_LIVE_REVIEW_SCREEN": return params.approvalId ?? null;
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
      // The clock belongs to the screen, not to this render. `new Date()` here
      // was evaluated once and then never again, so every age on the queue
      // froze at first paint.
      content = <OperationsQueueContainer api={api} requestedOperation={search.get("operation")} />;
      break;
    case "EXECUTION_INCIDENT_DETAIL_SCREEN":
      content = <IncidentDetailContainer api={api} incidentId={incidentId} workspaceId={routeWorkspaceId} />;
      break;
    case "EXECUTION_APPROVAL_INBOX_SCREEN":
      // EL-V2-05: a row (and the rail's Open) navigates to the review its gate owns.
      content = <ApprovalInboxContainer api={api} workspaceId={routeWorkspaceId} onOpenRequest={(id, gate) => navigate(reviewRouteFor({ id, gate }))} />;
      break;
    case "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN":
      content = <NewApprovalRequestContainer api={api} />;
      break;
    case "EXECUTION_GATE_LIVE_REVIEW_SCREEN":
      content = approvalId ? <GateLiveReviewContainer api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />;
      break;
    case "EXECUTION_WAIVERS_REGISTER_SCREEN":
      content = <WaiversRegisterContainer api={api} />;
      break;
    case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      content = approvalId ? <GateR1ReviewContainer api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />;
      break;
    case "EXECUTION_GATE_R2_REVIEW_SCREEN":
      content = approvalId ? <GateR2ReviewContainer api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />;
      break;
    case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN":
      content = <PaperExitReviewContainer api={api} reviewId={reviewId} />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN":
      content = deploymentId ? <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} variant="vnm" /> : <MissingRouteId what="deployment" />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
      // Feature canonical route (/deployments/paper) = the paper list, entry
      // of WF 1c; /:deploymentId opens that deployment's workbench. The
      // sidebar must never land an operator inside one alpha unasked.
      content = deploymentId ? <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} /> : <PaperOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN":
      // Feature canonical route (/deployments/sandbox) = the sandbox overview,
      // entry screen of WF 1d; /:deploymentId opens that certification.
      content = deploymentId
        ? <SandboxCertificationContainer api={api} deploymentId={deploymentId} />
        : <SandboxOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN":
      content = deploymentId ? <CanaryControlRoomContainer api={api} deploymentId={deploymentId} /> : <MissingRouteId what="deployment" />;
      break;
    case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN":
      // Feature canonical route (/deployments/live) = the live overview, entry
      // screen of WF 1f/1e; /:deploymentId opens that deployment's workbench.
      content = deploymentId ? <LiveFullOperationsContainer api={api} deploymentId={deploymentId} /> : <LiveOverviewRichContainer api={api} />;
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

  return (
    <PreviewFrame screenId={screenId} profile={profile}>
      {/*
        * The server's own word about this screen, above the screen. It is a
        * note, not a replacement: a screen the server declares unserved may
        * still hold panels fed by other routes, and blanking them would hide
        * data the reader can still use.
        */}
      {contract && !isAvailable(contract)
        ? <p className="exec-disabled-reason" data-screen-contract={contract.dataApi.status}>{unavailableSentence(contract)}</p>
        : null}
      {content}
    </PreviewFrame>
  );
}
