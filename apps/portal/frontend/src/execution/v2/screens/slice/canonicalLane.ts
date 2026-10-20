/**
 * The fixture lane of the slice (UXM-08, FIXTURE ONLY): the published synthetic examples, read from the contracts package
 * verbatim and passed through the same strict readers a real response would use.
 *
 * Why JSON from the contracts package and not a copy: one source, so the lane cannot drift from what Codex published, and
 * a change in the published shape makes the readers fail closed (the slice then says the read could not be trusted)
 * instead of showing a stale copy. The files are TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT and carry that lane marker.
 *
 * This is the ONLY slice module that imports the contracts JSON, and it is reached only from the flag-gated lazy chunk
 * (`scoped` key in the V2 manifest). `slice.boundary.test.ts` holds both facts. Nothing here opens a stream, fetches,
 * polls or sends: the "snapshot port" answers from memory.
 */
import realtimeFixtures from "../../../../../../../../packages/contracts/fixtures/execution-scoped-realtime.synthetic.valid.json";
import scopedFixtures from "../../../../../../../../packages/contracts/fixtures/execution-manager-scoped.synthetic.valid.json";
import { readNativeBaselineHeaders, type NativeBaseline } from "../../readers/scopedRealtime";
import type { SnapshotOutcome, SnapshotFailure } from "../../realtime/scopedStreamMachine";
import type { SnapshotPort } from "../../realtime/scopedStreamController";
import { readManagerScoped, type ScopedRead } from "./scopedRead";

export const FIXTURE_LANE_MARKER = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";

interface RealtimeCase {
  id: string;
  response: unknown;
}

const REALTIME_CASES = (realtimeFixtures as unknown as { cases: RealtimeCase[] }).cases;
const SCOPED_CASES = (scopedFixtures as unknown as { cases: unknown[] }).cases;

/** The frame ids the lane can send (published ids; nothing is invented here). */
export const FIXTURE_FRAME_IDS = ["N09-REVALIDATE", "N09-HEARTBEAT", "N09-RESYNC_REQUIRED", "N09-ACCESS_REVOKED", "N09-UNAVAILABLE"] as const;
export type FixtureFrameId = (typeof FIXTURE_FRAME_IDS)[number];

/** A fresh copy of a published frame, so a mutation by one caller cannot reach the next. */
export function fixtureFrame(id: FixtureFrameId): unknown {
  const found = REALTIME_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no published frame fixture named ${id}`);
  return structuredClone(found.response);
}

function baselineOf(id: "N10-NATIVE-BASELINE-HEADERS" | "N10-NATIVE-NO-STREAM-HEADERS"): NativeBaseline | null {
  const found = REALTIME_CASES.find((entry) => entry.id === id);
  return found === undefined ? null : readNativeBaselineHeaders(structuredClone(found.response));
}

/** The published ALPHA_FLEET example, through the strict reader. `null` = the published body no longer reads. */
export function fixtureScopedRead(): ScopedRead | null {
  const read = readManagerScoped(structuredClone(SCOPED_CASES[0]));
  return read !== null && read.kind === "scoped" ? read.read : null;
}

export type NextRead = "ok" | "denied" | "unavailable" | "no_stream";
export const NEXT_READ_LABEL: Readonly<Record<NextRead, string>> = {
  ok: "Succeeds",
  denied: "Is denied",
  unavailable: "Does not complete",
  no_stream: "Offers no stream",
};

/** What the fixture lane is willing to authorize: the one workspace and environment of the published example. */
export interface LaneContext {
  workspaceId: string | null;
  environment: string | null;
}

export interface FixtureLane {
  port: SnapshotPort<ScopedRead>;
  /** What the next snapshot read answers; the lane's one dial. */
  setNext(next: NextRead): void;
  reads(): number;
}

/**
 * The lane's snapshot port. A context the published example does not cover is DENIED, like a real BFF that does not
 * authorize it: the fixture never answers one scope's rows for another.
 */
export function createFixtureLane(context: LaneContext): FixtureLane {
  let next: NextRead = "ok";
  let reads = 0;
  const failure = (reason: SnapshotFailure): SnapshotOutcome<ScopedRead> => ({ ok: false, failure: reason });
  return {
    setNext: (value) => {
      next = value;
    },
    reads: () => reads,
    port: {
      readSnapshot: async () => {
        reads += 1;
        const scoped = fixtureScopedRead();
        if (scoped === null) return failure("MALFORMED");
        const covers =
          (context.workspaceId === null || context.workspaceId === scoped.workspaceId) &&
          (context.environment === null || scoped.environment === "all" || context.environment === scoped.environment);
        if (!covers || next === "denied") return failure("DENIED");
        if (next === "unavailable") return failure("UNAVAILABLE");
        const baseline = next === "no_stream" ? baselineOf("N10-NATIVE-NO-STREAM-HEADERS") : baselineOf("N10-NATIVE-BASELINE-HEADERS");
        return { ok: true, data: scoped, readAtMs: scoped.readAtMs, baseline };
      },
    },
  };
}
