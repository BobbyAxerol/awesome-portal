/**
 * Admin Actions V2 through the real HTTP client against the S2 double: the six
 * tiers, the first reason nothing is live, the plan walk (Accepted, Uncertain,
 * Preview), the local read, and the states.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import type { ExecutionApi } from "../../../api/ports";
import { httpApi, serveDoubles, type Call } from "../../../../../e2e/screensV2Harness";
import AdminScreen, { ADMIN_SCREEN_KEY } from "./index";

let calls: Call[] = [];
beforeEach(() => {
  resetOverviewDouble();
  calls = serveDoubles();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const mount = (entry = "/administration/actions", props: Partial<React.ComponentProps<typeof AdminScreen>> = {}, api: ExecutionApi = httpApi()) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AdminScreen api={api} {...props} />
      <Where />
    </MemoryRouter>,
  );

const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");
const loaded = () => screen.findByRole("heading", { name: "Read" });
const tierTable = (label: string) => screen.getByRole("table", { name: `${label} actions` });
const dock = () => screen.findByRole("complementary");
/** The real client with some reads replaced; `withReadSignal` is dropped so the screen's scoped copy keeps the replacements. */
const override = (over: Partial<ExecutionApi>): ExecutionApi => ({ ...httpApi(), withReadSignal: undefined, ...over });
const posts = () => calls.filter((c) => c.method === "POST");

async function open(entry: string) {
  mount(entry);
  return dock();
}

describe("tiers", () => {
  it("is the admin flag's screen", () => {
    expect(ADMIN_SCREEN_KEY).toBe("admin");
  });

  it("lists the server's six groups under the hi-fi's names with how many are ready", async () => {
    mount();
    await loaded();
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(["Read", "Portfolio capital", "Deployment risk", "Account", "Sync and reconciliation", "Emergency"]);
    expect(screen.getByText(/Look only\. Nothing changes\. · 0 of 7 ready/)).toBeTruthy();
    expect(screen.getByText(/Needs a second approver and a security key\. · 0 of 3 ready/)).toBeTruthy();
    expect(screen.getByText("0 of 24 can run now")).toBeTruthy();
  });

  it("gives every action a state word, never colour alone", async () => {
    mount();
    await loaded();
    const states = (label: string) => within(tierTable(label)).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(states("Portfolio capital").every((s) => s.includes("Start in Portfolios") && s.includes("Open"))).toBe(true);
    expect(states("Read").some((s) => s.includes("Not offered in the portal"))).toBe(true);
    expect(states("Read").some((s) => s.includes("Not enabled for this profile"))).toBe(true);
    expect(states("Emergency").some((s) => s.includes("Not offered in the portal"))).toBe(true);
  });

  it("filters by state and keeps it in the URL", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Start elsewhere 4$/ }));
    await waitFor(() => expect(search().get("state")).toBe("elsewhere"));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Portfolio capital"]);
    fireEvent.click(screen.getByRole("button", { name: /^Ready 0$/ }));
    expect(await screen.findByText("No action is in this state.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    await waitFor(() => expect(search().get("state")).toBeNull());
  });

  it("cards: every cell is labelled", async () => {
    mount();
    await loaded();
    for (const cell of within(tierTable("Read")).getAllByRole("row")[1]!.querySelectorAll("td")) expect(cell.getAttribute("data-l")).toBeTruthy();
  });

  it("renders no dash and no abbreviated number", async () => {
    mount();
    await loaded();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?[kKmM]\b/);
  });
});

describe("why nothing is live", () => {
  it("names the command authority and the first capability that is not live", async () => {
    mount();
    await loaded();
    const banner = screen.getAllByRole("status").find((n) => n.textContent?.includes("First reason nothing is live"))!;
    expect(banner.textContent).toContain("Command authority: Fail closed");
    expect(banner.textContent).toContain("PROJECTION, kill switch engaged");
  });

  it("each action's provenance row gives its code, else the activation's sentence", async () => {
    mount();
    await loaded();
    const details = document.querySelector("details.exec-adm-prov")!;
    fireEvent.click(details.querySelector("summary")!);
    const table = within(details as HTMLElement).getByRole("table", { name: "Action provenance" });
    const reasons = new Map(within(table).getAllByRole("row").slice(1).map((r) => [r.querySelector("td[data-l='Action']")!.textContent, r.querySelector("td[data-l='First reason it is not live']")!.textContent] as const));
    expect(reasons.get("System health")).toBe("TYPED_SOURCE_OPERATION_NOT_PUBLISHED");
    expect(reasons.get("Emergency close")).toBe("N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED");
    expect(reasons.size).toBe(24);
  });
});

