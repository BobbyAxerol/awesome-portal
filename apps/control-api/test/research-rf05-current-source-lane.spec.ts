/**
 * RF-05 CG-P13-09 — typed retained-lane states for the RS-02 current-source
 * reads: PENDING_SOURCE / PENDING_RETENTION / NOT_RETAINED_LEGACY /
 * NOT_RETAINED_TERMINAL stay 409 refusals with a machine-readable
 * `details.lane_state`; a run whose admitted profile can never be retained
 * (the P04 fixed qualification) is a typed 200 NOT_APPLICABLE answer.
 */

import { describe, expect, it, vi } from "vitest";

import { HttpErrorFilter } from "../src/http-error.filter";
import { ResearchCurrentSourceController } from "../src/research/current-source.controller";
import { ResearchCurrentSourceNotApplicableResponseSchema } from "../src/research/current-source.contract";
import { ResearchCurrentSourceError } from "../src/research/current-source.error";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { ifNoneMatchWeakly } from "../src/research/etag";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "../src/research/p04-delta.binding";
import { ResearchSplitError } from "../src/research/split.error";

const scope = { workspaceId: "rf05-workspace", actorUserId: "rf05-user" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};

function build(options: {
  status: string;
  sourceKind?: "RESEARCH_DURABLE" | "LEGACY_1_0_8_METADATA";
  adapterContractDigest?: string | null;
  hub?: ReturnType<typeof vi.fn>;
}) {
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(null),
    runState: vi.fn().mockResolvedValue({ sourceKind: options.sourceKind ?? "RESEARCH_DURABLE", effectiveStatus: options.status }),
    rows: vi.fn(),
    sampleRows: vi.fn(),
    verifyRetainedImport: vi.fn(),
  };
  const split = {
    hub: options.hub ?? vi.fn().mockResolvedValue(
      options.adapterContractDigest === undefined ? null : { adapterContractDigest: options.adapterContractDigest },
    ),
  };
  return {
    repository,
    split,
    service: new ResearchCurrentSourceService(repository as never, config as never, split as never),
  };
}

const operations = [
  ["evidence", (service: ResearchCurrentSourceService) => service.evidence(scope, "run_p04")],
  ["evidence_series", (service: ResearchCurrentSourceService) => service.evidenceSeries(scope, "run_p04", "EQUITY")],
  ["split", (service: ResearchCurrentSourceService) => service.split(scope, "run_p04")],
  ["search", (service: ResearchCurrentSourceService) => service.search(scope, "run_p04", { limit: 100 })],
  ["freeze", (service: ResearchCurrentSourceService) => service.freeze(scope, "run_p04")],
  ["replay", (service: ResearchCurrentSourceService) => service.replay(scope, "run_p04", { limit: 100 })],
] as const;

