/**
 * One Manager series read through the ExecutionApi port (`getManagerSeries`), with the phases a panel needs.
 *
 * Every screen asks for a series through here and never calls `fetch`. The read is keyed by the whole question (environment,
 * metric, subjects, window, partition) plus a caller nonce for "Refresh": a key change drops the previous answer, so a value
 * read for another portfolio or another window never stands in for this one. Not asked (`enabled` false, or no query) is
 * `idle`, and no request is made.
 */
import type { ExecutionApi } from "../../../api/ports";
import type { ManagerSeries, ManagerSeriesQuery } from "../../readers/managerSeries";
import { useRead, type ReadState } from "../portfolios/useRead";

export type SeriesReadState = ReadState<ManagerSeries>;

export function useManagerSeries(api: ExecutionApi, enabled: boolean, query: ManagerSeriesQuery | null, nonce = 0): SeriesReadState {
  const key = `series|${nonce}|${JSON.stringify(query)}`;
  return useRead(api, enabled && query !== null, key, async (scoped) => scoped.getManagerSeries(query as ManagerSeriesQuery));
}
