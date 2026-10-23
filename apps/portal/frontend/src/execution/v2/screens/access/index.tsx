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
import { SELF_ENTRY_PATH } from "../../../../app/selfNavView";
import type { UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf, readAsOf } from "../../boundary";
import { CodeName, GapWhy, NotAvailableLine, PanelHead, gapTitle } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { ExecutionSurface } from "../../../ExecutionSurface";
import { Flag } from "../../Flag";
import type { AccessEffective, AccessGrant } from "../../readers/accessEffective";
import { useExecUrlState, withContext } from "../../urlState";
import { holds } from "../../shell/roleNav";
import type { ExecutionApi } from "../../../api/ports";
import {
  ACCESS_FE,
  ADMIN_CAPABILITY,
  REASON_DICTIONARY,
  TS_AUTHORITY_FLAG,
  doRows,
  environmentsText,
  grantWindow,
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
import { useRootCapitalEligibility } from "./useRootCapitalEligibility";
import { useManageStepUp, type ReadStepUp } from "./useManageStepUp";
import { breakable } from "../cockpit/breakable";
import "../../css/access.css";
import "./manageGrid.css";

/** This screen's own route; the "My access" link of a disabled control lands here. */
export const ACCESS_PATH = "/administration/profile-access";

type Tab = "self" | "manage";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "self", label: "My access" },
  { id: "manage", label: "Manage grants" },
];

export interface AccessSelfViewProps {
  /** The V1 grant matrix. Offered on a second tab to an owner who holds `administration.profile_access.manage`, and to no one else. */
  manage?: ReactNode;
  /**
   * The workspace the session publishes, when it publishes one (today's `/access/self` does not). The address wins;
   * without either, no grants are requested and the card says the session publishes none.
   */
  sessionWorkspaceId?: string | null;
  /** The clock for "Read hh:mmZ"; injected so a test is not a race with the minute. */
  now?: () => number;
  /** Test seam for the one HTTP read. */
  fetchImpl?: typeof fetch;
  /**
   * The execution port, for the one advisory eligibility question this page can ask (capital commands at the caller's root,
   * `portal.self-eligibility-batch.v2`). Without it the row says it was not asked; nothing is guessed.
   */
  api?: Pick<ExecutionApi, "getSelfEligibilityBatch">;
  /** Test seam for the owner step-up read (`GET /api/admin/step-up`); defaults to the account client's. */
  readStepUp?: ReadStepUp;
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

type GrantsView =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "denied"; status: number; code: string | null; requestId: string | null }
  | { phase: "unavailable"; reason: string; code: string | null; requestId: string | null }
  | { phase: "ready"; effective: AccessEffective; readAt: UtcEpochMs | null; stale: { reason: string; requestId: string | null } | null };

