import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { BarMetadataSchema, ResearchDatasetCatalogV2Schema } from "./dataset-index.contract";
import { ResearchPreflightError } from "./preflight.error";

/** Existing signed deployment-bound adapter. URLs are never browser input. */
@Injectable()
export class ResearchDatasetIndexClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}
  catalog(user: PortalUser) {
    return this.read(user, "/internal/research/datasets-v2", {}, ResearchDatasetCatalogV2Schema);
  }
  async metadata(user: PortalUser, query: Record<string, string | number>) {
    const result = await this.read(user, "/internal/research/dataset-bar-metadata", query, BarMetadataSchema);
    for (const field of ["dataset_id", "symbol", "timeframe", "start_utc_ms", "end_exclusive_utc_ms"] as const) {
      if (result[field] !== query[field]) throw this.error(502);
    }
    if (result.warmup_bars_required !== query.warmup_bars) throw this.error(502);
    return result;
  }
  private async read<T>(user: PortalUser, path: string, query: Record<string, string | number>, schema: z.ZodType<T>): Promise<T> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) throw this.error(503);
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({ principalId: user.userId,
      username: user.username, accessSubject: null, accessEmail: null, role: user.role,
      authnMethods: ["portal_session", "research_preflight"], sessionId: "research-dataset-index",
      mustChangePassword: user.mustChangePassword, issuedAt: new Date().toISOString() });
    const url = new URL(path, this.config.PORTAL_API_BASE_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: "GET", headers: { accept: "application/json", "x-portal-principal": principal },
        signal: controller.signal, redirect: "manual" });
      if (!response.ok) {
        await response.body?.cancel();
        throw this.error(response.status === 400 || response.status === 422 ? 400 : response.status === 401 || response.status === 403 || response.status === 503 ? 503 : 502);
      }
      const reader = response.body?.getReader();
      if (!reader) throw this.error(502);
      const chunks: Buffer[] = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1_048_576) { await reader.cancel(); throw this.error(502); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      let decoded: unknown;
      try { decoded = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw this.error(502); }
      const parsed = schema.safeParse(decoded);
      if (!parsed.success) throw this.error(502);
      return parsed.data;
    } catch (error) {
      if (error instanceof ResearchPreflightError) throw error;
      throw this.error(503);
    } finally { clearTimeout(timeout); }
  }
  private error(status: 400 | 502 | 503) {
    return new ResearchPreflightError(status === 400 ? "RESEARCH_PREFLIGHT_INVALID" : status === 502 ? "RESEARCH_PREFLIGHT_REJECTED" : "RESEARCH_PREFLIGHT_UNAVAILABLE",
      "Historical metadata request refused.", status);
  }
}
