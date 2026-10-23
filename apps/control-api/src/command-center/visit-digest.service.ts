import { Inject, Injectable } from "@nestjs/common";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ReadScopePrincipal } from "../execution-v2/read-scope";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { CommandCenterRepository } from "./command-center.repository";
import { CommandCenterError } from "./command-center.service";
import { composeVisitDigest, digestSnapshot, makeBaseline } from "./visit-digest";
import { VisitDigestStore } from "./visit-digest.store";
import { retainedReview } from "../execution/retained-read-profile";

@Injectable()
export class VisitDigestService {
  constructor(@Inject(CommandCenterRepository) private readonly repository: CommandCenterRepository,
    @Inject(VisitDigestStore) private readonly store: VisitDigestStore,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}
  private enabled() {
    if (this.config.FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT !== "true")
      throw new CommandCenterError("COMMAND_CENTER_SNAPSHOT_DISABLED", "Command Center snapshot is not enabled.", 404);
  }
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (error) {
      if (error instanceof CommandCenterError || error instanceof ExecutionReadScopeError) throw error;
      throw new CommandCenterError("VISIT_DIGEST_UNAVAILABLE", "The visit digest is temporarily unavailable.", 503);
    }
  }
  async read(principal: ReadScopePrincipal) {
    this.enabled();
    return this.call(() => this.repository.readAuthorized(principal, new Date(), async input => {
      const baseline = await this.store.read(principal.user.userId, principal.workspaceId);
      return composeVisitDigest(digestSnapshot(input), baseline, !retainedReview(this.config));
    }));
  }
  async seen(principal: ReadScopePrincipal, request: { snapshot_revision: string; expected_baseline_version: number }) {
    this.enabled();
    if (retainedReview(this.config)) throw new CommandCenterError("READ_ONLY_PROFILE", "This profile is read-only.", 403);
    return this.call(() => this.store.transaction(principal.user.userId, principal.workspaceId, async tx => {
      const baseline = await tx.read();
      return this.repository.readAuthorized(principal, new Date(), async input => {
        const snapshot = digestSnapshot(input);
        if (snapshot.revision !== request.snapshot_revision)
          throw new CommandCenterError("VISIT_DIGEST_SNAPSHOT_CHANGED", "Refresh the digest before marking it seen.", 409);
        if (baseline?.snapshot_revision === snapshot.revision) return composeVisitDigest(snapshot, baseline);
        if ((baseline?.version ?? 0) !== request.expected_baseline_version)
          throw new CommandCenterError("VISIT_DIGEST_BASELINE_CHANGED", "Refresh the digest before marking it seen.", 409);
        if ((baseline?.version ?? 0) >= 2147483646)
          throw new CommandCenterError("VISIT_DIGEST_VERSION_LIMIT", "The visit baseline requires maintenance.", 503);
        const next = makeBaseline(snapshot, (baseline?.version ?? 0) + 1, new Date().toISOString());
        await tx.write(next);
        return composeVisitDigest(snapshot, next);
      });
    }));
  }
}
