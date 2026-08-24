/**
 * Phase 17 — Account / Broker 360° (hi-fi 1g, WF 1g, ops dark).
 *
 * The screen that answers one question: does what we think we hold match what
 * the broker says we hold, and is there room for the next order. Three columns
 * with three different authorities — EXECUTION for what the cell believes,
 * BROKER for what the venue reports, DERIVED for the difference — because
 * merging them would produce a single number nobody could attribute, on the
 * screen whose entire job is attribution.
 *
 * **The aggregate headroom is not computed here.** The hi-fi says the check is
 * this screen's job, and it is — this is where it is *shown*, and the linked
 * accounts below are the evidence for it. But the verdict itself comes from the
 * server, because it is a fail-closed control: if the browser sums 41,000 and
 * says +2,120 headroom while the execution cell holds 46,800 and refuses every
 * order, the screen has told an operator the opposite of what will happen. A
 * safety verdict has to come from whatever enforces it. `aggregate` is
 * therefore read, and when it is absent the screen says so rather than
 * manufacturing one — see BR-EX-26.
 */
import { Fragment, type ReactNode } from "react";

import type { Envelope, PanelStatus, PromotionStage } from "../contracts";
import type { BindingExposure } from "../analytics";
import { isFullPopulation } from "../analytics";
import { AuthorityBadge, EnvironmentBadge, StatusChip } from "../components/badges";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";

/**
 * How many rows each panel spends before it starts capping.
 *
 * Chosen against the hi-fi's own look rather than a round number: the drawing
 * shows three linked accounts and three syncs, and a panel that renders a dozen
 * still reads the way it was drawn. Past that the representation changes rather
 * than the panel growing, because a side panel scrolling two hundred rows is
 * not the design at a different size, it is a different design.
 *
 * The counts the server reports are what the notice describes — the cap is
 * about what fits on screen, never about what is true.
 */
const LINKED_BUDGET = 12;
const SYNC_BUDGET = 10;
import { ExecutionSurface } from "../ExecutionSurface";

/** One side of the three-column comparison. Values are strings, always. */
export interface StateColumn {
  positions: string | null;
  openOrders: string | null;
  /** `equity` on the internal side, `balance` on the broker's. */
  headline: { label: string; value: string | null; currency: string | null };
  extra?: readonly { label: string; value: string | null }[];
  envelope: Envelope;
  /** Broker column only — the snapshot this column was read from. */
  digest?: string | null;
}

/** How a field compares. `MATCH` is a claim; it is made only by the server. */
export type DiffVerdict = "MATCH" | "DIFFERS" | "UNKNOWN";
export type DiffSeverity = "INFO" | "WARN" | "BREACH";

export interface DiffRow {
  label: string;
  verdict: DiffVerdict;
  /** Server-computed, with the formula version on the column envelope. */
  delta?: string | null;
  note?: string | null;
  severity?: DiffSeverity;
}

export interface LinkedAccount {
  accountId: string;
  alpha: string;
  /** Server-stated. Never summed here. */
  virtualExposure: string;
  stage: PromotionStage;
  /** The account this screen is about, marked rather than filtered out. */
  current?: boolean;
}

/**
 * The server's aggregate check across every account this binding backs.
 *
 * `verdict` is the field that matters. `OK` and `EXCEEDED` are the two states
 * the order path enforces, and `UNKNOWN` is the honest third — a population we
 * could not complete cannot support either claim.
 */
export interface AggregateHeadroom {
  virtualTotal: string;
  physicalTotal: string;
  headroom: string;
  currency: string;
  verdict: "OK" | "EXCEEDED" | "UNKNOWN";
  envelope: Envelope;
}

export interface SyncRow {
  at: string;
  source: string;
  status: "OK" | "STALE" | "FAILED";
  /** `STALE 6.2s` — the lateness, in the server's words. */
  detail?: string | null;
  digest?: string | null;
}

export interface AccountBroker360Props {
  accountId: string;
  alpha: string;
  deployment: string;
  portfolio: string;
  stage: PromotionStage;
  venue: string;
  /** `MARGIN / CROSS · settle USDT · account rev 14` — the identity line. */
  marginMode: string;
  settleCurrency: string;
  accountRevision: string;
  internal: StateColumn;
  broker: StateColumn;
  difference: { rows: readonly DiffRow[]; envelope: Envelope };
  externalAccountRef: string;
  /** The alias only. The secret is never displayed, and never passed in. */
  credentialAlias: string;
  credentialValid: boolean;
  positionMode: string;
  linked: readonly LinkedAccount[];
  /** Read from the server. Null renders as an unavailable verdict, not an OK. */
  aggregate: AggregateHeadroom | null;
  /** Population coverage for the linked list, from the exposure contract. */
  exposure?: BindingExposure | null;
  syncPolicy: string;
  syncHistory: readonly SyncRow[];
  /**
   * How many sync records exist, server-counted.
   *
   * `broker_sync_state_history` is a hypertable — at the five-second policy
   * this screen prints, that is 17,280 rows a day and growing. A cap over an
   * unbounded set implies a population you could have seen all of, so the
   * notice must describe what the server holds, not the array in memory, and
   * the panel must say it is showing a window. BR-EX-28 asks for the keyset
   * page that would make this pageable instead.
   */
  syncTotal?: number | null;
  openFindings: number | null;
  lastDryRun?: { verdict: string; at: string; id: string } | null;
  resolvedFindings?: number | null;
  /** False hides the mutation buttons entirely rather than disabling them. */
  operatorAdmin?: boolean;
  onSyncNow: () => void;
  onDryRun: () => void;
  status?: PanelStatus;
  reason?: string;
}

