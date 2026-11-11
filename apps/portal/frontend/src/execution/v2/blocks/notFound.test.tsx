/**
 * UI review F1 / D8 and D12: a record that is not there reads as a plain sentence, the id is secondary text, there is a way back and no
 * "Try again"; and a PanelState reason never shows a machine code as the sentence (the code stays in data-code and the Details line).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PanelState } from "../../components/states";
import { NotFound } from "./NotFound";

afterEach(cleanup);

describe("NotFound", () => {
  it("a plain sentence, the id beside it, a Back link to the list, no Try again, and the code only in data-code", () => {
    const { container } = render(
      <MemoryRouter>
        <NotFound what="Account" id="Binance-02" sentence="This account does not exist, or it is not visible to you (ACCOUNT_NOT_FOUND)." backTo="/deployments/accounts" backLabel="Accounts" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Account not found")).toBeTruthy();
    expect(screen.getByText(/This account does not exist, or it is not visible to you\./)).toBeTruthy();
    expect(screen.getByText("Binance-02", { selector: "code" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Accounts" }).getAttribute("href")).toBe("/deployments/accounts");
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(container.querySelector("[data-code]")?.getAttribute("data-code")).toBe("ACCOUNT_NOT_FOUND");
    // the visible sentence (outside the closed Details line) carries no code
    expect(container.querySelector(".exec-state-reason")?.textContent).not.toMatch(/ACCOUNT_NOT_FOUND/);
  });
});

describe("PanelState with a machine code in the reason", () => {
  it("shows plain words, keeps the code in data-code, a tooltip and the Details line", () => {
    const { container } = render(<PanelState status="unavailable" reason="The Manager dataset could not be read (MANAGER_DATASET_REFUSED)." />);
    const reason = container.querySelector(".exec-state-reason")!;
    expect(reason.textContent).toMatch(/^The Manager dataset could not be read\./);
    expect(reason.textContent).not.toContain("MANAGER_DATASET_REFUSED");
    expect(reason.getAttribute("title")).toBe("MANAGER_DATASET_REFUSED");
    expect(container.querySelector(".exec-state")?.getAttribute("data-code")).toBe("MANAGER_DATASET_REFUSED");
    expect(container.querySelector(".exec-state-code code")?.textContent).toContain("MANAGER_DATASET_REFUSED");
  });
  it("a reason with no code is untouched", () => {
    const { container } = render(<PanelState status="unavailable" reason="The queue read did not complete." />);
    expect(container.querySelector(".exec-state-reason")?.textContent).toBe("The queue read did not complete.");
    expect(container.querySelector(".exec-state-code")).toBeNull();
    expect(container.querySelector(".exec-state")?.hasAttribute("data-code")).toBe(false);
  });
});
