/**
 * The display label of a source profile id (`PAPER_BINANCE_USDM` -> `Paper Binance USDM`).
 *
 * One place, so Overview and Operations name a profile the same way. A word is title-cased; a known market acronym keeps its
 * capitals (a generic "sentence case" turned the id into "Paper binance usdm", which reads as a typo). The id itself stays in the
 * caller's title; an unknown word is never dropped or translated.
 */
const ACRONYMS: ReadonlySet<string> = new Set(["USDM", "COINM", "OKX", "USD", "USDT", "API", "BTC", "ETH"]);

export function profileLabel(id: string): string {
  const words = id.trim().split(/[_\s-]+/).filter((word) => word !== "");
  if (words.length === 0) return id;
  // The product word is "Real-funded" (one hyphenated word, as on the context bar), not "Real funded".
  const real = words.length >= 2 && words[0]!.toUpperCase() === "REAL" && words[1]!.toUpperCase() === "FUNDED";
  const rest = real ? words.slice(2) : words;
  return [...(real ? ["Real-funded"] : []), ...rest]
    .map((word) => {
      if (word === "Real-funded") return word;
      const upper = word.toUpperCase();
      return ACRONYMS.has(upper) ? upper : upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(" ");
}
