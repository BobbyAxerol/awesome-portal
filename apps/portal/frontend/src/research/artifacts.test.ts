/**
 * P05 FE/consumer tests.
 *
 * The P05 handoff names five required tests; each has a block below. P05
 * publishes no DTO and no route, so these are harness tests over the frozen
 * state vocabulary — P10/P11 inherit them when the real DTO lands.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type ArtifactFacts,
  RESEARCH_ARTIFACT_STATES,
  artifactPanel,
  decimalRoundTrips,
  exactDecimal,
  exactUtcMillis,
  isBoundedWindow,
  isUtcMillis,
  mayExport,
  windowCaption,
} from "./artifacts";

function facts(overrides: Partial<ArtifactFacts> = {}): ArtifactFacts {
  return {
    state: "SEALED",
    registered: true,
    serverAdmittedExport: true,
    reason: null,
    ...overrides,
  };
}

describe("1 — same-origin DTO only; no direct path, data or engine request", () => {
  it("contains no network call and no storage locator", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "artifacts.ts"), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|EventSource|WebSocket/);
    expect(code).not.toMatch(/file:\/\/|\/var\/|\/srv\/|postgres|parquet|s3:\/\//i);
    expect(code).not.toMatch(/hmac|lease_epoch|worker_id|relation_cursor/i);
  });
});

describe("2 — every state keeps the panel and its exact label", () => {
  it("retains the panel for all five states", () => {
    for (const state of RESEARCH_ARTIFACT_STATES) {
      const panel = artifactPanel(facts({ state }));
      expect(panel.retainsPanel).toBe(true);
      expect(panel.label).toBe(state);
    }
  });

  it("uses the exact state word, never a friendlier synonym", () => {
    for (const state of RESEARCH_ARTIFACT_STATES) {
      expect(artifactPanel(facts({ state })).label).toBe(state);
    }
    // `READY` is not a P05 state and must not appear anywhere.
    expect(RESEARCH_ARTIFACT_STATES).not.toContain("READY" as never);
  });

  it("separates in-progress from integrity failure", () => {
    expect(artifactPanel(facts({ state: "WRITING" })).inProgress).toBe(true);
    expect(artifactPanel(facts({ state: "WRITING" })).integrityFailure).toBe(false);
    expect(artifactPanel(facts({ state: "CORRUPT" })).integrityFailure).toBe(true);
    expect(artifactPanel(facts({ state: "MISSING" })).integrityFailure).toBe(true);
    // Aborted is neither: the work stopped, the bytes are not claimed corrupt.
    expect(artifactPanel(facts({ state: "ABORTED" })).integrityFailure).toBe(false);
  });

  it("carries the server's reason and never invents one", () => {
    expect(artifactPanel(facts({ state: "ABORTED", reason: "Cancelled by owner." })).reason).toBe(
      "Cancelled by owner.",
    );
    expect(artifactPanel(facts({ state: "ABORTED" })).reason).toBeNull();
  });
});

describe("3 — export exists only for a server-admitted sealed artifact", () => {
  it("requires all three facts together", () => {
    expect(mayExport(facts())).toBe(true);
    expect(mayExport(facts({ registered: false }))).toBe(false);
    expect(mayExport(facts({ serverAdmittedExport: false }))).toBe(false);
    expect(mayExport(facts({ state: "WRITING" }))).toBe(false);
  });

  it("withholds export from a disk-sealed but unregistered candidate", () => {
    const panel = artifactPanel(facts({ registered: false }));
    expect(panel.showsExport).toBe(false);
    expect(panel.exportWithheldBecause).toMatch(/not registered/i);
  });

  it("shows no export for any state other than SEALED", () => {
    for (const state of RESEARCH_ARTIFACT_STATES) {
      const panel = artifactPanel(facts({ state }));
      if (state === "SEALED") {
        expect(panel.showsExport).toBe(true);
      } else {
        expect(panel.showsExport).toBe(false);
        expect(panel.exportWithheldBecause).toContain(state);
      }
    }
  });

  it("gives a withheld reason whenever the export is absent", () => {
    for (const state of RESEARCH_ARTIFACT_STATES) {
      for (const registered of [true, false]) {
        for (const serverAdmittedExport of [true, false]) {
          const panel = artifactPanel(facts({ state, registered, serverAdmittedExport }));
          if (!panel.showsExport) {
            expect(panel.exportWithheldBecause).not.toBeNull();
            expect(panel.exportWithheldBecause).not.toBe("");
          }
        }
      }
    }
  });
});

describe("4 — decimal, null and UTC round-trip without float conversion", () => {
  it("returns a decimal string byte-for-byte", () => {
    for (const value of ["0.1", "1234567890.123456789", "-0.000000001", "0.30000000000000004"]) {
      expect(exactDecimal(value)).toBe(value);
      expect(decimalRoundTrips(value)).toBe(true);
    }
  });

  it("proves a float path would have changed the value", () => {
    // The guard exists because this is what parsing would do.
    expect(String(Number("1234567890.123456789"))).not.toBe("1234567890.123456789");
    expect(exactDecimal("1234567890.123456789")).toBe("1234567890.123456789");
  });

  it("keeps null as null and never as zero or a dash", () => {
    expect(exactDecimal(null)).toBeNull();
    expect(exactDecimal(undefined)).toBeNull();
    expect(exactDecimal("")).toBeNull();
    expect(exactDecimal("   ")).toBeNull();
  });

  it("retains UTC milliseconds and rejects anything else rather than coercing", () => {
    expect(isUtcMillis("2026-09-19T00:00:00.000Z")).toBe(true);
    expect(exactUtcMillis("2026-09-19T00:00:00.000Z")).toBe("2026-09-19T00:00:00.000Z");
    // No milliseconds, a local offset, or an epoch number are all refused.
    expect(exactUtcMillis("2026-09-19T00:00:00Z")).toBeNull();
    expect(exactUtcMillis("2026-09-19T00:00:00.000+07:00")).toBeNull();
    expect(exactUtcMillis("1789836572369")).toBeNull();
    expect(exactUtcMillis(null)).toBeNull();
  });
});

describe("5 — row limits stay server-owned", () => {
  it("accepts a page smaller than the total", () => {
    expect(isBoundedWindow({ returnedRows: 50, totalRows: 10_000, nextCursor: "c1" })).toBe(true);
  });

  it("rejects a page claiming more rows than the artifact holds", () => {
    expect(isBoundedWindow({ returnedRows: 11, totalRows: 10, nextCursor: null })).toBe(false);
  });

  it("captions a capped list with both numbers, never the page size alone", () => {
    expect(windowCaption({ returnedRows: 50, totalRows: 10_000, nextCursor: "c" })).toBe(
      "50 of 10000 rows",
    );
    expect(windowCaption({ returnedRows: 10, totalRows: 10, nextCursor: null })).toBe("10 rows");
  });

  it("treats the cursor as opaque and never builds one", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "artifacts.ts"), "utf8");
    expect(source).not.toMatch(/atob|btoa|JSON\.parse\(.*cursor/i);
  });
});
