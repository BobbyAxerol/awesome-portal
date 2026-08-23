/**
 * Phase 6 — the canonical command catalogue.
 *
 * This file used to hold twenty-one commands derived by hand from the CLI
 * guide, because no contract existed. EX-BE-05b/F0 published one, so the hand
 * list is gone: sixty-four entries now arrive from
 * `GET /api/v1/execution/commands/catalog` and this reads them.
 *
 * Three constants in that contract decide the whole screen, and none of them is
 * a detail:
 *
 *   * `capability.state` is `DISABLED`, reason `EX_BE_05B_F0_CONTRACT_ONLY`;
 *   * `portal_reachable` is `false` on EVERY entry;
 *   * `catalogue_revision` is 2 and `total_entries` is 64.
 *
 * So nothing here is runnable. The drawer's job is not to offer commands — it
 * is to show which sixty-four exist, and to say precisely why each is out of
 * reach. Codex's stop gates put it plainly: unavailable actions stay visible
 * and explain themselves, and `BLOCKED`, `UNPUBLISHED` and `AMBIGUOUS` must
 * never be turned into a success or an empty state.
 *
 * Two risk tiers travel per entry and they are not interchangeable.
 * `source_risk_tier` is what the Trading System's own map proposed;
 * `risk_tier` is what the Portal is bound by. `account/policy` is R0 at the
 * source and R1 here, and rendering the first would understate what the command
 * costs — which the stop gates also forbid, in those words.
 */

/* ---------------------------------------------------------------------------
 * Vocabulary, all of it the contract's
 * ------------------------------------------------------------------------ */

export const CATALOG_GROUPS = [
  "ACCOUNT_CAPITAL",
  "ALPHA_DEPLOYMENT",
  "ORDER_CONTROL",
  "OPERATIONS_INCIDENTS",
  "MARKET_REFERENCE",
  "PLATFORM_DIAGNOSTICS",
] as const;
export type CatalogGroupCode = (typeof CATALOG_GROUPS)[number];

/**
 * Display names for the server's groups.
 *
 * A relabelling, never a regrouping. The hi-fi arranged its six groups by what
 * an operator is doing (read & inspect, emergency & destructive); the contract
 * arranges by system domain. Codex's handoff settles which wins — "grouped
 * using server `group`" — and quietly re-sorting sixty-four entries into the
 * hi-fi's shape would put a mapping in the browser that no contract vouches
 * for. So the order and membership are the server's, and only the words are
 * ours.
 */
export const GROUP_LABEL: Record<CatalogGroupCode, string> = {
  ACCOUNT_CAPITAL: "Account & capital",
  ALPHA_DEPLOYMENT: "Alpha & deployment",
  ORDER_CONTROL: "Order control",
  OPERATIONS_INCIDENTS: "Operations & incidents",
  MARKET_REFERENCE: "Market reference",
  PLATFORM_DIAGNOSTICS: "Platform diagnostics",
};

export const CATALOG_RISK_TIERS = [
  "R0_READ",
  "R1_PAPER_MUTATION",
  "R2_SANDBOX",
  "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING",
  "UNCLASSIFIED",
  "BLOCKED",
] as const;
export type CatalogRiskTier = (typeof CATALOG_RISK_TIERS)[number];

export const RISK_TIER_LABEL: Record<CatalogRiskTier, string> = {
  R0_READ: "R0 · read",
  R1_PAPER_MUTATION: "R1 · paper mutation",
  R2_SANDBOX: "R2 · sandbox",
  R3_LIVE_PROTECTIVE: "R3 · live protective",
  R4_LIVE_RISK_INCREASING: "R4 · live risk-increasing",
  // Not a low tier. The source map could not classify it, and treating silence
  // as "read" is how an unclassified capital movement gets shown as harmless.
  UNCLASSIFIED: "unclassified",
  BLOCKED: "blocked",
};

export const ROUTE_STATES = [
  "OBSERVED",
  "AMBIGUOUS",
  "UNPUBLISHED",
  "DIRECT_ACCESS_PROHIBITED",
] as const;
export type RouteState = (typeof ROUTE_STATES)[number];

export const BLOCKED_REASONS = [
  "COMMAND_RELAY_DISABLED",
  "SOURCE_ROUTE_MAPPING_AMBIGUOUS",
  "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED",
  "TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED",
  "GENERIC_REDIS_ACCESS_PROHIBITED",
  "DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED",
] as const;
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

/**
 * What each blocked reason means, in the operator's terms.
 *
 * Written here because the codes are for machines. An operator reading
 * `SOURCE_ROUTE_MAPPING_AMBIGUOUS` learns nothing; one reading "the CLI reaches
 * this through a handler that serves several actions, so the Portal cannot tell
 * which route belongs to it" knows both why it is off and who could fix it.
 */
export const BLOCKED_REASON_TEXT: Record<BlockedReason, string> = {
  COMMAND_RELAY_DISABLED:
    "The Portal's command relay is off. The route exists and the Portal is not permitted to use it yet.",
  SOURCE_ROUTE_MAPPING_AMBIGUOUS:
    "The CLI reaches this through a handler that serves several actions, so which route belongs to this one is not established.",
  TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED:
    "The Trading System publishes no HTTP route for this action. Operators run it from the CLI host.",
  TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED:
    "The Trading System publishes no typed HTTP route for this action, so the Portal cannot call it safely.",
  GENERIC_REDIS_ACCESS_PROHIBITED:
    "This reads Redis directly. The Portal is forbidden that path, and a generic key reader would expose every key in the cell rather than this one view.",
  DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED:
    "Destructive or lab-only. It has no plan/apply/verify path and no audit trail to reverse it, so it is not exposed at any tier.",
};

