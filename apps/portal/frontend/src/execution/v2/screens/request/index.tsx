/**
 * New request, the route page (UXM-07 S3 W-REQUEST, flag key `request`).
 *
 * Route: `/governance/approvals/new[?alpha=&run=&claim=]`. The three ids are read ONCE when the page
 * opens (as V1 does) and fill the form; they never submit it. The page makes no write on its own.
 * The one write is `POST /governance/approvals` through the port's `createApprovalRequest`, on an
 * explicit click, with a key per intent (see `useNewRequest`). The server is the validator and the
 * boundary: this page only refuses what the contract could never accept (a summary under 8 or over
 * 2,000 characters, an id that is not an id, hidden or direction-changing characters).
 *
 * Mount contract (the integrator wires it behind the `request` flag key, on a Carbon surface, decision A2):
 * default export, props `{ api, writeBlockedReason?, accessHref? }`, rendered inside the Router.
 *
 * What differs from the hi-fi, and why: the "Fresh · 12:04Z" chip says what the pickers rest on ("Run Library read"), with no clock,
 * because no source publishes an as-of for the run registry; the alpha list comes from completed runs (no fleet read; the scope label
 * is the published `alpha_scope` words, FE-069); the summary minimum is the server's 8, not the hi-fi's 24. The "Route page | Drawer
 * from the queue" switch and "Preview the result states" are drawn (WP-E, owner directive 2026-10-23): the other frame is a link to
 * a new tab (what was typed is not lost), and the preview is a legend of the answers that sends nothing.
 *
 * Scale and degradation (evidence/UXM07/README.md 2b):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | the Run Library list is capped at 50 runs by the read; alphas are the distinct alphas of those runs (tens); one summary of up to 2,000 characters | a list that does not hold the reader's run (limit 50, no filter by alpha, FE-069) | the picker says it lists the latest 50 completed runs and the ids can be typed; the server checks every id | run list filtered by alpha with a cursor, the alpha scope label and a lookup by request key (FE-069) | a picker never decides eligibility; a missing run is typed, not invented | one run-list read on open; no polling; validation is O(summary length) per keystroke |
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { NewRequestForm } from "./NewRequestForm";
import { EnvironmentNote, FrameToggle, FreshChip, NextPanel, ResultPreview, StepBar, SUBTITLE, WorkspaceNote } from "./parts";
import { readPrefill, type PrefillRead } from "./model";
import { useNewRequest } from "./useNewRequest";

import "../../css/request.css";

export const REQUEST_SCREEN_KEY = "request" as const;
export const ACCESS_HREF = "/administration/profile-access";

export interface NewRequestPageProps {
  api: ExecutionApi;
  /**
   * Why the delivery policy does not allow a governance write (`governanceWriteBlocked(policy)`), or null when it does.
   * Left out, the port still refuses before any request is made and the refusal is shown.
   */
  writeBlockedReason?: string | null;
  /** Where "My access" goes when the server says the reader may not create requests. */
  accessHref?: string;
  /** Overrides the URL read (a lab or a test); the page otherwise reads `alpha`, `run` and `claim` once. */
  prefill?: PrefillRead;
}

export default function NewRequestPage({ api, writeBlockedReason, accessHref = ACCESS_HREF, prefill }: NewRequestPageProps) {
  const [params] = useSearchParams();
  const [read] = useState<PrefillRead>(() => prefill ?? readPrefill(params));
  const state = useNewRequest({ api, writeBlockedReason, prefill: read.prefill, prefillNotices: read.notices });

  return (
    <div className="exec-rq-page" data-screen="new-request-v2">
      <header className="exec-rq-mast">
        <div className="exec-rq-mast-text">
          <h1 className="exec-rq-title">New approval request</h1>
          <p className="exec-rq-sub" data-testid="rq-subtitle">{SUBTITLE}</p>
          <EnvironmentNote />
          <WorkspaceNote />
        </div>
        <div className="exec-rq-mast-ctrls">
          <FrameToggle current="page" />
          <FreshChip state={state.runs.status === "ok" ? "read" : state.runs.status === "unavailable" ? "unavailable" : "reading"} />
        </div>
      </header>
      <StepBar />
      <div className="exec-rq-cols">
        <div className="exec-rq-col">
          <NewRequestForm state={state} variant="page" accessHref={accessHref} />
          <ResultPreview />
        </div>
        <NextPanel />
      </div>
    </div>
  );
}

export { RequestDrawer } from "./RequestDrawer";
export type { RequestDrawerProps } from "./RequestDrawer";
export { useNewRequest } from "./useNewRequest";
export type { NewRequest, UseNewRequestOptions } from "./useNewRequest";
