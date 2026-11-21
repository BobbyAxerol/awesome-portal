/**
 * A quantity that keeps the places its column was padded to (`padDecimals.ts`): `18.0000` stays `18.0000`, so the digits of a column line up.
 * The boundary reader still decides whether the text is a readable exact decimal; the display only adds thousands separators to the integer
 * part and leaves the fraction exactly as the column's rule wrote it.
 */
import { NO_VALUE_COPY, UNREADABLE_COPY } from "../../blocks";
import { readDecimal } from "../../boundary";

export function QtyCell({ value }: { value: string | null }) {
  if (value === null) return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  const decimal = readDecimal(value, { unit: "qty" });
  if (decimal === null) return <span className="exec-blk-na">{UNREADABLE_COPY}</span>;
  const negative = value.startsWith("-");
  const [whole = "0", fraction] = (negative ? value.slice(1) : value).split(".");
  const shown = `${negative ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
  return (
    <span className="exec-blk-num" title={decimal.full} data-full={decimal.full}>
      {shown}
    </span>
  );
}