/* ---------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------ */

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export interface CatalogEntry {
  /** `noun/verb`, or `noun/<root>`. The join key across every artefact. */
  key: string;
  command: string;
  action: string;
  group: CatalogGroupCode | null;
  /** What the PORTAL is bound by. The tier that governs this screen. */
  riskTier: CatalogRiskTier | null;
  /** What the source map proposed. Reported, never substituted for the above. */
  sourceRiskTier: CatalogRiskTier | null;
  ownerReviewRequired: boolean;
  planRequired: boolean;
  applyRequired: boolean;
  verifyRequired: boolean;
  /** `false` for every entry in revision 2, and read rather than assumed. */
  portalReachable: boolean;
  routeState: RouteState | null;
  httpMethod: string | null;
  httpPath: string | null;
  blockedReason: BlockedReason | null;
  /** Where in the CLI this was observed, e.g. `cli/__main__.py:1690`. */
  sourceReference: string | null;
}

export interface CatalogScope {
  workspaceId: string | null;
  actorRole: string | null;
  environment: string | null;
  capabilityState: string | null;
  freshnessState: string | null;
  policyRevision: number | null;
}

export interface CommandCatalogue {
  revision: number | null;
  deliveryProfile: string | null;
  /** `DISABLED` in revision 2. Anything else is not permission to run. */
  capabilityState: string | null;
  capabilityReason: string | null;
  /** Which Trading System commit and extracts this was generated from. */
  sourceCommit: string | null;
  scope: CatalogScope | null;
  totalEntries: number | null;
  returnedEntries: number | null;
  entries: readonly CatalogEntry[];
}

function readEntry(raw: unknown): CatalogEntry | null {
  const o = obj(raw);
  const key = str(o?.key);
  if (!o || !key) return null;
  return {
    key,
    command: str(o.command) ?? key.split("/")[0],
    action: str(o.action) ?? key.split("/")[1] ?? "",
    group: pick(o.group, CATALOG_GROUPS),
    riskTier: pick(o.risk_tier, CATALOG_RISK_TIERS),
    sourceRiskTier: pick(o.source_risk_tier, CATALOG_RISK_TIERS),
    // Every one of these four is deny-by-default: a flag we cannot read is not
    // a flag that grants anything.
    ownerReviewRequired: o.owner_review_required === true,
    planRequired: o.plan_required === true,
    applyRequired: o.apply_required === true,
    verifyRequired: o.verify_required === true,
    // Read, not assumed from the const. If a later revision flips one to true
    // this reports it rather than continuing to say false.
    portalReachable: o.portal_reachable === true,
    routeState: pick(o.source_route_state, ROUTE_STATES),
    httpMethod: str(o.http_method),
    httpPath: str(o.http_path),
    blockedReason: pick(o.blocked_reason, BLOCKED_REASONS),
    sourceReference: str(o.source_reference),
  };
}

export function readCommandCatalogue(raw: unknown): CommandCatalogue | null {
  const root = obj(raw);
  if (!root) return null;
  const capability = obj(root.capability);
  const source = obj(root.source);
  const scope = obj(root.scope);
  return {
    revision: int(root.catalogue_revision),
    deliveryProfile: str(root.delivery_profile),
    capabilityState: str(capability?.state),
    capabilityReason: str(capability?.reason),
    sourceCommit: str(source?.trading_system_commit),
    scope: scope
      ? {
          workspaceId: str(scope.workspace_id),
          actorRole: str(scope.actor_role),
          environment: str(scope.environment),
          capabilityState: str(scope.capability_state),
          freshnessState: str(scope.freshness_state),
          policyRevision: int(scope.policy_revision),
        }
      : null,
    totalEntries: int(root.total_entries),
    returnedEntries: int(root.returned_entries),
    entries: (Array.isArray(root.entries) ? root.entries : []).flatMap((e) => {
      const entry = readEntry(e);
      return entry ? [entry] : [];
    }),
  };
}

/**
 * Group the entries for rendering, in the contract's declared group order.
 *
 * Groups with no entries are omitted rather than rendered empty: revision 2
 * carries nothing under `MARKET_REFERENCE`, and an empty heading would read as
 * "these exist and none is shown".
 */
export function groupEntries(
  entries: readonly CatalogEntry[],
): readonly { code: CatalogGroupCode | null; label: string; items: readonly CatalogEntry[] }[] {
  const out: { code: CatalogGroupCode | null; label: string; items: CatalogEntry[] }[] = [];
  for (const code of CATALOG_GROUPS) {
    const items = entries.filter((e) => e.group === code);
    if (items.length > 0) out.push({ code, label: GROUP_LABEL[code], items });
  }
  // An entry whose group we could not read still has to appear. Dropping it
  // would quietly shrink a catalogue whose whole point is completeness.
  const ungrouped = entries.filter((e) => e.group === null);
  if (ungrouped.length > 0) {
    out.push({ code: null, label: "Group not stated", items: ungrouped });
  }
  return out;
}

/** The one sentence an entry's unavailability is allowed to say. */
export function blockedText(entry: CatalogEntry): string {
  return entry.blockedReason
    ? BLOCKED_REASON_TEXT[entry.blockedReason]
    : "This command is not available through the Portal, and no reason was published.";
}
