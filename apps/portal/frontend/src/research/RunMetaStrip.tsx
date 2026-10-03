/**
 * Screen 03 · the run meta strip (FE-S03-03, HiFi release-v1.1).
 *
 * `run · status · protocol · mode · schedule · alpha · symbol · timeframe ·
 * route · engine release and config digest`, read verbatim from the progress
 * read's own `run` identity (CG-P11-03): stored facts from the P10 producer
 * row and its immutable P08 manifest. Nothing is inferred, and nothing needs
 * a second read — the strip is present on every progress read. A fact the
 * server sends as `null` renders as "not published"; a read without `run` (a
 * server older than W2) keeps the strip and says so.
 */

import type { CSSProperties, ReactNode } from "react";

import type { ProgressRunIdentity } from "./progressClient";
import { shortDigest } from "./researchFormat";
import { ShortId } from "./ShortId";

const MONO = "var(--font-mono)";

export const META_CHIP: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  background: "var(--paper-raised)",
  padding: "1px 8px",
  color: "var(--ink-soft)",
  whiteSpace: "nowrap",
};

/** Why an identity fact is missing, said once in its tooltip. */
export const IDENTITY_NOT_PUBLISHED = "The progress read does not publish this identity fact for this run.";

export function NotPublished({ reason, what = "not published" }: { reason?: string | null; what?: string }) {
  return (
    <span style={{ fontStyle: "italic", color: "var(--ink-faint)" }} title={reason ?? undefined} data-not-published>
      {what}
    </span>
  );
}

function Part({ value }: { value: string | null | undefined }) {
  return value === null || value === undefined ? <NotPublished reason={IDENTITY_NOT_PUBLISHED} /> : <>{value}</>;
}

function Chip({ children, name, title }: { children: ReactNode; name: string; title?: string }) {
  return (
    <span style={META_CHIP} data-meta={name} title={title}>
      {children}
    </span>
  );
}

export interface RunMetaStripProps {
  runId: string;
  /** `read.run`: `undefined` while no read has arrived, `null` when the server sent none. */
  identity: ProgressRunIdentity | null | undefined;
  /** The status chip and any resolution badge, owned by the screen. */
  status: ReactNode;
  /** Marks the strip as a composition panel on the full screen. */
  panel?: boolean;
  /** W4A: the page title already names the run; the strip keeps only the status chip and the identity chips. */
  omitRunStatus?: boolean;
}

export function RunMetaStrip({ runId, identity, status, panel = false, omitRunStatus = false }: RunMetaStripProps) {
  const state = identity === undefined ? "loading" : identity === null ? "not-published" : "ready";
  return (
    <div
      data-run-meta={state}
      data-research-panel={panel ? "run meta" : undefined}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 16px",
        padding: "6px 12px",
        border: "1px solid var(--line-soft)",
        borderRadius: 3,
        background: "var(--paper-sunken)",
        fontFamily: MONO,
        fontSize: 11,
        color: "var(--ink-faint)",
        minWidth: 0,
      }}
    >
      {omitRunStatus ? null : (
        <span>
          run <span style={{ color: "var(--ink)" }}><ShortId id={runId} label="run" /></span>
        </span>
      )}
      {status}
      {identity === undefined ? (
        <span data-meta-loading>reading run identity…</span>
      ) : identity === null ? (
        <span data-meta-refused>
          run identity <NotPublished reason="This server's progress read does not publish run identity." />
        </span>
      ) : (
        <>
          <Chip name="mode">
            <Part value={identity.protocol} /> · <Part value={identity.mode} /> · <Part value={identity.schedule} />
          </Chip>
          <Chip
            name="binding"
            title={`${identity.alpha.alpha_name ? `${identity.alpha.alpha_name} · ` : ""}${identity.alpha.alpha_version_id}`}
          >
            {identity.alpha.alpha_id} · <Part value={identity.instrument.symbol} /> · <Part value={identity.instrument.timeframe} />
          </Chip>
          <Chip name="route">
            route <Part value={identity.execution_route} />
          </Chip>
          <span
            style={{ marginLeft: "auto" }}
            data-meta="engine"
            title={[identity.execution_profile_id, identity.config_digest ?? null].filter(Boolean).join(" · ")}
          >
            engine <Part value={identity.engine_release_id} /> · config{" "}
            {identity.config_digest ? <>sha256:{shortDigest(identity.config_digest, 6)}…</> : <Part value={null} />}
          </span>
        </>
      )}
    </div>
  );
}
