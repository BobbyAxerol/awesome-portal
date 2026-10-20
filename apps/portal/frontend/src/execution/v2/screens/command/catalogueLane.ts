/**
 * The command catalogue of the fixture story (UXM-09, FIXTURE ONLY): the published example
 * (`execution-command-catalog.valid.json`) read from the contracts package verbatim, through the same reader a real response would use.
 *
 * Same reason as the slice's lane (`slice/canonicalLane.ts`): one source, so the story cannot drift from what Codex published, and a
 * change in the published shape makes the reader refuse it (the story then says the catalogue has not been read) instead of showing a
 * stale copy. This is the ONLY command module that imports the contracts JSON; it is reached only from the flag-gated lazy chunk.
 * Nothing here fetches, polls or sends.
 */
import catalogue from "../../../../../../../../packages/contracts/fixtures/execution-command-catalog.valid.json";
import { readCommandCatalogue, type CommandCatalogue } from "../../../adminCatalog";

/** The published catalogue through the reader, or `null` when the published body no longer reads. A fresh copy each call. */
export function fixtureCatalogue(): CommandCatalogue | null {
  return readCommandCatalogue(structuredClone(catalogue));
}
