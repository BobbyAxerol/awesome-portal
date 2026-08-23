/**
 * Phase 6 — the canonical catalogue, read rather than authored.
 *
 * The previous version of this file gated a hand-written list of twenty-one
 * commands against `extract/cli-command-map.json`. That list is gone: EX-BE-05b
 * published the contract, so these read the published document and assert the
 * reader does not soften any of it.
 *
 * The three constants the screen turns on are asserted from the fixture rather
 * than trusted, because each one, if it silently changed, would make the drawer
 * claim something is runnable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BLOCKED_REASONS,
  BLOCKED_REASON_TEXT,
  CATALOG_GROUPS,
  CATALOG_RISK_TIERS,
  GROUP_LABEL,
  blockedText,
  groupEntries,
  readCommandCatalogue,
  type CatalogEntry,
} from "./adminCatalog";
import { COMMAND_CATALOGUE_FIXTURE } from "./adminCatalog.fixtures";

const PUBLISHED = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../../packages/contracts/fixtures/execution-command-catalog.valid.json",
    ),
    "utf8",
  ),
);

const SCHEMA = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../../packages/contracts/schemas/execution-operations.v1.schema.json",
    ),
    "utf8",
  ),
);

const catalogue = () => readCommandCatalogue(PUBLISHED)!;

describe("the inlined copy has not drifted from the contract", () => {
  it("equals the published document byte for byte", () => {
    expect(COMMAND_CATALOGUE_FIXTURE).toEqual(PUBLISHED);
  });
});

describe("the vocabulary is the schema's", () => {
  it("knows every group the schema declares, and invents none", () => {
    expect([...CATALOG_GROUPS].sort()).toEqual(
      [...SCHEMA.$defs.CommandCatalogueEntry.properties.group.enum].sort(),
    );
  });

  it("knows every risk tier, including the two that are not tiers at all", () => {
    expect([...CATALOG_RISK_TIERS].sort()).toEqual([...SCHEMA.$defs.RiskTier.enum].sort());
    // UNCLASSIFIED and BLOCKED are in the union deliberately: treating either
    // as a low tier is how an unclassified capital movement reads as harmless.
    expect(CATALOG_RISK_TIERS).toContain("UNCLASSIFIED");
    expect(CATALOG_RISK_TIERS).toContain("BLOCKED");
  });

  it("knows every blocked reason and has words for each", () => {
    expect([...BLOCKED_REASONS].sort()).toEqual(
      [...SCHEMA.$defs.CommandCatalogueEntry.properties.blocked_reason.enum].sort(),
    );
    for (const reason of BLOCKED_REASONS) {
      expect(BLOCKED_REASON_TEXT[reason]?.length ?? 0, reason).toBeGreaterThan(40);
    }
  });

  it("labels every group without regrouping any of them", () => {
    for (const code of CATALOG_GROUPS) expect(GROUP_LABEL[code], code).toBeTruthy();
  });
});

describe("reading the published catalogue", () => {
  it("reads all sixty-four entries and the counts that describe them", () => {
    const c = catalogue();
    expect(c.entries).toHaveLength(64);
    expect(c.totalEntries).toBe(64);
    expect(c.returnedEntries).toBe(64);
    expect(c.revision).toBe(2);
  });

  it("reads the capability as DISABLED, which is what makes the screen honest", () => {
    const c = catalogue();
    expect(c.capabilityState).toBe("DISABLED");
    expect(c.capabilityReason).toBe("EX_BE_05B_F0_CONTRACT_ONLY");
  });

  it("finds no reachable entry, and reads the flag rather than assuming it", () => {
    expect(catalogue().entries.filter((e) => e.portalReachable)).toEqual([]);
    // Read, not hard-coded: a later revision that flips one to true must be
    // reported, not overwritten by the current constant.
    const flipped = readCommandCatalogue({
      ...PUBLISHED,
      entries: [{ ...PUBLISHED.entries[0], portal_reachable: true }],
    })!;
    expect(flipped.entries[0].portalReachable).toBe(true);
  });

  it("gives every entry a blocked reason with words behind it", () => {
    for (const e of catalogue().entries) {
      expect(e.blockedReason, e.key).not.toBeNull();
      expect(blockedText(e).length, e.key).toBeGreaterThan(40);
    }
  });

  it("keeps the Portal's tier apart from the source's", () => {
    const c = catalogue();
    const differing = c.entries.filter(
      (e) => e.sourceRiskTier !== null && e.sourceRiskTier !== e.riskTier,
    );
    // If these never differed the distinction would be untestable — and the
    // stop gate forbidding source-as-effective would be guarding nothing.
    expect(differing.length).toBeGreaterThan(0);
    const policy = c.entries.find((e) => e.key === "account/policy")!;
    expect(policy.sourceRiskTier).toBe("R0_READ");
    expect(policy.riskTier).toBe("R1_PAPER_MUTATION");
  });

  it("does not assume every command has plan, apply and verify", () => {
    const c = catalogue();
    expect(c.entries.some((e) => !e.verifyRequired)).toBe(true);
    expect(c.entries.some((e) => !e.planRequired)).toBe(true);
  });
});

describe("the eight ops actions codex requires to stay visible", () => {
  const REQUIRED_VISIBLE = [
    "ops/trace-order",
    "ops/dead-letters",
    "ops/findings",
    "ops/streams",
    "ops/command-journal",
    "ops/redis-retention",
    "ops/alerts",
    "ops/alpha-activity",
  ];

  it("lists all eight, unreachable, each with a reason", () => {
    const byKey = new Map(catalogue().entries.map((e) => [e.key, e]));
    for (const key of REQUIRED_VISIBLE) {
      const entry = byKey.get(key);
      expect(entry, `${key} is missing from the catalogue`).toBeTruthy();
      expect(entry!.portalReachable, key).toBe(false);
      expect(entry!.blockedReason, key).toBe("TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED");
    }
  });

  it("keeps them in the grouped render rather than filtering them out", () => {
    const rendered = groupEntries(catalogue().entries).flatMap((g) => g.items.map((i) => i.key));
    for (const key of REQUIRED_VISIBLE) expect(rendered, key).toContain(key);
  });
});

describe("grouping is the server's", () => {
  it("renders every entry exactly once", () => {
    const c = catalogue();
    const rendered = groupEntries(c.entries).flatMap((g) => g.items);
    expect(rendered).toHaveLength(64);
    expect(new Set(rendered.map((e) => e.key)).size).toBe(64);
  });

  it("omits a group with no entries instead of showing an empty heading", () => {
    // Revision 2 carries nothing under MARKET_REFERENCE.
    const codes = groupEntries(catalogue().entries).map((g) => g.code);
    expect(codes).not.toContain("MARKET_REFERENCE");
    expect(codes.length).toBeGreaterThan(1);
  });

  it("keeps an entry whose group it cannot read, under a stated heading", () => {
    const odd: CatalogEntry[] = [
      ...catalogue().entries,
      { ...catalogue().entries[0], key: "mystery/thing", group: null },
    ];
    const groups = groupEntries(odd);
    expect(groups.at(-1)?.label).toBe("Group not stated");
    expect(groups.flatMap((g) => g.items)).toHaveLength(65);
  });
});

describe("the reader denies by default", () => {
  it("returns null for a document it cannot read", () => {
    expect(readCommandCatalogue(null)).toBeNull();
    expect(readCommandCatalogue("{}")).toBeNull();
  });

  it("drops an entry with no key rather than inventing one", () => {
    const c = readCommandCatalogue({ entries: [{ command: "a", action: "b" }] })!;
    expect(c.entries).toEqual([]);
  });

  it("does not read an unrecognised group, tier or reason as a valid one", () => {
    const c = readCommandCatalogue({
      entries: [
        {
          key: "x/y",
          group: "SOMETHING_NEW",
          risk_tier: "R9",
          blocked_reason: "BECAUSE",
          source_route_state: "MAYBE",
        },
      ],
    })!;
    expect(c.entries[0].group).toBeNull();
    expect(c.entries[0].riskTier).toBeNull();
    expect(c.entries[0].blockedReason).toBeNull();
    expect(c.entries[0].routeState).toBeNull();
  });
});
