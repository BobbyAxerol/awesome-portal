/**
 * UTC milliseconds as `YYYY-MM-DD HH:mmZ` — the one timestamp format Screen 08
 * prints. Moved here from `ExecuteDetail.tsx` unchanged so Screen 09 prints the
 * same string from the same function instead of a second copy of it.
 */
export function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace("T", " ") + "Z";
}
