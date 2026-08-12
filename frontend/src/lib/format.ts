/** Formatting helpers (mono numeric style per design language). */
export function fmtNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function fmtPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function fmtMoney(value: number, symbol = "$"): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return `${symbol}${value.toFixed(2)}`;
}

export function fmtDate(iso: string | number | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDateTime(iso: string | number | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtShortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}