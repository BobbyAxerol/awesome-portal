/**
 * Screen 03 · the run meta strip (FE-S03-03, HiFi release-v1.1).
 *
 * `run · status · mode × schedule · alpha × symbol × timeframe · route · engine
 * and config digest`, read verbatim from the P13 Hub's `core.run_identity` and
 * `core.data`. The progress read carries none of these, and none is inferred:
 * a fact the Hub marks unavailable renders as "not published" with its reason
 * in the tooltip, and a refused Hub keeps the strip and says why.
 */

import type { CSSProperties, ReactNode } from "react";

import type { EvidenceHub } from "./evidenceClient";
import { shortDigest } from "./researchFormat";
import type { RunMetaRead } from "./useRunProgress";

type Identity = NonNullable<EvidenceHub["core"]["run_identity"]>;
type Fact = { value: string | number | null; availability: { state: string; reason_code: string | null } };

const MONO = "var(--font-mono)";

export const META_CHIP: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  background: "var(--paper-raised)",
  padding: "1px 8px",
  color: "var(--ink-soft)",
  whiteSpace: "nowrap",
};

/** A Hub fact, or the reason it is absent. Never a guessed value. */
function factText(fact: Fact | undefined): { text: string | null; reason: string | null } {
  if (!fact) return { text: null, reason: "The evidence read does not publish this fact." };
  if (fact.value === null || fact.availability.state !== "AVAILABLE") {
    return { text: null, reason: fact.availability.reason_code ?? fact.availability.state };
  }
  return { text: String(fact.value), reason: null };
}

export function NotPublished({ reason, what = "not published" }: { reason?: string | null; what?: string }) {
  return (
    <span style={{ fontStyle: "italic", color: "var(--ink-faint)" }} title={reason ?? undefined} data-not-published>
      {what}
    </span>
  );
}

function Part({ fact }: { fact: { text: string | null; reason: string | null } }) {
  return fact.text === null ? <NotPublished reason={fact.reason} /> : <>{fact.text}</>;
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
  meta: RunMetaRead;
  /** The status chip and any resolution badge, owned by the screen. */
  status: ReactNode;
  /** Marks the strip as a composition panel on the full screen. */
  panel?: boolean;
}

export function RunMetaStrip({ runId, meta, status, panel = false }: RunMetaStripProps) {
  const hub = meta.state === "ready" ? meta.hub : null;
  const identity: Identity | undefined = hub?.core.run_identity;
  const data = hub?.core.data;

  const mode = factText(identity?.mode);
  const schedule = factText(identity?.schedule);
  const route = factText(identity?.route.id);
  const alpha = identity
    ? identity.binding.availability.state === "AVAILABLE" && identity.binding.alpha_id !== null
      ? { text: identity.binding.alpha_id, reason: null }
      : { text: null, reason: identity.binding.availability.reason_code ?? identity.binding.availability.state }
    : factText(undefined);
  const symbol = data?.symbol ? { text: data.symbol, reason: null } : factText(undefined);
  const timeframe = data?.timeframe ? { text: data.timeframe, reason: null } : factText(undefined);
  const digest = factText(identity?.config_digest);
  const engine = hub?.core.engine_version ?? null;

  return (
    <div
      data-run-meta={meta.state}
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
      <span>
        run <span style={{ color: "var(--ink)", wordBreak: "break-all" }}>{runId}</span>
      </span>
      {status}
      {meta.state === "loading" ? (
        <span data-meta-loading>reading run identity…</span>
      ) : meta.state === "refused" ? (
        <span data-meta-refused>
          run identity <NotPublished reason={meta.reason} />
        </span>
      ) : (
        <>
          <Chip name="mode">
            <Part fact={mode} /> · <Part fact={schedule} />
          </Chip>
          <Chip
            name="binding"
            title={
              identity?.binding.alpha_name
                ? `${identity.binding.alpha_name}${identity.binding.alpha_version_id ? ` · ${identity.binding.alpha_version_id}` : ""}`
                : undefined
            }
          >
            <Part fact={alpha} /> · <Part fact={symbol} /> · <Part fact={timeframe} />
          </Chip>
          <Chip name="route">
            route <Part fact={route} />
          </Chip>
          <span style={{ marginLeft: "auto" }} data-meta="engine" title={digest.text ?? undefined}>
            {engine === null ? (
              <>
                engine <NotPublished reason="The evidence read does not publish the engine version yet." />
              </>
            ) : (
              <>wheel quantbt-engine=={engine}</>
            )}{" "}
            · config{" "}
            {digest.text === null ? <NotPublished reason={digest.reason} /> : <>sha256:{shortDigest(digest.text, 6)}…</>}
          </span>
        </>
      )}
    </div>
  );
}
