/**
 * Sandbox certification V2 (S3 W-SANDBOX, flag key `sandbox`).
 *
 * "Is the exchange integration certified? Fail closed until every step passes." One deployment,
 * one URL: the stage header (frame on the left in the Sandbox colour, three state chips, the
 * lifecycle spine), the tabs Reconciliation, Steps, Promotion plans and Timeline in `?tab=`, a
 * strip of five facts, and a rail with the exit review and the review note.
 *
 * Two bodies answer `GET /deployments/{id}/certification`, and the screen reads both through the
 * version-aware port: V1 `governance.sandbox-certification.v1` (server sentences, a server passed
 * count, findings, a timeline, plans, three source panels) and V2 `portal.execution.following-parent.v2`
 * (the stored certification and seven stored step evaluations). `readSandbox.ts` turns either into
 * one view; an `unsupported` answer reads its own sentence and shows nothing else.
 *
 * What it will not do (certification.ts rules, AGENT_WORKING_RULES): recompute. The passed count,
 * the gate, the freshness, the expiry are the server's; where the body does not carry a fact the
 * cell says `Not published (FE-xxx)` or `Not available`, never 0 and never a dash. The runtime
 * chip is `Not published (FE-027)` because the source never states one; no green "Running".
 * Source figures (Equity, Fees paid, Position, Open orders) are `Not available`: their keys are
 * not in the contract (FE-072), and Difference is never subtracted here.
 *
 * Writes: one, `Record review note` (POST /governance/sandbox/capture-note), open only when the
 * server's capability says so. Submit for review and Request Sandbox exit review have no route and
 * are disabled with their reason (BR-EX-61).
 *
 * URL: `tab` (default Reconciliation; V1 labels and the short slugs of review2/07 resolve),
 * `workspace_id`, `from` (carried). The integrator locks the window ("Certification run") and the
 * environment (`effective: "sandbox"`) from the route.
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 certification, 7 steps, 3 source panels; findings up to 50 (server page), timeline up to 250, plans up to 20 | 200 table rows (never reached: the schema caps every list at or under 250) | tables show what the server returned and print `Showing N of M` when `truncated`; cards under 660px | one read per open (`getSandboxCertificationVersioned`), a re-read after a recorded note; capabilities read once per workspace | no count, gate or open-findings figure is computed; absent is `Not published (FE-xxx)` or `Not available`; the key of a note follows its intent | one certification read, one capabilities read; at most 250 table rows, under 150 nodes in the steps grid |
 */
import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { useExecutionRuntime } from "../../../useExecutionRuntime";
import { Flag } from "../../Flag";
import { KpiStrip, NotPublished, SectionPanel, StageHeader, Triad, UrlTabs } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { parseUrlParams, withContext } from "../../urlState";
import { ExitReviewPanel } from "./ExitReviewPanel";
import { ReviewNoteForm } from "./ReviewNoteForm";
import { StepsGrid } from "./StepsGrid";
import { FindingsPanel, PlansPanel, TimelinePanel } from "./Tables";
import {
  LINEAGE_LABEL,
  LOADING_CHIPS,
  RECON_ROWS,
  chipsOf,
  figuresSuppressed,
  gateOf,
  humanize,
  kpiCells,
  panelById,
  panelLine,
  spineFacts,
  subtitleOf,
  tabsOf,
  type KpiCell,
} from "./model";
import { readSandboxView, type SandboxView } from "./readSandbox";
import { useNoteCapability, useSandboxRead, type NoteCapability } from "./useSandboxReads";

import "../../css/sandbox.css";

export const SANDBOX_SCREEN_KEY = "sandbox" as const;

export interface SandboxScreenProps {
  api: ExecutionApi;
  /** The route's `:deploymentId`. */
  deploymentId: string;
  /** Carried to the reads that take it (`workspace_id`); the URL's value wins. */
  workspaceId?: string;
}

const ACCESS_HREF = "/administration/profile-access";
const FLEET_HREF = "/deployments/alphas";

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Fig({ cell }: { cell: KpiCell }) {
  return (
    <div className="exec-blk-kpi" data-kpi={cell.key}>
      <dt className="exec-blk-kpi-label">{cell.label}</dt>
      <dd className="exec-blk-kpi-body">
        <span className="exec-blk-kpi-value">
          {cell.np !== undefined ? (
            <NotPublished id={cell.np} />
          ) : cell.flag !== undefined ? (
            <Flag kind={cell.flag.kind} label={cell.flag.label} />
          ) : cell.value !== undefined ? (
            <span className="exec-blk-num">{cell.value}</span>
          ) : (
            <span className="exec-blk-na">Not available</span>
          )}
        </span>
        {cell.value === undefined && cell.np === undefined && cell.flag === undefined && cell.absent !== undefined ? (
          <span className="exec-blk-kpi-note">{cell.absent}</span>
        ) : cell.basis !== undefined ? (
          <span className="exec-blk-kpi-note">{cell.basis}</span>
        ) : null}
      </dd>
    </div>
  );
}

