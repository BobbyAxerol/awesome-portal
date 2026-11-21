import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// This intentionally resolves the Control API's lockfile-pinned test-only
// dependency while the suite itself remains outside the protected test tree.
import { Agent, MockAgent, setGlobalDispatcher } from "../../apps/control-api/node_modules/undici/index.js";
import { AdminService } from "../../apps/control-api/src/admin/admin.service";
import { Argon2CredentialService } from "../../apps/control-api/src/auth/argon";
import { AuthService } from "../../apps/control-api/src/auth/auth.service";
import { canonicalJson } from "../../apps/control-api/src/facade/run-sync.service";
import { OwnerAccessRepository } from "../../apps/control-api/src/repos/owner-access";
import { migrateTestDatabase, setupApp, teardownApp } from "../../apps/control-api/test/harness";
import {
  P02ContractError,
  REQUESTED_SPEC_V1_S02_FORM_CONTROL_DENOMINATOR,
  REQUESTED_SPEC_V1_SCHEMA_VERSION,
  assertIdentityBinding,
  assertRequestedSpecV1,
  assertResearchRunRequestV1,
  createExactR1Payload,
  CURSOR_CODEC,
  CURSOR_STAGES,
  parseResearchCursor,
  serializeResearchCursor,
  validateOptimizerBindings,
} from "./p02-contract.mjs";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

type Actor = { userId: string; username: string; cookie: string; csrf: string };

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const cookie = (Array.isArray(raw) ? raw : [raw]).find(
    (value): value is string => typeof value === "string" && value.startsWith("__Host-portal_csrf="),
  );
  if (!cookie) throw new Error("csrf cookie missing");
  return cookie.split(";")[0].split("=")[1];
}

function errorCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof P02ContractError) return error.code;
    throw error;
  }
  throw new Error("Expected a P02 contract error.");
}

function validRequestedSpec(overrides: Record<string, unknown> = {}) {
  const base = {
    schema_version: REQUESTED_SPEC_V1_SCHEMA_VERSION,
    alpha_binding: { alpha_id: "alpha_p02", alpha_version_id: "research-alpha-p02-v1" },
    not_publishable: false,
    strategy_id: "alpha_p02",
    execution_route: "intrabar_bracket",
    route_params: {
      intrabar: {
        level_mode: "hlc_conservative",
        same_bar_policy: "stop_first",
        tick_size: "0.01",
      },
    },
    data: { dataset_id: "btc_usdt_1m", symbol: "BTC/USDT", timeframe: "1m" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2024-01-01T00:00", end_exclusive: "2024-02-01T00:00" },
      oos: { start: "2024-02-01T00:00", end_exclusive: "2024-03-01T00:00" },
      holdout: { start: "2024-03-01T00:00", end_exclusive: "2024-04-01T00:00" },
    },
    optimization_mode: "mode_1",
    optimization_schedule: "global",
    parameter_space_overrides: [
      { name: "entry_z", kind: "sweep", low: 1.25, high: 2.5 },
      { name: "exit_z", kind: "pin", value: 0.5 },
    ],
    optuna_trials: 24,
    early_stopping: null,
    random_seed: 7,
    optimization_config: { sampler_seed: 13, n_startup_trials: 12 },
    client: { engine_release_id: "er_quantbt_1_1_1", config_digest: "a".repeat(64) },
  };
  const merged = { ...base, ...overrides } as Record<string, unknown>;
  for (const field of ["data", "client"] as const) {
    if (overrides[field] && typeof overrides[field] === "object" && !Array.isArray(overrides[field])) {
      merged[field] = { ...(base[field] as Record<string, unknown>), ...(overrides[field] as Record<string, unknown>) };
    }
  }
  return merged;
}

