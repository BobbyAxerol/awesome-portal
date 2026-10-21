/**
 * Trade Replay as a page of its own (flag key `replay`): one alpha's fills on
 * candles, opened from the Blotter or from the Orders & Fills tab.
 *
 * The same body sits in Alpha 360 as its Replay tab (`ReplayView`); this page
 * adds the masthead, the scope chips and the way back to the alpha. It reads the
 * alpha resource (for the label, the deployments and the venue), then the
 * orders and fills of the book the URL names. `focus=order:<id>` or
 * `focus=fill:<id>` opens the replay at that trade.
 *
 * URL: `env` (book; the first book the alpha is deployed in when the named one
 * has no deployment), `workspace_id` (carried), `focus`.
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | up to 200 orders and 200 fills per page, keyset `Load more` | thousands of markers: unreadable chart | the V1 log shows 200 rows at a time, newest first; the chart still draws every loaded trade | `/resources/alphas/{id}/orders|fills` cursor, `maximum_page_rows` | every price and quantity is the server's string; candles only when the venue says READY | first paint on the log, candles after; chart code loads lazily |
 */
import { Link, useSearchParams } from "react-router-dom";

import { PanelState } from "../../../../components/states";
import type { ExecutionApi } from "../../../../api/ports";
import { useSession } from "../../../../../auth/session";
import { Flag } from "../../../Flag";
import { V2_NAV_TOKEN, holds } from "../../../shell/roleNav";
import { withoutOrigin } from "../../../backTo";
import { ENV_LABEL, useExecUrlState, withContext } from "../../../urlState";
import { replayBack } from "../backLinks";
import { chooseEnv, freshnessFlag } from "../model";
import { useAlphaResource, useSubjectBook } from "../useAlphaReads";
import { alphaViewOf } from "../view";
import { ReplayView } from "./ReplayView";

import "../../../css/alpha.css";

/** The stages a book holds (Real-funded is Canary and Live; Simulated is Paper and Sandbox). */
const ENV_STAGES: Readonly<Record<string, readonly string[]>> = { live: ["canary", "live"], paper: ["paper"], sandbox: ["sandbox"] };

export const REPLAY_SCREEN_KEY = "replay" as const;

const NO_VENUE = (): null => null;

export interface AlphaReplayProps {
  api: ExecutionApi;
  alphaId: string;
  /** `order:<id>` or `fill:<id>`; the URL's `focus` is read when this is absent. */
  focus?: string | null;
}

export default function AlphaReplay({ api, alphaId, focus }: AlphaReplayProps) {
  const url = useExecUrlState();
  const [params] = useSearchParams();
  const { access } = useSession();
  const capabilities = new Set(access.kind === "ready" ? access.access.capabilities : []);
  const canSeeAccounts = holds(capabilities, { allOf: [V2_NAV_TOKEN.accounts] });
  // The page's own `from` is its Back; the chips onward start fresh.
  const linkTo = (href: string) => withContext(href, withoutOrigin(params));
  const ordersHref = linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=orders`);
  const back = replayBack(params, ordersHref);

  const explicitWs = url.value.workspace_id ?? null;
  const resource = useAlphaResource(api, alphaId, explicitWs);
  // The same view as Alpha 360: the replay reads the resource for its label, deployments and venue, whichever body arrived.
  const view = resource.phase === "ready" ? alphaViewOf(resource.value, alphaId) : null;
  const env = chooseEnv(url.value.env, view?.envs ?? []);
  const settled = resource.phase === "ready" || resource.phase === "error";
  const book = useSubjectBook(api, alphaId, env, settled, explicitWs);
  const label = view?.titleWithVersion ?? alphaId;
  const rows = view?.rows ?? [];
  const deployment = rows.find((row) => (row.env !== undefined ? row.env === env : row.stage !== null && ENV_STAGES[env].includes(row.stage))) ?? rows[0] ?? null;
  const accountId = canSeeAccounts ? (book.orders[0]?.accountId ?? book.fills[0]?.accountId ?? deployment?.accountId ?? null) : null;
  const fresh = view ? freshnessFlag(view.freshness) : null;

  return (
    <div className="exec-alp2-v2" data-screen="trade-replay-v2">
      <header className="exec-alp2-head">
        <div>
          <Link className="exec-alp2-back" to={back.to}>← {back.label}</Link>
          <h1 className="exec-alp2-title">Trade Replay</h1>
          <p className="exec-alp2-sub">Fills on candles · {label}</p>
        </div>
        <div className="exec-alp2-chips">
          <Link className="exec-alp2-chip" to={linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}`)}>{label}</Link>
          {deployment ? <Link className="exec-alp2-chip" to={linkTo(deployment.href)}>Deployment {deployment.id}</Link> : null}
          {accountId ? <Link className="exec-alp2-chip" to={linkTo(`/deployments/accounts/${encodeURIComponent(accountId)}`)}>{accountId}</Link> : null}
          <Flag kind="display" label={ENV_LABEL[env]} size="sm" />
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
        </div>
      </header>
      {resource.phase === "error" && resource.status === "denied" ? (
        <PanelState status={resource.status} reason={resource.reason} />
      ) : (
        <ReplayView
          api={api}
          alphaId={alphaId}
          alphaLabel={label}
          env={env}
          venueOf={view?.venueOf ?? NO_VENUE}
          book={book}
          focus={focus ?? params.get("focus")}
          canSeeAccounts={canSeeAccounts}
          ordersHref={ordersHref}
          back={back}
        />
      )}
    </div>
  );
}
