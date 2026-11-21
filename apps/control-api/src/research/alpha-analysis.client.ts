import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchAlphaAnalysisResponseSchema, type ResearchAlphaAnalysis } from "./alpha-import.contract";
import { ResearchAlphaImportError } from "./alpha-import.error";

const MAX_ANALYSIS_RESPONSE_BYTES = 128 * 1024;

/**
 * Fixed-origin, private Python AST adapter client.
 *
 * The browser cannot select this URL and cannot receive the internal HMAC
 * credential.  Source custody stays in the Control API: the adapter receives
 * only the bytes being analysed and returns a bounded mirror/fact document.
 */
@Injectable()
export class ResearchAlphaAnalysisClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async analyze(
    user: PortalUser,
    input: { originalFilename: string; sourceText: string; requestId: string },
  ): Promise<ResearchAlphaAnalysis> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE",
        "Research Alpha analysis is not configured; the source was not accepted.",
        503,
      );
    }
    const url = new URL("/internal/research/alpha-analysis", this.config.PORTAL_API_BASE_URL);
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({
      principalId: user.userId,
      username: user.username,
      accessSubject: null,
      accessEmail: null,
      role: user.role,
      authnMethods: ["portal_session", "research_alpha_import"],
      sessionId: "research-alpha-import",
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_ALPHA_IMPORT_ANALYSIS_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-portal-principal": principal,
          "x-request-id": input.requestId,
        },
        body: JSON.stringify({ original_filename: input.originalFilename, source_text: input.sourceText }),
        redirect: "manual",
        signal: controller.signal,
      });
      const payload = Buffer.from(await response.arrayBuffer());
      if (payload.byteLength > MAX_ANALYSIS_RESPONSE_BYTES) {
        throw new ResearchAlphaImportError(
          "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
          "Research Alpha analysis returned an oversized response.",
          502,
        );
      }
      if (!response.ok) {
        throw new ResearchAlphaImportError(
          response.status === 401 || response.status === 403
            ? "RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE"
            : "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
          "Research Alpha analysis was rejected; the source was not accepted.",
          response.status === 401 || response.status === 403 ? 503 : 502,
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(payload.toString("utf8"));
      } catch {
        throw new ResearchAlphaImportError(
          "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
          "Research Alpha analysis returned an invalid contract document.",
          502,
        );
      }
      const parsed = ResearchAlphaAnalysisResponseSchema.safeParse(decoded);
      if (!parsed.success) {
        throw new ResearchAlphaImportError(
          "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
          "Research Alpha analysis returned an incompatible contract document.",
          502,
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ResearchAlphaImportError) throw error;
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE",
        "Research Alpha analysis is temporarily unavailable; retry without changing the source.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
