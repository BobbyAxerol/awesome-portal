/**
 * The Alphas tab's list: the Alpha Fleet table filtered to this portfolio (WP-3, UI adjustment plan 10 Nov 2026).
 *
 * Same Manager dataset rows and same `FleetDatasetTable` as `/deployments/alphas`; the portfolio is the server's scope
 * (`surface: PORTFOLIO`), never a client filter. One environment per read (`ALL` is the Fleet's fan-out only), so the portfolio's own
 * environments are offered as a switch; it is the page's selected environment by default and the address remembers a choice (`aenv`).
 * The alpha name opens Alpha 360 with this portfolio as the Back source and the page's context (workspace, environment, window).
 */
import { useSearchParams } from "react-router-dom";

import { ENVIRONMENT_LABEL } from "../../fleet/fleetDatasetModel";
import { alphaHref } from "../../fleet/fleetModel";
import { ScopedFleetTable } from "../../manager/ScopedFleetTable";
import { withOrigin } from "../../../backTo";
import { withContext } from "../../../urlState";
import type { TabCtx } from "./ctx";
import type { Environment } from "./model";

/** The screen-local address key of the list's environment (a link reproduces the view; the default leaves the address clean). */
export const ALPHAS_ENV_PARAM = "aenv";

export function PortfolioAlphasFleet({ ctx }: { ctx: TabCtx }) {
  const [params, setParams] = useSearchParams();
  const asked = params.get(ALPHAS_ENV_PARAM);
  const environments = ctx.environments;
  const fallback: Environment | null = environments.includes(ctx.reads.selected) ? ctx.reads.selected : environments[0] ?? null;
  const environment: Environment | null = environments.find((env) => env === asked) ?? fallback;
  const choose = (next: Environment) => {
    const copy = new URLSearchParams(params);
    if (next === fallback) copy.delete(ALPHAS_ENV_PARAM);
    else copy.set(ALPHAS_ENV_PARAM, next);
    setParams(copy, { replace: true });
  };
  return (
    <>
      {environments.length > 1 && environment !== null ? (
        <div className="exec-pf-seg" role="group" aria-label="Environment of the alpha list">
          {environments.map((env) => (
            <button key={env} type="button" className="exec-pf-segbtn" aria-pressed={env === environment} onClick={() => choose(env)}>{ENVIRONMENT_LABEL[env]}</button>
          ))}
        </div>
      ) : null}
      <ScopedFleetTable
        api={ctx.api}
        scope={{ surface: "PORTFOLIO", id: ctx.portfolioId }}
        environment={environment}
        workspaceId={ctx.resource.workspaceId}
        hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "portfolio", id: ctx.portfolioId }), ctx.search)}
        emptyText={`The Manager dataset holds no alpha for this portfolio in ${environment === null ? "any environment" : ENVIRONMENT_LABEL[environment]}.`}
        noEnvironmentText="The resource names no environment this portfolio has a book in, so the alpha list asks nothing. It does not guess one."
      />
    </>
  );
}
