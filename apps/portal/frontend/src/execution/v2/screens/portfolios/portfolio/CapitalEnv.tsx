/**
 * Capital by environment, from the EDS-05 derivation: allocation and account
 * balances as the server summed them, one row per currency, as CURRENT facts
 * (`current_observation_only`), never as a window.
 *
 * One table per environment. Real-funded (`live`) and Simulated (`paper`,
 * `sandbox`) are separate sections of the page and this component never sees
 * both in one table; within a table each currency is its own row.
 */
import { PanelGate } from "../../../blocks";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Money } from "../format";
import { envWord } from "../format";
import { ReadGate } from "./parts";
import { capitalRows, derivationStatus, type CapitalCurrencyRow, type Environment } from "./model";
import type { PortfolioReads } from "./use360";

import "../../../css/portfolios.css";

const COLUMNS: readonly CardsColumn<CapitalCurrencyRow>[] = [
  { key: "currency", label: "Currency", render: (row) => row.currency },
  { key: "allocated", label: "Allocated (current)", numeric: true, render: (row) => <Money value={row.allocated} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "max", label: "Max", numeric: true, render: (row) => <Money value={row.max} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "total", label: "Balance total", numeric: true, render: (row) => <Money value={row.balanceTotal} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "free", label: "Free", numeric: true, render: (row) => <Money value={row.balanceFree} absent={<span className="exec-pf-na">Not published</span>} /> },
  { key: "locked", label: "Locked", numeric: true, render: (row) => <Money value={row.balanceLocked} absent={<span className="exec-pf-na">Not published</span>} /> },
];

export function CapitalEnv({ environment, read }: { environment: Environment; read: PortfolioReads["capital"][Environment] }) {
  return (
    <section className="exec-pf-env" aria-label={`Capital in ${envWord(environment)}`} data-environment={environment}>
      <h4 className="exec-pf-env-title">{envWord(environment)}</h4>
      <ReadGate state={read}>
        {(capital) => {
          const status = derivationStatus(capital.state);
          const rows = capitalRows(capital.data);
          return (
            <PanelGate status={status} reason={capital.reasonCode ?? undefined}>
              {rows.length === 0 ? (
                <p className="exec-pf-note">The derivation published no allocation and no balance in {envWord(environment)}. An empty set is a fact, not a zero.</p>
              ) : (
                <CardsTable label={`Capital in ${envWord(environment)}`} columns={COLUMNS} rows={rows} rowKey={(row) => row.currency} />
              )}
              {capital.data.unpublishedInputs.length > 0 ? (
                <p className="exec-pf-note">Inputs the source did not publish: {capital.data.unpublishedInputs.join(", ")}.</p>
              ) : null}
            </PanelGate>
          );
        }}
      </ReadGate>
    </section>
  );
}
