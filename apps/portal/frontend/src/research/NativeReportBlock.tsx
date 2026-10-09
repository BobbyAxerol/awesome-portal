/**
 * Screen 09 · the native report (`frozen_core.native_report`, §55), in the sheet's own grammar (`rr-block`, `rr-table`).
 *
 * A natively searched recipe's Report is the engine's account of one in-sample study and its frozen selection, plus three window analyses
 * — not the scalar Walk-forward report: it has no folds, no certificate and no sampler trace, and says so with the server's reasons.
 * Everything is printed as served. `NATIVE_FIXED` ran no optimizer, so its optimization / freeze / population are null and are said to
 * be absent, never drawn as zero. Fees and funding are the FULL child tape (not the OOS). A window the profile did not execute (Holdout)
 * is `NOT_PUBLISHED` with its reason — not "denied" and not zero.
 */

import { Link } from "react-router-dom";

import { Absence } from "./Absence";
import type { FrozenCoreV2 } from "./reportClient";
import { humanise } from "./humanise";
import { iso } from "./utcMinute";
import { WINDOW_BEHAVIOUR, WINDOW_EXPOSURE, WINDOW_HERO, factText, type FactUnit } from "./windowAnalyticsView";

export type NativeReportData = NonNullable<FrozenCoreV2["native_report"]>;
type Window = NativeReportData["windows"][number];

const ROUTE: Record<string, string> = { intrabar_bracket: "Bracket", reactive: "Reactive", event_driven: "Event-driven" };
const CLOCK: Record<string, string> = { KNOWN_CLOSE_NEXT_BAR_INTRABAR: "known close, executes next bar intrabar", KNOWN_CLOSE_NEXT_BAR_CLOSE: "known close, executes next-bar close" };
const KIND: Record<string, string> = { NATIVE_OPTIMIZED: "Native · optimized — the pinned QuantBT optimizer searched the Alpha's declared parameters", NATIVE_FIXED: "Native · fixed — one execution of the Alpha's declared parameters; no optimizer ran" };
const METHOD = "QuantBT generic robust plateau — not the scalar Walk-forward algorithm";

const ROWS = [...WINDOW_HERO, ...WINDOW_BEHAVIOUR, ...WINDOW_EXPOSURE.map((row) => ({ ...row, unit: "percent" as FactUnit }))];

function Row({ label, children, title, id }: { label: string; children: React.ReactNode; title?: string; id: string }) {
  return (
    <tr data-native-report-fact={id} title={title}>
      <th scope="row" className="rr-t2" style={{ whiteSpace: "nowrap", paddingRight: 12 }}>{label}</th>
      <td className="rr-long" style={{ overflowWrap: "anywhere" }}>{children}</td>
    </tr>
  );
}

const digest = (value: string) => <span title={value} data-digest={value}>{value.slice(0, 16)}…</span>;

