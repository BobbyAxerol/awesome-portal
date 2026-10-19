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
import { NotPublished, SectionPanel } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { PanelState } from "../../../components/states";
import { actionWord, humanize, severityFlag } from "./model";
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

function shown(c: CollectionView<unknown>): string {
  const cut = capLabel(c.rows.length, c.total);
  if (cut !== null) return cut;
  if (c.total === null) return "Count not published";
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
        <span className="exec-sbx-id" title={r.code ?? undefined}>{r.id}</span>
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
      <SectionPanel level={2} title="Findings" aside="Not available">
        <p className="exec-sbx-note"><NotPublished id="FE-072">Reconciliation findings</NotPublished></p>
      </SectionPanel>
    );
  }
  const sourcesReported = view.panels.some((p) => p.state === "ok");
  return (
    <SectionPanel level={2} title="Findings" aside={shown(f)} flush>
      {f.rows.length === 0 ? (
        <PanelState
          status="empty"
          reason={sourcesReported ? "No findings were recorded." : "No findings were returned. With the sources unavailable this is an absence of evidence, not a clean result."}
        />
      ) : (
        <CardsTable columns={FINDING_COLUMNS} rows={keyed(f.rows).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Reconciliation findings" />
      )}
    </SectionPanel>
  );
}

/* ── promotion plans ──────────────────────────────────────────────────────── */

const PLAN_COLUMNS: readonly CardsColumn<PlanView & { k: string }>[] = [
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
  { key: "envelope", label: "Envelope", numeric: true, render: () => <NotPublished id="FE-072" compact /> },
  { key: "author", label: "Author", render: () => <NotPublished id="FE-072" compact /> },
];

export function PlansPanel({ view }: { view: SandboxView }) {
  if (view.plans === null) {
    return (
      <SectionPanel level={2} title="Promotion plans" aside="Not available">
        <p className="exec-sbx-note"><NotPublished id="FE-072">Promotion plans</NotPublished></p>
      </SectionPanel>
    );
  }
  return (
    <SectionPanel level={2} title="Promotion plans" aside={capLabel(view.plans.length, null) ?? `${view.plans.length} recorded`} flush>
      {view.plans.length === 0 ? (
        <PanelState status="empty" reason="No promotion plan has been recorded for this certification." />
      ) : (
        <>
          <CardsTable columns={PLAN_COLUMNS} rows={keyed(view.plans).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Promotion plans" />
          <p className="exec-sbx-note">
            A plan records a refusal to promote; it does not start Canary. Envelope and Author are{" "}
            <NotPublished id="FE-072">Typed plan fields</NotPublished>.
          </p>
        </>
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
      <SectionPanel level={2} title="Timeline" aside="UTC">
        <p className="exec-sbx-note"><NotPublished id="FE-072">Certification timeline</NotPublished></p>
      </SectionPanel>
    );
  }
  return (
    <SectionPanel level={2} title="Timeline" aside={`UTC · ${shown(t)}`} flush>
      {t.rows.length === 0 ? (
        <PanelState status="empty" reason="No event has been recorded for this certification." />
      ) : (
        <CardsTable columns={TIMELINE_COLUMNS} rows={keyed(t.rows).slice(0, SANDBOX_ROW_CAP)} rowKey={(r) => r.k} label="Certification timeline" />
      )}
    </SectionPanel>
  );
}
