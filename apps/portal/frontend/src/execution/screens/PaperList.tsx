/**
 * Paper — the entry screen at /deployments/paper (WF 1c's front door).
 *
 * The canonical route used to mount the workbench for whichever deployment the
 * preview defaulted to, so "Paper Trading" in the sidebar landed an operator
 * inside one alpha with no warning. This list answers the question the route
 * name asks — what is in paper, how far along, and what happens next — and a
 * row opens its workbench. The gate-met row goes to its exit review instead,
 * because that is where a met gate actually goes.
 *
 * Reads `paper.smoke.ts` until BR-EX-62 publishes `paper-list.v1`.
 */
import { useNavigate } from "react-router-dom";
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { paperClock, paperSmoke, usePaperTick, PAPER_LIST, type PaperListRow } from "../paper.smoke";

export function PaperList() {
  const smoke = paperSmoke();
  const { now } = usePaperTick();
  const navigate = useNavigate();
  if (!smoke) {
    return (
      <ExecutionSurface kind="deployments" className="exec-pl">
        <PanelState status="unavailable" reason="No paper list is published (BR-EX-62)." />
      </ExecutionSurface>
    );
  }
  return (
    <ExecutionSurface kind="deployments" className="exec-pl exec-af" data-hifi-exact="paper-list">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Paper</h1>
            <span className="exec-af-sum">3 in observation · 3 venues · simulated funds — no broker, no capital at risk</span>
            <span className="exec-af-wf">entry for WF <a href="/deployments/paper/dep_74">1c</a></span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source">
              <span className="exec-af-livedot" aria-hidden="true" />
              <b>EXECUTION</b> · as_of <span className="exec-af-num">{paperClock(now)}</span>
            </span>
          </header>
          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table exec-pl-table" aria-label="Deployments in paper">
                <thead>
                  <tr>
                    <th>alpha · deployment</th>
                    <th>venue · account</th>
                    <th>portfolio</th>
                    <th>observation gate</th>
                    <th>session</th>
                    <th>next step</th>
                  </tr>
                </thead>
                <tbody>
                  {PAPER_LIST.map((r) => (
                    <PaperRows key={r.dep} r={r} onOpen={() => navigate(r.href)} />
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>row → paper workbench (WF 1c) · a met gate goes to its exit review · session-aware venues open the VN variant</span>
              <span className="exec-af-spacer" />
              <span>rows derive from the deployment registry — a new paper deployment appears with zero code</span>
            </footer>
          </div>
          <p className="exec-af-smoke">! {smoke.warning}</p>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function PaperRows({ r, onOpen }: { r: PaperListRow; onOpen: () => void }) {
  return (
    <>
      <tr
        className="exec-af-row exec-pl-row"
        role="button"
        tabIndex={0}
        aria-label={`${r.alpha} ${r.dep} — ${r.gate}`}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      >
        <td><a href={r.href} onClick={(e) => e.stopPropagation()}><b>{r.alpha}</b></a> · {r.dep}</td>
        <td className="exec-af-dim">{r.venue} · <a href={r.accountHref} onClick={(e) => e.stopPropagation()}>{r.account}</a></td>
        <td className="exec-af-dim"><a href={r.portfolioHref} onClick={(e) => e.stopPropagation()}>{r.portfolio}</a></td>
        <td data-tone={r.gateMet ? "good" : undefined}>{r.gate}</td>
        <td>{r.session ? <span className="exec-pw-chip" data-tone="calendar">{r.session.label}</span> : <span className="exec-af-mute">24/7</span>}</td>
        <td className="exec-af-go"><a href={r.next.href} onClick={(e) => e.stopPropagation()}>{r.next.label}</a></td>
      </tr>
      <tr className="exec-af-note"><td colSpan={6}>{r.note}</td></tr>
    </>
  );
}
