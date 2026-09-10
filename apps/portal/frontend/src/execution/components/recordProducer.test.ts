import { describe, expect, it } from "vitest";
import { absenceReason, producerSentence, RECORD_PRODUCERS, type RecordKind } from "./recordProducer";

/**
 * PHASE 5 (round 2) · the difference between "nobody has done it" and
 * "nothing can do it" is the whole value of these sentences.
 *
 * Ten screens 404 on dev and each one matched an empty table. Three of those
 * tables have an operator route that writes them; one — paper exit reviews —
 * has no writer in the service code, the migrations or the Rust cells, which
 * is why the Paper-exit decision flow cannot be started at all. A reader who
 * cannot tell those apart will wait for data that is never coming.
 */
describe("what an absent record says about itself", () => {
  const kinds = Object.keys(RECORD_PRODUCERS) as RecordKind[];

  it("names a producer for every record kind a screen can be missing", () => {
    expect(kinds).toEqual(["incident", "sandbox-certification", "canary-envelope", "paper-exit-review"]);
    for (const kind of kinds) {
      const sentence = producerSentence(kind);
      expect(sentence.length).toBeGreaterThan(30);
      expect(sentence.trim()).toBe(sentence);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });

  it("says outright that nothing writes an exit review, rather than implying someone will", () => {
    expect(RECORD_PRODUCERS["paper-exit-review"].kind).toBe("UNBUILT");
    const sentence = producerSentence("paper-exit-review");
    expect(sentence).toMatch(/nothing in the platform writes one/);
    // The three operator-created kinds must NOT borrow that wording: saying a
    // record is unbuilt when an operator could create it today is its own lie.
    for (const kind of kinds.filter((item) => item !== "paper-exit-review")) {
      expect(RECORD_PRODUCERS[kind].kind).toBe("OPERATOR");
      expect(producerSentence(kind)).not.toMatch(/nothing in the platform writes/);
      expect(producerSentence(kind)).toMatch(/by an operator/);
    }
  });

  it("keeps the contract's own code first, because that is what gets quoted", () => {
    expect(absenceReason("INCIDENT_NOT_FOUND: Incident not found.", "incident"))
      .toBe(`INCIDENT_NOT_FOUND: Incident not found. ${producerSentence("incident")}`);
  });

  it("does not leave a dangling space when no code was published", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(absenceReason(value, "incident")).toBe(producerSentence("incident"));
    }
  });
});

/**
 * The browser caught this one after 2,166 tests were green: the sentence was
 * appended to the screen's reason line AND to all five of its empty panels, so
 * one incident screen carried it six times and every panel grew a line taller.
 * A screen says it once, where the reader is already looking for why.
 */
describe("said once, not once per panel", () => {
  it("keeps the sentence to a length a header line can carry", () => {
    for (const kind of Object.keys(RECORD_PRODUCERS) as RecordKind[]) {
      expect(producerSentence(kind).length).toBeLessThanOrEqual(180);
    }
  });
});
