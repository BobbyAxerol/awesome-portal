import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchDatasetCatalogSchema, type ResearchDatasetCatalog } from "./dataset-catalog.contract";
import { ResearchPreflightError } from "./preflight.error";

const MAX_PRIVATE_RESPONSE_BYTES = 128 * 1024;

/**
 * CG-P08-04 · fixed-origin read of the private P08 dataset catalog.
 *
 * Same boundary as the P08 snapshot client: an HMAC internal principal, a
 * bounded strict document, and no private URL or source detail ever reaching
 * the browser.
 */
@Injectable()
export class ResearchDatasetCatalogClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async read(user: PortalUser): Promise<ResearchDatasetCatalog> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_UNAVAILABLE", "The research dataset catalog is not configured.", 503);
    }
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({
      principalId: user.userId,
      username: user.username,
      accessSubject: null,
      accessEmail: null,
      role: user.role,
      authnMethods: ["portal_session", "research_preflight"],
      sessionId: "research-dataset-catalog",
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    const url = new URL("/internal/research/datasets", this.config.PORTAL_API_BASE_URL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json", "x-portal-principal": principal },
        redirect: "manual",
        signal: controller.signal,
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > MAX_PRIVATE_RESPONSE_BYTES) {
        throw new ResearchPreflightError("RESEARCH_PREFLIGHT_REJECTED", "The research dataset catalog is oversized.", 502);
      }
      if (!response.ok) {
        const auth = response.status === 401 || response.status === 403;
        throw new ResearchPreflightError(
          auth || response.status === 503 ? "RESEARCH_PREFLIGHT_UNAVAILABLE" : "RESEARCH_PREFLIGHT_REJECTED",
          auth ? "Research dataset catalog service authentication is unavailable."
            : response.status === 503 ? "The historical source cannot publish its dataset catalog right now."
              : "The research dataset catalog was rejected by its private adapter.",
          auth || response.status === 503 ? 503 : 502,
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(body.toString("utf8"));
      } catch {
        throw new ResearchPreflightError("RESEARCH_PREFLIGHT_REJECTED", "The research dataset catalog is not a contract document.", 502);
      }
      const parsed = ResearchDatasetCatalogSchema.safeParse(decoded);
      if (!parsed.success) {
        throw new ResearchPreflightError("RESEARCH_PREFLIGHT_REJECTED", "The research dataset catalog is incompatible.", 502);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ResearchPreflightError) throw error;
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_UNAVAILABLE", "The research dataset catalog is temporarily unavailable.", 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
