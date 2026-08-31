/**
 * N29-FE-01 — product containers over the same-origin BFF port.
 *
 * Each container fetches exactly one declared route through `ExecutionApi`,
 * aborts on unmount, and hands the parsed envelope to a renderer. No fixture
 * producer is reachable from here — that is the boundary the import-scan
 * test walks.
 */
import { useEffect, useState } from "react";

import type { AlphaFleetQuery, BindingListQuery, ExecutionApi, Result } from "../api/ports";
import type {
  AlphaFleetItem, BindingItem, LiveReviewPayload, ManagerListEnvelope,
  ProfileEnvelope, QueryAnalytics,
} from "../api/profileRead";
import { readCommandCenter, type CommandCenter } from "../commandCenter";
import { CommandCenterLive } from "./containers";
import { PanelState } from "../components/states";
import { ProfileEnvelopeScreen, QueryAnalyticsScreen, TypedUnavailableScreen } from "./ProfileScreens";
import type { PanelStatus } from "../contracts";
import { StatusChip } from "../components/badges";
import { utcStamp } from "../time";

type Loaded<T> =
  | { status: "ok"; reason?: undefined; value: T }
  | { status: Exclude<PanelStatus, "ok">; reason?: string; value: null };

export function useApiRead<T>(run: () => Promise<Result<T>>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading", value: null });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", value: null });
    void run().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ok", value: result.value }
          : { status: result.status, reason: result.reason, value: null },
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function CommandCenterSnapshotContainer({ api }: { api: ExecutionApi }) {
  const state = useApiRead(() => api.getCommandCenterSnapshot(), [api]);
  if (state.status !== "ok") {
    return (
      <section className="exec-envelope" aria-label="Command Center">
        <h1 className="exec-role-h1">Command Center</h1>
        <PanelState status={state.status} reason={state.reason} />
      </section>
    );
  }
  const snapshot: CommandCenter | null = readCommandCenter(state.value);
  if (!snapshot) {
    return (
      <section className="exec-envelope" aria-label="Command Center">
        <h1 className="exec-role-h1">Command Center</h1>
        <PanelState status="unavailable" reason="The command-center snapshot could not be read." />
      </section>
    );
  }
  return <CommandCenterLive snapshot={snapshot} />;
}

const OVERVIEW_TITLE = {
  paper: "Paper — deployments overview",
  sandbox: "Sandbox — deployments overview",
  live: "Live — operations overview",
  blotter: "Full Blotter",
} as const;

export function StageOverviewContainer({ api, screen }: { api: ExecutionApi; screen: "paper" | "sandbox" | "live" | "blotter" }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getScreenProfile(screen), [api, screen]);
  return (
    <ProfileEnvelopeScreen
      title={OVERVIEW_TITLE[screen]}
      envelope={state.value}
      status={state.status}
      reason={state.reason}
      intro={
        screen === "live" && state.value?.state === "empty" ? (
          <p className="exec-role-meta exec-envelope-empty">
            A valid empty Live is empty — no live deployment exists in this workspace, and nothing
            here will ever fill that in from a fixture.
          </p>
        ) : undefined
      }
    />
  );
}

export function PaperWorkbenchContainer({ api, deploymentId, variant = "paper" }: { api: ExecutionApi; deploymentId: string; variant?: "paper" | "vnm" }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getPaperWorkbenchProfile(deploymentId, variant), [api, deploymentId, variant]);
  return (
    <ProfileEnvelopeScreen
      title={variant === "vnm" ? `Paper Workbench · ${deploymentId} · VN market` : `Paper Workbench · ${deploymentId}`}
      envelope={state.value}
      status={state.status}
      reason={state.reason}
    />
  );
}

export function QueryAnalyticsContainer({ api, subject, subjectId }: { api: ExecutionApi; subject: "alphas" | "portfolios"; subjectId: string }) {
  const state = useApiRead<QueryAnalytics>(() => api.getQueryAnalytics(subject, subjectId), [api, subject, subjectId]);
  return (
    <QueryAnalyticsScreen
      title={`${subject === "alphas" ? "Alpha" : "Portfolio"} 360 · ${subjectId}`}
      analytics={state.value}
      status={state.status}
      reason={state.reason}
    />
  );
}

