/**
 * One Manager dataset read (`getManagerDataset`, execution-manager-dataset.v1) through the ExecutionApi port, with the phases a
 * panel needs. The same hook serves the fixture lane and the real Edge: nothing here knows which one answers.
 *
 * Keyed by the whole question plus a caller nonce for "Refresh", so an answer for another surface, resource or window never stands
 * in for this one. Not asked (`enabled` false, or no query) is `idle` and no request is made.
 */
import type { ExecutionApi } from "../../../api/ports";
import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { ManagerDataset } from "../../readers/managerDataset";
import { useRead, type ReadState } from "../portfolios/useRead";

export type DatasetReadState = ReadState<ManagerDataset>;

export function useManagerDataset(api: ExecutionApi, enabled: boolean, query: ManagerDatasetQuery | null, nonce = 0): DatasetReadState {
  const key = `dataset|${nonce}|${JSON.stringify(query)}`;
  return useRead(api, enabled && query !== null, key, async (scoped) => scoped.getManagerDataset(query as ManagerDatasetQuery));
}
