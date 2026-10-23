/**
 * DEBT-048 item 9 · the pending-control PREVIEW mount in the Operations dock (FIXTURE_LAB / BFF_DOUBLE lane only).
 *
 * What is pinned: the form is absent unless the `pending-preview` key is on AND the workspace is an explicit TEST_ONLY one (the
 * `command` key alone, a real workspace, or a missing one draw nothing); it carries the visible simulation label; an UNKNOWN recall and a
 * source the server does not qualify are typed states with a reason, never a clickable apply; the only port call is the rollback preview;
 * Escape closes the dock and focus returns to the opener. The port is a vi.fn that has NO apply / reserve / submit method at all.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { operationalQueueSearch, readOperationalQueueV2, type OperationV2 } from "../../readers/operationalQueue";
import { readPendingControlPreviewV1, type PendingControlPreviewRead } from "../../readers/pendingControlPreview";
import { readPendingRecallDiscoveryV1, type PendingRecallDiscoveryRead } from "../../readers/pendingRecallDiscovery";
import { whyText } from "../../gapWhyTestUtil";
import { loadCanonical } from "../../testkit/loadCanonical";
import { OperationDock } from "./OperationDock";
import { SIMULATION_COPY, isLabWorkspace } from "./pendingControlIntent";

const NONE = Symbol("no workspace");
const keys = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock("../../flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../flags")>()),
  isV2Screen: (key: string) => keys.on.has(key),
}));

type Draft = any;
const CURRENCY = loadCanonical<Record<string, Draft>>("execution-pending-control-currency.synthetic");
const CONTROL = loadCanonical<Record<string, Draft>>("execution-pending-control.synthetic");

beforeEach(() => keys.on.clear());
afterEach(cleanup);

const discovery = (body: unknown): Result<PendingRecallDiscoveryRead> => {
  const value = readPendingRecallDiscoveryV1(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
};
const preview = (body: unknown): Result<PendingControlPreviewRead> => {
  const value = readPendingControlPreviewV1(body, "USDT");
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
};

/** The ONLY two methods the mount may call. Any other method on the port is undefined, so a call to it would throw. */
function port(body: unknown = CURRENCY.discovery_open, answer: unknown = CONTROL.preview_allowed) {
  const getPendingRecallDiscovery = vi.fn(async () => discovery(body));
  const previewPendingControl = vi.fn(async (_intent: Draft) => preview(answer));
  return { api: { getPendingRecallDiscovery, previewPendingControl } as unknown as ExecutionApi, getPendingRecallDiscovery, previewPendingControl };
}

function rowOf(targetType: string): OperationV2 {
  const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch({ limit: 50, workspaceId: undefined } as never));
  const queue = readOperationalQueueV2(answer!.body)!;
  if (queue.kind !== "queue") throw new Error("fixture queue unreadable");
  const row = queue.queue.page.rows.find((r) => r.targetType === targetType);
  if (!row) throw new Error(`no ${targetType} row in the double`);
  return row;
}

const LAB = "ws_TEST_ONLY_operational";
const dock = (api: ExecutionApi, workspaceId: string | undefined | typeof NONE = LAB, onClose: () => void = () => undefined) =>
  render(
    <MemoryRouter>
      <OperationDock operationId="op" row={rowOf("PORTFOLIO")} loading={false} mode="dock" onClose={onClose} api={api} workspaceId={workspaceId === NONE ? undefined : workspaceId} />
    </MemoryRouter>,
  );

const previewButtons = () => screen.getAllByRole("button").filter((b) => /^Preview control$/.test(b.textContent ?? ""));

describe("gating: absent unless the fixture lab says so", () => {
  it.each<[string, string[], string | typeof NONE]>([
    ["no key at all (the product build)", [], "ws_TEST_ONLY_operational"],
    ["only the `command` key", ["command"], "ws_TEST_ONLY_operational"],
    ["the key but a real workspace", ["pending-preview"], "ws_main"],
    ["the key but a TEST_ONLY lookalike", ["pending-preview"], "ws_TEST_ONLYX"],
    ["the key but no workspace", ["pending-preview"], NONE],
  ])("%s: no form, no label, no preview call", async (_name, on, workspaceId) => {
    for (const key of on) keys.on.add(key);
    const { api, previewPendingControl, getPendingRecallDiscovery } = port();
    dock(api, workspaceId);
    await screen.findByTestId("pending-recalls");
    if (workspaceId !== NONE) {
      await waitFor(() => expect(getPendingRecallDiscovery).toHaveBeenCalled());
      await screen.findByLabelText("Open recalls");
    }
    expect(previewButtons()).toHaveLength(0);
    expect(screen.queryByTestId("pending-preview-simulation")).toBeNull();
    expect(screen.queryByText(SIMULATION_COPY)).toBeNull();
    expect(previewPendingControl).not.toHaveBeenCalled();
  });

  it("isLabWorkspace is an explicit ws_TEST_ONLY prefix, nothing looser", () => {
    expect(["ws_TEST_ONLY", "ws_TEST_ONLY_operational", "ws_TEST_ONLY_shared"].map(isLabWorkspace)).toEqual([true, true, true]);
    expect(["", "ws_main", "ws_TEST_ONLYX", "TEST_ONLY", "ws_test_only", "xws_TEST_ONLY", null, undefined].map(isLabWorkspace)).toEqual(Array(8).fill(false));
  });
});

