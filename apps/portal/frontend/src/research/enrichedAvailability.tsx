/**
 * B7 (Codex `8829f7a0`): `enriched_analysis_availability` on current-source Evidence, EvidenceHub and Report.
 *
 * The server says WHY there is no all-time block: `SEALED_ENRICHMENT_NOT_COMPUTED` or `SOURCE_EVIDENCE_NOT_SEALED`.
 * This module only carries that served code to the screen. Where the block is present it returns nothing
 * (nothing changes); where the field is not served (an older responder) it returns nothing and the screen keeps
 * today's code-less "not published". No code is ever made up here.
 */

import type { components as EvidenceComponents } from "@portal/contracts-research-evidence";

import type { EnrichedRead } from "./enrichedAnalysis";

export type EnrichedAvailability = EvidenceComponents["schemas"]["EnrichedAnalysisAvailability"];
export type EnrichedAbsenceCode = Extract<EnrichedAvailability, { state: "NOT_PUBLISHED" }>["reason_code"];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The served reason an all-time block is missing, or `null`. Only a served `NOT_PUBLISHED` with a code counts,
 * and only while no block was read (a drawn or refused block keeps its own line).
 */
export function enrichedAbsenceCode(response: unknown, read: EnrichedRead): string | null {
  if (read.kind !== "absent" || !isObject(response)) return null;
  const served = response.enriched_analysis_availability;
  if (!isObject(served) || served.state !== "NOT_PUBLISHED") return null;
  return typeof served.reason_code === "string" && served.reason_code !== "" ? served.reason_code : null;
}

/** The tooltip: the served code, and who said it. */
export function enrichedAbsenceTitle(code: string): string {
  return `all-time analytics (enrich_analysis) not published\nserver reason: ${code}\nserved as enriched_analysis_availability; the screen adds no reason`;
}

/** One compact line for a screen with no other absence component of its own (S04). */
export function EnrichedAbsenceLine({ code, what = "all-time analytics" }: { code: string; what?: string }) {
  const title = enrichedAbsenceTitle(code);
  return (
    <p
      className="mono flex flex-wrap items-baseline gap-x-1.5 text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-enriched-availability="NOT_PUBLISHED"
      data-reason-code={code}
      title={title}
      aria-label={`${what} not published, server reason ${code}`}
    >
      <span>{what} — not published</span>
      <span style={{ fontStyle: "normal" }}>{code}</span>
    </p>
  );
}
