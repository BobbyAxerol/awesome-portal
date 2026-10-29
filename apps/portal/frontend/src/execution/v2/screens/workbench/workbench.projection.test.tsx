/** Paper workbench · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, vi, expect } from "vitest";

import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import PaperWorkbenchScreen from "./index";
import { DEP, fakeApi, sessionOf } from "./workbench.harness.fixtures";
import { Go, captionNow, commitRecorder, describeProjectionScreen, expectNoCommitWith, projectionPort, taggedBody, tagOf } from "../series/equityProjection.testbase";

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

describe("Paper workbench · a changed context never shows the previous context's projection (commit level)", () => {
  it("workspace change through the URL", async () => {
    const rec = commitRecorder();
    const port = projectionPort((q) => ({ status: 200, body: taggedBody(q) }));
    const served = fakeApi();
    render(
      <rec.Wrap>
        <MemoryRouter initialEntries={[`/deployments/paper/${DEP}?workspace_id=ws_one`]}>
          <PaperWorkbenchScreen api={port.api(served.api)} deploymentId={DEP} />
          <Go to={`/deployments/paper/${DEP}?workspace_id=ws_two`} />
        </MemoryRouter>
      </rec.Wrap>,
    );
    const one = tagOf({ deploymentId: DEP, workspaceId: "ws_one" });
    await waitFor(() => expect(captionNow()).toContain(one));
    const seg = rec.mark();
    fireEvent.click(screen.getByTestId("go"));
    await waitFor(() => expect(captionNow()).toContain(tagOf({ deploymentId: DEP, workspaceId: "ws_two" })));
    expectNoCommitWith(rec, seg, one);
    expect(port.queries.map((q) => q.workspaceId)).toEqual(expect.arrayContaining(["ws_one", "ws_two"]));
  });
});
