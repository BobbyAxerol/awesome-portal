import { profileProjectionCatalog } from "../execution/profile-projection.catalog";
import type { ProjectionEnvironment } from "../execution/profile-projection.repository";
import { epochMsFrom } from "../execution-v2/record-detail";

/**
 * BE-P15 (RV-11 R-6, R-7): two SCOPED_V2 summary members that are derived from rows the scope already admitted.
 * Nothing here reads a source, widens a policy, sums rows or infers a value from a display id.
 */
type Row = Readonly<Record<string, unknown>>;

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const decimal = (value: unknown): string | null => (typeof value === "string" && value.length <= 128 && DECIMAL.test(value) ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null);

export type DeploymentFinancialReason =
  | "DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE" | "DEPLOYMENT_FINANCIALS_RELATION_UNAVAILABLE"
  | "DEPLOYMENT_FINANCIAL_SNAPSHOT_NOT_PUBLISHED" | "DEPLOYMENT_FINANCIAL_SNAPSHOT_AMBIGUOUS" | "DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED";

export interface DeploymentFinancial {
  readonly profile_environment: ProjectionEnvironment;
  readonly deployment_id: string;
  readonly state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  readonly reason_code: DeploymentFinancialReason | null;
  readonly basis: "LATEST_VISIBLE_ACCOUNT_EQUITY_SNAPSHOT_ROW";
  readonly snapshot_at_ms: number | null;
  readonly currency: string | null;
  readonly net_pnl: string | null;
  readonly equity: string | null;
}

const BASIS = "LATEST_VISIBLE_ACCOUNT_EQUITY_SNAPSHOT_ROW" as const;
const bound = (environment: ProjectionEnvironment): boolean => profileProjectionCatalog(environment).some(binding => binding.key === "account_equity");
const environmentOf = (row: Row): ProjectionEnvironment | null =>
  row.profile_environment === "paper" || row.profile_environment === "sandbox" || row.profile_environment === "live" ? row.profile_environment : null;

/**
 * One entry per visible deployment: the single published `account_equity_snapshots` row with the greatest instant among the rows
 * this scope may see for that `deployment_id`. The source does not say whether such a row is the deployment's own figure or the
 * shared account's, and a deployment can have several rows per instant (per currency), so:
 *  - two different rows at the latest instant are AMBIGUOUS (absent), never merged or summed;
 *  - a window the Portal cut (`truncated`) is PARTIAL: a later row may exist outside it;
 *  - a profile whose catalogue binds no equity relation (sandbox, live today) is a typed absence, not a zero.
 * `exposure` is not published: the source rows that carry it are per instrument and an exposure total would be a sum.
 */
export function deploymentFinancials(deployments: readonly Row[],
  equity: { readonly rows: readonly Row[]; readonly truncated: boolean; readonly unavailableEnvironments: ReadonlySet<string> } | undefined): DeploymentFinancial[] {
  const seen = new Set<string>(), out: DeploymentFinancial[] = [];
  for (const deployment of deployments) {
    const environment = environmentOf(deployment), id = text(deployment.deployment_id);
    if (!environment || !id || seen.has(`${environment}\u001f${id}`)) continue;
    seen.add(`${environment}\u001f${id}`);
    const absent = (reason: DeploymentFinancialReason): DeploymentFinancial => ({ profile_environment: environment, deployment_id: id, state: "UNAVAILABLE",
      reason_code: reason, basis: BASIS, snapshot_at_ms: null, currency: null, net_pnl: null, equity: null });
    if (!bound(environment)) { out.push(absent("DEPLOYMENT_FINANCIALS_RELATION_NOT_BOUND_FOR_PROFILE")); continue; }
    if (!equity || equity.unavailableEnvironments.has(environment)) { out.push(absent("DEPLOYMENT_FINANCIALS_RELATION_UNAVAILABLE")); continue; }
    const candidates = equity.rows.flatMap(row => {
      if (environmentOf(row) !== environment || text(row.deployment_id) !== id) return [];
      const at = typeof row.ts_ms === "number" && Number.isSafeInteger(row.ts_ms) && row.ts_ms >= 0 ? row.ts_ms : epochMsFrom(row.ts);
      return at === undefined ? [] : [{ row, at }];
    });
    if (candidates.length === 0) { out.push(absent("DEPLOYMENT_FINANCIAL_SNAPSHOT_NOT_PUBLISHED")); continue; }
    const latest = Math.max(...candidates.map(candidate => candidate.at));
    const tied = candidates.filter(candidate => candidate.at === latest).map(candidate => candidate.row);
    const figure = (row: Row) => JSON.stringify([text(row.currency), decimal(row.net_pnl), decimal(row.equity)]);
    if (new Set(tied.map(figure)).size > 1) { out.push(absent("DEPLOYMENT_FINANCIAL_SNAPSHOT_AMBIGUOUS")); continue; }
    const row = tied[0];
    out.push({ profile_environment: environment, deployment_id: id, state: equity.truncated ? "PARTIAL" : "AVAILABLE",
      reason_code: equity.truncated ? "DEPLOYMENT_FINANCIAL_WINDOW_TRUNCATED" : null, basis: BASIS, snapshot_at_ms: latest,
      currency: text(row.currency), net_pnl: decimal(row.net_pnl), equity: decimal(row.equity) });
  }
  return out;
}

export type IdentityAbsenceReason =
  | "ALPHA_NAME_NOT_IN_SOURCE" | "ALPHA_NAME_NOT_IN_POLICY" | "ALPHA_VERSION_NOT_IN_SOURCE" | "ALPHA_VERSION_NOT_IN_POLICY"
  | "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER" | "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE";

/**
 * Which identity members of an ALPHA body are NOT stated, and why. The Trading System `strategies` relation has no name or version
 * column (BE-P14 R-6), `trader_id` is a TS trader and not a Portal user, and no relation names an alpha stage; so those three are
 * always typed absences until a source states them, and `Unnamed alpha` / a join on the display id are never produced.
 * `allows` is the scope's field admission for the summary (every participating scope must admit the field).
 */
export function identityAbsences(kind: string, summary: Row, allows: (field: string) => boolean): { member: "name" | "version" | "owner" | "stage"; reason_code: IdentityAbsenceReason }[] {
  if (kind !== "ALPHA") return [];
  const out: { member: "name" | "version" | "owner" | "stage"; reason_code: IdentityAbsenceReason }[] = [];
  if (text(summary.name) === null && text(summary.display_name) === null)
    out.push({ member: "name", reason_code: allows("name") || allows("display_name") ? "ALPHA_NAME_NOT_IN_SOURCE" : "ALPHA_NAME_NOT_IN_POLICY" });
  if (text(summary.version) === null)
    out.push({ member: "version", reason_code: allows("version") ? "ALPHA_VERSION_NOT_IN_SOURCE" : "ALPHA_VERSION_NOT_IN_POLICY" });
  out.push({ member: "owner", reason_code: "ALPHA_OWNER_NOT_MAPPED_TO_PORTAL_USER" });
  out.push({ member: "stage", reason_code: "ALPHA_STAGE_NOT_PUBLISHED_BY_SOURCE" });
  return out;
}
