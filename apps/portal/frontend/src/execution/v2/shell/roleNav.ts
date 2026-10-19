/**
 * Execution V2 navigation overlay (review2/00 B7-B8, 05 D11-D12).
 *
 * The registry still owns which features exist and where they live; this file
 * only says what V2 calls them, in what order, and which capability a caller
 * needs before the entry is listed. Role is never read: a researcher loses
 * Accounts and Portfolios because they hold no `execution.accounts.read`, not
 * because of a label. Pure, so the presets below can be tested without a
 * session and `Sidebar` can import it without pulling the V2 chunk in.
 *
 * Hiding a menu entry is a courtesy, never the boundary. The server refuses
 * the route regardless (A4, `OwnerAccessGuard`).
 */
import type { PortalFeatureDefinition } from "../../../portal/contracts";
import type { NavGroup } from "../../../portal/navigation";

/**
 * Capability names the V2 nav tests for.
 *
 * Only the `governance.*` reads exist in the server namespace today
 * (control-api `PORTAL_CAPABILITIES`). The `execution.*` reads and the blotter
 * read are REQUESTED from the backend: until the session issues them, the
 * entries they guard are listed for nobody (fail closed). The blotter name is
 * the one V1 already prints in its denial copy.
 */
export const V2_CAPABILITY = {
  governanceR1Read: "governance.r1.read",
  governanceR2Read: "governance.r2.read",
  governanceCanaryRead: "governance.canary.read",
  governanceLiveRead: "governance.live.read",
  governanceR1Decide: "governance.r1.decide",
  governanceR2Decide: "governance.r2.decide",
  governanceCanaryDecide: "governance.canary.decide",
  governanceLiveDecide: "governance.live.decide",
  portfoliosRead: "execution.portfolios.read",
  accountsRead: "execution.accounts.read",
  operationsRead: "execution.operations.read",
  blotterRead: "portal.execution.blotter.read",
} as const;

/** What a caller must hold. No need at all is `undefined`, never an empty object. */
export interface CapabilityNeed {
  /** Every one of these. */
  allOf?: readonly string[];
  /** At least one of these; an empty list can never be satisfied. */
  anyOf?: readonly string[];
}

export function holds(capabilities: ReadonlySet<string>, need: CapabilityNeed | undefined): boolean {
  if (need === undefined) return true;
  if (need.allOf !== undefined && !need.allOf.every((capability) => capabilities.has(capability))) return false;
  if (need.anyOf !== undefined && !need.anyOf.some((capability) => capabilities.has(capability))) return false;
  return true;
}

const ANY_APPROVAL_READ: CapabilityNeed = {
  anyOf: [
    V2_CAPABILITY.governanceR1Read,
    V2_CAPABILITY.governanceR2Read,
    V2_CAPABILITY.governanceCanaryRead,
    V2_CAPABILITY.governanceLiveRead,
  ],
};

/** `nav` is listed in the rail, `link-only` only reaches the command bar, `hidden` is not offered. */
type Surface = "nav" | "link-only" | "hidden";

interface V2NavRule {
  featureId: string;
  surface: Surface;
  /** Required for `nav` and `link-only`. */
  label?: string;
  /** Position inside the Execution group; ignored when the entry stays in its registry group. */
  order?: number;
  /** `execution` joins the single Execution group, `registry` keeps the registry group. */
  home?: "execution" | "registry";
  needs?: CapabilityNeed;
}

/**
 * Seven rail entries for a manager (Overview, Portfolios, Alpha Fleet, Accounts,
 * Operations, Approvals, Profile & Access), Blotter by command bar only.
 * Waivers and Exit Reviews live inside Approvals; Admin Actions is unlisted;
 * Paper/Sandbox/Live became stage filters on Fleet (07 C-2).
 */