function Column({ title, column }: { title: string; column: StateColumn }) {
  return (
    <section className="exec-360-col">
      <div className="exec-tile-title">{title}</div>
      <div className="exec-360-colmeta">
        <AuthorityBadge envelope={column.envelope} />
        {column.digest ? <span className="exec-num">digest {column.digest}</span> : null}
      </div>
      <dl className="exec-360-facts">
        <Fact label="positions" value={column.positions} />
        <Fact label="open orders" value={column.openOrders} />
        <Fact
          label={column.headline.label}
          value={
            column.headline.value
              ? `${column.headline.value}${column.headline.currency ? ` ${column.headline.currency}` : ""}`
              : null
          }
        />
        {(column.extra ?? []).map((entry) => (
          <Fact key={entry.label} label={entry.label} value={entry.value} />
        ))}
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value !== null ? (
          <span className="exec-num">{value}</span>
        ) : (
          // Not a zero and not a dash. A figure the source did not report is a
          // gap, and on a reconciliation screen a gap is the finding.
          <span className="exec-gate-unverified">not reported</span>
        )}
      </dd>
    </>
  );
}

const DIFF_TONE: Record<DiffSeverity, "good" | "warn" | "bad"> = {
  INFO: "good",
  WARN: "warn",
  BREACH: "bad",
};

