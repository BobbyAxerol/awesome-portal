/**
 * Analytics contract tests (EX-BE-07a/b).
 *
 * Grouped by the property each defends rather than by module, because the
 * properties are what the contract promises: money is not recomputed here, an
 * unobserved hop is not inferred, a batch does not exceed its bound, a 151st
 * entity does not allocate a square matrix, and a partial population is never
 * called a total.
 *
 * The first group reads codex's own published fixture, so a schema change
 * upstream fails here rather than in a browser.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORRELATION_PACK_LIMIT,
  CORRELATION_RANKED_LIMIT,
  FUNNEL_STAGES,
  INSIGHT_BATCH_LIMIT,
  chunkInsightRequests,
  correlationAt,
  insightBatchRequest,
  isFullPopulation,
  packedIndex,
  packedLength,
  readAnalyticsEnvelope,
  readBindingExposure,
  readCapitalLedger,
  readCapitalPreview,
  readCorrelation,
  readInsightBatch,
  readOrderFunnel,
  type PackedCorrelation,
  type RankedCorrelation,
} from "./analytics";
import { capitalDeltasFromPreview } from "./api/rows";
import {
  CAPITAL_LEDGER,
  CAPITAL_PREVIEW_BREACH,
  CAPITAL_PREVIEW_OK,
  CAPITAL_PREVIEW_PARTIAL,
  CAPITAL_PREVIEW_STALE,
  CORRELATION_ABOVE_LIMIT,
  CORRELATION_AT_LIMIT,
  EXPOSURE_COMPLETE,
  EXPOSURE_PARTIAL,
  EXPOSURE_UNKNOWN,
  FUNNEL_COMPLETE,
  FUNNEL_MISSING_BROKER_ACK,
  FUNNEL_SUBMIT_ONLY,
  INSIGHT_BATCH_FULL,
  INSIGHT_BATCH_MIXED,
  PACKED_LENGTH_AT_LIMIT,
  packedCorrelationFixture,
} from "./analytics.fixtures";

const REPO = join(__dirname, "../../../../..");
const PUBLISHED = join(
  REPO,
  "packages/contracts/fixtures/execution-analytics.capital-preview.valid.json",
);

describe("Analytics envelope — read metadata and computation metadata separately", () => {
  it("reads codex's published capital-preview fixture end to end", () => {
    // Against the contract pack itself, so an upstream field rename fails here
    // rather than in a browser.
    const raw = JSON.parse(readFileSync(PUBLISHED, "utf8"));
    const envelope = readAnalyticsEnvelope(raw)!;
    expect(envelope.schemaVersion).toBe("execution.analytics.screen.v1");
    expect(envelope.sourceProfile).toBe("fixture");
    expect(envelope.formulaVersion).toBe("capital-preview.v1");
    expect(envelope.authority).toBe("DERIVED");
    expect(envelope.panelState).toBe("ok");
    expect(envelope.inputCompleteness).toBe("COMPLETE");

    const preview = readCapitalPreview(raw)!;
    expect(preview.portfolioId).toBe("PF-1");
    expect(preview.currency).toBe("USDT");
    expect(preview.decisionEligible).toBe(true);
  });

  it("keeps the read fresh and the computation stale as two separate facts", () => {
    const envelope = readAnalyticsEnvelope(CAPITAL_PREVIEW_STALE)!;
    expect(envelope.readAt).toBe("2026-08-22T10:00:00Z"); // the read is current
    expect(envelope.inputFreshnessFloor).toBe("STALE"); // its worst input is not
    expect(envelope.panelState).toBe("stale");
    expect(envelope.warnings[0].code).toBe("SOURCE_STALE");
  });

  it("narrows an unrecognised panel state to unavailable rather than trusting it", () => {
    const odd = { analytics: { panel_state: "fine", data: {} } };
    expect(readAnalyticsEnvelope(odd)!.panelState).toBe("unavailable");
  });

  it("holds the delivery profile at fixture across every response", () => {
    for (const response of [CAPITAL_PREVIEW_OK, FUNNEL_COMPLETE, INSIGHT_BATCH_FULL, CAPITAL_LEDGER, EXPOSURE_COMPLETE]) {
      expect(readAnalyticsEnvelope(response)!.sourceProfile).toBe("fixture");
    }
  });
});

describe("Gate R2 capital preview — read, never recomputed", () => {
  it("builds every line by naming a pair of server fields", () => {
    const preview = readCapitalPreview(CAPITAL_PREVIEW_OK)!;
    expect(preview.lines.map((l) => l.label)).toEqual([
      "Allocated", "Used", "Reserved", "Available", "Allocation headroom",
    ]);
    const allocated = preview.lines[0];
    expect(allocated.before).toBe("500");
    expect(allocated.after).toBe("550.000000000000000001");
  });

  it("preserves a decimal a double would round", () => {
    // The digit that survives here is the whole reason decimals stay strings.
    const preview = readCapitalPreview(CAPITAL_PREVIEW_OK)!;
    expect(preview.requestedAmount).toBe("50.000000000000000001");
    expect(preview.lines.find((l) => l.label === "Available")!.after).toBe(
      "425.000000000000000001",
    );
    expect(String(Number("50.000000000000000001"))).not.toBe("50.000000000000000001");
  });

  it("states an unchanged figure as unchanged instead of omitting a side", () => {
    const used = readCapitalPreview(CAPITAL_PREVIEW_OK)!.lines.find((l) => l.label === "Used")!;
    expect(used.before).toBe("100");
    expect(used.after).toBe("100");
    expect(used.note).toMatch(/Unchanged/);
  });

  it("no execution source file does arithmetic on a capital field", () => {
    // Enforced structurally rather than by review: an operator between two of
    // these names is the exact shape of a browser deciding a number the engine
    // is authoritative for.
    //
    // Comments and string literals are stripped first, and that is not a
    // loophole — it is the difference between code and prose. The phrase
    // "before/after table" appears in two doc comments and computes nothing; a
    // gate that flagged it would be trained away within a week.
    const strip = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    const money = MONEY_ARITHMETIC;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.(test|fixtures)\.tsx?$/.test(entry.name)) {
          if (money.test(strip(readFileSync(path, "utf8")))) offenders.push(path);
        }
      }
    };
    walk(__dirname);
    expect(offenders).toEqual([]);
  });

  it("that gate bites when a component computes a capital figure", () => {
    // Proving the guard rather than trusting it: these are the lines it exists
    // to reject, and this is the prose it must not.
    expect(MONEY_ARITHMETIC.test("const shown = allocated - used - reserved;")).toBe(true);
    expect(MONEY_ARITHMETIC.test("const shown = Number(available) + 1;")).toBe(true);
    expect(MONEY_ARITHMETIC.test("const h = maximumAllocated - allocated;")).toBe(true);
    expect(MONEY_ARITHMETIC.test("a before/after table about money")).toBe(false);
  });

  it("keeps a stale preview visible but refuses to let it be decided against", () => {
    const preview = readCapitalPreview(CAPITAL_PREVIEW_STALE)!;
    expect(preview.lines).toHaveLength(5); // still diagnosable
    expect(preview.decisionEligible).toBe(false);
    expect(preview.blockers).toHaveLength(2);
  });

  it("treats an absent eligibility flag as not eligible", () => {
    const bare = { analytics: { data: { portfolio_id: "p", currency: "USDT" } } };
    expect(readCapitalPreview(bare)!.decisionEligible).toBe(false);
  });

  it("reports a ceiling breach through the engine's blockers, not a client verdict", () => {
    const preview = readCapitalPreview(CAPITAL_PREVIEW_BREACH)!;
    expect(preview.decisionEligible).toBe(false);
    expect(preview.blockers[0]).toMatch(/exceeds the portfolio ceiling/);
    expect(preview.lines.find((l) => l.label === "Allocation headroom")!.after).toBe("-100");
  });

  it("blocks a decision when the population behind it is incomplete", () => {
    expect(readCapitalPreview(CAPITAL_PREVIEW_PARTIAL)!.decisionEligible).toBe(false);
    expect(readAnalyticsEnvelope(CAPITAL_PREVIEW_PARTIAL)!.inputCompleteness).toBe("PARTIAL");
  });

  it("drops a line missing one side rather than showing a change from nothing", () => {
    const holed = {
      analytics: {
        data: { portfolio_id: "p", currency: "USDT", allocated_before: "1", used: "5" },
      },
    };
    const preview = readCapitalPreview(holed)!;
    expect(preview.lines.map((l) => l.label)).toEqual(["Used"]);
  });
});

/** Shared by the sweep and the proof, so they cannot drift apart. */
const MONEY_ARITHMETIC =
  /\b(allocated|available|reserved|headroom|requestedAmount|maximumAllocated)\b[\s)\]]*[-+*/]|[-+*/][\s(\[]*(?:Number[\s(]*)?\b(allocated|available|reserved|headroom|requestedAmount|maximumAllocated)\b/;

describe("Full Blotter funnel — four stages, nothing inferred", () => {
  it("renders all four stages even when the server sent one", () => {
    const funnel = readOrderFunnel(FUNNEL_SUBMIT_ONLY)!;
    expect(funnel.stages.map((s) => s.name)).toEqual([...FUNNEL_STAGES]);
    expect(funnel.stages.map((s) => s.state)).toEqual([
      "OBSERVED", "MISSING", "MISSING", "MISSING",
    ]);
  });

  it("never infers a broker ack from the fills that followed it", () => {
    const funnel = readOrderFunnel(FUNNEL_MISSING_BROKER_ACK)!;
    expect(funnel.stages.find((s) => s.name === "FILL")!.state).toBe("PARTIAL");
    expect(funnel.stages.find((s) => s.name === "BROKER_ACK")!.state).toBe("MISSING");
    expect(funnel.incomplete).toBe(true);
  });

  it("keeps multiple fills in the server's order", () => {
    const fill = readOrderFunnel(FUNNEL_COMPLETE)!.stages.find((s) => s.name === "FILL")!;
    expect(fill.events.map((e) => e.sourceId)).toEqual(["fill-1", "fill-2", "fill-3"]);
    expect(fill.events.map((e) => e.quantity)).toEqual(["400", "350", "250"]);
  });

  it("holds the canonical stage order regardless of the order received", () => {
    const data = FUNNEL_COMPLETE.analytics.data as { stages: unknown[] };
    const stages = [...data.stages].reverse();
    const shuffled = { analytics: { data: { order_id: "ord-1", stages } } };
    expect(readOrderFunnel(shuffled)!.stages.map((s) => s.name)).toEqual([...FUNNEL_STAGES]);
  });

  it("carries each hop's own authority rather than one for the order", () => {
    // The submit is ours and the fill is the broker's. Collapsing them would
    // present a broker claim as an execution-cell fact.
    const funnel = readOrderFunnel(FUNNEL_COMPLETE)!;
    expect(funnel.stages[0].events[0].authority).toBe("EXECUTION");
    expect(funnel.stages[3].events[0].authority).toBe("BROKER");
  });

  it("marks a fully observed funnel complete", () => {
    expect(readOrderFunnel(FUNNEL_COMPLETE)!.incomplete).toBe(false);
  });

  it("narrows an unrecognised stage state to MISSING rather than trusting it", () => {
    const odd = {
      analytics: { data: { order_id: "o", stages: [{ stage: "SUBMIT", state: "PROBABLY" }] } },
    };
    expect(readOrderFunnel(odd)!.stages[0].state).toBe("MISSING");
  });
});

describe("Alpha 360° batch — bounded at 64", () => {
  it("reads a batch at the exact ceiling", () => {
    const batch = readInsightBatch(INSIGHT_BATCH_FULL, "PF-1")!;
    expect(batch.items).toHaveLength(INSIGHT_BATCH_LIMIT);
    expect(INSIGHT_BATCH_LIMIT).toBe(64);
  });

  it("splits a larger request into batches the contract accepts", () => {
    const chunks = chunkInsightRequests(Array.from({ length: 150 }, (_, i) => i));
    expect(chunks.map((c) => c.length)).toEqual([64, 64, 22]);
  });

  it("refuses to build an over-long request rather than having it rejected", () => {
    const items = Array.from({ length: 65 }, (_, i) => ({
      insightId: `ins-${i}`, alphaId: `alpha-${i}`,
    }));
    expect(() => insightBatchRequest("PF-1", items)).toThrow(/at most 64/);
    expect(() => insightBatchRequest("PF-1", items.slice(0, 64))).not.toThrow();
  });

  it("requires the portfolio on the request and echoes it back", () => {
    const body = insightBatchRequest("PF-1", [{ insightId: "ins-1", alphaId: "alpha-1" }]);
    expect(body.portfolio_id).toBe("PF-1");
    expect(body.items).toEqual([{ insight_id: "ins-1", alpha_id: "alpha-1" }]);
    expect(readInsightBatch(INSIGHT_BATCH_FULL, "PF-1")!.portfolioId).toBe("PF-1");
  });

  it("isolates a failed item instead of failing the batch", () => {
    const batch = readInsightBatch(INSIGHT_BATCH_MIXED, "PF-1")!;
    expect(batch.items.map((i) => i.state)).toEqual(["READY", "ERROR", "MISSING"]);
    expect(batch.items[0].metrics).toHaveLength(5);
    expect(batch.items[1].errorCode).toBe("BENCHMARK_UNAVAILABLE");
    expect(batch.items[2].metrics).toEqual([]);
  });

  it("trusts the server's counts rather than tallying what it rendered", () => {
    const batch = readInsightBatch(INSIGHT_BATCH_MIXED, "PF-1")!;
    expect(batch.requestedCount).toBe(3);
    expect(batch.readyCount).toBe(1);
    expect(batch.errorCount).toBe(1);
  });

  it("fails closed on a batch echoed for a different portfolio", () => {
    expect(readInsightBatch(INSIGHT_BATCH_MIXED, "PF-OTHER")).toBeNull();
  });

  it("drops an item belonging to another portfolio inside a correct batch", () => {
    const leaked = {
      analytics: {
        data: {
          portfolio_id: "PF-1",
          items: [
            { insight_id: "a", alpha_id: "x", portfolio_id: "PF-1", state: "READY", metrics: [] },
            { insight_id: "b", alpha_id: "y", portfolio_id: "PF-9", state: "READY", metrics: [] },
          ],
        },
      },
    };
    expect(readInsightBatch(leaked, "PF-1")!.items.map((i) => i.insightId)).toEqual(["a"]);
  });

  it("drops an unrecognised metric name rather than rendering an unlabelled number", () => {
    const odd = {
      analytics: {
        data: {
          portfolio_id: "PF-1",
          items: [
            {
              insight_id: "a", alpha_id: "x", portfolio_id: "PF-1", state: "READY",
              metrics: [{ metric: "VIBES", value: "1" }, { metric: "NET_PNL", value: "2" }],
            },
          ],
        },
      },
    };
    expect(readInsightBatch(odd, "PF-1")!.items[0].metrics).toEqual([
      { metric: "NET_PNL", value: "2" },
    ]);
  });
});

describe("Portfolio 360° correlation — the 150/151 boundary", () => {
  it("packs 150 entities as a lower triangle of n(n+1)/2 values", () => {
    const matrix = readCorrelation(CORRELATION_AT_LIMIT)! as PackedCorrelation;
    expect(matrix.kind).toBe("PACKED_MATRIX");
    expect(matrix.dimension).toBe(150);
    expect(matrix.values).toHaveLength(11325);
    expect(PACKED_LENGTH_AT_LIMIT).toBe(11325);
  });

  it("switches to ranked pairs at 151 and never allocates a square matrix", () => {
    const ranked = readCorrelation(CORRELATION_ABOVE_LIMIT)! as RankedCorrelation;
    expect(ranked.kind).toBe("RANKED_PAIRS");
    expect(ranked.labels).toHaveLength(151);
    expect(ranked.pairs.length).toBeLessThanOrEqual(CORRELATION_RANKED_LIMIT);
    // 151² = 22,801, and packed would be 11,476. Nothing here is either size.
    expect(ranked.pairs.length).toBeLessThan(packedLength(151));
    expect(ranked.clusters).toHaveLength(2);
  });

  it("refuses a packed payload above the dimension cap rather than indexing into it", () => {
    expect(readCorrelation(packedCorrelationFixture(CORRELATION_PACK_LIMIT + 1))).toBeNull();
  });

  it("indexes by row(row+1)/2 + column and is symmetric", () => {
    expect(packedIndex(0, 0)).toBe(0);
    expect(packedIndex(1, 0)).toBe(1);
    expect(packedIndex(1, 1)).toBe(2);
    expect(packedIndex(149, 149)).toBe(11324);
    expect(packedIndex(7, 3)).toBe(packedIndex(3, 7));
  });

  it("reads the diagonal as exactly 1 at both ends", () => {
    const matrix = readCorrelation(CORRELATION_AT_LIMIT)! as PackedCorrelation;
    expect(correlationAt(matrix, 0, 0)).toBe("1");
    expect(correlationAt(matrix, 149, 149)).toBe("1");
  });

  it("returns null past the edge instead of a zero that claims independence", () => {
    const matrix = readCorrelation(CORRELATION_AT_LIMIT)! as PackedCorrelation;
    expect(correlationAt(matrix, 150, 0)).toBeNull();
    expect(correlationAt(matrix, -1, 0)).toBeNull();
  });

  it("rejects a triangle whose length does not match its dimension", () => {
    const truncated = packedCorrelationFixture(10) as unknown as {
      analytics: { data: { representation: { matrix: { values: string[] } } } };
    };
    truncated.analytics.data.representation.matrix.values =
      truncated.analytics.data.representation.matrix.values.slice(0, 40);
    expect(readCorrelation(truncated)).toBeNull();
  });

  it("rejects a packing it does not recognise rather than assuming row-major", () => {
    const odd = packedCorrelationFixture(5) as unknown as {
      analytics: { data: { representation: { matrix: { packing: string } } } };
    };
    odd.analytics.data.representation.matrix.packing = "UPPER_COLUMN_MAJOR";
    expect(readCorrelation(odd)).toBeNull();
  });

  it("stays symmetric across the whole 150-entity triangle", () => {
    const matrix = readCorrelation(packedCorrelationFixture(150))! as PackedCorrelation;
    for (let row = 0; row < 150; row += 7) {
      for (let column = 0; column <= row; column += 11) {
        expect(correlationAt(matrix, row, column)).toBe(correlationAt(matrix, column, row));
      }
    }
  });
});

describe("Portfolio 360° capital ledger — bucketed, with the server's direction", () => {
  it("buckets by currency and never sums across them", () => {
    const ledger = readCapitalLedger(CAPITAL_LEDGER)!;
    expect(ledger.buckets.map((b) => b.currency)).toEqual(["USDT", "VND"]);
    expect(ledger.buckets[0].grossIncrease).toBe("750");
    expect(ledger.buckets[1].grossIncrease).toBe("12000000");
  });

  it("takes the direction from the server rather than the sign of the amount", () => {
    const usdt = readCapitalLedger(CAPITAL_LEDGER)!.buckets[0];
    expect(usdt.entries.map((e) => e.direction)).toEqual([
      "INCREASE", "INCREASE", "DECREASE", "UNCHANGED",
    ]);
    // The last entry has a zero amount and is still a rebalance that happened.
    // A client reading direction off the sign would call it nothing at all.
    expect(usdt.entries[3].amount).toBe("0");
    expect(usdt.entries[3].movementType).toBe("REBALANCE");
  });

  it("drops an entry whose direction it would have to guess", () => {
    const odd = {
      analytics: {
        data: {
          portfolio_id: "PF-1",
          buckets: [
            {
              currency: "USDT", gross_increase: "1", gross_decrease: "0",
              entries: [
                {
                  ledger_id: "l1", account_id: "a1", movement_type: "ALLOCATE",
                  amount: "1", before_allocated: "0", after_allocated: "1",
                },
              ],
            },
          ],
        },
      },
    };
    expect(readCapitalLedger(odd)!.buckets[0].entries).toEqual([]);
  });
});

describe("Account / Broker 360° — a partial population is never a total", () => {
  it("accepts a full population as full", () => {
    const exposure = readBindingExposure(EXPOSURE_COMPLETE)!;
    expect(exposure.accountCount).toBe(24);
    expect(exposure.expectedAccountCount).toBe(24);
    expect(isFullPopulation(exposure)).toBe(true);
  });

  it("refuses to call 21 of 24 a total", () => {
    expect(isFullPopulation(readBindingExposure(EXPOSURE_PARTIAL)!)).toBe(false);
  });

  it("refuses when the expected population size is unknown", () => {
    const exposure = readBindingExposure(EXPOSURE_UNKNOWN)!;
    expect(exposure.completeness).toBe("UNKNOWN");
    expect(exposure.expectedAccountCount).toBeNull();
    expect(isFullPopulation(exposure)).toBe(false);
  });

  it("refuses a COMPLETE claim whose counts disagree", () => {
    // The flag and the counts are independent facts. Where they disagree, the
    // safe reading is the weaker one.
    const inconsistent = {
      analytics: {
        data: {
          binding_id: "b", account_count: 23, expected_account_count: 24,
          population_completeness: "COMPLETE", buckets: [],
        },
      },
    };
    expect(isFullPopulation(readBindingExposure(inconsistent)!)).toBe(false);
  });

  it("treats an absent completeness field as UNKNOWN", () => {
    const bare = { analytics: { data: { binding_id: "b" } } };
    expect(readBindingExposure(bare)!.completeness).toBe("UNKNOWN");
  });

  it("carries per-bucket account counts, not one count for the binding", () => {
    // 18 + 4 + 2 = 24, but the screen reads each bucket's own figure. A single
    // count stretched across three currencies would claim coverage per bucket
    // that only the binding as a whole has.
    const exposure = readBindingExposure(EXPOSURE_COMPLETE)!;
    expect(exposure.buckets.map((b) => b.accountCount)).toEqual([18, 4, 2]);
  });

  it("carries each bucket's own source time range", () => {
    const usdt = readBindingExposure(EXPOSURE_COMPLETE)!.buckets[0];
    expect(usdt.oldestSourceAsOf).toBe("2026-08-22T09:31:00Z");
    expect(usdt.newestSourceAsOf).toBe("2026-08-22T09:45:00Z");
  });

  it("keeps every bucket figure a string", () => {
    for (const bucket of readBindingExposure(EXPOSURE_COMPLETE)!.buckets) {
      expect(typeof bucket.used).toBe("string");
      expect(typeof bucket.headroom).toBe("string");
    }
  });
});

describe("Gate R2 wiring — the preview reaches the screen without being recomputed", () => {
  it("maps engine lines to gate rows, passing every figure through unchanged", () => {
    const preview = readCapitalPreview(CAPITAL_PREVIEW_OK)!;
    const rows = capitalDeltasFromPreview(preview);
    expect(rows.map((r) => r.label)).toEqual(preview.lines.map((l) => l.label));
    expect(rows.map((r) => r.after)).toEqual(preview.lines.map((l) => l.after));
    expect(rows.every((r) => r.currency === "USDT")).toBe(true);
  });

  it("names the ceiling the headroom was checked against", () => {
    const rows = capitalDeltasFromPreview(readCapitalPreview(CAPITAL_PREVIEW_OK)!);
    expect(rows.find((r) => r.label === "Allocation headroom")!.note).toBe(
      "Against a ceiling of 1000 USDT.",
    );
  });
});
