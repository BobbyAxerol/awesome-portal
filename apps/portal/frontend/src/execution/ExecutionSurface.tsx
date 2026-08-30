/**
 * ExecutionSurface — the semantic screen container of the Execution Loop.
 *
 * One Carbon theme for the whole loop (owner override 2026-08-24, handoff
 * §0.1). This component USED to be a theme boundary mapping `governance` to a
 * light Carbon variant — "two surfaces, not one", said the old comment — and
 * that architecture is exactly what produced the owner-rejected render: a
 * theme applied as a component-local skin, seaming against whatever chrome
 * surrounded it. The lesson worth keeping: a wrapper cannot own appearance the
 * user experiences as a workspace mode. Appearance now belongs to the
 * route-aware presentation provider (app/presentation.tsx).
 *
 * `kind` survives with its real job: SEMANTICS. Governance screens and
 * operational workbenches differ by hierarchy, density and component anatomy —
 * `data-surface` and `data-density` carry that — never again by swapping the
 * canvas from dark to light.
 */
import type { ReactNode } from "react";

import "./execution.css";

/**
 * Which half of the Execution Loop this subtree belongs to.
 *
 * `governance` — Approval Inbox, Gate R1, Gate R2, exit reviews, waivers.
 * `deployments` — Paper/Sandbox/Canary/Live workbenches, the 360°s, Blotter,
 * Operations Queue, Command Center, Incident Detail.
 *
 * It is a required decision rather than a default, so a new screen has to say
 * which world it is in. A default would silently be wrong for half of them, and
 * "wrong theme" is the one mistake this component exists to prevent.
 */
export type ExecutionSurfaceKind = "governance" | "deployments";

/**
 * `deployments` stamps Carbon; `governance` inherits the workspace theme —
 * the route provider sets it light (owner decision 2026-08-30), and inside a
 * dark fixture page the same screen simply follows that page's theme.
 */
const THEME: Record<ExecutionSurfaceKind, string | null> = {
  governance: null,
  deployments: "operations-carbon",
};

const DENSITY: Record<ExecutionSurfaceKind, string> = {
  governance: "comfortable",
  deployments: "operational",
};

export function ExecutionSurface({
  kind,
  children,
  className,
  ...rest
}: {
  kind: ExecutionSurfaceKind;
  children: ReactNode;
  className?: string;
  /** e.g. `data-hifi-exact="command-center-5a"` — a screen measured against its hi-fi, not §5.2. */
  [dataAttr: `data-${string}`]: string | undefined;
}) {
  return (
    <div
      {...rest}
      data-theme={THEME[kind] ?? undefined}
      data-density={DENSITY[kind]}
      data-surface={kind}
      className={className ? `exec-surface ${className}` : "exec-surface"}
    >
      {children}
    </div>
  );
}
