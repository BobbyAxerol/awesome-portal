/**
 * PHASE 1 (round 2) · one screen envelope, not two copies of the same rows.
 *
 * The screen services emit `panels.<panel>` and a `data.<panel>` map whose
 * entries are byte for byte the same rows. A38.5 makes `panels` canonical,
 * because it is the branch that carries state, coverage and clocks, and puts
 * everything that is not a panel — deployment, query, page window, observation
 * gate — under `screen_context`.
 *
 * The projection runs at the controller, on the way out. The services keep
 * emitting V1 unchanged, which is what A38.5 requires ("không thay shape V1
 * in-place") and what every existing contract test asserts against. A response
 * is therefore either V1 or V2 and never both, while V1 stays available for a
 * consumer that has not moved.
 */

/** Content negotiation, so V2 adds no route and inherits every guard V1 has. */
export const SCREEN_V2_MEDIA_TYPE = "application/vnd.portal.execution.screen.v2+json";

export function wantsScreenV2(accept: string | string[] | undefined): boolean {
  const header = Array.isArray(accept) ? accept.join(",") : accept ?? "";
  return header.includes(SCREEN_V2_MEDIA_TYPE);
}

interface PanelLike { data?: { rows?: unknown[] } | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Project a V1 screen envelope onto V2.
 *
 * The split uses insertion order, which the services fix: every key before
 * `panels` is envelope head, `data` is the duplicated map, and every key after
 * it is the screen's own context. A `data` entry that names a panel is the
 * duplicate this phase removes; one that does not — the resource shell's
 * `profile_coverage`, for instance — is real content and moves to context
 * rather than being dropped.
 *
 * A body without both `panels` and `data` is returned untouched: the Account
 * 360 screen has only `data`, and that branch is its only copy.
 */
export function screenEnvelopeV2From(v1: unknown): unknown {
  if (!isRecord(v1) || !isRecord(v1.panels) || !isRecord(v1.data)) return v1;
  const panels = v1.panels;
  const data = v1.data;

  const keys = Object.keys(v1);
  const dataIndex = keys.indexOf("data");
  const head: Record<string, unknown> = {};
  const context: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    if (key === "data" || key === "panels") return;
    if (index < dataIndex) head[key] = v1[key];
    else context[key] = v1[key];
  });
  for (const [key, value] of Object.entries(data)) {
    if (key in panels) continue;
    context[key] = value;
  }

  const schemaVersion = typeof head.schema_version === "string" && head.schema_version.endsWith(".v1")
    ? `${head.schema_version.slice(0, -3)}.v2` : head.schema_version;

  return { ...head, schema_version: schemaVersion, panels, screen_context: context };
}

export interface ScreenResponseMetrics {
  readonly named_operation: string;
  readonly contract: "v1" | "v2";
  readonly panel_count: number;
  readonly row_count: number;
  readonly uncompressed_bytes: number;
}

/**
 * Per named operation, never per resource id: a metric label built from a raw
 * identifier turns a dashboard into an unbounded cardinality leak.
 */
export function screenResponseMetrics(
  namedOperation: string,
  contract: "v1" | "v2",
  body: unknown,
): ScreenResponseMetrics {
  const panels = (isRecord(body) && isRecord(body.panels) ? body.panels : {}) as Record<string, PanelLike>;
  let rows = 0;
  for (const panel of Object.values(panels)) rows += panel?.data?.rows?.length ?? 0;
  return {
    named_operation: namedOperation,
    contract,
    panel_count: Object.keys(panels).length,
    row_count: rows,
    uncompressed_bytes: Buffer.byteLength(JSON.stringify(body ?? null), "utf8"),
  };
}
