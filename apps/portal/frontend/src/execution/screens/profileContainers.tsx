/**
 * N29-FE-01 — product containers over the same-origin BFF port.
 *
 * Each container fetches exactly one declared route through `ExecutionApi`,
 * aborts on unmount, and hands the parsed envelope to a renderer. No fixture
 * producer is reachable from here — that is the boundary the import-scan
 * test walks.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi, Result } from "../api/ports";
import type { LiveReviewPayload, ProfileEnvelope, QueryAnalytics } from "../api/profileRead";
import { readCommandCenter, type CommandCenter } from "../commandCenter";
import { CommandCenterLive } from "./containers";
import { PanelState } from "../components/states";
import { ProfileEnvelopeScreen, QueryAnalyticsScreen, TypedUnavailableScreen } from "./ProfileScreens";
import type { PanelStatus } from "../contracts";

interface Loaded<T> {
  status: PanelStatus;
  reason?: string;
  value: T | null;
}

function useApiRead<T>(run: () => Promise<Result<T>>, deps: readonly unknown[]): Loaded<T> {
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
      <section className="exec-profile" aria-label="Command Center">
        <h1 className="exec-role-h1">Command Center</h1>
        <PanelState status={state.status} reason={state.reason} />
      </section>
    );
  }
  const snapshot: CommandCenter | null = readCommandCenter(state.value);
  if (!snapshot) {
    return (
      <section className="exec-profile" aria-label="Command Center">
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
          <p className="exec-role-meta exec-profile-empty">
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
      <section className="exec-profile" aria-label="Account 360">
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

/**
 * §4.3 — routes that share a screen id with a detail screen but have no
 * accepted narrow API of their own. One consolidated backend request covers
 * them; until codex answers it, the honest render is the typed gap.
 */
export function AlphaFleetUnavailable() {
  return (
    <TypedUnavailableScreen
      title="Alpha Fleet"
      reason="N20_FLEET_LIST_CONTRACT_NOT_PUBLISHED"
      detail="The N20 catalogue publishes Alpha 360 per alpha but no fleet list route. Consolidated backend request filed; this screen will not invent an alpha id to call the 360 with."
      links={[{ label: "Portfolios", href: "/deployments/portfolios/PF-CRYPTO" }, { label: "Paper overview", href: "/deployments/paper" }]}
    />
  );
}

export function AccountsBindingsUnavailable({ bindingId }: { bindingId?: string | null }) {
  return (
    <TypedUnavailableScreen
      title={bindingId ? `Binding · ${bindingId}` : "Accounts & Bindings"}
      reason="N20_BINDINGS_LIST_CONTRACT_NOT_PUBLISHED"
      detail={
        bindingId
          ? "No binding-detail route is published; a detail inferred from Account 360 would be a second feature model. Consolidated backend request filed."
          : "The N20 catalogue publishes Account 360 per account (itself N28-unavailable) but no bindings list route. Consolidated backend request filed."
      }
      links={[{ label: "Operations Queue", href: "/execution/operations" }]}
    />
  );
}

export type { LiveReviewPayload };
