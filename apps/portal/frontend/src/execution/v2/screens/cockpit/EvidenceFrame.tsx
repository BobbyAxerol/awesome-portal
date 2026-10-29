/**
 * Evidence pane of the Approvals cockpit: what the review reads publish, read
 * only.
 *
 * Each kind shows what it publishes today. A criterion's observed and limit
 * values are on the Paper Exit parent's `criteria` section (Codex e19ad906) and
 * on no other read: wherever a value is absent the cell says `Not published
 * (FE-028)` with the server's reason instead of a dash or a computed number,
 * and the comparator is absent on every read. Evidence charts are out of S1
 * (FE-029). Nothing here writes, plans or applies.
 */
import type { InboxRowV2 } from "./inboxRowV2";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { groupExact } from "../blotter/blotterModel";
import { breakable } from "./breakable";

import type { PanelStatus } from "../../../contracts";
import type { ConditionRow, ExecutionApi } from "../../../api/ports";
import type { LiveReviewPayload } from "../../../api/profileRead";
import { readGateR2Detail } from "../../../api/rows";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "../../../api/rows";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { type ApprovalGate } from "../../../screens/ApprovalInbox";
import { QuietIdsWhy } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { EvidenceExtraContext, IDLE_EXTRA, OBLIGATION_ROWS, HistoryChart, historyCaption, obligationTotal, sectionOf, useEvidenceExtra, type ExtraState } from "./evidenceExtra";
import { codeName } from "../../displayNames";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { unsupportedText, type GovernanceParentRead } from "../../readers/dispatch";
import type {
  AbsentSectionV2, ApprovalV2, DecisionContextV2, ExitCriterionV2, ExitFindingV2, ExitPanelV2, LiveParentV2, PaperExitLabelKeyV2, PaperExitParentV2,
  R2ParentV2, RecordedActivityV2, RecordedVerdictsV2, ScalarV2, SectionV2,
} from "../../readers/governanceParents";
import {
  instantText, instantWithYear, KIND_TAG, lapseView, NOT_PUBLISHED, notPublishedFor, RUNWAY_AXIS_DAYS, RUNWAY_TICKS_DAYS, liveBlockerLine, settledPanel, shownQuorum, summarizeEvidence,
  type EvidenceData, type EvidenceKind,
} from "./laneModel";

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

/** One dispatched read as cockpit state: V1 as it always was, V2 as its own kind, anything else as a stated failure. */
function readyFromParent(value: GovernanceParentRead, warnings: readonly string[]): EvidenceState {
  const read = value.read;
  if (read.kind === "unsupported") return { status: "failed", panel: "unavailable", reason: unsupportedText(read) };
  const partial = warnings.length > 0;
  if (read.kind === "v2") {
    switch (value.kind) {
      case "r2":
        return { status: "ready", partial, data: { kind: "r2v2", parent: read.value as R2ParentV2 }, warnings };
      case "exit":
        return { status: "ready", partial, data: { kind: "exitv2", parent: read.value as PaperExitParentV2 }, warnings };
      case "live":
        return { status: "ready", partial, data: { kind: "livev2", parent: read.value as LiveParentV2 }, warnings };
    }
  }
  switch (value.kind) {
    case "r2":
      return { status: "ready", partial, data: { kind: "r2", detail: read.value as GateR2Detail }, warnings };
    case "exit":
      return { status: "ready", partial, data: { kind: "exit", detail: read.value as PaperExitDetail }, warnings };
    case "live": {
      // The governance document rides inside the live payload as a full R2 review; the R2 reader decodes it.
      const payload = read.value as LiveReviewPayload;
      return { status: "ready", partial, data: { kind: "live", payload, backbone: readGateR2Detail(payload.governanceBackbone) }, warnings };
    }
  }
}