export const V2_NAV_RULES: readonly V2NavRule[] = [
  { featureId: "EXECUTION_COMMAND_CENTER", surface: "nav", label: "Overview", order: 10, home: "execution" },
  { featureId: "EXECUTION_PORTFOLIOS", surface: "nav", label: "Portfolios", order: 20, home: "execution", needs: { allOf: [V2_CAPABILITY.portfoliosRead] } },
  { featureId: "EXECUTION_ALPHA_FLEET", surface: "nav", label: "Alpha Fleet", order: 30, home: "execution" },
  { featureId: "EXECUTION_ACCOUNTS_BINDINGS", surface: "nav", label: "Accounts", order: 40, home: "execution", needs: { allOf: [V2_CAPABILITY.accountsRead] } },
  { featureId: "EXECUTION_OPERATIONS", surface: "nav", label: "Operations", order: 50, home: "execution", needs: { allOf: [V2_CAPABILITY.operationsRead] } },
  { featureId: "EXECUTION_APPROVALS", surface: "nav", label: "Approvals", order: 60, home: "execution", needs: ANY_APPROVAL_READ },
  { featureId: "EXECUTION_BLOTTER", surface: "link-only", label: "Blotter", order: 70, home: "execution", needs: { allOf: [V2_CAPABILITY.blotterRead] } },
  { featureId: "PROFILE_ACCESS", surface: "nav", label: "Profile & Access", home: "registry" },
  { featureId: "EXECUTION_WAIVERS", surface: "hidden" },
  { featureId: "EXECUTION_EXIT_REVIEWS", surface: "hidden" },
  { featureId: "EXECUTION_ADMIN_ACTIONS", surface: "hidden" },
  { featureId: "PAPER_TRADING", surface: "hidden" },
  { featureId: "SANDBOX_TRADING", surface: "hidden" },
  { featureId: "LIVE_OPERATIONS", surface: "hidden" },
];

const RULE_BY_FEATURE: ReadonlyMap<string, V2NavRule> = new Map(V2_NAV_RULES.map((rule) => [rule.featureId, rule]));

export interface V2NavItem {
  featureId: string;
  label: string;
  route: string;
  /** The registry entry, so the renderer can still read icon and description. */
  feature: PortalFeatureDefinition;
  /**
   * True for the Execution screens and Profile & Access: the rail carries the shared context onto them.
   * Research and Planning entries stay plain, so their URLs are exactly what they were.
   */
  carriesContext: boolean;
}

export interface V2NavGroup {
  id: string;
  label: string;
  items: V2NavItem[];
}

export const EXECUTION_NAV_GROUP_ID = "execution";

function toItem(feature: PortalFeatureDefinition, label: string): V2NavItem {
  return { featureId: feature.id, label, route: feature.canonical_route, feature, carriesContext: RULE_BY_FEATURE.has(feature.id) };
}

/**
 * Overlays V2 labels, order and capability needs on the registry's sidebar
 * groups. Features the table does not name pass through untouched, so Research
 * and Planning keep their place. The Execution entries are gathered into one
 * group placed where the first of them sat.
 */
export function applyV2Nav(groups: readonly NavGroup[], capabilities: ReadonlySet<string>): V2NavGroup[] {
  const out: V2NavGroup[] = [];
  const execution: { item: V2NavItem; order: number }[] = [];
  let executionAt = -1;

  // The registry says a legacy stub may be suppressed only with a VISIBLE replacement. "Visible" is decided in
  // this same pass: the replacement is a feature the groups list, its rule puts it in the rail and the caller
  // holds what that rule needs.
  const visibleInRail = new Set<string>();
  for (const { features } of groups) {
    for (const feature of features) {
      const rule = RULE_BY_FEATURE.get(feature.id);
      if (rule?.surface === "nav" && rule.label !== undefined && holds(capabilities, rule.needs)) visibleInRail.add(feature.id);
    }
  }

  for (const { group, features } of groups) {
    const kept: V2NavItem[] = [];
    let contributed = false;
    for (const feature of features) {
      // FE-039: the registry says this entry has a scoped V2 replacement (the old APPROVALS stub next to
      // EXECUTION_APPROVALS). The stub is dropped only while that replacement is itself listed; a caller who
      // cannot see the replacement keeps the stub, so Approvals never vanishes from the rail altogether.
      const replacement = feature.navigation.scoped_v2_replacement;
      if (replacement != null && visibleInRail.has(replacement.feature_id)) continue;
      const rule = RULE_BY_FEATURE.get(feature.id);
      if (rule === undefined) {
        kept.push(toItem(feature, feature.label));
        continue;
      }
      if (rule.surface !== "nav" || rule.label === undefined || !holds(capabilities, rule.needs)) continue;
      const item = toItem(feature, rule.label);
      if (rule.home === "execution") {
        execution.push({ item, order: rule.order ?? Number.MAX_SAFE_INTEGER });
        contributed = true;
      } else kept.push(item);
    }
    if (contributed && executionAt < 0) executionAt = kept.length > 0 ? out.length + 1 : out.length;
    if (kept.length > 0) out.push({ id: group.id, label: group.label, items: kept });
  }

  if (execution.length > 0) {
    const items = [...execution].sort((a, b) => a.order - b.order).map((entry) => entry.item);
    out.splice(executionAt, 0, { id: EXECUTION_NAV_GROUP_ID, label: "Execution", items });
  }
  return out;
}