function DifferenceColumn({
  rows,
  envelope,
  action,
}: {
  rows: readonly DiffRow[];
  envelope: Envelope;
  action?: ReactNode;
}) {
  return (
    <section className="exec-360-col">
      <div className="exec-tile-title">Difference</div>
      <div className="exec-360-colmeta">
        <AuthorityBadge envelope={envelope} />
      </div>
      <dl className="exec-360-facts">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.verdict === "MATCH" ? (
                <StatusChip label="MATCH" tone="good" />
              ) : row.verdict === "UNKNOWN" ? (
                // Neither side could be read, so neither MATCH nor a delta can
                // be claimed. Distinct from a delta of zero.
                <span className="exec-gate-unverified">not compared</span>
              ) : (
                <>
                  <span className="exec-num">Δ {row.delta ?? "not stated"}</span>
                  {row.note ? <span className="exec-360-note"> — {row.note}</span> : null}
                  {row.severity ? (
                    <StatusChip label={row.severity} tone={DIFF_TONE[row.severity]} />
                  ) : null}
                </>
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
      {action}
    </section>
  );
}

/**
 * The aggregate banner.
 *
 * Rendered from the server's verdict in all three states, including the one
 * where there is no verdict. An absent aggregate showing nothing would read as
 * "no problem found", which is the reading this control cannot afford.
 */
export function HeadroomBanner({
  aggregate,
  exposure,
}: {
  aggregate: AggregateHeadroom | null;
  exposure?: BindingExposure | null;
}) {
  if (!aggregate) {
    return (
      <PanelState
        status="unavailable"
        reason="The aggregate headroom check has not been published for this binding. It is not computed here: the browser's sum is not what the order path enforces, and a screen that guessed it could tell an operator the opposite of what will happen."
      />
    );
  }
  const partial = exposure ? !isFullPopulation(exposure) : false;
  const tone =
    aggregate.verdict === "EXCEEDED" ? "bad" : aggregate.verdict === "OK" && !partial ? "good" : "warn";
  return (
    <div className="exec-360-headroom" data-tone={tone}>
      <div className="exec-360-headline">
        {aggregate.verdict === "EXCEEDED"
          ? "Aggregate virtual exposure exceeds physical broker headroom"
          : aggregate.verdict === "OK"
            ? "Aggregate virtual exposure is within physical broker headroom"
            : "Aggregate headroom could not be determined"}
      </div>
      <p className="exec-360-headroomline">
        <span className="exec-num">Σ virtual {aggregate.virtualTotal}</span> vs{" "}
        <span className="exec-num">physical {aggregate.physicalTotal}</span> (
        <span className="exec-num">Δ {aggregate.headroom}</span> {aggregate.currency})
      </p>
      {aggregate.verdict === "EXCEEDED" ? (
        <p className="exec-360-note">
          New orders across ALL linked accounts fail closed until allocation is reduced or
          physical margin added. This check lives here — alpha screens never conclude it alone.
        </p>
      ) : null}
      {partial && exposure ? (
        // The count is the claim. 21 of 24 is a sum, not the exposure, and an
        // OK verdict over a partial population is an OK about most of it.
        <p className="exec-360-note">
          Covering {exposure.accountCount ?? "an unstated number of"} of{" "}
          {exposure.expectedAccountCount ?? "an unstated number of"} accounts —
          this is a partial aggregate, not the binding total.
        </p>
      ) : null}
      <AuthorityBadge envelope={aggregate.envelope} />
    </div>
  );
}

export function AccountBroker360({
  accountId,
  alpha,
  deployment,
  portfolio,
  stage,
  venue,
  marginMode,
  settleCurrency,
  accountRevision,
  internal,
  broker,
  difference,
  externalAccountRef,
  credentialAlias,
  credentialValid,
  positionMode,
  linked,
  aggregate,
  exposure = null,
  syncPolicy,
  syncHistory,
  syncTotal = null,
  openFindings,
  lastDryRun = null,
  resolvedFindings = null,
  operatorAdmin = false,
  onSyncNow,
  onDryRun,
  status = "ok",
  reason,
}: AccountBroker360Props) {
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-360">
        <PanelState status={status} reason={reason ?? "This account could not be read."} />
      </ExecutionSurface>
    );
  }
  const live = stage === "LIVE_FULL" || stage === "LIVE_CANARY";

  // The account being viewed always survives the cap — a list of siblings that
  // dropped the one you are looking at is worse than no list. So does any
  // canary, because a canary inside a live binding is the row an operator is
  // checking for.
  const shownLinked = capPreserving(
    linked,
    LINKED_BUDGET,
    (row) => row.current === true || row.stage === "LIVE_CANARY",
    // The population, not the smaller of two readings. If the server says 24
    // accounts exist and handed us three, the notice says 24; if it handed us
    // 214, the population is at least 214 whatever the count field claims.
    Math.max(exposure?.expectedAccountCount ?? 0, linked.length),
  );
  const linkedNotice = capNotice(shownLinked, "linked accounts");

  // Every non-OK sync survives. A history capped to its most recent rows drops
  // the one STALE entry in the window and stops being a history — at a five
  // second policy that window is 17,280 rows a day, so this is the normal case
  // rather than the extreme one.
  const shownSync = capPreserving(
    syncHistory,
    SYNC_BUDGET,
    (row) => row.status !== "OK",
    // The population, when the server states it. Falling back to the array
    // length made the notice describe the page and call it the total.
    syncTotal ?? syncHistory.length,
  );
  const syncNotice = capNotice(shownSync, "syncs");

  return (
    <ExecutionSurface kind="deployments" className="exec-360">
      {/* A solid band, not a tinted panel. A live account is the one state
          where a reader must not have to look for the badge. */}
      {live ? (
        <div className="exec-360-guard" data-stage={stage}>
          LIVE ACCOUNT — commands here move real capital
        </div>
      ) : null}

      <header className="exec-inbox-head">
        <div className="exec-tile-title">{accountId}</div>
        <div className="exec-360-identity">
          <EnvironmentBadge stage={stage} />
          {/* One span per part, separators outside them — the pattern Portfolio
              360° already uses. A single span around the whole sentence wears
              `.exec-num`'s `white-space: nowrap`, which exists to stop a NUMBER
              breaking mid-value; applied to a seven-part identity line it made
              one unbreakable 900px box that scrolled the page sideways at every
              width under about 950px. Each identifier still cannot break,
              because each is its own span. */}
          <span className="exec-num">{alpha}</span> ·{" "}
          <span className="exec-num">{deployment}</span> ·{" "}
          <span className="exec-num">{portfolio}</span> · <span className="exec-num">{venue}</span> ·{" "}
          <span className="exec-num">{marginMode}</span> · settle{" "}
          <span className="exec-num">{settleCurrency}</span> ·{" "}
          <span className="exec-num">{accountRevision}</span>
        </div>
      </header>

      <div className="exec-360-grid3">
        <Column title="Internal virtual state" column={internal} />
        <Column title="Physical broker state" column={broker} />
        <DifferenceColumn
          rows={difference.rows}
          envelope={difference.envelope}
          action={
            operatorAdmin ? (
              <button type="button" className="exec-btn-ghost" onClick={onDryRun}>
                dry-run reconcile →
              </button>
            ) : null
          }
        />
      </div>

      <HeadroomBanner aggregate={aggregate} exposure={exposure} />

      <section className="exec-gate-panel">
        <div className="exec-tile-title">
          Broker binding · external_account_ref {externalAccountRef}
        </div>
        <div className="exec-360-colmeta">
          <span className="exec-num">credential alias {credentialAlias}</span>
          <StatusChip label={credentialValid ? "VALID" : "INVALID"} tone={credentialValid ? "good" : "bad"} />
          {/* Stated on the screen, because a reader who cannot see the secret
              should know that is deliberate rather than a rendering failure. */}
          <span className="exec-360-note">secret never displayed</span>
          <span className="exec-360-note">{positionMode} position mode</span>
        </div>

        <div className="exec-scroll-x">
        <table className="exec-360-linked">
          <caption>
            linked virtual account ({linked.length})
            {exposure && exposure.expectedAccountCount !== null &&
            exposure.expectedAccountCount !== linked.length
              ? ` — of ${exposure.expectedAccountCount} expected`
              : null}
          </caption>
          <thead>
            <tr>
              <th scope="col">account</th>
              <th scope="col">alpha</th>
              <th scope="col">virtual exposure</th>
              <th scope="col">stage</th>
            </tr>
          </thead>
          <tbody>
            {shownLinked.shown.map((row) => (
              <tr key={row.accountId} data-current={row.current ? "true" : undefined}>
                <th scope="row">
                  {row.accountId}
                  {row.current ? <span className="exec-360-note"> (this)</span> : null}
                </th>
                <td>{row.alpha}</td>
                <td>
                  <span className="exec-num">{row.virtualExposure}</span>
                </td>
                <td>
                  <EnvironmentBadge stage={row.stage} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {linkedNotice ? <p className="exec-360-note">{linkedNotice}</p> : null}
        <p className="exec-360-note">
          the aggregate check is this screen&apos;s job — one physical account backs several
          virtual accounts, never assigned per-alpha
        </p>
      </section>

      <div className="exec-grid-2">
        <section className="exec-gate-panel">
          <div className="exec-tile-title">Sync history</div>
          <div className="exec-360-note">policy {syncPolicy}</div>
          <div className="exec-scroll-x">
          <table className="exec-360-sync">
            <caption className="exec-blotter-note">Broker sync history</caption>
            <thead>
              <tr>
                <th scope="col">time (UTC)</th>
                <th scope="col">source</th>
                <th scope="col">status</th>
                <th scope="col">digest</th>
              </tr>
            </thead>
            <tbody>
              {shownSync.shown.map((row) => (
                <tr key={`${row.at}-${row.source}`} data-status={row.status}>
                  <th scope="row">
                    <span className="exec-num">{row.at}</span>
                  </th>
                  <td>{row.source}</td>
                  <td>
                    <StatusChip
                      label={row.detail ? `${row.status} ${row.detail}` : row.status}
                      tone={row.status === "OK" ? "good" : row.status === "STALE" ? "warn" : "bad"}
                    />
                  </td>
                  <td>
                    {row.digest ? (
                      <span className="exec-num">{row.digest}</span>
                    ) : (
                      <span className="exec-gate-unverified">none</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {syncNotice ? <p className="exec-360-note">{syncNotice}</p> : null}
          {syncTotal === null ? (
            // Said, not implied. Without this the ten rows read as the history.
            <p className="exec-360-note">
              A window over an unbounded history — this endpoint publishes no
              total, so the rows below are the most recent plus anything that
              did not succeed, not the whole record.
            </p>
          ) : null}
        </section>

        <section className="exec-gate-panel">
          <div className="exec-tile-title">Reconciliation findings</div>
          <dl className="exec-360-facts">
            <Fact
              label="open findings"
              value={openFindings !== null ? String(openFindings) : null}
            />
            <dt>last dry-run</dt>
            <dd>
              {lastDryRun ? (
                <>
                  <span className="exec-num">{lastDryRun.verdict}</span> ·{" "}
                  <span className="exec-num">{lastDryRun.at}</span> ·{" "}
                  <span className="exec-num">{lastDryRun.id}</span>
                </>
              ) : (
                <span className="exec-gate-unverified">never run</span>
              )}
            </dd>
            <Fact
              label="resolved (30d)"
              value={resolvedFindings !== null ? String(resolvedFindings) : null}
            />
          </dl>
          {/* Hidden, not disabled. A button an actor may never press is a
              question they will keep asking. */}
          {operatorAdmin ? (
            <div className="exec-360-actions">
              <button type="button" className="exec-btn-ghost" onClick={onSyncNow}>
                Sync now
              </button>
              <button type="button" className="exec-btn-ghost" onClick={onDryRun}>
                Dry-run reconcile
              </button>
            </div>
          ) : null}
          <p className="exec-360-note">
            apply-from-broker mutations go through plan → apply → verify (Action Drawer)
          </p>
        </section>
      </div>
    </ExecutionSurface>
  );
}