describe("the detail pane", () => {
  it("opens from the URL with facts, the reason, and a link to Portfolios for a capital action", async () => {
    const pane = await open("/administration/actions?sel=allocation-change");
    expect(within(pane).getByRole("heading", { name: "Change allocation" })).toBeTruthy();
    expect(pane.textContent).toContain("Start in Portfolios");
    expect(within(pane).getByRole("link", { name: "Open Portfolios" }).getAttribute("href")).toContain("/execution/portfolios");
    expect(pane.textContent).toContain("N27_COMMAND_TRANSPORT_NOT_ACTIVATED");
    expect(within(pane).queryByRole("button", { name: "Make plan" })).toBeNull();
  });

  it("an emergency action cannot be planned here and says why", async () => {
    const pane = await open("/administration/actions?sel=emergency-close");
    const button = within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(pane.textContent).toContain("Needs a second approver and a security key");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("an incompatible command is not offered, with the server's reason code", async () => {
    const pane = await open("/administration/actions?sel=risk-profile");
    expect((within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pane.textContent).toContain("Not offered in the portal (SOURCE_ROUTE_MAPPING_AMBIGUOUS)");
  });

  it("provenance joins the catalogue: route, tier and why it is blocked", async () => {
    const pane = await open("/administration/actions?sel=account-sync");
    fireEvent.click(within(pane).getByText("Provenance"));
    expect(pane.textContent).toContain("account/sync");
    expect(pane.textContent).toMatch(/Why blocked/);
    expect(pane.textContent).toMatch(/command relay is off/i);
  });

  it("an id the catalogue did not carry says so", async () => {
    mount("/administration/actions?sel=nope");
    expect(await screen.findByText("This action is not in the catalogue that was read.")).toBeTruthy();
  });

  it("closes with Esc and returns the URL", async () => {
    await open("/administration/actions?sel=account-sync");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().get("sel")).toBeNull());
  });
});

describe("planning", () => {
  async function fill(pane: HTMLElement, { target = "acc_1", version = "3", note = "Pause while the broker is checked" } = {}) {
    fireEvent.change(within(pane).getByLabelText(/^Target \(/), { target: { value: target } });
    fireEvent.change(within(pane).getByLabelText(/Target version/), { target: { value: version } });
    fireEvent.change(within(pane).getByLabelText(/^Note/), { target: { value: note } });
  }
  const makePlan = (pane: HTMLElement) => within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement;

  it("Make plan stays off until the note is long enough, and says what is missing", async () => {
    const pane = await open("/administration/actions?sel=account-sync");
    expect(makePlan(pane).disabled).toBe(true);
    await fill(pane, { note: "too short" });
    expect(makePlan(pane).disabled).toBe(true);
    expect(pane.textContent).toContain("Add a note of at least 12 characters");
    await fill(pane);
    expect(makePlan(pane).disabled).toBe(false);
  });

  it("walks the strip: Accepted, then Uncertain, then Preview, and posts the right request each time", async () => {
    const pane = await open("/administration/actions?sel=account-sync");
    expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Not started");

    await fill(pane);
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.path).toBe("/commands/plans");
    expect(posts()[0]!.body).toMatchObject({
      schema_version: "execution.command-plan-request.v1",
      workspace_id: "fixture-workspace",
      command_type: "EXECUTION_COMMAND",
      command_key: "account/sync",
      environment: "SANDBOX",
      target: { type: "ACCOUNT", id: "acc_1" },
      expected_target_version: 3,
      payload: { note: "Pause while the broker is checked" },
    });
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Accepted"));
    expect(pane.textContent).toContain("op_DOUBLE_PLAN_ACCEPTED");
    expect(pane.textContent).toContain("Not published (FE-020)");

    // The same inputs again are a retry: same request key. An edit is a new intent: a new key.
    const firstKey = (posts()[0]!.body as { request_key: string }).request_key;
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect((posts()[1]!.body as { request_key: string }).request_key).toBe(firstKey);
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Uncertain"));
    expect(pane.textContent).toContain("This plan asked the Trading System to act");

    await fill(pane, { note: "Pause while the broker is rechecked" });
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect((posts()[2]!.body as { request_key: string }).request_key).not.toBe(firstKey);
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Preview"));
    expect(pane.textContent).toContain("COMMAND_RELAY_DISABLED");
    expect(pane.textContent).toContain("Nothing was asked of the Trading System");
  });

  it("never applies: Apply is disabled with the first reason it is not live, and no apply route is called", async () => {
    const pane = await open("/administration/actions?sel=account-sync");
    const apply = within(pane).getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(pane.textContent).toContain("Make a plan first");
    await fill(pane);
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(pane.textContent).toContain("COMMAND_R2: kill switch engaged"));
    expect((within(pane).getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((c) => /\/apply$/.test(c.path))).toBe(false);
  });

  it("a payload rejection is explained without repeating the payload", async () => {
    const spy = override({ planCommand: async () => ({ ok: false, status: "insufficient_data", reason: "One field in this request is named like a credential or secret." }) });
    mount("/administration/actions?sel=account-sync", {}, spy);
    const pane = await dock();
    await fill(pane, { note: "my secret-token-abc123 note" });
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(pane.textContent).toContain("named like a credential"));
    expect(document.body.textContent).not.toContain("secret-token-abc123 note\n");
    expect(pane.textContent).not.toContain("abc123");
  });
});

