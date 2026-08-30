/**
 * Admin Action Drawer — hi-fi WF 1i (CLI catalog), owner copy 2026-08-30.
 *
 * Two truths share this screen and neither is allowed to blur the other:
 *
 *   1. The PUBLISHED truth (`execution.command-catalog` rev 2, EX-BE-05b/F0):
 *      sixty-four commands exist, every one is `portal_reachable: false`, and
 *      the relay capability is `DISABLED`. That catalogue is rendered in full
 *      below the task catalog, with no plan/apply control anywhere near it —
 *      a disabled button would advertise a capability that does not exist.
 *
 *   2. The HI-FI truth (WF 1i): the drawer an operator will eventually use —
 *      task-grouped commands, registry-picked parameters, PLAN → APPLY
 *      (step-up) → VERIFY, the two-man-rule key, read commands that stream a
 *      transcript. All of it runs here as a DECLARED DEMO on
 *      `adminCli.smoke.ts` frames (BR-EX-68), labelled SMOKE at the point of
 *      interaction, so the composition is reviewable before the relay ships.
 *
 * The demo never claims a cell was touched: every transcript, preflight row
 * and timeline entry is a declared fixture, and the masthead quotes the live
 * catalogue's relay state right above the flow that will one day use it.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  blockedText,
  groupEntries,
  RISK_TIER_LABEL,
  type CatalogEntry,
  type CommandCatalogue,
} from "../adminCatalog";
import {
  ALLOC_IMPACT,
  CLI_ACTIONS,
  CLI_DEMO,
  CLI_GRANT,
  CLI_GROUPS,
  CLI_OUT,
  CLI_PARAMS,
  CLI_PREFLIGHT,
  CLI_PREFLIGHT_WARN_INDEX,
  CLI_SMOKE_NOTE,
  EMERGENCY_PLAN,
  verifyTimeline,
  type CliAction,
  type CliCheck,
  type CliOutcome,
  type CliRole,
} from "../adminCli.smoke";
import { smokeMotionAllowed } from "../smokeMotion";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { planApplicable, planOutcomeText, type CommandPlan } from "../commandPlan";
import type { PanelStatus } from "../contracts";

/* ---------------------------------------------------------------------------
 * Published-catalogue pieces (F0) — unchanged semantics, no controls.
 * ------------------------------------------------------------------------ */

/** `PLAN → APPLY → VERIFY`, but only the steps this command actually requires. */
function StepRail({ entry }: { entry: CatalogEntry }) {
  const steps = [
    entry.planRequired ? "PLAN" : null,
    entry.applyRequired ? "APPLY" : null,
    entry.verifyRequired ? "VERIFY" : null,
  ].filter((s): s is string => s !== null);
  if (steps.length === 0) {
    return <span className="exec-admin-steps" data-empty="true">no plan/apply/verify path</span>;
  }
  return <span className="exec-admin-steps">{steps.join(" → ")}</span>;
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: (entry: CatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      className="exec-admin-row"
      data-reachable={entry.portalReachable ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(entry)}
    >
      <span className="exec-admin-rowhead">
        <span className="exec-admin-rowtitle">
          {entry.command} <span className="exec-admin-action">{entry.action}</span>
        </span>
        <span className="exec-admin-tag" data-tier={entry.riskTier ?? "UNKNOWN"}>
          {entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "tier not stated"}
        </span>
        {entry.ownerReviewRequired ? (
          <span className="exec-admin-owner">owner review</span>
        ) : null}
        <span className="exec-admin-scope">{entry.routeState ?? "route not stated"}</span>
      </span>
      <span className="exec-admin-cli">
        {entry.httpMethod && entry.httpPath
          ? `${entry.httpMethod} ${entry.httpPath}`
          : "no HTTP route published"}
      </span>
    </button>
  );
}

/**
 * The published-entry detail. No plan/apply footer at any tier: there is no
 * reachable command at any tier, and a disabled control would teach an
 * operator that the blocker is negotiable.
 */
