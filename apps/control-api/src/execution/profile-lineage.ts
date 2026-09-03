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
   */
  lineageRejects?: Readonly<Record<string, number>>;
}

/**
 * Enforces parent-child lineage after every source relation has passed its
 * narrow row contract. Some Manager-v2 child relations (notably balances) do
 * not carry `mode`; accepting them by outer envelope alone can therefore
 * relabel a Paper row as Live. A child key is accepted only when it belongs to
 * a parent row that was itself accepted for the exact profile.
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

  const checks = [
    { class: "account", field: "account_id", accepted: accountIds, present: rootsPresent.account },
    { class: "external_account", field: "external_account_ref", accepted: externalAccountRefs, present: rootsPresent.externalAccount },
    { class: "deployment", field: "deployment_id", accepted: deploymentIds, present: rootsPresent.deployment },
    { class: "strategy", field: "strategy_id", accepted: strategyIds, present: rootsPresent.strategy },
    { class: "portfolio", field: "portfolio_id", accepted: portfolioIds, present: rootsPresent.portfolio },
    { class: "session", field: "execution_session_id", accepted: sessionIds, present: rootsPresent.session },
    { class: "group", field: "group_id", accepted: groupIds, present: rootsPresent.group },
  ] as const;

  return relations.map((relation) => {
    if (!relation.page) return relation;
    const rejects: Record<string, number> = {};
    const accepted = relation.page.items.filter((row) => {
      let ok = true;
      for (const check of checks) {
        if (!acceptedReference(row, check.field, check.accepted, check.present)) {
          rejects[check.class] = (rejects[check.class] ?? 0) + 1;
          ok = false;
        }
      }
      return ok;
    });
    if (accepted.length === relation.page.items.length) return relation;
    return {
      ...relation,
      page: { ...relation.page, items: accepted, completeness: "PARTIAL" },
      state: "PARTIAL",
      reasonCode: `${errorPrefix}_PROFILE_LINEAGE_REJECTED`,
      lineageRejects: rejects,
    };
  });
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
