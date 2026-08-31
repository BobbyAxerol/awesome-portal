/**
 * Incident Detail (HiFi 4d) on the V2 anatomy — the respond loop's workspace.
 *
 * One incident = finding + operations taken + what closed it. The current
 * containment and the next action are pinned in the rail; the state rail is
 * forward-only and audited; resolution never resumes a deployment. The
 * decision (Acknowledge / Mark RESOLVED) lives in the sticky bar with the
 * gate's blocker codes as its reasons.
 */
import { utcStamp } from "../time";
import type { ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { SparkLine } from "../components/marketChart";
import { PanelState } from "../components/states";
import { ExecutionWorkspace, shortDigest } from "../components/workspace";
import type { PanelStatus } from "../contracts";
import { blockerText, incidentRail, type IncidentCollection, type IncidentDetail as Incident } from "../operations";
import { hhmm, incidentSparkSeries, mmss } from "../clock";
import type { GateRow, IncidentDemo, IncidentLive, OpRow } from "../incident.smoke";

const PANEL_TITLE: Record<string, string> = {
  findings: "Findings",
  alerts: "Alerts",
  dead_letters: "Dead letters",
  trace_order: "Order trace",
};

function CountNote({ collection, noun }: { collection: IncidentCollection<unknown>; noun: string }) {
  const { totalCount, returnedCount, truncated } = collection;
  if (totalCount === null) return <p className="exec-inc-note exec-role-meta">{noun} count not published.</p>;
  return (
    <p className="exec-inc-note exec-role-meta">
      {truncated ? `showing ${returnedCount ?? collection.rows.length} of ${totalCount} ${noun} — the rest were not sent` : `${totalCount} ${noun}`}
    </p>
  );
}

/** Hi-fi WF 4d panel: hairline on raised paper, 10/14 header (mono 11 uppercase), optional footer note. */
function Panel({ title, label, meta, footer, children, className }: { title: string; label: string; meta?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`exec-inc2-panel${className ? ` ${className}` : ""}`} aria-label={label}>
      <header className="exec-inc2-panelhead">
        <span className="exec-inc2-paneltitle">{title}</span>
        {meta ? <><span className="exec-inc2-spacer" /><span className="exec-inc2-panelmeta">{meta}</span></> : null}
      </header>
      <div className="exec-inc2-panelbody">{children}</div>
      {footer ? <footer className="exec-inc2-panelfoot">{footer}</footer> : null}
    </section>
  );
}

function OpLine({ op }: { op: OpRow }) {
  return (
    <span className="exec-inc2-op">
      <span className="exec-inc2-dim">{utcStamp(op.at)}</span> <a href={`/administration/actions?operation=${encodeURIComponent(op.id)}`}>{op.id}</a> {op.command}{" "}
      <span className="exec-inc2-status" data-status={op.status}>{op.status}</span>
      {op.note ? <> — {op.note}</> : null}
    </span>
  );
}

function GateLine({ g }: { g: GateRow }) {
  const glyph = g.state === "done" ? "✓" : g.state === "open" ? "✗" : "—";
  return (
    <span className="exec-inc2-gate" data-state={g.state}>
      {glyph} {g.text}{g.link ? <> <a href={g.link.href}>{g.link.label}</a></> : null}
    </span>
  );
}

