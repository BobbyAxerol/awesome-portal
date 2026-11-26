/**
 * What the V2 self-navigation controller hands the shell (W3, FE-057/058).
 *
 * A type module with no V2 import: `PortalShell` must not import anything under `execution/v2/` statically (the V2 chunk stays
 * out of a flag-off build; `PortalShell.v2Gating.test` reads the imports), yet it has to hold the controller's answer in state.
 * The controller is the only producer; the shell only adds `tokens` to the session's capabilities for LISTING and hands
 * `notice` to the rail. Flag off, nobody produces it and `NO_SELF_NAV` is the value for ever.
 */
import { createContext, type ReactNode } from "react";

export interface SelfNavShellView {
  /** Rail tokens a LIVE projection lists. Empty unless inside the session ceiling. Added to listing only, never to authority. */
  tokens: ReadonlySet<string>;
  /** The "Navigation unavailable" line with its Retry control, or `null`. Drawn by the rail; `collapsed` is the rail's own state. */
  notice: ((rail: { collapsed: boolean }) => ReactNode) | null;
  /**
   * The self-only "My access" entry is on offer (BE-P7): the live projection says the entry is allowed, for this workspace. The
   * rail lists it for a member who has no Profile & Access entry of their own. `null` fails closed. Listing only, never authority.
   */
  selfEntry: { workspaceId: string } | null;
  /** The workspace the self-context RESOLVED when the address names none (WP-D / WP-E request), else `null`. Not an authority. */
  workspaceId: string | null;
}

/**
 * The self-only page of a member's OWN access (BE-P7 `self_entry.route`; the workspace travels as `?workspace_id=`). It is NOT the
 * admin policy matrix, which stays at `/administration/profile-access` behind its owner + capability guard. Defined here, with no V2
 * import, so the rail and the router can name it without pulling a reader in; `accessSelfContext.ts` holds the same literal and a
 * test pins the two together.
 */
export const SELF_ENTRY_PATH = "/administration/my-access";

export const NO_SELF_NAV: SelfNavShellView = { tokens: new Set<string>(), notice: null, selfEntry: null, workspaceId: null };

/**
 * Sidebar count badges of the V2 shell (WP-D). Keyed by registry feature id. An entry exists ONLY for a count the owning read
 * published; an unpublished or failed count has no entry, so the rail shows no number it cannot stand behind. `label` is the
 * accessible/hover sentence naming the read.
 */
export interface NavBadge {
  count: number;
  tone: "warn" | "bad";
  label: string;
}
export type NavBadges = Readonly<Record<string, NavBadge>>;
export const NO_NAV_BADGES: NavBadges = Object.freeze({});

/**
 * The workspace the shell's self-context resolved for this member when the address names none (`defaultWorkspace.state ===
 * RESOLVED`), or `null`. The Access page reads it so "Granted to you" shows without a workspace in the address. Never a guess:
 * AMBIGUOUS, NONE, UNAVAILABLE and a failed read all stay `null`.
 */
export const SelfWorkspaceContext = createContext<string | null>(null);

/**
 * The listing capability set the shell computed (session capabilities + live self-navigation tokens + the owner-anchor tokens), for a
 * screen that gates on a menu token. `null` outside the shell. It is a courtesy, never authority: the server still answers each read.
 * Without it a screen could only see the session list, which never holds a `nav:` token, and would deny everyone.
 */
export const ShellCapabilitiesContext = createContext<ReadonlySet<string> | null>(null);

/**
 * The owner anchor holds every entry (Profile & Access: "You hold every capability through the owner anchor, not through a grant"),
 * but the self-navigation projection is grant-derived with no owner exception, so it answers HIDDEN for an owner who holds no scoped
 * grant. The shell adds these four menu tokens for a session whose own read says `is_owner === true`, and only then. Literals, since
 * the shell may not import `execution/v2`; a test pins them to `V2_NAV_TOKEN`.
 */
export const OWNER_NAV_TOKENS: readonly string[] = [
  "nav:EXECUTION_PORTFOLIOS",
  "nav:EXECUTION_ACCOUNTS_BINDINGS",
  "nav:EXECUTION_OPERATIONS",
  "nav:EXECUTION_BLOTTER",
];