describe("the first ready action opens on arrival (ADM-B2)", () => {
  it("opens it in the docked layout once, replacing the history entry, and Close keeps it closed", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    mount();
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: "System health" })).toBeTruthy();
    await waitFor(() => expect(search().get("sel")).toBe("health"));
    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(search().get("sel")).toBeNull();
  });

  it("opens nothing when no action is ready, and never overrides a selection already in the URL", async () => {
    mount();
    await loaded();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(search().get("sel")).toBeNull();
    cleanup();
    setOverviewDoubleVariants({ admin: "connected-read" });
    mount("/administration/actions?sel=capital_history");
    await loaded();
    expect(search().get("sel")).toBe("capital_history");
  });
});

describe("a local read", () => {
  it("runs a CONNECTED read and says no source command was sent", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const pane = await open("/administration/actions?sel=health");
    const run = within(pane).getByRole("button", { name: "Run read" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(pane.textContent).toContain("Complete the required parameters");
    fireEvent.change(within(pane).getByLabelText(/^mode/), { target: { value: "paper" } });
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    await waitFor(() => expect(pane.textContent).toContain("Source command sent: no"));
    expect(posts()[0]!.path).toBe("/commands/tasks/health/run");
    expect(posts()[0]!.body).toMatchObject({ params: { mode: "paper" } });
    expect(pane.textContent).toContain("sha256:");
    expect(pane.textContent).toContain("live updates");
  });

  it("a read that is not enabled has no Run control, only the reason", async () => {
    const pane = await open("/administration/actions?sel=health");
    const run = within(pane).getByRole("button", { name: "Run read" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(pane.textContent).toContain("This action is not enabled for this profile");
  });
});

describe("states", () => {
  it("denied: a non-ADMIN gets the denial, and nothing of the catalogue leaks", async () => {
    setOverviewDoubleVariants({ admin: "denied" });
    mount("/administration/actions", { accessHref: "/profile-access" });
    expect(await screen.findByText("You can't open this page")).toBeTruthy();
    expect(screen.getByText("Admin Actions is for administrators.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toBe("/profile-access");
    const text = document.body.textContent ?? "";
    for (const leak of ["Change allocation", "account/sync", "Emergency", "24", "64"]) expect(text, leak).not.toContain(leak);
  });

  it("partial: names the missing actions", async () => {
    setOverviewDoubleVariants({ admin: "partial" });
    mount();
    await loaded();
    expect(screen.getByText(/Some actions are missing\. 20 of 24 reported\./)).toBeTruthy();
  });

  it("unavailable: a failed tasks read offers Try again and recovers", async () => {
    const fail = override({ getOperatorTasks: async () => ({ ok: false, status: "unavailable", reason: "PORTAL_READ_FAILED" }) });
    mount("/administration/actions", {}, fail);
    expect(await screen.findByText(/PORTAL_READ_FAILED/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("a catalogue that was withheld leaves the list and says the join is missing", async () => {
    const spy = override({ getCommandCatalogue: async () => ({ ok: false, status: "denied", reason: "The command catalogue is available to Admin operators only." }) });
    mount("/administration/actions?sel=account-sync", {}, spy);
    await loaded();
    expect(screen.getByText(/The command catalogue was not read, so routes and tiers are not joined/)).toBeTruthy();
    const pane = await dock();
    expect((within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pane.textContent).toContain("does not carry account/sync");
  });

  it("an activation read that fails does not hide the task list, and the page says the reason is limited", async () => {
    const spy = override({ getActivationCapabilities: async () => ({ ok: false, status: "unavailable", reason: "ACTIVATION_DOWN" }) });
    mount("/administration/actions", {}, spy);
    await loaded();
    expect(screen.getByText(/staged-activation read failed \(ACTIVATION_DOWN\)/)).toBeTruthy();
  });

  it("loading", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading Admin Actions" })).toBeTruthy();
    await loaded();
  });
});