export function IncidentDetailScreen({
  incident,
  status = "ok",
  reason,
  onResolve,
  onAcknowledge,
  onOpenOperation,
  conflict,
  trail,
  children,
  demo,
  demoLive,
}: {
  incident: Incident | null;
  status?: PanelStatus;
  reason?: string;
  onResolve?: () => void;
  onAcknowledge?: () => void;
  onOpenOperation: (operationId: string) => void;
  conflict?: boolean;
  trail?: ReactNode;
  children?: ReactNode;
  /** Lab-injected demo bundle + its motion; product routes pass neither. */
  demo?: IncidentDemo | null;
  demoLive?: IncidentLive;
}) {
  const smoke = demo ?? null;
  const resolved = incident?.workflowState === "RESOLVED";
  const live: IncidentLive = demoLive ?? { openSeconds: 0, price: 0, prev: 0, spark: [] };
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-inc">
        <PanelState status={status} reason={reason} />
      </ExecutionSurface>
    );
  }
  if (!incident) {
    return (
      <ExecutionSurface kind="deployments" className="exec-inc">
        <PanelState status="loading" reason="Loading the incident." />
      </ExecutionSurface>
    );
  }
  const rail = incidentRail(incident.workflowState);
  const gate = incident.resolutionGate;
  const isAdmin = incident.actorRoles.includes("ADMIN");
  const gatesRows = smoke ? (resolved ? smoke.resolved.gates : smoke.gates) : [];
  const gatesDone = gatesRows.filter((g) => g.state === "done").length;
  const gateCount = smoke ? `${gatesDone}/${gatesRows.length}` : gate ? (gate.eligible ? "OPEN" : `${gate.blockerCodes.length} blocked`) : "—";
  const opsRows = smoke ? (resolved ? smoke.resolved.ops : smoke.ops) : [];
  const budget = smoke?.resolveBudgetSeconds ?? 0;
  const left = Math.max(0, budget - live.openSeconds);
  const up = live.price >= live.prev;
  const priceText = live.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deltaValue = smoke ? (Number(smoke.deltaQty) * live.price).toLocaleString("en-US", { style: "currency", currency: "USD" }) : null;
  const decisionReasons: string[] = [];
  if (!isAdmin) decisionReasons.push("Incident actions are available to Admin operators only.");
  if (conflict) decisionReasons.push("This incident changed while you were looking at it. Reload and review before deciding.");
  return (
    <ExecutionSurface kind="deployments" className="exec-inc exec-inc2" data-hifi-exact="incident-4d">
      <ExecutionWorkspace layout="dense">
        <div className="exec-inc2-page">
          {/* Masthead — hi-fi: chip · h1 300/22 with grey subject · state chip · opened meta */}
          <header className="exec-inc2-masthead">
            <span className="exec-inc2-kind">INCIDENT</span>
            <h1 className="exec-inc2-h1">
              {incident.incidentId}{" "}
              <span className="exec-inc2-subject">
                —{" "}
                {smoke?.subjectLink && smoke.subject.includes(smoke.subjectLink.label) ? (
                  <>
                    {smoke.subject.split(smoke.subjectLink.label)[0]}
                    <a href={smoke.subjectLink.href}>{smoke.subjectLink.label}</a>
                    {smoke.subject.split(smoke.subjectLink.label)[1]}
                  </>
                ) : (
                  smoke?.subject ?? incident.title
                )}
              </span>
            </h1>
            {resolved ? (
              <span className="exec-inc2-state" data-tone="good">RESOLVED</span>
            ) : (
              <span className="exec-inc2-state" data-tone="bad">{incident.workflowState ?? "STATE NOT STATED"} · {incident.severity ?? "severity not stated"}</span>
            )}
            {conflict ? <span className="exec-inc2-state" data-tone="bad">CHANGED — reload</span> : null}
            <span className="exec-inc2-spacer" />
            <span className="exec-inc2-meta">
              {smoke ? `opened ${smoke.openedAt} · owner ${smoke.owner} · ${smoke.origin} · ${smoke.slaAck}` : `${incident.target.id ?? "target not stated"}${incident.assignedTo ? ` · owner ${incident.assignedTo}` : " · no assignee"}`}
            </span>
          </header>

          {/* State strip — forward-only; clock + resolve budget */}
          {rail.length > 0 ? (
            <div className="exec-inc2-strip">
              <ol className="exec-inc-rail" aria-label="Incident state">
                {rail.map((step, i) => (
                  <li key={step.state} data-done={step.done} data-current={step.current}>
                    {i > 0 ? <span className="exec-inc2-arrow" aria-hidden="true">→</span> : null}
                    <span className="exec-inc2-step">
                      {step.state}
                      {step.state === "MITIGATED" && (incident.mitigatedAt || smoke) ? " — exposure frozen ✓" : null}
                      {resolved && step.state === "RESOLVED" && smoke ? ` — ${smoke.resolved.resolvedAt}` : null}
                    </span>
                  </li>
                ))}
              </ol>
              {smoke ? (
                <>
                  <span className="exec-inc2-clock">
                    open for <b data-tone={resolved ? "good" : "bad"}>{resolved ? `${smoke.resolved.resolvedIn} (final)` : mmss(live.openSeconds)}</b>
                  </span>
                  <span className="exec-inc2-dim">· resolve budget 4h — <span className="exec-inc2-tab">{resolved ? "closed in budget" : `${hhmm(left)} left`}</span></span>
                  <span className="exec-inc2-budget" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={left} aria-label="resolve budget left">
                    <span className="exec-inc2-budgetfill" data-tone={resolved ? "good" : "warn"} style={{ width: `${resolved ? 100 : Math.round((left / Math.max(budget, 1)) * 100)}%` }} />
                  </span>
                </>
              ) : null}
              <span className="exec-inc2-spacer" />
              <span className="exec-inc2-dim">forward-only · each transition audited</span>
            </div>
          ) : (
            <PanelState status="unavailable" reason="This incident's workflow state is not one this screen recognises, so no rail is drawn. A plausible-looking rail over an unknown state would be a fabrication." />
          )}

          {/* Market band — live while you fix */}
          {smoke ? (
            <div className="exec-inc2-market" data-tone={resolved ? "good" : "bad"} aria-label="Market — live while you fix">
              <span className="exec-inc2-marketlabel"><span className="exec-inc2-livedot" aria-hidden="true" />Market — live while you fix</span>
              <span className="exec-inc2-price">
                {smoke.symbol} <b data-tone={resolved ? "mute" : up ? "good" : "bad"}>{priceText}</b> <span data-tone={resolved ? "mute" : up ? "good" : "bad"}>{up ? "▲" : "▼"}</span>
              </span>
              <SparkLine points={incidentSparkSeries(live.spark)} tone="accent" height={36} width="100%" />
              <span className="exec-inc2-delta">unreconciled Δ {smoke.deltaQty} {smoke.deltaUnit} ≈ <b>{deltaValue}</b></span>
              <span className="exec-inc2-marketnote" data-tone={resolved ? "good" : undefined}>
                {resolved ? `resolved in ${smoke.resolved.resolvedIn} — Δ converged to broker before re-pricing exceeded tolerance` : "the market does not wait — the unreconciled Δ re-prices every tick while orders stay fail-closed"}
              </span>
            </div>
          ) : null}
          {conflict ? <p className="exec-inc-conflict exec-inc2-dim" role="alert">This incident changed while you were looking at it. Reload and review before deciding.</p> : null}

          <div className="exec-inc2-grid">
            <Panel title="Evidence" label="Evidence" footer={smoke?.evidenceFooter}>
              {smoke ? (
                <dl className="exec-inc2-facts">
                  {smoke.evidence.map((e) => (
                    <div key={e.label}>
                      <dt>{e.label}</dt>
                      <dd data-emphasis={e.emphasis}>
                        {e.link ? <><a href={e.link.href}>{e.link.label}</a> </> : null}
                        {e.emphasis === "bad" ? (
                          <>{e.value.split("MISMATCH")[0]}<b className="exec-inc2-bad">MISMATCH</b>{e.value.split("MISMATCH")[1]}</>
                        ) : e.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <dl className="exec-inc2-facts exec-inc2-refs">
                {incident.evidence.rows.map((e) => (
                  <div key={e.evidenceId}>
                    <dt>{e.label ?? e.evidenceId}</dt>
                    <dd><code>{e.hash ? shortDigest(e.hash) : "hash not stated"}</code> <span className="exec-inc2-dim">{e.addedAt ?? ""}</span></dd>
                  </div>
                ))}
              </dl>
              <CountNote collection={incident.evidence} noun="references" />
              <div className="exec-inc2-sources" aria-label="Source panels" title="The Trading System publishes no route for these sources, so the Portal has nothing to show. This is missing evidence, not an absence of findings.">
                {incident.sourcePanels.map((panel) => (
                  <span className="exec-inc2-source" key={panel.panelId} aria-label={PANEL_TITLE[panel.panelId] ?? panel.panelId} data-state={panel.panelState}>
                    {PANEL_TITLE[panel.panelId] ?? panel.panelId} <b>{panel.panelState}</b>
                    {panel.panelState !== "ok" ? <span className="sr-only"> — the Trading System publishes no route for this source; this is missing evidence, not an absence of findings</span> : null}
                  </span>
                ))}
                {incident.sourcePanels.some((p) => p.panelState !== "ok") ? <span className="exec-inc2-dim">sources unavailable — missing evidence, not an absence of findings</span> : null}
              </div>
              <span className="exec-inc2-dim exec-inc2-refnote">references only — a SHA-256 and metadata, never an artifact body</span>
            </Panel>
            <Panel title="Operations taken" label="Operations taken" footer={smoke?.opsFooter ?? "all mutations run plan → apply → verify in the Action Drawer · this panel only links them"}>
              <div className="exec-inc2-ops">
                {opsRows.map((op) => <OpLine key={op.id} op={op} />)}
                {smoke && !resolved ? (
                  <span className="exec-inc2-applywrap"><a className="exec-inc2-apply" href={smoke.applyPlan.href}>{smoke.applyPlan.label}</a></span>
                ) : null}
                {incident.correlatedOperations.rows.filter((op) => !opsRows.some((o) => o.id === op.operationId)).map((op) => (
                  <span className="exec-inc2-op" key={op.operationId}>
                    <button type="button" className="exec-linkbtn" onClick={() => onOpenOperation(op.operationId)}>{op.operationId}</button>{" "}
                    <span className="exec-inc2-dim">{op.relationship ?? "link not stated"} · {op.commandKey ?? "—"} · verify {op.verificationResult ?? "not stated"}</span>
                  </span>
                ))}
                <CountNote collection={incident.correlatedOperations} noun="operations" />
              </div>
            </Panel>
          </div>
          <div className="exec-inc2-grid">
            <Panel title="Resolution gates" label="Resolution gates" meta={<b data-tone={resolved ? "good" : "warn"}>{gateCount}</b>} footer={smoke?.gatesFooter ?? "Mark RESOLVED unlocks only when every gate is met — gates are server-enforced, this list is their mirror"}>
              <div className="exec-inc2-gates">
                {gatesRows.map((g) => <GateLine key={g.text} g={g} />)}
                {!smoke && gate ? gate.blockerCodes.map((code) => <span className="exec-inc2-gate" data-state="open" key={code}>✗ {blockerText(code)}</span>) : null}
              </div>
            </Panel>
            <Panel title="Timeline" label="Timeline">
              <div className="exec-inc2-timeline">
                {smoke ? smoke.timeline.map((t) => (
                  <span key={t.at + t.text}><span className="exec-inc2-dim">{t.at}</span> {t.text}</span>
                )) : null}
                {smoke && resolved ? <span>{smoke.resolved.timelineTail}</span> : null}
                {smoke && !resolved ? <span className="exec-inc2-waiting">{smoke.waitingLine}</span> : null}
                {incident.timeline.rows.map((event) => (
                  <span key={event.eventId} className="exec-inc2-dim">
                    {event.createdAt ? utcStamp(event.createdAt) : "time not stated"} · {event.action ?? "action not stated"} · {event.actor ?? "actor not stated"} · v{event.versionBefore ?? "—"}→v{event.versionAfter ?? "—"}
                  </span>
                ))}
                <CountNote collection={incident.timeline} noun="events" />
              </div>
            </Panel>
          </div>
          <div className="exec-inc2-grid">
            {incident.annotations.rows.length > 0 ? (
              <Panel title="Annotations" label="Annotations">
                <div className="exec-inc2-timeline">
                  {incident.annotations.rows.map((a) => (
                    <span key={a.annotationId}>{a.body} <span className="exec-inc2-dim">— {a.author ?? "author not stated"} · {a.createdAt ? utcStamp(a.createdAt) : "time not stated"}{a.redactionState && a.redactionState !== "CLEAR" ? ` · ${a.redactionState}` : ""}</span></span>
                  ))}
                </div>
              </Panel>
            ) : (
              <section aria-label="Annotations" className="exec-inc2-hidden" />
            )}
          </div>

          <footer className="exec-inc-footer exec-inc2-footer">
            {isAdmin ? (
              <div className="exec-inc-actions exec-inc2-actions">
                {!resolved ? (
                  <button type="button" className="exec-inc2-btn" disabled={!onAcknowledge || incident.acknowledgedAt !== null} onClick={onAcknowledge}>
                    Acknowledge
                  </button>
                ) : null}
                <button type="button" className="exec-inc2-btn" data-blocked={!gate?.eligible || resolved ? "true" : undefined} disabled={!gate?.eligible || !onResolve || resolved} onClick={onResolve}>
                  {resolved ? "View resolution audit" : gate?.eligible ? "Mark RESOLVED" : `Mark RESOLVED — blocked: ${gateCount} gates`}
                </button>
              </div>
            ) : null}
            <span className="exec-inc2-spacer" />
            <span className="exec-inc2-footnote" data-tone={resolved ? "warn" : undefined}>
              {resolved
                ? `${smoke?.resolved.footerNote ?? "dep_88 still HALTED"} · the deployment remains halted, resume is deliberately left to the operator`
                : `resolving closes the Portal incident only — it never resumes a deployment · ${smoke?.footerNote ?? "resolving never auto-resumes the deployment — resume is its own plan/apply/verify with fresh sync"}`}
            </span>
            {decisionReasons.length > 0 || (gate && !gate.eligible) ? (
              <div className="exec-disabled-reason exec-inc2-reasons">
                {decisionReasons.map((r) => <div key={r}>{r}</div>)}
                {gate && !gate.eligible ? gate.blockerCodes.map((code) => <div key={code}>{blockerText(code)}</div>) : null}
              </div>
            ) : null}
            {trail}
            {smoke ? <span className="exec-inc2-smoke">! {smoke.warning}</span> : null}
          </footer>
          {children}
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
