import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_ADAPTER_ID, IMPORTED_ALPHA_PROFILE } from "./imported-alpha.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_ADAPTER_ID, P04_DELTA_ALPHA_ID, P04_DELTA_ALPHA_VERSION_ID } from "./p04-delta.binding";
import type { ResearchMetadataRepository } from "./repository";
import {isFull03DeltaBinding} from "./full03-delta.binding";

type Version = NonNullable<Awaited<ReturnType<ResearchMetadataRepository["loadRunAdapterEligibility"]>>>;
type Code =
  | "RESEARCH_RUN_PRODUCER_UNAVAILABLE"
  | "RESEARCH_RUN_CREATE_FORBIDDEN"
  | "RESEARCH_RUN_ALPHA_NOT_ACTIVE"
  | "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE";

/**
 * P10's caller/version precheck, shared with the P07 registry. A positive
 * result is NOT run authorization: exact requested spec, fresh preflight,
 * capacity and lease admission are checked only by P10 at create time.
 */
export function researchRunVersionPrecheck(
  user: Pick<PortalUser, "role" | "status" | "mustChangePassword">,
  config: Pick<ControlApiConfig, "FEATURE_RESEARCH_RUN_PRODUCER" | "FEATURE_RESEARCH_IMPORTED_EXECUTION">,
  version: Version,
): { may_create_run: boolean; code: Code | null; message: string | null } {
  const deny = (code: Code, message: string) => ({ may_create_run: false, code, message });
  if (config.FEATURE_RESEARCH_RUN_PRODUCER !== "true") {
    return deny("RESEARCH_RUN_PRODUCER_UNAVAILABLE", "Research run creation is not enabled in this environment.");
  }
  if (user.role !== "ADMIN" || user.status !== "ACTIVE" || user.mustChangePassword) {
    return deny("RESEARCH_RUN_CREATE_FORBIDDEN", "The current account is not eligible to create a Research run.");
  }
  if (config.FEATURE_RESEARCH_IMPORTED_EXECUTION === "true" && version.binding === null &&
      version.sourceDigest !== null && version.declaredContract.schema_version === IMPORTED_ALPHA_PROFILE.source_contract &&
      (version.lifecycleState === "DRAFT" || version.lifecycleState === "ACTIVE")) {
    return deny("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "The imported AlphaVersion has no installed execution adapter binding.");
  }
  if (version.binding?.adapterId === IMPORTED_ALPHA_ADAPTER_ID) {
    if (version.lifecycleState !== "DRAFT" && version.lifecycleState !== "ACTIVE") {
      return deny("RESEARCH_RUN_ALPHA_NOT_ACTIVE", "The bound imported AlphaVersion is neither DRAFT nor active.");
    }
    if (config.FEATURE_RESEARCH_IMPORTED_EXECUTION !== "true") {
      return deny("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "Imported Alpha execution is not enabled in this environment.");
    }
    if (version.binding.contractDigest !== IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST || version.sourceDigest === null) {
      return deny("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "The imported AlphaVersion is not bound to the installed restricted adapter contract.");
    }
    return { may_create_run: true, code: null, message: null };
  }
  if (version.lifecycleState !== "ACTIVE") {
    return deny("RESEARCH_RUN_ALPHA_NOT_ACTIVE", "The bound AlphaVersion is not active.");
  }
  if (!isFull03DeltaBinding(version) && (!version.binding || version.binding.adapterId !== P04_DELTA_ADAPTER_ID ||
      version.binding.contractDigest !== P04_DELTA_ADAPTER_CONTRACT_DIGEST ||
      version.alphaId !== P04_DELTA_ALPHA_ID || version.alphaVersionId !== P04_DELTA_ALPHA_VERSION_ID)) {
    return deny("RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", "No installed durable executor is bound to this active AlphaVersion.");
  }
  return { may_create_run: true, code: null, message: null };
}
