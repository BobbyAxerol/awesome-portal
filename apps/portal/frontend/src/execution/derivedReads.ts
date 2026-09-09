/**
 * Phase 4 · four published reads that no screen was calling.
 *
 * Each of these routes has answered 200 on dev for weeks while the screen that
 * should show it either said nothing or inferred the same fact from somewhere
 * else. They are small, typed, and read exactly what the server sends — no
 * derivation, no defaults standing in for absent fields.
 */

const obj = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/* ── source health (EDS-05) ─────────────────────────────────────────────── */

export interface SourceHealthProfile {
  environment: string;
  profileId: string | null;
  state: string;
  reasonCode: string | null;
  freshness: string | null;
  completeness: string | null;
  asOf: string | null;
}

export interface SourceHealthRead {
  state: string;
  readAt: string | null;
  profiles: readonly SourceHealthProfile[];
}

export function readSourceHealthRead(raw: unknown): SourceHealthRead | null {
  const body = obj(raw);
  if (!body || body.schema_version !== "execution.derivation.source-health.v1") return null;
  const state = str(body.state);
  if (!state) return null;
  const rows = Array.isArray(body.profiles) ? body.profiles : [];
  return {
    state,
    readAt: str(body.read_at),
    profiles: rows.flatMap((entry) => {
      const row = obj(entry);
      const environment = row && str(row.environment);
      const rowState = row && str(row.state);
      if (!environment || !rowState) return [];
      return [{
        environment,
        profileId: str(row!.profile_id),
        state: rowState,
        reasonCode: str(row!.reason_code),
        freshness: str(row!.freshness),
        completeness: str(row!.completeness),
        asOf: str(row!.as_of),
      }];
    }),
  };
}

/* ── approval history (governance) ──────────────────────────────────────── */

/**
 * The envelope around `governance.approval-history.v1`.
 *
 * The **rows** are not parsed here: `readDecidedRow` in `api/rows.ts` already
 * reads exactly this row shape, gate vocabulary and outcome vocabulary
 * included, and a second reader for the same rows is how two screens end up
 * disagreeing about what "approved with conditions" means (§11).
 */
export interface ApprovalHistoryEnvelope {
  deliveryProfile: string | null;
  rawRows: readonly Record<string, unknown>[];
  totalCount: number | null;
  hasMore: boolean;
}

export function readApprovalHistoryEnvelope(raw: unknown): ApprovalHistoryEnvelope | null {
  const body = obj(raw);
  if (!body || body.schema_version !== "governance.approval-history.v1") return null;
  const page = obj(body.page);
  if (!page) return null;
  const rows = Array.isArray(page.rows) ? page.rows : [];
  return {
    deliveryProfile: str(body.delivery_profile),
    totalCount: int(page.total_count),
    hasMore: page.has_more === true,
    rawRows: rows.flatMap((entry) => (obj(entry) ? [obj(entry)!] : [])),
  };
}

/*
 * Binding detail is NOT here: `readBindingDetail` and `getBindingDetail`
 * already existed and already called `/broker-bindings/{id}` — what was
 * missing was a screen calling them. Phase 4 wires the caller, not a second
 * reader.
 */

/* ── conditional order group (EDS-05) ───────────────────────────────────── */

export interface ConditionalGroupLeg {
  legId: string;
  role: string | null;
  orderId: string | null;
  state: string | null;
}

export interface ConditionalGroupRead {
  groupId: string;
  contingency: string | null;
  state: string | null;
  legs: readonly ConditionalGroupLeg[];
}

export function readConditionalGroup(raw: unknown): ConditionalGroupRead | null {
  const body = obj(raw);
  if (!body || body.schema_version !== "execution.derivation.conditional-legs.v1") return null;
  const data = obj(body.data) ?? body;
  const groupId = str(data.group_id) ?? str(body.group_id);
  if (!groupId) return null;
  const legs = Array.isArray(data.legs) ? data.legs : [];
  return {
    groupId,
    contingency: str(data.contingency),
    state: str(data.state),
    legs: legs.flatMap((entry) => {
      const leg = obj(entry);
      const legId = leg && (str(leg.leg_id) ?? str(leg.client_order_id) ?? str(leg.order_id));
      if (!legId) return [];
      return [{
        legId,
        role: str(leg!.role) ?? str(leg!.leg_role),
        orderId: str(leg!.order_id),
        state: str(leg!.state) ?? str(leg!.status),
      }];
    }),
  };
}
