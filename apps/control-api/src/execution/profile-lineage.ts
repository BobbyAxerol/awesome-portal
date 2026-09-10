import { ManagerPage } from "../paper-read/manager-records";

export type LineageCapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

export interface LineageRelationResult<TSpec extends { key: string } = { key: string }> {
  spec: TSpec;
  page: ManagerPage | null;
  state: LineageCapabilityState;
  reasonCode: string | null;
  /**
   * P4-D: rejected-row diagnostics by missing-parent class. Present only on a
   * relation that actually lost rows, so a lineage storm is visible instead of
   * silently PARTIAL. Keys are the parent classes of `acceptedReference`.
   *
   * PHASE 5 (round 2): only rows dropped while the parent relation was itself
   * incomplete land here. Those are the ones we cannot account for.
   */
  lineageRejects?: Readonly<Record<string, number>>;
  /**
   * PHASE 5 (round 2): rows dropped while the parent relation was COMPLETE —
   * they belong to a different profile, and discarding them is the filter
   * working, not data going missing. Counted separately because the two look
   * identical in the row count and mean opposite things.
   */
  lineageScopedOut?: Readonly<Record<string, number>>;
}

/**
 * Enforces parent-child lineage after every source relation has passed its
 * narrow row contract. Some Manager-v2 child relations (notably balances) do
 * not carry `mode`; accepting them by outer envelope alone can therefore
 * relabel a Paper row as Live. A child key is accepted only when it belongs to
 * a parent row that was itself accepted for the exact profile.
 *
 * PHASE 5 (round 2) · dropping a row is not always a loss.
 *
 * Because those relations carry no `mode`, the source returns the SAME rows to
 * every profile and each profile keeps its own: on dev, 85 balance rows arrive
 * everywhere, Live keeps 0 of them (it has no accounts), Paper keeps 42 of 43,
 * Sandbox keeps 35 of 35. Marking all three PARTIAL for that made the
 * projection permanently incomplete — 6,360 journal rows, not one COMPLETE,
 * with `COMPLETE` unreachable by construction rather than by circumstance.
 *
 * Discarding a row that belongs to another profile is the filter doing its job
 * and the relation is COMPLETE for this profile. Discarding one whose parent
 * relation is itself PARTIAL is different: the parent page was cut short, so
 * we genuinely cannot tell whether that row belonged here. Only the second is
 * incompleteness, and the parent's own `completeness` tells the two apart.
 */
