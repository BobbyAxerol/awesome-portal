/**
 * The command catalogue of the fixture story (UXM-09, FIXTURE ONLY): the SERVED example (`execution-command-catalog.served.valid.json`, BE-P13: the
 * 200 body of the route, with `classification` on every entry and the N16B branch on `ops/emergency-close`; the pinned extract
 * `execution-command-catalog.valid.json` is evidence of the N16B acceptance record and is not read here) read
 * from the contracts package verbatim, through the STRICT V2 reader (`readers/commandCatalogue.ts`), the same reader a real response would use.
 *
 * Same reason as the slice's lane (`slice/canonicalLane.ts`): one source, so the story cannot drift from what Codex published, and a
 * change in the published shape makes the reader refuse it (the story then says the catalogue has not been read) instead of showing a
 * stale copy or a half-read one. The V1 reader (`adminCatalog.readCommandCatalogue`) is no longer used here: it dropped what it could not
 * read and defaulted the rest, which a "64 commands, each with its exact reason" page cannot afford. This is the ONLY command module that
 * imports the contracts JSON; it is reached only from the flag-gated lazy chunk. Nothing here fetches, polls or sends.
 */
import catalogue from "../../../../../../../../packages/contracts/fixtures/execution-command-catalog.served.valid.json";
import { readCommandCatalogueV2, type CommandCatalogueRead, type CommandCatalogueV2 } from "../../readers/commandCatalogue";

/** The typed read of the published catalogue: the catalogue, or the reason it was refused. A fresh copy each call. */
export function fixtureCatalogueRead(): CommandCatalogueRead {
  return readCommandCatalogueV2(structuredClone(catalogue));
}

/** The published catalogue through the strict reader, or `null` when the published body no longer reads. */
export function fixtureCatalogue(): CommandCatalogueV2 | null {
  const read = fixtureCatalogueRead();
  return read.kind === "command_catalogue" ? read.catalogue : null;
}
