/**
 * Admin Actions V2 through the real HTTP client against the S2 double: the six
 * tiers, the first reason nothing is live, the plan walk (Accepted, Uncertain,
 * Preview), the local read, and the states.
 */
import { whyText } from "../../gapWhyTestUtil";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW, SLOW_TEST } from "../../waitsTestUtil";

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
const loaded = () => screen.findByRole("heading", { name: "Read" }, SLOW);
const tierTable = (label: string) => screen.getByRole("table", { name: `${label} actions` });
const dock = () => screen.findByRole("complementary", {}, SLOW);
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
    // The tier's own sentence is printed beside its count (the hi-fi's "Look only. Nothing changes. · 6 of 7 ready"), not a tooltip.
    const asides = screen.getAllByTestId("admin-tier-aside").map((n) => n.textContent);
    expect(asides[0]).toBe("Look only. Nothing changes. · 0 of 7 ready");
    expect(asides[5]).toBe("Needs a second approver and a security key. · 0 of 3 ready");
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
    await waitFor(() => expect(search().get("state")).toBe("elsewhere"), SLOW);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Portfolio capital"]);
    fireEvent.click(screen.getByRole("button", { name: /^Ready 0$/ }));
    expect(await screen.findByText("No action is in this state.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    await waitFor(() => expect(search().get("state")).toBeNull(), SLOW);
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

describe("manager language and the detail panel (DEBT-UXM07-051)", () => {
  it("a row's subtext is the catalogue's description, never the route slug, and a row without one says so", async () => {
    const base = await baseTasks();
    const tasks = base.tasks.map((t, i) => (i === 0 ? { ...t, description: null, catalogKey: "raw/slug_key" } : t));
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks({ ...base, tasks }) }));
    await loaded();
    const first = within(tierTable("Read")).getAllByRole("row")[1]!;
    expect(first.textContent).not.toContain("raw/slug_key");
    expect(first.textContent).toContain("No description published");
    const second = within(tierTable("Read")).getAllByRole("row")[2]!;
    expect(second.querySelector(".exec-adm-sub")?.textContent).toBe(base.tasks[1]!.description);
  });

  it("the scope column uses the catalogue's scope label when it publishes one", async () => {
    const base = await baseTasks();
    const tasks = base.tasks.map((t, i) => (i === 0 ? { ...t, scopeLabel: "Whole system" } : t));
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks({ ...base, tasks }) }));
    await loaded();
    expect(within(tierTable("Read")).getAllByRole("row")[1]!.querySelector("td[data-l='Scope']")?.textContent).toBe("Whole system");
  });

  it("with nothing selected in the docked layout the right-hand panel stands with its prompt", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks({ ...(await baseTasks()), tasks: [] }) }));
    await screen.findByText(/No actions are published|none could be read/, {}, SLOW);
    expect(screen.getByTestId("admin-detail-empty").textContent).toContain("Pick an action to see what it does and how it runs.");
  });

  it("an open action shows What, Scope, Who, How and State, and its subtitle is the tier, not a slug", async () => {
    mount("/administration/actions?sel=" + encodeURIComponent((await baseTasks()).tasks[0]!.taskId));
    const pane = await dock();
    for (const term of ["What", "Scope", "Who", "How", "State"]) expect(within(pane).getByText(term, { selector: "dt" })).toBeTruthy();
    expect(pane.textContent).toContain("Read");
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

  it("each action's provenance row gives its code as a display name (the code behind a disclosure), else the activation's sentence", async () => {
    mount();
    await loaded();
    const details = document.querySelector("details.exec-adm-prov")!;
    fireEvent.click(details.querySelector("summary")!);
    const table = within(details as HTMLElement).getByRole("table", { name: "Action provenance" });
    const reasons = new Map(within(table).getAllByRole("row").slice(1).map((r) => [r.querySelector("td[data-l='Action']")!.textContent, r.querySelector("td[data-l='First reason it is not live']")!.textContent] as const));
    expect(reasons.get("System health")).toBe("Typed source operation not published");
    expect(reasons.get("Emergency close")).toBe("N16b compatible command identity not activated");
    expect(reasons.size).toBe(24);
  });
});