describe("Research Loop P02 · unchanged Execution compatibility spike", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let mock: MockAgent;
  let upstream: ReturnType<MockAgent["get"]>;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    mock = new MockAgent();
    mock.disableNetConnect();
    upstream = mock.get("http://portal-api:8000");
    setGlobalDispatcher(mock);
    ctx = await setupApp({ AUTH_MODE: "dev", PORTAL_API_BASE_URL: "http://portal-api:8000", FEATURE_PROXY_PORTAL: "true" });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);
  }, 30_000);

  afterAll(async () => {
    if (ctx) await teardownApp(ctx);
    setGlobalDispatcher(new Agent());
    if (mock) await mock.close();
  });

  afterEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_approval_decisions, governance_decision_plans,
        governance_approval_known_limitations, governance_approval_findings,
        governance_approval_evidence, governance_approval_requests,
        run_read_models, outbox_messages, product_audit_events, portal_owner_anchor,
        workspace_members, workspaces, auth_audit_events, auth_sessions,
        activation_credentials, password_credentials, external_identity_bindings,
        portal_users CASCADE`,
    );
  });

  async function raw(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!headers["x-dev-access-email"]) headers["x-dev-access-email"] = "dev@azdag.com";
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && !("origin" in headers)) {
      headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    }
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function request(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return raw(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function mutation(actor: Actor, url: string, payload: unknown, extraHeaders: Record<string, string> = {}) {
    return request(actor, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-csrf": actor.csrf,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        ...extraHeaders,
      },
      payload,
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await admin.createUser({ username, displayName: username, role });
    const user = await auth.users.findByUsername(username);
    if (!user) throw new Error("created test user was not found");
    const { activationToken } = await admin.resetCredential(user.userId);
    const first = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    expect(first.statusCode).toBe(201);
    const password = `p02-${username}-safe-credential-2026`;
    const changed = await raw("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookieHeader(first),
        "x-portal-csrf": csrfCookie(first),
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    });
    expect(changed.statusCode).toBe(201);
    const final = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    expect(final.statusCode).toBe(201);
    return { userId: user.userId, username, cookie: cookieHeader(final), csrf: csrfCookie(final) };
  }

  async function workspaceFor(actor: Actor): Promise<string> {
    const response = await request(actor, "/api/workspaces");
    expect(response.statusCode).toBe(200);
    return response.json().workspaces[0].workspace_id;
  }

  it("P02-T01/T05/T06/T07: proves unchanged 202 -> RunSync -> strict R1 readback with idempotent creation", async () => {
    const researcher = await createActor("p02-researcher", "ADMIN");
    // The current Governance read route is capability/owner guarded.  Claiming
    // owner only in this disposable cell proves the actual readback path; P02
    // does not turn a Research creator into a production Governance reader.
    await new OwnerAccessRepository(ctx.pool).claimOwner({
      userId: researcher.userId,
      claimedBy: "research-loop-p02-isolated-spike",
    });
    const workspaceId = await workspaceFor(researcher);
    const binding = assertIdentityBinding({
      workspace_id: workspaceId,
      research_alpha_id: "research-alpha-p02-v1",
      strategy_adapter_id: "alpha_p02",
      execution_subject_id: "alpha_p02",
      actor_user_id: researcher.userId,
    });
    const submitted = assertResearchRunRequestV1({
      strategy_id: "alpha_p02",
      dataset_id: "btc_usdt_1m",
      protocol: "three_window_decay",
      research_contract_version: "research.run-request.v1",
      research: {
        client_intent_id: "intent-p02-001",
        alpha_version_id: "research-alpha-p02-v1",
        preflight_token: "pft1.current-source.compatibility.token",
        requested_spec: validRequestedSpec(),
      },
    });
    expect(errorCode(() => assertResearchRunRequestV1({
      ...submitted,
      unowned_future_field: true,
    }))).toBe("RESEARCH_REQUEST_UNKNOWN_FIELD");
    let posts = 0;
    upstream.intercept({ path: "/api/runs", method: "POST" }).reply(202, () => {
      posts += 1;
      return { run_id: "run_p02_202", status: "QUEUED" };
    });
    upstream.intercept({ path: "/api/runs/run_p02_202", method: "GET" }).reply(200, {
      run_id: "run_p02_202",
      status: "COMPLETED",
      strategy_id: "alpha_p02",
      dataset_id: "btc_usdt_1m",
      protocol: "three_window_decay",
      artifact_schema_version: "quant.run-artifact.v1",
    });
    upstream.intercept({ path: "/api/runs/run_p02_202/summary", method: "GET" }).reply(200, {
      selected_params: {
        artifact_schema_version: "quant.run-artifact.v1",
        causality_claim: "walk_forward_causal",
        validation_claim: "walk_forward_oos",
        parameters: { z: null, "β": [1.25, { "é": "ok" }] },
      },
    });

    const first = await mutation(researcher, "/api/runs", submitted, {
      "x-portal-idempotency-key": "p02-run-create-001",
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ run_id: "run_p02_202", status: "QUEUED" });
    const replay = await mutation(researcher, "/api/runs", submitted, {
      "x-portal-idempotency-key": "p02-run-create-001",
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json().run_id).toBe("run_p02_202");
    expect(posts).toBe(1);
    expect((await ctx.pool.query("SELECT run_id FROM run_read_models")).rows).toHaveLength(1);

    const exactR1 = createExactR1Payload({
      binding,
      request_key: "research:p02:r1:001",
      evidence_run_id: "run_p02_202",
      methodology_claim_id: "walk_forward_oos",
      summary: "Frozen Research run is ready for an unchanged R1 eligibility readback.",
    });
    const approved = await mutation(researcher, "/api/v1/execution/governance/approvals", exactR1);
    expect(approved.statusCode).toBe(201);
    expect(approved.json()).toMatchObject({
      schema_version: "governance.approval-create.v1",
      replayed: false,
      approval: { subject_id: "alpha_p02", evidence_complete: true },
    });
    const approvalId = approved.json().approval.approval_id;
    const readback = await request(
      researcher,
      `/api/v1/execution/governance/approvals/${approvalId}/r1?workspace_id=${workspaceId}`,
    );
    expect(readback.statusCode).toBe(200);
    expect(readback.json()).toMatchObject({
      schema_version: "governance.r1-review.v1",
      record_authority: "PORTAL",
      data: { approval: { approval_id: approvalId, gate: "R1" } },
    });

    const strictExtra = await mutation(researcher, "/api/v1/execution/governance/approvals", {
      ...exactR1,
      request_key: "research:p02:r1:extra",
      unsupported_research_field: true,
    });
    expect(strictExtra.statusCode).toBe(400);
    expect(strictExtra.json().error.code).toBe("INVALID_APPROVAL_CREATE_REQUEST");

    const wrongAlpha = await mutation(researcher, "/api/v1/execution/governance/approvals", {
      ...exactR1,
      request_key: "research:p02:r1:wrong-alpha",
      alpha_id: "alpha_wrong",
    });
    expect(wrongAlpha.statusCode).toBe(422);
    expect(wrongAlpha.json().error.code).toBe("EVIDENCE_RUN_NOT_ELIGIBLE");
  }, 30_000);

  it("P02-T02: never seeds a run read model from a non-202 upstream result", async () => {
    const researcher = await createActor("p02-201", "ADMIN");
    upstream.intercept({ path: "/api/runs", method: "POST" }).reply(201, {
      run_id: "run_p02_should_not_seed",
      status: "QUEUED",
    });
    const response = await mutation(researcher, "/api/runs", {
      strategy_id: "alpha_p02",
      dataset_id: "btc_usdt_1m",
      protocol: "three_window_decay",
    }, { "x-portal-idempotency-key": "p02-201-do-not-seed" });
    expect(response.statusCode).toBe(201);
    expect((await ctx.pool.query("SELECT run_id FROM run_read_models")).rows).toEqual([]);
  });

  it("P02-T03/T04: pins the complete frozen wrapper using the current TypeScript canonical oracle", () => {
    const frozen = {
      artifact_schema_version: "quant.run-artifact.v1",
      parameters: { z: null, "β": [1.25, { "é": "ok" }], alpha: 0 },
      causality_claim: "walk_forward_causal",
    };
    const canonical = canonicalJson(frozen);
    expect(canonical).toBe(
      '{"artifact_schema_version":"quant.run-artifact.v1","causality_claim":"walk_forward_causal","parameters":{"alpha":0,"z":null,"β":[1.25,{"é":"ok"}]}}',
    );
    expect(createHash("sha256").update(canonical, "utf8").digest("hex"))
      .toBe("b0dd4e5011c0b6cd79ab43656f73d994a64d76037d7504c861fb97789ea265e9");
  });

  it("P02-T09/T10/T13: rejects ambiguous aliases and preserves inspection-only URL state", () => {
    expect(errorCode(() => validateOptimizerBindings({
      optimizer: { trial_budget: 24, optuna_trials: 24 },
      seeds: { strategy_seed: 7, sampler_seed: 13 },
    }))).toBe("OPTIMIZER_ALIAS_CONFLICT");
    expect(validateOptimizerBindings({
      optimizer: { trial_budget: 24 },
      seeds: { strategy_seed: 7, sampler_seed: 13 },
    })).toMatchObject({ trial_budget: 24, strategy_seed: 7, sampler_seed: 13 });
    const parsed = parseResearchCursor("fold=3&study=s-west&trial=42&pick=best&trade=tr-7&event_seq=91", {
      ambiguousTrialIds: ["42"],
    });
    expect(serializeResearchCursor(parsed)).toBe("fold=3&study=s-west&trial=42&pick=best&trade=tr-7&event_seq=91");
    expect(errorCode(() => parseResearchCursor("trial=42", { ambiguousTrialIds: ["42"] })))
      .toBe("CURSOR_STUDY_REQUIRED");
    // RF01-B4 · p02-cursor.v2: `stage` is admitted, ordered first, and is the
    // one closed-set key; every other value stays opaque (a non-numeric fold
    // or trial id is a valid identifier, not a coercion target).
    expect(CURSOR_CODEC).toBe("p02-cursor.v2");
    expect(CURSOR_STAGES).toEqual(["summary", "split", "search", "freeze", "execute", "claim", "atlas"]);
    const staged = parseResearchCursor("fold=wf-3&trial=t-0042&stage=search&study=s-west");
    expect(staged).toEqual({ fold: "wf-3", trial: "t-0042", stage: "search", study: "s-west" });
    expect(serializeResearchCursor(staged)).toBe("stage=search&fold=wf-3&study=s-west&trial=t-0042");
    expect(errorCode(() => parseResearchCursor("stage=deploy"))).toBe("CURSOR_VALUE_INVALID");
    expect(errorCode(() => parseResearchCursor("stage=search&stage=split"))).toBe("CURSOR_DUPLICATE_KEY");
    expect(errorCode(() => parseResearchCursor("stage=search&tab=split"))).toBe("CURSOR_UNSUPPORTED_KEY");
    expect(errorCode(() => parseResearchCursor("stage=claim&seq=9&event_seq=8"))).toBe("CURSOR_SEQUENCE_CONFLICT");
    expect(errorCode(() => assertIdentityBinding({
      workspace_id: "ws_p02", research_alpha_id: "alpha", strategy_adapter_id: "strategy-a",
      execution_subject_id: "strategy-b", actor_user_id: "usr_p02",
    }))).toBe("EXECUTION_SUBJECT_STRATEGY_MISMATCH");
    expect(P02ContractError).toBeTypeOf("function");
  });

  it("P02-FE-01: freezes all S02 form controls into a generated-client requested_spec contract", () => {
    const accepted = assertRequestedSpecV1(validRequestedSpec());
    expect(accepted).toMatchObject({
      schema_version: "research.requested-spec.v1",
      execution_route: "intrabar_bracket",
      route_params: { intrabar: { same_bar_policy: "stop_first" } },
      data: { dataset_id: "btc_usdt_1m" },
      protocol: "three_window_decay",
    });
    expect(errorCode(() => assertRequestedSpecV1({
      ...validRequestedSpec(),
      invented_hifi_field: true,
    }))).toBe("REQUESTED_SPEC_UNKNOWN_FIELD");
    expect(errorCode(() => assertRequestedSpecV1({
      ...validRequestedSpec(),
      route_params: {},
    }))).toBe("REQUESTED_SPEC_ROUTE_PARAMS_MISSING_FIELD");
    const advanced = validRequestedSpec({
      protocol: "advanced",
      execution_route: "reactive",
      route_params: { reactive: { runtime: "R2", audit_mode: "audit" } },
      walk_forward: {
        start: "2024-01-01T00:00",
        end_exclusive: "2024-04-01T00:00",
        split_mode: "2024-02-01T00:00",
        frequency: "monthly",
        window_mode: "expanding",
      },
    });
    delete advanced.windows;
    expect(assertRequestedSpecV1(advanced)).toMatchObject({
      protocol: "advanced",
      walk_forward: { frequency: "monthly" },
      route_params: { reactive: { runtime: "R2" } },
    });

    const fieldMap = JSON.parse(readFileSync(
      new URL("../../upgrade/research_loop/evidence/P02/requested-spec-field-map.v1.json", import.meta.url),
      "utf8",
    ));
    expect(fieldMap.denominator).toMatchObject({
      html_form_controls: REQUESTED_SPEC_V1_S02_FORM_CONTROL_DENOMINATOR,
      source_action_records: 24,
      mapped_form_controls: 24,
    });
    expect(fieldMap.controls).toHaveLength(REQUESTED_SPEC_V1_S02_FORM_CONTROL_DENOMINATOR);
    expect(fieldMap.controls.map((row: { source_control_id: string }) => row.source_control_id)).toEqual([
      "control-5", "control-6", "control-14", "control-15", "control-16", "control-18",
      "control-19", "control-22", "control-23", "control-25", "control-26", "control-27",
      "control-31", "control-32", "control-33", "control-34", "control-35", "control-36",
      "control-41", "control-42", "control-43", "control-44", "control-45", "control-47",
    ]);
  });

  it("P02-FE-01: keeps nested requested_spec mirrors consistent with the unchanged legacy facade fields", () => {
    const request = {
      strategy_id: "alpha_p02",
      dataset_id: "btc_usdt_1m",
      protocol: "three_window_decay",
      research_contract_version: "research.run-request.v1",
      research: {
        client_intent_id: "intent-p02-mirror-001",
        alpha_version_id: "research-alpha-p02-v1",
        preflight_token: "pft1.current-source.compatibility.token",
        requested_spec: validRequestedSpec(),
      },
    };
    expect(assertResearchRunRequestV1(request).research.requested_spec).toMatchObject({
      strategy_id: "alpha_p02",
      data: { dataset_id: "btc_usdt_1m" },
    });
    expect(errorCode(() => assertResearchRunRequestV1({
      ...request,
      dataset_id: "eth_usdt_1m",
    }))).toBe("RESEARCH_REQUEST_LEGACY_MIRROR_MISMATCH");
    expect(errorCode(() => assertResearchRunRequestV1({
      ...request,
      research: { ...request.research, alpha_version_id: null },
    }))).toBe("RESEARCH_REQUEST_ALPHA_VERSION_MISMATCH");
  });
});
