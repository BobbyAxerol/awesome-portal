/**
 * CapGauge (hi-fi modules/stage.js `G.gauge`, the `.gg` bar): how much of a cap is used,
 * with a reference mark at 80%.
 *
 * D7 (S3 plan): the gauge is drawn ONLY from a ratio the server published. It never
 * divides consumed by approved in the browser (certification.ts rule 2: no headroom
 * arithmetic at the client). With no published ratio it prints the honest state:
 * `Not published (FE-071)` when nothing was passed, `Not available · unreadable value`
 * when the value is not a plain non-negative decimal. There is no empty bar and no 0%.
 *
 * The ratio is a decimal FRACTION as the server wrote it ("0.76" is 76%). Moving the
 * decimal point two places for the readout is formatting, done on the string; the bar
 * width is the only place a number is used, and it is a drawing, not a figure. The 80%
 * mark and the amber/red thresholds (80%, 95%) are the hi-fi's presentation marks, not a
 * policy the server set: the gauge never says "breach", only how full the bar is.
 */
import { readDecimal } from "../boundary";
import { NO_VALUE_COPY, UNREADABLE_COPY } from "./metric";
import { NotPublished, type NotPublishedId } from "./notPublished";
import "../css/stage.css";

export interface CapGaugeProps {
  /**
   * The server-published used ratio as an exact decimal fraction string.
   * `undefined` = not published; `null` or anything unreadable = the payload is malformed.
   */
  ratio?: string | null;
  /** What is capped ("Capital", "Gross notional"); names the gauge for assistive tech. */
  label: string;
  /** The open request that will publish the ratio. Default FE-071. */
  fe?: NotPublishedId;
  /** The server's reason code when it said the ratio is not published; carried in the tooltip. */
  reasonCode?: string | null;
  /** Print the readout ("76.00% used") beside the bar. Default true. */
  showText?: boolean;
}

/** A plain non-negative decimal, no sign, no exponent, no leading zeros. */
const FRACTION = /^(0|[1-9]\d*)(\.\d+)?$/;

/** "0.7634" -> "76.34": the decimal point moves two places, on the string. */
export function fractionToPercent(fraction: string): string | null {
  if (!FRACTION.test(fraction)) return null;
  const [whole = "0", rest = ""] = fraction.split(".");
  const padded = rest.padEnd(2, "0");
  const integer = `${whole}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(2);
  return decimals === "" ? integer : `${integer}.${decimals}`;
}

/** Red only ABOVE the approved limit; consumed == limit is AT LIMIT (warn tone, said in words), not a breach (QA6 R5-07). */
export function toneOfUsed(percent: number): "ok" | "warn" | "bad" {
  if (percent > 100) return "bad";
  if (percent >= 80) return "warn";
  return "ok";
}

export function CapGauge({ ratio, label, fe = "FE-071", reasonCode, showText = true }: CapGaugeProps) {
  if (ratio === undefined) {
    return (
      <span className="exec-gauge-wrap" data-state="not-published">
        <NotPublished id={fe} titleReason={reasonCode} collapsible>Used</NotPublished>
      </span>
    );
  }
  const percent = typeof ratio === "string" ? fractionToPercent(ratio) : null;
  const shown = percent === null ? null : readDecimal(percent, { unit: "pct" });
  if (percent === null || shown === null) {
    return (
      <span className="exec-gauge-wrap" data-state="unreadable">
        <span className="exec-blk-na">{ratio === null ? UNREADABLE_COPY : `${NO_VALUE_COPY} · unreadable value`}</span>
      </span>
    );
  }
  // Drawing only: the bar is clamped to its track, the readout above keeps the exact figure.
  const drawn = Math.min(100, Math.max(0, Number(percent)));
  const tone = toneOfUsed(Number(percent));
  const text = `${shown.display}% used${Number(percent) === 100 ? " · at limit" : Number(percent) > 100 ? " · over limit" : ""}`;
  return (
    <span className="exec-gauge-wrap" data-state="ready">
      <span className="exec-gauge" role="img" aria-label={`${label}: ${text}`} data-full={ratio} title={`${ratio} of the cap`}>
        <span className="exec-gauge-fill" data-tone={tone} style={{ width: `${drawn}%` }} />
        <span className="exec-gauge-mark" data-at="80" />
      </span>
      {showText ? <span className="exec-gauge-text">{text}</span> : null}
    </span>
  );
}
