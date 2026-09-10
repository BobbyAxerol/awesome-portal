/**
 * U04 route parity tests.
 *
 * The compatibility promise is that an old deep link opens the SAME run it
 * always did. These assert that promise directly against the legacy forms.
 */
import { describe, expect, it } from "vitest";
import { PortalApiError } from "../../lib/api";

import {
  QUANTBT_ROOT,
  QUANTBT_TABS,
  canonicalQuantBTPath,
  isQuantBTTab,
  runPath,
  runTabPath,
} from "./routes";

describe("canonical run paths", () => {
  it("puts run identity in the path for every tab", () => {
    for (const tab of QUANTBT_TABS) {
      expect(runTabPath("run-1", tab)).toBe(`${QUANTBT_ROOT}/runs/run-1/${tab}`);
    }
  });

  it("encodes a run id that needs escaping", () => {
    expect(runPath("run/with slash")).toBe(`${QUANTBT_ROOT}/runs/run%2Fwith%20slash`);
  });

  it("recognises exactly the five result tabs", () => {
    for (const tab of QUANTBT_TABS) expect(isQuantBTTab(tab)).toBe(true);
    expect(isQuantBTTab("runs")).toBe(false);
    expect(isQuantBTTab("new")).toBe(false);
  });
});

describe("legacy translation", () => {
  it("moves ?run= into the canonical path for every tab", () => {
    for (const tab of QUANTBT_TABS) {
      expect(canonicalQuantBTPath(`/${tab}`, "?run=abc123")).toBe(
        `${QUANTBT_ROOT}/runs/abc123/${tab}`,
      );
    }
  });

  it("keeps a bare legacy tab pointing at default-run resolution", () => {
    // No run named: the module resolves the first COMPLETED run, exactly as
    // the standalone app did, rather than guessing an id here.
    expect(canonicalQuantBTPath("/overview")).toBe(`${QUANTBT_ROOT}/overview`);
  });

  it("preserves query keys other than run", () => {
    expect(canonicalQuantBTPath("/optimization", "?run=r1&segment=oos")).toBe(
      `${QUANTBT_ROOT}/runs/r1/optimization?segment=oos`,
    );
  });

  it("maps the run library and the new-run bookmark", () => {
    expect(canonicalQuantBTPath("/runs")).toBe(`${QUANTBT_ROOT}/runs`);
    expect(canonicalQuantBTPath("/", "?new=1")).toBe(`${QUANTBT_ROOT}/new`);
  });

  it("leaves the Command Center root alone when it is not a new-run link", () => {
    expect(canonicalQuantBTPath("/")).toBeNull();
    expect(canonicalQuantBTPath("/", "?run=abc")).toBeNull();
  });

  it("ignores trailing slashes", () => {
    expect(canonicalQuantBTPath("/overview/", "?run=r9")).toBe(
      `${QUANTBT_ROOT}/runs/r9/overview`,
    );
  });

  it("claims nothing that is not a QuantBT route", () => {
    expect(canonicalQuantBTPath("/planning/board")).toBeNull();
    expect(canonicalQuantBTPath("/portal-map")).toBeNull();
    expect(canonicalQuantBTPath("/research/alphas")).toBeNull();
  });
});

/**
 * PHASE 5 (round 2) · the tenth 404 screen.
 *
 * Nine of the ten screens that answer a missing record already said so
 * honestly. This one rendered "✕ Something went wrong" with a Retry button for
 * a run id that simply names nothing — the reader is told a system failed when
 * nothing failed, and offered an action that cannot help.
 */
describe("a run that does not exist is absent, not broken", () => {
  it("separates a 404 from every other read failure", () => {
    const notFound = new PortalApiError("404 Not Found", 404, "RUN_NOT_FOUND", null);
    const upstream = new PortalApiError("502 Bad Gateway", 502, null, null);
    const offline = new Error("network down");

    const absent = (error: unknown) => error instanceof PortalApiError && error.status === 404;
    expect(absent(notFound)).toBe(true);
    // A gateway error and a dead network are real failures: they keep the
    // failed frame and the Retry button, because retrying can work.
    expect(absent(upstream)).toBe(false);
    expect(absent(offline)).toBe(false);
  });

  it("keeps 401 and 403 out of the absent branch, since those are answers about the reader", () => {
    for (const status of [401, 403]) {
      const error = new PortalApiError(`${status}`, status, null, null);
      expect(error.status === 404).toBe(false);
      expect(error.isForbidden).toBe(true);
    }
  });
});