describe("the detail pane", () => {
  it("opens from the URL with facts, the reason, and a link to Portfolios for a capital action", async () => {
    const pane = await open("/administration/actions?sel=allocation-change");
    expect(within(pane).getByRole("heading", { name: "Change allocation" })).toBeTruthy();
    expect(pane.textContent).toContain("Start in Portfolios");
    expect(within(pane).getByRole("link", { name: "Open Portfolios" }).getAttribute("href")).toBe("/deployments/portfolios");
    // UXM07-048/4: the reason reads as its display name; the code stays in hidden text
    expect(pane.textContent).toContain("Command transport not active");
    expect(pane.textContent).toContain("(N27_COMMAND_TRANSPORT_NOT_ACTIVATED)");
    expect(within(pane).queryByRole("button", { name: "Make plan" })).toBeNull();
  });

  it("an emergency action cannot be planned here and says why", async () => {
    const pane = await open("/administration/actions?sel=emergency-close");
    const button = within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(pane.textContent).toContain("Needs a second approver and a security key");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("an incompatible command is not offered, with the reason's display name", async () => {
    const pane = await open("/administration/actions?sel=risk-profile");
    expect((within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pane.textContent).toContain("Not offered in the portal (Route not established)");
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
    await waitFor(() => expect(search().get("sel")).toBeNull(), SLOW);
  });
});

describe("links (D4, M12)", () => {
  it("the default Portfolios target is a route that exists, and the default Operations link names no source", async () => {
    mount("/administration/actions?workspace_id=ws_1&env=paper");
    await loaded();
    const hrefs = screen.getAllByRole("link", { name: "Open in Operations" }).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBe(1);
    for (const href of hrefs) {
      expect(href).toBe("/execution/operations?env=paper&workspace_id=ws_1");
      expect(href).not.toContain("source=");
    }
    const portfolios = screen.getByRole("link", { name: "Portfolios" });
    expect(portfolios.getAttribute("href")).toBe("/deployments/portfolios?env=paper&workspace_id=ws_1");
    expect(document.body.textContent).not.toContain("source: admin");
  });

  it("a plan links to its own operation in Operations, keeping the context", async () => {
    const pane = await open("/administration/actions?sel=account-sync&workspace_id=ws_1");
    fireEvent.change(within(pane).getByLabelText(/^Target \(/), { target: { value: "acc_1" } });
    fireEvent.change(within(pane).getByLabelText(/Target version/), { target: { value: "3" } });
    fireEvent.change(within(pane).getByLabelText(/^Note/), { target: { value: "Pause while the broker is checked" } });
    fireEvent.click(within(pane).getByRole("button", { name: "Make plan" }));
    const link = await within(pane).findByRole("link", { name: "Open in Operations" });
    const href = new URL(link.getAttribute("href")!, "http://x");
    expect(href.pathname).toBe("/execution/operations");
    expect(href.searchParams.get("operation")).toBeTruthy();
    expect(href.searchParams.get("workspace_id")).toBe("ws_1");
    expect(href.searchParams.get("source")).toBeNull();
  });

  it("cmd selects the task by catalogue key without running or planning anything", async () => {
    mount("/administration/actions?cmd=account/sync");
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: /Account sync|Sync/i })).toBeTruthy();
    await waitFor(() => expect(search().get("sel")).toBe("account-sync"), SLOW);
    const note = screen.getByRole("note", { name: "What the link asked for" });
    expect(note.textContent).toContain("command account/sync");
    expect(note.textContent).toContain("Nothing was run.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("action selects by task id, and the binding is named with a way back", async () => {
    mount("/administration/actions?action=account-sync&binding=deribit_main_01&env=paper");
    await dock();
    await waitFor(() => expect(search().get("sel")).toBe("account-sync"), SLOW);
    const note = screen.getByRole("note", { name: "What the link asked for" });
    expect(note.textContent).toContain("binding deribit_main_01");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("an action the catalogue lacks selects nothing, opens nothing unprompted, and links back to the binding", async () => {
    mount("/administration/actions?action=rotate_credential&binding=deribit_main_01&env=paper");
    await loaded();
    const note = screen.getByRole("note", { name: "What the link asked for" });
    expect(note.textContent).toContain("no task with that key, so nothing is selected");
    expect(search().get("sel")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(within(note).getByRole("link", { name: "Back to the binding" }).getAttribute("href")).toBe("/deployments/accounts?binding=deribit_main_01&env=paper");
  });

  it("operation is handed to Operations with its deep link, and selects no task", async () => {
    mount("/administration/actions?operation=op_1253&workspace_id=ws_1");
    await loaded();
    const note = screen.getByRole("note", { name: "What the link asked for" });
    expect(note.textContent).toContain("no operation lookup");
    expect(within(note).getByRole("link", { name: "Open it in Operations" }).getAttribute("href")).toBe("/execution/operations?operation=op_1253&workspace_id=ws_1");
    expect(search().get("sel")).toBeNull();
  });

  it("a URL that already selects a task keeps it over cmd", async () => {
    mount("/administration/actions?sel=emergency-close&cmd=account/sync");
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: "Emergency close" })).toBeTruthy();
    expect(search().get("sel")).toBe("emergency-close");
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
    await waitFor(() => expect(posts()).toHaveLength(1), SLOW);
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
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Accepted"), SLOW);
    expect(pane.textContent).toContain("op_DOUBLE_PLAN_ACCEPTED");
    expect(pane.textContent).toContain("Not published (FE-020)");

    // The same inputs again are a retry: same request key. An edit is a new intent: a new key.
    const firstKey = (posts()[0]!.body as { request_key: string }).request_key;
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(2), SLOW);
    expect((posts()[1]!.body as { request_key: string }).request_key).toBe(firstKey);
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Uncertain"), SLOW);
    expect(pane.textContent).toContain("This plan asked the Trading System to act");

    await fill(pane, { note: "Pause while the broker is rechecked" });
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(posts()).toHaveLength(3), SLOW);
    expect((posts()[2]!.body as { request_key: string }).request_key).not.toBe(firstKey);
    await waitFor(() => expect(within(pane).getByRole("list", { name: "Command state" }).querySelector("[aria-current='step']")?.textContent).toContain("Preview"), SLOW);
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
    await waitFor(() => expect(posts()).toHaveLength(1), SLOW);
    await waitFor(() => expect(pane.textContent).toContain("COMMAND_R2: kill switch engaged"), SLOW);
    expect((within(pane).getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((c) => /\/apply$/.test(c.path))).toBe(false);
  });

  it("a payload rejection is explained without repeating the payload", async () => {
    const spy = override({ planCommand: async () => ({ ok: false, status: "insufficient_data", reason: "One field in this request is named like a credential or secret." }) });
    mount("/administration/actions?sel=account-sync", {}, spy);
    const pane = await dock();
    await fill(pane, { note: "my secret-token-abc123 note" });
    fireEvent.click(makePlan(pane));
    await waitFor(() => expect(pane.textContent).toContain("named like a credential"), SLOW);
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
    await waitFor(() => expect(search().get("sel")).toBe("health"), SLOW);
    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
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
    await waitFor(() => expect(pane.textContent).toContain("Source command sent: no"), SLOW);
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
    const limited = screen.getByText("Reasons limited to the task catalogue");
    expect(whyText(limited.parentElement)).toMatch(/staged-activation read failed \(ACTIVATION_DOWN\)/);
  });

  it("loading", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading Admin Actions" })).toBeTruthy();
    await loaded();
  });
});

