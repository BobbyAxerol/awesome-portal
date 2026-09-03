import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { RunsRepository } from "../repos/runs";
import { CONTROL_API_CONFIG } from "../tokens";
import { buildPortalUpstreamUrl } from "./proxy.service";

/**
 * P4-I / F17 — the missing run-lifecycle join.
 *
 * The run read model was written exactly once, at creation (QUEUED), and
 * nothing ever ingested completion, the frozen artifact or the methodology
 * claims — so governance eligibility read a stale QUEUED row forever and the
 * create→R1→R2→exit chain could never open on real data. This service
 * re-reads the research service through the same validated upstream origin
 * the facade proxy uses and refreshes the read model with what research
 * actually published. It never invents facts: a failed or partial upstream
 * read leaves the read model untouched and the caller's typed refusal path
 * unchanged (fail-closed exactly as before).
 *
 * The artifact pin: research publishes the frozen `selected_params` object
 * (its producer artifact) but no digest endpoint, so the pin is
 * `sha256(canonical_json(selected_params))` computed over the payload this
 * service received through the authenticated path — the SERVER_PINNED
 * semantics the evidence record already declares. `canonicalJson` sorts
 * object keys recursively so the digest is stable across serializations.
 */
@Injectable()
export class ResearchRunSyncService {
  private readonly logger = new Logger(ResearchRunSyncService.name);

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(RunsRepository) private readonly runs: RunsRepository,
    /** Injectable for tests; defaults to global fetch. */
    @Optional() private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  enabled(): boolean {
    return this.config.FEATURE_PROXY_PORTAL === "true";
  }

  /**
   * Best-effort refresh of one run's read model from the research service.
   * Returns true when the read model was updated with a terminal, artifact-
   * bearing state. All failures are logged and swallowed — the caller's
   * eligibility check remains the single authority and stays fail-closed.
   */
  async refresh(user: PortalUser, workspaceId: string, runId: string): Promise<boolean> {
    if (!this.enabled()) return false;
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(runId)) return false;
    try {
      const existing = await this.runs.findByRunId(runId);
      if (!existing || existing.workspaceId !== workspaceId) return false;
      if (
        ["COMPLETED", "SUCCEEDED", "COMPLETE"].includes(existing.status) &&
        existing.artifactSha256 !== null &&
        existing.methodologyClaimIds.length > 0
      ) {
        return false;
      }
      const detail = await this.readJson(`/api/runs/${runId}`, user);
      const status = detail && typeof detail.status === "string" ? detail.status : null;
      if (!detail || !status || !["COMPLETED", "SUCCEEDED", "COMPLETE"].includes(status)) return false;
      const summary = await this.readJson(`/api/runs/${runId}/summary`, user);
      const selected = summary?.selected_params;
      if (!selected || typeof selected !== "object" || Array.isArray(selected)) return false;
      const params = selected as Record<string, unknown>;
      const claims = [params.causality_claim, params.validation_claim]
        .filter((claim): claim is string => typeof claim === "string" && claim.length > 0);
      if (claims.length === 0) return false;
      const artifactSchemaVersion =
        typeof params.artifact_schema_version === "string" ? params.artifact_schema_version
          : typeof detail.artifact_schema_version === "string" ? detail.artifact_schema_version : null;
      await this.runs.upsert({
        runId,
        workspaceId,
        ownerUserId: existing.ownerUserId,
        status,
        protocol: typeof detail.protocol === "string" ? detail.protocol : existing.protocol,
        strategyId: typeof detail.strategy_id === "string" ? detail.strategy_id : existing.strategyId,
        datasetId: typeof detail.dataset_id === "string" ? detail.dataset_id : existing.datasetId,
        sourceCursor: existing.sourceCursor,
        artifactSha256: `sha256:${createHash("sha256").update(canonicalJson(params), "utf8").digest("hex")}`,
        artifactSchemaVersion,
        // Research publishes no separate artifact author; the run owner who
        // commanded the run through the authenticated write path is the
        // creator of record.
        artifactCreatorUserId: existing.artifactCreatorUserId ?? existing.ownerUserId,
        methodologyClaimIds: [...new Set(claims)],
      });
      this.logger.log(JSON.stringify({
        event: "research_run_read_model_refreshed",
        run_id: runId,
        status,
        claims,
      }));
      return true;
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: "research_run_refresh_failed",
        run_id: runId,
        error_type: error instanceof Error ? error.name : typeof error,
      }));
      return false;
    }
  }

  private async readJson(path: string, user: PortalUser): Promise<Record<string, unknown> | null> {
    const url = buildPortalUpstreamUrl(this.config.PORTAL_API_BASE_URL, path, undefined);
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-portal-user-id": user.userId,
        "x-portal-username": user.username,
      },
      redirect: "manual",
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown> : null;
  }
}

/** Deterministic JSON: object keys sorted recursively, arrays in order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
