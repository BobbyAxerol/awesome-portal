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
 * apply or a decision write on the port: the reads are `listApprovals`,
 * `getApprovalHistory`, `getGateR1/R2`, `getLiveReview`, `getPaperExit`,
 * `getWaivers` and `getReviewCaptureCapabilities`.
 *
 * The one thing it can open is a form: "New request" shows the request drawer
 * (`?compose=request`, S3 W-REQUEST). The drawer is the only code here that
 * writes, and only on an explicit Submit click; the server decides whether the
 * write is allowed (`writeBlockedReason` is the delivery policy's word, not a
 * permission). While it is open it owns the keyboard: j/k/n/Esc do not drive the queue.
 *
 * Mount contract (the primary wires it): default export, props `{ api,
 * workspaceId?, pathSelection?, onClearPathSelection?, accessHref? }`. The V1
 * review URLs (`/governance/approvals/:id/{r1,r2,live}`,
 * `/governance/exit-reviews/:id`) can mount this same component with
 * `pathSelection` set from the route; the evidence frame links back to them.
 *
 * URL: `sel` (the open request), `view` (lane: r1, r2, exit-reviews, live, waiver; All is the default),
 * `lens` (needs, yours, closed; Open is the default) and `waiver` (the register's state filter). Lane, lens
 * and filter are written with replace, so a reload restores them and Back leaves the page (`viewUrl.ts`).
 * A researcher who opens `/governance/approvals/:id/r1` sees that one request read-only, not the list.
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
import { RequestDrawer } from "../request/RequestDrawer";
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
  statusClassOf,
  stepSelection,
  quorumText,
  waiverItems,
  type EvidenceKind,
  type Lane,
  type Lens,
  type Principal,
  type QueueItem,
} from "./laneModel";
import { KeysHelp } from "./KeysHelp";
import { laneFromView, lensFromUrl, waiverFromUrl, writeView, type CockpitView } from "./viewUrl";
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
  /** Why the delivery policy does not allow a governance write (`governanceWriteBlocked(policy)`), or null; forwarded to the New request drawer. */
  writeBlockedReason?: string | null;
}

export const PAGE_SIZE = 50;
/** The three panes sit side by side above 1100px; cockpit.css stacks them at 1100px and below. */
const AUTO_SELECT_QUERY = "(min-width: 1101px)";
const STACKED_QUERY = "(max-width: 1100px)";
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
  /** The read this state belongs to (`inboxScope`); null before any read. A render right after the view or workspace changes still holds the previous one's state. */
  scope: string | null;
}

/** What one inbox read is for: the server view and the workspace. */
const inboxScope = (view: string | null, workspaceId: string | undefined): string | null => (view === null ? null : `${view}\u0000${workspaceId ?? ""}`);

const IDLE_INBOX: InboxLoad = {
  status: "idle", failure: null, rows: [], warnings: [], counts: null, totalCount: null, filteredCount: null, hasMore: false, nextCursor: null, moreBusy: false, moreError: null, scope: null,
};

