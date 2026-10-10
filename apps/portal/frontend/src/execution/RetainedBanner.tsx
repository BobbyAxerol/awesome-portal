/**
 * UDB-03 · the banner copy of a retained review, inside the existing preview banner (no new layout).
 * One line says what the page is; the disclosure gives per-profile coverage with each source clock kept separate and nullable.
 */
import { refreshRetainedReview, type RetainedReview } from "./retainedReview";

const utc = (ms: number | null): string => (ms === null ? "not published" : `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`);

export function RetainedBannerBody({ review }: { review: RetainedReview }) {
  return (
    <>
      <strong>RETAINED REVIEW · STALE · PARTIAL</strong>
      <span>
        Earlier Portal observations · read-only · no live stream
        <button type="button" className="exec-preview-refresh" onClick={refreshRetainedReview} data-retained-refresh>
          Refresh
        </button>
      </span>
      <details className="exec-preview-details">
        <summary>Details</summary>
        <p>
          Values are earlier observations the Portal kept. Nothing here is live, no stream is open and no action is sent. The times below are the
          source&apos;s own clocks; &quot;not published&quot; means the source gave none — it is never replaced by the time the Portal observed it.
        </p>
        <dl className="exec-preview-inspector-list" data-retained-profiles>
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
              read{review.permissions.query ? " and query" : ""} in this profile only{review.permissions.isOwner ? " · workspace owner" : ""}; no manage, download or command
            </dd>
          </div>
          <div>
            <dt>resources</dt>
            <dd><code>{review.managementReason}</code> — management is not inferred from the rows shown</dd>
          </div>
        </dl>
      </details>
    </>
  );
}
