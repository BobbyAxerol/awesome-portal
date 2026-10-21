/**
 * The self-navigation projection as the rail's capability input, with its session ceiling enforced (FE-057, W2/W3 of the
 * UXM-07 self-contract review; Codex 7818d563 `observed_at_ms` / `valid_until_ms`).
 *
 * `applyV2Nav` / `goToEntries` (roleNav.ts) decide from a capability set. The four menu tokens in `V2_NAV_TOKEN` (`nav:<served
 * feature id>`, DEBT-UXM07-005) are answered by the four self-navigation features, so an `ENTERABLE` feature is turned into the
 * token its rail rule needs. This file is that translation and nothing else; it lives beside roleNav.ts, not in it, so the V1 sidebar (which
 * imports roleNav) does not pull the access reader into its chunk.
 *
 * The one rule the timestamps add is a FAIL-CLOSED rule. `valid_until_ms` is the end-exclusive ceiling of this actor's
 * captured session. It is not a cache TTL, not a permission lease and not a readiness guarantee: a grant can be revoked before
 * it, and every route behind the rail still refuses by itself. So it is used in one direction only: once the client clock
 * reaches it, the projection yields no token at all and the gate says why. Nothing here keeps an entry alive because the
 * ceiling is still ahead, nothing adds a grace period, and an expired projection is never shown as a stale rail.
 *
 * Pure: no clock of its own (`nowMs` is passed), no storage (the body is `no-store`; it is never kept between sessions), no
 * fetch. The caller still has to check `navigationAnswers` (workspace and environment of the question), drop a late answer for
 * another environment, workspace or session, and refetch on mount, environment change, focus and a 409; this file only decides
 * whether the body it is handed may still be read.
 */
import { selfProjectionExpiry, type AccessSelfNavigation, type SelfNavFeature, type SelfProjectionExpiry } from "../readers/accessSelf";
import { V2_NAV_TOKEN } from "./roleNav";

/** Which rail token each self-navigation feature stands for: `nav:` plus the feature id the server published (pinned in selfNavGate.test.ts). */
export const SELF_NAV_TOKEN: Readonly<Record<SelfNavFeature, string>> = {
  EXECUTION_PORTFOLIOS: V2_NAV_TOKEN.portfolios,
  EXECUTION_ACCOUNTS_BINDINGS: V2_NAV_TOKEN.accounts,
  EXECUTION_OPERATIONS: V2_NAV_TOKEN.operations,
  EXECUTION_BLOTTER: V2_NAV_TOKEN.blotter,
};

const NO_TOKENS: ReadonlySet<string> = new Set<string>();

export type SelfNavGate =
  /** No projection has been read (loading, denied, unavailable, wrong environment): today's behaviour, the session capabilities alone. */
  | { kind: "none"; tokens: ReadonlySet<string> }
  /** Inside the session ceiling. Tokens are the ENTERABLE features only: "list the entry", never "the screen has data". */
  | { kind: "live"; tokens: ReadonlySet<string>; validUntilMs: number }
  /** The ceiling has passed (or the client clock is unreadable). No token, and an honest reason to print instead of a stale rail. */
  | { kind: "expired"; tokens: ReadonlySet<string>; reason: Extract<SelfProjectionExpiry, { state: "expired" }>["reason"]; validUntilMs: number; message: string };

/** `…T…Z` for a ceiling a `Date` can hold, else `null` (MAX_SAFE_INTEGER ms is past the Date range, and `toISOString` would throw). */
function utcText(ms: number): string | null {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The sentence a shell prints when the rail is shut for an expired projection. Says "Portal clock" and "session", never "permission valid until". */
export function expiredNavigationMessage(reason: "SESSION_CEILING_PASSED" | "CLOCK_UNREADABLE", validUntilMs: number): string {
  if (reason === "CLOCK_UNREADABLE") return "This device's clock could not be read, so the navigation read for your session is not shown. Retry to check again.";
  const at = utcText(validUntilMs);
  return `The navigation read for your session ended${at === null ? "" : ` at ${at} (Portal clock)`} and is no longer shown. Retry to check again.`;
}

/**
 * The gate for the projection in hand at client time `nowMs`. `null` is "none read". An expired body yields no token, whatever
 * its features say: the stale `ENTERABLE` rows are discarded, not remembered.
 */
export function selfNavigationGate(navigation: AccessSelfNavigation | null, nowMs: number): SelfNavGate {
  if (navigation === null) return { kind: "none", tokens: NO_TOKENS };
  const expiry = selfProjectionExpiry(navigation, nowMs);
  if (expiry.state === "expired") {
    return { kind: "expired", tokens: NO_TOKENS, reason: expiry.reason, validUntilMs: expiry.validUntilMs, message: expiredNavigationMessage(expiry.reason, expiry.validUntilMs) };
  }
  const tokens = new Set<string>();
  for (const item of navigation.features) if (item.state === "ENTERABLE") tokens.add(SELF_NAV_TOKEN[item.feature]);
  return { kind: "live", tokens, validUntilMs: navigation.validUntilMs };
}

/**
 * Capability set for `applyV2Nav` / `goToEntries`: the session's own capabilities plus whatever a LIVE projection lists. The
 * session part is never touched, so an expired or missing projection leaves exactly today's rail (fail closed), and the
 * projection can only add listing entries, never an authority.
 */
export function navCapabilities(session: Iterable<string>, gate: SelfNavGate): ReadonlySet<string> {
  const out = new Set<string>(session);
  for (const token of gate.tokens) out.add(token);
  return out;
}
