/**
 * The cross-cutting evidence the `compositions/*` routes carry.
 *
 * Four screens — Command Centre, Operations Queue, Waivers and the Admin
 * Action Drawer — each have a composition route that returns their own payload
 * plus four blocks the standalone routes do not: per-profile source health, a
 * redacted command journal, the canary twin comparison, and the command
 * authority. Measured 2026-09-08: 158 KB across the four, and the frontend
 * called none of them.
 *
 * The command authority is the one that matters most on screen. It reads
 * `FAIL_CLOSED` with the relay inactive, which is precisely why every mutation
 * control on those screens is dark — and it was being parsed by nobody, so the
 * screens showed the dark buttons and no reason for them.
 */
export type CompositionName = "command-center" | "operations" | "waivers" | "admin-action-drawer";

export interface JournalRow {
  at: string | null;
  actor: string | null;
  command: string | null;
  outcome: string | null;
  detail: string | null;
}

export interface CommandAuthority {
  /** `FAIL_CLOSED` while no relay is open. */
  state: string;
  relayActive: boolean;
  /** true when the read itself asked the source to do something; always false here. */
  sideEffectRequested: boolean;
}

export interface OperationalComposition {
  schemaVersion: string;
  readAt: string | null;
  compositeRevision: string | null;
  commandAuthority: CommandAuthority | null;
  journal: { state: string | null; reasonCode: string | null; rows: readonly JournalRow[]; retention: string | null };
  sourceHealth: { profiles: readonly { profile: string; state: string | null; reasonCode: string | null }[] };
  canaryTwin: { state: string | null; reasonCode: string | null };
  /** The screen's own payload, untouched — each screen reads its own shape. */
  data: Readonly<Record<string, unknown>>;
}

const obj = (v: unknown): Record<string, unknown> =>
  (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null =>
  (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);

/**
 * One journal row.
 *
 * The journal is redacted by contract, and the shape says so: it carries
 * `command_id`, `accepted_at`, `state`, `venue` and `environment` — and no
 * actor at all. So `actor` is read where a lane does publish one and left null
 * otherwise, which the table then prints as "actor redacted" rather than as a
 * blank cell that could be mistaken for an unattributed command.
 */
function journalRow(raw: unknown): JournalRow | null {
  const row = obj(raw);
  const at = str(row.accepted_at) ?? str(row.updated_at) ?? str(row.at) ?? str(row.occurred_at) ?? str(row.created_at)
    ?? str(row.as_of)
    ?? (typeof row.created_at_ms === "number" ? new Date(row.created_at_ms).toISOString() : null);
  const command = str(row.command_id) ?? str(row.command) ?? str(row.command_key) ?? str(row.action) ?? str(row.task_id) ?? str(row.kind);
  // A row with neither a clock nor a command names nothing and is dropped
  // rather than rendered as a blank line in an audit trail.
  if (!at && !command) return null;
  const where = [str(row.venue), str(row.environment), str(row.relation_state)].filter(Boolean).join(" · ");
  return {
    at,
    command,
    actor: str(row.actor) ?? str(row.actor_user_id) ?? str(row.username),
    outcome: str(row.state) ?? str(row.outcome) ?? str(row.status) ?? str(row.result),
    detail: str(row.reason_code) ?? str(row.detail) ?? str(row.message) ?? (where || null),
  };
}

export function readOperationalComposition(raw: unknown): OperationalComposition | null {
  const root = obj(raw);
  const schemaVersion = str(root.schema_version);
  if (!schemaVersion) return null;
  const journal = obj(root.redacted_command_journal);
  /*
   * Two blocks carry the command authority and they do not say the same thing:
   * the top-level one has `state: UNCHANGED_FAIL_CLOSED` and no relay field,
   * while `data.command_authority` has `FAIL_CLOSED` and the relay itself. The
   * richer one wins. Read the other way round, the missing relay field failed
   * closed to "relay active" — loudly wrong on screen, which is the point of
   * failing closed, but wrong all the same.
   */
  const authority = { ...obj(root.command_authority), ...obj(obj(root.data).command_authority) };
  const health = obj(root.source_health);
  const twin = obj(root.canary_twin_comparison);
  const profiles = obj(health.profiles);
  return {
    schemaVersion,
    readAt: str(root.read_at),
    compositeRevision: str(root.composite_revision),
    commandAuthority: str(authority.state) === null ? null : {
      state: str(authority.state)!,
      // Both flags fail closed toward the dangerous reading: an unreadable
      // relay must be assumed open, and an unreadable side-effect bit must be
      // assumed to have reached the Trading System. Saying "nothing happened"
      // on the strength of a field we could not parse is the reassuring lie.
      relayActive: authority.relay_active !== false,
      sideEffectRequested: authority.source_side_effect_requested !== false,
    },
    journal: {
      state: str(journal.state),
      reasonCode: str(journal.reason_code),
      retention: str(journal.retention),
      rows: (Array.isArray(journal.rows) ? journal.rows : []).flatMap((row) => {
        const parsed = journalRow(row);
        return parsed ? [parsed] : [];
      }),
    },
    sourceHealth: {
      profiles: Object.entries(profiles).flatMap(([profile, value]) => {
        const entry = obj(value);
        const state = str(entry.state) ?? str(entry.availability);
        return state === null ? [] : [{ profile, state, reasonCode: str(entry.reason_code) }];
      }),
    },
    canaryTwin: { state: str(twin.state), reasonCode: str(twin.reason_code) },
    data: obj(root.data),
  };
}
