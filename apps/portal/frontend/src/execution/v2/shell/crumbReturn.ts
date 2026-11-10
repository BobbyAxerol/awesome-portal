/**
 * Where the breadcrumb of a review page leads back to (UI review F1 / D9).
 *
 * `/governance/approvals/AP-201/r1` is the cockpit with AP-201 open. Its "Approvals" crumb used to be the bare list, which opens the
 * request that most needs the reader (AP-352), so the reader lost the place they came from. The crumb now carries `sel` (and the
 * workspace the page was read in), and the cockpit selects that card if it is in the queue, or says so if it is not.
 * Pure; every other crumb is returned as it was.
 */

const APPROVALS = "/governance/approvals";
const EXIT_REVIEWS = "/governance/exit-reviews";

/** The review id the path names (`/governance/approvals/:id/{r1,r2,live}`, `/governance/exit-reviews/:id`), or `null`. */
export function reviewIdOfPath(pathname: string): string | null {
  const gate = /^\/governance\/approvals\/([^/]+)\/(?:r1|r2|live)\/?$/.exec(pathname);
  const exit = /^\/governance\/exit-reviews\/([^/]+)\/?$/.exec(pathname);
  const raw = gate?.[1] ?? exit?.[1] ?? null;
  if (raw === null || raw === "new") return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The link of one crumb: the bare route, or the route with the open review as the selection. */
export function crumbHref(route: string, pathname: string, search: string): string {
  if (route !== APPROVALS && route !== EXIT_REVIEWS) return route;
  const id = reviewIdOfPath(pathname);
  if (id === null) return route;
  const params = new URLSearchParams();
  params.set("sel", id);
  const workspace = new URLSearchParams(search).get("workspace_id");
  if (workspace !== null && workspace !== "") params.set("workspace_id", workspace);
  return `${route}?${params.toString()}`;
}
