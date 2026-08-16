/**
 * Feature ↔ epic/task cross-links (U05, v0.4 §P0.23).
 *
 * Renders the versioned `portal.links.v1` sidecar so a manager can move
 * feature → epic → task → feature without losing context.
 *
 * Two rules from FRONTEND_HANDOFF §1 shape this component:
 *  - an empty `planning_task_ids` means "no authority mapping yet", so it says
 *    so instead of inventing a task link;
 *  - `prototype_route` is a validated registry route, opened directly; no
 *    arbitrary URL from the response ever enters navigation.
 */
import { Link } from "react-router-dom";

import { StateView } from "../../components/ui";
import type { PortalLinksDocument, PortalRegistryDocument } from "../../portal/contracts";

export function PlanningCrossLinks({
  registry,
  links,
  isLoading,
  isError,
}: {
  registry: PortalRegistryDocument;
  links: PortalLinksDocument | null;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <details className="portal-crosslinks">
        <summary>Liên kết Portal ↔ Planning</summary>
        <StateView kind="loading" message="Đang tải cross-link sidecar…" />
      </details>
    );
  }

  if (isError || !links || !Array.isArray(links.entries)) {
    return (
      <details className="portal-crosslinks">
        <summary>Liên kết Portal ↔ Planning</summary>
        <StateView
          kind="unavailable"
          message="Không đọc được cross-link sidecar. Không hiển thị liên kết suy đoán."
        />
      </details>
    );
  }

  // Only feature-level entries: screen-level rows belong in the screen drawer,
  // not in a module-wide list.
  const entries = links.entries.filter((entry) => entry.feature_id !== null);
  const featureById = new Map(registry.features.map((f) => [f.id, f]));
  const validRoutes = new Set(registry.features.map((f) => f.canonical_route));

  return (
    <details className="portal-crosslinks">
      <summary>
        Liên kết Portal ↔ Planning
        <span className="mono text-[11px] text-ink-faint">
          {" "}
          · {links.integrity.dangling_links} dangling · revision {links.links_revision}
        </span>
      </summary>

      <table className="portal-crosslinks-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Roadmap epic</th>
            <th>Planning tasks</th>
            <th>Figma</th>
            <th>Mở màn hình</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const feature = entry.feature_id ? featureById.get(entry.feature_id) : undefined;
            // Never navigate to a route the registry does not declare.
            const route =
              entry.prototype_route && validRoutes.has(entry.prototype_route)
                ? entry.prototype_route
                : (feature?.canonical_route ?? null);
            return (
              <tr key={entry.id}>
                <td>{feature?.label ?? entry.feature_id}</td>
                <td className="mono">{entry.roadmap_epic_id ?? "—"}</td>
                <td className="mono">
                  {entry.planning_task_ids.length ? (
                    entry.planning_task_ids.join(", ")
                  ) : (
                    <span className="text-ink-faint">chưa có authority mapping</span>
                  )}
                </td>
                <td className="mono">{entry.figma_frame_id ?? "—"}</td>
                <td>
                  {route ? (
                    <Link className="btn-ghost" to={route}>
                      Mở
                    </Link>
                  ) : (
                    <span className="mono text-[11px] text-ink-faint">không có route</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
