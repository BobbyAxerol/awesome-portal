/**
 * ONE APPROVAL RECORD PER REQUEST (WP-E, FIXTURE_LAB, register 2d). QA3 R3-04: a single approval carried three capital figures and two targets
 * (a title naming PF-MAIN, a preview naming pf_TEST_ONLY_satellite, 0 -> 50,000.00 in the capital block, 11,000.00 -> 16,000.00 in the evidence
 * diff, and a Satellite page that states 85,000.00 allocated). Every one of those now comes from here:
 *
 *   portfolio id + name  one of the world's own native portfolios, chosen by the approval id
 *   current allocation   the world's: the exact sum of the allocations booked in that portfolio (bffWorld NATIVE_ALPHAS, BigInt cents)
 *   requested capital    a stated step on top of it; after = current + requested (exact)
 *   criteria             total 7; met now 5 or 6; met after approval 7 (the gate counts every criterion)
 *   quorum               the inbox row's own (APPROVAL_ROWS / the generated universe)
 *
 * The inbox row, the review (R2) detail, the capital preview, the evidence read and the history subject all read this one record, so a number
 * printed in one place is the number printed in the others. A SIMULATED fixture fact: nothing here is a source fact, a limit or a permission.
 * Money is exact decimal text, sums are BigInt cents, weights are 1 place truncated BigInt ratios; no float.
 */
import { createHash } from "node:crypto";

import { APPROVAL_ROWS } from "../src/execution/api/fixtureData";
import { scaled } from "./bffScale";
import { fromCents, NATIVE_ALPHAS, toCents } from "./bffWorld";
// ===== WP-B2-A begin: a request of the world's alphas is derived from the alpha's stage history (bffWorldGovernance), not from a hash of its id
import { capitalOf, inboxViewOf, overlayWorldR2, worldApproval, worldCapitalPreview, worldEvidence, type WorldApproval } from "./bffWorldGovernance";
// ===== WP-B2-A end

/**
 * F3b: the request as THIS lane's inbox lists it. The legacy inbox (`APPROVAL_ROWS`: AP-352, AP-201, EX-771, AP-360, AP-311) keeps those requests waiting
 * while the world has decided some of them, so the review, the capital and the evidence of a request such a row lists tell the waiting story (the row's quorum
 * and age; the books' allocation raised by the requested step). A request no legacy row lists is the world's own record.
 */
function viewOf(approvalId: string): WorldApproval | undefined {
  const row = APPROVAL_ROWS.find((candidate) => candidate.approval_id === approvalId) ?? null;
  return row === null ? undefined : inboxViewOf(approvalId, row); // undefined: no legacy row lists it, so the world's own record is the one story
}
/**
 * The evidence read answers for the lane that asks: the fixture BFF's populated lane serves the world's inbox (a decided request is a decided record), the
 * Playwright lane serves the legacy inbox (`withInboxView`): the same request, as that inbox shows it.
 */
let inboxEvidence = 0;
export function withInboxView<T>(read: () => T): T {
  inboxEvidence += 1;
  try { return read(); } finally { inboxEvidence -= 1; }
}

export interface ApprovalRecord {
  approvalId: string;
  gate: string | null;
  portfolioId: string;
  portfolioName: string;
  currency: string;
  /** What the portfolio holds allocated now, exact decimal text. */
  current: string;
  /** The increase this approval asks for. */
  requested: string;
  /** current + requested. */
  after: string;
  /** The portfolio's share of the three native portfolios' allocation, before and after, 1 place, percent text. */
  weightBefore: string;
  weightAfter: string;
  criteriaMet: number;
  criteriaTotal: number;
  quorumMet: number | null;
  quorumRequired: number | null;
}

const PORTFOLIOS: readonly { id: string; name: string }[] = [
  { id: "pf_TEST_ONLY_satellite", name: "Satellite" },
  { id: "pf_TEST_ONLY_core", name: "Core" },
  { id: "pf_TEST_ONLY_canary", name: "Canary" },
];
/** The steps a request may ask for, in cents (5,000.00 to 25,000.00). */
const STEPS: readonly bigint[] = [500_000n, 1_000_000n, 1_500_000n, 2_500_000n];

const hash = (id: string): number => createHash("sha256").update(`wpe-approval:${id}`).digest().readUInt32BE(0);

