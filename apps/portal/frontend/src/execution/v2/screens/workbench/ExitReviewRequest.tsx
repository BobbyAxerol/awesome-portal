/**
 * "Request review" in the Paper exit gate (RV-10): ask for the Paper exit review of THIS deployment.
 *
 * One primary path: a button that is either shut with ONE short reason or opens a small form (a summary of 8 to 1000 characters and
 * Send). A recorded request shows its receipt, a link to the review in Approvals (the inbox the reviewers work from), and the
 * review's own status read back from the server. Nothing is optimistic.
 *
 * What it will and will not do:
 * - It is open only when the SERVER offers the action (`review-capture-capabilities`, `PAPER_EXIT_CREATE`) AND the request is bound
 *   to a published parent (`bindExitReview`: workspace, parent R2 approval and version, projection digest, this deployment). The
 *   advisory eligibility (`paper.exit_review_request`) only changes the words of a shut control; it has no way to open one.
 * - The binding comes from the one read that maps a deployment to its R2 parent (`GET /governance/paper-exit/parent`, read by the
 *   exit gate with `useExitParent`): the same `capture_context` the R2 review publishes. While it is read, when it fails, when the
 *   deployment has no R2 or when the context is blocked, the control stays shut with one short reason.
 * - A definite refusal is shown as worded; a request whose outcome is not known (a throw, a 5xx or 408, a 2xx that is not the answer
 *   to this request) says "may have been recorded" and retries under the SAME key with the same text, so nothing is duplicated.
 * - A second click while a request is in flight is ignored (a ref). A late answer for a request the screen has left (another
 *   workspace, deployment, parent, version or digest) is dropped, never shown as this one's.
 * - The receipt is not a decision: the source verdict stays NOT_ASSERTED and nothing is sent to the Trading System.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { isOutcomeUnknownReason } from "../../../api/reviewCapture";
import { reviewRouteFor } from "../../../screens/ApprovalInbox";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import { captureReasonText, stageActionReason, stageWhy } from "../stage/reasons";
import { useStageActionEligibility } from "../stage/StageEligibility";
import {
  checkCapture, exitFingerprint, exitStatusOf, newExitKey, summaryBlock, summaryLength,
  type ExitBind, type ExitReviewBinding, type ExitStatus,
} from "./exitReviewRequest";

import "../../css/exitReview.css";

const LABEL = "Request review";
const ACCESS = "/administration/profile-access";

type Capability =
  | { state: "unknown"; reason: string }
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | { state: "available" }
  | { state: "unavailable"; reasonCode: string | null };

/** The one read of what the server offers in this workspace. Nothing is asked without a workspace. */
function useExitCapability(api: ExecutionApi, workspaceId: string | null): Capability {
  const [state, setState] = useState<{ key: string; capability: Capability } | null>(null);
  const key = workspaceId ?? "";
  useEffect(() => {
    if (workspaceId === null) return undefined;
    let cancelled = false;
    // A port that predates the read (a test double, an older shell) is "not available", not a crash.
    if (typeof api.getReviewCaptureCapabilities !== "function") {
      setState({ key, capability: { state: "failed", reason: "The read is not part of this port." } });
      return undefined;
    }
    void Promise.resolve()
      .then(() => api.getReviewCaptureCapabilities(workspaceId))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setState({ key, capability: { state: "failed", reason: result.reason } });
        const row = result.value.actions.find((action) => action.id === "PAPER_EXIT_CREATE");
        setState({
          key,
          capability: row === undefined ? { state: "unavailable", reasonCode: null } : row.state === "AVAILABLE" ? { state: "available" } : { state: "unavailable", reasonCode: row.reason_code ?? null },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ key, capability: { state: "failed", reason: "The read did not complete." } });
      });
    return () => {
      cancelled = true;
    };
  }, [api, workspaceId, key]);
  if (workspaceId === null) return { state: "unknown", reason: "No workspace is named for this read." };
  // An answer for another workspace than the one now shown is nobody's.
  return state !== null && state.key === key ? state.capability : { state: "loading" };
}

type Outcome =
  | { kind: "recorded"; reviewId: string; replayed: boolean; key: string }
  | { kind: "refused"; reason: string; status: string };

interface Unknown { fingerprint: string; key: string; reason: string }

