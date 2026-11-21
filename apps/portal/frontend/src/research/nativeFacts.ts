/**
 * Words for the native route recipes (bracket / reactive / event-driven): fixed Delta inputs on the pinned QuantBT engine, ONE execution,
 * not a scalar optimizer. Every fact is the served one; nothing is defaulted.
 */
import type { ProfileNativeInput } from "./dataDeclarationV2";

const ROUTE_WORDS: Readonly<Record<string, string>> = {
  intrabar_bracket: "Bracket",
  reactive: "Reactive",
  event_driven: "Event-driven",
  pct_equity: "Percent equity",
  signal_notional: "Notional",
};

export function routeWord(route: string | null | undefined): string {
  if (route === null || route === undefined || route === "") return "";
  return ROUTE_WORDS[route] ?? route.replace(/_/g, " ");
}

export const NATIVE_ROUTES: ReadonlySet<string> = new Set(["intrabar_bracket", "reactive", "event_driven"]);

/** The execution clock in words: when the known close turns into an execution. */
export function clockWords(clock: string): string {
  if (clock === "KNOWN_CLOSE_NEXT_BAR_INTRABAR") return "known close, executes next bar intrabar";
  if (clock === "KNOWN_CLOSE_NEXT_BAR_CLOSE") return "known close, executes at the next bar close";
  return clock.toLowerCase().replace(/_/g, " ");
}

const pct = (fraction: string) => `${Number((Number(fraction) * 100).toPrecision(6))}%`;
const money = (value: string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function nativeLines(input: ProfileNativeInput): readonly string[] {
  return [
    clockWords(input.executionClock),
    ...(input.bracket ? [`stop ${pct(input.bracket.stopFraction)} · take-profit ${pct(input.bracket.takeProfitFraction)} (${input.bracket.levelMode.replace(/_/g, " ")})`] : []),
    `fixed target ${money(input.targetNotional)} notional (${input.positionUnit.toLowerCase().replace(/_/g, " ")})`,
    `capital ${money(input.account.initialCapital)} · leverage ${input.account.leverage}× · fee ${pct(input.account.oneWayFeeRate)} per side · funding ${input.account.fundingEnabled ? "on" : "off"}`,
    "fixed Delta input, one execution — not a scalar optimizer",
  ];
}
