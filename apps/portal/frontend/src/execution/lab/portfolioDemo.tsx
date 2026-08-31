/**
 * Portfolio 360 hi-fi demo layer — the reviewed Pf* panels plus the ρ/DD
 * chart frames, bundled for the `demoPanels` prop. Lab and tests only; the
 * product renders each of these slots as its own honest state instead.
 */
import { PF_CHARTS, pfSmoke } from "../portfolio360.smoke";
import {
  PfApprovalsHifi, PfAuditHifi, PfConfigLog, PfCorrMatrix, PfCrossPortfolio, PfDdOverlap,
  PfEraChart, PfFooterLinks, PfIncidentsHifi, PfInfluence, PfLeadership, PfLedgerHifi,
  PfLiveStrip, PfMarketCorr, PfSmokeNote, PfStructureExtras, PfWhatIf,
} from "../components/PortfolioOverview";
import { EpisodesChart, LinesChart } from "../components/marketChart";
import type { PortfolioThreeSixtyProps } from "../screens/PortfolioThreeSixty";

export function pfDemo() {
  return pfSmoke();
}

export function pfDemoPanels(portfolioId: string, benchmark: string, asOf: string | null): NonNullable<PortfolioThreeSixtyProps["demoPanels"]> {
  return {
    liveStrip: <PfLiveStrip />,
    eraChart: <PfEraChart />,
    crossPortfolio: <PfCrossPortfolio portfolioId={portfolioId} />,
    configLog: <PfConfigLog />,
    structureExtras: <PfStructureExtras />,
    corrMatrix: <PfCorrMatrix />,
    marketCorr: <PfMarketCorr />,
    leadership: (lensOn, onLens) => <PfLeadership lens={lensOn} onLens={onLens} />,
    whatIf: <PfWhatIf />,
    influence: <PfInfluence />,
    ddOverlap: <PfDdOverlap />,
    footerLinks: <PfFooterLinks />,
    ledger: <PfLedgerHifi />,
    approvals: <PfApprovalsHifi />,
    incidents: <PfIncidentsHifi />,
    audit: <PfAuditHifi />,
    smokeNote: <PfSmokeNote />,
    rhoChart: (
      <>
      <LinesChart
        height={210}
        series={[{ name: `ρ vs ${benchmark}`, tone: "accent", width: 2, points: PF_CHARTS.rho.points }]}
        thresholdLine={{ y: PF_CHARTS.rho.threshold, label: `threshold ${PF_CHARTS.rho.threshold}`, tone: "warn" }}
        annotation={{ t: PF_CHARTS.rho.breach.from, v: PF_CHARTS.rho.breach.peak, label: `breach ${PF_CHARTS.rho.breach.from.slice(5)}→${PF_CHARTS.rho.breach.to.slice(5)}`, tone: "warn" }}
        yFormatter={(v) => v.toFixed(2)}
        provenance={{ authority: "DERIVED", asOf: asOf ?? "—", formula: "corr.v1 · rho_timeline" }}
        ariaLabel={`Rolling correlation of NAV against ${benchmark} with the ${PF_CHARTS.rho.threshold} threshold`}
      />
      <footer className="exec-pf2-foot">{PF_CHARTS.rho.foot}</footer>
      </>
    ),
    ddOverlapChart: (
      <>
      <EpisodesChart
        height={190}
        rows={PF_CHARTS.ddOverlap.rows}
        joint={PF_CHARTS.ddOverlap.joint}
        window={PF_CHARTS.ddOverlap.window}
        provenance={{ authority: "DERIVED", asOf: asOf ?? "—", formula: "drawdown_overlap.v1" }}
        ariaLabel="Drawdown overlap timeline in the published-correlation slot"
      />
      <footer className="exec-pf2-foot">{PF_CHARTS.ddOverlap.foot}</footer>
      </>
    ),
  };
}