function EntryDetail({ entry, plan }: { entry: CatalogEntry; plan?: CommandPlan | null }) {
  return (
    <>
      <p className="exec-admin-selmeta exec-role-meta">{entry.key}</p>

      <div className="exec-admin-blocked" role="note">
        <b>NOT EXPOSED IN PORTAL</b>
        <p>{blockedText(entry)}</p>
      </div>

      <dl className="exec-admin-facts">
        <div>
          <dt>Portal risk tier</dt>
          <dd>{entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "not stated"}</dd>
        </div>
        {entry.sourceRiskTier && entry.sourceRiskTier !== entry.riskTier ? (
          <div>
            <dt>Source proposed</dt>
            <dd>{RISK_TIER_LABEL[entry.sourceRiskTier]} — the Portal is bound by its own tier</dd>
          </div>
        ) : null}
        <div>
          <dt>Steps required</dt>
          <dd>
            <StepRail entry={entry} />
          </dd>
        </div>
        <div>
          <dt>Owner review</dt>
          <dd>{entry.ownerReviewRequired ? "required" : "not required"}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {entry.httpMethod && entry.httpPath
              ? `${entry.httpMethod} ${entry.httpPath}`
              : "none published"}
            {entry.routeState ? ` · ${entry.routeState}` : null}
          </dd>
        </div>
        {entry.sourceReference ? (
          <div>
            <dt>Observed at</dt>
            <dd>
              <code>{entry.sourceReference}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {plan ? (
        <div className="exec-admin-plan">
          <h3>Plan {plan.operationId}</h3>
          <p>{planOutcomeText(plan)}</p>
          <p className="exec-admin-planfacts">
            status {plan.status ?? "not stated"} · relay {plan.relayCapability ?? "not stated"} ·{" "}
            {plan.replayed ? "replayed" : "new"}
            {plan.blockers.length > 0 ? ` · blocked: ${plan.blockers.join(", ")}` : null}
          </p>
          <p className="exec-admin-planfacts">{planApplicable(plan).reason}</p>
          {plan.payloadStoragePolicy === "HASH_ONLY_NO_RAW" ? (
            <p className="exec-admin-planfacts">
              The request payload is stored as a hash and never kept. It cannot be read back here,
              and this screen never repeats a refused value.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="exec-admin-nofooter">
        No plan or apply is offered: the command relay is disabled for this catalogue revision, so
        there is nothing here to run.
      </p>
    </>
  );
}

/** Risk-tier narrowing, applied by the SERVER (F0 — see the container). */
export const TIER_FILTERS = [
  "ALL",
  "R0_READ",
  "R1_PAPER_MUTATION",
  "R2_SANDBOX",
  "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING",
] as const;
export type TierFilter = (typeof TIER_FILTERS)[number];

const TIER_FILTER_LABEL: Record<TierFilter, string> = {
  ALL: "All",
  R0_READ: "R0 read",
  R1_PAPER_MUTATION: "R1 paper",
  R2_SANDBOX: "R2 sandbox",
  R3_LIVE_PROTECTIVE: "R3 protective",
  R4_LIVE_RISK_INCREASING: "R4 risk-increasing",
};

/* ---------------------------------------------------------------------------
 * WF 1i demo drawer
 * ------------------------------------------------------------------------ */

/** Splits `text` around `link.label`, rendering the label as an anchor. */
function CheckLine({ check }: { check: CliCheck }) {
  const icon = check.tone === "good" ? "✓" : check.tone === "warn" ? "!" : "·";
  let body: ReactNode = check.text;
  if (check.link) {
    const i = check.text.indexOf(check.link.label);
    if (i >= 0) {
      body = (
        <>
          {check.text.slice(0, i)}
          <a href={check.link.href}>{check.link.label}</a>
          {check.text.slice(i + check.link.label.length)}
        </>
      );
    }
  }
  return (
    <span className="exec-cli-check" data-tone={check.tone}>
      <b aria-hidden="true">{icon}</b> {body}
    </span>
  );
}

function outLineTone(txt: string): "cmd" | "exit" | "bad" | "good" | "plain" {
  if (txt.startsWith("$")) return "cmd";
  if (txt.startsWith("exit")) return "exit";
  if (/REJECTED|DENIED|MISMATCH|ERROR/.test(txt)) return "bad";
  if (/READY|FRESH|MATCH|✓| OK/.test(txt)) return "good";
  return "plain";
}

interface CliDemoState {
  phase: "plan" | "verify";
  planned: boolean;
  pfStep: number;
  grant: "none" | "pending" | "issued";
  grantLeft: number;
  out: readonly string[];
  streaming: boolean;
  watch: boolean;
  watchLeft: number;
}

const DEMO_IDLE: CliDemoState = {
  phase: "plan",
  planned: false,
  pfStep: 0,
  grant: "none",
  grantLeft: CLI_GRANT.ttlSeconds,
  out: [],
  streaming: false,
  watch: false,
  watchLeft: CLI_DEMO.watchSeconds,
};

/**
 * The hi-fi's demo state machine. With motion off (reduced-motion, fixtures
 * page, automated browsers) every transition jumps straight to its terminal
 * state so audits and baselines measure a still, complete pane.
 */
function useCliDemo(actionId: string | null) {
  const [state, setState] = useState<CliDemoState>(DEMO_IDLE);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const clearTimers = () => {
    for (const t of timers.current) clearInterval(t);
    timers.current = [];
  };
  // Selection change resets the whole demo — the drawer belongs to one command.
  useEffect(() => {
    clearTimers();
    setState(DEMO_IDLE);
    return clearTimers;
  }, [actionId]);

  const every = (ms: number, fn: () => boolean) => {
    const t = setInterval(() => {
      if (fn()) clearInterval(t);
    }, ms);
    timers.current.push(t);
  };

  const runRead = () => {
    const lines = (actionId && CLI_OUT[actionId]) ? CLI_OUT[actionId].split("\n") : ["no output"];
    if (!smokeMotionAllowed()) {
      setState((s) => ({ ...s, out: lines, streaming: false }));
      return;
    }
    setState((s) => ({ ...s, out: [], streaming: true }));
    let i = 0;
    every(CLI_DEMO.streamLineMs, () => {
      i += 1;
      if (i >= lines.length) {
        setState((s) => ({ ...s, out: lines, streaming: false }));
        return true;
      }
      setState((s) => ({ ...s, out: lines.slice(0, i) }));
      return false;
    });
  };

  const genPlan = () => {
    if (!smokeMotionAllowed()) {
      setState((s) => ({ ...s, planned: true, phase: "plan", pfStep: CLI_PREFLIGHT.length, grant: "none" }));
      return;
    }
    setState((s) => ({ ...s, planned: true, phase: "plan", pfStep: 0, grant: "none" }));
    every(CLI_DEMO.preflightStepMs, () => {
      let done = false;
      setState((s) => {
        const n = s.pfStep + 1;
        done = n >= CLI_PREFLIGHT.length;
        return { ...s, pfStep: n };
      });
      return done;
    });
  };

  const requestKey = () => {
    if (!smokeMotionAllowed()) {
      setState((s) => ({ ...s, grant: "issued", grantLeft: CLI_GRANT.ttlSeconds }));
      return;
    }
    setState((s) => ({ ...s, grant: "pending" }));
    const issue = setTimeout(() => {
      setState((s) => ({ ...s, grant: "issued", grantLeft: CLI_GRANT.ttlSeconds }));
      every(1000, () => {
        let expired = false;
        setState((s) => {
          if (s.grantLeft <= 1) {
            expired = true;
            return { ...s, grant: "none", grantLeft: CLI_GRANT.ttlSeconds };
          }
          return { ...s, grantLeft: s.grantLeft - 1 };
        });
        return expired;
      });
    }, CLI_GRANT.issueDelayMs);
    timers.current.push(issue as unknown as ReturnType<typeof setInterval>);
  };

  const toggleWatch = () => {
    if (state.watch) {
      clearTimers();
      setState((s) => ({ ...s, watch: false, watchLeft: CLI_DEMO.watchSeconds }));
      return;
    }
    setState((s) => ({ ...s, watch: true, watchLeft: CLI_DEMO.watchSeconds }));
    if (!smokeMotionAllowed()) return;
    every(1000, () => {
      setState((s) =>
        s.watchLeft <= 1 ? { ...s, watchLeft: CLI_DEMO.watchSeconds } : { ...s, watchLeft: s.watchLeft - 1 },
      );
      return false;
    });
  };

  return {
    state,
    runRead,
    genPlan,
    requestKey,
    toggleWatch,
    doApply: () => setState((s) => ({ ...s, phase: "verify" })),
    reset: () => {
      clearTimers();
      setState(DEMO_IDLE);
    },
  };
}

function CliActionRow({
  action,
  selected,
  onPick,
}: {
  action: CliAction;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="exec-cli-row"
      data-tag={action.tag}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onPick(action.id)}
    >
      <span className="exec-cli-rowhead">
        <span className="exec-cli-rowtitle">{action.title}</span>
        <span className="exec-cli-tag" data-tag={action.tag}>{action.tag}</span>
        <span className="exec-cli-rowscope">{action.scope}</span>
      </span>
      <span className="exec-cli-rowcli">{action.cli.split("\n")[0]}</span>
    </button>
  );
}

function CliDrawer({
  action,
  role,
  outcome,
  onReset,
  publishedEntry,
}: {
  action: CliAction;
  role: CliRole;
  outcome: CliOutcome;
  onReset: () => void;
  /** The rev-2 catalogue entry this action joins to, when one exists. */
  publishedEntry: CatalogEntry | null;
}) {
  const demo = useCliDemo(action.id);
  const { state } = demo;
  const isRead = action.tag === "READ";
  const isBlocked = action.tag === "BLOCKED";
  const isMut = !isRead && !isBlocked;
  const denied = role === "VIEWER" && isMut;
  const needsGrant = isMut && role === "OPERATOR";
  const params = CLI_PARAMS[action.id] ?? [];
  const pfDone = state.planned && state.pfStep >= CLI_PREFLIGHT.length;
  const pfRunning = state.planned && !pfDone && state.phase === "plan";
  const readyApply = pfDone && (!needsGrant || state.grant === "issued");
  const inVerify = isMut && !denied && state.phase === "verify";
  const inPlan = isMut && !denied && state.phase === "plan";
  const timeline = useMemo(
    () => verifyTimeline(action.id === "emergency" ? "emergency" : "generic", outcome),
    [action.id, outcome],
  );

  return (
    <div className="exec-cli-drawer" aria-label="Command drawer">
      <div className="exec-cli-drawhead">
        <span className="exec-cli-tag" data-tag={action.tag} data-size="lg">{action.tag}</span>
        <button type="button" className="exec-cli-reset" onClick={() => { demo.reset(); onReset(); }}>↺ reset</button>
        <h1>{action.title}</h1>
        <span className="exec-cli-drawmeta">{action.meta}</span>
      </div>

      {isMut && !denied ? (
        <div className="exec-cli-steps" role="tablist" aria-label="Mutation flow">
          <span data-state={state.phase === "plan" ? "active" : "done"}>1 · PLAN</span>
          <span data-state={state.phase === "verify" ? "done" : "idle"}>2 · APPLY</span>
          <span data-state={state.phase === "verify" ? "active" : "idle"}>3 · VERIFY</span>
        </div>
      ) : null}

      <div className="exec-cli-drawbody">
        <p className="exec-cli-smoke">{CLI_SMOKE_NOTE}</p>
        {publishedEntry ? (
          <p className="exec-cli-joined">
            published as <code>{publishedEntry.key}</code> in catalogue rev 2 —{" "}
            {publishedEntry.riskTier ? RISK_TIER_LABEL[publishedEntry.riskTier] : "tier not stated"} · not reachable
          </p>
        ) : (
          <p className="exec-cli-joined" data-missing="true">
            not in published catalogue rev 2 under this name — the join lands with BR-EX-68
          </p>
        )}

        {!isBlocked && !denied && params.length > 0 ? (
          <div className="exec-cli-params">
            <div className="exec-cli-paramhead">
              <span>Target &amp; parameters — declare before run</span>
              <span className="exec-cli-paramsrc">validated against registry</span>
            </div>
            {params.map((p) => (
              <div className="exec-cli-paramrow" key={p.k}>
                <span className="exec-cli-paramk">{p.k}</span>
                <span className="exec-cli-paramv">{p.v}</span>
                <span className="exec-cli-paramsrc">{p.src}</span>
              </div>
            ))}
            <p className="exec-cli-paramfoot">
              ids picked from registries — never free-typed · a missing required param disables Run
              / Generate plan · the CLI line is assembled from these values
            </p>
          </div>
        ) : null}

        {isRead ? (
          <>
            <div className="exec-cli-readbanner">
              <b>READ-ONLY</b> — no admin password (CLI) · no step-up (web) · safe during incidents
            </div>
            <div className="exec-cli-terminal" aria-label="Command output">
              {state.out.length === 0 && !state.streaming ? (
                <>
                  <div className="exec-cli-runhint">
                    ▸ press <b>Run</b> to execute against the live cell — read path, no locks, safe
                    mid-incident
                  </div>
                  <pre className="exec-cli-ghost">{action.cli}</pre>
                </>
              ) : null}
              {state.out.map((txt, i) => (
                <div className="exec-cli-outline" data-tone={outLineTone(txt)} key={i}>{txt}</div>
              ))}
              {state.streaming ? <span className="exec-cli-cursor" aria-hidden="true">▊</span> : null}
            </div>
            {state.watch ? (
              <div className="exec-cli-watchbanner">
                <b>WATCH</b> · re-run in <span className="exec-cli-num">{state.watchLeft}s</span> ·
                freshness belongs to the row, not the screen
              </div>
            ) : null}
          </>
        ) : null}

        {isBlocked ? (
          <div className="exec-cli-blockbanner" role="note">
            <b>NOT EXPOSED IN PORTAL</b>
            <span>{action.plan}</span>
          </div>
        ) : null}

        {denied ? (
          <div className="exec-cli-deniedbanner" role="note">
            <b>ROLE GRANT REQUIRED</b>
            <span>
              Your role (Viewer) holds no command grant for <b>{action.title}</b>. Command grants
              are issued per group by an admin and are revocable · request via{" "}
              <span className="exec-cli-deadref" title="No Profile & Access screen exists in the registry yet.">
                Profile &amp; Access
              </span>
              .
            </span>
            <span className="exec-cli-deniedfoot">
              catalog stays visible — visibility ≠ authority · read commands remain available
            </span>
          </div>
        ) : null}

        {inPlan ? (
          <>
            {action.id === "alloc" ? (
              <>
                <div className="exec-cli-impact">
                  <div className="exec-cli-impactcard">
                    <div className="exec-cli-cardlabel">Before</div>
                    <div className="exec-cli-cardbody">
                      allocated <b>{ALLOC_IMPACT.before.allocated}</b>
                      <br />pf weight {ALLOC_IMPACT.before.weight}
                      <br />marginal risk {ALLOC_IMPACT.before.marginal}
                    </div>
                  </div>
                  <div className="exec-cli-impactcard" data-after="true">
                    <div className="exec-cli-cardlabel">After</div>
                    <div className="exec-cli-cardbody">
                      allocated <b>{ALLOC_IMPACT.after.allocated}</b>
                      <br />pf weight {ALLOC_IMPACT.after.weight}
                      <br />marginal risk <span data-tone="warn">{ALLOC_IMPACT.after.marginal}</span>
                    </div>
                  </div>
                </div>
                <div className="exec-cli-panel">
                  <div className="exec-cli-cardlabel">Policy &amp; evidence checks</div>
                  <div className="exec-cli-checks">
                    {ALLOC_IMPACT.checks.map((c) => (
                      <CheckLine check={c} key={c.text} />
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {action.id === "emergency" ? (
              <>
                <div className="exec-cli-panel" data-danger="true">
                  <div className="exec-cli-cardlabel" data-tone="bad">
                    Read-only flatten plan — paper-binance-carry-v32
                  </div>
                  <div className="exec-cli-checks">
                    {EMERGENCY_PLAN.map((c) => (
                      <CheckLine check={c} key={c.text} />
                    ))}
                  </div>
                </div>
                <div className="exec-cli-panel">
                  <div className="exec-cli-cardlabel">Type CLOSE to confirm (mirrors --confirm CLOSE)</div>
                  <div className="exec-cli-confirm" data-danger="true">CLOSE</div>
                </div>
              </>
            ) : null}

            {action.id !== "alloc" && action.id !== "emergency" && action.plan ? (
              <div className="exec-cli-panel">
                <div className="exec-cli-cardlabel">
                  Pending admin change — exact request preview (as the CLI prints it)
                </div>
                <pre className="exec-cli-pre">{action.plan}</pre>
              </div>
            ) : null}
            {action.id !== "alloc" && action.id !== "emergency" && action.appr ? (
              <div className="exec-cli-panel">
                <div className="exec-cli-cardlabel">Authority &amp; gate checks</div>
                <pre className="exec-cli-pre">{action.appr}</pre>
              </div>
            ) : null}

            <div className="exec-cli-equiv">
              <div className="exec-cli-cardlabel">Equivalent CLI — read-only, audit/training</div>
              <pre className="exec-cli-pre" data-cli="true">{action.cli}</pre>
            </div>
            <div>
              <div className="exec-cli-cardlabel">Reason (required — lands in portfolio_audit_log)</div>
              <div className="exec-cli-reason">{action.reason ?? "—"}</div>
            </div>

            {state.planned ? (
              <>
                <div className="exec-cli-planbanner">
                  <b>PLAN {CLI_DEMO.planId} generated</b> · server re-checked policy · expected
                  revision pinned · expires in 60s
                </div>
                <div className="exec-cli-panel">
                  <div className="exec-cli-pfhead">
                    <span>Preflight — runs server-side after PLAN</span>
                    <span className="exec-cli-pfbadge" data-done={pfDone ? "true" : undefined}>
                      {pfDone
                        ? "5 ✓ · 1 WARN — CLEAR TO APPLY"
                        : `RUNNING ${state.pfStep}/${CLI_PREFLIGHT.length}`}
                    </span>
                  </div>
                  <div className="exec-cli-checks">
                    {CLI_PREFLIGHT.map((label, i) => {
                      const warn = i === CLI_PREFLIGHT_WARN_INDEX;
                      const tone = i < state.pfStep ? (warn ? "warn" : "good") : i === state.pfStep && pfRunning ? "running" : "idle";
                      return (
                        <span className="exec-cli-check" data-tone={tone} key={label}>
                          <b aria-hidden="true">{tone === "good" ? "✓" : tone === "warn" ? "!" : tone === "running" ? "▸" : "·"}</b>{" "}
                          {label}
                          {tone === "running" ? " — checking…" : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {pfDone ? (
                  <div className="exec-cli-applywarn">
                    <b>⚠ APPLY runs immediately on the EXECUTION cell</b>
                    <span>
                      writes ledger row on <a href="/deployments/paper/dep_74">dep_74</a> · plan TTL
                      60s · idempotency key pinned — re-apply is safe, duplicates impossible ·
                      PARTIAL is a real outcome, watch VERIFY
                    </span>
                  </div>
                ) : null}
                {pfDone && needsGrant && state.grant === "none" ? (
                  <div className="exec-cli-grantask">
                    <b>ADMIN EXECUTION KEY REQUIRED</b> — two-man rule
                    <br />your role executes with a single-use key issued by an admin · scope:{" "}
                    <b>{CLI_DEMO.planId} only</b> · the key never grants a second command
                  </div>
                ) : null}
                {pfDone && needsGrant && state.grant === "pending" ? (
                  <div className="exec-cli-grantwait">
                    <b>KEY REQUESTED</b> — waiting for admin {CLI_GRANT.admin} · requested{" "}
                    {CLI_GRANT.requestedAt} · notified via alerts
                  </div>
                ) : null}
                {pfDone && needsGrant && state.grant === "issued" ? (
                  <div className="exec-cli-grantok">
                    <b>KEY ISSUED — {CLI_GRANT.key}</b> · by {CLI_GRANT.admin} (admin) · single-use
                    · bound to {CLI_DEMO.planId}
                    <br />expires in <span className="exec-cli-num">{state.grantLeft}s</span> ·
                    issuance recorded in audit
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {inVerify ? (
          <>
            <div className="exec-cli-panel">
              <div className="exec-cli-cardlabel">
                Operation timeline · <a href={CLI_DEMO.operationHref}>{CLI_DEMO.operationId}</a> ·
                command {CLI_DEMO.planId}
              </div>
              <div className="exec-cli-checks">
                {timeline.map((row) => (
                  <span className="exec-cli-check" data-tone={row.tone} key={row.at + row.text}>
                    <span className="exec-cli-vat">{row.at}</span>{" "}
                    {row.tone === "good" ? <b aria-hidden="true">✓</b> : row.tone === "warn" ? <b aria-hidden="true">!</b> : null}{" "}
                    {row.text}
                    {row.chip ? <span className="exec-cli-202">{row.chip}</span> : null}
                  </span>
                ))}
              </div>
            </div>
            {outcome === "VERIFIED" ? (
              <div className="exec-cli-verified">
                <b>VERIFIED — terminal state confirmed by authoritative ACK</b>
                <br />audit: <a href={CLI_DEMO.operationHref}>{CLI_DEMO.operationId}</a> ·
                portfolio_audit_log · command journal
              </div>
            ) : (
              <div className="exec-cli-partial">
                <b>PARTIAL — not success, residue must be resolved</b>
                <br />
                <span>
                  review the NEW plan and apply again for the residue (same idempotency key) until
                  VERIFIED · sandbox/live: run broker reconciliation after ·{" "}
                  <a href="/execution/operations">open reconciliation →</a>
                </span>
              </div>
            )}
            <p className="exec-cli-verifyfoot">
              the drawer waits for terminal state instead of timing out into a fake green · every
              sub-intent listed · PARTIAL never renders green
            </p>
          </>
        ) : null}
      </div>

      <div className="exec-cli-foot">
        {isBlocked || denied ? (
          <span className="exec-cli-footnote">no mutation footer — nothing to plan or apply</span>
        ) : null}
        {isRead ? (
          <>
            {state.streaming ? (
              <span className="exec-cli-running">Running…</span>
            ) : (
              <button type="button" className="exec-cli-run" onClick={demo.runRead}>
                Run ▸ read-only
              </button>
            )}
            <button
              type="button"
              className="exec-cli-watch"
              data-on={state.watch ? "true" : undefined}
              onClick={demo.toggleWatch}
            >
              {state.watch ? `◉ Watch ON · ${state.watchLeft}s` : `◉ Watch ${CLI_DEMO.watchSeconds}s`}
            </button>
            <span className="exec-cli-footnote" data-end="true">
              read path · exit codes verbatim · output copyable
            </span>
          </>
        ) : null}
        {inPlan ? (
          <>
            <button type="button" className="exec-cli-cancel" onClick={demo.reset}>Cancel</button>
            <span className="exec-cli-footgap" />
            {!state.planned ? (
              <>
                <button type="button" className="exec-cli-genplan" onClick={demo.genPlan}>
                  Generate plan
                </button>
                <button type="button" className="exec-cli-needsplan" disabled>
                  Apply — needs plan
                </button>
              </>
            ) : null}
            {pfRunning ? <span className="exec-cli-running">Preflight running…</span> : null}
            {pfDone && needsGrant && state.grant === "none" ? (
              <button type="button" className="exec-cli-reqkey" onClick={demo.requestKey}>
                Request admin key ▸
              </button>
            ) : null}
            {pfDone && needsGrant && state.grant === "pending" ? (
              <span className="exec-cli-running">Waiting for admin…</span>
            ) : null}
            {readyApply ? (
              <button
                type="button"
                className="exec-cli-apply"
                data-danger={action.tag === "DANGER" ? "true" : undefined}
                onClick={demo.doApply}
              >
                Apply after step-up ▸
              </button>
            ) : null}
          </>
        ) : null}
        {inVerify ? (
          <>
            <button type="button" className="exec-cli-cancel" onClick={demo.reset}>New action</button>
            {outcome === "PARTIAL" ? (
              <button type="button" className="exec-cli-residue" onClick={demo.genPlan}>
                Plan residue re-apply
              </button>
            ) : null}
            <span className="exec-cli-footgap" />
            <span className="exec-cli-footnote" data-end="true">
              actor Stan · step-up {CLI_DEMO.stepUpAt} · TTL {CLI_DEMO.stepUpTtl}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Screen
 * ------------------------------------------------------------------------ */

const ROLE_LABEL: Record<CliRole, string> = {
  ADMIN: "Admin",
  OPERATOR: "Operator (granted)",
  VIEWER: "Viewer",
};

export function AdminActionDrawerScreen({
  catalogue,
  status = "ok",
  reason,
  selected,
  onSelect,
  tier = "ALL",
  onTierChange,
  plan,
  role = "OPERATOR",
  outcome = "VERIFIED",
  initialCommand = "alloc",
  operationRef = null,
  children,
}: {
  catalogue: CommandCatalogue | null;
  status?: PanelStatus;
  reason?: string;
  selected: CatalogEntry | null;
  onSelect: (entry: CatalogEntry | null) => void;
  tier?: TierFilter;
  onTierChange?: (tier: TierFilter) => void;
  plan?: CommandPlan | null;
  role?: CliRole;
  outcome?: CliOutcome;
  /** Hi-fi default selection; `null` starts with the drawer empty. */
  initialCommand?: string | null;
  /** `?operation=` deep link from Operations Queue / Incident Detail. */
  operationRef?: string | null;
  children?: ReactNode;
}) {
  const [cliSelected, setCliSelected] = useState<string | null>(initialCommand);
  const groups = catalogue ? groupEntries(catalogue.entries) : [];
  const reachable = catalogue ? catalogue.entries.filter((e) => e.portalReachable).length : 0;
  const relayDisabled = catalogue?.capabilityState === "DISABLED";
  const cliAction = selected ? null : CLI_ACTIONS.find((a) => a.id === cliSelected) ?? null;
  const publishedByKey = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const e of catalogue?.entries ?? []) map.set(e.key, e);
    return map;
  }, [catalogue]);

  return (
    <ExecutionSurface kind="deployments" className="exec-admin exec-cli" data-hifi-exact="admin-cli-1i">
      <div className="exec-cli-head">
        <span className="exec-cli-headchip">ADMIN ACTIONS</span>
        <span className="exec-cli-headline">
          Operator Admin scope · UI and CLI share ONE command authority — the browser never runs a
          shell
        </span>
        <span className="exec-cli-wf">WF 1i · catalog: PORTFOLIO_MANAGEMENT_CLI_GUIDE</span>
        <span className="exec-cli-headgap" />
        <span className="exec-cli-stepup">CLI password → web step-up</span>
        <span className="exec-cli-actor" data-role={role}>actor Stan · {ROLE_LABEL[role]}</span>
      </div>

      {status !== "ok" ? (
        <PanelState status={status} reason={reason} />
      ) : (
        <>
          {relayDisabled ? (
            <p className="exec-admin-capability exec-role-body" role="status">
              The Portal&apos;s command relay is <b>disabled</b> for this catalogue
              {catalogue?.capabilityReason ? ` (${catalogue.capabilityReason})` : null}. The flow
              below is a declared demo of WF 1i — every published action is listed further down so
              you know it exists, and none of them can be run from here.
            </p>
          ) : null}
          {operationRef ? (
            <p className="exec-cli-opref" role="note">
              operation <code>{operationRef}</code> arrived from an operations link — the published
              catalogue offers no operation lookup yet (BR-EX-68) ·{" "}
              <a href={`/execution/operations?operation=${encodeURIComponent(operationRef)}`}>
                open it in the Operations Queue →
              </a>
            </p>
          ) : null}

          <div className="exec-cli-body">
            <div className="exec-cli-catalog">
              <p className="exec-cli-hint">
                every mutation follows PLAN → APPLY (step-up) → VERIFY · pick a command to load it
                into the drawer →
              </p>
              {CLI_GROUPS.map((name, gi) => (
                <section className="exec-cli-group" key={name}>
                  <h2 className="exec-cli-groupname">{name}</h2>
                  {CLI_ACTIONS.filter((a) => a.group === gi).map((a) => (
                    <CliActionRow
                      key={a.id}
                      action={a}
                      selected={!selected && a.id === cliSelected}
                      onPick={(id) => {
                        onSelect(null);
                        setCliSelected(id);
                      }}
                    />
                  ))}
                </section>
              ))}

              <details className="exec-cli-published">
                <summary>
                  Full published catalogue — rev {catalogue?.revision ?? "not stated"} ·{" "}
                  {catalogue?.returnedEntries ?? catalogue?.entries.length ?? 0} of{" "}
                  {catalogue?.totalEntries ?? "an unpublished number of"} actions ·{" "}
                  {reachable} reachable
                </summary>
                {onTierChange ? (
                  <div className="exec-admin-tiers" role="group" aria-label="Filter by risk tier">
                    {TIER_FILTERS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="exec-inbox-filter"
                        data-tier-filter={option}
                        aria-pressed={option === tier}
                        onClick={() => onTierChange(option)}
                      >
                        {TIER_FILTER_LABEL[option]}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="exec-admin-catalog">
                  {groups.map((group) => (
                    <section className="exec-admin-group" key={group.code ?? "ungrouped"}>
                      <h3 className="exec-cli-groupname">
                        {group.label} <span className="exec-role-meta">{group.items.length}</span>
                      </h3>
                      {group.items.map((entry) => (
                        <EntryRow
                          key={entry.key}
                          entry={entry}
                          selected={entry.key === selected?.key}
                          onSelect={(e) => {
                            setCliSelected(null);
                            onSelect(e);
                          }}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </details>
            </div>

            {selected ? (
              <div className="exec-cli-drawer">
                <div className="exec-cli-drawhead">
                  <h1>
                    {selected.command} {selected.action}
                  </h1>
                </div>
                <div aria-label="Command detail" className="exec-admin-drawer exec-cli-drawbody">
                  <EntryDetail entry={selected} plan={plan} />
                  {children}
                </div>
              </div>
            ) : cliAction ? (
              <CliDrawer
                action={cliAction}
                role={role}
                outcome={outcome}
                onReset={() => setCliSelected(initialCommand)}
                publishedEntry={cliAction.catalogKey ? publishedByKey.get(cliAction.catalogKey) ?? null : null}
              />
            ) : (
              <div className="exec-cli-drawer">
                <div aria-label="Command detail" className="exec-cli-drawbody">
                  <p className="exec-admin-empty exec-role-body">
                    Pick an action to see its risk tier and steps.
                  </p>
                  {children}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ExecutionSurface>
  );
}
