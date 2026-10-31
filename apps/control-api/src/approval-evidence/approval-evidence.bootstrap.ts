import { retainedReview } from "../execution/retained-read-profile";

/** Bootstrap-only. The dark evidence route mounts solely on the local Research review stack (retained review profile, local environment, dev auth),
 * the same boundary the private native CLIs use. This derives from the existing profile; it adds no configuration flag, and no other profile,
 * environment or auth mode can mount it. The mounted route is still deny-all and source-not-commissioned. */
export function approvalEvidenceDependency(config: { EXECUTION_READ_PROFILE?: string; PORTAL_ENV?: string; AUTH_MODE?: string }):
  { approvalEvidence?: "SOURCE_DARK" } {
  return retainedReview(config) && config.PORTAL_ENV === "local" && config.AUTH_MODE === "dev" ? { approvalEvidence: "SOURCE_DARK" } : {};
}
