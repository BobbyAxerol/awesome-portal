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
