import { Injectable } from "@nestjs/common";
import { MAXIMUM_DATA_INTAKE_V1 } from "./maximum-data-intake";

/**
 * The browser-visible boundary for EDS-00 is intentionally metadata-only.
 * It says what was verified and what has not been deployed; it never probes a
 * source, infers availability from configuration, or leaks a private target.
 */
@Injectable()
export class ExecutionRuntimeManifestService {
  manifest(workspaceId: string) {
    const intake = MAXIMUM_DATA_INTAKE_V1;
    return {
      schema_version: "portal.execution.runtime-manifest.v1",
      record_authority: "PORTAL_CONTROL",
      workspace_id: workspaceId,
      read_at_ms: Date.now(),
      contract_status: {
        state: "RETURN_PACK_ACCEPTED",
        return_pack_status: intake.returnPack.status,
        manager_contract_revision: intake.returnPack.managerContractRevision,
        source_commit: intake.returnPack.sourceCommit,
        edge_commit: intake.returnPack.edgeCommit,
        edge_image_digest: intake.returnPack.edgeImageDigest,
        catalogue_digest: intake.returnPack.catalogueDigest,
        serving_policy_digest: intake.returnPack.servingPolicyDigest,
        e5_publication_revision: intake.returnPack.e5PublicationRevision,
        e5_publication_manifest_digest: intake.returnPack.e5PublicationManifestDigest,
        e6_acceptance_manifest_digest: intake.returnPack.e6AcceptanceManifestDigest,
        frozen_field_mapping_count: intake.returnPack.frozenFieldMappingCount,
        frozen_screen_count: intake.returnPack.frozenScreenCount,
        genuine_source_gap_count: intake.returnPack.genuineSourceGapCount,
      },
      runtime_delivery: {
        state: "EDS_00_BASELINE_ONLY",
        named_portal_operation: "NOT_YET_PUBLISHED",
        source_probe_performed_by_this_request: false,
        profiles: intake.profiles.map((profile) => ({
          environment: profile.environment,
          profile_id: profile.profileId,
          qualified_delivery: profile.observedDelivery,
          maximum_observed_concurrency: profile.maximumObservedConcurrency,
          portal_bff_delivery: "NOT_YET_PUBLISHED",
        })),
      },
      source_semantics: {
        manager_read: intake.semantics.managerRead,
        global_event_ordering: intake.semantics.globalEventOrdering,
        correction_replay: intake.semantics.correctionReplay,
        total_history: intake.semantics.totalHistory,
        authoritative_empty: intake.semantics.emptyResult,
      },
      bounds: {
        maximum_page_rows: intake.pageBounds.maximumRows,
        maximum_response_bytes: intake.pageBounds.maximumResponseBytes,
        maximum_cursor_bytes: intake.pageBounds.maximumCursorBytes,
      },
      external_gates: intake.externalGates.map((requirement_id) => ({
        requirement_id,
        status: "OWNER_ACTION_REQUIRED",
      })),
      redaction: {
        raw_rows: false,
        source_cursor: false,
        source_origin: false,
        credential_or_certificate: false,
        direct_database_or_redis: false,
      },
    };
  }
}
