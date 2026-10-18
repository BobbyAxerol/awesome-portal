/**
 * Evidence pane of the Approvals cockpit: what the review reads publish, read
 * only.
 *
 * Each kind shows what it publishes today. Observed and limit values per
 * criterion are one uniform shape in the hi-fi and not on any read yet, so the
 * cell says `Not published (FE-028)` instead of a dash or a computed number.
 * Evidence charts are out of S1 (FE-029). Nothing here writes, plans or applies.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { PanelStatus } from "../../../contracts";
import type { ConditionRow, ExecutionApi } from "../../../api/ports";
import { readGateR2Detail } from "../../../api/rows";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "../../../api/rows";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { reviewRouteFor, type ApprovalGate } from "../../../screens/ApprovalInbox";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { withContext } from "../../urlState";
import { instantText, KIND_TAG, NOT_PUBLISHED, settledPanel, type EvidenceData, type EvidenceKind } from "./laneModel";

/* ── the read ─────────────────────────────────────────────────────────────── */

export type EvidenceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; partial: boolean; data: EvidenceData; warnings: readonly string[] }
  | { status: "failed"; panel: Exclude<PanelStatus, "ok" | "loading">; reason: string };

export interface EvidenceTarget {
  kind: EvidenceKind;
  id: string;
}

const GATE_OF_KIND: Readonly<Record<EvidenceKind, ApprovalGate>> = { r1: "R1", r2: "R2", exit: "PAPER_EXIT", live: "LIVE_GATE" };

async function readEvidence(api: ExecutionApi, target: EvidenceTarget, workspaceId: string | undefined): Promise<EvidenceState> {
  try {
    switch (target.kind) {
      case "r1": {
        const result = await api.getGateR1(target.id, workspaceId);
        return result.ok
          ? { status: "ready", partial: (result.warnings?.length ?? 0) > 0, data: { kind: "r1", detail: result.value }, warnings: result.warnings ?? [] }
          : { status: "failed", panel: settledPanel(result.status), reason: result.reason };
      }
      case "r2": {
        const result = await api.getGateR2(target.id, workspaceId);
        return result.ok
          ? { status: "ready", partial: (result.warnings?.length ?? 0) > 0, data: { kind: "r2", detail: result.value }, warnings: result.warnings ?? [] }
          : { status: "failed", panel: settledPanel(result.status), reason: result.reason };
      }
      case "exit": {
        const result = await api.getPaperExit(target.id, workspaceId);
        return result.ok
          ? { status: "ready", partial: (result.warnings?.length ?? 0) > 0, data: { kind: "exit", detail: result.value }, warnings: result.warnings ?? [] }
          : { status: "failed", panel: settledPanel(result.status), reason: result.reason };
      }
      case "live": {
        const result = await api.getLiveReview(target.id, workspaceId);
        return result.ok
          ? {
              status: "ready",
              partial: (result.warnings?.length ?? 0) > 0,
              // The governance document rides inside the live payload as a full R2 review; the R2 reader decodes it.
              data: { kind: "live", payload: result.value, backbone: readGateR2Detail(result.value.governanceBackbone) },
              warnings: result.warnings ?? [],
            }
          : { status: "failed", panel: settledPanel(result.status), reason: result.reason };
      }
    }
  } catch {
    return { status: "failed", panel: "unavailable", reason: "The review read did not complete." };
  }
}

