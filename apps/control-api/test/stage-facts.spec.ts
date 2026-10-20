import { describe, expect, it } from "vitest";
import { ProfileScreenSource } from "../src/execution/profile-screen-composer";
import {
  absentRelation,
  buildStageFacts,
  darkStageFacts,
  RelationInput,
  runtimeFacts,
  SESSION_ROW_CAP,
} from "../src/execution/stage-facts";
import { profileStageFacts } from "../src/execution/stage-facts-profile";
import { assertPublishedSchema, rejectsPublishedSchema } from "./stage-contract-validator";

const relation = (rows: Record<string, unknown>[], state: RelationInput["state"] = "AVAILABLE"): RelationInput => ({
  present: true, state, reasonCode: null, rows, absentReason: "X_ABSENT",
});
const none = absentRelation("NOT_BOUND");
const build = (over: Partial<Parameters<typeof buildStageFacts>[0]> = {}) =>
  buildStageFacts({ deployment: { deployment_id: "dep_1", active: true }, sessions: none, reconciliation: none, reconciliationAsOf: null, ...over });

describe("FE-067 runtime facts", () => {
  it("never reads `active` as a runtime state", () => {
    const facts = runtimeFacts({ deployment_id: "dep_1", active: true });
    expect(facts.runtime_state).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED" });
    expect(facts.since.availability).toBe("NOT_PUBLISHED");
  });

  it("publishes a closed-vocabulary word from the source row, with its own since", () => {
    const facts = runtimeFacts({ runtime_state: "running", runtime_state_since: "2026-10-12T08:00:00Z" });
    expect(facts.runtime_state).toEqual({ availability: "AVAILABLE", value: "RUNNING", reason_code: null });
    expect(facts.since).toEqual({ availability: "AVAILABLE", value: "2026-10-12T08:00:00.000Z", reason_code: null });
  });

  it("states a state without inventing the instant it began", () => {
    const facts = runtimeFacts({ runtime_state: "HALTED" });
    expect(facts.runtime_state.availability).toBe("AVAILABLE");
    expect(facts.since).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_RUNTIME_SINCE_NOT_PUBLISHED" });
  });

  it("refuses a word outside the vocabulary without echoing it", () => {
    for (const word of ["ACTIVE", "SPINNING", "", 7, {}]) {
      const facts = runtimeFacts({ runtime_state: word });
      expect(facts.runtime_state).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "RUNTIME_STATE_WORD_NOT_IN_CLOSED_VOCABULARY" });
      expect(JSON.stringify(facts)).not.toContain("SPINNING");
    }
  });

  it("is unpublished when there is no deployment row", () => {
    expect(runtimeFacts(null).runtime_state.reason_code).toBe("DEPLOYMENT_ROW_NOT_PUBLISHED");
  });
});

describe("FE-067 reconciliation facts", () => {
  it("is a typed absence when the relation was never read", () => {
    const facts = build().reconciliation;
    expect(facts.verdict).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "NOT_BOUND" });
    expect(facts.open_finding_count.availability).toBe("NOT_PUBLISHED");
  });

  it("is a typed absence when the relation could not be read", () => {
    const facts = build({ reconciliation: { ...relation([], "UNAVAILABLE"), reasonCode: "SOURCE_DOWN" } }).reconciliation;
    expect(facts.verdict.reason_code).toBe("SOURCE_DOWN");
  });

  it("states no open findings only from a complete window, and names its basis", () => {
    const facts = build({ reconciliation: relation([{ status: "RESOLVED", finding_type: "X" }], "AVAILABLE"), reconciliationAsOf: "2026-10-12T08:00:00Z" }).reconciliation;
    expect(facts.verdict).toEqual({ availability: "AVAILABLE", value: "NO_OPEN_FINDINGS", reason_code: null });
    expect(facts.open_finding_count.value).toBe(0);
    expect(facts.unknown_order_count.value).toBe(0);
    expect(facts.basis).toBe("FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN");
    expect(facts.as_of.value).toBe("2026-10-12T08:00:00Z");
  });

  it("refuses a clean verdict from a partial window", () => {
    const facts = build({ reconciliation: relation([], "PARTIAL") }).reconciliation;
    expect(facts.verdict.availability).toBe("NOT_PUBLISHED");
    expect(facts.verdict.reason_code).toBe("RECONCILIATION_WINDOW_PARTIAL");
  });

  it("counts open findings even from a partial window, but cannot call any of them an unknown order", () => {
    const facts = build({ reconciliation: relation([{ status: "OPEN", finding_type: "ORDER_MISMATCH" }, { status: "ACKED", finding_type: "Y" }, { status: "RESOLVED" }], "PARTIAL") }).reconciliation;
    expect(facts.verdict.value).toBe("OPEN_FINDINGS");
    expect(facts.open_finding_count.value).toBe(2);
    expect(facts.unknown_order_count).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED" });
  });

  it("gives no verdict when a finding status cannot be read", () => {
    const facts = build({ reconciliation: relation([{ status: "WEIRD" }, { finding_id: "f" }]) }).reconciliation;
    expect(facts.verdict.reason_code).toBe("FINDING_STATUS_UNREADABLE");
    expect(facts.open_finding_count.availability).toBe("NOT_PUBLISHED");
  });
});