function useInbox(api: ExecutionApi, view: string | null, workspaceId: string | undefined): InboxLoad & { loadMore(): void } {
  const [state, setState] = useState<InboxLoad>(IDLE_INBOX);
  const latest = useRef(state);
  latest.current = state;
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    const scope = inboxScope(view, workspaceId);
    if (view === null) {
      setState(IDLE_INBOX);
      return;
    }
    setState({ ...IDLE_INBOX, status: "loading", scope });
    void api
      .listApprovals({ filter: view, limit: PAGE_SIZE, ...(workspaceId ? { workspaceId } : {}) })
      .then((result) => {
        if (generation.current !== mine) return;
        if (!result.ok) {
          setState({ ...IDLE_INBOX, status: "failed", scope, failure: { panel: settledPanel(result.status), reason: result.reason } });
          return;
        }
        const page = result.value.page;
        setState({
          ...IDLE_INBOX,
          status: "ready",
          scope,
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
        if (generation.current === mine) setState({ ...IDLE_INBOX, status: "failed", scope, failure: { panel: "unavailable", reason: "The queue read did not complete." } });
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

function OwnRequests({
  api,
  workspaceId,
  principal,
  pathSelection,
  onClearPathSelection,
  writeBlockedReason,
}: {
  api: ExecutionApi;
  workspaceId?: string;
  principal: Principal;
  pathSelection?: CockpitProps["pathSelection"];
  onClearPathSelection?: () => void;
  writeBlockedReason?: string | null;
}) {
  const [params] = useSearchParams();
  const url = useExecUrlState();
  const composing = url.value.compose === "request";
  const composeRef = useRef(false);
  composeRef.current = composing;
  const inbox = useInbox(api, "ALL", workspaceId);
  const { own, unknownOwner } = useMemo(() => ownRequests(inbox.rows, principal), [inbox.rows, principal]);

  // A request named by the path (`/governance/approvals/:id/r1`) is shown read-only, in place of the list. The page the
  // server returned says whether it is the reader's: a row on that page that is not listed as theirs is not opened. A
  // request off the page cannot be told apart here, so the evidence read (the server's own boundary) decides.
  const wanted = pathSelection ?? null;
  const onPage = wanted === null ? undefined : inbox.rows.find((row) => row.id === wanted.id);
  const isOwn = wanted !== null && own.some((row) => row.id === wanted.id);
  const settled = inbox.status === "ready" || inbox.status === "failed";
  const refused = wanted !== null && inbox.status === "ready" && onPage !== undefined && !isOwn;
  const evidenceTarget: EvidenceTarget | null = wanted !== null && settled && !refused ? { kind: wanted.kind, id: wanted.id } : null;
  const evidence = useEvidenceRead(api, evidenceTarget, workspaceId);
  const header: EvidenceHeader | null =
    wanted === null || evidenceTarget === null
      ? null
      : onPage
        ? itemHeader({ kind: "gate", key: onPage.id, row: onPage })
        : { id: wanted.id, title: null, context: null, gate: null };

  const clearRef = useRef(onClearPathSelection);
  clearRef.current = onClearPathSelection;
  useEffect(() => {
    if (wanted === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      // The New request drawer owns Esc while it is open.
      if (composeRef.current) return;
      clearRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wanted]);

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
        row.status === null ? <span className="exec-ck-np">Status not published</span> : row.status === "PENDING" ? <Flag kind="pending" label="Awaiting approval" size="sm" /> : <Flag kind={statusClassOf(row) === "closed" ? "neutral" : "unknown"} label={row.status} size="sm" />,
    },
    { key: "approvers", label: "Approvers", numeric: true, render: (row) => quorumText(row.quorumMet, row.quorumRequired) ?? <span className="exec-ck-np">{NOT_PUBLISHED.approvers}</span> },
    { key: "clock", label: "Clock", render: (row) => slaView(row.sla)?.phrase ?? <span className="exec-ck-np">{NOT_PUBLISHED.clock}</span> },
  ];

  const drawer = <RequestDrawer api={api} open={composing} onClose={() => url.set({ compose: null }, { replace: true })} writeBlockedReason={writeBlockedReason} />;

  if (wanted !== null) {
    return (
      <div className="exec-ck-page" data-screen="own-request">
        <div className="exec-ck-mast">
          <div>
            {onClearPathSelection ? (
              <button type="button" className="exec-ck-btn" onClick={onClearPathSelection}>← My requests</button>
            ) : null}
            <h1 className="exec-ck-h">My request</h1>
            <p className="exec-ck-sub">Read only · decisions are made by reviewers</p>
          </div>
        </div>
        {!settled ? <PanelSkeleton label="Loading your request" /> : null}
        {refused ? (
          <PanelState status="denied" title="Not listed as yours" reason={`${wanted.id} is on the page the server returned, but it is not listed as created by you, so it is not opened here.`} />
        ) : null}
        {evidenceTarget !== null ? (
          <section className="exec-ck-main" aria-label="Evidence">
            <EvidenceFrame kind={evidenceTarget.kind} header={header} evidence={evidence} />
          </section>
        ) : null}
        {drawer}
      </div>
    );
  }

  return (
    <div className="exec-ck-page">
      <div className="exec-ck-mast">
        <div>
          <h1 className="exec-ck-h">My requests</h1>
          <p className="exec-ck-sub">Read only · decisions are made by reviewers</p>
        </div>
        <div className="exec-ck-ctrls">
          <button type="button" className="exec-ck-btn" aria-haspopup="dialog" onClick={() => url.set({ compose: "request" })}>New request</button>
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
      {drawer}
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

function DecisionCockpit({ api, workspaceId, pathSelection, onClearPathSelection, writeBlockedReason, principal }: CockpitProps & { principal: Principal }) {
  const url = useExecUrlState();
  // The New request drawer (`?compose=request`) owns the keyboard while it is open: j/k/n/Esc inside it do not drive the queue.
  const composing = url.value.compose === "request";
  const composeRef = useRef(false);
  composeRef.current = composing;
  const [params, setParams] = useSearchParams();
  // Lane, lens and waiver filter are the URL's (M9): a reload and Back restore them; a bad value reads as the default.
  const lane: Lane = laneFromView(url.value.view);
  const lens: Lens = lensFromUrl(params.get("lens"));
  const waiverFilter: WaiverFilter = waiverFromUrl(params.get("waiver"));
  const setView = useCallback((patch: CockpitView) => setParams(writeView(params, patch), { replace: true }), [params, setParams]);
  const setLane = useCallback((next: Lane) => setView({ lane: next }), [setView]);
  const setLens = useCallback((next: Lens) => setView({ lens: next }), [setView]);
  const setWaiverFilter = useCallback((next: WaiverFilter) => setView({ waiver: next }), [setView]);
  useEffect(() => {
    const canonical = writeView(params, { lane, lens, waiver: waiverFilter });
    if (canonical.toString() !== params.toString()) setParams(canonical, { replace: true });
  }, [params, setParams, lane, lens, waiverFilter]);
  const [announcement, setAnnouncement] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

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

  // Lane chips carry a count (HIFI). The server publishes no per-lane count, so it is taken from the last page the
  // All lane loaded and kept while another lane is open; it is an at-least number when that page had more.
  const [allPage, setAllPage] = useState<{ rows: readonly InboxRowV2[]; more: boolean } | null>(null);
  const allScope = inboxScope(serverViewFor("all"), workspaceId);
  // A new workspace, or a new api for the same one, owns none of the old page: drop it before anything else can read it.
  useEffect(() => {
    setAllPage(null);
  }, [api, workspaceId]);
  useEffect(() => {
    // Only the All read counts, and only the state that belongs to it: on the render where the lane flips, `inbox`
    // still holds the previous lane's rows (its scope differs), and they must not become the chips' numbers.
    if (lane !== "all" || inbox.scope !== allScope) return;
    if (inbox.status === "ready") setAllPage({ rows: inbox.rows, more: inbox.hasMore });
    else if (inbox.status === "loading" || inbox.status === "failed") setAllPage(null);
  }, [lane, allScope, inbox.scope, inbox.status, inbox.rows, inbox.hasMore]);
  const laneCounts = useMemo(() => {
    if (allPage === null) return null;
    const open = (id: Exclude<Lane, "waiver">) => gateItems({ rows: allPage.rows, decided: [], lane: id, lens: "open", principal }).length;
    return { all: open("all"), r1: open("r1"), r2: open("r2"), exit: open("exit"), live: open("live") };
  }, [allPage, principal]);

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
  // While the shortcut list is open it owns the keyboard (it closes itself on Esc).
  const helpRef = useRef(false);
  helpRef.current = helpOpen;
  const urlSet = url.set;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (composeRef.current) return;
      const { keys, selectedKey: current, hadSel } = keyState.current;
      const key = event.key.toLowerCase();
      if (helpRef.current) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      } else if (key === "j" || key === "k") {
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

  // Stacked, the evidence sits below the whole queue: bring it into view when a request is picked.
  const select = useCallback(
    (key: string) => {
      urlSet({ sel: key });
      if (typeof window.matchMedia === "function" && window.matchMedia(STACKED_QUERY).matches) {
        requestAnimationFrame(() => document.querySelector(".exec-ck-main")?.scrollIntoView?.({ block: "start" }));
      }
    },
    [urlSet],
  );

  // First load on a wide screen opens the request that most needs the reader, so the evidence and the decision
  // rail are not an empty page (HIFI selects one). Once per mount: Esc still clears, and a link's `sel` wins.
  // At 1100px and below the panes stack, so an unasked-for selection would push the queue away: nothing is chosen there.
  const firstLoadDone = useRef(false);
  const settled = lane === "waiver" ? waivers.status === "ready" || waivers.status === "failed" : inbox.status === "ready" || inbox.status === "failed";
  useEffect(() => {
    if (firstLoadDone.current || !settled) return;
    firstLoadDone.current = true;
    if (selectedKey !== null || items.length === 0) return;
    const wide = typeof window.matchMedia === "function" ? window.matchMedia(AUTO_SELECT_QUERY).matches : true;
    if (!wide) return;
    const first = items.find((item) => item.kind === "gate" && item.row.needsYou === true) ?? items[0]!;
    urlSet({ sel: first.key }, { replace: true });
  }, [settled, selectedKey, items, urlSet]);

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
          <button type="button" className="exec-ck-btn" aria-haspopup="dialog" onClick={() => setHelpOpen(true)}>
            <kbd>?</kbd> Keys
          </button>
          {/* Pushes a history entry, so Back closes the drawer; the drawer's own close replaces. */}
          <button type="button" className="exec-ck-btn" aria-haspopup="dialog" onClick={() => url.set({ compose: "request" })}>New request</button>
        </div>
      </div>
      <p className="exec-ck-banner" role="note">Preview build. Decisions are shown here, not recorded.</p>

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
          laneCounts={laneCounts}
          laneCountsAtLeast={allPage?.more === true}
          onHelp={() => setHelpOpen(true)}
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

      <p className="exec-ck-live" role="status" aria-live="polite">{announcement}</p>
      {helpOpen ? <KeysHelp onClose={() => setHelpOpen(false)} /> : null}
      {/* Always mounted and driven by `open`: the draft survives Back, and the Run Library is read on first open only. */}
      <RequestDrawer api={api} open={composing} onClose={() => url.set({ compose: null }, { replace: true })} writeBlockedReason={writeBlockedReason} />
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
  if (mode === "own") {
    return (
      <OwnRequests
        api={props.api}
        workspaceId={props.workspaceId}
        principal={who}
        pathSelection={props.pathSelection}
        onClearPathSelection={props.onClearPathSelection}
        writeBlockedReason={props.writeBlockedReason}
      />
    );
  }
  return <DecisionCockpit {...props} principal={who} />;
}
