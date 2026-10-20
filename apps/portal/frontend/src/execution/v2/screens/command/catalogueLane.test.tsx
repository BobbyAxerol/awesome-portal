/**
 * The command story reads its catalogue through the STRICT V2 reader (UXM-09, FIXTURE_LAB, jsdom).
 *
 * The switch from the lenient V1 reader must change nothing the operator sees: the same 64 + 8 + 6 disabled controls, the same reasons, the
 * same counts, in the same order. The proof is a comparison of the two reads, row by row and in markup. Nothing here sends or fetches.
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
const BODY: Draft = loadCanonical("execution-command-catalog");
const V1 = readCommandCatalogue(structuredClone(BODY))!;

afterEach(cleanup);

/** The markup with the generated ids replaced by their order of appearance (React's `useId` differs between two renders). */
function markup(catalogue: Parameters<typeof catalogueRows>[0] | null): string {
  const { container } = render(<MemoryRouter><DisabledOperations catalogue={catalogue} /></MemoryRouter>);
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

  it("the disabled rows are equal row for row: same ids, labels, groups, tiers, reasons, capabilities and codes, in the same order", () => {
    expect(catalogueRows(strict)).toEqual(catalogueRows(V1));
    const rows = catalogueRows(strict).flatMap((g) => g.rows);
    expect(rows).toHaveLength(64);
    expect(rows.every((r) => r.reason.length > 20)).toBe(true);
  });

  it("the markup of the whole disabled-operations section is the same string", () => {
    const strictHtml = markup(strict);
    const v1Html = markup(V1);
    expect(strictHtml).toBe(v1Html);
    expect(strictHtml.length).toBeGreaterThan(10_000);
  });

  it("78 disabled controls and the same summary sentence", () => {
    const { container } = render(<MemoryRouter><DisabledOperations catalogue={strict} /></MemoryRouter>);
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) => /^Send /.test(b.textContent ?? ""));
    expect(buttons).toHaveLength(64 + 8 + 6);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(container.querySelector('[data-summary="disabled"]')?.textContent).toBe(
      "64 catalogue commands, 8 capital operations and 6 families. None is sendable: each control is disabled and says why.",
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
