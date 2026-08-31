import { Fragment } from "react";

/**
 * Fixture-lab demo panels for the governance gates (BR-EX-67 reference
 * frames). Product routes never import this module — the boundary test
 * enforces it; the lab and unit tests inject these where the screens expose
 * their `evidence` / panel props.
 */
import { GOV_CHARTS } from "../governance.smoke";
import { BarsChart, LinesChart } from "../components/marketChart";

export const R1_POLICY_CHIP = GOV_CHARTS.r1Policy;
export const R2_CRITERIA_POLICY_CHIP = GOV_CHARTS.r2Criteria.policy;

export function R1EvidenceSmoke() {
  return (
    <div className="exec-grid-2" data-ratio="1.5">
      <section className="exec-chart-tile" aria-label="Equity across window roles">
        <h3 className="exec-section-title">Equity across window roles</h3>
        <p className="exec-gate-rolelegend" aria-hidden="true"><span data-tone="mute">— IS</span><span data-tone="accent">— Outer OOS</span><span data-tone="warn">— holdout</span></p>
        <LinesChart
          height={230}
          series={GOV_CHARTS.r1Equity.series}
          verticalLines={GOV_CHARTS.r1Equity.boundaries}
          annotation={GOV_CHARTS.r1Equity.maxDd}
          yFormatter={(v) => v.toFixed(1)}
          provenance={{ authority: "RESEARCH", asOf: "run_5512", formula: "window roles fixed by claim clm_31" }}
          ariaLabel="Equity across in-sample, outer out-of-sample and holdout windows"
        />
        <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.r1Equity.foot} · reference shape for BR-EX-67 evidence_series. Delete when BR-EX-67 ships</p>
      </section>
      <section className="exec-chart-tile" aria-label="WFO stability — Sharpe per fold">
        <h3 className="exec-section-title">WFO stability — Sharpe per fold</h3>
        <BarsChart
          height={230}
          points={GOV_CHARTS.wfo.folds}
          thresholdLine={{ y: GOV_CHARTS.wfo.threshold, label: `threshold ${GOV_CHARTS.wfo.threshold.toFixed(1)}`, tone: "mute" }}
          highlight={{ index: GOV_CHARTS.wfo.worst.index, label: GOV_CHARTS.wfo.worst.label, tone: "warn" }}
          yFormatter={(v) => v.toFixed(2)}
          provenance={{ authority: "RESEARCH", asOf: "run_5512", formula: "wfo_stability.v1" }}
          ariaLabel="Walk-forward Sharpe per fold against the stability threshold"
        />
        <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.wfo.foot} · reference shape for BR-EX-67 evidence_series. Delete when BR-EX-67 ships</p>
      </section>
    </div>
  );
}

export function R2FitSmoke() {
  return (
        <div className="exec-gov-panel" data-smoke="true">
      <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Portfolio fit</span></div>
      <div className="exec-gate-fitbody">
        <div className="exec-gate-fitweight">
          <span>target capital weight</span>
          <b className="exec-num">{GOV_CHARTS.r2Fit.targetWeightPct.toFixed(1)}%</b>
        </div>
        <div className="exec-gate-fitbar" aria-hidden="true"><span style={{ width: `${Math.min(100, GOV_CHARTS.r2Fit.targetWeightPct * 4)}%` }} /></div>
        <div className="exec-gov-kv" data-flush="true">
          {GOV_CHARTS.r2Fit.rows.map((r) => (
            <Fragment key={r.k}>
              <span className="exec-gov-k">{r.k}</span>
              <span className="exec-gov-v" data-tone={"tone" in r ? r.tone : undefined}>{r.v}{"tail" in r && r.tail ? <span className="exec-gate-note">{r.tail}</span> : null}</span>
            </Fragment>
          ))}
        </div>
        <p className="exec-af-smoke">! SMOKE DATA — {GOV_CHARTS.r2Fit.foot}. Reference shape for BR-EX-67. Delete when BR-EX-67 ships</p>
      </div>
    </div>
  );
}

export function R2CriteriaSmoke() {
  return (
      <div className="exec-gov-panel">
      {/* SMOKE until BR-EX-67: criteria are POLICY DATA — thresholds from the
          versioned gate policy, verdicts computed server-side (hi-fi 1b note).
          The browser renders, never re-derives. */}
      <div className="exec-gov-panelhead">
        <span className="exec-gov-paneltitle">Gate criteria — policy vs evidence</span>
        <span className="exec-gate-policychip" title="SMOKE — the versioned gate policy reference ships with BR-EX-67">{GOV_CHARTS.r2Criteria.policy}</span>
        <span className="exec-gov-spacer" />
        <button type="button" className="exec-gov-reglink" disabled title="The policy registry route ships with BR-EX-67.">policy registry →</button>
      </div>
      <div className="exec-scroll-x">
        <table className="exec-360-sync exec-gate-criteria">
          <thead>
            <tr>
              <th scope="col">criterion</th>
              <th scope="col" data-numeric="true">threshold</th>
              <th scope="col" data-numeric="true">run_5512</th>
              <th scope="col">verdict</th>
            </tr>
          </thead>
          <tbody>
            {GOV_CHARTS.r2Criteria.rows.map((row) => (
              <tr key={row.criterion} data-verdict={row.verdict}>
                <th scope="row">{row.criterion}</th>
                <td className="exec-num">{row.threshold}</td>
                <td className="exec-num">{row.observed}</td>
                <td>
                  {row.verdict === "PASS" ? (
                    <span className="exec-gov-verified">✓ PASS</span>
                  ) : (
                    <span className="exec-gate-waiverable">! WAIVERABLE {row.note ?? ""}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="exec-role-meta exec-gate-criteriafoot">{GOV_CHARTS.r2Criteria.foot} · evidence: {GOV_CHARTS.r2Criteria.evidence.map((e) => e.label).join(" · ")}</p>
    </div>
  );
}

export function R2StagesSmoke() {
  return (
      <div className="exec-gate-stagechips" role="group" aria-label="Stage eligibility, derived from gate policies">
      <span className="exec-gov-meta">Stage eligibility (derived from gate policies)</span>
      {GOV_CHARTS.r2Stages.map((c) => (
        <span key={c.stage} className="exec-gate-stagechip" data-state={c.state}>
          {c.stage} — {c.detail}
        </span>
      ))}
      <span className="exec-gov-meta">each chip = that stage's gate policy, evaluated against today's evidence · SMOKE, BR-EX-67</span>
    </div>
  );
}
