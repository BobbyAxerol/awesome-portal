/**
 * The approval evidence read (`portal.execution.approval-evidence.v1`, WP-K slice 2) as the cockpit uses it: one read per selected request,
 * four sections (prior economic history, evidence diff, obligations still open, receipt preview), each published, not read (`null`) or without
 * an owning source (omitted). Nothing is computed here: counts, rows and sentences are the source's; a section that is not published keeps the
 * typed absence the panel always had. A port without the read, or a route nothing serves yet, is the same typed absence.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { ChartTools, EquityPanel } from "../../charts";
import { chartUnit } from "../series/seriesModel";
import type { ApprovalEvidence, EvidenceSection } from "../../readers/approvalEvidence";
import { formatAsOf } from "../../boundary";
import type { UtcEpochMs } from "../../../screenDataContract";

export type ExtraState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; evidence: ApprovalEvidence }
  | { status: "absent"; reason: string };

export const IDLE_EXTRA: ExtraState = { status: "idle" };
export const EvidenceExtraContext = createContext<ExtraState>(IDLE_EXTRA);
export const useEvidenceExtra = (): ExtraState => useContext(EvidenceExtraContext);

/** One read per selected request. A refusal is a typed absence with the port's own reason, never a blank or a zero. */
export function useApprovalEvidence(api: ExecutionApi, approvalId: string | null, workspaceId: string | undefined): ExtraState {
  const [state, setState] = useState<ExtraState>(IDLE_EXTRA);
  useEffect(() => {
    if (approvalId === null) { setState(IDLE_EXTRA); return; }
    if (api.getApprovalEvidence === undefined) { setState({ status: "absent", reason: "This build does not read approval evidence." }); return; }
    let cancelled = false;
    setState({ status: "loading" });
    // A port that throws instead of answering is the same typed absence, never a crash of the evidence pane.
    let pending: Promise<Awaited<ReturnType<NonNullable<ExecutionApi["getApprovalEvidence"]>>>>;
    try { pending = api.getApprovalEvidence(approvalId, workspaceId); } catch { setState({ status: "absent", reason: "The approval evidence could not be requested." }); return; }
    void pending.then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", evidence: result.value } : { status: "absent", reason: result.reason });
    }, () => { if (!cancelled) setState({ status: "absent", reason: "The approval evidence could not be read." }); });
    return () => { cancelled = true; };
  }, [api, approvalId, workspaceId]);
  return state;
}

/** The section, or the sentence that says why there is none. `null` when nothing was asked yet. */
export function sectionOf<T>(extra: ExtraState, pick: (evidence: ApprovalEvidence) => EvidenceSection<T>): { kind: "value"; value: T } | { kind: "absent"; why: string } | null {
  if (extra.status === "idle") return null;
  if (extra.status === "loading") return { kind: "absent", why: "Loading" };
  if (extra.status === "absent") return { kind: "absent", why: extra.reason };
  const section = pick(extra.evidence);
  if (section.state === "PUBLISHED") return { kind: "value", value: section.value };
  return { kind: "absent", why: section.state === "NOT_READ" ? "The source exists and was not read for this request" : "No source owns this for this kind of request" };
}

/** Obligations still open after approval, in the hi-fi's order and words. */
export const OBLIGATION_ROWS = [
  ["Open positions", "openPositions"], ["Working orders", "workingOrders"], ["Reservations", "reservations"], ["Unknown outcomes", "unknownOutcomes"], ["Settlement pending", "settlementPending"],
] as const;

/** The sum of the five published counts; the source's integers added as integers (they are counts of one kind of thing: obligations). */
export const obligationTotal = (o: { openPositions: number; workingOrders: number; reservations: number; unknownOutcomes: number; settlementPending: number }): number =>
  o.openPositions + o.workingOrders + o.reservations + o.unknownOutcomes + o.settlementPending;

/** The history chart, from the published points. The unit follows the metric; the caption names the methodology and the exact window. */
export function HistoryChart({ evidence }: { evidence: NonNullable<ReturnType<typeof historyOf>> }): ReactNode {
  const h = evidence;
  const unit = chartUnit({ unit: h.unit });
  const points = h.points.map((p) => ({ t: p.tsMs, v: h.unit === "RATIO" && h.ratioScale === "FRACTION" ? shift(p.exact) : p.exact }));
  const label = `Prior economic history, ${h.metric}${h.currency ? ` in ${h.currency}` : ""}`;
  return (
    <ChartTools label={label} columns={[{ key: "history", label: h.metric, points, unit, currency: h.currency ?? undefined, signed: h.metric !== "NAV" }]}>
      <EquityPanel label={label} seriesName={h.metric} points={points} unit={unit} currency={h.currency ?? undefined} signed={h.metric !== "NAV"} height={140} />
    </ChartTools>
  );
}
const historyOf = (e: ApprovalEvidence) => (e.history.state === "PUBLISHED" ? e.history.value : null);
export { historyOf };

/** x100 in the string (a FRACTION shown in percent), as the series screens do; no number is parsed. */
function shift(exact: string): string {
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(exact);
  if (m === null) return exact;
  const fraction = (m[3] ?? "").padEnd(2, "0");
  const integer = `${m[2]}${fraction.slice(0, 2)}`.replace(/^0+(?=[0-9])/, "");
  const rest = fraction.slice(2);
  const text = `${integer}${rest === "" ? "" : `.${rest}`}`;
  return m[1] === "-" && /[1-9]/.test(text) ? `-${text}` : text;
}

export const historyCaption = (h: NonNullable<ReturnType<typeof historyOf>>): string =>
  `${h.subject.subjectType.toLowerCase()} ${h.subject.subjectId} · ${h.metric}${h.currency ? ` in ${h.currency}` : ""} · methodology ${h.methodologyRef} · as of ${formatAsOf(h.asOfMs as UtcEpochMs)}`;
