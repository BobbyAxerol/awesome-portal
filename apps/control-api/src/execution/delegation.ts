import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT, type KeyLike } from "jose";
import type { Role } from "../domain";

const RESOURCE_PATTERN = /^(?:(?:alpha|deployment|account):[A-Za-z0-9._-]{1,128}|execution:command-center|execution:screen:(?:gate-r2|blotter|alpha-360|portfolio-360|account-broker-360|paper-workbench):[A-Za-z0-9._-]{1,128})$/;

export interface ExecutionDelegationConfig {
  issuer: string;
  audience: string;
  keyId: string;
  privateKeyPem: string;
  ttlSeconds: number;
  environment: "paper" | "sandbox" | "live";
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
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sid: principal.sessionId,
      workspace_id: principal.workspaceId,
      roles: [...principal.roles],
      scopes: ["execution.read"],
      resources: [...new Set(principal.resources)].sort(),
      environment: this.config.environment,
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
    !["paper", "sandbox", "live"].includes(config.environment)
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
    principal.resources.some((resource) => !RESOURCE_PATTERN.test(resource)) ||
    principal.authenticationMethods.length === 0 ||
    Number.isNaN(principal.authenticationTime.getTime())
  ) {
    throw new Error("execution read principal is invalid");
  }
}
