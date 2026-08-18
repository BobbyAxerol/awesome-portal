/**
 * Alpha 360° — one version of one alpha.
 *
 * `GET /api/v1/alphas/{id}/versions/{v}` publishes the identity of an alpha
 * version: name, entrypoint, artifact digest and its lifecycle. This screen shows
 * that and offers the one read-only action the contract supports — recompute the
 * artifact digest and compare it to the registered one.
 *
 * It changes nothing. Promotion between lifecycle stages belongs to the
 * certification slice, so there is no promote control here; a button implying one
 * would overstate what this screen can do.
 *
 * ALPHA_POOL stays COMMISSIONED in the registry, so this lives under the QuantBT
 * module rather than at `/research/alphas` — rendering a working screen on a
 * commissioned route would contradict its own badge.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Callout, Panel, SectionHeading } from "../../components/surface";
import { StateView } from "../../components/ui";
import { api } from "../../lib/api";
import type { AlphaVersionDetail as VersionDetail } from "../../portal/contracts";
import { QUANTBT_ROOT } from "../quantbt/routes";
import { VerifyDigest } from "./VerifyDigest";

/**
 * Lifecycle stages, in promotion order.
 *
 * Rendered as a rail so the reader sees where this version sits AND how far it
 * still is from live — a bare stage name hides the distance.
 */
const STAGES: VersionDetail["lifecycle"]["stage"][] = [
  "DRAFT",
  "REGISTERED",
  "CANDIDATE",
  "RESEARCH",
  "PAPER",
  "SANDBOX",
  "LIVE",
];

function LifecycleRail({ stage }: { stage: VersionDetail["lifecycle"]["stage"] }) {
  const current = STAGES.indexOf(stage);
  return (
    <ol className="alpha-rail" data-testid="alpha-lifecycle-rail">
      {STAGES.map((item, index) => (
        <li
          key={item}
          className="alpha-rail-step"
          data-state={index < current ? "past" : index === current ? "current" : "future"}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="alpha-rail-dot" aria-hidden="true" />
          <span className="mono">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function AlphaVersionDetail() {
  const { alphaId = "", version = "" } = useParams();
  const detail = useQuery({
    queryKey: ["alpha-version", alphaId, version],
    queryFn: () => api.alphaVersion(alphaId, version),
    enabled: Boolean(alphaId && version),
    retry: 1,
  });

  return (
    <div className="space-y-4">
      <SectionHeading
        title={detail.data?.name ?? alphaId}
        description={
          <>
            <span className="mono">{alphaId}</span> · v<span className="mono">{version}</span>
          </>
        }
        actions={
          <Link className="btn-ghost" to={`${QUANTBT_ROOT}/imports`}>
            <ArrowLeft size={12} />
            Quarantine inbox
          </Link>
        }
      />

      {detail.isLoading ? (
        <StateView kind="loading" message="Loading the alpha version…" />
      ) : detail.isError || !detail.data ? (
        <StateView
          kind="failed"
          message={`This alpha version could not be read. ${
            detail.error instanceof Error ? detail.error.message : ""
          }`}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <>
          <Panel title="Lifecycle">
            <LifecycleRail stage={detail.data.lifecycle.stage} />

            {detail.data.lifecycle.quarantined ? (
              <Callout tone="danger" title="Quarantined">
                {/* The reason is the service's, quoted. */}
                {detail.data.lifecycle.quarantine_reason ??
                  "The service gave no quarantine reason for this version."}
              </Callout>
            ) : null}

            <dl className="portal-details">
              <div className="portal-detail-row">
                <dt className="label">Stage</dt>
                <dd className="mono">{detail.data.lifecycle.stage}</dd>
              </div>
              <div className="portal-detail-row">
                <dt className="label">Certification</dt>
                <dd className="mono">
                  {detail.data.lifecycle.certification ?? (
                    <span className="alpha-absent">not certified</span>
                  )}
                </dd>
              </div>
              <div className="portal-detail-row">
                <dt className="label">Promotion evidence</dt>
                <dd>
                  {detail.data.lifecycle.promotion_evidence.length ? (
                    <ul className="alpha-evidence mono">
                      {detail.data.lifecycle.promotion_evidence.map((ref: string) => (
                        <li key={ref}>{ref}</li>
                      ))}
                    </ul>
                  ) : (
                    /* No evidence is a fact about the promotion trail, not a
                     * missing field to hide. */
                    <span className="alpha-absent">no evidence recorded yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Artifact identity">
            <dl className="portal-details">
              <div className="portal-detail-row">
                <dt className="label">Entrypoint</dt>
                <dd className="mono alpha-wrap">{detail.data.entrypoint}</dd>
              </div>
              <div className="portal-detail-row">
                <dt className="label">Artifact digest</dt>
                <dd className="mono alpha-wrap">{detail.data.artifact_digest}</dd>
              </div>
            </dl>
            <VerifyDigest alphaId={alphaId} version={version} />
          </Panel>

          <Callout tone="muted">
            This screen is read-only. Moving a stage belongs to the certification slice — the Portal has
            no authority to promote from here.
          </Callout>
        </>
      )}
    </div>
  );
}
