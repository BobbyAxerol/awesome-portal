/**
 * PHASE 2 (round 2) · the paths control-api asks the Edge for must exist.
 *
 * Unblocking the binding identifier let the request reach the Edge, and the
 * Edge declined. Reading the crate that builds the deployed image explains
 * why: it serves five internal routes and none of them is a `screens` path.
 * Every `/internal/v1/screens/...` the analytics proxy targets has never
 * existed at the other end.
 *
 * That is not a bug one fix closes — it is a contract drift between two
 * systems, and it stayed invisible because a dead path and a disabled feature
 * return the same shape of nothing. This test makes the drift fail out loud:
 * it reads both sides of the contract from source and compares them.
 *
 * The allowlist below is the set of paths known to be unserved today, each one
 * recorded rather than quietly tolerated. Removing an entry when the Edge
 * grows the route is the point; adding one requires saying why here.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const CONTROL_API = join(ROOT, "apps", "control-api", "src");
const EDGE_CRATES = join(ROOT, "services", "portal-execution-edge-rs", "crates");

/**
 * Paths control-api targets that the deployed Edge does not serve.
 *
 * Verified 2026-09-10 against edge_commit 9266a684, which the runtime manifest
 * names and which is an ancestor of this branch. Reaching any of them returns
 * ANALYTICS_UPSTREAM_REJECTED, which reads to a screen as "the computation
 * failed" rather than "this was never wired".
 */
const KNOWN_UNSERVED: Readonly<Record<string, string>> = {
  "/internal/v1/query-analytics": "analytics proxy · query analytics for a subject",
  "/internal/v1/screens/account-broker-360": "analytics proxy · binding exposure (phase 2A reaches it; the Edge declines)",
  "/internal/v1/screens/alpha-360": "analytics proxy · alpha insight previews",
  "/internal/v1/screens/blotter": "analytics proxy · blotter order funnel",
  "/internal/v1/screens/gate-r2": "analytics proxy · capital preview",
  "/internal/v1/screens/paper-workbench": "analytics proxy · workbench shadow panels",
  "/internal/v1/screens/portfolio-360": "analytics proxy · portfolio correlation",
  "/internal/v1/current-source/screens": "current-source proxy · raw screen reads, browser-forbidden by design",
};

function walk(dir: string, keep: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name), keep)
      : keep(entry.name) ? [join(dir, entry.name)] : []);
}

/** The first two path segments are the contract; the rest is a resource id. */
function family(path: string): string {
  const parts = path.split("/").filter(Boolean);
  // /internal/v1/<group>[/<screen>] — keep enough to name the route family.
  return `/${parts.slice(0, parts[2] === "screens" || parts[2] === "current-source" ? 4 : 3).join("/")}`;
}

function controlApiEdgePaths(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(CONTROL_API, (f) => f.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(f))) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/["'`](\/internal\/v1\/[A-Za-z0-9/${}._-]*)/g)) {
      found.add(family(match[1].replace(/\$\{[^}]*\}/g, "x")));
    }
  }
  return found;
}

function edgeServedPaths(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(EDGE_CRATES, (f) => f.endsWith(".rs"))) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/"(\/internal\/v1\/[A-Za-z0-9/{}_-]*)"/g)) {
      found.add(family(match[1]));
    }
  }
  return found;
}

describe("the Edge path contract", () => {
  it("reads both sides from source, so a passing run means something", () => {
    expect(edgeServedPaths().size).toBeGreaterThan(0);
    expect(controlApiEdgePaths().size).toBeGreaterThan(0);
  });

  it("targets no Edge path outside what the crate serves or what is recorded as unserved", () => {
    const served = edgeServedPaths();
    const drift = [...controlApiEdgePaths()]
      .filter((path) => !served.has(path) && !(path in KNOWN_UNSERVED))
      .sort();
    expect(drift).toEqual([]);
  });

  it("keeps the unserved list honest: an entry the Edge now serves must be removed", () => {
    const served = edgeServedPaths();
    const stale = Object.keys(KNOWN_UNSERVED).filter((path) => served.has(path)).sort();
    expect(stale).toEqual([]);
  });

  it("gives every unserved path a reason a reader can act on", () => {
    for (const [path, reason] of Object.entries(KNOWN_UNSERVED)) {
      expect(reason.length, path).toBeGreaterThan(20);
    }
  });
});
