/**
 * Findings, Promotion plans and Timeline (hi-fi sandbox.html `tbl`), each a `CardsTable`
 * that stacks into cards at 660px.
 *
 * Every cell is a published value or `Not available`: a cell that has nothing renders `null`
 * and the table prints the word, never a dash and never 0. A V2 body carries none of the three
 * lists, so each panel says `Not published (FE-072)` instead of an empty table (an empty table
 * would read as "none recorded", which is a claim the V2 body does not make).
 *
 * The finding row the published V1 schema carries is id, severity, code, summary, blocking, evidence
 * hash, as-of, resolved-at and created-at. Opened is `created_at`; Status is Open when `resolved_at` is
 * null, Resolved when it is an instant, and `Not available` when the row does not say (an absent key is
 * never read as open).
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { GapLine, GapWhy, NotPublished, SectionPanel, type GapItem } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { PanelState } from "../../../components/states";
import { WHY_MISSING, actionWord, humanize, severityFlag } from "./model";
import type { CollectionView, FindingView, PlanView, SandboxView, TimelineRowView } from "./readSandbox";
import type { UtcEpochMs } from "../../../screenDataContract";

const time = (at: UtcEpochMs | null) => (at === null ? null : <time dateTime={new Date(at).toISOString()}>{formatAsOf(at)}</time>);

/** A key per row that survives a repeated id (a malformed body must not make two rows share one). */
const keyed = <R extends { id: string }>(rows: readonly R[]): (R & { k: string })[] => rows.map((r, i) => ({ ...r, k: `${i}:${r.id}` }));

/** The most rows a table draws. A body can carry more; the rest are counted, not drawn. */
export const SANDBOX_ROW_CAP = 250;

/** `Showing 250 of N` when the table is cut at the cap, else `null`. */
function capLabel(loaded: number, total: number | null): string | null {
  return loaded > SANDBOX_ROW_CAP ? `Showing ${SANDBOX_ROW_CAP} of ${Math.max(loaded, total ?? 0)}` : null;
}

function shown(c: CollectionView<unknown>): string | null {
  const cut = capLabel(c.rows.length, c.total);
  if (cut !== null) return cut;
  // No published total: the table lists what the body returned and claims nothing more.
  if (c.total === null) return null;
  return c.truncated ? `Showing ${c.returned ?? c.rows.length} of ${c.total}` : `${c.total} recorded`;
}

/* ── findings ─────────────────────────────────────────────────────────────── */

const FINDING_COLUMNS: readonly CardsColumn<FindingView & { k: string }>[] = [
  {
    key: "finding",
    label: "Finding",
    render: (r) => (
      <>
        {r.summary === null ? null : <span>{r.summary}</span>}
        {r.summary === null ? null : " "}
        {/* With a summary the id is a support reference, not something to read: it and the finding code sit behind one "?" (RV-06). A finding with no summary has the id as its only name. */}
        {r.summary === null ? (
          <span className="exec-sbx-id" title={r.code ?? undefined}>{r.id}</span>
        ) : (
          <GapWhy name="Finding reference" rows={[r.id, ...(r.code === null ? [] : [r.code])]} next={null} />
        )}
        {/* A finding whose blocking bit cannot be read is not waved through: it says so (failClosed.test.ts). */}
        {r.blocking === null ? <>{" "}<Flag kind="unknown" label="Blocking not stated" size="sm" /></> : r.blocking ? <>{" "}<Flag kind="attention" label="Blocking" size="sm" /></> : null}
      </>
    ),
  },
  { key: "severity", label: "Severity", render: (r) => { const f = severityFlag(r.severity); return <Flag kind={f.kind} label={f.label} size="sm" />; } },
  { key: "opened", label: "Opened", render: (r) => time(r.openedAt) },
  {
    key: "status",
    label: "Status",
    render: (r) =>
      r.state === "unknown" ? null : r.state === "open" ? <Flag kind="pending" label="Open" size="sm" /> : (
        <>
          <Flag kind="ok" label="Resolved" size="sm" />
          {r.resolvedAt === null ? null : <>{" "}{time(r.resolvedAt)}</>}
        </>
      ),
  },
];

