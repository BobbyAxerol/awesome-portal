/** STATUS-only startup seam. The application MUST register this exact recovery
 * participant in its shared native mutation coordinator before statusTrust().
 * No listener/original/attempt/HUMAN assertion or command is started here. */
import type { Pool } from "pg";
import { assertRegisteredResearchCurrentHumanSchema } from "./current-human-schema";
import { CurrentHumanRecoveryClient } from "./current-human-recovery-client";
import { CommandStatusComposition } from "./command-status-composition";
import type { PreparedCommandStatusRuntime } from "./command-status-runtime";

export async function prepareCommandStatusApplication(pool: Pool, runtime: PreparedCommandStatusRuntime) {
  try {
    await assertRegisteredResearchCurrentHumanSchema(pool, runtime.schemaTarget);
    const copy = (value: unknown): unknown => Buffer.isBuffer(value) ? Buffer.from(value) : Array.isArray(value) ? value.map(copy) : value;
    const recovery = new CurrentHumanRecoveryClient({ ...runtime.recovery, tls: {
      key: copy(runtime.recovery.tls.key) as typeof runtime.recovery.tls.key,
      cert: copy(runtime.recovery.tls.cert) as typeof runtime.recovery.tls.cert,
      ca: copy(runtime.recovery.tls.ca) as typeof runtime.recovery.tls.ca,
    } });
    const composition = await CommandStatusComposition.create(pool, runtime.config);
    const participant = composition.reverseRecoveryParticipant(recovery);
    return Object.freeze({ composition, participant, listeners: runtime.listeners });
  } finally {
    for (const tls of [runtime.config.assertion_transport.tls, runtime.config.current_human_transport.tls,
      runtime.config.edge_transport.tls, runtime.recovery.tls])
      for (const value of [tls.key, tls.cert, tls.ca]) if (Buffer.isBuffer(value)) value.fill(0);
  }
}
export type PreparedCommandStatusApplication = Awaited<ReturnType<typeof prepareCommandStatusApplication>>;
