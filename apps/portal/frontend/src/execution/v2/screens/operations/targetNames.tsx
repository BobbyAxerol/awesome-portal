/**
 * The names of the portfolios an operation or an incident points at (WP-B, QA3 R3-05): the row publishes an id (`pf_TEST_ONLY_core`), the
 * page it opens is titled by the portfolio's name ("Core"), and a link that says one thing and opens another reads as a wrong link.
 * The name is the Portfolios list's own `name` (a published read), fetched once and best effort: a port without the read, a refusal or
 * an id the list does not hold leaves the id as it was, never a guessed name. The id stays in the link's visually hidden text.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";

const NamesContext = createContext<ReadonlyMap<string, string>>(new Map());

export const usePortfolioNames = (): ReadonlyMap<string, string> => useContext(NamesContext);

export function TargetNamesProvider({ api, workspaceId, children }: { api: ExecutionApi; workspaceId?: string; children: ReactNode }) {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    if (typeof api.listPortfolios !== "function") return;
    let pending: ReturnType<ExecutionApi["listPortfolios"]>;
    try { pending = api.listPortfolios(workspaceId ? { workspaceId } : undefined); } catch { return; }
    void pending.then(
      (result) => {
        if (!live || !result.ok) return;
        setNames(new Map(result.value.items.filter((item) => item.name !== "").map((item) => [item.portfolioId, item.name] as const)));
      },
      () => undefined,
    );
    return () => { live = false; };
  }, [api, workspaceId]);
  return <NamesContext.Provider value={names}>{children}</NamesContext.Provider>;
}