export function AccountBroker360Container({ api, accountId }: { api: ExecutionApi; accountId: string }) {
  const state = useApiRead<ProfileEnvelope>(() => api.getAccountBroker360(accountId), [api, accountId]);
  if (state.status === "loading") {
    return (
      <section className="exec-envelope" aria-label="Account 360">
        <h1 className="exec-role-h1">Account / Broker 360 · {accountId}</h1>
        <PanelState status="loading" />
      </section>
    );
  }
  if (state.status === "ok" && state.value) {
    return <ProfileEnvelopeScreen title={`Account / Broker 360 · ${accountId}`} envelope={state.value} status="ok" />;
  }
  return (
    <TypedUnavailableScreen
      title={`Account / Broker 360 · ${accountId}`}
      reason="N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED"
      detail={state.reason ?? "The full exposure population is not published; the screen stays typed unavailable rather than showing a partial truth about money."}
      links={[{ label: "Operations Queue", href: "/execution/operations" }]}
    />
  );
}

function ManagerListHeader<T>({ title, envelope }: { title: string; envelope: ManagerListEnvelope<T> }) {
  return (
    <header className="exec-envelope-head">
      <h1 className="exec-role-h1">{title}</h1>
      <StatusChip label={envelope.freshness} tone={envelope.freshness === "FRESH" ? "good" : "warn"} />
      <span className="exec-role-meta">
        {envelope.environment.toUpperCase()} · {envelope.completeness} · {envelope.page.filteredCount}/{envelope.page.totalCount} rows · source {utcStamp(envelope.sourceAsOf)}
      </span>
    </header>
  );
}

function ManagerListPager({
  nextCursor, prevCursor, onNext, onPrevious,
}: {
  nextCursor: string | null;
  prevCursor: string | null;
  onNext: (cursor: string) => void;
  onPrevious: (cursor: string) => void;
}) {
  return (
    <nav className="exec-table-pager" aria-label="Result pages">
      <button type="button" disabled={!prevCursor} onClick={() => prevCursor && onPrevious(prevCursor)}>Previous</button>
      <button type="button" disabled={!nextCursor} onClick={() => nextCursor && onNext(nextCursor)}>Next</button>
    </nav>
  );
}

