import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ALPHA_FLEET from "../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.v2.valid.json";
import BINDINGS_LIST from "../../../../../packages/contracts/fixtures/execution-bindings-list.valid.json";
import BINDING_DETAIL from "../../../../../packages/contracts/fixtures/execution-binding-detail.valid.json";
import LIVE_REVIEW from "../../../../../packages/contracts/fixtures/governance-live-review.valid.json";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi } from "./api/httpApi";
import { readAlphaFleet, readBindingDetail, readBindings, readLiveReview } from "./api/profileRead";
import { AccountsBindingsContainer, AlphaFleetContainer } from "./screens/profileContainers";
import { AlphaFleetRichContainer } from "./screens/recomposeContainers";
import { AlphaFleet } from "./screens/AlphaFleet";

const POLICY = {
  policyRevision: 6,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: false,
  governanceWriteEnabled: true,
  paperCommandsEnabled: false,
  sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false,
  liveRiskIncreasingCommandsEnabled: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("BR-EX-72 same-origin manager list consumers", () => {
  it("decodes only the canonical list/detail and Live Review fixtures", () => {
    expect(readAlphaFleet(ALPHA_FLEET)?.page.rows[0]).toMatchObject({ alphaId: "alpha_a", stage: "PAPER" });
    expect(readBindings(BINDINGS_LIST)?.page.rows[0]).toMatchObject({ bindingId: "acc_a@BINANCE" });
    expect(readBindingDetail(BINDING_DETAIL)).toMatchObject({ accountId: "acc_a", credentialState: "SYNC_SYNCED" });
    expect(readLiveReview(LIVE_REVIEW)).toMatchObject({ approvalId: "AP-R2-DETAIL", canaryDeploymentId: "dep_88" });
    expect(readBindings({ ...BINDINGS_LIST, page: { ...BINDINGS_LIST.page, rows: [{ credential_secret: "leak" }] } })).toBeNull();
  });

  it("uses same-origin BFF routes for Fleet, binding list and binding detail", async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const path = String(request);
      const body = path.includes("/broker-bindings/acc_a") ? BINDING_DETAIL
        : path.includes("/broker-bindings") ? BINDINGS_LIST : ALPHA_FLEET;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);
    const api = createHttpApi({ policy: POLICY });
    expect((await api.getAlphaFleet()).ok).toBe(true);
    expect((await api.getBindings({ venue: "BINANCE" })).ok).toBe(true);
    expect((await api.getBindingDetail("acc_a@BINANCE")).ok).toBe(true);
    expect(fetch.mock.calls.map(([request]) => String(request))).toEqual([
      "/api/v1/execution/alphas",
      "/api/v1/execution/broker-bindings?venue=BINANCE",
      "/api/v1/execution/broker-bindings/acc_a%40BINANCE?environment=paper",
    ]);
  });

  it("renders real list rows instead of the N20 typed-unavailable placeholders", async () => {
    render(<AlphaFleetContainer api={createFixtureApi()} />);
    expect((await screen.findByRole("link", { name: "Carry A" })).getAttribute("href"))
      .toBe("/deployments/alphas/alpha_a");
    expect(screen.queryByText(/N20_FLEET_LIST_CONTRACT_NOT_PUBLISHED/)).toBeNull();

    render(<AccountsBindingsContainer api={createFixtureApi()} />);
    await waitFor(() => expect(screen.getAllByText("acc_a@BINANCE").length).toBeGreaterThan(0));
    expect(screen.queryByText(/N20_BINDINGS_LIST_CONTRACT_NOT_PUBLISHED/)).toBeNull();
  });

  it("keeps the reviewed rich Fleet composition and wires current-source facts and drill-downs", async () => {
    render(<AlphaFleetRichContainer api={createFixtureApi()} />);
    expect(await screen.findByText("Bobby-001")).toBeTruthy();
    expect(screen.getAllByText("123.19605").length).toBeGreaterThan(0);
    expect(screen.getByText("SOURCE_LATEST_WINDOW_NOT_PUBLISHED")).toBeTruthy();

    const alphaId = screen.getByText("alpha_a");
    fireEvent.click(alphaId.closest("tr")!);
    const deployment = await screen.findByRole("link", { name: "dep_a" });
    expect(deployment.getAttribute("href")).toBe("/deployments/paper/dep_a");
    expect(screen.getByRole("link", { name: "acc_a" }).getAttribute("href"))
      .toBe("/deployments/accounts/acc_a");

    fireEvent.click(screen.getByRole("button", { name: "Paper (1)" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Paper (1)" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("keeps a multi-stage alpha visible when filtering by any stage it holds", () => {
    const list = readAlphaFleet(ALPHA_FLEET)!;
    const row = list.page.rows[0];
    render(<AlphaFleet filter="paper" list={{
      ...list,
      page: { ...list.page, rows: [{ ...row, stage: "LIVE", stages: ["LIVE", "PAPER"] }] },
    }} />);
    expect(screen.getByRole("link", { name: "Carry A" })).toBeTruthy();
  });
});
