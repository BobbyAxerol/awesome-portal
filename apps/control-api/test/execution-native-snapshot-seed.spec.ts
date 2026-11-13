import { describe, expect, it } from "vitest";
import { documentInvalidReason } from "../src/execution/profile-projection.repository";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";
import { managerObservationBaseline, managerObservationSourceSetDigest } from "../src/execution-v2/manager-observation-source";
import { nativeSnapshotSeedDocument, NATIVE_SNAPSHOT_SEED_REASON } from "../src/cli/execution-native-snapshot-seed";

const WS = "11111111-2222-3333-4444-555555555555";
describe("native snapshot seed document", () => {
  it("is a valid projection document, tuple-A stamped, honestly unavailable", () => {
    const d = nativeSnapshotSeedDocument(WS);
    expect(documentInvalidReason(d)).toBeNull();
    expect(d.source_catalogue_sha256).toBe(MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256);
    expect(d.source_catalogue_sha256!.slice(7, 15)).toBe("6d4c4a65");
    const rels = Object.values(d.relations);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ availability: "UNAVAILABLE", reason_code: NATIVE_SNAPSHOT_SEED_REASON, items: [], completeness: "UNKNOWN" });
  });
  it("passes the observation source-set and baseline checks the stored Oct snapshot failed", () => {
    const d = nativeSnapshotSeedDocument(WS);
    const sel = { workspace_id: WS, environment: "paper" as const, profile_id: d.profile_id,
      source_identity_digest: "sha256:" + "1".repeat(64),
      source_contract_revision: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceContractRevision,
      source_catalogue_sha256: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256 };
    const snap = { document: d, sourceEpoch: "portal-seed-x", sourceCursor: "portal-seed:x", sourceAsOf: null, receivedAt: new Date(),
      lastSuccessfulRefreshAt: new Date(), completeness: "UNKNOWN" as const, projectionEpoch: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", projectionSequence: 1,
      payloadDigest: "sha256:" + "2".repeat(64), sourceCatalogueSha256: d.source_catalogue_sha256! };
    expect(() => managerObservationSourceSetDigest(sel, { ...snap, sourceContractRevision: d.source_contract_revision })).not.toThrow();
    expect(managerObservationBaseline(snap as never, sel).source_cursor).toMatch(/\S/);
  });
});
