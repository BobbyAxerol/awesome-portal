/**
 * P03 FE/consumer tests.
 *
 * P03 lists four frontend checks: loading/conflict/forbidden mapping,
 * auth-switch cache clearing, session recovery through existing flows, and no
 * leaked object metadata or `null → 0`. Each has a block below.
 *
 * These run against the canonical fixtures rather than hand-built objects, so a
 * change to the agreed envelope fails here instead of passing quietly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPONENT_STATES } from "../lib/portalState";
import {
  ADMISSION_SATURATED,
  ALL_FIXTURES,
  DRAFT_REVISION_CONFLICT,
  FOREIGN_OBJECT_DENIED,
  OWN_SCOPE_EMPTY,
  REFUSAL_FIXTURES,
} from "./fixtures";
import {
  RESEARCH_REFUSAL_CODES,
  researchNumber,
  researchState,
  toPresentationMeta,
} from "./state";
import { belongsToScope, researchKeys } from "./queryKeys";

describe("loading, conflict and forbidden mapping", () => {
  it("separates a first load from a refresh over existing content", () => {
    const first = researchState({ kind: "in-flight", hasAcceptedResponse: false });
    const refresh = researchState({ kind: "in-flight", hasAcceptedResponse: true });

    expect(first.state).toBe("loading");
    expect(first.retainsContent).toBe(false);
    // A refresh must not blank a populated panel; that is the flicker the
    // hi-fi composition rule forbids.
    expect(refresh.state).toBe("stale");
    expect(refresh.retainsContent).toBe(true);
  });

  it("maps every frozen refusal code to a distinct, non-empty outcome", () => {
    const seen = RESEARCH_REFUSAL_CODES.map((code) => researchState({ kind: "refusal", code }));
    for (const resolved of seen) {
      expect(resolved.reason).not.toBe("");
      expect(COMPONENT_STATES).toContain(resolved.state);
    }
    expect(new Set(seen.map((s) => s.state)).size).toBe(RESEARCH_REFUSAL_CODES.length);
  });

  it("stops retrying on denial and keeps retrying on saturation", () => {
    expect(researchState({ kind: "refusal", code: "RESEARCH_WORKSPACE_FORBIDDEN" }).mayRetry).toBe(
      false,
    );
    expect(researchState({ kind: "transport", status: 403, retryable: true }).mayRetry).toBe(false);
    // Saturation is temporal: the dependency answered correctly, it said "not now".
    expect(researchState({ kind: "refusal", code: "RESEARCH_ADMISSION_SATURATED" }).mayRetry).toBe(
      true,
    );
  });

  it("keeps the user's edit when a draft moved underneath them", () => {
    const conflict = researchState({ kind: "refusal", code: "RESEARCH_DRAFT_REVISION_CONFLICT" });
    expect(conflict.state).toBe("terminal");
    expect(conflict.retainsContent).toBe(true);
    expect(conflict.mayRetry).toBe(false);
  });

  it("never reports a foreign object as an empty scope", () => {
    const denied = researchState({ kind: "refusal", code: "RESEARCH_WORKSPACE_FORBIDDEN" });
    const empty = researchState({ kind: "ok", rowCount: 0 });
    expect(denied.state).toBe("denied");
    expect(empty.state).toBe("empty");
    expect(denied.state).not.toBe(empty.state);
    expect(FOREIGN_OBJECT_DENIED.state).not.toBe(OWN_SCOPE_EMPTY.state);
  });

  it("prefers a declared partial over an empty row count", () => {
    const partial = researchState({ kind: "ok", rowCount: 0, declaredUnavailable: ["trials"] });
    expect(partial.state).toBe("partial");
    expect(partial.reason).toContain("trials");
  });

  it("splits transport failures by retryability, and 401/403 by authority", () => {
    expect(researchState({ kind: "transport", status: 503, retryable: true }).state).toBe(
      "failed-retryable",
    );
    expect(researchState({ kind: "transport", status: 500, retryable: false }).state).toBe(
      "unavailable",
    );
    expect(researchState({ kind: "transport", status: 401, retryable: false }).state).toBe("denied");
  });
});

describe("auth-switch cache clearing", () => {
  const A = "usr_a";
  const B = "usr_b";
  const WS = "ws_1";

  it("puts actor and workspace ahead of the resource in every key", () => {
    const keys = [
      researchKeys.scope(A, WS),
      researchKeys.alphaVersions(A, WS, "alpha_1"),
      researchKeys.draft(A, WS, "draft_1", 3),
      researchKeys.attempt(A, WS, "att_1"),
      researchKeys.study(A, WS, "study_1"),
      researchKeys.inspection(A, WS, "subj_1"),
    ];
    for (const key of keys) {
      expect(key[0]).toBe("research");
      expect(key[1]).toBe(A);
      expect(key[2]).toBe(WS);
    }
  });

  it("gives two actors disjoint keys for the same resource", () => {
    const forA = researchKeys.attempt(A, WS, "att_1");
    const forB = researchKeys.attempt(B, WS, "att_1");
    expect(forA).not.toEqual(forB);
    expect(belongsToScope(forA, B, WS)).toBe(false);
    expect(belongsToScope(forA, A, WS)).toBe(true);
  });

  it("separates the same resource id across workspaces", () => {
    expect(belongsToScope(researchKeys.study(A, "ws_1", "s"), A, "ws_2")).toBe(false);
  });

  it("refuses to build a key without a scope, rather than building a colliding one", () => {
    expect(() => researchKeys.attempt("", WS, "att_1")).toThrow(/actor and a workspace/);
    expect(() => researchKeys.attempt(A, "", "att_1")).toThrow(/actor and a workspace/);
  });

  it("treats a draft revision as part of identity, so a stale body is unreachable", () => {
    expect(researchKeys.draft(A, WS, "d", 3)).not.toEqual(researchKeys.draft(A, WS, "d", 4));
  });
});

describe("session recovery uses the existing flows", () => {
  it("emits no storage authority of its own", () => {
    // P03: the browser holds no authority. A module that read identity back
    // from storage the user can edit would quietly become an auth source.
    for (const module of ["state.ts", "queryKeys.ts", "fixtures.ts"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", module), "utf8");
      // The guard itself names these APIs, so exclude comment lines.
      const code = source
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
        .join("\n");
      expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("marks a denied session as non-retryable so recovery is the existing flow, not a loop", () => {
    const denied = researchState({ kind: "transport", status: 401, retryable: true });
    expect(denied.state).toBe("denied");
    expect(denied.mayRetry).toBe(false);
  });
});

describe("no leaked object metadata, and no null becoming zero", () => {
  it("keeps a missing number missing", () => {
    expect(researchNumber(null)).toBeNull();
    expect(researchNumber(undefined)).toBeNull();
    expect(researchNumber(Number.NaN)).toBeNull();
    expect(researchNumber(Number.POSITIVE_INFINITY)).toBeNull();
    // A real zero is a real value and must survive.
    expect(researchNumber(0)).toBe(0);
  });

  it("carries no workspace identifier or row payload in the denied fixture", () => {
    const serialized = JSON.stringify(FOREIGN_OBJECT_DENIED);
    expect(serialized).not.toMatch(/ws_|workspace_id|owner/);
    expect(FOREIGN_OBJECT_DENIED).not.toHaveProperty("data");
    expect(FOREIGN_OBJECT_DENIED).not.toHaveProperty("rows");
  });

  it("keeps every fixture free of raw exceptions, URLs and credentials", () => {
    for (const fixture of ALL_FIXTURES) {
      const text = JSON.stringify(fixture);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/stack|Traceback|at Object\./i);
      expect(text).not.toMatch(/token|secret|password|authorization/i);
    }
  });

  it("declares retryability explicitly on every fixture", () => {
    for (const fixture of ALL_FIXTURES) {
      expect(typeof fixture.retryable).toBe("boolean");
    }
    expect(FOREIGN_OBJECT_DENIED.retryable).toBe(false);
    expect(DRAFT_REVISION_CONFLICT.retryable).toBe(false);
    expect(ADMISSION_SATURATED.retryable).toBe(true);
  });

  it("covers all three frozen refusal codes with a fixture", () => {
    for (const code of RESEARCH_REFUSAL_CODES) {
      expect(REFUSAL_FIXTURES[code]).toBeDefined();
      expect(REFUSAL_FIXTURES[code].reason_code).toBe(code);
    }
  });
});

describe("wire envelope bridge", () => {
  it("declares nothing when content is available", () => {
    expect(toPresentationMeta(researchState({ kind: "ok", rowCount: 5 }))).toBeNull();
  });

  it("maps every internal state to a published value or to null", () => {
    for (const state of COMPONENT_STATES) {
      const meta = toPresentationMeta({
        state,
        reason: "r",
        mayRetry: true,
        retainsContent: true,
      });
      if (meta !== null) {
        expect([
          "loading",
          "empty",
          "partial",
          "stale",
          "denied",
          "unavailable",
          "terminal",
        ]).toContain(meta.state);
      }
    }
  });

  it("omits as_of and reason_code rather than guessing them", () => {
    const meta = toPresentationMeta(researchState({ kind: "ok", rowCount: 0 }));
    expect(meta).not.toBeNull();
    expect(meta).not.toHaveProperty("as_of");
    expect(meta).not.toHaveProperty("reason_code");
  });
});