export function AlphaFleetContainer({ api }: { api: ExecutionApi }) {
  const [query, setQuery] = useState<AlphaFleetQuery>({ limit: 50 });
  const state = useApiRead<ManagerListEnvelope<AlphaFleetItem>>(() => api.getAlphaFleet(query), [api, query]);
  if (state.status !== "ok" || !state.value) {
    return <section className="exec-envelope" aria-label="Alpha Fleet"><h1 className="exec-role-h1">Alpha Fleet</h1><PanelState status={state.status} reason={state.reason} /></section>;
  }
  return (
    <section className="exec-envelope" aria-label="Alpha Fleet">
      <ManagerListHeader title="Alpha Fleet" envelope={state.value} />
      {state.value.page.rows.length === 0 ? <PanelState status="empty" reason="No alpha is present in this workspace and execution profile." /> : (
        <div className="exec-table"><div className="exec-table-scroll"><table aria-label="Alpha Fleet rows">
          <thead><tr><th>alpha</th><th>version</th><th>stage</th><th>deployments</th><th>updated</th></tr></thead>
          <tbody>{state.value.page.rows.map((row) => (
            <tr key={row.alphaId}>
              <td><a className="exec-link" href={`/deployments/alphas/${encodeURIComponent(row.alphaId)}`}>{row.alphaLabel}</a><div className="exec-role-meta">{row.alphaId}</div></td>
              <td className="exec-role-num">{row.version}</td>
              <td><StatusChip label={row.stage} tone="mute" /></td>
              <td>{row.deployments.length === 0 ? "—" : row.deployments.map((deployment) => `${deployment.deploymentId} · ${deployment.venue}`).join("; ")}</td>
              <td className="exec-role-meta">{utcStamp(row.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      <ManagerListPager
        nextCursor={state.value.page.nextCursor}
        prevCursor={state.value.page.prevCursor}
        onNext={(after) => setQuery((current) => ({ ...current, after, before: undefined }))}
        onPrevious={(before) => setQuery((current) => ({ ...current, before, after: undefined }))}
      />
    </section>
  );
}

function BindingFacts({ item }: { item: BindingItem }) {
  return (
    <dl className="exec-admin-facts">
      <div><dt>binding</dt><dd>{item.bindingId}</dd></div>
      <div><dt>account</dt><dd><a className="exec-link" href={`/deployments/accounts/${encodeURIComponent(item.accountId)}`}>{item.accountId}</a></dd></div>
      <div><dt>venue</dt><dd>{item.venue}</dd></div>
      <div><dt>state</dt><dd>{item.state}</dd></div>
      <div><dt>sync evidence</dt><dd>{item.credentialState}</dd></div>
      <div><dt>updated</dt><dd>{utcStamp(item.updatedAt)}</dd></div>
    </dl>
  );
}

export function AccountsBindingsContainer({ api, bindingId }: { api: ExecutionApi; bindingId?: string | null }) {
  const [query, setQuery] = useState<BindingListQuery>({ limit: 50 });
  const detail = useApiRead<BindingItem>(
    () => bindingId ? api.getBindingDetail(bindingId) : Promise.resolve({ ok: false as const, status: "empty" as const, reason: "list" }),
    [api, bindingId],
  );
  const list = useApiRead<ManagerListEnvelope<BindingItem>>(() => api.getBindings(query), [api, query]);
  if (bindingId) {
    return (
      <section className="exec-envelope" aria-label={`Binding ${bindingId}`}>
        <header className="exec-envelope-head"><h1 className="exec-role-h1">Binding · {bindingId}</h1><a className="exec-link" href="/deployments/accounts">All bindings</a></header>
        {detail.status === "ok" && detail.value ? <section className="exec-envelope-panel"><BindingFacts item={detail.value} /></section> : <PanelState status={detail.status} reason={detail.reason} />}
      </section>
    );
  }
  if (list.status !== "ok" || !list.value) {
    return <section className="exec-envelope" aria-label="Accounts and Bindings"><h1 className="exec-role-h1">Accounts &amp; Bindings</h1><PanelState status={list.status} reason={list.reason} /></section>;
  }
  return (
    <section className="exec-envelope" aria-label="Accounts and Bindings">
      <ManagerListHeader title="Accounts & Bindings" envelope={list.value} />
      {list.value.page.rows.length === 0 ? <PanelState status="empty" reason="No binding is present in this workspace and execution profile." /> : (
        <div className="exec-table"><div className="exec-table-scroll"><table aria-label="Account binding rows">
          <thead><tr><th>binding</th><th>account</th><th>venue</th><th>state</th><th>sync evidence</th><th>updated</th></tr></thead>
          <tbody>{list.value.page.rows.map((row) => (
            <tr key={row.bindingId}>
              <td><a className="exec-link" href={`/deployments/accounts?binding=${encodeURIComponent(row.bindingId)}`}>{row.bindingId}</a></td>
              <td><a className="exec-link" href={`/deployments/accounts/${encodeURIComponent(row.accountId)}`}>{row.accountId}</a></td>
              <td>{row.venue}</td><td>{row.state}</td><td>{row.credentialState}</td><td className="exec-role-meta">{utcStamp(row.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      <ManagerListPager
        nextCursor={list.value.page.nextCursor}
        prevCursor={list.value.page.prevCursor}
        onNext={(after) => setQuery((current) => ({ ...current, after, before: undefined }))}
        onPrevious={(before) => setQuery((current) => ({ ...current, before, after: undefined }))}
      />
    </section>
  );
}

export type { LiveReviewPayload };
