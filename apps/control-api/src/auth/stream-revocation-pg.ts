import { randomUUID } from "node:crypto";
import type { Notification, Pool, PoolClient } from "pg";
import { StreamRevocationHints, STREAM_HINT_MAX_ID_LENGTH, type StreamRevocationHintPublisher } from "./stream-revocation-hints";

/** Notification payload contains only the same opaque app IDs already used by
 * the in-process hint. Never a cookie, credential, policy body or target row.
 * This channel is advisory and not an authority or a durable event ledger. */
export const STREAM_REVOCATION_CHANNEL = "portal_stream_revocation_hint_v1";
export const STREAM_REVOCATION_PAYLOAD_BYTES = 1_024;
const MAXIMUM_IN_FLIGHT = 4;
const QUERY_TIMEOUT_MS = 1_000;
const INITIAL_RECONNECT_MS = 250;
const MAXIMUM_RECONNECT_MS = 30_000;
type HintKind = "SESSION_ENDED" | "USER_AUTHORITY_CHANGED";

interface Hint { version: 1; origin: string; kind: HintKind; subject_id: string }
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  value.length <= STREAM_HINT_MAX_ID_LENGTH && !/[\u0000-\u001f\u007f]/u.test(value);

export function parseStreamRevocationNotification(payload: unknown): Hint | null {
  if (typeof payload !== "string" || Buffer.byteLength(payload, "utf8") > STREAM_REVOCATION_PAYLOAD_BYTES) return null;
  try {
    const body: unknown = JSON.parse(payload);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const row = body as Record<string, unknown>;
    if (Object.keys(row).length !== 4 || row.version !== 1 || typeof row.origin !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(row.origin) ||
      (row.kind !== "SESSION_ENDED" && row.kind !== "USER_AUTHORITY_CHANGED") || !validId(row.subject_id)) return null;
    return row as unknown as Hint;
  } catch { return null; }
}

/** One reserved LISTEN connection and at most four best-effort NOTIFY calls.
 * Owning Core startup calls start; shutdown MUST await close before pool.end.
 * A missing/disconnected bus leaves the existing poll/final-send fences intact.
 * There is no unbounded queue and no replay pretending to be a durable revoke. */
export class PgStreamRevocationBridge implements StreamRevocationHintPublisher {
  readonly origin = randomUUID();
  private client: PoolClient | undefined;
  private listening = false;
  private connecting: Promise<void> | undefined;
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private reconnectMs = INITIAL_RECONNECT_MS;
  private stopped = true;
  private pending = new Set<Promise<void>>();
  private counters = { received: 0, invalid: 0, published: 0, dropped: 0, failures: 0, reconnects: 0 };

  constructor(private readonly pool: Pool, private readonly hints: StreamRevocationHints) {
    // LISTEN reserves one socket permanently. A separate two-socket pool
    // leaves one bounded NOTIFY slot and prevents a saturated request pool
    // from delaying shutdown indefinitely while waiting for an idle client.
    const options = pool.options;
    if (options.max !== 2 || !Number.isInteger(options.connectionTimeoutMillis) ||
      !(options.connectionTimeoutMillis! > 0 && options.connectionTimeoutMillis! <= QUERY_TIMEOUT_MS) ||
      !Number.isInteger(options.query_timeout) ||
      !(options.query_timeout! > 0 && options.query_timeout! <= QUERY_TIMEOUT_MS)) {
      throw new Error("STREAM_REVOCATION_POOL_BOUNDS_INVALID");
    }
  }

  diagnostics() {
    return { ...this.counters, listening: this.listening, connecting: !!this.connecting,
      pending: this.pending.size, reconnect_scheduled: !!this.reconnect, stopped: this.stopped };
  }

  async start(): Promise<void> {
    if (!this.stopped) return this.connecting;
    this.stopped = false;
    this.hints.setPublisher(this);
    await this.connect();
  }

  publish(kind: HintKind, subjectId: string): void {
    if (this.stopped || !validId(subjectId) || this.pending.size >= MAXIMUM_IN_FLIGHT) { this.counters.dropped++; return; }
    const payload = JSON.stringify({ version: 1, origin: this.origin, kind, subject_id: subjectId });
    if (Buffer.byteLength(payload, "utf8") > STREAM_REVOCATION_PAYLOAD_BYTES) { this.counters.dropped++; return; }
    let work: Promise<void>;
    try {
      work = this.pool.query({ text: "SELECT pg_notify($1, $2)", values: [STREAM_REVOCATION_CHANNEL, payload] })
        .then(() => { this.counters.published++; }, () => { this.counters.failures++; })
        .finally(() => { this.pending.delete(work); });
      this.pending.add(work);
    } catch { this.counters.failures++; }
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.hints.setPublisher(undefined);
    if (this.reconnect) { clearTimeout(this.reconnect); this.reconnect = undefined; }
    await this.connecting;
    const client = this.client;
    this.client = undefined;
    this.listening = false;
    if (client) {
      client.removeListener("notification", this.onNotification);
      client.removeListener("error", this.onError);
      client.removeListener("end", this.onEnd);
      // Destroy rather than returning a still-LISTENing connection to a
      // request pool, including when UNLISTEN/transport would fail.
      try { client.release(true); } catch { /* a concurrent socket end already released it */ }
    }
    await Promise.allSettled([...this.pending]);
  }

  private readonly onNotification = (message: Notification) => {
    if (this.stopped || message.channel !== STREAM_REVOCATION_CHANNEL) return;
    const hint = parseStreamRevocationNotification(message.payload);
    if (!hint) { this.counters.invalid++; return; }
    if (hint.origin === this.origin) return;
    this.counters.received++;
    this.hints.receive(hint.kind, hint.subject_id);
  };
  private readonly onError = () => { this.disconnected(); };
  private readonly onEnd = () => { this.disconnected(); };

  private disconnected(): void {
    const client = this.client;
    this.client = undefined;
    this.listening = false;
    if (client) {
      client.removeListener("notification", this.onNotification);
      client.removeListener("error", this.onError);
      client.removeListener("end", this.onEnd);
      try { client.release(true); } catch { /* pool already observed the ended socket */ }
    }
    if (!this.stopped) { this.counters.failures++; this.scheduleReconnect(); }
  }

  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.stopped || this.client) return Promise.resolve();
    this.connecting = (async () => {
      let acquired: PoolClient | undefined;
      try {
        acquired = await this.pool.connect();
        if (this.stopped) { acquired.release(true); return; }
        acquired.on("notification", this.onNotification);
        acquired.on("error", this.onError);
        acquired.on("end", this.onEnd);
        this.client = acquired;
        await acquired.query({ text: `LISTEN ${STREAM_REVOCATION_CHANNEL}` });
        if (this.client === acquired && !this.stopped) { this.reconnectMs = INITIAL_RECONNECT_MS; this.listening = true; }
      } catch {
        if (acquired && this.client === acquired) this.disconnected();
        else if (!this.stopped) { this.counters.failures++; this.scheduleReconnect(); }
      }
    })().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnect) return;
    this.counters.reconnects++;
    this.reconnect = setTimeout(() => { this.reconnect = undefined; void this.connect(); }, this.reconnectMs);
    this.reconnect.unref?.();
    this.reconnectMs = Math.min(this.reconnectMs * 2, MAXIMUM_RECONNECT_MS);
  }
}
