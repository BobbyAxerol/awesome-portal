/** Canary control room · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import CanaryScreen from "./index";
import { DEP, answering, canaryPort, populatedV1 } from "./canary.testbase";
import { Go, captionNow, commitRecorder, describeProjectionScreen, expectNoCommitWith, projectionPort, taggedBody, tagOf } from "../series/equityProjection.testbase";

afterEach(cleanup);
const WS = "ws_TEST_ONLY";

async function mount(serve: Parameters<typeof projectionPort>[0], workspaceId: string | undefined = WS) {
  const port = projectionPort(serve);
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEP}/canary`]}>
      <CanaryScreen api={port.api(canaryPort(answering(populatedV1())))} deploymentId={DEP} workspaceId={workspaceId} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Canary control room" });
  return port;
}

describeProjectionScreen("Canary", DEP, (serve) => mount(serve), { workspaceId: WS });

describe("Canary · the request", () => {
  it("asks for this deployment, 30 days, in the page's workspace; the URL's workspace wins", async () => {
    const port = projectionPort(() => ({ status: 404, body: {} }));
    render(
      <MemoryRouter initialEntries={[`/deployments/live/${DEP}/canary?workspace_id=ws_TEST_SCOPED_V2`]}>
        <CanaryScreen api={port.api(canaryPort(answering(populatedV1())))} deploymentId={DEP} workspaceId={WS} />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Canary control room" });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(port.queries[0]).toEqual({ deploymentId: DEP, window: "30d", workspaceId: "ws_TEST_SCOPED_V2" });
    expect(document.querySelector('[data-testid="equity-projection"]')).toBeNull();
    expect(screen.queryByText(/Fixture projection/)).toBeNull();
  });
});

describe("Canary · a changed context never shows the previous context's projection (commit level)", () => {
  const setup = () => {
    const rec = commitRecorder();
    const port = projectionPort((q) => ({ status: 200, body: taggedBody(q) }));
    const api = port.api(canaryPort(answering(populatedV1())));
    return { rec, api };
  };
  const tag = (workspaceId: string) => tagOf({ deploymentId: DEP, workspaceId });

  it("workspace prop change", async () => {
    const { rec, api } = setup();
    const ui = (ws: string) => (
      <rec.Wrap>
        <MemoryRouter initialEntries={[`/deployments/live/${DEP}/canary`]}>
          <CanaryScreen api={api} deploymentId={DEP} workspaceId={ws} />
        </MemoryRouter>
      </rec.Wrap>
    );
    const view = render(ui("ws_one"));
    await waitFor(() => expect(captionNow()).toContain(tag("ws_one")));
    const seg = rec.mark();
    view.rerender(ui("ws_two"));
    await waitFor(() => expect(captionNow()).toContain(tag("ws_two")));
    expectNoCommitWith(rec, seg, tag("ws_one"));
  });

  it("workspace change through the URL (which wins over the prop)", async () => {
    const { rec, api } = setup();
    render(
      <rec.Wrap>
        <MemoryRouter initialEntries={[`/deployments/live/${DEP}/canary?workspace_id=ws_one`]}>
          <CanaryScreen api={api} deploymentId={DEP} workspaceId="ws_prop" />
          <Go to={`/deployments/live/${DEP}/canary?workspace_id=ws_two`} />
        </MemoryRouter>
      </rec.Wrap>,
    );
    await waitFor(() => expect(captionNow()).toContain(tag("ws_one")));
    const seg = rec.mark();
    fireEvent.click(screen.getByTestId("go"));
    await waitFor(() => expect(captionNow()).toContain(tag("ws_two")));
    expectNoCommitWith(rec, seg, tag("ws_one"));
  });
});
