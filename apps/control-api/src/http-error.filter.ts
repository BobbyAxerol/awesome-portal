import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthError } from "./auth/auth.service";
import { FacadeError } from "./facade/proxy.service";
import { GovernanceError } from "./governance/governance.service";
import { QueryContractError } from "./query";
import { AnalyticsProxyError } from "./execution/analytics.proxy";
import { CommandCenterError } from "./command-center/command-center.service";
import { CurrentSourceProxyError } from "./execution/current-source.proxy";
import { ExecutionRuntimeManifestError } from "./execution/runtime-manifest.controller";
import { ExecutionContractAuthorityHttpError } from "./execution/contract-authority.controller";
import { MaximumDataOperationError } from "./execution/maximum-data-operation.service";
import { MaximumDataContinuationError } from "./execution/maximum-data-continuation.repository";
import { ScreenBffError } from "./screen-bff/screen-bff.service";
import { PaperReadError } from "./paper-read/paper-read.service";
import { ProfileReadError } from "./profile-read/profile-read.controller";
import { ManagerListsError } from "./manager-lists/manager-lists.service";
import { ResourceReadError } from "./resource-read/resource-read.controller";
import { PortalDerivationError } from "./execution/portal-derivations.service";
import { DurableFinancialReadError } from "./execution/durable-financial.repository";
import { FinancialQueryCursorError } from "./execution/financial-query-cursor.repository";
import { FinancialChartError } from "./execution/financial-chart.service";
import { MarketContextError } from "./execution/market-context.service";
import { LocalRealtimeError } from "./execution/profile-realtime.service";
import { ResearchMetadataError } from "./research/contracts";
import { ResearchAlphaImportError } from "./research/alpha-import.error";
import { ResearchPreflightError } from "./research/preflight.error";
import { ResearchDatasetIndexError } from "./research/dataset-index.error";
import { ResearchRunSetupError } from "./research/run-setup.error";
import { ResearchFoundationError } from "./research/foundation.error";
import { ResearchRunCreateError } from "./research/run-create.error";
import { ResearchProgressError } from "./research/progress.error";
import { ResearchRunLibraryError } from "./research/run-library.error";
import { ResearchEvidenceError } from "./research/evidence.error";
import { ResearchSplitError } from "./research/split.error";
import { ResearchSearchError } from "./research/search.error";
import { ResearchFreezeError } from "./research/freeze.error";
import { ResearchWhatIfError } from "./research/whatif.error";
import { ResearchFinalAuditError } from "./research/final-audit.contract";
import { ResearchReplayError } from "./research/replay.error";
import { ResearchCurrentSourceError } from "./research/current-source.error";
import { ResearchReportError } from "./research/report.error";
import { ResearchLineageError } from "./research/lineage.error";
import { ResearchCompareError } from "./research/compare.error";
import { ResearchReleaseCandidateError } from "./research/release-candidate.error";
import {isReadStoreUnavailable} from "./db/read-unavailable";
import { ExecutionReadScopeError } from "./execution-v2/read-scope";
import { CommandHttpError } from "./execution-v2/command.error";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpErrorFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? "unknown";
    if (exception instanceof Error && (exception as Error & {code?:string}).code === "EXECUTION_POOL_BUSY") {
      // Bounded local admission, not a source failure or an opaque 500.
      void reply.header("Retry-After","1").status(503).send({error:{code:"EXECUTION_LOCAL_READ_BUSY",message:"Local retained read capacity is busy."},request_id:requestId});
      return;
    }

    if (
      exception instanceof AuthError ||
      exception instanceof ExecutionReadScopeError ||
      exception instanceof FacadeError ||
      exception instanceof GovernanceError ||
      exception instanceof QueryContractError ||
      exception instanceof AnalyticsProxyError ||
      exception instanceof CurrentSourceProxyError ||
      exception instanceof ExecutionRuntimeManifestError ||
      exception instanceof ExecutionContractAuthorityHttpError ||
      exception instanceof MaximumDataOperationError ||
      exception instanceof MaximumDataContinuationError ||
      exception instanceof CommandCenterError ||
      exception instanceof ScreenBffError ||
      exception instanceof PaperReadError ||
      exception instanceof ProfileReadError ||
      exception instanceof ManagerListsError ||
      exception instanceof ResourceReadError ||
      exception instanceof PortalDerivationError ||
      exception instanceof DurableFinancialReadError ||
      exception instanceof FinancialQueryCursorError ||
      exception instanceof FinancialChartError ||
      exception instanceof MarketContextError ||
      exception instanceof LocalRealtimeError ||
      exception instanceof ResearchMetadataError ||
      exception instanceof ResearchAlphaImportError ||
      exception instanceof ResearchPreflightError
      || exception instanceof ResearchDatasetIndexError
      || exception instanceof ResearchRunSetupError
      || exception instanceof ResearchFoundationError
      || exception instanceof ResearchRunCreateError
      || exception instanceof ResearchProgressError
      || exception instanceof ResearchRunLibraryError
      || exception instanceof ResearchEvidenceError
      || exception instanceof ResearchSplitError
      || exception instanceof ResearchSearchError
      || exception instanceof ResearchFreezeError
      || exception instanceof ResearchWhatIfError
      || exception instanceof ResearchFinalAuditError
      || exception instanceof ResearchReplayError
      || exception instanceof ResearchCurrentSourceError
      || exception instanceof ResearchReportError
      || exception instanceof ResearchLineageError
      || exception instanceof ResearchCompareError
      || exception instanceof ResearchReleaseCandidateError
    ) {
      if (exception instanceof ResearchCurrentSourceError && exception.status === 503) {
        const cause = (exception as Error & { cause?: { code?: unknown } }).cause;
        const sqlstate = typeof cause?.code === "string" && /^[A-Z0-9]{5}$/.test(cause.code) ? cause.code : null;
        // Diagnostics must not log exception text, SQL, rows or private headers.
        this.logger.warn({event: "research_current_source_unavailable", code: exception.code,
          sqlstate, request_id: /^[A-Za-z0-9_-]{1,100}$/.test(requestId) ? requestId : "unknown"});
      }
      void reply.status(exception.status).send({
        error: { code: exception.code, message: exception.message },
        request_id: requestId,
        ...(exception instanceof CommandHttpError?{public_copy_key:exception.publicCopyKey,safe_next_action:exception.safeNextAction}:{}),
        ...(exception instanceof GovernanceError && exception.details
          ? { details: exception.details }
          : {}),
        ...(exception instanceof CurrentSourceProxyError && exception.details
          ? { details: exception.details }
          : {}),
        // RF-05 CG-P13-09: typed retained-lane state on a 409 refusal.
        ...(exception instanceof ResearchCurrentSourceError && exception.details
          ? { details: exception.details }
          : {}),
        // W4 CG-P08-03: the failed gate and requested-spec field path(s).
        ...((exception instanceof ResearchPreflightError || exception instanceof ResearchDatasetIndexError || exception instanceof ResearchRunSetupError) && exception.details
          ? { details: exception.details }
          : {}),
        // OL-09 / P22-B: downstream refusal codes are public typed facts, not raw error text.
        ...(exception instanceof ResearchReleaseCandidateError && exception.details
          ? { details: exception.details }
          : {}),
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status !== 401 && status !== 403 && status !== 404) {
        this.logger.error(exception);
      }
      void reply.status(status).send({
        error: {
          code: status === 401 ? "SESSION_REQUIRED" : "REQUEST_REJECTED",
          message:
            status === 401
              ? "Invalid session."
              : status === 403
                ? "Access denied."
                : "Invalid request.",
        },
        request_id: requestId,
      });
      return;
    }
    if (["GET","HEAD"].includes(request.method) && isReadStoreUnavailable(exception)) {
      // Core authorization has already succeeded, but a local read store
      // disconnected. Refuse without stale fallback, private exception text
      // or an opaque500. This is NOT permission to retry a mutation.
      void reply.header("Cache-Control","private, no-store").header("Retry-After","1").status(503).send({
        error:{code:"PORTAL_READ_STORE_UNAVAILABLE",message:"Portal read store is temporarily unavailable."},request_id:requestId});
      return;
    }
    this.logger.error(exception);
    void reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal error." },
      request_id: requestId,
    });
  }
}
