/**
 * QuantBT module subnav — the feature keeps its own local tabs while the
 * shell owns primary navigation (v0.4 §P0.9).
 *
 * `?run=` is carried across tabs: dropping it would silently reset run
 * selection, which is exactly the regression the standalone app guarded.
 */
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { QUANTBT_ROOT } from "./routes";

const TABS = [
  { path: "overview", label: "Overview" },
  { path: "optimization", label: "Optimization" },
  { path: "parameters", label: "Parameters" },
  { path: "execution", label: "Execution" },
  { path: "audit", label: "Audit" },
] as const;

export function QuantBTSubnav() {
  const location = useLocation();
  const [params] = useSearchParams();
  const search = params.toString();

  return (
    <nav className="portal-subnav" aria-label="QuantBT Research">
      {TABS.map((tab) => {
        const to = `${QUANTBT_ROOT}/${tab.path}${search ? `?${search}` : ""}`;
        const active = location.pathname === `${QUANTBT_ROOT}/${tab.path}`;
        return (
          <Link
            key={tab.path}
            to={to}
            className={`navtab ${active ? "navtab-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
