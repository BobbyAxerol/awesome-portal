/**
 * Delivery-profile reconciliation — registry revision 5 consumption.
 *
 * Master plan §12.3 gives this module one rule and it is a safety rule:
 *
 *   "Registry revision 5 is the authority for the active profile and policy of
 *    every commissioned screen. Every backend envelope echoes `delivery_profile`;
 *    a composed screen may return a **stricter** profile on an individual panel.
 *    A registry/envelope mismatch is fail-closed and makes the affected panel
 *    UNAVAILABLE."
 *
 * "Stricter" needs an ordering to mean anything, so one is defined here: the
 * profiles are ranked by how much authority they claim. A panel may always claim
 * LESS than its screen is commissioned for — a live screen whose correlation
 * panel is still reading shadow data is a normal, honest situation. A panel may
 * never claim MORE. That direction is not a display bug; it is a panel asserting
 * production authority the registry never granted it, and the only safe response
 * is to render nothing and say why.
 *
 * Revision 5 adds an independent Portal-governance write flag. Missing or
 * malformed policy remains no authority; compatibility never becomes an
 * implicit grant.
 */
import type { DeliveryProfile, PanelStatus, RiskTier } from "./contracts";

/**
 * Profiles ordered by the authority they claim, lowest first.
 *
 * `fixture` claims none — no Trading System was involved. `shadow` claims real
 * observation but no production standing. The four after it are the real
 * environments in promotion order, which is also authority order.
 */
export const PROFILE_RANK: Record<DeliveryProfile, number> = {
  fixture: 0,
  shadow: 1,
  paper: 2,
  sandbox: 3,
  live_canary: 4,
  live_full: 5,
};

export const PROFILE_ORDER: readonly DeliveryProfile[] = [
  "fixture",
  "shadow",
  "paper",
  "sandbox",
  "live_canary",
  "live_full",
];

/** The two profiles that have no other tell on screen and must be labelled. */
export function profileNeedsLabel(profile: DeliveryProfile): boolean {
  return profile === "fixture" || profile === "shadow";
}

export type PanelProfileResolution =
  | {
      ok: true;
      /** What the panel is actually showing: the stricter of the two. */
      effective: DeliveryProfile;
      /** True when the panel is stricter than its screen — normal, worth noting. */
      stricterThanScreen: boolean;
      /** Whether ProfileBadge must render for this panel. */
      label: boolean;
    }
  | {
      ok: false;
      /** Always `unavailable`. Fail-closed is not a spectrum. */
      panelStatus: Extract<PanelStatus, "unavailable">;
      reason: string;
    };

/**
 * Reconcile a screen's commissioned profile against one panel's echoed profile.
 *
 * Four cases, and each is a different claim rather than a shade of the same one:
 *
 * 1. **Registry absent** — revision 3 is still live. The panel's own echo is
 *    used, and the caller is told the screen-level authority is unverified. Not
 *    fail-closed: refusing to render every Execution panel until rev 4 ships
 *    would make the surface unusable to prevent a mismatch that cannot yet
 *    occur, because there is nothing to mismatch against.
 * 2. **Envelope absent** — the backend has not echoed a profile. Fail closed.
 *    The whole point of the echo is that a panel says what it is; a silent panel
 *    on a commissioned screen is indistinguishable from a panel that means to
 *    claim live authority, and those must not look the same.
 * 3. **Panel stricter or equal** — legal. The effective profile is the panel's.
 * 4. **Panel laxer** — fail closed. A shadow-commissioned screen whose panel
 *    claims `live_full` is either a routing error or a bug, and both are
 *    reasons to show nothing.
 */
export function reconcilePanelProfile(
  screenProfile: DeliveryProfile | null | undefined,
  panelProfile: DeliveryProfile | null | undefined,
): PanelProfileResolution {
  if (!panelProfile) {
    return {
      ok: false,
      panelStatus: "unavailable",
      reason: screenProfile
        ? "This panel did not state which delivery profile produced it, so it cannot be shown on a commissioned screen."
        : "This panel did not state which delivery profile produced it.",
    };
  }

  if (!screenProfile) {
    // Registry revision 3. There is no screen-level claim to contradict, so the
    // panel's own is used and the gap is stated rather than papered over.
    return {
      ok: true,
      effective: panelProfile,
      stricterThanScreen: false,
      label: profileNeedsLabel(panelProfile),
    };
  }

  if (PROFILE_RANK[panelProfile] > PROFILE_RANK[screenProfile]) {
    return {
      ok: false,
      panelStatus: "unavailable",
      reason: `This panel reported ${panelProfile.toUpperCase()} data on a screen commissioned for ${screenProfile.toUpperCase()}. A panel may claim less authority than its screen, never more.`,
    };
  }

  return {
    ok: true,
    effective: panelProfile,
    stricterThanScreen: PROFILE_RANK[panelProfile] < PROFILE_RANK[screenProfile],
    label: profileNeedsLabel(panelProfile),
  };
}

