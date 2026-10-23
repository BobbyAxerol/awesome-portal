import type { ProjectionRelation, ProjectionScalar } from "../execution/profile-projection.repository";

export type PortfolioNameReason = "PORTFOLIO_NAME_NOT_READ" | "PORTFOLIO_NAME_NOT_PUBLISHED" |
  "PORTFOLIO_NAME_NOT_AUTHORIZED" | "PORTFOLIO_NAME_AMBIGUOUS";
export interface PortfolioNameFact {
  portfolio_name: string | null;
  portfolio_name_reason_code: PortfolioNameReason | null;
}

/** Input MUST be the detached, authorized portfolios relation from the SAME
 * resource snapshot, not the repository's unfiltered relation or another read.
 * This index is built once per bounded child panel, before child pagination.
 * A missing name never reveals whether a portfolio was hidden or absent. */
export function scopedPortfolioNames(relation: ProjectionRelation | null, nameAllowed: boolean) {
  const names = new Map<string, Set<string | null>>();
  if (nameAllowed && relation?.availability !== "UNAVAILABLE") {
    for (const row of relation?.items ?? []) {
      const id = label(row.fields.portfolio_id);
      if (!id) continue;
      const values = names.get(id) ?? new Set<string | null>();
      values.add(label(row.fields.name));
      names.set(id, values);
    }
  }
  return (row: Readonly<Record<string, ProjectionScalar>>): PortfolioNameFact => {
    const absent = (reason: PortfolioNameReason): PortfolioNameFact => ({ portfolio_name: null, portfolio_name_reason_code: reason });
    if (!nameAllowed) return absent("PORTFOLIO_NAME_NOT_AUTHORIZED");
    if (!relation || relation.availability === "UNAVAILABLE") return absent("PORTFOLIO_NAME_NOT_READ");
    const id = label(row.portfolio_id), values = id ? names.get(id) : undefined;
    if (!values?.size) return absent("PORTFOLIO_NAME_NOT_PUBLISHED");
    if (values.size > 1) return absent("PORTFOLIO_NAME_AMBIGUOUS");
    const value = [...values][0];
    return value === null ? absent("PORTFOLIO_NAME_NOT_PUBLISHED") : { portfolio_name: value, portfolio_name_reason_code: null };
  };
}

function label(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && [...value].length > 0 && [...value].length <= 512 &&
    !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}
