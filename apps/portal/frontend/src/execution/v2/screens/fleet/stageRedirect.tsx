/**
 * The old stage lists land on the Fleet (UXM-07 S1, review2/07 s2).
 *
 * `/deployments/paper`, `/deployments/sandbox` and `/deployments/live` were one
 * list per stage; the Fleet now holds all of them behind its lens tabs. Each
 * redirect names the stage words of the matching lens (`stagesForLens`, so the
 * lens and the redirect cannot drift) and the environment that stage belongs
 * to, and keeps every other param of the incoming URL: `workspace_id`, `q`,
 * `sort`, and a `stage` or `env` the caller already chose, which wins.
 *
 * The workbench detail routes (`/deployments/<stage>/<id>`) never come here.
 * Mounted only when the `fleet` flag is on; with it off the V1 list renders.
 */
import { Navigate, useLocation } from "react-router-dom";

import { serializeUrlParams, type ExecEnv } from "../../urlState";
import { stagesForLens, type FleetLens } from "./fleetModel";

export const FLEET_ROUTE = "/deployments/alphas";

export type StageList = "paper" | "sandbox" | "live";

const LIST: Readonly<Record<StageList, { lens: FleetLens; env: ExecEnv }>> = {
  paper: { lens: "paper", env: "paper" },
  sandbox: { lens: "sandbox", env: "sandbox" },
  // Real-funded is the one domain that holds Canary and Live (design D2); `live` is the default environment.
  live: { lens: "real", env: "live" },
};

/** The Fleet URL for a stage list: pure, so the mapping is testable without a router. */
export function fleetUrlForStageList(list: StageList, search: URLSearchParams | string = "", hash = ""): string {
  const incoming = new URLSearchParams(search);
  const { lens, env } = LIST[list];
  const patch: Parameters<typeof serializeUrlParams>[0] = {};
  if (!incoming.has("stage")) patch.stage = stagesForLens(lens);
  if (!incoming.has("env")) patch.env = env;
  const query = serializeUrlParams(patch, incoming).toString();
  return `${FLEET_ROUTE}${query === "" ? "" : `?${query}`}${hash}`;
}

export default function FleetStageRedirect({ list }: { list: StageList }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={fleetUrlForStageList(list, search, hash)} />;
}
