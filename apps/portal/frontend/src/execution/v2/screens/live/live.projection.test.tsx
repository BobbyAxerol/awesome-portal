/** Live room · the equity projection consumer (R-C, FIXTURE lane). The shared views are in series/equityProjection.testbase.ts. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import LiveScreen from "./index";
import { DEPLOYMENT_ID, fakeApi, ok, populatedV1, v1Read, v2Populated, v2Read } from "./live.testbase";
import { describeProjectionScreen, projectionPort, projectionBody } from "../series/equityProjection.testbase";

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
