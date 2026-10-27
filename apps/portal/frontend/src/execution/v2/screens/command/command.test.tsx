/**
 * Command confirmation, receipt and status (UXM-09, fixture lane): the flow, the lookup, the disabled operations and the story page.
 *
 * Lane: FIXTURE_LAB (unit, jsdom). The port is the scripted fake; `fetch` throws if anything calls it. Nothing here proves a real server's
 * answers or that any command was ever accepted by anything: it proves how the screen behaves for each answer a port can give.
 *
 * UX-F18 (repeated clicks, timeout, back, cancel, reconnect) is covered by the double-click, the unknown/retry/discard and the unmount
 * tests; UX-F17 (applied + projection lag + venue partial) by `applied-lagging`; UX-F14 to UX-F16 by the certification rows.
 */
import { whyText } from "../../gapWhyTestUtil";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLOCKED_REASON_TEXT, readCommandCatalogue, type CommandCatalogue } from "../../../adminCatalog";
import { catalogueOf } from "../../readers/commandCatalogue";
import { EXEC_V2_PENDING_KEYS, EXEC_V2_SCREEN_KEYS, isV2Screen, parseV2Manifest } from "../../flags";
import { loadCanonical } from "../../testkit/loadCanonical";
import { Certification } from "./Certification";
import { CommandFlow } from "./CommandFlow";
import { DisabledOperations } from "./DisabledOperations";
import { SUBMIT_LABEL } from "./ConfirmPanel";
import { createFakeCommandPort, type FakeCommandPort, type FakePortOptions } from "./fakePort";
import CommandStoryPage, { COMMAND_SCREEN_KEY } from "./index";
import { CERTIFICATION_FLOWS, CERTIFICATION_PHRASE } from "./model";
import { DISABLED_PORT, READ_DISABLED_REASON, SEND_DISABLED_REASON, type CommandPort, type LookupInput, type PortResponse, type SubmitInput } from "./port";
import { DISCARD_WARNING, FAKE_PORT_NOTE } from "./ReceiptPanel";
import { StatusLookup } from "./StatusLookup";
import {
  CAPITAL_INTENT,
  COMMAND_ID_APPLIED,
  COMMAND_ID_DELIVERY_UNKNOWN,
  COMMAND_ID_LANDED,
  COMMAND_ID_REVOKED,
  COMMAND_ID_UNVERIFIED,
  F0_ATTEMPT_NONE_BODY,
  F0_OPERATION_BODY,
  STORY_NOW_MS,
  problemBody,
  type ScenarioId,
} from "./storyData";
import { PLAN_EXPIRED_HOLD, clearCommandIntents } from "./useCommandFlow";

/** The story reads its catalogue through the strict V2 reader (`catalogueLane.ts`); the V1 read below exists only for the `ExecutionApi` mock, whose port type is V1. */
const CATALOGUE = catalogueOf(loadCanonical("execution-command-catalog.served"))!;
const API_CATALOGUE: CommandCatalogue = readCommandCatalogue(loadCanonical("execution-command-catalog.served"))!;
const fetchSpy = vi.fn(async () => {
  throw new Error("the fixture lane must never reach a network");
});

