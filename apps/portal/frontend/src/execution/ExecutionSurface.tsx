/**
 * The Carbon surface boundary for the Execution Loop.
 *
 * Every Execution screen renders inside this wrapper and nothing else does.
 * That is the whole isolation mechanism approved on 2026-08-21: custom
 * properties declared on this element win for its subtree, so Carbon tokens
 * physically cannot reach a Research or Planning screen. `CLAUDE.md` §0 forbids
 * touching those, and 46 of the 101 committed visual baselines would move if
 * the shared `operations` theme were restyled instead.
 *
 * **The Execution Loop is two surfaces, not one.** DS §1 splits them and the
 * hi-fi files confirm it in their own CSS: the four governance screens set a
 * white page background and the Deployments screens set the Carbon near-black
 * one. (Quoting the values here would trip the raw-literal gate in
 * tokens.test.ts, which is a text scan and cannot tell a comment from a rule —
 * fair enough, since a hex in a comment is how a second palette starts.) An
 * earlier build wrapped everything in the dark
 * theme, which put Approval Inbox, Gate R1, Gate R2 and Paper Exit Review on a
 * dark canvas the hi-fi never drew — and made Gate R2's signature element, a
 * dark capital strip inside a light page, impossible to express, because there
 * was no light page for it to sit in.
 *
 * Density follows the same split (DS §1): governance is `comfortable`, a page
 * you read and decide on; Deployments is `operational`, a console you scan.
 * Both are pinned here rather than read from preferences, because a Manager who
 * set `comfortable` for Research should not silently loosen a live blotter.
 * User override stays possible per DS §1 — it just has to be an explicit
 * Execution-side preference, which does not exist yet.
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

const THEME: Record<ExecutionSurfaceKind, string> = {
  governance: "operations-carbon-light",
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
}: {
  kind: ExecutionSurfaceKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-theme={THEME[kind]}
      data-density={DENSITY[kind]}
      data-surface={kind}
      className={className ? `exec-surface ${className}` : "exec-surface"}
    >
      {children}
    </div>
  );
}
