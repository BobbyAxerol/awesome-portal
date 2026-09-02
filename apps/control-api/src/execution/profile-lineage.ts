import { ManagerPage } from "../paper-read/manager-records";

export type LineageCapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

export interface LineageRelationResult<TSpec extends { key: string } = { key: string }> {
  spec: TSpec;
  page: ManagerPage | null;
  state: LineageCapabilityState;
  reasonCode: string | null;
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

  return relations.map((relation) => {
    if (!relation.page) return relation;
    const accepted = relation.page.items.filter((row) =>
      acceptedReference(row, "account_id", accountIds, rootsPresent.account) &&
      acceptedReference(row, "external_account_ref", externalAccountRefs, rootsPresent.externalAccount) &&
      acceptedReference(row, "deployment_id", deploymentIds, rootsPresent.deployment) &&
      acceptedReference(row, "strategy_id", strategyIds, rootsPresent.strategy) &&
      acceptedReference(row, "portfolio_id", portfolioIds, rootsPresent.portfolio) &&
      acceptedReference(row, "execution_session_id", sessionIds, rootsPresent.session) &&
      acceptedReference(row, "group_id", groupIds, rootsPresent.group)
    );
    if (accepted.length === relation.page.items.length) return relation;
    return {
      ...relation,
      page: { ...relation.page, items: accepted, completeness: "PARTIAL" },
      state: "PARTIAL",
      reasonCode: `${errorPrefix}_PROFILE_LINEAGE_REJECTED`,
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
