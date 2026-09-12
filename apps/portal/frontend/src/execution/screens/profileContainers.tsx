/**
 * N29-FE-01 — product containers over the same-origin BFF port.
 *
 * Each container fetches exactly one declared route through `ExecutionApi`,
 * aborts on unmount, and hands the parsed envelope to a renderer. No fixture
 * producer is reachable from here — that is the boundary the import-scan
 * test walks.
 */
import { PROJECTION_POLL_MS, usePollTick } from "../useRevision";
import { useEffect, useState, useMemo, useRef } from "react";

import type { AlphaFleetQuery, BindingListQuery, ExecutionApi, Result } from "../api/ports";
import type {
  AlphaFleetItem, BindingItem, LiveReviewPayload, ManagerListEnvelope,
  ProfileEnvelope, QueryAnalytics,
} from "../api/profileRead";
import { readBindingItem } from "../api/profileRead";
import { readCommandCenter, type CommandCenter } from "../commandCenter";
import { CommandCenterLive } from "./containers";
import type { SseFactory } from "../sse";
import { PanelState } from "../components/states";
import { SourceHealthBoard } from "../components/DerivationTile";
import { CrossEvidence } from "../components/CrossEvidence";
import { fleetPipeline } from "../fleetPipeline";
import { readSourceHealth, type SourceHealth } from "../api/derivations";
import { ProfileEnvelopeScreen, QueryAnalyticsScreen, TypedUnavailableScreen } from "./ProfileScreens";
import type { PanelStatus } from "../contracts";
import { StatusChip } from "../components/badges";
import { utcStamp } from "../time";

export type Loaded<T> =
  | { status: "ok"; reason?: undefined; value: T }
  | { status: "stale"; reason: string; value: T }
  | { status: Exclude<PanelStatus, "ok">; reason?: string; value: null };

export const scopedReadApi = (api: ExecutionApi, signal: AbortSignal): ExecutionApi => api.withReadSignal?.(signal) ?? api;

