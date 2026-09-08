/**
 * Colour is a second channel on the word, and the dot is a claim about the
 * stream. Both must refuse to say more than they know.
 */
import { describe, expect, it } from "vitest";

import { liveDot, severityTone, sourceTone, worstPhase } from "./sourceTone";

describe("a state word's tone", () => {
  it("colours the words the surface has decided on", () => {
    expect(sourceTone("ACTIVE")).toBe("good");
    expect(sourceTone("HALTED")).toBe("bad");
    expect(sourceTone("PAUSED")).toBe("warn");
    expect(sourceTone("NOT_COMMISSIONED")).toBe("mute");
  });

  it("reads the source's spelling, not a canonical one", () => {
    expect(sourceTone("active")).toBe("good");
    expect(sourceTone(" risk-rejected ")).toBe("bad");
  });

  it("draws an unknown word plain rather than assuming it is healthy", () => {
    // The failure this prevents: a new state the surface has never seen being
    // coloured green because it is not on the bad list.
    expect(sourceTone("QUIESCING")).toBeNull();
    expect(sourceTone(null)).toBeNull();
    expect(sourceTone("")).toBeNull();
  });

  it("takes severity as the source grades it", () => {
    expect(severityTone("CRITICAL")).toBe("bad");
    expect(severityTone("WARNING")).toBe("warn");
    expect(severityTone("INFO")).toBe("mute");
    expect(severityTone("SEV3")).toBeNull();
  });
});

describe("the masthead's live dot", () => {
  it("pulses only while the stream is delivering", () => {
    expect(liveDot("live").live).toBe(true);
    for (const phase of ["connecting", "recovering", "closed", "auth_expired", null, undefined]) {
      expect(liveDot(phase as string).live, String(phase)).toBe(false);
    }
  });

  it("says what it means, so a pulsing dot is not decoration", () => {
    expect(liveDot("live").title).toMatch(/delivering/);
    expect(liveDot("closed").title).toMatch(/will not update/);
    expect(liveDot("auth_expired").title).toMatch(/[Ss]ign in again/);
  });

  it("tones a dead stream badly rather than leaving it green", () => {
    expect(liveDot("closed").tone).toBe("bad");
    expect(liveDot("recovering").tone).toBe("warn");
    expect(liveDot(undefined).tone).toBe("mute");
  });
});

describe("a screen that reads more than one projection", () => {
  it("takes the worst phase, so one healthy stream cannot hide a dead one", () => {
    expect(worstPhase(["live", "live", "closed"])).toBe("closed");
    expect(worstPhase(["live", "recovering", "live"])).toBe("recovering");
    expect(worstPhase(["live", "live", "live"])).toBe("live");
    expect(liveDot(worstPhase(["live", "live", "closed"])).live).toBe(false);
  });

  it("ignores absent members rather than counting them as healthy", () => {
    expect(worstPhase([null, undefined, "live"])).toBe("live");
    expect(worstPhase([null, undefined])).toBeNull();
  });
});
