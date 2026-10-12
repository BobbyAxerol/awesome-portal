/**
 * UDB-03 · what a retained review is, said once, in the shell — not as a bar on every screen.
 *
 * The top bar carries a small "Retained" pill on Execution routes; opening it shows this panel: what the data is, each profile's coverage with its
 * source clocks kept separate and nullable, the reader's access, and the explicit Refresh. Per-panel STALE / PARTIAL marks stay on the panels.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { refreshRetainedReview, useRetainedReview, type RetainedReview } from "./retainedReview";

const utc = (ms: number | null): string => (ms === null ? "not published" : `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`);

export function RetainedBannerBody({ review }: { review: RetainedReview }) {
  return (
    <div className="exec-ret-panel">
      <strong className="exec-ret-title">RETAINED REVIEW · STALE · PARTIAL</strong>
      <p className="exec-ret-line">Earlier Portal observations — read-only, no live stream. “Not published” is the source&apos;s own gap, never filled with our observation time.</p>
      <dl className="exec-ret-list" data-retained-profiles>
        {review.profiles.map((profile) => {
          const captured = profile.panels.filter((panel) => panel.state === "PARTIAL").length;
          return (
            <div key={profile.profileId}>
              <dt>{profile.environment}</dt>
              <dd>
                source as of {utc(profile.sourceAsOfMs)} · observed {utc(profile.observedMs)} · {captured} of {profile.panels.length} panels captured
              </dd>
            </div>
          );
        })}
        <div>
          <dt>your access</dt>
          <dd>
            {review.permissions ? <>read{review.permissions.query ? " and query" : ""} in this profile only{review.permissions.isOwner ? " · workspace owner" : ""}; no manage, download or command</>
              : "Context refresh failed · access not revalidated; no action is enabled"}
          </dd>
        </div>
        <div>
          <dt>resources</dt>
          <dd><code>{review.managementReason}</code> — management is not inferred from the rows shown</dd>
        </div>
      </dl>
      <button type="button" className="exec-ret-refresh" onClick={refreshRetainedReview} data-retained-refresh>
        Refresh
      </button>
    </div>
  );
}

const EXECUTION_ROUTE = /^\/(governance|deployments|execution|administration)(\/|$)/;

/** A small pill in the top bar on Execution routes of a retained stack; it opens the panel above. */
export function RetainedPill() {
  const { pathname } = useLocation();
  const retained = useRetainedReview();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (retained.status !== "retained" || !retained.review || !EXECUTION_ROUTE.test(pathname)) return null;
  return (
    <div className="exec-ret" ref={root}>
      <button type="button" className="exec-ret-pill" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} title="Earlier Portal observations · read-only · no live stream">
        <span className="exec-ret-dot" aria-hidden="true" />
        <span className="exec-ret-text">Retained</span>
      </button>
      {open ? <div className="exec-ret-pop" role="dialog" aria-label="Retained review"><RetainedBannerBody review={retained.review} /></div> : null}
    </div>
  );
}
