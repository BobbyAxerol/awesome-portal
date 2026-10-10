import type { ControlApiConfig } from "../config";
import type { ProjectionEnvironment } from "./profile-projection.repository";

/** Reader selection is not source qualification, a worker flag or a stale TTL. */
export function retainedReview(config?: { EXECUTION_READ_PROFILE?: string }): boolean {
  return config?.EXECUTION_READ_PROFILE === "retained_review_v1";
}

export function localProfileReadable(config: ControlApiConfig, environment: ProjectionEnvironment): boolean {
  if (retainedReview(config)) return Boolean(environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : config.EXECUTION_EDGE_LIVE_PROFILE_ID);
  return environment === "paper" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true"
    : environment === "sandbox" ? config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX === "true"
      : config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE === "true";
}

export function projectionExpired(config: ControlApiConfig, refreshedAt: Date): boolean {
  return !retainedReview(config) && Date.now() - refreshedAt.valueOf() > config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS;
}

/** Core workflow scope is NOT the retained source workspace. */
export function coreExecutionRead(path: string): boolean {
  // These are Core-owned catalogues, not source data or delegated authority.
  if (/^\/api\/v1\/execution\/(?:activation\/capabilities|commands\/(?:catalog|tasks))$/.test(path)) return true;
  return /^\/api\/v1\/execution\/(?:command-center(?:\/|$)|governance(?:\/|$)|operations(?:\/|$)|incidents(?:\/|$)|compositions\/(?:command-center|approvals|exit-reviews|waivers|operations|incidents)(?:\/|$))/.test(path);
}