export interface ExitReviewRequestProps {
  api: ExecutionApi;
  deploymentId: string;
  /** The workspace the route names, or `null` when none is named (the control is then shut with that reason). */
  workspaceId: string | null;
  /** The parent's pins, bound by `bindExitReview` from a published `capture_context`; `null` = no read publishes one. */
  bind: ExitBind;
}

export function ExitReviewRequest({ api, deploymentId, workspaceId, bind }: ExitReviewRequestProps) {
  const [params] = useSearchParams();
  const capability = useExitCapability(api, workspaceId);
  const shutByCapability = capability.state === "unavailable" || capability.state === "failed" || capability.state === "unknown";
  // The advisory words are asked only for a control that is already off.
  const eligibility = useStageActionEligibility(api, workspaceId ?? undefined, shutByCapability || bind.state === "shut");

  const binding: ExitReviewBinding | null = bind.state === "bound" ? bind.binding : null;
  const scope = binding === null ? `${workspaceId ?? ""}|${deploymentId}` : JSON.stringify([binding.workspaceId, binding.parentApprovalId, binding.expectedParentVersion, binding.projectionDigest, binding.deploymentId]);

  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [unknown, setUnknown] = useState<Unknown | null>(null);
  const [status, setStatus] = useState<{ phase: "idle" } | { phase: "loading" } | { phase: "done"; status: ExitStatus } | { phase: "failed"; reason: string }>({ phase: "idle" });
  const inFlight = useRef(false);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const live = useRef(scope);
  const statusFlight = useRef(0);
  const fieldId = useId();
  const hintId = useId();

  // Another request scope owns none of the earlier text, key, receipt or status.
  useEffect(() => {
    live.current = scope;
    intent.current = null;
    statusFlight.current += 1;
    setSummary("");
    setOutcome(null);
    setUnknown(null);
    setStatus({ phase: "idle" });
    setBusy(false);
    inFlight.current = false;
  }, [scope]);

  const readBack = async (reviewId: string, b: ExitReviewBinding) => {
    const mine = ++statusFlight.current;
    setStatus({ phase: "loading" });
    try {
      const result = await api.getGovernanceParent("exit", reviewId, b.workspaceId);
      if (mine !== statusFlight.current) return;
      if (!result.ok) return setStatus({ phase: "failed", reason: result.reason });
      setStatus({ phase: "done", status: exitStatusOf(result.value, { reviewId, workspaceId: b.workspaceId, deploymentId: b.deploymentId }) });
    } catch {
      if (mine === statusFlight.current) setStatus({ phase: "failed", reason: "The read did not complete." });
    }
  };

  const block = summaryBlock(summary);
  const fingerprint = binding === null ? "" : exitFingerprint(binding, summary);

  const submit = async () => {
    if (inFlight.current || binding === null || block !== null) return;
    inFlight.current = true;
    setBusy(true);
    const mineScope = live.current;
    const fp = exitFingerprint(binding, summary);
    if (intent.current === null || intent.current.fingerprint !== fp) intent.current = { fingerprint: fp, key: newExitKey() };
    const key = intent.current.key;
    const left = () => live.current !== mineScope;
    try {
      const result = await api.createPaperExit({
        workspace_id: binding.workspaceId,
        request_key: key,
        summary: summary.trim(),
        r2_approval_id: binding.parentApprovalId,
        expected_r2_version: binding.expectedParentVersion,
        deployment_id: binding.deploymentId,
        expected_projection_digest: binding.projectionDigest,
      });
      if (left()) return;
      if (result.ok) {
        const checked = checkCapture(result.value, binding);
        if (!checked.ok) {
          setUnknown({ fingerprint: fp, key, reason: checked.reason });
        } else {
          setOutcome({ kind: "recorded", reviewId: checked.reviewId, replayed: result.value.replayed, key });
          setUnknown((u) => (u?.key === key ? null : u));
          intent.current = null;
          void readBack(checked.reviewId, binding);
        }
      } else if (isOutcomeUnknownReason(result.reason)) {
        setOutcome(null);
        setUnknown({ fingerprint: fp, key, reason: result.reason });
      } else {
        setOutcome({ kind: "refused", reason: result.reason, status: result.status });
        setUnknown((u) => (u?.key === key ? null : u));
      }
    } catch {
      if (!left()) {
        setOutcome(null);
        setUnknown({ fingerprint: fp, key, reason: "The request ended before the Portal's answer was read." });
      }
    } finally {
      if (!left()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  /* ── shut: one control, one reason ─────────────────────────────────────────── */
  const shut = (() => {
    if (capability.state === "loading") return null;
    const fallbackFor = (): string => {
      if (capability.state === "unknown") return capability.reason;
      if (capability.state === "failed") return `Not available. ${capability.reason}`;
      if (capability.state === "unavailable") return captureReasonText(capability.reasonCode) ?? stageWhy("notEnabled");
      return bind.state === "shut" ? bind.reason : "";
    };
    if (capability.state === "available" && bind.state === "bound") return undefined;
    // The server's own words, when it published them for this action; the control's sentence otherwise. Text only.
    const reason = stageActionReason(eligibility, "paper.exit_review_request", fallbackFor());
    return { reason, code: capability.state === "unavailable" ? capability.reasonCode : bind.state === "shut" ? bind.code : null };
  })();

  if (capability.state === "loading") {
    return <p className="exec-wb-xr-note" role="status" aria-busy="true">Checking whether a review can be requested.</p>;
  }
  if (shut !== undefined && shut !== null) {
    return (
      <div className="exec-wb-xr" data-state="shut" title={shut.code === null ? undefined : `Server reason: ${shut.code}`}>
        <DockAction label={LABEL} reason={shut.reason} accessHref={ACCESS} variant="primary" />
      </div>
    );
  }

  if (outcome?.kind === "recorded" && binding !== null) {
    const href = withContext(reviewRouteFor({ id: outcome.reviewId, gate: "PAPER_EXIT" }), params);
    return (
      <div className="exec-wb-xr" data-state="recorded" role="status">
        <p>
          <Flag kind="applied" label={outcome.replayed ? "Matched an earlier request" : "Requested"} size="sm" />
        </p>
        <p className="exec-wb-xr-note">
          Reviewers will find it in Approvals. This asks for a review; it promotes nothing and sends nothing to the Trading System.
        </p>
        <dl className="exec-wb-xr-prov">
          <div><dt>Review</dt><dd>{outcome.reviewId}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>
              {status.phase === "loading" ? "Reading" : null}
              {status.phase === "failed" ? `Not read: ${status.reason}` : null}
              {status.phase === "done" ? (status.status.kind === "ok" ? status.status.text : `Not shown: ${status.status.reason}`) : null}
              {status.phase === "idle" ? "Not read yet" : null}
            </dd>
          </div>
        </dl>
        <p className="exec-wb-xr-actions">
          <Link className="exec-blk-link" to={href}>Open in Approvals</Link>
          {" · "}
          <button type="button" className="exec-wb-xr-link" disabled={status.phase === "loading"} onClick={() => void readBack(outcome.reviewId, binding)}>Check status</button>
        </p>
      </div>
    );
  }

  return (
    <div className="exec-wb-xr" data-state="open">
      <label className="exec-wb-xr-label" htmlFor={fieldId}>Why this deployment is ready</label>
      <textarea
        id={fieldId}
        className="exec-wb-xr-textarea"
        rows={3}
        value={summary}
        disabled={busy}
        aria-describedby={hintId}
        onChange={(event) => {
          setSummary(event.target.value);
          if (outcome?.kind === "refused") setOutcome(null);
        }}
      />
      <div className="exec-wb-xr-foot">
        <button
          type="button"
          className="exec-dock-btn"
          data-variant="primary"
          disabled={block !== null || busy}
          aria-describedby={hintId}
          aria-busy={busy ? "true" : undefined}
          onClick={() => void submit()}
        >
          {busy ? "Sending" : LABEL}
        </button>
        <span id={hintId} className="exec-wb-xr-hint">{block !== null ? block.text : `${summaryLength(summary)} characters`}</span>
      </div>
      {outcome?.kind === "refused" ? (
        <p className="exec-wb-xr-refusal" role="alert">The server did not record this request ({outcome.status}). {outcome.reason}</p>
      ) : null}
      {unknown === null ? null : (
        <div className="exec-wb-xr-refusal" role="alert" data-outcome="unknown">
          <p>Unknown: it may have been recorded. {unknown.reason}</p>
          {unknown.fingerprint === fingerprint ? (
            <p>Sending again uses the same reference ({unknown.key}), so nothing is duplicated.</p>
          ) : (
            <p>An earlier attempt may have been recorded (reference {unknown.key}). This text is different, so it goes under a new reference and both could exist.</p>
          )}
        </div>
      )}
    </div>
  );
}

