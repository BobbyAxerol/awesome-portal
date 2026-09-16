import { z } from "zod";

export const AUTH_MODES = [
  "dev",
  "cloudflare_access",
  "cloudflare_access_local_password",
] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const ROLES = ["ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CONTEXT_STATES = [
  "ACCESS_REQUIRED",
  "APP_LOGIN_REQUIRED",
  "PASSWORD_CHANGE_REQUIRED",
  /*
   * A4-1 · the activation dead end, said out loud.
   *
   * A `must_change_password` account can only log in with an activation
   * credential (`verifyCredential` accepts nothing else for it). When every
   * activation it has is expired, revoked, or already consumed by a session
   * that has since ended, the account cannot authenticate at all — and the
   * only thing it was ever told was "Invalid username or credentials.", which
   * is false: the credential is not wrong, it is gone.
   *
   * This state is reported ONLY after Cloudflare Access has verified the
   * caller's identity AND that identity is bound to this very Portal user. An
   * unbound or unknown identity stays on the generic APP_LOGIN_REQUIRED, so
   * the state cannot be used to probe whether a username exists or whether an
   * account is stuck. It names no token, no password, no other account and no
   * binding — only the caller's own dead end, to the caller.
   */
  "ACTIVATION_RECOVERY_REQUIRED",
  "AUTHENTICATED",
  "ACCOUNT_DISABLED",
  "IDENTITY_BINDING_CONFLICT",
] as const;
export type ContextState = (typeof CONTEXT_STATES)[number];

export interface PortalUser {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  /**
   * A4-2 · what an owner lifecycle operation pins itself to.
   *
   * Bumped only by an account-lifecycle write. A failed login, a session
   * version bump and a last-seen touch all change the row and deliberately do
   * NOT change this, or the owner's screen would go stale every time somebody
   * mistyped a password.
   */
  accountRevision: number;
  /**
   * A4-2 · archived access, which is what "delete" means in this product.
   *
   * Archived is DISABLED plus this timestamp, never a deleted row: §20.2
   * rule 6 keeps the account, its audit and its evidence lineage.
   */
  archivedAt: Date | null;
}

/** The account state the product speaks in, derived rather than stored. */
export type AccountState = "INVITED" | "ACTIVE" | "DISABLED" | "ARCHIVED";

export function accountStateOf(user: {
  status: UserStatus;
  archivedAt: Date | null;
}): AccountState {
  return user.archivedAt !== null ? "ARCHIVED" : user.status;
}

export interface ExternalIdentityBinding {
  bindingId: string;
  userId: string;
  provider: "cloudflare_access";
  issuer: string;
  subject: string;
  normalizedEmail: string;
  emailVerified: boolean;
  boundAt: Date;
  lastSeenAt: Date | null;
}

export interface VerifiedAccessIdentity {
  sub: string;
  email: string;
  normalizedEmail: string;
  iss: string;
  aud: string;
  authenticationTime: Date;
  tokenExpiresAt: Date;
}

export interface PortalPrincipal {
  principalId: string;
  username: string;
  accessSubject: string | null;
  accessEmail: string | null;
  role: Role;
  authnMethods: string[];
  sessionId: string;
  mustChangePassword: boolean;
  issuedAt: string;
  policyVersion: "auth-policy-v1";
  exp: number;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  state: "ACTIVE" | "REVOKED" | "EXPIRED";
  sessionVersion: number;
  /** Immutable Portal-session creation time; never replaced by delegated-token iat. */
  authenticationTime: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export const GENERIC_LOGIN_ERROR = "Invalid username or credentials.";

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
