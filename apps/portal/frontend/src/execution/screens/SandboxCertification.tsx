/**
 * Sandbox Certification Workbench (HiFi 1d) on the V2 Paper anatomy.
 *
 * Fail-closed by construction: the deployment starts HALTED, a CRITICAL
 * reconciliation finding blocks activation and exit, and every action is
 * plan → apply → verify. The seven certification steps stay a horizontal
 * stepper; internal / broker / difference stay a triptych; findings and the
 * smoke plan are tables. Actions live in the rail's Next section and are
 * disabled with their reasons unless the server's gate says otherwise.
 *
 * Two layers, and they never pretend to be one. The hi-fi body (masthead,
 * lineage, stepper, triptych, findings, order-type matrix, execution quality,
 * smoke plan, cleanup checklist, action bar) reads `sandbox.smoke.ts` and is
 * labelled as smoke on the page; everything the contract already publishes —
 * the decision strip, the seven steps, the source panels, the promotion plans,
 * the timeline, the rail's blockers and its two actions — is rendered from
 * `sandbox-certification.v1` exactly as before. When BR-EX-61 ships, the smoke
 * module goes and the hi-fi body reads the contract instead.
 */
import { useState, type ReactNode } from "react";
import { CapGauges, HistogramChart, OrderTypeMatrix, PositionsTable, SparkTile } from "../components/visuals";
import type { StageVisuals } from "../stage.smoke";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { AuthorityWord } from "../components/badges";
import { SourceTile } from "../components/stageWorkbench";
import { ExecutionSectionTitle } from "../components/typography";
import { certSmoke, sbAge, sbAgeSeconds, sbClock, useCertTick, SANDBOX_SMOKE_WARNING, type CertKV, type CertSmoke } from "../sandbox.smoke";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionWorkspace,
  shortDigest,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";
import type { PanelStatus } from "../contracts";
import {
  certificationBlocked,
  type CertificationStep,
  type PanelEnvelope,
  type SandboxCertification,
} from "../certification";

const TRIPTYCH: readonly { id: string; title: string }[] = [
  { id: "internal", title: "Internal virtual state" },
  { id: "broker", title: "Physical broker state" },
  { id: "difference", title: "Difference" },
];
const TABS = ["Reconciliation", "Steps", "Promotion plans", "Timeline"] as const;
type Tab = (typeof TABS)[number];

/** Seven `SANDBOX_STEP_*_UNAVAILABLE` codes are one fact — the profile publishes no step evidence — and the rail says it once. */
function groupStepReasons(reasons: readonly string[]): RailBlocker[] {
  const steps = reasons.filter((c) => /^SANDBOX_STEP_.*_UNAVAILABLE$/.test(c));
  const rest = reasons.filter((c) => !steps.includes(c));
  const grouped: RailBlocker[] = steps.length > 2
    ? [{ label: `${steps.length} certification steps unavailable in this profile`, detail: steps.map((c) => c.replace(/^SANDBOX_STEP_|_UNAVAILABLE$/g, "").toLowerCase().replace(/_/g, " ")).join(" · "), severity: "blocking" }]
    : steps.map((code) => ({ label: code, detail: "certification gate", severity: "blocking" as const }));
  return [...grouped, ...rest.map((code) => ({ label: code, detail: "certification gate", severity: "blocking" as const }))];
}

const EVAL_GLYPH: Record<string, string> = { PASS: "✓", FAIL: "✕", STALE: "!", UNAVAILABLE: "—" };

/** OKX testnet REST policy from the hi-fi; BR-EX-61 publishes it per venue. */
const BROKER_POLICY_SECONDS = 60;

/**
 * One step of the seven-step stepper (hi-fi 1d): ordinal · name · state on
 * one line; the authority, summary, expiry and blocker code fold behind
 * "why" so seven steps read as a strip, not as seven paragraphs (EL-V2-10).
 */
