/**
 * G14, Bobby's option A (2026-09-30) — a run crumb gives up room by dropping
 * segments, not by truncating them.
 *
 * `Research / QuantBT Backtest / <run> / <screen>` is the hi-fi trail; short of
 * room the feature segment goes first, then the screen name, and
 * `Research / <run>` always stays. jsdom applies no media query, so these pin
 * the markup the shell.css breakpoints key on, and the breakpoints themselves.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetRunLabels, rememberRunLabel } from "../research/runLabels";
import { PreferencesProvider } from "./preferences";
import { PortalPresentationProvider } from "./presentation";
import { TopBar } from "./TopBar";

const CRUMBS = [
  { label: "Research", route: "/research" },
  { label: "QuantBT Backtest", route: "/research/quantbt" },
];

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PreferencesProvider>
        <PortalPresentationProvider registry={null}>
          <TopBar breadcrumbs={CRUMBS} environment={null} onOpenPalette={() => undefined} onToggleMobileNav={() => undefined} />
        </PortalPresentationProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  );
}

function segment(text: string): HTMLElement {
  const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
  const hit = Array.from(nav.querySelectorAll<HTMLElement>(".portal-crumb")).find((el) => el.textContent?.includes(text));
  if (!hit) throw new Error(`no crumb segment reads ${text}`);
  return hit;
}

beforeEach(() => forgetRunLabels());
afterEach(() => cleanup());

describe("G14 option A — run crumb collapses by segment", () => {
  it("marks the feature segment and the screen name as the droppable ones on a run page", () => {
    rememberRunLabel("rrun_17f762128acf8c998ac7cc44d13f663f", "R-WFO-017");
    mount("/research/quantbt/runs/rrun_17f762128acf8c998ac7cc44d13f663f/split");
    expect(segment("Research").className).toBe("portal-crumb");
    expect(segment("QuantBT Backtest").className).toContain("portal-crumb--run-context");
    expect(segment("R-WFO-017").className).toBe("portal-crumb");
    expect(segment("Stage 1 · Split").className).toContain("portal-crumb--run-screen");
  });

  it("leaves a page that is not run-scoped untouched", () => {
    mount("/research/quantbt/runs");
    expect(segment("QuantBT Backtest").className).toBe("portal-crumb");
  });

  it("drops the feature segment below 1440px and the screen name below 1366px", () => {
    const css = readFileSync(join(__dirname, "../styles/shell.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain("@media (max-width: 1439px) { .portal-crumb--run-context { display: none; } }");
    expect(css).toContain("@media (max-width: 1365px) { .portal-crumb--run-screen { display: none; } }");
  });
});
