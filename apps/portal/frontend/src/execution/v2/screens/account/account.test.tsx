/**
 * Accounts and Account 360 against the e2e double, through the REAL product
 * HTTP client (`createHttpApi` over a stubbed `fetch`): routes, readers, the
 * list, the peek, the sleeve and physical views, and every state the screens
 * must keep apart. Role variants run through `holds()`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW, SLOW_TEST } from "../../waitsTestUtil";

import { answerAccount } from "../../../../../e2e/bffDoubleAccount";
import { createHttpApi } from "../../../api/httpApi";
import type { ExecutionApi } from "../../../api/ports";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { loadCanonical } from "../../testkit/loadCanonical";
import AccountScreen, { ACCOUNT_SCREEN_KEY } from "./index";
import { whyText } from "../../gapWhyTestUtil";

/* ── the session, standing in for useSession ─────────────────────────────── */

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

function signIn(capabilities: Iterable<string>) {
  session.current = {
    principal: { principalId: "p1", username: "bobby", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready", access: { userId: "u1", isOwner: false, ownerState: "NOT_OWNER", capabilities: [...capabilities] } },
  };
}

/* ── the product client over the double ──────────────────────────────────── */

const POLICY = {
  policyRevision: 6, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: false, governanceWriteEnabled: true,
  paperCommandsEnabled: false, sandboxCommandsEnabled: false, liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false,
};

interface Stub {
  calls: string[];
  paths(prefix: string): string[];
}

function stubFetch(options: { rewrite?(url: URL): void; answer?(url: URL): { status: number; body: unknown } | null } = {}): Stub {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    options.rewrite?.(url);
    calls.push(`${url.pathname}${url.search}`);
    const custom = options.answer?.(url) ?? null;
    const answer = custom ?? answerAccount("GET", url.pathname, url.searchParams);
    if (answer === null) return new Response(JSON.stringify({ error: { code: "bff_double_gap", message: url.pathname } }), { status: 501, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }));
  return { calls, paths: (prefix) => calls.filter((call) => call.startsWith(prefix)) };
}

const makeApi = (): ExecutionApi => createHttpApi({ policy: POLICY });

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(entry: string, props: { accountId?: string; binding?: string | null; capabilities?: ReadonlySet<string> } = {}) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AccountScreen api={makeApi()} {...props} />
      <Where />
    </MemoryRouter>,
  );
}

/** `GET /self-context` as the Portal publishes it (BE-P7): the canonical fixture, with the clock moved to now. */
const CONTEXT_PATH = "/api/admin/profile-access/v2/self-context";
const contextFile = loadCanonical<{ self_context_cases: { case_name: string; value: Record<string, unknown> }[] }>("execution-access.synthetic");
function contextAnswer(patch: Record<string, unknown> = {}): (url: URL) => { status: number; body: unknown } | null {
  return (url) => {
    if (url.pathname !== CONTEXT_PATH) return null;
    const body = contextFile.self_context_cases.find((entry) => entry.case_name === "RESOLVED_SOLE_MEMBERSHIP")!.value;
    return { status: 200, body: { ...body, observed_at_ms: Date.now(), valid_until_ms: Date.now() + 60_000, ...patch } };
  };
}

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const MANAGER = V2_ROLE_PRESETS.manager;

beforeEach(() => signIn(MANAGER));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bindingsTable = () => screen.getByRole("table", { name: "Bindings" });
const bodyRows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const loadedList = async () => screen.findByRole("table", { name: "Bindings" }, SLOW);

/* ═══ Accounts list ═══════════════════════════════════════════════════════ */

