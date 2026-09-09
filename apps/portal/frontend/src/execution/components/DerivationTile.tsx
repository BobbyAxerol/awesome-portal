/**
 * EDS-05 derivation tiles — one grammar for the five `/derivations/*` reads.
 *
 * A derivation is a figure the server computed from current source relations
 * and signed with a formula id, its inputs and their states. The tile shows
 * exactly that: the state chip is the server's, the formula is named, every
 * number is the published string, and the caption lists the input relations
 * with their own state so a PARTIAL never reads as complete. EMPTY and
 * UNAVAILABLE keep their head and caption so the screen does not reflow when a
 * subject has no rows — the absence is the information.
 */
import type { ReactNode } from "react";

import {
  derivationPanelStatus,
  type AlphaActivity,
  type DeploymentQuality,
  type DerivationEnvelope,
  type DerivationState,
  type PortfolioCapital,
  type SourceHealth,
} from "../api/derivations";
import type { PanelStatus } from "../contracts";
import { utcStamp } from "../time";
import { StatusChip, type ChipTone } from "./badges";
import { PanelState } from "./states";

export interface DerivationFact {
  label: string;
  value: string | null;
  note?: string | null;
}

const TONE: Record<DerivationState, ChipTone> = { READY: "good", PARTIAL: "warn", EMPTY: "mute", UNAVAILABLE: "bad", DENIED: "bad", UNKNOWN: "mute" };
const ABSENT = new Set<DerivationState>(["EMPTY", "UNAVAILABLE", "DENIED", "UNKNOWN"]);

function caption<T>(e: DerivationEnvelope<T>, note: string | null): string {
  const parts = [
    `as_of ${e.asOf ? utcStamp(e.asOf) : "not stated"}`,
    `read ${e.readAt ? utcStamp(e.readAt) : "not stated"}`,
    e.freshness ? `freshness ${e.freshness}` : null,
    e.completeness ? `completeness ${e.completeness}` : null,
    e.profileId ? e.profileId : null,
  ].filter((p): p is string => p !== null);
  if (e.inputs.length > 0) {
    parts.push(
      `inputs: ${e.inputs
        .map((i) => `${i.relation.replace(/^manager\./, "")} ${i.state ?? "state not stated"}${i.population !== null ? ` · ${i.population}` : ""}`)
        .join(" ; ")}`,
    );
  }
  if (note) parts.push(note);
  return parts.join(" · ");
}

