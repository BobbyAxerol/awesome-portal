/**
 * Command Center — U03.
 *
 * A truthful product map with real operational signal where authority exists,
 * and an explicit state everywhere it does not. Every number on this screen
 * comes from `portal.summary.v1` or `portal.registry.v1`; nothing is derived,
 * inferred or defaulted in the browser (v0.4 §P0.14 data rules).
 *
 * Primary action, per the registry screen contract for COMMAND_CENTER_SCREEN,
 * is "open the highest-priority evidenced item".
 */
import { Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ModuleHeader } from "../../app/ModuleHeader";
import { usePortalContext } from "../../app/context";
import {
  AvailabilityBadge,
  FreshnessIndicator,
  MetricCell,
  MetricStrip,
} from "../../components/semantic";
import { StateView } from "../../components/ui";
import { componentStateFor, reasonCopy } from "../../lib/portalState";
import { PortalRequestError } from "../../portal/client";
import type { PortalSummarySection, PortalSummaryV1, PriorityItem } from "../../portal/contracts";
import { readMetric } from "../../portal/contracts";
import { useSummary } from "../../portal/hooks";
import { lifecycleStages } from "../../portal/navigation";
import { QUANTBT_ROOT } from "../quantbt/routes";
import { MaturityBadge } from "../../components/semantic";
import { Distribution } from "./Distribution";
import { EvidenceDrawer } from "./EvidenceDrawer";
import {
  SECTION_DETAIL_METRICS,
  SECTION_DISTRIBUTION_METRICS,
  SECTION_HEADLINE_METRICS,
  metricLabel,
  priorityTypeLabel,
} from "./labels";

/* -------------------------------------------------------------------------
 * Registry counts
 * ---------------------------------------------------------------------- */

/**
 * The registry, as one line of proportion.
 *
 * Six numbers side by side tell you the counts but not the shape: whether this
 * Portal is mostly built or mostly planned is the first thing a reader wants, and
 * it lives in the ratio. So the counts get a stacked bar above them, in a fixed
 * maturity order (never re-ordered by size, or the same feature would move as the
 * snapshot changes). Every segment is also a labelled figure below, so identity
 * never rests on colour, and a segment with count 0 simply has no width instead of
 * being drawn as a sliver that implies something is there.
 *
 * These are registry counts, not runtime health — the caption says so, because
 * "AVAILABLE" as static metadata and "available" as a live state are different
 * claims (§P0.14).
 */
const MATURITY_ORDER = ["AVAILABLE", "PROTOTYPE", "COMMISSIONED", "BLOCKED", "DEPRECATED"] as const;

function RegistryCounts({ summary }: { summary: PortalSummaryV1 }) {
  const { by_maturity: byMaturity, blocking_concerns: blocking } = summary.registry_counts;
  const counts = MATURITY_ORDER.map((maturity) => ({
    maturity,
    count: byMaturity[maturity] ?? 0,
  }));
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section className="portal-ledger" aria-labelledby="registry-ledger-heading">
      <h2 id="registry-ledger-heading" className="sr-only">
        Registry composition by maturity
      </h2>

      {total > 0 ? (
        <div className="portal-ledger-bar" role="img" aria-label={
          counts
            .filter((entry) => entry.count > 0)
            .map((entry) => `${entry.count} ${entry.maturity}`)
            .join(", ")
        }>
          {counts
            // A zero has no segment: a minimum-width sliver would claim a feature
            // that does not exist.
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <span
                key={entry.maturity}
                className="portal-ledger-segment"
                data-maturity={entry.maturity}
                style={{ flexGrow: entry.count }}
                title={`${entry.count} × ${entry.maturity}`}
              />
            ))}
        </div>
      ) : null}

      <div className="portal-counts">
        {counts.map((entry) => (
          <div key={entry.maturity} className="portal-count" data-maturity={entry.maturity}>
            <span className="portal-count-value mono">{entry.count}</span>
            <span className="portal-count-label mono">
              <span className="portal-count-key" data-maturity={entry.maturity} aria-hidden="true" />
              {entry.maturity}
            </span>
          </div>
        ))}
        <div className="portal-count portal-count-emph">
          <span className="portal-count-value mono">{blocking}</span>
          <span className="portal-count-label mono">BLOCKING CONCERNS</span>
        </div>
      </div>

      <p className="portal-ledger-caption mono">
        {total} features in the registry · product metadata, not runtime state
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Section card
 * ---------------------------------------------------------------------- */

function scalarMetricKeys(section: PortalSummarySection): string[] {
  return Object.keys(section.metrics)
    .filter((key) => !key.startsWith("runs_state_"))
    .slice(0, 6);
}

