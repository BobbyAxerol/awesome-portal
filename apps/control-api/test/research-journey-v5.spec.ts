import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SessionGuard } from "../src/facade/session.guard";
import { ResearchFoundationController } from "../src/research/foundation.controller";
import { ResearchFoundationService } from "../src/research/foundation.service";
import { RESEARCH_JOURNEY_DESCRIPTOR as v3, RESEARCH_JOURNEY_DESCRIPTOR_SHA256 as v3Hash } from "../src/research/journey.descriptor.v3";
import { RESEARCH_JOURNEY_DESCRIPTOR as v4, RESEARCH_JOURNEY_DESCRIPTOR_SHA256 as v4Hash } from "../src/research/journey.descriptor.v4";
import { RESEARCH_JOURNEY_DESCRIPTOR as v5, RESEARCH_JOURNEY_DESCRIPTOR_SHA256 as v5Hash } from "../src/research/journey.descriptor.v5";

const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (revision: number) => JSON.parse(readFileSync(resolve(contractsRoot,
  `fixtures/research-foundation.journey-v${revision}.valid.json`), "utf8"));
const scope = { workspaceId: "journey-workspace", actorUserId: "journey-member" };
const registry = {
  descriptorId: "quantbt_journey", schemaVersion: "research.journey.v1", revision: 5, contentSha256: v5Hash,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = (value: unknown) => createHash("sha256").update(canonical(value), "utf8").digest("hex");
function makeService(overrides = {}) {
  const repository = {
    loadJourneyDescriptor: vi.fn(async () => ({ ...registry, ...overrides })),
    isTrialAmbiguous: vi.fn(async () => false),
  };
  const atlasClient = { read: vi.fn() };
  return { service: new ResearchFoundationService(repository as never, atlasClient as never, {} as never), repository, atlasClient };
}
function reply() { return { header: vi.fn(), code: vi.fn() }; }
function request(headers = {}) {
  return { portalUser: { userId: scope.actorUserId }, portalWorkspaceId: scope.workspaceId, headers };
}

describe("G-26 immutable Journey v5 and accepted product links", () => {
  it("preserves exact immutable v3/v4 content and gives v5 its own canonical hash", () => {
    for (const [revision, descriptor, digest] of [[3, v3, v3Hash], [4, v4, v4Hash], [5, v5, v5Hash]] as const) {
      const { content_sha256, ...stored } = fixture(revision).descriptor;
      expect(stored).toEqual(descriptor);
      expect(sha(descriptor)).toBe(digest);
      expect(content_sha256).toBe(digest);
    }
    expect(v4Hash).toBe("376acce59fa25435aebcf3ce225117d169415b6a1164617e5da11e68a82d5ab8");
    expect(v5Hash).toBe("7e408074d63ee35cf3074de84a70d98d5481472df31d38c8a6c3ab91da01c9be");
    expect(v5Hash).not.toBe(v4Hash);
  });

  it("changes only declared copy and four demonstrated redirects, never scope or authority", () => {
    const targetByCard: Record<string, string> = {
      "alpha-imports-shipped": "alpha_import", "run-library-shipped": "run_library",
      "new-run-shipped": "new_run", "run-progress-shipped": "run_progress",
    };
    expect(v5.phases).toHaveLength(8);
    expect(v5.phases.flatMap(phase => phase.cards)).toHaveLength(28);
    for (let p = 0; p < v4.phases.length; p++) {
      const previous = v4.phases[p]!, current = v5.phases[p]!;
      const { description: _before, cards: _beforeCards, ...beforeIdentity } = previous;
      const { description: _after, cards: _afterCards, ...afterIdentity } = current;
      expect(afterIdentity).toEqual(beforeIdentity);
      expect(current.cards).toHaveLength(previous.cards.length);
      current.cards.forEach((card, index) => {
        const old = previous.cards[index]!;
        expect(card.target_key).toBe(targetByCard[old.card_id] ?? old.target_key);
        const { description: _oldCopy, target_key: _oldTarget, ...oldFacts } = old;
        const { description: _copy, target_key: _target, ...facts } = card;
        expect(facts).toEqual(oldFacts);
        expect(card.description).not.toMatch(/\bshipped\b/i);
      });
      expect(current.description).not.toMatch(/\bshipped\b/i);
    }
    expect(v5.mapping.map(row => row.shipped)).not.toEqual(v4.mapping.map(row => row.shipped));
    expect(v5.mapping.map(({ shipped: _label, ...row }) => row))
      .toEqual(v4.mapping.map(({ shipped: _label, ...row }) => row));
    const alphaVersion = v5.phases.flatMap(phase => phase.cards).find(card => card.card_id === "alpha-version");
    expect(alphaVersion).toMatchObject({ target_key: "alpha_version_legacy", requires_run: false, requires_alpha: true });
    expect(v5.phases.flatMap(phase => phase.cards).filter(card => card.availability === "DEPENDENCY_REQUIRED"))
      .toEqual(v4.phases.flatMap(phase => phase.cards).filter(card => card.availability === "DEPENDENCY_REQUIRED"));
  });

  it("publishes only accepted opaque target keys, not a URL/private/fixture/commissioned route", () => {
    const acceptedAvailableKeys = new Set([
      "portal_access", "command_center", "portal_map", "alpha_import", "alpha_version_legacy", "run_library",
      "new_run", "run_progress", "evidence_hub", "split", "search_selection", "freeze", "execute_replay",
      "attempt_lineage", "engine_atlas", "compare_runs", "release_candidate", "run_report",
    ]);
    for (const card of v5.phases.flatMap(phase => phase.cards)) {
      expect(card.target_key).toMatch(/^[a-z][a-z0-9_]*$/);
      if (card.availability === "AVAILABLE") expect(acceptedAvailableKeys.has(card.target_key)).toBe(true);
    }
    for (const row of v5.mapping) {
      expect(row.shipped_target_key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(acceptedAvailableKeys.has(row.mine_target_key)).toBe(true);
    }
    for (const forbidden of ["https://", "//", "../", "/internal/", "/research/alphas/import", "/research/_fixtures", "JWT", "mTLS"]) {
      expect(JSON.stringify(v5)).not.toContain(forbidden);
    }
  });

  it("appends the exact immutable v5 registry pin without updating historical rows", () => {
    const migration = readFileSync(resolve(__dirname, "../migrations/1723680000092_research-journey-descriptor-v5.sql"), "utf8");
    expect(migration).toContain("INSERT INTO research.journey_descriptor_registry");
    expect(migration).toContain("'quantbt_journey', 'research.journey.v1', 5");
    expect(migration).toContain(v5Hash);
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  it("serves the canonical response/ETag from a scoped read with no private Atlas request", async () => {
    const { service, repository, atlasClient } = makeService();
    expect(await service.journey(scope, {})).toEqual(fixture(5));
    expect(repository.loadJourneyDescriptor).toHaveBeenCalledExactlyOnceWith(scope);
    expect(repository.isTrialAmbiguous).not.toHaveBeenCalled();
    expect(atlasClient.read).not.toHaveBeenCalled();
  });

  it.each([
    { revision: 3 }, { revision: 4 }, { revision: 6 }, { contentSha256: "0".repeat(64) },
    { descriptorId: "other" }, { schemaVersion: "research.journey.v2" },
  ])("refuses a registry pin mismatch %j before returning descriptor or consulting a trial", async mismatch => {
    const { service, repository, atlasClient } = makeService(mismatch);
    await expect(service.journey(scope, { run_id: "run_one", trial: "trial_one" }))
      .rejects.toMatchObject({ status: 503, code: "RESEARCH_FOUNDATION_DESCRIPTOR_MISMATCH" });
    expect(repository.isTrialAmbiguous).not.toHaveBeenCalled();
    expect(atlasClient.read).not.toHaveBeenCalled();
  });

  it("keeps aliases canonical and the pick inspection-only, and binds ETag to exact cursor context", async () => {
    const { service } = makeService();
    const a = await service.journey(scope, { run_id: "rrun_one", stage: "freeze", pick: "pick_one", seq: "42" });
    const b = await service.journey(scope, { event_seq: "42", pick: "pick_one", stage: "freeze", run_id: "rrun_one" });
    expect(a).toEqual(b);
    expect(a.inspection).toMatchObject({ cursor: { stage: "freeze", pick: "pick_one", seq: "42" },
      canonical_query: "?run_id=rrun_one&stage=freeze&pick=pick_one&seq=42", pick_effect: "INSPECTION_ONLY" });
    expect(a.inspection.cursor).not.toHaveProperty("event_seq");
    expect((await service.journey(scope, { run_id: "rrun_two", seq: "42" })).etag).not.toBe(a.etag);
    expect((await service.journey(scope, { run_id: "rrun_one", seq: "43" })).etag).not.toBe(a.etag);
    await expect(service.journey(scope, { seq: "42", event_seq: "43" }))
      .rejects.toMatchObject({ status: 400, code: "RESEARCH_FOUNDATION_INVALID" });
  });

  it("retains session guard and membership checks before conditional 304 reads", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ResearchFoundationController)).toContain(SessionGuard);
    const { service, repository } = makeService();
    const isMember = vi.fn(async () => true);
    const controller = new ResearchFoundationController(service, { isMember } as never), res = reply();
    expect(await controller.journey(request({ "if-none-match": fixture(5).etag }) as never, {}, res as never)).toBeUndefined();
    expect(res.code).toHaveBeenCalledExactlyOnceWith(304);
    expect(res.header).toHaveBeenCalledWith("etag", fixture(5).etag);
    expect(res.header).toHaveBeenCalledWith("cache-control", "private, max-age=0, must-revalidate");
    expect(isMember).toHaveBeenCalledExactlyOnceWith(scope.workspaceId, scope.actorUserId);
    repository.loadJourneyDescriptor.mockClear();
    isMember.mockResolvedValue(false);
    await expect(controller.journey(request({ "if-none-match": fixture(5).etag }) as never,
      { workspace_id: "foreign_workspace" }, reply() as never)).rejects.toMatchObject({ status: 404 });
    expect(repository.loadJourneyDescriptor).not.toHaveBeenCalled();
  });

  it.each([{ target_key: "https://evil.test" }, { private_url: "x" }, { stage: "deploy" }, { run_id: "../private" }])(
    "rejects unknown/malformed query %j before membership or registry access", async query => {
      const { service, repository } = makeService(), isMember = vi.fn();
      const controller = new ResearchFoundationController(service, { isMember } as never);
      await expect(controller.journey(request() as never, query, reply() as never))
        .rejects.toMatchObject({ status: 400, code: "RESEARCH_FOUNDATION_INVALID" });
      expect(isMember).not.toHaveBeenCalled();
      expect(repository.loadJourneyDescriptor).not.toHaveBeenCalled();
    },
  );
});
