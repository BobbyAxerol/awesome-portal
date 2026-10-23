/**
 * One Manager dataset read per compared portfolio (`getManagerDataset({surface: "PORTFOLIO", id})`, grouped by `portfolio_id` so the
 * server's own total per partition is in the body), through the ExecutionApi port.
 *
 * Compare holds at most four picks (`COMPARE_MAX`), so the hook is four fixed `useManagerDataset` slots, not a loop of hooks: a slot with
 * no id makes no request. The result is keyed by portfolio id. No answer for one portfolio stands in for another.
 */
import { useMemo } from "react";

import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { ExecutionApi } from "../../../api/ports";
import type { ManagerEnvironment } from "../../readers/managerDataset";
import { useManagerDataset, type DatasetReadState } from "../manager/useManagerDataset";

const queryFor = (id: string | undefined, environment: ManagerEnvironment): ManagerDatasetQuery | null =>
  id === undefined ? null : { surface: "PORTFOLIO", id, environment, groupBy: ["portfolio_id"], limit: 1 };

export function useCompareDatasets(api: ExecutionApi, enabled: boolean, ids: readonly string[], environment: ManagerEnvironment): ReadonlyMap<string, DatasetReadState> {
  const a = useManagerDataset(api, enabled && ids[0] !== undefined, queryFor(ids[0], environment));
  const b = useManagerDataset(api, enabled && ids[1] !== undefined, queryFor(ids[1], environment));
  const c = useManagerDataset(api, enabled && ids[2] !== undefined, queryFor(ids[2], environment));
  const d = useManagerDataset(api, enabled && ids[3] !== undefined, queryFor(ids[3], environment));
  return useMemo(() => {
    const out = new Map<string, DatasetReadState>();
    [a, b, c, d].forEach((state, index) => {
      const id = ids[index];
      if (id !== undefined) out.set(id, state);
    });
    return out;
  }, [a, b, c, d, ids]);
}
