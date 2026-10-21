/**
 * Overview, the Command Center (UXM-07 S2, flag key `overview`).
 *
 * Triage first, fleet second, on the V2 anatomy: a KPI strip, the performance
 * and capital blocks, what needs attention, the digest and the contributors.
 *
 * What the Manager has published is shown; what it has not is a sentence with
 * its request ids, in the place the figure will go, so the structure of the
 * page is already the final one:
 *
 * - NAV (FE-013): the fund's published NAV series through `getManagerSeries` (BE-P4). AVAILABLE draws the line and the KPI is
 *   its latest point, exact, with the methodology and window; EMPTY says "No points in this window"; UNAVAILABLE prints the
 *   typed reason (a source that is not published keeps `Not published (FE-005/006/013/025)`). Nothing is computed here;
 * - windowed Net PnL, Return and Drawdown: Not published (FE-005/006/013/025);
 * - the capital block (Initial, Added, Returned, NAV, budget): Not published (FE-017);
 * - "Since your last visit": Not published (FE-024);
 * - Contributors: Not published (FE-025).
 *
 * Published here: the ranked triage list, its counts with their exactness,
 * operations awaiting acknowledgement, stage counts, the Command Centre fleet
 * cells, today's items, source health, and the CURRENT allocation, exposure and
 * open-position PnL per currency from the Fleet register summary (one row per
 * currency, never added across currencies, never called a window).
 *
 * A caller whose session holds no fund-wide read capability gets "Your alphas":
 * the same Fleet read (the server scopes it) and nothing fund-wide. Which
 * fields a researcher may see is undecided (FE-026), so nothing researcher
 * specific is added beyond that.
 *
 * Scale and degradation (evidence/UXM07/README.md 2b):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | triage list limit 10 of up to hundreds; 50 alphas read; a few currencies | 200 rows in the DOM | the server ranks and truncates ("10 of ~214 seen"); alphas capped at 50 with the total named | `command-center.triage-rank.v1`, Fleet page limit 50 and its summary | counts keep `~` and "at least"; null is never 0; no sum across currencies | three reads per 15 s tick; no per-row requests |
 *
 * No URL state beyond the shared context params. Links carry them (`withContext`).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useSession } from "../../../../auth/session";
import type { ExecutionApi } from "../../../api/ports";
import { streamGate } from "../../../commandCenter";
import { ID_ROUTES } from "../../../idLinks";
import { canonicalHref } from "../../../links";
import { PanelSkeleton, PanelState } from "../../../components/states";
import type { SseFactory } from "../../../sse";
import { NaWhy, GapWhy, NotAvailableLine, SectionPanel, gapTitle, type UnavailableFact } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { profileLabel } from "../../profileLabel";
import { useContextFacts } from "../../shell/contextFacts";
import { holds, V2_CAPABILITY } from "../../shell/roleNav";
import { isInternalPath, useExecUrlState, withContext } from "../../urlState";
import {
  FE_MONEY, KIND_FLAG, currencyFacts, fleetCellGroups, humanize, modeOf,
  needsAttention, openIncidents, ownRows, stageCounts, streamSentence, todayRows, triageRows, type CurrencyFact, type OwnRow,
} from "./overviewModel";
import type { ManagerSeriesQuery } from "../../readers/managerSeries";
import { ManagerSeriesPanel } from "../series/ManagerSeriesPanel";
import { isDescribed, latestPoint, seriesValueText, UNAVAILABLE_SENTENCE } from "../series/seriesModel";
import { useManagerSeries, type SeriesReadState } from "../series/useManagerSeries";
import { MeasureSeg, type FundMeasure } from "./MeasureSeg";
import { useOverviewReads } from "./useOverviewReads";

import "../../css/blocks.css";
import "../../css/overview.css";
import { formatInstant } from "../../boundary";

export const OVERVIEW_SCREEN_KEY = "overview" as const;

export interface OverviewScreenProps {
  api: ExecutionApi;
  workspaceId?: string;
  /** The session's capabilities when the caller already holds them; otherwise read from the session. */
  capabilities?: ReadonlySet<string>;
  /** Injected so a test can prove nothing connects; `undefined` uses the browser's EventSource when it exists. */
  sseFactory?: SseFactory | null;
  /** Where "My access" lives. A denied read links there; without it a denied panel offers nothing to follow. */
  accessHref?: string;
}

