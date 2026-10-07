/**
 * Research surface boundary — negative contract.
 *
 * P05's handoff states the browser never receives artifact storage paths, raw
 * relation cursors, HMAC keys, lease epochs, worker identities or database
 * locators. The first implementation asserted that inside `artifacts.ts` only,
 * and the neighbouring `scheduler.ts` then typed and rendered a `leaseEpoch`
 * anyway. A guard scoped to one file is not a boundary.
 *
 * So this file sweeps the whole Research surface — every module and every
 * component — rather than any single one, and the browser probe makes the same
 * assertion against the rendered DOM, because a module can be clean while a
 * server-supplied string still puts an internal identifier on screen.
 *
 * The network rule is stated as an allowlist rather than a ban. P07 has to call
 * the Portal's own BFF, and a blanket "no fetch" would have been deleted the
 * first time it was inconvenient — which is how a boundary stops being one.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src", "research");

/** Every source file on the Research surface, tests excluded. */
const SOURCES = readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
  .map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") }));

/** Code only: the prohibitions are named in prose, which must not trip them. */
function codeOf(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

const FORBIDDEN: [string, RegExp][] = [
  ["lease epoch", /lease[_ ]?epoch/i],
  ["worker identity", /worker[_ ]?(id|identity|pid|host|name)\b/i],
  ["work digest", /work[_ ]?digest/i],
  ["scheduler credential", /\b(hmac|secret|credential|api[_ ]?key|bearer)\b/i],
  ["storage locator", /\/var\/|\/srv\/|file:\/\/|s3:\/\/|\.parquet|postgres(ql)?:\/\//i],
  ["direct source access", /XMLHttpRequest|WebSocket|\bnats\b/i],
  ["digest computation", /createHash|subtle\.digest|sha256\s*\(/i],
];

describe("no internal identifier or direct source access on the Research surface", () => {
  it("sweeps every Research module, not just one", () => {
    // If this list shrinks silently, the sweep stops meaning anything.
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`contains no ${label}`, () => {
      const offenders = SOURCES.filter((f) => pattern.test(codeOf(f.text))).map((f) => f.name);
      expect(offenders, `${label} found in: ${offenders.join(", ")}`).toEqual([]);
    });
  }

  /*
   * P07 introduced the surface's first real request. The prohibition was never
   * "no request" — it is "no direct dependency": the browser may talk to the
   * named same-origin BFF and to nothing else. So `fetch` is allowed in exactly
   * one module, and that module's targets are checked to be relative paths
   * under the Portal's own API prefix. An absolute URL here would be an
   * analyser or engine address, which is precisely what P07's handoff forbids.
   */
  const NETWORK_MODULES = [
    "alphaImportClient.ts",
    "foundationClient.ts",
    "preflightClient.ts",
    "progressClient.ts",
    "runCreateClient.ts",
    "runLibraryClient.ts",
    "evidenceClient.ts",
    "splitClient.ts",
    "searchClient.ts",
    "freezeClient.ts",
    "replayClient.ts",
    "reportClient.ts",
    "lineageClient.ts",
    "compareClient.ts",
    // W5c: P21 Screen 11 composer, draft CAS, local seal and pack read.
    "releaseCandidateClient.ts",
    // W4: CG-P08-04 dataset catalog (Screen 02).
    "datasetClient.ts",
    // B10: child-audit companion (full source lifecycle rows, paged).
    "childAuditCompanionClient.ts",
    // P23 (Codex 7d18fe4e): linked final-audit custody read + pinned create, workspace scoped.
    "linkedAuditClient.ts",
    // S02: Alpha-bound run setup options + window suggestion (same-origin read-only GET/POST).
    "setupClient.ts",
    // §44 / WEX: completed-window analytics, observations, native journal and window compare (same-origin read-only GETs).
    "windowExecutionClient.ts",
  ];

  /*
   * P11 introduced the surface's first stream, so `EventSource` moved from a
   * blanket ban to an allowlist for the same reason `fetch` did: the rule was
   * never "no stream", it is "no direct dependency". One module may open one,
   * and the URL it opens is built by the client from the contract's own path —
   * checked below, alongside every other request target.
   */
  const STREAM_MODULES = ["useRunProgress.ts"];

  it("opens a stream only in the one module allowed to", () => {
    const openers = SOURCES.filter((f) => /new EventSource\s*\(/.test(codeOf(f.text))).map(
      (f) => f.name,
    );
    expect(openers.sort()).toEqual([...STREAM_MODULES].sort());
  });

  it("builds every stream URL in the client, never inline", () => {
    for (const name of STREAM_MODULES) {
      const code = codeOf(SOURCES.find((f) => f.name === name)!.text);
      /* The module may pass a URL the client built; it may not write one. */
      expect(code, name).not.toMatch(/new EventSource\s*\(\s*["'`]/);
      expect(code, name).not.toMatch(/["'`](https?:)?\/\//);
    }
  });

  it("keeps requests inside the one module allowed to make them", () => {
    const callers = SOURCES.filter((f) => /\bfetch\s*\(/.test(codeOf(f.text))).map((f) => f.name);
    expect(callers.sort()).toEqual([...NETWORK_MODULES].sort());
  });

  it("addresses only the same-origin Portal API, never a dependency", () => {
    for (const name of NETWORK_MODULES) {
      const code = codeOf(SOURCES.find((f) => f.name === name)!.text);
      // No scheme and no protocol-relative host may appear at all.
      expect(code).not.toMatch(/["'`](https?:)?\/\//);
      /* Every literal path in the module, not just a single `BASE`: P09
         publishes two endpoints, so a one-constant check would stop covering
         the second one the moment it was added. */
      const paths = [...code.matchAll(/["'`](\/[^"'`]*)["'`]/g)].map((m) => m[1]);
      const apiPaths = paths.filter((value) => value.startsWith("/api"));
      expect(apiPaths.length, `${name} declares no API path`).toBeGreaterThan(0);
      for (const value of apiPaths) {
        expect(value.startsWith("/api/v1/"), `${name}: ${value}`).toBe(true);
      }
    }
  });

  /*
   * Research Light matches the hi-fi value for value, so a component that needs
   * a raw hex is a component reaching for a colour the palette does not name —
   * and that colour will not follow the theme. Caught on the P08 panels, where
   * the seal, the train band and the OOS band all had documented tokens
   * (`--role-holdout`, `--viz-train`, `--role-oos`) that the first draft
   * bypassed by copying the hi-fi's literals.
   */
  it("uses palette tokens rather than raw hex", () => {
    const offenders = SOURCES.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(codeOf(f.text))).map(
      (f) => f.name,
    );
    expect(offenders, `raw hex in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("types no attempt field beyond ordinal, state and message", async () => {
    const { RESEARCH_JOB_STATES } = await import("./scheduler");
    expect(RESEARCH_JOB_STATES.length).toBe(8);
    const scheduler = SOURCES.find((f) => f.name === "scheduler.ts");
    const attempt = /export interface WorkerAttempt \{([\s\S]*?)\n\}/.exec(scheduler!.text);
    expect(attempt).not.toBeNull();
    const fields = [...attempt![1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(["message", "ordinal", "state"]);
  });
});
