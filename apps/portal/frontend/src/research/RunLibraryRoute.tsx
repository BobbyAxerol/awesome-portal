/**
 * Screen 01 on its canonical product route (P12).
 *
 * `/research/quantbt/runs` — the route spec 01 §1 names and the P12 handoff
 * works against. The screen this replaces is not deleted: the previous Run
 * Library stays reachable at `/research/quantbt/runs/legacy`, so the swap is
 * one line to reverse and nothing approved was removed to make room.
 */

import { RunLibrary } from "./RunLibrary";
import { useRunLibrary } from "./useRunLibrary";
import { useSearchParams } from "react-router-dom";

export function RunLibraryRoute() {
  const [search] = useSearchParams();
  const workspaceId = search.get("workspace_id") || undefined;
  return <RunLibraryContainer key={workspaceId ?? ""} workspaceId={workspaceId} />;
}

function RunLibraryContainer({ workspaceId }: { workspaceId?: string }) {
  const library = useRunLibrary(workspaceId);

  return (
    <RunLibrary
      workspaceId={workspaceId}
      filters={library.filters}
      onFilters={library.setFilters}
      onToggleSel={library.toggleSel}
      response={library.response}
      items={library.items}
      state={library.state}
      sparklines={library.sparklines}
      onVisible={library.observeVisible}
      onLoadNext={library.loadNext}
      onLoadPrevious={library.loadPrevious}
      selection={library.selection}
      onRetry={library.reload}
      onFirstPage={library.firstPage}
    />
  );
}