/**
 * Pull the delivery profile off a registry **screen contract**.
 *
 * Revision 4 puts `delivery_profile` and `delivery_policy` on `screens[]`, not
 * on `features[]` — which is the right place: a feature can own several screens
 * and they do not have to be at the same profile. Both fields are nullable, and
 * every screen outside the Execution cluster is currently `null`.
 *
 * Deliberately structural rather than typed against the generated
 * `ScreenContract`: that type comes from the backend's OpenAPI schema, and
 * reading the field defensively means this module keeps compiling across the
 * revision boundary rather than needing the two changes to land together.
 *
 * An unrecognised value is treated as absent rather than coerced. A registry
 * that publishes a profile this build has never heard of is a version skew, and
 * guessing which known profile it meant is how a `live_full` screen ends up
 * rendering as something safer than it is.
 */
export function screenDeliveryProfile(screen: unknown): DeliveryProfile | null {
  if (!screen || typeof screen !== "object") return null;
  const raw = (screen as Record<string, unknown>).delivery_profile;
  if (typeof raw !== "string") return null;
  return (PROFILE_ORDER as readonly string[]).includes(raw) ? (raw as DeliveryProfile) : null;
}

/* ---------------------------------------------------------------------------
 * Delivery policy — independent data, governance and command flags.
 * ------------------------------------------------------------------------ */

/**
 * Per-screen capability switches.
 *
 * Master plan §12.3: "Feature flags are separate for query, projection
 * ingestion, SSE, Paper commands, Sandbox commands, Live protective commands,
 * and Live risk-increasing commands. Disabling one does not require disabling
 * unrelated Research services."
 *
 * Eight independent booleans rather than one enabled/disabled, for the same
 * reason authority and freshness are separate fields: a screen can legitimately
 * be reading live data while every command on it is switched off, and a single
 * flag makes that state unrepresentable.
 */
export interface DeliveryPolicy {
  policyRevision: number;
  queryEnabled: boolean;
  projectionIngestionEnabled: boolean;
  sseEnabled: boolean;
  governanceWriteEnabled: boolean;
  paperCommandsEnabled: boolean;
  sandboxCommandsEnabled: boolean;
  liveProtectiveCommandsEnabled: boolean;
  liveRiskIncreasingCommandsEnabled: boolean;
}

function bool(source: Record<string, unknown>, key: string): boolean {
  // Anything that is not exactly `true` is false. A missing or malformed flag
  // is not permission.
  return source[key] === true;
}

/** Read the policy off a registry screen contract. `null` when unpublished. */
export function screenDeliveryPolicy(screen: unknown): DeliveryPolicy | null {
  if (!screen || typeof screen !== "object") return null;
  const raw = (screen as Record<string, unknown>).delivery_policy;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    policyRevision: typeof p.policy_revision === "number" ? p.policy_revision : 0,
    queryEnabled: bool(p, "query_enabled"),
    projectionIngestionEnabled: bool(p, "projection_ingestion_enabled"),
    sseEnabled: bool(p, "sse_enabled"),
    governanceWriteEnabled: bool(p, "governance_write_enabled"),
    paperCommandsEnabled: bool(p, "paper_commands_enabled"),
    sandboxCommandsEnabled: bool(p, "sandbox_commands_enabled"),
    liveProtectiveCommandsEnabled: bool(p, "live_protective_commands_enabled"),
    liveRiskIncreasingCommandsEnabled: bool(p, "live_risk_increasing_commands_enabled"),
  };
}

/**
 * Which policy flag governs a command of this risk tier (master plan §9.2 tiers
 * mapped onto §12.3 flags).
 *
 * R3 and R4 map to two different flags on purpose. They are not a scale of the
 * same permission: R3 is protective (halt, reduce) and R4 is risk-increasing
 * (enable, expand). Turning on emergency protection must never turn on capital
 * expansion, and one flag for "live commands" would do exactly that.
 */
