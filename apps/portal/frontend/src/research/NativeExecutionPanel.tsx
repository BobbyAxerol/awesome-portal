/**
 * S04 — the compact native route result (`research.native-route-result.v1`).
 *
 * Present only for the fixed Three Window native routes (bracket / reactive / event-driven): one
 * execution, not a scalar WFO or optimizer. Every value is printed as served: a decimal string is
 * not reformatted (`"0"` is a real zero), a `NOT_PUBLISHED` cost or a null count says
 * `not published` and never 0 or a dash. Nothing here is a Portal P&L, a broker lifecycle or a
 * methodology/optimizer ledger.
 */
import { Absence } from "./Absence";
import type { EvidenceHub } from "./evidenceClient";
import { humanise } from "./humanise";

export type NativeExecution = NonNullable<EvidenceHub["core"]["native_execution"]>;

const ROUTE: Record<string, string> = { intrabar_bracket: "Bracket", reactive: "Reactive", event_driven: "Event-driven" };
const CLOCK: Record<string, string> = {
  KNOWN_CLOSE_NEXT_BAR_INTRABAR: "known close, executes next bar intrabar",
  KNOWN_CLOSE_NEXT_BAR_CLOSE: "known close, executes next-bar close",
};
const AUTHORITY: Record<string, string> = { PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL: "engine accounting, not a Portal P&L" };
const REPLAY: Record<string, string> = { RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS: "retained engine audit — not broker events" };
const UNIT: Record<string, string> = { CONTRACT_QUANTITY: "contract quantity" };

/** A served token in words: the known sentence, else the humanised token; the raw token stays in the tooltip. */
const words = (map: Record<string, string>, token: string): string => map[token] ?? humanise(token);

type Cost = NativeExecution["fees"];

function CostFact({ cost, name }: { cost: Cost; name: string }) {
  if (cost.state === "AVAILABLE" && typeof cost.total === "string") {
    return <span data-native-value={name} data-native-state="AVAILABLE">{cost.total}</span>;
  }
  return (
    <span data-native-value={name} data-native-state={cost.state}>
      <Absence reason={cost.reason_code ?? null} state="NOT_PUBLISHED" />
    </span>
  );
}

function Count({ value, name }: { value: number | null | undefined; name: string }) {
  if (typeof value !== "number") {
    return <span data-native-value={name} data-native-state="NOT_PUBLISHED"><Absence reason={null} state="NOT_PUBLISHED" /></span>;
  }
  return <span data-native-value={name} data-native-state="AVAILABLE">{String(value)}</span>;
}

export function NativeExecutionPanel({ native }: { native: NativeExecution | null | undefined }) {
  if (!native) return null;
  const rows: { id: string; label: string; value: React.ReactNode; title?: string }[] = [
    { id: "route", label: "route", value: words(ROUTE, native.execution_route), title: native.execution_route },
    { id: "clock", label: "clock", value: words(CLOCK, native.clock), title: native.clock },
    { id: "input", label: "input", value: humanise(native.input_protocol), title: native.input_protocol },
    { id: "authority", label: "authority", value: words(AUTHORITY, native.authority), title: native.authority },
    {
      id: "unit",
      label: "position",
      value: `${words(UNIT, native.position_unit)} · target notional ${native.target_notional}`,
      title: native.position_unit,
    },
    { id: "fees", label: "fees", value: <CostFact cost={native.fees} name="fees" />, title: "Total fees the engine published for the whole child tape." },
    { id: "funding", label: "funding", value: <CostFact cost={native.funding} name="funding" />, title: "Total funding the engine published for the whole child tape." },
    { id: "fills", label: "fills", value: <Count value={native.fills_count} name="fills_count" /> },
    { id: "orders", label: "orders", value: <Count value={native.orders_count} name="orders_count" /> },
    { id: "scope", label: "cost scope", value: humanise(native.cost_scope), title: native.cost_scope },
    { id: "replay", label: "replay", value: words(REPLAY, native.replay_authority), title: native.replay_authority },
    {
      id: "optimizer",
      label: "optimizer",
      value: "not applicable — fixed input, not a scalar optimizer",
      title: "A native route runs one fixed Three Window execution; it has no methodology or optimizer ledger.",
    },
  ];
  return (
    <section
      data-native-execution={native.execution_route}
      data-screen-label="Native execution"
      aria-label="Native execution"
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" }}
    >
      <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
        Native execution
      </h3>
      <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {rows.map((row) => (
          <div key={row.id} className="flex min-w-0 flex-col gap-0.5" data-native-fact={row.id} title={row.title}>
            <dt className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              {row.label}
            </dt>
            <dd className="mono m-0 text-[12px]" style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
