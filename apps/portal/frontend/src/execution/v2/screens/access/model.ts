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
 * Portfolios, Accounts, Operations and Blotter are not capabilities (FE-037,
 * DEBT-UXM07-005): the session issues only `administration.*` and `governance.*`,
 * and the server publishes those four as navigation rows. Their rows here are
 * "Not shown" until the navigation read lists them, and the screen says so in
 * one caption instead of hiding the row.
 */
import { V2_CAPABILITY, V2_NAV_RULES, holds, navTokenLabel, type CapabilityNeed } from "../../shell/roleNav";
import { formatAsOf } from "../../boundary";
import type { AccessEffective, AccessGrant, AccessSelector, AccessTsAuthority } from "../../readers/accessEffective";
import type { FlagKind } from "../../flagKinds";
import type { EligibilityUnavailableReason } from "../../readers/accessSelf";
import { ROOT_CAPITAL_ACTIONS, type CapitalEligibilityView } from "./useRootCapitalEligibility";

/** Open requests this screen waits on. Ids live in this one table so a closed request changes one line. */
export const ACCESS_FE = {
  /** Reason payload (`reason_class`, `grant_ref`, `step_up_required`), "granted by" and a role preset. */
  reasons: "FE-015",
  /** Researcher field-policy matrix: Bobby decides, the policy stays PENDING. */
  researcher: "FE-026",
  /** The four menu entries that follow the navigation read, not a capability. */
  capabilityNames: "FE-037",
  /** Export of tables: not built (the same id every Export control carries). */
  exportTables: "FE-016",
} as const;

/**
 * Most grants drawn into the DOM, the same 200-row convention as Accounts, Blotter and Portfolios.
 * The reader's bound (MAX_GRANTS = 500) is a different limit: it decides whether the read is accepted
 * at all; this one only decides how many of an accepted read are drawn.
 */
export const ROW_CAP = 200;

export interface GrantWindow {
  rows: readonly AccessGrant[];
  total: number;
  /** Words under the table when rows were left out; `null` when every grant is drawn. */
  label: string | null;
}

/** The first `ROW_CAP` grants in the order the server sent them, and a label with exact numbers when some are not drawn. */
export function grantWindow(grants: readonly AccessGrant[]): GrantWindow {
  const total = grants.length;
  const rows = total > ROW_CAP ? grants.slice(0, ROW_CAP) : grants;
  return { rows, total, label: total > ROW_CAP ? `Showing ${rows.length} of ${total} grants` : null };
}

/** The two administration capabilities the server's finite namespace names (`PORTAL_CAPABILITIES`). */
export const ADMIN_CAPABILITY = {
  usersManage: "administration.users.manage",
  profileAccessManage: "administration.profile_access.manage",
} as const;

/** A capability as the reader sees it: its name, or for a menu token the entry the navigation read has to list. */
function tokenWords(token: string): string {
  const entry = navTokenLabel(token);
  return entry === null ? token : `${entry} in your navigation read`;
}

export function needsText(need: CapabilityNeed | undefined): string | null {
  if (need === undefined) return null;
  const all = (need.allOf ?? []).map(tokenWords);
  const any = (need.anyOf ?? []).map(tokenWords);
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
  /**
   * Set when NO published read answers this row. The status reads "Not available yet", never Allowed or Not allowed, and the
   * request id sits behind the reason's disclosure. `allowed` is false, but it is not a refusal.
   */
  absent?: { fe: string; what: string };
  /** Set on an advisory eligibility row: the step-up fact the batch states for the allowed commands. */
  stepUp?: "REQUIRED" | "ACTIVE";
}