function Reconciliation({ view }: { view: SandboxView }) {
  const internal = panelById(view, "internal");
  const broker = panelById(view, "broker");
  return (
    <div className="exec-sbx-recon">
      <Triad
        rows={RECON_ROWS}
        internal={internal === null ? null : { asOf: internal.asOf }}
        broker={broker === null ? null : { asOf: broker.asOf }}
        suppressed={figuresSuppressed(view)}
      />
      <div className="exec-sbx-panels">
        {view.panels.length > 0 ? (
          <ul aria-label="Source panels">
            {view.panels.map((panel) => (
              <li key={panel.id}>
                <b>{humanize(panel.id)}</b> {panelLine(panel)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="exec-blk-na">This response carries no source panel.</p>
        )}
        <p className="exec-sbx-note">
          The figure for each row is <NotPublished id="FE-072">Typed reconciliation figures</NotPublished>. The Difference is never worked out here.
        </p>
      </div>
      <FindingsPanel view={view} />
    </div>
  );
}

function Lineage({ view }: { view: SandboxView }) {
  const [params] = useSearchParams();
  if (view.lineage.length === 0) {
    return (
      <SectionPanel title="Lineage">
        <p className="exec-blk-na">Not available</p>
      </SectionPanel>
    );
  }
  return (
    <SectionPanel title="Lineage">
      <ul className="exec-sbx-lineage" aria-label="Lineage">
        {view.lineage.map((item) => (
          <li key={item.kind}>
            <span className="exec-sbx-lineage-kind">{LINEAGE_LABEL[item.kind] ?? humanize(item.kind)}</span>{" "}
            {item.href !== null && item.href.startsWith("/") ? (
              <Link className="exec-blk-link" to={withContext(item.href, params)}>{item.value}</Link>
            ) : (
              <span className="exec-sbx-id">{item.value}</span>
            )}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function PlainHead({ deploymentId }: { deploymentId: string }) {
  return (
    <header className="exec-sbx-plain">
      <h1 className="exec-stage-title">Sandbox certification</h1>
      <p className="exec-stage-sub">Deployment {deploymentId}</p>
    </header>
  );
}

/** What a person sees when the server says they may not open the page (the researcher frame of the hi-fi). */
function Denied({ deploymentId, reason }: { deploymentId: string; reason: string }) {
  const [params] = useSearchParams();
  return (
    <div className="exec-sbx-v2" data-screen="sandbox-v2" data-state="denied">
      <PlainHead deploymentId={deploymentId} />
      <section className="exec-sbx-denied" aria-label="Access">
        <p className="exec-sbx-denied-title">You can’t open this page.</p>
        <p>
          <Link className="exec-blk-link" to={withContext(ACCESS_HREF, params)}>See what you can access</Link>
          {" · "}
          <Link className="exec-blk-link" to={withContext(FLEET_HREF, params)}>Alpha Fleet</Link>
        </p>
        <p className="exec-sbx-note">{reason}</p>
      </section>
    </div>
  );
}

function Banners({ view }: { view: SandboxView }) {
  const staleAt = view.panels.find((p) => p.freshness === "STALE");
  const reported = view.panels.some((p) => p.state === "ok");
  return (
    <>
      {view.sourceActed ? (
        <div className="exec-blk-banner" role="alert">
          <Flag kind="attention" label="Not trusted" size="sm" /> This response says a source action was requested. This screen never requests one, so the figures below are not trusted.
        </div>
      ) : null}
      {view.version === "v2" ? (
        <div className="exec-blk-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" /> This response carries the stored certification and its step evaluations only. Findings, plans, the timeline and the reconciliation figures are{" "}
          <NotPublished id="FE-072" />.
        </div>
      ) : !reported ? (
        <div className="exec-blk-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" /> The source panels did not report. Figures that depend on them are Not available, not zero.
        </div>
      ) : null}
      {staleAt !== undefined ? (
        <div className="exec-blk-banner" role="status">
          <Flag kind="stale" label="Stale" size="sm" />{" "}
          {staleAt.asOf === null ? "A source has not updated within its freshness budget." : `Showing data as of ${formatAsOf(staleAt.asOf)}. A source has not updated within its freshness budget.`}
        </div>
      ) : null}
    </>
  );
}

/* ── the screen ───────────────────────────────────────────────────────────── */

export default function SandboxScreen({ api, deploymentId, workspaceId }: SandboxScreenProps) {
  const [params] = useSearchParams();
  const routeWorkspace = parseUrlParams(params).value.workspace_id ?? workspaceId ?? null;
  const { read, reload } = useSandboxRead(api, deploymentId, routeWorkspace);
  const runtime = useExecutionRuntime(api);

  const parsed = useMemo(() => (read.phase === "ready" ? readSandboxView(read.value) : null), [read]);
  const view = parsed !== null && parsed.kind === "ready" ? parsed.view : null;

  // A V2 body names its workspace; a V1 body does not, and the runtime manifest is the V1 screen's source for it.
  const noteWorkspace = view?.workspaceId ?? routeWorkspace ?? runtime?.manifest?.workspaceId ?? null;
  const asked = useNoteCapability(api, view === null ? null : noteWorkspace);
  const capability: NoteCapability = view === null || (noteWorkspace === null && runtime === null) ? { state: "loading" } : asked;

  const renderLink = (to: string, children: ReactNode) => <Link to={withContext(to, params)}>{children}</Link>;
  const crumb = (id: string) => [{ label: "Alpha Fleet", to: FLEET_HREF }, { label: id }, { label: "Sandbox" }];

  if (read.phase === "loading") {
    return (
      <div className="exec-sbx-v2" data-screen="sandbox-v2" data-state="loading">
        <StageHeader stage="sandbox" crumb={crumb(deploymentId)} title="Sandbox certification" subtitle={`Deployment ${deploymentId}`} chips={LOADING_CHIPS} spine={{ current: "sandbox" }} renderLink={renderLink} />
        <PanelState status="loading" />
      </div>
    );
  }

  if (read.phase === "error") {
    if (read.status === "denied") return <Denied deploymentId={deploymentId} reason={read.reason} />;
    return (
      <div className="exec-sbx-v2" data-screen="sandbox-v2" data-state={read.status}>
        <PlainHead deploymentId={deploymentId} />
        <PanelState
          status={read.status}
          reason={read.reason}
          actions={<button type="button" className="exec-dock-btn" onClick={reload} aria-label="Try the read again">Try again</button>}
        />
      </div>
    );
  }

  if (parsed === null || parsed.kind === "unsupported" || view === null) {
    return (
      <div className="exec-sbx-v2" data-screen="sandbox-v2" data-state="unsupported">
        <PlainHead deploymentId={deploymentId} />
        <PanelState status="terminal" reason={parsed !== null && parsed.kind === "unsupported" ? parsed.text : "The response could not be read."} />
      </div>
    );
  }

  const gate = gateOf(view);
  const cells = kpiCells(view);
  const shownId = view.deploymentId ?? deploymentId;

  return (
    <div className="exec-sbx-v2" data-screen="sandbox-v2" data-version={view.version} data-refreshing={read.refreshing ? "true" : undefined}>
      <StageHeader
        stage="sandbox"
        crumb={crumb(shownId)}
        title="Sandbox certification"
        subtitle={subtitleOf(view, deploymentId)}
        chips={chipsOf(view)}
        spine={{ current: "sandbox", blocked: gate === "blocked", stages: spineFacts(view), label: "Lifecycle" }}
        renderLink={renderLink}
      />
      <Banners view={view} />
      <UrlTabs surface="sandbox" tabs={tabsOf(view)} label="Sandbox certification sections">
        {(tab) => (
          <div className="exec-sbx-body">
            <KpiStrip label="Certification facts" columns={5}>
              {cells.map((cell) => (
                <Fig key={cell.key} cell={cell} />
              ))}
            </KpiStrip>
            <div className="exec-sbx-grid">
              <div className="exec-sbx-main">
                {tab === "steps" ? (
                  <>
                    <StepsGrid steps={view.steps} hasSentences={view.version === "v1"} />
                    <Lineage view={view} />
                  </>
                ) : tab === "promotion-plans" ? (
                  <PlansPanel view={view} />
                ) : tab === "timeline" ? (
                  <TimelinePanel view={view} />
                ) : (
                  <Reconciliation view={view} />
                )}
              </div>
              <aside className="exec-sbx-rail" aria-label="Exit review and review note">
                <ExitReviewPanel view={view} />
                <ReviewNoteForm
                  api={api}
                  capability={capability}
                  identity={{ workspaceId: noteWorkspace, certificationId: view.certificationId, workflowVersion: view.workflowVersion }}
                  onRecorded={reload}
                />
              </aside>
            </div>
          </div>
        )}
      </UrlTabs>
    </div>
  );
}
