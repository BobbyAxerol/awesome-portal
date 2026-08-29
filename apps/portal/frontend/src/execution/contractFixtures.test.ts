/**
 * C-PI04-06 — one contract-loading test per canonical fixture.
 *
 * Six endpoints, six documents in `packages/contracts/fixtures`. Before this,
 * three of them were never loaded by any frontend test: the readers were
 * exercised only against hand-written fixtures shaped like what we believed the
 * backend sent. That is a closed loop — it proves the reader agrees with our
 * own idea of the contract, which is exactly the thing most likely to be wrong.
 *
 * These load the published documents. A field rename upstream fails here rather
 * than in a browser, and the assertions are on values from the fixture, so a
 * reader that silently returned null would not pass.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  readAnalyticsEnvelope,
  readBindingExposure,
  readCapitalLedger,
  readCapitalPreview,
  readCorrelation,
  readInsightBatch,
  readOrderFunnel,
  samplesAt,
} from "./analytics";
import { readGateR2Detail } from "./api/rows";

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");
const load = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `execution-analytics.${name}.valid.json`), "utf8"));

/** The six the handoff names, in its order. */
const CANONICAL = [
  "capital-preview",
  "order-funnel",
  "insight-batch",
  "correlation",
  "capital-ledger",
  "binding-exposure",
] as const;

describe("the canonical set is the whole set", () => {
  it("covers every analytics fixture on disk, so a seventh cannot appear unnoticed", () => {
    const onDisk = readdirSync(FIXTURES)
      .filter((f) => f.startsWith("execution-analytics.") && f.endsWith(".valid.json"))
      .map((f) => f.replace("execution-analytics.", "").replace(".valid.json", ""));
    expect(onDisk.sort()).toEqual([...CANONICAL].sort());
  });

  it("every one carries the two-layer envelope this cluster reads", () => {
    for (const name of CANONICAL) {
      const envelope = readAnalyticsEnvelope(load(name));
      expect(envelope, name).not.toBeNull();
      expect(envelope!.authority, name).toBeTruthy();
    }
  });
});

describe("capital preview → Gate R2", () => {
  it("reads the published document, naming server fields rather than computing", () => {
    const preview = readCapitalPreview(load("capital-preview"))!;
    expect(preview).not.toBeNull();
    expect(preview.portfolioId).toBe("PF-1");
    expect(preview.currency).toBe("USDT");
    // Lines are built by NAMING a server field pair, never by subtracting one
    // figure from another — the invariant this screen exists to hold.
    const allocated = preview.lines.find((l) => l.label === "Allocated")!;
    expect(allocated.before).toBe("500");
    expect(allocated.after).toBe("550.000000000000000001");
    // Decimals stay strings. Number() on either of these loses the last digit,
    // which is precisely the digit the fixture is built to expose.
    expect(typeof allocated.before).toBe("string");
    expect(typeof allocated.after).toBe("string");
  });
});

describe("order funnel → Full Blotter", () => {
  it("reads the four published stages and the bounded facts", () => {
    const funnel = readOrderFunnel(load("order-funnel"))!;
    expect(funnel.orderId).toBe("order-1");
    expect(funnel.stages).toHaveLength(4);
    expect(funnel.window).toBe("LIFECYCLE_AND_LATEST");
    expect(funnel.bounded.total).toBe(4);
  });
});

describe("insight batch → Alpha 360°", () => {
  it("reads the published items and the three counts", () => {
    const batch = readInsightBatch(load("insight-batch"), "PF-1")!;
    expect(batch).not.toBeNull();
    expect(batch.requestedCount).toBe(1);
    expect(batch.readyCount).toBe(1);
    expect(batch.errorCount).toBe(0);
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].state).toBe("READY");
    // Metric values are decimal strings, like every other figure here.
    const netPnl = batch.items[0].metrics.find((m) => m.metric === "NET_PNL")!;
    expect(netPnl.value).toBe("12.5");
    expect(typeof netPnl.value).toBe("string");
  });

  it("refuses a batch belonging to another portfolio", () => {
    // The reader takes the expected portfolio precisely so a response for the
    // wrong one cannot be rendered as this one's.
    expect(readInsightBatch(load("insight-batch"), "PF-2")).toBeNull();
  });
});

