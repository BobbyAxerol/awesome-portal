import { Inject, Injectable, Logger } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { CommandCenterRepository } from "./command-center.repository";
import { composeCommandCenterSnapshot } from "./contracts";

export class CommandCenterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
@Injectable()
export class CommandCenterService {
  private readonly logger = new Logger(CommandCenterService.name);
  constructor(
    @Inject(CommandCenterRepository) private readonly repository: CommandCenterRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async snapshot(actor: PortalUser, workspaceId: string) {
    if (this.config.FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT !== "true") {
      throw new CommandCenterError(
        "COMMAND_CENTER_SNAPSHOT_DISABLED",
        "Command Center snapshot is not enabled.",
        404,
      );
    }
    const readAt = new Date();
    let inputs;
    try {
      inputs = await this.repository.read(workspaceId, actor, readAt);
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: "command_center_snapshot_read_failed",
        error_code: safeErrorCode(error),
        error_type: error instanceof Error ? error.name : typeof error,
        error_message: safeErrorMessage(error),
      }));
      throw new CommandCenterError(
        "COMMAND_CENTER_SNAPSHOT_UNAVAILABLE",
        "Command Center snapshot is unavailable.",
        503,
      );
    }
    const response = composeCommandCenterSnapshot(inputs);
    if (Buffer.byteLength(JSON.stringify(response), "utf8") > this.config.COMMAND_CENTER_MAX_RESPONSE_BYTES) {
      throw new CommandCenterError(
        "COMMAND_CENTER_RESPONSE_BUDGET_EXCEEDED",
        "Command Center snapshot exceeded its response budget.",
        503,
      );
    }
    return response;
  }
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = String((error as { code?: unknown }).code ?? "");
    if (/^[A-Z0-9_]{2,96}$/.test(value) || /^[0-9A-Z]{5}$/.test(value)) return value;
  }
  return "COMMAND_CENTER_REPOSITORY_FAILURE";
}

function safeErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : "non-error failure";
  return /^[A-Za-z0-9_ .:'-]{1,160}$/.test(value) ? value : "details redacted";
}
