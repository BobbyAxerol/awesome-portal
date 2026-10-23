/**
 * Access self-view V2: every state, the capability-derived rows for the four
 * presets, the owner tab, the user-mismatch refusal, honest absences and the
 * a11y roles. The read is the e2e double's answer through the real strict
 * reader, so the screen is tested against what HTTP would hand it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_DOUBLE_WORKSPACES, answerAccessEffective } from "../../../../../e2e/bffDoubleAccess";
import { V2_CAPABILITY, V2_ROLE_PRESETS } from "../../shell/roleNav";
import AccessSelfView, { ACCESS_PATH, type AccessSelfViewProps } from "./index";
import { ADMIN_CAPABILITY, ROW_CAP } from "./model";
import { whyText } from "../../gapWhyTestUtil";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const ME = "usr_me";
const NOW = Date.UTC(2026, 9, 18, 12, 4);

function signIn(options: { capabilities?: Iterable<string>; owner?: boolean; ownerState?: string; userId?: string } = {}) {
  session.current = {
    principal: { principalId: "p_me", username: "stan", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: {
      kind: "ready",
      access: {
        userId: options.userId ?? ME,
        isOwner: options.owner ?? false,
        ownerState: options.ownerState ?? (options.owner ? "OWNER" : "NOT_OWNER"),
        capabilities: [...(options.capabilities ?? [])],
      },
    },
  };
}

beforeEach(() => signIn());
afterEach(() => {
  cleanup();
  session.current = null;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The double as a fetch: same routing and same refusals as the e2e stub. */
function doubleFetch(userId = ME) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://portal.test");
    const answer = answerAccessEffective("GET", url.pathname, url.searchParams, { userId });
    if (answer === null) return json({ error: { code: "NOT_FOUND" } }, 404);
    return json(answer.body, answer.status);
  });
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(props: Partial<AccessSelfViewProps> = {}, entry = `${ACCESS_PATH}?workspace_id=${ACCESS_DOUBLE_WORKSPACES.pending}`) {
  const fetchImpl = props.fetchImpl ?? (doubleFetch() as unknown as typeof fetch);
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AccessSelfView now={() => NOW} {...props} fetchImpl={fetchImpl} />
      <Where />
    </MemoryRouter>,
  );
  return { ...view, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn> };
}

