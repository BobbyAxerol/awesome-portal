/**
 * The V2 view of a stage `Fact` (BE-P2 / BE-P3, `execution/stageFacts.ts`): a value the screen may print, or the
 * server's reason for not publishing it. Shared by the Canary, Sandbox, Live and Paper workbench readers so one rule
 * decides what an AVAILABLE and a NOT_PUBLISHED fact become.
 *
 * - `cell(...)` returns `null` when the member is ABSENT or was REFUSED by the closed reader (an older body, a SCOPED_V2
 *   body, a malformed one): the screen prints `Not published (FE-xxx)` and has no reason code to show. It never turns
 *   an unreadable member into a value.
 * - a decimal that fails the boundary reader is `unreadable`, never a number the screen prints.
 * - time facts become epoch ms for the boundary's `formatAsOf`; they are never compared with "now" here.
 */
import type { ReconciliationVerdict, RuntimeWord, SourceFigure, StageFacts, Fact } from "../../stageFacts";
import { readDecimal, type BoundaryDecimal } from "../boundary";
import type { ExactUnit } from "../../formatExact";

/** A published value, or the server's reason for not publishing it. */
export type FactCell<T> = { kind: "value"; value: T } | { kind: "not-published"; reasonCode: string };

/** A decimal as the screen may print it: the published value, or one that could not be read. */
export type DecimalValue = { kind: "value"; decimal: BoundaryDecimal } | { kind: "unreadable" };

/** What a `map` returns for a value it cannot read (a `null` may be a legitimate published value, e.g. "no envelope exists"). */
export const UNREADABLE: unique symbol = Symbol("unreadable");

/** A Fact mapped through `map`; `UNREADABLE` from `map` drops the cell to `null` (the member reads as absent). */
export function cell<T, U>(fact: Fact<T> | null | undefined, map: (value: T) => U | typeof UNREADABLE): FactCell<U> | null {
  if (fact === null || fact === undefined) return null;
  if (fact.availability === "NOT_PUBLISHED") return { kind: "not-published", reasonCode: fact.reasonCode };
  const value = map(fact.value);
  return value === UNREADABLE ? null : { kind: "value", value };
}

export function decimalValue(value: string, unit: ExactUnit): DecimalValue {
  const decimal = readDecimal(value, { unit });
  return decimal === null ? { kind: "unreadable" } : { kind: "value", decimal };
}

/** A decimal fact for the screen's `DecimalCell` rendering. */
export function decimalCell(fact: Fact<string> | null | undefined, unit: ExactUnit): FactCell<DecimalValue> | null {
  return cell(fact, (value) => decimalValue(value, unit));
}

/** Epoch ms of a timestamp the closed reader already validated. */
export function msOf(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isSafeInteger(ms) ? ms : null;
}

export function timeCell(fact: Fact<string> | null | undefined): FactCell<number> | null {
  return cell(fact, (iso) => msOf(iso) ?? UNREADABLE);
}

/** The reason code of a cell that is not published, else `undefined` (for a tooltip). */
export function reasonOf<T>(c: FactCell<T> | null | undefined): string | undefined {
  return c !== null && c !== undefined && c.kind === "not-published" ? c.reasonCode : undefined;
}

/* ── the facts every stage screen reads the same way ─────────────────────── */

export interface RuntimeFact {
  state: FactCell<RuntimeWord>;
  sinceMs: FactCell<number>;
}

export interface ReconciliationFact {
  verdict: FactCell<ReconciliationVerdict>;
  openFindingCount: FactCell<number>;
  /** AVAILABLE only when the server proved it (an exact 0 with nothing open). */
  unknownOrderCount: FactCell<number>;
  asOfMs: FactCell<number>;
}

/** `stage_facts.runtime`; `null` = the body carries none or it was refused. */
export function runtimeFactOf(facts: StageFacts | null): RuntimeFact | null {
  if (facts === null) return null;
  const state = cell(facts.runtime.state, (word) => word);
  const sinceMs = timeCell(facts.runtime.since);
  return state === null || sinceMs === null ? null : { state, sinceMs };
}

/** `stage_facts.reconciliation`: a statement about the findings relation, not a reconciliation run. */
export function reconciliationFactOf(facts: StageFacts | null): ReconciliationFact | null {
  if (facts === null) return null;
  const r = facts.reconciliation;
  const verdict = cell(r.verdict, (word) => word);
  const openFindingCount = cell(r.openFindingCount, (n) => n);
  const unknownOrderCount = cell(r.unknownOrderCount, (n) => n);
  const asOfMs = timeCell(r.asOf);
  return verdict === null || openFindingCount === null || unknownOrderCount === null || asOfMs === null
    ? null
    : { verdict, openFindingCount, unknownOrderCount, asOfMs };
}

/** The Internal / Broker / Difference row of one figure. */
export interface FigureRow {
  key: SourceFigure["key"];
  label: string;
  /** A currency word, `COUNT`, or `null` when the server states no unit. */
  unit: string | null;
  internal: FactCell<DecimalValue>;
  /** `null` = withheld by the broker-suppression strip (Live), which is not the same as "not published". */
  broker: FactCell<DecimalValue> | null;
  /** The SERVER's internal minus broker; the browser never subtracts. `null` as for `broker`. */
  difference: FactCell<DecimalValue> | null;
}

type FigureInput = Omit<SourceFigure, "broker" | "difference"> & { broker: SourceFigure["broker"] | null; difference: SourceFigure["difference"] | null };

/** `source_figures` in the published order. Positions and open orders are counts; the others are money. */
export function figureRowsOf(figures: readonly FigureInput[] | null): readonly FigureRow[] | null {
  if (figures === null) return null;
  const out: FigureRow[] = [];
  for (const figure of figures) {
    const unit: ExactUnit = figure.key === "positions" || figure.key === "open_orders" ? "count" : "money";
    const internal = decimalCell(figure.internal, unit);
    const broker = figure.broker === null ? null : decimalCell(figure.broker, unit);
    const difference = figure.difference === null ? null : decimalCell(figure.difference, unit);
    if (internal === null || (figure.broker !== null && broker === null) || (figure.difference !== null && difference === null)) return null;
    out.push({ key: figure.key, label: figure.label, unit: figure.unit, internal, broker, difference });
  }
  return out;
}
