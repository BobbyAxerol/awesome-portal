import type { ControlApiConfig } from "../config";
import type { ProjectionEnvironment } from "./profile-projection.repository";

/** Aggregate serialized DATA budget, not a heap, response or authority limit. */
export const RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES = 16 * 1024 * 1024;

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
  // Additive scoped technical reader keeps Core authority; V1 retains the
  // historical source-workspace compatibility behavior below.
  if (path === "/api/v1/execution/runtime-manifest/v2") return true;
  if (path === "/api/v1/execution/technical/service-heartbeats") return true;
  // This additive exact-target status collection is Core-owned. Do not
  // broaden neighboring legacy capital detail routes or mutation access.
  if (path === "/api/v1/execution/capital-commands") return true;
  // Named registry status is Core workflow metadata, never the retained source
  // workspace. SessionGuard still rejects ALL retained-profile POSTs first.
  if (/^\/api\/v1\/execution\/instance-registrations\/ecm_[a-f0-9]{32}(?![\s\S])/u.test(path)) return true;
  if (/^\/api\/v1\/execution\/pending-recalls\/ecm_[a-f0-9]{32}(?![\s\S])/u.test(path)) return true;
  // Additive local workflow GET only. No neighboring detail/mutation exemption.
  if (/^\/api\/v1\/execution\/capital-commands\/ecm_[a-f0-9]{32}\/workflow$/.test(path)) return true;
  // Existing Core-owned gate envelopes keep the caller's workflow workspace;
  // they are not Manager deployment reads from the retained source workspace.
  if (/^\/api\/v1\/execution\/deployments\/[^/]+\/(?:canary|live)$/.test(path)) return true;
  // These are Core-owned catalogues, not source data or delegated authority.
  if (/^\/api\/v1\/execution\/(?:activation\/capabilities|commands\/(?:catalog|tasks))$/.test(path)) return true;
  return /^\/api\/v1\/execution\/(?:command-center(?:\/|$)|governance(?:\/|$)|operations(?:\/|$)|incidents(?:\/|$)|compositions\/(?:command-center|approvals|exit-reviews|waivers|operations|incidents)(?:\/|$))/.test(path);
}
