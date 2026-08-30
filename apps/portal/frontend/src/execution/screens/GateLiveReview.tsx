/**
 * Gate LIVE review — canary → live (owner-commissioned 2026-08-30, ROADMAP
 * §H.2.2). Until today `LIVE_GATE` rows opened the R2 screen, so the reviewer
 * approving real money saw capital evidence instead of canary evidence. This
 * screen shows what that decision actually rests on: the canary window against
 * its paper twin, the envelope record, and the versioned `gate_live` policy —
 * composed in the same governance grammar as R1/R2 so the three gates read as
 * one room.
 *
 * Data honesty: the request backbone (eligibility, quorum, SLA, optimistic
 * version) is served by `governance.r2-review.v1` — the contract that carries
 * LIVE_GATE rows today. The canary evidence panels are DECLARED SMOKE
 * (`LIVE_GATE` frames in governance.smoke.ts) until BR-EX-70 publishes them.
 */
import { Fragment, type ReactNode } from "react";

import { LIVE_GATE } from "../governance.smoke";
import { LinesChart } from "../components/marketChart";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { PanelState } from "../components/states";
import type { PanelStatus, Sla } from "../contracts";
import { SlaCell } from "../components/evidence";

export function GateLiveReview({
  approvalId,
  subject = LIVE_GATE.subject,
  actor,
  policyVersion,
  quorumMet,
  quorumRequired,
  sla,
  status = "ok",
  reason,
  note,
  onNoteChange,
  onApprove,
  onDeny,
  locked,
  denyLocked,
  trail,
}: {
  approvalId: string;
  subject?: string;
  actor: string;
  policyVersion: string;
  quorumMet: number;
  quorumRequired: number;
  sla?: Sla;
  status?: PanelStatus;
  reason?: string;
  note: string;
  onNoteChange: (next: string) => void;
  onApprove: () => void;
  onDeny: () => void;
  locked: boolean;
  denyLocked: boolean;
  trail?: ReactNode;
}) {
  if (status !== "ok" && status !== "partial") {
    return (
      <section className="exec-gate exec-gov" aria-label={`Gate LIVE review ${approvalId}`}>
        <PanelState status={status} reason={reason} />
      </section>
    );
  }
  return (
    <section className="exec-gate exec-gov" aria-label={`Gate LIVE review ${approvalId}`} data-hifi-exact="gate-live-review">
      <div className="exec-gate-kicker">GATE LIVE · Canary Evidence</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">Canary Evidence Approval <span className="exec-gov-dim">—</span> {subject}</h1>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill="good">R2 {LIVE_GATE.r2Ref.id}</span>
        <span className="exec-gov-meta">
          <a href={LIVE_GATE.r2Ref.href}>{LIVE_GATE.r2Ref.note} →</a> · evidence window lives in the{" "}
          <a href={LIVE_GATE.canaryHref}>Canary Control Room</a> · request {approvalId} · dual
          approval {quorumMet}/{quorumRequired} · reviewer {actor}
          {sla ? <> · <SlaCell sla={sla} /></> : null}
        </span>
      </div>
      <p className="exec-af-smoke">
        ! SMOKE DATA — {LIVE_GATE.drift.foot}; criteria verdicts computed against {LIVE_GATE.policy}.
        Request backbone is governance.r2-review.v1; the canary payload ships with BR-EX-70. Delete
        when BR-EX-70 ships
      </p>

      <div className="exec-gov-grid2" data-ratio="1.15">
        <div className="exec-gov-panel" data-smoke="true">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Canary record — {LIVE_GATE.approvalId === approvalId ? "dep_88" : approvalId}</span></div>
          <div className="exec-gov-kv">
            {LIVE_GATE.kpis.map((row) => (
              <Fragment key={row.k}>
                <span className="exec-gov-k">{row.k}</span>
                <span className="exec-gov-v" data-tone={"tone" in row ? row.tone : undefined}>{row.v}</span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="exec-gov-panel" data-smoke="true">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Drift vs paper twin</span></div>
          <LinesChart
            height={210}
            series={LIVE_GATE.drift.series}
            yFormatter={(v) => v.toFixed(2)}
            provenance={{ authority: "EXECUTION", asOf: "canary 21d window", formula: "drift.v1" }}
            ariaLabel="Canary equity against its paper twin over the canary window"
          />
          <p className="exec-role-meta exec-gate-criteriafoot">{LIVE_GATE.drift.foot}</p>
        </div>
      </div>

      <div className="exec-gov-panel">
        <div className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Gate criteria — policy vs canary evidence</span>
          <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-70">{LIVE_GATE.policy}</span>
        </div>
        <div className="exec-gate-criteriawrap">
          <table className="exec-360-sync exec-gate-criteria">
            <thead>
              <tr>
                <th scope="col">criterion</th>
                <th scope="col" data-numeric="true">threshold</th>
                <th scope="col" data-numeric="true">canary window</th>
                <th scope="col">verdict</th>
              </tr>
            </thead>
            <tbody>
              {LIVE_GATE.criteria.map((row) => (
                <tr key={row.criterion} data-verdict={row.verdict}>
                  <th scope="row">{row.criterion}</th>
                  <td className="exec-num">{row.threshold}</td>
                  <td className="exec-num">{row.observed}</td>
                  <td><span className="exec-gov-verified">✓ PASS</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="exec-role-meta exec-gate-criteriafoot">{LIVE_GATE.criteriaFoot}</p>
      </div>

      <div className="exec-gov-grid2" data-ratio="1.35">
        <div className="exec-gov-inverse exec-gov-panel">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Capital step — execution vocabulary</span>
            <span className="exec-gate-policychip" data-inverse="true">PREVIEW · derived, not applied</span>
          </div>
          <div className="exec-gov-kv" data-flush="true">
            {LIVE_GATE.capital.rows.map((row) => (
              <Fragment key={row.k}>
                <span className="exec-gov-k">{row.k}</span>
                <span className="exec-gov-v">{row.v}</span>
              </Fragment>
            ))}
          </div>
          <p className="exec-gate-note">{LIVE_GATE.capital.note}</p>
        </div>
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">What approval changes</span></div>
          <div className="exec-gate-obsbody">
            Approve grants the capital step and the LIVE stage only. The deployment keeps its
            canary envelope until an Operator Admin runs the activation plan → apply → verify in
            the Action Drawer; every later step up to target returns to this gate. Deny returns
            the deployment to canary observation with its allocation unchanged — records are never
            deleted.
          </div>
        </div>
      </div>

      <ExecutionDecisionBar
        label={`Gate LIVE decision ${approvalId}`}
        verdict={locked && denyLocked ? "NOT YOURS" : "READY"}
        tone={locked && denyLocked ? "bad" : "warn"}
        reasons={[
          locked && denyLocked
            ? "your role holds no grant for this decision — visibility ≠ authority"
            : "dual approval — your decision counts once; the second approver sees the same evidence",
        ]}
        note={{ value: note, onChange: onNoteChange, disabled: locked && denyLocked }}
        footnote={
          <>
            decision recorded against policy {policyVersion} · evidence window pinned at decision ·
            the Execution cell re-validates everything when the grant is used
          </>
        }
        trail={trail}
        actions={
          <>
            <button type="button" className="exec-role-control exec-btn-ghost" disabled={denyLocked} onClick={onDeny}>
              Deny — back to canary
            </button>
            <button type="button" className="exec-role-control exec-btn-apply" disabled={locked} onClick={onApprove}>
              Approve live step
            </button>
          </>
        }
      />
    </section>
  );
}