describe("RF-05 CG-P13-09 · P04 fixed profile is NOT_APPLICABLE, answered as a typed 200", () => {
  it("answers every named read with the not-applicable lane and never reads retained rows", async () => {
    for (const status of ["COMPLETED", "CANCELLED", "RUNNING"]) {
      const { service, repository } = build({ status, adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST });
      for (const [operation, read] of operations) {
        const answer = await read(service);
        expect(ResearchCurrentSourceNotApplicableResponseSchema.safeParse(answer).success, operation).toBe(true);
        expect(answer).toMatchObject({
          schema_version: "research.current-source-not-applicable.v1",
          availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
          lane: {
            state: "NOT_APPLICABLE", operation, run_profile: "P04_FIXED_QUALIFICATION",
            run_adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
            retainable_profile_id: "rs02.delta-wfo-global.v1",
          },
        });
        expect(answer.etag).toBe(`"${answer.revision}"`);
        // Deterministic: the same run/operation always gets the same validator.
        expect((await read(service)).etag).toBe(answer.etag);
      }
      expect(repository.rows).not.toHaveBeenCalled();
      expect(repository.sampleRows).not.toHaveBeenCalled();
      expect(repository.verifyRetainedImport).not.toHaveBeenCalled();
    }
  });

  it("goes through the controller as a 200 with its ETag, and 304s on that ETag", async () => {
    const { service } = build({ status: "COMPLETED", adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST });
    const controller = new ResearchCurrentSourceController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const reply = () => {
      const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
      value.code.mockReturnValue(value);
      return value;
    };
    const request = (headers: Record<string, string>) => ({
      portalUser: { userId: scope.actorUserId }, portalWorkspaceId: scope.workspaceId, headers, raw: { once: vi.fn(), off: vi.fn() },
    });
    const first = reply();
    await controller.split(request({}) as never, first as never, "run_p04", {});
    expect(first.code).not.toHaveBeenCalled();
    const body = first.send.mock.calls[0]![0] as { etag: string; lane: { operation: string } };
    expect(body.lane.operation).toBe("split");
    expect(first.header).toHaveBeenCalledWith("etag", body.etag);
    const again = reply();
    await controller.split(request({ "if-none-match": body.etag }) as never, again as never, "run_p04", {});
    expect(again.code).toHaveBeenCalledWith(304);
    const search = reply();
    await controller.search(request({}) as never, search as never, "run_p04", {});
    expect(search.code).not.toHaveBeenCalled();
    expect((search.send.mock.calls[0]![0] as { lane: { operation: string } }).lane.operation).toBe("search");
  });
});

