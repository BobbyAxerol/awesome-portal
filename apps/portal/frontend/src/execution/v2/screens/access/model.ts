/**
 * Access self-view model (S1e): everything the screen prints that is derived,
 * as pure functions with no React in them.
 *
 * Two sources, never mixed:
 *  - the session's capability list, read through roleNav's `holds()`. Seeing
 *    and doing rows are derived from it and from nothing else: no role name,
 *    no preset, no "granted by";
 *  - `AccessEffective` (readers/accessEffective), for the grants table.
 *
 * The `execution.*` capability names are provisional (FE-037): the session
 * issues only `administration.*` and `governance.*` today. Those rows are
 * therefore "Not shown" for every caller until the names are issued, and the
 * screen says so in one caption instead of hiding the row.
 */
import { V2_CAPABILITY, V2_NAV_RULES, holds, type CapabilityNeed } from "../../shell/roleNav";
import { formatAsOf } from "../../boundary";
import type { AccessEffective, AccessGrant, AccessSelector, AccessTsAuthority } from "../../readers/accessEffective";
import type { FlagKind } from "../../flagKinds";

/** Open requests this screen waits on. Ids live in this one table so a closed request changes one line. */
export const ACCESS_FE = {
  /** Reason payload (`reason_class`, `grant_ref`, `step_up_required`), "granted by" and a role preset. */
  reasons: "FE-015",
  /** Researcher field-policy matrix: Bobby decides, the policy stays PENDING. */
  researcher: "FE-026",
  /** `execution.*` capability names the session does not issue yet. */
  capabilityNames: "FE-037",
} as const;

/** The two administration capabilities the server's finite namespace names (`PORTAL_CAPABILITIES`). */
export const ADMIN_CAPABILITY = {
  usersManage: "administration.users.manage",
  profileAccessManage: "administration.profile_access.manage",
} as const;

export function needsText(need: CapabilityNeed | undefined): string | null {
  if (need === undefined) return null;
  const all = need.allOf ?? [];
  const any = need.anyOf ?? [];
  const parts: string[] = [];
  if (all.length > 0) parts.push(all.join(" and "));
  if (any.length > 0) parts.push(any.length === 1 ? any[0] : `any of ${any.join(", ")}`);
  return parts.length === 0 ? null : parts.join(", plus ");
}

/** The capabilities from `need` that the caller does hold, so a "yes" can say what it rests on. */
function heldFrom(capabilities: ReadonlySet<string>, need: CapabilityNeed | undefined): readonly string[] {
  if (need === undefined) return [];
  return [...(need.allOf ?? []), ...(need.anyOf ?? [])].filter((capability) => capabilities.has(capability));
}

export interface CapabilityRow {
  id: string;
  label: string;
  allowed: boolean;
  /** Present when a capability is involved; absent when none is needed. */
  need: CapabilityNeed | undefined;
  /** Capabilities held that justify an allowed row. */
  held: readonly string[];
  /** Words for the reason column: why it is on, or what is missing. */
  reason: string;
}

function row(id: string, label: string, capabilities: ReadonlySet<string>, need: CapabilityNeed | undefined, openWord: string): CapabilityRow {
  const allowed = holds(capabilities, need);
  const held = heldFrom(capabilities, need);
  const text = needsText(need);
  const reason = need === undefined
    ? openWord
    : allowed
      ? `Held: ${held.join(", ")}`
      : `Needs ${text}`;
  return { id, label, allowed, need, held, reason };
}

/** The gates, in the order the Approvals screen lists them. */
export const GATES = [
  { id: "r1", label: "R1 gate", read: V2_CAPABILITY.governanceR1Read, decide: V2_CAPABILITY.governanceR1Decide },
  { id: "r2", label: "R2 gate", read: V2_CAPABILITY.governanceR2Read, decide: V2_CAPABILITY.governanceR2Decide },
  { id: "canary", label: "Canary gate", read: V2_CAPABILITY.governanceCanaryRead, decide: V2_CAPABILITY.governanceCanaryDecide },
  { id: "live", label: "Live gate", read: V2_CAPABILITY.governanceLiveRead, decide: V2_CAPABILITY.governanceLiveDecide },
] as const;

/**
 * What the caller can see: one row per V2 navigation entry the rail or the
 * command bar can list, then one per gate. `hidden` entries are not offered to
 * anyone and are not rows.
 */
export function seeRows(capabilities: ReadonlySet<string>): CapabilityRow[] {
  const entries = V2_NAV_RULES
    .filter((rule) => rule.surface !== "hidden" && rule.label !== undefined)
    .map((rule) => row(`nav:${rule.featureId}`, rule.label as string, capabilities, rule.needs, "No capability needed"));
  const gates = GATES.map((gate) => row(`gate:${gate.id}`, gate.label, capabilities, { allOf: [gate.read] }, "No capability needed"));
  return [...entries, ...gates];
}

