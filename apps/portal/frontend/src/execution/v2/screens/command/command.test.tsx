/**
 * Command confirmation, receipt and status (UXM-09, fixture lane): the flow, the lookup, the disabled operations and the story page.
 *
 * Lane: FIXTURE_LAB (unit, jsdom). The port is the scripted fake; `fetch` throws if anything calls it. Nothing here proves a real server's
 * answers or that any command was ever accepted by anything: it proves how the screen behaves for each answer a port can give.
 *
 * UX-F18 (repeated clicks, timeout, back, cancel, reconnect) is covered by the double-click, the unknown/retry/discard and the unmount
 * tests; UX-F17 (applied + projection lag + venue partial) by `applied-lagging`; UX-F14 to UX-F16 by the certification rows.
 */
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
import { DISABLED_PORT, READ_DISABLED_REASON, SEND_DISABLED_REASON, type CommandPort } from "./port";
import { DISCARD_WARNING, FAKE_PORT_NOTE } from "./ReceiptPanel";
import { StatusLookup } from "./StatusLookup";
import {
  CAPITAL_INTENT,
  COMMAND_ID_APPLIED,
  COMMAND_ID_DELIVERY_UNKNOWN,
  COMMAND_ID_LANDED,
  COMMAND_ID_REVOKED,
  COMMAND_ID_UNVERIFIED,
  F0_OPERATION_BODY,
  STORY_NOW_MS,
  type ScenarioId,
} from "./storyData";
import { clearCommandIntents } from "./useCommandFlow";

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

  it("F0: the published plan, its blocker in words, and cost and impact Not published (FE-020), never a number", async () => {
    const { fake } = mount("f0-denied");
    await readPlan();
    expect(fake.calls.map((c) => c.method)).toEqual(["plan"]);
    const plan = screen.getByLabelText(/^Plan: /);
    expect(within(plan).getByText("COMMAND_RELAY_DISABLED")).toBeTruthy();
    expect(within(plan).getByText(/command relay is off/)).toBeTruthy();
    expect(within(plan).getByText(/Not published \(FE-020\)/)).toBeTruthy();
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
    expect(within(plan).getByText(/Not published \(FE-020\)/)).toBeTruthy();
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
    expect(within(panel).getByText(/Fill quantity and partial fills: Not published \(FE-032\)/)).toBeTruthy();
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

  it("a rejection by the source created a command: its reason is Not published (FE-032) and the form does not reopen", async () => {
    const { fake } = await planAndFill("rejected-by-source");
    await send(fake, 1);
    const panel = await screen.findByLabelText("Rejected");
    expect(within(panel).getByText(/The source's own reason: Not published \(FE-032\)/)).toBeTruthy();
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
    expect(within(panel).getByText(/No command id came back, so there is nothing to query by/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Query the same intent" })).toBeNull();
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
    expect(screen.getAllByText("Command reads are not connected to a source: UXM-09 fixture").length).toBeGreaterThan(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: SUBMIT_LABEL })).toBeNull();
  });

  it("the send reason is the exact sentence", () => {
    expect(SEND_DISABLED_REASON).toBe("Command sends are not connected to a source: UXM-09 fixture");
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
    expect(within(found).getAllByText("2026-08-22 12:00:00 UTC", { selector: "dd" })).toHaveLength(2);
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
    expect(within(row).getByText(/Portal grant name: not published, provisional \(FE-037\)/)).toBeTruthy();
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
    expect(read.textContent).toMatch(/Not published \(FE-015\)/);
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
    expect(screen.getByRole("note").textContent).toMatch(/Fixture only.*Nothing here reaches a network or a source/);
    expect(screen.getByRole("note").textContent).toContain("Fixture story: not connected to a source; fake port");
    const real = screen.getByRole("button", { name: "Send to the Trading System" }) as HTMLButtonElement;
    expect(real.disabled).toBe(true);
    expect(document.getElementById(real.getAttribute("aria-describedby")!)!.textContent).toBe(SEND_DISABLED_REASON);
    fireEvent.click(real);
    fireEvent.click(screen.getByRole("button", { name: "Read the plan" }));
    await screen.findByLabelText(/^Plan: /);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Fixture clock: 2026-08-22 12:01:00 UTC");
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
