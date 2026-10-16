import { publicationCatalogue, PublicationCatalogue } from "./publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE, EXECUTION_METRIC_DEPENDENCIES } from "./publication-source.generated";

/** Schema selection must reject secret values, including camelCase spellings.
 * Opaque IDs/status/hash references are not credential bodies. */
export function assertPublicationFieldName(name: string): void {
  const normalized = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,127}$/.test(normalized) ||
      !/_(?:id|ref|status|version|fingerprint|hash)$/.test(normalized) &&
      /(?:^|_)(?:password|passwd|secret|token|api_?key|private_?key|credential|credentials|authorization|auth_header|signature)(?:_|$)/.test(normalized))
    throw new Error("PUBLICATION_SECRET_FIELD_REJECTED");
}

const parsed = publicationCatalogue.parse(EXECUTION_PUBLICATION_CATALOGUE);
if (new Set(parsed.families.map(f => f.family_id)).size !== parsed.families.length ||
    new Set(parsed.fields.map(f => f.field_id)).size !== parsed.fields.length)
  throw new Error("PUBLICATION_CATALOGUE_DUPLICATE");
for (const field of parsed.fields) assertPublicationFieldName(field.field_id);

/** All inventory is static and safe to disclose; no current source IDs, count,
 * profile membership, private query refs, trust details or receipt secrets. */
export function browserPublicationCatalogue(): PublicationCatalogue {
  return structuredClone(parsed);
}

export type MetricPublicationKind = keyof typeof EXECUTION_METRIC_DEPENDENCIES;
/** Dependency inventory, not a calculator or permission to display a score.
 * In particular direct-NAV inputs never acquire a universal Research gate. */
export function metricPublicationRequirements(kind: MetricPublicationKind): readonly string[] {
  return [...EXECUTION_METRIC_DEPENDENCIES[kind]];
}

export const ECONOMIC_PUBLICATION_INPUTS = Object.freeze([
  { input_id: "equity_snapshots", family_ids: ["balances_collateral", "fund_portfolio_overview"],
    semantic: "POINT_IN_TIME_NOT_CERTIFIED_RETURN_HISTORY" },
  { input_id: "classified_flows", family_ids: ["economic_capital_assignment", "accounting_postings_corrections"],
    semantic: "EXTERNAL_VS_INTERNAL_CLASSIFICATION_AND_DEDUP_REQUIRED" },
  { input_id: "applicable_costs", family_ids: ["fees_funding", "accounting_postings_corrections"],
    semantic: "MISSING_IS_NOT_ZERO_NOT_APPLICABLE_REQUIRES_PROOF" },
  { input_id: "interval_gross_executed_notional", family_ids: ["fills", "valuation_prices_used"],
    semantic: "UNIQUE_FILL_REVISION_INSTRUMENT_MULTIPLIER_AND_FX_REQUIRED" },
] as const);
