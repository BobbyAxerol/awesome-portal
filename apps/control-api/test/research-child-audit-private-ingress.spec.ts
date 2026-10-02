import { describe, expect, it, vi } from "vitest";
import { PrincipalService } from "../src/auth/principal";
import { ResearchProgressIngressController } from "../src/research/progress-ingress.controller";
import { auditBatch, auditLease, auditRow, auditSeal } from "./research-child-audit-companion.fixture";

const secret = "audit-private-ingress-test-secret-0123456789";
function request(methods = ["research_progress_writer"]) {
  return { headers: { "x-portal-principal": new PrincipalService(secret).sign({
    principalId: "research-progress-worker", username: "research-progress-worker", role: "ADMIN",
    accessSubject: null, accessEmail: null, authnMethods: methods, sessionId: "research-progress-worker",
    mustChangePassword: false, issuedAt: new Date().toISOString(),
  }) } } as never;
}
function setup(flags: Record<string, string> = {}) {
  const progress = { resolveIngress: vi.fn().mockResolvedValue(auditLease) };
  const audit = { appendBatch: vi.fn().mockResolvedValue({ accepted: true }), seal: vi.fn().mockResolvedValue({ sealed: true }) };
  const controller = new ResearchProgressIngressController({} as never, {
    INTERNAL_PRINCIPAL_SECRET: secret, FEATURE_RESEARCH_RETAINED_ARTIFACTS: "true",
    FEATURE_RESEARCH_CURRENT_SOURCE: "true", ...flags,
  } as never, progress as never, {} as never, {} as never, {} as never, audit as never);
  return { controller, progress, audit };
}
describe("private child-audit callback boundary", () => {
  it("validates each envelope then binds it to the live ingress lease", async () => {
    const { controller, progress, audit } = setup();
    const batch = auditBatch([auditRow(0)]), seal = auditSeal([auditRow(0)]);
    await controller.appendChildAudit(request(), batch);
    await controller.sealChildAudit(request(), seal);
    expect(progress.resolveIngress).toHaveBeenNthCalledWith(1, batch);
    expect(progress.resolveIngress).toHaveBeenNthCalledWith(2, seal);
    expect(audit.appendBatch).toHaveBeenCalledWith(auditLease, batch);
    expect(audit.seal).toHaveBeenCalledWith(auditLease, seal);
  });
  it("refuses browser/unsigned principal and dark flags before touching the lease or writer", async () => {
    for (const req of [{ headers: {} }, request(["session"])]) {
      const { controller, progress, audit } = setup();
      await expect(controller.appendChildAudit(req as never, auditBatch([auditRow(0)])))
        .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
      expect(progress.resolveIngress).not.toHaveBeenCalled();
      expect(audit.appendBatch).not.toHaveBeenCalled();
    }
    for (const key of ["FEATURE_RESEARCH_RETAINED_ARTIFACTS", "FEATURE_RESEARCH_CURRENT_SOURCE"]) {
      const { controller, progress } = setup({ [key]: "false" });
      await expect(controller.sealChildAudit(request(), auditSeal([auditRow(0)])))
        .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_UNAVAILABLE" });
      expect(progress.resolveIngress).not.toHaveBeenCalled();
    }
  });
  it("rejects schema/digest and payload-bound violations without resolving a lease", async () => {
    const { controller, progress } = setup();
    await expect(controller.appendChildAudit(request(), { ...auditBatch([auditRow(0)]), batch_digest: "0".repeat(64) }))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    await expect(controller.sealChildAudit(request(), { ...auditSeal([auditRow(0)]), extra: "x".repeat(1_048_577) }))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    expect(progress.resolveIngress).not.toHaveBeenCalled();
  });
  it("does not append or seal after lease refusal", async () => {
    const { controller, progress, audit } = setup();
    progress.resolveIngress.mockRejectedValue({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    await expect(controller.appendChildAudit(request(), auditBatch([auditRow(0)])))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    await expect(controller.sealChildAudit(request(), auditSeal([auditRow(0)])))
      .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    expect(audit.appendBatch).not.toHaveBeenCalled(); expect(audit.seal).not.toHaveBeenCalled();
  });
});