beforeEach(() => {
  clearCommandIntents();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(scenario: ScenarioId, options: FakePortOptions = {}, lane: "F0" | "CAPITAL" = scenario.startsWith("f0") ? "F0" : "CAPITAL", port?: CommandPort) {
  const fake = createFakeCommandPort({ scenario, ...options });
  const ui = (p: CommandPort) => (
    <MemoryRouter>
      <CommandFlow port={p} lane={lane} capital={CAPITAL_INTENT} now={() => STORY_NOW_MS} />
    </MemoryRouter>
  );
  const view = render(ui(port ?? fake));
  return { fake, view };
}

const reasonBox = () => screen.getByRole("textbox", { name: /^Reason/ });
const wordBox = () => screen.getByRole("textbox", { name: /Type .* to confirm/ });
const ackBox = () => screen.getByRole("checkbox");
const submitBtn = () => screen.getByRole("button", { name: SUBMIT_LABEL });

async function readPlan() {
  fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
  await screen.findByLabelText(/^Plan: /);
}
function fill(word: string, reason = "Month-end top-up agreed with treasury.") {
  fireEvent.change(reasonBox(), { target: { value: reason } });
  fireEvent.change(wordBox(), { target: { value: word } });
  fireEvent.click(ackBox());
}
async function planAndFill(scenario: ScenarioId, options: FakePortOptions = {}) {
  const lane = scenario.startsWith("f0") ? "F0" : "CAPITAL";
  const m = mount(scenario, options);
  await readPlan();
  fill(lane === "F0" ? "account/sync" : "TOP_UP");
  return m;
}
const submits = (fake: FakeCommandPort) => fake.calls.filter((c) => c.method === "submit");
async function send(fake: FakeCommandPort, expected: number) {
  fireEvent.click(submitBtn());
  await waitFor(() => expect(submits(fake).length).toBe(expected));
}

/* ═════════════════════════ the plan ═════════════════════════ */
describe("the plan", () => {
  it("nothing is called on mount: a plan is read only on a click", async () => {
    const { fake } = mount("f0-denied");
    await act(async () => {});
    expect(fake.calls).toEqual([]);
    expect(screen.getByText(/No plan has been read/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("current_primitive is shown from the plan's field: None for account/sync, and for emergency close 'not active' with the ids behind a disclosure", async () => {
    const { fake } = mount("f0-denied");
    await readPlan();
    const none = screen.getByLabelText(/^Plan: /);
    expect(within(none).getByText("Primitive").nextElementSibling!.textContent).toBe("None");
    expect(none.querySelector('[data-block="primitive"]')).toBeNull();
    cleanup();

    const dark: CommandPort = { ...fake, kind: "fixture", plan: async () => ({ kind: "response", status: 201, body: loadCanonical("execution-command-plan.emergency-close") }) };
    mount("f0-denied", {}, "F0", dark);
    await readPlan();
    const plan = screen.getByLabelText(/^Plan: /);
    expect(within(plan).getByText("Emergency close · not active")).toBeTruthy();
    const details = plan.querySelector('[data-block="primitive"]') as HTMLDetailsElement;
    expect(details.tagName).toBe("DETAILS");
    expect(details.querySelector("summary")!.textContent).toBe("Primitive details");
    expect(details.textContent).toContain("live.emergency-close");
    expect(details.textContent).toContain("LIVE_FULL");
  });

  it("F0: the published plan, its blocker in words, and cost and impact Not published: command preview (the Preview only intent axis), never a number", async () => {
    const { fake } = mount("f0-denied");
    await readPlan();
    expect(fake.calls.map((c) => c.method)).toEqual(["plan"]);
    const plan = screen.getByLabelText(/^Plan: /);
    expect(within(plan).getByText("COMMAND_RELAY_DISABLED")).toBeTruthy();
    expect(within(plan).getByText(/command relay is off/)).toBeTruthy();
    expect(within(plan).getByText(/Not published: command preview (the Preview only intent axis)/)).toBeTruthy();
    expect(within(plan).getByText(/none is computed on this page/)).toBeTruthy();
    expect(within(plan).getByText("sha256:2222222222222222222222222222222222222222222222222222222222222222")).toBeTruthy();
    expect(within(plan).getByText(/No request to the Trading System was made by this plan/)).toBeTruthy();
    expect(plan.textContent).not.toMatch(/\d+\.\d+ (USDT|USD)/);
  });

  it("capital: the exact amount with its unit, the int64 version as a string, the gate and the policy", async () => {
    mount("accepted");
    await readPlan();
    const plan = screen.getByLabelText(/^Plan: /);
    expect(within(plan).getByText("100.000000000000000001 USDT")).toBeTruthy();
    expect(within(plan).getByText("9007199254740993")).toBeTruthy();
    expect(within(plan).getByText("CAPITAL")).toBeTruthy();
    expect(within(plan).getByText("TEST_ONLY:policy1")).toBeTruthy();
    expect(within(plan).getByText(/Not published: command preview (the Preview only intent axis)/)).toBeTruthy();
  });

  it("a replayed plan says the server already knew the key", async () => {
    mount("f0-plan-replayed");
    await readPlan();
    expect(screen.getByText("Replayed")).toBeTruthy();
    expect(screen.getByText(/already knew this request key/)).toBeTruthy();
  });

  it("an expired plan keeps Submit closed however full the form is, and a click sends nothing", async () => {
    const { fake } = await planAndFill("f0-plan-expired");
    expect(screen.getAllByText("Expired", { selector: ".exec-flag" }).length).toBeGreaterThan(0);
    expect(submitBtn().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getAllByText(/plan has expired/i).length).toBeGreaterThan(0);
    fireEvent.click(submitBtn());
    await act(async () => {});
    expect(submits(fake)).toEqual([]);
  });

  it("a plan the server cannot produce is said, and Start again returns to the beginning", async () => {
    const fake = createFakeCommandPort({ scenario: "f0-denied" });
    vi.spyOn(fake, "plan").mockResolvedValue({ kind: "response", status: 503, body: {} });
    render(<MemoryRouter><CommandFlow port={fake} lane="F0" capital={CAPITAL_INTENT} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not produce a plan/);
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("button", { name: "Read the plan" })).toBeTruthy();
  });
});

/* ═════════════════════════ the typed confirmation ═════════════════════════ */
describe("the typed confirmation", () => {
  it("Submit is aria-disabled (still focusable) and the sentence names what is still needed, then opens", async () => {
    mount("f0-denied");
    await readPlan();
    expect(submitBtn().getAttribute("aria-disabled")).toBe("true");
    expect(submitBtn().hasAttribute("disabled")).toBe(false);
    expect(screen.getAllByText(/Still needed: a reason of 8 to 2,000 visible characters; to type account\/sync; to acknowledge/).length).toBeGreaterThan(0);
    fireEvent.change(reasonBox(), { target: { value: "Month-end top-up." } });
    fireEvent.change(wordBox(), { target: { value: "Account/Sync" } });
    expect(screen.getByText(/That is not the command/)).toBeTruthy();
    fireEvent.change(wordBox(), { target: { value: "account/sync" } });
    fireEvent.click(ackBox());
    expect(submitBtn().getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByText(/Nothing is sent until you click Submit/)).toBeTruthy();
  });

  it("Enter never submits: a keystroke in a field, a native submit event and a click on a closed Submit all send nothing", async () => {
    const { fake } = await planAndFill("f0-denied");
    fireEvent.keyDown(wordBox(), { key: "Enter" });
    fireEvent.keyDown(ackBox(), { key: "Enter" });
    fireEvent.submit(screen.getByRole("form", { name: "Confirm the command" }));
    await act(async () => {});
    expect(submits(fake)).toEqual([]);
    // A closed Submit is a click that does nothing.
    fireEvent.change(wordBox(), { target: { value: "nope" } });
    fireEvent.click(submitBtn());
    await act(async () => {});
    expect(submits(fake)).toEqual([]);
  });

  it("hidden and direction-changing characters in the reason are refused with their code points", async () => {
    mount("f0-denied");
    await readPlan();
    fireEvent.change(reasonBox(), { target: { value: `Top up ${String.fromCodePoint(0x202e)}now please` } });
    expect(screen.getByText(/Remove hidden or direction-changing characters \(U\+202E\)/)).toBeTruthy();
    expect(reasonBox().getAttribute("aria-invalid")).toBe("true");
  });

  it("one click sends one command: a second click while the first is in flight is refused synchronously", async () => {
    const hold = deferred();
    const { fake } = await planAndFill("f0-denied", { latency: (call) => (call.method === "submit" ? hold.promise : Promise.resolve()) });
    const button = submitBtn();
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(submits(fake).length).toBe(1));
    expect(submitBtn().getAttribute("aria-disabled")).toBe("true");
    // Focus stayed on the button while the send is in flight (aria-disabled, not disabled).
    expect(document.activeElement).toBe(submitBtn());
    await act(async () => {
      hold.resolve();
    });
    await screen.findByLabelText("Denied by the relay");
    expect(submits(fake)).toHaveLength(1);
  });
});

/* ═════════════════════════ receipts ═════════════════════════ */
describe("DENIED (the relay said no)", () => {
  it("shows the published denial: nothing reached the Trading System, no retry is offered, and focus moves to it", async () => {
    const { fake } = await planAndFill("f0-denied");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Denied by the relay");
    expect(document.activeElement).toBe(panel);
    expect(panel.getAttribute("role")).toBe("alert");
    expect(within(panel).getByText(/before any relay or source call/)).toBeTruthy();
    expect(within(panel).getByText("COMMAND_RELAY_DISABLED")).toBeTruthy();
    expect(within(panel).getByText("Retry allowed").nextSibling?.textContent).toBe("No");
    expect(within(panel).getByText("Request sent to the Trading System").nextSibling?.textContent).toBe("No");
    expect(within(panel).queryByRole("button", { name: /retry/i })).toBeNull();
    expect(within(panel).getByRole("link", { name: "Open in Operations" }).getAttribute("href")).toBe("/execution/operations?operation=op_01K3COMMANDPLAN000000000000");
    // The form is done: no Submit remains.
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
  });

  it("the denial can be looked up: Query the same intent reads the operation, which is blocked and not running", async () => {
    const { fake } = await planAndFill("f0-denied");
    await send(fake, 1);
    fireEvent.click(await screen.findByRole("button", { name: "Query the same intent" }));
    const found = await screen.findByLabelText("What the lookup found");
    expect(within(found).getByText("Blocked, not sent")).toBeTruthy();
    expect(within(found).getByText(/Nothing is running/)).toBeTruthy();
    expect(within(found).getByText("None: nothing was relayed")).toBeTruthy();
    expect(fake.calls.filter((c) => c.method === "lookup").map((c) => c.key)).toEqual([F0_OPERATION_BODY.operation_id]);
  });
});

describe("BE-P13: the F0 apply answers are the real wire bodies", () => {
  it("a first denial says the stored answer was not repeated; the denial comes from details, so nothing is read from the top level", async () => {
    const { fake } = await planAndFill("f0-denied");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Denied by the relay");
    expect(within(panel).getByText("Stored answer repeated").nextSibling?.textContent).toBe("No: first answer for this key");
    expect(within(panel).getByText("Request sent to the Trading System").nextSibling?.textContent).toBe("No");
  });

  it("a denial for a key the server already knew is the same denial with replayed true, and still a definite, non-retryable answer", async () => {
    const { fake } = await planAndFill("f0-denied-replayed");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Denied by the relay");
    expect(within(panel).getByText("Stored answer repeated").nextSibling?.textContent).toBe("Yes: the server already knew this key");
    expect(within(panel).getByText("Retry allowed").nextSibling?.textContent).toBe("No");
    expect(within(panel).queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("no answer, then a retry under the same key: the stored denial comes back replayed", async () => {
    const { fake } = await planAndFill("f0-timeout-then-denied");
    await send(fake, 1);
    fireEvent.click(await screen.findByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(submits(fake)).toHaveLength(2));
    const panel = await screen.findByLabelText("Denied by the relay");
    expect(within(panel).getByText("Stored answer repeated").nextSibling?.textContent).toBe("Yes: the server already knew this key");
  });

  it("a reused request key is a typed, definite refusal that created nothing: the request can be changed, and no other operation is named", async () => {
    const { fake } = await planAndFill("f0-key-conflict");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Rejected");
    expect(within(panel).getByText("REQUEST_KEY_PAYLOAD_CONFLICT")).toBeTruthy();
    expect(within(panel).getByText(/already used for a different command/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Change the request" })).toBeTruthy();
    expect(panel.textContent).not.toMatch(/op_/);
  });
});

describe("ACCEPTED (four independent answers)", () => {
  it("acknowledged is not applied: delivery is transport only, business is unknown, and no Applied flag exists", async () => {
    const { fake } = await planAndFill("accepted");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Accepted");
    expect(panel.getAttribute("role")).toBe("status");
    expect(within(panel).getByText(/That is not the same as applied/)).toBeTruthy();
    const facets = within(panel).getByRole("list", { name: "Four independent answers" });
    const rows = within(facets).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-dimension"))).toEqual(["delivery", "business", "projection", "venue"]);
    expect(within(rows[0]!).getByText("Acknowledged")).toBeTruthy();
    expect(within(rows[0]!).getByText(/does not say the command was applied/)).toBeTruthy();
    expect(within(rows[1]!).getByText("Unknown")).toBeTruthy();
    expect(within(rows[2]!).getByText("Catching up")).toBeTruthy();
    expect(within(panel).queryByText("Applied")).toBeNull();
    expect(within(panel).getByText("No amounts published yet. That is not zero.")).toBeTruthy();
    expect(within(panel).getByText(/Fixture status \(authority TEST_ONLY\)\. Not a product receipt/)).toBeTruthy();
    expect(within(panel).getByText(/Query the same intent\. Do not create a new command or a new key/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
  });

  it("UX-F17: applied, projection catching up and venue pending are three answers, with exact amounts and no resubmit", async () => {
    const { fake } = await planAndFill("applied-lagging");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Accepted");
    const rows = within(within(panel).getByRole("list", { name: "Four independent answers" })).getAllByRole("listitem");
    expect(within(rows[1]!).getByText("Applied")).toBeTruthy();
    expect(within(rows[2]!).getByText("Catching up")).toBeTruthy();
    expect(within(rows[2]!).getByText(/Never resubmit because a view is stale/)).toBeTruthy();
    expect(within(rows[3]!).getByText("Pending")).toBeTruthy();
    expect(within(panel).getAllByText("100.000000000000000001 USDT").length).toBeGreaterThanOrEqual(2);
    const fillLine = within(rows[3]!).getByText("Fill: not published");
    expect(fillLine.getAttribute("data-state")).toBe("not_published");
    expect(whyText(fillLine)).toMatch(/Not published: receipt state and amounts/);
    expect(within(rows[1]!).getByText("Reason: not applicable").getAttribute("data-state")).toBe("not_applicable");
    expect(within(panel).getByText("9007199254740994")).toBeTruthy();
    expect(within(panel).getAllByText(COMMAND_ID_APPLIED).length).toBeGreaterThan(0);
    expect(submits(fake)).toHaveLength(1);
  });

  it("Query the same intent looks the command up (a read) and never replaces the receipt", async () => {
    const { fake } = await planAndFill("accepted");
    await send(fake, 1);
    fireEvent.click(await screen.findByRole("button", { name: "Query the same intent" }));
    const found = await screen.findByLabelText("What the lookup found");
    expect(within(found).getByText(COMMAND_ID_LANDED)).toBeTruthy();
    expect(screen.getByLabelText("Accepted")).toBeTruthy();
    expect(fake.calls.filter((c) => c.method === "lookup")).toHaveLength(1);
    expect(submits(fake)).toHaveLength(1);
  });
});

describe("REJECTED (typed)", () => {
  it("a definite refusal names its typed reason in words, keeps the fields, and a changed request gets a NEW key", async () => {
    const { fake } = await planAndFill("rejected-preview-changed");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Rejected");
    expect(panel.getAttribute("role")).toBe("alert");
    expect(within(panel).getByText("COMMAND_PREVIEW_CHANGED")).toBeTruthy();
    expect(within(panel).getByText(/The command changed after you previewed it/)).toBeTruthy();
    expect(within(panel).getByText(/Review the blocker\. Do not create a new key/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Change the request" }));
    expect(screen.queryByLabelText("Rejected")).toBeNull();
    // The control that had focus is gone: focus lands where the reader works next.
    expect(document.activeElement).toBe(reasonBox());
    expect((reasonBox() as HTMLTextAreaElement).value).toBe("Month-end top-up agreed with treasury.");
    expect(submitBtn().getAttribute("aria-disabled")).toBe("false");
    fireEvent.change(reasonBox(), { target: { value: "Month-end top-up agreed with treasury, revised." } });
    await send(fake, 2);
    const [first, second] = submits(fake);
    expect(second!.key).not.toBe(first!.key);
  });

  it("a rejection by the source created a command: its reason is not published (read from source_rejection, id in the title) and the form does not reopen", async () => {
    const { fake } = await planAndFill("rejected-by-source");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Rejected");
    const reason = within(panel).getByText("Reason: not published");
    expect(reason.getAttribute("data-absence")).toBe("rejection");
    expect(whyText(reason)).toMatch(/Not published: receipt state and amounts/);
    expect(panel.textContent).not.toMatch(/FE-032/);
    expect(within(panel).getByText("None published")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Change the request" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "New plan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
    const rows = within(within(panel).getByRole("list", { name: "Four independent answers" })).getAllByRole("listitem");
    expect(within(rows[1]!).getByText("Rejected")).toBeTruthy();
    // New plan starts over and focus goes to the first control, not to the page.
    fireEvent.click(within(panel).getByRole("button", { name: "New plan" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read the plan" }));
    expect(screen.queryByLabelText("Rejected")).toBeNull();
  });
});

describe("UNKNOWN (it may already have been applied)", () => {
  it("locks the payload, says it may already have been applied, and offers a retry under the SAME key, never a new one", async () => {
    const { fake } = await planAndFill("f0-timeout-then-denied");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Outcome unknown");
    expect(within(panel).getByText(/may already have been applied/)).toBeTruthy();
    expect(within(panel).getByText(/No answer came back/)).toBeTruthy();
    // An F0 send has no command id, but it has a key the server can be asked about; the old "nothing can be queried" sentence is gone.
    expect(panel.textContent).not.toMatch(/nothing to query/i);
    expect(within(panel).queryByRole("button", { name: "Query the same intent" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Check by request key" })).toBeTruthy();
    // The fields are locked while this stands.
    expect(reasonBox().closest("fieldset")!.disabled).toBe(true);
    expect(submitBtn().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(submitBtn());
    await act(async () => {});
    expect(submits(fake)).toHaveLength(1);
    // Retry: the same key, the same attempt count + 1.
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(submits(fake)).toHaveLength(2));
    expect(submits(fake)[1]!.key).toBe(submits(fake)[0]!.key);
    expect(submits(fake).map((c) => c.attempt)).toEqual([1, 2]);
    const denied = await screen.findByLabelText("Denied by the relay");
    expect(denied).toBeTruthy();
    // Definite: the key is released.
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
  });

  it("a double-click on Retry sends one retry", async () => {
    const hold = deferred();
    const { fake } = await planAndFill("f0-timeout-then-denied", { latency: (call) => (call.method === "submit" && call.attempt === 2 ? hold.promise : Promise.resolve()) });
    await send(fake, 1);
    const retry = await screen.findByRole("button", { name: "Retry with the same key" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(submits(fake)).toHaveLength(2));
    await act(async () => {});
    expect(submits(fake)).toHaveLength(2);
    await act(async () => {
      hold.resolve();
    });
    await screen.findByLabelText("Denied by the relay");
  });

  it("Discard shows what it costs first; Keep the request takes focus and keeps everything; Discard anyway forgets the key, unlocks the form and the next send is a NEW key", async () => {
    const { fake } = await planAndFill("f0-timeout-then-denied");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Outcome unknown");
    fireEvent.click(within(panel).getByRole("button", { name: "Discard" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard this unknown command?" });
    expect(within(dialog).getByText(DISCARD_WARNING)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Keep the request" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep the request" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Outcome unknown")).toBeTruthy();
    expect(reasonBox().closest("fieldset")!.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard anyway" }));
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
    expect(reasonBox().closest("fieldset")!.disabled).toBe(false);
    expect(document.activeElement).toBe(reasonBox());
    expect((reasonBox() as HTMLTextAreaElement).value).toBe("Month-end top-up agreed with treasury.");
    await send(fake, 2);
    expect(submits(fake)[1]!.key).not.toBe(submits(fake)[0]!.key);
  });

  it("an answer that lands after Discard is the key table's business, not the screen's", async () => {
    const hold = deferred();
    const { fake } = await planAndFill("f0-timeout-then-denied", { latency: (call) => (call.method === "submit" && call.attempt === 2 ? hold.promise : Promise.resolve()) });
    await send(fake, 1);
    fireEvent.click(await screen.findByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(submits(fake)).toHaveLength(2));
    // The reader cannot discard while a send is in flight.
    expect(screen.getByRole("button", { name: "Discard" }).getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      hold.resolve();
    });
    await screen.findByLabelText("Denied by the relay");
  });

  it("delivery unknown with a command id: Query the same intent is offered; a retry is answered with that command and is REPLAYED, not a second one", async () => {
    const { fake } = await planAndFill("delivery-unknown");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Outcome unknown");
    expect(within(panel).getByText(COMMAND_ID_DELIVERY_UNKNOWN)).toBeTruthy();
    expect(within(panel).getByText("Delivery unknown")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Query the same intent" }));
    const found = await screen.findByLabelText("What the lookup found");
    expect(within(found).getByText("Acknowledged")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    const replayed = await screen.findByLabelText("Already recorded");
    expect(within(replayed).getByText(/was created by an earlier send under this key\. Nothing new was created/)).toBeTruthy();
    expect(submits(fake).map((c) => c.key)).toEqual([submits(fake)[0]!.key, submits(fake)[0]!.key]);
  });

  it("no answer, then it had landed: the retry is answered with the one command that exists, and the server says it was a replay (the bit, not a guess)", async () => {
    const { fake } = await planAndFill("timeout-then-landed");
    await send(fake, 1);
    fireEvent.click(await screen.findByRole("button", { name: "Retry with the same key" }));
    const replayed = await screen.findByLabelText("Already recorded");
    expect(within(replayed).getByText(/was created by an earlier send under this key\. Nothing new was created/)).toBeTruthy();
    expect(within(replayed).getAllByText(COMMAND_ID_LANDED).length).toBeGreaterThan(0);
    expect(submits(fake).map((c) => c.attempt)).toEqual([1, 2]);
  });

  it("no answer, then the re-send is the first the server saw (replayed false): it is Accepted, with the note that it came from a re-send", async () => {
    const fake = createFakeCommandPort({ scenario: "timeout-then-landed" });
    // The first send never reached the server; the retry creates the command. The bit says so.
    const port: CommandPort = {
      ...fake,
      kind: "fixture",
      plan: (i) => fake.plan(i),
      lookup: (i) => fake.lookup(i),
      submit: async (i) => {
        const answer = await fake.submit(i);
        return answer.kind === "response" ? { ...answer, body: { ...(answer.body as object), replayed: false } } : answer;
      },
    };
    mount("timeout-then-landed", {}, "CAPITAL", port);
    await readPlan();
    fill("TOP_UP");
    fireEvent.click(submitBtn());
    await waitFor(() => expect(fake.calls.filter((c) => c.method === "submit")).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Retry with the same key" }));
    const accepted = await screen.findByLabelText("Accepted");
    expect(within(accepted).getByText(/re-send under the same key\. One key creates one command/)).toBeTruthy();
    expect(screen.queryByLabelText("Already recorded")).toBeNull();
  });

  it.each([
    ["unverified", /receipt could not be verified/],
    ["unreadable", /answer could not be read/],
    ["f0-unverified", /receipt could not be verified/],
    ["f0-unreadable", /answer could not be read/],
  ] as const)("%s is unknown, never ok and never failed, and it stays unknown on a retry under the same key", async (scenario, why) => {
    const { fake } = await planAndFill(scenario);
    await send(fake, 1);
    const panel = await screen.findByLabelText("Outcome unknown");
    expect(within(panel).getByText(why)).toBeTruthy();
    expect(within(panel).getByText(/may already have been applied/)).toBeTruthy();
    expect(screen.queryByLabelText("Accepted")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Retry with the same key" }));
    await waitFor(() => expect(submits(fake)).toHaveLength(2));
    expect(submits(fake)[1]!.key).toBe(submits(fake)[0]!.key);
    await screen.findByLabelText("Outcome unknown");
  });
});

/* ═════════════════════════ UNKNOWN recovery: check by request key (BE-P13, RV-03) ═════════════════════════ */
describe("UNKNOWN recovery: Check by request key", () => {
  const CHECK = "Check by request key";
  const RETRY = "Retry with the same key";

  /** An F0 send whose outcome is unknown, over a spied port. `now` is the story clock; `lookupAnswer` replaces what the lookup route says. */
  async function unknownSend(scenario: ScenarioId, options: FakePortOptions = {}, extra: { now?: () => number; lookupAnswer?: PortResponse } = {}) {
    const fake = createFakeCommandPort({ scenario, ...options });
    const lookup = vi.fn((input: LookupInput) => (extra.lookupAnswer !== undefined ? Promise.resolve(extra.lookupAnswer) : fake.lookup(input)));
    const submit = vi.fn((input: SubmitInput) => fake.submit(input));
    const port: CommandPort = { kind: "fixture", plan: (input) => fake.plan(input), submit, lookup };
    render(
      <MemoryRouter>
        <CommandFlow port={port} lane="F0" capital={CAPITAL_INTENT} now={extra.now ?? (() => STORY_NOW_MS)} />
      </MemoryRouter>,
    );
    await readPlan();
    fill("account/sync");
    fireEvent.click(submitBtn());
    const panel = await screen.findByLabelText("Outcome unknown");
    const key = submit.mock.calls[0]![0].idempotencyKey;
    return { fake, lookup, submit, panel, key };
  }
  const checkBtn = () => screen.getByRole("button", { name: CHECK });
  const onlyKeys = (spy: { mock: { calls: unknown[][] } }, field: "idempotencyKey" | "requestKey") =>
    spy.mock.calls.map((c) => (c[0] as Record<string, string>)[field]);

  it("an unknown F0 send offers the check first; it is a real button in the tab order, and the old 'nothing can be queried' sentence is gone", async () => {
    const { panel } = await unknownSend("f0-unverified");
    const check = within(panel).getByRole("button", { name: CHECK });
    expect(check.tagName).toBe("BUTTON");
    expect(check.getAttribute("type")).toBe("button");
    expect(check.tabIndex).toBeGreaterThanOrEqual(0);
    expect(check.getAttribute("data-variant")).toBe("primary");
    check.focus();
    expect(document.activeElement).toBe(check);
    expect(panel.textContent).not.toMatch(/nothing to query|nothing can be queried/i);
    // The key sits in the provenance disclosure, not in the paragraph; the disclosure is a native <details>, reachable from the keyboard.
    expect(panel.querySelector("details.exec-cf-prov summary")).not.toBeNull();
  });

  it("NONE: asks by the SAME operation id and request key, says 'No attempt recorded for this key', takes focus, and a retry goes out under that same key", async () => {
    const { lookup, submit, panel, key } = await unknownSend("f0-unverified");
    fireEvent.click(checkBtn());
    const result = await screen.findByLabelText("What the key check found");
    expect(result.getAttribute("data-check")).toBe("none");
    expect(within(result).getByText("No attempt recorded for this key.")).toBeTruthy();
    expect(result.getAttribute("role")).toBe("status");
    expect(document.activeElement).toBe(result);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0]![0]).toEqual({ id: F0_OPERATION_BODY.operation_id, requestKey: key });
    // Still unknown: nothing was concluded from the absence. The retry is now the primary move.
    expect(screen.getByLabelText("Outcome unknown")).toBe(panel);
    expect(within(panel).getByRole("button", { name: RETRY }).getAttribute("data-variant")).toBe("primary");
    expect(within(panel).getByRole("button", { name: "Check again" }).getAttribute("data-variant")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: RETRY }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(onlyKeys(submit, "idempotencyKey")).toEqual([key, key]);
    // A new send is a new question: the earlier result is not left standing.
    await waitFor(() => expect(screen.queryByLabelText("What the key check found")).toBeNull());
  });

  it("the key never changes: every submit and every check, across a check, a retry and a second check, carries the one request key", async () => {
    const { lookup, submit, key } = await unknownSend("f0-unverified");
    fireEvent.click(checkBtn());
    await screen.findByLabelText("What the key check found");
    fireEvent.click(screen.getByRole("button", { name: RETRY }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("Outcome unknown");
    fireEvent.click(checkBtn());
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("What the key check found");
    expect(new Set([...onlyKeys(submit, "idempotencyKey"), ...onlyKeys(lookup, "requestKey")])).toEqual(new Set([key]));
    expect(lookup.mock.calls.every((c) => c[0].id === F0_OPERATION_BODY.operation_id)).toBe(true);
  });

  it("FOUND: the stored answer replaces the unknown, is a definite denial (nothing reached the Trading System), takes focus, and ends in New plan", async () => {
    const { lookup, submit, key } = await unknownSend("f0-timeout-then-denied");
    fireEvent.click(checkBtn());
    const found = await screen.findByLabelText("Found by request key");
    expect(found.getAttribute("data-receipt")).toBe("RECOVERED");
    expect(document.activeElement).toBe(found);
    expect(within(found).getByText(/The relay denied it before anything reached the Trading System/)).toBeTruthy();
    const facts = found.querySelector('dl[aria-label="Stored answer"]') as HTMLElement;
    expect(within(facts).getByText("Retry allowed").nextElementSibling!.textContent).toBe("No");
    expect(within(facts).getByText("Sent to the Trading System").nextElementSibling!.textContent).toBe("No");
    expect(within(facts).getByText("First recorded")).toBeTruthy();
    expect(within(facts).getByText("Stored answer").nextElementSibling!.textContent).toMatch(/^Yes: the first answer for this key/);
    // The unknown is over: no retry, no discard, no Submit, and the fields stay closed.
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
    expect(screen.queryByRole("button", { name: RETRY })).toBeNull();
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
    // The ids are behind the disclosure, with the key that was asked.
    expect(found.querySelector("details.exec-cf-prov")!.textContent).toContain(key);
    expect(onlyKeys(lookup, "requestKey")).toEqual([key]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(within(found).getByRole("link", { name: "Open in Operations" })).toBeTruthy();
    fireEvent.click(within(found).getByRole("button", { name: "New plan" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read the plan" }));
  });

  it("CONFLICT: the key belongs to another operation; nothing was recorded; the request can be changed and the next send is a new intent with a new key", async () => {
    const { fake, submit, key } = await unknownSend("f0-unverified");
    fake.setScenario("f0-key-conflict");
    fireEvent.click(checkBtn());
    const rejected = await screen.findByLabelText("Rejected");
    expect(rejected.getAttribute("data-receipt")).toBe("REJECTED");
    expect(document.activeElement).toBe(rejected);
    expect(within(rejected).getByText(/already used for a different command\. Nothing was changed/)).toBeTruthy();
    expect(within(rejected).getByText(/Found by checking the request key/)).toBeTruthy();
    expect(rejected.textContent).not.toMatch(/op_/);
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
    fireEvent.click(within(rejected).getByRole("button", { name: "Change the request" }));
    expect(screen.queryByLabelText("Rejected")).toBeNull();
    expect((reasonBox() as HTMLTextAreaElement).value).toBe("Month-end top-up agreed with treasury.");
    fireEvent.click(submitBtn());
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]![0].idempotencyKey).not.toBe(key);
  });

  it("double click on Check asks once; the button says it is busy and stays focusable", async () => {
    const hold = deferred();
    const { lookup, panel } = await unknownSend("f0-unverified", { latency: (call) => (call.method === "lookup" ? hold.promise : Promise.resolve()) });
    const check = within(panel).getByRole("button", { name: CHECK });
    fireEvent.click(check);
    fireEvent.click(check);
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(lookup).toHaveBeenCalledTimes(1);
    const busy = within(panel).getByRole("button", { name: "Checking…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(busy);
    await act(async () => {});
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => {
      hold.resolve();
    });
    await screen.findByLabelText("What the key check found");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a late answer after a retry is dropped, and a new check is possible afterwards", async () => {
    const hold = deferred();
    const { lookup, submit, panel } = await unknownSend("f0-unverified", { latency: (call) => (call.method === "lookup" ? hold.promise : Promise.resolve()) });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    fireEvent.click(within(panel).getByRole("button", { name: RETRY }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    await act(async () => {
      hold.resolve();
    });
    expect(screen.queryByLabelText("What the key check found")).toBeNull();
    expect(screen.getByLabelText("Outcome unknown")).toBeTruthy();
    // The dropped answer did not leave the check stuck in flight.
    fireEvent.click(checkBtn());
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("What the key check found");
  });

  it("a late FOUND after Discard changes nothing on screen: the form is open and no receipt appears", async () => {
    const hold = deferred();
    const { lookup, panel } = await unknownSend("f0-timeout-then-denied", { latency: (call) => (call.method === "lookup" ? hold.promise : Promise.resolve()) });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    fireEvent.click(within(panel).getByRole("button", { name: "Discard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard anyway" }));
    await act(async () => {
      hold.resolve();
    });
    expect(screen.queryByLabelText("Found by request key")).toBeNull();
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
    expect(reasonBox().closest("fieldset")!.disabled).toBe(false);
  });

  it("a late answer after unmount is dropped without an error", async () => {
    const hold = deferred();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { lookup, panel } = await unknownSend("f0-timeout-then-denied", { latency: (call) => (call.method === "lookup" ? hold.promise : Promise.resolve()) });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    cleanup();
    await act(async () => {
      hold.resolve();
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("NONE after the plan has expired: the same key is not sent again, the reason is on the button, and New plan is the way on", async () => {
    let clock: number = STORY_NOW_MS;
    const { submit, panel } = await unknownSend("f0-unverified", {}, { now: () => clock });
    clock = STORY_NOW_MS + 10 * 60_000;
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    const result = await screen.findByLabelText("What the key check found");
    expect(within(result).getByText(PLAN_EXPIRED_HOLD)).toBeTruthy();
    const retry = within(panel).getByRole("button", { name: RETRY });
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(retry.getAttribute("title")).toBe(PLAN_EXPIRED_HOLD);
    fireEvent.click(retry);
    await act(async () => {});
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.click(within(panel).getByRole("button", { name: "New plan" }));
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Read the plan" }));
  });

  it("NONE with a plan that is still valid allows the retry (no hold, no extra button)", async () => {
    const { panel } = await unknownSend("f0-unverified");
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    await screen.findByLabelText("What the key check found");
    expect(within(panel).getByRole("button", { name: RETRY }).getAttribute("aria-disabled")).toBe("false");
    expect(within(panel).queryByRole("button", { name: "New plan" })).toBeNull();
  });

  it("no answer to the check leaves the send unknown, says so, and can be asked again", async () => {
    const { panel, lookup } = await unknownSend("f0-unverified", {}, { lookupAnswer: { kind: "no_response", why: "timeout" } });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    const result = await screen.findByLabelText("What the key check found");
    expect(result.getAttribute("data-check")).toBe("unanswered");
    expect(within(result).getByText("Still unknown")).toBeTruthy();
    expect(within(result).getByText("The check got no answer.")).toBeTruthy();
    expect(document.activeElement).toBe(result);
    expect(screen.getByLabelText("Outcome unknown")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  });

  it("an answer for another key or another operation is not this send's answer: unreadable, still unknown", async () => {
    const wrongKey = { ...structuredClone(F0_ATTEMPT_NONE_BODY), request_key: "command_apply:someone-elses" };
    const { panel } = await unknownSend("f0-unverified", {}, { lookupAnswer: { kind: "response", status: 200, body: wrongKey } });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    const result = await screen.findByLabelText("What the key check found");
    expect(within(result).getByText("The check's answer could not be read.")).toBeTruthy();
    expect(screen.getByLabelText("Outcome unknown")).toBeTruthy();
  });

  it("a 503 on the check is not proof of anything: still unknown", async () => {
    const { panel } = await unknownSend("f0-unverified", {}, { lookupAnswer: { kind: "response", status: 503, body: problemBody("COMMAND_STATUS_UNVERIFIED", "Could not verify.") } });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    const result = await screen.findByLabelText("What the key check found");
    expect(within(result).getByText("The check could not be verified.")).toBeTruthy();
  });

  it("a 403 on the check stops the screen disclosing, exactly like a 403 on the send", async () => {
    const { panel } = await unknownSend("f0-unverified", {}, { lookupAnswer: { kind: "response", status: 403, body: problemBody("ACCESS_DENIED", "No.") } });
    fireEvent.click(within(panel).getByRole("button", { name: CHECK }));
    const stopped = await screen.findByLabelText("Access changed");
    expect(stopped.getAttribute("data-receipt")).toBe("ACCESS_STOPPED");
    expect(screen.queryByLabelText(/^Plan: /)).toBeNull();
    expect(screen.queryByLabelText("Outcome unknown")).toBeNull();
  });

  it("a capital send has no key lookup: no Check button, and the receipt says only that no command id came back", async () => {
    const { fake } = await planAndFill("timeout-then-landed");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Outcome unknown");
    expect(within(panel).queryByRole("button", { name: CHECK })).toBeNull();
    expect(within(panel).getByText("No command id came back.")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: RETRY }).getAttribute("data-variant")).toBe("primary");
    expect(fake.calls.filter((c) => c.method === "lookup")).toEqual([]);
  });
});

describe("ACCESS_STOPPED (revoked)", () => {
  it.each(["f0-revoked", "revoked"] as const)("%s: the plan, the typed reason and the receipt stop being shown", async (scenario) => {
    const { fake } = await planAndFill(scenario);
    await send(fake, 1);
    const panel = await screen.findByLabelText("Access changed");
    expect(panel.getAttribute("role")).toBe("alert");
    expect(within(panel).getByText(/no longer shown/)).toBeTruthy();
    expect(within(panel).getByText(/Whether the command was applied is not shown here/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Plan: /)).toBeNull();
    expect(screen.queryByRole("form", { name: "Confirm the command" })).toBeNull();
    expect(document.body.textContent).not.toContain("Month-end top-up agreed with treasury.");
    expect(within(panel).getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/administration/profile-access");
  });
});

describe("a receipt from the scripted port says so", () => {
  const CASES: readonly [ScenarioId, string][] = [
    ["f0-denied", "Denied by the relay"],
    ["accepted", "Accepted"],
    ["rejected-preview-changed", "Rejected"],
    ["timeout-then-landed", "Outcome unknown"],
    ["delivery-unknown", "Outcome unknown"],
    ["revoked", "Access changed"],
    ["f0-revoked", "Access changed"],
  ];
  it.each(CASES)("%s: the receipt (%s) names the fake port, in the receipt itself", async (scenario, label) => {
    const { fake } = await planAndFill(scenario);
    await send(fake, 1);
    const panel = await screen.findByLabelText(label);
    const note = within(panel).getByText(FAKE_PORT_NOTE);
    expect(note.getAttribute("data-notice")).toBe("fake-port");
    expect(panel.textContent).toMatch(/fake port/);
  });
});

/* ═════════════════════════ the real send path stays disabled ═════════════════════════ */
describe("the disabled port", () => {
  it("is never called: reading a plan is blocked with its exact reason, and no Submit can open", async () => {
    const spies = [vi.spyOn(DISABLED_PORT, "plan"), vi.spyOn(DISABLED_PORT, "submit"), vi.spyOn(DISABLED_PORT, "lookup")];
    mount("f0-denied", {}, "F0", DISABLED_PORT);
    const button = screen.getByRole("button", { name: "Read the plan" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("title")).toBe(READ_DISABLED_REASON);
    fireEvent.click(button);
    await act(async () => {});
    expect(screen.getAllByText("Command reads are not connected to a source: fixture").length).toBeGreaterThan(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
  });

  it("the send reason is the exact sentence", () => {
    expect(SEND_DISABLED_REASON).toBe("Command sends are not connected to a source: fixture");
  });
});

/* ═════════════════════════ the status lookup ═════════════════════════ */
describe("the status lookup", () => {
  function lookup(port: FakeCommandPort = createFakeCommandPort()) {
    render(<MemoryRouter><StatusLookup port={port} /></MemoryRouter>);
    return port;
  }
  const idBox = () => screen.getByRole("textbox", { name: "Receipt id" });
  async function ask(id: string) {
    fireEvent.change(idBox(), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    return screen.findByLabelText("What the lookup found");
  }

  it("a command id: the four answers, exact amounts and the next step", async () => {
    const port = lookup();
    const found = await ask(COMMAND_ID_APPLIED);
    const rows = within(within(found).getByRole("list", { name: "Four independent answers" })).getAllByRole("listitem");
    expect(within(rows[1]!).getByText("Applied")).toBeTruthy();
    expect(within(rows[2]!).getByText("Catching up")).toBeTruthy();
    expect(within(found).getAllByText("100.000000000000000001 USDT").length).toBeGreaterThan(0);
    expect(port.calls).toEqual([{ method: "lookup", key: COMMAND_ID_APPLIED }]);
    expect(document.activeElement).toBe(found);
  });

  it("an operation id: a blocked intent with its Portal times, linked to Operations", async () => {
    lookup();
    const found = await ask(F0_OPERATION_BODY.operation_id);
    expect(within(found).getByText("Blocked, not sent")).toBeTruthy();
    expect(within(found).getAllByText("22 Aug 12:00Z", { selector: "dd" })).toHaveLength(2);
    expect(within(found).getByText(/Created and updated are Portal times, not source freshness/)).toBeTruthy();
    expect(within(found).getByRole("link", { name: "Open in Operations" })).toBeTruthy();
  });

  it("an id the grammar refuses is explained and never sent", async () => {
    const port = lookup();
    fireEvent.change(idBox(), { target: { value: "ecm_not-hex" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByText(/ecm_ followed by 32 lower-case hex/)).toBeTruthy();
    expect(idBox().getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(idBox(), { target: { value: "has space" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByText(/Not a receipt id/)).toBeTruthy();
    expect(port.calls).toEqual([]);
  });

  it.each([
    ["ecm_00000000000000000000000000000fff", "No receipt you can read has this id"],
    [COMMAND_ID_REVOKED, "You can't read this receipt (HTTP 403)"],
    [COMMAND_ID_UNVERIFIED, "That is not proof that nothing happened"],
  ] as const)("%s -> %s", async (id, text) => {
    lookup();
    const found = await ask(id);
    expect(within(found).getByText(new RegExp(text.replace(/[()]/g, "\\$&")))).toBeTruthy();
  });

  it("Enter does not run a lookup, and a second click while one is in flight is refused", async () => {
    const hold = deferred();
    const port = lookup(createFakeCommandPort({ latency: () => hold.promise }));
    fireEvent.change(idBox(), { target: { value: COMMAND_ID_LANDED } });
    fireEvent.keyDown(idBox(), { key: "Enter" });
    await act(async () => {});
    expect(port.calls).toEqual([]);
    const button = screen.getByRole("button", { name: "Look up" });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {});
    expect(port.calls).toHaveLength(1);
    await act(async () => {
      hold.resolve();
    });
    await screen.findByLabelText("What the lookup found");
  });

  it("a disabled port is not asked and says why", async () => {
    const spy = vi.spyOn(DISABLED_PORT, "lookup");
    render(<MemoryRouter><StatusLookup port={DISABLED_PORT} /></MemoryRouter>);
    fireEvent.change(idBox(), { target: { value: COMMAND_ID_LANDED } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await act(async () => {});
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(READ_DISABLED_REASON);
  });
});

/* ═════════════════════════ disabled operations and certification ═════════════════════════ */
describe("operations that are not sendable", () => {
  function sendButtons() {
    return screen.getAllByRole("button", { name: /^Send / }) as HTMLButtonElement[];
  }

  it("every operation is a disabled control with its reason: 64 catalogue commands, 8 capital operations, 6 families, none enabled", () => {
    render(<MemoryRouter><DisabledOperations catalogue={CATALOGUE} /></MemoryRouter>);
    const buttons = sendButtons();
    expect(buttons).toHaveLength(64 + 8 + 6);
    for (const button of buttons) {
      expect(button.disabled, button.textContent ?? "").toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent?.length ?? 0, button.textContent ?? "").toBeGreaterThan(20);
      fireEvent.click(button);
    }
    expect(screen.getByText(/64 catalogue commands, 8 capital operations and 6 families\. None is sendable/)).toBeTruthy();
  });

  it("a command blocked by the relay names the reason and the published capability that would enable it; the grant name is provisional (FE-037)", () => {
    render(<MemoryRouter><DisabledOperations catalogue={CATALOGUE} /></MemoryRouter>);
    const row = document.querySelector('[data-op="account/sync"]') as HTMLElement;
    expect(within(row).getByText(BLOCKED_REASON_TEXT.COMMAND_RELAY_DISABLED)).toBeTruthy();
    expect(within(row).getByText("COMMAND_R2")).toBeTruthy();
    // The row says "Needs COMMAND_R2"; the staged-activation sentence and the provisional grant name (FE-037) are its title.
    const need = row.querySelector("[data-capability]")!;
    expect(need.textContent).toBe("Needs COMMAND_R2");
    expect(need.getAttribute("title")).toMatch(/Portal grant name: not published, provisional \(FE-037\)/);
    expect(within(row).getByText("R2 · sandbox")).toBeTruthy();
  });

  it("a command whose route is not published says no capability helps, and a read has no invented capability", () => {
    render(<MemoryRouter><DisabledOperations catalogue={CATALOGUE} /></MemoryRouter>);
    const ambiguousKey = CATALOGUE.entries.find((e) => e.blockedReason === "SOURCE_ROUTE_MAPPING_AMBIGUOUS")!.key;
    const ambiguous = document.querySelector(`[data-op="${ambiguousKey}"]`) as HTMLElement;
    expect(within(ambiguous).getByText(BLOCKED_REASON_TEXT.SOURCE_ROUTE_MAPPING_AMBIGUOUS)).toBeTruthy();
    expect(within(ambiguous).getByText(/route itself is not available/)).toBeTruthy();
    expect(ambiguous.textContent).not.toMatch(/COMMAND_R\d/);
    const read = document.querySelector('[data-op="account/state"]') as HTMLElement;
    expect(read.textContent).toMatch(/Not published: per-row eligibility and the reason a control is off/);
    expect(read.textContent).not.toMatch(/COMMAND_R\d/);
  });

  it("BE-P13: the emergency close is the accepted N16B primitive: its row says it is described and not active, names its own reason word, and no capability enables it", () => {
    render(<MemoryRouter><DisabledOperations catalogue={CATALOGUE} /></MemoryRouter>);
    const row = document.querySelector('[data-op="ops/emergency-close"]') as HTMLElement;
    expect(within(row).getByText("N16B_RUNTIME_ACTIVATION_PENDING")).toBeTruthy();
    expect(within(row).getByText(/described, not active/)).toBeTruthy();
    expect(within(row).getByText(/route itself is not available/)).toBeTruthy();
    expect(row.textContent).not.toMatch(/COMMAND_R\d/);
    expect(row.textContent).not.toMatch(/no reason was published/);
    expect((within(row).getByRole("button", { name: /^Send / }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("capital operations carry the exact send reason; with no catalogue read, the catalogue rows are not invented", () => {
    render(<MemoryRouter><DisabledOperations catalogue={null} /></MemoryRouter>);
    expect(screen.getByText(/The command catalogue has not been read/)).toBeTruthy();
    expect(sendButtons()).toHaveLength(8 + 6);
    const topUp = document.querySelector('[data-op="TOP_UP"]') as HTMLElement;
    expect(within(topUp).getByText(new RegExp(SEND_DISABLED_REASON))).toBeTruthy();
  });
});

describe("flows that require separate certification", () => {
  it("every flow is a disabled control that says so, and the mainnet canary never runs", () => {
    render(<MemoryRouter><Certification /></MemoryRouter>);
    const list = screen.getByRole("list", { name: "Flows that require separate certification" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(CERTIFICATION_FLOWS.length);
    for (const row of rows) {
      const button = within(row).getByRole("button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "")!;
      expect(reason.textContent).toContain(CERTIFICATION_PHRASE);
      fireEvent.click(button);
    }
    const canary = document.querySelector('[data-flow="mainnet-canary"]') as HTMLElement;
    expect(within(canary).getByRole("button", { name: "Run the mainnet canary" })).toBeTruthy();
    expect(canary.textContent).toMatch(/never runs from the Portal/);
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    for (const id of ["UX-F14", "UX-F15", "UX-F16", "UX-F17"]) expect(document.body.textContent).toContain(id);
  });
});

/* ═════════════════════════ the story page ═════════════════════════ */
describe("the story page", () => {
  function story(props: Parameters<typeof CommandStoryPage>[0] = {}) {
    // The catalogue is left out by default: 78 disabled controls make every role query in jsdom slow, and the rows are covered above.
    return render(<MemoryRouter><CommandStoryPage catalogue={null} {...props} /></MemoryRouter>);
  }

  it("says it is a fixture, keeps the real send path disabled with the exact reason, and reaches no network", async () => {
    story();
    // One short line; the rest of the story (nothing reaches a network, answers are scripted) is its title.
    expect(screen.getByRole("note").textContent).toMatch(/Fixture only.*Fixture: not connected/);
    expect(screen.getByRole("note").getAttribute("title")).toMatch(/Nothing here reaches a network or a source/);
    const real = screen.getByRole("button", { name: "Send to the Trading System" }) as HTMLButtonElement;
    expect(real.disabled).toBe(true);
    expect(document.getElementById(real.getAttribute("aria-describedby")!)!.textContent).toBe(SEND_DISABLED_REASON);
    fireEvent.click(real);
    fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
    await screen.findByLabelText(/^Plan: /);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Fixture clock: 22 Aug 12:01Z");
  });

  it("runs the whole F0 path: plan, typed confirmation, denial", async () => {
    story();
    fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
    await screen.findByLabelText(/^Plan: /);
    fill("account/sync");
    fireEvent.click(submitBtn());
    await screen.findByLabelText("Denied by the relay");
  });

  it("switching the family changes the scripted answers and starts the flow over", async () => {
    story();
    fireEvent.click(screen.getByRole("radio", { name: /Capital command/ }));
    const select = screen.getByRole("combobox", { name: "Scripted answer" }) as HTMLSelectElement;
    expect(select.value).toBe("accepted");
    expect([...select.options].map((o) => o.value)).toContain("applied-lagging");
    expect([...select.options].map((o) => o.value)).not.toContain("f0-denied");
    expect(screen.getByRole("button", { name: "Read the plan" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "applied-lagging" } });
    fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
    await screen.findByLabelText(/^Plan: /);
    fill("TOP_UP");
    fireEvent.click(submitBtn());
    await screen.findByLabelText("Accepted");
    expect(document.body.textContent).toContain("Pending");
  });

  it("reads the catalogue once on mount through the api when none is passed (a read, never a write)", async () => {
    const getCommandCatalogue = vi.fn(async () => ({ ok: true as const, value: API_CATALOGUE }));
    story({ catalogue: undefined, api: { getCommandCatalogue } });
    await waitFor(() => expect(document.querySelectorAll("[data-op]").length).toBe(64 + 8 + 6));
    expect(getCommandCatalogue).toHaveBeenCalledTimes(1);
  });

  it("an unmount during a send neither throws nor lands an answer on nobody", async () => {
    const hold = deferred();
    const { fake } = await planAndFill("accepted", { latency: (call) => (call.method === "submit" ? hold.promise : Promise.resolve()) });
    await send(fake, 1);
    cleanup();
    await act(async () => {
      hold.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* ═════════════════════════ the flag and the source ═════════════════════════ */
describe("flag-gated off by default", () => {
  it("the key exists, is no longer pending (PortalRoutes mounts the story), and is on only when a manifest names it under the umbrella", () => {
    expect(COMMAND_SCREEN_KEY).toBe("command");
    expect((EXEC_V2_SCREEN_KEYS as readonly string[]).includes("command")).toBe(true);
    expect((EXEC_V2_PENDING_KEYS as readonly string[]).includes("command")).toBe(false);
    const set = parseV2Manifest("fleet,command");
    expect(set.has("command")).toBe(true);
    expect(isV2Screen("command", set, true)).toBe(true);
    expect(isV2Screen("command", set, false)).toBe(false);
    expect(isV2Screen("command", parseV2Manifest(""), true)).toBe(false);
  });
});

describe("the source of this lane", () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name));
  const text = (name: string) => readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("scans a real set of files", () => {
    expect(sources.length).toBeGreaterThanOrEqual(14);
  });

  it("no file reaches a network: no fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon or URL literal", () => {
    for (const name of sources) {
      expect(text(name), name).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//);
    }
  });

  it("no file stands a dash or N/A in for a value", () => {
    for (const name of sources) expect(text(name), name).not.toMatch(/"—"|>—<|"N\/A"|"n\/a"/);
  });

  it("only the story page and the fake port know the fake: no product component imports it", () => {
    for (const name of sources) {
      if (name === "index.tsx" || name === "fakePort.ts" || name === "storyData.ts") continue;
      expect(readFileSync(join(dir, name), "utf8"), name).not.toMatch(/from "\.\/(fakePort|storyData)"/);
    }
  });

  it("there is no code path that sends a stored intent under a second key: the send reads the table first and the retry reads the stored key", () => {
    const hook = readFileSync(join(dir, "useCommandFlow.ts"), "utf8");
    expect(hook).toMatch(/INTENTS\.get\(identity\)\?\.key \?\? mintKey\(\)/);
    expect(hook.match(/mintKey\(\)/g)!.length).toBe(3); // the definition, the plan key and the one send
    expect(hook).toMatch(/send\(sent\.identity, sent\.key, sent\.payload\)/);
  });
});