describe("the auto-open is once, filter-aware and does not take focus", () => {
  /** A matchMedia whose `(max-width)` query can be flipped by the test. */
  function stubMedia(initialOverlay: boolean) {
    let matches = initialOverlay;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      // The page's own wide query (`min-width`) is the opposite of the overlay query (`max-width`): overlay means not wide.
      get matches() { return query.includes("min-width") ? !matches : matches; },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    return (overlay: boolean) => {
      matches = overlay;
      act(() => listeners.forEach((fn) => fn()));
    };
  }

  it("widening the window after the first load does not open a pane unprompted", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const setOverlay = stubMedia(true);
    mount();
    await loaded();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(search().get("sel")).toBeNull();
    setOverlay(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(search().get("sel")).toBeNull();
  });

  it("opens a ready row the active state filter shows; with none ready it opens the first row shown, once", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    mount("/administration/actions?state=not-enabled");
    await loaded();
    // No ready row is visible under this filter: the pane opens on the first row shown (WP-E: never a list beside an empty column).
    const first = await dock();
    expect(within(first).getByRole("heading", { name: "Capital history" })).toBeTruthy();
    // Closing it and showing everything afterwards does not open another: the one chance was the first load.
    fireEvent.click(within(first).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
    fireEvent.click(screen.getByRole("button", { name: /^All \d+$/ }));
    await waitFor(() => expect(search().get("state")).toBeNull(), SLOW);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("complementary")).toBeNull();
    cleanup();
    mount("/administration/actions?state=ready");
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: "System health" })).toBeTruthy();
  });

  it("the auto-opened pane does not take focus; a row the reader picks does", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    mount();
    const pane = await dock();
    expect(document.activeElement).not.toBe(pane);
    expect(pane.contains(document.activeElement)).toBe(false);
    const other = within(tierTable("Read")).getAllByRole("row").slice(1).find((r) => !r.textContent?.includes("System health"))!;
    fireEvent.click(other);
    await waitFor(() => expect(search().get("sel")).not.toBe("health"), SLOW);
    const next = await dock();
    await waitFor(() => expect(document.activeElement).toBe(next), SLOW);
  });

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("Close on the auto-opened pane leaves focus on the first table row, not lost on the body", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    mount();
    const pane = await dock();
    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
    const first = within(tierTable("Read")).getAllByRole("row")[1]!;
    expect(document.activeElement).toBe(first);
  }, SLOW_TEST);

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("a pane the reader opened themselves takes focus and gives it back to that row on Close", async () => {
    mount();
    await loaded();
    const row = within(tierTable("Read")).getAllByRole("row")[2]!;
    row.focus();
    fireEvent.click(row);
    const pane = await dock();
    await waitFor(() => expect(document.activeElement).toBe(pane), SLOW);
    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
    expect(document.activeElement).toBe(row);
  }, SLOW_TEST);
});

