/**
 * The Account 360 panels that make a read of their own: the account equity
 * series and the activity feed. Each reads only when it is on screen, so a
 * reader who never opens Activity never pays for it.
 */
import { useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { EventFeed, NotPublished, SectionPanel } from "../../blocks";
import { ChartTools, EquityPanel } from "../../charts";
import { useAccountEquity, useSubjectPages } from "./reads";
import { FE, activityRows, equityModel, type BindingEnv } from "./model";
import { Np } from "./parts";

/* ── account equity (internal ledger, this sleeve) ──────────────────────── */

export interface EquityBlockProps {
  api: ExecutionApi;
  accountId: string;
  environment: BindingEnv | null;
  workspaceId: string | null;
  currency: string | null;
}

export function EquityBlock({ api, accountId, environment, workspaceId, currency }: EquityBlockProps) {
  const read = useAccountEquity(api, accountId, environment, workspaceId, true).state;
  if (environment === null) {
    return (
      <SectionPanel title="Account equity" aside="Internal ledger · this sleeve">
        <PanelState status="unavailable" reason="The account resource did not say which environment it is in, so no series was asked for." />
      </SectionPanel>
    );
  }
  if (read.phase === "loading" || read.phase === "idle") {
    return (
      <SectionPanel title="Account equity" aside="Internal ledger · this sleeve">
        <PanelState status="loading" />
      </SectionPanel>
    );
  }
  if (read.phase === "error") {
    return (
      <SectionPanel title="Account equity" aside="Internal ledger · this sleeve">
        <PanelState status={read.status} reason={read.reason} />
      </SectionPanel>
    );
  }
  const model = equityModel(read.value, currency);
  const cover = read.value.coverage;
  const sampled = read.value.sampling;
  const sourceCount = cover.filteredTotal !== null ? Number(cover.filteredTotal) : NaN;
  // Only a reduction the server declared is repeated; its extrema promise is the server's word.
  const serverEnvelope = cover.downsampled && cover.returnedCount !== null && Number.isSafeInteger(sourceCount) && sampled !== null
    ? { sourceCount, shownCount: cover.returnedCount, method: sampled.algorithm ?? "", keepsExtrema: typeof sampled.preservesExtrema === "boolean" ? sampled.preservesExtrema : false }
    : undefined;
  return (
    <SectionPanel title="Account equity" aside="Internal ledger · this sleeve">
      <ChartTools label="Account equity" columns={model.state.kind === "unavailable" ? [] : [{ key: "equity", label: "Equity", points: model.points, currency: model.currency ?? undefined }]}>
        <EquityPanel
          label="Account equity"
          points={model.points}
          currency={model.currency ?? undefined}
          state={model.state}
          height={220}
          serverEnvelope={serverEnvelope}
        />
      </ChartTools>
    </SectionPanel>
  );
}

/* ── activity ───────────────────────────────────────────────────────────── */

export interface ActivityPanelProps {
  api: ExecutionApi;
  accountId: string;
  environment: BindingEnv | null;
}

const RELATIONS = [
  { id: "orders", label: "Orders" },
  { id: "fills", label: "Fills" },
] as const;

export function ActivityPanel({ api, accountId, environment }: ActivityPanelProps) {
  const [relation, setRelation] = useState<"orders" | "fills">("orders");
  const pages = useSubjectPages(api, accountId, environment, relation, true);
  const picker = (
    <span className="exec-acct-seg" role="group" aria-label="Activity kind">
      {RELATIONS.map((entry) => (
        <button key={entry.id} type="button" className="exec-acct-segbtn" aria-pressed={relation === entry.id} onClick={() => setRelation(entry.id)}>
          {entry.label}
        </button>
      ))}
    </span>
  );

  if (environment === null) {
    return (
      <SectionPanel title="Activity" aside={picker}>
        <PanelState status="unavailable" reason="The account resource did not say which environment it is in, so no activity was asked for." />
      </SectionPanel>
    );
  }

  const state = pages.state;
  const merged = state.phase === "ready" ? state.value.pages.flatMap((page) => activityRows(page, relation).rows) : [];
  const unread = state.phase === "ready" ? state.value.pages.reduce((sum, page) => sum + activityRows(page, relation).withoutTime, 0) : 0;
  const rows = merged.slice(0, 200);
  const first = state.phase === "ready" ? state.value.pages[0] : null;
  const sourceUnavailable = first !== null && first !== undefined && first.state.toUpperCase() === "UNAVAILABLE";

  return (
    <>
      <EventFeed
        scope={accountId}
        title="Activity"
        rows={rows}
        status={
          state.phase === "loading" || state.phase === "idle" ? "loading"
            : state.phase === "error" ? state.status
              : sourceUnavailable ? "unavailable"
                : "ok"
        }
        reason={
          state.phase === "error" ? state.reason
            : sourceUnavailable ? "The retained activity window is unavailable for this account."
              : `No ${relation} recorded for ${accountId} in the retained window.`
        }
        cursor={
          pages.hasMore || pages.moreError
            ? { hasMore: pages.hasMore, loadingMore: pages.loadingMore, error: pages.moreError, onLoadMore: pages.loadMore }
            : undefined
        }
      />
      <div className="exec-acct-activity-foot">
        {picker}
        {unread > 0 ? <span className="exec-acct-note">{unread} {unread === 1 ? "row has" : "rows have"} no readable time and {unread === 1 ? "is" : "are"} not listed.</span> : null}
        {merged.length > rows.length ? <span className="exec-acct-note">Showing the first {rows.length} rows. Narrow the window to see the rest.</span> : null}
        <span className="exec-acct-note">
          Retained current window, not an audit trail. Actor and receipt: <Np fact={FE.audit} />. Audit events: <NotPublished id="FE-031" />.
        </span>
      </div>
    </>
  );
}
