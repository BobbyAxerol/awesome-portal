import { describe, expect, it } from "vitest";
import { CommandCenterRepository } from "../src/command-center/command-center.repository";

describe("UDB04 pure retained journal timestamp reuse", () => {
  it("does not cache the read-time window, mutations or authority", () => {
    const repository = new CommandCenterRepository({} as never, {} as never);
    const fields = { command_id: "one", updated_at: "2026-10-10T12:00:00Z" };
    const projection = { reason: null, ageMs: 1, rows: [{
      environment: "paper", profile_id: "paper", source_cursor: "opaque",
      source_as_of: new Date(fields.updated_at), last_successful_refresh_at: new Date(fields.updated_at),
      projection_sequence: "1", projection_epoch: "epoch", completeness: "PARTIAL",
      payload: { relations: { "manager.command-journal:command_journal": {
        availability: "AVAILABLE", items: [{ fields }],
      } } },
    }] };
    const read = (at: string, state = projection) => (repository as any).journalToday(state, new Date(at));
    expect(read("2026-10-11T11:59:00Z").exact_total_count).toBe(1);
    expect(read("2026-10-11T12:01:00Z").exact_total_count).toBe(0);
    fields.updated_at = "2026-10-11T12:00:00Z";
    expect(read("2026-10-11T12:01:00Z").exact_total_count).toBe(1);
    fields.updated_at = "not a timestamp";
    expect(read("2026-10-11T12:01:00Z").exact_total_count).toBe(0);
    const refused = { ...projection, rows: [], reason: "WORKSPACE_NOT_FOUND" };
    expect(read("2026-10-11T12:01:00Z", refused as any).status.availability).toBe("UNAVAILABLE");
  });
});
