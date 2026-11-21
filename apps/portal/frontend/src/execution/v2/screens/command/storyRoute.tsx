/**
 * The route entry of the UXM-09 command story (flag key `command`, FIXTURE ONLY): `CommandStoryPage` with the published command
 * catalogue, read from the contracts package through the strict V2 reader (`catalogueLane.ts`). It is the module `PortalRoutes`
 * loads lazily, so a build without the flag carries none of this. It reads no source, sends nothing, and builds no port: the story
 * page builds the scripted fake itself.
 */
import { useMemo } from "react";

import { fixtureCatalogue } from "./catalogueLane";
import CommandStoryPage from "./index";

export default function CommandStoryRoute() {
  const catalogue = useMemo(fixtureCatalogue, []);
  return <CommandStoryPage catalogue={catalogue} />;
}
