/**
 * F1 (S09): kept under its original name. The implementation is `useRunStatus`
 * (W1 §1.2); `RunVisibility` is the original narrow shape (`listed.status`
 * only), which `RunStatusRead` is assignable to.
 */

import { useRunStatus } from "./useRunStatus";

export type RunVisibility =
  | { state: "idle" }
  | { state: "reading" }
  /** The workspace lists this run; `status` is the library row's own status word. */
  | { state: "listed"; status: string | null }
  | { state: "not-listed" }
  | { state: "unread" };

export const useRunVisibility: (runId: string, enabled: boolean, workspaceId?: string) => RunVisibility = useRunStatus;