describe("mounted in the lab", () => {
  beforeEach(() => keys.on.add("pending-preview"));

  it("shows the simulation label with each recall's form, and the form is keyboard operable", async () => {
    const { api, previewPendingControl } = port();
    dock(api);
    const labels = await screen.findAllByTestId("pending-preview-simulation");
    expect(labels).toHaveLength(2);
    expect(labels[0]!.textContent).toBe(SIMULATION_COPY);
    expect(SIMULATION_COPY).toMatch(/Simulation/);
    expect(SIMULATION_COPY).toMatch(/nothing is applied/);

    const button = previewButtons()[0]! as HTMLButtonElement;
    // Disabled with a reason that is named, not a bare title.
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBeNull();
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe("A reason is required.");

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Release the remainder" } });
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    await act(async () => { fireEvent.click(button); });
    expect(previewPendingControl).toHaveBeenCalledTimes(1);
    const intent = previewPendingControl.mock.calls[0]![0];
    expect(intent.workspace_id).toBe("ws_TEST_ONLY_operational");
    expect(intent.expected_policy_revision).toBe("TEST_ONLY:portal-policy");
    expect(intent.business_payload.expected_versions).toEqual(CURRENCY.discovery_open.items[0].versions);
    const allowed = await screen.findByRole("status");
    expect(allowed.textContent).toMatch(/Preview only\. Nothing was applied or reserved/);
  });

  it("a recall whose outcome is unknown is a typed shut state with its reason code and no request", async () => {
    const { api, previewPendingControl } = port();
    dock(api);
    const list = await screen.findByLabelText("Open recalls");
    const second = within(list).getAllByRole("listitem")[1]!;
    expect(within(second).getByTestId("pending-preview-simulation")).toBeTruthy();
    const shut = second.querySelector("[data-state='shut']") as HTMLElement;
    const button = within(shut).getByRole("button", { name: "Preview control" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toMatch(/Outcome unknown/);
    expect(whyText(shut.querySelector(".exec-blk-why"))).toBe("Reason code: RECALL_OUTCOME_UNKNOWN");
    expect(previewPendingControl).not.toHaveBeenCalled();
  });

  it("a policy revision that is not published shuts the form with its typed gap", async () => {
    const body = structuredClone(CURRENCY.discovery_open);
    body.policy_revision = { availability: "NOT_PUBLISHED", reason_code: "POLICY_NOT_CURRENT" };
    const { api } = port(body);
    dock(api);
    const list = await screen.findByLabelText("Open recalls");
    const first = within(list).getAllByRole("listitem")[0]!;
    const button = within(first).getByRole("button", { name: "Preview control" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toMatch(/policy revision/i);
  });

  it("a source the server does not qualify is shown as not allowed with its code, and nothing offers to apply it", async () => {
    const { api, previewPendingControl } = port(CURRENCY.discovery_open, CONTROL.preview_blocked);
    dock(api);
    await screen.findAllByTestId("pending-preview-simulation");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Unqualified source" } });
    await act(async () => { fireEvent.click(previewButtons()[0]!); });
    const flag = await screen.findByText("Preview not allowed");
    const result = flag.closest("[data-outcome]")!;
    expect(result.getAttribute("data-outcome")).toBe("not-allowed");
    expect(result.textContent).toMatch(/not qualified for this control/);
    expect(result.textContent).toMatch(/Nothing was applied or reserved/);
    expect(previewPendingControl).toHaveBeenCalledTimes(1);
    // No apply / send / submit / reserve control exists anywhere in the dock.
    const names = screen.getAllByRole("button").map((b) => `${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""}`);
    expect(names.filter((n) => /apply|submit|reserve|confirm/i.test(n))).toEqual([]);
  });
});

describe("Escape and focus", () => {
  it("Escape inside the form closes the dock and focus goes back to the control that opened it", async () => {
    keys.on.add("pending-preview");
    const { api } = port();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button type="button" data-testid="opener" onClick={() => setOpen(true)}>Open row</button>
          {open ? <OperationDock operationId="op" row={rowOf("PORTFOLIO")} loading={false} mode="dock" onClose={() => setOpen(false)} api={api} workspaceId="ws_TEST_ONLY_operational" /> : null}
        </MemoryRouter>
      );
    }
    render(<Host />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    await act(async () => { fireEvent.click(opener); });
    const reason = await screen.findByLabelText("Reason");
    reason.focus();
    await act(async () => { fireEvent.keyDown(reason, { key: "Escape" }); });
    await waitFor(() => expect(screen.queryByLabelText("Reason")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