describe("Accounts list", () => {
  it("is the account flag's screen", () => {
    expect(ACCOUNT_SCREEN_KEY).toBe("account");
  });

  it("lists the three live bindings with ok, stale and bad credential kept apart", async () => {
    stubFetch();
    mount("/deployments/accounts");
    const table = await loadedList();
    const rows = bodyRows(table);
    expect(rows).toHaveLength(3);
    expect(cell(rows[0]!, "Binding · Venue")).toContain("bnc_main@BINANCE");
    expect(cell(rows[0]!, "Credential")).toContain("Synced");
    expect(cell(rows[1]!, "Credential")).toContain("Sync delayed");
    expect(cell(rows[2]!, "Credential")).toContain("Expired");
    const flags = rows.map((r) => r.querySelector("td[data-l='Credential'] .exec-flag")?.getAttribute("data-k"));
    expect(new Set(flags).size).toBe(3);
    expect(flags).toEqual(["ok", "stale", "attention"]);
  });

  it("does not draw three columns of 'Not available' for equity, headroom and check; never a dash or a zero", async () => {
    stubFetch();
    const { container } = mount("/deployments/accounts");
    const rows = bodyRows(await loadedList());
    for (const row of rows) {
      for (const label of ["Physical equity", "Σ Virtual · Headroom", "Check"]) expect(row.querySelector(`td[data-l="${label}"]`), label).toBeNull();
    }
    expect(container.textContent).not.toMatch(/—|N\/A/);
    for (const td of Array.from(container.querySelectorAll("td"))) expect(td.textContent?.trim()).not.toMatch(/^(-|–|0)$/);
  });

  it("shows the server's counts and the environment it answered", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    expect(screen.getByText("3 of 3 bindings")).toBeTruthy();
    // The environment is the selected tab, not repeated in the as-of line.
    expect(screen.queryByText(/Live environment/)).toBeNull();
    expect(screen.getByText(/As of 17 Oct 09:00Z/)).toBeTruthy();
  });

  it("reads one environment per tab and writes it to the URL; All environments is not offered", async () => {
    const stub = stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    expect(stub.paths("/api/v1/execution/broker-bindings")[0]).toContain("environment=live");
    // The three environments are the whole strip: no disabled "All environments" tab (a dead control).
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["Real-funded", "Paper", "Sandbox"]);
    expect(screen.queryByRole("tab", { name: "All environments" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Paper/ }));
    await waitFor(() => expect(search().get("env")).toBe("paper"), SLOW);
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(1), SLOW);
    expect(cell(bodyRows(bindingsTable())[0]!, "Binding · Venue")).toContain("pap_sim@BINANCE");
    expect(stub.paths("/api/v1/execution/broker-bindings").some((c) => c.includes("environment=paper"))).toBe(true);
    expect(screen.getByRole("tab", { name: /^Paper/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a suspended binding with no credential word distinct from the ok ones", async () => {
    stubFetch();
    mount("/deployments/accounts?env=sandbox");
    const rows = bodyRows(await loadedList());
    expect(cell(rows[0]!, "State")).toContain("Suspended");
    expect(cell(rows[0]!, "Credential")).toContain("Not published");
    expect(rows[0]!.querySelector("td[data-l='Credential'] .exec-flag")?.getAttribute("data-k")).toBe("unknown");
  });

  it("pages by keyset: Load more appends, never repeats, and stops when the source does", async () => {
    stubFetch({ rewrite: (url) => { if (url.pathname.endsWith("/broker-bindings")) url.searchParams.set("limit", "2"); } });
    mount("/deployments/accounts");
    const table = await loadedList();
    expect(bodyRows(table)).toHaveLength(2);
    const more = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(more);
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(3), SLOW);
    expect(bodyRows(bindingsTable()).map((r) => r.querySelector("td[data-l='Binding · Venue'] .exec-acct-name")?.textContent)).toEqual(["bnc_main@BINANCE", "bnc_sub@BINANCE", "okx_main@OKX"]);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("a failed next page keeps the rows and says so", async () => {
    let n = 0;
    stubFetch({
      rewrite: (url) => { if (url.pathname.endsWith("/broker-bindings")) url.searchParams.set("limit", "2"); },
      answer: (url) => {
        if (url.pathname.endsWith("/broker-bindings") && url.searchParams.has("after")) {
          n += 1;
          return { status: 503, body: { error: { code: "BINDINGS_UNAVAILABLE", message: "later" } } };
        }
        return null;
      },
    });
    mount("/deployments/accounts");
    await loadedList();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("alert");
    expect(n).toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("BINDINGS_UNAVAILABLE");
    expect(bodyRows(bindingsTable())).toHaveLength(2);
  });

  it("Issues only narrows the loaded rows and the count line says so", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    fireEvent.click(screen.getByRole("button", { name: /^Issues only/ }));
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(2), SLOW);
    expect(search().get("issues")).toBe("1");
    expect(screen.getByText(/2 with issues in the 3 loaded rows, 3 on the server/)).toBeTruthy();
    const credentials = bodyRows(bindingsTable()).map((r) => cell(r, "Credential"));
    expect(credentials).toHaveLength(2);
    expect(credentials[0]).toContain("Sync delayed");
    expect(credentials[1]).toContain("Expired");
  });

  it("the credential filter splits Synced from Needs attention", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "attention" } });
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(2), SLOW);
    fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "ok" } });
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(1), SLOW);
    expect(search().get("credential")).toBe("ok");
  });

  // Whole-suite flake 2026-10-21 (DEBT-UXM07-032): a multi-step flow of SLOW waits; explicit per-test budget.
  it("search and venue go to the server; a miss is empty, with a way back", async () => {
    const stub = stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "OKX" } });
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(1), SLOW);
    expect(stub.paths("/api/v1/execution/broker-bindings").some((c) => c.includes("venue=OKX"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Search binding or account"), { target: { value: "zzz" } });
    await waitFor(() => expect(search().get("q")).toBe("zzz"), SLOW);
    await screen.findByText("No bindings match these filters.", {}, SLOW);
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Clear all" })[0]!);
    await waitFor(() => expect(search().get("q")).toBeNull(), SLOW);
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(3), SLOW);
    expect(search().get("venue")).toBeNull();
  }, SLOW_TEST);

  it("an empty source is an empty set, said as a fact", async () => {
    stubFetch({
      answer: (url) => {
        if (!url.pathname.endsWith("/broker-bindings")) return null;
        const live = answerAccount("GET", url.pathname, new URLSearchParams({ environment: "live", search: "zzz" }))!;
        return { status: 200, body: live.body };
      },
    });
    mount("/deployments/accounts");
    await screen.findByText(/No bindings yet/);
  });

  it("an unavailable source is Unavailable with its code, not an empty table", async () => {
    stubFetch({ answer: (url) => (url.pathname.endsWith("/broker-bindings") ? { status: 503, body: { error: { code: "BINDINGS_UNAVAILABLE", message: "down" } } } : null) });
    mount("/deployments/accounts");
    await screen.findByText(/BINDINGS_UNAVAILABLE/);
    expect(screen.queryByRole("table", { name: "Bindings" })).toBeNull();
  });

  it("a body the reader refuses is unavailable, never an empty list", async () => {
    stubFetch({ answer: (url) => (url.pathname.endsWith("/broker-bindings") ? { status: 200, body: { schema_version: "something.else" } } : null) });
    mount("/deployments/accounts");
    await screen.findByText(/could not be read/i);
    expect(screen.queryByRole("table", { name: "Bindings" })).toBeNull();
  });

  it("links an account to its Account 360 and keeps the row click for the peek", async () => {
    stubFetch();
    mount("/deployments/accounts");
    const row = bodyRows(await loadedList())[0]!;
    const link = within(row).getByRole("link", { name: "acc_bnc_core" });
    expect(link.getAttribute("href")).toBe("/deployments/accounts/acc_bnc_core?from=accounts");
    fireEvent.click(link);
    expect(search().get("sel")).toBeNull();
  });

  it("cards at 660px and below: every cell carries its column label", async () => {
    stubFetch();
    const { container } = mount("/deployments/accounts");
    await loadedList();
    const labels = Array.from(container.querySelectorAll("tbody tr:first-child td")).map((td) => td.getAttribute("data-l"));
    expect(labels).toEqual(["Binding · Venue", "Account", "State", "Credential", "Updated"]);
    expect(container.querySelector("table.exec-cards")).not.toBeNull();
  });

  it("caps DOM rows at 200 and says how many the server holds", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      binding_id: `b${String(i).padStart(3, "0")}@BINANCE`, account_id: `a${i}`, venue: "BINANCE", state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: "2026-10-17T09:00:00.000Z",
    }));
    stubFetch({
      answer: (url) => {
        if (!url.pathname.endsWith("/broker-bindings")) return null;
        const base = answerAccount("GET", url.pathname, new URLSearchParams({ environment: "live" }))!.body as { page: Record<string, unknown> };
        return { status: 200, body: { ...base, page: { ...base.page, rows: many, total_count: 5000, filtered_count: 5000, has_more: true, next_cursor: "more" } } };
      },
    });
    mount("/deployments/accounts");
    const table = await loadedList();
    expect(bodyRows(table)).toHaveLength(200);
    expect(screen.getByText(/Top 200 of 5000 bindings/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText(/Showing the first 200 rows/)).toBeTruthy();
  });
});

/* ═══ the binding peek ════════════════════════════════════════════════════ */

