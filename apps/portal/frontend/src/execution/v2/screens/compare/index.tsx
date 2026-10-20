/**
 * Compare, portfolios side by side (UXM-07 S2, flag key `compare`,
 * route `/deployments/compare`).
 *
 * Two to four portfolios from the URL param `in` (`ids` is read as an alias).
 * Identity and scalars come from the portfolio list read: name, owner, state,
 * domain, counts and `allocatedByCurrency`, each portfolio in its own currency.
 *
 * What it refuses, and says so:
 * - the overlay (FE-013/033, BE-P4 manager series): the comparable picks (two to four, one basis) are asked for as ONE series
 *   read through the port. ALIGNED draws every series on `axis_ms` exactly as published (no fill, no rebase, no conversion);
 *   INCOMPARABLE lists each subject apart with the mismatch reason (`CURRENCY_MIXED`: different currencies are never converted
 *   or summed); UNAVAILABLE says why per subject (a source that is not published keeps `Not published (FE-013/033)`);
 *   a failed read is "Not available". It still lists who was left out of the basis before the read;
 * - mixing: the basis is the currency and domain of the first portfolio
 *   picked. Another currency, a Simulated book beside a Real-funded one, or a
 *   portfolio whose single allocation figure spans both domains is listed
 *   apart with the reason. Nothing is converted, summed or ranked across them;
 * - a best-in-row mark: it would need a number that is not published.
 *
 * Alphas are the same screen on another kind; their compare needs the
 * multi-subject read, so that choice is off with FE-033.
 *
 * URL: `in` (the picks), `from` (where Back goes: `portfolios`,
 * `portfolio:<id>`, `fleet`), `q` (filter the chips), `window` (shared).
 *
 * | Cell | Value |
 * |---|---|
 * | Cardinality | hi-fi 6 candidates and 3 picks; real 10 to 100 candidates, 2 to 4 picks |
 * | Break point | 100 candidate chips; 4 columns under 660px |
 * | Degradation | candidate chips filtered by `q` and capped at 100; the table stacks as cards at or below 660px; a fifth pick is refused |
 * | Server contract | the list read, plus one series read (`getManagerSeries`, 2 to 4 subjects, ALIGNED / INCOMPARABLE / UNAVAILABLE derived and re-checked by the reader); requested: `IN` filter (FE-033), windowed metrics (FE-005, FE-006, FE-025) |
 * | Invariant | no cross-currency or cross-domain figure, ever; basis caption always printed; unresolved ids named, not dropped |
 * | Perf budget | two reads (the list, one series); at most 100 chips, 4 table columns and 4 x 2000 points |
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { utcStamp } from "../../../time";
import { SectionPanel } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { CompareOverlay, type CompareSeries, type NotComparable } from "../../charts";
import { Flag } from "../../Flag";
import { useContextFacts } from "../../shell/contextFacts";
import { holds, V2_CAPABILITY } from "../../shell/roleNav";
import type { ManagerSeriesMetric, ManagerSeriesQuery } from "../../readers/managerSeries";
import { METRIC_WORD, MISMATCH_SENTENCE, UNAVAILABLE_SENTENCE, chartPointsOf, chartStateOf, chartUnit, commonCaption, isSigned, sourceNotPublished } from "../series/seriesModel";
import { useManagerSeries } from "../series/useManagerSeries";
import { useExecUrlState, withContext } from "../../urlState";
import { PF_FE, npReason, npText } from "../portfolios/fe";
import { Absent, MoneyList, Np, freshnessFlag } from "../portfolios/format";
import { toRows, type PortfolioRow } from "../portfolios/listModel";
import { DEFAULT_ROUTES, type PortfolioRoutes } from "../portfolios/routes";
import { COMPARE_MAX, selectionFrom, withSelection } from "../portfolios/selection";
import { useRead } from "../portfolios/useRead";
import { backTarget, basisOf, resolveSelection, selectionHint, selectionState } from "./model";

import "../../css/portfolios.css";
import "../../css/compare.css";

export const COMPARE_SCREEN_KEY = "compare" as const;

export interface CompareScreenProps {
  api: ExecutionApi;
  /** A portfolio to start from (the 360's "Compare with"); used only while the URL names no pick. */
  portfolioId?: string;
  /** The session's capability list; without `execution.portfolios.read` the screen is the denial. */
  capabilities?: ReadonlySet<string>;
  routes?: PortfolioRoutes;
}

const CHIP_CAP = 100;
const TONES = ["series", "series-2", "series-3", "series-4"] as const;
const GLYPHS = ["circle", "square", "diamond", "triangle"] as const;
const SEARCH_DEBOUNCE_MS = 300;

