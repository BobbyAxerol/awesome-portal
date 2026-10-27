/**
 * A source's enum word as a word a person reads ("PARTIALLY_FILLED" is "Partially filled", "LIMIT" is "Limit"): letter case and separators only.
 * The wire value is unchanged and stays in the title of the cell; nothing is translated or invented.
 */
export function sentenceWord(value: string | null): string | null {
  if (value === null) return null;
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? value : words.charAt(0).toUpperCase() + words.slice(1);
}
