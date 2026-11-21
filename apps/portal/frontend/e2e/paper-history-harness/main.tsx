/**
 * UXM-07 closeout 3.2 · browser harness for the Paper workbench Equity chart. MEASUREMENT ONLY, not a screen and not a gate.
 *
 * Mounts the REAL PaperWorkbenchScreen with the REAL createHttpApi (real fetch, real `Accept`, real V2 adapter, real strict
 * reader). The Playwright spec answers `/api/v1/execution/screens/paper/dep_depth` with a body the real control-api producer
 * serialised in-process (synthetic rows, JS-emulated SQL). Everything else 404s and the screen words it as unavailable.
 */
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { createHttpApi } from "../../src/execution/api/httpApi";
import PaperWorkbenchScreen from "../../src/execution/v2/screens/workbench";

const api = createHttpApi({ policy: null });
const w = window as unknown as { __mountedAt?: number };
w.__mountedAt = performance.now();
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/deployments/paper/dep_depth"]}>
    <PaperWorkbenchScreen api={api} deploymentId="dep_depth" />
  </MemoryRouter>,
);
