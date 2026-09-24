/** P11 bounded in-process fan-out for already-persisted progress events. */

import { Injectable } from "@nestjs/common";

import type { ResearchProgressEvent, ResearchProgressSnapshot } from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import type { ProgressRunRead } from "./progress.repository";

export interface ResearchProgressEnvelope {
  event: ResearchProgressEvent;
  /**
   * A source journal can be ahead of its relay by a bounded page.  We only
   * materialise and fan out its snapshot after the event carrying that exact
   * latest sequence has persisted; otherwise a browser would see state N with
   * a missing immutable event N-1.  Consumers retain the previous snapshot or
   * use the normal read/poll floor until this is non-null.
   */
  snapshot: ResearchProgressSnapshot | null;
  /**
   * CG-P11-08 (DQ-13): the run-level read materialised once, right after this
   * event's ingress committed. Each subscriber projects it for its own viewer
   * (`may_cancel` depends on role). Null when that post-commit read failed;
   * the event itself is still delivered and the poll floor recovers the read.
   */
  run?: ProgressRunRead | null;
}

/**
 * PostgreSQL remains the recovery/read authority.  This is only a small live
 * acceleration path after an ingress transaction commits.  It has no event
 * history, per-viewer queue, source poll, or retry loop; reconnect starts from
 * the sequence persisted in PostgreSQL.
 */
@Injectable()
export class ResearchProgressFanout {
  private readonly listeners = new Map<string, Set<(event: ResearchProgressEnvelope) => void>>();
  private readonly maximumViewersPerRun = 20;

  subscribe(runId: string, listener: (event: ResearchProgressEnvelope) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set<(event: ResearchProgressEnvelope) => void>();
    if (listeners.size >= this.maximumViewersPerRun) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_STREAM_BUSY", "Research progress has reached its bounded viewer limit; use snapshot polling.", 503);
    }
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(runId);
    };
  }

  publish(runId: string, envelope: ResearchProgressEnvelope): void {
    for (const listener of [...(this.listeners.get(runId) ?? [])]) {
      try {
        listener(envelope);
      } catch {
        // A downstream connection owns its own close path.  Do not retain a
        // failed callback or let an individual browser affect persisted work.
      }
    }
  }

  diagnostics(runId: string): { active_viewers: number; maximum_viewers: number } {
    return { active_viewers: this.listeners.get(runId)?.size ?? 0, maximum_viewers: this.maximumViewersPerRun };
  }
}
