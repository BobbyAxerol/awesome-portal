/**
 * The Owner and Health choices of the Fleet (RV-09): where they come from, and how far they can be trusted.
 *
 * A filter menu built from "the rows the page has shown" is not the authorized population: the fleet pages 50 at a time, so an owner
 * that lives on page 3 is simply missing until someone loads it. Two honest sources exist, and nothing else:
 *
 * - PUBLISHED: the Manager dataset can group by `owner_user_id` and `health` (`query_options.group_fields`), and a group list covers
 *   the WHOLE authorized filtered query (`totals_scope FULL_AUTHORIZED_FILTERED_QUERY`), not the page. One `limit 1` read per field,
 *   narrowed only by the lens' environment and stages (never by the owner/health/search the person already chose, which would
 *   remove the other choices), lists every value the caller is allowed to filter by. A list that reaches the reader's group bound
 *   (`MAX_GROUPS`) may be cut by the server, so it is marked `complete: false` and the screen says so.
 * - LOADED: the rows loaded so far. Always incomplete, always worded that way, and the person can type a value that the server
 *   then filters on (a value that matches nothing is an empty result, not an error).
 *
 * A dataset that does not offer the field, a refused read, or a late answer for a lens the screen has left make the field `loaded`:
 * the screen keeps today's choices and its honest limit instead of showing an empty or a stale full list. Nothing here is cached
 * across lenses, workspaces or sessions (the key carries the scope; `useRead` drops the previous value on a new key).
 */
import { useMemo } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { MAX_GROUPS, type ManagerDataset, type ManagerGroupField } from "../../readers/managerDataset";
import { useRead } from "../portfolios/useRead";
import type { DatasetScope } from "./fleetDatasetModel";
import { ask } from "./useFleetDataset";

export type OptionField = "owner_user_id" | "health";

export interface PublishedOptions {
  /** `published`: the dataset listed them. `loaded`: only what the rows on screen show. */
  basis: "published" | "loaded";
  values: readonly string[];
  /** Published and not cut by the group bound. Never true for `loaded`. */
  complete: boolean;
}

const LOADED_ONLY: PublishedOptions = { basis: "loaded", values: [], complete: false };

/** Package 5: `group_page` says whether this is every group. Without it the answer stays the cautious one (below the group bound), never a claim. */
function groupsAreComplete(dataset: ManagerDataset): boolean {
  const page = dataset.groupPage;
  return page === undefined ? dataset.groups.length < MAX_GROUPS : page.nextCursor === null && page.previousCursor === null && page.authorizedFilteredCount === page.returnedCount;
}

/** The distinct, non-null values of the first key part of every group. Pure. */
export function optionsFromGroups(dataset: ManagerDataset, field: OptionField): PublishedOptions {
  const values = new Set<string>();
  for (const group of dataset.groups) {
    const part = group.key[0];
    if (part !== undefined && part.field === field && part.value !== null) values.add(part.value);
  }
  return { basis: "published", values: [...values].sort((a, b) => a.localeCompare(b)), complete: groupsAreComplete(dataset) };
}

function useFieldOptions(
  api: ExecutionApi,
  enabled: boolean,
  scope: DatasetScope | null,
  workspaceId: string | undefined,
  field: OptionField,
): PublishedOptions {
  const on = enabled && scope !== null;
  const key = `fleet-options|${field}|${scope === null ? "" : scope.environment}|${scope === null ? "" : scope.stageFilter.join(",")}|${workspaceId ?? ""}`;
  const state = useRead(api, on, key, (scopedApi) =>
    ask(scopedApi, {
      surface: "FLEET",
      environment: (scope as DatasetScope).environment,
      limit: 1,
      groupBy: [field as ManagerGroupField],
      ...((scope as DatasetScope).stageFilter.length > 0 ? { stageFilter: (scope as DatasetScope).stageFilter } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    }),
  );
  return useMemo(() => (state.phase === "ready" ? optionsFromGroups(state.value, field) : LOADED_ONLY), [state, field]);
}

/**
 * Owner and Health choices for the dataset table. `offered` is `query_options.group_fields` of the dataset that was published for
 * this scope (`null`: not published). A field the dataset does not offer for grouping asks nothing and stays `loaded`.
 */
export function useDatasetOptions(
  api: ExecutionApi,
  enabled: boolean,
  scope: DatasetScope | null,
  workspaceId: string | undefined,
  offered: readonly ManagerGroupField[] | null,
): { owners: PublishedOptions; healths: PublishedOptions } {
  const owners = useFieldOptions(api, enabled && offered !== null && offered.includes("owner_user_id"), scope, workspaceId, "owner_user_id");
  const healths = useFieldOptions(api, enabled && offered !== null && offered.includes("health"), scope, workspaceId, "health");
  return { owners, healths };
}

export { LOADED_ONLY };