/** `Not published`, the request ids in the tooltip and in hidden text. Blocks' table does not carry these composites yet. */
function Gap({ ids, children }: { ids: string; children?: string }) {
  return (
    <span className="exec-blk-np">
      <GapWhy className="exec-blk-np-word" gap={ids} text="Not published" name="Not published, reason" rows={[gapTitle(ids)]} />
      <span className="exec-blk-sr"> ({ids})</span>
      {children ? <> {children}</> : null}
    </span>
  );
}

/** Facts the Manager has not published, said once on one line (the ids stay in its title). */
const NO_WINDOW = "Windowed; needs the window (FE-025)";
const UNPUBLISHED_FUND: readonly UnavailableFact[] = [
  { label: "Net PnL", id: "FE-005", why: NO_WINDOW },
  { label: "Return", id: "FE-006", why: NO_WINDOW },
  { label: "Drawdown", id: "FE-013", why: "Needs a NAV series (FE-025)" },
  { label: "Capital", id: "FE-017", why: "Initial, added, returned funds, NAV and budget used" },
  { label: "Since your last visit", id: "FE-024" },
  { label: "Contributors", id: "FE-025", why: "Per-alpha contribution over a window" },
];

/**
 * The NAV cell: the latest point of the fund's published NAV series, exactly as sent, with when it is from and the
 * methodology. No point is `No points in this window`; a series that is not published (or a read that has not answered) keeps
 * the request ids; any other typed reason is printed with its code. Never a derived or defaulted number.
 */
function NavCell({ read, window }: { read: SeriesReadState; window: string }) {
  const series = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
  const entry = series?.series[0];
  if (series === null || entry === undefined || (entry.state === "UNAVAILABLE" && entry.reasonCode === "SERIES_SOURCE_NOT_PUBLISHED")) {
    return <Cell label="NAV"><Gap ids={FE_MONEY} /></Cell>;
  }
  if (entry.state === "UNAVAILABLE") {
    return <Cell label="NAV" note={<><span>Series unavailable</span><GapWhy name="Why the series is unavailable" rows={[`${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode})`]} next={null} /></>}><span className="exec-ov-na">Not available</span></Cell>;
  }
  if (!isDescribed(entry)) return null;
  const last = latestPoint(entry);
  if (last === null) return <Cell label="NAV" note={<span title={`Methodology ${entry.methodologyRef}, window ${window}`}>Window {window}</span>}><span className="exec-ov-na">No points in this window</span></Cell>;
  const shown = seriesValueText(entry, last.exact);
  return (
    <Cell label="NAV" note={<span title={`Latest published point, ${formatInstant(last.tsMs)} · methodology ${entry.methodologyRef} · window ${window}`}>As of {formatInstant(last.tsMs)}</span>}>
      <span className="exec-ov-num" title={last.exact}>{shown}</span>
    </Cell>
  );
}

function Cell({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="exec-blk-kpi">
      <dt className="exec-blk-kpi-label">{label}</dt>
      <dd className="exec-blk-kpi-body">
        <span className="exec-blk-kpi-value">{children}</span>
        {note ? <span className="exec-blk-kpi-note">{note}</span> : null}
      </dd>
    </div>
  );
}

/** `signed` is for a P&L column only: allocation and exposure are sizes, and a green size reads as a gain. */
function MoneyCell({ value, signed = false }: { value: CurrencyFact["allocation"]; signed?: boolean }) {
  if (value === null) return <span className="exec-ov-na">Not available</span>;
  return <span className="exec-ov-num" title={value.full} data-tone={signed && value.tone !== "neutral" ? value.tone : undefined}>{value.display}</span>;
}

const STATE_FLAG: Record<string, { kind: FlagKind; label: string }> = {
  busy: { kind: "attention", label: "Busy" },
  quiet: { kind: "ok", label: "Quiet" },
  degraded: { kind: "partial", label: "Degraded" },
  unknown: { kind: "unknown", label: "State not stated" },
};

function freshnessFlag(state: string | null): { kind: FlagKind; label: string } {
  switch ((state ?? "").toUpperCase()) {
    case "OK": return { kind: "ok", label: "Fresh" };
    case "AGING": return { kind: "pending", label: "Aging" };
    case "STALE": return { kind: "stale", label: "Stale" };
    case "PAUSED": return { kind: "paused", label: "Paused" };
    default: return { kind: "unknown", label: "Freshness not stated" };
  }
}

