import { Inject, Injectable } from "@nestjs/common";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ResearchPreflightPrivateResponseSchema,
  type ResearchPreflightPrivateResponse,
} from "./preflight.contract";
import { ResearchPreflightError } from "./preflight.error";

const MAX_PRIVATE_REQUEST_BYTES = 96 * 1024;
const MAX_PRIVATE_RESPONSE_BYTES = 256 * 1024;

const PRIVATE_CODES = new Set<ResearchPreflightError["code"]>([
  "RESEARCH_PREFLIGHT_INVALID",
  "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
  "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE",
  "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE",
  "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE",
  "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED",
  "RESEARCH_PREFLIGHT_ROUTE_UNKNOWN",
  "RESEARCH_PREFLIGHT_RELEASE_STALE",
  "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED",
  "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID",
  "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED",
  "RESEARCH_PREFLIGHT_RESOURCE_REFUSED",
  "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE",
  "RESEARCH_PREFLIGHT_UNAVAILABLE",
  "RESEARCH_PREFLIGHT_REJECTED",
]);

/**
 * Fixed-origin, private P08 HMD snapshot adapter client.
 *
 * The browser never receives this URL, the HMAC principal, source frame,
 * snapshot path or any Cursor-like source input.  The returned document is
 * metadata-only and strictly bounded before it crosses into Control API.
 */
@Injectable()
export class ResearchPreflightSnapshotClient {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  async create(
    user: PortalUser,
    input: {
      requestedSpec: Record<string, unknown>;
      requestedSpecDigest: string;
      requiredColumns: readonly string[];
      warmupBars: number;
      requiresFunding: boolean;
      /** CG-P08-05: swept dimensions; the private authority applies the ceiling. */
      sweptDimensions?: number;
      requestId: string;
    },
  ): Promise<ResearchPreflightPrivateResponse> {
    if (!this.config.INTERNAL_PRINCIPAL_SECRET) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_UNAVAILABLE",
        "Research preflight is not configured; no snapshot was accepted.",
        503,
      );
    }
    const body = JSON.stringify({
      requested_spec: input.requestedSpec,
      requested_spec_digest: input.requestedSpecDigest,
      required_columns: input.requiredColumns,
      warmup_bars: input.warmupBars,
      requires_funding: input.requiresFunding,
      swept_dimensions: input.sweptDimensions ?? 0,
    });
    if (Buffer.byteLength(body, "utf8") > MAX_PRIVATE_REQUEST_BYTES) {
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_INVALID",
        "Research preflight request exceeds its bounded contract.",
        400,
      );
    }
    const principal = new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({
      principalId: user.userId,
      username: user.username,
      accessSubject: null,
      accessEmail: null,
      role: user.role,
      authnMethods: ["portal_session", "research_preflight"],
      sessionId: "research-preflight",
      mustChangePassword: user.mustChangePassword,
      issuedAt: new Date().toISOString(),
    });
    const url = new URL("/internal/research/preflight-snapshots", this.config.PORTAL_API_BASE_URL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-portal-principal": principal,
          "x-request-id": input.requestId,
        },
        body,
        redirect: "manual",
        signal: controller.signal,
      });
      const payload = Buffer.from(await response.arrayBuffer());
      if (payload.byteLength > MAX_PRIVATE_RESPONSE_BYTES) {
        throw new ResearchPreflightError(
          "RESEARCH_PREFLIGHT_REJECTED",
          "Research preflight returned an oversized response.",
          502,
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(payload.toString("utf8"));
      } catch {
        throw new ResearchPreflightError(
          "RESEARCH_PREFLIGHT_REJECTED",
          "Research preflight returned an invalid contract document.",
          502,
        );
      }
      if (!response.ok) {
        const privateCode = this.privateCode(decoded);
        if (privateCode) {
          const refusal = this.privateRefusal(decoded);
          throw new ResearchPreflightError(
            privateCode,
            refusal.message ?? "Research preflight was refused by its data contract.",
            409,
            refusal.details,
          );
        }
        throw new ResearchPreflightError(
          response.status === 401 || response.status === 403
            ? "RESEARCH_PREFLIGHT_UNAVAILABLE"
            : "RESEARCH_PREFLIGHT_REJECTED",
          response.status === 401 || response.status === 403
            ? "Research preflight service authentication is unavailable."
            : "Research preflight was rejected; no manifest was created.",
          response.status === 401 || response.status === 403 ? 503 : 502,
        );
      }
      const parsed = ResearchPreflightPrivateResponseSchema.safeParse(decoded);
      if (!parsed.success) {
        throw new ResearchPreflightError(
          "RESEARCH_PREFLIGHT_REJECTED",
          "Research preflight returned an incompatible contract document.",
          502,
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ResearchPreflightError) throw error;
      throw new ResearchPreflightError(
        "RESEARCH_PREFLIGHT_UNAVAILABLE",
        "Research preflight is temporarily unavailable; retry without changing the requested spec.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * CG-P08-03: the failed gate, the requested-spec field path and the private
   * authority's own bounded sentence. Anything malformed is dropped, never
   * guessed; the code alone still refuses the request.
   */
  private privateRefusal(value: unknown): {
    message: string | null;
    details: { gate?: string; field_path?: readonly string[] } | undefined;
  } {
    const detail = value && typeof value === "object" ? (value as { detail?: unknown }).detail : undefined;
    if (!detail || typeof detail !== "object") return { message: null, details: undefined };
    const record = detail as { gate?: unknown; field_path?: unknown; message?: unknown };
    const gate = typeof record.gate === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(record.gate) ? record.gate : undefined;
    const path = Array.isArray(record.field_path) && record.field_path.length <= 6 &&
      record.field_path.every((part) => typeof part === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(part))
      ? record.field_path as string[]
      : undefined;
    const message = typeof record.message === "string" && record.message.length > 0 && record.message.length <= 400
      ? record.message
      : null;
    return { message, details: gate || path ? { ...(gate ? { gate } : {}), ...(path ? { field_path: path } : {}) } : undefined };
  }

  private privateCode(value: unknown): ResearchPreflightError["code"] | null {
    if (!value || typeof value !== "object") return null;
    const detail = (value as { detail?: unknown }).detail;
    const code = detail && typeof detail === "object" ? (detail as { code?: unknown }).code : undefined;
    return typeof code === "string" && PRIVATE_CODES.has(code as ResearchPreflightError["code"])
      ? code as ResearchPreflightError["code"]
      : null;
  }
}
