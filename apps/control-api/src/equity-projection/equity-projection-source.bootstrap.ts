import { retainedReview } from "../execution/retained-read-profile";

/** Bootstrap-only, same boundary as the approval-evidence route: the local Research review stack (retained review profile, local environment,
 * dev auth) and nothing else. Derived from the existing profile; no configuration flag. The mounted route stays source-not-commissioned and
 * deny-all, so every body is typed absence. */
export function equityProjectionSourceDependency(config: { EXECUTION_READ_PROFILE?: string; PORTAL_ENV?: string; AUTH_MODE?: string }):
  { equityProjectionSource?: "SOURCE_DARK" } {
  return retainedReview(config) && config.PORTAL_ENV === "local" && config.AUTH_MODE === "dev" ? { equityProjectionSource: "SOURCE_DARK" } : {};
}
