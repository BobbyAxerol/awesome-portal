/**
 * N29-FE-01 — product renderers for the same-origin screen BFF envelopes.
 *
 * The N22/N23/N25 payloads publish sparse canonical arrays plus a
 * per-branch capability list; the reviewed rich compositions' data is not in
 * them yet. These renderers put the SERVER's truth on screen in the existing
 * grammar — state/freshness masthead, the rows that exist, and one honest
 * line per missing branch with its reason code — and never borrow a fixture
 * row to look fuller than the source. The rich reviewed components remain in
 * the fixture lab (`/execution/_fixtures`) and unit tests, untouched.
 */
import type { ReactNode } from "react";

import type { BranchCapability, ProfileEnvelope, QueryAnalytics } from "../api/profileRead";
import { utcStamp } from "../time";
import { StatusChip } from "../components/badges";
import { PanelState } from "../components/states";
import { ExecutionSectionTitle } from "../components/typography";
import type { PanelStatus } from "../contracts";

const STATE_TONE: Record<string, "good" | "warn" | "bad" | "mute"> = {
  ready: "good",
  empty: "mute",
  partial: "warn",
  stale: "warn",
  unavailable: "bad",
  denied: "bad",
};

export function EnvelopeMasthead({ title, envelope, sub }: { title: string; envelope: ProfileEnvelope; sub?: ReactNode }) {
  return (
    <header className="exec-profile-head">
      <h1 className="exec-role-h1">{title}</h1>
      <StatusChip label={envelope.state.toUpperCase()} tone={STATE_TONE[envelope.state] ?? "mute"} />
      {envelope.freshness ? <span className="exec-role-meta">freshness {envelope.freshness}</span> : null}
      {envelope.completeness ? <span className="exec-role-meta">· {envelope.completeness}</span> : null}
      <span className="exec-role-meta">
        · {envelope.sourceAuthority ?? envelope.recordAuthority ?? "authority not stated"} · as_of{" "}
        {utcStamp(envelope.asOf)} · read {utcStamp(envelope.readAt)}
      </span>
      {sub}
    </header>
  );
}

