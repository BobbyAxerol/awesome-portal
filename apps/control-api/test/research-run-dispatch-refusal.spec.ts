/** Private pre-publish refusal vs ambiguous broker acknowledgement. Synthetic,
 * focused service proof; the PG companion owns atomic lifecycle evidence. */
import { describe, expect, it, vi } from "vitest";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { admissionRepository, flagConfig, manifestFor, p04Requested, w1Admin, w1Scope } from "./research-w1-wfo.fixture";

function fixture() {
  const requested = p04Requested(), manifest = manifestFor(requested), config = flagConfig(false);
  let saved: Record<string, unknown> | undefined;
  const repository = {
    ...admissionRepository(manifest),
    createOrReplayRunProducerIntent: vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
      const replayed = !!saved;
      saved ??= { ...input, dispatchState: "PENDING", portalReceipt: null,
        workerAttemptId: "rwa_refusal", leaseEpoch: 1 };
      return { producer: saved, replayed };
    }),
    claimNextDurableJob: vi.fn(async () => ({ jobId: saved!.jobId, runId: saved!.runId,
      workerAttemptId: "rwa_refusal", leaseEpoch: 1 })),
    recordRunProducerClaim: vi.fn(),
    recordRunProducerDispatched: vi.fn(async () => ({ ...saved!, dispatchState: "DISPATCHED" })),
    recordRunProducerNotDispatched: vi.fn(async (_scope: unknown, input: { receipt: Record<string, unknown> }) => {
      saved!.portalReceipt = input.receipt;
    }),
  };
  const proxy = { handleWrite: vi.fn() };
  const service = new ResearchRunCreateService(repository as never,
    new ResearchRunAdmissionService(repository as never, config as never), proxy as never, config as never);
  const create = () => service.create(w1Admin, w1Scope, { schema_version: "research.run-create.v1",
    client_intent_id: "rci_refusal", preflight_token: manifest.preflightToken, requested_spec: requested,
    intent_kind: "NEW" }, "req_refusal");
  const refusal = () => ({ schema_version: "research.run-dispatch-refusal.v1", outcome: "NOT_DISPATCHED",
    reason_code: "PRODUCER_DISABLED", workspace_id: w1Scope.workspaceId, run_id: saved!.runId,
    job_id: saved!.jobId, worker_attempt_id: "rwa_refusal", lease_epoch: 1 });
  return { repository, proxy, create, refusal };
}

describe("P10 definite pre-publish dispatch refusal", () => {
  it.each(["PRODUCER_DISABLED", "PUBLISHER_NOT_INSTALLED"])("settles %s once and same-intent replay never claims or republishes", async reason => {
    const x = fixture();
    x.proxy.handleWrite.mockImplementation(async () => ({ status: 503, body: { detail: { ...x.refusal(), reason_code: reason } } }));
    for (let i = 0; i < 2; i++) await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_PRODUCER_UNAVAILABLE" });
    expect(x.repository.recordRunProducerNotDispatched).toHaveBeenCalledTimes(1);
    expect(x.repository.claimNextDurableJob).toHaveBeenCalledTimes(1);
    expect(x.proxy.handleWrite).toHaveBeenCalledTimes(1);
    expect(x.repository.recordRunProducerDispatched).not.toHaveBeenCalled();
  });

  it.each(["workspace_id", "run_id", "job_id", "worker_attempt_id", "lease_epoch", "reason_code", "schema_version"])(
    "an unbound or unsupported %s stays UNKNOWN without terminal settlement", async field => {
      const x = fixture();
      x.proxy.handleWrite.mockImplementation(async () => ({ status: 503,
        body: { detail: { ...x.refusal(), [field]: field === "lease_epoch" ? 2 : "different" } } }));
      await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
      expect(x.repository.recordRunProducerNotDispatched).not.toHaveBeenCalled();
    });

  it.each([503, 502, 202])("unclassified HTTP %s cannot erase a committed publish", async status => {
    const x = fixture();
    x.proxy.handleWrite.mockResolvedValue({ status, body: { detail: "research durable producer is unavailable" } });
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    expect(x.repository.recordRunProducerNotDispatched).not.toHaveBeenCalled();
    expect(x.repository.recordRunProducerDispatched).not.toHaveBeenCalled();
  });

  it("a transport exception does not settle a possibly committed job", async () => {
    const x = fixture(); x.proxy.handleWrite.mockRejectedValue(new Error("lost response"));
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    expect(x.repository.recordRunProducerNotDispatched).not.toHaveBeenCalled();
  });

  it("a failed refusal settlement remains UNKNOWN and does not claim success", async () => {
    const x = fixture();
    x.proxy.handleWrite.mockImplementation(async () => ({ status: 503, body: { detail: x.refusal() } }));
    x.repository.recordRunProducerNotDispatched.mockRejectedValue(new Error("stale lease or lost DB acknowledgement"));
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    expect(x.repository.recordRunProducerDispatched).not.toHaveBeenCalled();
  });

  it("acceptance followed by receipt loss stays UNKNOWN without failure settlement", async () => {
    const x = fixture();
    x.proxy.handleWrite.mockImplementation(async () => ({ status: 202, body: { run_id: x.refusal().run_id } }));
    x.repository.recordRunProducerDispatched.mockRejectedValue(new Error("lost receipt"));
    await expect(x.create()).rejects.toMatchObject({ code: "RESEARCH_RUN_TRANSPORT_UNKNOWN" });
    expect(x.repository.recordRunProducerNotDispatched).not.toHaveBeenCalled();
  });
});
