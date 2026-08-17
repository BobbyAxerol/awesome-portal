/**
 * Feature brief for a lifecycle stage (v0.4 §P0.15).
 *
 * Clicking a stage opens what the registry knows about it: the features it
 * covers with their maturity and data mode, the concerns that gate it, and the
 * roadmap epic / planning tasks the cross-link sidecar maps to those features.
 *
 * Everything is read from the registry and the links document. Nothing here is a
 * second feature model, and a stage with no concern or no mapped epic says so
 * rather than showing an empty section.
 */
import { X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { MaturityBadge } from "../../components/semantic";
import { dataModeBanner } from "../../lib/portalState";
import type {
  ConcernDefinition,
  LifecycleStageDefinition,
  PortalLinksDocument,
  PortalRegistryDocument,
} from "../../portal/contracts";
import { PLANNING_TASK_ROUTE } from "../planning/planningLinks";

/** Concerns whose `feature_ids` intersect the stage. */
function concernsForStage(
  registry: PortalRegistryDocument,
  stage: LifecycleStageDefinition,
): ConcernDefinition[] {
  const features = new Set(stage.feature_ids);
  return registry.concerns.filter((concern) =>
    concern.feature_ids.some((id) => features.has(id)),
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="brief-section">
      <h3 className="brief-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Absent({ children }: { children: React.ReactNode }) {
  return <p className="brief-absent">{children}</p>;
}

export function StageBrief({
  registry,
  links,
  stage,
  onClose,
}: {
  registry: PortalRegistryDocument;
  links: PortalLinksDocument | null;
  stage: LifecycleStageDefinition;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const featureById = new Map(registry.features.map((feature) => [feature.id, feature]));
  const concerns = concernsForStage(registry, stage);
  // `feature_id` is nullable in the links schema: a sidecar entry can exist
  // without being attached to a feature yet.
  const linkEntries = (links?.entries ?? []).filter(
    (entry) => typeof entry.feature_id === "string" && stage.feature_ids.includes(entry.feature_id),
  );

  return (
    <div className="brief-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="brief-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Feature brief — ${stage.label}`}
        data-testid="stage-brief"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="brief-head">
          <div>
            <p className="mono-label">Lifecycle stage · order {stage.order}</p>
            <h2 className="brief-title">{stage.label}</h2>
          </div>
          <button type="button" className="portal-icon-btn" aria-label="Đóng" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        <p className="brief-desc">{stage.description}</p>

        <Section title="Feature trong stage">
          {stage.feature_ids.length === 0 ? (
            <Absent>Registry chưa gán feature nào cho stage này.</Absent>
          ) : (
            <ul className="brief-features">
              {stage.feature_ids.map((id) => {
                const feature = featureById.get(id);
                if (!feature) {
                  return (
                    <li key={id} className="brief-feature">
                      {/* A stage naming a feature the registry does not define is
                        * an inconsistency worth showing, not hiding. */}
                      <span className="mono">{id}</span>
                      <span className="brief-absent">không có trong registry</span>
                    </li>
                  );
                }
                const modeCaveat = dataModeBanner(feature.data_mode);
                return (
                  <li key={id} className="brief-feature">
                    <Link to={feature.canonical_route}>{feature.label}</Link>
                    <MaturityBadge maturity={feature.maturity} />
                    {/* Data mode is a separate axis from maturity: a PROTOTYPE on
                      * real data and one on a static preview are not the same
                      * claim. */}
                    <span className="brief-datamode mono" title={modeCaveat ?? undefined}>
                      {feature.data_mode}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Concern đang gate stage">
          {concerns.length === 0 ? (
            <Absent>Không có concern nào trong registry trỏ vào feature của stage này.</Absent>
          ) : (
            <ul className="brief-concerns">
              {concerns.map((concern) => (
                <li key={concern.id} className="brief-concern" data-severity={concern.severity}>
                  <p className="brief-concern-head">
                    <span className="mono">{concern.id}</span>
                    <span className="brief-chip">{concern.severity}</span>
                    <span className="brief-chip">{concern.status}</span>
                  </p>
                  <p className="brief-concern-statement">{concern.statement}</p>
                  {concern.activation_gate ? (
                    <p className="brief-gate">
                      <span className="label">Activation gate</span> {concern.activation_gate}
                    </p>
                  ) : null}
                  <p className="brief-refs mono">
                    {concern.feature_ids.length} feature · {concern.screen_ids.length} screen ·{" "}
                    {concern.task_ids.length} task
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Roadmap &amp; task">
          {linkEntries.length === 0 ? (
            <Absent>Cross-link sidecar chưa map feature nào của stage sang epic/task.</Absent>
          ) : (
            <ul className="brief-links">
              {linkEntries.map((entry) => (
                <li key={entry.id} className="brief-link">
                  <span className="mono">{entry.feature_id}</span>
                  <span>
                    epic{" "}
                    {typeof entry.roadmap_epic_id === "string" && entry.roadmap_epic_id ? (
                      <Link to={PLANNING_TASK_ROUTE.roadmap}>{entry.roadmap_epic_id}</Link>
                    ) : (
                      <span className="brief-absent">chưa map</span>
                    )}
                  </span>
                  <span>
                    task{" "}
                    {entry.planning_task_ids.length ? (
                      entry.planning_task_ids.map((taskId) => (
                        <Link key={taskId} to={PLANNING_TASK_ROUTE.task(taskId)}>
                          {taskId}
                        </Link>
                      ))
                    ) : (
                      <span className="brief-absent">chưa map</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}
