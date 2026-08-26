/**
 * Phase 6 screen behaviour, against the canonical catalogue.
 *
 * Each test is a sentence from codex's stop gates that a reasonable
 * implementation could break: an unreachable action hidden to keep the list
 * tidy, a plan step drawn for a command that has none, a 403 that leaks the
 * catalogue through its error text, a source tier shown where the Portal's
 * belongs.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { readCommandCatalogue, type CatalogEntry } from "./adminCatalog";
import { COMMAND_CATALOGUE_FIXTURE } from "./adminCatalog.fixtures";
import { AdminActionDrawerScreen } from "./screens/AdminActionDrawer";
import { AdminCatalogueContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import { createHttpApi } from "./api/httpApi";
import type { DeliveryPolicy } from "./profile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CATALOGUE = readCommandCatalogue(COMMAND_CATALOGUE_FIXTURE)!;
const entry = (key: string) => CATALOGUE.entries.find((e) => e.key === key)!;

function Harness({ initial = null }: { initial?: CatalogEntry | null }) {
  const [selected, setSelected] = useState<CatalogEntry | null>(initial);
  return (
    <AdminActionDrawerScreen catalogue={CATALOGUE} selected={selected} onSelect={setSelected} />
  );
}

describe("every action is listed, and none is dressed up as runnable", () => {
  it("renders all sixty-four rows", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64);
  });

  it("says once, at the top, that the relay is disabled", () => {
    render(<Harness />);
    expect(screen.getByText(/command relay is/)).toBeTruthy();
    expect(screen.getByText(/EX_BE_05B_F0_CONTRACT_ONLY/)).toBeTruthy();
  });

  it("offers no plan or apply control anywhere", () => {
    render(<Harness initial={entry("account/policy")} />);
    // Scoped to the drawer: the catalogue itself contains a command literally
    // called `config apply`, so an unscoped search finds a row and proves
    // nothing. Not disabled — ABSENT: a disabled button advertises a capability
    // that does not exist and teaches the operator that blockers are
    // negotiable.
    const drawer = screen.getByLabelText("Command detail");
    expect(drawer.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByText(/nothing here to run/)).toBeTruthy();
  });

  it("marks every row unreachable", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('.exec-admin-row[data-reachable="true"]')).toHaveLength(0);
  });

  it("keeps rows as buttons, so the keyboard reaches the catalogue", () => {
    render(<Harness />);
    const row = screen.getAllByRole("button")[0];
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the detail pane explains rather than blocks silently", () => {
  it("names why an action is out of reach, in words not a code", () => {
    render(<Harness initial={entry("ops/alerts")} />);
    expect(screen.getByText("NOT EXPOSED IN PORTAL")).toBeTruthy();
    expect(screen.getByText(/publishes no HTTP route/)).toBeTruthy();
    // The machine code stays out of the operator's sentence.
    expect(screen.queryByText("TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED")).toBeNull();
  });

  it("shows the Portal's tier, and the source's only when they differ", () => {
    render(<Harness initial={entry("account/policy")} />);
    // Scoped: the tier chip also appears on every matching row in the list.
    const drawer = screen.getByLabelText("Command detail");
    expect(drawer.textContent).toContain("R1 · paper mutation");
    expect(drawer.textContent).toContain("R0 · read — the Portal is bound by its own tier");
  });

  it("omits the source tier when it agrees, rather than repeating it", () => {
    const same = CATALOGUE.entries.find((e) => e.sourceRiskTier === e.riskTier)!;
    render(<Harness initial={same} />);
    expect(screen.getByLabelText("Command detail").textContent).not.toContain(
      "bound by its own tier",
    );
  });

  it("draws only the steps a command actually requires", () => {
    const noVerify = CATALOGUE.entries.find(
      (e) => e.planRequired && e.applyRequired && !e.verifyRequired,
    )!;
    render(<Harness initial={noVerify} />);
    expect(screen.getByLabelText("Command detail").textContent).toContain("PLAN → APPLY");
  });

  it("says so when a command has no plan/apply/verify path at all", () => {
    const none = CATALOGUE.entries.find(
      (e) => !e.planRequired && !e.applyRequired && !e.verifyRequired,
    );
    if (!none) return expect(none).toBeUndefined(); // revision 2 may have none
    render(<Harness initial={none} />);
    expect(screen.getByText(/no plan\/apply\/verify path/)).toBeTruthy();
  });

  it("states owner review, which the tier does not imply", () => {
    const owned = CATALOGUE.entries.find((e) => e.ownerReviewRequired)!;
    render(<Harness initial={owned} />);
    const drawer = screen.getByLabelText("Command detail");
    expect(drawer.textContent).toContain("Owner review");
    expect(drawer.textContent).toContain("required");
  });

  it("selects through the row, reporting the whole entry", () => {
    const onSelect = vi.fn();
    render(
      <AdminActionDrawerScreen catalogue={CATALOGUE} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].key).toBeTruthy();
  });
});

describe("a non-Admin actor is denied without learning anything", () => {
  const OPEN: DeliveryPolicy = {
    policyRevision: 4,
    queryEnabled: true,
    projectionIngestionEnabled: true,
    sseEnabled: true,
    governanceWriteEnabled: true,
    paperCommandsEnabled: true,
    sandboxCommandsEnabled: true,
    liveProtectiveCommandsEnabled: true,
    liveRiskIncreasingCommandsEnabled: true,
  };

  it("maps 403 to denied, not to unavailable", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { code: "ADMIN_ROLE_REQUIRED", message: "Access denied." } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await createHttpApi({ policy: OPEN }).getCommandCatalogue();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // `denied` is an answer about this actor; `unavailable` would say the
      // system is broken, which it is not.
      expect(result.status).toBe("denied");
      expect(result.reason).toMatch(/Admin operators only/);
      // Nothing about size, entries or groups escapes through the message.
      expect(result.reason).not.toMatch(/\d/);
    }
  });

  it("renders the denial with no catalogue behind it", () => {
    const { container } = render(
      <AdminActionDrawerScreen
        catalogue={null}
        status="denied"
        reason="The command catalogue is available to Admin operators only."
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(0);
    expect(screen.getByText(/Admin operators only/)).toBeTruthy();
  });
});

describe("the container fetches through the port", () => {
  it("loads the catalogue and renders it", async () => {
    const { container } = render(<AdminCatalogueContainer api={createFixtureApi()} />);
    await waitFor(() => expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64));
  });

  it("shows the port's failure rather than an empty catalogue", async () => {
    const { container } = render(
      <AdminCatalogueContainer
        api={createFixtureApi({ unavailableEndpoints: ["getCommandCatalogue"] })}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(0));
    // An empty list would read as "there are no admin actions".
    expect(screen.queryByText(/command relay is/)).toBeNull();
  });
});

describe("sixty-four entries need a way in, and the server provides it", () => {
  it("offers a chip for every tier an operator can act on", () => {
    render(
      <AdminActionDrawerScreen
        catalogue={CATALOGUE}
        selected={null}
        onSelect={() => {}}
        onTierChange={() => {}}
      />,
    );
    const chips = screen.getByRole("group", { name: /risk tier/i });
    expect(chips.querySelectorAll("button")).toHaveLength(6);
    expect(chips.querySelector('[data-tier-filter="ALL"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports the change and never filters the loaded array itself", () => {
    const onTierChange = vi.fn();
    const { container } = render(
      <AdminActionDrawerScreen
        catalogue={CATALOGUE}
        selected={null}
        onSelect={() => {}}
        tier="ALL"
        onTierChange={onTierChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "R3 protective" }));
    expect(onTierChange).toHaveBeenCalledWith("R3_LIVE_PROTECTIVE");
    // Still sixty-four: the screen renders what it was given. A chip that
    // filtered here would show a narrowed list beside an unnarrowed count.
    expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64);
    cleanup();

    // The load-bearing half. Above, `tier` is ALL, so a client-side filter
    // would be a no-op and the assertion would pass either way — which is what
    // the first version of this test did. Here the tier is set and the
    // catalogue is still the full sixty-four: any filtering in the screen shows
    // up immediately.
    const full = render(
      <AdminActionDrawerScreen
        catalogue={CATALOGUE}
        selected={null}
        onSelect={() => {}}
        tier="R3_LIVE_PROTECTIVE"
        onTierChange={() => {}}
      />,
    );
    expect(full.container.querySelectorAll(".exec-admin-row")).toHaveLength(64);
  });

  it("hides the chips entirely when the caller cannot re-query", () => {
    render(<AdminActionDrawerScreen catalogue={CATALOGUE} selected={null} onSelect={() => {}} />);
    expect(screen.queryByRole("group", { name: /risk tier/i })).toBeNull();
  });

  it("re-queries through the port and moves returned_entries, not total", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "getCommandCatalogue");
    const { container } = render(<AdminCatalogueContainer api={api} />);
    await waitFor(() => expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64));

    fireEvent.click(screen.getByRole("button", { name: "R3 protective" }));
    await waitFor(() =>
      expect(container.querySelectorAll(".exec-admin-row").length).toBeLessThan(64),
    );
    expect(spy).toHaveBeenLastCalledWith({ riskTier: "R3_LIVE_PROTECTIVE" });
    // The population is still sixty-four and the header still says so.
    expect(screen.getByText(/of 64 actions/)).toBeTruthy();
  });

  it("sends no filter at all for ALL, rather than a sentinel", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "getCommandCatalogue");
    const { container } = render(<AdminCatalogueContainer api={api} />);
    await waitFor(() => expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64));
    expect(spy).toHaveBeenCalledWith(undefined);
  });

  it("drops the selection when the result set changes underneath it", async () => {
    const api = createFixtureApi();
    const { container } = render(<AdminCatalogueContainer api={api} />);
    await waitFor(() => expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64));
    fireEvent.click(screen.getAllByRole("button", { name: /account policy/i })[0]);
    expect(screen.getByLabelText("Command detail").textContent).toContain("account");

    fireEvent.click(screen.getByRole("button", { name: "R3 protective" }));
    // Otherwise the detail pane describes an entry no longer in the list.
    await waitFor(() =>
      expect(screen.getByLabelText("Command detail").textContent).toContain("Pick an action"),
    );
  });
});