/** The basis' domain in words. Only a published domain is named; the basis never takes an unknown one. */
const domainWord = (domain: PortfolioRow["domain"] | null): string =>
  domain === "simulated" ? "Simulated" : domain === "mixed" ? "Real-funded and Simulated" : "Real-funded";

interface MetricRow { id: string; label: string; cell(row: PortfolioRow): ReactNode }

/** The hi-fi order: the measures first (each says which request publishes it), then what the list read does publish. */
const METRICS: readonly MetricRow[] = [
  { id: "nav", label: "NAV", cell: () => <Np fact={PF_FE.nav} /> },
  { id: "pnl", label: "Net PnL", cell: () => <Np fact={PF_FE.netPnl} /> },
  { id: "ret", label: "Return", cell: () => <Np fact={PF_FE.ret} /> },
  { id: "dd", label: "Max drawdown", cell: () => <Np fact={PF_FE.drawdown} /> },
  { id: "score", label: "Score", cell: () => <Np fact={PF_FE.score} /> },
  { id: "currency", label: "Base currency", cell: (r) => r.baseCurrency },
  { id: "owner", label: "Owner", cell: (r) => r.owner ?? <Absent reason="owner not published" /> },
  { id: "state", label: "State", cell: (r) => <Flag kind={r.stateKind} label={r.stateLabel} size="sm" /> },
  { id: "domain", label: "Domain", cell: (r) => r.domainLabel },
  { id: "allocations", label: "Allocations", cell: (r) => String(r.allocationCount) },
  { id: "deployments", label: "Deployments", cell: (r) => String(r.deploymentCount) },
  { id: "allocated", label: "Allocated capital", cell: (r) => <MoneyList entries={r.allocated} empty={<Absent reason="no allocation published" />} /> },
];

