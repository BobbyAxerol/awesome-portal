/** Alpha 360 · the equity projection consumer (R-C, FIXTURE lane). A projection is one deployment's: asked for the named deployment or the book's only one. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID } from "../../../../../e2e/bffDoubleAlpha";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import AlphaScreen from "./index";
import { alphaHttpApi, serveAlphaDouble } from "./testApi";
import { sessionOf } from "../workbench/workbench.harness.fixtures";
import { describeProjectionScreen, projectionBody, projectionPort, type Served } from "../series/equityProjection.testbase";
import type { EquityProjectionQuery } from "../../readers/equityProjection";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEP = "dep_live_01"; // a deployment of the alpha double; the Live book holds two (dep_live_01 and dep_canary_01), so a link names it
const ENTRY = `/deployments/alphas/${ALPHA_DOUBLE_ID}`;

async function mount(serve: (query: EquityProjectionQuery) => Served, entry = ENTRY) {
  serveAlphaDouble();
  const port = projectionPort(serve);
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={port.api(alphaHttpApi())} alphaId={ALPHA_DOUBLE_ID} />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(document.querySelector(".exec-alp2-meta")).not.toBeNull());
  return port;
}

describeProjectionScreen("Alpha 360", DEP, (serve) => mount(serve, `${ENTRY}?deployment_id=${DEP}`));

describe("Alpha 360 · which deployment", () => {
  it("a book of several deployments asks for none: no deployment is picked for the reader and nothing is summed", async () => {
    const port = await mount((q) => ({ status: 200, body: projectionBody(q.deploymentId) }));
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(port.queries).toEqual([]);
    expect(document.querySelector('[data-testid="equity-projection"]')).toBeNull();
  });

  it("a book of exactly one deployment asks for that one", async () => {
    const port = await mount((q) => ({ status: 200, body: projectionBody(q.deploymentId) }), `${ENTRY}?env=paper`);
    await waitFor(() => expect(port.queries.length).toBeGreaterThan(0));
    expect(port.queries[0]!.deploymentId).toBe("dep_paper_01");
  });

  it("a link that names a deployment asks for that deployment, in the page's workspace", async () => {
    const port = await mount((q) => ({ status: 200, body: projectionBody(q.deploymentId) }), `${ENTRY}?deployment_id=dep_paper_01&env=paper`);
    await waitFor(() => expect(port.queries.length).toBeGreaterThan(0));
    expect(port.queries[0]!.deploymentId).toBe("dep_paper_01");
  });

  it("only on the Actual view of Performance: another tab asks for nothing", async () => {
    const port = await mount((q) => ({ status: 200, body: projectionBody(q.deploymentId) }), `${ENTRY}?tab=orders`);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(port.queries).toEqual([]);
    expect(document.querySelector('[data-testid="equity-projection"]')).toBeNull();
  });
});
