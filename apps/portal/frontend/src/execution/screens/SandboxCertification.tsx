/**
 * Sandbox Certification Workbench (HiFi 1d) on the V2 Paper anatomy.
 *
 * Fail-closed by construction: the deployment starts HALTED, a CRITICAL
 * reconciliation finding blocks activation and exit, and every action is
 * plan → apply → verify. The seven certification steps stay a horizontal
 * stepper; internal / broker / difference stay a triptych; findings and the
 * smoke plan are tables. Actions live in the rail's Next section and are
 * disabled with their reasons unless the server's gate says otherwise.
 */
import { useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { AuthorityWord } from "../components/badges";
import { SourceTile } from "../components/stageWorkbench";
import { ExecutionSectionTitle } from "../components/typography";
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

function StepCell({ step, index }: { step: CertificationStep; index: number }) {
  return (
    <li className="exec-cert-step" data-strip={step.stripState ?? "PENDING"} data-evaluation={step.evaluationState ?? "UNAVAILABLE"}>
      <span className="exec-cert-ordinal">{(step.ordinal ?? index) + 1}</span>
      <span className="exec-cert-label">{step.label}</span>
      <span className="exec-cert-eval">{step.evaluationState ?? "not stated"}</span>
      {step.authority ? <AuthorityWord authority={step.authority} /> : null}
      {step.summary ? <span className="exec-cert-summary">{step.summary}</span> : null}
      {step.expiresAt ? <span className="exec-cert-summary">evidence expires {step.expiresAt}</span> : null}
      {step.blockerCode ? <span className="exec-cert-blocker">{step.blockerCode}</span> : null}
    </li>
  );
}

export function SandboxCertificationScreen({
  certification,
  status = "ok",
  reason,
  onSubmit,
  onRequestExit,
  onCopyProvenance,
  children,
}: {
  certification: SandboxCertification | null;
  status?: PanelStatus;
  reason?: string;
  onSubmit?: () => void;
  onRequestExit?: () => void;
  onCopyProvenance?: (full: string) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Reconciliation");
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
  const badges: HeaderBadge[] = [
    { label: "SANDBOX", axis: "stage" },
    { label: `runtime ${runtime}`, axis: "runtime", tone: runtime === "HALTED" ? "mute" : "warn" },
    { label: gate.blocked ? "BLOCKED" : certification.progress?.eligible ? "READY" : "IN PROGRESS", axis: "readiness", tone: gate.blocked ? "bad" : certification.progress?.eligible ? "good" : "warn" },
    { label: `source ${certification.sourceIntegrationState ?? "not stated"}`, axis: "broker-sync", tone: byId.get("broker")?.panelState === "ok" ? "good" : "warn" },
  ];
  const blockers: RailBlocker[] = [
    ...criticalOpen.map((f) => ({ label: `CRITICAL ${f.identity ?? f.findingId}`, detail: `local ${f.localValue ?? "—"} · broker ${f.brokerValue ?? "—"} · ${f.status ?? "open"}`, severity: "blocking" as const })),
    ...gate.reasons.map((code) => ({ label: code, detail: "certification gate", severity: "blocking" as const })),
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
    <ExecutionSurface kind="deployments" className="exec-cert">
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-cert-head">
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
        </div>
        {criticalOpen.length > 0 ? (
          <p className="exec-cert-critical exec-role-body" role="alert">
            Critical reconciliation finding open — activation fail-closed. Smoke activation and Exit Review are blocked until the finding is resolved and a clean dry-run passes.
          </p>
        ) : null}
        <section aria-label="Certification steps">
          <ol className="exec-cert-strip">
            {certification.steps.map((step, i) => (
              <StepCell key={step.stepKey ?? i} step={step} index={i} />
            ))}
          </ol>
        </section>
        <ExecutionDecisionStrip
          metrics={[
            { label: "Steps passed", value: passed !== null && passed !== undefined && total ? `${passed}/${total}` : null, tone: certification.progress?.eligible ? "good" : undefined },
            { label: "Findings", value: certification.findings.totalCount !== null ? String(certification.findings.totalCount) : null, note: certification.findings.totalCount === null ? "count not published" : null },
            { label: "Critical open", value: String(criticalOpen.length), tone: criticalOpen.length ? "bad" : "good" },
            { label: "Promotion plans", value: String(certification.promotionPlans.length) },
            { label: "Gate", value: gate.blocked ? "BLOCKED" : "OPEN", tone: gate.blocked ? "bad" : "good" },
          ]}
        />
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
