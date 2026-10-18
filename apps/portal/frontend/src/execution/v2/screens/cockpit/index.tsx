/**
 * Approvals cockpit (Execution Loop V2, S1b, flag key `cockpit`).
 *
 * One Approvals screen with three panes: queue, evidence, decision rail. It
 * shows what the backend publishes today: the five gate kinds the inbox serves
 * (R1, R2, exit review, live review) and the waiver register as its own lane.
 * Archive, Reactivation and Capital are named and shown as not published.
 *
 * It is a preview. Every decision control is disabled with
 * "Preview · not recorded" (UXM-09), and this module never calls a plan, an
 * apply or any write on the port: the reads are `listApprovals`,
 * `getApprovalHistory`, `getGateR1/R2`, `getLiveReview`, `getPaperExit`,
 * `getWaivers` and `getReviewCaptureCapabilities`.
 *
 * Mount contract (the primary wires it): default export, props `{ api,
 * workspaceId?, pathSelection?, onClearPathSelection?, accessHref? }`. The V1
 * review URLs (`/governance/approvals/:id/{r1,r2,live}`,
 * `/governance/exit-reviews/:id`) can mount this same component with
 * `pathSelection` set from the route; the evidence frame links back to them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ConditionRow, ExecutionApi, InboxResult } from "../../../api/ports";
import { useSession } from "../../../../auth/session";
import { PanelSkeleton, PanelState } from "../../../components/states";
import type { PanelStatus } from "../../../contracts";
import { reviewRouteFor, type DecidedRow } from "../../../screens/ApprovalInbox";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { useExecUrlState, withContext } from "../../urlState";
import "../../css/cockpit.css";
import { EvidenceFrame, useEvidenceRead, WaiverEvidence, type EvidenceHeader, type EvidenceTarget } from "./EvidenceFrame";
import { mergeInboxRows, readRawRows, type InboxRowV2 } from "./inboxRowV2";
import {
  DECISION_KEYS,
  deriveAccess,
  gateItems,
  kindOfGate,
  lensCounts as countLenses,
  NOT_PUBLISHED,
  ownRequests,
  PREVIEW_REASON,
  principalOf,
  serverViewFor,
  settledPanel,
  slaView,
  stepSelection,
  quorumText,
  waiverItems,
  type EvidenceKind,
  type Lane,
  type Lens,
  type Principal,
  type QueueItem,
} from "./laneModel";
import { Queue, MAX_QUEUE_DOM, type WaiverFilter } from "./Queue";
import { Rail, type RailTarget } from "./Rail";

export interface CockpitProps {
  api: ExecutionApi;
  /** The workspace the URL named; omitted means the caller's own. */
  workspaceId?: string;
  /** A selection taken from a V1 review path, for requests that are not on the loaded page. */
  pathSelection?: { id: string; kind: EvidenceKind } | null;
  /** Called by Esc when the selection came from the path and not from `?sel=`. */
  onClearPathSelection?: () => void;
  /** Where "My access" goes when the page is denied (D9). */
  accessHref?: string;
}

export const PAGE_SIZE = 50;
/** Rows kept in memory across pages; the queue shows at most `MAX_QUEUE_DOM` of them. */
export const MAX_LOADED_ROWS = 150;

/* ── reads ────────────────────────────────────────────────────────────────── */

type Failure = { panel: Exclude<PanelStatus, "ok" | "loading">; reason: string };

interface InboxLoad {
  status: "idle" | "loading" | "ready" | "failed";
  failure: Failure | null;
  rows: InboxRowV2[];
  warnings: string[];
  counts: InboxResult["counts"];
  totalCount: number | null;
  filteredCount: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  moreBusy: boolean;
  moreError: string | null;
}

const IDLE_INBOX: InboxLoad = {
  status: "idle", failure: null, rows: [], warnings: [], counts: null, totalCount: null, filteredCount: null, hasMore: false, nextCursor: null, moreBusy: false, moreError: null,
};

