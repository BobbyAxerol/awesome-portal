import { z } from "zod";

export const SCREEN_BFF_UI_STATES = [
  "ready",
  "empty",
  "stale",
  "partial",
  "denied",
  "unavailable",
  "error",
] as const;

export const SCREEN_BFF_AUTHORITIES = [
  "PORTAL_CONTROL",
  "TRADING_SYSTEM",
  "RESEARCH",
  "BROKER",
  "DERIVED",
] as const;

export const SCREEN_BFF_RESOURCE_KINDS = [
  "WORKSPACE",
  "DEPLOYMENT",
  "INCIDENT",
  "APPROVAL",
  "REVIEW",
  "ALPHA",
  "PORTFOLIO",
  "ACCOUNT",
] as const;

export const ScreenBffWorkspaceQuerySchema = z.object({
  workspace_id: z.string().min(3).max(96).optional(),
}).strict();

export const ScreenBffDetailQuerySchema = ScreenBffWorkspaceQuerySchema.extend({
  resource_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/).optional(),
}).strict();

export type ScreenBffUiState = (typeof SCREEN_BFF_UI_STATES)[number];
export type ScreenBffAuthority = (typeof SCREEN_BFF_AUTHORITIES)[number];
export type ScreenBffResourceKind = (typeof SCREEN_BFF_RESOURCE_KINDS)[number];
export type ScreenBffRole = "ADMIN" | "USER";

export interface ScreenBffDefinition {
  screenId: string;
  uiRoute: string;
  resourceKind: ScreenBffResourceKind;
  resourceRequired: boolean;
  requiredRoles: readonly ScreenBffRole[];
  requestIds: readonly string[];
  authorities: readonly ScreenBffAuthority[];
  readCapabilities: readonly string[];
  dataApi: {
    status: "AVAILABLE" | "TYPED_UNAVAILABLE";
    operationId: string;
    method: "GET" | "POST";
    pathTemplate: string;
    responseContract: string;
    unavailableReason: string | null;
    deliveryPhase: string;
  };
}
