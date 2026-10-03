/**
 * P11 stage events — Portal ORCHESTRATION clocks, shown under their own name.
 *
 * `stage_events` records when the Portal's stages ran, not what the engine did:
 * S3 completion can precede the actual study inside S4, and no search-completed,
 * pool-frozen or first-OOS-read order is inferred. So each served time is
 * labelled "orchestration · …", and an engine pool-freeze / first-OOS-read clock
 * is never drawn from them — it would appear only if the source published it.
 * A missing time carries the server's own per-field reason code.
 */

import type { components } from "@portal/contracts-research-current-source";

import { formatUtc } from "./researchFormat";

export type P11StageEvents = components["schemas"]["P11StageEvents"];

const FIELDS: { at: "s3_completed_utc_ms" | "s4_started_utc_ms" | "s4_completed_utc_ms"; reason: "s3_completed" | "s4_started" | "s4_completed"; label: string }[] = [
  { at: "s3_completed_utc_ms", reason: "s3_completed", label: "orchestration · stage 3 completed" },
  { at: "s4_started_utc_ms", reason: "s4_started", label: "orchestration · stage 4 started" },
  { at: "s4_completed_utc_ms", reason: "s4_completed", label: "orchestration · stage 4 completed" },
];

export function OrchestrationClocks({ events }: { events: P11StageEvents | null | undefined }) {
  if (!events) return null;
  /* One muted line; every time (or its server reason) and the disclaimer ride in the tooltip. */
  const rows = FIELDS.map((f) => {
    const ms = events[f.at];
    const text = formatUtc(ms);
    const code = events.reason_codes[f.reason];
    return { f, ms, text, code };
  });
  const summary = `${rows
    .map(({ f, text, code }) => `${f.label}: ${text ?? `not published${code ? ` (${code})` : ""}`}`)
    .join(" · ")} · Portal orchestration times — not an engine pool freeze or first out-of-sample read.`;
  return (
    <div className="flex flex-col gap-0.5" data-orchestration-clocks={events.semantics} data-panel="orchestration-clocks">
      <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }} tabIndex={0} title={summary} aria-label={summary} data-orchestration-note>
        orchestration times
      </span>
      {rows.map(({ f, ms, text, code }) => (
        <span key={f.at} hidden data-orchestration-clock={f.at}>
          {f.label} {text !== null ? <span data-at={ms}>{text}</span> : <span data-reason={code ?? ""}>not published</span>}
        </span>
      ))}
    </div>
  );
}
