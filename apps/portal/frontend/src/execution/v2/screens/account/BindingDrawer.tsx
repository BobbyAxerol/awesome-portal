/**
 * The binding peek: one physical binding, in the shared Drawer.
 *
 * This is where V1's Binding Detail went (D4, V1_SUBSCREEN_DISPOSITION): the
 * published binding facts, the capital invariant by currency, and the sync
 * state. Opened by `sel`, so a link to a selected row works, and it reads the
 * binding itself (`getBindingDetail`, `getBindingExposure`) rather than
 * trusting that the row is on the loaded page.
 *
 * The broker account reference is never printed: the row says so in words so
 * the absence cannot look like a rendering failure. A credential is a state
 * word, never an alias or a secret.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { BindingExposure } from "../../../analytics";
import { isFullPopulation } from "../../../analytics";
import type { ExecutionApi } from "../../../api/ports";
import type { BindingDetailRead } from "../../../api/profileRead";
import { PanelState } from "../../../components/states";
import { DockAction, Drawer, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import { withOrigin } from "../../backTo";
import { ENV_LABEL, withContext } from "../../urlState";
import { useBindingDetail, useBindingExposure } from "./reads";
import {
  ENV_TABS, accountHref, capitalRows, humanize, rotateCredential, stateView, timeOf, toBindingRow,
  type BindingEnv, type BindingRow,
} from "./model";
import { useAccountOperations } from "./useAccountOperations";
import { CredentialFlag, Fact, Na, StateFlag, Value, When, WITHHELD } from "./parts";

export interface BindingDrawerProps {
  api: ExecutionApi;
  bindingId: string;
  /** The loaded list row for it, or null when it is not on the loaded page. */
  row: BindingRow | null;
  /** Where to look first; a binding not on the loaded page is then looked for in the other environments. */
  environment: BindingEnv;
  mode: DockMode;
  capabilities: ReadonlySet<string>;
  onClose(): void;
}

