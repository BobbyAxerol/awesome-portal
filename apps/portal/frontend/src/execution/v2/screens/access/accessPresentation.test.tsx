/**
 * Access V2, WP-E presentation: subtitle, the freshness chip, the four design tiles, step-up chips per action, the Live closed
 * note, the Manage grants head, and the fixture's grant matrix read (`GET /api/admin/profile-access`) through the V1 client.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_DOUBLE_WORKSPACES, answerAccessEffective, answerProfileAccessPolicy, policyAccounts, PROFILE_ACCESS_ACTIVITY_ROUTE, PROFILE_ACCESS_POLICY_ROUTE,
} from "../../../../../e2e/bffDoubleAccess";
import { answerFixtureRequest, V2_OPTIONS } from "../../../../../e2e/bffAnswerer";
import { profileAccess, GOVERNANCE_GATES } from "../../../../features/admin/profileAccessApi";
import AccessSelfView, { ACCESS_PATH, type AccessSelfViewProps } from "./index";
import { doRows, LIVE_CLOSED_NOTE } from "./model";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const ME = "usr_me";
const NOW = Date.UTC(2026, 9, 18, 12, 4);
const OWNER_CAPS = ["administration.profile_access.manage", "governance.r2.decide", "governance.r2.read", "governance.live.decide", "governance.live.read", "governance.r1.decide", "governance.r1.read"];

function signIn(options: { capabilities?: Iterable<string>; owner?: boolean; exp?: number; username?: string | null } = {}) {
  session.current = {
    principal: options.username === null
      ? null
      : { principalId: "p_me", username: options.username ?? "stan", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: options.exp ?? 0 },
    access: {
      kind: "ready",
      access: { userId: ME, isOwner: options.owner ?? false, ownerState: options.owner ? "OWNER" : "NOT_OWNER", capabilities: [...(options.capabilities ?? [])] },
    },
  };
}
beforeEach(() => signIn());
afterEach(() => {
  cleanup();
  session.current = null;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const doubleFetch = () =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://portal.test");
    const answer = answerAccessEffective("GET", url.pathname, url.searchParams, { userId: ME });
    return answer === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(answer.body, answer.status);
  });

function mount(props: Partial<AccessSelfViewProps> = {}, entry = `${ACCESS_PATH}?workspace_id=${ACCESS_DOUBLE_WORKSPACES.available}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AccessSelfView now={() => NOW} fetchImpl={doubleFetch() as unknown as typeof fetch} {...props} />
    </MemoryRouter>,
  );
}
const granted = () => screen.findByRole("table", { name: "Granted to you" });
const doRow = (label: string) => within(screen.getByRole("table", { name: "What you can do" })).getByText(label).closest("tr") as HTMLElement;

describe("header", () => {
  it("prints the subtitle: the signed-in name and the owner state, no preset", async () => {
    signIn({ owner: true, username: "bobby" });
    mount();
    await granted();
    expect(screen.getByTestId("acc-subtitle").textContent).toBe("bobby · Owner");
  });

  it("says the signed-in person is not named when the sign-in read has no username", async () => {
    signIn({ username: null });
    mount();
    await granted();
    expect(screen.getByTestId("acc-subtitle").textContent).toBe("Signed-in person not named · Not an owner");
  });

  it("always draws a freshness chip: the browser's receipt time when the grants were read, else Freshness not published", async () => {
    mount();
    await granted();
    expect(screen.getByTestId("acc-fresh").textContent).toBe("Read 18 Oct 12:04Z");
    cleanup();
    mount({}, ACCESS_PATH);
    expect(screen.getByTestId("acc-fresh").textContent).toBe("Freshness not published");
    expect(screen.getByTestId("acc-fresh").getAttribute("data-state")).toBe("none");
  });
});

describe("the four tiles", () => {
  it("are Signed in as, Role preset, App sign-in and Access policy, in that order", async () => {
    mount();
    await granted();
    const labels = [...document.querySelectorAll(".exec-acc-kpi dt")].map((n) => n.textContent);
    expect(labels).toEqual(["Signed in as", "Role preset", "App sign-in", "Access policy"]);
  });

  it("App sign-in is Active with the session's own end time as published, never a countdown", async () => {
    signIn({ exp: Math.floor(Date.UTC(2026, 9, 18, 20, 12) / 1000) });
    mount();
    await granted();
    const tile = screen.getByText("App sign-in").closest(".exec-acc-kpi") as HTMLElement;
    expect(tile.querySelector(".exec-acc-kpi-value")?.textContent).toBe("Active");
    expect(screen.getByTestId("acc-session-end").textContent).toBe("Session ends 18 Oct 20:12Z");
    expect(tile.textContent).not.toMatch(/\bin \d+ ?h\b/);
  });

  it("App sign-in says the end is not published when the sign-in read has none", async () => {
    signIn({ exp: 0 });
    mount();
    await granted();
    expect(screen.getByTestId("acc-session-end").textContent).toBe("Session end not published");
  });

  it("Role preset stays Not available with its request id in the note", async () => {
    mount();
    await granted();
    const tile = screen.getByText("Role preset").closest(".exec-acc-kpi") as HTMLElement;
    expect(tile.querySelector(".exec-acc-kpi-value")?.textContent).toBe("Not available");
    expect(tile.textContent).toContain("FE-015");
  });
});

describe("step-up chips and the Live note", () => {
  it("an allowed R2 decision carries a typed Step-up not stated chip; R1 carries none", async () => {
    signIn({ capabilities: OWNER_CAPS });
    mount();
    await granted();
    expect(doRow("Decide at R2 gate").textContent).toContain("Step-up not stated");
    expect(doRow("Decide at R1 gate").textContent).not.toContain("Step-up");
  });

  it("a denied R2 decision has no step-up chip (nothing to confirm)", async () => {
    signIn({ capabilities: ["governance.r1.decide"] });
    mount();
    await granted();
    expect(doRow("Decide at R2 gate").textContent).not.toContain("Step-up");
  });

  it("the Live gate row keeps its capability status and adds the cockpit's own sentence", async () => {
    signIn({ capabilities: OWNER_CAPS });
    mount();
    await granted();
    const row = doRow("Decide at Live gate");
    expect(row.textContent).toContain("Allowed");
    expect(within(row).getByTestId("acc-row-note").textContent).toBe(LIVE_CLOSED_NOTE);
  });

  it("Manage grants shows the owner step-up state the step-up read gave", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount({ manage: <p>matrix</p>, readStepUp: async () => ({ state: "REQUIRED", expiresAt: null }) });
    await granted();
    await waitFor(() => expect(doRow("Manage grants").textContent).toContain("Step-up required"));
    cleanup();
    mount({ manage: <p>matrix</p>, readStepUp: async () => ({ state: "ACTIVE", expiresAt: "2026-10-18T12:11:00Z" }) });
    await granted();
    await waitFor(() => expect(doRow("Manage grants").textContent).toContain("Step-up active"));
  });

  it("a failed step-up read draws no chip on the row (never required by guess)", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    const read = vi.fn(async () => {
      throw new Error("down");
    });
    mount({ manage: <p>matrix</p>, readStepUp: read });
    await granted();
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(doRow("Manage grants").textContent).not.toContain("Step-up");
  });

  it("does not ask the step-up read for someone who cannot manage grants", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: false });
    const read = vi.fn(async () => ({ state: "REQUIRED" as const, expiresAt: null }));
    mount({ manage: <p>matrix</p>, readStepUp: read });
    await granted();
    expect(read).not.toHaveBeenCalled();
  });

  it("model: step-up fields appear only on the rows that earn them", () => {
    const rows = Object.fromEntries(doRows(new Set(OWNER_CAPS), undefined, "ACTIVE").map((r) => [r.id, r]));
    expect(rows["decide:r2"]!.stepUpAbsent).toBe(true);
    expect(rows["decide:r1"]!.stepUpAbsent).toBeUndefined();
    expect(rows["decide:live"]!.note).toBe(LIVE_CLOSED_NOTE);
    expect(rows["manage:grants"]!.stepUp).toBe("ACTIVE");
    // not held: no chip, whatever the read said
    const none = Object.fromEntries(doRows(new Set(), undefined, "REQUIRED").map((r) => [r.id, r]));
    expect(none["manage:grants"]!.stepUp).toBeUndefined();
    expect(none["decide:r2"]!.stepUpAbsent).toBeUndefined();
  });
});

describe("Manage grants head", () => {
  it("names the step-up state and says role presets are not available, with the matrix below it", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount({ manage: <p data-testid="matrix">matrix</p>, readStepUp: async () => ({ state: "REQUIRED", expiresAt: null }) }, `${ACCESS_PATH}?view=manage`);
    const head = await screen.findByTestId("acc-manage-head");
    await waitFor(() => expect(head.textContent).toContain("Step-up required"));
    expect(head.textContent).toContain("Role preset: Not available");
    expect(screen.getByTestId("matrix")).toBeTruthy();
    // the Self view is not drawn under the manage tab
    expect(screen.queryByRole("table", { name: "What you can do" })).toBeNull();
  });

  it("QA1 I-31: the matrix is inside the page's own flow (no empty band), and says which workspace the page reads and that the grants are portal-wide", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount({ manage: <p data-testid="matrix">matrix</p>, readStepUp: async () => ({ state: "REQUIRED", expiresAt: null }) }, `${ACCESS_PATH}?view=manage&workspace_id=${ACCESS_DOUBLE_WORKSPACES.available}`);
    const head = await screen.findByTestId("acc-manage-head");
    const panel = screen.getByTestId("matrix").closest("#exec-acc-panel") as HTMLElement;
    expect(panel.className).toContain("exec-acc-manage-body");
    expect(panel.closest(".exec-surface")).not.toBeNull();
    expect(head.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("acc-manage-workspace").textContent).toContain(ACCESS_DOUBLE_WORKSPACES.available);
    expect(screen.getByTestId("acc-manage-workspace").textContent).toContain("portal-wide");
    expect(screen.getByTestId("acc-manage-intro").textContent).toContain("changes nothing outside the Portal");
  });

  it("QA1 I-31: no workspace line when the page names none", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount({ manage: <p>matrix</p> }, `${ACCESS_PATH}?view=manage`);
    await screen.findByTestId("acc-manage-head");
    expect(screen.queryByTestId("acc-manage-workspace")).toBeNull();
  });

  it("QA1 I-29: a long capability key wraps between its parts (break opportunities), and the text is unchanged", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount();
    await granted();
    const row = doRow("Manage grants");
    expect(row.textContent).toContain("administration.profile_access.manage");
    expect(row.querySelectorAll("wbr").length).toBeGreaterThan(0);
  });

  it("is not drawn on the self tab", async () => {
    signIn({ capabilities: OWNER_CAPS, owner: true });
    mount({ manage: <p>matrix</p> });
    await granted();
    expect(screen.queryByTestId("acc-manage-head")).toBeNull();
  });
});

describe("the fixture's grant matrix read", () => {
  it("serves five accounts, the owner flagged and the other four with only governance capabilities", () => {
    const answer = answerProfileAccessPolicy("GET", PROFILE_ACCESS_POLICY_ROUTE, new URLSearchParams(), { userId: ME })!;
    expect(answer.status).toBe(200);
    const accounts = (answer.body as { accounts: { username: string; is_owner: boolean; account_state: string; capabilities: { capability: string }[] }[] }).accounts;
    expect(accounts.map((a) => a.username)).toEqual(["bobby", "stan", "minh", "lan", "former-analyst"]);
    expect(accounts.filter((a) => a.is_owner).map((a) => a.username)).toEqual(["bobby"]);
    expect(accounts.find((a) => a.username === "former-analyst")!.account_state).toBe("ARCHIVED");
    for (const account of accounts) for (const c of account.capabilities) expect(c.capability).toMatch(/^governance\.(r1|r2|canary|live)\.(read|decide)$/);
    expect(policyAccounts(ME)[0]!.user_id).toBe(ME);
  });

  it("answers GET only, takes no query, and the activity read needs a known grantee", () => {
    expect(answerProfileAccessPolicy("POST", PROFILE_ACCESS_POLICY_ROUTE, new URLSearchParams())).toBeNull();
    expect(answerProfileAccessPolicy("GET", PROFILE_ACCESS_POLICY_ROUTE, new URLSearchParams("x=1"))!.status).toBe(400);
    expect(answerProfileAccessPolicy("GET", "/api/admin/profile-access/v2/effective", new URLSearchParams())).toBeNull();
    expect(answerProfileAccessPolicy("GET", PROFILE_ACCESS_ACTIVITY_ROUTE, new URLSearchParams())!.status).toBe(400);
    expect(answerProfileAccessPolicy("GET", PROFILE_ACCESS_ACTIVITY_ROUTE, new URLSearchParams("grantee_user_id=nobody"))!.status).toBe(404);
    const minh = answerProfileAccessPolicy("GET", PROFILE_ACCESS_ACTIVITY_ROUTE, new URLSearchParams("grantee_user_id=usr_fx_minh"))!;
    expect((minh.body as { activity: unknown[] }).activity).toHaveLength(2);
  });

  it("is served only on the simulated lanes; the sparse default still answers nothing for it", () => {
    const ask = (simulated: boolean) =>
      answerFixtureRequest({ method: "GET", path: PROFILE_ACCESS_POLICY_ROUTE, search: "", headers: {}, body: null }, { ...V2_OPTIONS, userId: ME, simulated });
    expect(ask(false)).toBeNull();
    expect(ask(true)?.status).toBe(200);
    // writes are never answered
    expect(answerFixtureRequest({ method: "POST", path: PROFILE_ACCESS_POLICY_ROUTE, search: "", headers: {}, body: {} }, { ...V2_OPTIONS, userId: ME, simulated: true })).toBeNull();
  });

  it("the V1 client reads it into the matrix's rows: the grid has the four gates, the owner and a read-only account are told apart", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://portal.test");
      const answer = answerProfileAccessPolicy("GET", url.pathname, url.searchParams, { userId: ME });
      return answer === null ? json({}, 404) : json(answer.body, answer.status);
    }) as unknown as typeof fetch;
    try {
      const accounts = await profileAccess.policy();
      expect(accounts).toHaveLength(5);
      expect(accounts.find((a) => a.isOwner)?.username).toBe("bobby");
      const minh = accounts.find((a) => a.username === "minh")!;
      expect(GOVERNANCE_GATES.map((g) => minh.capabilities.some((c) => c.capability === `governance.${g.id}.decide`))).toEqual([true, true, true, false]);
      const stan = accounts.find((a) => a.username === "stan")!;
      expect(stan.capabilities.map((c) => c.capability)).toEqual(["governance.r1.read"]);
      const activity = await profileAccess.activity("usr_fx_minh");
      expect(activity.map((e) => e.capability)).toEqual(["governance.r2.decide", "governance.r1.decide"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
