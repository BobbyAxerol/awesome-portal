type Scalar = string | number | boolean | null | readonly (string | number | boolean | null)[];
export type ScreenRecord = Record<string, Scalar>;

interface Capability {
  capability_id?: unknown;
  state?: unknown;
  reason_code?: unknown;
}

interface Projection {
  epoch: string;
  sequence: number;
  sourceCursor: string | null;
  payloadDigest: string;
  lastSuccessfulRefreshAt: string;
}

/** Narrow, non-secret view of an already authenticated ProfileRead response. */
export class ProfileScreenSource {
  readonly connected: boolean;
  readonly deliveryProfile: string;
  readonly freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  readonly completeness: "COMPLETE" | "PARTIAL";
  readonly asOf: string | null;
  readonly readAt: string;
  readonly projection: Projection | null;
  private readonly data: Record<string, unknown>;
  private readonly capabilities: Capability[];

  constructor(private readonly source: Record<string, unknown>, readAt: string) {
    this.connected = source.state === "ready" || source.state === "empty" ||
      source.state === "stale" || source.state === "partial";
    this.deliveryProfile = typeof source.delivery_profile === "string"
      ? source.delivery_profile : "fixture";
    this.freshness = isFreshness(source.freshness) ? source.freshness : "UNKNOWN";
    this.completeness = source.completeness === "COMPLETE" ? "COMPLETE" : "PARTIAL";
    this.asOf = typeof source.as_of === "string" ? source.as_of : null;
    this.readAt = readAt;
    this.data = record(source.data);
    this.capabilities = Array.isArray(source.capabilities)
      ? source.capabilities.filter(isRecord) : [];
    this.projection = projection(source.projection);
  }

  rows(key: string): ScreenRecord[] {
    const value = this.data[key];
    return Array.isArray(value) ? value.filter(isRecord).map((item) => item as ScreenRecord) : [];
  }

  panel(
    panelId: string,
    authority: "EXECUTION" | "BROKER" | "DERIVED",
    keys: readonly string[],
    data: unknown,
    suppress = false,
  ) {
    const capabilityStates = keys.map((key) => this.capability(key));
    const unavailable = !this.connected || capabilityStates.every((item) => item.state === "UNAVAILABLE");
    const rows = keys.reduce((count, key) => count + this.rows(key).length, 0);
    const partial = capabilityStates.some((item) => item.state === "PARTIAL" || item.state === "UNAVAILABLE") ||
      this.completeness === "PARTIAL";
    const panelState = suppress ? "suppressed" : unavailable ? "unavailable"
      : this.freshness === "STALE" ? "stale" : rows === 0 ? "empty" : partial ? "partial" : "ready";
    const warningCodes = capabilityStates.flatMap((item) => item.reasonCode ? [item.reasonCode] : []);
    if (suppress && warningCodes.length === 0) warningCodes.push(`PHASE2_${normalize(panelId)}_SUPPRESSED`);
    if (unavailable && warningCodes.length === 0) warningCodes.push(`PHASE2_${normalize(panelId)}_UNAVAILABLE`);
    return {
      panel_id: panelId,
      source_authority: authority,
      panel_state: panelState,
      freshness_state: unavailable ? "UNKNOWN" : this.freshness,
      delivery_profile: this.deliveryProfile,
      source_verification_state: suppress || unavailable ? "UNAVAILABLE" : partial ? "PARTIAL" : "VERIFIED",
      as_of: unavailable ? null : this.asOf,
      read_at: this.readAt,
      age_seconds: unavailable || !this.asOf ? null : Math.max(0, Math.floor((Date.now() - Date.parse(this.asOf)) / 1000)),
      lag_ms: unavailable || !this.asOf ? null : Math.max(0, Date.now() - Date.parse(this.asOf)),
      source_cursor: this.projection?.sourceCursor ?? null,
      projection_epoch: this.projection?.epoch ?? null,
      projection_sequence: this.projection?.sequence ?? null,
      capability_snapshot_id: this.projection?.payloadDigest ?? null,
      data: suppress || unavailable ? null : data,
      warnings: [...new Set(warningCodes)].slice(0, 8).map((code) => ({ code })),
    };
  }

  collection(panelId: string, authority: "EXECUTION" | "BROKER", key: string) {
    const rows = this.rows(key).slice(0, 200);
    return {
      envelope: this.panel(panelId, authority, [key], { returned_count: rows.length }),
      exact_total: this.connected ? rows.length : null,
      returned_count: rows.length,
      next_cursor: null,
      previous_cursor: null,
      rows,
    };
  }

  private capability(key: string): { state: string; reasonCode: string | null } {
    const value = this.capabilities.find((item) => item.capability_id === `source.${key}`);
    return {
      state: typeof value?.state === "string" ? value.state : "UNAVAILABLE",
      reasonCode: typeof value?.reason_code === "string" ? value.reason_code : null,
    };
  }
}

export function decimalSum(rows: readonly ScreenRecord[], fields: readonly string[]): string | null {
  const values = rows.flatMap((row) => fields.flatMap((field) =>
    typeof row[field] === "string" && /^-?\d+(?:\.\d+)?$/.test(row[field] as string)
      ? [row[field] as string] : []));
  if (values.length === 0) return null;
  const scale = Math.max(...values.map((value) => value.split(".")[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    const negative = whole.startsWith("-");
    const digits = `${negative ? whole.slice(1) : whole}${fraction.padEnd(scale, "0")}`;
    return sum + BigInt(`${negative ? "-" : ""}${digits}`);
  }, 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function decimalAbsoluteSum(rows: readonly ScreenRecord[], field: string): string | null {
  return decimalSum(rows.map((row) => {
    const value = row[field];
    return typeof value === "string" && value.startsWith("-")
      ? { ...row, [field]: value.slice(1) } : row;
  }), [field]);
}

export function decimalSubtract(left: string, right: string): string | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(left) || !/^-?\d+(?:\.\d+)?$/.test(right)) return null;
  const scale = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const scaled = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const result = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
    return negative ? -result : result;
  };
  const result = scaled(left) - scaled(right);
  const negative = result < 0n;
  const digits = (negative ? -result : result).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function openOrders(rows: readonly ScreenRecord[]): ScreenRecord[] {
  const terminal = new Set(["FILLED", "CANCELED", "CANCELLED", "REJECTED", "EXPIRED", "CLOSED"]);
  return rows.filter((row) => !terminal.has(String(row.status ?? "UNKNOWN").toUpperCase()));
}

export function latest(rows: readonly ScreenRecord[], field: string): ScreenRecord | null {
  return [...rows].sort((left, right) => String(right[field] ?? "").localeCompare(String(left[field] ?? "")))[0] ?? null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function projection(value: unknown): Projection | null {
  if (!isRecord(value) || typeof value.epoch !== "string" || !Number.isSafeInteger(value.sequence) ||
      typeof value.payloadDigest !== "string" || typeof value.lastSuccessfulRefreshAt !== "string") return null;
  return {
    epoch: value.epoch,
    sequence: value.sequence as number,
    sourceCursor: typeof value.sourceCursor === "string" ? value.sourceCursor : null,
    payloadDigest: value.payloadDigest,
    lastSuccessfulRefreshAt: value.lastSuccessfulRefreshAt,
  };
}

function isFreshness(value: unknown): value is ProfileScreenSource["freshness"] {
  return value === "FRESH" || value === "AGING" || value === "STALE" || value === "UNKNOWN";
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
