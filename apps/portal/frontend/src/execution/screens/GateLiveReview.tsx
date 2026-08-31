/**
 * Gate LIVE review — canary → live (owner-commissioned 2026-08-30, ROADMAP
 * §H.2.2). Until today `LIVE_GATE` rows opened the R2 screen, so the reviewer
 * approving real money saw capital evidence instead of canary evidence. This
 * screen shows what that decision actually rests on: the canary window against
 * its paper twin, the envelope record, and the versioned `gate_live` policy —
 * composed in the same governance grammar as R1/R2 so the three gates read as
 * one room.
 *
 * Data honesty: the product consumes `governance.live-review.v1` — the
 * governance backbone rides inside it as a full r2-review payload, the four
 * canary-evidence branches arrive typed (today every one is UNAVAILABLE with
 * its reason code), and the current source is a profile-read envelope where
 * a valid empty Live is empty. The reviewed hi-fi panels render only when the
 * lab injects `demo`; the product route never does.
 */
import { Fragment, type ReactNode } from "react";

import { preciseAge, useInboxTick } from "../liveTick";

import type { LiveGateDemo } from "../governance.smoke";
import type { BranchCapability, ProfileEnvelope } from "../api/profileRead";
import { LinesChart } from "../components/marketChart";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { PanelState } from "../components/states";
import type { PanelStatus, Sla } from "../contracts";
import { SlaCell } from "../components/evidence";

