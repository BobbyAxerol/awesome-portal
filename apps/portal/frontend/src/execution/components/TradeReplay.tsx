/**
 * Trade Replay — trade logs on candles (hi-fi Alpha 360 · Trade Replay tab).
 *
 * A port of the hi-fi's SVG engine: 120 1h candles, visible window `vs..vs+vc`
 * (zoom ±, pan ◀ ▶, Fit, wheel, drag), fill markers (▲ entry · ▼ exit),
 * round-trip segments with pnl, the armed bracket (◇), the pre-venue reject
 * (×), TP/STOP legs as dashed levels once the window reaches the entry, and
 * the live mark as a dotted line. Every number on the canvas is the smoke
 * module's until BR-EX-50 publishes candles + markers + legs.
 */
import { useRef, useState, type WheelEvent, type MouseEvent } from "react";
import { REPLAY_TRADES, replayCandles, replaySmoke, useMarkTick, type LogRow } from "../alphaReplay.smoke";

const N = 120;

export function TradeReplay() {
  const smoke = replaySmoke();
  const { price, prev } = useMarkTick(replayCandles()[N - 1].c);
  const [win, setWin] = useState({ vs: N - 60, vc: 60 });
  const drag = useRef<{ x: number; vs: number; w: number } | null>(null);
  if (!smoke) return null;
  const vc = Math.round(win.vc);
  const vs = Math.max(0, Math.min(N - vc, Math.round(win.vs)));
  const cs = replayCandles().slice();
  const l0 = cs[N - 1];
  cs[N - 1] = { o: l0.o, c: price, h: Math.max(l0.h, price), l: Math.min(l0.l, price) };
  const vis = cs.slice(vs, vs + vc);
  let lo = Math.min(...vis.map((k) => k.l)), hi = Math.max(...vis.map((k) => k.h));
  const pad = (hi - lo) * 0.08 || 50; lo -= pad; hi += pad;
  const Y = (v: number) => 14 + ((hi - v) / (hi - lo)) * 204;
  const pxPer = 808 / vc;
  const X = (i: number) => 12 + (i - vs) * pxPer + pxPer / 2;
  const inV = (i: number) => i >= vs && i < vs + vc;
  const inY = (p: number) => p > lo && p < hi;
  let wicks = "", up = "", dn = "";
  vis.forEach((k, j) => {
    const x = (12 + j * pxPer + pxPer / 2).toFixed(1);
    wicks += `M${x},${Y(k.h).toFixed(1)} L${x},${Y(k.l).toFixed(1)} `;
    const yo = Y(k.o), yc = Y(k.c);
    const seg = `M${x},${yo.toFixed(1)} L${x},${(Math.abs(yc - yo) < 1 ? yo + 1 : yc).toFixed(1)} `;
    if (k.c >= k.o) up += seg; else dn += seg;
  });
  const step = [50, 100, 200, 250, 500, 1000].find((s) => (hi - lo) / s <= 5) ?? 1000;
  const grid: { y: number; label: string }[] = [];
  for (let g = Math.ceil(lo / step) * step; g < hi; g += step) grid.push({ y: Y(g), label: g.toLocaleString("en-US") });
  const now = Date.UTC(2026, 7, 25, 12, 0, 0);
  const times = [0.06, 0.34, 0.62, 0.92].map((f) => {
    const i = vs + Math.min(vc - 1, Math.round(vc * f));
    const d = new Date(now - (N - 1 - i) * 3600e3);
    return { x: X(i), label: `${d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:00` };
  });
  const b = smoke.bracket;
  const segs: { pts: string; color: string; lx: number; ly: number; label: string }[] = [];
  const markers: { x: number; y: number; glyph: string; color: string; size: number }[] = [];
  const good = "var(--good)", bad = "var(--bad)", warn = "var(--warn)", soft = "var(--ink-soft)";
  REPLAY_TRADES.forEach((t) => {
    if (inV(t.ei)) markers.push({ x: X(t.ei), y: Y(t.ep) + 15, glyph: "▲", color: good, size: 12 });
    if (inV(t.xi)) markers.push({ x: X(t.xi), y: Y(t.xp) - 8, glyph: "▼", color: t.win ? good : bad, size: 12 });
    if (inV(t.ei) && inV(t.xi)) segs.push({ pts: `${X(t.ei).toFixed(1)},${Y(t.ep).toFixed(1)} ${X(t.xi).toFixed(1)},${Y(t.xp).toFixed(1)}`, color: t.win ? good : bad, lx: X(t.xi), ly: Y(t.xp) - 20, label: `${t.pnl} · ${t.kind}` });
  });
  if (inV(b.entryIndex)) {
    markers.push({ x: X(b.entryIndex), y: Y(b.entryPrice) + 15, glyph: "▲", color: good, size: 12 });
    markers.push({ x: X(b.entryIndex) - pxPer * 0.3, y: Y(b.entryPrice), glyph: "·", color: good, size: 15 });
    markers.push({ x: X(b.entryIndex) + pxPer * 0.4, y: Y(b.entryPrice + 1), glyph: "·", color: good, size: 15 });
  }
  if (inV(b.armedIndex)) markers.push({ x: X(b.armedIndex), y: Y(cs[b.armedIndex].h) - 6, glyph: "◇", color: soft, size: 10 });
  if (inV(b.tpIndex)) markers.push({ x: X(b.tpIndex), y: Y(b.tp) - 8, glyph: "▼", color: warn, size: 12 });
  if (inV(b.rejectIndex)) markers.push({ x: X(b.rejectIndex), y: Y(cs[b.rejectIndex].h) - 8, glyph: "×", color: bad, size: 10 });
  const upTick = price >= prev;
  const legOn = vs + vc > b.armedIndex;
  const legX1 = inV(b.armedIndex) ? X(b.armedIndex) : 12;
  const zoom = (f: number) => setWin((s) => {
    const vc0 = s.vc, nvc = Math.max(12, Math.min(N, Math.round(vc0 * f)));
    const right = Math.min(N, s.vs + vc0);
    return { vc: nvc, vs: Math.max(0, Math.min(N - nvc, right - nvc)) };
  });
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1 / 0.75 : 0.75); };
  const onDown = (e: MouseEvent<HTMLDivElement>) => { drag.current = { x: e.clientX, vs, w: e.currentTarget.getBoundingClientRect().width }; };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const per = drag.current.w / vc;
    setWin((s) => ({ ...s, vs: Math.max(0, Math.min(N - vc, Math.round(drag.current!.vs + (drag.current!.x - e.clientX) / per))) }));
  };
  const onUp = () => { drag.current = null; };
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <>
      <section className="exec-rp-panel" aria-label="Trade replay">
        <header className="exec-rp-head">
          <span className="exec-rp-title">Trade replay — trade logs on candles</span>
          <button type="button" className="exec-rp-chip" disabled title="Deployment and symbol pickers need replay.v1 (BR-EX-50)">{smoke.deployment} ▾</button>
          <button type="button" className="exec-rp-chip" disabled title="Deployment and symbol pickers need replay.v1 (BR-EX-50)">{smoke.symbol} ▾</button>
          <span className="exec-rp-spacer" />
          <span className="exec-rp-mark">mark <b data-tone={upTick ? "good" : "bad"}>{fmt(price)}</b> <span data-tone={upTick ? "good" : "bad"}>{upTick ? "▲" : "▼"}</span></span>
          <span className="exec-rp-ctl" role="group" aria-label="Replay window">
            <button type="button" className="exec-rp-chip" onClick={() => zoom(0.6)} aria-label="Zoom in">+</button>
            <button type="button" className="exec-rp-chip" onClick={() => zoom(1 / 0.6)} aria-label="Zoom out">−</button>
            <button type="button" className="exec-rp-chip" onClick={() => setWin((s) => ({ ...s, vs: Math.max(0, s.vs - Math.ceil(s.vc * 0.25)) }))} aria-label="Pan left">◀</button>
            <button type="button" className="exec-rp-chip" onClick={() => setWin((s) => ({ ...s, vs: Math.min(N - s.vc, s.vs + Math.ceil(s.vc * 0.25)) }))} aria-label="Pan right">▶</button>
            <button type="button" className="exec-rp-chip" onClick={() => setWin({ vs: 0, vc: N })}>Fit</button>
          </span>
          <span className="exec-rp-win">{vc} bars · 1h · drag / wheel</span>
        </header>
        <div className="exec-rp-canvas" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          <svg viewBox="0 0 880 258" className="exec-rp-svg" style={{ fontFamily: "var(--font-mono)" }} role="img" aria-label={`${vc} one-hour candles with fill markers`}>
            {grid.map((g) => <g key={g.label}><line x1="0" y1={g.y.toFixed(1)} x2="820" y2={g.y.toFixed(1)} stroke="var(--surface-2)" strokeWidth="1" /><text x="824" y={(g.y + 3).toFixed(1)} fontSize="9" fill="var(--ink-mute)">{g.label}</text></g>)}
            {times.map((t) => <text key={t.label + t.x} x={t.x.toFixed(1)} y="252" fontSize="9" fill="var(--ink-mute)" textAnchor="middle">{t.label}</text>)}
            <path d={wicks} stroke="var(--line-strong)" strokeWidth="1" fill="none" />
            <path d={up} stroke={good} strokeWidth={Math.max(1.5, Math.min(12, pxPer * 0.6)).toFixed(1)} fill="none" />
            <path d={dn} stroke={bad} strokeWidth={Math.max(1.5, Math.min(12, pxPer * 0.6)).toFixed(1)} fill="none" />
            {segs.map((s) => <g key={s.pts}><polyline points={s.pts} fill="none" stroke={s.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.85" /><text x={s.lx.toFixed(1)} y={s.ly.toFixed(1)} fontSize="10" fill={s.color} textAnchor="middle">{s.label}</text></g>)}
            {legOn && inY(b.tp) ? <g><line x1={legX1.toFixed(1)} y1={Y(b.tp).toFixed(1)} x2="820" y2={Y(b.tp).toFixed(1)} stroke={good} strokeWidth="1" strokeDasharray="6 4" opacity="0.7" /><text x={legX1.toFixed(1)} y={(Y(b.tp) - 4).toFixed(1)} fontSize="9" fill={good}>TP leg 61,900 · TAKE_PROFIT · reduce_only · ord_8832.TP · 0.0040/0.0080 filled</text></g> : null}
            {legOn && inY(b.sl) ? <g><line x1={legX1.toFixed(1)} y1={Y(b.sl).toFixed(1)} x2="820" y2={Y(b.sl).toFixed(1)} stroke={bad} strokeWidth="1" strokeDasharray="6 4" opacity="0.7" /><text x={legX1.toFixed(1)} y={(Y(b.sl) - 4).toFixed(1)} fontSize="9" fill={bad}>STOP leg trigger_price 60,900 · STOP_MARKET · reduce_only · ord_8832.SL — −{Math.max(0, price - b.sl).toLocaleString("en-US", { maximumFractionDigits: 0 })} from mark</text></g> : null}
            {vs + vc >= N - 1 && inY(price) ? <line x1="0" y1={Y(price).toFixed(1)} x2="820" y2={Y(price).toFixed(1)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 3" /> : null}
            {markers.map((m, i) => <text key={i} x={m.x.toFixed(1)} y={m.y.toFixed(1)} fontSize={m.size} fill={m.color} textAnchor="middle">{m.glyph}</text>)}
          </svg>
        </div>
        <div className="exec-rp-legend">
          <span data-tone="good">▲ entry fill</span>
          <span>▼ exit fill — <span data-tone="good">TP</span> / <span data-tone="bad">SL triggered</span> / <span data-tone="warn">partial</span></span>
          <span>◇ bracket legs armed (br_0092 · SUBMIT_CHILDREN_AFTER_ENTRY_FILLED)</span>
          <span data-tone="bad">× rejected pre-venue (no venue_order_id)</span>
          <span className="exec-rp-mute">╌ round trip entry→exit · ─ ─ working trigger_price · drag to pan · wheel to zoom</span>
        </div>
        <footer className="exec-rp-foot">source: orders ⋈ fills (order_id) ⋈ order_bracket_legs (bracket_group_id) · marker time = fill event ts (UTC) · replay job {smoke.job} (execution_replay_jobs) · candles = venue 1h OHLC, live bucket ticks · read the legs against the design: entry POST-ONLY at grid line, protective STOP below, TP shard above</footer>
      </section>
      <section className="exec-rp-panel" aria-label="Trade log">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade log — events behind the markers</span><span className="exec-rp-spacer" /><span className="exec-rp-win">row ↔ marker share order_id / fill id · full history in <a href="/deployments/blotter">Blotter</a></span></header>
        <div className="exec-scroll-x">
          <table className="exec-rp-table">
            <thead><tr><th>time (UTC)</th><th>event</th><th>order · leg</th><th>type · side</th><th data-numeric="true">qty</th><th data-numeric="true">price / trigger</th><th data-numeric="true">fee</th><th>note</th></tr></thead>
            <tbody>
              {smoke.log.map((r: LogRow) => (
                <tr key={r.time + r.order.id}>
                  <td className="exec-rp-dim">{r.time}</td>
                  <td><span className="exec-rp-ev" data-tone={r.eventTone}>{r.event}</span></td>
                  <td>{r.order.href ? <a href={r.order.href}>{r.order.id}</a> : r.order.id}{r.order.tail}</td>
                  <td>{r.type} · <span data-tone={r.side === "BUY" ? "good" : "bad"}>{r.side}</span></td>
                  <td data-numeric="true">{r.qty}</td>
                  <td data-numeric="true">{r.price}</td>
                  <td data-numeric="true" className={r.fee ? undefined : "exec-rp-mute"}>{r.fee ?? "—"}</td>
                  <td data-tone={r.noteTone}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="exec-rp-smoke">! {smoke.warning}</p>
    </>
  );
}
