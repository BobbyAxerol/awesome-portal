/**
 * A10a · fixed-origin private call to the Portal P05 byte observer.
 *
 * Same boundary as the P08 dataset-catalog client: an HMAC internal principal
 * carrying the dedicated `research_artifact_verify` method, a bounded strict
 * document, and no private path or body ever reaching the browser. The
 * observer only hashes; every verdict is made by the caller.
 */

import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { ArtifactByteObservationSchema, type ArtifactByteObservation } from "./artifact-verify.contract";

const MAX_PRIVATE_RESPONSE_BYTES = 256 * 1024;

export class ArtifactObserverUnavailable extends Error {}

@Injectable()
export class ResearchArtifactVerifyClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async observe(
    actorUserId: string,
    artifactId: string,
    partPaths: readonly string[],
  ): Promise<ArtifactByteObservation> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) throw new ArtifactObserverUnavailable("not configured");
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({
      principalId: actorUserId,
      username: "research-artifact-verify",
      accessSubject: null,
      accessEmail: null,
      role: "ADMIN",
      authnMethods: ["portal_session", "research_artifact_verify"],
      sessionId: "research-artifact-verify",
      mustChangePassword: false,
      issuedAt: new Date().toISOString(),
    });
    const url = new URL("/internal/research/artifacts/observe", this.config.PORTAL_API_BASE_URL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "x-portal-principal": principal },
        body: JSON.stringify({ artifact_id: artifactId, part_paths: partPaths }),
        redirect: "manual",
        signal: controller.signal,
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok || body.byteLength > MAX_PRIVATE_RESPONSE_BYTES) {
        throw new ArtifactObserverUnavailable(`observer answered ${response.status}`);
      }
      const parsed = ArtifactByteObservationSchema.safeParse(JSON.parse(body.toString("utf8")));
      if (!parsed.success || parsed.data.artifact_id !== artifactId || parsed.data.parts.length !== partPaths.length) {
        throw new ArtifactObserverUnavailable("observer document is incompatible");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ArtifactObserverUnavailable) throw error;
      throw new ArtifactObserverUnavailable("observer unreachable");
    } finally {
      clearTimeout(timeout);
    }
  }
}