function MetricCell({ window, name, unit }: { window: Window; name: string; unit: FactUnit }) {
  const fact = window.analysis?.metrics[name as keyof NonNullable<Window["analysis"]>["metrics"]];
  if (!fact) return <span className="rr-note" data-window-absent={window.availability.state}>—</span>;
  if (fact.state === "AVAILABLE" && fact.value !== null) {
    return <span title={`exact ${fact.value} · ${fact.origin === "ENGINE_DIRECT" ? "engine-direct" : "portal-derived"}`} data-exact={fact.value}>{factText(fact.value, unit) ?? fact.value}</span>;
  }
  return <span data-metric-absent={fact.reason_code ?? fact.state}><Absence reason={fact.reason_code} state={fact.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED"} /></span>;
}

export function NativeReportBlock({ native, searchHref }: { native: NativeReportData; searchHref: string | null }) {
  const kind = native.kind ?? null;
  const execution = native.execution ?? null;
  const optimization = native.optimization ?? native.execution?.optimization ?? null;
  const freeze = native.freeze ?? null;
  const evidence = freeze?.selection_evidence ?? null;
  const analysed = native.windows.filter((window) => window.analysis);
  return (
    <div className="flex flex-col gap-3" data-panel="native-report" data-native-kind={kind ?? "unspecified"}>
      <section className="rr-block rr-keep rr-flush" aria-label="native execution">
        <h2 className="t">Native execution</h2>
        <div className="b">
          <p className="rr-note" style={{ padding: "6px 12px" }} data-native-kind-line>
            {kind === null ? <span title="An older sealed core omits the kind; it is not fetched from another run.">kind not recorded in this sealed report</span> : (KIND[kind] ?? humanise(kind))}
          </p>
          {execution ? (
            <table className="rr-table" data-native-execution>
              <tbody>
                <Row id="route" label="route">{ROUTE[execution.execution_route] ?? humanise(execution.execution_route)} · <span title={execution.input_protocol}>{humanise(execution.input_protocol)}</span></Row>
                <Row id="clock" label="clock">{CLOCK[execution.clock] ?? humanise(execution.clock)}</Row>
                <Row id="authority" label="authority" title={execution.authority}>engine accounting, not a Portal P&amp;L · {execution.replay_authority === "RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS" ? "retained engine audit, not broker events" : humanise(execution.replay_authority)}</Row>
                <Row id="notional" label="position">contract quantity · target notional {execution.target_notional}</Row>
                <Row id="fees" label="fees · full child tape" title={execution.cost_scope}>
                  {execution.fees.state === "AVAILABLE" && execution.fees.total !== null ? <span data-exact={execution.fees.total}>{execution.fees.total}</span> : <Absence reason={execution.fees.reason_code} state="NOT_PUBLISHED" />}
                </Row>
                <Row id="funding" label="funding · full child tape" title={execution.cost_scope}>
                  {execution.funding.state === "AVAILABLE" && execution.funding.total !== null ? <span data-exact={execution.funding.total}>{execution.funding.total}</span> : <Absence reason={execution.funding.reason_code} state="NOT_PUBLISHED" />}
                </Row>
                <Row id="fills" label="fills · orders">{execution.fills_count} · {execution.orders_count === null ? <Absence reason={null} state="NOT_PUBLISHED" /> : execution.orders_count}</Row>
              </tbody>
            </table>
          ) : (
            <p className="rr-note" style={{ padding: "6px 12px" }} data-native-execution-absent>
              <Absence reason="NATIVE_REPORT_EXECUTION_FACTS_NOT_RETAINED" state="NOT_PUBLISHED" />
            </p>
          )}
        </div>
      </section>

      {kind === "NATIVE_FIXED" || (optimization === null && freeze === null && native.population === null) ? (
        <section className="rr-block rr-keep" aria-label="native optimization">
          <h2 className="t">Optimization</h2>
          <div className="b">
            <p className="rr-note" data-native-no-optimizer>
              <Absence reason="NATIVE_FIXED_RECIPE_RAN_NO_OPTIMIZER" state="NOT_APPLICABLE" /> · no trials, selection or population exist for this recipe.
            </p>
          </div>
        </section>
      ) : (
        <>
          {optimization ? (
            <section className="rr-block rr-keep rr-flush" aria-label="native optimization" data-native-optimization-block>
              <h2 className="t">Optimization · searched on the in-sample window</h2>
              <div className="b">
                <table className="rr-table">
                  <tbody>
                    <Row id="method" label="method">pinned QuantBT native optimizer · {METHOD}</Row>
                    <Row id="trials" label="trials">{optimization.requested_trials} requested · {optimization.completed_trials} completed · {optimization.retained_trials} retained · {optimization.distinct_parameter_sets} distinct parameter sets</Row>
                    <Row id="window" label="train window">{iso(optimization.train_start_utc_ms)} → {iso(optimization.train_end_exclusive_utc_ms)} (end excluded) · holdout {optimization.holdout_used ? "used" : "not used"}</Row>
                    <Row id="selected" label="selected" title="The engine's 0-based trial number, not a rank.">trial {optimization.selected_trial_number} · {optimization.objective_name} {optimization.selected_objective}</Row>
                    <Row id="parameters" label="parameters">
                      {Object.entries(optimization.selected_parameters).map(([key, value]) => (
                        <span key={key} className="rr-mono" data-selected-parameter={key} data-exact={value} style={{ marginRight: 10 }}>{key} {value}</span>
                      ))}
                    </Row>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          {freeze ? (
            <section className="rr-block rr-keep rr-flush" aria-label="native freeze" data-native-freeze-block>
              <h2 className="t">Frozen selection</h2>
              <div className="b">
                <table className="rr-table">
                  <tbody>
                    <Row id="trial" label="selected trial" title="The engine's trial number and the display ordinal are two facts.">number {freeze.selected_trial_number} · ordinal {freeze.selected_trial_ordinal} · native in-sample study · objective {freeze.selected_objective}</Row>
                    <Row id="digest" label="parameters digest">{digest(freeze.selected_parameters_digest)} · profile {freeze.execution_profile.id}</Row>
                    {evidence ? <Row id="evidence" label="selection evidence" title="Counts the engine retained; neighbour identities were not retained.">medoid trial {evidence.medoid_trial_number} · plateau score {evidence.plateau_score} · {evidence.neighbor_count} neighbours · seed consensus {evidence.seed_consensus} of {evidence.seed_consensus_count}</Row> : null}
                    <Row id="artifact" label="sealed artifact" title="The P05 artifact manifest; the preparation manifest is a different object.">revision {freeze.artifact.revision} · manifest {digest(freeze.artifact.manifest_digest)} · {freeze.artifact.source_parts.length} source part{freeze.artifact.source_parts.length === 1 ? "" : "s"} · {freeze.artifact.source_parts.reduce((sum, part) => sum + part.rows, 0).toLocaleString("en-US")} rows</Row>
                    <Row id="integrity" label="integrity">
                      <span data-prep-state={freeze.integrity.state}>match at preparation</span> · {iso(freeze.integrity.checked_at_utc_ms)} · bytes not re-read since (<span data-current-bytes-rechecked={String(freeze.integrity.current_bytes_rechecked)}>historic proof</span>)
                    </Row>
                    <Row id="certificate" label="Walk-forward certificate"><Absence reason={freeze.scalar_wfo_certificate.reason_code} state="NOT_APPLICABLE" /></Row>
                    <Row id="chronology" label="freeze chronology"><Absence reason={freeze.chronology.reason_code} state="NOT_PUBLISHED" /></Row>
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="rr-block rr-keep" aria-label="native freeze"><h2 className="t">Frozen selection</h2><div className="b"><p className="rr-note" data-native-freeze-absent><Absence reason="NATIVE_REPORT_FREEZE_NOT_RETAINED" state="NOT_PUBLISHED" /></p></div></section>
          )}
          {native.population ? (
            <section className="rr-block rr-keep" aria-label="native population" data-native-population={native.population.total}>
              <h2 className="t">Trial population</h2>
              <div className="b">
                <p className="rr-note">
                  {native.population.total.toLocaleString("en-US")} complete native evaluations — not the scalar-WFO candidate pool · digest {digest(native.population.digest)} · every trial is read on Search, {humanise(native.population.pagination).toLowerCase()}
                  {searchHref ? (
                    <>
                      {" · "}
                      <Link to={searchHref} data-action="open-native-search" className="no-print" style={{ color: "var(--accent)" }}>S2 Search →</Link>
                    </>
                  ) : null}
                </p>
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="rr-block rr-keep rr-flush" aria-label="native windows" data-native-windows>
        <h2 className="t">Windows · all-time account analysis</h2>
        <div className="b">
          <div className="rr-scroll">
            <table className="rr-table" data-native-windows-table>
              <thead>
                <tr>
                  <th scope="col">metric</th>
                  {native.windows.map((window) => (
                    <th scope="col" key={window.window} data-window-head={window.window} title={window.availability.reason_code ?? undefined}>
                      {window.window === "HOLDOUT" ? "Holdout" : humanise(window.window)}
                    </th>
                  ))}
                </tr>
                <tr data-window-state-row>
                  <th scope="row" className="rr-t2">window</th>
                  {native.windows.map((window) => (
                    <td key={window.window} data-window-state={window.window}>
                      {window.analysis ? (
                        <span title={`${iso(window.analysis.start_utc_ms)} → ${iso(window.analysis.end_exclusive_utc_ms)} (end excluded)`}>{window.analysis.observation_count.toLocaleString("en-US")} observations</span>
                      ) : (
                        <span data-window-absent={window.availability.state} data-reason-code={window.availability.reason_code ?? undefined}>
                          <Absence reason={window.availability.reason_code} state={window.availability.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED"} />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysed.length === 0
                  ? null
                  : ROWS.map((row) => (
                      <tr key={row.key} data-window-metric={row.key}>
                        <th scope="row" className="rr-t2">{row.label}</th>
                        {native.windows.map((window) => (
                          <td key={window.window}>
                            <MetricCell window={window} name={row.key} unit={row.unit} />
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <p className="rr-note" data-native-windows-note>Every window analysis is the engine's retained account, not a Portal P&amp;L; a window the profile did not execute is a typed absence with its reason.</p>
        </div>
      </section>
    </div>
  );
}
