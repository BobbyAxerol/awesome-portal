/**
 * Screen 04's Search tab body (HiFi 04, `sc-if isSearch`).
 *
 * The HiFi draws the whole stage inside the tab: configuration, funnel,
 * selection decision, the search progression and the trial ledger. Screen 06
 * already reads and draws exactly that, so the tab mounts Screen 06's own
 * route container — same `:runId`, same hash cursor, same reads — with the
 * page frame, breadcrumb, title and cursor notice left to the hub. Nothing is
 * re-derived here.
 */

import { SearchRoute } from "./SearchRoute";

export function HubSearchBody() {
  return (
    <div data-hub-stage-body="search">
      <SearchRoute embedded />
    </div>
  );
}
