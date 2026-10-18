import { Inject, Injectable } from "@nestjs/common";
import type { AccessActor } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { requireCurrentTsAuditRead } from "../execution-v2/current-audit-read";
import { CommandError } from "../execution-v2/command.contract";
import { ExecutionOperationsRepository } from "./operations.repository";
import { f0ReadRecord, f0ReadTarget, type F0BlockedOperation } from "./f0-read.contract";

/** Finite retained blocked intent only. No relay, plan admission, reconcile,
 * source call or mixed operation-family fallback is available to this reader.
 */
@Injectable()
export class ExecutionF0ReadService {
  constructor(@Inject(ExecutionOperationsRepository) private readonly repository: ExecutionOperationsRepository,
    @Inject(ExecutionAccessService) private readonly access: ExecutionAccessService) {}

  async read(actor: AccessActor, workspace: string, id: string): Promise<F0BlockedOperation> {
    const context = await this.access.readContext(actor, workspace);
    const candidate = await this.repository.findF0ReadCandidate(workspace, actor.user_id, id);
    if (!candidate) throw new CommandError("COMMAND_RESOURCE_NOT_FOUND", 404);
    const target = f0ReadTarget(candidate, actor, workspace, id);
    requireCurrentTsAuditRead(context, target.resource, target.environment);
    // A visible corrupt row is not an existence oracle after authority ends.
    // Hold only a safe finite body (or a fixed refusal) through the same final
    // fence; never emit validation/driver text or bypass revoke for a503.
    let body: F0BlockedOperation | undefined;
    try { body = f0ReadRecord(candidate); } catch { /* fixed refusal after fence */ }
    // LAST await. Re-evaluate receipt/grant/native-leg expiry with the returned
    // actual Core clock with a conservative host elapsed-time clamp (never a
    // replacement or extension of Core authority), not only a fingerprint. This is
    // a local sequential boundary, NOT a held cross-authority TS transaction.
    const current = await this.access.confirmReadContext(actor, workspace, context);
    requireCurrentTsAuditRead({ ...current, now_ms: Math.max(current.now_ms, Date.now()) },
      target.resource, target.environment);
    if (!body) throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503);
    return body;
  }
}
