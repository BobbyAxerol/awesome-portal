/**
 * What the V2 self-navigation controller hands the shell (W3, FE-057/058).
 *
 * A type module with no V2 import: `PortalShell` must not import anything under `execution/v2/` statically (the V2 chunk stays
 * out of a flag-off build; `PortalShell.v2Gating.test` reads the imports), yet it has to hold the controller's answer in state.
 * The controller is the only producer; the shell only adds `tokens` to the session's capabilities for LISTING and hands
 * `notice` to the rail. Flag off, nobody produces it and `NO_SELF_NAV` is the value for ever.
 */
import type { ReactNode } from "react";

export interface SelfNavShellView {
  /** Rail tokens a LIVE projection lists. Empty unless inside the session ceiling. Added to listing only, never to authority. */
  tokens: ReadonlySet<string>;
  /** The "Navigation unavailable" line with its Retry control, or `null`. Drawn by the rail; `collapsed` is the rail's own state. */
  notice: ((rail: { collapsed: boolean }) => ReactNode) | null;
}

export const NO_SELF_NAV: SelfNavShellView = { tokens: new Set<string>(), notice: null };
