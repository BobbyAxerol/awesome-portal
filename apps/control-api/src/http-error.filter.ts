import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthError } from "./auth/auth.service";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpErrorFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? "unknown";

    if (exception instanceof AuthError) {
      void reply.status(exception.status).send({
        error: { code: exception.code, message: exception.message },
        request_id: requestId,
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
              ? "Phiên đăng nhập không hợp lệ."
              : status === 403
                ? "Không được phép truy cập."
                : "Yêu cầu không hợp lệ.",
        },
        request_id: requestId,
      });
      return;
    }
    this.logger.error(exception);
    void reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Lỗi nội bộ." },
      request_id: requestId,
    });
  }
}
