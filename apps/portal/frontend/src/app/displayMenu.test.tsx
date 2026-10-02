/**
 * W3A — the mobile shell. At <=720px the bar keeps one row and the Theme,
 * Density, Planned modules and workspace controls move into a Display menu.
 * jsdom does not apply the stylesheet, so the CSS half of the contract is
 * asserted against shell.css itself; the behaviour half (keyboard, focus,
 * accessible names, chips) is asserted on the rendered DOM.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { maturityStateName } from "../lib/portalState";
import { PreferencesProvider } from "./preferences";
import { PortalPresentationProvider } from "./presentation";
import { TopBar } from "./TopBar";

afterEach(cleanup);

function mount() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <PreferencesProvider>
        <PortalPresentationProvider registry={null}>
          <a href="#portal-content" className="portal-skip-link">Skip to content</a>
          <TopBar
            breadcrumbs={[{ label: "Research", route: "/research" }, { label: "Library", route: null }]}
            environment={null}
            onOpenPalette={() => {}}
            onToggleMobileNav={() => {}}
          />
        </PortalPresentationProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  );
}

describe("Display menu", () => {
  it("is closed by default and does not duplicate the controls in the DOM", () => {
    mount();
    const button = screen.getByRole("button", { name: "Display" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByLabelText("Theme")).toHaveLength(1);
    expect(screen.getAllByLabelText("Density")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Display" })).toBeNull();
  });

  it("opens on activation, holds workspace/theme/density/planned modules, and Esc closes and returns focus", () => {
    mount();
    const button = screen.getByRole("button", { name: "Display" });
    button.focus();
    // Enter and Space activate a native <button> as a click; real keys are
    // exercised in the Playwright measurement (jsdom has no key->click bridge).
    fireEvent.click(button);
    const panel = screen.getByRole("group", { name: "Display" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(panel.id);
    expect(within(panel).getByText("Default Workspace")).toBeTruthy();
    expect(within(panel).getByLabelText("Theme")).toBeTruthy();
    expect(within(panel).getByLabelText("Density")).toBeTruthy();
    expect(within(panel).getByLabelText("Planned modules")).toBeTruthy();

    within(panel).getByLabelText("Theme").focus();
    fireEvent.keyDown(within(panel).getByLabelText("Theme"), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Display" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes when focus leaves the menu and toggles closed on a second activation", () => {
    mount();
    const button = screen.getByRole("button", { name: "Display" });
    fireEvent.click(button);
    const outside = document.body.appendChild(document.createElement("button"));
    fireEvent.blur(within(screen.getByRole("group", { name: "Display" })).getByLabelText("Planned modules"), { relatedTarget: outside });
    expect(screen.queryByRole("group", { name: "Display" })).toBeNull();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("group", { name: "Display" })).toBeNull();
    outside.remove();
  });

  it("keeps the skip link first in tab order", () => {
    const { container } = mount();
    const focusable = Array.from(container.querySelectorAll<HTMLElement>("a[href], button, select, input"));
    expect(focusable[0]?.textContent).toBe("Skip to content");
  });

  it("marks exactly one crumb as current", () => {
    const { container } = mount();
    expect(container.querySelectorAll(".portal-crumb--current")).toHaveLength(1);
    expect(container.querySelector(".portal-crumb--current")?.textContent).toContain("Library");
  });
});

describe("maturityStateName", () => {
  it("names SOON and PROTOTYPE only", () => {
    expect(maturityStateName("COMMISSIONED")).toBe("soon");
    expect(maturityStateName("PROTOTYPE")).toBe("prototype");
    expect(maturityStateName("AVAILABLE")).toBeNull();
    expect(maturityStateName("BLOCKED")).toBeNull();
    expect(maturityStateName("DEPRECATED")).toBeNull();
  });
});

describe("mobile shell stylesheet contract", () => {
  const css = readFileSync(join(process.cwd(), "src", "styles", "shell.css"), "utf8");
  const mobile = css.slice(css.indexOf("/* --- Mobile shell (W3A"));

  it("keeps every mobile rule inside the 720px query", () => {
    const after = mobile.slice(mobile.indexOf("@media (max-width: 720px)"));
    const outside = mobile.slice(0, mobile.indexOf("@media (max-width: 720px)"));
    const rules = outside.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(rules).toBe(".portal-display { display: none; }");
    expect(after.length).toBeGreaterThan(0);
  });

  it("fixes the bar at 56px on one row and hides the laptop controls", () => {
    expect(mobile).toMatch(/height: 56px;/);
    expect(mobile).toMatch(/flex-wrap: nowrap;/);
    for (const hidden of [".portal-pref", ".portal-pref-check", ".portal-wide-only", ".portal-admin-link"]) {
      expect(mobile).toContain(`.portal-topbar > ${hidden}`);
    }
  });

  it("gives the bar buttons a 44px touch target", () => {
    expect(mobile).toMatch(/width: 44px;\s+height: 44px;/);
  });

  it("uses tokens only for colour", () => {
    expect(mobile).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
