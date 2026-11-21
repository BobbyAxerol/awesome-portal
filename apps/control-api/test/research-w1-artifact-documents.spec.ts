import { describe, expect, it } from "vitest";

import { ResearchArtifactSealIngressSchema } from "../src/research/artifact-ingress.contract";
import { ResearchMetadataRepository } from "../src/research/repository";

/**
 * W1 preview finding: the RS-02 export writes manifest-bound JSON documents
 * whose bytes are in the manifest totals. A P05 seal that named only Parquet
 * parts could never satisfy the totals check (every real WFO run failed with
 * RESEARCH_INVALID_INPUT). The seal now names those documents too.
 */
const DIGEST = "a".repeat(64);
const scope = { workspaceId: "ws_w1", actorUserId: "user_w1" };
const REACHED_DATABASE = new Error("validation passed; database reached");

function repository() {
  return new ResearchMetadataRepository({ connect: async () => { throw REACHED_DATABASE; } } as never);
}

function seal(overrides: Record<string, unknown> = {}) {
  return {
    artifactId: "rart_w1",
    workerAttemptId: "rwa_w1",
    leaseEpoch: 1,
    manifestDigest: DIGEST,
    manifestSchemaVersion: "research.artifact-manifest.v1" as const,
    totalRows: 3,
    totalBytes: 150,
    parts: [{
      tableKind: "trials", schemaVersion: "research.current-source-trials.v1", partOrdinal: 1,
      relativePath: "tables/trials/part-000001.parquet", partDigest: DIGEST, rowCount: 3, byteCount: 100,
      sequenceMin: "0", sequenceMax: "2",
    }],
    documents: [{ name: "summary", relativePath: "documents/summary.json", documentDigest: DIGEST, byteCount: 50 }],
    ...overrides,
  };
}

describe("W1 P05 seal names manifest-bound documents", () => {
  it("accepts totals equal to parts plus documents", async () => {
    await expect(repository().sealArtifact(scope, seal())).rejects.toBe(REACHED_DATABASE);
  });

  it("keeps the P04 shape (no documents) unchanged", async () => {
    await expect(repository().sealArtifact(scope, seal({ documents: undefined, totalBytes: 100 }))).rejects.toBe(REACHED_DATABASE);
  });

  it("refuses totals that leave a document out", async () => {
    await expect(repository().sealArtifact(scope, seal({ documents: [] }))).rejects.toMatchObject({ code: "RESEARCH_INVALID_INPUT", status: 400 });
  });

  it("refuses a document outside documents/ or named twice", async () => {
    const escaped = [{ name: "summary", relativePath: "tables/summary.json", documentDigest: DIGEST, byteCount: 50 }];
    await expect(repository().sealArtifact(scope, seal({ documents: escaped }))).rejects.toMatchObject({ code: "RESEARCH_INVALID_INPUT" });
    const twice = [
      { name: "summary", relativePath: "documents/summary.json", documentDigest: DIGEST, byteCount: 25 },
      { name: "summary", relativePath: "documents/summary.json", documentDigest: DIGEST, byteCount: 25 },
    ];
    await expect(repository().sealArtifact(scope, seal({ documents: twice }))).rejects.toMatchObject({ code: "RESEARCH_INVALID_INPUT" });
  });

  it("the ingress schema admits the documents list and still rejects unknown keys", () => {
    const identity = { workspace_id: "ws_w1", run_id: "rrun_w1", job_id: "rjob_w1", worker_attempt_id: "rwa_w1", lease_epoch: 1, artifact_id: "rart_w1" };
    const body = {
      ...identity, manifest_digest: DIGEST, manifest_schema_version: "research.artifact-manifest.v1", total_rows: 3, total_bytes: 150,
      parts: [{ table_kind: "trials", schema_version: "research.current-source-trials.v1", part_ordinal: 1,
        relative_path: "tables/trials/part-000001.parquet", part_digest: DIGEST, row_count: 3, byte_count: 100, sequence_min: "0", sequence_max: "2" }],
      documents: [{ name: "summary", relative_path: "documents/summary.json", document_digest: DIGEST, byte_count: 50 }],
    };
    expect(ResearchArtifactSealIngressSchema.safeParse(body).success).toBe(true);
    expect(ResearchArtifactSealIngressSchema.safeParse({ ...body, documents: [{ ...body.documents[0], path: "x" }] }).success).toBe(false);
  });
});
