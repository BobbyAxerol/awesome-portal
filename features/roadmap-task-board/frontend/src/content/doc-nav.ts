/**
 * Small navigation projection generated from the integrity manifest.
 *
 * Keeping this separate from `pages/index.ts` lets the shell render document
 * navigation without eagerly downloading every byte-preserved HTML fragment.
 * The manifest remains the contract source, so IDs/titles cannot drift from
 * the golden inventory without failing the existing integrity gate.
 */
import manifest from "./content-integrity-manifest.json";

interface ManifestPage {
  data_page_id: string;
  data_title: string;
}

export const DOC_NAV = (manifest.doc_pages as ManifestPage[]).map((page) => ({
  id: page.data_page_id,
  title: page.data_title,
}));
