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
import { RefreshCw } from "lucide-react";
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

function RegistryCounts({ summary }: { summary: PortalSummaryV1 }) {
  const { by_maturity: byMaturity, blocking_concerns: blocking } = summary.registry_counts;
  const order = ["AVAILABLE", "PROTOTYPE", "COMMISSIONED", "BLOCKED", "DEPRECATED"] as const;
  return (
    <div className="portal-counts">
      {order.map((maturity) => (
        <div key={maturity} className="portal-count">
          <span className="portal-count-value mono">{byMaturity[maturity] ?? 0}</span>
          <span className="portal-count-label mono">{maturity}</span>
        </div>
      ))}
      <div className="portal-count portal-count-emph">
        <span className="portal-count-value mono">{blocking}</span>
        <span className="portal-count-label mono">BLOCKING CONCERNS</span>
      </div>
    </div>
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
              Mở {feature.label}
            </Link>
          ) : null}
          {/* Every number on this card has an authority and a provenance in the
            * snapshot; without this they were unreachable. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onOpenEvidence(section)}
            aria-label={`Evidence cho ${section.label}`}
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
          message="Nguồn không trả về số liệu cho snapshot này. Không có giá trị nào được thay bằng 0."
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
              <Distribution section={section} keys={distribution} caption="Phân bố" />
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
        message="Không có mục ưu tiên nào được evidence trong snapshot này."
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
    <ol className="portal-lifecycle" aria-label="Vòng đời sản phẩm">
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
      description="Product lifecycle, capability hiện có và tiến độ migration — chỉ từ authority thật."
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
          Làm mới
        </button>
      }
    />
  );

  if (summary.isLoading) {
    return (
      <>
        {header}
        <StateView kind="loading" message="Đang thu thập summary…" />
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
            "Summary contract lỗi nên Command Center không hiển thị số liệu nào. " +
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
        description="Product lifecycle, capability hiện có và tiến độ migration — chỉ từ authority thật."
        maturity={feature?.maturity ?? "PROTOTYPE"}
        dataMode={feature?.data_mode ?? "REAL"}
        actions={
          <>
            {top ? (
              <Link className="btn-primary" to={top.route}>
                Mở mục ưu tiên cao nhất
              </Link>
            ) : (
              <button className="btn-primary" type="button" disabled title="Snapshot hiện không có mục ưu tiên nào">
                Mở mục ưu tiên cao nhất
              </button>
            )}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void summary.refetch()}
              disabled={summary.isFetching}
            >
              <RefreshCw size={13} className={summary.isFetching ? "animate-spin" : undefined} />
              Làm mới
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
          Vòng đời sản phẩm
        </h2>
        <p className="dek">Metadata sản phẩm từ registry — không phải trạng thái runtime.</p>
        <LifecycleRibbon />
      </section>

      {openEvidence ? (
        <EvidenceDrawer section={openEvidence} onClose={() => setEvidenceFeatureId(null)} />
      ) : null}

      <section className="portal-block" aria-labelledby="priority-heading">
        <h2 id="priority-heading" className="portal-block-title">
          Mục ưu tiên
        </h2>
        <p className="dek">
          Thứ tự do summary contract quyết định; chỉ ba loại hiện được uỷ quyền.
        </p>
        <PriorityList items={data.priority_items} />
      </section>
    </>
  );
}
