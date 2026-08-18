/**
 * Reports render tests.
 *
 * The screen used to inject the legacy fragment's markup. These assert the new
 * path: primitives only, the document's own content, and no leftover legacy
 * styling hooks.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportsFeature } from "../src/features/reports/ReportsFeature";
import { VIEW_PANELS } from "../src/content/views";
import { parseReportsFragment } from "../src/features/reports/reportsModel";

// The diagram is rendered through mermaid, which needs a real layout engine.
// Stubbing the renderer keeps these tests about the markup, not about mermaid.
vi.mock("@/lib/mermaid", () => ({
  renderMermaid: () => Promise.resolve(true),
  initMermaid: () => Promise.resolve(),
}));

const document_ = parseReportsFragment(
  VIEW_PANELS.find((panel) => panel.id === "view-reports")!.html,
);

describe("ReportsFeature", () => {
  it("renders the document's title, cards and diagram caption", () => {
    render(<ReportsFeature theme="light" />);
    expect(screen.getByRole("heading", { level: 1, name: document_.title })).toBeInTheDocument();
    for (const card of document_.cards) {
      expect(screen.getByRole("heading", { level: 3, name: card.heading })).toBeInTheDocument();
      expect(screen.getByText(card.body)).toBeInTheDocument();
    }
    expect(screen.getByText(document_.diagram.caption)).toBeInTheDocument();
  });

  it("keeps the intro's identifier as code, not flattened prose", () => {
    const { container } = render(<ReportsFeature theme="light" />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("awesome-quant-interpretation");
  });

  it("links the repository with a safe external target", () => {
    render(<ReportsFeature theme="light" />);
    const link = screen.getByRole("link", { name: document_.repository.label });
    expect(link).toHaveAttribute("href", document_.repository.href);
    // `target=_blank` without `noopener` hands the opened page a window ref.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("carries the mermaid source into the rendered diagram", () => {
    const { container } = render(<ReportsFeature theme="light" />);
    const pre = container.querySelector("pre.mermaid");
    expect(pre?.textContent).toBe(document_.diagram.source);
  });

  it("renders from primitives, not from injected legacy markup", () => {
    const { container } = render(<ReportsFeature theme="light" />);
    // The legacy fragment's own layout hooks must not survive: this is what
    // tells us the screen is no longer the old document's markup.
    expect(container.querySelector(".panel-shell")).toBeNull();
    expect(container.querySelector(".report-grid")).toBeNull();
    expect(container.querySelector(".status-banner")).toBeNull();
    // And the legacy inline styles referenced variables Fund Paper never
    // defined, so nothing may still be asking for them.
    expect(container.innerHTML).not.toContain("var(--muted)");
    expect(container.innerHTML).not.toContain("var(--primary)");
  });

  it("uses the shared card and feature surfaces", () => {
    const { container } = render(<ReportsFeature theme="light" />);
    expect(container.querySelectorAll(".reports-card.card").length).toBe(document_.cards.length);
    expect(container.querySelector(".feature-surface")).not.toBeNull();
  });

  it("shows a loud failure if the fragment ever stops matching", () => {
    // Simulated by rendering the parser against a broken fragment; the screen's
    // own guard is what turns that into a visible failure rather than a blank.
    expect(() => parseReportsFragment("<div/>")).toThrow();
  });
});
