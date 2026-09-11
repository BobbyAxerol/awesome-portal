/**
 * PHASE 8 (round 2) · the passport reader, against what is actually published.
 *
 * The only passport test that existed built a `PassportEntry` by hand and
 * handed it straight to the screen, so the reader between the wire and the
 * screen was never exercised at all. It required a field named `value` that
 * appears in neither the published contract nor any server response, and the
 * Artifact passport panel had therefore been empty for every real approval
 * since the reader was written — a defect no green suite could have found,
 * because no test ever fed it a real shape.
 *
 * CLAUDE.md §7.8: if a canonical fixture exists, the test loads it rather than
 * copying it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { readPassportEntry } from "./api/rows";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../../../../../packages/contracts/fixtures/execution-governance.r2-review.valid.json"), "utf8"),
) as Record<string, unknown>;

function manifestEntries(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(manifestEntries);
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const m = o.evidence_manifest as Record<string, unknown> | undefined;
    if (m && Array.isArray(m.entries) && m.entries.length > 0) return m.entries as Record<string, unknown>[];
    return Object.values(o).flatMap(manifestEntries);
  }
  return [];
}

describe("the artifact passport reader reads what is published", () => {
  const entries = manifestEntries(fixture);

  it("finds an entry in the canonical fixture at all", () => {
    // A scan that finds nothing is not a pass: if the fixture ever loses its
    // entry this test must fail loudly rather than assert over an empty list.
    expect(entries.length).toBeGreaterThan(0);
  });

  it("reads every canonical fixture entry, using the digest as the value", () => {
    for (const raw of entries) {
      const entry = readPassportEntry(raw);
      expect(entry, `dropped ${JSON.stringify(raw).slice(0, 80)}`).not.toBeNull();
      expect(entry?.label).toBe(raw.label);
      expect(entry?.value).toBe(raw.sha256);
    }
  });

  /* The exact payload the running control-api returned for approval
     apr_06G6ANQZ032XWF1SF63024XJP1 on probe, 2026-09-11 — trimmed, not
     invented. This is the shape that was being dropped. */
  const LIVE = {
    evidence_id: "ev_06G6ANQZ036X846N5WW61RX245",
    ordinal: 0,
    kind: "ALPHA_ARTIFACT",
    label: "Pinned research artifact",
    display_value: "d734e2c443d14a92",
    note: "R1 gate entry for delta-rsi-polynomial-alpha on the completed three_window_decay run d734e2c443d14a92.",
    verification: "SERVER_PINNED",
    artifact_id: "d734e2c443d14a92",
    sha256: "sha256:c652df982779b390083d2787147ffbea8926dd3723e2af8689da543a46863a48",
    source_authority: "RESEARCH",
    captured_at: "2026-09-03T03:36:35.324Z",
  };

  it("prefers the server's own display value over the digest", () => {
    const entry = readPassportEntry(LIVE);
    expect(entry).not.toBeNull();
    expect(entry?.value).toBe("d734e2c443d14a92");
    expect(entry?.verification).toBe("SERVER_PINNED");
    expect(entry?.note).toContain("three_window_decay");
  });

  it("still drops an entry with no label and no value of any spelling", () => {
    expect(readPassportEntry({ evidence_id: "ev-1", ordinal: 0 })).toBeNull();
    expect(readPassportEntry({ label: "artifact" })).toBeNull();
    expect(readPassportEntry("not an object")).toBeNull();
  });
});
