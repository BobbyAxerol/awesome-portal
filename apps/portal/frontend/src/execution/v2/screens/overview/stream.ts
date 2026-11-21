/**
 * The resume point for the Command Centre stream
 * (`execution.manager-realtime-snapshot.v2`), as V1's
 * `profileContainers.tsx` reads it. Copied, not imported: that file is a V1
 * container and the V2 chunk must not pull it in.
 *
 * The schema version is checked, so a cursor is never taken from an envelope
 * that did not claim to be this contract. Whether a stream may be opened at all
 * is decided before this is ever called, by `streamGate` on the snapshot's own
 * `stream_available` (absent is not a live stream).
 */
export const COMMAND_CENTER_REALTIME_SNAPSHOT = "/api/v1/execution/command-center/realtime-snapshot";

export async function fetchCommandCenterResume(): Promise<{
  cursor: string;
  epoch: string;
  sequence: number;
  asOf?: string | null;
}> {
  const response = await fetch(COMMAND_CENTER_REALTIME_SNAPSHOT, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`realtime snapshot ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  if (body.schema_version !== "execution.manager-realtime-snapshot.v2") {
    throw new Error(`realtime snapshot is not manager-realtime-snapshot.v2 (${String(body.schema_version)})`);
  }
  const cursor = typeof body.cursor === "string" ? body.cursor : null;
  const epoch = typeof body.projection_epoch === "string" ? body.projection_epoch : null;
  const sequence = typeof body.projection_sequence === "number" ? body.projection_sequence : null;
  if (!cursor || !epoch || sequence === null) throw new Error("realtime snapshot missing resume point");
  return {
    cursor,
    epoch,
    sequence,
    asOf: typeof body.source_read_at === "string" ? body.source_read_at : null,
  };
}
