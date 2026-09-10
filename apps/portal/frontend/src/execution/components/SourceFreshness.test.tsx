/**
 * PHASE 3C (round 2) · what a header is allowed to claim.
 *
 * Two rules, both learned the hard way. An age nobody could compute is not a
 * fresh one — five screen headers used to render every non-FRESH tier with the
 * same warn tone, so "no timestamp was published" looked exactly like "a bit
 * old". And a future instant is not fresh either: it means the clocks disagree,
 * and claiming freshness from it is worse than admitting the age is unknown.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourceFreshness, normaliseTier } from "./SourceFreshness";
import { ageFrom, ageLabel } from "./FreshnessBanner";

afterEach(cleanup);

const NOW = Date.parse("2026-09-10T12:00:00.000Z");

describe("the tier a header shows", () => {
  it("treats the vocabularies that mean fresh as fresh", () => {
    expect(normaliseTier("FRESH")).toBe("FRESH");
    expect(normaliseTier("OK")).toBe("FRESH");
  });

  it("never turns something it does not recognise into FRESH", () => {
    for (const value of [null, undefined, "", "PROBABLY_FINE", "READY_ISH"]) {
      expect(normaliseTier(value), String(value)).toBe("UNKNOWN");
    }
  });

  it("keeps the four tiers apart", () => {
    expect(normaliseTier("AGING")).toBe("AGING");
    expect(normaliseTier("STALE")).toBe("STALE");
    expect(normaliseTier("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("the age a header shows", () => {
  it("says the age was not published rather than guessing zero", () => {
    expect(ageLabel(null)).toBe("age not published");
    expect(ageLabel(Number.NaN)).toBe("age not published");
    expect(ageLabel(-1)).toBe("age not published");
  });

  it("refuses to derive an age from an instant in the future", () => {
    // Clock disagreement, not freshness.
    expect(ageFrom(NOW + 60_000, NOW)).toBeNull();
    expect(ageFrom(NOW - 60_000, NOW)).toBe(60_000);
  });

  it("counts in units a reader can act on", () => {
    expect(ageLabel(5_000)).toBe("5s ago");
    expect(ageLabel(5 * 60_000)).toBe("5m ago");
    expect(ageLabel(3 * 3_600_000 + 4 * 60_000)).toBe("3h 4m ago");
    expect(ageLabel(2 * 86_400_000 + 3 * 3_600_000)).toBe("2d 3h ago");
  });
});

describe("the header itself", () => {
  it("renders the tier and the age together, because one without the other says little", () => {
    render(<SourceFreshness label="BROKER" freshness="STALE"
      sourceAsOf="2026-09-10T10:00:00.000Z" nowMs={NOW} />);
    expect(screen.getByText("STALE")).toBeTruthy();
    expect(screen.getByText("2h 0m ago")).toBeTruthy();
  });

  it("says the age is not published when the source published no instant", () => {
    render(<SourceFreshness label="BROKER" freshness={null} sourceAsOf={null} nowMs={NOW} />);
    expect(screen.getByText("UNKNOWN")).toBeTruthy();
    expect(screen.getByText("age not published")).toBeTruthy();
  });
});
