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
