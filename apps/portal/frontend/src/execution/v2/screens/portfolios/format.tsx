/**
 * Cell-level words shared by Portfolios, Portfolio 360 and Compare.
 *
 * - `Np` is the one `Not published (FE-xxx)` cell;
 * - `Money` prints a published decimal string through the boundary reader (the
 *   digits are `formatExact` of the original, the original rides on `title`),
 *   or says why there is nothing to print;
 * - `MoneyList` prints one line per currency. Currencies are never added, so
 *   the list is the whole answer: there is no total beside it.
 */
import { Fragment, type ReactNode } from "react";

import type { CurrencyValue } from "../../../api/profileRead";
import { readDecimal } from "../../boundary";
import type { FlagKind } from "../../flagKinds";
import { NOT_PUBLISHED_WORD, type Unpublished } from "./fe";

import "../../css/portfolios.css";

export function Np({ fact, children }: { fact: Unpublished; children?: ReactNode }) {
  return (
    <span className="exec-pf-np" title={`${fact.fe} · ${fact.what}`}>
      {NOT_PUBLISHED_WORD}
      <span className="exec-blk-sr"> <FeIds fe={fact.fe} /></span>
      {children ? <> {children}</> : null}
    </span>
  );
}

/** `(FE-005, FE-025)`, each id kept whole: a narrow cell breaks between ids, never inside one. Reads as the same text. */
function FeIds({ fe }: { fe: string }) {
  const ids = fe.split(", ");
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 ? " " : null}
          <span className="exec-pf-fe">{i === 0 ? "(" : ""}{id}{i === ids.length - 1 ? ")" : ","}</span>
        </Fragment>
      ))}
    </>
  );
}

/** A value the source did not send. It is a statement, never an empty cell. */
export function Absent({ reason }: { reason?: string }) {
  // The reason stays in the title and in hidden text; the visible word is "Not available".
  return (
    <span className="exec-pf-na" title={reason}>
      Not available
      {reason ? <span className="exec-blk-sr"> · {reason}</span> : null}
    </span>
  );
}

export interface MoneyProps {
  /** A decimal STRING. Anything else is unreadable, not zero. */
  value: unknown;
  currency?: string | null;
  /** Tone by published sign; only for a signed change (position PnL). */
  signed?: boolean;
  /** What to say when there is no value at all. */
  absent?: ReactNode;
}

export function Money({ value, currency, signed = false, absent }: MoneyProps) {
  if (value === null || value === undefined) return <>{absent ?? <Absent />}</>;
  const decimal = readDecimal(value, { unit: "money" });
  if (decimal === null) return <Absent reason="unreadable value" />;
  return (
    <span className="exec-pf-money">
      <span className="exec-pf-num" data-full={decimal.full} data-tone={signed && decimal.tone !== "neutral" ? decimal.tone : undefined} title={decimal.full}>
        {decimal.display}
      </span>
      {currency ? <small className="exec-pf-unit"> {currency}</small> : null}
    </span>
  );
}

export function MoneyList({ entries, empty, signed = false }: { entries: readonly CurrencyValue[]; empty?: ReactNode; signed?: boolean }) {
  if (entries.length === 0) return <>{empty ?? <Absent />}</>;
  return (
    <span className="exec-pf-ccylist">
      {entries.map((entry) => (
        <Fragment key={entry.currency}>
          <Money value={entry.value} currency={entry.currency} signed={signed} />
        </Fragment>
      ))}
    </span>
  );
}

/** `SOURCE_LATEST_WINDOW` becomes `Source latest window`; the code stays on the title. */
export function humanize(code: string): string {
  const words = code.trim().toLowerCase().replace(/[_\s]+/g, " ");
  return words.length === 0 ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/** Environment word -> domain word. `live` is the only Real-funded environment (decision G2). */
export type Domain = "real" | "simulated" | "mixed" | "unknown";

export function domainOf(environments: readonly string[]): Domain {
  const real = environments.some((env) => env.toLowerCase() === "live");
  const simulated = environments.some((env) => ["paper", "sandbox"].includes(env.toLowerCase()));
  if (real && simulated) return "mixed";
  if (real) return "real";
  if (simulated) return "simulated";
  return "unknown";
}

export const DOMAIN_LABEL: Readonly<Record<Domain, string>> = {
  real: "Real-funded",
  simulated: "Simulated",
  mixed: "Real-funded and Simulated",
  unknown: "Domain not published",
};

const ENV_WORD: Readonly<Record<string, string>> = { live: "Live", paper: "Paper", sandbox: "Sandbox" };
export const envWord = (env: string): string => ENV_WORD[env.toLowerCase()] ?? humanize(env);

/** The freshness tier of a read, as a flag. Unknown words stay unknown; nothing becomes green by default. */
export function freshnessFlag(freshness: string | null): { kind: FlagKind; label: string } {
  switch ((freshness ?? "").toUpperCase()) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "AGING": return { kind: "stale", label: "Aging" };
    case "STALE": return { kind: "stale", label: "Stale" };
    default: return { kind: "unknown", label: freshness ? humanize(freshness) : "Freshness not published" };
  }
}