export function FindingsPanel({ view }: { view: SandboxView }) {
  const f = view.findings;
  if (f === null) {
    return (
      <SectionPanel level={2} title="Findings">
        <GapLine items={[{ label: "Reconciliation findings", id: "FE-072" }]} />
        <p className="exec-sbx-note" data-role="why-missing">{WHY_MISSING.findings}</p>
      </SectionPanel>
    );
  }
  const sourcesReported = view.panels.some((p) => p.state === "ok");
  return (
    <SectionPanel level={2} title="Findings" aside={shown(f) ?? undefined} flush>
      {f.rows.length === 0 ? (
        <PanelState
          status="empty"
          reason={sourcesReported ? "No findings recorded." : "No findings returned; with the sources unavailable that is not a clean result."}
        />
      ) : (
        <CardsTable scrollHint columns={FINDING_COLUMNS} rows={keyed(f.rows).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Reconciliation findings" />
      )}
    </SectionPanel>
  );
}

/* ── promotion plans ──────────────────────────────────────────────────────── */

type PlanRow = PlanView & { k: string };

const PLAN_COLUMNS: readonly CardsColumn<PlanRow>[] = [
  { key: "plan", label: "Plan", render: (r) => <span className="exec-sbx-id">{r.id}</span> },
  { key: "target", label: "Target", render: (r) => (r.target === null ? null : humanize(r.target)) },
  { key: "created", label: "Created (UTC)", render: (r) => time(r.createdAt) },
  {
    key: "status",
    label: "Status",
    render: (r) => (r.status === null ? null : <Flag kind={r.status === "BLOCKED" ? "rejected" : "pending"} label={humanize(r.status)} size="sm" />),
  },
  {
    key: "blockers",
    label: "Blockers",
    render: (r) =>
      r.blockerCodes.length === 0 ? null : (
        <details className="exec-sbx-codes">
          <summary>{r.blockerCodes.length === 1 ? "1 blocker" : `${r.blockerCodes.length} blockers`}</summary>
          <ul>{r.blockerCodes.map((code) => <li key={code}>{code}</li>)}</ul>
        </details>
      ),
  },
  {
    key: "envelope",
    label: "Envelope",
    numeric: true,
    render: (r) => {
      // FE-072: the latest Canary envelope drafted from this plan. AVAILABLE with no value is the server saying none exists.
      if (r.envelope === null) return <NotPublished id="FE-072" />;
      if (r.envelope.kind === "not-published") return <NotPublished id="FE-072" titleReason={r.envelope.reasonCode} />;
      return r.envelope.value === null ? "None drafted" : <span className="exec-sbx-id">{r.envelope.value.envelopeId} · rev {r.envelope.value.revision} · Draft</span>;
    },
  },
  { key: "author", label: "Author", render: (r) => (r.author === null ? <NotPublished id="FE-072" /> : <span className="exec-sbx-id">{r.author}</span>) },
];

/** A column that no row can fill is not drawn: its name joins one `Not available` line under the table. */
function planColumns(plans: readonly PlanView[]): { columns: readonly CardsColumn<PlanRow>[]; gaps: GapItem[] } {
  const envelopeGap = plans.every((p) => p.envelope === null || p.envelope.kind === "not-published");
  const authorGap = plans.every((p) => p.author === null);
  const envelopeReason = plans.flatMap((p) => (p.envelope !== null && p.envelope.kind === "not-published" ? [p.envelope.reasonCode] : []))[0] ?? null;
  const gaps: GapItem[] = [
    ...(envelopeGap ? [{ label: "Envelope", id: "FE-072", reason: envelopeReason }] : []),
    ...(authorGap ? [{ label: "Author", id: "FE-072" }] : []),
  ];
  return { columns: PLAN_COLUMNS.filter((c) => !(c.key === "envelope" && envelopeGap) && !(c.key === "author" && authorGap)), gaps };
}

export function PlansPanel({ view }: { view: SandboxView }) {
  if (view.plans === null) {
    return (
      <SectionPanel level={2} title="Promotion plans">
        <GapLine items={[{ label: "Promotion plans", id: "FE-072" }]} />
      </SectionPanel>
    );
  }
  const { columns, gaps } = planColumns(view.plans);
  return (
    <SectionPanel level={2} title="Promotion plans" aside={capLabel(view.plans.length, null) ?? `${view.plans.length} recorded`} flush>
      {view.plans.length === 0 ? (
        <PanelState status="empty" reason="No plans recorded." />
      ) : (
        <div title="A plan records a refusal to promote; it does not start Canary.">
          <CardsTable scrollHint columns={columns} rows={keyed(view.plans).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Promotion plans" />
          {gaps.length > 0 ? <div className="exec-sbx-note"><GapLine items={gaps} /></div> : null}
        </div>
      )}
    </SectionPanel>
  );
}

/* ── timeline ─────────────────────────────────────────────────────────────── */

const TIMELINE_COLUMNS: readonly CardsColumn<TimelineRowView & { k: string }>[] = [
  { key: "at", label: "At (UTC)", render: (r) => time(r.at) },
  { key: "event", label: "Event", render: (r) => actionWord(r.action).outcome },
  { key: "by", label: "By", render: (r) => (r.actor === null ? null : <span className="exec-sbx-id">{r.actor}</span>) },
];

export function TimelinePanel({ view }: { view: SandboxView }) {
  const t = view.timeline;
  if (t === null) {
    return (
      <SectionPanel level={2} title="Timeline">
        <GapLine items={[{ label: "Certification timeline", id: "FE-072" }]} />
      </SectionPanel>
    );
  }
  return (
    <SectionPanel level={2} title="Timeline" aside={`UTC${shown(t) === null ? "" : ` · ${shown(t)}`}`} flush>
      {t.rows.length === 0 ? (
        <PanelState status="empty" reason="No events recorded." />
      ) : (
        <CardsTable scrollHint columns={TIMELINE_COLUMNS} rows={keyed(t.rows).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Certification timeline" />
      )}
    </SectionPanel>
  );
}
