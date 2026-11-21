import { describe, expect, it, vi } from "vitest";
import { PrincipalService } from "../src/auth/principal";
import { ResearchProgressIngressController } from "../src/research/progress-ingress.controller";
import { replayBatch, replayLease, replayRow, replaySeal } from "./research-fixed-replay-companion.fixture";

const secret = "fixed-replay-private-test-secret-0123456789";
function request(methods = ["research_progress_writer"]) {
  return { headers: { "x-portal-principal": new PrincipalService(secret).sign({
    principalId: "research-progress-worker", username: "research-progress-worker", role: "ADMIN",
    accessSubject: null, accessEmail: null, authnMethods: methods, sessionId: "research-progress-worker",
    mustChangePassword: false, issuedAt: new Date().toISOString(),
  }) } } as never;
}
function setup(flags: Record<string, string> = {}) {
  const progress = { resolveIngress: vi.fn().mockResolvedValue(replayLease) };
  const replay = { appendBatch: vi.fn().mockResolvedValue({ accepted: true }), seal: vi.fn().mockResolvedValue({ sealed: true }) };
  const controller = new ResearchProgressIngressController({} as never, {
    INTERNAL_PRINCIPAL_SECRET: secret, FEATURE_RESEARCH_RETAINED_ARTIFACTS: "true",
    FEATURE_RESEARCH_CURRENT_SOURCE: "true", ...flags,
  } as never, progress as never, {} as never, {} as never, {} as never, undefined, replay as never);
  return { controller, progress, replay };
}
describe("private fixed replay callback boundary", () => {
  it("resolves the exact live worker lease for bounded source-bound batch/seal", async () => {
    const { controller, progress, replay } = setup();
    const batch = replayBatch([replayRow(0)]), seal = replaySeal([replayRow(0)]);
    await controller.appendFixedReplay(request(), batch);
    await controller.sealFixedReplay(request(), seal);
    expect(progress.resolveIngress).toHaveBeenNthCalledWith(1, batch);
    expect(progress.resolveIngress).toHaveBeenNthCalledWith(2, seal);
    expect(replay.appendBatch).toHaveBeenCalledWith(replayLease, batch);
    expect(replay.seal).toHaveBeenCalledWith(replayLease, seal);
  });
  it("rejects unsigned/browser principals, dark flags and invalid payloads before the writer", async () => {
    for (const req of [{ headers: {} }, request(["session"])]) {
      const { controller, progress } = setup();
      await expect(controller.sealFixedReplay(req as never, replaySeal([replayRow(0)])))
        .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
      expect(progress.resolveIngress).not.toHaveBeenCalled();
    }
    for (const key of ["FEATURE_RESEARCH_RETAINED_ARTIFACTS", "FEATURE_RESEARCH_CURRENT_SOURCE"]) {
      const { controller, progress } = setup({ [key]: "false" });
      await expect(controller.appendFixedReplay(request(), replayBatch([replayRow(0)])))
        .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_UNAVAILABLE" });
      expect(progress.resolveIngress).not.toHaveBeenCalled();
    }
    const { controller, progress } = setup();
    await expect(controller.appendFixedReplay(request(), { ...replayBatch([replayRow(0)]), batch_digest: "0".repeat(64) }))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    await expect(controller.sealFixedReplay(request(), { ...replaySeal([replayRow(0)]), extra: "x".repeat(1_048_577) }))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    expect(progress.resolveIngress).not.toHaveBeenCalled();
  });
  it("never appends after lease refusal and admits typed source absence only as a seal", async () => {
    const { controller, progress, replay } = setup();
    const absent = replaySeal([], true);
    await controller.sealFixedReplay(request(), absent);
    expect(replay.seal).toHaveBeenCalledWith(replayLease, absent);
    progress.resolveIngress.mockRejectedValue({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    await expect(controller.appendFixedReplay(request(), replayBatch([replayRow(0)])))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    expect(replay.appendBatch).not.toHaveBeenCalled();
  });
});
