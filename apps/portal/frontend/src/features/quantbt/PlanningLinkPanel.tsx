/**
 * Research → Planning hand-off (U05 cross-link, v0.4 §P0.23).
 *
 * Closes the New Run flow: once a run has results, the analyst can carry it
 * into the governance surface that tracks the work.
 *
 * The mapping comes from the `portal.links.v1` sidecar. When it declares no
 * task for the feature this panel says so — it never fabricates a task id, and
 * it only navigates to routes the registry validated (FRONTEND_HANDOFF §1/§5).
 */
import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { usePortalContext } from "../../app/context";
import { Callout, Panel, Toolbar } from "../../components/surface";
import { StateView } from "../../components/ui";
import { useLinks } from "../../portal/hooks";

export function PlanningLinkPanel({ runId }: { runId: string }) {
  const { registry } = usePortalContext();
  const links = useLinks();
  const [copied, setCopied] = useState(false);

  const body = (() => {
    if (links.isLoading) return <StateView kind="loading" message="Đang tải cross-link sidecar…" />;
    if (links.isError || !links.data || !Array.isArray(links.data.entries)) {
      return (
        <StateView
          kind="unavailable"
          message="Không đọc được cross-link sidecar, nên không hiển thị liên kết suy đoán."
          onRetry={() => void links.refetch()}
        />
      );
    }

    const entry = links.data.entries.find((item) => item.feature_id === "QUANTBT_RESEARCH");
    if (!entry) {
      return (
        <Callout tone="muted">
          Sidecar chưa map QuantBT Research sang epic/task nào. Chưa có authority mapping — Portal
          không bịa link.
        </Callout>
      );
    }

    const planningRoute =
      registry?.features.find((feature) => feature.id === "PLANNING")?.canonical_route ?? null;

    return (
      <>
        <dl className="portal-details">
          <div className="portal-detail-row">
            <dt className="label">Roadmap epic</dt>
            <dd className="mono">{entry.roadmap_epic_id ?? "chưa map"}</dd>
          </div>
          <div className="portal-detail-row">
            <dt className="label">Planning task</dt>
            <dd className="mono">
              {entry.planning_task_ids.length
                ? entry.planning_task_ids.join(", ")
                : "chưa có authority mapping"}
            </dd>
          </div>
          <div className="portal-detail-row">
            <dt className="label">Run tham chiếu</dt>
            <dd className="mono">{runId}</dd>
          </div>
        </dl>

        <Toolbar>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              // The run id is what a Planning task needs to cite this evidence;
              // the note is copied rather than written, because Portal has no
              // authority to mutate Planning task content from here.
              const note = entry.planning_task_ids.length
                ? `${entry.planning_task_ids.join(", ")} — evidence run ${runId}`
                : `evidence run ${runId}`;
              void navigator.clipboard?.writeText(note).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            <Copy size={12} />
            {copied ? "Đã copy" : "Copy tham chiếu run"}
          </button>

          {planningRoute ? (
            <Link className="btn-primary" to={`${planningRoute}/board`}>
              <ExternalLink size={13} />
              Mở Task Board
            </Link>
          ) : (
            <button type="button" className="btn-primary" disabled title="Registry chưa khai báo route Planning">
              <ExternalLink size={13} />
              Mở Task Board
            </button>
          )}
        </Toolbar>

        <p className="field-hint">
          Portal không ghi trực tiếp vào Planning từ màn này: task là authority riêng, nên liên kết
          được dán vào task thay vì được tạo ngầm.
        </p>
      </>
    );
  })();

  return <Panel title="Liên kết sang Planning">{body}</Panel>;
}