export default function AccessSelfView({ manage, sessionWorkspaceId = null, now, fetchImpl, api, readStepUp }: AccessSelfViewProps) {
  const { principal, access } = useSession();
  const url = useExecUrlState();
  const location = useLocation();
  const headingId = useId();
  // The address names the workspace, else the session does when it publishes one. Never a guess: with neither, nothing is read.
  const workspaceId = url.value.workspace_id ?? (sessionWorkspaceId !== null && sessionWorkspaceId !== "" ? sessionWorkspaceId : null);
  const { load, reload, refreshing } = useAccessEffective(workspaceId, { now, fetchImpl });

  const session = access.kind === "ready" ? access.access : null;
  const capabilities = useMemo(() => new Set(session?.capabilities ?? []), [session]);
  // The admin policy matrix (V1 `ProfileAccess`) is reachable here only for the owner who also HOLDS the admin capability, read
  // from the same session answer. Fail closed: a session that did not load, an owner flag without the capability, a capability
  // without the owner flag, and `?view=manage` written by hand all leave the self-view alone. Every other link to this path (the
  // many "My access" links) lands on the self-view; none of them can open the matrix. `manage` also stays a prop, so no admin
  // surface exists unless the route's mount passes one.
  const canManage = manage !== undefined && session?.isOwner === true && holds(capabilities, { allOf: [ADMIN_CAPABILITY.profileAccessManage] });
  const tab: Tab = canManage && url.value.view === "manage" ? "manage" : "self";
  // Owner step-up for grant changes: asked only where the Manage grants tab exists (the read is owner-only).
  const manageStep = useManageStepUp(canManage, readStepUp);

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

  // On the self-only page the "My access" link of a disabled control stays on that page (BE-P7); everywhere else it is the bare access path.
  const myAccessHref = withContext(location.pathname === SELF_ENTRY_PATH ? SELF_ENTRY_PATH : ACCESS_PATH, location.search);

  // The session's own expiry (`exp`, epoch seconds on the auth context), printed as the absolute time it says; never a countdown.
  const sessionEnd = principal && principal.exp > 0 ? readAsOf(principal.exp * 1000) : null;
  const sessionEndNote = principal === null || principal === undefined
    ? "From the sign-in read"
    : sessionEnd !== null ? `Session ends ${formatAsOf(sessionEnd)}` : "Session end not published";

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
      render: (r) => r.absent
        ? <Flag kind="stale" size="sm" label="Not available yet" />
        : r.allowed
          ? (
            // Stacked, not side by side: two chips in a row widen the Status column until the Why column is pushed out of its panel.
            <span className="exec-acc-flags">
              <Flag kind="ok" size="sm" label={allowedWord} />
              {r.stepUp ? <Flag kind="approval" size="sm" label={r.stepUp === "ACTIVE" ? "Step-up active" : "Step-up required"} /> : null}
              {r.stepUpAbsent ? <Flag kind="unknown" size="sm" label="Step-up not stated" /> : null}
            </span>
          )
          : <Flag kind="na" size="sm" label={deniedWord} />,
    },
    {
      key: "reason",
      label: reasonLabel,
      render: (r) => (
        <span className="exec-acc-why">
          {breakable(r.reason)}
          {r.note ? <> · <span data-testid="acc-row-note">{r.note}</span></> : null}
          {r.absent ? <GapWhy name={`Why ${r.label} is not available yet`} rows={[gapTitle(r.absent.fe, r.absent.what)]} /> : null}
          {withLink && !r.allowed && !r.absent ? <> · <Link className="exec-acc-link" to={myAccessHref}>My access</Link></> : null}
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
          <span className="exec-acc-meta" data-testid="acc-grant-rev">Revision <span className="exec-acc-id">{g.revision}</span></span>
        </span>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      render: (g) => {
        const all = selectorAllIds(g.selector);
        return (
          <span className="exec-acc-cell">
            <span className="exec-acc-why" title={all.length > 0 ? all.join(", ") : undefined}>{selectorText(g.selector)}</span>
            <span className="exec-acc-meta" data-testid="acc-grant-env">{environmentsText(g)}</span>
          </span>
        );
      },
    },
    { key: "from", label: "Since", render: (g) => <span className="exec-acc-id">{validFromText(g)}</span> },
    { key: "until", label: "Expires", render: (g) => <span className="exec-acc-id">{validUntilText(g)}</span> },
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
  // At most ROW_CAP grants are drawn; the label states the exact count (the read itself is bounded at 500 by the reader).
  const grantView = useMemo(() => grantWindow(effective?.grants ?? []), [effective]);
  // The root the caller's own current ALLOW grants name; the capital question is asked about it and about nothing else.
  const rootId = useMemo(() => {
    for (const grant of effective?.grants ?? []) {
      if (grant.current && grant.effect === "ALLOW" && grant.selector.kind === "ROOT_SCOPE") return grant.selector.rootId;
    }
    return null;
  }, [effective]);
  const capital = useRootCapitalEligibility({ api, workspaceId, environment: url.value.env, rootId, now });

  const body = (
    <>
      <dl className="exec-acc-kpis" aria-label="Who you are signed in as">
        <div className="exec-acc-kpi">
          <dt>Signed in as</dt>
          <KpiValue text={principal?.username ?? "Not available"} absent={!principal?.username} />
          <dd className="exec-acc-kpi-note exec-acc-code">{session?.userId ? session.userId : "User id not available"}</dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Role preset</dt>
          <KpiValue text="Not available" absent />
          <dd className="exec-acc-kpi-note">Access is shown by capability (FE-015)</dd>
          <dd className="exec-acc-kpi-note" data-testid="acc-owner-note">
            {ownerWord ?? (access.kind === "loading" ? "Loading" : "Owner state not available")}
            {session ? ` · ${session.capabilities.length} ${session.capabilities.length === 1 ? "capability" : "capabilities"} held` : ""}
          </dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>App sign-in</dt>
          <KpiValue text={principal ? "Active" : access.kind === "loading" ? "Loading" : "Not available"} absent={!principal} />
          <dd className="exec-acc-kpi-note" data-testid="acc-session-end">{sessionEndNote}</dd>
        </div>
        <div className="exec-acc-kpi">
          <dt>Access policy</dt>
          <KpiValue text={effective ? policyWord(effective) : grants.phase === "loading" ? "Loading" : "Not available"} absent={!effective} />
          <dd className="exec-acc-kpi-note">
            {effective ? (effective.policyRevision ? `Revision ${effective.policyRevision}` : "No revision published") : "From the access read"}
          </dd>
        </div>
      </dl>

      {effective?.availability === "POLICY_PENDING" ? (
        <p className="exec-acc-banner" role="status">
          <strong>Access policy pending.</strong> {reasonText(effective.reasonCode ?? "").text}{" "}
          {reasonText(effective.reasonCode ?? "").known ? (
            <span className="exec-blk-sr">({effective.reasonCode})</span>
          ) : (
            <span className="exec-acc-code">{effective.reasonCode}</span>
          )}
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
          <PanelHead level={2} id={`${headingId}-see`} title="What you can see" />
          {sessionState ?? (
            <CardsTable columns={seeColumns} rows={seeRows(capabilities)} rowKey={(r) => r.id} label="What you can see" />
          )}
        </section>
        <section className="exec-acc-panel" aria-labelledby={`${headingId}-do`}>
          <PanelHead level={2} id={`${headingId}-do`} title="What you can do" />
          {sessionState ?? (
            <>
              <CardsTable columns={doColumns} rows={doRows(capabilities, capital.view, manageStep)} rowKey={(r) => r.id} label="What you can do" />
              {/*
                Per-action eligibility (FE-015/068): asked per resource (readers/accessSelf.ts, accessSelfBatch.ts). This page has no
                resource id, so it asks the one question that needs none: capital commands at the ROOT the caller's own grants name
                (useRootCapitalEligibility). Gate decisions, Manage grants and Manage users come from the session's capabilities.
                Every other design row says "Not available yet" with its request id; nothing is inferred.
              */}
            </>
          )}
        </section>
      </div>

      <NotAvailableLine
        className="exec-acc-caption"
        facts={[
          { label: "Per-action eligibility", id: "FE-015", why: "Asked per resource: this page reads only capital commands at your root. Archive, operations and export have no published read" },
          { label: "Who granted each item", id: "FE-015" },
        ]}
      />
      <p className="exec-acc-caption" title={`The server publishes Portfolios, Accounts, Operations and Blotter as four navigation rows, and this list follows that read (${ACCESS_FE.capabilityNames}).`}>
        Menu entries from your navigation read: Portfolios, Accounts, Operations, Blotter
        {others.length > 0 ? <> · Other capabilities in your session: <span className="exec-acc-code">{others.join(", ")}</span></> : null}
      </p>

      <section className="exec-acc-panel" aria-labelledby={`${headingId}-granted`} id="exec-acc-granted">
        <PanelHead level={2} id={`${headingId}-granted`} title="Granted to you" />
        {grants.phase === "idle" ? (
          <p className="exec-acc-state" role="status">
            <strong>Not available.</strong> No workspace is named for this read.
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
              rows={grantView.rows}
              rowKey={(g) => g.grantId}
              label="Granted to you"
              empty={effective.availability === "POLICY_PENDING"
                ? "No grants are listed while the access policy is pending."
                : "No grants are published for you in this workspace."}
            />
            {grantView.label !== null ? (
              <p className="exec-acc-foot" role="status" data-testid="exec-acc-grants-cap">
                <span data-testid="exec-acc-grants-cap-label">{grantView.label}</span>
                <span>{`. The other ${grantView.total - grantView.rows.length} are not drawn here`}</span>
                <GapWhy name="Why the other grants are not drawn" rows={[`These are the first ${grantView.rows.length} in the order the Portal sent them; the other ${grantView.total - grantView.rows.length} are not drawn here.`]} next={null} />
              </p>
            ) : null}
            <p className="exec-acc-foot">State and trading-system columns are the Portal&apos;s own evaluation.</p>
          </>
        ) : null}
      </section>

      {effective ? (
        <section className="exec-acc-panel" aria-labelledby={`${headingId}-policy`}>
          <PanelHead level={2} id={`${headingId}-policy`} title="Policy" />
          <dl className="exec-acc-facts">
            <dt>Researcher field policy</dt>
            <dd>
              {effective.researcherFieldPolicy.state === "PENDING" ? (
                <>
                  Not decided
                  <GapWhy name="Why the researcher field policy is not decided" rows={[gapTitle(ACCESS_FE.researcher, "Researcher field policy")]} />
                </>
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
              <span>{reasonText(effective.ownerRecovery.reasonCode).text}</span>
              <GapWhy name="Owner recovery, reason code" rows={[effective.ownerRecovery.reasonCode]} next={null} />
              <span className="exec-blk-sr"> {effective.ownerRecovery.reasonCode}</span>
            </dd>
          </dl>
        </section>
      ) : null}

      <details className="exec-acc-dict">
        <summary>Reasons this screen can show</summary>
        <CardsTable
          columns={[
            { key: "code", label: "Reason", render: (r: [string, string]) => <CodeName code={r[0]} /> },
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
              <p className="exec-acc-sub" data-testid="acc-subtitle">
                {principal?.username ? principal.username : "Signed-in person not named"}
                {ownerWord ? ` · ${ownerWord}` : ""}
              </p>
            </div>
            <div className="exec-acc-chips">
              {/* The freshness chip: the browser's receipt time of the grants read, said as such; the Portal publishes no as-of. */}
              {grants.phase === "ready" && grants.readAt !== null ? (
                <span
                  className="exec-acc-chip"
                  data-testid="acc-fresh"
                  title="The time this browser received the answer. The Portal publishes no as-of for this read."
                >
                  Read {formatAsOf(grants.readAt)}
                </span>
              ) : (
                <span className="exec-acc-chip" data-testid="acc-fresh" data-state="none">
                  Freshness not published
                </span>
              )}
              {workspaceId !== null ? (
                <button type="button" className="exec-acc-btn" onClick={reload} disabled={refreshing} title={refreshing ? "A refresh is already running." : undefined}>
                  {refreshing ? "Refreshing" : "Refresh"}
                </button>
              ) : null}
            </div>
          </div>

          {canManage ? (
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

          {tab === "manage" ? (
            <section className="exec-acc-manage" aria-label="Manage grants" data-testid="acc-manage-head">
              <div className="exec-acc-manage-head">
                <h2 className="exec-acc-manage-title">Manage grants</h2>
                {manageStep === "REQUIRED" ? <Flag kind="approval" size="sm" label="Step-up required" /> : null}
                {manageStep === "ACTIVE" ? <Flag kind="approval" size="sm" label="Step-up active" /> : null}
                {manageStep === null ? <Flag kind="unknown" size="sm" label="Step-up state not read" /> : null}
              </div>
              <p className="exec-acc-manage-line" data-testid="acc-manage-presets">
                Role preset: Not available
                <GapWhy name="Why role presets are not available" rows={[gapTitle(ACCESS_FE.reasons, "Role preset")]} next={null} />
                <span> · Access is granted per gate below: see and decide, one account at a time.</span>
              </p>
              <p className="exec-acc-manage-line" data-testid="acc-manage-intro">
                Who may see a Governance gate, and who may record its Portal decision. Granting a capability here changes nothing outside the Portal: it records no command and moves no capital.
              </p>
              {workspaceId !== null ? (
                <p className="exec-acc-manage-line" data-testid="acc-manage-workspace">
                  This page reads workspace <span className="exec-acc-code">{workspaceId}</span>. The grants below are portal-wide: their read takes no workspace, so the address does not change them.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* The matrix sits in the page's own flow (it used to render after the surface's full-height box, leaving an empty band). */}
          {tab === "manage" ? (
            <div id="exec-acc-panel" role="tabpanel" aria-labelledby="exec-acc-tab-manage" className="exec-acc-manage-body">{manage}</div>
          ) : null}

          {tab === "self" ? (
            canManage ? (
              <div id="exec-acc-panel" role="tabpanel" aria-labelledby="exec-acc-tab-self" className="exec-acc">{body}</div>
            ) : body
          ) : null}
        </div>
      </ExecutionSurface>
    </>
  );
}