export function GateLiveReview({
  approvalId,
  subject,
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
  canaryDeploymentId,
  branches,
  currentSource,
  readAt,
  demo,
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
  /** `canary_ref.deployment_id` — the room the evidence window lives in. */
  canaryDeploymentId?: string | null;
  /** The four derived canary-evidence branches, exactly as published. */
  branches?: readonly BranchCapability[];
  /** Live facts envelope (profile-read). Empty is a valid live truth. */
  currentSource?: ProfileEnvelope | null;
  readAt?: string | null;
  /** Reviewed hi-fi evidence — the lab passes it; the product never does. */
  demo?: LiveGateDemo | null;
}) {
  const smoke = demo ?? null;
  const tick = useInboxTick();
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
        <h1 className="exec-gov-h1">Canary Evidence Approval <span className="exec-gov-dim">—</span> {subject ?? canaryDeploymentId ?? approvalId}</h1>
      </div>
      <div className="exec-gov-metaline">
        {smoke ? <span className="exec-gov-chip" data-fill="good">R2 {smoke.r2Ref.id}</span> : null}
        <span className="exec-gov-meta">
          {smoke ? <><a href={smoke.r2Ref.href}>{smoke.r2Ref.note} →</a> · </> : null}
          {canaryDeploymentId ? (
            <>evidence window lives in the <a href={smoke?.canaryHref ?? `/deployments/live/${canaryDeploymentId}/canary`}>Canary Control Room</a> · </>
          ) : null}
          request {approvalId} · dual approval {quorumMet}/{quorumRequired} · reviewer {actor}
          {readAt ? <> · read_at {readAt}</> : null}
          {sla ? <> · <SlaCell sla={sla} preciseAgeText={preciseAge(sla.ageMinutes, tick)} /></> : null}
        </span>
      </div>
      {smoke ? (
        <p className="exec-af-smoke">
          ! SMOKE DATA — {smoke.drift.foot}; criteria verdicts computed against {smoke.policy}.
          Delete when BR-EX-70 publishes the canary evidence branches
        </p>
      ) : null}

      {smoke ? (
        <div className="exec-gov-grid2" data-ratio="1.15">
          <div className="exec-gov-panel" data-smoke="true">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Canary record — {canaryDeploymentId ?? "dep_88"}</span></div>
            <div className="exec-gov-kv">
              {smoke.kpis.map((row) => (
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
              series={smoke.drift.series}
              yFormatter={(v) => v.toFixed(2)}
              provenance={{ authority: "EXECUTION", asOf: "canary 21d window", formula: "drift.v1" }}
              ariaLabel="Canary equity against its paper twin over the canary window"
            />
            <p className="exec-role-meta exec-gate-criteriafoot">{smoke.drift.foot}</p>
          </div>
        </div>
      ) : (
        <div className="exec-gov-grid2" data-ratio="1.15">
          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Current source — live facts</span></div>
            {currentSource ? (
              <div className="exec-gov-kv">
                <span className="exec-gov-k">state</span>
                <span className="exec-gov-v" data-tone={currentSource.state === "empty" ? undefined : "good"}>{currentSource.state.toUpperCase()}</span>
                <span className="exec-gov-k">freshness</span>
                <span className="exec-gov-v">{currentSource.freshness ?? "not published"}</span>
                <span className="exec-gov-k">completeness</span>
                <span className="exec-gov-v">{currentSource.completeness ?? "not published"}</span>
                <span className="exec-gov-k">as_of</span>
                <span className="exec-gov-v">{currentSource.asOf ?? "not published"}</span>
              </div>
            ) : (
              <PanelState status="unavailable" reason="The live current-source envelope was not published on this review." />
            )}
            <p className="exec-gate-note">a valid empty Live is empty — nothing here fills that in from a fixture</p>
          </div>
          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Canary evidence — published branches</span></div>
            {branches && branches.length > 0 ? (
              <div className="exec-gov-kv">
                {branches.map((branch) => (
                  <Fragment key={branch.capabilityId}>
                    <span className="exec-gov-k">{branch.capabilityId.replace(/_/g, " ")}</span>
                    <span className="exec-gov-v" data-tone={branch.state === "AVAILABLE" ? "good" : "warn"}>
                      {branch.state}{branch.reasonCode ? ` · ${branch.reasonCode}` : ""}{branch.retryable ? " · retryable" : ""}
                    </span>
                  </Fragment>
                ))}
              </div>
            ) : (
              <PanelState status="unavailable" reason="No canary-evidence branches were published on governance.live-review.v1." />
            )}
            <p className="exec-gate-note">each branch carries its own reason code — a branch that is UNAVAILABLE stays a stated gap, never a drawn chart</p>
          </div>
        </div>
      )}

      {smoke ? (
        <div className="exec-gov-panel" data-smoke="true">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Gate criteria — policy vs canary evidence</span>
            <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-70">{smoke.policy}</span>
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
                {smoke.criteria.map((row) => (
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
          <p className="exec-role-meta exec-gate-criteriafoot">{smoke.criteriaFoot}</p>
        </div>
      ) : (
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Gate criteria — policy vs canary evidence</span>
            <span className="exec-gate-policychip">gate policy reference not published · BR-EX-70</span>
          </div>
          <PanelState
            status="unavailable"
            reason="Gate criteria are POLICY DATA computed server-side; governance.live-review.v1 publishes them as a derived branch (today UNAVAILABLE). This screen will not recompute a verdict about real money."
          />
        </div>
      )}

      <div className="exec-gov-grid2" data-ratio="1.35">
        {smoke ? (
          <div className="exec-gov-inverse exec-gov-panel" data-smoke="true">
            <div className="exec-gov-panelhead">
              <span className="exec-gov-paneltitle">Capital step — execution vocabulary</span>
              <span className="exec-gate-policychip" data-inverse="true">PREVIEW · derived, not applied</span>
            </div>
            <div className="exec-gov-kv" data-flush="true">
              {smoke.capital.rows.map((row) => (
                <Fragment key={row.k}>
                  <span className="exec-gov-k">{row.k}</span>
                  <span className="exec-gov-v">{row.v}</span>
                </Fragment>
              ))}
            </div>
            <div className="exec-gate-capstep" aria-label="Capital step toward target">
              <span className="exec-gate-capsteptrack" aria-hidden="true">
                <span className="exec-gate-capstepfill" data-seg="now" style={{ width: "6.25%" }} />
                <span className="exec-gate-capstepfill" data-seg="step" style={{ left: "6.25%", width: "18.75%" }} />
                <span className="exec-gate-capstepmark" style={{ left: "6.25%" }} data-label="5k now" />
                <span className="exec-gate-capstepmark" style={{ left: "25%" }} data-label="20k this approval" />
                <span className="exec-gate-capstepmark" style={{ left: "100%" }} data-label="80k target" />
              </span>
              <span className="exec-gate-capsteplegend">canary 5,000 → <b>this step 20,000 (25% of target)</b> → target 80,000 · each later step is its own approval at this gate</span>
            </div>
            <p className="exec-gate-note">{smoke.capital.note}</p>
          </div>
        ) : (
          <div className="exec-gov-inverse exec-gov-panel">
            <div className="exec-gov-panelhead">
              <span className="exec-gov-paneltitle">Capital step — execution vocabulary</span>
              <span className="exec-gate-policychip" data-inverse="true">not published · BR-EX-70</span>
            </div>
            <PanelState
              status="unavailable"
              reason="The capital step (current allocation, this approval's step, target) is a derived branch on governance.live-review.v1 and is not published yet. Approving without it approves the stage grant only."
            />
          </div>
        )}
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