describe("the auto-open: first successful load, tier order, per workspace", () => {
  it("a first read with no actions spends the one chance: a later refresh that returns rows opens nothing", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const base = await baseTasks();
    let n = 0;
    const api = override({
      getOperatorTasks: async () => {
        n += 1;
        return { ok: true as const, value: n === 1 ? { ...base, tasks: [], totalTasks: 0 } : base, warnings: [] as string[] };
      },
    });
    mount("/administration/actions", {}, api);
    expect(await screen.findByText(/No actions are published for this profile/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await loaded();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(search().get("sel")).toBeNull();
  });

  it("opens the first ready action in the order the tiers are drawn, not in raw task order", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const base = await baseTasks();
    const health = base.tasks.find((t) => t.taskId === "health")!;
    const other = base.tasks.find((t) => t.taskGroup !== health.taskGroup && t.taskGroup !== "PORTFOLIO_CAPITAL" && t.taskGroup !== "EMERGENCY_DESTRUCTIVE")!;
    // Raw order lists health first; the server declares the other action's group first, so that tier is drawn first.
    const value = { ...base, tasks: [health, { ...other, state: "CONNECTED" }], totalTasks: 2, taskGroups: [other.taskGroup, health.taskGroup] };
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(value as TaskCatalogue) }));
    await dock();
    await waitFor(() => expect(search().get("sel")).toBe(other.taskId), SLOW);
  });

  it("a new workspace is a new arrival and may open once; the same workspace refreshing opens nothing more", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const api = httpApi();
    const tree = (workspaceId: string) => (
      <MemoryRouter initialEntries={["/administration/actions"]}>
        <AdminScreen api={api} workspaceId={workspaceId} />
        <Where />
      </MemoryRouter>
    );
    const view = render(tree("ws_1"));
    const pane = await dock();
    await waitFor(() => expect(search().get("sel")).toBe("health"), SLOW);
    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await loaded();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("complementary")).toBeNull();
    view.rerender(tree("ws_2"));
    await dock();
    await waitFor(() => expect(search().get("sel")).toBe("health"), SLOW);
  });
});