/** The world's allocation of one portfolio, in cents: the real-funded (live) deployments booked in it (what the Portfolios register states as Allocated). */
export const portfolioAllocationCents = (portfolioId: string): bigint => {
  // WP-B2-A: the figure the Portfolios register and the capital read state as Allocated is the book of the environment the portfolio opens on: its real-funded (live) deployments, else Sandbox, else Paper
  const booked = NATIVE_ALPHAS.flatMap((alpha) => alpha.deployments).filter((d) => d.portfolioId === portfolioId);
  const environment = (["live", "sandbox", "paper"] as const).find((env) => booked.some((d) => d.environment === env));
  return booked.filter((d) => d.environment === environment).reduce((sum, d) => sum + toCents(d.allocation), 0n);
};

const percent = (part: bigint, whole: bigint): string => {
  if (whole <= 0n) return "0.0";
  const tenths = part * 1000n / whole;
  return `${tenths / 10n}.${tenths % 10n}`;
};

/** The one row the inbox holds for this id (native rows first, then the generated universe). */
function inboxRowOf(approvalId: string): Record<string, unknown> | null {
  const all = [...APPROVAL_ROWS, ...scaled().approvals];
  return all.find((row) => row.approval_id === approvalId) ?? null;
}

export function approvalRecord(approvalId: string): ApprovalRecord {
  // ===== WP-B2-A begin
  const world = viewOf(approvalId) ?? worldApproval(approvalId); // F3b: the request as the lane's inbox lists it, else the world's own record
  if (world !== undefined) {
    const capital = capitalOf(world);
    return {
      approvalId, gate: world.gate, portfolioId: capital.portfolioId, portfolioName: capital.portfolioName, currency: capital.currency,
      current: capital.before, requested: capital.requested, after: capital.after, weightBefore: capital.weightBefore, weightAfter: capital.weightAfter,
      criteriaMet: world.status === "APPROVED" ? 7 : 6, criteriaTotal: 7, quorumMet: world.quorumMet, quorumRequired: world.quorumRequired,
    };
  }
  // ===== WP-B2-A end
  const seed = hash(approvalId);
  const portfolio = PORTFOLIOS[seed % PORTFOLIOS.length]!;
  const step = STEPS[(seed >>> 4) % STEPS.length]!;
  const current = portfolioAllocationCents(portfolio.id);
  const total = PORTFOLIOS.reduce((sum, p) => sum + portfolioAllocationCents(p.id), 0n);
  const row = inboxRowOf(approvalId);
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);
  return {
    approvalId,
    gate: typeof row?.gate === "string" ? row.gate : null,
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    currency: "USDT",
    current: fromCents(current),
    requested: fromCents(step),
    after: fromCents(current + step),
    weightBefore: percent(current, total),
    weightAfter: percent(current + step, total + step),
    criteriaMet: 5 + ((seed >>> 8) % 2),
    criteriaTotal: 7,
    quorumMet: num(row?.quorum_met),
    quorumRequired: num(row?.quorum_required),
  };
}

