/**
 * Route-level redirects of the V2 URL contract (review2/07 s2, audit 2026-10-19).
 *
 * Both are client `<Navigate replace>`s that keep every incoming param (context, `workspace_id`, anything
 * a screen reads) and the hash; they are mounted by `ExecutionPreviewRoute` only when the flag of their
 * target screen is on, through their own lazy chunk, so a flag-off build ships and renders nothing new.
 *
 * - `/deployments/alphas/archived` is not a screen (the `archived` manifest key is reserved): it lands on
 *   the Fleet's Archived lens, `?tab=archived` (flag `fleet`).
 * - `/governance/exit-reviews` (no review id) had no subject: it lands on the cockpit's exit-review view,
 *   `/governance/approvals?view=exit-reviews` (flag `cockpit`). `/governance/exit-reviews/:id` is not
 *   redirected; it keeps rendering the cockpit frame.
 */
import { Navigate, useLocation } from "react-router-dom";

export const FLEET_ARCHIVED_PATH = "/deployments/alphas";
export const APPROVALS_PATH = "/governance/approvals";
export const EXIT_REVIEWS_VIEW = "exit-reviews";

function target(path: string, set: Readonly<Record<string, string>>, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(set)) params.set(key, value);
  const query = params.toString();
  return `${path}${query === "" ? "" : `?${query}`}${hash}`;
}

/** The Fleet URL for the old Archived path; a pure function so the mapping is testable without a router. */
export function archivedAlphasUrl(search = "", hash = ""): string {
  return target(FLEET_ARCHIVED_PATH, { tab: "archived" }, search, hash);
}

/** The cockpit URL for the old Exit Reviews root. */
export function exitReviewsRootUrl(search = "", hash = ""): string {
  return target(APPROVALS_PATH, { view: EXIT_REVIEWS_VIEW }, search, hash);
}

export function ArchivedAlphasRedirect() {
  const { search, hash } = useLocation();
  return <Navigate replace to={archivedAlphasUrl(search, hash)} />;
}

export function ExitReviewsRootRedirect() {
  const { search, hash } = useLocation();
  return <Navigate replace to={exitReviewsRootUrl(search, hash)} />;
}