describe("FE-067 session rows", () => {
  const row = (id: string, started: string, extra: Record<string, unknown> = {}) =>
    ({ execution_session_id: id, started_at: started, completed_at: null, state: "CREATED", ...extra });

  it("is a typed absence, with no rows, when the relation was never read", () => {
    expect(build().sessions).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "NOT_BOUND", rows: [], returned_count: 0 });
  });

  it("maps source rows to {id, started, ended, state}, newest first, with ended null while open", () => {
    const facts = build({ sessions: relation([
      row("s_old", "2026-10-10T00:00:00Z", { completed_at: "2026-10-10T01:00:00Z", state: "COMPLETED" }),
      row("s_new", "2026-10-12T00:00:00Z"),
    ]) }).sessions;
    expect(facts.rows).toEqual([
      { id: "s_new", started: "2026-10-12T00:00:00.000Z", ended: null, state: "CREATED" },
      { id: "s_old", started: "2026-10-10T00:00:00.000Z", ended: "2026-10-10T01:00:00.000Z", state: "COMPLETED" },
    ]);
    expect(facts.source_complete).toBe(true);
  });

  it("drops a row it cannot type and counts it as omitted instead of listing a guess", () => {
    const facts = build({ sessions: relation([row("ok", "2026-10-12T00:00:00Z"), row("bad id with spaces", "2026-10-12T00:00:00Z"), { execution_session_id: "no_start" }]) }).sessions;
    expect(facts.rows.map((r) => r.id)).toEqual(["ok"]);
    expect(facts.omitted_count).toBe(2);
  });

  it("keeps an unreadable state word as null, never as a made-up one", () => {
    const facts = build({ sessions: relation([row("s", "2026-10-12T00:00:00Z", { state: "has space" })]) }).sessions;
    expect(facts.rows[0].state).toBeNull();
  });

  it("caps the table and says how many were not listed", () => {
    const rows = Array.from({ length: SESSION_ROW_CAP + 7 }, (_, index) => row(`s_${String(index).padStart(3, "0")}`, `2026-10-12T00:${String(index % 60).padStart(2, "0")}:00Z`));
    const facts = build({ sessions: relation(rows, "PARTIAL") }).sessions;
    expect(facts.returned_count).toBe(SESSION_ROW_CAP);
    expect(facts.omitted_count).toBe(7);
    expect(facts.source_complete).toBe(false);
  });
});

