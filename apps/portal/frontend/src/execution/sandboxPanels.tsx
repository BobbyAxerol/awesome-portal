/**
 * Sandbox Overview — the reviewed panels, on drained relations (P0-8).
 *
 * The overview profile publishes deployments and nothing else: no orders, no
 * broker sync, no findings. Three of the reviewed screen's panels therefore
 * existed only in the demo branch, and dev drew a KPI strip over a table.
 *
 * The rows are readable, just not from that profile. The named-relation BFF
 * publishes them per environment:
 *
 *   * `broker-account-sync-current-state` — one row per testnet account, with
 *     the venue's own status, its buying power and when it last synced,
 *   * `reconciliation-findings` — every finding with its type, severity and
 *     whether it has been resolved,
 *   * `orders` — sandbox order rows, currently an honest empty set.
 *
 * The two measures the reviewed panel draws as bars, ACK and fill latency, have
 * no source at all: the broker acknowledgement timestamps are not activated.
 * They are named `Soon` with that code rather than drawn from a proxy, because
 * a latency bar computed from the Portal's own read clock would measure this
 * browser's distance from the edge and label it the venue's.
 */
import type { ReactNode } from "react";

import { PanelState } from "./components/states";
import { formatExact } from "./formatExact";
import { soonReason } from "./soon";
import { utcStamp } from "./time";
import type { RelationFacts } from "./api/managerRelations";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

const ms = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const at = Date.parse(value); return Number.isFinite(at) ? at : null; }
  return null;
};

const OPEN_FINDING = (row: Row) => !["RESOLVED", "CLOSED"].includes((text(row.status) ?? "").toUpperCase());

/** Severity decides the row's tone; the word is the source's, never a re-grade. */
const SEVERITY_TONE: Record<string, "bad" | "warn" | "mute"> = { CRITICAL: "bad", ERROR: "bad", WARNING: "warn", WARN: "warn", INFO: "mute" };

export interface SandboxPanelInput {
  relations: RelationFacts | null | undefined;
  loading: boolean;
  /** deployment rows from the overview profile, for the per-deployment journal */
  deployments: readonly Row[];
}