async function readEvidence(api: ExecutionApi, target: EvidenceTarget, workspaceId: string | undefined): Promise<EvidenceState> {
  try {
    switch (target.kind) {
      case "r1": {
        const result = await api.getGateR1(target.id, workspaceId);
        return result.ok
          ? { status: "ready", partial: (result.warnings?.length ?? 0) > 0, data: { kind: "r1", detail: result.value }, warnings: result.warnings ?? [] }
          : { status: "failed", panel: settledPanel(result.status), reason: result.reason };
      }
      case "r2":
      case "exit":
      case "live": {
        // One version-aware read for the three kinds that share a route with a V2 body (v2/readers/dispatch.ts).
        const result = await api.getGovernanceParent(target.kind, target.id, workspaceId);
        return result.ok
          ? readyFromParent(result.value, result.warnings ?? [])
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
  // A code in the sentence wraps between its parts, never inside a word (QA1 I-18); a sentence with ids behind "?" is QuietIdsWhy's.
  const body = QuietIdsWhy({ text });
  return <span className="exec-ck-np">{typeof body === "string" ? breakable(body) : body}</span>;
}

/** A published state word (`NOT_ELIGIBLE`, `MISSING`) in words; the code itself stays in a title-free hidden place only where a screen needs it. */
function stateWords(value: string): string {
  const words = value.replace(/_/g, " ").trim().toLowerCase();
  return words === "" ? value : words.charAt(0).toUpperCase() + words.slice(1);
}

/** A published word, or the absence named with the FE request that will publish it. */
function Word({ value, fe }: { value: string | null | undefined; fe: string }) {
  return value ? <>{value}</> : <NotPublished text={notPublishedFor(fe)} />;
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

/** An exact decimal string with its thousands grouped and every published digit kept; any other published text as it is; no value as "None". */
function shown(value: string | null): string {
  if (value === null) return "None";
  return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) ? groupExact(value) : value;
}

function Kv({ rows, ...rest }: { rows: readonly { label: string; value: ReactNode }[]; "data-numeric"?: boolean }) {
  return (
    <table className="exec-ck-kv" data-numeric={rest["data-numeric"] ? "true" : undefined}>
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

interface CriteriaRow {
  label: ReactNode;
  mark: Mark;
  note?: ReactNode;
  /** The observed and limit cell; the shared `Not published (FE-028)` when the row has none. */
  cell?: ReactNode;
}

function Criteria({ rows }: { rows: readonly CriteriaRow[] }) {
  if (rows.length === 0) return <div className="exec-ck-pad"><span className="exec-ck-np">No findings published</span></div>;
  // A column that is the same typed absence on every row is said once under the table, not drawn as a column of placeholders (QA1 I-16).
  const observed = rows.some((row) => row.cell !== undefined);
  return (
    <div className="exec-ck-tw">
      <table className="exec-ck-table">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Verdict</th>
            {observed ? <th scope="col">Observed and limit</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                {row.label}
                {row.note ? <div className="exec-ck-note">{row.note}</div> : null}
              </td>
              <td><MarkFlag mark={row.mark} /></td>
              {observed ? <td>{row.cell ?? <NotPublished text={NOT_PUBLISHED.criteria} />}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {observed ? null : <p className="exec-ck-note exec-ck-pad" data-testid="ck-observed-absent">Observed and limit: <NotPublished text={NOT_PUBLISHED.criteria} /> for every finding.</p>}
    </div>
  );
}

/** The hi-fi's "Prior economic history": the published series of the request's subject (WP-K), or the typed absence under its own title. */
function ChartPanel() {
  const got = sectionOf(useEvidenceExtra(), (e) => e.history);
  if (got !== null && got.kind === "value") {
    return (
      <Panel title="Prior economic history" right={got.value.metric}>
        <div className="exec-ck-pad" data-testid="ck-history">
          <HistoryChart evidence={got.value} />
          <p className="exec-ck-note" data-testid="ck-history-caption">{historyCaption(got.value)}</p>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Prior economic history" right="Series not published">
      <div className="exec-ck-pad" data-testid="ck-history"><NotPublished text={NOT_PUBLISHED.chart} /></div>
    </Panel>
  );
}

/** The five things the hi-fi lists as still open after an approval. Each is a count the source has to state; none is published, so none is drawn as a number. */
const STILL_OPEN = ["Open positions", "Working orders", "Reservations", "Unknown outcomes", "Settlement pending"] as const;

function StillOpenPanel() {
  const extra = useEvidenceExtra();
  const closed = useContext(ClosedContext);
  const title = closed ? "Open at decision" : "Still open after approval";
  const got = sectionOf(extra, (e) => e.obligations);
  if (got !== null && got.kind === "value") {
    const o = got.value;
    return (
      <Panel title={title} right={extra.status === "ready" ? `Read ${formatAsOf(extra.evidence.readAtMs)}` : ""}>
        <Kv rows={OBLIGATION_ROWS.map(([label, key]) => ({ label, value: <span className="exec-ck-num" data-testid={`ck-open-${key}`}>{String(o[key])}</span> }))} data-numeric />
      </Panel>
    );
  }
  return (
    <Panel title={title} right="Not published">
      <Kv rows={STILL_OPEN.map((label) => ({ label, value: <NotPublished text={NOT_PUBLISHED.decisionCall} /> }))} />
    </Panel>
  );
}

/** What changed in the evidence since the last review (concept C4). No source publishes a diff, so the panel is the typed absence. */
function EvidenceDiffPanel() {
  const got = sectionOf(useEvidenceExtra(), (e) => e.diff);
  if (got !== null && got.kind === "value") {
    const diff = got.value;
    return (
      <Panel title="Evidence diff" right={`Since ${diff.previousRevision}`}>
        <div className="exec-ck-pad" data-testid="ck-evidence-diff">
          {diff.changes.length === 0 ? <span>No change since {diff.previousRevision}</span> : (
            <Kv rows={diff.changes.map((change) => ({
              label: change.label,
              value: <span className="exec-ck-num">{shown(change.before)} {"\u2192"} {shown(change.after)}</span>,
            }))} />
          )}
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Evidence diff" right="Since the last review">
      <div className="exec-ck-pad" data-testid="ck-evidence-diff"><NotPublished text={NOT_PUBLISHED.chart} /></div>
    </Panel>
  );
}

/** Where this evidence came from, in the words the reads publish. Collapsed (hi-fi "Provenance"). */
function ProvenanceDetails({ data, gate }: { data: EvidenceData; gate: ApprovalGate | null }) {
  const summary = summarizeEvidence(data);
  const readTime =
    data.kind === "r2v2" || data.kind === "exitv2" || data.kind === "livev2"
      ? formatAsOf(data.parent.header.observedAt)
      : data.kind === "live" && data.payload.readAt
        ? instantText(data.payload.readAt) ?? data.payload.readAt
        : null;
  return (
    <details className="exec-ck-panel exec-ck-details" data-testid="ck-provenance">
      <summary>Provenance</summary>
      <Kv
        rows={[
          { label: "Gate", value: gate === null ? <NotPublished text={NOT_PUBLISHED.decisionCall} /> : gate.replace(/_/g, " ").toLowerCase() },
          { label: "Policy", value: summary.policyVersion ?? <NotPublished text={NOT_PUBLISHED.policy} /> },
          { label: "Workspace", value: summary.workspaceId === null ? <NotPublished text={NOT_PUBLISHED.decisionCall} /> : <span className="exec-ck-id">{summary.workspaceId}</span> },
          { label: "Read", value: readTime ?? <NotPublished text={NOT_PUBLISHED.chart} /> },
        ]}
      />
    </details>
  );
}

function countMarks(rows: readonly { mark: Mark }[]): { total: number; pass: number; watch: number; fail: number; insufficient: number } {
  const count = (mark: Mark) => rows.filter((row) => row.mark === mark).length;
  return { total: rows.length, pass: count("pass"), watch: count("watch"), fail: count("fail"), insufficient: count("insufficient") };
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
                    <td><Word value={entry.verification} fe="FE-028" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {detail.locks.length > 0 ? (
        <Panel title="Locks reported by the server">
          <div className="exec-ck-pad">{detail.locks.map(stateWords).join(" · ")}</div>
        </Panel>
      ) : null}
    </>
  );
}

function R2Body({ detail, heading = "R2 review" }: { detail: GateR2Detail; heading?: string }) {
  const closed = useContext(ClosedContext);
  // The criterion rows are not published, but the evidence read counts them ("Criteria met 6 → 7"): say that count here, so the page never
  // says "Not published" beside a published count of the same thing.
  const diff = sectionOf(useEvidenceExtra(), (e) => e.diff);
  const counted = diff !== null && diff.kind === "value" ? diff.value.changes.find((change) => /^criteria met$/i.test(change.label)) : undefined;
  return (
    <>
      <Panel title="Criteria" right={heading}>
        <div className="exec-ck-pad" data-testid="ck-r2-criteria">
          <NotPublished text={counted ? "Criterion rows are not published" : NOT_PUBLISHED.criteria} />
          {counted ? <p className="exec-ck-note" data-testid="ck-r2-criteria-count">The evidence read counts <span className="exec-ck-num">{shown(counted.before)}</span> met now and <span className="exec-ck-num">{shown(counted.after)}</span> after approval.</p> : null}
        </div>
      </Panel>
      <Panel title="R1 lineage">
        {detail.r1LineagePublished ? (
          <Kv
            rows={[
              { label: "R1 state", value: stateWords(detail.r1State) },
              { label: "R1 request", value: <Word value={detail.r1Id} fe="FE-028" /> },
              { label: "Decided by", value: <Word value={detail.r1DecidedBy} fe="FE-030" /> },
              { label: "Decided at", value: <Word value={instantWithYear(detail.r1DecidedAt)} fe="FE-030" /> },
              { label: "Expires", value: <Word value={instantWithYear(detail.r1Expiry)} fe="FE-028" /> },
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
                  <th scope="col" data-numeric="true">{closed ? "Applied at decision" : "After approval"}</th>
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
          <Kv rows={group.entries.map((entry) => ({ label: entry.label, value: entry.revision ? `${entry.value} (${/rev/i.test(entry.revision) ? entry.revision : `rev ${entry.revision}`})` : entry.value }))} />
        </Panel>
      ))}
      {detail.locks.length > 0 ? (
        <Panel title="Locks reported by the server">
          <div className="exec-ck-pad">{detail.locks.map(stateWords).join(" · ")}</div>
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
        <div className="exec-ck-pad"><Word value={detail.recommendation} fe="FE-028" /></div>
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
                    <td>{stateWords(branch.state)}</td>
                    <td className="exec-ck-id">{branch.reasonCode ? breakable(branch.reasonCode) : "none given"}</td>
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
              { label: "Freshness", value: <Word value={source.freshness} fe="FE-029" /> },
              { label: "Completeness", value: <Word value={source.completeness} fe="FE-029" /> },
              { label: "As of", value: <Word value={instantText(source.asOf)} fe="FE-029" /> },
            ]}
          />
        ) : (
          <div className="exec-ck-pad"><span className="exec-ck-np">The live current-source envelope was not published</span></div>
        )}
      </Panel>
    </>
  );
}

/* ── V2 parent bodies (SCOPED_V2 workspaces) ──────────────────────────────── */

/** A section the server published as absent: the state word and its own reason code, never invented copy. */
function Absent({ section }: { section: AbsentSectionV2 }) {
  return <NotPublished text={`Not published · ${section.reasonCode}`} />;
}

function Id({ value }: { value: string }) {
  return <span className="exec-ck-id">{breakable(value)}</span>;
}

function when(value: Parameters<typeof formatAsOf>[0] | null): ReactNode {
  return value === null ? <span className="exec-ck-np">None yet</span> : formatAsOf(value);
}

const STATUS_WORD: Readonly<Record<ApprovalV2["status"], string>> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  APPROVED_WITH_CONDITION: "Approved with a condition",
  DENIED: "Denied",
  CHANGES_REQUESTED: "Changes requested",
  EXPIRED: "Expired",
};

/** The approval row every V2 parent carries: Portal lifecycle clocks, not source freshness. */
function ApprovalPanel({ approval, observedAt }: { approval: ApprovalV2; observedAt: Parameters<typeof formatAsOf>[0] }) {
  return (
    <Panel title="Approval" right={`Portal read ${formatAsOf(observedAt)}`}>
      <Kv
        rows={[
          { label: "Status", value: STATUS_WORD[approval.status] },
          { label: "Version", value: String(approval.approvalVersion) },
          { label: "Policy", value: <Id value={approval.policyVersion} /> },
          { label: "Approvers", value: shownQuorum(approval.quorumMet, approval.quorumRequired) },
          { label: "Evidence", value: approval.evidenceComplete ? "Complete" : "Incomplete" },
          { label: "Created", value: when(approval.createdAt) },
          { label: "Review due", value: when(approval.slaDueAt) },
          { label: "Expires", value: when(approval.expiresAt) },
          { label: "Decided", value: when(approval.decidedAt) },
        ]}
      />
    </Panel>
  );
}

/** The words of a decision a recorded row or a stored plan carries, as the schema spells them. */
function decisionWord(decision: string): string {
  return decision.replace(/_/g, " ").toLowerCase();
}

/** A scalar the criteria section publishes, or its absence with `Not published (FE-028)` and the server's reason. */
function scalarText(scalar: ScalarV2<string>): ReactNode {
  return scalar.availability === "AVAILABLE"
    ? <span className="exec-ck-id">{scalar.value}</span>
    : <span className="exec-ck-np">{`${NOT_PUBLISHED.criteria} · ${scalar.reasonCode}`}</span>;
}

/** The R2 recorded verdicts: outcome, blocking and clock as published; label, observed and limit are one absence the schema pins. */
function R2CriteriaPanel({ verdicts }: { verdicts: SectionV2<RecordedVerdictsV2> }) {
  if (verdicts.availability !== "AVAILABLE") {
    return (
      <Panel title="Criteria" right="R2 review">
        <div className="exec-ck-pad"><NotPublished text={`${NOT_PUBLISHED.criteria} · ${verdicts.reasonCode}`} /></div>
      </Panel>
    );
  }
  return (
    <Panel title="Criteria" right={`${verdicts.items.length} recorded${verdicts.hasMore ? " · more exist" : ""}`}>
      <Criteria
        rows={verdicts.items.map((verdict) => ({
          label: verdict.findingId,
          mark: OUTCOME_MARK[verdict.outcome],
          note: `${verdict.blocking ? "Blocking · " : ""}Evaluated ${formatAsOf(verdict.evaluatedAt)}`,
          cell: <span className="exec-ck-np">{`${NOT_PUBLISHED.criteria} · ${verdict.structuredCriterion.reasonCode}`}</span>,
        }))}
      />
      <p className="exec-ck-note exec-ck-pad">
        {verdicts.hasMore ? `The first ${verdicts.limit} by ordinal; more exist. ` : ""}Stored verdicts, not current gate readiness.
      </p>
    </Panel>
  );
}

/** The stored R2 plan inputs. Stored facts: they do not say a decision may be made. */
function DecisionInputsPanel({ context }: { context: SectionV2<DecisionContextV2> }) {
  if (context.availability !== "AVAILABLE") {
    return (
      <Panel title="Decision inputs">
        <div className="exec-ck-pad"><NotPublished text={`${NOT_PUBLISHED.decisionCall} · ${context.reasonCode}`} /></div>
      </Panel>
    );
  }
  const hashes = context.evidenceHashes;
  return (
    <Panel title="Decision inputs" right="Stored, not an authorization">
      <Kv
        rows={[
          { label: "Request", value: <Id value={context.approvalId} /> },
          { label: "Expected version", value: String(context.expectedApprovalVersion) },
          { label: "Evidence set", value: <Id value={context.evidenceSetHash} /> },
          {
            label: "Evidence hashes",
            value: hashes.availability === "AVAILABLE"
              ? hashes.value.length === 0
                ? "None listed"
                : (
                  <details>
                    <summary>{`${hashes.value.length} hash${hashes.value.length === 1 ? "" : "es"}`}</summary>
                    {hashes.value.map((hash) => <div key={hash}><Id value={hash} /></div>)}
                  </details>
                )
              : <NotPublished text={`Not published · ${hashes.reasonCode}`} />,
          },
          { label: "Plan route", value: <Id value={context.planPath} /> },
          { label: "Request schema", value: <Id value={context.requestSchemaVersion} /> },
          { label: "Admission", value: `Not evaluated · ${context.admission.reasonCode}` },
        ]}
      />
    </Panel>
  );
}

/** The bounded recent decisions the Portal recorded for this approval. Not source, order or stage history, and not full history. */
function RecordedDecisionsPanel({ activity }: { activity: SectionV2<RecordedActivityV2> }) {
  if (activity.availability !== "AVAILABLE") {
    return (
      <Panel title="Recorded decisions">
        <div className="exec-ck-pad"><NotPublished text={`${NOT_PUBLISHED.decisionCall} · ${activity.reasonCode}`} /></div>
      </Panel>
    );
  }
  return (
    <Panel title="Recorded decisions" right={`Newest first${activity.hasMore ? ` · ${activity.limit} shown, more exist` : ""}`}>
      {activity.items.length === 0 ? (
        <div className="exec-ck-pad">None recorded</div>
      ) : (
        <div className="exec-ck-tw">
          <table className="exec-ck-table">
            <thead>
              <tr>
                <th scope="col">Decided</th>
                <th scope="col">Decision</th>
                <th scope="col">Version</th>
                <th scope="col">Operation</th>
              </tr>
            </thead>
            <tbody>
              {activity.items.map((row) => (
                <tr key={row.decisionId}>
                  <td>{formatAsOf(row.decidedAt)}</td>
                  <td>{decisionWord(row.decision)}</td>
                  <td>{`${row.versionBefore} to ${row.versionAfter}`}</td>
                  <td><Id value={row.operationId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="exec-ck-note exec-ck-pad">Portal decision rows only; not source, order or stage history, and not the full history.</p>
    </Panel>
  );
}

function R2V2Body({ parent }: { parent: R2ParentV2 }) {
  const lineage = parent.lineage;
  return (
    <>
      <R2CriteriaPanel verdicts={parent.recordedVerdicts} />
      <Panel title="R1 lineage">
        {lineage.availability === "AVAILABLE" ? (
          <Kv
            rows={[
              { label: "R1 request", value: <Id value={lineage.r1ApprovalId} /> },
              { label: "Risk grant", value: <Id value={lineage.observedRiskGrantId} /> },
              { label: "Currency", value: lineage.currency },
              { label: "R1 state", value: <NotPublished text={notPublishedFor(parent.notPublished.r1State)} /> },
              { label: "Decided by", value: <NotPublished text={notPublishedFor(parent.notPublished.r1DecidedBy)} /> },
              { label: "Expires", value: <NotPublished text={notPublishedFor(parent.notPublished.r1Expiry)} /> },
            ]}
          />
        ) : (
          <div className="exec-ck-pad"><Absent section={lineage} /></div>
        )}
      </Panel>
      <DecisionInputsPanel context={parent.decisionContext} />
      <Panel title="Capital change preview" right="Derived, not applied">
        <div className="exec-ck-pad"><NotPublished text={NOT_PUBLISHED.capital} /></div>
      </Panel>
      <RecordedDecisionsPanel activity={parent.recordedActivity} />
      <ApprovalPanel approval={parent.approval} observedAt={parent.header.observedAt} />
    </>
  );
}

const PANEL_TITLE: Readonly<Record<ExitPanelV2["panelKind"], string>> = {
  OBSERVATION_COVERAGE: "Observation coverage",
  DRIFT: "Drift",
  LIMITS_HEALTH: "Limits health",
  PORTFOLIO_FIT: "Portfolio fit",
};
/** The four label keys the schema publishes, in the words of the panel they name. */
const LABEL_TEXT: Readonly<Record<PaperExitLabelKeyV2, string>> = {
  "paper_exit.observation_coverage": PANEL_TITLE.OBSERVATION_COVERAGE,
  "paper_exit.drift": PANEL_TITLE.DRIFT,
  "paper_exit.limits_health": PANEL_TITLE.LIMITS_HEALTH,
  "paper_exit.portfolio_fit": PANEL_TITLE.PORTFOLIO_FIT,
};
const OUTCOME_MARK: Readonly<Record<ExitFindingV2["outcome"], Mark>> = { PASS: "pass", WATCH: "watch", FAIL: "fail", INSUFFICIENT: "insufficient" };

const findingFlags = (finding: ExitFindingV2) => `${finding.required ? "Required" : "Not required"}${finding.blocking ? " · Blocking" : ""}`;

/** A finding from the `evaluation` section: an outcome and two flags. It has no label, so the id is the honest name. */
function findingRow(finding: ExitFindingV2): CriteriaRow {
  return { label: finding.findingId, mark: OUTCOME_MARK[finding.outcome], note: findingFlags(finding) };
}

/**
 * A finding from the `criteria` section. The label is the published key's own
 * word; the observed value and limit are the exact strings (every digit); the
 * comparator is absent on the wire, so no "at most" or "at least" is drawn.
 */
function criterionRow(item: ExitCriterionV2): CriteriaRow {
  const finding = item.finding;
  const label = item.labelKey.availability === "AVAILABLE" ? LABEL_TEXT[item.labelKey.value] : null;
  const unit = item.unit.availability === "AVAILABLE" ? item.unit.value : null;
  const currency = item.currency.availability === "AVAILABLE" ? item.currency.value : null;
  return {
    label: label ?? <>{finding.findingId} <span className="exec-ck-np">{`label ${NOT_PUBLISHED.criteria} · ${item.labelKey.availability === "NOT_PUBLISHED" ? item.labelKey.reasonCode : ""}`}</span></>,
    mark: OUTCOME_MARK[finding.outcome],
    note: (
      <>
        <div><span className="exec-ck-id">{finding.findingId}</span> · {findingFlags(finding)}</div>
        {item.sourceTime.availability === "AVAILABLE" ? <div>{`Source time ${formatAsOf(item.sourceTime.value)}`}</div> : null}
        {item.evidence.availability === "AVAILABLE" ? <div>Evidence <Id value={item.evidence.value} /></div> : null}
        {item.findingFormulaVersion.availability === "AVAILABLE" ? <div>{`Formula ${item.findingFormulaVersion.value}`}</div> : null}
      </>
    ),
    cell: (
      <>
        <div>Observed {scalarText(item.observed)}</div>
        <div>Limit {scalarText(item.limit)}</div>
        <div>Comparator <span className="exec-ck-np">{`${NOT_PUBLISHED.criteria} · ${item.comparator.reasonCode}`}</span></div>
        <div>
          Unit{" "}
          {unit === null && currency === null
            ? <span className="exec-ck-np">{`${NOT_PUBLISHED.criteria} · ${item.unit.availability === "NOT_PUBLISHED" ? item.unit.reasonCode : ""}`}</span>
            : [unit, currency].filter((word) => word !== null).join(" ")}
        </div>
      </>
    ),
  };
}

function ExitV2Body({ parent }: { parent: PaperExitParentV2 }) {
  const { evaluation, criteria, lineage, review } = parent;
  // Panels come from the evaluation, or from the criteria when that is the section the viewer may read.
  const panels = evaluation.availability === "AVAILABLE" ? evaluation.panels : criteria.availability === "AVAILABLE" ? criteria.panels : null;
  const rowsOf = (panel: ExitPanelV2): CriteriaRow[] =>
    criteria.availability === "AVAILABLE"
      ? criteria.items.filter((item) => item.finding.panelId === panel.panelId).map(criterionRow)
      : evaluation.availability === "AVAILABLE"
        ? evaluation.findings.filter((finding) => finding.panelId === panel.panelId).map(findingRow)
        : [];
  return (
    <>
      {panels !== null ? (
        panels.map((panel) => (
          <Panel key={panel.panelId} title={PANEL_TITLE[panel.panelKind]} right={`${panel.sourceAuthority.toLowerCase()} · ${panel.panelState.toLowerCase()}`}>
            {panel.panelState !== "OK" ? (
              <div className="exec-ck-pad">
                <PanelState
                  status={panel.panelState === "PARTIAL" ? "partial" : panel.panelState === "STALE" ? "stale" : "unavailable"}
                  reason={`Panel state ${panel.panelState}${panel.asOf === null ? "; it published no clock" : `; as of ${formatAsOf(panel.asOf)}`}.`}
                />
              </div>
            ) : null}
            <Criteria rows={rowsOf(panel)} />
          </Panel>
        ))
      ) : (
        <Panel title="Evaluation">
          <div className="exec-ck-pad">{evaluation.availability === "AVAILABLE" ? null : <Absent section={evaluation} />}</div>
        </Panel>
      )}
      {criteria.availability === "AVAILABLE" ? null : (
        <Panel title="Criteria detail">
          <div className="exec-ck-pad"><NotPublished text={`${NOT_PUBLISHED.criteria} · ${criteria.reasonCode}`} /></div>
        </Panel>
      )}
      <ChartPanel />
      <Panel title="Review">
        <Kv
          rows={[
            { label: "State", value: review.reviewState.replace(/_/g, " ").toLowerCase() },
            { label: "Version", value: String(review.reviewVersion) },
            { label: "Promotes to", value: review.promoteTo.replace(/_/g, " ").toLowerCase() },
            { label: "Extension", value: review.extensionDays === null ? "None" : `${review.extensionDays} days until ${when(review.extendedUntil)}` },
          ]}
        />
      </Panel>
      <Panel title="Lineage">
        {lineage.availability === "AVAILABLE" ? (
          <Kv
            rows={[
              { label: "R1 request", value: <Id value={lineage.r1ApprovalId} /> },
              { label: "R2 request", value: <Id value={lineage.r2ApprovalId} /> },
              { label: "Source snapshot", value: <Id value={lineage.sourceSnapshotHash} /> },
              { label: "Evidence set", value: <Id value={lineage.evidenceSetHash} /> },
            ]}
          />
        ) : (
          <div className="exec-ck-pad"><Absent section={lineage} /></div>
        )}
      </Panel>
      <RecordedDecisionsPanel activity={parent.recordedActivity} />
      <Panel title="Recommendation">
        <div className="exec-ck-pad"><NotPublished text={NOT_PUBLISHED.criteria} /></div>
      </Panel>
      <ApprovalPanel approval={parent.approval} observedAt={parent.header.observedAt} />
    </>
  );
}

function LiveV2Body({ parent }: { parent: LiveParentV2 }) {
  return (
    <>
      <ApprovalPanel approval={parent.approval} observedAt={parent.header.observedAt} />
      <Panel title="Governance backbone">
        <div className="exec-ck-pad"><NotPublished text={notPublishedFor(parent.notPublished.governanceBackbone)} /></div>
      </Panel>
      <ChartPanel />
      <Panel title="Canary evidence branches">
        <div className="exec-ck-pad"><NotPublished text={notPublishedFor(parent.notPublished.canaryBranches)} /></div>
      </Panel>
      <Panel title="Current source · live facts">
        <div className="exec-ck-pad"><NotPublished text={notPublishedFor(parent.notPublished.liveFacts)} /></div>
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
  /** Who asked, as the queue row publishes it; absent or `null` keeps the typed absence. */
  requestedBy?: string | null;
  /** The approver count the queue row publishes. */
  quorum?: { met: number; required: number } | null;
  /** The review clock in words (`slaView(...).phrase`), from the queue row. */
  left?: string | null;
  /** The published state is closed or decided: the panels speak in the past tense ("Open at decision"), not as if approval were still to come. */
  closed?: boolean;
}

const ClosedContext = createContext(false);

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
    // No V2 parent carries a subject label: the request id is the title.
    case "r2v2":
    case "exitv2":
    case "livev2":
      return header.id;
  }
}

interface Verdict {
  tone: Tone;
  headline: string;
  facts: string[];
  /** One mark per criterion, in the order published: the segmented meter (CK-7). Absent where no per-criterion marks are published. */
  meter?: readonly Mark[];
}

function verdictOf(data: EvidenceData, liveBlockers: string | null = null): Verdict {
  switch (data.kind) {
    case "r1": {
      const marks = countMarks(data.detail.checklist.map((item) => ({ mark: item.outcome })));
      const facts = [`${marks.pass} within`, `${marks.watch} watch`, `${marks.fail} blocking`, `${marks.insufficient} insufficient`];
      const meter = data.detail.checklist.map((item) => item.outcome);
      if (data.detail.decided) return { tone: "mute", headline: `Decided · ${data.detail.decided.outcome}`, facts, meter };
      // A criterion with too little evidence is unknown, and unknown is never green: only a fully read checklist is "ok".
      return { tone: marks.fail > 0 ? "bad" : marks.watch > 0 || marks.insufficient > 0 ? "warn" : "ok", headline: `Checklist ${marks.pass} of ${marks.total}`, facts, meter };
    }
    case "exit": {
      const d = data.detail;
      return { tone: d.gateMet ? "ok" : "warn", headline: d.gateMet ? "Gate met" : "Gate not met", facts: [d.gateSummary ?? "Gate summary not published", `Promotes to ${d.promoteTo}`] };
    }
    case "r2":
      return { tone: "mute", headline: `R2 review · R1 ${data.detail.r1State.toLowerCase().replace(/_/g, " ")}`, facts: data.detail.grantName ? [`Grant ${codeName(data.detail.grantName).name}`] : [] };
    case "live": {
      // "Ready" only when no published evidence branch is unavailable; otherwise the banner says it is incomplete (QA8 B-A3).
      const missing = data.payload.derivedBranches.filter((branch) => branch.state !== "AVAILABLE").length;
      return {
        tone: missing > 0 ? "warn" : "mute",
        headline: missing > 0 ? `Evidence incomplete · ${missing} of ${data.payload.derivedBranches.length} evidence branches not available · Live decisions are closed` : "Evidence ready · Live decisions are closed",
        facts: data.payload.readAt ? [`Read ${instantText(data.payload.readAt) ?? data.payload.readAt}`] : [],
      };
    }
    case "r2v2": {
      // The lineage is what the body says it is; the old "no R1 lineage" claim is not made for a body that carries one.
      const lineage = data.parent.lineage;
      return {
        tone: "mute",
        headline: lineage.availability === "AVAILABLE" ? "R1 lineage published" : "R1 lineage not published",
        facts: [lineage.availability === "AVAILABLE" ? `R1 ${lineage.r1ApprovalId}` : codeName(lineage.reasonCode).name, `Approval ${STATUS_WORD[data.parent.approval.status].toLowerCase()}`],
      };
    }
    case "exitv2": {
      // The findings come from the evaluation, or from the criteria when that is the section the viewer may read.
      const { evaluation, criteria } = data.parent;
      const findings = evaluation.availability === "AVAILABLE"
        ? evaluation.findings
        : criteria.availability === "AVAILABLE" ? criteria.items.map((item) => item.finding) : null;
      if (findings === null) {
        return { tone: "mute", headline: "Evaluation not published", facts: evaluation.availability === "AVAILABLE" ? [] : [codeName(evaluation.reasonCode).name] };
      }
      const pass = findings.filter((finding) => finding.outcome === "PASS").length;
      const blocking = findings.filter((finding) => finding.blocking && finding.outcome !== "PASS").length;
      // Findings are counted as published; whether the gate is met is a verdict the body does not carry (FE-028).
      return {
        tone: blocking > 0 ? "warn" : "mute",
        headline: `Findings ${pass} of ${findings.length} pass`,
        facts: [`${blocking} blocking`, `Gate verdict: ${NOT_PUBLISHED.criteria}`, `Promotes to ${data.parent.review.promoteTo.replace(/_/g, " ").toLowerCase()}`],
        meter: findings.map((finding) => OUTCOME_MARK[finding.outcome]),
      };
    }
    case "livev2":
      // Follows the published `evidence_complete`: never "ready" for a body that says it is not.
      return {
        tone: data.parent.approval.evidenceComplete ? "mute" : "warn",
        headline: data.parent.approval.evidenceComplete ? "Evidence ready · Live decisions are closed" : "Evidence incomplete · Live decisions are closed",
        // One extra line, only when the guarded join holds (laneModel.liveBlockerLine); otherwise the generic state stands, never "no blockers".
        facts: [`Approval ${STATUS_WORD[data.parent.approval.status].toLowerCase()}`, ...(!data.parent.approval.evidenceComplete && liveBlockers !== null ? [`Blockers: ${liveBlockers}`] : [])],
      };
  }
}

/** The HIFI verdict meter: one 30x8 segment per criterion, coloured by its mark. The words are in the facts line; this is the shape of it. */
function Meter({ marks }: { marks: readonly Mark[] }) {
  const n = (mark: Mark) => marks.filter((m) => m === mark).length;
  return (
    <div className="exec-ck-meter" role="img" aria-label={`${marks.length} criteria: ${n("pass")} within, ${n("watch")} watch, ${n("fail")} blocking, ${n("insufficient")} insufficient`}>
      {marks.map((mark, index) => <i key={index} data-m={mark} />)}
    </div>
  );
}

/* ── the frame ────────────────────────────────────────────────────────────── */

export interface EvidenceFrameProps {
  kind: EvidenceKind | null;
  header: EvidenceHeader | null;
  evidence: EvidenceState;
  /** Why nothing can be shown for a selection the queue does not know. */
  unknownReason?: string | null;
  /** The approval evidence read (WP-K): history, diff and obligations; absent keeps the typed absences. */
  extra?: ExtraState;
  /** The selected inbox row, its workspace and whether its inbox read is the current one: for the guarded Live blocker join only. */
  blockerRow?: InboxRowV2 | null;
  requestedWorkspace?: string;
  inboxCurrent?: boolean;
}

export function EvidenceFrame({ kind, header, evidence, unknownReason, extra = IDLE_EXTRA, blockerRow = null, requestedWorkspace, inboxCurrent = false }: EvidenceFrameProps) {

  if (header === null) {
    return (
      <div className="exec-ck-empty">
        {unknownReason ? <PanelState status="empty" title="Request not on this page" reason={unknownReason} /> : <PanelState status="empty" title="Nothing selected" reason="Select a request in the queue, or press J to start." />}
      </div>
    );
  }

  const data = evidence.status === "ready" ? evidence.data : null;
  const gate = header.gate ?? (kind ? GATE_OF_KIND[kind] : null);
  const liveBlockers = data?.kind === "livev2"
    ? liveBlockerLine({ row: blockerRow, parent: data.parent, requestedWorkspace, rowCurrent: inboxCurrent })
    : null;
  const verdict = data ? verdictOf(data, liveBlockers) : null;
  // "N obligations stay open after approval": only the source's own five counts, only when published, and never on an R1 (it closes nothing).
  const published = extra.status === "ready" && extra.evidence.obligations.state === "PUBLISHED" ? extra.evidence.obligations.value : null;
  const obligationsFact = published !== null && data !== null && data.kind !== "r1"
    ? (obligationTotal(published) === 0 ? "No obligations stay open after approval" : `${obligationTotal(published)} obligations stay open after approval`)
    : null;

  return (
    <ClosedContext.Provider value={header.closed === true}>
    <EvidenceExtraContext.Provider value={extra}>
    <div className="exec-ck-evidence">
      <div className="exec-ck-head">
        <div className="exec-ck-titleline">
          {kind ? <span className="exec-ck-kd">{KIND_TAG[kind]}</span> : null}
          <h2 className="exec-ck-h">{titleOf(header, data)}</h2>
        </div>
        <div className="exec-ck-meta">
          <span className="exec-ck-id">{header.id}</span>
          {header.context ? <span>{header.context}</span> : null}
          {header.requestedBy ? <span data-testid="ck-requested-by">Requested by {header.requestedBy}</span> : <span data-testid="ck-requested-by">Requested by: <NotPublished text={NOT_PUBLISHED.decisionCall} /></span>}
          <span>Ladder: <NotPublished text={NOT_PUBLISHED.decisionCall} /></span>
        </div>
      </div>

      {evidence.status === "loading" ? <PanelSkeleton label="Loading evidence" /> : null}
      {evidence.status === "failed" ? <PanelState status={evidence.panel} reason={evidence.reason} /> : null}

      {verdict ? (
        <div className="exec-ck-verdict" data-tone={verdict.tone}>
          <h3 className="exec-ck-vh">{verdict.headline}</h3>
          {verdict.facts.length > 0 || obligationsFact !== null ? <div className="exec-ck-meta">{verdict.facts.map((fact) => <span key={fact}>{fact}</span>)}{obligationsFact !== null ? <span data-testid="ck-obligations-fact">{obligationsFact}</span> : null}</div> : null}
          {/* The hi-fi's one line under the headline: the approvers so far and the time left, each only as published (the checklist count is the headline and the meter's). */}
          {header.quorum || header.left ? (
            <div className="exec-ck-meta" data-testid="ck-verdict-line">
              {header.quorum ? <span>Quorum {shownQuorum(header.quorum.met, header.quorum.required)}</span> : null}
              {header.left ? <span>{header.left}</span> : null}
            </div>
          ) : null}
          {verdict.meter && verdict.meter.length > 0 ? (
            <div className="exec-ck-meterline">
              <span className="exec-ck-meter-count">{verdict.meter.filter((m) => m === "pass").length}/{verdict.meter.length}</span>
              <Meter marks={verdict.meter} />
            </div>
          ) : null}
        </div>
      ) : null}

      {evidence.status === "ready" && evidence.partial ? (
        <p className="exec-ck-note" role="status">Partial read: {evidence.warnings.join("; ")}</p>
      ) : null}

      {data?.kind === "r1" ? <R1Body detail={data.detail} /> : null}
      {data?.kind === "r2" ? <R2Body detail={data.detail} /> : null}
      {data?.kind === "exit" ? <ExitBody detail={data.detail} /> : null}
      {data?.kind === "live" ? <LiveBody data={data} /> : null}
      {data?.kind === "r2v2" ? <R2V2Body parent={data.parent} /> : null}
      {data?.kind === "exitv2" ? <ExitV2Body parent={data.parent} /> : null}
      {data?.kind === "livev2" ? <LiveV2Body parent={data.parent} /> : null}

      {/* The structure the hi-fi gives every gate (concept C4): the diff, what stays open after approval (not an R1 matter: R1 closes
          nothing), and where the evidence came from. Typed absences until a source publishes them (inbox requests, WP-E). */}
      {data !== null ? <EvidenceDiffPanel /> : null}
      {data !== null && data.kind !== "r1" ? <StillOpenPanel /> : null}
      {data !== null ? <ProvenanceDetails data={data} gate={gate} /> : null}
    </div>
    </EvidenceExtraContext.Provider>
    </ClosedContext.Provider>
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

/** The banner's headline for a waiver, from the server's own state word (`state` is server-computed; nothing here re-derives it). */
const WAIVER_BANNER: Readonly<Record<ConditionRow["state"], { tone: Tone; headline: string }>> = {
  EXPIRING: { tone: "warn", headline: "Expiring · decide before it lapses" },
  LAPSED: { tone: "bad", headline: "Lapsed" },
  OPEN: { tone: "mute", headline: "Open" },
  WAIVED: { tone: "mute", headline: "Waived" },
};

/** Rows drawn on the runway: the register's first page is at most 50, and 12 lines are as many as the pane reads at a glance. */
export const RUNWAY_ROWS = 12;

/**
 * "What lapses when": one line per waiver on a shared axis of 0 to 45 days, counted from the register's own read time. A waiver with
 * a lapse time is a marker on its line; one that already lapsed sits at the start and says how long ago; one with no `due_at` is a
 * dashed line that says it closes by an event. Nothing here is a forecast: the lengths are the published times and the axis is only scale.
 */
function Runway({ register, readAt, selectedId, onSelect }: { register: readonly ConditionRow[]; readAt: string | null; selectedId: string; onSelect?(key: string): void }) {
  const views = register.map((entry) => ({ entry, clock: lapseView(entry.dueAt, readAt) }));
  const clocked = views.filter((v) => v.clock.kind !== "none").sort((a, b) => (Date.parse(a.entry.dueAt ?? "") || 0) - (Date.parse(b.entry.dueAt ?? "") || 0));
  const unclocked = views.filter((v) => v.clock.kind === "none");
  const ordered = [...clocked, ...unclocked];
  const shown = ordered.slice(0, RUNWAY_ROWS);
  // The open waiver is always on its own runway, even when the register has more lines than fit.
  if (!shown.some((v) => v.entry.conditionId === selectedId)) {
    const own = ordered.find((v) => v.entry.conditionId === selectedId);
    if (own) shown[shown.length - 1] = own;
  }
  return (
    <Panel title="Runway · what lapses when">
      {register.length === 0 ? (
        <div className="exec-ck-pad"><span className="exec-ck-np">The register page holds no waiver to draw.</span></div>
      ) : (
        <div className="exec-ck-runway" data-testid="ck-runway">
          <ol className="exec-ck-runway-list" aria-label="What lapses when">
            {shown.map(({ entry, clock }) => (
              <li key={entry.conditionId} data-selected={entry.conditionId === selectedId ? "true" : undefined} data-clock={clock.kind}>
                <button type="button" className="exec-ck-runway-row" aria-current={entry.conditionId === selectedId ? "true" : undefined} onClick={() => onSelect?.(entry.conditionId)}>
                  <span className="exec-ck-runway-name">{entry.subjectLabel} · {entry.label}</span>
                  <span className="exec-ck-runway-track" data-kind={clock.kind} role="img" aria-label={clock.phrase}>
                    {clock.kind === "none" ? (
                      <span className="exec-ck-runway-note">{clock.phrase}</span>
                    ) : clock.kind === "ahead" ? (
                      <>
                        <i className="exec-ck-runway-fill" style={{ width: `${clock.offsetPct}%` }} />
                        <b className="exec-ck-runway-mark" data-beyond={clock.beyond ? "true" : undefined} style={{ left: `${clock.offsetPct}%` }} />
                      </>
                    ) : clock.kind === "lapsed" ? (
                      <b className="exec-ck-runway-mark" data-lapsed="true" style={{ left: "0%" }} />
                    ) : null}
                  </span>
                  <span className="exec-ck-runway-when">
                    {clock.kind === "ahead" ? `${clock.beyond ? "past " : ""}${clock.beyond ? `${RUNWAY_AXIS_DAYS} d` : clock.phrase.replace(/^lapses in /, "")}` : clock.kind === "none" ? "" : clock.phrase}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="exec-ck-runway-axisrow" aria-hidden="true">
            <span />
            <div className="exec-ck-runway-axis">
              {RUNWAY_TICKS_DAYS.map((day) => <span key={day} style={{ left: `${(day / RUNWAY_AXIS_DAYS) * 100}%` }}>{`${day} d`}</span>)}
            </div>
            <span />
          </div>
          {ordered.length > shown.length ? <p className="exec-ck-note exec-ck-pad">Showing {shown.length} of {ordered.length} waivers loaded.</p> : null}
          <p className="exec-ck-note exec-ck-pad">Shared axis 0 to {RUNWAY_AXIS_DAYS} d, counted from the register's read time{readAt ? ` (${instantText(readAt) ?? readAt})` : ", which this read does not state"}.</p>
        </div>
      )}
    </Panel>
  );
}

export function WaiverEvidence({ row, register = [], readAt = null, onSelect }: { row: ConditionRow; register?: readonly ConditionRow[]; readAt?: string | null; onSelect?(key: string): void }) {
  const clock = lapseView(row.dueAt, readAt);
  const banner = WAIVER_BANNER[row.state];
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
      <div className="exec-ck-verdict" data-tone={banner.tone} data-testid="ck-waiver-banner">
        <h3 className="exec-ck-vh">{banner.headline}</h3>
        <div className="exec-ck-meta">
          <span>Runway below</span>
          <span>{clock.kind === "none" ? clock.phrase : clock.phrase[0]!.toUpperCase() + clock.phrase.slice(1)}</span>
          <span>No approver quorum</span>
        </div>
      </div>
      <Runway register={register.length > 0 ? register : [row]} readAt={readAt} selectedId={row.conditionId} onSelect={onSelect} />
      <Panel title="Condition">
        <Kv
          rows={[
            { label: "Statement", value: row.statement },
            { label: "Source decision", value: <span className="exec-ck-id">{row.approvalId}</span> },
            { label: "Gate", value: row.gate },
            { label: "Subject", value: row.subjectLabel },
            { label: "Environment", value: row.environment },
            { label: "Owner", value: row.owner },
            { label: "Lapses", value: <Word value={instantText(row.dueAt)} fe="FE-030" /> },
            { label: "Policy", value: row.policyVersion },
          ]}
        />
      </Panel>
    </div>
  );
}