function StepCell({ step, index }: { step: CertificationStep; index: number }) {
  const state = step.evaluationState ?? "UNAVAILABLE";
  const hasWhy = Boolean(step.summary || step.expiresAt || step.blockerCode || step.authority);
  return (
    <li className="exec-cert-step" data-strip={step.stripState ?? "PENDING"} data-evaluation={state}>
      <span className="exec-cert-ordinal">{(step.ordinal ?? index) + 1}</span>
      <span className="exec-cert-label">{step.label}</span>
      <span className="exec-cert-eval" title={state}>{EVAL_GLYPH[state] ?? "·"} {state.toLowerCase()}</span>
      {hasWhy ? (
        <details className="exec-cert-more exec-hint">
          <summary>why</summary>
          <div className="exec-hint-body">
            {step.authority ? <AuthorityWord authority={step.authority} /> : null}
            {step.summary ? <span className="exec-cert-summary"> {step.summary}</span> : null}
            {step.expiresAt ? <span className="exec-cert-summary"> · evidence expires {step.expiresAt}</span> : null}
            {step.blockerCode ? <span className="exec-cert-blocker"> · {step.blockerCode}</span> : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}

/** A key/value column of the hi-fi triptych and the two evidence panels. */
function Facts({ rows }: { rows: CertKV[] }) {
  return (
    <dl className="exec-360-facts">
      {rows.map((r) => (
        <div key={r.k} className="exec-sbc-fact">
          <dt>{r.k}</dt>
          <dd data-tone={r.tone}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The three admin actions of hi-fi 1d, as plan → apply → verify. Pressing one
 * builds its plan and shows it; nothing is sent, and Apply stays disabled with
 * the reason, because the command route lands with BR-EX-61.
 */
const PLANS: Record<string, { title: string; rows: [string, string][] }> = {
  sync: {
    title: "PLAN · broker snapshot sync",
    rows: [
      ["operation", "sandbox.broker_sync"],
      ["reads", "REST account + positions + open orders"],
      ["writes", "the snapshot row only — no order leaves the Portal"],
      ["effect on certification", "refreshes step 3, and step 4 must be re-run after it"],
    ],
  },
  dryRun: {
    title: "PLAN · reconciliation dry-run",
    rows: [
      ["operation", "sandbox.reconcile_dry_run"],
      ["compares", "internal virtual state vs the broker snapshot"],
      ["writes", "findings only — a dry-run never applies a correction"],
      ["effect on certification", "step 4 passes on a clean run and fails closed on a CRITICAL finding"],
    ],
  },
};

function ActionPlan({ plan, cert, onClose }: { plan: string; cert: CertSmoke; onClose: () => void }) {
  const body = plan === "smoke"
    ? {
        title: `PLAN · smoke activation window · ${cert.plan.id}`,
        rows: cert.plan.rows.map((r) => [r.k, r.v] as [string, string]),
      }
    : PLANS[plan];
  if (!body) return null;
  return (
    <section className="exec-sbc-plan" aria-label={body.title}>
      <header className="exec-sbc-planhead">
        <span className="exec-sbc-plantitle">{body.title}</span>
        <span className="exec-a3-spacer" />
        <button type="button" className="exec-a3-btn exec-sbc-close" onClick={onClose}>Close</button>
      </header>
      <div className="exec-lf-kv">
        {body.rows.flatMap(([k, v]) => [
          <span key={k} className="exec-bd-k">{k}</span>,
          <span key={`${k}-v`}>{v}</span>,
        ])}
      </div>
      <footer className="exec-sbc-planfoot">
        <button type="button" className="exec-pf2-primary" disabled title="The sandbox command route lands with BR-EX-61; this preview never leaves the browser.">Apply</button>
        <span>preview only — apply is disabled until the sandbox command route ships (BR-EX-61) · every apply is followed by a verify pass, and PARTIAL never renders green</span>
      </footer>
    </section>
  );
}

export function SandboxCertificationScreen({
  certification,
  deploymentId,
  status = "ok",
  reason,
  onSubmit,
  onRequestExit,
  onCopyProvenance,
  visuals,
  children,
}: {
  certification: SandboxCertification | null;
  /** The route's deployment — which certification the hi-fi body describes.
      The fixture publishes one document, so without this the switcher would
      always land back on the same page. */
  deploymentId?: string;
  status?: PanelStatus;
  reason?: string;
  /** Stage visuals (smoke until BR-EX-41). Absent = honest states only. */
  visuals?: StageVisuals;
  onSubmit?: () => void;
  onRequestExit?: () => void;
  onCopyProvenance?: (full: string) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Reconciliation");
  const [plan, setPlan] = useState<string | null>(null);
  const now = useCertTick();
  const smoke = certSmoke(deploymentId ?? certification?.deploymentId);
  const brokerFresh = sbAgeSeconds(now) < BROKER_POLICY_SECONDS;
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-cert">
        <PanelState status={status} reason={reason} />
      </ExecutionSurface>
    );
  }
  if (!certification) {
    return (
      <ExecutionSurface kind="deployments" className="exec-cert">
        <PanelState status="loading" reason="Loading the certification." />
      </ExecutionSurface>
    );
  }
  const gate = certificationBlocked(certification);
  const isAdmin = certification.actorRoles.includes("ADMIN");
  const byId = new Map<string, PanelEnvelope>(certification.sourcePanels.map((p) => [p.panelId, p]));
  const criticalOpen = certification.findings.rows.filter((f) => f.severity === "CRITICAL" && f.status !== "RESOLVED");
  const passed = certification.progress?.passedCount;
  const total = certification.progress?.totalCount;
  const runtime = certification.runtimeState ?? "not stated";
  // The hi-fi's `reconFinding` demo state is not a switch here: it is the
  // difference between the two deployments in certification, and either the
  // contract or the smoke can raise it.
  const critical = criticalOpen.length > 0 || Boolean(smoke?.critical);
  const banner = critical
    ? smoke?.criticalBanner ?? {
        title: "Critical reconciliation finding open — activation fail-closed",
        body: "Smoke activation and Exit Review are blocked until the finding is resolved and a clean dry-run passes.",
      }
    : null;
  const badges: HeaderBadge[] = [
    { label: "SANDBOX", axis: "stage" },
    { label: `runtime ${runtime}`, axis: "runtime", tone: runtime === "HALTED" ? "mute" : "warn" },
    { label: gate.blocked ? "BLOCKED" : certification.progress?.eligible ? "READY" : "IN PROGRESS", axis: "readiness", tone: gate.blocked ? "bad" : certification.progress?.eligible ? "good" : "warn" },
    { label: `source ${certification.sourceIntegrationState ?? "not stated"}`, axis: "broker-sync", tone: byId.get("broker")?.panelState === "ok" ? "good" : "warn" },
  ];
  const blockers: RailBlocker[] = [
    ...criticalOpen.map((f) => ({ label: `CRITICAL ${f.identity ?? f.findingId}`, detail: `local ${f.localValue ?? "—"} · broker ${f.brokerValue ?? "—"} · ${f.status ?? "open"}`, severity: "blocking" as const })),
    ...groupStepReasons(gate.reasons),
    ...certification.steps.filter((s) => s.evaluationState === "FAIL" || s.evaluationState === "STALE").map((s) => ({ label: `${s.label} ${s.evaluationState}`, detail: s.blockerCode ?? s.summary ?? null, severity: (s.evaluationState === "FAIL" ? "blocking" : "watch") as "blocking" | "watch" })),
  ];
  const provenanceItems = [
    ...certification.lineage.map((l) => ({ label: l.kind, short: l.value.startsWith("sha256:") ? shortDigest(l.value) : l.value, full: l.value.startsWith("sha256:") ? l.value : null, href: l.href })),
    ...(certification.progress?.evidenceSetHash ? [{ label: "evidence set", short: shortDigest(certification.progress.evidenceSetHash), full: certification.progress.evidenceSetHash }] : []),
    ...(certification.externalAccountRef ? [{ label: "external account", short: certification.externalAccountRef, full: null }] : []),
    { label: "profile", short: certification.deliveryProfile ?? "not stated", full: null },
  ];
  const rail = (
    <ExecutionContextRail
      next={{
        title: gate.blocked ? "Exit blocked" : "Next: Sandbox Exit Review",
        detail: (
          <span className="exec-role-body">
            exit requires: clean exposure → final sync → clean dry-run → return HALTED · all actions plan → apply → verify
          </span>
        ),
        action: isAdmin ? (
          <div className="exec-cert-actions exec-stage-actions">
            <button type="button" className="exec-role-control exec-btn-ghost" disabled={gate.blocked || !onSubmit || certification.submittedBy !== null} onClick={onSubmit}>
              Submit for review
            </button>
            <button type="button" className="exec-role-control exec-btn-apply" disabled={gate.blocked || !onRequestExit} onClick={onRequestExit}>
              Request Sandbox Exit Review
            </button>
          </div>
        ) : (
          <p className="exec-disabled-reason">Certification actions are available to Admin operators only.</p>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          broker {byId.get("broker")?.freshness ?? "freshness not stated"}
          {byId.get("broker")?.asOf ? ` · as_of ${byId.get("broker")?.asOf}` : ""} · workflow {certification.workflowState ?? "not stated"}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance ?? (() => undefined)} />}
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-cert exec-a3 exec-ac exec-lf exec-sb exec-sbc" data-hifi-exact="sandbox-certification">
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-cert-head">
          {smoke ? (
            <>
              {/* Quick switch between the certifications actually in progress —
                  the full list, findings and history stay in the overview. */}
              <nav className="exec-sbc-switch" aria-label="Certifications in progress">
                <a className="exec-sbc-back" href="/deployments/sandbox">← Sandbox overview</a>
                <span className="exec-sbc-switchlabel">In certification ({smoke.switcher.length})</span>
                {smoke.switcher.map((s) => (
                  <a key={s.dep} className="exec-sbc-tab" href={s.href} aria-current={s.dep === smoke.dep ? "page" : undefined} data-active={s.dep === smoke.dep ? "true" : undefined}>
                    {s.label}{s.halted ? <span className="exec-sbc-haltword"> {s.halted}</span> : null}
                  </a>
                ))}
                <span className="exec-sbc-switchnote">quick switch between active certifications · full list, findings &amp; history in the overview</span>
              </nav>
              <header className="exec-masthead exec-a3-masthead exec-sbc-masthead">
                <div className="exec-a3-h1" role="heading" aria-level={1}>
                  {smoke.alpha} <span className="exec-a3-id">— Sandbox Certification · {smoke.venue}</span>
                </div>
                <span className="exec-a3-kind exec-sbc-validation">{smoke.chips.validation}</span>
                {/* Runtime and readiness are the contract's words, not the
                    hi-fi's: `runtime_state` stays null rather than becoming
                    HALTED, and the verdict comes from the same gate the rail
                    reads. The hi-fi shape is kept; the claim is not invented. */}
                <span className="exec-ac-sync" data-tone={runtime === "HALTED" ? "warn" : "mute"}>
                  {certification.runtimeState ? `⛔ ${certification.runtimeState}` : "runtime not stated"}
                </span>
                <span className="exec-ac-sync" data-tone={gate.blocked ? "bad" : certification.progress?.eligible ? "good" : "warn"}>
                  {gate.blocked ? "✕ BLOCKED" : certification.progress?.eligible ? "✓ READY" : "● IN PROGRESS"}
                </span>
                <span className="exec-a3-wf">WF 1d</span>
                <span className="exec-a3-spacer" />
                <span className="exec-a3-source exec-sbc-broker">
                  {/* FRESH is derived from the age against the policy, not
                      printed as a constant: a word that cannot turn into STALE
                      is not a freshness reading. */}
                  <b>BROKER</b> · <span className="exec-af-livedot" aria-hidden="true" /> rest snapshot age <span data-tone={brokerFresh ? "good" : "warn"}>{sbAge(now)}</span> · policy {BROKER_POLICY_SECONDS}s → <span data-tone={brokerFresh ? "good" : "warn"}>{brokerFresh ? "FRESH" : "STALE"}</span> · as_of {sbClock(now)}
                </span>
              </header>
              <div className="exec-a3-meta exec-sbc-meta">
                {smoke.meta.map((m) => (
                  <span key={m.k}>
                    {m.k} {m.href ? <a href={m.href}>{m.v}</a> : <b data-tone={m.tone}>{m.v}</b>}{m.tail ?? ""}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <ExecutionPageHeader
              title={
                <>
                  {certification.deploymentId ?? certification.certificationId}
                  <span className="exec-cert-venue"> · {certification.venue ?? "venue not stated"}</span>
                </>
              }
              id={certification.certificationId}
              badges={badges}
              purpose="Is the exchange integration certified? Fail-closed until every step passes."
              secondary={
                <span className="exec-role-meta">
                  account {certification.accountId ?? "not stated"}
                  {certification.externalAccountRef ? ` ↔ ${certification.externalAccountRef}` : ""}
                </span>
              }
            />
          )}
          {banner ? (
            <div className="exec-cert-critical exec-sbc-critical" role="alert">
              <b>{banner.title}</b>
              <span>{banner.body}</span>
            </div>
          ) : null}
        </div>
        {smoke ? (
          <>
              <ol className="exec-sbc-stepper" aria-label="Certification steps (hi-fi)">
                {smoke.steps.map((s) => (
                  <li key={s.n} className="exec-sbc-step" data-tone={s.tone} data-pending={s.pending ? "true" : undefined}>
                    <span className="exec-sbc-stepn">{s.n} · {s.label}</span>
                    <span className="exec-sbc-stepstate" data-tone={s.tone}>{s.state}</span>
                  </li>
                ))}
              </ol>
              <div className="exec-lf-life exec-sbc-life">
                {smoke.lifecycle.map((l) => (
                  <span key={l.k}><span data-tone="good">{l.k} ✓ <a href={l.href}>{l.v}</a></span> <span className="exec-lf-arrow">→</span></span>
                ))}
                <span className="exec-lf-now">{smoke.lifecycleNow}</span>
                {smoke.lifecycleRest.map((r) => (
                  <span key={r}><span className="exec-lf-arrow">→</span> <span className="exec-a3-mute">{r}</span></span>
                ))}
                <span className="exec-a3-spacer" />
                <span>lifecycle · ✓ links its decision · ● current stage</span>
              </div>
              <div className="exec-360-grid3 exec-sbc-triptych">
                <section className="exec-360-col" aria-label="Internal virtual state (hi-fi)">
                  <div className="exec-tile-title">Internal virtual state <span className="exec-sbc-src">EXECUTION</span></div>
                  <Facts rows={smoke.triptych.internal} />
                </section>
                <section className="exec-360-col" aria-label="Physical broker state (hi-fi)">
                  <div className="exec-tile-title">Physical broker state <span className="exec-sbc-src">{smoke.triptych.brokerHead}</span></div>
                  <Facts rows={smoke.triptych.broker} />
                </section>
                <section className="exec-360-col" aria-label="Difference (hi-fi)">
                  <div className="exec-tile-title">Difference <span className="exec-sbc-src">{smoke.triptych.diffHead}</span></div>
                  <Facts rows={smoke.triptych.difference} />
                </section>
              </div>
              <section className="exec-pf2-panel exec-sbc-findings" aria-label="Reconciliation findings (hi-fi)">
                <header className="exec-pf2-head">
                  <span className="exec-pf2-title">Reconciliation findings</span>
                  <span className="exec-pf2-spacer" />
                  <span className="exec-pf2-note">{smoke.findingsHead}</span>
                </header>
                <div className="exec-scroll-x">
                  <table className="exec-pf2-table exec-sbc-ftable">
                    <thead>
                      <tr><th>status</th><th>severity</th><th>identity</th><th data-numeric="true">local</th><th data-numeric="true">broker</th><th>action</th></tr>
                    </thead>
                    <tbody>
                      {smoke.findings.map((f) => (
                        <tr key={f.identity}>
                          <td><span className="exec-sb-status" data-tone={f.statusTone === "good" ? "good" : f.statusTone}>{f.status}</span></td>
                          <td data-tone={f.severityTone}>{f.severity}</td>
                          <td>{f.identity}</td>
                          <td data-numeric="true">{f.local}</td>
                          <td data-numeric="true">{f.broker}</td>
                          <td data-tone={f.actionTone}>{f.actionHref ? <a href={f.actionHref}>{f.action}</a> : f.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="exec-pf2-grid" data-ratio="1">
                <section className="exec-pf2-panel" aria-label="Order-type certification (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Order-type certification · {smoke.venue.split(" ")[0]} perp</span></header>
                  <div className="exec-lf-kv exec-sbc-kv">
                    {smoke.orderTypes.flatMap((r) => [
                      <span key={r.k} className="exec-bd-k">{r.k}</span>,
                      <span key={`${r.k}-v`} data-tone={r.tone}>{r.v}</span>,
                    ])}
                  </div>
                  <footer className="exec-pf2-foot">{smoke.orderTypesFoot}</footer>
                </section>
                <section className="exec-pf2-panel" aria-label="Execution quality (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Execution quality — evidence so far</span></header>
                  <div className="exec-lf-kv exec-sbc-kv">
                    {smoke.quality.flatMap((r) => [
                      <span key={r.k} className="exec-bd-k">{r.k}</span>,
                      <span key={`${r.k}-v`} data-tone={r.tone}>{r.v}</span>,
                    ])}
                  </div>
                  <footer className="exec-pf2-foot">{smoke.qualityFoot}</footer>
                </section>
              </div>
              <div className="exec-pf2-grid" data-ratio="1">
                <section className="exec-pf2-panel" aria-label="Smoke plan (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Smoke plan · {smoke.plan.id} — bounded</span></header>
                  <div className="exec-lf-kv exec-sbc-kv">
                    {smoke.plan.rows.flatMap((r) => [
                      <span key={r.k} className="exec-bd-k">{r.k}</span>,
                      <span key={`${r.k}-v`} data-tone={r.tone}>{r.v}</span>,
                    ])}
                  </div>
                </section>
                <section className="exec-pf2-panel" aria-label="Cleanup checklist (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Cleanup checklist — exit precondition</span></header>
                  <ul className="exec-sbc-check">
                    {smoke.cleanup.rows.map((r) => (
                      <li key={r.t} data-ok={r.ok ? "true" : "false"}><b>{r.ok ? "✓" : "!"}</b> {r.t}</li>
                    ))}
                  </ul>
                  <footer className="exec-pf2-foot">{smoke.cleanup.foot}</footer>
                </section>
              </div>
              <div className="exec-sbc-actionbar">
                {isAdmin ? (
                  <>
                    <button type="button" className="exec-a3-btn" aria-pressed={plan === "sync"} onClick={() => setPlan(plan === "sync" ? null : "sync")}>{smoke.actions.sync}</button>
                    <button type="button" className="exec-a3-btn" aria-pressed={plan === "dryRun"} onClick={() => setPlan(plan === "dryRun" ? null : "dryRun")}>{smoke.actions.dryRun}</button>
                    {smoke.actions.smoke.blocked ? (
                      <span className="exec-sbc-blocked">{smoke.actions.smoke.label} — {smoke.actions.smoke.blocked}</span>
                    ) : (
                      <button type="button" className="exec-pf2-primary" aria-pressed={plan === "smoke"} onClick={() => setPlan(plan === "smoke" ? null : "smoke")}>{smoke.actions.smoke.label}</button>
                    )}
                    <span className="exec-sbc-blocked">{smoke.actions.exit.label} — {smoke.actions.exit.blocked}</span>
                  </>
                ) : (
                  <span className="exec-sbc-blocked">mutation actions hidden — Operator Admin scope required</span>
                )}
                <span className="exec-a3-spacer" />
                <span className="exec-sbc-actionfoot">{smoke.actionsFoot}</span>
              </div>
              {plan ? <ActionPlan plan={plan} cert={smoke} onClose={() => setPlan(null)} /> : null}
              <p className="exec-af-smoke">! {SANDBOX_SMOKE_WARNING}</p>
          </>
        ) : null}
        <details className="exec-pf2-contract exec-sbc-contract" open>
          <summary>published KPIs · sandbox-certification.v1 contract — the hi-fi body above is smoke until BR-EX-61</summary>
          <ExecutionDecisionStrip
            metrics={[
              { label: "Steps passed", value: passed !== null && passed !== undefined && total ? `${passed}/${total}` : null, tone: certification.progress?.eligible ? "good" : undefined },
              { label: "Findings", value: certification.findings.totalCount !== null ? String(certification.findings.totalCount) : null, note: certification.findings.totalCount === null ? "count not published" : null },
              { label: "Critical open", value: String(criticalOpen.length), tone: criticalOpen.length ? "bad" : "good" },
              { label: "Promotion plans", value: String(certification.promotionPlans.length) },
              { label: "Gate", value: gate.blocked ? "BLOCKED" : "OPEN", tone: gate.blocked ? "bad" : "good" },
            ]}
          />
          <section aria-label="Certification steps">
            <ol className="exec-cert-strip">
              {certification.steps.map((step, i) => (
                <StepCell key={step.stepKey ?? i} step={step} index={i} />
              ))}
            </ol>
          </section>
        </details>
        {visuals ? (
          <details className="exec-pf2-contract exec-sbc-telemetry">
            <summary>stage telemetry · smoke until BR-EX-41 (ACK latency histogram, certification gauges, sparklines)</summary>
            <div className="exec-visual-grid">
              <div className="exec-visual-row">
                <HistogramChart hist={visuals.latency} warning={visuals.warning} />
                {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
              </div>
              <CapGauges title="Certification progress" items={visuals.caps} warning={visuals.warning} />
            </div>
          </details>
        ) : null}
        <ExecutionTabs
          tabs={[
            { key: "Reconciliation", label: "Reconciliation", count: certification.findings.rows.length },
            { key: "Steps", label: "Steps", count: certification.steps.length },
            { key: "Promotion plans", label: "Promotion plans", count: certification.promotionPlans.length },
            { key: "Timeline", label: "Timeline", count: certification.timeline.rows.length },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
          label="Certification sections"
        >
          {tab === "Reconciliation" ? (
            <div className="exec-fixtures-stack">
              {visuals ? <PositionsTable rows={visuals.positions} caption="Physical broker state · testnet" warning={visuals.warning} /> : null}
              <div className="exec-cert-triptych exec-source-grid">
                {TRIPTYCH.map((panel) => (
                  <SourceTile
                    key={panel.id}
                    title={panel.title}
                    envelope={byId.get(panel.id)}
                    unavailableReason="This source is not readable in the current profile. Missing evidence, not a clean result."
                  />
                ))}
              </div>
              <section className="exec-cert-findings" aria-label="Reconciliation findings">
                <ExecutionSectionTitle>Reconciliation findings</ExecutionSectionTitle>
                {certification.findings.rows.length === 0 ? (
                  <p className="exec-cert-note exec-role-body">
                    {certification.findings.totalCount === 0
                      ? "No findings were returned. With the sources unavailable this is an absence of evidence, not a clean result."
                      : "Findings count not published."}
                  </p>
                ) : (
                  <div className="exec-scroll-x">
                    <table className="exec-cert-table exec-360-sync">
                      <thead>
                        <tr>
                          <th scope="col">status</th>
                          <th scope="col">severity</th>
                          <th scope="col">identity</th>
                          <th scope="col">local</th>
                          <th scope="col">broker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certification.findings.rows.map((f) => (
                          <tr key={f.findingId} data-severity={f.severity ?? undefined}>
                            <td>{f.status ?? "—"}</td>
                            <td>{f.severity ?? "—"}</td>
                            <td>{f.identity ?? "—"}</td>
                            <td className="exec-num">{f.localValue ?? "—"}</td>
                            <td className="exec-num">{f.brokerValue ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
          {tab === "Steps" ? (
            <div className="exec-fixtures-stack">
            {visuals?.orderTypes ? <OrderTypeMatrix rows={visuals.orderTypes} warning={visuals.warning} /> : null}
            <div className="exec-scroll-x">
              <table className="exec-360-sync">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">step</th>
                    <th scope="col">evaluation</th>
                    <th scope="col">authority</th>
                    <th scope="col">evidence</th>
                    <th scope="col">expires</th>
                  </tr>
                </thead>
                <tbody>
                  {certification.steps.map((s, i) => (
                    <tr key={s.stepKey ?? i} data-evaluation={s.evaluationState ?? "UNAVAILABLE"}>
                      <td className="exec-num">{(s.ordinal ?? i) + 1}</td>
                      <td>{s.label}{s.summary ? <span className="exec-gate-note"> — {s.summary}</span> : null}</td>
                      <td>{s.evaluationState ?? "not stated"}{s.blockerCode ? <span className="exec-gate-note"> · {s.blockerCode}</span> : null}</td>
                      <td>{s.authority ?? "—"}</td>
                      <td className="exec-num">{s.evidenceHash ? shortDigest(s.evidenceHash) : "—"}</td>
                      <td className="exec-num">{s.expiresAt ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          ) : null}
          {tab === "Promotion plans" ? (
            certification.promotionPlans.length > 0 ? (
              <section className="exec-cert-plans" aria-label="Promotion plans">
                <ul>
                  {certification.promotionPlans.map((plan) => (
                    <li key={plan.planId}>
                      {plan.planId} → {plan.targetStage ?? "stage not stated"} · <strong>{plan.status ?? "status not stated"}</strong>
                      <span className="exec-cert-note"> — a record that the request was refused, not an activation attempt</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <PanelState status="empty" reason="No promotion plan has been requested for this certification." />
            )
          ) : null}
          {tab === "Timeline" ? (
            certification.timeline.rows.length > 0 ? (
              <div className="exec-scroll-x">
                <table className="exec-360-sync">
                  <thead>
                    <tr>
                      <th scope="col">at (UTC)</th>
                      <th scope="col">action</th>
                      <th scope="col">actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certification.timeline.rows.map((e) => (
                      <tr key={e.eventId}>
                        <td className="exec-num">{e.createdAt ?? "—"}</td>
                        <td>{e.action ?? "—"}</td>
                        <td>{e.actor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PanelState status="empty" reason="No certification events were published." />
            )
          ) : null}
        </ExecutionTabs>
        <footer className="exec-cert-footer">
          {gate.blocked ? (
            <div className="exec-disabled-reason">
              {gate.reasons.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
          ) : null}
        </footer>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