function useInbox(api: ExecutionApi, view: string | null, workspaceId: string | undefined): InboxLoad & { loadMore(): void } {
  const [state, setState] = useState<InboxLoad>(IDLE_INBOX);
  const latest = useRef(state);
  latest.current = state;
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    if (view === null) {
      setState(IDLE_INBOX);
      return;
    }
    setState({ ...IDLE_INBOX, status: "loading" });
    void api
      .listApprovals({ filter: view, limit: PAGE_SIZE, ...(workspaceId ? { workspaceId } : {}) })
      .then((result) => {
        if (generation.current !== mine) return;
        if (!result.ok) {
          setState({ ...IDLE_INBOX, status: "failed", failure: { panel: settledPanel(result.status), reason: result.reason } });
          return;
        }
        const page = result.value.page;
        setState({
          ...IDLE_INBOX,
          status: "ready",
          rows: mergeInboxRows(page.rows, readRawRows(result.value)),
          warnings: [...(result.warnings ?? [])],
          counts: result.value.counts,
          totalCount: page.totalCount,
          filteredCount: page.filteredCount ?? null,
          hasMore: page.hasMore === true,
          nextCursor: page.nextCursor ?? null,
        });
      })
      .catch(() => {
        if (generation.current === mine) setState({ ...IDLE_INBOX, status: "failed", failure: { panel: "unavailable", reason: "The queue read did not complete." } });
      });
  }, [api, view, workspaceId]);

  const loadMore = useCallback(() => {
    const cursor = latest.current.nextCursor;
    if (view === null || cursor === null || latest.current.moreBusy) return;
    const mine = generation.current;
    setState((s) => ({ ...s, moreBusy: true, moreError: null }));
    void api
      .listApprovals({ filter: view, after: cursor, limit: PAGE_SIZE, ...(workspaceId ? { workspaceId } : {}) })
      .then((result) => {
        if (generation.current !== mine) return;
        setState((s) => {
          if (!result.ok) return { ...s, moreBusy: false, moreError: result.reason };
          const seen = new Set(s.rows.map((row) => row.id));
          const fresh = mergeInboxRows(result.value.page.rows, readRawRows(result.value)).filter((row) => !seen.has(row.id));
          return {
            ...s,
            rows: [...s.rows, ...fresh],
            warnings: [...s.warnings, ...(result.warnings ?? [])],
            hasMore: result.value.page.hasMore === true,
            nextCursor: result.value.page.nextCursor ?? null,
            moreBusy: false,
          };
        });
      })
      .catch(() => {
        if (generation.current === mine) setState((s) => ({ ...s, moreBusy: false, moreError: "The next page did not load." }));
      });
  }, [api, view, workspaceId]);

  return { ...state, loadMore };
}

interface DecidedLoad {
  rows: readonly DecidedRow[];
  note: string | null;
}

function useDecided(api: ExecutionApi, enabled: boolean, workspaceId: string | undefined): DecidedLoad {
  const [state, setState] = useState<DecidedLoad>({ rows: [], note: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api
      .getApprovalHistory(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setState(result.ok ? { rows: result.value.rows, note: null } : { rows: [], note: `Decision history not read: ${result.reason}` });
      })
      .catch(() => {
        if (!cancelled) setState({ rows: [], note: "Decision history not read: the read did not complete." });
      });
    return () => {
      cancelled = true;
    };
  }, [api, enabled, workspaceId]);
  return state;
}

interface WaiverLoad {
  status: "idle" | "loading" | "ready" | "failed";
  failure: Failure | null;
  rows: readonly ConditionRow[];
  total: number | null;
  hasMore: boolean;
}

function useWaivers(api: ExecutionApi, enabled: boolean, filter: WaiverFilter): WaiverLoad {
  const [state, setState] = useState<WaiverLoad>({ status: "idle", failure: null, rows: [], total: null, hasMore: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "loading", failure: null, rows: [], total: null, hasMore: false });
    void api
      .getWaivers({ limit: PAGE_SIZE, ...(filter === "ALL" ? {} : { state: filter }) })
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", failure: null, rows: result.value.rows, total: result.value.filteredCount ?? result.value.totalCount, hasMore: result.value.hasMore }
            : { status: "failed", failure: { panel: settledPanel(result.status), reason: result.reason }, rows: [], total: null, hasMore: false },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed", failure: { panel: "unavailable", reason: "The waiver register read did not complete." }, rows: [], total: null, hasMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [api, enabled, filter]);
  return state;
}

/* ── header ───────────────────────────────────────────────────────────────── */

