/**
 * Footer totals per currency — the M7 consumer. One row per currency, the
 * three counts side by side and named, decimal strings verbatim, and a red
 * flag whenever the server counted rows it could not parse.
 */
import type { CurrencyAggregate } from "../blotterAggregates";

export function AggregatesFooter({ aggregates }: { aggregates: readonly CurrencyAggregate[] | null | undefined }) {
  if (aggregates === undefined || aggregates === null) {
    return <p className="exec-role-meta exec-agg-absent">Totals by currency not published for this page.</p>;
  }
  if (aggregates.length === 0) {
    return <p className="exec-role-meta exec-agg-absent">No currency totals — the population is empty.</p>;
  }
  return (
    <div className="exec-scroll-x">
      <table className="exec-360-sync exec-agg" aria-label="Totals by currency">
        <caption className="exec-role-meta">
          server totals per currency · counts are separate populations (rows · quantities parsed · notionals parsed) · never summed here
        </caption>
        <thead>
          <tr>
            <th scope="col">currency</th>
            <th scope="col">rows</th>
            <th scope="col">quantity Σ</th>
            <th scope="col">qty rows</th>
            <th scope="col">notional Σ</th>
            <th scope="col">notional rows</th>
            <th scope="col">invalid</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((a) => (
            <tr key={a.currency} data-invalid={(a.invalidNumericCount ?? 0) > 0 ? "true" : undefined}>
              <th scope="row">{a.currency}</th>
              <td className="exec-num">{a.rowCount ?? "—"}</td>
              <td className="exec-num">{a.quantity ?? "not published"}</td>
              <td className="exec-num">{a.quantityCount ?? "—"}</td>
              <td className="exec-num">{a.notional ?? "not published"}</td>
              <td className="exec-num">{a.notionalCount ?? "—"}</td>
              <td className="exec-num">
                {a.invalidNumericCount === null ? "—" : a.invalidNumericCount > 0 ? <span className="exec-chip" data-tone="bad">{a.invalidNumericCount} unparsable</span> : "0"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