export default function CompareScreen({ api, portfolioId, capabilities, routes = DEFAULT_ROUTES }: CompareScreenProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const reasonId = useId();
  const partsId = useId();
  const permitted = capabilities === undefined || holds(capabilities, { allOf: [V2_CAPABILITY.portfoliosRead] });
  const read = useRead(api, permitted, "list", (scoped) => scoped.listPortfolios());
  const envelope = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;

  const { q, window: windowLabel, from } = url.value;
  const picked = selectionFrom(params);
  const all = useMemo(() => (envelope ? toRows(envelope.items) : []), [envelope]);
  const { rows: chosen, unresolved } = useMemo(() => resolveSelection(all, picked.ids), [all, picked.ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const basis = useMemo(() => basisOf(chosen), [chosen]);
  // The bar shows the basis currency the screen computes in, and none when there is none (a `ccy` left in the URL is not this screen's).
  useContextFacts({ ccy: basis.currency });
  const kindWanted = params.get("kind");

  // FE-013/033: the comparable picks (two to four, one basis) are asked for as one series read through the port.
  const [measure, setMeasure] = useState<ManagerSeriesMetric>("NAV");
  const comparableIds = useMemo(() => basis.comparable.map((row) => row.portfolioId), [basis]);
  const seriesQuery = useMemo<ManagerSeriesQuery | null>(
    () => (comparableIds.length < 2 ? null : { environment: url.value.env, metric: measure, window: url.value.window, subjects: comparableIds.map((subjectId) => ({ subjectType: "PORTFOLIO" as const, subjectId })) }),
    [comparableIds, measure, url.value.env, url.value.window],
  );
  const seriesRead = useManagerSeries(api, permitted && seriesQuery !== null, seriesQuery);

  // The 360 hands over one id. It becomes the first pick once, as a replace.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || portfolioId === undefined || picked.ids.length > 0) return;
    seeded.current = true;
    setParams(withSelection(params, [portfolioId]), { replace: true });
  }, [portfolioId, picked.ids.length, params, setParams]);

  const setPicks = (ids: readonly string[]) => setParams(withSelection(params, ids.slice(0, COMPARE_MAX)), { replace: true });
  const toggle = (id: string) => setPicks(picked.ids.includes(id) ? picked.ids.filter((x) => x !== id) : [...picked.ids, id]);

  const [partsOpen, setPartsOpen] = useState(false);
  const [text, setText] = useState(q ?? "");
  const setUrl = useRef(url.set);
  setUrl.current = url.set;
  useEffect(() => setText(q ?? ""), [q]);
  useEffect(() => {
    const next = text.trim() === "" ? null : text.trim();
    if (next === q) return;
    const timer = setTimeout(() => setUrl.current({ q: next }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);

  if (!permitted) {
    return (
      <div className="exec-cmpr-v2" data-screen="compare-v2">
        <header className="exec-pf-head"><h1 className="exec-pf-h1">Compare</h1></header>
        <section className="exec-pf-denied" aria-label="Access">
          <PanelState status="denied" reason="Your session does not hold execution.portfolios.read." />
          <Link to={routes.access}>See what you can access</Link>
        </section>
      </div>
    );
  }

  const state = selectionState(picked.ids.length);
  const hint = selectionHint(state);
  const needle = q?.trim().toLowerCase() ?? "";
  const candidates = all.filter((row) => needle === "" || [row.label, row.portfolioId, row.owner ?? ""].some((part) => part.toLowerCase().includes(needle)));
  const chips = candidates.slice(0, CHIP_CAP);
  const repeats = new Set(all.filter((row) => row.key !== row.portfolioId).map((row) => row.key));
  const back = backTarget(from);
  const backHref = back.kind === "portfolio" ? routes.portfolio(back.portfolioId) : back.kind === "fleet" ? routes.fleet : routes.list;
  const backLabel = back.kind === "portfolio" ? "Back to Portfolio" : back.kind === "fleet" ? "Back to Alpha Fleet" : "Back to Portfolios";
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const toneOf = (id: string) => picked.ids.indexOf(id);

  const apart: NotComparable[] = [
    ...basis.apart.map(({ row, reason }) => ({ id: row.portfolioId, label: row.label, reason })),
    ...unresolved.map((id) => ({ id, label: id, reason: "Not in the loaded portfolios" })),
  ];
  const partsSummary = [
    basis.currency === null ? (chosen.length === 0 && unresolved.length === 0 ? "Nothing picked" : "No comparable basis") : `${basis.currency} · ${domainWord(basis.domain)} basis`,
    apart.length > 0 ? `${apart.length} listed apart` : null,
    "Money is never converted or combined",
  ].filter((part): part is string => part !== null).join(" · ");
  const series = seriesRead.phase === "ready" ? seriesRead.value : seriesRead.phase === "loading" || seriesRead.phase === "error" ? seriesRead.last : null;
  const labelOf = (id: string): string => chosen.find((r) => r.portfolioId === id)?.label ?? id;
  const comparison = series?.comparison ?? null;
  // The overlay, by what the server said. Nothing is rebased, filled, converted or combined here.
  const entryNotes: NotComparable[] = series === null ? [] : series.series.map((entry) => ({
    id: entry.subject.subjectId,
    label: labelOf(entry.subject.subjectId),
    reason: entry.state === "UNAVAILABLE"
      ? `${UNAVAILABLE_SENTENCE[entry.reasonCode]} (${entry.reasonCode})`
      : `${entry.currency ?? `ratio, scale ${entry.ratioScale ?? "not stated"}`} · basis ${entry.basis} · methodology ${entry.methodologyRef} · ${entry.partition.economicDomain.toLowerCase()} book, ${entry.partition.nativeProfileRef}${entry.state === "EMPTY" ? " · no points in this window" : ""}`,
  }));
  const noBasisText = basis.currency === null ? "No comparable portfolio picked yet" : "No aligned series: the common basis is not established";
  const overlay: { series: CompareSeries[]; notComparable: NotComparable[]; state: Parameters<typeof CompareOverlay>[0]["state"]; basis: string; unit: Parameters<typeof CompareOverlay>[0]["unit"]; currency?: string } = (() => {
    const none = (copy: string, reason: string, notComparable: NotComparable[] = apart) => ({ series: [], notComparable, state: { kind: "unavailable" as const, copy, reason }, basis: noBasisText, unit: "pct" as const });
    if (seriesQuery === null) return none("Pick two comparable portfolios", "Aligned series need two to four portfolios on one basis. Nothing is rebased or worked out here.");
    if (series === null || comparison === null) return none("Not available", `The series could not be read${seriesRead.phase === "error" ? ` (${seriesRead.reason})` : ""}. Nothing is rebased or worked out here.`);
    if (comparison.state === "ALIGNED") {
      const drawn = series.series.flatMap((entry) => (entry.state === "AVAILABLE" ? [{ entry, id: entry.subject.subjectId }] : []));
      const states = drawn.map(({ entry }) => chartStateOf(entry));
      const worst = states.find((st) => st.kind !== "ready") ?? { kind: "ready" as const };
      return {
        series: drawn.map(({ entry, id }) => ({ id, label: labelOf(id), points: chartPointsOf(entry) })),
        notComparable: apart,
        state: worst,
        basis: commonCaption(series.metric, comparison),
        unit: chartUnit(drawn[0]!.entry),
        currency: comparison.common.currency ?? undefined,
      };
    }
    if (comparison.state === "INCOMPARABLE") {
      return none("Not comparable", `${MISMATCH_SENTENCE[comparison.reasonCode]} (${comparison.reasonCode}). Each series is listed apart; none is converted, rebased or combined.`, [...entryNotes, ...apart]);
    }
    const missing = series.series.find((entry) => entry.state === "UNAVAILABLE");
    return none(
      // FE-013: a return whose source states no scale is a request id too (the source has not published what a return needs).
      sourceNotPublished(series) || (missing !== undefined && missing.state === "UNAVAILABLE" && missing.reasonCode === "RATIO_SCALE_NOT_PUBLISHED") ? "Not published (FE-013/033)" : "Not available",
      missing !== undefined && missing.state === "UNAVAILABLE"
        ? `At least one pick has no series: ${UNAVAILABLE_SENTENCE[missing.reasonCode]} (${missing.reasonCode}). Nothing is drawn from the rest.`
        : "At least one pick has no points in this window, so the picks are not aligned. Nothing is drawn from the rest.",
      [...entryNotes, ...apart],
    );
  })();
  const basisText = overlay.basis;

  const tableColumns: CardsColumn<MetricRow>[] = [
    { key: "metric", label: "Metric", render: (m) => m.label },
    ...chosen.map<CardsColumn<MetricRow>>((row) => {
      const tone = Math.max(0, toneOf(row.portfolioId));
      // K-B5: the column head wears the series swatch of its chip (shape as well as colour), and the figures sit right.
      return { key: row.portfolioId, label: row.label, numeric: true, head: <i className="exec-cmpr-sw" data-tone={TONES[tone]} data-glyph={GLYPHS[tone]} />, render: (m) => m.cell(row) };
    }),
  ];

  return (
    <div className="exec-cmpr-v2" data-screen="compare-v2">
      <header className="exec-pf-head">
        <div>
          <h1 className="exec-pf-h1">Compare</h1>
          <p className="exec-pf-sub">2 to 4 · one currency · one domain · identity, scalars and aligned series</p>
        </div>
        <div className="exec-pf-ctrls">
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {envelope ? <span className="exec-pf-dim">{envelope.sourceAsOf ? `As of ${utcStamp(envelope.sourceAsOf)}` : "Source time not published"}</span> : null}
          <Link to={withContext(backHref, params)}>{backLabel}</Link>
        </div>
      </header>

      {read.phase === "loading" && envelope === null ? <PanelState status="loading" /> : null}
      {read.phase === "error" ? <PanelState status={read.status} reason={read.reason} /> : null}

      {envelope ? (
        <>
          <section className="exec-pf-panel" aria-label="Choose portfolios">
            <div className="exec-pf-tool">
              <span className="exec-pf-seg" role="group" aria-label="Compare">
                <button type="button" className="exec-pf-segbtn" aria-pressed="true">Portfolios</button>
                <button type="button" className="exec-pf-segbtn" aria-pressed="false" disabled title={npReason(PF_FE.compareSeries, "Comparing alphas needs the multi-subject read.")} aria-describedby={reasonId}>Alphas</button>
              </span>
              <label className="exec-pf-field">
                <span className="exec-pf-sr">Filter portfolios</span>
                <input className="exec-pf-input" type="search" placeholder="Filter portfolios" value={text} onChange={(event) => setText(event.target.value)} />
              </label>
              <span className="exec-pf-dim">Window {windowLabel}</span>
            </div>
            <p id={reasonId} className="exec-pf-sr">Alphas: {npText(PF_FE.compareSeries)}</p>
            {kindWanted !== null && kindWanted !== "portfolio" && kindWanted !== "pf" ? (
              <p className="exec-pf-banner" role="status">Comparing alphas is {npText(PF_FE.compareSeries)}. Showing portfolios.</p>
            ) : null}
            <div className="exec-cmpr-pick" role="group" aria-label="Portfolios to compare">
              {chips.map((row) => {
                // A list that repeats an id has two rows for it, but a pick is an id: the first row stands for it, the repeat is refused, so no chip looks picked that the table does not show.
                const repeat = repeats.has(row.key);
                const tone = repeat ? -1 : toneOf(row.portfolioId);
                const on = tone >= 0;
                const blocked = repeat || !row.comparable || (!on && state.kind === "full");
                const why = repeat ? "Same id as an earlier portfolio in the read; the first one is used" : !row.comparable ? row.notComparableReason : !on && state.kind === "full" ? `At most ${COMPARE_MAX}` : null;
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="exec-cmpr-chip"
                    data-tone={on ? TONES[tone] : undefined}
                    aria-pressed={on}
                    disabled={blocked}
                    title={why ?? undefined}
                    onClick={() => toggle(row.portfolioId)}
                  >
                    <i className="exec-cmpr-sw" data-glyph={on ? GLYPHS[tone] : undefined} aria-hidden="true" />
                    {row.label}
                    <small>
                      {row.baseCurrency}
                      {!row.comparable ? " · not comparable" : basis.currency !== null && !on && row.baseCurrency !== basis.currency ? " · other currency" : ""}
                    </small>
                  </button>
                );
              })}
              {candidates.length > chips.length ? <span className="exec-pf-note">Showing {chips.length} of {candidates.length} portfolios. Filter to see the rest.</span> : null}
              {envelope.truncated ? <span className="exec-pf-note">The portfolio read is the top {all.length} / {envelope.totalPortfolios}; the rest cannot be chosen yet.</span> : null}
            </div>
            <p className="exec-pf-note" role="status">{hint}</p>
            {picked.dropped > 0 ? <p className="exec-pf-note">{picked.dropped} entries in the address were not used: not a clean id, a repeat, or past the fourth.</p> : null}
          </section>

          <SectionPanel
            title="Series"
            aside={
              <>
                <button
                  type="button"
                  className="exec-cmpr-sum"
                  aria-expanded={partsOpen}
                  aria-controls={partsId}
                  data-excluded={apart.length > 0 ? "true" : undefined}
                  onClick={() => setPartsOpen((open) => !open)}
                >
                  {partsSummary}
                  {/* Constant name; aria-expanded carries the state and the glyph is CSS alt-text-empty, so it never enters the name. */}
                  <span className="exec-cmpr-sum-more">Partitions</span>
                </button>
                <span className="exec-pf-seg" role="group" aria-label="Series measure">
                  {(["NAV", "NET_PNL", "RETURN"] as const).map((metric) => (
                    <button key={metric} type="button" className="exec-pf-segbtn" aria-pressed={measure === metric} onClick={() => setMeasure(metric)}>
                      {METRIC_WORD[metric]}
                    </button>
                  ))}
                </span>
                {comparison?.state === "ALIGNED" ? <Flag kind="neutral" label="Published series" size="sm" /> : null}
              </>
            }
          >
            <div id={partsId} className="exec-cmpr-parts" role="group" hidden={!partsOpen} aria-label="Partitions">
              {chosen.length === 0 && unresolved.length === 0 ? (
                <p className="exec-pf-note">Nothing is picked, so there is nothing to partition.</p>
              ) : (
                <>
                  <p className="exec-pf-note" data-testid="basis-line">
                    {basis.currency === null ? "No comparable portfolio picked yet." : `Basis: ${basis.currency}, ${domainWord(basis.domain)}, set by the first portfolio picked.`}
                  </p>
                  <ul className="exec-pf-list" aria-label="Partitions">
                    {basis.partitions.map((part) => (
                      <li key={part.key} data-testid="partition">
                        <strong>{part.currency} · {part.domainLabel}</strong>
                        <span className="exec-pf-dim"> · {part.ids.map((id) => chosen.find((r) => r.portfolioId === id)?.label ?? id).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                  {apart.length > 0 ? (
                    <p className="exec-pf-note" data-testid="refusal">
                      {apart.length === 1 ? "One pick is" : `${apart.length} picks are`} listed apart and left out of the basis, never converted or added to it. The reason is beside each name below.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {seriesQuery !== null && seriesRead.phase === "loading" && series === null ? (
              <PanelSkeleton label="Loading the series" />
            ) : (
              <CompareOverlay
                label="Comparison"
                series={overlay.series}
                notComparable={overlay.notComparable}
                basis={basisText}
                unit={overlay.unit}
                currency={overlay.currency}
                signed={isSigned(measure)}
                state={overlay.state}
              />
            )}
            <p className="exec-pf-note" data-testid="basis-caption">Basis: {basisText}</p>
          </SectionPanel>

          <SectionPanel title="Metrics" aside="Identity and published scalars">
            {chosen.length === 0 ? (
              <p className="exec-pf-note">Pick portfolios above to see their identity and allocation side by side.</p>
            ) : (
              <CardsTable label="Metrics" columns={tableColumns} rows={METRICS} rowKey={(m) => m.id} />
            )}
          </SectionPanel>
        </>
      ) : null}
    </div>
  );
}
