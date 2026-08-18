import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DOC_PAGES } from "../src/content/pages/index";
import { DocsFeature } from "../src/features/docs/DocsFeature";
import manifest from "../src/content/content-integrity-manifest.json";

/**
 * Reaching the document, not the document itself.
 *
 * `content-integrity.test.ts` already proves all sixteen sections are present
 * and byte-identical to the legacy HTML. What was broken was access: navigation
 * lived in the standalone app's sidebar, which the Portal shell does not render,
 * so an embedded reader could open the first section and no other — a fully
 * migrated document, fifteen sixteenths of it unreachable.
 */
function renderDocs(pageId: string | null = null) {
  const onNavigate = vi.fn();
  const view = render(<DocsFeature pageId={pageId} theme="light" onNavigate={onNavigate} />);
  return { ...view, onNavigate };
}

describe("DocsFeature navigation", () => {
  it("offers every section of the manifest without help from a host sidebar", () => {
    renderDocs();
    const select = screen.getByLabelText("Section") as HTMLSelectElement;
    expect(select.options).toHaveLength(manifest.doc_pages.length);
    // The picker is inside the feature, so it exists in both hosts.
    expect(select.options[manifest.doc_pages.length - 1].value).toBe(
      DOC_PAGES[DOC_PAGES.length - 1].id,
    );
  });

  it("states where the reader is in the document", () => {
    renderDocs(DOC_PAGES[2].id);
    expect(screen.getByText(`3 / ${DOC_PAGES.length}`)).toBeInTheDocument();
  });

  it("moves to the adjacent section from the pager", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderDocs(DOC_PAGES[1].id);
    const pager = screen.getByRole("navigation", { name: "Adjacent sections" });
    await user.click(within(pager).getByText(DOC_PAGES[2].title));
    expect(onNavigate).toHaveBeenCalledWith("docs", DOC_PAGES[2].id);
  });

  it("offers no previous on the first section and no next on the last", () => {
    const first = renderDocs(DOC_PAGES[0].id);
    expect(
      within(screen.getByRole("navigation", { name: "Adjacent sections" })).queryByText("Previous"),
    ).toBeNull();
    first.unmount();

    renderDocs(DOC_PAGES[DOC_PAGES.length - 1].id);
    expect(
      within(screen.getByRole("navigation", { name: "Adjacent sections" })).queryByText("Next"),
    ).toBeNull();
  });
});

describe("DocsFeature reading modes", () => {
  it("renders one section by default", () => {
    renderDocs(DOC_PAGES[0].id);
    expect(screen.getByTestId(`doc-page-${DOC_PAGES[0].id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`doc-section-${DOC_PAGES[1].id}`)).toBeNull();
  });

  it("renders the whole document in continuous mode", async () => {
    const user = userEvent.setup();
    renderDocs(DOC_PAGES[0].id);
    await user.click(screen.getByRole("button", { name: "Whole document" }));
    for (const page of DOC_PAGES) {
      expect(screen.getByTestId(`doc-section-${page.id}`)).toBeInTheDocument();
    }
  });

  it("widens the contents rail to the whole document in continuous mode", async () => {
    const user = userEvent.setup();
    const { container } = renderDocs(DOC_PAGES[0].id);
    const rail = () => container.querySelector('aside[aria-label="Table of contents"]')!;
    const sectionEntries = rail().querySelectorAll(".toc-item").length;

    await user.click(screen.getByRole("button", { name: "Whole document" }));
    expect(rail().querySelector(".mono-label")?.textContent).toBe("Contents");
    // A contents list for sixteen sections must be larger than one section's.
    expect(rail().querySelectorAll(".toc-item").length).toBeGreaterThan(sectionEntries);
  });

  it("lists only headings that can actually be scrolled to", () => {
    // A contents entry whose target does not exist does nothing when clicked,
    // which is worse than an absent entry: it reads as a broken document.
    const { container } = renderDocs(DOC_PAGES[0].id);
    const entries = [...container.querySelectorAll(".toc-item")];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const target = entry.getAttribute("data-target");
      expect(target).toBeTruthy();
      expect(container.querySelector(`.doc-article #${CSS.escape(target!)}`)).toBeTruthy();
    }
  });
});