export function commandEnabled(policy: DeliveryPolicy | null, tier: RiskTier): boolean {
  // No published policy is not permission. Fail closed: a screen whose policy
  // has not been granted has been granted nothing.
  if (!policy) return false;
  switch (tier) {
    case "R0":
      return policy.queryEnabled;
    case "R1":
      return policy.paperCommandsEnabled;
    case "R2":
      return policy.sandboxCommandsEnabled;
    case "R3":
      return policy.liveProtectiveCommandsEnabled;
    case "R4":
      return policy.liveRiskIncreasingCommandsEnabled;
  }
}

/**
 * Why a command is unavailable, in words an operator can act on.
 *
 * A disabled button with no explanation is indistinguishable from a broken one,
 * and the two need different responses: one is a policy decision to escalate,
 * the other is a bug to report.
 */
export function commandBlockedReason(
  policy: DeliveryPolicy | null,
  tier: RiskTier,
): string | null {
  if (commandEnabled(policy, tier)) return null;
  if (!policy) return "This screen has no published delivery policy, so no command is enabled on it.";
  const label: Record<RiskTier, string> = {
    R0: "Query",
    R1: "Paper commands",
    R2: "Sandbox commands",
    R3: "Live protective commands",
    R4: "Live risk-increasing commands",
  };
  return `${label[tier]} are disabled for this screen by delivery policy revision ${policy.policyRevision}.`;
}

/**
 * Whether a Portal GOVERNANCE WRITE is permitted — approving, denying,
 * extending, rejecting.
 *
 * This is deliberately not derived from any Trading System command flag.
 * The API still enforces session, CSRF, RBAC, SoD and optimistic concurrency;
 * this commissioning flag only decides whether the UI may offer the write.
 */
export function governanceWriteBlocked(policy: DeliveryPolicy | null): string | null {
  if (!policy) {
    return "This screen has no published delivery policy, so no decision can be recorded on it.";
  }
  if (policy.governanceWriteEnabled) return null;
  return `Recording a decision is disabled for this screen by delivery policy revision ${policy.policyRevision}.`;
}

/* ---------------------------------------------------------------------------
 * The line between profile and permission
 * ------------------------------------------------------------------------ */

/**
 * Permission comes from `delivery_policy`. It never comes from
 * `delivery_profile`.
 *
 * The two are easy to conflate because they arrive on the same registry object
 * and both sound like they describe how real a screen is. They do not:
 *
 *   - **profile** answers "how real is the DATA I am looking at" — a display
 *     honesty question, whose failure mode is an operator mistaking shadow
 *     numbers for production ones;
 *   - **policy** answers "what am I ALLOWED to do here" — an authorization
 *     question, whose failure mode is a command firing that should not have.
 *
 * Deriving one from the other is wrong in both directions. `live_full` profile
 * must not grant a command, because the profile says the data is live and says
 * nothing about whether this actor may act on it. And `fixture` profile must not
 * block one, because that would be this client inventing an authorization rule
 * the server never stated — and a client that invents rules will eventually
 * invent a permissive one.
 *
 * So `commandEnabled` takes a policy and a tier and has no profile parameter at
 * all. The separation is structural rather than a convention, because a
 * convention is exactly what gets forgotten on screen fourteen.
 */
export const PERMISSION_SOURCE = "delivery_policy" as const;

/**
 * Report — never resolve — a registry that grants a command on a screen whose
 * data is not production.
 *
 * This combination is a registry inconsistency: something enabled a real command
 * on a screen serving fixture or shadow data. The client's job is to make it
 * impossible to miss, not to correct it. Correcting it would mean guessing which
 * half the registry got wrong, and the guess could go the wrong way — a client
 * that silently disables a genuinely-granted protective command during an
 * incident has done more harm than one that shows a loud warning.
 *
 * Returns `null` when there is nothing to report.
 */
export function commandProfileInconsistency(
  profile: DeliveryProfile | null | undefined,
  policy: DeliveryPolicy | null,
  tier: RiskTier,
): string | null {
  if (!profile || !commandEnabled(policy, tier)) return null;
  if (profile !== "fixture" && profile !== "shadow") return null;
  return `This screen is serving ${profile.toUpperCase()} data, but delivery policy revision ${policy?.policyRevision ?? "?"} enables this ${tier} command. The command is not blocked here — the registry states what is permitted — but one of the two is wrong and it should be resolved before this is used.`;
}
