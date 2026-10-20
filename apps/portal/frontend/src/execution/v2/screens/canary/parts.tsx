/**
 * Small cells the Canary tabs share: an exact decimal fact, and the honest
 * "N of total" line for a capped table.
 */
import { NO_VALUE_COPY, NotPublished, UNREADABLE_COPY } from "../../blocks";
import { readDecimal, type SignTone } from "../../boundary";
import type { ExactUnit } from "../../../formatExact";
import type { DecimalFact } from "./readCanary";
import { FE } from "./model";

/** A published exact decimal; an unreadable one says so; an absent one says `Not available`. */
export function DecimalCell({ fact }: { fact: DecimalFact | null }) {
  if (fact === null) return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  if (fact.kind === "unreadable") return <span className="exec-blk-na">{UNREADABLE_COPY}</span>;
  return (
    <span className="exec-blk-num" title={fact.decimal.full} data-full={fact.decimal.full}>
      {fact.decimal.display}
    </span>
  );
}

/** A decimal string run through the boundary again at print time: a value that fails prints as unreadable, never as 0. */
export function ExactCell({ value, unit, suffix, signed = false }: { value: string | null; unit: ExactUnit; suffix?: string; signed?: boolean }) {
  if (value === null) return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  const decimal = readDecimal(value, { unit });
  if (decimal === null) return <span className="exec-blk-na">{UNREADABLE_COPY}</span>;
  const tone: SignTone = signed ? decimal.tone : "neutral";
  return (
    <span className="exec-blk-num" data-tone={tone === "neutral" ? undefined : tone} title={decimal.full} data-full={decimal.full}>
      {decimal.display}
      {suffix ?? ""}
    </span>
  );
}

/** `Not published (FE-072)` for a column or a panel whose rows the contract does not type; the server's reason code, when it gave one, is in the title. */
export function RowsNotPublished({ what, reasonCode }: { what: string; reasonCode?: string | null }) {
  return (
    <NotPublished id={FE.rows} titleReason={reasonCode}>
      {what}
    </NotPublished>
  );
}

/**
 * "200 of 5,000": what is on screen against what the server says exists. With no exact total the
 * line says so; a loaded list longer than the cap is cut and the cut is stated, never hidden.
 */
export function countLine(loaded: number, total: number | null, cap: number): string {
  const shown = Math.min(loaded, cap);
  if (total !== null) return `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  return loaded > cap ? `Top ${shown.toLocaleString("en-US")} of ${loaded.toLocaleString("en-US")} loaded · total not published` : `${shown.toLocaleString("en-US")} shown · total not published`;
}
