/**
 * A4-3/A4-4 · the owner's Governance policy client.
 *
 * Same four proofs as the account control plane — CSRF header, idempotency
 * key, the revision the screen was looking at, and a step-up for every change
 * — because changing who may decide a Governance gate is exactly as
 * consequential as changing who may sign in.
 *
 * The capability namespace is finite and lives on the server. This module
 * carries the list only so the UI can draw a matrix; nothing here decides
 * anything, and a capability the server does not recognise is refused there.
 */
import { AuthRequestError, CSRF_HEADER, csrfTokenFromCookie } from "../../auth/authApi";
import { newIdempotencyKey } from "./accountApi";

export const GOVERNANCE_GATES = [
  { id: "r1", label: "Gate R1" },
  { id: "r2", label: "Gate R2" },
  { id: "canary", label: "Canary" },
  { id: "live", label: "Live" },
] as const;

export type GovernanceGateId = (typeof GOVERNANCE_GATES)[number]["id"];
export type GovernanceMode = "read" | "decide";

export interface GrantedCapability {
  capability: string;
  grantId: string;
  workspaceId: string | null;
  grantRevision: number;
}

export interface PolicyAccount {
  userId: string;
  username: string;
  displayName: string;
  isOwner: boolean;
  accountState: string;
  capabilities: GrantedCapability[];
}

export interface ActivityEntry {
  eventId: string;
  action: "GRANT" | "REVOKE";
  capability: string;
  outcome: "APPLIED" | "REPLAYED" | "CONFLICT" | "DENIED";
  reasonCode: string | null;
  stepUpUsed: boolean;
  occurredAt: string;
}

const BASE = "/api/admin/profile-access";

export function capabilityOf(gate: GovernanceGateId, mode: GovernanceMode): string {
  return `governance.${gate}.${mode}`;
}

async function failure(response: Response): Promise<AuthRequestError> {
  let body: { error?: { code?: string; message?: string; request_id?: string } } | undefined;
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* a proxy can answer with a non-JSON body; the status still counts */
  }
  return new AuthRequestError(
    response.status,
    body?.error?.code ?? "ACCESS_REQUEST_FAILED",
    // The server's words: they name the exact refusal — self-grant, owner
    // anchor, already active, not in that workspace — and rewording them here
    // would throw away the only thing that tells the owner what to do next.
    body?.error?.message ?? "The access change could not be completed.",
    body?.error?.request_id ?? response.headers.get("x-request-id"),
  );
}

export const profileAccess = {
  policy: async (): Promise<PolicyAccount[]> => {
    const response = await fetch(BASE, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as Record<string, any>;
    return (Array.isArray(body.accounts) ? body.accounts : []).map(
      (raw: Record<string, any>): PolicyAccount => ({
        userId: String(raw.user_id ?? ""),
        username: String(raw.username ?? ""),
        displayName: String(raw.display_name ?? ""),
        isOwner: raw.is_owner === true,
        accountState: String(raw.account_state ?? "UNKNOWN"),
        capabilities: (Array.isArray(raw.capabilities) ? raw.capabilities : []).map(
          (cap: Record<string, any>): GrantedCapability => ({
            capability: String(cap.capability ?? ""),
            grantId: String(cap.grant_id ?? ""),
            workspaceId: cap.workspace_id ?? null,
            grantRevision: Number(cap.grant_revision ?? 0),
          }),
        ),
      }),
    );
  },

  activity: async (granteeUserId: string): Promise<ActivityEntry[]> => {
    const response = await fetch(
      `${BASE}/activity?grantee_user_id=${encodeURIComponent(granteeUserId)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as Record<string, any>;
    return (Array.isArray(body.activity) ? body.activity : []).map(
      (raw: Record<string, any>): ActivityEntry => ({
        eventId: String(raw.event_id ?? ""),
        action: raw.action === "REVOKE" ? "REVOKE" : "GRANT",
        capability: String(raw.capability ?? ""),
        outcome: raw.outcome,
        reasonCode: raw.reason_code ?? null,
        stepUpUsed: raw.step_up_used === true,
        occurredAt: String(raw.occurred_at ?? ""),
      }),
    );
  },

  grant: (granteeUserId: string, capability: string) =>
    send(BASE, "POST", { grantee_user_id: granteeUserId, capability, workspace_id: null }),

  revoke: (grantId: string, expectedRevision: number) =>
    send(`${BASE}/${encodeURIComponent(grantId)}`, "DELETE", {
      expected_revision: expectedRevision,
    }),
};

async function send(path: string, method: "POST" | "DELETE", payload: Record<string, unknown>) {
  const csrf = csrfTokenFromCookie();
  if (!csrf) {
    throw new AuthRequestError(403, "CSRF_MISSING", "The session token is missing. Sign in again.", null);
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER]: csrf,
      "x-portal-idempotency-key": newIdempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as { outcome: string; external_effect: string };
}
