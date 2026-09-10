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
import { budgetTitle, SourceFreshness, normaliseTier } from "./SourceFreshness";
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

/**
 * PHASE 3 (round 2) · the age on screen has to be the age the tier came from.
 *
 * On dev the bindings header read "FRESH · 54s ago" against a 30-second fresh
 * budget. Neither half was a bug on its own: the tier came from our projection
 * refresh, the age from `source_as_of`, and the two clocks were 40 seconds
 * apart. Together they were unreadable — a reader who does the subtraction
 * gets a different tier than the one printed beside it.
 */
describe("the age belongs to the tier, not to a second clock", () => {
  const REFRESHED = "2026-09-10T11:59:48.000Z"; // 12s before NOW
  const PUBLISHED = "2026-09-10T11:59:06.000Z"; // 54s before NOW

  it("counts from the instant the tier was computed from", () => {
    render(<SourceFreshness label="BROKER" freshness="FRESH"
      sourceAsOf={PUBLISHED} tierBasisAsOf={REFRESHED} nowMs={NOW} />);
    expect(screen.getByText("12s ago")).toBeTruthy();
    expect(screen.queryByText("54s ago")).toBeNull();
  });

  it("still shows what the source published, so neither instant is hidden", () => {
    render(<SourceFreshness label="BROKER" freshness="FRESH"
      sourceAsOf={PUBLISHED} tierBasisAsOf={REFRESHED} nowMs={NOW} />);
    expect(screen.getByText(/source 2026-09-10 11:59:06 UTC/)).toBeTruthy();
    expect(screen.getByText("12s ago").getAttribute("title"))
      .toBe(`projection refreshed ${REFRESHED} · source published ${PUBLISHED}`);
  });

  it("falls back to the published instant when no basis came over the wire", () => {
    // An older contract carries no `projection_refreshed_at`. Showing nothing
    // would be worse than showing the only instant we were given.
    render(<SourceFreshness label="BROKER" freshness="AGING"
      sourceAsOf={PUBLISHED} tierBasisAsOf={null} nowMs={NOW} />);
    expect(screen.getByText("54s ago")).toBeTruthy();
  });

  it("says the age is not published when the basis is absent and so is the stamp", () => {
    render(<SourceFreshness label="BROKER" freshness="FRESH"
      sourceAsOf={null} tierBasisAsOf={null} nowMs={NOW} />);
    expect(screen.getByText("age not published")).toBeTruthy();
  });
});

/**
 * The word without the policy is still an assertion the reader has to trust.
 * "FRESH · 12s ago" only means something once the header says what FRESH is.
 */
describe("the chip carries the policy behind the word", () => {
  it("states both thresholds, because AGING is the gap between them", () => {
    expect(budgetTitle("Within the declared refresh cadence.", { freshMs: 30_000, staleMs: 60_000 }))
      .toBe("Within the declared refresh cadence. FRESH under 30s, STALE past 60s.");
  });

  it("says nothing about a budget the server did not publish", () => {
    const base = "Within the declared refresh cadence.";
    expect(budgetTitle(base, null)).toBe(base);
    expect(budgetTitle(base, undefined)).toBe(base);
  });

  it("puts the budget on the chip a reader hovers, not somewhere else", () => {
    render(<SourceFreshness label="BROKER" freshness="FRESH"
      sourceAsOf="2026-09-10T11:59:06.000Z" tierBasisAsOf="2026-09-10T11:59:48.000Z"
      freshnessBudgetMs={{ freshMs: 30_000, staleMs: 60_000 }} nowMs={NOW} />);
    expect(screen.getByText("FRESH").getAttribute("title"))
      .toContain("FRESH under 30s, STALE past 60s.");
  });
});