export function DerivationTile<T>({
  title,
  envelope,
  transport,
  reason,
  facts,
  note = null,
  children,
  ariaLabel,
}: {
  title: string;
  envelope: DerivationEnvelope<T> | null;
  /** The HTTP read's own state; only the server's `state` says what the figures mean. */
  transport: PanelStatus;
  reason?: string | null;
  facts?: readonly DerivationFact[];
  /** A sentence the payload asserts about itself (e.g. "current observation only"). */
  note?: string | null;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const absent = envelope ? ABSENT.has(envelope.state) : true;
  const absentStatus = envelope ? derivationPanelStatus(envelope.state) : "unavailable";
  return (
    <section className="exec-gate-panel exec-deriv" aria-label={ariaLabel ?? title} data-derivation-state={envelope?.state ?? transport}>
      {/* Title is a direct child of the panel so each screen's grammar (exec-a3,
          exec-pf2) restyles it exactly as it does the neighbouring panels. */}
      <div className="exec-tile-title">
        {title}
        <span className="exec-deriv-chips">
          {envelope ? <StatusChip label={envelope.state} tone={TONE[envelope.state]} title={envelope.reasonCode ?? undefined} /> : null}
          {envelope?.formula.id ? (
            <span className="exec-deriv-formula">
              {envelope.formula.id}
              {envelope.formula.version ? ` · ${envelope.formula.version}` : ""}
            </span>
          ) : null}
        </span>
      </div>
      <div className="exec-deriv-body">
        {!envelope ? (
          <PanelState status={transport === "ok" ? "unavailable" : transport} reason={reason ?? undefined} />
        ) : absent && absentStatus !== "ok" ? (
          <PanelState status={absentStatus} reason={envelope.reasonCode ?? reason ?? undefined} />
        ) : (
          <>
            {envelope.state === "PARTIAL" && envelope.reasonCode ? (
              <p className="exec-deriv-unpublished" role="note">
                PARTIAL · {envelope.reasonCode}
              </p>
            ) : null}
            {facts && facts.length > 0 ? (
              <dl className="exec-deriv-facts">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>
                      <span className="exec-num">{f.value ?? "not published"}</span>
                      {f.note ? <span className="exec-blotter-note"> {f.note}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {children}
          </>
        )}
      </div>
      {envelope ? <p className="exec-blotter-note exec-deriv-caption">{caption(envelope, note)}</p> : null}
    </section>
  );
}

/* ── environment boards ──────────────────────────────────────────────── */

/** One environment's read of a derivation, as the container holds it. */
export interface DerivationRead<E extends DerivationEnvelope<unknown>> {
  environment: string;
  value: E | null;
  transport: PanelStatus;
  reason?: string | null;
}

function readChip<E extends DerivationEnvelope<unknown>>(read: DerivationRead<E>) {
  const e = read.value;
  return (
    <StatusChip
      key={read.environment}
      label={`${read.environment} ${e ? e.state : read.transport === "loading" ? "…" : read.transport.toUpperCase()}`}
      tone={e ? TONE[e.state] : read.transport === "loading" ? "mute" : "bad"}
      title={e?.reasonCode ?? read.reason ?? undefined}
    />
  );
}

function readNotes<E extends DerivationEnvelope<unknown>>(reads: readonly DerivationRead<E>[]) {
  return reads
    .filter((r) => !r.value && r.transport !== "loading")
    .map((r) => (
      <p key={r.environment} className="exec-deriv-unpublished" role="note">
        {r.environment}: {r.transport}{r.reason ? ` · ${r.reason}` : ""}
      </p>
    ));
}

function boardCaption<E extends DerivationEnvelope<unknown>>(reads: readonly DerivationRead<E>[], extra: (e: E) => string | null = () => null): string {
  const parts = reads.flatMap((r) => {
    const e = r.value;
    if (!e) return [];
    const bits = [`${r.environment}: read ${e.readAt ? utcStamp(e.readAt) : "not stated"}`];
    if (e.asOf) bits.push(`as_of ${utcStamp(e.asOf)}`);
    if (e.completeness) bits.push(e.completeness);
    const more = extra(e);
    if (more) bits.push(more);
    return [bits.join(" · ")];
  });
  const first = reads.find((r) => r.value)?.value;
  if (first?.formula.id) parts.push(`${first.formula.id}${first.formula.version ? ` ${first.formula.version}` : ""}`);
  return parts.join("  ·  ");
}

/**
 * Source health across the three environments in one panel: a row per
 * profile, an environment chip per read. Three side-by-side panels each
 * carrying a nine-column table did not fit a third of the Command Center.
 */
export function SourceHealthBoard({ reads }: { reads: readonly DerivationRead<SourceHealth>[] }) {
  const rows = reads.flatMap((r) => (r.value?.data.profiles ?? []).map((p) => ({ env: r.environment, p })));
  const worst = reads.some((r) => r.value?.state === "UNAVAILABLE" || (!r.value && r.transport !== "loading")) ? "UNAVAILABLE"
    : reads.some((r) => r.value?.state === "PARTIAL") ? "PARTIAL"
      : reads.every((r) => r.value?.state === "READY") ? "READY" : "PARTIAL";
  return (
    <section className="exec-gate-panel exec-deriv" aria-label="Source health by environment" data-derivation-state={worst}>
      <div className="exec-tile-title">
        Source health
        <span className="exec-deriv-chips">{reads.map(readChip)}</span>
      </div>
      <div className="exec-deriv-body">
        {rows.length > 0 ? (
          <div className="exec-scroll-x">
            <table className="exec-deriv-table">
              <thead>
                <tr>
                  <th scope="col">environment</th>
                  <th scope="col">profile</th>
                  <th scope="col">state</th>
                  <th scope="col">availability</th>
                  <th scope="col">freshness</th>
                  <th scope="col">completeness</th>
                  <th scope="col">as_of (UTC)</th>
                  <th scope="col">projection</th>
                  <th scope="col">replay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ env, p }) => (
                  <tr key={`${env}:${p.profileId}`}>
                    <th scope="row">{env}</th>
                    <td><span className="exec-num">{p.profileId ?? "not stated"}</span></td>
                    <td><StatusChip label={p.state} tone={TONE[p.state]} title={p.reasonCode ?? undefined} /></td>
                    <td>{p.availability ?? "not stated"}</td>
                    <td>{p.freshness ?? "not stated"}</td>
                    <td>{p.completeness ?? "not stated"}</td>
                    <td><span className="exec-num">{p.asOf ? utcStamp(p.asOf) : "not stated"}</span></td>
                    <td><span className="exec-num">{p.projectionSequence !== null ? `seq ${p.projectionSequence}` : "not stated"}</span></td>
                    <td>{p.replayEligible === null ? "not stated" : p.replayEligible ? "eligible" : "not eligible"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : reads.every((r) => r.transport === "loading") ? (
          <PanelState status="loading" />
        ) : null}
        {readNotes(reads)}
      </div>
      {reads.some((r) => r.value) ? <p className="exec-blotter-note exec-deriv-caption">{boardCaption(reads)}</p> : null}
    </section>
  );
}

/**
 * Capital by environment × currency — one row per partition, never a total:
 * the server's currency policy is an exact partition with no FX aggregate,
 * and environments are separate books.
 */
export function PortfolioCapitalBoard({ reads }: { reads: readonly DerivationRead<PortfolioCapital>[] }) {
  const rows = reads.flatMap((r) => {
    const d = r.value?.data;
    if (!d) return [];
    const currencies = Array.from(new Set([...d.allocationByCurrency, ...d.accountBalanceByCurrency].map((b) => b.currency)));
    return currencies.map((currency) => ({
      env: r.environment,
      currency,
      alloc: d.allocationByCurrency.find((b) => b.currency === currency),
      bal: d.accountBalanceByCurrency.find((b) => b.currency === currency),
    }));
  });
  const portfolio = reads.map((r) => r.value?.data.portfolio ?? null).find((p) => p !== null) ?? null;
  const cell = (v: string | null | undefined) => <span className="exec-num">{v ?? "not published"}</span>;
  const worst = reads.some((r) => !r.value && r.transport !== "loading") ? "UNAVAILABLE" : reads.some((r) => r.value?.state === "PARTIAL") ? "PARTIAL" : "READY";
  return (
    <section className="exec-gate-panel exec-deriv" aria-label="Portfolio capital by environment and currency" data-derivation-state={worst}>
      <div className="exec-tile-title">
        Capital by currency
        <span className="exec-deriv-chips">{reads.map(readChip)}</span>
      </div>
      <div className="exec-deriv-body">
        {portfolio ? (
          <dl className="exec-deriv-facts">
            <div><dt>portfolio</dt><dd><span className="exec-num">{portfolio.name ?? "not published"}</span></dd></div>
            <div><dt>base currency</dt><dd><span className="exec-num">{portfolio.baseCurrency ?? "not published"}</span></dd></div>
            <div><dt>state</dt><dd><span className="exec-num">{portfolio.state ?? "not published"}</span></dd></div>
            <div><dt>updated</dt><dd><span className="exec-num">{portfolio.updatedAt ? utcStamp(portfolio.updatedAt) : "not published"}</span></dd></div>
          </dl>
        ) : null}
        {rows.length > 0 ? (
          <div className="exec-scroll-x">
            <table className="exec-deriv-table">
              <caption className="exec-blotter-note">Exact partition by environment and source currency — no FX aggregate, no total row.</caption>
              <thead>
                <tr>
                  <th scope="col">environment</th>
                  <th scope="col">currency</th>
                  <th scope="col">accounts</th>
                  <th scope="col">allocated</th>
                  <th scope="col">max</th>
                  <th scope="col">balance total</th>
                  <th scope="col">free</th>
                  <th scope="col">locked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ env, currency, alloc, bal }) => (
                  <tr key={`${env}:${currency}`}>
                    <th scope="row">{env}</th>
                    <td>{currency}</td>
                    <td>{cell(alloc?.population ?? bal?.population)}</td>
                    <td>{cell(alloc?.values.allocated_capital)}</td>
                    <td>{cell(alloc?.values.max_capital)}</td>
                    <td>{cell(bal?.values.total)}</td>
                    <td>{cell(bal?.values.free)}</td>
                    <td>{cell(bal?.values.locked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : reads.every((r) => r.transport === "loading") ? (
          <PanelState status="loading" />
        ) : null}
        {reads.filter((r) => r.value && r.value.data.allocationByCurrency.length === 0 && r.value.data.accountBalanceByCurrency.length === 0).map((r) => (
          <p key={`${r.environment}-empty`} className="exec-blotter-note">{r.environment}: no currency rows published{r.value?.reasonCode ? ` · ${r.value.reasonCode}` : ""}.</p>
        ))}
        {reads.filter((r) => (r.value?.data.unpublishedInputs.length ?? 0) > 0).map((r) => (
          <p key={`${r.environment}-unpub`} className="exec-deriv-unpublished" role="note">
            {r.environment}: not published by the source: {r.value!.data.unpublishedInputs.join(", ")}
          </p>
        ))}
        {readNotes(reads)}
      </div>
      {reads.some((r) => r.value) ? (
        <p className="exec-blotter-note exec-deriv-caption">
          {boardCaption(reads, (e) => (e.data.currentObservationOnly ? "current observation only" : null))}
        </p>
      ) : null}
    </section>
  );
}

/* ── the five reads ──────────────────────────────────────────────────── */

export function SourceHealthPanel({ health, transport, reason }: { health: SourceHealth | null; transport: PanelStatus; reason?: string | null }) {
  return (
    <DerivationTile title="Source health" envelope={health} transport={transport} reason={reason} ariaLabel="Source health by profile">
      {health && health.data.profiles.length > 0 ? (
        <div className="exec-scroll-x">
          <table className="exec-deriv-table">
            <thead>
              <tr>
                <th scope="col">environment</th>
                <th scope="col">profile</th>
                <th scope="col">state</th>
                <th scope="col">availability</th>
                <th scope="col">freshness</th>
                <th scope="col">completeness</th>
                <th scope="col">as_of (UTC)</th>
                <th scope="col">projection</th>
                <th scope="col">replay</th>
              </tr>
            </thead>
            <tbody>
              {health.data.profiles.map((p) => (
                <tr key={`${p.environment}:${p.profileId}`}>
                  <th scope="row">{p.environment ?? "environment not published"}</th>
                  <td><span className="exec-num">{p.profileId ?? "not stated"}</span></td>
                  <td><StatusChip label={p.state} tone={TONE[p.state]} title={p.reasonCode ?? undefined} /></td>
                  <td>{p.availability ?? "not stated"}</td>
                  <td>{p.freshness ?? "not stated"}</td>
                  <td>{p.completeness ?? "not stated"}</td>
                  <td><span className="exec-num">{p.asOf ? utcStamp(p.asOf) : "not stated"}</span></td>
                  <td><span className="exec-num">{p.projectionSequence !== null ? `seq ${p.projectionSequence}` : "not stated"}</span></td>
                  <td>{p.replayEligible === null ? "not stated" : p.replayEligible ? "eligible" : "not eligible"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : health ? (
        <p className="exec-blotter-note">No profile answered for {health.data.requestedEnvironment ?? "the requested environment"}.</p>
      ) : null}
    </DerivationTile>
  );
}

export function ExecutionQualityTile({ quality, transport, reason }: { quality: DeploymentQuality | null; transport: PanelStatus; reason?: string | null }) {
  const d = quality?.data;
  const facts: DerivationFact[] = d
    ? [
        { label: "sessions", value: d.executionSessionPopulation },
        { label: "orders", value: d.orderPopulation },
        { label: "fills", value: d.fillPopulation },
        { label: "submitted", value: d.submittedCount },
        { label: "filled", value: d.filledCount },
        { label: "risk rejected", value: d.riskRejectedCount },
        { label: "broker rejected", value: d.brokerRejectedCount },
        { label: "rejected", value: d.rejectedCount },
        // Published as a pair; the quotient is a figure the server did not print.
        { label: "reject rate", value: d.rejectRate ? `${d.rejectRate.numerator} / ${d.rejectRate.denominator}` : null, note: d.rejectRate ? "rejected / submitted" : null },
        { label: "latency", value: d.latencyState, note: d.latencyReasonCode },
      ]
    : [];
  return (
    <DerivationTile
      title="Execution quality"
      envelope={quality}
      transport={transport}
      reason={reason}
      facts={facts}
      note={d?.currentObservationOnly ? "current observation only — retained range, not event replay" : null}
      ariaLabel="Execution quality — derived from current sessions, orders and fills"
    />
  );
}

export function PortfolioCapitalTile({ capital, transport, reason }: { capital: PortfolioCapital | null; transport: PanelStatus; reason?: string | null }) {
  const d = capital?.data;
  return (
    <DerivationTile
      title="Capital by currency"
      envelope={capital}
      transport={transport}
      reason={reason}
      facts={d?.portfolio ? [
        { label: "portfolio", value: d.portfolio.name },
        { label: "base currency", value: d.portfolio.baseCurrency },
        { label: "state", value: d.portfolio.state },
        { label: "updated", value: d.portfolio.updatedAt ? utcStamp(d.portfolio.updatedAt) : null },
      ] : []}
      note={[
        d?.currencyPolicy ? `currency policy ${d.currencyPolicy}` : null,
        d?.currentObservationOnly ? "current observation only — retained range, not event replay" : null,
      ].filter(Boolean).join(" · ") || null}
      ariaLabel="Portfolio capital contribution by currency"
    >
      {d ? (
        <div className="exec-scroll-x">
          <table className="exec-deriv-table">
            <caption className="exec-blotter-note">Exact partition by source currency — no FX aggregate, no total row.</caption>
            <thead>
              <tr>
                <th scope="col">currency</th>
                <th scope="col">accounts</th>
                <th scope="col">allocated</th>
                <th scope="col">max</th>
                <th scope="col">balance total</th>
                <th scope="col">free</th>
                <th scope="col">locked</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set([...d.allocationByCurrency, ...d.accountBalanceByCurrency].map((b) => b.currency))).map((currency) => {
                const alloc = d.allocationByCurrency.find((b) => b.currency === currency);
                const bal = d.accountBalanceByCurrency.find((b) => b.currency === currency);
                const cell = (v: string | null | undefined) => <span className="exec-num">{v ?? "not published"}</span>;
                return (
                  <tr key={currency}>
                    <th scope="row">{currency}</th>
                    <td>{cell(alloc?.population ?? bal?.population)}</td>
                    <td>{cell(alloc?.values.allocated_capital)}</td>
                    <td>{cell(alloc?.values.max_capital)}</td>
                    <td>{cell(bal?.values.total)}</td>
                    <td>{cell(bal?.values.free)}</td>
                    <td>{cell(bal?.values.locked)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {d && d.unpublishedInputs.length > 0 ? (
        <p className="exec-deriv-unpublished" role="note">
          not published by the source: {d.unpublishedInputs.join(", ")}
        </p>
      ) : null}
    </DerivationTile>
  );
}

export function AlphaActivityTile({ activity, transport, reason }: { activity: AlphaActivity | null; transport: PanelStatus; reason?: string | null }) {
  const d = activity?.data;
  const facts: DerivationFact[] = d
    ? [
        { label: "strategy", value: d.strategyId },
        { label: "deployments", value: d.deploymentPopulation },
        { label: "sessions", value: d.sessionPopulation },
        { label: "orders", value: d.orderPopulation },
        { label: "fills", value: d.fillPopulation },
        { label: "latest observed", value: d.latestObservedAt ? utcStamp(d.latestObservedAt) : null },
      ]
    : [];
  const counts = (title: string, map: Record<string, string>) =>
    Object.keys(map).length > 0 ? (
      <div>
        <div className="exec-deriv-formula">{title}</div>
        <div className="exec-deriv-counts">
          {Object.entries(map).map(([k, v]) => (
            <StatusChip key={k} label={`${k} ${v}`} tone="mute" />
          ))}
        </div>
      </div>
    ) : null;
  return (
    <DerivationTile
      title="Activity rollup"
      envelope={activity}
      transport={transport}
      reason={reason}
      facts={facts}
      note={d?.retainedInputRangeNotEventReplay ? "retained input range — not event replay" : null}
      ariaLabel="Alpha activity rollup over retained deployments, sessions, orders and fills"
    >
      {d ? counts("deployment states", d.stateCounts) : null}
      {d ? counts("order statuses", d.orderStatusCounts) : null}
    </DerivationTile>
  );
}
