/**
 * EX-BE-05b/F0 §4 — the four required tests that had no coverage, and the plan
 * contract nothing had read.
 *
 * Numbered against the handoff so the mapping is checkable:
 *   #4  generic redis cannot produce an actionable control
 *   #8  a denied apply shows safe retry/source-request facts
 *   #10 hash-only retention is stated; refused payloads are never echoed
 *   #11 an equal repeat replays one operation; drift conflicts and never retries
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  commandPlanRequest,
  planApplicable,
  planOutcomeText,
  readCommandPlan,
  readPayloadRejection,
  readRelayDenial,
  PAYLOAD_REJECTIONS,
} from "./commandPlan";
import { COMMAND_PLAN_FIXTURE } from "./adminCatalog.fixtures";
import { readCommandCatalogue } from "./adminCatalog";
import { COMMAND_CATALOGUE_FIXTURE } from "./adminCatalog.fixtures";
import { createHttpApi } from "./api/httpApi";
import type { DeliveryPolicy } from "./profile";

const PUBLISHED = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../../packages/contracts/fixtures/execution-command-plan.valid.json"),
    "utf8",
  ),
);

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

const INPUT = {
  workspaceId: "ws-1",
  requestKey: "rk-1",
  commandKey: "account/sync",
  environment: "PAPER" as const,
  target: { type: "ACCOUNT", id: "acct-1" },
  expectedTargetVersion: 3,
  payload: { reason: "resync after divergence" },
};

describe("the inlined plan has not drifted from the contract", () => {
  it("equals the published document", () => {
    expect(COMMAND_PLAN_FIXTURE).toEqual(PUBLISHED);
  });
});

describe("#7 — a blocked plan has no apply, and is not announced as completed", () => {
  const plan = () => readCommandPlan(PUBLISHED)!;

  it("reads every constant as data rather than assuming it", () => {
    const p = plan();
    expect(p.status).toBe("BLOCKED");
    expect(p.applyToken).toBeNull();
    expect(p.relayCapability).toBe("DISABLED");
    expect(p.sourceSideEffectRequested).toBe(false);
    expect(p.payloadStoragePolicy).toBe("HASH_ONLY_NO_RAW");
  });

  it("refuses to be applied, and says why in the operator's terms", () => {
    const decision = planApplicable(plan());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/relay is disabled/);
    expect(decision.reason).toMatch(/nothing to apply/);
  });

  it("does not present an operation id as work in progress", () => {
    const text = planOutcomeText(plan());
    expect(text).toMatch(/Nothing was asked of the Trading System/);
    expect(text).toMatch(/not work in progress/);
  });

  it("would honour a token if one ever arrived, rather than hard-coding the refusal", () => {
    const withToken = readCommandPlan({ ...PUBLISHED, apply_token: "tok", blockers: [] })!;
    expect(planApplicable(withToken).allowed).toBe(true);
  });

  it("still refuses a token that arrives beside blockers", () => {
    const odd = readCommandPlan({ ...PUBLISHED, apply_token: "tok" })!;
    expect(planApplicable(odd).allowed).toBe(false);
  });
});

describe("#10 — hash-only retention, and a refused payload is never echoed", () => {
  it("knows the three codes the server can refuse a payload with", () => {
    const contracts = readFileSync(
      join(__dirname, "../../../../../apps/control-api/src/operations/contracts.ts"),
      "utf8",
    );
    for (const code of PAYLOAD_REJECTIONS) {
      expect(contracts, code).toContain(code);
    }
  });

  it("names nothing from the payload in any rejection message", () => {
    for (const code of PAYLOAD_REJECTIONS) {
      const failure = readPayloadRejection({
        error: {
          code,
          // The server may legitimately name a field for its own logs.
          message: 'field "api_secret_key" with value "sk-live-3f9a" was rejected at $.creds',
        },
      })!;
      expect(failure.code).toBe(code);
      // None of it reaches the operator: a value the API refuses to store must
      // not arrive in a screenshot, a ticket or a browser log instead.
      expect(failure.reason).not.toContain("api_secret_key");
      expect(failure.reason).not.toContain("sk-live-3f9a");
      expect(failure.reason).not.toContain("$.creds");
      // And it is still actionable.
      expect(failure.reason.length).toBeGreaterThan(40);
    }
  });

  it("says what to do about a credential-shaped field without naming it", () => {
    const failure = readPayloadRejection({
      error: { code: "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN", message: "password" },
    })!;
    expect(failure.reason).toMatch(/named like a credential/);
    expect(failure.reason).toMatch(/never stores raw payload values/);
  });

  it("ignores a failure that is not a payload rejection", () => {
    expect(readPayloadRejection({ error: { code: "COMMAND_RELAY_DISABLED" } })).toBeNull();
    expect(readPayloadRejection(null)).toBeNull();
  });

  it("does not echo the payload through the adapter either", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          error: { code: "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN", message: 'key "token" value "abc123"' },
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=t" });
    const result = await createHttpApi({ policy: OPEN }).planCommand({
      ...INPUT,
      payload: { token: "abc123" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain("abc123");
      expect(result.reason).not.toContain("token");
      expect(result.status).toBe("insufficient_data");
    }
    vi.unstubAllGlobals();
  });
});

describe("#11 — a repeat replays one operation; drift conflicts and never retries", () => {
  it("reports a replayed plan as replayed rather than as a second operation", () => {
    const replayed = readCommandPlan({ ...PUBLISHED, replayed: true })!;
    expect(replayed.replayed).toBe(true);
    expect(replayed.operationId).toBe(PUBLISHED.operation_id);
  });

  it("treats an absent replayed flag as not replayed", () => {
    const raw = { ...PUBLISHED };
    delete (raw as Record<string, unknown>).replayed;
    expect(readCommandPlan(raw)!.replayed).toBe(false);
  });

  it("surfaces a 409 as a typed conflict and sends nothing again", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "REQUEST_KEY_CONFLICT" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=t" });
    const result = await createHttpApi({ policy: OPEN }).planCommand(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/REQUEST_KEY_CONFLICT/);
      expect(result.reason).toMatch(/Start a new command/);
    }
    // Exactly one attempt. Retrying would pick one of two intents on the
    // operator's behalf, which is the thing the conflict is reporting.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("#4 — generic Redis cannot produce an actionable control", () => {
  for (const key of ["redis/get", "redis/scan"]) {
    it(`${key} is catalogued, unreachable, and refused for the right reason`, () => {
      // Looked up here rather than through a new production export: a helper
      // whose only consumer is a test is the habit this cluster keeps paying
      // for.
      const catalogue = readCommandCatalogue(COMMAND_CATALOGUE_FIXTURE)!;
      const entry = catalogue.entries.find((e) => e.key === key)!;
      expect(entry, key).toBeTruthy();
      expect(entry.portalReachable).toBe(false);
      expect(entry.blockedReason).toBe("GENERIC_REDIS_ACCESS_PROHIBITED");
    });
  }

  it("planning one is still refused by the plan itself, not only by the catalogue", () => {
    // Belt and braces on purpose: the catalogue is a listing, and a listing is
    // not an enforcement point. A plan for a blocked command comes back BLOCKED
    // with no token, so there is no path to an actionable control from either
    // direction.
    const plan = readCommandPlan({ ...PUBLISHED, command_key: "redis/get" })!;
    expect(planApplicable(plan).allowed).toBe(false);
  });
});

describe("the request body is the schema's", () => {
  it("sends the constants the schema pins", () => {
    const body = commandPlanRequest(INPUT);
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.value.schema_version).toBe("execution.command-plan-request.v1");
      expect(body.value.command_type).toBe("EXECUTION_COMMAND");
      expect(body.value.command_version).toBe(1);
      expect(body.value.target).toEqual({ type: "ACCOUNT", id: "acct-1" });
    }
  });

  it("carries typed conditions and refuses a malformed one before sending", () => {
    const ok = commandPlanRequest({
      ...INPUT,
      conditions: [
        { text: "cap capacity at 50,000", owner: "Lan", deadline: null, expiry: null, blocking: true },
      ],
    });
    expect(ok.ok).toBe(true);
    const bad = commandPlanRequest({
      ...INPUT,
      conditions: [{ text: "cap capacity at 50,000", owner: null, blocking: true }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/no owner/);
  });
});

describe("#8 — a denied apply shows the two facts that make it safe to act on", () => {
  const DENIED = {
    schema_version: "execution.command-relay-decision.v1",
    operation_id: "op_1",
    decision: "DENIED",
    reason: "COMMAND_RELAY_DISABLED",
    retry_allowed: false,
    source_request_sent: false,
  };

  it("matches the schema the Control API publishes", () => {
    const schema = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "../../../../../packages/contracts/schemas/execution-operations.v1.schema.json",
        ),
        "utf8",
      ),
    );
    expect(Object.keys(schema.$defs.RelayDenied.properties).sort()).toEqual(
      Object.keys(DENIED).sort(),
    );
  });

  it("says nothing happened when nothing reached the source", () => {
    const denial = readRelayDenial(DENIED)!;
    expect(denial.sourceRequestSent).toBe(false);
    expect(denial.retryAllowed).toBe(false);
    expect(denial.text).toMatch(/Nothing has changed/);
    expect(denial.text).toMatch(/refused identically/);
  });

  it("permits a retry only when the server says so", () => {
    const denial = readRelayDenial({ ...DENIED, retry_allowed: true })!;
    expect(denial.text).toMatch(/may be tried again/);
    expect(denial.text).not.toMatch(/refused identically/);
  });

  it("tells the operator to verify when a request did reach the source", () => {
    const denial = readRelayDenial({ ...DENIED, source_request_sent: true })!;
    // The dangerous case: something is out there and its outcome is unknown.
    // Reissuing could double it.
    expect(denial.text).toMatch(/outcome is unknown/);
    expect(denial.text).toMatch(/do not reissue/i);
  });

  it("fails closed on both flags rather than reassuring", () => {
    const unreadable = readRelayDenial({ ...DENIED, source_request_sent: "no", retry_allowed: "yes" })!;
    // An unreadable "did anything happen" must not be reported as "nothing did".
    expect(unreadable.sourceRequestSent).toBe(true);
    expect(unreadable.retryAllowed).toBe(false);
  });

  it("ignores a body that is not a relay denial", () => {
    expect(readRelayDenial({ decision: "ALLOWED" })).toBeNull();
    expect(readRelayDenial(null)).toBeNull();
  });

  it("reaches the adapter, which resolves the two cases to different states", async () => {
    vi.stubGlobal("document", { cookie: "__Host-portal_csrf=t" });

    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify(DENIED), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    const safe = await createHttpApi({ policy: OPEN }).applyPlan("op_1", "tok", "ws");
    expect(safe.ok).toBe(false);
    // `denied`, not `unavailable`: the system answered, it refused.
    if (!safe.ok) expect(safe.status).toBe("denied");

    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ ...DENIED, source_request_sent: true }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    const unknown = await createHttpApi({ policy: OPEN }).applyPlan("op_1", "tok", "ws");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      // `terminal`: an outcome nobody can vouch for is not a retry prompt.
      expect(unknown.status).toBe("terminal");
      expect(unknown.reason).toMatch(/do not reissue/i);
    }
    vi.unstubAllGlobals();
  });
});