describe("FE-067 profile adapter", () => {
  const profile = (over: Record<string, unknown> = {}) => ({
    state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-12T08:00:00.000Z",
    capabilities: ["deployments", "sessions", "reconciliation"].map((key) => ({ capability_id: `source.${key}`, state: "AVAILABLE", reason_code: null })),
    data: {
      deployments: [{ deployment_id: "dep_1", runtime_state: "PAUSED" }],
      sessions: [{ execution_session_id: "s1", started_at: "2026-10-12T00:00:00Z", completed_at: null, state: "RUNNING" }],
      reconciliation: [],
    },
    ...over,
  });

  it("publishes from a connected profile", () => {
    const facts = profileStageFacts(new ProfileScreenSource(profile(), "2026-10-12T09:00:00.000Z"), "DARK");
    expect(facts.runtime.runtime_state.value).toBe("PAUSED");
    expect(facts.sessions.returned_count).toBe(1);
    expect(facts.reconciliation.verdict.value).toBe("NO_OPEN_FINDINGS");
    expect(facts.reconciliation.as_of.value).toBe("2026-10-12T08:00:00.000Z");
  });

  it("is dark, with one reason, when the profile is not connected", () => {
    const facts = profileStageFacts(new ProfileScreenSource({ state: "unavailable" }, "2026-10-12T09:00:00.000Z"), "LIVE_SOURCE_UNAVAILABLE");
    expect(facts).toEqual(darkStageFacts("LIVE_SOURCE_UNAVAILABLE"));
    expect(facts.runtime.runtime_state.reason_code).toBe("LIVE_SOURCE_UNAVAILABLE");
    expect(facts.sessions.availability).toBe("NOT_PUBLISHED");
  });

  it("does not turn a relation the profile never stated into an empty clean one", () => {
    const facts = profileStageFacts(new ProfileScreenSource(profile({ capabilities: [] }), "2026-10-12T09:00:00.000Z"), "DARK");
    expect(facts.sessions.availability).toBe("NOT_PUBLISHED");
    expect(facts.reconciliation.verdict.availability).toBe("NOT_PUBLISHED");
  });
});

describe("FE-067 the producer output conforms to the published schema", () => {
  const FILE = "execution-stage-facts.v1.schema.json";
  const connected = {
    state: "ready", delivery_profile: "LIVE_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-12T08:00:00.000Z",
    capabilities: ["deployments", "sessions", "reconciliation"].map((key) => ({ capability_id: `source.${key}`, state: "AVAILABLE", reason_code: null })),
    data: {
      deployments: [{ deployment_id: "dep_1", runtime_state: "HALTED", runtime_state_since: "2026-10-12T07:00:00Z" }],
      sessions: [{ execution_session_id: "s1", started_at: "2026-10-12T00:00:00Z", completed_at: "2026-10-12T05:00:00Z", state: "COMPLETED" }],
      reconciliation: [{ status: "OPEN", finding_type: "ORDER_MISMATCH" }],
    },
  };

  it("accepts a populated, a dark and a half-published fact set", () => {
    assertPublishedSchema(FILE, "StageFacts", profileStageFacts(new ProfileScreenSource(connected, "2026-10-12T09:00:00.000Z"), "DARK"));
    assertPublishedSchema(FILE, "StageFacts", darkStageFacts("LIVE_SOURCE_UNAVAILABLE"));
    assertPublishedSchema(FILE, "StageFacts", build({ deployment: { runtime_state: "RUNNING" }, reconciliation: relation([], "PARTIAL") }));
  });

  it("still validates after JSON serialisation (no undefined members)", () => {
    const facts = profileStageFacts(new ProfileScreenSource(connected, "2026-10-12T09:00:00.000Z"), "DARK");
    assertPublishedSchema(FILE, "StageFacts", JSON.parse(JSON.stringify(facts)));
  });

  it("rejects what the producer must never emit", () => {
    const base = darkStageFacts("LIVE_SOURCE_UNAVAILABLE");
    expect(rejectsPublishedSchema(FILE, "StageFacts", { ...base, runtime: { ...base.runtime, runtime_state: { availability: "AVAILABLE", value: "ACTIVE", reason_code: null } } })).toBe(true);
    expect(rejectsPublishedSchema(FILE, "StageFacts", { ...base, runtime: { ...base.runtime, since: { availability: "NOT_PUBLISHED", value: null, reason_code: null } } })).toBe(true);
    expect(rejectsPublishedSchema(FILE, "StageFacts", { ...base, runtime: { ...base.runtime, since: { availability: "AVAILABLE", value: null, reason_code: null } } })).toBe(true);
    expect(rejectsPublishedSchema(FILE, "StageFacts", { ...base, sessions: { ...base.sessions, rows: [{ id: "s", started: "2026-10-12T00:00:00Z", ended: null, state: null }] } })).toBe(true);
    expect(rejectsPublishedSchema(FILE, "StageFacts", { ...base, extra: true })).toBe(true);
  });
});
