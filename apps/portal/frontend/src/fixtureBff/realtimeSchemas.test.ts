// @vitest-environment node
/**
 * FE-055 (ELP2-10 intake, 18 Oct): three realtime contracts exist and must not be merged. Each double answers ITS route's schema:
 *   - `/profiles/:environment/realtime-snapshot`  -> `portal.execution.profile-realtime.v1`
 *   - `/command-center/realtime-snapshot`         -> `execution.manager-realtime-snapshot.v2` (stream NOT published unless a variant says so)
 * A command-center answer in the profile schema is the wrong pairing the intake asked to remove (the consumer refuses it).
 */
import { describe, expect, it } from "vitest";

import { answerExecutionBff } from "../../e2e/bffDouble";

const ask = (path: string) => answerExecutionBff("GET", `/api/v1/execution${path}`, new URLSearchParams());
const schemaOf = (answer: unknown): unknown => (answer as { body?: { schema_version?: unknown } } | null)?.body?.schema_version;

describe("each realtime double answers its own route's schema (FE-055)", () => {
  it("the command-center snapshot is the manager snapshot v2, with no stream published", () => {
    const answer = ask("/command-center/realtime-snapshot") as { status: number; body: Record<string, unknown> };
    expect(answer.status).toBe(200);
    expect(answer.body.schema_version).toBe("execution.manager-realtime-snapshot.v2");
    expect(answer.body.stream_available).toBe(false);
    expect(typeof answer.body.cursor).toBe("string");
    expect(typeof answer.body.projection_epoch).toBe("string");
    expect(Number.isInteger(answer.body.projection_sequence)).toBe(true);
  });
  it.each(["paper", "sandbox", "live"])("the %s profile snapshot is the profile schema", (environment) => {
    expect(schemaOf(ask(`/profiles/${environment}/realtime-snapshot`))).toBe("portal.execution.profile-realtime.v1");
  });
  it("negative cross-schema: the two routes never answer each other's schema", () => {
    expect(schemaOf(ask("/command-center/realtime-snapshot"))).not.toBe("portal.execution.profile-realtime.v1");
    expect(schemaOf(ask("/profiles/paper/realtime-snapshot"))).not.toBe("execution.manager-realtime-snapshot.v2");
  });
});
