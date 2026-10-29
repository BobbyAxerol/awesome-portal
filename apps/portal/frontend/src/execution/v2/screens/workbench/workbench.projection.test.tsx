/** Paper workbench · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";

import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import PaperWorkbenchScreen from "./index";
import { DEP, fakeApi, sessionOf } from "./workbench.harness.fixtures";
import { describeProjectionScreen, projectionPort } from "../series/equityProjection.testbase";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(cleanup);

async function mount(serve: Parameters<typeof projectionPort>[0]) {
  const port = projectionPort(serve);
  const served = fakeApi();
  render(
    <MemoryRouter initialEntries={[`/deployments/paper/${DEP}?workspace_id=ws_TEST_ONLY`]}>
      <PaperWorkbenchScreen api={port.api(served.api)} deploymentId={DEP} />
    </MemoryRouter>,
  );
  await screen.findByRole("tablist");
  return port;
}

describeProjectionScreen("Paper workbench", DEP, (serve) => mount(serve), { workspaceId: "ws_TEST_ONLY" });
