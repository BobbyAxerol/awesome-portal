/**
 * Screen 04 · Stage 3 tab body: the Freeze deep dive (Screen 07), embedded.
 *
 * HiFi 04 draws the full freeze body inside the hub tab. This mounts the same
 * route container — same :runId param, same hash cursor, same reads — with
 * `embedded`, so only the deep dive's own frame and header are left out.
 */

import { FreezeRoute } from "./FreezeRoute";

export function HubFreezeBody() {
  return (
    <div data-hub-stage-body="freeze">
      <FreezeRoute embedded />
    </div>
  );
}
