/**
 * Profile & Access, self-view V2 (S1e), flag key `profile`.
 *
 * Shows the caller their own access and nothing else. Two sources, kept
 * apart: the session (`useSession().access`: owner state and capability list)
 * and `GET /api/admin/profile-access/v2/effective` (`AccessEffective`: grants,
 * policy state). Seeing and doing rows come from the capability list through
 * roleNav's `holds()`; the grants table comes from the effective read. Nothing
 * is shown that neither source states: there is no "granted by" and no role
 * preset (FE-015), and the researcher field policy is "Not published" while it
 * is PENDING (FE-026).
 *
 * Owners keep the V1 grant matrix: `manage` is that screen, rendered on a
 * second tab. Non-owners get this view where V1 showed a typed denial.
 */
import { useId, useMemo, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { useSession } from "../../../../auth/session";
import type { UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf } from "../../boundary";
import { PanelHead } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { ExecutionSurface } from "../../../ExecutionSurface";
import { Flag } from "../../Flag";
import type { AccessEffective, AccessGrant } from "../../readers/accessEffective";
import { useExecUrlState, withContext } from "../../urlState";
import {
  ACCESS_FE,
  REASON_DICTIONARY,
  TS_AUTHORITY_FLAG,
  doRows,
  environmentsText,
  otherCapabilities,
  policyWord,
  reasonText,
  seeRows,
  selectorAllIds,
  selectorText,
  validFromText,
  validUntilText,
  type CapabilityRow,
} from "./model";
import { useAccessEffective } from "./useAccessEffective";

import "../../css/access.css";

/** This screen's own route; the "My access" link of a disabled control lands here. */
export const ACCESS_PATH = "/administration/profile-access";

type Tab = "self" | "manage";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "self", label: "My access" },
  { id: "manage", label: "Manage grants" },
];

export interface AccessSelfViewProps {
  /** The V1 grant matrix. Offered on a second tab to owners only. */
  manage?: ReactNode;
  /** The clock for "Read hh:mmZ"; injected so a test is not a race with the minute. */
  now?: () => number;
  /** Test seam for the one HTTP read. */
  fetchImpl?: typeof fetch;
}

/** Longest value that still reads at the 24/32 mono kpi size; a longer one (a long username) takes the 12/16 mono id role. */
const KPI_VALUE_MAX_CHARS = 12;

/**
 * One identity-strip value. A short value is the kpi role (hi-fi `.kpi .v`);
 * a long id keeps the id role so it cannot wrap at 24px; a stated absence is
 * body text, never a 24px "Not available".
 */
function KpiValue({ text, absent }: { text: string; absent?: boolean }) {
  const form = absent ? "absent" : text.length > KPI_VALUE_MAX_CHARS ? "id" : "kpi";
  return <dd className="exec-acc-kpi-value" data-form={form}>{text}</dd>;
}

function NotPublished({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <span>
      <span className="exec-acc-np-word">Not published</span> ({id}){children ? <> {children}</> : null}
    </span>
  );
}

type GrantsView =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "denied"; status: number; code: string | null; requestId: string | null }
  | { phase: "unavailable"; reason: string; code: string | null; requestId: string | null }
  | { phase: "ready"; effective: AccessEffective; readAt: UtcEpochMs | null; stale: { reason: string; requestId: string | null } | null };