/**
 * What the caller can do: the actions whose capability the server names.
 * Everything that needs a per-row eligibility (commands, archive, export) is
 * not published and is said so by the screen (FE-015), never guessed here.
 */
export function doRows(capabilities: ReadonlySet<string>): CapabilityRow[] {
  const decide = GATES.map((gate) =>
    row(`decide:${gate.id}`, `Decide at ${gate.label.replace(" gate", "")} gate`, capabilities, { allOf: [gate.decide] }, "No capability needed"));
  return [
    ...decide,
    row("manage:grants", "Manage grants", capabilities, { allOf: [ADMIN_CAPABILITY.profileAccessManage] }, "No capability needed"),
    row("manage:users", "Manage users", capabilities, { allOf: [ADMIN_CAPABILITY.usersManage] }, "No capability needed"),
  ];
}

/** Capabilities held that no row above names, so nothing the session says is silently dropped. */
export function otherCapabilities(capabilities: ReadonlySet<string>): string[] {
  const named = new Set<string>();
  for (const r of [...seeRows(capabilities), ...doRows(capabilities)]) {
    for (const capability of [...(r.need?.allOf ?? []), ...(r.need?.anyOf ?? [])]) named.add(capability);
  }
  return [...capabilities].filter((capability) => !named.has(capability)).sort();
}

// ---- grants -----------------------------------------------------------------

const RESOURCE_LABEL: Readonly<Record<string, string>> = {
  ROOT: "Root",
  PORTFOLIO: "Portfolio",
  ALPHA: "Alpha",
  ALPHA_VERSION: "Alpha version",
  DEPLOYMENT: "Deployment",
  ACCOUNT: "Account",
  BINDING: "Binding",
  USER: "User",
};

const ID_SHOWN = 3;

function idsText(ids: readonly string[]): string {
  const shown = ids.slice(0, ID_SHOWN).join(", ");
  return ids.length > ID_SHOWN ? `${shown} and ${ids.length - ID_SHOWN} more` : shown;
}

/** The selector in words. Ids are the server's, printed as given. */
export function selectorText(selector: AccessSelector): string {
  switch (selector.kind) {
    case "EXPLICIT_RESOURCE_SET":
      return `${RESOURCE_LABEL[selector.resourceKind] ?? selector.resourceKind}: ${idsText(selector.ids)}`;
    case "OWN_ALPHA":
      return "Alphas you own";
    case "PORTFOLIO_MEMBERSHIP":
      return `Portfolio membership: ${idsText(selector.portfolioIds)}`;
    case "ROOT_SCOPE":
      return `Root scope: ${selector.rootId}`;
  }
}

/** Every id, for the tooltip and the screen reader when `selectorText` shortened the list. */
export function selectorAllIds(selector: AccessSelector): readonly string[] {
  switch (selector.kind) {
    case "EXPLICIT_RESOURCE_SET": return selector.ids;
    case "PORTFOLIO_MEMBERSHIP": return selector.portfolioIds;
    case "ROOT_SCOPE": return [selector.rootId];
    case "OWN_ALPHA": return [];
  }
}

const ENV_WORD = { paper: "Paper", sandbox: "Sandbox", live: "Live" } as const;
export function environmentsText(grant: AccessGrant): string {
  return grant.environments.map((env) => ENV_WORD[env]).join(", ");
}

/** `17 Oct 09:14Z`, or the published absence of an end. */
export function validFromText(grant: AccessGrant): string {
  return formatAsOf(grant.validFrom);
}
export function validUntilText(grant: AccessGrant): string {
  return grant.validUntil === null ? "No end date" : formatAsOf(grant.validUntil);
}

export const TS_AUTHORITY_FLAG: Readonly<Record<AccessTsAuthority, { kind: FlagKind; label: string }>> = {
  NOT_REQUIRED: { kind: "na", label: "Not required" },
  PENDING: { kind: "pending", label: "Pending" },
  ACCEPTED: { kind: "applied", label: "Accepted" },
  REJECTED: { kind: "rejected", label: "Rejected" },
  UNKNOWN: { kind: "unknown", label: "Unknown" },
};

/**
 * Reasons the contract names, in words. A code that is not here is printed as
 * the server wrote it, with the line "not in this build's dictionary", and
 * never reworded.
 */
export const REASON_DICTIONARY: Readonly<Record<string, string>> = {
  POLICY_PENDING: "No access policy has been published as effective for this workspace yet.",
  OWNER_RECOVERY_NOT_APPROVED: "Owner recovery has not been approved, so it is off.",
};

export function reasonText(code: string): { text: string; known: boolean } {
  const text = REASON_DICTIONARY[code];
  return text === undefined
    ? { text: "This reason is not in this build's dictionary.", known: false }
    : { text, known: true };
}

/** The policy tile: availability and revision as published. */
export function policyWord(effective: AccessEffective): string {
  return effective.availability === "AVAILABLE" ? "Available" : "Pending";
}
