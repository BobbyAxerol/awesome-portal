/** Canary control room · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import CanaryScreen from "./index";
import { DEP, answering, canaryPort, populatedV1 } from "./canary.testbase";
import { describeProjectionScreen, projectionPort } from "../series/equityProjection.testbase";

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