/** The one thing to do about a read that was refused: see what the session may open (D9). */
function deniedActions(status: string, accessHref: string | undefined, to: (href: string) => string): ReactNode {
  return status === "denied" && accessHref ? <Link className="exec-ov-link" to={to(accessHref)}>See what you can access</Link> : undefined;
}

export default function OverviewScreen({ api, workspaceId, capabilities, sseFactory, accessHref }: OverviewScreenProps) {
  const { access } = useSession();
  const [params] = useSearchParams();

  const caps = capabilities ?? (access.kind === "ready" ? new Set(access.access.capabilities) : null);
  // Unknown access reads as fund-wide: every read is scoped by the server anyway, and a block that
  // says "Not published" costs nothing. A READY session without any fund-wide read gets "Your alphas".
  const fundWide = caps === null || holds(caps, { anyOf: [V2_CAPABILITY.portfoliosRead, V2_CAPABILITY.accountsRead, V2_CAPABILITY.operationsRead] });
  const reads = useOverviewReads(api, workspaceId, sseFactory, fundWide);
  // FE-013: the fund's NAV series for the URL's environment and window, through the port. One read on open and on Refresh
  // (the series is a current-only snapshot; it does not ride the 15 s composition tick).
  const url = useExecUrlState();
  const [seriesNonce, setSeriesNonce] = useState(0);
  const navQuery = useMemo<ManagerSeriesQuery>(
    () => ({ environment: url.value.env, metric: "NAV", window: url.value.window, subjects: [{ subjectType: "FUND" }], ...(workspaceId ? { workspaceId } : {}) }),
    [url.value.env, url.value.window, workspaceId],
  );
  const nav = useManagerSeries(api, fundWide, navQuery, seriesNonce);
  // Net PnL and Return are enabled only when the series port SERVES the fund (its source is published, from the last good NAV
  // read, so a refresh does not blink the switch); otherwise the measure stays NAV and the switch says why it is off.
  const navBody = nav.phase === "ready" ? nav.value : nav.phase === "loading" || nav.phase === "error" ? nav.last : null;
  const serves = navBody !== null && navBody.seriesSource.state === "PUBLISHED";
  const [measure, setMeasure] = useState<FundMeasure>("NAV");
  const metric = serves ? measure : "NAV";
  const measureQuery = useMemo<ManagerSeriesQuery>(() => ({ ...navQuery, metric: metric === "NAV" ? "NET_PNL" : metric }), [navQuery, metric]);
  const measureRead = useManagerSeries(api, fundWide && metric !== "NAV", measureQuery, seriesNonce);
  const refresh = () => { reads.reload(); setSeriesNonce((n) => n + 1); };
  // Same fact as the heading below: only a READY session without any fund-wide read is narrowed; unknown access states nothing.
  useContextFacts({ scope: fundWide ? undefined : "Scope: Your alphas" });

  const { snapshot } = reads;
  const fleet = reads.fleet.phase === "ready" ? reads.fleet.value : null;
  const facts = useMemo(() => currencyFacts(fleet?.summary ?? null), [fleet]);
  const stages = useMemo(() => stageCounts(fleet?.summary ?? null), [fleet]);
  const triage = useMemo(() => triageRows(snapshot?.needsYou ?? null, formatInstant, reads.composition.phase === "ready" ? reads.composition.value.readAt : null), [snapshot, reads.composition]);
  const own = useMemo(() => ownRows(fleet?.items ?? []), [fleet]);
  const gate = streamGate(snapshot);
  const live = reads.stream.live;

  /* ── page-level states ─────────────────────────────────────────────── */
  const heading = fundWide ? "Overview" : "Your alphas";
  if (reads.composition.phase === "loading" && fundWide) {
    return (
      <div className="exec-ov-v2" data-screen="overview-v2">
        <h1 className="exec-ov-title">{heading}</h1>
        <PanelSkeleton label="Loading the overview" />
      </div>
    );
  }
  if (reads.composition.phase === "error" && fundWide) {
    return (
      <div className="exec-ov-v2" data-screen="overview-v2">
        <h1 className="exec-ov-title">{heading}</h1>
        <PanelState
          status={reads.composition.status}
          reason={reads.composition.reason}
          actions={<>{deniedActions(reads.composition.status, accessHref, (href) => withContext(href, params))}<button type="button" className="exec-ov-btn" onClick={reads.reload}>Try again</button></>}
        />
      </div>
    );
  }
  if (reads.snapshotUnreadable && fundWide) {
    return (
      <div className="exec-ov-v2" data-screen="overview-v2">
        <h1 className="exec-ov-title">{heading}</h1>
        <PanelState status="unavailable" reason="The command-center snapshot could not be read." actions={<button type="button" className="exec-ov-btn" onClick={reads.reload}>Try again</button>} />
      </div>
    );
  }

  const composition = reads.composition.phase === "ready" ? reads.composition.value : null;
  const stale = reads.composition.phase === "ready" ? reads.composition.stale : null;
  const needs = snapshot?.needsYou ?? null;
  const mode = modeOf(needs, snapshot?.mode ?? null);
  const incidents = openIncidents(needs);
  const attention = needsAttention(needs);
  const flag = STATE_FLAG[mode]!;
  const streamNote = fundWide && live === null
    ? (gate.allowed ? `${reads.stream.reason} Not connected; values are as read.` : "No live stream is published for this profile. Values are as read; Refresh re-reads them.")
    : null;
  const fresh = freshnessFlag(needs?.freshness ?? null);
  const operations = reads.operations.phase === "ready" ? reads.operations.value : null;
  const unacknowledged = operations !== null && operations !== "unsupported" ? operations.page.filteredCount : null;
  const { deployments: cells, issues } = fleetCellGroups(snapshot?.fleet ?? null);
  const today = todayRows(snapshot?.today ?? null);
  const ctx = (href: string) => withContext(canonicalHref(href) ?? href, params);
  // A href the server published is data, not ours: anything that is not an app path (absolute URL, scheme,
  // protocol-relative, control characters) is dropped and its row renders as plain text, never as a link.
  const serverTo = (href: string): string | null => {
    const target = canonicalHref(href) ?? href;
    return isInternalPath(target) ? withContext(target, params) : null;
  };
  const NOT_AN_APP_LINK = "The link published for this item is not a path inside this app, so it is not offered";

  const ownColumns: readonly CardsColumn<OwnRow>[] = [
    { key: "alpha", label: "Alpha", render: (r) => <span className="exec-ov-what"><Link className="exec-ov-what-title exec-ov-link" to={ctx(ID_ROUTES.alpha(r.alphaId))}>{r.label}</Link><span className="exec-ov-sub">{r.version}</span></span> },
    { key: "stage", label: "Stage", render: (r) => r.stages.map((s) => humanize(s)).join(", ") },
    { key: "allocation", label: "Allocation (current)", numeric: true, render: (r) => (r.allocations.length === 0 ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-lines">{r.allocations.map((a) => <span key={a.currency}><MoneyCell value={a.decimal} /> <small className="exec-blk-unit">{a.currency}</small></span>)}</span>) },
    { key: "pnl", label: "Open-position PnL (current)", numeric: true, render: (r) => (r.pnl.length === 0 ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-lines">{r.pnl.map((a) => <span key={a.currency}><MoneyCell value={a.decimal} /> <small className="exec-blk-unit">{a.currency}</small></span>)}</span>) },
    { key: "health", label: "Health", render: (r) => humanize(r.health) },
  ];

  const currencyColumns: readonly CardsColumn<CurrencyFact>[] = [
    { key: "ccy", label: "Currency", render: (r) => r.currency },
    { key: "allocation", label: "Allocation", numeric: true, render: (r) => <MoneyCell value={r.allocation} /> },
    { key: "exposure", label: "Exposure", numeric: true, render: (r) => <MoneyCell value={r.exposure} /> },
    { key: "pnl", label: "Open-position PnL, net", numeric: true, render: (r) => <MoneyCell value={r.netPositionPnl} signed /> },
  ];

  const needsPanel = (
    <SectionPanel title="Needs attention" aside={needs ? `${needs.counts.limit !== null ? `top ${needs.counts.limit}, ` : ""}${attention.text ?? "not counted"}` : undefined} flush>
    {needs === null || needs.state === "unavailable" ? (
      <PanelState status="unavailable" reason={needs?.state === "unavailable" ? "The triage sources did not answer." : "The snapshot carries no triage panel."} />
    ) : mode === "quiet" || (triage.length === 0 && needs.state === "empty") ? (
      <div className="exec-ov-quiet">
        <p className="exec-ov-what-title">Nothing needs you.</p>
        <p className="exec-ov-sub">Quiet as of {snapshot?.readAt ? formatInstant(snapshot.readAt) : "a time the server did not publish"}</p>
      </div>
    ) : (
      <>
        {needs.state === "partial" || needs.state === "stale" ? <p className="exec-ov-banner" role="status"><Flag kind={needs.state === "stale" ? "stale" : "partial"} label={needs.state === "stale" ? "Stale" : "Partial"} size="sm" /> <span>The list may be missing items</span><GapWhy name="Why the list may be missing items" rows={["Some triage sources did not answer"]} next={null} /></p> : null}
        <ol className="exec-ov-items" aria-label="Ranked triage list">
          {triage.map((r) => (
            <li key={r.id} className="exec-ov-item" data-sla={r.slaState ?? undefined}>
              <div className="exec-ov-item-t">
                <span className="exec-ov-item-what">
                  <span className="exec-ov-item-rank" title={r.rank === null ? "Not ranked" : `Rank ${r.rank}`}>{r.rank === null ? "Not ranked" : r.rank}</span>
                  {r.kind ? <Flag kind={KIND_FLAG[r.kind].kind} label={KIND_FLAG[r.kind].label} size="sm" /> : <Flag kind="unknown" label="Kind not stated" size="sm" />}
                  <span className="exec-ov-what-title">{r.title}</span>
                </span>
                {r.href ? (serverTo(r.href) !== null ? <Link className="exec-ov-link" to={serverTo(r.href)!}>{r.actionLabel}</Link> : <NaWhy className="exec-ov-na" text="No link published" reason={NOT_AN_APP_LINK} />) : <NaWhy className="exec-ov-na" text="No link published" reason="The owning screen for this item was not published" />}
              </div>
              {r.summary ? <div className="exec-ov-sub">{r.summary}</div> : null}
              <div className="exec-ov-sub exec-ov-item-sla" title={r.sla}>{r.slaShort}</div>
            </li>
          ))}
        </ol>
        {needs.counts.truncated !== false ? <p className="exec-ov-note"><Link className="exec-ov-link" to={ctx("/execution/operations")} title={`${attention.text ?? "More"} in total; the rest are ranked behind these`}>All in Operations</Link></p> : null}
      </>
    )}
  </SectionPanel>
  );

  return (
    <div className="exec-ov-v2" data-screen="overview-v2">
      <header className="exec-ov-head">
        <div>
          <h1 className="exec-ov-title">{snapshot?.actorName && fundWide ? `Overview, ${snapshot.actorName}` : heading}</h1>
        </div>
        <div className="exec-ov-chips">
          {fundWide ? <Flag kind={flag.kind} label={mode === "busy" ? `Busy, ${needs?.items.length ?? 0} ranked` : flag.label} size="sm" /> : null}
          {fundWide && fresh.kind !== "ok" ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          <span className="exec-ov-meta" title={streamNote ?? undefined}>{composition?.readAt ? `Read ${formatInstant(composition.readAt)}` : "Read time not published"}{streamNote ? " · Not live" : ""}</span>
          <button type="button" className="exec-ov-btn" onClick={refresh}>Refresh</button>
        </div>
      </header>

      {fundWide && live !== null ? (
        <p className="exec-ov-stream" role="status" data-stream={live.phase} data-tone={streamSentence(live).tone}>
          {streamSentence(live).text}
        </p>
      ) : null}

      {stale ? <div className="exec-ov-banner" role="status"><Flag kind="stale" label="Stale" size="sm" /><span>Showing the last good read</span><GapWhy name="Why the read is stale" rows={[`The last refresh failed (${stale}).`]} next={null} /></div> : null}
      {fundWide && composition && composition.sourceHealth.profiles.some((p) => (p.state ?? "").toUpperCase() !== "AVAILABLE") ? (
        <div className="exec-ov-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /><span>Some figures may be incomplete</span><GapWhy name="Where to look" rows={["See Source health below"]} next={null} /></div>
      ) : null}
      {snapshot && snapshot.warnings.length > 0 ? (
        <ul className="exec-ov-warnings" role="status">
          {snapshot.warnings.map((w) => <li key={w.code}><b>{w.code}</b> {w.message}</li>)}
        </ul>
      ) : null}

      {fundWide ? (
        <>
          <dl className="exec-blk-kpis exec-ov-kpis" aria-label="Fund figures" style={{ "--exec-kpi-n": 3 } as CSSProperties}>
            <NavCell read={nav} window={url.value.window} />
            <Cell label="Open incidents" note={<Link className="exec-ov-link" to={ctx("/execution/operations")} title="Incidents in the ranked list">Operations</Link>}>
              {incidents.value === null ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-kpi">{incidents.atLeast ? (incidents.value === 0 ? "None seen" : `at least ${incidents.value}`) : incidents.value}</span>}
            </Cell>
            <Cell
              label="Needs attention"
              note={reads.operations.phase === "loading" ? "Awaiting acknowledgement: reading" : unacknowledged === null ? "Awaiting acknowledgement: not available" : <>Awaiting acknowledgement: <b className="exec-ov-num">{unacknowledged}</b></>}
            >
              {attention.text === null ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-kpi">{attention.text}</span>}
            </Cell>
          </dl>

          <NotAvailableLine facts={UNPUBLISHED_FUND} className="exec-ov-na-line" />

          <div className="exec-ov-grid2 exec-ov-top">
            <SectionPanel title="Performance" lead={<MeasureSeg serves={serves} selected={metric} onSelect={setMeasure} />}>
              <ManagerSeriesPanel label={metric === "NAV" ? "Fund performance" : `Fund ${metric === "NET_PNL" ? "Net PnL" : "Return"}`} read={metric === "NAV" ? nav : measureRead} gapCopy={`Not published (${FE_MONEY})`} tools />
            </SectionPanel>
            {needsPanel}
          </div>
        </>
      ) : (
        <dl className="exec-blk-kpis exec-ov-kpis" aria-label="Your figures" style={{ "--exec-kpi-n": 3 } as CSSProperties}>
          <Cell label="Alphas" note="In your slice">
            {fleet ? <span className="exec-ov-kpi">{fleet.summary ? fleet.summary.alphaCount : fleet.totalCount}</span> : <span className="exec-ov-na">Not available</span>}
          </Cell>
          <Cell label="Allocation" note="Current">
            {facts.length === 0 ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-kpi">{facts.length} {facts.length === 1 ? "currency" : "currencies"}</span>}
          </Cell>
        </dl>
      )}

      <SectionPanel title="Current by currency" flush>
        {reads.fleet.phase === "loading" ? (
          <PanelSkeleton label="Loading the fleet register" />
        ) : reads.fleet.phase === "error" ? (
          <PanelState status={reads.fleet.status} reason={reads.fleet.reason} actions={deniedActions(reads.fleet.status, accessHref, ctx)} />
        ) : facts.length === 0 ? (
          <PanelState status="empty" reason={fleet?.summary ? "The fleet summary lists no currency." : "The fleet read carried no summary, so no allocation or exposure is shown."} />
        ) : (
          <CardsTable columns={currencyColumns} rows={facts} rowKey={(r) => r.currency} label="Current allocation and exposure by currency" />
        )}
      </SectionPanel>

      {fundWide ? null : (
        <SectionPanel
          title="Alphas in your slice"
          aside={<>{fleet ? `${own.length} of ${fleet.totalCount} ` : null}<Link className="exec-ov-link" to={ctx("/deployments/alphas")}>Alpha Fleet</Link></>}
          flush
        >
          {reads.fleet.phase === "ready" ? (
            <>
              <CardsTable columns={ownColumns} rows={own} rowKey={(r) => r.alphaId} label="Your alphas" empty={<PanelState status="empty" reason="No alpha is in your slice." />} />
              <NotAvailableLine facts={[UNPUBLISHED_FUND[0]!, { label: "Researcher field policy", id: "FE-026", why: "Undecided; only the server's own scoping applies" }]} className="exec-ov-na-line" />
            </>
          ) : reads.fleet.phase === "loading" ? <PanelSkeleton label="Loading your alphas" /> : <PanelState status={reads.fleet.status} reason={reads.fleet.reason} actions={deniedActions(reads.fleet.status, accessHref, ctx)} />}
        </SectionPanel>
      )}

      {fundWide ? (
        <div className="exec-ov-grid2">
          <SectionPanel title="Fleet by stage">
            {stages.length === 0 && cells.length === 0 && issues.length === 0 ? (
              <PanelState status={snapshot?.fleet?.state === "unavailable" ? "unavailable" : "empty"} reason="No stage counts are published." />
            ) : (
              <>
                {stages.length > 0 ? (
                  <>
                    <p className="exec-ov-cells-cap" id="exec-ov-cap-alphas" title="Count of alphas, from the Fleet summary. An alpha in two stages is counted in each. Alphas and deployments are different units from different reads, so the rows are not expected to match.">Alphas by stage</p>
                    <ul className="exec-ov-cells" aria-labelledby="exec-ov-cap-alphas">
                      {stages.map((s) => <li key={s.stage}><span className="exec-ov-cell-label">{s.label}</span>{s.count === null ? <span className="exec-ov-na">Not available</span> : <span className="exec-ov-kpi">{s.count}</span>}</li>)}
                    </ul>
                  </>
                ) : null}
                {cells.length > 0 ? (
                  <>
                    <p className="exec-ov-cells-cap" id="exec-ov-cap-deployments" title="Count of deployments, from the Command Centre snapshot. One alpha can have several deployments.">Deployments by state</p>
                    <ul className="exec-ov-cells" aria-labelledby="exec-ov-cap-deployments">
                      {cells.map((c) => (
                        <li key={c.label}>
                          <span className="exec-ov-cell-label">{c.label}</span>
                          {c.value === null ? <span className="exec-ov-na">Not available</span> : c.href && serverTo(c.href) !== null ? <Link className="exec-ov-kpi exec-ov-link" to={serverTo(c.href)!}>{c.value}</Link> : <span className="exec-ov-kpi">{c.value}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {issues.length > 0 ? (
                  <>
                    <p className="exec-ov-cells-cap" id="exec-ov-cap-issues" title="Issues, not deployments">Open issues</p>
                    <ul className="exec-ov-cells" aria-labelledby="exec-ov-cap-issues">
                      {issues.map((c) => (
                        <li key={c.label}>
                          <span className="exec-ov-cell-label">{c.label}</span>
                          {c.value === null ? <span className="exec-ov-na">Not available</span> : c.href && serverTo(c.href) !== null ? <Link className="exec-ov-kpi exec-ov-link" to={serverTo(c.href)!}>{c.value}</Link> : <span className="exec-ov-kpi">{c.value}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {snapshot?.fleet ? <p className="exec-ov-note" title="Counts only; amounts live on the 360 screens">Deployments: {snapshot.fleet.totalDeployments === null ? "not counted" : `${snapshot.fleet.exactTotal ? "" : "~"}${snapshot.fleet.totalDeployments}`}</p> : null}
              </>
            )}
          </SectionPanel>
          <SectionPanel title="Today" aside={snapshot?.today && snapshot.today.state !== "ok" ? snapshot.today.state : undefined}>
            {today.length === 0 ? (
              <p className="exec-ov-na">{snapshot?.today ? "Nothing is scheduled for today." : "No schedule was published."}</p>
            ) : (
              <ul className="exec-ov-list">
                {today.map((item) => (
                  <li key={item.id}>
                    <span className="exec-ov-sub">{item.kind ? humanize(item.kind) : "Kind not published"}</span>{" "}
                    {item.href && (item.kind === "CONDITION_EXPIRY" || serverTo(item.href) !== null) ? <Link className="exec-ov-link" to={item.kind === "CONDITION_EXPIRY" ? ctx("/governance/waivers") : serverTo(item.href)!}>{item.label}</Link> : item.label}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        </div>
      ) : null}

      {fundWide && composition ? (
        <SectionPanel title="Source health">
          {composition.sourceHealth.profiles.length === 0 ? (
            <p className="exec-ov-na">No profile published</p>
          ) : (
            <ul className="exec-ov-list" aria-label="Source health by profile">
              {composition.sourceHealth.profiles.map((p) => (
                <li key={p.profile}>
                  <Flag kind={(p.state ?? "").toUpperCase() === "AVAILABLE" ? "ok" : (p.state ?? "").toUpperCase() === "PARTIAL" ? "partial" : "unknown"} label={p.state ? humanize(p.state) : "State not stated"} size="sm" />{" "}
                  <span>{profileLabel(p.profile)}</span>{p.reasonCode ? <GapWhy name={`Reason code for ${profileLabel(p.profile)}`} rows={[p.reasonCode]} next={null} /> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      ) : null}
    </div>
  );
}
