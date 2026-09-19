/**
 * Research Loop — query-key scoping (P03 FE/consumer scope).
 *
 * P03's rule is that scope always comes from the existing Portal actor and
 * existing workspace membership. A cache key that omits either of them will
 * happily serve one actor the rows another actor fetched, which is the same
 * defect as a missing server-side check but harder to see, because the network
 * tab stays empty.
 *
 * So every key here begins with `["research", actorId, workspaceId]`. Switching
 * identity therefore changes every Research key at once and the old entries
 * become unreachable — no explicit cache-clear call to forget on one screen.
 *
 * There is no `localStorage` in this module on purpose: P03 states that the
 * browser holds no authority. Actor and workspace are passed in from the
 * existing session, never read back from storage the user can edit.
 */

/** Opaque server-issued identifiers. Never parsed, never compared numerically. */
export type ActorId = string;
export type WorkspaceId = string;

export type ResearchQueryKey = readonly (string | number | null)[];

function root(actor: ActorId, workspace: WorkspaceId): ResearchQueryKey {
  if (!actor || !workspace) {
    // A key built without a scope would collide across identities.
    throw new Error("research query keys require both an actor and a workspace");
  }
  return ["research", actor, workspace] as const;
}

export const researchKeys = {
  /** Everything for one actor in one workspace — the invalidation root. */
  scope: (actor: ActorId, workspace: WorkspaceId): ResearchQueryKey => root(actor, workspace),

  alphaVersions: (actor: ActorId, workspace: WorkspaceId, alphaId: string): ResearchQueryKey =>
    [...root(actor, workspace), "alpha-versions", alphaId] as const,

  /**
   * A draft is CAS-guarded, so its revision belongs in the key: a cached body
   * from revision N must never be reused to answer a request for revision N+1.
   */
  draft: (
    actor: ActorId,
    workspace: WorkspaceId,
    draftId: string,
    revision: number,
  ): ResearchQueryKey => [...root(actor, workspace), "draft", draftId, revision] as const,

  attempt: (actor: ActorId, workspace: WorkspaceId, attemptId: string): ResearchQueryKey =>
    [...root(actor, workspace), "attempt", attemptId] as const,

  study: (actor: ActorId, workspace: WorkspaceId, studyId: string): ResearchQueryKey =>
    [...root(actor, workspace), "study", studyId] as const,

  /**
   * Inspection is actor-local by P03's definition and must never mutate
   * selection or sealed artifacts. Keeping it under the same actor root makes
   * that visible in the key rather than only in a comment.
   */
  inspection: (actor: ActorId, workspace: WorkspaceId, subjectId: string): ResearchQueryKey =>
    [...root(actor, workspace), "inspection", subjectId] as const,
} as const;

/**
 * True when a cached key still belongs to the current identity.
 * A cache sweep on auth switch keeps only keys this returns true for.
 */
export function belongsToScope(
  key: ResearchQueryKey,
  actor: ActorId,
  workspace: WorkspaceId,
): boolean {
  return key[0] === "research" && key[1] === actor && key[2] === workspace;
}
