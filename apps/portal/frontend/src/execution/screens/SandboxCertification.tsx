/**
 * Phase 10 — Sandbox Certification (hi-fi 1d, WF 1d, ops dark).
 *
 * Seven ordered steps, three source panels, and one thing the screen refuses to
 * do: work anything out. Gate progress, the current step, freshness, evidence
 * expiry and eligibility are all server fields, and this file reads them.
 *
 * The hi-fi's own sentence is the design: *fail-closed — ACTIVE impossible
 * while sync STALE / finding CRITICAL / cleanup pending*. So a CRITICAL
 * unresolved finding disables exit even if `eligible` said otherwise, and the
 * blocker codes are shown rather than a greyed button with no explanation.
 *
 * `runtime_state` is `null` in this profile and is rendered as "not stated".
 * Translating it to HALTED would tell an operator a deployment is stopped when
 * nobody knows — the most confident kind of wrong.
 */
import type { ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { AuthorityWord, FreshnessIndicator } from "../components/badges";
import type { PanelStatus } from "../contracts";
import {
  certificationBlocked,
  type CertificationStep,
  type PanelEnvelope,
  type SandboxCertification,
} from "../certification";

/** The three panels of the hi-fi's triptych, in its order. */
const TRIPTYCH: readonly { id: string; title: string }[] = [
  { id: "internal", title: "Internal virtual state" },
  { id: "broker", title: "Physical broker state" },
  { id: "difference", title: "Difference" },
];

/**
 * A step's evidence, drawn so `STALE` and `FAIL` cannot be read as each other.
 *
 * Evidence that expired is not evidence that failed. The hi-fi gives them
 * different marks for that reason, and a single red state would tell an
 * operator a check went wrong when it merely went out of date.
 */
function StepCell({ step, index }: { step: CertificationStep; index: number }) {
  return (
    <li
      className="exec-cert-step"
      data-strip={step.stripState ?? "PENDING"}
      data-evaluation={step.evaluationState ?? "UNAVAILABLE"}
    >
      <span className="exec-cert-ordinal">{(step.ordinal ?? index) + 1}</span>
      <span className="exec-cert-label">{step.label}</span>
      <span className="exec-cert-eval">{step.evaluationState ?? "not stated"}</span>
      {step.authority ? <AuthorityWord authority={step.authority} /> : null}
      {step.summary ? <span className="exec-cert-summary">{step.summary}</span> : null}
      {step.expiresAt ? (
        // The server's expiry, never a countdown this screen computed.
        <span className="exec-cert-summary">evidence expires {step.expiresAt}</span>
      ) : null}
      {step.blockerCode ? <span className="exec-cert-blocker">{step.blockerCode}</span> : null}
    </li>
  );
}

function SourcePanel({ panel, title }: { panel: PanelEnvelope | undefined; title: string }) {
  return (
    <section className="exec-cert-source" aria-label={title}>
      <h2>{title}</h2>
      {!panel ? (
        <PanelState status="unavailable" reason="This panel was not published in the response." />
      ) : panel.panelState === "ok" ? (
        <p className="exec-cert-note">
          Readable · {panel.authority ?? "authority not stated"} ·{" "}
          {panel.deliveryProfile ?? "profile not stated"}
        </p>
      ) : (
        <>
          <PanelState
            status={panel.panelState}
            reason={
              panel.panelState === "unavailable"
                ? "This source is not readable in the current profile. Missing evidence, not a clean result."
                : undefined
            }
          />
          <p className="exec-cert-note">
            {panel.authority ? <AuthorityWord authority={panel.authority} /> : null}{" "}
            {panel.freshness ? <FreshnessIndicator state={panel.freshness} /> : null}{" "}
            profile {panel.deliveryProfile ?? "not stated"} · verification{" "}
            {panel.sourceVerification ?? "not stated"}
          </p>
        </>
      )}
    </section>
  );
}

export function SandboxCertificationScreen({
  certification,
  status = "ok",
  reason,
  onSubmit,
  onRequestExit,
  children,
}: {
  certification: SandboxCertification | null;
  status?: PanelStatus;
  reason?: string;
  onSubmit?: () => void;
  onRequestExit?: () => void;
  children?: ReactNode;
}) {
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
  const byId = new Map(certification.sourcePanels.map((p) => [p.panelId, p]));
  const criticalOpen = certification.findings.rows.filter(
    (f) => f.severity === "CRITICAL" && f.status !== "RESOLVED",
  );

  return (
    <ExecutionSurface kind="deployments" className="exec-cert">
      <header className="exec-cert-head">
        <span className="exec-cert-kicker">SANDBOX</span>
        <h1>
          {certification.deploymentId ?? certification.certificationId}
          <span className="exec-cert-venue"> · {certification.venue ?? "venue not stated"}</span>
        </h1>
        <p className="exec-cert-note">
          {certification.workflowState ?? "state not stated"} · runtime{" "}
          {/* `null` stays null. HALTED would be a claim nobody made. */}
          {certification.runtimeState ?? "not stated"} · account{" "}
          {certification.accountId ?? "not stated"}
          {certification.externalAccountRef ? ` ↔ ${certification.externalAccountRef}` : null}
        </p>
        <p className="exec-cert-note">
          profile {certification.deliveryProfile ?? "not stated"} · source{" "}
          {certification.sourceIntegrationState ?? "not stated"}
        </p>
      </header>

      {certification.lineage.length > 0 ? (
        <ul className="exec-cert-lineage" aria-label="Lineage">
          {certification.lineage.map((item) => (
            <li key={`${item.kind}:${item.value}`}>
              <span className="exec-cert-note">{item.kind}</span> {item.value}
            </li>
          ))}
        </ul>
      ) : null}

      {criticalOpen.length > 0 ? (
        <p className="exec-cert-critical" role="alert">
          Critical reconciliation finding open — activation fail-closed. Smoke activation and Exit
          Review are blocked until the finding is resolved and a clean dry-run passes.
        </p>
      ) : null}

      <section aria-label="Certification steps">
        <h2 className="exec-cert-h2">
          Certification{" "}
          <span className="exec-cert-note">
            {/* The server's counts. Never `steps.filter(PASS).length`. */}
            {certification.progress?.passedCount ?? "—"} / {certification.progress?.totalCount ?? "—"}
          </span>
        </h2>
        <ol className="exec-cert-strip">
          {certification.steps.map((step, i) => (
            <StepCell key={step.stepKey ?? i} step={step} index={i} />
          ))}
        </ol>
      </section>

      <div className="exec-cert-triptych">
        {TRIPTYCH.map((panel) => (
          <SourcePanel key={panel.id} panel={byId.get(panel.id)} title={panel.title} />
        ))}
      </div>

      <section className="exec-cert-findings" aria-label="Reconciliation findings">
        <h2 className="exec-cert-h2">Reconciliation findings</h2>
        {certification.findings.rows.length === 0 ? (
          <p className="exec-cert-note">
            {certification.findings.totalCount === 0
              ? "No findings were returned. With the sources unavailable this is an absence of evidence, not a clean result."
              : "Findings count not published."}
          </p>
        ) : (
          <table className="exec-cert-table">
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
        )}
      </section>

      {certification.promotionPlans.length > 0 ? (
        <section className="exec-cert-plans" aria-label="Promotion plans">
          <h2 className="exec-cert-h2">Promotion plans</h2>
          <ul>
            {certification.promotionPlans.map((plan) => (
              <li key={plan.planId}>
                {plan.planId} → {plan.targetStage ?? "stage not stated"} ·{" "}
                <strong>{plan.status ?? "status not stated"}</strong>
                {/* A BLOCKED plan is a record of refusal. Saying so stops
                    `plan_id` reading as an activation that started. */}
                <span className="exec-cert-note">
                  {" "}
                  — a record that the request was refused, not an activation attempt
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="exec-cert-footer">
        {isAdmin ? (
          <div className="exec-cert-actions">
            <button
              type="button"
              disabled={gate.blocked || !onSubmit || certification.submittedBy !== null}
              onClick={onSubmit}
            >
              Submit for review
            </button>
            <button type="button" disabled={gate.blocked || !onRequestExit} onClick={onRequestExit}>
              Request Sandbox Exit Review
            </button>
          </div>
        ) : (
          <p className="exec-disabled-reason">
            Certification actions are available to Admin operators only.
          </p>
        )}

        {gate.blocked ? (
          <div className="exec-disabled-reason">
            {gate.reasons.map((code) => (
              <div key={code}>{code}</div>
            ))}
          </div>
        ) : null}

        <p className="exec-cert-note">
          exit requires: clean exposure → final sync → clean dry-run → return HALTED · all actions
          plan → apply → verify
        </p>
      </footer>
      {children}
    </ExecutionSurface>
  );
}
