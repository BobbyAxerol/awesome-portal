/**
 * Binding Detail — hi-fi "Binding Detail — binance_main_01".
 *
 * The product passes the BR-EX-72 binding projection (`detail`) and renders
 * its published facts in the reviewed frame; every unpublished panel states
 * itself. The lab passes `demo` for the full hi-fi.
 */
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { clockOfDate as clockOf } from "../clock";
import { fmt0 } from "../liveFormat";
import type { AccountsDemo, AccountsTick } from "../accounts.smoke";
import type { BindingItem } from "../api/profileRead";
import type { PanelStatus } from "../contracts";
import { utcStamp } from "../time";

export interface BindingDetailProps {
  bindingId: string;
  /** BR-EX-72 `GET /broker-bindings/{id}` — non-secret published facts. */
  detail?: BindingItem | null;
  status?: PanelStatus;
  reason?: string;
  /** Reviewed hi-fi bundle — the lab passes it; the product never does. */
  demo?: AccountsDemo | null;
  demoTick?: AccountsTick;
}

export function BindingDetail({ bindingId, detail = null, status = "ok", reason, demo, demoTick }: BindingDetailProps) {
  const smoke = demo && bindingId === demo.binding.id ? demo : null;
  const { now, j, snaps } = demoTick ?? { now: new Date(0), j: 0, snaps: [] };
  if (!smoke) {
    // Product: the published, non-secret binding facts in the reviewed frame.
    const sourceStatus = status !== "ok" && status !== "partial" ? status : !detail ? "unavailable" : null;
    const sourceReason = reason ?? (!detail ? `No binding detail was published for ${bindingId}.` : undefined);
    const d = detail;
    return (
      <ExecutionSurface kind="deployments" className="exec-ab exec-a3 exec-bd" data-hifi-exact="binding-detail">
        <ExecutionWorkspace layout="dense">
          <header className="exec-a3-masthead">
            <span className="exec-bd-kind">BINDING</span>
            <h1 className="exec-a3-h1">{d?.bindingId ?? bindingId} <span className="exec-a3-id">— {d?.venue ?? "venue not published"}</span></h1>
            <span className="exec-a3-spacer" />
            <span className="exec-a3-source"><b>BROKER</b> · updated {utcStamp(d?.updatedAt ?? null)}</span>
          </header>
          {sourceStatus ? <section className="exec-pf2-panel"><PanelState status={sourceStatus} reason={sourceReason} /></section> : null}
          <section className="exec-pf2-panel" aria-label="Binding facts">
            <header className="exec-pf2-head"><span className="exec-pf2-title">Published binding facts</span></header>
            <div className="exec-gov-kv" data-flush="true">
              <span className="exec-gov-k">account</span>
              <span className="exec-gov-v">{d ? <a href={`/deployments/accounts/${encodeURIComponent(d.accountId)}`}>{d.accountId}</a> : "not published"}</span>
              <span className="exec-gov-k">venue</span>
              <span className="exec-gov-v">{d?.venue ?? "not published"}</span>
              <span className="exec-gov-k">state</span>
              <span className="exec-gov-v">{d?.state.toUpperCase() ?? "NOT PUBLISHED"}</span>
              <span className="exec-gov-k">credential</span>
              <span className="exec-gov-v">{d ? `${d.credentialState.toUpperCase()} — state word only; credentials never leave the vault` : "not published"}</span>
            </div>
          </section>
          <section className="exec-pf2-panel" aria-label="Capital invariant">
            <header className="exec-pf2-head"><span className="exec-pf2-title">Capital invariant — Σ virtual ≤ physical</span></header>
            <PanelState status="unavailable" reason="Physical equity and the virtual-allocation ledger are not published on this projection (N28 exposure population)." />
          </section>
          <section className="exec-pf2-panel" aria-label="Sync and policy">
            <header className="exec-pf2-head"><span className="exec-pf2-title">Sync · policy</span></header>
            <PanelState status="unavailable" reason="Broker sync ages and per-venue policy verdicts are not published on this projection." />
          </section>
        </ExecutionWorkspace>
      </ExecutionSurface>
    );
  }
  const b = smoke.binding;
  const phys = smoke.physBase + j * 2.2;
  const head = phys - smoke.virt;
  const pct = (v: number) => `${((v / phys) * 100).toFixed(1)}%`;
  const secs = now.getTime() / 1000;
  const wsAge = `${(0.4 + (secs % 4.6)).toFixed(1)}s`;
  const rate = b.credential.rateBase + Math.floor(secs % 40);
  return (
    <ExecutionSurface kind="deployments" className="exec-ab exec-a3 exec-bd" data-hifi-exact="binding-detail">
      <ExecutionWorkspace layout="dense">
        <header className="exec-a3-masthead">
          <span className="exec-bd-kind">BINDING</span>
          <h1 className="exec-a3-h1">{b.id} <span className="exec-a3-id">— {b.title}</span></h1>
          <span className="exec-bd-finding">{b.openFindings} OPEN FINDING</span>
          <span className="exec-a3-spacer" />
          <span className="exec-a3-source"><span className="exec-af-livedot" aria-hidden="true" /> <b>BROKER</b> · ws {wsAge} / 5s · as_of {clockOf(now)}</span>
        </header>
        <section className="exec-pf2-panel" aria-label="Capital invariant">
          <header className="exec-pf2-head"><span className="exec-pf2-title">Capital invariant — Σ virtual ≤ physical (enforced at allocation time)</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note exec-bd-soft">physical <b>{fmt0(phys)}</b> · Σ virtual {fmt0(smoke.virt)} · headroom <b data-tone="good">{fmt0(head)}</b></span></header>
          <div className="exec-bd-barwrap">
            <div className="exec-bd-bar" role="img" aria-label={`Σ virtual ${fmt0(smoke.virt)} of physical ${fmt0(phys)}`}>
              {b.segments.map((s) => <a key={s.id} href={s.href} className="exec-bd-seg" data-tone={s.tone} style={{ flex: `0 0 ${pct(s.value)}` }}>{s.label}</a>)}
              <span className="exec-bd-head" />
            </div>
            <div className="exec-bd-barfoot"><span>0</span><span>dark segment right of the green edge = <b data-tone="good">headroom {fmt0(head)}</b> — bar re-prices with physical marks; headroom breathes, allocations do not</span><span>{fmt0(phys)}</span></div>
          </div>
        </section>
        <div className="exec-pf2-grid" data-ratio="1">
          <section className="exec-pf2-panel" aria-label="Credential">
            <header className="exec-pf2-head"><span className="exec-pf2-title">Credential — {b.credential.alias}</span><span className="exec-pf2-spacer" /><span className="exec-pf2-decision">{b.credential.state}</span></header>
            <div className="exec-bd-kv">
              <span className="exec-bd-k">scopes</span><span>{b.credential.scopes.a}<b data-tone="good">{b.credential.scopes.b}</b>{b.credential.scopes.c}</span>
              <span className="exec-bd-k">secret</span><span className="exec-bd-soft">{b.credential.secret}</span>
              <span className="exec-bd-k">ip allowlist</span><span>{b.credential.ip.a}<span data-tone="good">{b.credential.ip.ok}</span></span>
              <span className="exec-bd-k">rotation</span><span className="exec-bd-soft">{b.credential.rotation.a}<a href={`/execution/operations?operation=${b.credential.rotation.op}`}>{b.credential.rotation.op}</a>{b.credential.rotation.b}</span>
              <span className="exec-bd-k">rate budget</span><span>{rate}{b.credential.rateNote}</span>
            </div>
            <footer className="exec-bd-actions"><a className="exec-pf2-primary" href={`/administration/actions?action=rotate_credential&binding=${b.id}`}>Rotate credential ▸</a><span className="exec-pf2-note">{b.credential.foot}</span></footer>
          </section>
          <section className="exec-pf2-panel" aria-label="Sync stream">
            <header className="exec-pf2-head"><span className="exec-pf2-title">Sync stream — snapshots as they land</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">policy: ws + 5m snapshot · digest = content hash</span></header>
            <div className="exec-bd-stream" aria-live="polite">
              {snaps.map((s) => <div key={s.time + s.digest} className="exec-bd-snap" data-edge={s.edge ? "bad" : undefined}><span className="exec-bd-soft exec-af-num">{s.time}</span><b data-tone={s.tone}>{s.state}</b><span className="exec-bd-mute">{s.digest}</span><span>{s.noteLink && s.note.includes(s.noteLink.label) ? <>{s.note.split(s.noteLink.label)[0]}<a href={s.noteLink.href}>{s.noteLink.label}</a>{s.note.split(s.noteLink.label)[1]}</> : s.note}</span></div>)}
            </div>
            <footer className="exec-pf2-foot">{b.snapsFoot}</footer>
          </section>
        </div>
        <section className="exec-pf2-panel" aria-label="Virtual accounts in this binding">
          <header className="exec-pf2-head"><span className="exec-pf2-title">Virtual accounts in this binding</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">account row → Account 360° (WF 1g)</span></header>
          <div className="exec-scroll-x"><table className="exec-pf2-table exec-pf2-config"><thead><tr><th>account</th><th>stage</th><th>alpha · deployment · portfolio</th><th data-numeric="true">allocated</th><th data-numeric="true">equity</th><th data-numeric="true">exposure</th><th>recon</th></tr></thead>
            <tbody>{b.virtuals.map((v) => (
              <tr key={v.id} data-hot={v.hot ? "true" : undefined}>
                <td className="exec-bd-rowedge"><a href={v.href}>{v.id}</a></td>
                <td><span className="exec-ab-chip" data-tone={v.chip.tone} data-strong="true" data-shield={v.chip.shield ? "true" : undefined}>{v.chip.label}</span></td>
                <td className="exec-pf2-dim">{v.who}{v.whoLinks.map((l, i) => <span key={l.label}>{i ? " · " : ""}<a href={l.href}>{l.label}</a></span>)}</td>
                <td data-numeric="true">{v.alloc}</td><td data-numeric="true">{v.equity}</td><td data-numeric="true">{v.exposure}</td>
                <td><span data-tone={v.reconTone} className={v.reconPulse ? "exec-af-pulse" : undefined}>{v.recon}</span>{v.reconLink ? <>{v.reconPulse ? " · " : ""}<a href={v.reconLink.href}>{v.reconLink.label}</a></> : null}</td>
              </tr>
            ))}</tbody></table></div>
          <footer className="exec-pf2-foot">{b.virtualsFoot}</footer>
        </section>
        <section className="exec-pf2-panel" aria-label="Binding audit">
          <header className="exec-pf2-head"><span className="exec-pf2-title">Binding audit — credential &amp; structure changes only</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">money moves live in each portfolio's Capital Ledger</span></header>
          <div className="exec-bd-audit">{b.audit.map((a) => <span key={a.op}><span className="exec-bd-mute">{a.t}</span> {a.text}<a href={`/execution/operations?operation=${a.op}`}>{a.op}</a>{a.tail}</span>)}</div>
        </section>
        <p className="exec-af-smoke">! {smoke.warning}</p>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
