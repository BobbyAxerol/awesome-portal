/**
 * Portfolio register — the `/deployments/portfolios` root (P4-A / BR-EX-76).
 * Renders the all-profile portfolio identity list from `GET /portfolios`;
 * a row opens that portfolio's 360. The route default derives from this data,
 * never from a canonical-cast constant.
 *
 * Reuse report: composed entirely from the reviewed list grammar — ExecutionSurface,
 * ExecutionWorkspace, PanelState, StatusChip and the `exec-af-*` table classes.
 * No new CSS, token or state word.
 */
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { StatusChip } from "../components/badges";
import { utcStamp } from "../time";
import type { PortfolioListEnvelope } from "../api/profileRead";
import type { PanelStatus } from "../contracts";

export interface PortfolioListProps {
  list?: PortfolioListEnvelope | null;
  status?: PanelStatus;
  reason?: string;
  onOpenPortfolio?: (portfolioId: string) => void;
}

export function PortfolioList({ list = null, status = "ok", reason, onOpenPortfolio }: PortfolioListProps) {
  const items = list?.items ?? [];
  const sourceStatus = status !== "ok" && status !== "partial" ? status : !list ? "unavailable" : null;
  const sourceReason = reason ?? (!list ? "No portfolio list was published for this workspace." : undefined);
  const mute = <span className="exec-af-mute">—</span>;
  const degraded = Object.entries(list?.environmentBranches ?? {})
    .filter(([, branch]) => branch.state === "UNAVAILABLE" || branch.state === "PARTIAL");
  return (
    <ExecutionSurface kind="deployments" className="exec-af" data-hifi-exact="portfolio-list">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Portfolios</h1>
            <span className="exec-af-sum">
              {list ? (list.truncated ? `top ${items.length} / ${list.totalPortfolios}` : `${items.length}`) : "?"} portfolios · {(list?.environment ?? "unknown").toUpperCase()}
            </span>
            <span className="exec-af-wf">entry screen for Portfolio 360°</span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source">
              <b>EXECUTION</b> · <StatusChip label={list?.freshness ?? "UNAVAILABLE"} tone={list?.freshness === "FRESH" ? "good" : "warn"} /> · source <span className="exec-af-num">{utcStamp(list?.sourceAsOf ?? null)}</span>
            </span>
          </header>
          {sourceStatus ? <div className="exec-af-panel"><PanelState status={sourceStatus} reason={sourceReason} /></div> : null}
          {degraded.length > 0 ? (
            <div className="exec-af-panel">
              <PanelState
                status="partial"
                reason={degraded.map(([environment, branch]) => `${environment}: ${branch.state}${branch.reasonCode ? ` · ${branch.reasonCode}` : ""}`).join(" — ")}
              />
            </div>
          ) : null}
          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table" aria-label="Portfolios">
                <thead><tr><th>portfolio</th><th>owner</th><th>state</th><th>profiles</th><th data-numeric="true">allocations</th><th data-numeric="true">deployments</th><th data-numeric="true">allocated capital</th><th>updated</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.portfolioId} className="exec-af-row">
                      <td>
                        <a
                          href={`/deployments/portfolios/${encodeURIComponent(item.portfolioId)}`}
                          onClick={(event) => { if (onOpenPortfolio) { event.preventDefault(); onOpenPortfolio(item.portfolioId); } }}
                        ><b>{item.name}</b></a>
                        <div className="exec-af-sub">{item.portfolioId} · base {item.baseCurrency}</div>
                      </td>
                      <td className="exec-af-dim">{item.owner ?? mute}</td>
                      <td><StatusChip label={item.state} tone={item.state === "ACTIVE" ? "good" : "warn"} /></td>
                      <td className="exec-af-dim">{item.environments.map((environment) => environment.toUpperCase()).join(" · ")}</td>
                      <td data-numeric="true">{item.allocationCount}</td>
                      <td data-numeric="true">{item.deploymentCount}</td>
                      <td data-numeric="true">{item.allocatedByCurrency.length > 0
                        ? item.allocatedByCurrency.map((entry) => `${entry.value} ${entry.currency}`).join(" · ")
                        : mute}</td>
                      <td className="exec-af-mute">{utcStamp(item.updatedAt)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && !sourceStatus ? <tr><td colSpan={8}><span className="exec-af-empty">No portfolio exists in the projected population — the source published an empty set, and an empty set is a fact.</span></td></tr> : null}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>source: manager.portfolios ⋈ portfolio_allocations, all profiles · capital values are exact source decimals</span>
              <span className="exec-af-spacer" />
              <span>portfolio row → Portfolio 360°</span>
            </footer>
          </div>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
