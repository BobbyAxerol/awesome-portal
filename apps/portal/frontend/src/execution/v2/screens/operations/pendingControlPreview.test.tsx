/**
 * RV-10 · "Preview control" under a discovered recall: the form, its shut states, the typed refusals and the success state.
 *
 * Bodies: canonical discovery and preview fixtures read through the strict readers; the port is a vi.fn (FIXTURE_LAB, nothing here is a
 * runtime read and nothing claims a connected source).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { readPendingControlPreviewV1, type PendingControlPreviewRead } from "../../readers/pendingControlPreview";
import { readPendingRecallDiscoveryV1, type DiscoveredRecall, type PendingRecallDiscoveryRead } from "../../readers/pendingRecallDiscovery";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { PendingControlIntentWire } from "./pendingControlIntent";
import { PendingControlPreview, PREVIEW_ONLY_COPY } from "./PendingControlPreview";
import { PendingRecallsSection } from "./PendingRecalls";

afterEach(cleanup);

type Draft = any;
const CURRENCY = loadCanonical<Record<string, Draft>>("execution-pending-control-currency.synthetic");
const CONTROL = loadCanonical<Record<string, Draft>>("execution-pending-control.synthetic");

function recalls(body: unknown): DiscoveredRecall[] {
  const read = readPendingRecallDiscoveryV1(body);
  if (read === null || read.kind !== "pending_recall_discovery") throw new Error("fixture does not read");
  return [...read.discovery.items];
}
const [WAITING, UNKNOWN] = recalls(CURRENCY.discovery_open) as [DiscoveredRecall, DiscoveredRecall];
const POLICY = "TEST_ONLY:portal-policy";

function preview(body: unknown): Result<PendingControlPreviewRead> {
  const value = readPendingControlPreviewV1(body, "USDT");
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
}
const refuse = (status: "denied" | "unavailable" | "terminal", reason: string): Result<PendingControlPreviewRead> => ({ ok: false, status, reason });

function port(answer: (intent: PendingControlIntentWire) => Result<PendingControlPreviewRead> | Promise<Result<PendingControlPreviewRead>>) {
  const previewPendingControl = vi.fn(async (intent: PendingControlIntentWire) => answer(intent));
  return { api: { previewPendingControl } as unknown as ExecutionApi, previewPendingControl };
}

const target = (over: Record<string, unknown> = {}) => ({
  workspaceId: "ws_TEST_ONLY", resource: { kind: "PORTFOLIO" as const, id: "TEST_ONLY:portfolio" }, environment: "paper" as const, recall: WAITING, policyRevision: POLICY, ...over,
});
const mount = (api: ExecutionApi, over: Record<string, unknown> = {}) =>
  render(<MemoryRouter><PendingControlPreview api={api} target={target(over)} /></MemoryRouter>);

const button = () => screen.getByRole("button", { name: /^Preview control$|^Previewing$/ }) as HTMLButtonElement;
const type = (text: string) => fireEvent.change(screen.getByLabelText("Reason"), { target: { value: text } });
const press = async () => { await act(async () => { fireEvent.click(button()); }); };

describe("shut: one reason, a visible one, and nothing is sent", () => {
  it.each<[string, Record<string, unknown>, RegExp, string]>([
    ["no served policy revision", { policyRevision: null }, /policy revision.*not published/i, "POLICY_REVISION_NOT_PUBLISHED"],
    ["an unknown outcome", { recall: UNKNOWN }, /Outcome unknown/, "RECALL_OUTCOME_UNKNOWN"],
    ["no workspace", { workspaceId: null }, /No workspace is named/, "WORKSPACE_NOT_PUBLISHED"],
  ])("%s", (_name, over, words, code) => {
    const { api, previewPendingControl } = port(() => preview(CONTROL.preview_allowed));
    mount(api, over);
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(words)).toBeTruthy();
    expect(document.querySelector("[data-state='shut']")?.getAttribute("title")).toBe(`Reason code: ${code}`);
    expect(screen.queryByLabelText("Reason")).toBeNull();
    expect(previewPendingControl).not.toHaveBeenCalled();
  });
});

describe("open: the versions are shown, not typed", () => {
  it("lists the five served counters as text and offers no field for them", () => {
    mount(port(() => preview(CONTROL.preview_allowed)).api);
    const versions = screen.getByLabelText("Versions the preview is checked against");
    for (const [label, value] of [["Budget version", "9007199254740993"], ["Source version", "11"], ["Parent version", "12"], ["Book version", "13"], ["Command version", "14"]]) {
      expect(within(versions).getByText(label).nextElementSibling!.textContent).toBe(value);
    }
    // The only free text is the reason; the other control is the operation choice.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(within(versions).queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/cannot be edited here/)).toBeTruthy();
  });

  it("Preview stays off until there is a reason, and says why", () => {
    mount(port(() => preview(CONTROL.preview_allowed)).api);
    expect(button().disabled).toBe(true);
    expect(screen.getByText("A reason is required.")).toBeTruthy();
    type("Release the remainder");
    expect(button().disabled).toBe(false);
    expect(screen.getByText("Ready to preview")).toBeTruthy();
    type("bad‮text");
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/control or direction character/)).toBeTruthy();
  });

  it("offers exactly the two published controls", () => {
    mount(port(() => preview(CONTROL.preview_allowed)).api);
    const options = within(screen.getByLabelText("Control")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Apply pending", "Cancel remaining"]);
  });
});

describe("sending", () => {
  it("sends the published body: counters from the recall, key in body, operation as chosen", async () => {
    const { api, previewPendingControl } = port(() => preview(CONTROL.preview_cancel));
    mount(api);
    fireEvent.change(screen.getByLabelText("Control"), { target: { value: "CANCEL_REMAINING" } });
    type("Stop the recall");
    await press();
    expect(previewPendingControl).toHaveBeenCalledTimes(1);
    const intent = previewPendingControl.mock.calls[0]![0];
    expect(intent).toMatchObject({
      schema_version: "portal.execution.pending-recall-intent.v1", workspace_id: "ws_TEST_ONLY", environment: "paper", expected_policy_revision: POLICY,
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" },
      business_payload: {
        operation: "CANCEL_REMAINING", reason: "Stop the recall", command_id: "TEST_ONLY:original-recall", currency: "USDT", recipient_kind: "PORTFOLIO",
        expected_versions: { budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" },
      },
    });
    expect(intent.business_payload.idempotency_key).toMatch(/^pending_control:/);
  });

  it("a second click while a request is in flight is ignored", async () => {
    let release: (value: Result<PendingControlPreviewRead>) => void = () => undefined;
    const { api, previewPendingControl } = port(() => new Promise((resolve) => { release = resolve; }));
    mount(api);
    type("Release the remainder");
    await press();
    expect(button().textContent).toBe("Previewing");
    expect(button().disabled).toBe(true);
    fireEvent.click(button());
    expect(previewPendingControl).toHaveBeenCalledTimes(1);
    await act(async () => { release(preview(CONTROL.preview_allowed)); });
    expect(button().textContent).toBe("Preview control");
  });

  it("an allowed preview: the prediction, exact amounts, digest and expiry, and the sentence that nothing was applied", async () => {
    const { api } = port(() => preview(CONTROL.preview_allowed));
    mount(api);
    type("Release the remainder");
    await press();
    const result = await screen.findByRole("status");
    expect(within(result).getByText("Preview allowed")).toBeTruthy();
    expect(within(result).getByText("Would become").nextElementSibling!.textContent).toBe("Waiting for encumbrance");
    expect(within(result).getByText("Change").nextElementSibling!.textContent).toBe("25 USDT");
    expect(within(result).getByText("Pending").nextElementSibling!.textContent).toBe("75 USDT");
    expect(within(result).getByText("Digest").nextElementSibling!.textContent).toBe("sha256:" + "b".repeat(64));
    expect(within(result).getByText("Blockers").nextElementSibling!.textContent).toBe("TEST_ONLY:encumbrance-open");
    expect(within(result).getByText("Expires").nextElementSibling!.textContent).toMatch(/\d/);
    expect(result.textContent).toContain(PREVIEW_ONLY_COPY);
    // There is no way from here to send the control: the only button is Preview.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Preview control"]);
  });

  it("a preview that is not allowed shows its closed code and the Portal's words", async () => {
    const { api } = port(() => preview(CONTROL.preview_blocked));
    mount(api);
    type("Release the remainder");
    await press();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Preview not allowed");
    expect(alert.textContent).toContain("PENDING_CONTROL_NOT_QUALIFIED");
    expect(alert.textContent).toContain("not qualified");
    expect(alert.textContent).toContain(PREVIEW_ONLY_COPY);
  });

  it("a typed refusal shows the closed code and the Portal's sentence, with the server's text nowhere", async () => {
    const { api } = port(() => refuse("denied", "ACCESS_DENIED: You do not have access to preview this control."));
    mount(api);
    type("Release the remainder");
    await press();
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.outcome).toBe("refused");
    expect(alert.textContent).toContain("ACCESS_DENIED");
    expect(alert.textContent).toContain("You do not have access");
  });

  it("a relay denial (409) says whether anything reached the source and whether a retry is allowed", async () => {
    const text = "The apply was denied and nothing reached the Trading System. Nothing has changed, and retrying this request will be refused identically.";
    const { api } = port(() => refuse("denied", text));
    mount(api);
    type("Release the remainder");
    await press();
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.outcome).toBe("refused");
    expect(alert.textContent).toContain("nothing reached the Trading System");
    expect(alert.textContent).toContain("refused identically");
  });

  it("a request that did not complete says it sent nothing that applies, and can be asked again under the SAME reference", async () => {
    let n = 0;
    const { api, previewPendingControl } = port(() => (n++ === 0 ? refuse("unavailable", "The preview request never reached the Portal.") : preview(CONTROL.preview_allowed)));
    mount(api);
    type("Release the remainder");
    await press();
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.outcome).toBe("incomplete");
    expect(alert.textContent).toContain("did not complete");
    await press();
    await screen.findByText("Preview allowed");
    const [first, second] = previewPendingControl.mock.calls.map((call) => call[0].business_payload.idempotency_key);
    expect(second).toBe(first);
  });

  it("a changed reason (a changed intent) is a new reference", async () => {
    const { api, previewPendingControl } = port(() => refuse("unavailable", "The preview request never reached the Portal."));
    mount(api);
    type("Release the remainder");
    await press();
    type("Release the remainder now");
    await press();
    const [first, second] = previewPendingControl.mock.calls.map((call) => call[0].business_payload.idempotency_key);
    expect(second).not.toBe(first);
  });

  it("a thrown request is an incomplete one, not a crash", async () => {
    const { api } = port(() => { throw new Error("boom"); });
    mount(api);
    type("Release the remainder");
    await press();
    const alert = await screen.findByRole("alert");
    expect(alert.dataset.outcome).toBe("incomplete");
    expect(alert.textContent).not.toContain("boom");
  });

  it("an answer for a recall the form has left is dropped, never shown as the new one's", async () => {
    let release: (value: Result<PendingControlPreviewRead>) => void = () => undefined;
    const { api } = port(() => new Promise((resolve) => { release = resolve; }));
    const view = render(<MemoryRouter><PendingControlPreview api={api} target={target()} /></MemoryRouter>);
    type("Release the remainder");
    await press();
    view.rerender(<MemoryRouter><PendingControlPreview api={api} target={target({ policyRevision: "TEST_ONLY:next" })} /></MemoryRouter>);
    await act(async () => { release(preview(CONTROL.preview_allowed)); });
    expect(screen.queryByText("Preview allowed")).toBeNull();
    expect(button().disabled).toBe(true);
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("");
  });

  it("editing after a result clears the result: an old preview is not the answer to new inputs", async () => {
    const { api } = port(() => preview(CONTROL.preview_allowed));
    mount(api);
    type("Release the remainder");
    await press();
    await screen.findByText("Preview allowed");
    type("Release the remainder now");
    expect(screen.queryByText("Preview allowed")).toBeNull();
  });

  it("keyboard: the operation is a native select and Preview is reached and pressed with Enter/Space like any button", async () => {
    const { api, previewPendingControl } = port(() => preview(CONTROL.preview_allowed));
    mount(api);
    type("Release the remainder");
    button().focus();
    expect(document.activeElement).toBe(button());
    await act(async () => { fireEvent.click(button()); });
    expect(previewPendingControl).toHaveBeenCalledTimes(1);
  });
});

describe("in the dock section: dark unless the build enables command previews", () => {
  const discovery = (body: unknown): Result<PendingRecallDiscoveryRead> => {
    const value = readPendingRecallDiscoveryV1(body);
    return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
  };
  const section = (props: Record<string, unknown>) => {
    const api = {
      getPendingRecallDiscovery: vi.fn(async () => discovery(CURRENCY.discovery_open)),
      previewPendingControl: vi.fn(async () => preview(CONTROL.preview_allowed)),
    } as unknown as ExecutionApi;
    render(
      <MemoryRouter>
        <PendingRecallsSection api={api} workspaceId="ws_TEST_ONLY" targetType="PORTFOLIO" targetId="TEST_ONLY:portfolio" environment="paper" {...props} />
      </MemoryRouter>,
    );
    return api;
  };

  it("off (the default): no control is drawn at all", async () => {
    section({});
    await screen.findByLabelText("Open recalls");
    expect(screen.queryByRole("button", { name: "Preview control" })).toBeNull();
    expect(screen.queryByText(/Command previews/)).toBeNull();
  });

  it("on without a served policy revision: the control is shut with the typed gap, on the recall with versions", async () => {
    section({ previewEnabled: true });
    await screen.findByLabelText("Open recalls");
    const buttons = screen.getAllByRole("button", { name: "Preview control" }) as HTMLButtonElement[];
    // One per recall: the WAITING one is shut for the policy, the UNKNOWN one for its outcome.
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(screen.getByText(/policy revision.*not published/i)).toBeTruthy();
    expect(screen.getByText(/Outcome unknown: the Portal holds no receipt/)).toBeTruthy();
  });

  it("on with a served policy revision: the WAITING recall opens, the UNKNOWN one stays shut", async () => {
    const api = section({ previewEnabled: true, policyRevision: POLICY });
    await screen.findByLabelText("Open recalls");
    const first = within(screen.getByLabelText("Open recalls")).getAllByRole("listitem").filter((li) => li.classList.contains("exec-ops-recall"))[0]!;
    const reason = within(first).getByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "Release the remainder" } });
    await act(async () => { fireEvent.click(within(first).getByRole("button", { name: "Preview control" })); });
    await waitFor(() => expect((api as unknown as { previewPendingControl: ReturnType<typeof vi.fn> }).previewPendingControl).toHaveBeenCalledTimes(1));
    const second = within(screen.getByLabelText("Open recalls")).getAllByRole("listitem").filter((li) => li.classList.contains("exec-ops-recall"))[1]!;
    expect((within(second).getByRole("button", { name: "Preview control" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