export default function AccessSelfView({ manage, now, fetchImpl }: AccessSelfViewProps) {
  const { principal, access } = useSession();
  const url = useExecUrlState();
  const location = useLocation();
  const headingId = useId();
  const workspaceId = url.value.workspace_id;
  const { load, reload, refreshing } = useAccessEffective(workspaceId, { now, fetchImpl });

  const session = access.kind === "ready" ? access.access : null;
  const owner = session?.isOwner === true;
  const capabilities = useMemo(() => new Set(session?.capabilities ?? []), [session]);
  const tab: Tab = owner && manage !== undefined && url.value.view === "manage" ? "manage" : "self";

  // The body must be for the user who is signed in; a body for anyone else is never shown as theirs.
  const grants: GrantsView = useMemo(() => {
    if (load.phase !== "ready") return load;
    if (access.kind === "loading") return { phase: "loading" };
    if (session === null) {
      return { phase: "unavailable", reason: "Your session did not say who you are, so the grants could not be checked as yours.", code: null, requestId: null };
    }
    if (load.effective.userId !== session.userId) {
      return { phase: "unavailable", reason: "The answer is for a different user than the one signed in, so it is not shown.", code: null, requestId: null };
    }
    return { phase: "ready", effective: load.effective, readAt: load.readAt, stale: load.stale };
  }, [load, access.kind, session]);

  const setTab = (next: Tab) => url.set({ view: next === "self" ? null : next });
  const tabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(at + step + TABS.length) % TABS.length];
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`exec-acc-tab-${next.id}`)?.focus());
  };

  const myAccessHref = withContext(ACCESS_PATH, location.search);

  const ownerWord = access.kind !== "ready"
    ? null
    : session?.ownerState === "OWNER_ANCHOR_UNCLAIMED"
      ? "Owner anchor unclaimed"
      : session?.isOwner ? "Owner" : "Not an owner";

  const capabilityColumns = (reasonLabel: string, allowedWord: string, deniedWord: string, withLink: boolean): CardsColumn<CapabilityRow>[] => [
    { key: "label", label: "Area", render: (r) => r.label },
    {
      key: "status",
      label: "Status",
      render: (r) => r.allowed ? <Flag kind="ok" size="sm" label={allowedWord} /> : <Flag kind="na" size="sm" label={deniedWord} />,
    },
    {
      key: "reason",
      label: reasonLabel,
      render: (r) => (
        <span className="exec-acc-why">
          {r.reason}
          {withLink && !r.allowed ? <> · <Link className="exec-acc-link" to={myAccessHref}>My access</Link></> : null}
        </span>
      ),
    },
  ];
  const seeColumns = capabilityColumns("Basis", "Can see", "Not shown", false);
  const doColumns = capabilityColumns("Why", "Allowed", "Not allowed", true).map((c) => (c.key === "label" ? { ...c, label: "Action" } : c));

  const grantColumns: CardsColumn<AccessGrant>[] = [
    {
      key: "action",
      label: "Access",
      render: (g) => (
        <span className="exec-acc-cell">
          <span className="exec-acc-id">{g.action}</span>
          <span className="exec-acc-effect" data-effect={g.effect}>{g.effect === "ALLOW" ? "Allow" : "Deny"}</span>
        </span>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      render: (g) => {
        const all = selectorAllIds(g.selector);
        return <span className="exec-acc-why" title={all.length > 0 ? all.join(", ") : undefined}>{selectorText(g.selector)}</span>;
      },
    },
    { key: "env", label: "Environments", render: (g) => environmentsText(g) },
    { key: "from", label: "Since", render: (g) => <span className="exec-acc-id">{validFromText(g)}</span> },
    { key: "until", label: "Expires", render: (g) => <span className="exec-acc-id">{validUntilText(g)}</span> },
    { key: "rev", label: "Revision", render: (g) => <span className="exec-acc-id">{g.revision}</span> },
    {
      key: "current",
      label: "State",
      render: (g) => g.current ? <Flag kind="ok" size="sm" label="Current" /> : <Flag kind="paused" size="sm" label="Not current" />,
    },
    {
      key: "ts",
      label: "Trading system",
      render: (g) => {
        const spec = TS_AUTHORITY_FLAG[g.tsAuthority];
        return <Flag kind={spec.kind} size="sm" label={spec.label} />;
      },
    },
  ];

  const sessionState = (() => {
    if (access.kind === "loading") return <p className="exec-acc-state" role="status">Loading your permissions.</p>;
    if (access.kind === "unavailable") {
      return (
        <p className="exec-acc-state" role="alert">
          <strong>Not available.</strong> Permissions could not be loaded, so no area is shown as allowed or blocked.
          {access.requestId ? <> Request <span className="exec-acc-code">{access.requestId}</span>.</> : null}
        </p>
      );
    }
    return null;
  })();

  const effective = grants.phase === "ready" ? grants.effective : null;
  const others = otherCapabilities(capabilities);

  const body = (
    <>
      <dl className="exec-acc-kpis" aria-label="Who you are signed in as">
        <div className="exec-acc-kpi">
          <dt>Signed in as</dt>
          <KpiValue text={principal?.username ?? "Not available"} absent={!principal?.username} />
          <dd className="exec-acc-kpi-note exec-acc-code">{session?.userId ? session.userId : "User id not available"}</dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Owner</dt>
          <KpiValue text={ownerWord ?? (access.kind === "loading" ? "Loading" : "Not available")} absent={!ownerWord} />
          <dd className="exec-acc-kpi-note">From your session</dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Capabilities held</dt>
          <KpiValue text={session ? String(session.capabilities.length) : access.kind === "loading" ? "Loading" : "Not available"} absent={!session} />
          <dd className="exec-acc-kpi-note">From your session</dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Access policy</dt>
          <KpiValue text={effective ? policyWord(effective) : grants.phase === "loading" ? "Loading" : "Not available"} absent={!effective} />
          <dd className="exec-acc-kpi-note">
            {effective ? (effective.policyRevision ? `Revision ${effective.policyRevision}` : "No revision published") : "From the access read"}
          </dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Role preset</dt>
          <dd className="exec-acc-kpi-value" data-form="absent"><NotPublished id={ACCESS_FE.reasons} /></dd>
          <dd className="exec-acc-kpi-note">Access is shown by capability</dd>
        </div>
      </dl>

      {effective?.availability === "POLICY_PENDING" ? (
        <p className="exec-acc-banner" role="status">
          <strong>Access policy pending.</strong> {reasonText(effective.reasonCode ?? "").text}{" "}
          <span className="exec-acc-code">{effective.reasonCode}</span>
        </p>
      ) : null}

      {grants.phase === "ready" && grants.stale ? (
        <p className="exec-acc-banner" role="status" data-tone="stale">
          <Flag kind="stale" size="sm" /> Showing the last good read{grants.readAt !== null ? <> from {formatAsOf(grants.readAt)}</> : null}. The refresh failed: {grants.stale.reason}
          {grants.stale.requestId ? <> Request <span className="exec-acc-code">{grants.stale.requestId}</span>.</> : null}
        </p>
      ) : null}

      <div className="exec-acc-two">
        <section className="exec-acc-panel" aria-labelledby={`${headingId}-see`}>
          <PanelHead level={2} id={`${headingId}-see`} title="What you can see" aside="Visibility only" />
          {sessionState ?? (
            <CardsTable columns={seeColumns} rows={seeRows(capabilities)} rowKey={(r) => r.id} label="What you can see" />
          )}
        </section>
        <section className="exec-acc-panel" aria-labelledby={`${headingId}-do`}>
          <PanelHead level={2} id={`${headingId}-do`} title="What you can do" aside="Seeing never grants this" />
          {sessionState ?? (
            <>
              <CardsTable columns={doColumns} rows={doRows(capabilities)} rowKey={(r) => r.id} label="What you can do" />
              <p className="exec-acc-foot">
                <NotPublished id={ACCESS_FE.reasons}>Per-action eligibility and the reason a control is off are not published for commands, archive and export.</NotPublished>
              </p>
            </>
          )}
        </section>
      </div>

      <p className="exec-acc-caption">
        The capability names behind Portfolios, Accounts, Operations and Blotter are provisional ({ACCESS_FE.capabilityNames}) and may change.
        {others.length > 0 ? <> Other capabilities in your session: <span className="exec-acc-code">{others.join(", ")}</span>.</> : null}
      </p>

      <section className="exec-acc-panel" aria-labelledby={`${headingId}-granted`} id="exec-acc-granted">
        <PanelHead level={2} id={`${headingId}-granted`} title="Granted to you" aside="What, where and until when" />
        {grants.phase === "idle" ? (
          <p className="exec-acc-state" role="status">
            <strong>Not available.</strong> No workspace is named in the address (<span className="exec-acc-code">workspace_id</span>) and the session does not publish one, so the grants were not requested.
          </p>
        ) : null}
        {grants.phase === "loading" ? <p className="exec-acc-state" role="status">Loading your grants.</p> : null}
        {grants.phase === "denied" ? (
          <p className="exec-acc-state" role="alert">
            <strong>Not permitted.</strong> The Portal refused to show your grants ({grants.status}
            {grants.code ? <> <span className="exec-acc-code">{grants.code}</span></> : null}).
            {grants.requestId ? <> Request <span className="exec-acc-code">{grants.requestId}</span>.</> : null}
          </p>
        ) : null}
        {grants.phase === "unavailable" ? (
          <p className="exec-acc-state" role="alert">
            <strong>Not available.</strong> {grants.reason}
            {grants.code ? <> <span className="exec-acc-code">{grants.code}</span></> : null}
            {grants.requestId ? <> Request <span className="exec-acc-code">{grants.requestId}</span>.</> : null}
          </p>
        ) : null}
        {effective ? (
          <>
            <CardsTable
              columns={grantColumns}
              rows={effective.grants}
              rowKey={(g) => g.grantId}
              label="Granted to you"
              empty={effective.availability === "POLICY_PENDING"
                ? "No grants are listed while the access policy is pending."
                : "No grants are published for you in this workspace."}
            />
            <p className="exec-acc-foot">
              Who granted each item is not published ({ACCESS_FE.reasons}). State and trading-system columns are the Portal&apos;s own evaluation, not recomputed here.
            </p>
          </>
        ) : null}
      </section>

      {effective ? (
        <section className="exec-acc-panel" aria-labelledby={`${headingId}-policy`}>
          <PanelHead level={2} id={`${headingId}-policy`} title="Policy" aside="As published" />
          <dl className="exec-acc-facts">
            <dt>Researcher field policy</dt>
            <dd>
              {effective.researcherFieldPolicy.state === "PENDING" ? (
                <NotPublished id={ACCESS_FE.researcher}>The field matrix for researchers is not decided.</NotPublished>
              ) : (
                <>
                  <Flag kind="ok" size="sm" label="Qualified" />{" "}
                  <span className="exec-acc-code">{effective.researcherFieldPolicy.policyRef}</span>
                </>
              )}
            </dd>
            <dt>Owner recovery</dt>
            <dd>
              <Flag kind="neutral" size="sm" label="Off" />{" "}
              {reasonText(effective.ownerRecovery.reasonCode).text}{" "}
              <span className="exec-acc-code">{effective.ownerRecovery.reasonCode}</span>
            </dd>
          </dl>
        </section>
      ) : null}

      <details className="exec-acc-dict">
        <summary>Reasons this screen can show</summary>
        <CardsTable
          columns={[
            { key: "code", label: "Reason", render: (r: [string, string]) => <span className="exec-acc-id">{r[0]}</span> },
            { key: "text", label: "Shown as", render: (r: [string, string]) => r[1] },
          ]}
          rows={Object.entries(REASON_DICTIONARY)}
          rowKey={(r) => r[0]}
          label="Reasons this screen can show"
        />
        <p className="exec-acc-foot">A reason the Portal sends that is not listed here is printed as sent, never reworded.</p>
      </details>
    </>
  );

  return (
    <>
      <ExecutionSurface kind="deployments" className="exec-acc-surface">
        <div className="exec-acc">
          <div className="exec-acc-head">
            <div>
              <h1 className="exec-acc-title">Profile &amp; Access</h1>
              <p className="exec-acc-subtitle">{principal?.username && ownerWord ? `${principal.username} · ${ownerWord}` : "Your own access, as the Portal publishes it"}</p>
            </div>
            <div className="exec-acc-chips">
              {grants.phase === "ready" && grants.readAt !== null ? (
                <span
                  className="exec-acc-chip"
                  title="The time this browser received the answer. The Portal publishes no as-of for this read."
                >
                  Read {formatAsOf(grants.readAt)}
                </span>
              ) : null}
              {workspaceId !== null ? (
                <button type="button" className="exec-acc-btn" onClick={reload} disabled={refreshing} title={refreshing ? "A refresh is already running." : undefined}>
                  {refreshing ? "Refreshing" : "Refresh"}
                </button>
              ) : null}
            </div>
          </div>

          {owner && manage !== undefined ? (
            <div className="exec-acc-tabs" role="tablist" aria-label="Profile and access views" onKeyDown={tabKeys}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  id={`exec-acc-tab-${t.id}`}
                  type="button"
                  role="tab"
                  className="exec-acc-tab"
                  aria-selected={tab === t.id}
                  aria-controls="exec-acc-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "self" ? (
            owner && manage !== undefined ? (
              <div id="exec-acc-panel" role="tabpanel" aria-labelledby="exec-acc-tab-self" className="exec-acc">{body}</div>
            ) : body
          ) : null}
        </div>
      </ExecutionSurface>
      {tab === "manage" ? (
        <div id="exec-acc-panel" role="tabpanel" aria-labelledby="exec-acc-tab-manage">{manage}</div>
      ) : null}
    </>
  );
}
