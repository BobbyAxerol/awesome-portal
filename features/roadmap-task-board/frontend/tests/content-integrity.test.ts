import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { DOC_PAGES } from "../src/content/pages/index";
import { DOC_NAV } from "../src/content/doc-nav";
import manifest from "../src/content/content-integrity-manifest.json";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("content integrity", () => {
  it("exposes exactly the doc pages recorded in the manifest", () => {
    expect(DOC_PAGES.length).toBe(manifest.doc_pages.length);
  });

  it("keeps the lightweight shell navigation aligned to the golden inventory", () => {
    expect(DOC_NAV).toEqual(manifest.doc_pages.map((page: { data_page_id: string; data_title: string }) => ({
      id: page.data_page_id,
      title: page.data_title,
    })));
  });

  it("every page hash matches the golden baseline", () => {
    const stored = new Map(
      manifest.doc_pages.map((p: { data_page_id: string; sha256_markup: string }) => [
        p.data_page_id,
        p.sha256_markup,
      ]),
    );
    for (const page of DOC_PAGES) {
      expect(stored.get(page.id), page.id).toBe(page.sha256);
      expect(sha256(page.html), page.id).toBe(page.sha256);
    }
  });
});
