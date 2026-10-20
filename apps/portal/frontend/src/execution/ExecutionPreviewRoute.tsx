/**
 * Product route for the Execution screens (N29-FE-01).
 *
 * Every read goes through the same-origin HTTP adapter against the declared
 * BFF routes. No query parameter and no registry profile flag may swap real
 * financial data for a fixture on a product route; screens whose contract is
 * not published render a typed unavailable state instead.
 */
import { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { ensureRetainedReview, retainedSessionKey, useRetainedReview } from "./retainedReview";
import { useSession } from "../auth/session";
import { createHttpApi } from "./api/httpApi";
import { useValueStableApi } from "./useValueStableApi";

import { contractFor, useExecutionRuntime } from "./useExecutionRuntime";
import { isAvailable, unavailableSentence } from "./screenContracts";
import { governanceWriteBlocked, type DeliveryPolicy } from "./profile";
import { NewApprovalRequestContainer } from "./screens/NewApprovalRequest";
import { WaiversRegisterContainer } from "./screens/WaiversRegister";
import { ExecutionSurface, type ExecutionSurfaceKind } from "./ExecutionSurface";
import { EXECUTION_V2_SHELL, isV2Screen } from "./v2/flags";
import { withContext, withoutParams, type ExecEnv } from "./v2/urlState";
import { RouteFeaturesProvider } from "./v2/shell/routeFeatures";
import type { EnvLock, WindowLock } from "./v2/shell/ContextBar";

// UXM-07: the V2 context bar loads only when the build flag names it. The
// condition reads the raw env string so the bundler folds it away when the
// flag is unset: the flag-off dist carries no V2 chunk and the frame renders
// no extra element. EXECUTION_V2_SHELL stays the runtime gate (key + umbrella).
const V2ContextBar = import.meta.env.VITE_EXECUTION_V2_SCREENS
  ? lazy(() => import("./v2/shell/ContextBar").then((m) => ({ default: m.ConnectedContextBar })))
  : null;

// UXM-07 S1: each V2 screen has its own manifest key and lazy chunk. The raw
// env string gates the import() so a flag-off build emits none of them.
const V2Fleet = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/fleet")) : null;
// S1/S7: the three old stage lists redirect to the Fleet when its flag is on (own tiny chunk, same raw-env gate).
const V2FleetStageRedirect = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/fleet/stageRedirect")) : null;
// URL contract redirects (`/deployments/alphas/archived`, `/governance/exit-reviews`): own tiny chunk, same raw-env gate.
const V2ArchivedRedirect = import.meta.env.VITE_EXECUTION_V2_SCREENS
  ? lazy(() => import("./v2/shell/redirects").then((m) => ({ default: m.ArchivedAlphasRedirect })))
  : null;
const V2ExitReviewsRedirect = import.meta.env.VITE_EXECUTION_V2_SCREENS
  ? lazy(() => import("./v2/shell/redirects").then((m) => ({ default: m.ExitReviewsRootRedirect })))
  : null;
const V2Cockpit = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/cockpit")) : null;
const V2Operations = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/operations")) : null;
const V2Overview = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/overview")) : null;
const V2Blotter = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/blotter")) : null;
const V2Admin = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/admin")) : null;
const V2Alpha = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/alpha")) : null;
const V2PortfolioList = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/portfolios")) : null;
const V2Portfolio = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/portfolios/portfolio")) : null;
const V2Compare = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/compare")) : null;
const V2Account = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/account")) : null;
// S3 stage screens (2026-10-19, D2: one key and one chunk per screen). Same raw-env gate: a flag-off build emits none of them.
const V2Workbench = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/workbench")) : null;
const V2Sandbox = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/sandbox")) : null;
const V2Canary = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/canary")) : null;
const V2Live = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/live")) : null;
const V2Request = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/request")) : null;
// FE-068: the caller's own advisory stage-action eligibility, offered as TEXT to the disabled controls of the screens below it.
// It enables nothing; a flag-off build emits none of it.
const V2StageEligibility = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import("./v2/screens/stage/StageEligibility")) : null;
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