function CountLine({ counts, status }: { counts: InboxResult["counts"]; status: InboxLoad["status"] }) {
  if (counts === null) {
    return <span className="exec-ck-counts">{status === "loading" ? "Counting" : "Queue size not published"}</span>;
  }
  return (
    <span className="exec-ck-counts">
      <strong>{counts.pending}</strong> pending
      {counts.overdue === null ? " · overdue not counted" : ` · ${counts.overdue} overdue`}
      {counts.dueSoon === null ? " · due soon not counted" : ` · ${counts.dueSoon} due soon`}
    </span>
  );
}

function Denied({ accessHref }: { accessHref?: string }) {
  const [params] = useSearchParams();
  return (
    <div className="exec-ck-denied" role="alert">
      <h1 className="exec-ck-h">You can't open this page.</h1>
      <p>Your access does not include any approval read, so no request is shown here.</p>
      {accessHref ? <Link className="exec-ck-link" to={withContext(accessHref, params)}>My access</Link> : null}
    </div>
  );
}

/* ── researcher: own requests only ────────────────────────────────────────── */

function OwnRequests({ api, workspaceId, principal }: { api: ExecutionApi; workspaceId?: string; principal: Principal }) {
  const [params] = useSearchParams();
  const inbox = useInbox(api, "ALL", workspaceId);
  const { own, unknownOwner } = useMemo(() => ownRequests(inbox.rows, principal), [inbox.rows, principal]);

  const columns: CardsColumn<InboxRowV2>[] = [
    {
      key: "request",
      label: "Request",
      render: (row) => (
        <span>
          <Link className="exec-ck-link" to={withContext(reviewRouteFor({ id: row.id, gate: row.gate }), params)}>{row.id}</Link>{" "}
          <b>{row.subject}</b>
          <span className="exec-ck-note"> {row.gate.replace(/_/g, " ")}</span>
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) =>
        row.status === null ? <span className="exec-ck-np">Status not published</span> : row.status === "PENDING" ? <Flag kind="pending" label="Awaiting approval" size="sm" /> : <Flag kind="neutral" label={row.status} size="sm" />,
    },
    { key: "approvers", label: "Approvers", numeric: true, render: (row) => quorumText(row.quorumMet, row.quorumRequired) ?? <span className="exec-ck-np">Not published</span> },
    { key: "clock", label: "Clock", render: (row) => slaView(row.sla)?.phrase ?? <span className="exec-ck-np">Not published</span> },
  ];

  return (
    <div className="exec-ck-page">
      <div className="exec-ck-mast">
        <div>
          <h1 className="exec-ck-h">My requests</h1>
          <p className="exec-ck-sub">Read only · decisions are made by reviewers</p>
        </div>
      </div>
      {inbox.status === "loading" ? <PanelSkeleton label="Loading your requests" /> : null}
      {inbox.failure ? <PanelState status={inbox.failure.panel} reason={inbox.failure.reason} /> : null}
      {inbox.status === "ready" ? (
        <section className="exec-ck-panel" aria-label="Your requests">
          <div className="exec-ck-ph"><h2 className="exec-ck-pt">Your requests</h2><span className="exec-ck-pr">Decisions are made by reviewers</span></div>
          <CardsTable
            columns={columns}
            rows={own}
            rowKey={(row) => row.id}
            label="Your requests"
            empty={<PanelState status="empty" title="No requests of yours" reason="The page the server returned holds none that you created." />}
          />
          {unknownOwner > 0 ? (
            <p className="exec-ck-note exec-ck-pad">{unknownOwner} rows on this page do not say who created them, so they are not listed as yours. Creator: {NOT_PUBLISHED.decisionCall}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ── the cockpit ──────────────────────────────────────────────────────────── */

function itemHeader(item: QueueItem): EvidenceHeader | null {
  if (item.kind === "waiver") return null;
  const row = item.row;
  const context = item.kind === "gate" ? [item.row.target, item.row.releaseCandidate].filter((part) => part !== null).join(" · ") : "";
  return { id: row.id, title: row.subject, context: context || null, gate: row.gate };
}

function DecisionCockpit({ api, workspaceId, pathSelection, onClearPathSelection, principal }: CockpitProps & { principal: Principal }) {
  const url = useExecUrlState();
  const [lane, setLane] = useState<Lane>("all");
  const [lens, setLens] = useState<Lens>("open");
  const [waiverFilter, setWaiverFilter] = useState<WaiverFilter>("ALL");
  const [announcement, setAnnouncement] = useState("");

  // The waiver lane keeps the gate queue loaded (all gates) so the header counts and any selected gate stay honest.
  const inbox = useInbox(api, serverViewFor(lane === "waiver" ? "all" : lane), workspaceId);
  const decided = useDecided(api, true, workspaceId);
  const waivers = useWaivers(api, lane === "waiver", waiverFilter);

  const items: QueueItem[] = useMemo(
    () =>
      lane === "waiver"
        ? waiverItems(waivers.rows)
        : gateItems({ rows: inbox.rows, decided: decided.rows, lane, lens, principal }),
    [lane, lens, inbox.rows, decided.rows, waivers.rows, principal],
  );
  const counts = useMemo(() => (lane === "waiver" ? null : countLenses(inbox.rows, lane, principal)), [lane, inbox.rows, principal]);

  const selectedKey = url.value.sel ?? pathSelection?.id ?? null;

  // The selection is found among everything loaded, not only what the lens shows, so changing lens keeps the evidence open.
  const selected: QueueItem | null = useMemo(() => {
    if (selectedKey === null) return null;
    const visible = items.find((item) => item.key === selectedKey);
    if (visible) return visible;
    const row = inbox.rows.find((candidate) => candidate.id === selectedKey);
    if (row) return { kind: "gate", key: row.id, row };
    const old = decided.rows.find((candidate) => candidate.id === selectedKey);
    if (old) return { kind: "decided", key: old.id, row: old };
    const waiver = waivers.rows.find((candidate) => candidate.conditionId === selectedKey);
    return waiver ? { kind: "waiver", key: waiver.conditionId, row: waiver } : null;
  }, [selectedKey, items, inbox.rows, decided.rows, waivers.rows]);

  let evidenceTarget: EvidenceTarget | null = null;
  let header: EvidenceHeader | null = null;
  let unknownReason: string | null = null;
  if (selected && selected.kind !== "waiver") {
    evidenceTarget = { kind: kindOfGate(selected.row.gate), id: selected.row.id };
    header = itemHeader(selected);
  } else if (selectedKey !== null && !selected) {
    if (pathSelection && pathSelection.id === selectedKey) {
      evidenceTarget = { kind: pathSelection.kind, id: selectedKey };
      header = { id: selectedKey, title: null, context: null, gate: null };
    } else {
      unknownReason = `${selectedKey} is not on the page the server returned, so its kind is not known here. Open it from its review link.`;
    }
  }
  const evidence = useEvidenceRead(api, evidenceTarget, workspaceId);

  const target = evidenceTarget;
  const railTarget: RailTarget | null =
    selected?.kind === "waiver"
      ? { kind: "waiver", id: selected.key, row: null, decided: null, waiver: selected.row }
      : target
        ? {
            kind: target.kind,
            id: target.id,
            row: selected?.kind === "gate" ? selected.row : inbox.rows.find((row) => row.id === target.id) ?? null,
            decided: decided.rows.find((row) => row.id === target.id) ?? null,
            waiver: null,
          }
        : null;

  /* keys: J/K move, Esc clears, A/R/N announce why they do nothing */
  const keyState = useRef({ keys: [] as string[], selectedKey: null as string | null, hadSel: false });
  keyState.current = { keys: items.slice(0, MAX_QUEUE_DOM).map((item) => item.key), selectedKey, hadSel: url.value.sel !== null };
  const urlSet = url.set;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const { keys, selectedKey: current, hadSel } = keyState.current;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const next = stepSelection(keys, current, key === "j" ? "next" : "previous");
        if (next !== null && next !== current) urlSet({ sel: next }, { replace: true });
      } else if (event.key === "Escape") {
        setAnnouncement("");
        if (hadSel) urlSet({ sel: null }, { replace: true });
        else onClearPathSelection?.();
      } else if (key === "a" || key === "r" || key === "n") {
        event.preventDefault();
        setAnnouncement(`${DECISION_KEYS[key]} (${key.toUpperCase()}): ${PREVIEW_REASON}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [urlSet, onClearPathSelection]);

  const select = useCallback((key: string) => urlSet({ sel: key }), [urlSet]);

  const total = inbox.filteredCount ?? inbox.totalCount;
  const footer =
    lane === "waiver"
      ? `${waivers.rows.length} loaded${waivers.total !== null ? ` of ${waivers.total}` : " · total not published"}${waivers.hasMore ? " · more exist" : ""}`
      : `${items.length} shown · ${inbox.rows.length} loaded${total !== null ? ` of ${total}` : " · total not published"}${inbox.rows.length >= MAX_LOADED_ROWS && inbox.hasMore ? ` · top ${MAX_LOADED_ROWS} kept, narrow the lane for the rest` : ""}`;

  const loading = lane === "waiver" ? waivers.status === "loading" : inbox.status === "loading";
  const failure = lane === "waiver" ? waivers.failure : inbox.failure;
  const partialNote = lane === "waiver" ? null : inbox.warnings.length > 0 ? `Some rows could not be read: ${inbox.warnings.join("; ")}` : null;

  return (
    <div className="exec-ck-page">
      <div className="exec-ck-mast">
        <div>
          <h1 className="exec-ck-h">Approvals</h1>
          <p className="exec-ck-sub">Every decision, sorted by SLA</p>
        </div>
        <div className="exec-ck-ctrls">
          <CountLine counts={inbox.counts} status={inbox.status} />
        </div>
      </div>
      <p className="exec-ck-banner" role="note">Preview build. Decisions are shown here, not recorded. {PREVIEW_REASON}.</p>

      <div className="exec-ck">
        <Queue
          lane={lane}
          onLane={setLane}
          lens={lens}
          onLens={setLens}
          waiverFilter={waiverFilter}
          onWaiverFilter={setWaiverFilter}
          items={items}
          selectedKey={selectedKey}
          onSelect={select}
          loading={loading}
          failure={failure}
          partialNote={partialNote}
          lensCounts={counts}
          moreAvailable={lane !== "waiver" && inbox.hasMore && inbox.rows.length < MAX_LOADED_ROWS}
          onMore={inbox.loadMore}
          moreBusy={inbox.moreBusy}
          moreError={inbox.moreError}
          footer={footer}
          principal={principal}
          historyNote={decided.note}
        />
        <section className="exec-ck-main" aria-label="Evidence">
          {selected?.kind === "waiver" ? (
            <WaiverEvidence row={selected.row} />
          ) : (
            <EvidenceFrame kind={evidenceTarget?.kind ?? null} header={header} evidence={evidence} unknownReason={unknownReason} />
          )}
        </section>
        <aside className="exec-ck-rail" aria-label="Decision">
          <Rail api={api} target={railTarget} evidence={evidence} principal={principal} workspaceId={workspaceId} />
        </aside>
      </div>

      <div className="exec-ck-keys">
        <span><kbd>J</kbd> <kbd>K</kbd> move</span>
        <span><kbd>Esc</kbd> clear</span>
        <span><kbd>A</kbd> approve</span>
        <span><kbd>R</kbd> deny</span>
        <span><kbd>N</kbd> note</span>
      </div>
      <p className="exec-ck-live" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}

/* ── entry ────────────────────────────────────────────────────────────────── */

export default function ApprovalsCockpit(props: CockpitProps) {
  const { access, principal } = useSession();
  const who = useMemo(
    () => principalOf({ principalId: principal?.principalId, userId: access.kind === "ready" ? access.access.userId : null, username: principal?.username }),
    [principal, access],
  );
  const capabilities = useMemo(() => new Set(access.kind === "ready" ? access.access.capabilities : []), [access]);

  if (access.kind === "loading") return <div className="exec-ck-page"><PanelSkeleton label="Reading your access" /></div>;
  if (access.kind === "unavailable") {
    return (
      <div className="exec-ck-page">
        <PanelState status="unavailable" title="Access not read" reason="Your access could not be read, so this page cannot tell what you may open. This is not a denial." />
      </div>
    );
  }
  const mode = deriveAccess(capabilities).mode;
  if (mode === "denied") return <div className="exec-ck-page"><Denied accessHref={props.accessHref} /></div>;
  if (mode === "own") return <OwnRequests api={props.api} workspaceId={props.workspaceId} principal={who} />;
  return <DecisionCockpit {...props} principal={who} />;
}
