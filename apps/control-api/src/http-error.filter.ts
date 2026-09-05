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

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpErrorFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? "unknown";

    if (
      exception instanceof AuthError ||
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
      exception instanceof FinancialChartError
    ) {
      void reply.status(exception.status).send({
        error: { code: exception.code, message: exception.message },
        request_id: requestId,
        ...(exception instanceof GovernanceError && exception.details
          ? { details: exception.details }
          : {}),
        ...(exception instanceof CurrentSourceProxyError && exception.details
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
    this.logger.error(exception);
    void reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal error." },
      request_id: requestId,
    });
  }
}