describe("a failed refresh keeps the last good reads, and acting waits for a good one", () => {
  const STALE = /The last refresh failed; refresh before acting/;

  it("Run read is a disabled action with the reason while the catalogue is stale, and live again after a good refresh", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    const real = httpApi();
    let n = 0;
    const api = override({
      getCommandCatalogue: async (...args) => {
        n += 1;
        return n === 2 ? { ok: false as const, status: "unavailable" as const, reason: "CATALOGUE_DOWN" } : real.getCommandCatalogue(...args);
      },
    });
    mount("/administration/actions?sel=health", {}, api);
    const pane = await dock();
    fireEvent.change(within(pane).getByLabelText(/^mode/), { target: { value: "paper" } });
    expect((within(pane).getByRole("button", { name: "Run read" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Showing the last good read\. The refresh failed for the command catalogue \(CATALOGUE_DOWN\)/);
    const run = within(pane).getByRole("button", { name: "Run read" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(pane.textContent).toMatch(STALE);
    expect(run.getAttribute("aria-describedby")).toBeTruthy();
    expect(within(pane).queryByLabelText(/^mode/)).toBeNull();
    fireEvent.click(run);
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText(/The refresh failed/)).toBeNull(), SLOW);
    expect(pane.textContent).not.toMatch(STALE);
    // What the reader typed before the failed refresh is still there.
    expect((within(pane).getByLabelText(/^mode/) as HTMLInputElement).value).toBe("paper");
    expect((within(pane).getByRole("button", { name: "Run read" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Make plan is a disabled action with the reason while any read is stale, keeps the form's text, and posts nothing", async () => {
    const real = httpApi();
    let n = 0;
    const api = override({
      getActivationCapabilities: async (...args) => {
        n += 1;
        return n === 2 ? { ok: false as const, status: "unavailable" as const, reason: "ACTIVATION_DOWN" } : real.getActivationCapabilities(...args);
      },
    });
    mount("/administration/actions?sel=account-sync", {}, api);
    const pane = await dock();
    fireEvent.change(within(pane).getByLabelText(/^Target \(/), { target: { value: "acc_1" } });
    fireEvent.change(within(pane).getByLabelText(/Target version/), { target: { value: "3" } });
    fireEvent.change(within(pane).getByLabelText(/^Note/), { target: { value: "Pause while the broker is checked" } });
    expect((within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/The refresh failed for the staged activation \(ACTIVATION_DOWN\)/);
    const make = within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement;
    expect(make.disabled).toBe(true);
    expect(pane.textContent).toMatch(STALE);
    fireEvent.click(make);
    expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText(/The refresh failed/)).toBeNull(), SLOW);
    expect((within(pane).getByLabelText(/^Note/) as HTMLInputElement).value).toBe("Pause while the broker is checked");
    expect((within(pane).getByRole("button", { name: "Make plan" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a gate that already refuses keeps its own reason, not the stale one", async () => {
    const real = httpApi();
    let n = 0;
    const api = override({
      getActivationCapabilities: async (...args) => {
        n += 1;
        return n === 2 ? { ok: false as const, status: "unavailable" as const, reason: "ACTIVATION_DOWN" } : real.getActivationCapabilities(...args);
      },
    });
    mount("/administration/actions?sel=emergency-close", {}, api);
    const pane = await dock();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/The refresh failed for the staged activation/);
    expect(pane.textContent).toContain("Needs a second approver and a security key");
    expect(pane.textContent).not.toMatch(STALE);
  });
});

/* ── F5 L1 state matrix: empty, stale (a refresh that fails, a stale catalogue) ─────────── */

/** The double's task catalogue, as the port returns it, to build variants from. */
async function baseTasks() {
  const result = await httpApi().getOperatorTasks();
  if (!result.ok) throw new Error("fixture catalogue unreadable");
  return result.value;
}
type TaskCatalogue = Awaited<ReturnType<typeof baseTasks>>;
const asTasks = (value: TaskCatalogue) => async () => ({ ok: true as const, value, warnings: [] as string[] });

describe("states: empty is not stale is not unavailable", () => {
  it("empty: a catalogue that states zero actions says none are published, with no error and no stale chip", async () => {
    const base = await baseTasks();
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks({ ...base, tasks: [], totalTasks: 0, counts: { connected: 0, inactive: 0, incompatible: 0 } }) }));
    expect(await screen.findByText("No actions are published for this profile. Check Provenance for the catalogue source.")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("0 of 0 can run now");
    expect(text).not.toMatch(/PORTAL_READ_FAILED|Try again|last good read/);
    expect(document.querySelector(".exec-adm-tiers .exec-state")?.getAttribute("data-status")).toBe("empty");
    expect(document.querySelector(".exec-adm-banner[data-tone='stale']")).toBeNull();
    expect(document.querySelector(".exec-adm-tiers")?.getAttribute("data-stale")).toBeNull();
    expect(screen.queryByText(/Some actions are missing/)).toBeNull();
  });

  it("empty is not 'none arrived': a server that states 24 actions while none could be read is Partial, never 'no actions are published'", async () => {
    const base = await baseTasks();
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks({ ...base, tasks: [] }) }));
    expect(await screen.findByText(/The server reports 24 actions but none could be read/)).toBeTruthy();
    expect(screen.queryByText(/No actions are published for this profile/)).toBeNull();
    expect(document.querySelector(".exec-state")?.getAttribute("data-status")).toBe("partial");
    expect(screen.getByText(/Some actions are missing\. 0 of 24 reported\./)).toBeTruthy();
  });

  it("stale (freshness): a catalogue the server calls STALE keeps every row and says Stale, not unavailable", async () => {
    const live = httpApi();
    const base = await live.getCommandCatalogue();
    if (!base.ok) throw new Error("fixture command catalogue unreadable");
    const stale = { ...base.value, scope: { ...base.value.scope!, freshnessState: "STALE" } };
    mount("/administration/actions", {}, override({ getCommandCatalogue: async () => ({ ok: true as const, value: stale, warnings: [] as string[] }) }));
    await loaded();
    expect(document.querySelector(".exec-adm-fresh .exec-flag")?.getAttribute("data-k")).toBe("stale");
    expect(document.querySelector(".exec-adm-fresh")?.textContent).toContain("Stale");
    expect(within(tierTable("Read")).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.queryByText(/PORTAL_READ_FAILED|Try again/)).toBeNull();
  });

  it("stale (refresh failed): the last good rows stay, demoted, with the reason; nothing is blanked and the state is not 'unavailable'", async () => {
    let calls = 0;
    const base = await baseTasks();
    const api = override({
      getOperatorTasks: async () => {
        calls += 1;
        return calls === 1 ? { ok: true as const, value: base, warnings: [] as string[] } : { ok: false as const, status: "unavailable" as const, reason: "TASKS_STORE_DOWN" };
      },
    });
    mount("/administration/actions", {}, api);
    await loaded();
    const before = within(tierTable("Read")).getAllByRole("row").length;
    expect(document.querySelector(".exec-adm-tiers")?.getAttribute("data-stale")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const banner = await screen.findByText(/Showing the last good read\. The refresh failed for the task catalogue \(TASKS_STORE_DOWN\)/);
    expect(banner.closest("[role='status']")?.querySelector(".exec-flag")?.getAttribute("data-k")).toBe("stale");
    expect(document.querySelector(".exec-adm-tiers")?.getAttribute("data-stale")).toBe("true");
    expect(within(tierTable("Read")).getAllByRole("row")).toHaveLength(before);
    expect(screen.getByText("0 of 24 can run now")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
    expect(document.querySelector(".exec-state[data-status='unavailable']")).toBeNull();
    // A good refresh clears it.
    calls = 0;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(document.querySelector(".exec-adm-tiers")?.getAttribute("data-stale")).toBeNull(), SLOW);
    expect(screen.queryByText(/The refresh failed/)).toBeNull();
  });

  it("stale (refresh failed) names each read that is stale, including a throw, and a denied refresh replaces the rows instead", async () => {
    let calls = 0;
    const base = await baseTasks();
    const api = override({
      getOperatorTasks: async () => {
        calls += 1;
        if (calls === 1) return { ok: true as const, value: base, warnings: [] as string[] };
        throw new Error("network");
      },
    });
    mount("/administration/actions", {}, api);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/task catalogue \(PORTAL_READ_FAILED\)/)).toBeTruthy();
    cleanup();

    let n = 0;
    const denied = override({
      getOperatorTasks: async () => {
        n += 1;
        return n === 1 ? { ok: true as const, value: base, warnings: [] as string[] } : { ok: false as const, status: "denied" as const, reason: "ADMIN_ONLY" };
      },
    });
    mount("/administration/actions", {}, denied);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    // A refusal is a fact about now, not staleness: no rows from before remain.
    expect(await screen.findByText("You can't open this page")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Read actions" })).toBeNull();
    expect(document.body.textContent).not.toContain("System health");
  });

  it("a first read that fails has nothing to keep: it is unavailable, not stale", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: async () => ({ ok: false, status: "unavailable", reason: "TASKS_STORE_DOWN" }) }));
    expect(await screen.findByText(/TASKS_STORE_DOWN/)).toBeTruthy();
    expect(screen.queryByText(/last good read/)).toBeNull();
    expect(document.querySelector(".exec-state")?.getAttribute("data-status")).toBe("unavailable");
  });
});