export function enforceProfileLineage<TSpec extends { key: string }>(
  relations: readonly LineageRelationResult<TSpec>[],
  errorPrefix: "N22" | "N23" | "N30",
): Array<LineageRelationResult<TSpec>> {
  const rows = (key: string) => relations.find((item) => item.spec.key === key)?.page?.items ?? [];
  const accountIds = values([...rows("accounts"), ...rows("deployments")], "account_id");
  const externalAccountRefs = values(rows("accounts"), "external_account_ref");
  const deploymentIds = values(rows("deployments"), "deployment_id");
  const strategyIds = values(
    [...rows("strategies"), ...rows("deployments"), ...rows("accounts")],
    "strategy_id",
    "alpha_id",
  );
  const portfolioIds = values([...rows("portfolios"), ...rows("deployments")], "portfolio_id");
  const sessionIds = values(rows("sessions"), "execution_session_id");
  const groupIds = values(rows("conditional_groups"), "group_id");
  const rootsPresent = {
    account: hasAny(relations, "accounts", "deployments"),
    externalAccount: hasAny(relations, "accounts"),
    deployment: hasAny(relations, "deployments"),
    strategy: hasAny(relations, "strategies", "deployments", "accounts"),
    portfolio: hasAny(relations, "portfolios", "deployments"),
    session: hasAny(relations, "sessions"),
    group: hasAny(relations, "conditional_groups"),
  };

  // Whether the accepted set for a class can be trusted to be the whole set.
  // A parent page that came back PARTIAL may simply not contain the parent
  // this row names, and then a rejection proves nothing about the row.
  const complete = (...keys: string[]) => parentsComplete(relations, keys);
  const checks = [
    { class: "account", field: "account_id", accepted: accountIds, present: rootsPresent.account, trusted: complete("accounts", "deployments") },
    { class: "external_account", field: "external_account_ref", accepted: externalAccountRefs, present: rootsPresent.externalAccount, trusted: complete("accounts") },
    { class: "deployment", field: "deployment_id", accepted: deploymentIds, present: rootsPresent.deployment, trusted: complete("deployments") },
    { class: "strategy", field: "strategy_id", accepted: strategyIds, present: rootsPresent.strategy, trusted: complete("strategies", "deployments", "accounts") },
    { class: "portfolio", field: "portfolio_id", accepted: portfolioIds, present: rootsPresent.portfolio, trusted: complete("portfolios", "deployments") },
    { class: "session", field: "execution_session_id", accepted: sessionIds, present: rootsPresent.session, trusted: complete("sessions") },
    { class: "group", field: "group_id", accepted: groupIds, present: rootsPresent.group, trusted: complete("conditional_groups") },
  ] as const;

  return relations.map((relation) => {
    if (!relation.page) return relation;
    const rejects: Record<string, number> = {};
    const scopedOut: Record<string, number> = {};
    const accepted = relation.page.items.filter((row) => {
      let ok = true;
      for (const check of checks) {
        if (!acceptedReference(row, check.field, check.accepted, check.present)) {
          const bucket = check.trusted ? scopedOut : rejects;
          bucket[check.class] = (bucket[check.class] ?? 0) + 1;
          ok = false;
        }
      }
      return ok;
    });
    if (accepted.length === relation.page.items.length) return relation;
    const counted = (bucket: Record<string, number>) => Object.keys(bucket).length > 0;
    if (!counted(rejects)) {
      // Every dropped row belonged to another profile. This relation is
      // complete for THIS profile; if nothing survived, it is empty, which is
      // a fact and not a failure.
      return {
        ...relation,
        page: { ...relation.page, items: accepted },
        state: accepted.length === 0 ? "EMPTY" as const : relation.state,
        lineageScopedOut: scopedOut,
      };
    }
    return {
      ...relation,
      page: { ...relation.page, items: accepted, completeness: "PARTIAL" },
      state: "PARTIAL",
      reasonCode: `${errorPrefix}_PROFILE_LINEAGE_REJECTED`,
      lineageRejects: rejects,
      ...(counted(scopedOut) ? { lineageScopedOut: scopedOut } : {}),
    };
  });
}

/**
 * True when every parent relation that is present for a class came back
 * COMPLETE. A missing relation is not a doubt — `acceptedReference` already
 * waives the check when its parent relation was never read.
 */
function parentsComplete<TSpec extends { key: string }>(
  relations: readonly LineageRelationResult<TSpec>[],
  keys: readonly string[],
): boolean {
  const present = relations.filter((item) => keys.includes(item.spec.key) && item.page !== null);
  return present.every((item) => item.page!.completeness === "COMPLETE");
}

function hasAny<TSpec extends { key: string }>(
  relations: readonly LineageRelationResult<TSpec>[],
  ...keys: string[]
): boolean {
  return relations.some((item) => keys.includes(item.spec.key) && item.page !== null);
}

function values(
  rows: readonly Record<string, unknown>[],
  ...fields: string[]
): Set<string> {
  return new Set(rows.flatMap((row) => fields.flatMap((field) => {
    const value = row[field];
    return typeof value === "string" && value.length > 0 ? [value] : [];
  })));
}

function acceptedReference(
  row: Record<string, unknown>,
  field: string,
  accepted: ReadonlySet<string>,
  parentRelationPresent: boolean,
): boolean {
  const value = row[field];
  if (value === undefined || value === null) return true;
  if (typeof value !== "string" || value.length === 0) return false;
  return !parentRelationPresent || accepted.has(value);
}
