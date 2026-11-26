/** DR-30 execution grants panel: hidden when the feature is off, honest errors, grant/renew/revoke with step-up. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthRequestError } from "../../../../auth/authApi";
import { readGrants, GrantsMalformed, type ExecutionGrantsRead, type GrantsClient } from "../../../../features/admin/executionGrantsApi";
import { ExecutionGrantsPanel } from "./ExecutionGrantsPanel";

afterEach(cleanup);

const DATA: ExecutionGrantsRead = {
  workspaceId: "ws_bound", maxTermDays: 365,
  grants: [
    { userId: "u1", username: "stan", displayName: "Stan", environments: ["paper", "live"], termStartedAt: "2026-11-26T01:00:00Z", expiresAt: "2027-11-26T01:00:00Z", revokedAt: null, status: "ACTIVE" },
    { userId: "u2", username: "old", displayName: "Old", environments: ["paper"], termStartedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-06-01T00:00:00Z", revokedAt: "2026-02-01T00:00:00Z", status: "REVOKED" },
  ],
  candidates: [{ username: "stan", displayName: "Stan" }, { username: "thanh", displayName: "Thanh" }],
};
const change = { outcome: "ISSUED" as const, environments: ["paper" as const] };
function fake(over: Partial<GrantsClient> = {}): GrantsClient {
  return { list: vi.fn(async () => DATA), grant: vi.fn(async () => change), renew: vi.fn(async () => ({ ...change, outcome: "RENEWED" as const })),
    revoke: vi.fn(async () => ({ ...change, outcome: "REVOKED" as const })), confirmPassword: vi.fn(async () => undefined), ...over };
}
const err = (status: number, code: string, message: string) => new AuthRequestError(status, code, message, null);

describe("ExecutionGrantsPanel", () => {
  it("is not drawn at all when the server says the feature is off (404)", async () => {
    const client = fake({ list: vi.fn(async () => { throw err(404, "NOT_FOUND", "x"); }) });
    const { container } = render(<ExecutionGrantsPanel client={client} />);
    await waitFor(() => expect(client.list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Loading execution access")).toBeNull());
    expect(container.textContent).toBe("");
  });
  it("names a denied account and an outage honestly, and retries", async () => {
    const denied = render(<ExecutionGrantsPanel client={fake({ list: vi.fn(async () => { throw err(403, "FORBIDDEN", "x"); }) })} />);
    expect(await screen.findByText(/not the owner/)).toBeTruthy(); denied.unmount();
    const list = vi.fn().mockRejectedValueOnce(err(500, "BOOM", "x")).mockResolvedValue(DATA);
    render(<ExecutionGrantsPanel client={fake({ list })} />);
    expect(await screen.findByText(/could not be read \(BOOM\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Execution grants" })).toBeTruthy();
  });
  it("lists grants with words for absent values, never a dash or zero", async () => {
    render(<ExecutionGrantsPanel client={fake()} />);
    const table = await screen.findByRole("table", { name: "Execution grants" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("Not revoked")).toBeTruthy();
    expect(within(rows[1]).getByText("Paper, Live")).toBeTruthy();
    expect(within(rows[2]).getByText("Issue a new grant to restore access")).toBeTruthy();
    expect(table.textContent).not.toMatch(/\b0\b|—/);
  });
  it("grant: environments are never assumed and the term is bounded", async () => {
    const client = fake(); render(<ExecutionGrantsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Grant access" }));
    const form = screen.getByRole("form", { name: "Grant execution access" });
    expect(within(form).queryByRole("option", { name: /stan/ })).toBeNull(); // already active, not offered
    fireEvent.change(within(form).getByRole("combobox"), { target: { value: "thanh" } });
    fireEvent.click(within(form).getByRole("button", { name: "Grant read-only access" }));
    expect(screen.getByTestId("grants-draft-error").textContent).toMatch(/at least one environment/);
    fireEvent.click(within(form).getByLabelText("Sandbox"));
    fireEvent.change(within(form).getByRole("spinbutton"), { target: { value: "400" } });
    fireEvent.click(within(form).getByRole("button", { name: "Grant read-only access" }));
    expect(screen.getByTestId("grants-draft-error").textContent).toMatch(/1 to 365/);
    expect(client.grant).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByRole("spinbutton"), { target: { value: "30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Grant read-only access" }));
    await waitFor(() => expect(client.grant).toHaveBeenCalledTimes(1));
    expect((client.grant as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ username: "thanh", environments: ["sandbox"], termDays: 30 });
    expect(await screen.findByText(/done\. It applies from the next request/)).toBeTruthy();
  });
  it("asks for the password on STEP_UP_REQUIRED, then repeats the same intent with the same key", async () => {
    const grant = vi.fn().mockRejectedValueOnce(err(403, "STEP_UP_REQUIRED", "Re-enter your password to confirm this action.")).mockResolvedValue(change);
    const client = fake({ grant }); render(<ExecutionGrantsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Grant access" }));
    const form = screen.getByRole("form", { name: "Grant execution access" });
    fireEvent.change(within(form).getByRole("combobox"), { target: { value: "thanh" } });
    fireEvent.click(within(form).getByLabelText("Paper"));
    fireEvent.click(within(form).getByRole("button", { name: "Grant read-only access" }));
    const pw = await screen.findByLabelText("Password");
    expect(pw.getAttribute("type")).toBe("password");
    fireEvent.change(pw, { target: { value: "secret-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and apply" }));
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(2));
    expect(client.confirmPassword).toHaveBeenCalledWith("secret-password-1");
    expect(grant.mock.calls[0][1]).toBe(grant.mock.calls[1][1]);
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  });
  it("shows the server's own refusal and keeps nothing applied", async () => {
    const client = fake({ grant: vi.fn(async () => { throw err(409, "GRANT_ALREADY_ACTIVE", "This account already has an active grant. Renew it instead."); }) });
    render(<ExecutionGrantsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Grant access" }));
    const form = screen.getByRole("form", { name: "Grant execution access" });
    fireEvent.change(within(form).getByRole("combobox"), { target: { value: "thanh" } });
    fireEvent.click(within(form).getByLabelText("Live"));
    fireEvent.click(within(form).getByRole("button", { name: "Grant read-only access" }));
    expect((await screen.findByTestId("grants-error")).textContent).toContain("GRANT_ALREADY_ACTIVE");
  });
  it("renew prefills the current environments; revoke needs a confirmation that names the account", async () => {
    const client = fake(); render(<ExecutionGrantsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Renew stan" }));
    const form = screen.getByRole("form", { name: "Renew stan" });
    expect((within(form).getByLabelText("Paper") as HTMLInputElement).checked).toBe(true);
    expect((within(form).getByLabelText("Sandbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(form).getByRole("button", { name: "Renew grant" }));
    await waitFor(() => expect(client.renew).toHaveBeenCalledTimes(1));
    expect((client.renew as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ username: "stan", environments: ["paper", "live"] });
    fireEvent.click(await screen.findByRole("button", { name: "Revoke stan" }));
    expect(client.revoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/Revoke execution access for stan/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(client.revoke).toHaveBeenCalledTimes(1));
    expect((client.revoke as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("stan");
  });
});

describe("readGrants refuses a malformed answer instead of repairing it", () => {
  const good = { workspace_id: "ws", max_term_days: 365, candidates: [], grants: [{ user_id: "u", username: "a", display_name: "A", environments: ["paper"],
    term_started_at: "2026-11-26T00:00:00Z", expires_at: "2027-11-26T00:00:00Z", revoked_at: null, status: "ACTIVE" }] };
  it("reads the published shape", () => { expect(readGrants(good).grants[0]).toMatchObject({ username: "a", revokedAt: null, environments: ["paper"] }); });
  it.each([
    ["no list", { ...good, grants: "x" }], ["bad status", { ...good, grants: [{ ...good.grants[0], status: "ON" }] }],
    ["unknown environment", { ...good, grants: [{ ...good.grants[0], environments: ["prod"] }] }], ["empty environments", { ...good, grants: [{ ...good.grants[0], environments: [] }] }],
    ["bad date", { ...good, grants: [{ ...good.grants[0], expires_at: "soon" }] }], ["no max", { ...good, max_term_days: undefined }],
  ])("%s", (_name, body) => { expect(() => readGrants(body)).toThrow(GrantsMalformed); });
});