/* ── F5 L2 scale: ROW_CAP ───────────────────────────────────────────────────────────────── */

describe("row cap: 200 rows drawn, the label names the rest", () => {
  async function many(count: number, reported: number | null = count) {
    const base = await baseTasks();
    const template = base.tasks.find((t) => t.taskGroup === "READ_INSPECT")!;
    const tasks = Array.from({ length: count }, (_, i) => ({ ...template, taskId: `bulk-${i}`, title: `Bulk ${i}`, displayName: null, catalogKey: null }));
    return { ...base, tasks, totalTasks: reported, taskGroups: ["READ_INSPECT"] };
  }
  const drawn = () => within(tierTable("Read")).getAllByRole("row").length - 1;
  const capLabel = () => screen.queryByText(/^Showing \d+ of \d+ actions\./);

  it("exactly 200: every row is drawn and there is no cap label", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(await many(200)) }));
    await screen.findByRole("heading", { name: "Read" });
    expect(drawn()).toBe(200);
    expect(capLabel()).toBeNull();
    expect(document.querySelector(".exec-adm-banner[data-tone='cap']")).toBeNull();
  });

  it("201: 200 rows in the DOM and 'Showing 200 of 201 actions.'", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(await many(201)) }));
    await screen.findByRole("heading", { name: "Read" });
    expect(drawn()).toBe(200);
    const label = document.querySelector(".exec-adm-banner[data-tone='cap']")!;
    expect(label.textContent).toContain("Showing 200 of 201 actions.");
    expect(label.textContent).not.toContain("only what was loaded");
    expect(screen.queryAllByText("Bulk 200")).toHaveLength(0);
    expect(within(tierTable("Read")).getByText("Bulk 199")).toBeTruthy();
    // The counts say they cover the rows drawn, not the loaded list.
    expect(label.textContent).toContain("cover the 200 shown");
    expect(screen.getByRole("button", { name: /^All 200$/ })).toBeTruthy();
  });

  it("500: still 200 rows (and 200 provenance rows), 'Showing 200 of 500 actions.'", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(await many(500)) }));
    await screen.findByRole("heading", { name: "Read" });
    expect(drawn()).toBe(200);
    const provenance = within(document.querySelector("details.exec-adm-prov") as HTMLElement).getByRole("table", { name: "Action provenance", hidden: true });
    expect(within(provenance).getAllByRole("row", { hidden: true }).length - 1).toBe(200);
    expect(document.querySelector(".exec-adm-banner[data-tone='cap']")!.textContent).toContain("Showing 200 of 500 actions.");
  });

  it("when the server reports more than was loaded, 500 is said to be only what was loaded", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(await many(500, 900)) }));
    await screen.findByRole("heading", { name: "Read" });
    expect(drawn()).toBe(200);
    const label = document.querySelector(".exec-adm-banner[data-tone='cap']")!.textContent ?? "";
    expect(label).toContain("Showing 200 of 500 actions.");
    expect(label).toContain("500 is only what was loaded; the server reports 900.");
    expect(screen.getByText(/Some actions are missing\. 500 of 900 reported\./)).toBeTruthy();
  });

  it("an unstated server total never invents a bigger number", async () => {
    mount("/administration/actions", {}, override({ getOperatorTasks: asTasks(await many(250, null)) }));
    await screen.findByRole("heading", { name: "Read" });
    const label = document.querySelector(".exec-adm-banner[data-tone='cap']")!.textContent ?? "";
    expect(label).toContain("Showing 200 of 250 actions.");
    expect(label).not.toContain("the server reports");
  });
});
