import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { BarMetadataSchema, DeclarationMetadataSchema, ResearchDatasetCatalogV2Schema } from "./dataset-index.contract";
import type { ResearchRequestedSpec } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchPreflightError } from "./preflight.error";
import { WindowSuggestionMetadataSchema } from "./run-setup.contract";

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
    const interval = /^([1-9][0-9]*)(min|m|h|d)$/.exec(result.timeframe);
    const units: Record<string, number> = { min: 60_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const step = interval ? Number(interval[1]) * (units[interval[2]] ?? 0) : 0;
    if (!Number.isSafeInteger(step) || step <= 0 || step > 31 * 86_400_000) throw this.error(502);
    const range = result.verified_range;
    const observed = result.dataset_id === "vn-stock-daily";
    const offset = observed ? 7 * 3600000 : 0;
    const edges = [result.start_utc_ms, result.end_exclusive_utc_ms, result.first_bar_utc_ms,
      result.last_bar_utc_ms, result.earliest_start_with_warmup_utc_ms, range?.start_utc_ms, range?.end_exclusive_utc_ms,
      result.warmup_start_utc_ms];
    if (edges.some(value => value != null && (value + offset) % step !== 0)
      || result.bars !== null && result.bars > (result.end_exclusive_utc_ms - result.start_utc_ms) / step
      || result.availability === "NOT_PUBLISHED" && result.bars !== null && (range == null
        || (observed ? result.warmup_start_utc_ms !== null
          || result.warmup_bars_available_before_start! >= result.warmup_bars_required
          : result.start_utc_ms - result.warmup_bars_required * step >= range.start_utc_ms))) throw this.error(502);
    return result;
  }
  async estimate(user: PortalUser, requestedSpec: ResearchRequestedSpec, warmupBars: number) {
    const result = await this.read(user, "/internal/research/dataset-declaration-estimate", {}, DeclarationMetadataSchema,
      { requested_spec: requestedSpec, warmup_bars: warmupBars });
    if (result.requested_spec_digest !== sha256ResearchJson(requestedSpec)) throw this.error(502);
    return result;
  }
  async suggest(user: PortalUser, body: Record<string, unknown>) {
    const result = await this.read(user, "/internal/research/dataset-window-suggestion", {}, WindowSuggestionMetadataSchema, body);
    if (["dataset_id", "symbol", "timeframe"].some(key => result[key as "dataset_id"] !== body[key])
      || result.warmup_bars !== body.warmup_bars || result.patch && result.patch.protocol !== body.protocol
      || result.range_origin !== (body.start_utc_ms === undefined ? "PROFILE_BOUNDED_AUTOMATIC" : "EXPLICIT_UNCHANGED")
      || result.state === "AVAILABLE" && result.catalog_revision !== body.expected_catalog_revision) throw this.error(502);
    if (result.patch) {
      const span = result.patch.protocol === "advanced" ? result.patch.walk_forward
        : {start_utc_ms: result.patch.windows.is.start_utc_ms, end_exclusive_utc_ms: result.patch.windows.holdout.end_exclusive_utc_ms};
      if (body.start_utc_ms !== undefined && (span.start_utc_ms !== body.start_utc_ms || span.end_exclusive_utc_ms !== body.end_exclusive_utc_ms)
        || typeof body.max_span_days === "number" && span.end_exclusive_utc_ms - span.start_utc_ms > body.max_span_days * 86_400_000)
        throw this.error(502);
      if (result.patch.protocol === "advanced" && (result.patch.walk_forward.frequency !== body.frequency
        || result.patch.walk_forward.window_mode !== body.window_mode
        || result.patch.walk_forward.train_window !== (body.train_window ?? null))) throw this.error(502);
    }
    return result;
  }
  private async read<T>(user: PortalUser, path: string, query: Record<string, string | number>, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) throw this.error(503);
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({ principalId: user.userId,
      username: user.username, accessSubject: null, accessEmail: null, role: user.role,
      authnMethods: ["portal_session", "research_preflight"], sessionId: "research-dataset-index",
      mustChangePassword: user.mustChangePassword, issuedAt: new Date().toISOString() });
    const url = new URL(path, this.config.PORTAL_API_BASE_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: { accept: "application/json", "x-portal-principal": principal,
          ...(body === undefined ? {} : {"content-type": "application/json"}) }, body: body === undefined ? undefined : JSON.stringify(body),
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
