/**
 * Alpha import inbox — U14 read surface.
 *
 * The strategy import contract §5 is explicit about what this screen is NOT:
 *
 *   direct file upload from the browser is not accepted
 *
 * So there is no upload control here. The browser is not the channel by which
 * code enters the system; ingest happens server-side from reviewed source. What
 * the operator needs from the Portal is the other half: what is sitting in
 * quarantine, what was rejected and why, and whether a registered artifact
 * still hashes to the digest its manifest claims.
 *
 * Everything on this screen is read-only. Nothing here promotes, approves or
 * registers anything — promotion belongs to the certification slice, and a
 * button that implied otherwise would be the screen lying about its authority.
 *
 * RESOLVED (was FRONTEND_HANDOFF §8.4 / backend request 11): the endpoint used
 * to take two multipart file uploads, which is the browser-upload shape §5 rules
 * out. It now accepts a source reference — `{alpha_id, version, artifact_relpath,
 * expected_digest, git_ref?}` — so the submit form below sends a pointer to an
 * artifact CI already staged, and the multipart path is rejected outright.
 */
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { Callout, Panel, SectionHeading } from "../../components/surface";
import { StateView } from "../../components/ui";
import { api } from "../../lib/api";
import type { AlphaImportRecord } from "../../portal/contracts";
import { QUANTBT_ROOT } from "../quantbt/routes";
import { ImportRequestForm } from "./ImportRequestForm";
import { VerifyDigest } from "./VerifyDigest";
import {
  IMPORT_STATES,
  importCounts,
  importStatePresentation,
  newestFirst,
} from "./importState";

function StateBadge({ state }: { state: AlphaImportRecord["state"] }) {
  const presentation = importStatePresentation(state);
  return (
    <span
      className="badge-state"
      style={{
        color: `var(--state-${presentation.tone})`,
        background: `var(--state-${presentation.tone}-bg)`,
      }}
      title={presentation.meaning}
      data-import-state={state}
    >
      {presentation.label}
    </span>
  );
}

function ImportRow({ record }: { record: AlphaImportRecord }) {
  const presentation = importStatePresentation(record.state);
  return (
    <article className="import-row" data-testid={`import-${record.alpha_id}-${record.version}`}>
      <div className="import-row-head">
        <div>
          <p className="import-alpha">
            {/* The alpha id opens its 360° view — lineage, lifecycle, digest. */}
            <Link
              className="mono import-alpha-id"
              to={`${QUANTBT_ROOT}/alphas/${encodeURIComponent(record.alpha_id)}/${encodeURIComponent(record.version)}`}
            >
              {record.alpha_id}
            </Link>
            <span className="mono import-version">v{record.version}</span>
          </p>
          <p className="mono import-received">received {record.received_at}</p>
        </div>
        <StateBadge state={record.state} />
      </div>

      <p className="import-meaning">{presentation.meaning}</p>

      {/* The service's own reason, when it gave one. Never replaced by our
        * prose — a rejection explains itself in the authority's words. */}
      {record.reason ? <p className="import-reason mono">{record.reason}</p> : null}

      <div className="import-row-foot">
        <span className="mono import-digest-flag">
          digest_ok = {String(record.digest_ok)}
        </span>
        <span className="mono import-id">import {record.import_id.slice(0, 12)}…</span>
        <VerifyDigest alphaId={record.alpha_id} version={record.version} />
      </div>
    </article>
  );
}

export function ImportInbox() {
  const imports = useQuery({ queryKey: ["alpha-imports"], queryFn: api.alphaImports, retry: 1 });

  const records = imports.data ? newestFirst(imports.data) : [];
  const counts = importCounts(records);

  return (
    <div className="space-y-4">
      {/* SectionHeading, not a second ModuleHeader: the QuantBT module already
        * renders the header with the feature's registry maturity. Declaring a
        * maturity here would be inventing static metadata for a screen the
        * registry does not describe — the same mistake as a badge that
        * disagrees with its own data. The real caveat is stated below instead,
        * in the words of the contract. */}
      <SectionHeading
        title="Alpha imports"
        description="Quarantine inbox for imported alphas: state, reason, and digest verification. Read-only."
      />

      {/* Stated up front, because it is the single most important fact about
        * this pipeline and the easiest thing for a reader to assume wrong. */}
      <Callout tone="warning" title="Quarantine is fail-closed">
        No state here means "runnable". A matching digest only queues the alpha; registering it in the
        runtime registry belongs to the certification slice. The strategy picker in{" "}
        <Link to={`${QUANTBT_ROOT}/new`}>New Run</Link> still lists these alphas, each with the reason
        it cannot run.
      </Callout>

      {imports.isLoading ? (
        <StateView kind="loading" message="Loading the quarantine inbox…" />
      ) : imports.isError ? (
        <StateView
          kind="failed"
          message={`/api/v1/alphas/imports could not be read, so no empty inbox is shown in its place. ${
            imports.error instanceof Error ? imports.error.message : ""
          }`}
          onRetry={() => void imports.refetch()}
        />
      ) : (
        <>
          <dl className="program-summary" data-testid="import-summary">
            <div>
              <dt>Trong inbox</dt>
              <dd className="mono">{counts.total}</dd>
            </div>
            {(["QUARANTINED", "DIGEST_MISMATCH"] as const).map((state) => (
              <div key={state}>
                <dt>{importStatePresentation(state).label}</dt>
                {/* A state with no records shows 0 because 0 is the real count
                  * of a list we successfully read — unlike a metric the engine
                  * never computed. */}
                <dd className="mono">{counts.byState[state] ?? 0}</dd>
              </div>
            ))}
          </dl>

          {records.length === 0 ? (
            <StateView
              kind="empty"
              message="No import is in quarantine. That is a genuinely empty inbox, not a read failure."
            />
          ) : (
            <div className="import-list">
              {records.map((record) => (
                <ImportRow key={record.import_id} record={record} />
              ))}
            </div>
          )}
        </>
      )}

      <Panel title="States the contract declares">
        <p className="field-hint">
          The first two are written into the inbox. The other three are rejection responses — they create
          no record, so they never appear in the list above.
        </p>
        <dl className="portal-details">
          {IMPORT_STATES.map((state) => {
            const presentation = importStatePresentation(state);
            return (
              <div className="portal-detail-row" key={state}>
                <dt className="label">
                  <StateBadge state={state} />
                </dt>
                <dd>
                  {presentation.meaning}
                  {!presentation.persisted ? (
                    <span className="mono import-not-persisted"> · not written to the inbox</span>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </Panel>

      <Panel title="Submit an import request">
        <p className="field-hint">
          <span className="inline-flex items-center gap-1">
            <ShieldAlert size={12} aria-hidden="true" />
            Strategy import contract §5: <em>direct file upload from the browser is not
            accepted</em>.
          </span>{" "}
          So this is a <strong>source reference</strong> form, not an upload: the browser sends a pointer to
          an artifact CI or an owner already staged, plus the expected digest, and the server reads and
          verifies it. Every mutation is ADMIN-only at the gateway.
        </p>
        <ImportRequestForm onSubmitted={() => void imports.refetch()} />
      </Panel>
    </div>
  );
}
