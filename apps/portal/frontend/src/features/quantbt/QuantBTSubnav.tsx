/**
 * QuantBT module subnav — the feature keeps local tabs while the shell owns
 * primary navigation (v0.4 §P0.9).
 *
 * Run identity lives in the path, so switching tabs cannot lose the selection
 * the way a dropped `?run=` used to.
 */
import { Link, useLocation } from "react-router-dom";

import { QUANTBT_TABS, runTabPath } from "./routes";

const LABELS: Record<(typeof QUANTBT_TABS)[number], string> = {
  overview: "Overview",
  optimization: "Optimization",
  parameters: "Parameters",
  execution: "Execution",
  audit: "Audit",
};

export function QuantBTSubnav({ runId }: { runId: string }) {
  const location = useLocation();
  return (
    <nav className="portal-subnav" aria-label="QuantBT Backtest">
      {QUANTBT_TABS.map((tab) => {
        const to = runTabPath(runId, tab);
        const active = location.pathname === to;
        return (
          <Link
            key={tab}
            to={to}
            className={`navtab ${active ? "navtab-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {LABELS[tab]}
          </Link>
        );
      })}
    </nav>
  );
}