function row(id: string, label: string, capabilities: ReadonlySet<string>, need: CapabilityNeed | undefined, openWord: string): CapabilityRow {
  const allowed = holds(capabilities, need);
  const held = heldFrom(capabilities, need);
  const text = needsText(need);
  const reason = need === undefined
    ? openWord
    : allowed
      ? held.map(tokenWords).join(", ")
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

/** A row of the design's action list that no published read answers: "Not available yet" with the reason and its request id. */
function absentRow(id: string, label: string, fe: string, what: string, reason: string): CapabilityRow {
  return { id, label, allowed: false, need: undefined, held: [], reason, absent: { fe, what } };
}

const ARCHIVE_WHY = "No capability or eligibility action names archive or reactivation, so nothing says whether you may.";

/** Reason classes in words; the same proposed copy the Portfolio Actions rail prints (railEligibility.ts), kept here as this page's own table. */
const CAPITAL_REASON: Readonly<Record<EligibilityUnavailableReason, string>> = {
  NO_CURRENT_PERMISSION: "No current root-level grant for capital commands. Portfolio-level grants are answered on each portfolio.",
  POLICY_PENDING: "Access policy isn't active for your workspace yet",
  FIELD_POLICY_PENDING: "Restricted view isn't available yet",
  ACTION_TARGET_UNSUPPORTED: "Not available for this kind of item",
};

/**
 * "Send capital commands" from the self-eligibility batch asked about the caller's ROOT (see useRootCapitalEligibility). ALLOWED
 * means a current own root-level grant exists for at least one of the root capital actions: advice, rechecked by every API
 * behind it. The step-up fact is the batch's own, for the allowed commands.
 */
export function capitalRow(view: CapitalEligibilityView): CapabilityRow {
  const id = "do:capital";
  const label = "Send capital commands";
  const what = "Self-eligibility for capital commands";
  switch (view.phase) {
    case "idle":
      return absentRow(id, label, "FE-068", what, view.reason);
    case "loading":
      return absentRow(id, label, "FE-068", what, "Reading your eligibility.");
    case "denied":
    case "unavailable":
    case "expired":
      return absentRow(id, label, "FE-068", what, view.reason);
    case "ready": {
      const allowedRows = view.rows.filter((r) => r.permission === "ALLOWED");
      const total = ROOT_CAPITAL_ACTIONS.length;
      if (allowedRows.length > 0) {
        const state = allowedRows.some((r) => r.stepUpState === "REQUIRED") ? "REQUIRED" : allowedRows.some((r) => r.stepUpState === "ACTIVE") ? "ACTIVE" : undefined;
        return {
          id, label, allowed: true, need: undefined, held: [],
          reason: `A current root-level grant covers ${allowedRows.length} of ${total} capital commands. Each command is checked again when it is sent.`,
          stepUp: state,
        };
      }
      const reasons = [...new Set(view.rows.flatMap((r) => (r.permission === "UNAVAILABLE" ? [CAPITAL_REASON[r.reasonClass]] : [])))];
      return { id, label, allowed: false, need: undefined, held: [], reason: reasons.length > 0 ? reasons.join(". ") : "The read listed no capital command." };
    }
  }
}

/**
 * What the caller can do, in the design's order. Three kinds of row, never mixed:
 *  - a capability the server names (the four gate decisions, Manage grants, Manage users);
 *  - an advisory eligibility row ("Send capital commands", from the ROOT question);
 *  - a row no published read answers: "Not available yet" with the reason and its request id (FE-015, FE-016). Nothing is
 *    inferred from a role name, a preset or a neighbour's capability.
 */
export function doRows(capabilities: ReadonlySet<string>, capital: CapitalEligibilityView = { phase: "idle", reason: "Not asked." }): CapabilityRow[] {
  const decide = GATES.map((gate) =>
    row(`decide:${gate.id}`, `Decide at ${gate.label.replace(" gate", "")} gate`, capabilities, { allOf: [gate.decide] }, "No capability needed"));
  return [
    ...decide,
    absentRow("do:archive-approve", "Approve archive and reactivation", "FE-015", "Per-action eligibility", ARCHIVE_WHY),
    absentRow("do:archive-request", "Request an archive", "FE-015", "Per-action eligibility", ARCHIVE_WHY),
    absentRow("do:reactivation", "Start a reactivation review", "FE-015", "Per-action eligibility", ARCHIVE_WHY),
    capitalRow(capital),
    absentRow("do:operations", "Acknowledge and resolve operations", "FE-015", "Per-action eligibility", "The eligibility vocabulary has no action for acknowledging or resolving an operation."),
    row("manage:grants", "Manage grants", capabilities, { allOf: [ADMIN_CAPABILITY.profileAccessManage] }, "No capability needed"),
    row("manage:users", "Manage users", capabilities, { allOf: [ADMIN_CAPABILITY.usersManage] }, "No capability needed"),
    absentRow("do:own-admin", "Change your own admin rights", "FE-015", "Per-action eligibility", "No read says whether you may change your own admin rights."),
    absentRow("do:export", "Export tables", ACCESS_FE.exportTables, "Export", "Export is not available yet."),
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
