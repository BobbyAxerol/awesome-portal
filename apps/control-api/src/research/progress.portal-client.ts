/** P11 private cancellation marker client; browser code never sees this hop. */

import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchProgressError } from "./progress.error";

@Injectable()
export class ResearchProgressPortalClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async requestCancellation(input: {
    user: PortalUser;
    runId: string;
    workerAttemptId: string;
    leaseEpoch: number;
    requestId: string;
  }): Promise<"REQUESTED" | "ALREADY_TERMINAL"> {
    const secret = this.config.INTERNAL_PRINCIPAL_SECRET;
    if (!secret) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research cancellation transport is not configured.", 503);
    }
    const principal = new PrincipalService(secret).sign({
      principalId: input.user.userId,
      username: input.user.username,
      accessSubject: null,
      accessEmail: null,
      role: input.user.role,
      authnMethods: ["portal_session", "research_progress_cancel"],
      sessionId: "research-progress-cancel",
      mustChangePassword: input.user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    const url = new URL(
      `/internal/research/progress/${encodeURIComponent(input.runId)}/cancel`,
      this.config.PORTAL_API_BASE_URL,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PROGRESS_PRIVATE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-portal-principal": principal,
          "x-request-id": input.requestId,
        },
        body: JSON.stringify({ worker_attempt_id: input.workerAttemptId, lease_epoch: input.leaseEpoch }),
        redirect: "manual",
        signal: controller.signal,
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > 8_192) {
        throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research cancellation transport returned an oversized response.", 503);
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research cancellation transport returned an invalid response.", 503);
      }
      if (!response.ok) {
        throw new ResearchProgressError(
          response.status === 401 || response.status === 403 ? "RESEARCH_PROGRESS_UNAVAILABLE" : "RESEARCH_PROGRESS_CANCEL_PENDING",
          response.status === 409 || response.status === 404
            ? "Research cancellation was accepted, but its source marker is pending reconciliation."
            : "Research cancellation transport is temporarily unavailable.",
          response.status === 409 || response.status === 404 ? 409 : 503,
        );
      }
      const status = decoded && typeof decoded === "object" ? (decoded as { status?: unknown }).status : undefined;
      if (status === "REQUESTED" || status === "ALREADY_TERMINAL") return status;
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research cancellation transport returned an incompatible response.", 503);
    } catch (error) {
      if (error instanceof ResearchProgressError) throw error;
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research cancellation transport is temporarily unavailable.", 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