function SectionCard({
  section,
  onOpenEvidence,
}: {
  section: PortalSummarySection;
  onOpenEvidence: (section: PortalSummarySection) => void;
}) {
  const { registry } = usePortalContext();
  const feature = registry?.features.find((f) => f.id === section.feature_id) ?? null;
  const state = componentStateFor(section.availability);
  const headline = SECTION_HEADLINE_METRICS[section.feature_id] ?? scalarMetricKeys(section);
  const distribution = SECTION_DISTRIBUTION_METRICS[section.feature_id];
  const details = SECTION_DETAIL_METRICS[section.feature_id] ?? [];
  const reason = reasonCopy(section.availability.reason_code);

  return (
    <section className="portal-card" aria-labelledby={`section-${section.feature_id}`}>
      <div className="portal-card-head">
        <h2 id={`section-${section.feature_id}`} className="portal-card-title">
          {section.label}
        </h2>
        <AvailabilityBadge
          state={section.availability.state}
          reasonCode={section.availability.reason_code}
          detail={section.availability.detail}
        />
        <span className="ml-auto flex items-center gap-2">
          <FreshnessIndicator availability={section.availability} />
          {feature ? (
            <Link className="btn-ghost" to={feature.canonical_route}>
              Open {feature.label}
            </Link>
          ) : null}
          {/* Every number on this card has an authority and a provenance in the
            * snapshot; without this they were unreachable. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onOpenEvidence(section)}
            aria-label={`Evidence for ${section.label}`}
          >
            Evidence
          </button>
        </span>
      </div>

      {/* A degraded/denied/unavailable section keeps its header and reason so
          the user learns WHY, instead of seeing an empty card. */}
      {reason ? (
        <p className="portal-card-reason mono" role="note">
          {reason}
          {section.availability.detail ? ` — ${section.availability.detail}` : ""}
        </p>
      ) : null}

      {state === "unavailable" || state === "failed-retryable" || state === "denied" ? (
        <StateView
          kind={state === "denied" ? "denied" : "unavailable"}
          message="The source returned no figures for this snapshot. No value has been replaced by a zero."
        />
      ) : (
        <>
          <MetricStrip>
            {headline.map((key) => (
              <MetricCell
                key={key}
                label={metricLabel(key)}
                metric={readMetric(section, key)}
                unit={readMetric(section, key)?.unit ?? null}
              />
            ))}
          </MetricStrip>

          {distribution ? (
            <div className="mt-4">
              <Distribution section={section} keys={distribution} caption="Distribution" />
            </div>
          ) : null}

          {details.length ? (
            <dl className="portal-details">
              {details.map((key) => {
                const metric = readMetric(section, key);
                const value =
                  metric && metric.value !== null && metric.availability.state !== "unavailable" &&
                  metric.availability.state !== "denied" ? (
                    <span className="mono">{String(metric.value)}</span>
                  ) : (
                    <AvailabilityBadge
                      state={metric?.availability.state ?? "unavailable"}
                      reasonCode={metric?.availability.reason_code ?? null}
                    />
                  );
                return (
                  <div key={key} className="portal-detail-row">
                    <dt className="label">{metricLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
        </>
      )}

      {section.warnings.length ? (
        <ul className="portal-warnings">
          {section.warnings.map((warning) => (
            <li key={`${warning.code}-${warning.observed_at}`} data-severity={warning.severity}>
              <span className="mono text-[10px] uppercase">{warning.severity}</span> {warning.title}
              <span className="text-ink-faint"> — {warning.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Priority list
 * ---------------------------------------------------------------------- */

function PriorityList({ items }: { items: PriorityItem[] }) {
  if (items.length === 0) {
    return (
      <StateView
        kind="empty"
        message="No priority item is evidenced in this snapshot."
      />
    );
  }
  return (
    <ol className="portal-priority">
      {items.map((item) => (
        <li key={item.id} data-severity={item.severity}>
          <Link to={item.route} className="portal-priority-link">
            <span className="portal-priority-severity mono" data-severity={item.severity}>
              {item.severity}
            </span>
            <span className="portal-priority-type mono">{priorityTypeLabel(item.type)}</span>
            <span className="portal-priority-title">{item.title}</span>
            <span className="portal-priority-route mono">{item.route}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------
 * Lifecycle ribbon
 * ---------------------------------------------------------------------- */

function LifecycleRibbon() {
  const { registry } = usePortalContext();
  if (!registry) return null;
  const stages = lifecycleStages(registry);
  return (
    <ol className="portal-lifecycle" aria-label="Product lifecycle">
      {stages.map((stage) => (
        <li key={stage.id} className="portal-lifecycle-stage" data-maturity={stage.maturity}>
          <span className="portal-lifecycle-label">{stage.label}</span>
          <MaturityBadge maturity={stage.maturity} />
          <span className="sr-only">{stage.description}</span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------
 * Screen
 * ---------------------------------------------------------------------- */

export function CommandCenter() {
  const { registry } = usePortalContext();
  const summary = useSummary();
  const [evidenceFeatureId, setEvidenceFeatureId] = useState<string | null>(null);
  const feature = registry?.features.find((f) => f.id === "COMMAND_CENTER") ?? null;

  const header = (
    <ModuleHeader
      title="Command Center"
      description="Product lifecycle, the capability that exists today, and migration progress — from real authorities only."
      maturity={feature?.maturity ?? "PROTOTYPE"}
      dataMode={feature?.data_mode ?? "REAL"}
      actions={
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void summary.refetch()}
          disabled={summary.isFetching}
        >
          <RefreshCw size={13} className={summary.isFetching ? "animate-spin" : undefined} />
          Refresh
        </button>
      }
    />
  );

  if (summary.isLoading) {
    return (
      <>
        {header}
        <StateView kind="loading" message="Collecting the summary…" />
      </>
    );
  }

  if (summary.isError || !summary.data) {
    const error = summary.error;
    const requestId = error instanceof PortalRequestError ? error.requestId : null;
    const retryable = error instanceof PortalRequestError ? error.retryable : true;
    return (
      <>
        {header}
        <StateView
          kind="failed"
          code={requestId ? `request_id ${requestId}` : undefined}
          message={
            "The summary contract failed, so the Command Center shows no figures at all. " +
            (error instanceof Error ? error.message : "")
          }
          onRetry={retryable ? () => void summary.refetch() : undefined}
        />
      </>
    );
  }

  const data = summary.data;
  const top = data.priority_items[0] ?? null;
  // Held by feature_id, not by object: a refetch replaces the section objects,
  // and an open drawer must follow the new snapshot rather than freeze the old.
  const openEvidence = evidenceFeatureId
    ? data.sections.find((section) => section.feature_id === evidenceFeatureId) ?? null
    : null;

  return (
    <>
      <ModuleHeader
        title="Command Center"
        description="Product lifecycle, the capability that exists today, and migration progress — from real authorities only."
        maturity={feature?.maturity ?? "PROTOTYPE"}
        dataMode={feature?.data_mode ?? "REAL"}
        actions={
          <>
            {/* v0.4 §21.3: the Command Center opens the two actions a manager
              * arrives wanting, instead of making them walk the nav to find
              * them. Both are real routes from the QuantBT module. */}
            <Link className="btn-ghost" to={`${QUANTBT_ROOT}/new`}>
              <Plus size={12} />
              New run
            </Link>
            <Link className="btn-ghost" to={`${QUANTBT_ROOT}/imports`}>
              <ShieldAlert size={12} />
              Import alpha
            </Link>
            {top ? (
              <Link className="btn-primary" to={top.route}>
                Open the highest-priority item
              </Link>
            ) : (
              <button className="btn-primary" type="button" disabled title="This snapshot carries no priority item">
                Open the highest-priority item
              </button>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void summary.refetch()}
              disabled={summary.isFetching}
            >
              <RefreshCw size={13} className={summary.isFetching ? "animate-spin" : undefined} />
              Refresh
            </button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <AvailabilityBadge
            state={data.overall_availability.state}
            reasonCode={data.overall_availability.reason_code}
            detail={data.overall_availability.detail}
          />
          <FreshnessIndicator availability={data.overall_availability} />
          <span className="mono text-[11px] text-ink-faint" title={data.registry_digest}>
            registry {data.registry_digest.slice(0, 19)}…
          </span>
        </div>
      </ModuleHeader>

      <RegistryCounts summary={data} />

      {/* Reading order is act → measure → reference. What needs attention comes
        * before the numbers that describe steady state, and the product-lifecycle
        * metadata comes last: it is the least likely thing to change today. The
        * priority list used to sit at the bottom of the scroll, under everything. */}
      <section className="portal-block" aria-labelledby="priority-heading">
        <h2 id="priority-heading" className="portal-block-title">
          Priority items
        </h2>
        <p className="dek">
          The summary contract fixes the order; only three kinds are authorised today.
        </p>
        <PriorityList items={data.priority_items} />
      </section>

      <div className="portal-grid-2">
        {data.sections.map((section) => (
          <SectionCard
            key={section.feature_id}
            section={section}
            onOpenEvidence={(section) => setEvidenceFeatureId(section.feature_id)}
          />
        ))}
      </div>

      <section className="portal-block" aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading" className="portal-block-title">
          Product lifecycle
        </h2>
        <p className="dek">Product metadata from the registry — not runtime state.</p>
        <LifecycleRibbon />
      </section>

      {openEvidence ? (
        <EvidenceDrawer section={openEvidence} onClose={() => setEvidenceFeatureId(null)} />
      ) : null}

    </>
  );
}