/** One evidence read for the selected request; a changed selection cancels the previous one. */
export function useEvidenceRead(api: ExecutionApi, target: EvidenceTarget | null, workspaceId: string | undefined): EvidenceState {
  const [state, setState] = useState<EvidenceState>({ status: "idle" });
  const kind = target?.kind ?? null;
  const id = target?.id ?? null;
  useEffect(() => {
    if (kind === null || id === null) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void readEvidence(api, { kind, id }, workspaceId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [api, kind, id, workspaceId]);
  return state;
}

/* ── small pieces ─────────────────────────────────────────────────────────── */

function NotPublished({ text }: { text: string }) {
  return <span className="exec-ck-np">{text}</span>;
}

function Word({ value }: { value: string | null | undefined }) {
  return value ? <>{value}</> : <span className="exec-ck-np">Not published</span>;
}

type Mark = "pass" | "watch" | "fail" | "insufficient";

const MARK_FLAG: Readonly<Record<Mark, { kind: FlagKind; label: string }>> = {
  pass: { kind: "ok", label: "Within" },
  watch: { kind: "partial", label: "Watch" },
  fail: { kind: "rejected", label: "Blocker" },
  insufficient: { kind: "na", label: "Insufficient" },
};

function MarkFlag({ mark }: { mark: Mark }) {
  const spec = MARK_FLAG[mark];
  return <Flag kind={spec.kind} label={spec.label} size="sm" />;
}

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="exec-ck-panel" aria-label={title}>
      <div className="exec-ck-ph">
        <h3 className="exec-ck-pt">{title}</h3>
        {right ? <span className="exec-ck-pr">{right}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Kv({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <table className="exec-ck-kv">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Criteria({ rows }: { rows: readonly { label: string; mark: Mark; note?: string | null }[] }) {
  if (rows.length === 0) return <div className="exec-ck-pad"><span className="exec-ck-np">No findings published</span></div>;
  return (
    <div className="exec-ck-tw">
      <table className="exec-ck-table">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Verdict</th>
            <th scope="col">Observed and limit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}:${row.label}`}>
              <td>
                {row.label}
                {row.note ? <div className="exec-ck-note">{row.note}</div> : null}
              </td>
              <td><MarkFlag mark={row.mark} /></td>
              <td><NotPublished text={NOT_PUBLISHED.criteria} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartPanel() {
  return (
    <Panel title="Evidence chart" right="Excluded from this preview">
      <div className="exec-ck-pad"><NotPublished text={NOT_PUBLISHED.chart} /></div>
    </Panel>
  );
}

function countMarks(rows: readonly { mark: Mark }[]): { total: number; pass: number; watch: number; fail: number } {
  const count = (mark: Mark) => rows.filter((row) => row.mark === mark).length;
  return { total: rows.length, pass: count("pass"), watch: count("watch"), fail: count("fail") };
}

/* ── per-kind bodies ──────────────────────────────────────────────────────── */

function R1Body({ detail }: { detail: GateR1Detail }) {
  const rows = detail.checklist.map((item) => ({ label: item.label, mark: item.outcome, note: item.suggestion ?? null }));
  return (
    <>
      <Panel title="Checklist findings" right={`${detail.checklist.length} published`}>
        <Criteria rows={rows} />
      </Panel>
      <ChartPanel />
      <Panel title="Artifact passport" right={detail.passportUnreadable > 0 ? `${detail.passportUnreadable} entries unreadable` : undefined}>
        {detail.passport.length === 0 ? (
          <div className="exec-ck-pad"><span className="exec-ck-np">No manifest entries published</span></div>
        ) : (
          <div className="exec-ck-tw">
            <table className="exec-ck-table">
              <thead>
                <tr>
                  <th scope="col">Artifact</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Verification</th>
                </tr>
              </thead>
              <tbody>
                {detail.passport.map((entry, index) => (
                  <tr key={`${index}:${entry.label}`}>
                    <td>{entry.label}</td>
                    <td className="exec-ck-id">{entry.value}</td>
                    <td><Word value={entry.verification} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {detail.locks.length > 0 ? (
        <Panel title="Locks reported by the server">
          <div className="exec-ck-pad">{detail.locks.join(" · ")}</div>
        </Panel>
      ) : null}
    </>
  );
}

function R2Body({ detail, heading = "R2 review" }: { detail: GateR2Detail; heading?: string }) {
  return (
    <>
      <Panel title="Criteria" right={heading}>
        <div className="exec-ck-pad"><NotPublished text={NOT_PUBLISHED.criteria} /></div>
      </Panel>
      <Panel title="R1 lineage">
        {detail.r1LineagePublished ? (
          <Kv
            rows={[
              { label: "R1 state", value: detail.r1State },
              { label: "R1 request", value: <Word value={detail.r1Id} /> },
              { label: "Decided by", value: <Word value={detail.r1DecidedBy} /> },
              { label: "Decided at", value: <Word value={instantText(detail.r1DecidedAt)} /> },
              { label: "Expires", value: <Word value={instantText(detail.r1Expiry)} /> },
            ]}
          />
        ) : (
          <div className="exec-ck-pad"><span className="exec-ck-np">The response carried no R1 lineage</span></div>
        )}
      </Panel>
      <Panel title="Capital change preview" right="Derived, not applied">
        {detail.capital.length === 0 ? (
          <div className="exec-ck-pad"><span className="exec-ck-np">No capital rows published</span></div>
        ) : (
          <div className="exec-ck-tw">
            <table className="exec-ck-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" data-numeric="true">Before</th>
                  <th scope="col" data-numeric="true">After approval</th>
                </tr>
              </thead>
              <tbody>
                {detail.capital.map((row, index) => (
                  <tr key={`${index}:${row.label}`}>
                    <td>
                      {row.label}
                      {row.currency ? <span className="exec-ck-unit"> {row.currency}</span> : null}
                      {row.breach ? <> <Flag kind="rejected" label="Breach" size="sm" /></> : null}
                    </td>
                    <td data-numeric="true">{row.before}</td>
                    <td data-numeric="true">{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {detail.readiness.map((group) => (
        <Panel key={group.title} title={group.title}>
          <Kv rows={group.entries.map((entry) => ({ label: entry.label, value: entry.revision ? `${entry.value} (rev ${entry.revision})` : entry.value }))} />
        </Panel>
      ))}
      {detail.locks.length > 0 ? (
        <Panel title="Locks reported by the server">
          <div className="exec-ck-pad">{detail.locks.join(" · ")}</div>
        </Panel>
      ) : null}
    </>
  );
}

function ExitBody({ detail }: { detail: PaperExitDetail }) {
  return (
    <>
      {detail.panels.map((panel) => (
        <Panel key={panel.title} title={panel.title} right={panel.source ?? undefined}>
          {panel.status && panel.status !== "ok" ? (
            <div className="exec-ck-pad"><PanelState status={panel.status === "loading" ? "unavailable" : panel.status} reason={panel.reason ?? "This panel could not be read."} /></div>
          ) : (
            <Criteria rows={panel.findings.map((finding) => ({ label: finding.label, mark: finding.outcome, note: finding.carriesTo ? `Carries to ${finding.carriesTo}` : null }))} />
          )}
        </Panel>
      ))}
      <ChartPanel />
      {detail.lineage.length > 0 ? (
        <Panel title="Lineage">
          <Kv rows={detail.lineage.map((ref) => ({ label: ref.label, value: <span className="exec-ck-id">{ref.value}</span> }))} />
        </Panel>
      ) : null}
      <Panel title="Recommendation">
        <div className="exec-ck-pad"><Word value={detail.recommendation} /></div>
      </Panel>
      {detail.activationPlan ? (
        <Panel title="Activation plan" right="Preview only">
          <Kv
            rows={[
              { label: "Mode", value: detail.activationPlan.mode },
              { label: "Target stage", value: detail.activationPlan.targetStage },
              { label: "Authority", value: detail.activationPlan.authoritySemantics },
            ]}
          />
        </Panel>
      ) : null}
    </>
  );
}

function LiveBody({ data }: { data: Extract<EvidenceData, { kind: "live" }> }) {
  const { payload, backbone } = data;
  const source = payload.currentSource;
  return (
    <>
      {backbone ? (
        <R2Body detail={backbone} heading="Governance backbone" />
      ) : (
        <Panel title="Governance backbone">
          <div className="exec-ck-pad"><span className="exec-ck-np">The live review carried no readable governance document</span></div>
        </Panel>
      )}
      <ChartPanel />
      <Panel title="Canary evidence branches" right={payload.canaryDeploymentId ?? undefined}>
        {payload.derivedBranches.length === 0 ? (
          <div className="exec-ck-pad"><span className="exec-ck-np">No canary-evidence branches published</span></div>
        ) : (
          <div className="exec-ck-tw">
            <table className="exec-ck-table">
              <thead>
                <tr>
                  <th scope="col">Branch</th>
                  <th scope="col">State</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {payload.derivedBranches.map((branch) => (
                  <tr key={branch.capabilityId}>
                    <td>{branch.capabilityId.replace(/_/g, " ")}</td>
                    <td>{branch.state}</td>
                    <td className="exec-ck-id">{branch.reasonCode ?? "none given"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Current source · live facts">
        {source ? (
          <Kv
            rows={[
              { label: "State", value: source.state },
              { label: "Freshness", value: <Word value={source.freshness} /> },
              { label: "Completeness", value: <Word value={source.completeness} /> },
              { label: "As of", value: <Word value={instantText(source.asOf)} /> },
            ]}
          />
        ) : (
          <div className="exec-ck-pad"><span className="exec-ck-np">The live current-source envelope was not published</span></div>
        )}
      </Panel>
    </>
  );
}

/* ── header and verdict ───────────────────────────────────────────────────── */

export interface EvidenceHeader {
  id: string;
  title: string | null;
  context: string | null;
  gate: ApprovalGate | null;
}

type Tone = "ok" | "warn" | "bad" | "mute";

function titleOf(header: EvidenceHeader, data: EvidenceData | null): string {
  if (header.title) return header.title;
  if (data === null) return header.id;
  switch (data.kind) {
    case "r1":
      return data.detail.alphaLabel;
    case "r2":
      return data.detail.subject;
    case "exit":
      return data.detail.subject;
    case "live":
      return data.backbone?.subject ?? data.payload.canaryDeploymentId ?? header.id;
  }
}

function verdictOf(data: EvidenceData): { tone: Tone; headline: string; facts: string[] } {
  switch (data.kind) {
    case "r1": {
      const marks = countMarks(data.detail.checklist.map((item) => ({ mark: item.outcome })));
      const facts = [`${marks.pass} within`, `${marks.watch} watch`, `${marks.fail} blocking`];
      if (data.detail.decided) return { tone: "mute", headline: `Decided · ${data.detail.decided.outcome}`, facts };
      return { tone: marks.fail > 0 ? "bad" : marks.watch > 0 ? "warn" : "ok", headline: `Checklist ${marks.pass} of ${marks.total}`, facts };
    }
    case "exit": {
      const d = data.detail;
      return { tone: d.gateMet ? "ok" : "warn", headline: d.gateMet ? "Gate met" : "Gate not met", facts: [d.gateSummary ?? "Gate summary not published", `Promotes to ${d.promoteTo}`] };
    }
    case "r2":
      return { tone: "mute", headline: `R1 ${data.detail.r1State.toLowerCase().replace(/_/g, " ")}`, facts: data.detail.grantName ? [`Grant ${data.detail.grantName}`] : [] };
    case "live":
      return { tone: "mute", headline: "Evidence ready · Live decisions are closed", facts: data.payload.readAt ? [`Read ${instantText(data.payload.readAt) ?? data.payload.readAt}`] : [] };
  }
}

/* ── the frame ────────────────────────────────────────────────────────────── */

export interface EvidenceFrameProps {
  kind: EvidenceKind | null;
  header: EvidenceHeader | null;
  evidence: EvidenceState;
  /** Why nothing can be shown for a selection the queue does not know. */
  unknownReason?: string | null;
}

export function EvidenceFrame({ kind, header, evidence, unknownReason }: EvidenceFrameProps) {
  const [params] = useSearchParams();

  if (header === null) {
    return (
      <div className="exec-ck-empty">
        {unknownReason ? <PanelState status="empty" title="Request not on this page" reason={unknownReason} /> : <PanelState status="empty" title="Nothing selected" reason="Select a request in the queue, or press J to start." />}
      </div>
    );
  }

  const data = evidence.status === "ready" ? evidence.data : null;
  const gate = header.gate ?? (kind ? GATE_OF_KIND[kind] : null);
  const verdict = data ? verdictOf(data) : null;

  return (
    <div className="exec-ck-evidence">
      <div className="exec-ck-head">
        <div className="exec-ck-titleline">
          {kind ? <span className="exec-ck-kd">{KIND_TAG[kind]}</span> : null}
          <h2 className="exec-ck-h">{titleOf(header, data)}</h2>
        </div>
        <div className="exec-ck-meta">
          <span className="exec-ck-id">{header.id}</span>
          {header.context ? <span>{header.context}</span> : null}
          <span>Ladder: <NotPublished text={NOT_PUBLISHED.decisionCall} /></span>
          {gate ? <Link className="exec-ck-link" to={withContext(reviewRouteFor({ id: header.id, gate }), params)}>Open full review</Link> : null}
        </div>
      </div>

      {evidence.status === "loading" ? <PanelSkeleton label="Loading evidence" /> : null}
      {evidence.status === "failed" ? <PanelState status={evidence.panel} reason={evidence.reason} /> : null}

      {verdict ? (
        <div className="exec-ck-verdict" data-tone={verdict.tone}>
          <h3 className="exec-ck-vh">{verdict.headline}</h3>
          {verdict.facts.length > 0 ? <div className="exec-ck-meta">{verdict.facts.map((fact) => <span key={fact}>{fact}</span>)}</div> : null}
        </div>
      ) : null}

      {evidence.status === "ready" && evidence.partial ? (
        <p className="exec-ck-note" role="status">Partial read: {evidence.warnings.join("; ")}</p>
      ) : null}

      {data?.kind === "r1" ? <R1Body detail={data.detail} /> : null}
      {data?.kind === "r2" ? <R2Body detail={data.detail} /> : null}
      {data?.kind === "exit" ? <ExitBody detail={data.detail} /> : null}
      {data?.kind === "live" ? <LiveBody data={data} /> : null}
    </div>
  );
}

/* ── waiver evidence (the register row is the read) ───────────────────────── */

const WAIVER_FLAG: Readonly<Record<ConditionRow["state"], { kind: FlagKind; label: string }>> = {
  OPEN: { kind: "pending", label: "Open" },
  WAIVED: { kind: "neutral", label: "Waived" },
  EXPIRING: { kind: "attention", label: "Expiring" },
  LAPSED: { kind: "rejected", label: "Lapsed" },
};

export function WaiverFlag({ state }: { state: ConditionRow["state"] }) {
  const spec = WAIVER_FLAG[state];
  return <Flag kind={spec.kind} label={spec.label} size="sm" />;
}

export function WaiverEvidence({ row }: { row: ConditionRow }) {
  return (
    <div className="exec-ck-evidence">
      <div className="exec-ck-head">
        <div className="exec-ck-titleline">
          <span className="exec-ck-kd">WAIVER</span>
          <h2 className="exec-ck-h">{row.label}</h2>
        </div>
        <div className="exec-ck-meta">
          <span className="exec-ck-id">{row.conditionId}</span>
          <WaiverFlag state={row.state} />
          {row.blocking ? <Flag kind="incident" label="Blocking" size="sm" /> : null}
        </div>
      </div>
      <Panel title="Condition">
        <Kv
          rows={[
            { label: "Statement", value: row.statement },
            { label: "Source decision", value: <span className="exec-ck-id">{row.approvalId}</span> },
            { label: "Gate", value: row.gate },
            { label: "Subject", value: row.subjectLabel },
            { label: "Environment", value: row.environment },
            { label: "Owner", value: row.owner },
            { label: "Lapses", value: <Word value={instantText(row.dueAt)} /> },
            { label: "Policy", value: row.policyVersion },
          ]}
        />
      </Panel>
      <Panel title="Runway" right="Excluded from this preview">
        <div className="exec-ck-pad"><NotPublished text={NOT_PUBLISHED.chart} /></div>
      </Panel>
    </div>
  );
}
