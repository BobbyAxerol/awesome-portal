import { describe, expect, it, vi } from "vitest";

import { PrincipalService } from "../src/auth/principal";
import {
  ResearchArtifactReserveIngressSchema,
  ResearchArtifactSealIngressSchema,
} from "../src/research/artifact-ingress.contract";
import { ResearchProgressIngressController } from "../src/research/progress-ingress.controller";

const secret = "p05-private-principal-secret-0123456789";
const digest = "a".repeat(64);
const identity = {
  workspace_id: "ws_p05",
  run_id: "rrun_p05",
  job_id: "rjob_p05",
  worker_attempt_id: "rwa_p05",
  lease_epoch: 1,
  artifact_id: "rart_p05",
};
const reserve = { ...identity, retention_class: "RESEARCH_EVIDENCE" };
const seal = {
  ...identity,
  manifest_digest: digest,
  manifest_schema_version: "research.artifact-manifest.v1",
  total_rows: 1,
  total_bytes: 100,
  parts: [{
    table_kind: "run_receipt",
    schema_version: "research.run-receipt.v1",
    part_ordinal: 1,
    relative_path: "tables/run_receipt/part-000001.parquet",
    part_digest: digest,
    row_count: 1,
    byte_count: 100,
    sequence_min: null,
    sequence_max: null,
  }],
};

function request(methods = ["research_progress_writer"]) {
  const token = new PrincipalService(secret).sign({
    principalId: "research-progress-worker",
    username: "research-progress-worker",
    accessSubject: null,
    accessEmail: null,
    role: "ADMIN",
    authnMethods: methods,
    sessionId: "research-progress-worker",
    mustChangePassword: false,
    issuedAt: new Date().toISOString(),
  });
  return { headers: { "x-portal-principal": token } } as never;
}

function controller(enabled = true) {
  const progress = { resolveIngress: vi.fn().mockResolvedValue({
    workspaceId: identity.workspace_id,
    actorUserId: "actor_p05",
    workerAttemptId: identity.worker_attempt_id,
    leaseEpoch: 1,
  }) };
  const metadata = {
    reserveArtifact: vi.fn().mockResolvedValue({
      artifactId: identity.artifact_id,
      artifactRevision: 1,
      storageLocator: "artifacts/rart_p05",
      state: "WRITING",
      replayed: false,
    }),
    sealArtifact: vi.fn().mockResolvedValue({ replayed: false }),
  };
  const instance = new ResearchProgressIngressController(
    {} as never,
    { INTERNAL_PRINCIPAL_SECRET: secret, FEATURE_RESEARCH_RETAINED_ARTIFACTS: enabled ? "true" : "false" } as never,
    progress as never,
    metadata as never,
  );
  return { instance, progress, metadata };
}

describe("P05 private artifact ingress", () => {
  it("accepts only bounded exact reserve/seal shapes", () => {
    expect(ResearchArtifactReserveIngressSchema.safeParse(reserve).success).toBe(true);
    expect(ResearchArtifactSealIngressSchema.safeParse(seal).success).toBe(true);
    expect(ResearchArtifactReserveIngressSchema.safeParse({ ...reserve, storage_locator: "/etc/passwd" }).success).toBe(false);
    expect(ResearchArtifactSealIngressSchema.safeParse({ ...seal, parts: [{ ...seal.parts[0], relative_path: "../secret" }] }).success).toBe(false);
    expect(ResearchArtifactSealIngressSchema.safeParse({ ...seal, parts: [] }).success).toBe(false);
  });

  it("resolves the exact worker tuple before reserve and seal", async () => {
    const { instance, progress, metadata } = controller();
    expect(await instance.reserveArtifact(request(), reserve)).toMatchObject({
      schema_version: "research.artifact-reservation.v1", artifact_revision: 1,
    });
    expect(await instance.sealArtifact(request(), seal)).toMatchObject({
      schema_version: "research.artifact-seal.v1", sealed: true,
    });
    expect(progress.resolveIngress).toHaveBeenCalledWith(reserve);
    expect(progress.resolveIngress).toHaveBeenCalledWith(seal);
    expect(metadata.reserveArtifact).toHaveBeenCalledWith(
      { workspaceId: identity.workspace_id, actorUserId: "actor_p05" },
      expect.objectContaining({ storageLocator: "artifacts/rart_p05", workerAttemptId: identity.worker_attempt_id }),
    );
    expect(metadata.sealArtifact).toHaveBeenCalledWith(
      { workspaceId: identity.workspace_id, actorUserId: "actor_p05" },
      expect.objectContaining({ manifestDigest: digest, parts: [expect.objectContaining({ tableKind: "run_receipt" })] }),
    );
  });

  it("rejects unsigned, wrong-capability and dark requests before DB use", async () => {
    const active = controller();
    await expect(active.instance.reserveArtifact({ headers: {} } as never, reserve)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    await expect(active.instance.reserveArtifact(request(["wrong_capability"]), reserve)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_FORBIDDEN" });
    expect(active.progress.resolveIngress).not.toHaveBeenCalled();
    const dark = controller(false);
    await expect(dark.instance.reserveArtifact(request(), reserve)).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_UNAVAILABLE" });
    expect(dark.progress.resolveIngress).not.toHaveBeenCalled();
  });
});
