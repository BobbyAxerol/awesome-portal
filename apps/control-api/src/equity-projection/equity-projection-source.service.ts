import { Inject, Injectable, Optional } from "@nestjs/common";
import { AccessPolicyError } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import type { ReadScopePrincipal } from "../execution-v2/read-scope";
import { CurrentOperationalReads, OperationalReadError, operationalHttpCall, type PreparedOperationalRead } from "../operations/current-operational-read";
import { FIELD_AUTHORITY_DENY_ALL, qualifyEquityProjection, type EquityFieldAuthority, type EquitySection } from "./equity-projection-source.authority";
import { EQUITY_PROJECTION_SOURCE_SCHEMA, equityBandSection, equityProjectionSourceResponse, equitySeriesSection,
  parseEquityProjectionQuery, type EquityProjectionSourceResponse } from "./equity-projection-source.contract";
import { EQUITY_FIELD_AUTHORITY, EQUITY_PROJECTION_SOURCE_PORT, type EquityPortAnswer, type EquityProjectionSourcePort, type EquitySourceIdentity } from "./equity-projection-source.port";

const DEPLOYMENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
function safe(e: unknown): Error {
  if (e instanceof AccessPolicyError || e instanceof OperationalReadError) return e;
  return new OperationalReadError("OPERATIONAL_READ_UNAVAILABLE");
}
const sameIdentity = (a: EquitySourceIdentity, b: EquitySourceIdentity) =>
  a.workspaceId === b.workspaceId && a.deploymentId === b.deploymentId && a.environment === b.environment;

@Injectable()
export class EquityProjectionSourceReads {
  private readonly flights: CurrentOperationalReads;
  constructor(@Inject(EQUITY_PROJECTION_SOURCE_PORT) private readonly port: EquityProjectionSourcePort,
    @Inject(ExecutionAccessService) access: ExecutionAccessService,
    /** Production binds nothing and gets the deny-all default. Only a test may inject an override; the commissioning slice supplies the real checks. */
    @Optional() @Inject(EQUITY_FIELD_AUTHORITY) fieldAuthority?: EquityFieldAuthority) {
    this.flights = new CurrentOperationalReads(access);
    this.fieldAuthority = fieldAuthority ?? FIELD_AUTHORITY_DENY_ALL;
  }
  private readonly fieldAuthority: EquityFieldAuthority;

  finish<T>(handle: PreparedOperationalRead<T>): Promise<T> { return operationalHttpCall(() => this.flights.finish(handle)); }

  prepare(principal: ReadScopePrincipal, deploymentId: string, rawQuery: Record<string, unknown>): Promise<PreparedOperationalRead<EquityProjectionSourceResponse>> {
    const actor = { user_id: principal.user.userId, session_id: principal.session.sessionId, session_generation: principal.session.sessionVersion };
    return operationalHttpCall(() => this.flights.prepareExact(actor, principal.workspaceId, async () => {
      // Shape first: nothing here depends on, or reveals, a deployment.
      const parsed = parseEquityProjectionQuery(rawQuery);
      if (!parsed.ok) throw new OperationalReadError(parsed.code, 400);
      const query = parsed.value;
      if (!DEPLOYMENT_ID.test(deploymentId)) throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
      // The explicit workspace must be the one this principal is reading in.
      if (query.workspace_id !== principal.workspaceId) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      const identity: EquitySourceIdentity = { workspaceId: principal.workspaceId, deploymentId, environment: query.environment };
      return {
        target: { resource: { kind: "DEPLOYMENT" as const, id: deploymentId }, environment: query.environment },
        authorize: (context) => qualifyEquityProjection(context, identity.workspaceId, deploymentId, query.environment),
        decode: async (context) => {
          const now = Math.max(context.now_ms, Date.now());
          const request = { ...identity, window: query.window, intent: query.intent, limit: query.limit, cursor: query.cursor, nowMs: now };
          // Series and band are read and judged independently. A port failure is that section's typed absence; a port that answers for another
          // identity, or with a malformed section, is refused outright (never a partially trusted body).
          const section = async <S extends { availability: string }>(which: EquitySection, read: () => Promise<EquityPortAnswer<S>>, check: (value: unknown) => S | null, absent: S): Promise<S> => {
            let answer: EquityPortAnswer<S>;
            try { answer = await read(); } catch { return absent; }
            if (!answer || typeof answer !== "object" || !answer.identity || !sameIdentity(answer.identity, identity)) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
            const value = check(answer.section);
            if (value === null) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
            // FAIL-CLOSED: the audit leaf alone never discloses data. An AVAILABLE section without its own field authority becomes that section's
            // typed absence (nothing from the port is retained or logged).
            if (value.availability === "AVAILABLE" && !this.fieldAuthority.allows(which, context, deploymentId, query.environment))
              return { availability: "ABSENT", reason_code: "NOT_AUTHORIZED" } as unknown as S;
            return value;
          };
          const [series, band] = await Promise.all([
            section("series", () => this.port.series(request), v => { const r = equitySeriesSection.safeParse(v); return r.success ? r.data : null; }, { availability: "ABSENT", reason_code: "SOURCE_NOT_READ" } as const),
            section("band", () => this.port.band(request), v => { const r = equityBandSection.safeParse(v); return r.success ? r.data : null; }, { availability: "ABSENT", reason_code: "SOURCE_NOT_READ" } as const),
          ]);
          const body = equityProjectionSourceResponse.safeParse({ schema_version: EQUITY_PROJECTION_SOURCE_SCHEMA, workspace_id: identity.workspaceId,
            deployment_id: deploymentId, environment: query.environment, observed_at: new Date(now).toISOString(), source_side_effect_requested: false,
            request: { window: query.window, intent: query.intent, limit: query.limit, cursor: query.cursor }, series, band });
          if (!body.success) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
          return body.data;
        },
      };
    }, safe));
  }
  async detail(principal: ReadScopePrincipal, deploymentId: string, rawQuery: Record<string, unknown>): Promise<EquityProjectionSourceResponse> {
    return this.finish(await this.prepare(principal, deploymentId, rawQuery));
  }
}
