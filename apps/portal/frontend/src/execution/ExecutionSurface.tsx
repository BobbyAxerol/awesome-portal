/**
 * The Carbon surface boundary for the Execution Loop.
 *
 * Every Execution screen renders inside this wrapper and nothing else does.
 * That is the whole isolation mechanism approved on 2026-08-21: custom
 * properties declared on this element win for its subtree, so Carbon tokens
 * physically cannot reach a Research or Planning screen. `CLAUDE.md` §0 forbids
 * touching those, and 46 of the 100 committed visual baselines would move if
 * the shared `operations` theme were restyled instead.
 *
 * Density is pinned to `operational` here rather than read from preferences:
 * DS §1 makes it the default for every Deployments screen, and a Manager who
 * set `comfortable` for Research should not silently loosen an operations
 * blotter. User override remains possible per DS §1 — it just has to be an
 * explicit Execution-side preference, which does not exist yet.
 */
import type { ReactNode } from "react";

import "./execution.css";

export function ExecutionSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-theme="operations-carbon"
      data-density="operational"
      className={className ? `exec-surface ${className}` : "exec-surface"}
    >
      {children}
    </div>
  );
}
