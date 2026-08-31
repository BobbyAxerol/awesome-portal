/**
 * WF 1i CLI demo — the reviewed hi-fi drawer machine (adminCli.smoke frames,
 * BR-EX-68). Lab-only: the product screen renders the published N27 operator
 * tasks instead, and receives this whole machine through the `demoCli` prop
 * when the fixtures page (or a unit test) wants the reviewed motion.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
import { RISK_TIER_LABEL, type CatalogEntry } from "../adminCatalog";
import { smokeMotionAllowed } from "../smokeMotion";
import type { CliDemoInjection } from "../screens/AdminActionDrawer";

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

export function CliActionRow({
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


/** The injection the screen understands — rail entries plus the drawer body. */
export function wfCliDemo(role: CliRole, outcome: CliOutcome): CliDemoInjection {
  return {
    groups: CLI_GROUPS,
    actions: CLI_ACTIONS,
    actorLabel: role === "ADMIN" ? "Admin" : role === "VIEWER" ? "Viewer" : "Operator (granted)",
    renderDrawer: ({ action, onReset, publishedEntry }) => (
      <CliDrawer action={action} role={role} outcome={outcome} onReset={onReset} publishedEntry={publishedEntry} />
    ),
  };
}
