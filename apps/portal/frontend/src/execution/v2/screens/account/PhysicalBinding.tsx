/**
 * The physical-binding view of Account 360 (`view=physical`, D4).
 *
 * The logical sleeve answers "what does the portal's ledger say about this
 * account"; this view answers "what is the venue binding underneath it": its
 * published facts, its credential state, the capital invariant across the
 * sleeves that share it, and whether it can be acted on. It replaces V1's
 * separate Binding Detail screen.
 *
 * The broker account reference is never printed here either: the row says it
 * is withheld. A credential is a state word; its alias, scopes and expiry are
 * `Not published (A360-3)`.
 */
import type { BindingExposure } from "../../../analytics";
import type { BindingDetailRead } from "../../../api/profileRead";
import { PanelState } from "../../../components/states";
import { GapWhy, SectionPanel } from "../../blocks";
import { DockAction } from "../../Drawer";
import { ENV_LABEL } from "../../urlState";
import type { ReadState } from "./reads";
import { CapitalInvariant } from "./BindingDrawer";
import { FE, humanize, notPublishedReason, timeOf, type AccountView, type RotateCredential } from "./model";
import { CredentialFlag, EnvironmentWord, Fact, Na, Np, ProductWord, StateFlag, When, WITHHELD } from "./parts";

export interface PhysicalBindingProps {
  view: AccountView;
  detail: ReadState<BindingDetailRead>;
  exposure: ReadState<BindingExposure>;
  /** Why "Rotate credential" is off (it is off for everyone; see `rotateCredential`). */
  rotate: RotateCredential;
}

function envWord(word: string | null): string | null {
  if (word === null) return null;
  const lower = word.toLowerCase();
  return lower === "live" || lower === "paper" || lower === "sandbox" ? ENV_LABEL[lower] : humanize(word);
}

export function PhysicalBinding({ view, detail, exposure, rotate }: PhysicalBindingProps) {
  const { identity } = view;
  const read = detail.phase === "ready" ? detail.value : null;
  const item = read?.item ?? null;
  const environment = envWord(read?.environment ?? identity.environment);

  return (
    <>
      <SectionPanel title="Physical binding" aside="Native">
        <dl className="exec-acct-facts">
          <Fact label="Binding">{identity.bindingId ?? <Na why="The account resource names no binding" />}</Fact>
          <Fact label="Venue">{identity.venue ?? item?.venue ?? <Na />}</Fact>
          <Fact label="Native account"><span className="exec-acct-withheld"><GapWhy text="Withheld" name="Withheld, reason" rows={[WITHHELD]} next={null} /></span></Fact>
          <Fact label="Product"><ProductWord product={identity.product} /></Fact>
          <Fact label="Margin mode">{identity.marginMode ?? <Np fact={FE.product} />}</Fact>
          <Fact label="Environment"><EnvironmentWord environment={environment} network={identity.network} proofAt={identity.networkProofAt} /></Fact>
          <Fact label="Delivery profile">{read?.deliveryProfile ?? <Na />}</Fact>
          <Fact label="State">{item ? <StateFlag word={item.state} /> : detail.phase === "loading" ? "Loading" : <Na />}</Fact>
          <Fact label="Credential">
            {item ? <CredentialFlag word={item.credentialState} /> : detail.phase === "loading" ? "Loading" : <Na />}
          </Fact>
          <Fact label="Credential alias and scopes"><Np fact={FE.credential} /></Fact>
          <Fact label="Source published"><When at={read ? timeOf({ source_as_of: read.sourceAsOf }, "source_as_of") : null} /></Fact>
          <Fact label="Binding updated"><When at={item ? timeOf({ updated_at: item.updatedAt }, "updated_at") : null} /></Fact>
        </dl>
        {detail.phase === "error" ? (
          <p className="exec-acct-note" role="status">The binding detail could not be read ({detail.reason}). Only what the account resource published is shown.</p>
        ) : null}
        <details className="exec-acct-prov">
          <summary>Provenance</summary>
          <dl className="exec-acct-facts">
            <Fact label="Record authority">{read?.recordAuthority ?? <Na />}</Fact>
            <Fact label="Source authority">{read?.sourceAuthority ?? <Na />}</Fact>
            <Fact label="Freshness">{read?.freshness ?? <Na />}</Fact>
          </dl>
        </details>
        <div className="exec-acct-actions">
          <DockAction label="Rotate credential" reason={rotate.reason} accessHref={rotate.accessHref} />
          <DockAction label="Sync now" reason={notPublishedReason(FE.command, "No sync command is offered from this page yet.")} />
          <DockAction label="Dry-run reconcile" reason={notPublishedReason(FE.command, "No dry-run command is offered from this page yet.")} />
        </div>
      </SectionPanel>

      <SectionPanel title="Capital invariant: Σ virtual ≤ physical" aside="Whole binding">
        {exposure.phase === "loading" ? <PanelState status="loading" /> : null}
        {exposure.phase === "idle" ? <PanelState status="unavailable" reason="No binding id was published for this account, so the exposure could not be asked for." /> : null}
        {exposure.phase === "error" ? <PanelState status={exposure.status} reason={exposure.reason} /> : null}
        {exposure.phase === "ready" ? <CapitalInvariant exposure={exposure.value} /> : null}
      </SectionPanel>
    </>
  );
}
