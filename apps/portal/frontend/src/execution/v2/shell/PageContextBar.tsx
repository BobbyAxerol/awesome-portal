/**
 * The context bar of the V2 pages that are mounted outside `ExecutionPreviewRoute` (Profile & Access, Users): the audit found no
 * bar at all on them (2026-10-23, Access 1 and Users 1). Same `ConnectedContextBar`, so basis and scope are stated exactly as on every
 * other route; neither page's read takes an environment or a window, and the bar says so instead of offering a switch.
 *
 * It carries its own surface because the pages draw theirs underneath: the bar needs the type roles the surface defines, and it must
 * not borrow a surface it does not own. Lazy-mounted by `PortalRoutes` behind the raw env string, and only while the page's own
 * flag mounts the V2 page, so a flag-off build renders nothing new.
 */
import { ExecutionSurface } from "../../ExecutionSurface";
import { ConnectedContextBar, type EnvLock } from "./ContextBar";

export const PAGE_ENV_LOCK: EnvLock = { reason: "Not applied here. This page's read has no environment filter.", unapplied: true };

export default function PageContextBar() {
  return (
    <ExecutionSurface kind="deployments" className="exec-page-ctxbar">
      <ConnectedContextBar envLock={PAGE_ENV_LOCK} />
    </ExecutionSurface>
  );
}
