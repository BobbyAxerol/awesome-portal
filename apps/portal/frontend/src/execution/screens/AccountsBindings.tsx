/**
 * Accounts & Bindings — hi-fi list, entry screen for WF 1g. Reads
 * `accounts.smoke.ts` until BR-EX-52 publishes `bindings-list.v1`.
 */
import { useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { accountsSmoke, clockOf, fmt0, inIctSession, useAccountsTick, type BindingRow, type Chip } from "../accounts.smoke";

export const BINDING_FILTERS = ["all", "live", "testnet", "paper", "issues"] as const;
export type BindingFilter = (typeof BINDING_FILTERS)[number];
const LABEL: Record<BindingFilter, string> = { all: "All", live: "Live-bound", testnet: "Testnet", paper: "Paper", issues: "Issues" };

function ChipEl({ chip }: { chip: Chip }) {
  return <span className="exec-ab-chip" data-tone={chip.tone} data-strong={chip.strong ? "true" : undefined} data-shield={chip.shield ? "true" : undefined}>{chip.label}</span>;
}
function Note({ text, links }: { text: string; links?: { label: string; href: string }[] }) {
  if (!links?.length) return <>{text}</>;
  const out: ReactNode[] = []; let rest = text;
  for (const l of links) { const i = rest.indexOf(l.label); if (i < 0) continue; out.push(rest.slice(0, i), <a key={l.label} href={l.href}>{l.label}</a>); rest = rest.slice(i + l.label.length); }
  out.push(rest); return <>{out}</>;
}

export function AccountsBindings() {
  const smoke = accountsSmoke();
  const { now, j } = useAccountsTick();
  const [filter, setFilter] = useState<BindingFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({ binance_main_01: true });
  if (!smoke) {
    return <ExecutionSurface kind="deployments" className="exec-ab"><PanelState status="unavailable" reason="No bindings list is published (BR-EX-52)." /></ExecutionSurface>;
  }
  const phys = smoke.physBase + j * 2.2;
  const headroom = phys - smoke.virt;
  const secs = now.getTime() / 1000;
  const binSync = `${(0.4 + (secs % 4.6)).toFixed(1)}s`;
  const okxSync = `${Math.floor(secs % 58)}s`;
  const session = inIctSession(now);
  const rows = smoke.rows.filter((r) => filter === "all" || r.filters.includes(filter));
  const syncText = (r: BindingRow) => (r.sync === "ws" ? `ws ${binSync} / 5s + 5m snap` : r.sync === "okx" ? `rest ${okxSync} / 60s` : r.sync === "vnm" ? (session ? "intraday OK" : "paused — resumes 09:00 ICT") : r.sync);
  return (
    <ExecutionSurface kind="deployments" className="exec-ab exec-af" data-hifi-exact="accounts-bindings">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Accounts &amp; Bindings</h1>
            <span className="exec-af-sum">{smoke.summary}</span>
            <span className="exec-af-wf">entry screen for WF 1g</span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source"><span className="exec-af-livedot" aria-hidden="true" /><b>BROKER</b> · snapshots · as_of <span className="exec-af-num">{clockOf(now)}</span></span>
          </header>
          <div className="exec-af-kpis">
            <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Physical equity · live</div><div className="exec-af-kpival">{fmt0(phys)} <span className="exec-af-kpiccy">USDT</span></div><div className="exec-af-kpisub">binance_main_01 · broker is truth</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Σ virtual allocated</div><div className="exec-af-kpival">{fmt0(smoke.virt)}</div><div className="exec-af-kpisub" data-tone="good">headroom {fmt0(headroom)} — invariant Σ ≤ physical</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Credentials</div><div className="exec-af-kpival">{smoke.kpis.credentials.valid} <span className="exec-af-kpiccy" data-tone="good">VALID</span></div><div className="exec-af-kpisub"><span className="exec-af-pulse" data-tone="warn">{smoke.kpis.credentials.expiring}</span> · {smoke.kpis.credentials.otp}</div></div>
            <div className="exec-af-kpi" data-tint="true"><div className="exec-af-kpilabel" data-tone="warn">Findings</div><div className="exec-af-kpival exec-af-pulse" data-tone="bad">{smoke.kpis.findings.n} <span className="exec-af-kpiccy" data-tone="bad">{smoke.kpis.findings.label}</span></div><div className="exec-af-kpisub"><a href={smoke.kpis.findings.link.href}>{smoke.kpis.findings.link.label}</a> · {smoke.kpis.findings.tail}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Sync health</div><div className="exec-af-kpival">{smoke.kpis.sync.ok} <span className="exec-af-kpiccy" data-tone="good">OK</span></div><div className="exec-af-kpisub">{smoke.kpis.sync.sub}</div></div>
          </div>
          <div className="exec-af-filters" role="group" aria-label="Binding filter">
            {BINDING_FILTERS.map((f) => <button key={f} type="button" className="exec-af-chip" data-active={filter === f ? "true" : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>{LABEL[f]} ({smoke.counts[f]})</button>)}
            <span className="exec-af-filternote">binding = one credentialed external account at a venue · virtual accounts are the portal's allocation ledger inside it</span>
          </div>
          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table exec-ab-table" aria-label="Bindings">
                <thead><tr><th className="exec-af-th-mark" /><th>binding · venue</th><th>env</th><th>credential</th><th data-numeric="true">physical equity</th><th data-numeric="true">Σ virtual · headroom</th><th data-numeric="true">accounts</th><th>sync · policy</th><th>health</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const expandable = Boolean(r.virtuals?.length);
                    const isOpen = expandable && Boolean(open[r.id]);
                    return (
                      <FragmentRow key={r.id} r={r} expandable={expandable} isOpen={isOpen} onToggle={() => setOpen((m) => ({ ...m, [r.id]: !isOpen }))} phys={phys} headroom={headroom} syncText={syncText(r)} />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>source: broker_bindings ⋈ accounts (virtual, by external_account_ref) ⋈ strategy_deployments · sync ages judged per-venue policy</span>
              <span className="exec-af-spacer" />
              <span>binding row → credential &amp; sync detail · account row → Account 360° (WF 1g) · Σ virtual ≤ physical is enforced at allocation time</span>
            </footer>
          </div>
          <p className="exec-af-smoke">! {smoke.warning}</p>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function FragmentRow({ r, expandable, isOpen, onToggle, phys, headroom, syncText }: { r: BindingRow; expandable: boolean; isOpen: boolean; onToggle: () => void; phys: number; headroom: number; syncText: string }) {
  return (
    <>
      <tr className="exec-af-row" onClick={expandable ? onToggle : undefined} role={expandable ? "button" : undefined} tabIndex={expandable ? 0 : undefined} aria-expanded={expandable ? isOpen : undefined} onKeyDown={expandable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined}>
        <td className="exec-af-mark">{expandable ? (isOpen ? "▾" : "▸") : ""}</td>
        <td>{r.href ? <a href={r.href}><b>{r.id}</b></a> : <b>{r.id}</b>} · {r.venue}<div className="exec-af-sub">{r.sub}{r.subLink ? <a href={r.subLink.href}>{r.subLink.label}</a> : null}</div></td>
        <td><ChipEl chip={r.env} /></td>
        <td className="exec-af-dim">{r.cred.alias} <span data-tone={r.cred.stateTone} className={r.cred.pulse ? "exec-af-pulse" : undefined}>{r.cred.state}</span>{r.cred.sub ? <div className="exec-af-sub">{r.cred.sub}</div> : null}{r.cred.subLink ? <div className="exec-af-sub"><a href={r.cred.subLink.href}>{r.cred.subLink.label}</a></div> : null}</td>
        <td data-numeric="true" data-tone={r.physTone}>{r.physical === "live" ? fmt0(phys) : r.physical}</td>
        <td data-numeric="true" data-tone={r.virtTone}>{r.sync === "ws" ? <>{r.virt} · <span data-tone="good">{fmt0(headroom)}</span></> : <>{r.virt}{r.virtCcy ? <> <span data-tone="warn">{r.virtCcy}</span> · sim</> : null}</>}</td>
        <td data-numeric="true">{r.accounts}</td>
        <td data-tone={r.syncTone}>{syncText}</td>
        <td><span data-tone={r.healthTone} className={r.healthPulse ? "exec-af-pulse" : undefined}>{r.health}</span>{r.healthLink ? <> · <a href={r.healthLink.href}>{r.healthLink.label}</a></> : null}</td>
      </tr>
      <tr className="exec-af-note"><td colSpan={9}><Note text={expandable ? r.note.replace("click to collapse", `click to ${isOpen ? "collapse" : "expand"}`) : r.note} links={r.noteLinks} /></td></tr>
      {isOpen && r.virtuals ? r.virtuals.map((v, i) => (
        <tr key={v.id} className="exec-af-dep" data-last={i === r.virtuals!.length - 1 ? "true" : undefined}>
          <td /><td>└ <a href={v.href}>{v.id}</a></td><td><ChipEl chip={v.chip} /></td>
          <td className="exec-af-mute"><Note text={v.who} links={v.whoLinks} /></td>
          <td data-numeric="true" className="exec-af-dim">equity {v.equity}</td><td data-numeric="true" className="exec-af-dim">alloc {v.alloc}</td><td data-numeric="true" className="exec-af-mute">—</td>
          <td data-tone={v.syncTone}>{v.sync}</td><td data-tone={v.healthTone}>{v.health}</td>
        </tr>
      )) : null}
    </>
  );
}
