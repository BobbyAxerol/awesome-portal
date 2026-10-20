/**
 * The review-note composer: the one real write on the stage screens
 * (`POST /governance/sandbox/capture-note`), through the port's `captureSandboxNote`.
 *
 * The contract under test: open only when the server says so, the server's 8 to 1000
 * characters, never optimistic, idempotent by intent, one request for two clicks, the server's
 * typed refusal shown and nothing kept, and a re-read after a recorded note.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Result } from "../../../api/ports";
import type { ReviewCapture, SandboxNoteInput } from "../../../api/reviewCapture";
import SandboxScreen from "./index";
import { capabilitiesBody, captureBody, fakeApi, okRead, v1Body, v2Body, type FakeApi, type FakeOptions } from "./testApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ENTRY = "/deployments/sandbox/dep_TEST_ONLY_sbx";
const NOTE = "Checked the testnet account against the broker.";
const LABEL = "What you checked, and what you concluded";

async function mount(options: FakeOptions = {}, entry = ENTRY): Promise<FakeApi> {
  const api = fakeApi(options);
  render(
    <MemoryRouter initialEntries={[entry]}>
      <SandboxScreen api={api} deploymentId="dep_TEST_ONLY_sbx" />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Sandbox certification" });
  await waitFor(() => expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).not.toBe("loading"));
  await waitFor(() => expect(screen.queryByText(/Asking the server whether it offers this note/)).toBeNull());
  return api;
}
const field = () => screen.getByLabelText(LABEL) as HTMLTextAreaElement;
const record = () => screen.getByRole("button", { name: /^Record review note|^Recording/ }) as HTMLButtonElement;
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const hint = () => document.getElementById(record().getAttribute("aria-describedby")!)?.textContent;
const panel = () => screen.getByRole("heading", { name: "Record review note" }).closest("section") as HTMLElement;

/** A capture whose answer the test releases by hand. */
function deferred() {
  let release: (r: Result<ReviewCapture>) => void = () => undefined;
  const promise = new Promise<Result<ReviewCapture>>((resolve) => { release = resolve; });
  return { promise, release };
}