describe("binding peek (Binding Detail, merged)", () => {
  it("opens from a row, reads the binding, and keeps the broker reference out", async () => {
    stubFetch();
    const { container } = mount("/deployments/accounts");
    const row = bodyRows(await loadedList())[0]!;
    fireEvent.click(row);
    expect(search().get("sel")).toBe("bnc_main@BINANCE");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByText("Capital invariant: Σ virtual ≤ physical");
    expect(within(drawer).getByText(/Withheld\. The portal never shows the broker account reference\./)).toBeTruthy();
    expect(within(drawer).getByText("LIVE_BINANCE_USDM")).toBeTruthy();
    const invariant = await within(drawer).findByRole("table", { name: "Capital invariant by currency" });
    expect(within(invariant).getAllByRole("row")).toHaveLength(3);
    expect(within(invariant).getAllByText("Within physical")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/external_|external_account_ref/);
    expect(document.body.textContent).not.toMatch(/external_1|external_okx/);
  });

  it("says a partial population is partial: 2 of 3 sleeves", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=bnc_main%40BINANCE");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByText(/Covering 2 of 3 sleeves/);
    expect(within(drawer).getByText(/part of the binding, not its total/)).toBeTruthy();
    expect(within(drawer).getByText(/published no aggregate verdict/)).toBeTruthy();
  });

  it("marks a negative published headroom Exceeded and the bad credential Expired", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=okx_main%40OKX");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByText("Exceeded");
    expect(within(drawer).getAllByText("Expired").length).toBeGreaterThan(0);
  });

  it("opens a binding that is not on the loaded page by reading it", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=pap_sim%40BINANCE");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByText(/BINANCE · acc_pap_sim/);
    expect(within(drawer).getAllByText("Synced").length).toBeGreaterThan(0);
  });

  it("the V1 ?binding= deep link opens the peek once, and closing it keeps it closed", async () => {
    stubFetch();
    mount("/deployments/accounts?binding=bnc_sub%40BINANCE", { binding: "bnc_sub@BINANCE" });
    await screen.findByRole("complementary");
    expect(search().get("sel")).toBe("bnc_sub@BINANCE");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
    expect(search().get("sel")).toBeNull();
  });

  it("an unknown binding is a reason, not a blank drawer", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=nope%40X");
    const drawer = await screen.findByRole("complementary");
    expect((await within(drawer).findAllByText(/BINDING_NOT_FOUND/)).length).toBeGreaterThan(0);
  });

  it("offers Open account and the physical-binding view; Rotate credential is off with its reason", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=bnc_main%40BINANCE");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByRole("link", { name: "Open account" });
    expect(within(drawer).getByRole("link", { name: "Open account" }).getAttribute("href")).toBe("/deployments/accounts/acc_bnc_core?from=accounts");
    expect(within(drawer).getByRole("link", { name: "Physical binding" }).getAttribute("href")).toBe("/deployments/accounts/acc_bnc_core?view=physical&from=accounts");
    const rotate = within(drawer).getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement;
    expect(rotate.disabled).toBe(true);
    expect(drawer.textContent).toContain("Not allowed. Your access does not include managing accounts.");
    expect(rotate.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("the old management token no longer exists: holding it changes nothing (the control is off for everyone, with the same reason)", async () => {
    stubFetch();
    mount("/deployments/accounts?sel=bnc_main%40BINANCE", { capabilities: new Set([...MANAGER, "execution.accounts.manage"]) });
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByRole("link", { name: "Open account" });
    expect((within(drawer).getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement).disabled).toBe(true);
    expect(drawer.textContent).toContain("Not allowed. Your access does not include managing accounts.");
    expect(drawer.textContent).not.toContain("Not published (FE-015)");
  });

  it("when the Portal published the typed absence, the reason is 'Not offered in the portal yet', for a holder of every read too", async () => {
    stubFetch({ answer: contextAnswer() });
    mount("/deployments/accounts?sel=bnc_main%40BINANCE", { capabilities: new Set([...MANAGER, "execution.accounts.manage", "governance.r2.decide"]) });
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByRole("link", { name: "Open account" });
    await waitFor(() => expect(drawer.textContent).toContain("Not offered in the portal yet"), SLOW);
    const rotate = within(drawer).getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement;
    expect(rotate.disabled).toBe(true);
    expect(document.getElementById(rotate.getAttribute("aria-describedby")!)?.textContent).toContain("Not offered in the portal yet");
    expect(drawer.textContent).not.toContain("Your access does not include managing accounts");
    // A refusal that holds for everyone is not "go and ask for access": no My access link goes with it.
    expect(within(drawer).queryByRole("link", { name: "My access" })).toBeNull();
  });

  it("a context read that failed, or whose ceiling has passed, leaves the control's earlier reason (and still off)", async () => {
    stubFetch({ answer: (url) => (url.pathname === CONTEXT_PATH ? { status: 503, body: { error: { code: "ACCESS_UNAVAILABLE", message: "x" } } } : null) });
    mount("/deployments/accounts?sel=bnc_main%40BINANCE");
    const drawer = await screen.findByRole("complementary");
    await within(drawer).findByRole("link", { name: "Open account" });
    expect(drawer.textContent).toContain("Not allowed. Your access does not include managing accounts.");
    cleanup();
    stubFetch({ answer: contextAnswer({ observed_at_ms: 1, valid_until_ms: 2 }) });
    mount("/deployments/accounts?sel=bnc_main%40BINANCE");
    const later = await screen.findByRole("complementary");
    await within(later).findByRole("link", { name: "Open account" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(later.textContent).toContain("Not allowed. Your access does not include managing accounts.");
    expect((within(later).getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the context is asked once per drawer, with no query and no polling", async () => {
    const stub = stubFetch({ answer: contextAnswer() });
    mount("/deployments/accounts?sel=bnc_main%40BINANCE");
    const drawer = await screen.findByRole("complementary");
    await waitFor(() => expect(drawer.textContent).toContain("Not offered in the portal yet"), SLOW);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stub.paths(CONTEXT_PATH)).toEqual([CONTEXT_PATH]);
  });

  it("keyboard: Enter on a row opens the peek, Escape closes it", async () => {
    stubFetch();
    mount("/deployments/accounts");
    const row = bodyRows(await loadedList())[1]!;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    await screen.findByRole("complementary");
    expect(search().get("sel")).toBe("bnc_sub@BINANCE");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull(), SLOW);
  });
});

/* ═══ roles ═══════════════════════════════════════════════════════════════ */

describe("roles through holds()", () => {
  it.each([
    ["manager", true],
    ["operator", true],
    ["researcher", false],
    ["reviewer", false],
  ] as const)("%s may open Accounts: %s", async (preset, allowed) => {
    stubFetch();
    signIn(V2_ROLE_PRESETS[preset]);
    mount("/deployments/accounts");
    if (allowed) {
      await loadedList();
      expect(screen.queryByText("You can't open this page")).toBeNull();
    } else {
      await screen.findByText("You can't open this page");
      expect(screen.getByText("Your access does not include Accounts.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toContain("/administration/profile-access");
      expect(screen.queryByRole("table", { name: "Bindings" })).toBeNull();
    }
  });

  it("a denied session makes no read at all", async () => {
    const stub = stubFetch();
    signIn(V2_ROLE_PRESETS.researcher);
    mount("/deployments/accounts/acc_bnc_core", { accountId: "acc_bnc_core" });
    await screen.findByText("You can't open this page");
    expect(stub.calls).toEqual([]);
  });

  it("access still loading is a skeleton; access unreadable is not a denial", async () => {
    stubFetch();
    session.current = { principal: null, access: { kind: "loading" } };
    mount("/deployments/accounts");
    expect(screen.getByRole("status", { name: "Reading your access" })).toBeTruthy();
    cleanup();
    session.current = { principal: null, access: { kind: "unavailable", requestId: null } };
    mount("/deployments/accounts");
    expect(screen.getByText(/This is not a denial/)).toBeTruthy();
    expect(screen.queryByText("You can't open this page")).toBeNull();
  });

  it("a caller may hand the capabilities in (tests, embedding pages)", async () => {
    stubFetch();
    session.current = { principal: null, access: { kind: "unavailable", requestId: null } };
    mount("/deployments/accounts", { capabilities: MANAGER });
    await loadedList();
  });
});

/* ═══ Account 360 ═════════════════════════════════════════════════════════ */

const account = (id: string, query = "") => mount(`/deployments/accounts/${id}${query}`, { accountId: id });
const loaded360 = async (title: string | RegExp = "Binance-02 sleeve") => screen.findByRole("heading", { level: 1, name: title }, SLOW);

describe("Account 360: the shared sleeve", () => {
  it("names the sleeve, the portfolio and the domain", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    expect(screen.getByText("pf_core · USDT · Real-funded")).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Accounts" }).getAttribute("href")).toBe("/deployments/accounts");
  });

  it("says it is shared, stale and 14 minutes old, from two published instants", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    expect(screen.getByText("Shared by 3 sleeves").getAttribute("title")).toBe("Native figures cover the whole account, not one sleeve.");
    expect(screen.getByText("Stale 14 min")).toBeTruthy();
    expect(screen.getByText("As of 17 Oct 09:00Z")).toBeTruthy();
    expect(screen.getByText("Broker sync: Synced")).toBeTruthy();
  });

  it("keeps the three authorities apart, with budget Not published (FE-017) and native equity Not available", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const strip = screen.getByRole("group", { name: "Authorities" });
    const terms = within(strip).getAllByRole("term").map((t) => t.textContent);
    expect(terms).toEqual(["Internal ledger · this sleeve", "Native custody · whole account", "Budget · this sleeve"]);
    expect(strip.textContent).toContain("88,200.00");
    expect(strip.textContent).toContain("301,100.00");
    expect(strip.textContent).toContain("Not published (FE-017)");
    expect(strip.textContent).toContain("Native equity: Not available");
    // "Shared by 3 sleeves" is the banner's, once; the strip does not repeat it.
    expect(strip.textContent).not.toContain("Shared by 3 sleeves");
  });

  it("the sleeves table never attributes native balance to a sleeve: no attribution column, and not totalled", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const table = screen.getByRole("table", { name: "Sleeves on this binding" });
    const rows = bodyRows(table);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => cell(r, "Internal balance"))).toEqual(["88,200.00 USDT", "61,400.00 USDT", "47,900.00 USDT"]);
    for (const row of rows) expect(row.querySelector('td[data-l="Native attribution"]'), "no sleeve gets a native figure").toBeNull();
    expect(within(table.closest("section")!).getByText(/Not totalled: native balance is not split among sleeves/)).toBeTruthy();
    expect(within(rows[1]!).getByRole("link", { name: "Binance-02b sleeve" }).getAttribute("href")).toBe("/deployments/accounts/acc_bnc_sat");
    expect(within(rows[0]!).queryByRole("link")).toBeNull();
  });

  it("margin is exact; margin ratio is Not published (A360-2); coverage is the source's verdict", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const margin = screen.getByRole("region", { name: "Margin" });
    expect(margin.textContent).toContain("4,100.00");
    expect(margin.textContent).toContain("2,050.00");
    expect(margin.textContent).toContain("Not published (A360-2)");
    expect(margin.textContent).toContain("Covered");
    expect(margin.textContent).toContain("Cross margin");
  });

  it("draws the equity series with its gap and never draws a second currency into it", async () => {
    const stub = stubFetch();
    account("acc_bnc_core");
    await loaded360();
    await screen.findByRole("img", { name: /Account equity/ });
    expect(screen.getByRole("button", { name: "Expand Account equity" })).toBeTruthy();
    expect(stub.paths("/api/v1/execution/views/equity-chart")[0]).toContain("subject_id=acc_bnc_core");
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "USDC" } });
    await waitFor(() => expect(search().get("ccy")).toBe("USDC"), SLOW);
    await screen.findByText(/No series is published for this currency/);
  });

  it("a second currency changes the ledger KPI and the sleeves, and nothing is added across them", async () => {
    stubFetch();
    account("acc_bnc_core", "?ccy=USDC");
    await loaded360();
    const strip = screen.getByRole("group", { name: "Authorities" });
    expect(strip.textContent).toContain("5,000.00");
    expect(strip.textContent).not.toContain("88,200.00");
    const rows = bodyRows(screen.getByRole("table", { name: "Sleeves on this binding" }));
    expect(cell(rows[1]!, "Internal balance")).toContain("Not available");
  });

  it("a sleeve view and a physical view are one route: view=physical swaps the sleeve for the binding", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    expect(screen.getByRole("heading", { level: 3, name: "Logical sleeve" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Physical binding" }));
    await waitFor(() => expect(search().get("view")).toBe("physical"), SLOW);
    await screen.findByRole("heading", { level: 1, name: "Binance account" });
    expect(screen.getByText("3 sleeves · 1 physical binding")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Logical sleeve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sleeve" }));
    await waitFor(() => expect(search().get("view")).toBeNull(), SLOW);
  });
});

describe("Account 360: the physical binding view", () => {
  it("shows the binding's facts, its credential state word and the capital invariant; the broker reference is withheld", async () => {
    stubFetch();
    const { container } = account("acc_bnc_core", "?view=physical");
    await screen.findByRole("heading", { level: 1, name: "Binance account" });
    const panel = await screen.findByRole("region", { name: "Physical binding" });
    await within(panel).findByText("LIVE_BINANCE_USDM");
    expect(panel.textContent).toContain("bnc_main@BINANCE");
    expect(panel.textContent).toContain("Withheld");
    expect(whyText(within(panel).getByText("Withheld"))).toBe("Withheld. The portal never shows the broker account reference.");
    expect(panel.textContent).toContain("Not published (A360-4)");
    expect(panel.textContent).toContain("Not published (A360-3)");
    expect(panel.textContent).toContain("Real-funded");
    expect(within(panel).getAllByText("Synced").length).toBeGreaterThan(0);
    const invariant = await screen.findByRole("region", { name: "Capital invariant: Σ virtual ≤ physical" });
    await within(invariant).findByRole("table", { name: "Capital invariant by currency" });
    expect(invariant.textContent).toContain("Covering 2 of 3 sleeves");
    expect(document.body.textContent).not.toMatch(/external_/);
    expect(container.textContent).not.toMatch(/—|N\/A/);
  });

  it("only the native custody authority is shown, and every binding action is off with its reason", async () => {
    stubFetch();
    account("acc_bnc_core", "?view=physical");
    await screen.findByRole("heading", { level: 1, name: "Binance account" });
    const strip = screen.getByRole("group", { name: "Authorities" });
    expect(within(strip).getAllByRole("term").map((t) => t.textContent)).toEqual(["Native custody · whole account"]);
    for (const [name, reason] of [
      ["Rotate credential", "Not allowed. Your access does not include managing accounts."],
      ["Sync now", "Not published (FE-020)"],
      ["Dry-run reconcile", "Not published (FE-020)"],
    ] as const) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toContain(reason);
    }
  });

  it("with the Portal's typed absence published, Rotate credential reads 'Not offered in the portal yet' (still off, the others unchanged)", async () => {
    stubFetch({ answer: contextAnswer() });
    account("acc_bnc_core", "?view=physical");
    await screen.findByRole("heading", { level: 1, name: "Binance account" });
    await waitFor(() => {
      const rotate = screen.getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement;
      expect(document.getElementById(rotate.getAttribute("aria-describedby")!)?.textContent).toContain("Not offered in the portal yet");
    });
    expect((screen.getByRole("button", { name: "Rotate credential" }) as HTMLButtonElement).disabled).toBe(true);
    const sync = screen.getByRole("button", { name: "Sync now" }) as HTMLButtonElement;
    expect(document.getElementById(sync.getAttribute("aria-describedby")!)?.textContent).toContain("Not published (FE-020)");
  });

  it("a bad credential is its own alarm, an expired word on the physical panel and a banner above everything", async () => {
    stubFetch();
    account("acc_okx_main");
    await loaded360("OKX main");
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("needs attention (EXPIRED)");
    expect(banner.querySelector(".exec-flag")?.getAttribute("data-k")).toBe("attention");
  });

  it("a stale credential is a different banner from a bad one", async () => {
    stubFetch();
    account("acc_bnc_sub");
    await loaded360("Binance sub account");
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("Broker sync for this binding is delayed (SYNC_STALE)");
    expect(banner.querySelector(".exec-flag")?.getAttribute("data-k")).toBe("stale");
  });

  it("an ok credential raises no alarm", async () => {
    stubFetch();
    account("acc_pap_sim");
    await loaded360("Paper simulator");
    await waitFor(() => expect(screen.getByText("Paper")).toBeTruthy(), SLOW);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Account 360: states", () => {
  it("loading, then the body", async () => {
    stubFetch();
    account("acc_bnc_core");
    expect(screen.getByRole("heading", { level: 1, name: "acc_bnc_core" })).toBeTruthy();
    await loaded360();
  });

  it("an unavailable resource is Unavailable with the code and a way to try again; never a blank page", async () => {
    stubFetch();
    account("acc_err");
    await screen.findByText(/ACCOUNT_RESOURCE_UNAVAILABLE/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("an unknown account is a reason, not a blank page", async () => {
    stubFetch();
    account("acc_nowhere");
    await screen.findByText(/ACCOUNT_NOT_FOUND/);
  });

  it("an empty resource is Nothing to show, said once", async () => {
    stubFetch();
    account("acc_tn_bnc");
    await screen.findByText("The account resource published no rows for this account.");
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("a partial resource keeps its body under a Partial line, and names the gap", async () => {
    stubFetch();
    account("acc_okx_main");
    await loaded360("OKX main");
    expect((await screen.findAllByText(/BROKER_SYNC_UNAVAILABLE/)).length).toBeGreaterThan(0);
    expect(whyText(screen.getByText("Not available: Broker sync").parentElement)).toContain("Broker sync: BROKER_SYNC_UNAVAILABLE");
    expect(screen.getByRole("tablist", { name: "Account sections" })).toBeTruthy();
    expect(screen.getByText("Broker sync not available")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Authorities" }).textContent).toContain("Not available");
  });

  it("a stale resource keeps its body under a Stale line", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    expect(document.querySelector(".exec-blk-boundary[data-status='stale']")).not.toBeNull();
    expect(document.querySelector(".exec-blk-demoted")).not.toBeNull();
  });

  it("a failed refresh keeps the last good read and says why", async () => {
    let fail = false;
    stubFetch({ answer: (url) => (fail && url.pathname.endsWith("/resources/accounts/acc_bnc_sub") ? { status: 503, body: { error: { code: "ACCOUNT_RESOURCE_UNAVAILABLE", message: "x" } } } : null) });
    account("acc_bnc_sub");
    await loaded360("Binance sub account");
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(whyText((await screen.findByText("Showing the last good read")).parentElement)).toMatch(/The last refresh failed \(ACCOUNT_RESOURCE_UNAVAILABLE/);
    expect(screen.getByRole("heading", { level: 1, name: "Binance sub account" })).toBeTruthy();
  });

  it("a margin source gap is said, with the source's code, and the margin cells are Not available", async () => {
    stubFetch();
    account("acc_bnc_sub");
    await loaded360("Binance sub account");
    expect(whyText(screen.getByText("Not available: Margin").parentElement)).toContain("Margin: MARGIN_SOURCE_GAP");
    const margin = screen.getByRole("region", { name: "Margin" });
    expect(margin.textContent).toContain("Initial marginNot available");
    expect(margin.textContent).toContain("MaintenanceNot available");
  });
});

describe("Account 360: tabs", () => {
  const openTab = async (name: string) => {
    fireEvent.click(screen.getByRole("tab", { name }));
    return screen.findByRole("tabpanel");
  };

  it("a tablist with the six sections; Overview is the default and stays out of the URL", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const tabs = within(screen.getByRole("tablist", { name: "Account sections" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Positions", "Allocations", "Fees & funding", "Reconciliation", "Activity"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(search().get("tab")).toBeNull();
    await openTab("Reconciliation");
    expect(search().get("tab")).toBe("rec");
  });

  it("arrow keys move between tabs", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const first = screen.getByRole("tab", { name: "Overview" });
    first.focus();
    fireEvent.keyDown(screen.getByRole("tablist", { name: "Account sections" }), { key: "ArrowRight" });
    await waitFor(() => expect(search().get("tab")).toBe("pos"), SLOW);
    expect(screen.getByRole("tab", { name: "Positions" }).getAttribute("aria-selected")).toBe("true");
  });

  it("an unknown tab is explained and falls back to Overview; the sentence survives the URL being made canonical (M1)", async () => {
    stubFetch();
    account("acc_bnc_core", "?tab=risk");
    await loaded360();
    await screen.findByText('Tab "risk" is not available. Showing Overview.');
    await waitFor(() => expect(search().get("tab")).toBeNull(), SLOW);
    // after the rewrite, and after further renders, the notice is still there
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByText('Tab "risk" is not available. Showing Overview.')).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Physical binding" }));
    await waitFor(() => expect(search().get("view")).toBe("physical"), SLOW);
    expect(screen.getByText('Tab "risk" is not available. Showing Overview.')).toBeTruthy();
  });

  it("picking a tab clears the unknown-tab sentence", async () => {
    stubFetch();
    account("acc_bnc_core", "?tab=risk");
    await loaded360();
    await screen.findByText('Tab "risk" is not available. Showing Overview.');
    await waitFor(() => expect(search().has("tab")).toBe(false), SLOW);
    fireEvent.click(screen.getByRole("tab", { name: "Positions" }));
    await waitFor(() => expect(search().get("tab")).toBe("pos"), SLOW);
    expect(screen.queryByText('Tab "risk" is not available. Showing Overview.')).toBeNull();
  });

  it("Positions: as published, with long, short and gross totals named once as not available (A360-1)", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Positions");
    const table = within(panel).getByRole("table", { name: "Positions of this sleeve" });
    const rows = bodyRows(table);
    expect(rows.map((r) => [cell(r, "Symbol"), cell(r, "Side"), cell(r, "Notional")])).toEqual([
      ["BTCUSDT", "LONG", "61,300.00 USDT"],
      ["ETHUSDT", "SHORT", "35,100.00 USDT"],
    ]);
    expect(cell(rows[1]!, "Unrealized PnL")).toContain("120.50");
    const gap = within(panel).getByTestId("not-available-line");
    expect(gap.textContent).toContain("Not available: Long, short and gross notional");
    expect(whyText(gap)).toContain("A360-1");
    fireEvent.click(within(panel).getByRole("button", { name: "Whole account" }));
    const sleeves = panel.querySelector(".exec-acct-pad .exec-acct-na")!;
    expect(sleeves.textContent).toBe("Not available");
    expect(whyText(sleeves)).toBe("No source attributes native positions to sleeves");
    expect(within(panel).queryByRole("table")).toBeNull();
  });

  it("Allocations: logical, with links, and no claim on native balance", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Allocations");
    const row = bodyRows(within(panel).getByRole("table", { name: "Allocations on this account" }))[0]!;
    expect(cell(row, "Allocation")).toContain("80,000.00");
    expect(within(row).getByRole("link", { name: "btc_trend" }).getAttribute("href")).toBe("/deployments/alphas/btc_trend");
    expect(within(row).getByRole("link", { name: "dep_btc_live" }).getAttribute("href")).toBe("/deployments/live/dep_btc_live");
    expect(cell(row, "Stage")).toBe("Real-funded");
    expect(within(panel).getByText("No claim on the native balance").getAttribute("title")).toBe("Logical allocations are no claim on the native balance.");
  });

  it("Fees & funding: windowed figures are one 'Not available' line (FE-025); current ones are labelled current", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Fees & funding");
    const gap = within(panel).getByTestId("not-available-line");
    expect(gap.textContent).toContain("Not available: Fees, funding and borrow over a window");
    expect(whyText(gap)).toContain("Not published (FE-025)");
    expect(panel.textContent).toContain("Fees, current");
    expect(panel.textContent).toContain("388.20");
    expect(panel.textContent).toContain("224.20");
    expect(within(panel).getByRole("heading", { name: "Current" }).getAttribute("title")).toContain("Not a window");
  });

  it("Reconciliation: the Triad on a shared binding says Not computed · SHARED_BINDING and never a zero difference", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Reconciliation");
    const triad = within(panel).getByRole("group", { name: "Reconciliation" });
    expect(within(triad).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Internal", "Broker", "Difference"]);
    expect(triad.textContent).toContain("Not computed");
    expect(triad.textContent).not.toContain("SHARED_BINDING");
    expect(whyText(within(triad).getAllByText("Not computed")[0]!)).toBe("SHARED_BINDING");
    const difference = triad.querySelector("[data-col='difference']")!;
    expect(difference.textContent).not.toMatch(/\b0(\.00)?\b/);
    expect(triad.querySelector("[data-col='internal']")!.textContent).toContain("80,000.00");
    expect(panel.textContent).toContain("Shared binding: the balance difference is not computed.");
    expect(panel.textContent).toContain("No verdict");
  });

  it("Reconciliation: where scopes match, the difference is the source's own", async () => {
    stubFetch();
    account("acc_bnc_sub");
    await loaded360("Binance sub account");
    const panel = await openTab("Reconciliation");
    const difference = within(panel).getByRole("group", { name: "Reconciliation" }).querySelector("[data-col='difference']")!;
    expect(difference.textContent).toContain("0.20");
    expect(panel.textContent).toContain("Differs");
  });

  it("Reconciliation: sync history newest first, a row without a time says so, and the cap is stated", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Reconciliation");
    const table = within(panel).getByRole("table", { name: "Sync history" });
    const rows = bodyRows(table);
    expect(rows).toHaveLength(7);
    expect(cell(rows[0]!, "When (UTC)")).toContain("17 Oct 09:00Z");
    // The reason is a disclosure on the cell, not a title and not hidden text: open it and read it.
    const noTime = rows.map((r) => r.querySelector("td[data-l='When (UTC)'] .exec-acct-na")).find((n) => n !== null && n !== undefined);
    expect(noTime).toBeTruthy();
    expect(noTime!.textContent).toContain("Not available");
    expect(whyText(noTime!)).toBe("Time not published");
    expect(rows.some((r) => cell(r, "When (UTC)").includes("Time not published"))).toBe(false);
    const results = rows.map((r) => r.querySelector("td[data-l='Result'] .exec-flag")?.getAttribute("data-k"));
    expect(results).toContain("stale");
    expect(results).toContain("rejected");
    expect(results).toContain("pending");
  });

  it("Activity: orders in the source's order, then fills; actor and receipt are Not published (FE-021)", async () => {
    const stub = stubFetch();
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Activity");
    const table = await within(panel).findByRole("table", { name: "Events for acc_bnc_core" });
    expect(bodyRows(table).map((r) => cell(r, "Target"))).toEqual(["BTCUSDT", "ETHUSDT", "BTCUSDT"]);
    expect(bodyRows(table).map((r) => r.querySelector("td[data-l='Kind'] .exec-flag")?.getAttribute("data-k"))).toEqual(["applied", "pending", "rejected"]);
    expect(panel.textContent).toContain("Not published (FE-021)");
    expect(panel.textContent).toContain("Not published (FE-031)");
    expect(panel.textContent).toContain("Retained current window, not an audit trail");
    expect(stub.paths("/api/v1/execution/resources/accounts/acc_bnc_core/orders")[0]).toContain("environment=live");
    fireEvent.click(within(panel).getByRole("button", { name: "Fills" }));
    await waitFor(() => expect(within(panel).getByRole("table", { name: "Events for acc_bnc_core" })).toBeTruthy(), SLOW);
    await waitFor(() => expect(bodyRows(within(panel).getByRole("table", { name: "Events for acc_bnc_core" }))).toHaveLength(1), SLOW);
    expect(stub.paths("/api/v1/execution/resources/accounts/acc_bnc_core/fills")).toHaveLength(1);
  });

  it("Activity: keyset Load more appends the next page", async () => {
    stubFetch({ rewrite: (url) => { if (url.pathname.endsWith("/orders")) url.searchParams.set("limit", "2"); } });
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Activity");
    const table = await within(panel).findByRole("table", { name: "Events for acc_bnc_core" });
    expect(bodyRows(table)).toHaveLength(2);
    fireEvent.click(within(panel).getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(bodyRows(within(panel).getByRole("table", { name: "Events for acc_bnc_core" }))).toHaveLength(3), SLOW);
    expect(within(panel).queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("Activity: an account with no orders is an empty feed, said as a fact", async () => {
    stubFetch();
    account("acc_pap_sim");
    await loaded360("Paper simulator");
    const panel = await openTab("Activity");
    await within(panel).findByText("No orders recorded for acc_pap_sim in the retained window.");
  });

  it("Activity: a failed read is Unavailable with its code", async () => {
    stubFetch({ answer: (url) => (url.pathname.endsWith("/orders") ? { status: 503, body: { error: { code: "SUBJECT_UNAVAILABLE", message: "x" } } } : null) });
    account("acc_bnc_core");
    await loaded360();
    const panel = await openTab("Activity");
    await within(panel).findByText(/SUBJECT_UNAVAILABLE/);
  });
});

describe("Account 360: copy and scale", () => {
  it("no dash, N/A or bare zero stands in for an unavailable value on any tab", async () => {
    stubFetch();
    const { container } = account("acc_bnc_sub");
    await loaded360("Binance sub account");
    for (const name of ["Overview", "Positions", "Allocations", "Fees & funding", "Reconciliation", "Activity"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(container.textContent, name).not.toMatch(/—|N\/A/);
      for (const td of Array.from(container.querySelectorAll("td, dd"))) expect(td.textContent?.trim(), name).not.toMatch(/^(-|–)$/);
    }
  });

  it("every table cell carries its column label for the cards layout", async () => {
    stubFetch();
    const { container } = account("acc_bnc_core");
    await loaded360();
    const unlabeled = Array.from(container.querySelectorAll("table.exec-cards tbody td")).filter((td) => !td.getAttribute("data-l") && !td.classList.contains("exec-cards-empty"));
    expect(unlabeled).toEqual([]);
  });

  it("caps positions and sync rows at the DOM budget", async () => {
    const big = Array.from({ length: 260 }, (_, i) => ({ position_id: `p${i}`, account_id: "acc_bnc_core", instrument_id: `S${i}`, side: "LONG", quantity: "1.00", notional: "1.00", currency: "USDT" }));
    const sync = Array.from({ length: 260 }, (_, i) => ({ sync_id: `s${i}`, source: "BROKER", status: "SYNCED", buying_power: "1.00", synced_at_ms: 1_788_000_000_000 + i * 1000 }));
    stubFetch({
      answer: (url) => {
        if (!url.pathname.endsWith("/resources/accounts/acc_bnc_core")) return null;
        const base = answerAccount("GET", url.pathname, url.searchParams)!.body as { data: Record<string, unknown> };
        return { status: 200, body: { ...base, data: { ...base.data, positions: big, broker_sync: sync } } };
      },
    });
    account("acc_bnc_core");
    await loaded360();
    fireEvent.click(screen.getByRole("tab", { name: "Positions" }));
    const positions = await screen.findByRole("table", { name: "Positions of this sleeve" });
    expect(bodyRows(positions)).toHaveLength(200);
    fireEvent.click(screen.getByRole("tab", { name: "Reconciliation" }));
    const history = await screen.findByRole("table", { name: "Sync history" });
    expect(bodyRows(history)).toHaveLength(10);
    expect(screen.getByText("Showing the newest 10 of 200")).toBeTruthy();
  });
});

/* ═══ Accounts list: honesty and accessibility fixes (audit batch) ═════════ */

describe("Accounts list: the Issues only count", () => {
  const issuesButton = () => screen.getByRole("button", { name: /^Issues only/ });

  it("prints no count while the rows are loading, and never 0", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    mount("/deployments/accounts");
    const button = issuesButton();
    expect(button.querySelector(".exec-acct-tab-count")).toBeNull();
    expect(button.textContent).toBe("Issues only");
    expect(button.getAttribute("aria-label")).not.toMatch(/\d/);
    expect(button.getAttribute("title")).not.toMatch(/\d/);
    expect(button.getAttribute("title")).toContain("The server does not filter on this");
  });

  it("prints no count when the read failed", async () => {
    stubFetch({ answer: (url) => (url.pathname.endsWith("/broker-bindings") ? { status: 503, body: { error: { code: "BINDINGS_UNAVAILABLE", message: "down" } } } : null) });
    mount("/deployments/accounts");
    await screen.findByText(/BINDINGS_UNAVAILABLE/);
    const button = issuesButton();
    expect(button.querySelector(".exec-acct-tab-count")).toBeNull();
    expect(button.getAttribute("aria-label")).not.toMatch(/\d/);
  });

  it("counts the loaded rows once ready, and carries a plus while more pages exist", async () => {
    stubFetch({ rewrite: (url) => { if (url.pathname.endsWith("/broker-bindings")) url.searchParams.set("limit", "2"); } });
    mount("/deployments/accounts");
    await loadedList();
    const button = issuesButton();
    // Page one holds bnc_sub (stale) and bnc_main (ok): one issue so far, more behind the cursor.
    expect(button.querySelector(".exec-acct-tab-count")?.textContent).toBe("1+");
    expect(button.getAttribute("aria-label")).toBe("Issues only, 1+ in the 2 loaded rows");
    expect(button.getAttribute("title")).toContain("The server does not filter on this");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(bodyRows(bindingsTable())).toHaveLength(3), SLOW);
    expect(issuesButton().querySelector(".exec-acct-tab-count")?.textContent).toBe("2");
    expect(issuesButton().getAttribute("aria-label")).toBe("Issues only, 2 in the 3 loaded rows");
  });
});

describe("Accounts list: when it was read, and how old a row is", () => {
  it("prints the read time beside the source time, and explains it on the Updated header", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    expect(screen.getByText(/As of 17 Oct 09:00Z · Read 17 Oct 09:14Z$/)).toBeTruthy();
    const head = within(bindingsTable()).getByRole("columnheader", { name: "Updated" });
    expect(head.getAttribute("title")).toContain("17 Oct 09:14Z");
    expect(head.getAttribute("title")).toContain("not the browser clock");
  });

  it("measures ages against the read, with hours floored", async () => {
    stubFetch();
    mount("/deployments/accounts");
    const rows = bodyRows(await loadedList());
    expect(cell(rows[0]!, "Updated")).toContain("14 min ago");
    expect(cell(rows[1]!, "Updated")).toContain("3 h ago");
    // 09:14 - 21:30 the day before is 11 h 44 min: floor, not 12 h.
    expect(cell(rows[2]!, "Updated")).toContain("11 h ago");
  });

  it("shows a stale row as a hollow diamond and says (stale) in words; a fresh row is a filled square", async () => {
    stubFetch();
    mount("/deployments/accounts");
    const rows = bodyRows(await loadedList());
    const dot = (row: HTMLElement) => row.querySelector(".exec-acct-dot");
    expect(dot(rows[0]!)?.getAttribute("data-shape")).toBe("square");
    expect(dot(rows[0]!)?.getAttribute("data-stale")).toBeNull();
    expect(cell(rows[0]!, "Updated")).not.toContain("(stale)");
    expect(dot(rows[1]!)?.getAttribute("data-shape")).toBe("diamond");
    expect(dot(rows[1]!)?.getAttribute("data-stale")).toBe("true");
    expect(cell(rows[1]!, "Updated")).toContain("(stale)");
  });

  it("the stale dot differs from the fresh one in shape in the stylesheet, with tokens only", () => {
    const css = readFileSync(resolve(__dirname, "../../css/account.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const stale = css.match(/\.exec-acct-dot\[data-stale="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(stale).toMatch(/transform:\s*rotate\(45deg\)/);
    expect(stale).toMatch(/background:\s*transparent/);
    expect(stale).toMatch(/border:\s*2px solid var\(--warn\)/);
    const outline = css.match(/\.exec-acct-tab:focus-visible\s*\{\s*outline-offset:\s*(-?\d+px)/)?.[1];
    expect(outline).toBe("-2px");
  });
});

describe("Accounts list: the environment tablist is keyboard-operable", () => {
  it("roves tabindex: only the selected tab is in the tab order", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    const list = screen.getByRole("tablist", { name: "Environment" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowRight selects and focuses the next environment, ArrowLeft wraps", async () => {
    stubFetch();
    mount("/deployments/accounts");
    await loadedList();
    const list = screen.getByRole("tablist", { name: "Environment" });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() => expect(search().get("env")).toBe("paper"), SLOW);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^Paper/ })), SLOW);
    expect(screen.getByRole("tab", { name: /^Paper/ }).getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() => expect(search().get("env")).toBe("sandbox"), SLOW);
    fireEvent.keyDown(list, { key: "ArrowRight" });
    await waitFor(() => expect(search().get("env")).toBeNull(), SLOW);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^Real-funded/ })), SLOW);
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    await waitFor(() => expect(search().get("env")).toBe("sandbox"), SLOW);
  });
});

