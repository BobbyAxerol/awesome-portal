import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT, type KeyLike } from "jose";
import type { Role } from "../domain";

const RESOURCE_PATTERN = /^(?:(?:alpha|deployment|account):[A-Za-z0-9._-]{1,128}|execution:(?:command-center|manager-v2:read)|execution:screen:(?:gate-r2|blotter|alpha-360|portfolio-360|account-broker-360|paper-workbench):[A-Za-z0-9._-]{1,128})$/;
export const MANAGER_V2_READ_RESOURCE = "execution:manager-v2:read";
const PROFILE_ID_PATTERN = /^(?:PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$/;
const CURRENT_SOURCE_RESOURCE_PATTERN =
  /^execution:current-source:([A-Z][A-Z0-9_]{2,95}):read$/;

export const CURRENT_SOURCE_SCREEN_IDS = [
  "PAPER_TRADING_SCREEN",
  "SANDBOX_TRADING_SCREEN",
  "LIVE_OPERATIONS_SCREEN",
  "EXECUTION_COMMAND_CENTER_SCREEN",
  "EXECUTION_OPERATIONS_QUEUE_SCREEN",
  "EXECUTION_INCIDENT_DETAIL_SCREEN",
  "EXECUTION_APPROVAL_INBOX_SCREEN",
  "EXECUTION_GATE_R1_REVIEW_SCREEN",
  "EXECUTION_GATE_R2_REVIEW_SCREEN",
  "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
  "EXECUTION_PAPER_WORKBENCH_SCREEN",
  "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
  "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
  "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
  "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
  "EXECUTION_FULL_BLOTTER_SCREEN",
  "EXECUTION_ALPHA_360_SCREEN",
  "EXECUTION_PORTFOLIO_360_SCREEN",
  "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
  "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
] as const;

export type CurrentSourceScreenId = (typeof CURRENT_SOURCE_SCREEN_IDS)[number];

const CURRENT_SOURCE_SCREENS = new Set<string>(CURRENT_SOURCE_SCREEN_IDS);

export function currentSourceResource(screenId: string): string {
  if (!CURRENT_SOURCE_SCREENS.has(screenId)) {
    throw new Error("current-source screen is outside the N13B contract");
  }
  return `execution:current-source:${screenId}:read`;
}

export interface ExecutionDelegationConfig {
  issuer: string;
  audience: string;
  keyId: string;
  privateKeyPem: string;
  ttlSeconds: number;
  environment: "paper" | "sandbox" | "live";
  /** Required only when minting the exact Manager-v2 read resource. */
  profileId?: string;
}

export interface ExecutionReadPrincipal {
  principalId: string;
  sessionId: string;
  workspaceId: string;
  roles: Role[];
  resources: string[];
  authenticationTime: Date;
  authenticationMethods: string[];
}

/**
 * Server-only issuer for short-lived, audience-bound execution read assertions.
 * Assertions are never exposed as browser credentials and cannot carry command
 * scopes in the EX-BE-02 boundary.
 */
export class ExecutionDelegationService {
  private constructor(
    private readonly config: Omit<ExecutionDelegationConfig, "privateKeyPem">,
    private readonly privateKey: KeyLike,
  ) {}

  static async create(config: ExecutionDelegationConfig): Promise<ExecutionDelegationService> {
    validateConfig(config);
    const privateKey = await importPKCS8(config.privateKeyPem, "RS256");
    return new ExecutionDelegationService(config, privateKey);
  }

  static async fromPrivateKeyFile(
    config: Omit<ExecutionDelegationConfig, "privateKeyPem"> & { privateKeyFile: string },
  ): Promise<ExecutionDelegationService> {
    const privateKeyPem = await readFile(config.privateKeyFile, {
      encoding: "utf8",
      flag: "r",
    });
    return ExecutionDelegationService.create({ ...config, privateKeyPem });
  }

  async issueReadAssertion(principal: ExecutionReadPrincipal): Promise<string> {
    validatePrincipal(principal);
    const requestsProfileBoundRead = principal.resources.some(
      (resource) =>
        resource === MANAGER_V2_READ_RESOURCE || CURRENT_SOURCE_RESOURCE_PATTERN.test(resource),
    );
    if (requestsProfileBoundRead && !this.config.profileId) {
      throw new Error("profile-bound read assertions require an exact execution profile");
    }
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sid: principal.sessionId,
      workspace_id: principal.workspaceId,
      roles: [...principal.roles],
      scopes: ["execution.read"],
      resources: [...new Set(principal.resources)].sort(),
      environment: this.config.environment,
      ...(requestsProfileBoundRead ? { profile_id: this.config.profileId } : {}),
      auth_time: Math.floor(principal.authenticationTime.getTime() / 1000),
      amr: [...new Set(principal.authenticationMethods)].sort(),
    })
      .setProtectedHeader({ alg: "RS256", kid: this.config.keyId, typ: "JWT" })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(principal.principalId)
      .setJti(crypto.randomUUID())
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + this.config.ttlSeconds)
      .sign(this.privateKey);
  }
}

function validateConfig(config: ExecutionDelegationConfig): void {
  if (
    config.issuer.trim() === "" ||
    config.audience.trim() === "" ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(config.keyId) ||
    !Number.isInteger(config.ttlSeconds) ||
    config.ttlSeconds < 1 ||
    config.ttlSeconds > 60 ||
    !["paper", "sandbox", "live"].includes(config.environment) ||
    (config.profileId !== undefined &&
      (!PROFILE_ID_PATTERN.test(config.profileId) ||
        !config.profileId.startsWith(`${config.environment.toUpperCase()}_`)))
  ) {
    throw new Error("execution delegation configuration is outside the read-only boundary");
  }
}

function validatePrincipal(principal: ExecutionReadPrincipal): void {
  if (
    principal.principalId.trim() === "" ||
    principal.sessionId.trim() === "" ||
    principal.workspaceId.trim() === "" ||
    principal.roles.length === 0 ||
    principal.resources.length === 0 ||
    principal.resources.length > 32 ||
    principal.resources.some((resource) => !validResource(resource)) ||
    principal.authenticationMethods.length === 0 ||
    Number.isNaN(principal.authenticationTime.getTime())
  ) {
    throw new Error("execution read principal is invalid");
  }
}

function validResource(resource: string): boolean {
  if (RESOURCE_PATTERN.test(resource)) return true;
  const match = CURRENT_SOURCE_RESOURCE_PATTERN.exec(resource);
  return match !== null && CURRENT_SOURCE_SCREENS.has(match[1]);
}
