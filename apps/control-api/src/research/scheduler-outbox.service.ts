import { Injectable } from "@nestjs/common";

import type { ResearchScope } from "./contracts";
import { ResearchMetadataRepository } from "./repository";

/**
 * P06 transport port.  The service owns outbox claim/ack ordering, while a
 * later deployment-bound adapter owns the existing NATS connection and its
 * credentials.  Nothing in this class starts a socket or retries blindly.
 */
export interface ResearchSchedulerOutboxTransport {
  publish(subject: "research.scheduler.v1", payload: Readonly<Record<string, string | number>>): Promise<void>;
}

@Injectable()
export class ResearchSchedulerOutboxService {
  constructor(private readonly metadata: ResearchMetadataRepository) {}

  async flush(
    scope: ResearchScope,
    transport: ResearchSchedulerOutboxTransport,
    publisherId: string,
    limit = 16,
  ): Promise<{ published: number; deferred: number }> {
    const claims = await this.metadata.claimDurableJobOutbox(scope, { publisherId, limit });
    let published = 0;
    let deferred = 0;
    for (const claim of claims) {
      try {
        // The payload is the immutable, bounded ID-only outbox document. The
        // event type/digest are carried as metadata for a consumer to dedupe;
        // credentials, request config and result bytes never cross the broker.
        await transport.publish("research.scheduler.v1", {
          ...claim.payload,
          delivery_generation: claim.deliveryGeneration,
          event_type: claim.eventType,
          outbox_id: claim.outboxId,
          payload_digest: claim.payloadDigest,
        });
        await this.metadata.acknowledgeDurableJobOutbox(scope, claim);
        published += 1;
      } catch {
        // Do not ack or release manually: its short publisher lease expires
        // and an independently fenced future flush reclaims it. This avoids
        // a synchronous retry loop and preserves truthful NATS outage state.
        deferred += 1;
      }
    }
    return { published, deferred };
  }
}