export function useApiRead<T>(
  run: (signal: AbortSignal) => Promise<Result<T>>,
  deps: readonly unknown[],
  options?: { keepValue?: boolean; identity?: readonly unknown[] },
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading", value: null });
  const keepValue = options?.keepValue === true;
  // Retention is opt-in for a named identity. Unclassified dependencies are
  // conservatively an identity change, never another subject's last-good data.
  const identity = options?.identity ?? deps;
  const stateIdentity = useRef<readonly unknown[] | null>(null);
  const sameIdentity = stateIdentity.current !== null && identity.length === stateIdentity.current.length &&
    identity.every((value, i) => Object.is(value, stateIdentity.current![i]));
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // P4-C: a realtime revalidation refreshes the existing rich panel tree in
    // place — flashing the whole screen to loading once per delta would make
    // live data feel broken. Only the very first read shows loading.
    const retain = keepValue && sameIdentity;
    stateIdentity.current = [...identity];
    setState((current) => retain && current.value !== null ? current : { status: "loading", value: null });
    void run(controller.signal).then((result) => {
      if (cancelled) return;
      setState((current) => result.ok ? { status: "ok", value: result.value }
        : retain && current.value !== null && /(?:502|503|TIMEOUT|UPSTREAM_UNAVAILABLE|REFRESH_FAILED)/.test(result.reason) &&
          !/(?:401|403|FORBIDDEN|DENIED|AUTH|WORKSPACE)/.test(result.reason)
          ? { status: "stale", reason: result.reason, value: current.value }
          : { status: result.status, reason: result.reason, value: null });
    }).catch(() => {
      if (!cancelled) setState({ status: "unavailable", reason: "PORTAL_READ_FAILED", value: null });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  // Hide old values during render too; waiting for an effect leaks one frame
  // of Alpha A beneath Alpha B's heading.
  return sameIdentity ? state : { status: "loading", value: null };
}

const COMMAND_CENTER_REALTIME_SNAPSHOT = "/api/v1/execution/command-center/realtime-snapshot";

/**
 * P4-H: the bounded cursor/epoch/sequence resume point for the Command Centre
 * stream. Same-origin, cookie-authenticated, and small by contract — the rich
 * panel data stays in the canonical snapshot response.
 */
/**
 * The resume point for the Command Centre stream (`execution.manager-realtime-
 * snapshot.v2`, Goal 7 · G11).
 *
 * The version is checked. Reading a resume point out of an envelope that never
 * claimed to be this contract is how a client ends up resuming from a cursor
 * that means something else — and cursors are opaque, so nothing downstream
 * would notice.
 *
 * `resnapshot_not_before` is the server's own backoff, and it used to be
 * ignored: recovery waited a hardcoded second regardless of what the source
 * asked for, which is a client deciding for itself how hard to push a source
 * that has just told it to wait. `stream_available` and `data_state` are read
 * for the same reason — the source says whether it is delivering and whether
 * empty is valid, and neither is ours to infer.
 */
async function fetchCommandCenterResume(): Promise<{
  cursor: string;
  epoch: string;
  sequence: number;
  asOf?: string | null;
  streamAvailable: boolean;
  dataState: string | null;
  resnapshotNotBefore: string | null;
}> {
  const response = await fetch(COMMAND_CENTER_REALTIME_SNAPSHOT, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`realtime snapshot ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  if (body.schema_version !== "execution.manager-realtime-snapshot.v2") {
    throw new Error(`realtime snapshot is not manager-realtime-snapshot.v2 (${String(body.schema_version)})`);
  }
  const cursor = typeof body.cursor === "string" ? body.cursor : null;
  const epoch = typeof body.projection_epoch === "string" ? body.projection_epoch : null;
  const sequence = typeof body.projection_sequence === "number" ? body.projection_sequence : null;
  if (!cursor || !epoch || sequence === null) throw new Error("realtime snapshot missing resume point");
  return {
    cursor,
    epoch,
    sequence,
    asOf: typeof body.source_read_at === "string" ? body.source_read_at : null,
    // Absent is read as "not delivering". A stream the source declined to
    // describe is not one to draw a live dot for.
    streamAvailable: body.stream_available === true,
    dataState: typeof body.data_state === "string" ? body.data_state : null,
    resnapshotNotBefore: typeof body.resnapshot_not_before === "string" ? body.resnapshot_not_before : null,
  };
}



export function CommandCenterSnapshotContainer({ api, sseFactory }: { api: ExecutionApi; sseFactory?: SseFactory | null }) {
  // G8: re-read on the projection cadence so the masthead beat follows a real revision (as_of), not a clock
  const tick = usePollTick(PROJECTION_POLL_MS);
  // Goal 9: the composition carries this screen's own snapshot *and* the four
  // cross-cutting blocks the standalone route drops — per-profile source
  // health, the redacted command journal, the canary twin comparison and the
  // command authority that explains why every control here is dark. It
  // replaces the standalone read rather than joining it, so the screen still
  // issues exactly one request for its snapshot.
  const state = useApiRead((signal) => scopedReadApi(api, signal).getOperationalComposition("command-center"), [api, tick], { keepValue: true, identity: [api] });
  const composition = state.value ?? null;
  // The promotion pipeline is the Fleet register read once per visit (BR-EX-72
  // bounded page, 50 alphas); a failed read simply leaves the panel out.
  const fleet = useApiRead((signal) => scopedReadApi(api, signal).getAlphaFleet({ limit: 50 }), [api]);
  // P4-H: the product route passes a live factory; the hook still refuses to
  // open anything unless the server publishes stream_available. Memoized —
  // a fresh function identity per render would cycle the stream effect.
  const factory = useMemo<SseFactory | null>(
    () => sseFactory === undefined ? (url: string) => new EventSource(url) : sseFactory,
    [sseFactory],
  );
  if (state.status !== "ok") {
    return (
      <section className="exec-envelope" aria-label="Command Center">
        <h1 className="exec-role-h1">Command Center</h1>
        <PanelState status={state.status} reason={state.reason} />
      </section>
    );
  }
  const snapshot: CommandCenter | null = readCommandCenter(composition?.data.command_center);
  if (!snapshot) {
    return (
      <section className="exec-envelope" aria-label="Command Center">
        <h1 className="exec-role-h1">Command Center</h1>
        <PanelState status="unavailable" reason="The command-center snapshot could not be read." />
      </section>
    );
  }
  // Goal 9: the composition already carries the source-health envelope for
  // every environment, so the three per-environment reads become none. The
  // board still wants one read per environment for its chips, so the profiles
  // are grouped by the environment each one names — attribution comes from the
  // row itself, not from which request happened to fetch it.
  const health = readSourceHealth(composition?.sourceHealthEnvelope);
  const healthReads = (["paper", "sandbox", "live"] as const).map((environment) => ({
    environment,
    value: health
      ? { ...health, data: { ...health.data, profiles: health.data.profiles.filter((row) => row.environment === environment) } }
      : null,
    transport: state.status,
    reason: state.reason,
  }));
  return (
    <CommandCenterLive
      snapshot={snapshot}
      factory={factory}
      fetchSnapshot={fetchCommandCenterResume}
      sourceHealth={<SourceHealthBoard reads={healthReads} />}
      pipeline={fleet.value ? fleetPipeline(fleet.value) : null}
      evidence={<CrossEvidence composition={composition} label="Command authority, journal and cross-profile evidence" />}
    />
  );
}

/**
 * EDS-05 source health, one read per environment, one board: a row per
 * profile with its environment named, an environment chip per read so a
 * PARTIAL is still attributable to the read that said it.
 */
export function SourceHealthLiveTiles({ api }: { api: ExecutionApi }) {
  const paper = useApiRead<SourceHealth>((signal) => scopedReadApi(api, signal).getSourceHealth("paper"), [api]);
  const sandbox = useApiRead<SourceHealth>((signal) => scopedReadApi(api, signal).getSourceHealth("sandbox"), [api]);
  const live = useApiRead<SourceHealth>((signal) => scopedReadApi(api, signal).getSourceHealth("live"), [api]);
  return (
    <SourceHealthBoard
      reads={[
        { environment: "paper", value: paper.value, transport: paper.status, reason: paper.reason },
        { environment: "sandbox", value: sandbox.value, transport: sandbox.status, reason: sandbox.reason },
        { environment: "live", value: live.value, transport: live.status, reason: live.reason },
      ]}
    />
  );
}

const OVERVIEW_TITLE = {
  paper: "Paper — deployments overview",
  sandbox: "Sandbox — deployments overview",
  live: "Live — operations overview",
  blotter: "Full Blotter",
} as const;

export function StageOverviewContainer({ api, screen }: { api: ExecutionApi; screen: "paper" | "sandbox" | "live" | "blotter" }) {
  const state = useApiRead<ProfileEnvelope>((signal) => scopedReadApi(api, signal).getScreenProfile(screen), [api, screen]);
  /*
   * Phase 4: `/derivations/source-health` had answered 200 for weeks with no
   * caller. Command Center gets the same facts inside its composition, so
   * calling it there would only add a request — but a stage overview has no
   * composition and said nothing at all about the profile feeding it. This is
   * the screen where the read is new information rather than a second copy.
   */
  const health = useApiRead((signal) => scopedReadApi(api, signal).getSourceHealthRead(), [api]);
  const profile = health.value?.profiles.find((row) => row.environment === screen) ?? null;
  return (
    <ProfileEnvelopeScreen
      title={OVERVIEW_TITLE[screen]}
      envelope={state.value}
      status={state.status}
      reason={state.reason}
      sourceHealth={screen === "blotter" ? null : (
        <p className="exec-role-meta" data-source-health={profile?.state ?? undefined}>
          {health.status !== "ok"
            ? `source health not read · ${health.reason ?? "no reason published"}`
            : profile
              ? `source ${profile.state}${profile.reasonCode ? ` · ${profile.reasonCode}` : ""} · freshness ${profile.freshness ?? "not published"} · completeness ${profile.completeness ?? "not published"} · profile ${profile.profileId ?? "not published"}`
              : `the source-health envelope published no ${screen} profile`}
        </p>
      )}
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
  const state = useApiRead<ProfileEnvelope>((signal) => scopedReadApi(api, signal).getPaperWorkbenchProfile(deploymentId, variant), [api, deploymentId, variant]);
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
  const state = useApiRead<QueryAnalytics>((signal) => scopedReadApi(api, signal).getQueryAnalytics(subject, subjectId), [api, subject, subjectId]);
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
  const state = useApiRead<ProfileEnvelope>((signal) => scopedReadApi(api, signal).getAccount360Resource(accountId), [api, accountId]);
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
  const state = useApiRead<ManagerListEnvelope<AlphaFleetItem>>((signal) => scopedReadApi(api, signal).getAlphaFleet(query), [api, query]);
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
              <td>{row.deployments.length === 0 ? "no deployment bound" : row.deployments.map((deployment) => `${deployment.deploymentId} · ${deployment.venue}`).join("; ")}</td>
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
  const detail = useApiRead<ProfileEnvelope | null>(
    (signal) => bindingId ? scopedReadApi(api, signal).getBindingResource(bindingId) : Promise.resolve({ ok: false as const, status: "empty" as const, reason: "list" }),
    [api, bindingId],
  );
  const list = useApiRead<ManagerListEnvelope<BindingItem>>((signal) => scopedReadApi(api, signal).getBindings(query), [api, query]);
  if (bindingId) {
    const item = detail.value ? readBindingItem(detail.value.objects.binding) : null;
    return (
      <section className="exec-envelope" aria-label={`Binding ${bindingId}`}>
        <header className="exec-envelope-head"><h1 className="exec-role-h1">Binding · {bindingId}</h1><a className="exec-link" href="/deployments/accounts">All bindings</a></header>
        {detail.status === "ok" && item ? <section className="exec-envelope-panel"><BindingFacts item={item} /></section> : <PanelState status={detail.status === "ok" ? "partial" : detail.status} reason={detail.reason ?? "The binding resource was not readable."} />}
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
