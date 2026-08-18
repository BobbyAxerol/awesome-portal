/**
 * Evidence drawer for a Command Center section (v0.4 §P0.13).
 *
 * The card shows a handful of headline metrics. The summary contract carries far
 * more per metric than that — the authority that published it (service, contract,
 * endpoint), its provenance (source revision, content digest), `as_of` versus
 * `checked_at`, unit, segment, and the availability state with its reason. None
 * of it was reachable, so a number on the card could not be traced to who said
 * it.
 *
 * This drawer opens exactly that, for every metric in the section — nothing is
 * computed, derived or estimated here. It is a view over what the snapshot
 * already published.
 *
 * SCOPE (FRONTEND_HANDOFF §8.2): cross-filtering and history still need the
 * durable read model from U10. A drawer that offered "show me this metric over
 * time" would be inventing a series the snapshot does not contain, so it does
 * not offer it.
 */
import { X } from "lucide-react";
import { useEffect } from "react";

import { AvailabilityBadge, FreshnessIndicator } from "../../components/semantic";
import { renderMetric } from "../../lib/portalState";
import type { PortalSummarySection, SummaryMetric } from "../../portal/contracts";
import { readMetric } from "../../portal/contracts";
import { metricLabel } from "./labels";

/** One `key: value` line, rendered only when the snapshot published a value. */
function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="evidence-fact">
      <dt className="label">{term}</dt>
      <dd className="mono">{children}</dd>
    </div>
  );
}

/**
 * A field the snapshot left null.
 *
 * Rendered as an explicit "not published" rather than omitted: a missing line
 * reads as "not applicable", and these fields are the audit trail — their
 * absence is itself worth seeing.
 */
function Unpublished() {
  return <span className="evidence-unpublished">not published</span>;
}

function MetricEvidence({ name, metric }: { name: string; metric: SummaryMetric }) {
  const { availability } = metric;
  const authority = availability.authority;
  const provenance = availability.provenance;
  const rendered = renderMetric(metric);

  return (
    <section className="evidence-metric" data-testid={`evidence-${name}`}>
      <header className="evidence-metric-head">
        <div>
          <p className="evidence-metric-label">{metricLabel(name)}</p>
          <p className="mono evidence-metric-key">{name}</p>
        </div>
        <span className="evidence-metric-value">
          {/* Same display contract as the card: a value the source did not
            * publish never becomes a 0. */}
          {rendered.kind === "value" ? (
            <span className="mono">{rendered.text}</span>
          ) : (
            <AvailabilityBadge
              state={availability.state}
              reasonCode={availability.reason_code}
              detail={availability.detail}
            />
          )}
        </span>
      </header>

      <dl className="evidence-facts">
        <Fact term="Unit">{metric.unit ?? <Unpublished />}</Fact>
        <Fact term="Segment">{metric.segment ?? <Unpublished />}</Fact>
        <Fact term="Authority">
          {authority ? (
            <>
              {authority.service} · {authority.contract}
              {authority.endpoint ? ` · ${authority.endpoint}` : ""}
            </>
          ) : (
            <Unpublished />
          )}
        </Fact>
        <Fact term="Source revision">{provenance?.source_revision ?? <Unpublished />}</Fact>
        <Fact term="Content digest">
          {provenance?.content_digest ? (
            provenance.content_digest.slice(0, 23) + "…"
          ) : (
            <Unpublished />
          )}
        </Fact>
        <Fact term="Artifact digest">
          {metric.source_artifact_digest ? (
            metric.source_artifact_digest.slice(0, 23) + "…"
          ) : (
            <Unpublished />
          )}
        </Fact>
        {/* as_of and checked_at are different facts: when the data was true, and
          * when we last asked. Conflating them hides staleness. */}
        <Fact term="as-of">{availability.as_of ?? <Unpublished />}</Fact>
        <Fact term="checked-at">{availability.checked_at ?? <Unpublished />}</Fact>
        <Fact term="Timezone">{metric.timezone ?? <Unpublished />}</Fact>
        <Fact term="Freshness">
          <FreshnessIndicator availability={availability} />
        </Fact>
      </dl>
    </section>
  );
}

export function EvidenceDrawer({
  section,
  onClose,
}: {
  section: PortalSummarySection;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const names = Object.keys(section.metrics).sort();

  return (
    <div className="evidence-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence — ${section.label}`}
        data-testid="evidence-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="evidence-head">
          <div>
            <p className="mono-label">Evidence</p>
            <h2 className="evidence-title">{section.label}</h2>
          </div>
          <button type="button" className="portal-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        <div className="evidence-section-state">
          <AvailabilityBadge
            state={section.availability.state}
            reasonCode={section.availability.reason_code}
            detail={section.availability.detail}
          />
          <FreshnessIndicator availability={section.availability} />
        </div>

        {names.length === 0 ? (
          <p className="evidence-empty">
            The snapshot carries no metric for this section. That is genuinely empty data, not a read
            failure.
          </p>
        ) : (
          <div className="evidence-list">
            {names.map((name) => {
              const metric = readMetric(section, name);
              return metric ? (
                <MetricEvidence key={name} name={name} metric={metric} />
              ) : (
                <section className="evidence-metric" key={name} data-testid={`evidence-${name}`}>
                  <p className="evidence-metric-label">{metricLabel(name)}</p>
                  {/* Malformed rather than absent: the key exists but the
                    * envelope does not parse, and that is not the same as a
                    * metric the source declined to publish. */}
                  <p className="evidence-unpublished">
                    This metric's envelope could not be read, so the Portal infers no value.
                  </p>
                </section>
              );
            })}
          </div>
        )}

        <p className="evidence-foot">
          Every value here comes from the summary snapshot. History over time and cross-filtering need
          U10's durable read model — this drawer builds no series the snapshot does not carry.
        </p>
      </aside>
    </div>
  );
}
