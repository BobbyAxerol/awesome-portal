/**
 * The command story reads its catalogue through the STRICT V2 reader (UXM-09, FIXTURE_LAB, jsdom).
 *
 * The switch from the lenient V1 reader must change nothing the operator sees: the same 64 + 8 + 6 disabled controls, the same reasons, the
 * same counts, in the same order. The proof is a comparison of the two reads, row by row and in markup. Nothing here sends or fetches.
 *
 * BE-P13: the story reads the SERVED catalogue. It differs from what V1 shows in exactly one row, `ops/emergency-close`, the accepted N16B
 * primitive: V1 reads its two new words as null and says "no reason was published"; the strict read says what the reason is. Every other row is
 * compared as before.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readCommandCatalogue } from "../../../adminCatalog";
import { catalogueOf } from "../../readers/commandCatalogue";
import { loadCanonical } from "../../testkit/loadCanonical";
import { fixtureCatalogue, fixtureCatalogueRead } from "./catalogueLane";
import { DisabledOperations } from "./DisabledOperations";
import { catalogueRows } from "./model";

type Draft = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BODY: Draft = loadCanonical("execution-command-catalog.served");
const N16B_ID = "ops/emergency-close";
const V1 = readCommandCatalogue(structuredClone(BODY))!;

afterEach(cleanup);

/** The markup with the generated ids replaced by their order of appearance (React's `useId` differs between two renders). */
function markup(catalogue: Parameters<typeof catalogueRows>[0] | null, omit?: string): string {
  const { container } = render(<MemoryRouter><DisabledOperations catalogue={catalogue} /></MemoryRouter>);
  if (omit !== undefined) container.querySelectorAll(`li[data-op="${omit}"]`).forEach((row) => row.remove());
  const ids = new Map<string, string>();
  const name = (id: string) => ids.get(id) ?? (ids.set(id, `id${ids.size}`), ids.get(id)!);
  const html = container.innerHTML
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${name(id)}"`)
    .replace(/aria-(describedby|labelledby)="([^"]+)"/g, (_m, attr: string, id: string) => `aria-${attr}="${name(id)}"`);
  cleanup();
  return html;
}

describe("catalogueLane · the strict reader feeds the story", () => {
  it("the published catalogue reads: 64 entries, the typed read says so", () => {
    const read = fixtureCatalogueRead();
    expect(read.kind).toBe("command_catalogue");
    expect(fixtureCatalogue()?.entries).toHaveLength(64);
  });

  it("each call is a fresh read: nothing a caller does reaches the next call", () => {
    const first = fixtureCatalogue()!;
    (first.entries as unknown as Draft[]).length = 0;
    expect(fixtureCatalogue()!.entries).toHaveLength(64);
  });

  it("the module does not use the lenient reader any more", () => {
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const source = strip(readFileSync(join(__dirname, "catalogueLane.ts"), "utf8"));
    expect(source).not.toMatch(/adminCatalog/);
    expect(source).not.toMatch(/readCommandCatalogue\b/);
    expect(source).toMatch(/readCommandCatalogueV2/);
  });
});

describe("catalogueLane · the page renders identically to the V1 read", () => {
  const strict = catalogueOf(BODY)!;

  const withoutN16B = (groups: ReturnType<typeof catalogueRows>) => groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.id !== N16B_ID) }));

  it("the disabled rows are equal row for row: same ids, labels, groups, tiers, reasons, capabilities and codes, in the same order (but for the N16B row)", () => {
    expect(withoutN16B(catalogueRows(strict))).toEqual(withoutN16B(catalogueRows(V1)));
    const rows = catalogueRows(strict).flatMap((g) => g.rows);
    expect(rows).toHaveLength(64);
    expect(rows.every((r) => r.reason.length > 20)).toBe(true);
    // Same position in the same group; only its words differ.
    expect(catalogueRows(strict).map((g) => g.rows.map((r) => r.id))).toEqual(catalogueRows(V1).map((g) => g.rows.map((r) => r.id)));
  });

  it("the N16B row says what it is: V1 reads its two new words as null and claims no reason was published, the strict read does not", () => {
    const row = (view: Parameters<typeof catalogueRows>[0]) => catalogueRows(view).flatMap((g) => g.rows).find((r) => r.id === N16B_ID)!;
    expect(row(V1)).toMatchObject({ code: null, reason: "This command is not available through the Portal, and no reason was published." });
    expect(row(strict)).toMatchObject({ code: "N16B_RUNTIME_ACTIVATION_PENDING", capability: { kind: "none_published" } });
    expect(row(strict).reason).toMatch(/not active/);
  });

  it("the markup of the whole disabled-operations section is the same string, but for the N16B row", () => {
    const strictHtml = markup(strict, N16B_ID);
    const v1Html = markup(V1, N16B_ID);
    expect(strictHtml).toBe(v1Html);
    expect(strictHtml.length).toBeGreaterThan(10_000);
    expect(markup(strict)).not.toBe(markup(V1));
  });

  it("78 disabled controls and the same summary sentence", () => {
    const { container } = render(<MemoryRouter><DisabledOperations catalogue={strict} /></MemoryRouter>);
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) => /^Send /.test(b.textContent ?? ""));
    expect(buttons).toHaveLength(64 + 8 + 6);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(container.querySelector('[data-summary="disabled"]')?.textContent).toBe(
      "64 catalogue commands, 8 capital operations and 6 families. None is sendable.",
    );
  });
});

describe("catalogueLane · what the strict read refuses never reaches the page", () => {
  it("a catalogue with one command claiming to be sendable is not read at all: the page says so and lists no catalogue command", () => {
    const claim = structuredClone(BODY);
    claim.entries[0].portal_reachable = true;
    expect(catalogueOf(claim)).toBeNull();
    const { container } = render(<MemoryRouter><DisabledOperations catalogue={catalogueOf(claim)} /></MemoryRouter>);
    expect(container.textContent).toContain("The command catalogue has not been read");
    expect(container.querySelectorAll('[data-op="account/policy"]')).toHaveLength(0);
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) => /^Send /.test(b.textContent ?? ""));
    expect(buttons).toHaveLength(8 + 6);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it("server-chosen identifier text is never copy: the reason on a row is the dictionary's, whatever the source reference says", () => {
    const probe = structuredClone(BODY);
    probe.entries[0].source_reference = "PROBE_SERVER_TEXT_AS_COPY";
    probe.entries[0].http_path = "/PROBE_SERVER_PATH";
    const read = catalogueOf(probe)!;
    const html = markup(read);
    expect(html).not.toContain("PROBE_SERVER_TEXT_AS_COPY");
    expect(html).not.toContain("PROBE_SERVER_PATH");
    expect(markup(read)).toBe(markup(catalogueOf(BODY)!));
  });
});