/* ═══ Back by source and the canary route (flow audit #8, M4) ═════════════ */

describe("Account 360: Back by source", () => {
  const backLink = () => screen.getByRole("link", { name: /^←/ });

  it("with no origin it is 'Accounts'", async () => {
    stubFetch();
    account("acc_bnc_core");
    await loaded360();
    expect(backLink().textContent).toBe("← Accounts");
    expect(backLink().getAttribute("href")).toBe("/deployments/accounts");
  });

  it("from the Accounts list it restores the list's filters", async () => {
    stubFetch();
    account("acc_bnc_core", `?from=accounts&back=${encodeURIComponent("q=bnc&issues=1&venue=BINANCE&sel=zzz")}`);
    await loaded360();
    expect(backLink().textContent).toBe("← Accounts");
    const url = new URL(backLink().getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/deployments/accounts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "bnc", issues: "1", venue: "BINANCE" });
  });

  it("from a portfolio it goes back to that portfolio", async () => {
    stubFetch();
    account("acc_bnc_core", `?from=${encodeURIComponent("portfolio:pf_core")}`);
    await loaded360();
    expect(backLink().textContent).toBe("← Portfolio pf_core");
    expect(backLink().getAttribute("href")).toBe("/deployments/portfolios/pf_core");
  });

  it("from the cockpit it goes back to Approvals", async () => {
    stubFetch();
    account("acc_bnc_core", `?from=cockpit&back=${encodeURIComponent("view=live")}`);
    await loaded360();
    expect(backLink().textContent).toBe("← Approvals");
    expect(backLink().getAttribute("href")).toBe("/governance/approvals?view=live");
  });

  it("a source this screen does not honour, or a hostile one, is ignored and not echoed", async () => {
    for (const from of ["fleet", "https://evil.example/", "//evil.example", "nonsense"]) {
      stubFetch();
      const view = account("acc_bnc_core", `?from=${encodeURIComponent(from)}&back=q%3Dx`);
      await loaded360();
      expect(backLink().getAttribute("href"), from).toBe("/deployments/accounts");
      expect([...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).join(" ")).not.toContain("evil.example");
      view.unmount();
      cleanup();
    }
  });

  it("onward links (portfolio, deployment) do not inherit the origin", async () => {
    stubFetch();
    account("acc_bnc_core", `?from=accounts&back=${encodeURIComponent("q=bnc")}`);
    await loaded360();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a.exec-acct-link")].map((a) => a.getAttribute("href") ?? "");
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href, href).not.toContain("from=");
      expect(href, href).not.toContain("back=");
    }
  });

  it("the Accounts list writes from=accounts and its filters on the account link", async () => {
    stubFetch();
    mount("/deployments/accounts?q=bnc&issues=1");
    const row = bodyRows(await loadedList())[0]!;
    const url = new URL(within(row).getByRole("link").getAttribute("href")!, "http://x");
    expect(url.pathname.startsWith("/deployments/accounts/")).toBe(true);
    expect(url.searchParams.get("from")).toBe("accounts");
    expect(Object.fromEntries(new URLSearchParams(url.searchParams.get("back") ?? ""))).toEqual({ q: "bnc", issues: "1" });
  });
});
