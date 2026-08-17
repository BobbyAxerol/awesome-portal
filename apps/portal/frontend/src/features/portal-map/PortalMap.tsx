/**
 * Portal Map — the lifecycle view of the whole product (v0.4 §P0.15).
 *
 * Stages, their order, their maturity and the features attached to them are
 * all registry data. The map explains what exists and what does not; it
 * carries no runtime state, so it never implies a deployment is live.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { ModuleHeader } from "../../app/ModuleHeader";
import { usePortalContext } from "../../app/context";
import { MaturityBadge } from "../../components/semantic";
import { StateView } from "../../components/ui";
import { maturityPresentation } from "../../lib/portalState";
import { lifecycleStages, personaOptions, personasForStage } from "../../portal/navigation";
import { iconFor } from "../../app/icons";

const PERSONA_LABELS: Record<string, string> = {
  manager: "Manager",
  quant_researcher: "Quant researcher",
  operator: "Operator",
  platform_engineer: "Platform engineer",
  portal_user: "Portal user",
};

function personaLabel(persona: string): string {
  return PERSONA_LABELS[persona] ?? persona.replaceAll("_", " ");
}

export function PortalMap() {
  const { registry } = usePortalContext();
  const feature = registry?.features.find((f) => f.id === "PORTAL_MAP") ?? null;
  const [persona, setPersona] = useState<string | null>(null);

  if (!registry) {
    return <StateView kind="loading" message="Đang tải registry…" />;
  }

  const stages = lifecycleStages(registry);
  const featureById = new Map(registry.features.map((f) => [f.id, f]));
  const personas = personaOptions(registry);

  return (
    <>
      <ModuleHeader
        title="Portal Map"
        description="Vòng đời từ ý tưởng alpha đến vận hành live, kèm capability thật đang có ở mỗi chặng."
        maturity={feature?.maturity ?? "PROTOTYPE"}
        dataMode={feature?.data_mode ?? "STATIC_PREVIEW"}
      />

      {personas.length > 0 && (
        <div className="portal-map-personas" role="group" aria-label="Lọc theo persona">
          <span className="mono-label">Persona</span>
          <button
            type="button"
            className={`navtab ${persona === null ? "navtab-active" : ""}`}
            aria-pressed={persona === null}
            onClick={() => setPersona(null)}
          >
            Tất cả
          </button>
          {personas.map((option) => (
            <button
              key={option}
              type="button"
              className={`navtab ${persona === option ? "navtab-active" : ""}`}
              aria-pressed={persona === option}
              onClick={() => setPersona(persona === option ? null : option)}
            >
              {personaLabel(option)}
            </button>
          ))}
        </div>
      )}

      <ol className="portal-map">
        {stages.map((stage, index) => {
          const presentation = maturityPresentation(stage.maturity);
          const stagePersonas = personasForStage(registry, stage);
          const declaresPersona = stagePersonas.length > 0;
          // A stage whose screens declare no persona is NOT filtered away: the
          // registry has not said it is irrelevant to this reader, and hiding
          // it would assert something the data does not support.
          const dimmed = persona !== null && declaresPersona && !stagePersonas.includes(persona);

          return (
            <li
              key={stage.id}
              className="portal-map-stage"
              data-persona-match={persona === null ? undefined : !dimmed}
              style={{ opacity: dimmed ? 0.32 : presentation.opacity }}
            >
              <div className="portal-map-stage-head">
                <span className="portal-map-step mono">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="portal-map-stage-title">{stage.label}</h2>
                <MaturityBadge maturity={stage.maturity} />
              </div>
              <p className="portal-map-stage-desc">{stage.description}</p>
              <p className="portal-map-stage-personas mono">
                {declaresPersona
                  ? `persona (từ screen): ${stagePersonas.map(personaLabel).join(", ")}`
                  : "chưa có screen nào khai báo persona cho stage này"}
              </p>
              <ul className="portal-map-features">
                {stage.feature_ids.map((id) => {
                  const target = featureById.get(id);
                  if (!target) return null;
                  const Icon = iconFor(target.navigation.icon_key);
                  return (
                    <li key={id}>
                      <Link to={target.canonical_route} className="portal-map-feature">
                        <Icon size={13} aria-hidden="true" />
                        <span>{target.label}</span>
                        <MaturityBadge maturity={target.maturity} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      <p className="mono mt-4 text-[11px] text-ink-faint">
        Nguồn: registry revision {registry.revision} · digest {registry.content_digest.slice(0, 19)}…
      </p>
    </>
  );
}
