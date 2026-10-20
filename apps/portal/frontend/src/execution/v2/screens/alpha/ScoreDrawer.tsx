/**
 * The Score drawer (hi-fi "Score", Today layout).
 *
 * The score policy is not set, so every score row is `Not published (FE-011)`:
 * raw score, contribution, band, coverage, components and the policy version.
 * The raw economics the source does publish are the alpha's current per-currency
 * position PnL, labelled current. No future layout is drawn: an illustration of
 * a number that does not exist yet would read as a number.
 */
import { Drawer, type DockMode } from "../../Drawer";
import { Dec } from "./cells";
import { Np, WhyMark } from "./np";
import type { AlphaView } from "./view";

const COMPONENTS = ["P (performance)", "R (risk)", "B (robustness)"] as const;

export interface ScoreDrawerProps {
  view: AlphaView | null;
  mode: DockMode;
  onClose: () => void;
}

export function ScoreDrawer({ view, mode, onClose }: ScoreDrawerProps) {
  const here = view !== null && view.present ? view : null;
  return (
    <Drawer title="Score" subtitle={here ? here.titleWithVersion : undefined} mode={mode} onClose={onClose}>
      <p className="exec-alp2-line"><Np id="FE-011">Score policy is not set</Np></p>
      <table className="exec-alp2-kv">
        <tbody>
          <tr><th scope="row">Raw score</th><td><Np id="FE-011" /></td></tr>
          <tr><th scope="row">Contribution</th><td><Np id="FE-011" /></td></tr>
          <tr><th scope="row">Band</th><td><Np id="FE-011" /></td></tr>
          <tr><th scope="row">Coverage</th><td><Np id="FE-011" /></td></tr>
          <tr><th scope="row">Sample</th><td><Np id="FE-025" /></td></tr>
        </tbody>
      </table>
      <details className="exec-alp2-details">
        <summary>Components</summary>
        <table className="exec-alp2-kv">
          <tbody>
            {COMPONENTS.map((name) => <tr key={name}><th scope="row">{name}</th><td><Np id="FE-011" /></td></tr>)}
          </tbody>
        </table>
      </details>
      <h3 className="exec-alp2-drawer-h">Raw economics, current</h3>
      <table className="exec-alp2-kv">
        <tbody>
          {here && !here.money.published ? (
            <tr><th scope="row">Net PnL</th><td><Np id="FE-005" /><WhyMark name="Net PnL, reason" reason={here.money.reason} /></td></tr>
          ) : here && here.money.published && here.money.netPnl.length > 0 ? (
            here.money.netPnl.map((p) => (
              <tr key={p.currency}>
                <th scope="row">Net PnL, {p.currency}</th>
                <td><Dec value={p.value} currency={p.currency} signed /></td>
              </tr>
            ))
          ) : (
            <tr><th scope="row">Net PnL</th><td><Dec value={null} /></td></tr>
          )}
          <tr><th scope="row">Max drawdown</th><td><Np id="FE-025" /></td></tr>
          <tr><th scope="row">Fees and funding</th><td><Np id="FE-025" /></td></tr>
        </tbody>
      </table>
      <h3 className="exec-alp2-drawer-h">Policy</h3>
      <table className="exec-alp2-kv">
        <tbody>
          <tr><th scope="row">Version</th><td><Np id="FE-011" /></td></tr>
          <tr><th scope="row">Window</th><td><Np id="FE-025" /></td></tr>
        </tbody>
      </table>
    </Drawer>
  );
}
