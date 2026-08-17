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
import { useLinks } from "../../portal/hooks";
import { StageBrief } from "./StageBrief";

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
  const [maturity, setMaturity] = useState<string | null>(null);
  const [briefStageId, setBriefStageId] = useState<string | null>(null);
  const links = useLinks();

  if (!registry) {
    return <StateView kind="loading" message="Đang tải registry…" />;
  }

  const stages = lifecycleStages(registry);
  const featureById = new Map(registry.features.map((f) => [f.id, f]));
  const personas = personaOptions(registry);
  // Status filter (§P0.15). Options come from the maturities the stages actually
  // declare, so the filter cannot offer a state no stage is in.
  const maturities = [...new Set(stages.map((stage) => stage.maturity))].sort();
  const briefStage = briefStageId
    ? (stages.find((stage) => stage.id === briefStageId) ?? null)
    : null;

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

      {maturities.length > 1 ? (
        <div className="portal-map-personas" role="group" aria-label="Lọc theo status">
          <span className="mono-label">Status</span>
          <button
            type="button"
            className={`navtab ${maturity === null ? "navtab-active" : ""}`}
            aria-pressed={maturity === null}
            onClick={() => setMaturity(null)}
          >
            Tất cả
          </button>
          {maturities.map((option) => (
            <button
              key={option}
              type="button"
              className={`navtab ${maturity === option ? "navtab-active" : ""}`}
              aria-pressed={maturity === option}
              onClick={() => setMaturity(maturity === option ? null : option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="portal-map">
        {stages.map((stage, index) => {
          const presentation = maturityPresentation(stage.maturity);
          const stagePersonas = personasForStage(stage);
          const declaresPersona = stagePersonas.length > 0;
          // A stage whose screens declare no persona is NOT filtered away: the
          // registry has not said it is irrelevant to this reader, and hiding
          // it would assert something the data does not support.
          // Two independent filters; a stage dims if either excludes it. Status
          // is always declared, so unlike persona there is no "undeclared" case
          // to protect.
          const personaDimmed = persona !== null && declaresPersona && !stagePersonas.includes(persona);
          const maturityDimmed = maturity !== null && stage.maturity !== maturity;
          const dimmed = personaDimmed || maturityDimmed;

          return (
            <li
              key={stage.id}
              className="portal-map-stage"
              data-persona-match={persona === null && maturity === null ? undefined : !dimmed}
              style={{ opacity: dimmed ? 0.32 : presentation.opacity }}
            >
              <div className="portal-map-stage-head">
                <span className="portal-map-step mono">{String(index + 1).padStart(2, "0")}</span>
                {/* The title opens the brief: the stage is the entry point to
                  * everything the registry knows about it. */}
                <button
                  type="button"
                  className="portal-map-stage-open"
                  onClick={() => setBriefStageId(stage.id)}
                  aria-label={`Feature brief cho ${stage.label}`}
                >
                  <h2 className="portal-map-stage-title">{stage.label}</h2>
                </button>
                <MaturityBadge maturity={stage.maturity} />
              </div>
              <p className="portal-map-stage-desc">{stage.description}</p>
              <p className="portal-map-stage-personas mono">
                {declaresPersona
                  ? `persona: ${stagePersonas.map(personaLabel).join(", ")}`
                  : "registry chưa khai báo persona cho stage này"}
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

      {briefStage ? (
        <StageBrief
          registry={registry}
          links={links.data ?? null}
          stage={briefStage}
          onClose={() => setBriefStageId(null)}
        />
      ) : null}

      <p className="mono mt-4 text-[11px] text-ink-faint">
        Nguồn: registry revision {registry.revision} · digest {registry.content_digest.slice(0, 19)}…
      </p>
    </>
  );
}
