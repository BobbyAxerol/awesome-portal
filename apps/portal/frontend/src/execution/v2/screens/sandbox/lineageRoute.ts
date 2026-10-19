/**
 * Where a lineage line may link. The published bodies word the href differently: the V1 certification gives the Paper exit
 * as `/deployments/paper/exit/{id}` (no route mounts it: NotFound), the V2 body gives `/governance/exit-reviews/{id}`.
 * Only the shapes below are known; everything else is plain text, never a dead link. The R1/R2 routes and the exit-review
 * route are built by `reviewRouteFor`, the one function the approvals screens use, so this cannot drift from the shell.
 */
import { reviewRouteFor } from "../../../screens/ApprovalInbox";

const SEGMENT = "([^/?#]+)";
const R1 = new RegExp(`^/governance/approvals/${SEGMENT}/r1$`);
const R2 = new RegExp(`^/governance/approvals/${SEGMENT}/r2$`);
const EXIT = new RegExp(`^/(?:deployments/paper/exit|governance/exit-reviews)/${SEGMENT}$`);

function route(gate: "R1" | "R2" | "PAPER_EXIT", segment: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return id === "" ? null : reviewRouteFor({ id: encodeURIComponent(id), gate });
}

/** The mounted route for a lineage href, or null when the shape is not a known one (then the value is shown as text). */
export function lineageRoute(href: string | null | undefined): string | null {
  if (typeof href !== "string") return null;
  const r1 = R1.exec(href);
  if (r1) return route("R1", r1[1]!);
  const r2 = R2.exec(href);
  if (r2) return route("R2", r2[1]!);
  const exit = EXIT.exec(href);
  if (exit) return route("PAPER_EXIT", exit[1]!);
  return null;
}
