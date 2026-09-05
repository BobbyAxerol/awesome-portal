import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import {
  ExecutionRuntimeManifestController,
  ExecutionRuntimeManifestError,
} from "../src/execution/runtime-manifest.controller";
import { ExecutionRuntimeManifestService } from "../src/execution/runtime-manifest.service";

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as Record<string, unknown>;
}

describe("EDS-00 runtime manifest intake", () => {
  it("pins the accepted return pack rather than deriving runtime truth from a URL or local configuration", () => {
    const owner = load("owner-response.v2.json");
    const runtime = load("DEPLOYED_RUNTIME_MANIFEST.json");
    const e5 = load("e5-existing-data-publication.v1.json");
    const e7 = load("e7-return-pack.manifest.json");
    const manager = runtime.runtime_tuple as Record<string, unknown>;
    const managerV2 = manager.manager_v2 as Record<string, unknown>;

    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.sourceCommit).toBe(owner.source_commit);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.edgeCommit).toBe(owner.edge_commit);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.edgeImageDigest).toBe(owner.image_digest);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest).toBe(owner.catalogue_digest);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.servingPolicyDigest).toBe(owner.serving_policy_digest);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount).toBe(managerV2.catalogue_relation_count);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.e5PublicationRevision).toBe(e5.schema_version);
    expect(MAXIMUM_DATA_INTAKE_V1.returnPack.status).toBe(e7.status);
    expect(MAXIMUM_DATA_INTAKE_V1.profiles.map((profile) => profile.profileId)).toEqual([
      "PAPER_BINANCE_USDM", "SANDBOX_BINANCE_USDM", "LIVE_BINANCE_USDM",
    ]);
  });

  it("returns only sanitized intake and named-operation metadata without manufacturing a source probe", () => {
    const manifest = new ExecutionRuntimeManifestService().manifest("ws_primary") as Record<string, any>;
    expect(manifest).toMatchObject({
      schema_version: "portal.execution.runtime-manifest.v1",
      workspace_id: "ws_primary",
      contract_status: { state: "RETURN_PACK_ACCEPTED" },
      runtime_delivery: {
        state: "EDS_01_FIXED_E5_OPERATION_PUBLISHED",
        named_portal_operation: "maximumDataDeploymentPageV1",
        source_probe_performed_by_this_request: false,
      },
      bounds: { maximum_page_rows: 200, maximum_response_bytes: 1_048_576, maximum_cursor_bytes: 4_096 },
      contract_authority: {
        schema_version: "portal.execution.contract-authority.v1",
        generated_digests: { composite: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
        screen_count: 25,
        field_definition_count: 34,
        action_count: 12,
      },
    });
    expect(manifest.read_at_ms).toEqual(expect.any(Number));
    expect(manifest.runtime_delivery.profiles.map((profile: Record<string, unknown>) => profile.portal_bff_delivery))
      .toEqual(["PUBLISHED_FIXED_E5_OPERATION", "PUBLISHED_FIXED_E5_OPERATION", "PUBLISHED_FIXED_E5_OPERATION"]);
    const serialized = JSON.stringify(manifest).toLowerCase();
    // Redaction keys are intentionally visible so a client can tell what is
    // absent. Reject concrete private values/locations instead of rejecting
    // the word "cursor" in the truthful `source_cursor: false` declaration.
    for (const forbidden of [
      "/internal/v2/manager", "/portal/execution/", "authorization: bearer",
      "-----begin", "postgres://", "redis://", "private_key", "client.crt", "client.key",
      "http://", "https://",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the metadata endpoint session/workspace-bound", async () => {
    const service = new ExecutionRuntimeManifestService();
    const controller = new ExecutionRuntimeManifestController(
      service,
      { isMember: async (workspaceId: string, userId: string) => workspaceId === "ws_primary" && userId === "usr_bobby" } as never,
    );
    const request = { portalWorkspaceId: "ws_primary", portalUser: { userId: "usr_bobby" } } as never;
    await expect(controller.manifest(request, {})).resolves.toMatchObject({ workspace_id: "ws_primary" });
    await expect(controller.manifest(request, { workspace_id: "ws_other" })).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND", status: 404,
    });
    await expect(controller.manifest(request, { unknown: "no" })).rejects.toBeInstanceOf(ExecutionRuntimeManifestError);
  });
});
