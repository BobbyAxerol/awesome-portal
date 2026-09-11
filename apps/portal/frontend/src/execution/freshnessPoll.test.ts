import { describe, expect, it } from "vitest";
import { freshnessPollMs, MIN_POLL_MS, PROJECTION_POLL_MS } from "./useRevision";

/**
 * PHASE 7 (round 2) · the screen re-reads at the cadence the server declares.
 *
 * Measured on dev: five call sites polled at a hardcoded 15 s while every
 * projection envelope published `{ fresh: 30000, stale: 60000 }`. Half of each
 * screen's reads asked for a value the server had already said would not
 * change yet — the same answer, arriving twice.
 */
describe("polling cadence comes from the published budget", () => {
  it("uses the server's fresh window when it published one", () => {
    expect(freshnessPollMs({ freshMs: 30_000 })).toBe(30_000);
    expect(freshnessPollMs({ freshMs: 45_000 })).toBe(45_000);
  });

  it("falls back to our own cadence until the first envelope arrives", () => {
    // Not zero and not "never": a screen with no budget yet still has to
    // re-read, or it would sit on its first answer forever.
    expect(freshnessPollMs(null)).toBe(PROJECTION_POLL_MS);
    expect(freshnessPollMs(undefined)).toBe(PROJECTION_POLL_MS);
    expect(freshnessPollMs({ freshMs: Number.NaN })).toBe(PROJECTION_POLL_MS);
  });

  it("refuses a budget below the floor rather than obeying it", () => {
    // A contract value is not a licence. A mis-published 50 ms would turn one
    // screen into a load generator against the cell the local plane exists to
    // protect.
    expect(freshnessPollMs({ freshMs: 50 })).toBe(MIN_POLL_MS);
    expect(freshnessPollMs({ freshMs: 0 })).toBe(MIN_POLL_MS);
    expect(freshnessPollMs({ freshMs: -1 })).toBe(MIN_POLL_MS);
  });

  it("halves the read rate on dev's published budget", () => {
    // The measured win, stated as a number so a regression is visible.
    expect(PROJECTION_POLL_MS).toBe(15_000);
    expect(freshnessPollMs({ freshMs: 30_000 }) / PROJECTION_POLL_MS).toBe(2);
  });
});