describe("open only when the server says so (D10)", () => {
  it("AVAILABLE: the form is there, the button is off until the note is long enough", async () => {
    const api = await mount();
    expect(api.capabilities).toHaveBeenCalledWith("ws_TEST_ONLY_parent");
    expect(screen.getByText("A note records a review. It does not pass a step.")).toBeTruthy();
    expect(record().disabled).toBe(true);
    expect(hint()).toBe("Needs at least 8 characters (0 so far)");
    expect(field().placeholder).toBe("At least 8 characters");
  });

  it("UNAVAILABLE: no form; the action is disabled with the profile reason and the server's own code kept apart", async () => {
    await mount({ capabilities: { ok: true, value: capabilitiesBody("UNAVAILABLE", "ADMIN_REQUIRED") } });
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    const button = within(panel()).getByRole("button", { name: "Record review note" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Not enabled for this profile");
    expect(within(panel()).getByText("Server reason: ADMIN_REQUIRED")).toBeTruthy();
    expect(within(panel()).getByRole("link", { name: /My access/ })).toBeTruthy();
  });

  it.each([
    ["RETAINED_REVIEW_READ_ONLY", "Read-only on this build"],
    ["ADMIN_ROLE_REQUIRED", "Needs the approver grant"],
    ["GOVERNANCE_CAPABILITY_REQUIRED", "Needs the approver grant"],
    ["GOVERNANCE_SCOPE_MISMATCH", "Needs the approver grant"],
    ["CAPTURE_PROJECTION_NOT_AUTHORIZED", "Not enabled for this profile"],
  ])("BE-P7: the server's reason %s reads in words, the code stays apart, and the form stays shut", async (code, words) => {
    await mount({ capabilities: { ok: true, value: capabilitiesBody("UNAVAILABLE", code) } });
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    const button = within(panel()).getByRole("button", { name: "Record review note" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(words);
    expect(within(panel()).getByText(`Server reason: ${code}`)).toBeTruthy();
  });

  it("the role never decides: a manager and a reviewer see exactly what the server's answer says", async () => {
    // The screen reads no session and no role name; the same body with AVAILABLE opens it for anyone the server lets in.
    await mount({ capabilities: { ok: true, value: capabilitiesBody("AVAILABLE") } });
    expect(screen.getByLabelText(LABEL)).toBeTruthy();
  });

  it("the capabilities read failed: the form is shut and the reason is the server's, not a guess that it is open", async () => {
    const api = await mount({ capabilities: { ok: false, status: "unavailable", reason: "503: capabilities down" } });
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    const button = within(panel()).getByRole("button", { name: "Record review note" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Not available. 503: capabilities down");
    expect(api.capture).not.toHaveBeenCalled();
  });

  it("the server listed no SANDBOX_NOTE row: unknown, never open", async () => {
    const caps = capabilitiesBody("AVAILABLE");
    await mount({ capabilities: { ok: true, value: { ...caps, actions: caps.actions.filter((a) => a.id !== "SANDBOX_NOTE") } } });
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    expect(within(panel()).getByText(/The server did not list this action/)).toBeTruthy();
  });

  it("while the capability is being asked, the panel says so and offers nothing", async () => {
    const api = fakeApi();
    api.capabilities.mockImplementation(() => new Promise(() => undefined));
    render(<MemoryRouter initialEntries={[ENTRY]}><SandboxScreen api={api} deploymentId="dep_TEST_ONLY_sbx" /></MemoryRouter>);
    await screen.findByRole("heading", { level: 1, name: "Sandbox certification" });
    expect(within(panel()).getByRole("status").textContent).toContain("Asking the server whether it offers this note");
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it("a V1 body names no workspace: the runtime manifest's is used, as the V1 screen does", async () => {
    const api = await mount({ read: okRead(v1Body()), manifestWorkspace: "ws_TEST_ONLY_manifest" });
    expect(api.capabilities).toHaveBeenCalledWith("ws_TEST_ONLY_manifest");
    expect(screen.getByLabelText(LABEL)).toBeTruthy();
  });

  it("a V1 body with no workspace anywhere: shut, with why, and the server is not asked", async () => {
    const api = await mount({ read: okRead(v1Body()) });
    expect(api.capabilities).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    expect(within(panel()).getByText(/The workspace was not published for this read/)).toBeTruthy();
  });

  it("the workspace of the URL wins over the manifest's; a body that names its own workspace is the record's truth and binds the note", async () => {
    const v1 = await mount({ read: okRead(v1Body()), manifestWorkspace: "ws_TEST_ONLY_manifest" }, `${ENTRY}?workspace_id=ws_TEST_ONLY_url`);
    expect(v1.capabilities).toHaveBeenCalledWith("ws_TEST_ONLY_url");
    cleanup();
    const v2 = await mount({ manifestWorkspace: "ws_TEST_ONLY_manifest" }, `${ENTRY}?workspace_id=ws_TEST_ONLY_url`);
    // The read was asked in the URL's workspace; the note is bound to the workspace the stored record says it is in.
    expect(v2.read).toHaveBeenCalledWith("dep_TEST_ONLY_sbx", { workspaceId: "ws_TEST_ONLY_url" });
    expect(v2.capabilities).toHaveBeenCalledWith("ws_TEST_ONLY_parent");
  });
});

describe("the server's bounds, 8 to 1000 (D8: the hi-fi's 24 is not the rule)", () => {
  it.each([
    [7, true, "Needs at least 8 characters (7 so far)"],
    [8, false, "8 characters"],
    [24, false, "24 characters"],
    [1000, false, "1000 characters"],
    [1001, true, "At most 1000 characters (1001 so far)"],
  ])("%i characters: disabled=%s", async (n, disabled, text) => {
    await mount();
    type("x".repeat(n));
    expect(record().disabled).toBe(disabled);
    expect(hint()).toBe(text);
  });

  it("the count is of the trimmed text, so padding does not count", async () => {
    await mount();
    type("      abc      ");
    expect(hint()).toBe("Needs at least 8 characters (3 so far)");
  });

  it("every disabled state names its reason through aria-describedby", async () => {
    await mount();
    for (const text of ["", "short", "x".repeat(1001)]) {
      type(text);
      expect(record().disabled).toBe(true);
      expect(hint()?.length).toBeGreaterThan(0);
    }
  });
});

describe("recording is never optimistic", () => {
  it("sends exactly the server's fields once, shows Recording while it waits, and a receipt only after ok", async () => {
    const wait = deferred();
    const api = await mount({ capture: () => wait.promise });
    type(`  ${NOTE}  `);
    fireEvent.click(record());
    expect(api.capture).toHaveBeenCalledTimes(1);
    const sent = api.capture.mock.calls[0]![0] as SandboxNoteInput;
    expect(sent).toEqual({
      workspace_id: "ws_TEST_ONLY_parent",
      request_key: expect.stringMatching(/^sandbox_note:[A-Za-z0-9._:-]+$/),
      summary: NOTE,
      certification_id: "cert_TEST_ONLY_parent",
      expected_workflow_version: 3,
    });
    // In flight: nothing is recorded yet, and the field cannot be edited under the request.
    expect(record().textContent).toBe("Recording");
    expect(record().disabled).toBe(true);
    expect(field().disabled).toBe(true);
    expect(screen.queryByText("Recorded")).toBeNull();
    expect(within(panel()).queryByRole("status")).toBeNull();
    await act(async () => wait.release({ ok: true, value: captureBody() }));
    expect(await screen.findByText("Recorded")).toBeTruthy();
  });

  it("the receipt says what was and was not done, and keeps the server's words", async () => {
    await mount({ capture: async () => ({ ok: true, value: captureBody({ workflow_version: 4 }) }) });
    type(NOTE);
    fireEvent.click(record());
    const receipt = await screen.findByText(/The Portal recorded this review\./);
    const box = receipt.closest(".exec-sbx-receipt") as HTMLElement;
    expect(box.textContent).toContain("The source verdict stays NOT_ASSERTED and nothing was sent to the Trading System.");
    expect(box.textContent).toContain("Workflow version4");
    expect(box.textContent).toContain("ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE");
    expect(box.textContent).toMatch(/Referencesandbox_note:/);
    // It is a record, not a pass: nothing on the screen changed to say a step passed.
    expect(screen.getByRole("heading", { name: "Exit review" }).closest("section")!.textContent).not.toContain("Eligible");
  });

  it("a replay is worded as one: nothing was duplicated", async () => {
    await mount({ capture: async () => ({ ok: true, value: captureBody({ replayed: true }) }) });
    type(NOTE);
    fireEvent.click(record());
    expect(await screen.findByText("Matched an earlier note")).toBeTruthy();
    expect(screen.getByText(/nothing was duplicated/)).toBeTruthy();
  });

  it("after a recorded note the certification is read again (the workflow version the next note binds to may have moved)", async () => {
    const api = await mount({ read: [okRead(v2Body()), okRead(v2Body("sandbox"))] });
    expect(api.read).toHaveBeenCalledTimes(1);
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    // The screen stayed up through the re-read: no loading frame replaced it.
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("Write another clears the form; Copy reference copies the key, or says the browser would not", async () => {
    await mount();
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    // No clipboard in this environment: say so, with where to select it.
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    expect(await screen.findByText("This browser would not copy it. Select the reference above.")).toBeTruthy();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }));
    await screen.findByText("Reference copied.");
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^sandbox_note:/));
    fireEvent.click(screen.getByRole("button", { name: "Write another" }));
    expect(field().value).toBe("");
    expect(record().disabled).toBe(true);
  });
});

describe("the server's refusal is shown as given and nothing is kept", () => {
  it.each([
    ["denied", "403: ADMIN role required"],
    ["unavailable", "409: the workflow version moved, reload and review before recording"],
    ["stale", "429: too many requests"],
  ] as const)("%s", async (status, reason) => {
    const api = await mount({ capture: async () => ({ ok: false, status, reason }) });
    type(NOTE);
    fireEvent.click(record());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(`(${status})`);
    expect(alert.textContent).toContain(reason);
    expect(screen.queryByText("Recorded")).toBeNull();
    // The text is kept for another try, the form is still there, and the certification was not re-read.
    expect(field().value).toBe(NOTE);
    expect(record().disabled).toBe(false);
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  it("a request that throws does NOT say nothing was recorded: the outcome is unknown", async () => {
    await mount({ capture: async () => { throw new Error("network"); } });
    type(NOTE);
    fireEvent.click(record());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown: it may have been recorded.");
    expect(alert.textContent).toContain("Retrying sends the same reference");
    expect(alert.textContent).not.toContain("Nothing was recorded");
    expect(alert.textContent).not.toContain("did not record");
    expect(record().disabled).toBe(false);
  });

  it("editing the text clears the refusal that belonged to the old text", async () => {
    await mount({ capture: async () => ({ ok: false, status: "unavailable", reason: "502: upstream" }) });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByRole("alert");
    type(`${NOTE} More.`);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const UNKNOWN = "REVIEW_CAPTURE_OUTCOME_UNKNOWN: The Portal answered but the answer could not be read.";

describe("an outcome the client could not learn is unknown, not refused", () => {
  it("the port's unknown marker (5xx / 408 / unreadable 2xx) is worded as unknown and the same text retries under the same reference", async () => {
    const answers: Result<ReviewCapture>[] = [
      { ok: false, status: "unavailable", reason: UNKNOWN },
      { ok: true, value: captureBody({ replayed: true }) },
    ];
    const api = await mount({ capture: async () => answers.shift()! });
    type(NOTE);
    fireEvent.click(record());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unknown: it may have been recorded.");
    expect(alert.textContent).not.toContain("did not record");
    // The edit-free retry is the same reference; the receipt settles it.
    fireEvent.click(record());
    await screen.findByText("Matched an earlier note");
    const keys = api.capture.mock.calls.map((c) => (c[0] as SandboxNoteInput).request_key);
    expect(keys[1]).toBe(keys[0]);
    expect(screen.queryByText(/Unknown: it may have been recorded/)).toBeNull();
  });

  it("an edited text while unknown stays visibly warned and goes out under a NEW reference", async () => {
    const api = await mount({ capture: async () => ({ ok: false, status: "unavailable", reason: UNKNOWN }) });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByRole("alert");
    type(`${NOTE} Edited.`);
    // The old text's uncertainty is not cleared by editing; the warning says an earlier attempt may exist.
    const warn = screen.getByRole("alert");
    expect(warn.textContent).toContain("An earlier attempt may have been recorded");
    expect(warn.textContent).toContain("new reference");
    fireEvent.click(record());
    await waitFor(() => expect(api.capture).toHaveBeenCalledTimes(2));
    const keys = api.capture.mock.calls.map((c) => (c[0] as SandboxNoteInput).request_key);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("a note recorded under a different text still tells the operator the earlier attempt may exist", async () => {
    const answers: Result<ReviewCapture>[] = [
      { ok: false, status: "unavailable", reason: UNKNOWN },
      { ok: true, value: captureBody() },
    ];
    await mount({ capture: async () => answers.shift()! });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByRole("alert");
    type(`${NOTE} Edited.`);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    expect(screen.getByRole("alert").textContent).toContain("An earlier attempt may have been recorded too");
  });

  it("a definite refusal under the same reference settles it as not recorded", async () => {
    const answers: Result<ReviewCapture>[] = [
      { ok: false, status: "unavailable", reason: UNKNOWN },
      { ok: false, status: "denied", reason: "403: ADMIN role required" },
    ];
    await mount({ capture: async () => answers.shift()! });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText(/Unknown: it may have been recorded/);
    fireEvent.click(record());
    await screen.findByText(/The server did not record this note \(denied\)/);
    expect(screen.queryByText(/Unknown: it may have been recorded/)).toBeNull();
  });
});

describe("idempotent by intent", () => {
  it("the same text sent again replays under the same key; an edited text is another intent and gets another key", async () => {
    const answers: Result<ReviewCapture>[] = [
      { ok: false, status: "unavailable", reason: "502: upstream" },
      { ok: false, status: "unavailable", reason: "502: upstream" },
      { ok: false, status: "unavailable", reason: "502: upstream" },
    ];
    const api = await mount({ capture: async () => answers.shift()! });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByRole("alert");
    fireEvent.click(record());
    await waitFor(() => expect(api.capture).toHaveBeenCalledTimes(2));
    type(`${NOTE} Edited.`);
    fireEvent.click(record());
    await waitFor(() => expect(api.capture).toHaveBeenCalledTimes(3));
    const keys = api.capture.mock.calls.map((c) => (c[0] as SandboxNoteInput).request_key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    // Whitespace around the same words is the same intent.
    expect((api.capture.mock.calls[2]![0] as SandboxNoteInput).summary).toBe(`${NOTE} Edited.`);
  });

  it("a recorded note retires its key: the next note is a new record", async () => {
    const api = await mount();
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    fireEvent.click(screen.getByRole("button", { name: "Write another" }));
    type(NOTE);
    fireEvent.click(record());
    await waitFor(() => expect(api.capture).toHaveBeenCalledTimes(2));
    const keys = api.capture.mock.calls.map((c) => (c[0] as SandboxNoteInput).request_key);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("two clicks in the same moment are one request", async () => {
    const wait = deferred();
    const api = await mount({ capture: () => wait.promise });
    type(NOTE);
    const button = record();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.capture).toHaveBeenCalledTimes(1);
    await act(async () => wait.release({ ok: true, value: captureBody() }));
    await screen.findByText("Recorded");
    expect(api.capture).toHaveBeenCalledTimes(1);
  });
});

describe("what a note is bound to", () => {
  it("a V1 body binds the note to its own certification id and workflow version, in the manifest's workspace", async () => {
    const api = await mount({ read: okRead(v1Body()), manifestWorkspace: "ws_TEST_ONLY_manifest" });
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    expect(api.capture.mock.calls[0]![0]).toMatchObject({ workspace_id: "ws_TEST_ONLY_manifest", certification_id: "scert_fixture_77", expected_workflow_version: 1 });
  });

  it("a V2 body binds it to the version the Portal stored (3), never to a number the screen made up", async () => {
    const api = await mount();
    type(NOTE);
    fireEvent.click(record());
    await screen.findByText("Recorded");
    expect(api.capture.mock.calls[0]![0]).toMatchObject({ certification_id: "cert_TEST_ONLY_parent", expected_workflow_version: 3 });
  });
});