describe("correlation → Portfolio 360°", () => {
  it("reads the packed matrix, its labels and its clusters", () => {
    const correlation = readCorrelation(load("correlation"))!;
    expect(correlation).not.toBeNull();
    expect(correlation.portfolioId).toBe("PF-1");
    expect(correlation.labels).toHaveLength(2);
    expect(correlation.kind).toBe("PACKED_MATRIX");
  });

  it("carries no per-cell sample count, which is why the screen cannot apply the floor", () => {
    // BR-EX-27. Asserted rather than assumed: the day codex publishes
    // sample_counts this goes red and the caption stops being true.
    const raw = load("correlation");
    expect(raw.analytics.data.representation.matrix.sample_counts).toBeUndefined();
    const correlation = readCorrelation(raw)!;
    expect(correlation.kind).toBe("PACKED_MATRIX");
    if (correlation.kind === "PACKED_MATRIX") {
      // `null`, not absent: the reader is forward-compatible and reports the
      // field as unpublished rather than pretending it was never asked for.
      expect(correlation.sampleCounts).toBeNull();
      expect(samplesAt(correlation, 0, 1)).toBeNull();
      expect(correlation.clusters).toHaveLength(1);
    }
  });
});

describe("capital ledger → Portfolio 360°", () => {
  it("reads the published buckets and the bounded facts", () => {
    const ledger = readCapitalLedger(load("capital-ledger"))!;
    expect(ledger.portfolioId).toBe("PF-1");
    expect(ledger.buckets).toHaveLength(1);
    expect(ledger.window).toBe("LATEST");
    expect(ledger.bounded.total).toBe(1);
  });
});

describe("binding exposure → Account/Broker 360°", () => {
  it("reads the published buckets and both account counts", () => {
    const exposure = readBindingExposure(load("binding-exposure"))!;
    expect(exposure.bindingId).toBe("binding-1");
    expect(exposure.accountCount).toBe(1);
    expect(exposure.expectedAccountCount).toBe(1);
    expect(exposure.completeness).toBe("COMPLETE");
    expect(exposure.buckets[0].currency).toBe("USDT");
    // Never summed in the browser: each is the server's own figure.
    expect(typeof exposure.buckets[0].headroom).toBe("string");
  });
});

describe("no reader silently accepts a document it cannot read", () => {
  it("returns null rather than an empty shell when the payload is missing", () => {
    expect(readCapitalPreview({})).toBeNull();
    expect(readOrderFunnel({})).toBeNull();
    expect(readInsightBatch({}, "PF-1")).toBeNull();
    expect(readCorrelation({})).toBeNull();
    expect(readCapitalLedger({})).toBeNull();
    expect(readBindingExposure({})).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * C-PI04-01 audit: field names the readers consume that no contract publishes.
 * ------------------------------------------------------------------------ */

describe("the R2 reader against the published R2 contract", () => {
  const schema = JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../../../packages/contracts/schemas/execution-governance-r2-review.v1.schema.json",
      ),
      "utf8",
    ),
  );

  const approvalKeys = () => Object.keys(schema.$defs.approval.properties);
  const dataKeys = () => Object.keys(schema.$defs.review_data.properties);

  it("publishes the complete Portal-owned R1 lineage and eligibility contract", () => {
    // Spot-check the ones the screen cannot render without.
    for (const key of ["approval_id", "approval_version", "portfolio_id", "currency", "creator"]) {
      expect(approvalKeys(), key).toContain(key);
    }
    for (const key of [
      "actor",
      "approval",
      "r1_reference",
      "r1_state",
      "r1_id",
      "grant_id",
      "grant_name",
      "approver_role",
      "plan_author",
      "evidence_manifest",
      "eligibility",
    ]) {
      expect(dataKeys(), key).toContain(key);
    }
  });

  it("reads the canonical R2 fixture without guessing missing lineage", () => {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURES, "execution-governance.r2-review.valid.json"), "utf8"),
    );
    const detail = readGateR2Detail(fixture)!;
    expect(detail.r1LineagePublished).toBe(true);
    expect(detail.r1Id).toBe("AP-R1-DETAIL");
    expect(detail.r1State).toBe("APPROVED");
    expect(detail.r1Digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(detail.grantName).toBe("paper_activation_authorization");
    expect(detail.planAuthor).toBe("stan");
    expect(detail.locks).toEqual([]);
  });
});

describe("fail-closed compatibility for a pre-N09 R2 response", () => {
  it("blocks approve either way, but says which of the two it is", () => {
    // Old responses may carry neither key. They remain readable, but cannot be
    // mistaken for the canonical N09 response or used to approve.
    const unpublished = readGateR2Detail({
      data: { approval: { approval_id: "AP-352", approval_version: 3 } },
    })!;
    expect(unpublished.r1LineagePublished).toBe(false);
    expect(unpublished.r1State).toBe("MISSING");

    // And a response that DOES say there is no R1 keeps the original meaning.
    const stated = readGateR2Detail({
      data: { approval: { approval_id: "AP-352", approval_version: 3 }, r1_state: "MISSING" },
    })!;
    expect(stated.r1LineagePublished).toBe(true);
    expect(stated.r1State).toBe("MISSING");
  });
});
