import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchEngineAtlasPrivateSchema, type ResearchEngineAtlasPrivate } from "./foundation.contract";
import { ResearchFoundationError } from "./foundation.error";

// CG-P04-06/07 engine facts roughly doubled the document; keep the same bound
// as the P08 private client rather than silently truncating a larger Atlas.
const MAX_PRIVATE_RESPONSE_BYTES = 256 * 1024;

/**
 * The one P09 server-side adapter call.  It is intentionally a read-only,
 * fixed-origin GET: no browser gets this URL, the HMAC principal, a Python
 * import, an engine handle, or a way to dispatch a QuantBT route.
 */
@Injectable()
export class ResearchFoundationAtlasClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async read(user: PortalUser): Promise<ResearchEngineAtlasPrivate> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) {
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_UNAVAILABLE",
        "Research Engine Atlas is not configured.",
        503,
      );
    }
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({
      principalId: user.userId,
      username: user.username,
      accessSubject: null,
      accessEmail: null,
      role: user.role,
      authnMethods: ["portal_session", "research_foundation"],
      sessionId: "research-foundation",
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    const url = new URL("/internal/research/engine-atlas", this.config.PORTAL_API_BASE_URL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_FOUNDATION_ATLAS_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json", "x-portal-principal": principal },
        redirect: "manual",
        signal: controller.signal,
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > MAX_PRIVATE_RESPONSE_BYTES) {
        throw new ResearchFoundationError(
          "RESEARCH_FOUNDATION_REJECTED",
          "Research Engine Atlas returned an oversized contract document.",
          502,
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(body.toString("utf8"));
      } catch {
        throw new ResearchFoundationError(
          "RESEARCH_FOUNDATION_REJECTED",
          "Research Engine Atlas returned an invalid contract document.",
          502,
        );
      }
      if (!response.ok) {
        throw new ResearchFoundationError(
          response.status === 401 || response.status === 403
            ? "RESEARCH_FOUNDATION_UNAVAILABLE"
            : "RESEARCH_FOUNDATION_REJECTED",
          response.status === 401 || response.status === 403
            ? "Research Engine Atlas service authentication is unavailable."
            : "Research Engine Atlas was rejected by its private adapter.",
          response.status === 401 || response.status === 403 ? 503 : 502,
        );
      }
      const parsed = ResearchEngineAtlasPrivateSchema.safeParse(decoded);
      if (!parsed.success) {
        throw new ResearchFoundationError(
          "RESEARCH_FOUNDATION_REJECTED",
          "Research Engine Atlas returned an incompatible contract document.",
          502,
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ResearchFoundationError) throw error;
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_UNAVAILABLE",
        "Research Engine Atlas is temporarily unavailable.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