const workspace = (key: keyof typeof ACCESS_DOUBLE_WORKSPACES) => `${ACCESS_PATH}?workspace_id=${ACCESS_DOUBLE_WORKSPACES[key]}`;
const granted = () => screen.findByRole("table", { name: "Granted to you" });
const rowsOf = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l="${label}"]`) as HTMLElement;

describe("identity strip", () => {
  it("names the signed-in user and the owner state from the session, with no preset name", async () => {
    signIn({ capabilities: ["governance.r1.read"] });
    mount();
    await granted();
    const strip = document.querySelector('[aria-label="Who you are signed in as"]') as HTMLElement;
    expect(within(strip).getByText("Signed in as").nextElementSibling?.textContent).toBe("stan");
    expect(within(strip).getByText("usr_me")).toBeTruthy();
    // Four tiles, as the design has them. The owner state and the capability count are published facts and ride on the Role preset tile's note.
    expect(strip.querySelectorAll(".exec-acc-kpi")).toHaveLength(4);
    expect(within(strip).getByTestId("acc-owner-note").textContent).toBe("Not an owner · 1 capability held");
    // Role preset keeps its tile (hi-fi) and says Not available: no preset name is invented from the capabilities.
    expect(within(strip).getByText("Role preset").nextElementSibling?.textContent).toBe("Not available");
    // "Researcher field policy" is a published policy field, not a preset name.
    const text = (document.body.textContent ?? "").replace("Researcher field policy", "");
    for (const preset of ["Manager", "Researcher", "Operator", "Reviewer", "Viewer"]) {
      expect(text).not.toContain(preset);
    }
  });

  it("says Owner for an owner and keeps an unclaimed anchor distinct", async () => {
    signIn({ owner: true });
    mount();
    await granted();
    expect(screen.getByTestId("acc-owner-note").textContent).toMatch(/^Owner · 0 capabilities held$/);
    cleanup();
    signIn({ ownerState: "OWNER_ANCHOR_UNCLAIMED" });
    mount();
    await granted();
    expect(screen.getByTestId("acc-owner-note").textContent).toMatch(/^Owner anchor unclaimed/);
  });
});

describe("POLICY_PENDING", () => {
  it("shows the banner with its reason, an honest empty table and the policy facts", async () => {
    mount();
    await granted();
    const banner = screen.getByText("Access policy pending.").closest("p") as HTMLElement;
    expect(banner.textContent).toContain("No access policy has been published as effective for this workspace yet.");
    // UXM07-048/4: the code is hidden text on the banner, not a visible token
    expect(within(banner).getByText("(POLICY_PENDING)").className).toContain("exec-blk-sr");
    expect(screen.getByText("No grants are listed while the access policy is pending.")).toBeTruthy();
    expect(screen.getByText("Access policy").nextElementSibling?.textContent).toBe("Pending");
    expect(screen.getByText("No revision published")).toBeTruthy();
    const facts = screen.getByText("Researcher field policy").closest("dl") as HTMLElement;
    // UXM07-048: the undecided policy is the plain words "Not decided"; its request id is in the disclosure, not on the line
    const policy = within(facts).getByText(/Not decided/).closest("dd") as HTMLElement;
    expect(policy.textContent).not.toContain("FE-026");
    expect(whyText(policy)).toContain("Not published (FE-026)");
    expect(within(facts).getByText("OWNER_RECOVERY_NOT_APPROVED")).toBeTruthy();
    expect(within(facts).getByText("Off")).toBeTruthy();
  });

  it("never invents who granted anything", async () => {
    mount();
    await granted();
    expect(screen.queryByRole("columnheader", { name: /granted by/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Granted by\b(?! each)/);
    const gaps = screen.getByTestId("not-available-line");
    expect(gaps.textContent).toContain("Who granted each item");
    expect(whyText(gaps)).toContain("Who granted each item: Not published (FE-015)");
  });
});

describe("AVAILABLE with grants", () => {
  it("lists each grant with scope, environments, UTC validity, revision and its flags", async () => {
    mount({}, workspace("available"));
    const table = await granted();
    const rows = rowsOf(table);
    expect(rows).toHaveLength(4);
    const first = rows[0];
    expect(cell(first, "Access").textContent).toContain("portfolio.read");
    expect(cell(first, "Access").textContent).toContain("Allow");
    expect(cell(first, "Scope").textContent).toContain("Portfolio: pf_TEST_ONLY_core, pf_TEST_ONLY_satellite");
    // Environments and Revision ride under Scope and Access (QA1 I-29: eight columns did not fit the panel at 1024).
    expect(within(cell(first, "Scope")).getByTestId("acc-grant-env").textContent).toBe("Paper, Sandbox");
    expect(cell(first, "Since").textContent).toBe("1 Sep 09:14Z");
    expect(cell(first, "Expires").textContent).toBe("No end date");
    expect(within(cell(first, "Access")).getByTestId("acc-grant-rev").textContent).toBe("Revision r3_TEST_ONLY");
    expect(cell(first, "State").querySelector(".exec-flag")?.getAttribute("data-k")).toBe("ok");
    expect(cell(first, "State").textContent).toContain("Current");
    expect(cell(first, "Trading system").textContent).toContain("Not required");

    const third = rows[2];
    expect(cell(third, "Expires").textContent).toBe("31 Jan 00:00Z");
    expect(cell(third, "State").textContent).toContain("Not current");
    expect(cell(third, "State").querySelector(".exec-flag")?.getAttribute("data-k")).toBe("paused");
    expect(cell(third, "Trading system").querySelector(".exec-flag")?.getAttribute("data-k")).toBe("pending");
    expect(cell(rows[3], "Access").textContent).toContain("Deny");

    expect(screen.queryByText("Access policy pending.")).toBeNull();
    expect(screen.getByText("Access policy").nextElementSibling?.textContent).toBe("Available");
    expect(screen.getByText("Revision p1_TEST_ONLY")).toBeTruthy();
  });

  it("asks for exactly this workspace, same-origin and uncached", async () => {
    const { fetchImpl } = mount({}, workspace("available"));
    await granted();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/profile-access/v2/effective?workspace_id=ws_TEST_GRANTS");
    expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });

  it("states a read time from the browser clock and offers Refresh", async () => {
    mount({}, workspace("available"));
    await granted();
    expect(screen.getByText("Read 18 Oct 12:04Z")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("an AVAILABLE read with no grants says nothing is published, not that policy is pending", async () => {
    mount({}, workspace("empty"));
    await granted();
    expect(screen.getByText("No grants are published for you in this workspace.")).toBeTruthy();
    expect(screen.queryByText("Access policy pending.")).toBeNull();
  });
});

describe("refusals and failures are distinct states", () => {
  it("denied (403) names the refusal and the request id and does not blank the capability tables", async () => {
    signIn({ capabilities: ["governance.r1.read"] });
    mount({}, workspace("denied"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Not permitted.");
    expect(alert.textContent).toContain("403");
    expect(alert.textContent).toContain("ACCESS_DENIED");
    expect(alert.textContent).toContain("req_double_access_effective");
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();
    expect(screen.getByRole("table", { name: "What you can see" })).toBeTruthy();
  });

  it("unavailable (503) is a different sentence from denied", async () => {
    mount({}, workspace("unavailable"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Not available.");
    expect(alert.textContent).toContain("The Portal answered 503.");
    expect(alert.textContent).not.toContain("Not permitted");
  });

  it("a network failure is unavailable", async () => {
    mount({ fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The Portal could not be reached.");
  });

  it("a body the strict reader refuses is unavailable, and no grant of it is shown", async () => {
    mount({}, workspace("malformed"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("did not match the published access contract");
    expect(screen.queryByText("NOT A TOKEN")).toBeNull();
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();
  });

  it("another schema version is unavailable and named", async () => {
    mount({ fetchImpl: (async () => json({ schema_version: "portal.access-effective.v9" })) as unknown as typeof fetch });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("portal.access-effective.v9");
  });

  it("an answer for another user is never shown as yours", async () => {
    mount({}, workspace("otherUser"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("different user than the one signed in");
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();
  });

  it("an answer for another workspace is refused", async () => {
    mount({
      fetchImpl: (async () => {
        const answer = answerAccessEffective("GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: "ws_elsewhere" }), { userId: ME });
        return json(answer!.body);
      }) as unknown as typeof fetch,
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("different workspace");
  });

  it("without a workspace in the address nothing is requested and the card says exactly what is missing (D2)", async () => {
    const { fetchImpl } = mount({}, ACCESS_PATH);
    const note = await screen.findByText(/No workspace is named for this read/);
    expect(note.closest("p")?.textContent).toContain("Not available.");
    expect(note.closest("p")?.textContent).toContain("No workspace is named for this read.");
    expect(document.body.textContent).not.toContain("No workspace is named in the address");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
  });

  it("a session that publishes a workspace is read without the address naming one (D2)", async () => {
    const { fetchImpl } = mount({ sessionWorkspaceId: ACCESS_DOUBLE_WORKSPACES.pending }, ACCESS_PATH);
    await granted();
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toBe(`/api/admin/profile-access/v2/effective?workspace_id=${ACCESS_DOUBLE_WORKSPACES.pending}`);
    expect(screen.queryByText(/The session does not publish a workspace/)).toBeNull();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
  });

  it("the address wins over the session's workspace", async () => {
    const { fetchImpl } = mount({ sessionWorkspaceId: "ws_from_session" }, workspace("pending"));
    await granted();
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.endsWith(`workspace_id=${ACCESS_DOUBLE_WORKSPACES.pending}`))).toBe(true);
  });

  it("an empty session workspace is no workspace: nothing is requested", async () => {
    const { fetchImpl } = mount({ sessionWorkspaceId: "" }, ACCESS_PATH);
    await screen.findByText(/No workspace is named for this read/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("while the read is in flight the card says loading, not empty", async () => {
    mount({ fetchImpl: (() => new Promise(() => undefined)) as unknown as typeof fetch });
    expect((await screen.findAllByRole("status")).some((el) => el.textContent === "Loading your grants.")).toBe(true);
    expect(screen.queryByText(/No grants/)).toBeNull();
  });

  it("a refresh that fails keeps the last good grants and flags them stale", async () => {
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls += 1;
      if (calls > 1) return json({ error: { code: "ACCESS_UNAVAILABLE", request_id: "req_stale_1" } }, 503);
      const url = new URL(String(input), "http://portal.test");
      return json(answerAccessEffective("GET", url.pathname, url.searchParams, { userId: ME })!.body);
    }) as unknown as typeof fetch;
    mount({ fetchImpl }, workspace("available"));
    await granted();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const banner = await screen.findByText(/The refresh failed/);
    expect(banner.closest("p")?.textContent).toContain("Stale");
    expect(banner.closest("p")?.textContent).toContain("Showing the last good read from 18 Oct 12:04Z");
    expect(banner.closest("p")?.textContent).toContain("req_stale_1");
    expect(rowsOf(screen.getByRole("table", { name: "Granted to you" }))).toHaveLength(4);
  });

  it("while the session is still loading the identity and the tables say loading", async () => {
    session.current = { principal: null, access: { kind: "loading" } };
    mount();
    expect((await screen.findAllByText("Loading your permissions.")).length).toBe(2);
    expect(screen.queryByRole("table", { name: "What you can do" })).toBeNull();
  });

  it("a session that could not be read shows no row as allowed or blocked", async () => {
    session.current = { principal: null, access: { kind: "unavailable", requestId: "req_sess_9" } };
    mount();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("no area is shown as allowed or blocked"))).toBe(true);
    expect(alerts.some((a) => a.textContent?.includes("req_sess_9"))).toBe(true);
    expect(screen.queryByRole("table", { name: "What you can see" })).toBeNull();
    expect(screen.queryByRole("table", { name: "What you can do" })).toBeNull();
  });
});

describe("what you can see and do come from capabilities alone", () => {
  const statusOf = (table: HTMLElement, label: string) => {
    const row = rowsOf(table).find((r) => cell(r, "Area")?.textContent === label || cell(r, "Action")?.textContent === label);
    expect(row, label).toBeTruthy();
    return cell(row as HTMLElement, "Status").textContent ?? "";
  };

  it.each([
    ["manager", ["Decide at R1 gate", "Decide at R2 gate", "Decide at Canary gate", "Decide at Live gate"], ["Manage grants", "Manage users"]],
    ["researcher", [], ["Decide at R1 gate", "Manage grants"]],
    ["operator", [], ["Decide at R1 gate", "Decide at Live gate"]],
    ["reviewer", ["Decide at R1 gate", "Decide at Live gate"], ["Manage grants"]],
  ] as const)("%s preset rows", async (preset, allowed, blocked) => {
    signIn({ capabilities: V2_ROLE_PRESETS[preset] });
    mount();
    const doTable = await screen.findByRole("table", { name: "What you can do" });
    for (const label of allowed) expect(statusOf(doTable, label), label).toContain("Allowed");
    for (const label of blocked) expect(statusOf(doTable, label), label).toContain("Not allowed");
  });

  it("the see table follows the preset: operator sees Operations and no gate, researcher the reverse of Portfolios", async () => {
    signIn({ capabilities: V2_ROLE_PRESETS.operator });
    mount();
    const see = await screen.findByRole("table", { name: "What you can see" });
    expect(statusOf(see, "Operations")).toContain("Can see");
    expect(statusOf(see, "R1 gate")).toContain("Not shown");
    cleanup();
    signIn({ capabilities: V2_ROLE_PRESETS.researcher });
    mount();
    const see2 = await screen.findByRole("table", { name: "What you can see" });
    expect(statusOf(see2, "Portfolios")).toContain("Not shown");
    expect(statusOf(see2, "R1 gate")).toContain("Can see");
  });

  it("a blocked action carries its reason and a My access link that keeps the workspace", async () => {
    signIn({ capabilities: V2_ROLE_PRESETS.operator });
    mount();
    const doTable = await screen.findByRole("table", { name: "What you can do" });
    const row = rowsOf(doTable).find((r) => cell(r, "Action").textContent === "Decide at R1 gate") as HTMLElement;
    expect(cell(row, "Why").textContent).toContain("Needs governance.r1.decide");
    const link = within(cell(row, "Why")).getByRole("link", { name: "My access" });
    expect(link.getAttribute("href")).toBe(`${ACCESS_PATH}?workspace_id=ws_TEST_ONLY`);
    // An allowed row has no link.
    signIn({ capabilities: V2_ROLE_PRESETS.manager });
    cleanup();
    mount();
    const again = await screen.findByRole("table", { name: "What you can do" });
    const allowedRow = rowsOf(again).find((r) => cell(r, "Action").textContent === "Decide at R1 gate") as HTMLElement;
    expect(within(allowedRow).queryByRole("link")).toBeNull();
    expect(cell(allowedRow, "Why").textContent).toBe("governance.r1.decide");
  });

  it("says once that the four menu entries follow the navigation read and are no capability, and what is not published", async () => {
    mount();
    await granted();
    // One short line (the full sentence and FE-037 are its title), and one "Not available" line with FE-015.
    expect(screen.getAllByText(/Menu entries from your navigation read/)).toHaveLength(1);
    expect(screen.getByText(/Menu entries from your navigation read/).getAttribute("title")).toContain("as four navigation rows, and this list follows that read (FE-037)");
    expect(document.body.textContent).not.toMatch(/execution\.(portfolios|accounts|operations)\.read|blotter\.read|Provisional capability/);
    const gaps = screen.getByTestId("not-available-line");
    expect(gaps.textContent).toContain("Per-action eligibility");
    expect(whyText(gaps)).toContain("Per-action eligibility: Not published (FE-015)");
  });

  it("lists a session capability no row names instead of dropping it", async () => {
    signIn({ capabilities: ["future.thing.read"] });
    mount();
    await granted();
    expect(screen.getByText("future.thing.read")).toBeTruthy();
  });
});

describe("owner and non-owner", () => {
  const ownerCaps = [ADMIN_CAPABILITY.profileAccessManage, V2_CAPABILITY.governanceR1Read];
  const Manage = () => <div data-testid="v1-matrix">V1 grant matrix</div>;

  it("a non-owner gets the self-view and no tabs, even when a manage surface exists", async () => {
    mount({ manage: <Manage /> });
    await granted();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
  });

  it("a non-owner cannot reach the V1 surface by writing view=manage", async () => {
    mount({ manage: <Manage /> }, `${workspace("pending")}&view=manage`);
    await granted();
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
  });

  it("an owner sees two tabs, opens the V1 matrix on the second and comes back", async () => {
    signIn({ owner: true, capabilities: ownerCaps });
    mount({ manage: <Manage /> });
    await granted();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["My access", "Manage grants"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("exec-acc-tab-self");

    fireEvent.click(tabs[1]);
    await screen.findByTestId("v1-matrix");
    expect(screen.getByTestId("where").textContent).toContain("view=manage");
    expect(screen.getByTestId("where").textContent).toContain("workspace_id=ws_TEST_ONLY");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("exec-acc-tab-manage");
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "My access" }));
    await granted();
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
    expect(screen.getByTestId("where").textContent).not.toContain("view=");
  });

  it("arrow keys move between the tabs", async () => {
    signIn({ owner: true, capabilities: ownerCaps });
    mount({ manage: <Manage /> });
    await granted();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    await screen.findByTestId("v1-matrix");
  });

  it("an owner with no manage surface has no tabs", async () => {
    signIn({ owner: true, capabilities: ownerCaps });
    mount();
    await granted();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  // W3 / task 3: the admin matrix is gated on the admin CAPABILITY as well as the owner flag, and fails closed on either missing.
  it("an owner flag WITHOUT the admin capability gets the self-view only, even with view=manage written by hand", async () => {
    signIn({ owner: true, capabilities: [V2_CAPABILITY.governanceR1Read] });
    mount({ manage: <Manage /> }, `${workspace("pending")}&view=manage`);
    await granted();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
  });

  it("the admin capability WITHOUT the owner flag gets the self-view only", async () => {
    signIn({ owner: false, capabilities: ownerCaps });
    mount({ manage: <Manage /> }, `${workspace("pending")}&view=manage`);
    await granted();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
  });

  it("a session that has not loaded, or could not be read, offers no matrix and no tab", async () => {
    for (const access of [{ kind: "loading" }, { kind: "unavailable", requestId: null }]) {
      session.current = { principal: null, access };
      const view = mount({ manage: <Manage /> }, `${workspace("pending")}&view=manage`);
      await screen.findByRole("heading", { level: 1 });
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryByTestId("v1-matrix")).toBeNull();
      view.unmount();
    }
  });

  it("an ordinary user's self-view reads only the self endpoint: no admin policy or users request is made", async () => {
    const fetchImpl = doubleFetch() as unknown as typeof fetch;
    mount({ manage: <Manage />, fetchImpl }, workspace("available"));
    await granted();
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => new URL(String(call[0]), "http://portal.test").pathname);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls)).toEqual(new Set(["/api/admin/profile-access/v2/effective"]));
  });
});

describe("structure and absences", () => {
  it("one h1, named sections and a table for each list", async () => {
    mount({}, workspace("available"));
    await granted();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Profile & Access"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What you can see", "What you can do", "Granted to you", "Policy",
    ]);
    for (const name of ["What you can see", "What you can do", "Granted to you"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
      expect(screen.getByRole("table", { name })).toBeTruthy();
    }
  });

  it("every cell carries its column label for the 660px cards", async () => {
    mount({}, workspace("available"));
    await granted();
    for (const td of document.querySelectorAll(".exec-cards tbody td")) {
      expect(td.getAttribute("data-l"), td.textContent ?? "").toBeTruthy();
    }
  });

  it("the reason dictionary lists only the reasons the contract names, by display name with the code in hidden text", async () => {
    mount();
    await granted();
    const dict = screen.getByRole("table", { name: "Reasons this screen can show", hidden: true });
    expect(rowsOf(dict).map((r) => r.querySelector("td")?.textContent)).toEqual(["Access policy pending (POLICY_PENDING)", "Owner recovery not approved (OWNER_RECOVERY_NOT_APPROVED)"]);
  });

  it("an unknown reason code is printed as sent with a line saying it is unknown", async () => {
    const body = answerAccessEffective("GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: "ws_x" }), { userId: ME })!.body as Record<string, unknown>;
    mount({ fetchImpl: (async () => json({ ...body, workspace_id: "ws_x", reason_code: "POLICY_REVIEW_OVERDUE" })) as unknown as typeof fetch }, `${ACCESS_PATH}?workspace_id=ws_x`);
    const banner = (await screen.findByText("Access policy pending.")).closest("p") as HTMLElement;
    expect(banner.textContent).toContain("This reason is not in this build's dictionary.");
    expect(within(banner).getByText("POLICY_REVIEW_OVERDUE")).toBeTruthy();
  });

  it.each(["pending", "available", "empty", "denied", "unavailable", "malformed", "otherUser"] as const)(
    "no dash, en dash or bare placeholder cell in the %s state",
    async (state) => {
      signIn({ capabilities: V2_ROLE_PRESETS.reviewer });
      mount({}, workspace(state));
      await waitFor(() => expect(document.querySelectorAll('[role="status"]').length + document.querySelectorAll('[role="alert"]').length + document.querySelectorAll("table").length).toBeGreaterThan(0));
      await act(async () => { await Promise.resolve(); });
      await waitFor(() => expect(screen.queryByText("Loading your grants.")).toBeNull());
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/[‒-―−]/);
      for (const td of document.querySelectorAll("td, dd")) {
        expect((td.textContent ?? "").trim(), td.outerHTML).not.toMatch(/^(-|0|N\/A)?$/);
      }
    },
  );
});

describe("L2 · grants over the DOM cap", () => {
  /** The double's AVAILABLE answer with `n` grants (unique ids), through the real strict reader. */
  function fetchWithGrants(n: number) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://portal.test");
      const base = answerAccessEffective("GET", url.pathname, url.searchParams, { userId: ME })!.body as { grants: Record<string, unknown>[] };
      const template = base.grants[0];
      const grants = Array.from({ length: n }, (_, i) => ({ ...template, grant_id: `acg_scale_${String(i).padStart(4, "0")}` }));
      return json({ ...base, grants });
    }) as unknown as typeof fetch;
  }
  const mountWith = (n: number) => mount({ fetchImpl: fetchWithGrants(n) }, workspace("available"));
  const capLabel = () => screen.queryByTestId("exec-acc-grants-cap");

  it("200 grants: every row is drawn and there is no label", async () => {
    mountWith(ROW_CAP);
    const rows = rowsOf(await granted());
    expect(rows).toHaveLength(200);
    expect(capLabel()).toBeNull();
    expect(screen.queryByText(/Showing \d+ of \d+ grants/)).toBeNull();
  });

  it("201 grants: 200 rows in the DOM and the exact words 'Showing 200 of 201 grants'", async () => {
    mountWith(ROW_CAP + 1);
    const rows = rowsOf(await granted());
    expect(rows).toHaveLength(200);
    expect(screen.getByTestId("exec-acc-grants-cap-label").textContent).toBe("Showing 200 of 201 grants");
    expect(capLabel()!.textContent).toContain("The other 1 are not drawn here");
    // The first 200 in the order the server sent them; the 201st is not drawn.
    expect(within(cell(rows[0], "Access")).getByTestId("acc-grant-rev").textContent).toBe("Revision r3_TEST_ONLY");
    expect(screen.queryByText("acg_scale_0200")).toBeNull();
  });

  it("500 grants (the reader bound): 200 rows in the DOM and 'Showing 200 of 500 grants', no ellipsis in the numbers", async () => {
    mountWith(500);
    const rows = rowsOf(await granted());
    expect(rows).toHaveLength(200);
    const text = screen.getByTestId("exec-acc-grants-cap-label").textContent!;
    expect(text).toBe("Showing 200 of 500 grants");
    expect(capLabel()!.textContent).not.toMatch(/\u2026|\.\.\./);
    expect(capLabel()!.textContent).toContain("The other 300 are not drawn here");
  });

  it("501 grants stays refused by the reader: unavailable, no table, no label", async () => {
    mountWith(501);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("did not match the published access contract");
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();
    expect(capLabel()).toBeNull();
  });

  it("the DOM stays under budget at the bound: the whole screen holds fewer than 7,000 elements for 500 grants", async () => {
    const { container } = mountWith(500);
    await granted();
    const nodes = container.querySelectorAll("*").length;
    // Measured 6,323 with 200 drawn rows (8 cells, flags, mobile labels); 500 uncapped rows would be about 15,000.
    expect(nodes).toBeLessThan(7000);
    expect(container.querySelectorAll('table[aria-label="Granted to you"] tbody tr, table[aria-label="Granted to you"] tr').length).toBeLessThanOrEqual(ROW_CAP + 1);
  });
});

/* ── "Send capital commands": the one eligibility question this page can ask (DEBT-UXM07-051) ───────────────────────────── */

describe("send capital commands comes from the self-eligibility batch asked about the caller's root", () => {
  /** The available workspace, with one more current ALLOW grant on a root. */
  function fetchWithRootAllow(): typeof fetch {
    const base = doubleFetch();
    return vi.fn(async (input: RequestInfo | URL) => {
      const response = await base(input);
      const body = (await response.json()) as { grants?: Record<string, unknown>[] };
      if (Array.isArray(body.grants)) {
        const template = body.grants.find((g) => (g.selector as { kind?: string }).kind === "ROOT_SCOPE")!;
        body.grants = [...body.grants, { ...template, grant_id: "acg_TEST_ONLY_root_allow", action: "capital.fund", effect: "ALLOW" }];
      }
      return json(body);
    }) as unknown as typeof fetch;
  }

  const challenges = [
    { family: "CAPITAL_COMMAND", mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up", precondition: "CURRENT_OWN_STEP_UP_ACTION_ALLOW", preconditionMet: true },
    { family: "ACCESS_ADMIN", mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up", precondition: "CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW", preconditionMet: false },
  ] as const;

  function batchApi(rowFor: (action: string) => Record<string, unknown>) {
    return {
      getSelfEligibilityBatch: vi.fn(async (request: { workspaceId: string; environment: string; resources: readonly { kind: string; id: string }[]; actions: readonly string[] }) => ({
        ok: true as const,
        value: {
          kind: "eligibility_batch" as const,
          batch: {
            workspaceId: request.workspaceId, environment: request.environment, currentOnly: true as const, advisoryOnly: true as const,
            observedAtMs: NOW, validUntilMs: NOW + 3_600_000,
            sessionStepUp: { state: "NOT_ACTIVE" as const, validUntilMs: null, challenges },
            results: [{ resource: request.resources[0]!, actions: request.actions.map(rowFor) }],
          },
        },
      })),
    };
  }
  const allowed = (action: string) => ({ action, permission: "ALLOWED", reasonClass: "FAMILY_CHECK_REQUIRED", stepUpState: "REQUIRED" });
  const refused = (action: string) => ({ action, permission: "UNAVAILABLE", reasonClass: "NO_CURRENT_PERMISSION", stepUpState: "REQUIRED" });

  const capitalRowIn = async () => {
    const table = await screen.findByRole("table", { name: "What you can do" });
    return rowsOf(table).find((r) => cell(r, "Action").textContent?.startsWith("Send capital commands")) as HTMLElement;
  };

  it("without the port the row says it was not asked, and every other unpublished row says Not available yet", async () => {
    mount({ fetchImpl: fetchWithRootAllow() }, workspace("available"));
    await granted();
    const row = await capitalRowIn();
    expect(cell(row, "Status").textContent).toContain("Not available yet");
    expect(cell(row, "Why").textContent).toContain("opened without the eligibility read");
    const table = await screen.findByRole("table", { name: "What you can do" });
    for (const label of ["Approve archive and reactivation", "Request an archive", "Start a reactivation review", "Acknowledge and resolve operations", "Change your own admin rights", "Export tables"]) {
      const r = rowsOf(table).find((x) => cell(x, "Action").textContent?.startsWith(label)) as HTMLElement;
      expect(cell(r, "Status").textContent, label).toContain("Not available yet");
      expect(within(cell(r, "Why")).queryByRole("link", { name: "My access" }), label).toBeNull();
    }
    const exportRow = rowsOf(table).find((x) => cell(x, "Action").textContent?.startsWith("Export tables")) as HTMLElement;
    fireEvent.click(within(cell(exportRow, "Why")).getByRole("button"));
    expect(whyText(cell(exportRow, "Why"))).toContain("FE-016");
  });

  it("asks once, about ROOT and the eight root capital actions, and prints Allowed with the step-up fact", async () => {
    const api = batchApi(allowed);
    mount({ fetchImpl: fetchWithRootAllow(), api: api as never }, workspace("available"));
    await granted();
    await waitFor(async () => expect(cell(await capitalRowIn(), "Status").textContent).toContain("Allowed"));
    expect(api.getSelfEligibilityBatch).toHaveBeenCalledTimes(1);
    const request = api.getSelfEligibilityBatch.mock.calls[0]![0];
    expect(request.workspaceId).toBe(ACCESS_DOUBLE_WORKSPACES.available);
    expect(request.resources).toEqual([{ kind: "ROOT", id: "root_TEST_ONLY" }]);
    expect(request.actions).toHaveLength(8);
    const row = await capitalRowIn();
    expect(cell(row, "Status").textContent).toContain("Step-up required");
    expect(cell(row, "Why").textContent).toContain("8 of 8 capital commands");
    expect(cell(row, "Why").textContent).toContain("checked again when it is sent");
  });

  it("only unavailable rows read Not allowed with the server's reason in words", async () => {
    mount({ fetchImpl: fetchWithRootAllow(), api: batchApi(refused) as never }, workspace("available"));
    await granted();
    await waitFor(async () => expect(cell(await capitalRowIn(), "Status").textContent).toContain("Not allowed"));
    expect(cell(await capitalRowIn(), "Why").textContent).toContain("No current root-level grant for capital commands");
  });

  it("a failed read is Not available yet with the port's reason, never Not allowed", async () => {
    const api = { getSelfEligibilityBatch: vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "The eligibility batch is not served." })) };
    mount({ fetchImpl: fetchWithRootAllow(), api: api as never }, workspace("available"));
    await granted();
    await waitFor(async () => expect(cell(await capitalRowIn(), "Why").textContent).toContain("The eligibility batch is not served."));
    expect(cell(await capitalRowIn(), "Status").textContent).toContain("Not available yet");
  });

  it("no ALLOW grant on a root: nothing is asked, and the row says why", async () => {
    const api = batchApi(allowed);
    mount({ api: api as never }, workspace("available"));
    await granted();
    expect(cell(await capitalRowIn(), "Why").textContent).toContain("None of your grants names a root");
    expect(api.getSelfEligibilityBatch).not.toHaveBeenCalled();
  });
});