const COCKPIT_SCREENS = new Set([
  "EXECUTION_APPROVAL_INBOX_SCREEN",
  "EXECUTION_GATE_R1_REVIEW_SCREEN",
  "EXECUTION_GATE_R2_REVIEW_SCREEN",
  "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
  "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
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
const ACCESS_PATH = "/administration/profile-access";
const APPROVALS_PATH = "/governance/approvals";
/** The query Esc keeps when it leaves a path selection: all context (`workspace_id`, `from`, ...), no `sel` (a leftover one would reselect). */
export function cockpitClearSearch(search: URLSearchParams | string): string {
  const query = withoutParams(search, ["sel"]).toString();
  return query === "" ? "" : `?${query}`;
}
// The V2 Blotter's orders read has no environment filter (Not published, FE-052): the bar says so instead of looking live.
const BLOTTER_ENV_LOCK = { reason: "Not published (FE-052). The orders read has no environment filter.", unapplied: true };
// The V2 Blotter's orders read takes no window either (FE-025); the screen itself says what it covers
// ("Current retained window"), so the bar prints that as the fixed window.
const BLOTTER_WINDOW_LOCK = { reason: "Not published (FE-025). The orders read takes no window.", short: null, effective: "Current retained window" };
// Operations carries its own Range control and the server takes no window (FE-025): the bar's window says so.
// No `effective`: a fixed chip would lie once the local Range changes.
const OPERATIONS_WINDOW_LOCK = { reason: "Operations has its own Range control below. The server takes no window (FE-025).", short: "Own range below" };
// The S3 stage screens read one deployment, and none of those reads takes the bar's window: each says what it covers instead.
const WORKBENCH_WINDOW_LOCK = { reason: "Not published (FE-025). The deployment read takes no window.", short: null, effective: "Published window" };
const SANDBOX_WINDOW_LOCK = { reason: "The certification run fixes the window", short: null, effective: "Certification run" };
const CANARY_WINDOW_LOCK = { reason: "The Canary trial fixes the window.", short: null, effective: "Trial window" };
const LIVE_WINDOW_LOCK = { reason: "Live operations reads from activation.", short: null, effective: "Since activation" };
/**
 * The window lock a V2 screen's own read implies; `undefined` keeps the bar's generic "server takes no window" lock.
 * The stage screens are V2 only on their deployment route (`context.hasDeploymentId`): a list route is the Fleet or the V1 list.
 */
export function windowLockFor(screenId: string, context: EnvLockContext = {}, isV2: (key: Parameters<typeof isV2Screen>[0]) => boolean = isV2Screen): WindowLock | undefined {
  if (screenId === "EXECUTION_OPERATIONS_QUEUE_SCREEN" && isV2("ops")) return OPERATIONS_WINDOW_LOCK;
  if (screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && isV2("blotter")) return BLOTTER_WINDOW_LOCK;
  if (context.hasDeploymentId !== true) return undefined;
  switch (screenId) {
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
    case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN":
      return isV2("workbench") ? WORKBENCH_WINDOW_LOCK : undefined;
    case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN":
      return isV2("sandbox") ? SANDBOX_WINDOW_LOCK : undefined;
    case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN":
      return isV2("canary") ? CANARY_WINDOW_LOCK : undefined;
    case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN":
      return isV2("live") ? LIVE_WINDOW_LOCK : undefined;
    default:
      return undefined;
  }
}
/** What the route knows about the URL that decides whether the environment applies. */
export interface EnvLockContext {
  /** The screen mounted is the V2 Compare (`?view=compare` on the portfolios route, `compare` flag on). */
  compare?: boolean;
  /** The alpha route carries an alpha id (a 360); without one it is the Fleet list. */
  hasAlphaId?: boolean;
  /** The stage route carries a deployment id; without one it is a list (the Fleet, or the V1 overview). */
  hasDeploymentId?: boolean;
}
export const PATH_ENV_REASON = "The path sets the environment.";
/** The reason the S3 stage screens give once they mount: the deployment they read is in one environment. */
export const DEPLOYMENT_ENV_REASON = "The deployment fixes the environment.";
// The flag that mounts the V2 screen of each stage route (on its deployment route only).
const STAGE_V2_KEY: Readonly<Record<string, Parameters<typeof isV2Screen>[0]>> = {
  EXECUTION_PAPER_WORKBENCH_SCREEN: "workbench",
  EXECUTION_PAPER_WORKBENCH_VNM_SCREEN: "workbench",
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: "sandbox",
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: "canary",
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: "live",
};
// A deployment path names its own environment; the bar's buttons would change nothing there (audit D6).
const PATH_ENV: Readonly<Record<string, ExecEnv>> = {
  EXECUTION_PAPER_WORKBENCH_SCREEN: "paper",
  EXECUTION_PAPER_WORKBENCH_VNM_SCREEN: "paper",
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: "sandbox",
  // Canary and Live Full are both the real-funded domain, whose URL value is `live`.
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: "live",
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: "live",
};
// The V2 screens whose reads take no environment (audit D6): the bar says so instead of offering a switch that does nothing.
const NO_ENV_REASON = "Not applied here. This screen's read has no environment filter.";
const NO_ENV_LOCK: EnvLock = { reason: NO_ENV_REASON, unapplied: true };
const OPERATIONS_ENV_LOCK: EnvLock = { reason: "Operations has its own Environment filter below.", short: "Own filter below" };
/**
 * The environment lock for the context bar of one screen, or `undefined` when the bar's choice applies as it is.
 * Pure: `isV2` is injected so the per-screen flags are testable without reloading the module graph.
 */
export function envLockFor(screenId: string, context: EnvLockContext = {}, isV2: (key: Parameters<typeof isV2Screen>[0]) => boolean = isV2Screen): EnvLock | undefined {
  const pathEnv = PATH_ENV[screenId];
  if (pathEnv !== undefined) {
    const key = STAGE_V2_KEY[screenId];
    return { reason: context.hasDeploymentId === true && key !== undefined && isV2(key) ? DEPLOYMENT_ENV_REASON : PATH_ENV_REASON, short: null, effective: pathEnv };
  }
  switch (screenId) {
    case "EXECUTION_FULL_BLOTTER_SCREEN":
      return isV2("blotter") ? BLOTTER_ENV_LOCK : undefined;
    case "EXECUTION_COMMAND_CENTER_SCREEN":
      return isV2("overview") ? NO_ENV_LOCK : undefined;
    case "EXECUTION_ALPHA_FLEET_LIST_SCREEN":
      return isV2("fleet") ? NO_ENV_LOCK : undefined;
    case "EXECUTION_ALPHA_360_SCREEN":
      // A 360 reads per environment; only the list route (no alpha id) is the Fleet.
      return context.hasAlphaId !== true && isV2("fleet") ? NO_ENV_LOCK : undefined;
    case "EXECUTION_PORTFOLIO_360_SCREEN":
      return context.compare === true ? NO_ENV_LOCK : undefined;
    case "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN":
      return isV2("admin") ? NO_ENV_LOCK : undefined;
    case "EXECUTION_OPERATIONS_QUEUE_SCREEN":
    case "EXECUTION_INCIDENT_DETAIL_SCREEN":
      return isV2("ops") ? OPERATIONS_ENV_LOCK : undefined;
    default:
      return COCKPIT_SCREENS.has(screenId) && isV2("cockpit") ? NO_ENV_LOCK : undefined;
  }
}

export function PreviewFrame({ screenId, profile, envLock, windowLock, children }: { screenId: string; profile?: string | null; /** Overrides the lock `envLockFor` derives from the screen alone. */ envLock?: EnvLock | null; /** Overrides the lock `windowLockFor` derives from the screen alone (the route knows whether a deployment id is in the path). */ windowLock?: WindowLock; children: ReactNode }) {
  const sessionKey = retainedSessionKey(useSession().principal);
  // Bind before children's passive effects; never fetch or notify another component during render.
  useLayoutEffect(() => { ensureRetainedReview(sessionKey); }, [sessionKey]);
  // "Refresh" in a retained review re-reads the screen once: the subtree is remounted, so every reader — ticked or not — reads again.
  const refreshEpoch = useRetainedReview().epoch;
  // One Carbon theme (decision A2): with the cockpit on, the approval and review screens leave the light governance surface.
  const onCockpit = V2Cockpit !== null && isV2Screen("cockpit") && COCKPIT_SCREENS.has(screenId);
  // The V2 New request page is Carbon too: it leaves the light governance surface when its flag is on.
  const onV2Request = V2Request !== null && isV2Screen("request") && screenId === "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN";
  const kind: ExecutionSurfaceKind = GOVERNANCE_SCREENS.has(screenId) && !onCockpit && !onV2Request
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
      {V2ContextBar && EXECUTION_V2_SHELL ? <Suspense fallback={null}><V2ContextBar envLock={envLock === undefined ? envLockFor(screenId) : envLock} windowLock={windowLock === undefined ? windowLockFor(screenId) : windowLock} /></Suspense> : null}
      <Fragment key={refreshEpoch}>{children}</Fragment>
    </ExecutionSurface>
  );
}



export function ExecutionPreviewRoute({ screenId, profile = null, policy = null, requestPolicy = null }: { screenId: string; profile?: string | null; policy?: DeliveryPolicy | null; requestPolicy?: DeliveryPolicy | null }) {
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
  /*
   * UXM-10 F-8 / RV-07. `policy` is rebuilt by `screenDeliveryPolicy` on every render of the routes, so a port keyed on the policy
   * OBJECT was a new `api` after every URL change, and every screen that lists `api` in a read effect read everything again: once
   * per tab click and once more when `?tab=Promotion+plans` was rewritten to its slug. The port is now keyed on the VALUE of the
   * policy and the session (useValueStableApi), for every screen: a tab, a selection or a slug keeps it and reads nothing; a new
   * policy value or session is a new port, the old one is aborted and the runtime catalogue forgotten. A workspace or query
   * change is not in the port: it is a prop (`workspaceId`, `binding`) that each screen's read effect lists, cancels and fences.
   * The cockpit's New request drawer writes through the New-request screen's own policy, not the inbox's.
   */
  const scopeKey = retainedSessionKey(useSession().principal);
  // The product transport is the same-origin BFF, unconditionally (N29-FE-01): `createHttpApi` is the only factory the route names.
  const api = useValueStableApi(policy, scopeKey, { make: createHttpApi });
  const requestApi = useValueStableApi(requestPolicy, scopeKey, { make: createHttpApi, forgetRuntime: false });
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

  // `V2Compare` is only imported when the manifest is set; the flag then decides whether the screen is mounted.
  const compareOn = V2Compare !== null && isV2Screen("compare");
  const routeFeatures = useMemo(() => ({ compare: compareOn }), [compareOn]);

  // Where the user's own links to My access go: the shared context travels with them (audit D4/D10).
  const accessHref = withContext(ACCESS_PATH, search);

  // The four review routes keep their paths; with the cockpit on they open it with that request selected.
  const cockpitAt = (id: string | null | undefined, kind: "r1" | "r2" | "exit" | "live"): ReactNode | null => {
    if (!(V2Cockpit && isV2Screen("cockpit") && id)) return null;
    // The path and `?sel=` must not name two requests (audit D3): `sel` is the user's later choice, so it wins and
    // the path is replaced by the list URL that carries it. Everything else in the query stays.
    const sel = search.get("sel");
    if (sel !== null && sel !== "" && sel !== id) {
      return <Navigate replace to={{ pathname: APPROVALS_PATH, search: `?${search.toString()}` }} />;
    }
    return (
      <Suspense fallback={null}>
        <V2Cockpit
          api={api}
          workspaceId={routeWorkspaceId}
          accessHref={accessHref}
          requestApi={requestApi}
          writeBlockedReason={governanceWriteBlocked(requestPolicy)}
          pathSelection={{ id, kind }}
          onClearPathSelection={() => navigate({ pathname: APPROVALS_PATH, search: cockpitClearSearch(search) })}
        />
      </Suspense>
    );
  };

  // The stage list routes (no deployment id) land on the V2 Fleet with the matching stage and environment; flag off keeps the V1 list.
  const stageListRedirect = (list: "paper" | "sandbox" | "live"): ReactNode | null =>
    V2FleetStageRedirect && isV2Screen("fleet")
      ? <Suspense fallback={null}><V2FleetStageRedirect list={list} /></Suspense>
      : null;

  let content: ReactNode;
  switch (screenId) {
    case "EXECUTION_COMMAND_CENTER_SCREEN":
      content = V2Overview && isV2Screen("overview")
        ? <Suspense fallback={null}><V2Overview api={api} workspaceId={routeWorkspaceId} /></Suspense>
        : <CommandCenterSnapshotContainer api={api} />;
      break;
    case "EXECUTION_OPERATIONS_QUEUE_SCREEN":
      // The clock belongs to the screen, not to this render. `new Date()` here
      // was evaluated once and then never again, so every age on the queue
      // froze at first paint.
      content = V2Operations && isV2Screen("ops")
        ? <Suspense fallback={null}><V2Operations api={api} workspaceId={routeWorkspaceId} requestedOperation={search.get("operation")} /></Suspense>
        : <OperationsQueueContainer api={api} requestedOperation={search.get("operation")} />;
      break;
    case "EXECUTION_INCIDENT_DETAIL_SCREEN":
      content = V2Operations && isV2Screen("ops")
        ? <Suspense fallback={null}><V2Operations api={api} workspaceId={routeWorkspaceId} incidentId={incidentId} /></Suspense>
        : <IncidentDetailContainer api={api} incidentId={incidentId} workspaceId={routeWorkspaceId} />;
      break;
    case "EXECUTION_APPROVAL_INBOX_SCREEN":
      // EL-V2-05: a row (and the rail's Open) navigates to the review its gate owns.
      content = V2Cockpit && isV2Screen("cockpit")
        ? <Suspense fallback={null}><V2Cockpit api={api} workspaceId={routeWorkspaceId} accessHref={accessHref} requestApi={requestApi} writeBlockedReason={governanceWriteBlocked(requestPolicy)} /></Suspense>
        : <ApprovalInboxContainer api={api} workspaceId={routeWorkspaceId} onOpenRequest={(id, gate) => navigate(reviewRouteFor({ id, gate }))} />;
      break;
    case "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN":
      content = V2Request && isV2Screen("request")
        ? <Suspense fallback={null}><V2Request api={api} writeBlockedReason={governanceWriteBlocked(policy)} /></Suspense>
        : <NewApprovalRequestContainer api={api} />;
      break;
    case "EXECUTION_GATE_LIVE_REVIEW_SCREEN":
      content = cockpitAt(approvalId, "live") ?? (approvalId ? <GateLiveReviewContainer key={`${approvalId}|${routeWorkspaceId ?? ""}`} api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />);
      break;
    case "EXECUTION_WAIVERS_REGISTER_SCREEN":
      content = <WaiversRegisterContainer api={api} />;
      break;
    case "EXECUTION_GATE_R1_REVIEW_SCREEN":
      // keyed by approval AND workspace: a changed workspace remounts the screen, so a previous workspace's ready decision state can never survive into the next read
      content = cockpitAt(approvalId, "r1") ?? (approvalId ? <GateR1ReviewContainer key={`${approvalId}|${routeWorkspaceId ?? ""}`} api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />);
      break;
    case "EXECUTION_GATE_R2_REVIEW_SCREEN":
      content = cockpitAt(approvalId, "r2") ?? (approvalId ? <GateR2ReviewContainer key={`${approvalId}|${routeWorkspaceId ?? ""}`} api={api} approvalId={approvalId} workspaceId={routeWorkspaceId} /> : <MissingRouteId what="approval" />);
      break;
    case "EXECUTION_PAPER_EXIT_REVIEW_SCREEN":
      // The root has no review to open: with the cockpit on it lands on the cockpit's exit-review view (decision A1).
      content = reviewId === null && V2ExitReviewsRedirect && isV2Screen("cockpit")
        ? <Suspense fallback={null}><V2ExitReviewsRedirect /></Suspense>
        : cockpitAt(reviewId, "exit") ?? (<PaperExitReviewContainer key={`${reviewId ?? ""}|${routeWorkspaceId ?? ""}`} api={api} reviewId={reviewId} workspaceId={routeWorkspaceId} />);
      break;
    case "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN":
      content = deploymentId
        ? V2Workbench && isV2Screen("workbench")
          ? <Suspense fallback={null}><V2Workbench api={api} deploymentId={deploymentId} variant="vnm" /></Suspense>
          : <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} variant="vnm" />
        : <MissingRouteId what="deployment" />;
      break;
    case "EXECUTION_PAPER_WORKBENCH_SCREEN":
      // Feature canonical route (/deployments/paper) = the paper list, entry
      // of WF 1c; /:deploymentId opens that deployment's workbench. The
      // sidebar must never land an operator inside one alpha unasked.
      content = deploymentId
        ? V2Workbench && isV2Screen("workbench")
          ? <Suspense fallback={null}><V2Workbench api={api} deploymentId={deploymentId} /></Suspense>
          : <PaperWorkbenchRichContainer api={api} deploymentId={deploymentId} />
        : stageListRedirect("paper") ?? <PaperOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_SANDBOX_CERTIFICATION_SCREEN":
      // Feature canonical route (/deployments/sandbox) = the sandbox overview,
      // entry screen of WF 1d; /:deploymentId opens that certification.
      content = deploymentId
        ? V2Sandbox && isV2Screen("sandbox")
          ? <Suspense fallback={null}>{V2StageEligibility ? <V2StageEligibility api={api} workspaceId={routeWorkspaceId}><V2Sandbox api={api} deploymentId={deploymentId} workspaceId={routeWorkspaceId} /></V2StageEligibility> : <V2Sandbox api={api} deploymentId={deploymentId} workspaceId={routeWorkspaceId} />}</Suspense>
          : <SandboxCertificationContainer api={api} deploymentId={deploymentId} />
        : stageListRedirect("sandbox") ?? <SandboxOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_CANARY_CONTROL_ROOM_SCREEN":
      // The V2 Canary reads `workspace_id` from the URL itself.
      content = deploymentId
        ? V2Canary && isV2Screen("canary")
          ? <Suspense fallback={null}>{V2StageEligibility ? <V2StageEligibility api={api} workspaceId={routeWorkspaceId}><V2Canary api={api} deploymentId={deploymentId} /></V2StageEligibility> : <V2Canary api={api} deploymentId={deploymentId} />}</Suspense>
          : <CanaryControlRoomContainer api={api} deploymentId={deploymentId} />
        : <MissingRouteId what="deployment" />;
      break;
    case "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN":
      // Feature canonical route (/deployments/live) = the live overview, entry
      // screen of WF 1f/1e; /:deploymentId opens that deployment's workbench.
      content = deploymentId
        ? V2Live && isV2Screen("live")
          ? <Suspense fallback={null}>{V2StageEligibility ? <V2StageEligibility api={api} workspaceId={routeWorkspaceId}><V2Live api={api} deploymentId={deploymentId} workspaceId={routeWorkspaceId} /></V2StageEligibility> : <V2Live api={api} deploymentId={deploymentId} workspaceId={routeWorkspaceId} />}</Suspense>
          : <LiveFullOperationsContainer api={api} deploymentId={deploymentId} />
        : stageListRedirect("live") ?? <LiveOverviewRichContainer api={api} />;
      break;
    case "EXECUTION_FULL_BLOTTER_SCREEN":
      content = V2Blotter && isV2Screen("blotter")
        ? <Suspense fallback={null}><V2Blotter api={api} accessHref={accessHref} /></Suspense>
        : <FullBlotterRichContainer api={api} />;
      break;
    case "EXECUTION_ALPHA_FLEET_LIST_SCREEN":
      content = V2Fleet && isV2Screen("fleet") ? <Suspense fallback={null}><V2Fleet api={api} /></Suspense> : <AlphaFleetRichContainer api={api} />;
      break;
    case "EXECUTION_ALPHA_360_SCREEN":
      // The feature's canonical route (/deployments/alphas, no alphaId) is the
      // fleet list — the entry screen of WF 2a; a row opens the alpha's 360.
      // `archived` is reserved (it is the Fleet's lens, not an alpha): with the Fleet on, the old path lands on `?tab=archived`.
      content = params.alphaId === "archived" && V2ArchivedRedirect && isV2Screen("fleet")
        ? <Suspense fallback={null}><V2ArchivedRedirect /></Suspense>
        : params.alphaId
        ? V2Alpha && isV2Screen("alpha")
          ? <Suspense fallback={null}><V2Alpha api={api} alphaId={params.alphaId} workspaceId={routeWorkspaceId} /></Suspense>
          : <AlphaThreeSixtyRichContainer api={api} alphaId={params.alphaId} />
        : V2Fleet && isV2Screen("fleet") ? <Suspense fallback={null}><V2Fleet api={api} /></Suspense> : <AlphaFleetRichContainer api={api} />;
      break;
    case "EXECUTION_PORTFOLIO_360_SCREEN":
      // Feature canonical route (/deployments/portfolios) = the real portfolio
      // register; /:portfolioId opens that portfolio's 360. The default derives
      // from data, never from a canonical-cast constant (P4-A / BR-EX-76).
      // UXM-07: Compare has no registry row yet (rev 7 is Codex's), so it rides the portfolios route as ?view=compare.
      // The Portfolios mounts sit in RouteFeaturesProvider so they can leave the Compare link out when `compare` is off (audit M2).
      content = V2Compare && compareOn && search.get("view") === "compare"
        ? <Suspense fallback={null}><V2Compare api={api} portfolioId={params.portfolioId} /></Suspense>
        : params.portfolioId
          ? V2Portfolio && isV2Screen("portfolios")
            ? <RouteFeaturesProvider value={routeFeatures}><Suspense fallback={null}><V2Portfolio api={api} portfolioId={params.portfolioId} /></Suspense></RouteFeaturesProvider>
            : <PortfolioThreeSixtyRichContainer api={api} portfolioId={params.portfolioId} />
          : V2PortfolioList && isV2Screen("portfolios")
            ? <RouteFeaturesProvider value={routeFeatures}><Suspense fallback={null}><V2PortfolioList api={api} /></Suspense></RouteFeaturesProvider>
            : <PortfolioListRichContainer api={api} />;
      break;
    case "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN":
      content = V2Account && isV2Screen("account")
        ? <Suspense fallback={null}><V2Account api={api} binding={search.get("binding")} /></Suspense>
        : search.get("binding")
        ? <AccountsBindingsRichContainer api={api} bindingId={search.get("binding")} />
        : <AccountsBindingsRichContainer api={api} />;
      break;
    case "EXECUTION_ACCOUNT_BROKER_360_SCREEN":
      // Feature canonical route (/deployments/accounts) = the bindings list,
      // entry screen of WF 1g; ?binding= opens a binding; /:accountId opens
      // the account's 360.
      content = V2Account && isV2Screen("account")
        ? <Suspense fallback={null}><V2Account api={api} accountId={params.accountId} binding={search.get("binding")} /></Suspense>
        : params.accountId
        ? <AccountBroker360RichContainer api={api} accountId={params.accountId} />
        : search.get("binding")
          ? <AccountsBindingsRichContainer api={api} bindingId={search.get("binding")} />
          : <AccountsBindingsRichContainer api={api} />;
      break;
    case "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN":
      content = V2Admin && isV2Screen("admin")
        ? <Suspense fallback={null}><V2Admin api={api} workspaceId={routeWorkspaceId} accessHref={accessHref} portfoliosHref="/deployments/portfolios" operationsHref="/execution/operations" /></Suspense>
        : <AdminCatalogueContainer api={api} />;
      break;
    default:
      content = null;
  }

  const lockContext: EnvLockContext = { compare: compareOn && search.get("view") === "compare", hasAlphaId: Boolean(params.alphaId), hasDeploymentId: deploymentId !== null };
  return (
    <PreviewFrame
      screenId={screenId}
      profile={profile}
      envLock={envLockFor(screenId, lockContext) ?? null}
      windowLock={windowLockFor(screenId, lockContext)}
    >
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
