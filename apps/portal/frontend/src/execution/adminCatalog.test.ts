/**
 * Gates for the phase 6 catalogue.
 *
 * The point of this file is the last two tests, and they exist because of a
 * mistake made earlier in this cluster: a gate was written that compared a
 * constant to a copy of itself pasted into the same file, and its commit
 * claimed an upstream rename would go red. It would not have.
 *
 * So these read the evidence pack from disk. If codex reclassifies a command's
 * risk tier, or the OpenAPI stops serving a path this catalogue calls
 * reachable, the assertion fails here rather than in an operator's hands.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_CATALOG, catalogCount, findCommand, type CatalogCommand } from "./adminCatalog";
import type { RiskTier } from "./contracts";

const REPO = join(__dirname, "../../../../..");
const PACK = "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack";

interface ExtractCommand {
  command: string;
  action: string;
  risk_tier_proposed: string;
  portal_reachable: string;
  http_paths: string[];
}

function extractMap(): Map<string, ExtractCommand> {
  const raw = readFileSync(join(REPO, PACK, "extract/cli-command-map.json"), "utf8");
  const commands = JSON.parse(raw).commands as ExtractCommand[];
  return new Map(commands.map((c) => [`${c.command}/${c.action}`, c]));
}

function openApiPaths(): Set<string> {
  const raw = readFileSync(join(REPO, PACK, "openapi.sanitized.json"), "utf8");
  return new Set(Object.keys(JSON.parse(raw).paths ?? {}));
}

const TIER_OF: Record<string, RiskTier | null> = {
  R0_READ: "R0",
  R1_PAPER_MUTATION: "R1",
  R2_SANDBOX: "R2",
  R3_LIVE_PROTECTIVE: "R3",
  UNCLASSIFIED: null,
};

function everyCommand(): CatalogCommand[] {
  return ADMIN_CATALOG.flatMap((g) => [...g.items]);
}

describe("admin catalogue shape", () => {
  it("is the hi-fi's 21 commands in 6 groups", () => {
    expect(ADMIN_CATALOG).toHaveLength(6);
    expect(catalogCount()).toBe(21);
  });

  it("uses the group names IMPLEMENTATION_PHASES fixes", () => {
    expect(ADMIN_CATALOG.map((g) => g.name)).toEqual([
      "Read & inspect",
      "Portfolio & capital",
      "Deployment & risk",
      "Account",
      "Broker sync & reconciliation",
      "Emergency & destructive",
    ]);
  });

  it("gives every unreachable command a reason, and every reachable one none", () => {
    for (const c of everyCommand()) {
      if (c.reachability === "HTTP") {
        expect(c.blockedReason, `${c.id} is reachable but carries a blocked reason`).toBeUndefined();
      } else {
        expect(c.blockedReason?.length ?? 0, `${c.id} is blocked with no reason`).toBeGreaterThan(20);
      }
    }
  });

  it("marks every blocked command BLOCKED, so none can be tagged as runnable", () => {
    for (const c of everyCommand()) {
      if (c.reachability !== "HTTP") expect(c.tag, c.id).toBe("BLOCKED");
    }
  });

  it("has unique ids", () => {
    const ids = everyCommand().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds by id and returns null for an unknown one", () => {
    expect(findCommand("portfolio/list")?.title).toBe("List portfolios");
    expect(findCommand("portfolio/nope")).toBeNull();
  });
});

describe("catalogue agrees with the evidence pack", () => {
  it("never claims a lower risk tier than the extract proposes", () => {
    const extract = extractMap();
    const checked: string[] = [];
    for (const c of everyCommand()) {
      const e = extract.get(c.id);
      if (!e) continue;
      checked.push(c.id);
      const expected = TIER_OF[e.risk_tier_proposed];
      if (expected === null) {
        // UNCLASSIFIED means the extract has no opinion. The one thing the
        // catalogue must not do is resolve that silence into "read".
        expect(c.tier, `${c.id} is UNCLASSIFIED upstream and must not be sold as a read`).not.toBe(
          "R0",
        );
        continue;
      }
      expect(c.tier, `${c.id} tier disagrees with the extract`).toBe(expected);
    }
    // Guards the join itself: if ids drift, the loop above silently checks
    // nothing and passes.
    expect(checked.length).toBeGreaterThanOrEqual(19);
  });

  it("only calls a command DIRECT_DB_ONLY when the extract says it has no HTTP path", () => {
    const extract = extractMap();
    for (const c of everyCommand()) {
      if (c.reachability !== "DIRECT_DB_ONLY") continue;
      const e = extract.get(c.id);
      if (!e) continue; // lab reset is a documented procedure, not a CLI action
      expect(e.portal_reachable, c.id).toBe("NO — no HTTP equivalent");
    }
  });

  it("keeps the emergency-close route this screen's DANGER command depends on", () => {
    // The one mutation on this screen that reaches a live position. If the
    // route disappears, the drawer would offer a plan for a command with
    // nowhere to send it.
    expect(openApiPaths().has("/v1/admin/ops/emergency-close")).toBe(true);
    expect(findCommand("ops/emergency-close")?.tier).toBe("R3");
  });

  it("records that the eight ops read actions still have no route of their own", () => {
    // Not a catalogue assertion — a standing note about phases 7, 8 and 9,
    // which need these. The extract marks them PARTIAL because it attributes
    // the handler's emergency-close paths to every action in the handler; the
    // OpenAPI has no route for any of them. When codex publishes them, this
    // test goes red and the catalogue gains eight entries.
    const paths = [...openApiPaths()];
    for (const action of [
      "trace-order",
      "dead-letters",
      "findings",
      "streams",
      "command-journal",
      "redis-retention",
      "alerts",
      "alpha-activity",
    ]) {
      expect(
        paths.filter((p) => p.includes(action)),
        `ops ${action} now has a route — phase 7/8/9 can consume it`,
      ).toEqual([]);
    }
  });
});