/** One row of the command bar. `href` is a plain path; the caller carries context onto it. */
export interface CommandEntry {
  id: string;
  /** Section heading, e.g. "Go to", "Alpha". */
  group: string;
  label: string;
  /** Secondary text; omitted, never padded, when there is none. */
  detail?: string;
  href: string;
  requires?: CapabilityNeed;
}

/** Drops what the caller may not open. Server-scoped search results skip this; they arrive scoped. */
export function filterEntriesByCapabilities<T extends { requires?: CapabilityNeed }>(
  entries: readonly T[],
  capabilities: ReadonlySet<string>,
): T[] {
  return entries.filter((entry) => holds(capabilities, entry.requires));
}

export const GO_TO_GROUP = "Go to";

/**
 * "Go to" entries: every rail entry the caller sees, then the link-only ones
 * (Blotter). `extraFeatures` supplies link-only targets a registry revision may
 * have taken out of the sidebar.
 */
export function goToEntries(
  groups: readonly NavGroup[],
  capabilities: ReadonlySet<string>,
  extraFeatures: readonly PortalFeatureDefinition[] = [],
): CommandEntry[] {
  const entries: CommandEntry[] = applyV2Nav(groups, capabilities).flatMap((group) =>
    group.items.map((item) => ({ id: `go:${item.featureId}`, group: GO_TO_GROUP, label: item.label, href: item.route })),
  );
  const seen = new Set(entries.map((entry) => entry.id));
  const candidates = [...groups.flatMap((entry) => entry.features), ...extraFeatures];
  for (const feature of candidates) {
    const rule = RULE_BY_FEATURE.get(feature.id);
    if (rule?.surface !== "link-only" || rule.label === undefined || !holds(capabilities, rule.needs)) continue;
    const id = `go:${feature.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, group: GO_TO_GROUP, label: rule.label, href: feature.canonical_route });
  }
  return entries;
}

export type V2RolePreset = "manager" | "researcher" | "operator" | "reviewer";

/**
 * Capability sets that stand for the four presets of D12, for tests and docs.
 * Nothing in the product reads these: the session's own capability list is the
 * only input, and a preset is just a name for a typical one.
 */
export const V2_ROLE_PRESETS: Readonly<Record<V2RolePreset, ReadonlySet<string>>> = {
  manager: new Set<string>([
    V2_CAPABILITY.portfoliosRead,
    V2_CAPABILITY.accountsRead,
    V2_CAPABILITY.operationsRead,
    V2_CAPABILITY.blotterRead,
    V2_CAPABILITY.governanceR1Read,
    V2_CAPABILITY.governanceR2Read,
    V2_CAPABILITY.governanceCanaryRead,
    V2_CAPABILITY.governanceLiveRead,
    V2_CAPABILITY.governanceR1Decide,
    V2_CAPABILITY.governanceR2Decide,
    V2_CAPABILITY.governanceCanaryDecide,
    V2_CAPABILITY.governanceLiveDecide,
  ]),
  // Own R1 requests only (05 M10); no portfolios, accounts or operations.
  researcher: new Set<string>([V2_CAPABILITY.governanceR1Read]),
  operator: new Set<string>([
    V2_CAPABILITY.portfoliosRead,
    V2_CAPABILITY.accountsRead,
    V2_CAPABILITY.operationsRead,
    V2_CAPABILITY.blotterRead,
  ]),
  reviewer: new Set<string>([
    V2_CAPABILITY.portfoliosRead,
    V2_CAPABILITY.governanceR1Read,
    V2_CAPABILITY.governanceR2Read,
    V2_CAPABILITY.governanceCanaryRead,
    V2_CAPABILITY.governanceLiveRead,
    V2_CAPABILITY.governanceR1Decide,
    V2_CAPABILITY.governanceR2Decide,
    V2_CAPABILITY.governanceCanaryDecide,
    V2_CAPABILITY.governanceLiveDecide,
  ]),
};