/** Counts of one relation's rows by a field, largest first. */
function tally(list: readonly Row[], field: string): { key: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const row of list) counts.set(text(row[field]) ?? "not published", (counts.get(text(row[field]) ?? "not published") ?? 0) + 1);
  return [...counts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

/**
 * The three panels, or an honest state in each one's place.
 *
 * Every panel says which relation it read and how many rows that relation
 * returned, because a panel showing two rows of three is indistinguishable
 * from one showing all there are.
 */
export function sandboxPanels(input: SandboxPanelInput): {
  orderExecution: ReactNode;
  venueConnectivity: ReactNode;
  recentlyCertified: ReactNode;
  openFindings: number | null;
} {
  const sync = input.relations?.facts.broker_account_sync ?? null;
  const findings = input.relations?.facts.reconciliation_findings ?? null;
  const orders = input.relations?.facts.orders ?? null;
  const status = input.loading ? ("loading" as const) : ("unavailable" as const);
  const unread = (relation: string) => input.loading
    ? "the sandbox relations are still draining"
    : `Soon · ${relation.toUpperCase()}_NOT_READABLE`;

  // Orders carry a strategy, not a deployment id; the journal groups by the
  // deployment whose strategy matches, so a row is never assigned to two.
  const byDeployment = new Map<string, { orders: number; statuses: Map<string, number> }>();
  for (const order of orders ?? []) {
    const strategy = text(order.strategy_id);
    const deployment = input.deployments.find((row) => text(row.strategy_id) === strategy);
    const key = text(deployment?.deployment_id) ?? strategy ?? "not published";
    const held = byDeployment.get(key) ?? { orders: 0, statuses: new Map() };
    held.orders += 1;
    const state = text(order.status) ?? "not published";
    held.statuses.set(state, (held.statuses.get(state) ?? 0) + 1);
    byDeployment.set(key, held);
  }
  const journal = [...byDeployment.entries()].sort((a, b) => b[1].orders - a[1].orders).slice(0, 12);

  return {
    openFindings: findings ? findings.filter(OPEN_FINDING).length : null,
    orderExecution: (
      <section className="exec-af-panel exec-sb-panel" aria-label="Testnet order execution — 7d, per deployment">
        <header className="exec-sb-head">
          <span className="exec-sb-title">Testnet order execution — 7d, per deployment</span>
          <span className="exec-af-spacer" />
          <span className="exec-sb-note">{orders ? `${orders.length} order rows in the drained page set` : "orders relation"}</span>
        </header>
        {journal.length > 0 ? (
          <div className="exec-scroll-x">
            <table className="exec-sb-jtable" aria-label="Testnet order journal">
              <thead>
                <tr>
                  <th>deployment</th>
                  <th data-numeric="true">orders</th>
                  <th>status counts · source</th>
                </tr>
              </thead>
              <tbody>
                {journal.map(([key, value]) => (
                  <tr key={key}>
                    <td><a href={`/deployments/sandbox/${encodeURIComponent(key)}`}>{key}</a></td>
                    <td data-numeric="true">{value.orders}</td>
                    <td>{[...value.statuses.entries()].sort((a, b) => b[1] - a[1]).map(([state, n]) => `${state} ${n}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : orders ? (
          <PanelState status="empty" reason="The orders relation answered for sandbox and returned no row. An empty set is a fact, not a gap." />
        ) : (
          <PanelState status={status} reason={unread("orders")} />
        )}
      </section>
    ),
    venueConnectivity: (
      <section className="exec-af-panel exec-sb-panel" aria-label="Venue connectivity — testnet, live measures">
        <header className="exec-sb-head">
          <span className="exec-sb-title">Venue connectivity — testnet, live measures</span>
          <span className="exec-af-spacer" />
          <span className="exec-sb-note">{sync ? `${sync.length} synced account${sync.length === 1 ? "" : "s"}` : "broker sync relation"}</span>
        </header>
        {sync && sync.length > 0 ? (
          <>
            <div className="exec-scroll-x">
              <table className="exec-sb-jtable" aria-label="Testnet broker accounts">
                <thead>
                  <tr><th>account · venue</th><th>status</th><th data-numeric="true">buying power</th><th>last sync (UTC)</th></tr>
                </thead>
                <tbody>
                  {sync.map((row) => (
                    <tr key={text(row.sync_id) ?? text(row.external_account_ref) ?? "row"}>
                      <td>
                        {text(row.external_account_ref) ?? "account not published"}
                        <span className="exec-af-dim"> · {text(row.venue) ?? "venue not published"}{text(row.source) ? ` · ${text(row.source)}` : ""}</span>
                      </td>
                      <td data-tone={text(row.status) === "OK" ? "good" : "warn"}>{text(row.status) ?? "not published"}</td>
                      <td data-numeric="true">
                        {text(row.buying_power) === null ? <span className="exec-gate-unverified">not published</span>
                          : `${formatExact(text(row.buying_power)!, "money").display}${text(row.currency) ? ` ${text(row.currency)}` : ""}`}
                      </td>
                      <td className="exec-af-num">{utcStamp(ms(row.synced_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="exec-sb-connfoot">
              ACK and fill latency: <b>{soonReason("N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED") ?? "Soon"}</b>
              {" "}— the venue publishes no acknowledgement timestamp, and a latency measured from the Portal’s own read clock would be this browser’s distance from the edge, not the venue’s.
            </footer>
          </>
        ) : (
          <PanelState status={sync ? "empty" : status} reason={sync ? "The broker sync relation answered for sandbox and returned no account." : unread("broker_account_sync")} />
        )}
      </section>
    ),
    /*
     * The reviewed screen's third slot is "Recently certified", which needs a
     * stage-exit history nothing publishes. Rather than leave the slot empty it
     * carries the findings register — the same question asked of data that does
     * exist: what has this environment turned up. The accessible name matches
     * the visible title, because a screen reader announcing one heading while
     * the page shows another is worse than either name alone.
     */
    recentlyCertified: (
      <section className="exec-af-panel exec-sb-panel" aria-label="Reconciliation findings">
        <header className="exec-sb-head">
          <span className="exec-sb-title">Reconciliation findings — every finding the source published</span>
          <span className="exec-af-spacer" />
          <span className="exec-sb-note">{findings ? `${findings.filter(OPEN_FINDING).length} open of ${findings.length}` : "findings relation"}</span>
        </header>
        {findings && findings.length > 0 ? (
          <>
            <div className="exec-scroll-x">
              <table className="exec-sb-jtable" aria-label="Reconciliation findings">
                <thead>
                  <tr><th>finding</th><th>severity</th><th>status</th><th>account · venue</th><th>raised (UTC)</th><th>resolved (UTC)</th></tr>
                </thead>
                <tbody>
                  {[...findings]
                    .sort((a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0))
                    .map((row) => (
                      <tr key={text(row.finding_id) ?? `${text(row.finding_type)}-${ms(row.created_at)}`}>
                        <td>{text(row.finding_type) ?? "type not published"}</td>
                        <td data-tone={SEVERITY_TONE[(text(row.severity) ?? "").toUpperCase()] ?? "mute"}>{text(row.severity) ?? "not published"}</td>
                        <td>{text(row.status) ?? "not published"}</td>
                        <td className="exec-af-dim">{text(row.account_id) ?? "account not published"} · {text(row.venue) ?? "venue not published"}</td>
                        <td className="exec-af-num">{utcStamp(ms(row.created_at))}</td>
                        <td className="exec-af-num">{ms(row.resolved_at) === null ? <span className="exec-af-dim">open</span> : utcStamp(ms(row.resolved_at))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <footer className="exec-sb-connfoot">
              by type: {tally(findings, "finding_type").map((entry) => `${entry.key} ${entry.n}`).join(" · ")}
              {" — "}certification exits (which deployment left sandbox, and on whose review): {soonReason("N28_STAGE_EXIT_HISTORY_NOT_PUBLISHED") ?? "Soon"}
            </footer>
          </>
        ) : (
          <PanelState status={findings ? "empty" : status} reason={findings ? "The findings relation answered for sandbox and returned none." : unread("reconciliation_findings")} />
        )}
      </section>
    ),
  };
}
