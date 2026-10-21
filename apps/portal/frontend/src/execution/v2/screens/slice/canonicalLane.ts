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
import chainFixtures from "../../../../../../../../packages/contracts/fixtures/execution-manager-scoped.scenarios.synthetic.valid.json";
import scopedFixtures from "../../../../../../../../packages/contracts/fixtures/execution-manager-scoped.synthetic.valid.json";
import { readNativeBaselineHeaders, type NativeBaseline } from "../../readers/scopedRealtime";
import type { SnapshotOutcome, SnapshotFailure } from "../../realtime/scopedStreamMachine";
import type { SnapshotPort } from "../../realtime/scopedStreamController";
import { readManagerScoped, type ScopedRead } from "./scopedRead";
import type { ScopedPageAnswer, ScopedPagePort, ScopedPageRequest } from "./scopedPager";

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

/** The published 3-page cursor chain (RV-12 `fleet-owner-paper-chain`, ALPHA_FLEET, paper, `limit: 1`): the raw bodies, as the reader answered them. */
export const CHAIN_SCENARIO_ID = "fleet-owner-paper-chain";
export type PageChain = readonly unknown[];

/** A fresh copy of the chain's bodies. `null` = the published scenario is gone (the lane then serves nothing it cannot back). */
export function fixtureChain(): PageChain | null {
  const found = (chainFixtures as unknown as { scenarios: { id: string; pages: { response: unknown }[] }[] }).scenarios.find((s) => s.id === CHAIN_SCENARIO_ID);
  return found === undefined || found.pages.length === 0 ? null : found.pages.map((p) => structuredClone(p.response));
}

/** Page 1 of the chain through the strict reader: the slice's snapshot when the chain is served. */
export function chainScopedRead(): ScopedRead | null {
  const chain = fixtureChain();
  const read = chain === null ? null : readManagerScoped(chain[0]);
  return read !== null && read.kind === "scoped" ? read.read : null;
}

const refusalBody = (code: string) => ({ error: { code, message: "TEST_ONLY fixture refusal" }, request_id: "req_TEST_ONLY" });

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

/**
 * What the fixture "server" remembers about withdrawn access, for as long as the memory object lives. A real source
 * answers DENIED to every later read of a revoked scope; a lane built per mount would forget and show the rows again on
 * Back. The route keeps one memory for the page's life (`PAGE_REVOCATIONS`); a full reload forgets it, and tests build their own.
 */
export interface RevocationMemory {
  has(scope: string): boolean;
  add(scope: string): void;
}

export function createRevocationMemory(): RevocationMemory {
  const scopes = new Set<string>();
  return { has: (scope) => scopes.has(scope), add: (scope) => void scopes.add(scope) };
}

/** The route's memory (the page's life). Fixture behaviour only: it stands in for a server that does not forget. */
export const PAGE_REVOCATIONS: RevocationMemory = createRevocationMemory();

const scopeOf = (context: LaneContext): string => `${context.workspaceId ?? "-"}|${context.environment ?? "-"}`;

export interface FixtureLane {
  port: SnapshotPort<ScopedRead>;
  /** What the next snapshot read answers; the lane's one dial. */
  setNext(next: NextRead): void;
  /** The view learned that access to this lane's scope was withdrawn: every later read of it is DENIED (when a memory was given). */
  revoke(): void;
  reads(): number;
  /** The keyset pages of the lane (the served chain), or `null` when the lane serves one page. Never the snapshot port. */
  pages: ScopedPagePort | null;
  /** The fixture server stops accepting the cursors it issued (the next first-page read issues fresh ones). */
  expireCursors(): void;
  /** Page reads answered so far (snapshot reads are `reads()`). */
  pageReads(): number;
}

/**
 * The lane's snapshot port. A context the published example does not cover is DENIED, like a real BFF that does not
 * authorize it: the fixture never answers one scope's rows for another. `source` is the read the lane answers (default: the
 * published ALPHA_FLEET example); a test passes a page of the RV-12 scenarios through the same strict reader.
 */
export function createFixtureLane(
  context: LaneContext,
  revocations?: RevocationMemory,
  source: () => ScopedRead | null = fixtureScopedRead,
  chain: PageChain | null = null,
): FixtureLane {
  let next: NextRead = "ok";
  let reads = 0;
  let pageReads = 0;
  let expired = false;
  const covered = (scoped: ScopedRead): boolean =>
    (context.workspaceId === null || context.workspaceId === scoped.workspaceId) &&
    (context.environment === null || scoped.environment === "all" || context.environment === scoped.environment);
  const pages: ScopedPagePort | null =
    chain === null || chain.length === 0
      ? null
      : {
          async read(request: ScopedPageRequest): Promise<ScopedPageAnswer> {
            pageReads += 1;
            const first = readManagerScoped(structuredClone(chain[0]));
            if (first === null || first.kind !== "scoped") return { ok: false, transport: true };
            if (!covered(first.read) || next === "denied" || revocations?.has(scopeOf(context)) === true) {
              return { ok: false, status: 404, body: refusalBody("EXECUTION_READ_NOT_AVAILABLE") };
            }
            if (request.direction === "first") {
              expired = false;
              return { ok: true, body: structuredClone(chain[0]) };
            }
            // The server side of the fixture may look inside; the browser never does. A cursor is found by its exact text.
            const at = (i: number) => (chain[i] as { page: { next_cursor: string | null; previous_cursor: string | null } }).page;
            const known = chain.findIndex((_p, i) => at(i).next_cursor === request.cursor || at(i).previous_cursor === request.cursor);
            if (known < 0) return { ok: false, status: 400, body: refusalBody("INVALID_CURSOR") };
            if (expired) return { ok: false, status: 400, body: refusalBody("CURSOR_EXPIRED") };
            const target = request.direction === "after" ? known + 1 : known - 1;
            const fits = request.direction === "after" ? at(known).next_cursor === request.cursor : at(known).previous_cursor === request.cursor;
            if (!fits) return { ok: false, status: 400, body: refusalBody("CURSOR_CONTEXT_MISMATCH") };
            return { ok: true, body: structuredClone(chain[target]) };
          },
        };
  const failure = (reason: SnapshotFailure): SnapshotOutcome<ScopedRead> => ({ ok: false, failure: reason });
  return {
    setNext: (value) => {
      next = value;
    },
    revoke: () => revocations?.add(scopeOf(context)),
    reads: () => reads,
    pages,
    expireCursors: () => {
      expired = true;
    },
    pageReads: () => pageReads,
    port: {
      readSnapshot: async () => {
        reads += 1;
        const scoped = source();
        if (scoped === null) return failure("MALFORMED");
        if (!covered(scoped) || next === "denied" || revocations?.has(scopeOf(context)) === true) return failure("DENIED");
        if (next === "unavailable") return failure("UNAVAILABLE");
        const baseline = next === "no_stream" ? baselineOf("N10-NATIVE-NO-STREAM-HEADERS") : baselineOf("N10-NATIVE-BASELINE-HEADERS");
        return { ok: true, data: scoped, readAtMs: scoped.readAtMs, baseline };
      },
    },
  };
}
