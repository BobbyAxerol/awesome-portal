/**
 * FE-062 · the open recalls the Portal controlled, in the operation dock.
 *
 * Bodies are the canonical fixtures (`execution-pending-control-currency.synthetic.valid.json`: discovery_open /
 * discovery_deployment / discovery_empty) read through the real strict reader, so the dock is tested against what the HTTP client
 * hands it. Lane: FIXTURE_LAB (the double is a vi.fn; nothing here is a runtime read).
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { operationalQueueSearch, readOperationalQueueV2, type OperationV2 } from "../../readers/operationalQueue";
import { readPendingRecallDiscoveryV1, type PendingRecallDiscoveryQuery, type PendingRecallDiscoveryRead } from "../../readers/pendingRecallDiscovery";
import { loadCanonical } from "../../testkit/loadCanonical";
import { OperationDock } from "./OperationDock";
import {
  EMPTY_RECALLS_COPY, PendingRecallsSection, RECALL_COVERAGE_COPY, UNKNOWN_RECALL_COPY, UNTRACKED_RECALLS_COPY, discoverable,
} from "./PendingRecalls";

afterEach(cleanup);

type Draft = any;
const FIXTURE = loadCanonical<Record<string, Draft>>("execution-pending-control-currency.synthetic");

function read(body: unknown): Result<PendingRecallDiscoveryRead> {
  const value = readPendingRecallDiscoveryV1(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
}

function fake(answer: (query: PendingRecallDiscoveryQuery) => Result<PendingRecallDiscoveryRead> | Promise<Result<PendingRecallDiscoveryRead>>) {
  const getPendingRecallDiscovery = vi.fn(async (query: PendingRecallDiscoveryQuery) => answer(query));
  return { api: { getPendingRecallDiscovery } as unknown as ExecutionApi, getPendingRecallDiscovery };
}

const section = (api: ExecutionApi, over: Partial<Parameters<typeof PendingRecallsSection>[0]> = {}) =>
  render(
    <PendingRecallsSection api={api} workspaceId="ws_TEST_ONLY" targetType="PORTFOLIO" targetId="TEST_ONLY:portfolio" environment="paper" {...over} />,
  );

describe("the section", () => {
  it("asks once, for the exact resource and environment of the row", async () => {
    const { api, getPendingRecallDiscovery } = fake(() => read(FIXTURE.discovery_open));
    section(api);
    await screen.findByLabelText("Open recalls");
    expect(getPendingRecallDiscovery).toHaveBeenCalledTimes(1);
    expect(getPendingRecallDiscovery).toHaveBeenCalledWith({ workspaceId: "ws_TEST_ONLY", resourceKind: "PORTFOLIO", resourceId: "TEST_ONLY:portfolio", environment: "paper" });
  });

  it("lists a WAITING recall with the five CAS versions exactly as published, and its amounts with their currency", async () => {
    section(fake(() => read(FIXTURE.discovery_open)).api);
    const list = await screen.findByLabelText("Open recalls");
    const first = within(list).getAllByRole("listitem")[0]!;
    expect(first.textContent).toContain("TEST_ONLY:original-recall");
    expect(first.textContent).toContain("Waiting for encumbrance");
    for (const [label, value] of [["Budget version", "9007199254740993"], ["Source version", "11"], ["Parent version", "12"], ["Book version", "13"], ["Command version", "14"]]) {
      const dt = within(first).getByText(label);
      expect(dt.nextElementSibling!.textContent).toBe(value);
    }
    expect(within(first).getByText("Pending").nextElementSibling!.textContent).toBe("75 USDT");
    expect(within(first).getByText("Applied").nextElementSibling!.textContent).toBe("25 USDT");
    expect(first.textContent).toContain("TEST_ONLY:pm:control-receipt:1");
  });

  it("an UNKNOWN recall says the outcome is unknown: no amounts, no versions, never zero", async () => {
    section(fake(() => read(FIXTURE.discovery_open)).api);
    const list = await screen.findByLabelText("Open recalls");
    const second = within(list).getAllByRole("listitem")[1]!;
    expect(second.dataset.state).toBe("UNKNOWN");
    expect(second.textContent).toContain(UNKNOWN_RECALL_COPY);
    expect(second.textContent).toContain("ecm_00000000000000000000000000000032");
    expect(second.textContent).not.toMatch(/\b0 USDT\b|Budget version|Requested/);
  });

  it("always says the list is the Portal's own history, with the not-published reason as text", async () => {
    section(fake(() => read(FIXTURE.discovery_open)).api);
    await screen.findByLabelText("Open recalls");
    const region = screen.getByTestId("pending-recalls");
    expect(region.textContent).toContain(RECALL_COVERAGE_COPY);
    expect(region.textContent).toContain("Recalls not started through the Portal cannot be discovered here");
    expect(region.textContent).toContain(UNTRACKED_RECALLS_COPY);
    expect(region.textContent).toContain("Not published: RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED");
  });

  it("an empty list is 'none the Portal controlled', and the coverage sentence is still printed", async () => {
    section(fake(() => read(FIXTURE.discovery_empty)).api);
    await screen.findByText(EMPTY_RECALLS_COPY);
    expect(screen.queryByLabelText("Open recalls")).toBeNull();
    expect(screen.getByTestId("pending-recalls").textContent).toContain(UNTRACKED_RECALLS_COPY);
    expect(screen.getByTestId("pending-recalls").textContent).not.toMatch(/no open recall\b(?! that)/i);
  });

  it("a DEPLOYMENT recall shows its owning account", async () => {
    section(fake(() => read(FIXTURE.discovery_deployment)).api, { targetType: "DEPLOYMENT", targetId: "TEST_ONLY:deployment" });
    const list = await screen.findByLabelText("Open recalls");
    expect(within(list).getByText("Owning account").nextElementSibling!.textContent).toBe("TEST_ONLY:account");
  });

  it("a PORTFOLIO recall shows no account row (the recipient is null, not an empty string)", async () => {
    section(fake(() => read(FIXTURE.discovery_open)).api);
    await screen.findByLabelText("Open recalls");
    expect(screen.queryByText("Owning account")).toBeNull();
  });

  it("truncated is printed as published: the newest page, more matched", async () => {
    const body = structuredClone(FIXTURE.discovery_open);
    body.truncated = true;
    section(fake(() => read(body)).api);
    await screen.findByText(/Showing the newest 2\. More open recalls matched/);
  });

  it("a failed read shows no list and says it failed: not 'none'", async () => {
    section(fake(() => ({ ok: false, status: "unavailable", reason: "PENDING_CONTROL_NOT_FOUND: hidden" })).api);
    const note = await screen.findByText(/could not be read, so none is shown/);
    expect(note.textContent).toContain("PENDING_CONTROL_NOT_FOUND");
    expect(screen.queryByLabelText("Open recalls")).toBeNull();
    expect(screen.getByTestId("pending-recalls").textContent).not.toContain(EMPTY_RECALLS_COPY);
  });

  it("another schema is 'not read', never an empty list", async () => {
    section(fake(() => read(FIXTURE.statuses.waiting)).api);
    await screen.findByText(/this build does not read \(portal.execution.pending-recall-status.v1\)/);
    expect(screen.queryByLabelText("Open recalls")).toBeNull();
  });

  it("no workspace means no question was asked, and the section says so", async () => {
    const { api, getPendingRecallDiscovery } = fake(() => read(FIXTURE.discovery_open));
    section(api, { workspaceId: undefined });
    await screen.findByText(/workspace of this row is not known/);
    expect(getPendingRecallDiscovery).not.toHaveBeenCalled();
  });

  it("a port that has no such method reads as unavailable, never as an empty list", async () => {
    section({} as unknown as ExecutionApi);
    await screen.findByText(/could not be read, so none is shown/);
  });

  it("a late answer for a target the dock has left is dropped", async () => {
    let release!: (value: Result<PendingRecallDiscoveryRead>) => void;
    const slow = new Promise<Result<PendingRecallDiscoveryRead>>((resolve) => { release = resolve; });
    const { api } = fake((query) => (query.resourceId === "TEST_ONLY:portfolio" ? slow : read(FIXTURE.discovery_deployment)));
    const view = section(api);
    view.rerender(
      <PendingRecallsSection api={api} workspaceId="ws_TEST_ONLY" targetType="DEPLOYMENT" targetId="TEST_ONLY:deployment" environment="paper" />,
    );
    await screen.findByLabelText("Open recalls");
    release(read(FIXTURE.discovery_open));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Owning account")).toBeTruthy();
  });

  it("sends nothing: the section has no button", async () => {
    section(fake(() => read(FIXTURE.discovery_open)).api);
    await screen.findByLabelText("Open recalls");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("the dock", () => {
  function rowOf(targetType: string): OperationV2 {
    const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch({ limit: 50, workspaceId: undefined } as never));
    const queue = readOperationalQueueV2(answer!.body)!;
    if (queue.kind !== "queue") throw new Error("fixture queue unreadable");
    const row = queue.queue.page.rows.find((r) => r.targetType === targetType);
    if (!row) throw new Error(`no ${targetType} row in the double`);
    return row;
  }

  const dock = (row: OperationV2 | null, api?: ExecutionApi) =>
    render(
      <MemoryRouter>
        <OperationDock operationId="op" row={row} loading={false} mode="dock" onClose={() => undefined} api={api} workspaceId="ws_TEST_ONLY" />
      </MemoryRouter>,
    );

  it("discoverable targets are exactly PORTFOLIO and DEPLOYMENT", () => {
    expect([discoverable("PORTFOLIO"), discoverable("DEPLOYMENT"), discoverable("ACCOUNT")]).toEqual([true, true, false]);
  });

  it("a portfolio or deployment row reads the discovery for its own target and environment", async () => {
    const { api, getPendingRecallDiscovery } = fake(() => read(FIXTURE.discovery_empty));
    const row = rowOf("PORTFOLIO");
    dock(row, api);
    await screen.findByText(EMPTY_RECALLS_COPY);
    expect(getPendingRecallDiscovery).toHaveBeenCalledWith({ workspaceId: "ws_TEST_ONLY", resourceKind: "PORTFOLIO", resourceId: row.targetId, environment: row.environment });
  });

  it("an account row asks nothing and prints no recall section", async () => {
    const { api, getPendingRecallDiscovery } = fake(() => read(FIXTURE.discovery_open));
    dock(rowOf("ACCOUNT"), api);
    await waitFor(() => expect(screen.getAllByText(/Not published/).length).toBeGreaterThan(0));
    expect(getPendingRecallDiscovery).not.toHaveBeenCalled();
    expect(screen.queryByTestId("pending-recalls")).toBeNull();
  });

  it("without a port the dock is exactly what it was", () => {
    dock(rowOf("PORTFOLIO"));
    expect(screen.queryByTestId("pending-recalls")).toBeNull();
  });
});