describe("RF-05 CG-P13-13 · current-source revalidation uses the shared weak comparison", () => {
  const strong = `"p13r1_${"a".repeat(64)}"`;

  it("compares If-None-Match weakly over a list, with *", () => {
    expect(ifNoneMatchWeakly(strong, strong)).toBe(true);
    expect(ifNoneMatchWeakly(`W/${strong}`, strong)).toBe(true);
    expect(ifNoneMatchWeakly(`"x", W/${strong}`, strong)).toBe(true);
    expect(ifNoneMatchWeakly([`"x"`, `W/${strong}`], strong)).toBe(true);
    expect(ifNoneMatchWeakly(`W/${strong}`, `W/${strong}`)).toBe(true);
    expect(ifNoneMatchWeakly("*", strong)).toBe(true);
    expect(ifNoneMatchWeakly(`"p13r1_${"c".repeat(64)}"`, strong)).toBe(false);
    expect(ifNoneMatchWeakly(undefined, strong)).toBe(false);
  });

  it("304s a gateway-weakened or listed tag on every conditional read and marks it private/no-cache", async () => {
    const { service } = build({ status: "COMPLETED", adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST });
    const controller = new ResearchCurrentSourceController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const reply = () => {
      const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
      value.code.mockReturnValue(value);
      return value;
    };
    const request = (headers: Record<string, string>) => ({
      portalUser: { userId: scope.actorUserId }, portalWorkspaceId: scope.workspaceId, headers, raw: { once: vi.fn(), off: vi.fn() },
    });
    const reads = [
      (req: unknown, rep: unknown) => controller.evidence(req as never, rep as never, "run_p04", {}),
      (req: unknown, rep: unknown) => controller.evidenceSeries(req as never, rep as never, "run_p04", { kind: "EQUITY" }),
      (req: unknown, rep: unknown) => controller.split(req as never, rep as never, "run_p04", {}),
      (req: unknown, rep: unknown) => controller.freeze(req as never, rep as never, "run_p04", {}),
    ];
    for (const read of reads) {
      const first = reply();
      await read(request({}), first);
      expect(first.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
      const etag = (first.send.mock.calls[0]![0] as { etag: string }).etag;
      for (const candidate of [`W/${etag}`, `"other", ${etag}`]) {
        const again = reply();
        await read(request({ "if-none-match": candidate }), again);
        expect(again.code).toHaveBeenCalledWith(304);
        expect(again.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
      }
    }
  });
});

describe("RF-05 CG-P13-09 · refusals carry a typed lane_state", () => {
  it.each([
    ["COMPLETED", "PENDING_RETENTION"],
    ["RUNNING", "PENDING_SOURCE"],
    ["QUEUED", "PENDING_SOURCE"],
    ["CANCELLED", "NOT_RETAINED_TERMINAL"],
    ["FAILED", "NOT_RETAINED_TERMINAL"],
  ])("a retainable-profile run with status %s refuses with lane_state %s", async (status, laneState) => {
    const { service } = build({ status, adapterContractDigest: "0".repeat(64) });
    await expect(service.split(scope, "run_wfo")).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_CONFLICT",
      status: 409,
      details: { lane_state: laneState, effective_status: status },
    });
  });

  it("a legacy 1.0.8 row is NOT_RETAINED_LEGACY without consulting the P10 binding", async () => {
    const { service, split } = build({ status: "COMPLETED", sourceKind: "LEGACY_1_0_8_METADATA" });
    await expect(service.evidence(scope, "legacy")).rejects.toMatchObject({
      status: 409, details: { lane_state: "NOT_RETAINED_LEGACY" },
    });
    expect(split.hub).not.toHaveBeenCalled();
  });

  it("a durable run without a producer binding stays a typed refusal, not NOT_APPLICABLE", async () => {
    const { service } = build({ status: "QUEUED", adapterContractDigest: undefined });
    await expect(service.split(scope, "draft")).rejects.toMatchObject({ status: 409, details: { lane_state: "PENDING_SOURCE" } });
  });

  it("maps a lane-lookup failure to the current-source vocabulary", async () => {
    const forbidden = build({ status: "COMPLETED", hub: vi.fn().mockRejectedValue(new ResearchSplitError("RESEARCH_SPLIT_FORBIDDEN", "no", 403)) });
    await expect(forbidden.service.split(scope, "run")).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_FORBIDDEN", status: 403 });
    const saturated = build({ status: "COMPLETED", hub: vi.fn().mockRejectedValue(new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "busy", 503)) });
    await expect(saturated.service.split(scope, "run")).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", status: 503 });
  });

  it("a harness without the P10 lookup keeps the typed refusal", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(null),
      runState: vi.fn().mockResolvedValue({ sourceKind: "RESEARCH_DURABLE", effectiveStatus: "COMPLETED" }),
    };
    const service = new ResearchCurrentSourceService(repository as never, config as never);
    await expect(service.split(scope, "run")).rejects.toMatchObject({ status: 409, details: { lane_state: "PENDING_RETENTION" } });
  });

  it("serializes details on the Problem body through the shared filter", () => {
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ headers: { "x-request-id": "req-rf05" } }),
      }),
    };
    new HttpErrorFilter().catch(
      new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "pending", 409, {
        lane_state: "PENDING_RETENTION", effective_status: "COMPLETED",
      }),
      host as never,
    );
    expect(response.send).toHaveBeenCalledWith({
      error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "pending" },
      request_id: "req-rf05",
      details: { lane_state: "PENDING_RETENTION", effective_status: "COMPLETED" },
    });
  });
});

describe("RF-05 CG-P13-09 · published OpenAPI accepts the lane answer and the typed Problem", () => {
  it("validates LaneNotApplicable and Problem.details", async () => {
    const { openApiValidator } = await import("./research-rf05-openapi");
    const { service } = build({ status: "COMPLETED", adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST });
    openApiValidator("research-current-source.openapi.json", "LaneNotApplicable").assert(await service.freeze(scope, "run_p04"));
    const problem = openApiValidator("research-current-source.openapi.json", "Problem");
    problem.assert({
      error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "pending" },
      request_id: "r", details: { lane_state: "NOT_RETAINED_TERMINAL", effective_status: "CANCELLED" },
    });
    expect(problem.check({ error: { code: "X", message: "m" }, details: { lane_state: "SOMETHING_ELSE", effective_status: "X" } })).toBe(false);
  });
});
