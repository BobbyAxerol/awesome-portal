/**
 * A4-1 · `portal.owner-access.v1` — the only authority the UI may consult.
 *
 * Before this module the shell decided what to show from `principal.role ===
 * "ADMIN"`, a value the server hands out for display. §20.2 rule 1 makes
 * ownership a server fact, and rule 3 makes "only the owner manages access" —
 * a product role shared by every administrator is neither. So the question the
 * UI asks changed: not "what role is this person", but "what may this person
 * do", answered by the server that will also enforce it.
 *
 * Three properties matter more than the shape of the response:
 *
 *  1. **It is never guessed.** A failed or unparseable read is `unavailable`,
 *     which is not `denied` and is certainly not owner. Nothing here defaults
 *     to permission.
 *  2. **It is not a boundary.** Hiding a menu is a courtesy; the server refuses
 *     the route regardless. A bookmarked owner URL must still render a typed
 *     refusal rather than a blank screen.
 *  3. **It carries no lineage.** No owner username, no grant history, no role
 *     string to re-evaluate — only the computed effect for the caller.
 */
import { AuthRequestError } from "./authApi";

/** Mirrors the server's `EffectiveAccess.ownerState`. */
export type OwnerState = "OWNER" | "NOT_OWNER" | "OWNER_ANCHOR_UNCLAIMED";

const OWNER_STATES: readonly OwnerState[] = ["OWNER", "NOT_OWNER", "OWNER_ANCHOR_UNCLAIMED"];

export interface OwnerAccess {
  userId: string;
  isOwner: boolean;
  /**
   * `OWNER_ANCHOR_UNCLAIMED` is a different operational fact from
   * `NOT_OWNER`: nobody holds the anchor yet, rather than somebody else does.
   * A Portal that never ran the bootstrap claim otherwise presents as an owner
   * screen that refuses forever with no explanation.
   */
  ownerState: OwnerState;
  capabilities: string[];
}

/**
 * Loading, answered, or unreachable — three states the UI must not collapse.
 *
 * `unavailable` exists because the alternative is rendering "you are not the
 * owner" when the truth is "we could not ask". Under §3.3/§3.4 those are
 * different screens, and only one of them tells the reader to call somebody.
 */
export type OwnerAccessState =
  | { kind: "loading" }
  | { kind: "ready"; access: OwnerAccess }
  | { kind: "unavailable"; requestId: string | null };

interface RawAccess {
  user_id?: unknown;
  is_owner?: unknown;
  owner_state?: unknown;
  capabilities?: unknown;
}

/**
 * Reads the response without ever inventing permission.
 *
 * `is_owner` must be the literal `true`; any other value — absent, a string,
 * a truthy number from a proxy that reshaped the body — is not ownership. An
 * unrecognised `owner_state` falls back to the state implied by `is_owner`
 * rather than being passed through for a `switch` elsewhere to mishandle.
 */
export function readOwnerAccess(raw: RawAccess): OwnerAccess {
  const isOwner = raw.is_owner === true;
  const declared = raw.owner_state;
  const ownerState: OwnerState =
    typeof declared === "string" && OWNER_STATES.includes(declared as OwnerState)
      ? (declared as OwnerState)
      : isOwner
        ? "OWNER"
        : "NOT_OWNER";
  return {
    userId: typeof raw.user_id === "string" ? raw.user_id : "",
    isOwner,
    ownerState,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

export async function fetchOwnerAccess(): Promise<OwnerAccess> {
  const response = await fetch("/api/admin/access/self", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let requestId = response.headers.get("x-request-id");
    try {
      const body = (await response.json()) as {
        error?: { request_id?: string; code?: string; message?: string };
      };
      requestId = body.error?.request_id ?? requestId;
      throw new AuthRequestError(
        response.status,
        body.error?.code ?? "OWNER_ACCESS_UNAVAILABLE",
        body.error?.message ?? "Your Portal access could not be read.",
        requestId,
      );
    } catch (error) {
      if (error instanceof AuthRequestError) throw error;
      // A non-JSON body from a proxy still means the read failed.
      throw new AuthRequestError(
        response.status,
        "OWNER_ACCESS_UNAVAILABLE",
        "Your Portal access could not be read.",
        requestId,
      );
    }
  }
  return readOwnerAccess((await response.json()) as RawAccess);
}
