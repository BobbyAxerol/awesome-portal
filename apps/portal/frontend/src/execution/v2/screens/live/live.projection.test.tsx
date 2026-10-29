/** Live room · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import LiveScreen from "./index";
import { DEPLOYMENT_ID, fakeApi, ok, populatedV1, v1Read, v2Populated, v2Read } from "./live.testbase";
import { captionNow, commitRecorder, describeProjectionScreen, expectNoCommitWith, projectionPort, projectionBody, taggedBody, tagOf } from "../series/equityProjection.testbase";

afterEach(cleanup);
const WS = "ws_TEST_ONLY";

async function mount(serve: Parameters<typeof projectionPort>[0], body = () => ok(v2Read(v2Populated())), workspaceId: string | undefined = WS) {
  const port = projectionPort(serve);
  const fake = fakeApi(body);
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}`]}>
      <LiveScreen api={port.api(fake.api)} deploymentId={DEPLOYMENT_ID} workspaceId={workspaceId} />
    </MemoryRouter>,
  );
  await screen.findByRole("tablist", { name: "Live sections" });
  return port;
}

describeProjectionScreen("Live", DEPLOYMENT_ID, (serve) => mount(serve), { workspaceId: WS });

describe("Live · where the projection is not shown", () => {
  it("never beside a chart the page hides: a broker/internal MISMATCH asks nothing and shows nothing", async () => {
    const port = await mount((q) => ({ status: 200, body: projectionBody(q.deploymentId) }), () => ok(v1Read(populatedV1({ state: "MISMATCH", visible: false }))));
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.querySelector('[data-testid="equity-projection"]')).toBeNull();
    expect(port.queries).toEqual([]);
  });

  it("a port without the method leaves the page as it was", async () => {
    const fake = fakeApi(() => ok(v2Read(v2Populated())));
    render(
      <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}`]}>
        <LiveScreen api={fake.api} deploymentId={DEPLOYMENT_ID} />
      </MemoryRouter>,
    );
    await screen.findByRole("tablist", { name: "Live sections" });
    await waitFor(() => expect(document.querySelector('[data-testid="equity-projection"]')).toBeNull());
  });
});

describe("Live · a changed context never shows the previous context's projection (commit level)", () => {
  const setup = () => {
    const rec = commitRecorder();
    const port = projectionPort((q) => ({ status: 200, body: taggedBody(q) }));
    const api = port.api(fakeApi(() => ok(v2Read(v2Populated()))).api);
    const ui = (workspaceId: string, deploymentId = DEPLOYMENT_ID) => (
      <rec.Wrap>
        <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}`]}>
          <LiveScreen api={api} deploymentId={deploymentId} workspaceId={workspaceId} />
        </MemoryRouter>
      </rec.Wrap>
    );
    return { rec, port, ui };
  };

  it("workspace change: no commit holds the old workspace's caption; the new one arrives for the new key", async () => {
    const { rec, ui } = setup();
    const view = render(ui("ws_one"));
    await waitFor(() => expect(captionNow()).toContain(tagOf({ deploymentId: DEPLOYMENT_ID, workspaceId: "ws_one" })));
    const seg = rec.mark();
    view.rerender(ui("ws_two"));
    await waitFor(() => expect(captionNow()).toContain(tagOf({ deploymentId: DEPLOYMENT_ID, workspaceId: "ws_two" })));
    expectNoCommitWith(rec, seg, tagOf({ deploymentId: DEPLOYMENT_ID, workspaceId: "ws_one" }));
  });

  it("deployment change: the same", async () => {
    const { rec, ui } = setup();
    const view = render(ui("ws_one"));
    await waitFor(() => expect(captionNow()).toContain(`${DEPLOYMENT_ID}_ws_one`));
    const seg = rec.mark();
    view.rerender(ui("ws_one", "dep_other_live"));
    await waitFor(() => expect(captionNow()).toContain("dep_other_live_ws_one"));
    expectNoCommitWith(rec, seg, `run_${DEPLOYMENT_ID}_ws_one`);
  });
});
