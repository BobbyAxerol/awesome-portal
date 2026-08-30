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
import { ScreenBffError } from "./screen-bff/screen-bff.service";

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
      exception instanceof CommandCenterError ||
      exception instanceof ScreenBffError
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
