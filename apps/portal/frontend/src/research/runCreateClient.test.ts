/**
 * FG-08 (A2b): a failed run create carries a fixed client sentence per
 * contract code. The server's `error.message` stays on the object for
 * diagnostics only; the sentence the "run" panel prints never comes from it.
 */
import { describe, expect, it } from "vitest";

import { PortalApiError } from "../lib/api";
import {
  RUN_CREATE_NOT_AVAILABLE_COPY,
  RUN_CREATE_PROBLEM_CODES,
  RUN_CREATE_REFUSAL_GENERIC_COPY,
  RUN_CREATE_TRANSPORT_COPY,
  RUN_CREATE_UNCODED_COPY,
  outcomeIsUnknown,
  runCreateRefusalFacts,
  toRunCreateRefusal,
} from "./runCreateClient";

const SENTINEL = "zq_SERVER_PROSE_SENTINEL alice@example.invalid";
const refused = (status: number, code: string | null, requestId: string | null = "req_1") =>
  toRunCreateRefusal(new PortalApiError(SENTINEL, status, code, requestId));

describe("FG-08 — run create refusal copy is client-owned", () => {
  it("gives every contract code a fixed sentence that is not the server message", () => {
    expect(RUN_CREATE_PROBLEM_CODES).toHaveLength(13);
    for (const code of RUN_CREATE_PROBLEM_CODES) {
      const refusal = refused(400, code);
      expect(refusal.copy, code).toMatch(/\S/);
      expect(refusal.copy, code).not.toContain(SENTINEL);
      expect(refusal.copy, code).not.toBe(RUN_CREATE_REFUSAL_GENERIC_COPY);
    }
  });

  it("keeps the server message on the object for diagnostics without using it as copy", () => {
    const refusal = refused(409, "RESEARCH_RUN_PREFLIGHT_STALE");
    expect(refusal.message).toBe(SENTINEL);
    expect(refusal.copy).not.toContain(SENTINEL);
    expect(refusal).toMatchObject({ code: "RESEARCH_RUN_PREFLIGHT_STALE", requestId: "req_1", invalidatesPreflight: true });
  });

  it("reads a coded 403 and a coded 404 as the same neutral denial", () => {
    const forbidden = refused(403, "RESEARCH_RUN_CREATE_FORBIDDEN");
    const notFound = refused(404, "RESEARCH_RUN_NOT_FOUND");
    expect(forbidden.copy).toBe(RUN_CREATE_NOT_AVAILABLE_COPY);
    expect(notFound.copy).toBe(forbidden.copy);
    expect(notFound.state).toBe("denied");
    expect(forbidden.state).toBe("denied");
    expect(notFound.mayRetry).toBe(forbidden.mayRetry);
  });

  it("reads an uncoded 403 and an uncoded 404 the same, without claiming the run was not created", () => {
    const forbidden = refused(403, null);
    const notFound = refused(404, null);
    expect(forbidden.copy).toBe(RUN_CREATE_UNCODED_COPY);
    expect(notFound.copy).toBe(forbidden.copy);
    expect(notFound.state).toBe(forbidden.state);
    expect(outcomeIsUnknown(forbidden)).toBe(true);
  });

  it("uses the generic sentence for a code this client does not know", () => {
    expect(refused(422, "RESEARCH_RUN_SOMETHING_NEW").copy).toBe(RUN_CREATE_REFUSAL_GENERIC_COPY);
    expect(refused(503, "RESEARCH_RUN_SOMETHING_NEW").copy).toBe(RUN_CREATE_REFUSAL_GENERIC_COPY);
  });

  it("says the outcome is not known for a transport failure", () => {
    const refusal = toRunCreateRefusal(new TypeError("Failed to fetch"));
    expect(refusal.copy).toBe(RUN_CREATE_TRANSPORT_COPY);
    expect(refusal.code).toBeNull();
    expect(outcomeIsUnknown(refusal)).toBe(true);
  });

  it("builds the typed facts from the code and the request id only", () => {
    expect(runCreateRefusalFacts(refused(503, "RESEARCH_RUN_PRODUCER_UNAVAILABLE"))).toBe(
      "RESEARCH_RUN_PRODUCER_UNAVAILABLE · request req_1",
    );
    expect(runCreateRefusalFacts(refused(503, "RESEARCH_RUN_PRODUCER_UNAVAILABLE", null))).toBe(
      "RESEARCH_RUN_PRODUCER_UNAVAILABLE",
    );
    expect(runCreateRefusalFacts(refused(502, null, null))).toBeNull();
  });
});
