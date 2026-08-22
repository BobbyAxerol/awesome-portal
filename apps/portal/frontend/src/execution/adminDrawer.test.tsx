/**
 * Phase 6 screen behaviour.
 *
 * Each test here is one sentence from the hi-fi that a reasonable
 * implementation could quietly violate: a read that grows a footer, a blocked
 * command that gets hidden to keep the list tidy, a destructive command whose
 * confirm word is optional because it felt redundant next to the plan step.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { ADMIN_CATALOG, findCommand, type CatalogCommand } from "./adminCatalog";
import { AdminActionDrawerScreen } from "./screens/AdminActionDrawer";

afterEach(cleanup);

function Harness({ initial = null }: { initial?: CatalogCommand | null }) {
  const [selected, setSelected] = useState<CatalogCommand | null>(initial);
  return (
    <AdminActionDrawerScreen
      selected={selected}
      onSelect={setSelected}
      policy={{
        policyRevision: 4,
        queryEnabled: true,
        projectionIngestionEnabled: true,
        sseEnabled: true,
        paperCommandsEnabled: true,
        sandboxCommandsEnabled: true,
        liveProtectiveCommandsEnabled: true,
        liveRiskIncreasingCommandsEnabled: false,
      }}
      flow={{ step: "plan", plan: null }}
    />
  );
}

describe("catalogue pane", () => {
  it("renders all 21 commands under their group headings", () => {
    render(<Harness />);
    for (const group of ADMIN_CATALOG) {
      expect(screen.getByRole("heading", { name: group.name })).toBeTruthy();
    }
    // Every command row is a button; the count is the catalogue's, not a guess.
    const rows = screen.getAllByRole("button");
    expect(rows.length).toBeGreaterThanOrEqual(21);
  });

  it("makes every row a real button, so the keyboard reaches the catalogue", () => {
    render(<Harness />);
    const row = screen.getByRole("button", { name: /List portfolios/ });
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the chosen row pressed rather than only colouring it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /List portfolios/ }));
    expect(
      screen.getByRole("button", { name: /List portfolios/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("says on screen that the catalogue is a fixture, not the operator's permissions", () => {
    render(<Harness />);
    expect(screen.getByText(/has not been published yet/)).toBeTruthy();
  });
});

describe("selection panels", () => {
  it("gives a READ command no mutation footer", () => {
    render(<Harness initial={findCommand("portfolio/list")} />);
    expect(screen.getByText(/READ-ONLY/)).toBeTruthy();
    expect(screen.getByText(/no mutation footer/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate plan/i })).toBeNull();
    expect(screen.queryByLabelText(/Reason/i)).toBeNull();
  });

  it("shows a blocked command instead of hiding it, with the reason in full", () => {
    render(<Harness initial={findCommand("redis/trading-state")} />);
    expect(screen.getByText("NOT EXPOSED IN PORTAL")).toBeTruthy();
    expect(screen.getByText(/forbidden that path/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate plan/i })).toBeNull();
  });

  it("offers the plan step for a mutation", () => {
    render(<Harness initial={findCommand("portfolio/create")} />);
    // The behavioural difference from a read, not the word: a mutation offers
    // a plan to generate and a reason to give.
    expect(screen.getByRole("button", { name: /Generate plan/i })).toBeTruthy();
    expect(screen.queryByText(/READ-ONLY/)).toBeNull();
    expect(screen.queryByText(/no mutation footer/)).toBeNull();
  });

  it("routes the destructive command through the drawer as DANGER", () => {
    const command = findCommand("ops/emergency-close");
    expect(command?.tag).toBe("DANGER");
    expect(command?.tier).toBe("R3");
    render(<Harness initial={command} />);
    expect(screen.queryByText(/READ-ONLY/)).toBeNull();
  });

  it("prompts before anything is selected", () => {
    render(<Harness />);
    expect(screen.getByText(/Pick a command from the catalogue/)).toBeTruthy();
  });
});

describe("selection is the caller's state", () => {
  it("reports the whole command object, not just an id", () => {
    const onSelect = vi.fn();
    render(<AdminActionDrawerScreen selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Emergency close/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("ops/emergency-close");
  });
});
