/** Fixed-origin, bounded, read-only preparation. Never a browser transport. */
import { Inject, Injectable } from "@nestjs/common";
import { PrincipalService } from "../auth/principal";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { sha256 } from "../auth/argon";
import { PinnedAuditPreparationSchema, PinnedAuditTargetSchema, pinnedAuditTargetDigest, ResearchFinalAuditError,
  type PinnedAuditTarget } from "./final-audit.contract";
import { z } from "zod";

@Injectable()
export class ResearchFinalAuditClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}
  async prepare(actorUserId: string, pins: z.infer<typeof PinnedAuditPreparationSchema>): Promise<PinnedAuditTarget> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE", "Audit preparation is unavailable.", 503);
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({principalId: actorUserId,
      username: "research-final-audit", accessSubject: null, accessEmail: null, role: "ADMIN",
      authnMethods: ["portal_session", "research_final_audit"], sessionId: "research-final-audit",
      mustChangePassword: false, issuedAt: new Date().toISOString()});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(new URL("/internal/research/final-audit/prepare", this.config.PORTAL_API_BASE_URL), {
        method: "POST", redirect: "manual", signal: controller.signal,
        headers: {"accept": "application/json", "content-type": "application/json", "x-portal-principal": principal},
        body: JSON.stringify(PinnedAuditPreparationSchema.parse(pins)),
      });
      if (response.status === 409) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE", "Original frozen target is unavailable or outside the qualified audit profile.", 409);
      if (!response.ok || !response.body) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE", "Audit preparation is unavailable.", 503);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 128 * 1024) { await reader.cancel(); throw new Error("oversized private target"); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const value = z.object({schema_version: z.literal("research.pinned-audit-preparation.v1"),
        target_digest: z.string(), target: PinnedAuditTargetSchema}).strict().parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const target = value.target;
      if (Buffer.byteLength(target.source_config_raw, "utf8") > 65_536
        || Buffer.byteLength(target.source_selection_raw, "utf8") > 16_384
        || pinnedAuditTargetDigest(target) !== value.target_digest
        || Object.entries(pins).some(([key,value]) => target[key as keyof PinnedAuditTarget] !== value)
        || sha256(target.source_config_raw) !== target.source_config_digest
        || sha256(target.source_selection_raw) !== target.source_selection_digest) throw new Error("private target pin mismatch");
      return target;
    } catch (error) {
      if (error instanceof ResearchFinalAuditError) throw error;
      if (controller.signal.aborted || error instanceof TypeError)
        throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE", "Private audit preparation is temporarily unavailable.", 503);
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UPSTREAM_REJECTED", "Audit preparation returned an incompatible document.", 502);
    } finally { clearTimeout(timeout); }
  }
}
