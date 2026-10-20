/**
 * The authority label of a SCOPED_V2 read (R-3), worded from what the contract publishes and nothing else:
 * `visibility: SCOPED`, `coverage: AUTHORIZED_ONLY`, `totals_scope: VISIBLE_ROWS_ONLY`, `is_full_portfolio: false`,
 * `completeness: PARTIAL`, the workspace, the policy revision per book, and per relation the rows returned against the source's
 * own total. A total the source did not state is "total not published", never zero and never the count of rows returned.
 */
import { Flag } from "../../Flag";
import { humanize } from "./model";
import type { ScopeLabel } from "./view";

export function ScopeBanner({ scope, withheld }: { scope: ScopeLabel; withheld: string | null }) {
  return (
    <div className="exec-blk-banner exec-alp2-scope" role="note" aria-label="Authority of this read" data-scope="scoped-v2">
      <Flag kind="partial" label="Scoped read" size="sm" />{" "}
      Authorized rows only. Totals cover visible rows only. This is not a full portfolio. Completeness: {humanize(scope.completeness)}.
      {withheld ? <> The Portal cut this response at its size bound (<span className="exec-blk-id">{withheld}</span>), so the relation rows are not in it.</> : null}
      <details className="exec-alp2-details">
        <summary>Scope, policy and population</summary>
        <table className="exec-alp2-kv" aria-label="Scope of this read">
          <tbody>
            <tr><th scope="row">Workspace</th><td className="exec-blk-id">{scope.workspaceId}</td></tr>
            <tr><th scope="row">Delivery profile</th><td className="exec-blk-id">{scope.deliveryProfile}</td></tr>
            <tr><th scope="row">Visibility</th><td className="exec-blk-id">{scope.visibility}</td></tr>
            <tr><th scope="row">Coverage</th><td className="exec-blk-id">{scope.coverage}</td></tr>
            <tr><th scope="row">Totals</th><td className="exec-blk-id">{scope.totalsScope}</td></tr>
            <tr><th scope="row">Read for</th><td>{scope.actor}</td></tr>
            {scope.readScope.map((entry) => (
              <tr key={entry.book}>
                <th scope="row">Policy revision, {humanize(entry.book)}</th>
                <td className="exec-blk-id">{entry.policyRevision ?? "Not published"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="exec-alp2-kv" aria-label="Population by relation">
          <thead><tr><th scope="col">Relation</th><th scope="col">Returned</th><th scope="col">Source total</th><th scope="col">State</th></tr></thead>
          <tbody>
            {scope.population.map((p) => (
              <tr key={p.relation}>
                <th scope="row">{humanize(p.relation)}</th>
                <td>{p.returned}</td>
                <td>{p.sourceTotal ?? "Total not published"}</td>
                <td title={p.reasonCode ?? undefined}>{humanize(p.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