/** One honest row per branch: what it is, whether it answered, and why not. */
export function CapabilityTable({ capabilities, label }: { capabilities: readonly BranchCapability[]; label: string }) {
  if (capabilities.length === 0) return null;
  return (
    <section className="exec-profile-panel">
      <ExecutionSectionTitle>Data branches <span className="exec-role-meta">{capabilities.length}</span></ExecutionSectionTitle>
      <div className="exec-gate-criteriawrap">
        <table className="exec-360-sync exec-profile-caps" aria-label={label}>
          <thead>
            <tr><th scope="col">branch</th><th scope="col">state</th><th scope="col">reason</th></tr>
          </thead>
          <tbody>
            {capabilities.map((c) => (
              <tr key={c.capabilityId} data-state={c.state}>
                <th scope="row">{c.capabilityId}</th>
                <td><StatusChip label={c.state} tone={c.state === "AVAILABLE" || c.state === "READY" ? "good" : "bad"} /></td>
                <td className="exec-role-meta">{c.reasonCode ?? "—"}{c.retryable ? " · retryable" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Renders every published data array as its own table — no row invented,
 * no column renamed; an empty array states itself. */
export function DataBranches({ envelope }: { envelope: ProfileEnvelope }) {
  const entries = Object.entries(envelope.data);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([branch, rows]) => (
        <section className="exec-profile-panel" key={branch}>
          <ExecutionSectionTitle>
            {branch.replace(/_/g, " ")} <span className="exec-role-meta">{rows.length}</span>
          </ExecutionSectionTitle>
          {rows.length === 0 ? (
            <p className="exec-role-meta exec-profile-empty">
              no rows — the source published an empty {branch.replace(/_/g, " ")} set, and an empty
              set is a fact, not a failure
            </p>
          ) : (
            <div className="exec-gate-criteriawrap">
              <table className="exec-360-sync" aria-label={branch}>
                <thead>
                  <tr>{Object.keys(rows[0]).map((k) => <th scope="col" key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {Object.keys(rows[0]).map((k) => (
                        <td key={k} className="exec-num">{row[k] === null || row[k] === undefined ? "—" : String(row[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

export function ProfileEnvelopeScreen({
  title,
  envelope,
  status,
  reason,
  intro,
  children,
}: {
  title: string;
  envelope: ProfileEnvelope | null;
  status: PanelStatus;
  reason?: string;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  if (status !== "ok" && status !== "partial") {
    return (
      <section className="exec-profile" aria-label={title}>
        <h1 className="exec-role-h1">{title}</h1>
        <PanelState status={status} reason={reason} />
      </section>
    );
  }
  if (!envelope) return null;
  return (
    <section className="exec-profile" aria-label={title}>
      <EnvelopeMasthead title={title} envelope={envelope} />
      {intro}
      {envelope.objects.deployment ? (
        <section className="exec-profile-panel">
          <ExecutionSectionTitle>deployment</ExecutionSectionTitle>
          <dl className="exec-admin-facts">
            {Object.entries(envelope.objects.deployment).map(([k, v]) => (
              <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{v === null ? "—" : String(v)}</dd></div>
            ))}
          </dl>
        </section>
      ) : null}
      <DataBranches envelope={envelope} />
      <CapabilityTable capabilities={envelope.capabilities} label={`${title} branch availability`} />
      {children}
    </section>
  );
}

/** A route whose only honest render is a typed reason. */
export function TypedUnavailableScreen({
  title,
  reason,
  detail,
  links,
}: {
  title: string;
  reason: string;
  detail: string;
  links?: readonly { label: string; href: string }[];
}) {
  return (
    <section className="exec-profile" aria-label={title}>
      <h1 className="exec-role-h1">{title}</h1>
      <PanelState status="unavailable" reason={`${reason}: ${detail}`} />
      {links?.length ? (
        <p className="exec-role-meta">
          {links.map((l, i) => (
            <span key={l.href}>{i > 0 ? " · " : ""}<a href={l.href}>{l.label}</a></span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

/** N25 query-analytics: the branches that answered, and the twelve that say why not. */
export function QueryAnalyticsScreen({
  title,
  analytics,
  status,
  reason,
}: {
  title: string;
  analytics: QueryAnalytics | null;
  status: PanelStatus;
  reason?: string;
}) {
  if (status !== "ok" && status !== "partial") {
    return (
      <section className="exec-profile" aria-label={title}>
        <h1 className="exec-role-h1">{title}</h1>
        <PanelState status={status} reason={reason} />
      </section>
    );
  }
  if (!analytics) return null;
  const funnelEntries = analytics.orderFunnel ? Object.entries(analytics.orderFunnel.statusCounts) : [];
  return (
    <section className="exec-profile" aria-label={title}>
      <header className="exec-profile-head">
        <h1 className="exec-role-h1">{title}</h1>
        <span className="exec-role-meta">
          {analytics.authority ?? "authority not stated"} · {analytics.formulaVersion ?? "formula not stated"} · as_of{" "}
          {utcStamp(analytics.asOf)} · {analytics.completeness ?? "completeness not stated"}
        </span>
      </header>
      <section className="exec-profile-panel">
        <ExecutionSectionTitle>Order funnel</ExecutionSectionTitle>
        {analytics.orderFunnel && analytics.orderFunnel.totalOrders !== null ? (
          <dl className="exec-admin-facts">
            <div><dt>total orders</dt><dd className="exec-num">{analytics.orderFunnel.totalOrders}</dd></div>
            {funnelEntries.map(([k, v]) => (
              <div key={k}><dt>{k.toLowerCase()}</dt><dd className="exec-num">{v}</dd></div>
            ))}
          </dl>
        ) : (
          <PanelState status="empty" reason="No orders in the analytics window — an empty funnel is a fact." />
        )}
      </section>
      <section className="exec-profile-panel">
        <ExecutionSectionTitle>Execution quality</ExecutionSectionTitle>
        {analytics.executionQuality ? (
          <dl className="exec-admin-facts">
            {Object.entries(analytics.executionQuality).map(([k, v]) => (
              <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd className="exec-num">{v === null ? "—" : String(v)}</dd></div>
            ))}
          </dl>
        ) : (
          <PanelState status="unavailable" reason="Execution quality was not published for this subject." />
        )}
      </section>
      {analytics.correlation ? (
        <p className="exec-role-meta">
          correlation: {analytics.correlation.state ?? "state not stated"}
          {analytics.correlation.reasonCode ? ` · ${analytics.correlation.reasonCode}` : ""}
        </p>
      ) : null}
      <CapabilityTable capabilities={analytics.capabilities} label={`${title} analytics branches`} />
    </section>
  );
}
