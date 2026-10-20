/**
 * New request as a drawer over the approvals queue (hi-fi hl-new-approval-drawer; D8c, D13f).
 *
 * Opened by `?compose=request` on the cockpit. The URL only OPENS the drawer: it fills the form from
 * `?alpha=&run=&claim=` once and stops. Nothing is sent until the reader clicks Submit.
 *
 * Mount contract. Keep it mounted and drive it with `open`; do not mount it only while `compose=request`.
 * The draft lives in this component's state, so Back (which closes the drawer by removing the URL key)
 * does not lose what was typed, and the Run Library is read once, on first open:
 *
 *   <RequestDrawer api={api} open={url.value.compose === "request"} onClose={() => url.set({ compose: null }, { replace: true })} />
 *
 * Draft: held in memory while the component lives. Close, Esc and the scrim ask before discarding a
 * non-empty draft ("Keep editing" is the default, and a second Esc means the same). A request that is
 * already recorded has nothing to lose, so closing resets the form.
 *
 * Focus and layout come from the shared `Drawer`: a modal dialog with a Tab trap and a scrim when it overlays
 * (viewport 1500px and narrower, which includes 390px phones), a docked non-modal panel beside the queue
 * when there is room; focus returns to the opener on close.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { Drawer, useDockMode } from "../../Drawer";
import { NewRequestForm } from "./NewRequestForm";
import { DISCARD_WARNING } from "./OutcomePanel";
import { WhatNextDisclosure, WorkspaceNote } from "./parts";
import { readPrefill, type PrefillRead } from "./model";
import { useNewRequest } from "./useNewRequest";

import "../../css/request.css";

export const DRAWER_ACCESS_HREF = "/administration/profile-access";

export interface RequestDrawerProps {
  api: ExecutionApi;
  open: boolean;
  /** Called after the reader confirmed; remove `compose` from the URL here (replace, so Back does not reopen it). */
  onClose(): void;
  writeBlockedReason?: string | null;
  accessHref?: string;
  /** Overrides the URL read (a lab or a test). */
  prefill?: PrefillRead;
}

export function RequestDrawer({ api, open, onClose, writeBlockedReason, accessHref = DRAWER_ACCESS_HREF, prefill }: RequestDrawerProps) {
  const [params] = useSearchParams();
  const [everOpened, setEverOpened] = useState(open);
  const [confirming, setConfirming] = useState(false);
  // The discard question is not modal, so Submit would stay clickable behind it: hold it while the question is on screen.
  const state = useNewRequest({ api, writeBlockedReason, runsEnabled: everOpened, holdReason: confirming ? "Answer the question above first: keep editing, or discard." : null });
  const mode = useDockMode();
  const keep = useRef<HTMLButtonElement>(null);
  const seed = state.seed;

  useEffect(() => {
    if (!open) return;
    setEverOpened(true);
    const read = prefill ?? readPrefill(params);
    seed(read.prefill, read.notices);
    // Read the link when the drawer opens, not on every later URL change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);
  // Whatever closed the drawer, a pending question does not wait for the next opening.
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  const requestClose = () => {
    if (confirming) {
      // A second Esc, or the Close button pressed while asked, means "keep editing".
      setConfirming(false);
      return;
    }
    if (state.settled) {
      state.reset();
      onClose();
      return;
    }
    // While a request is in flight the draft stays in memory and the answer is waiting on reopen; there is nothing to ask.
    if ((state.dirty || state.uncertain) && !state.submitting) {
      setConfirming(true);
      return;
    }
    onClose();
  };

  const discard = () => {
    setConfirming(false);
    state.reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={requestClose}
      title="New approval request"
      mode={mode}
      priority={
        confirming ? (
          <div className="exec-rq-confirm" role="alertdialog" aria-labelledby="exec-rq-confirm-t" aria-describedby="exec-rq-confirm-d">
            <p id="exec-rq-confirm-t" className="exec-rq-confirm-title">Discard this request?</p>
            <p id="exec-rq-confirm-d" className="exec-rq-meta">
              {state.uncertain
                ? `${DISCARD_WARNING} Discarding forgets its request key.`
                : "Nothing has been created from what you typed. Closing now loses it."}
            </p>
            <div className="exec-rq-acts">
              <button ref={keep} type="button" className="exec-rq-btn" data-variant="primary" onClick={() => setConfirming(false)}>Keep editing</button>
              <button type="button" className="exec-rq-btn" onClick={discard}>Discard and close</button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="exec-rq-drawer" data-screen="new-request-drawer-v2">
        <WorkspaceNote />
        <NewRequestForm state={state} variant="drawer" accessHref={accessHref} />
        <WhatNextDisclosure />
      </div>
    </Drawer>
  );
}