export function CapitalInvariant({ exposure }: { exposure: BindingExposure }) {
  const rows = capitalRows(exposure);
  const full = isFullPopulation(exposure);
  const verdict = exposure.aggregate?.verdict ?? null;
  return (
    <>
      {verdict !== null ? (
        <p className="exec-acct-line">
          <span className="exec-acct-k">Server verdict</span>{" "}
          {verdict === "OK" ? <Flag kind="ok" size="sm" label="Within physical" />
            : verdict === "EXCEEDED" ? <Flag kind="rejected" size="sm" label="Exceeded" />
              : <Flag kind="unknown" size="sm" label="Verdict unknown" />}
        </p>
      ) : (
        <p className="exec-acct-note">The source published no aggregate verdict. The per-currency rows below are what it published; none is added up here.</p>
      )}
      {!full ? (
        <p className="exec-acct-note" role="status">
          <Flag kind="partial" size="sm" /> Covering {exposure.accountCount ?? "an unstated number of"} of {exposure.expectedAccountCount ?? "an unstated number of"} sleeves. This is part of the binding, not its total.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="exec-acct-note">The exposure read published no currency row.</p>
      ) : (
        <table className="exec-acct-minitable" aria-label="Capital invariant by currency">
          <thead>
            <tr><th scope="col">Currency</th><th scope="col">Used</th><th scope="col">Reserved</th><th scope="col">Available</th><th scope="col">Headroom</th><th scope="col">Check</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.currency}>
                <th scope="row">{row.currency}</th>
                <td><Value metric={row.used} /></td>
                <td><Value metric={row.reserved} /></td>
                <td><Value metric={row.available} /></td>
                <td><Value metric={row.headroom} signed /></td>
                <td>
                  {row.withinPhysical === null ? <Na />
                    : row.withinPhysical ? <Flag kind="ok" size="sm" label="Within physical" />
                      : <Flag kind="rejected" size="sm" label="Exceeded" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="exec-acct-h">{title}</h3>
      {children}
    </section>
  );
}

export function BindingDrawer({ api, bindingId, row, environment, mode, onClose }: BindingDrawerProps) {
  const [params] = useSearchParams();
  const detail = useBindingDetail(api, bindingId, row !== null ? [environment] : [environment, ...ENV_TABS.filter((entry) => entry !== environment)]).state;
  const exposure = useBindingExposure(api, bindingId).state;

  const read: BindingDetailRead | null = detail.phase === "ready" ? detail.value : null;
  const shown: BindingRow | null = row ?? (read ? toBindingRow(read.item) : null);
  const accountId = shown?.accountId ?? null;

  // "Rotate credential" is off for everyone: no capability opens it. The reason is the Portal's typed one when it published it.
  const rotate = rotateCredential(useAccountOperations(api));

  const actions = (
    <>
      {accountId !== null ? (
        <>
          <Link className="exec-dock-btn exec-acct-open" data-variant="primary" to={withContext(withOrigin(accountHref(accountId), { kind: "accounts" }, params), params)}>Open account</Link>
          <Link className="exec-dock-btn exec-acct-open" to={withContext(withOrigin(`${accountHref(accountId)}?view=physical`, { kind: "accounts" }, params), params)}>Physical binding</Link>
        </>
      ) : null}
      <DockAction label="Rotate credential" reason={rotate.reason} accessHref={rotate.accessHref} />
    </>
  );

  const sourceAsOf = read ? timeOf({ source_as_of: read.sourceAsOf }, "source_as_of") : null;
  const readAt = read ? timeOf({ read_at: read.readAt }, "read_at") : null;

  return (
    <Drawer title={bindingId} subtitle={shown ? `${shown.venue} · ${shown.accountId}` : detail.phase === "loading" ? "Loading" : "Binding"} mode={mode} onClose={onClose} actions={actions}>
      <div className="exec-acct-drawer">
        {detail.phase === "loading" && shown === null ? <PanelState status="loading" /> : null}
        {detail.phase === "error" && shown === null ? <PanelState status={detail.status} reason={detail.reason} /> : null}
        {detail.phase === "error" && shown !== null ? (
          <p className="exec-acct-note" role="status">The binding detail could not be read ({detail.reason}). The list row is shown.</p>
        ) : null}

        {shown !== null ? (
          <div className="exec-acct-flags">
            <CredentialFlag word={shown.credentialWord} size="md" />
            <StateFlag word={shown.stateWord} size="md" />
          </div>
        ) : null}

        <Section title="Binding facts">
          <dl className="exec-acct-facts">
            <Fact label="Native account"><span className="exec-acct-withheld">{WITHHELD}</span></Fact>
            <Fact label="Venue">{shown?.venue ?? <Na />}</Fact>
            <Fact label="State">{shown ? stateView(shown.stateWord).label : <Na />}</Fact>
            <Fact label="Environment">{read?.environment ? envWord(read.environment) : <Na />}</Fact>
            <Fact label="Delivery profile">{read?.deliveryProfile ?? <Na />}</Fact>
            <Fact label="Sleeves on it">
              {exposure.phase === "ready" && exposure.value.accountCount !== null ? String(exposure.value.accountCount) : <Na />}
            </Fact>
          </dl>
        </Section>

        <Section title="Capital invariant: Σ virtual ≤ physical">
          {exposure.phase === "loading" ? <PanelState status="loading" /> : null}
          {exposure.phase === "error" ? <PanelState status={exposure.status} reason={exposure.reason} /> : null}
          {exposure.phase === "ready" ? <CapitalInvariant exposure={exposure.value} /> : null}
        </Section>

        <Section title="Sync">
          <dl className="exec-acct-facts">
            <Fact label="Credential state">{shown?.credentialWord ?? <Na />}</Fact>
            <Fact label="Source published"><When at={sourceAsOf} /></Fact>
            <Fact label="Projection read"><When at={readAt} /></Fact>
            <Fact label="Binding updated"><When at={shown?.updatedAt ?? null} /></Fact>
          </dl>
        </Section>

        <details className="exec-acct-prov">
          <summary>Provenance</summary>
          <dl className="exec-acct-facts">
            <Fact label="Record authority">{read?.recordAuthority ?? <Na />}</Fact>
            <Fact label="Source authority">{read?.sourceAuthority ?? <Na />}</Fact>
            <Fact label="Freshness">{read?.freshness ?? <Na />}</Fact>
          </dl>
        </details>
      </div>
    </Drawer>
  );
}

/** The three URL words get the domain name (G2); anything else prints as the source spelled it. */
function envWord(word: string): string {
  const lower = word.toLowerCase();
  return lower === "live" || lower === "paper" || lower === "sandbox" ? ENV_LABEL[lower] : humanize(word);
}