/** `85000.00` -> `85,000.00` (the review's capital rows print grouped text). */
export const grouped = (decimal: string): string => {
  const [whole = "0", fraction] = decimal.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${digits}${fraction === undefined ? "" : `.${fraction}`}`;
};

/** A title or label that names the placeholder target, restated with the portfolio the record names. */
export const restateTarget = (text: string, record: ApprovalRecord): string => text.split("PF-MAIN").join(record.portfolioName);

/* ── the reads that carry the record ────────────────────────────────────── */

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** `GET /governance/approvals`: a row whose title names the placeholder portfolio names the record's. */
export function overlayInboxSubjects(body: Obj): Obj {
  const out = clone(body);
  const page = out.page;
  if (!isObj(page) || !Array.isArray(page.rows)) return out;
  for (const row of page.rows) {
    const id = isObj(row) ? (typeof row.id === "string" ? row.id : row.approval_id) : null;
    if (!isObj(row) || typeof id !== "string") continue;
    for (const key of ["subject", "subject_label"] as const) {
      if (typeof row[key] === "string" && (row[key] as string).includes("PF-MAIN")) {
        const record = approvalRecord(id);
        row[key] = restateTarget(row[key] as string, record);
        if ("portfolio_id" in row) row.portfolio_id = record.portfolioId;
      }
    }
  }
  return out;
}

/** `GET /governance/approvals/history`: the same restatement on each subject. */
export function overlayHistorySubjects(body: Obj): Obj {
  const out = clone(body);
  const page = out.page;
  if (!isObj(page) || !Array.isArray(page.rows)) return out;
  for (const row of page.rows) {
    if (!isObj(row) || typeof row.subject !== "string" || typeof row.approval_id !== "string" || !row.subject.includes("PF-MAIN")) continue;
    row.subject = restateTarget(row.subject, approvalRecord(row.approval_id));
  }
  return out;
}

/** `GET /governance/approvals/{id}/r2`: the review's target, requested amount, capital rows and quorum are the record's. */
export function overlayR2Review(body: Obj, approvalId: string): Obj {
  // ===== WP-B2-A begin
  if (worldApproval(approvalId) !== undefined) return overlayWorldR2(body, approvalId, viewOf(approvalId)) as Obj;
  // ===== WP-B2-A end
  const out = clone(body);
  const record = approvalRecord(approvalId);
  if (isObj(out.approval)) {
    const approval = out.approval;
    approval.portfolio_id = record.portfolioId;
    approval.currency = record.currency;
    approval.requested_amount = record.requested;
    if (typeof approval.subject_label === "string") approval.subject_label = restateTarget(approval.subject_label, record);
    if (record.quorumMet !== null) approval.quorum_met = record.quorumMet;
    if (record.quorumRequired !== null) approval.quorum_required = record.quorumRequired;
  }
  if (isObj(out.capture_context) && Array.isArray(out.capture_context.candidates)) {
    for (const candidate of out.capture_context.candidates) if (isObj(candidate)) candidate.portfolio_id = record.portfolioId;
  }
  // The world publishes the allocation and the share; it publishes no ceiling and no top-3 concentration, so those two rows are not drawn.
  out.capital = [
    { label: "allocated capital", currency: record.currency, before: grouped(record.current), after: grouped(record.after) },
    { label: "portfolio weight", currency: "%", before: record.weightBefore, after: record.weightAfter },
  ];
  return out;
}

/** `GET /approvals/{id}/capital-preview`: the same figures, with the headroom arithmetic done in cents here (the producer), not in the page. */
export function overlayCapitalPreview(body: Obj, approvalId: string): Obj {
  // ===== WP-B2-A begin
  const fromWorld = worldCapitalPreview(body, approvalId, viewOf(approvalId));
  if (fromWorld !== null) return fromWorld as Obj;
  // ===== WP-B2-A end
  const out = clone(body);
  const analytics = out.analytics;
  if (!isObj(analytics) || !isObj(analytics.data)) return out;
  const record = approvalRecord(approvalId);
  const data = analytics.data;
  const before = toCents(record.current);
  const after = toCents(record.after);
  const used = 10_000n;
  const reserved = 2_500n;
  const maximum = after * 2n;
  Object.assign(data, {
    portfolio_id: record.portfolioId,
    currency: record.currency,
    requested_amount: record.requested,
    allocated_before: record.current,
    allocated_after: record.after,
    maximum_allocated: fromCents(maximum),
    used: fromCents(used),
    reserved: fromCents(reserved),
    available_before: fromCents(before - used - reserved),
    available_after: fromCents(after - used - reserved),
    allocation_headroom_before: fromCents(maximum - before),
    allocation_headroom_after: fromCents(maximum - after),
  });
  return out;
}

/** The evidence read's diff, preview sentence and criteria count, from the record (the fixture-bff review lane calls this for `/evidence`). */
export function evidenceFromRecord(approvalId: string): { portfolioId: string | null; environment?: string; changes: Obj[]; whatChanges: (obligations: number) => string; countsAs: { met_after: number; required: number } } {
  // ===== WP-B2-A begin
  const fromWorld = worldEvidence(approvalId, inboxEvidence > 0 ? viewOf(approvalId) : undefined);
  if (fromWorld !== null) return fromWorld;
  // ===== WP-B2-A end
  const record = approvalRecord(approvalId);
  return {
    portfolioId: record.portfolioId,
    changes: [
      { label: "Allocated capital", before: record.current, after: record.after, unit: "MONEY" },
      { label: "Criteria met", before: String(record.criteriaMet), after: String(record.criteriaTotal), unit: "COUNT" },
      { label: "Reviewer note", before: null, after: "Added", unit: "TEXT" },
    ],
    whatChanges: (obligations) => `Allocated capital of ${record.portfolioName} (${record.portfolioId}) moves from ${grouped(record.current)} to ${grouped(record.after)} ${record.currency}; the gate counts ${record.criteriaTotal} of ${record.criteriaTotal} criteria as met after approval. ${obligations === 0 ? "Nothing stays open." : `${obligations} obligations stay open.`}`,
    countsAs: { met_after: record.criteriaTotal, required: record.criteriaTotal },
  };
}
