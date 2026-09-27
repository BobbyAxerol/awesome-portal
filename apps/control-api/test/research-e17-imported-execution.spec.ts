/**
 * E17/OL-01: exact-digest imported Alpha admission.
 *
 * Registration and activation do not make arbitrary Python executable:
 * evidence admission permits DRAFT/ACTIVE with the installed immutable binding,
 * the feature fence and one deliberately narrow source/output contract.
 */

import { describe, expect, it, vi } from "vitest";

import { PrincipalService } from "../src/auth/principal";
import { loadConfig } from "../src/config";
import {
  IMPORTED_ALPHA_ADAPTER_CONTRACT,
  IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  IMPORTED_ALPHA_ADAPTER_ID,
  IMPORTED_ALPHA_PROFILE,
  IMPORTED_ALPHA_PROFILE_DIGEST,
  IMPORTED_ALPHA_PROFILE_ID,
  importedAlphaDigest,
} from "../src/research/imported-alpha.profile";
import type { ResearchRequestedSpec } from "../src/research/preflight.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateError } from "../src/research/run-create.error";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { ResearchProgressIngressController } from "../src/research/progress-ingress.controller";
import { ResearchEvidenceSourceSchema, ResearchSplitSourceSchema } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";
import { p14SplitSourceFixture } from "./research-split.fixture";
import {
  admissionRepository,
  manifestFor,
  p04Requested,
  w1Admin,
  w1Scope,
} from "./research-w1-wfo.fixture";

const importedDeclaration = {
  schema_version: "research.alpha-source.v1",
  version: "0.3.0",
  entrypoint: "generate_signals",
  timeframes: ["1h"],
  required_columns: ["open", "high", "low", "close", "volume"],
  warmup_bars: 32,
  determinism: { seed_required: true },
  parameter_space: {
    window: { kind: "int_range", low: 8, high: 64, step: 1 },
    regime: { kind: "categorical", values: ["normal", "stress"] },
    exposure: { kind: "fixed", value: 0.5 },
  },
};

const privateSecret = "e17-private-principal-secret-0123456789";

function signedWorker() {
  const token = new PrincipalService(privateSecret).sign({
    principalId: "research-progress-worker",
    username: "research-progress-worker",
    accessSubject: null,
    accessEmail: null,
    role: "ADMIN",
    authnMethods: ["research_progress_writer"],
    sessionId: "research-progress-worker",
    mustChangePassword: false,
    issuedAt: new Date().toISOString(),
  });
  return { headers: { "x-portal-principal": token } } as never;
}

function importedRequested(overrides: Partial<ResearchRequestedSpec> = {}): ResearchRequestedSpec {
  return p04Requested({
    alpha_binding: { alpha_id: "imported-alpha", alpha_version_id: "av_imported_0_3_0" },
    strategy_id: "imported-alpha",
    random_seed: 7,
    parameter_space_overrides: [
      { name: "window", kind: "pin", value: 32 },
      { name: "regime", kind: "pin", value: "normal" },
    ],
    ...overrides,
  });
}

function importedEligibility(lifecycleState: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED" = "ACTIVE") {
  return {
    alphaId: "imported-alpha",
    alphaVersionId: "av_imported_0_3_0",
    lifecycleState,
    declaredContract: importedDeclaration,
    entrypoint: "generate_signals",
    sourceDigest: "7".repeat(64),
    binding: {
      alphaId: "imported-alpha",
      alphaVersionId: "av_imported_0_3_0",
      adapterId: IMPORTED_ALPHA_ADAPTER_ID,
      contractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    },
  };
}

function importedConfig(enabled: boolean) {
  return {
    FEATURE_RESEARCH_RUN_PRODUCER: "true",
    FEATURE_RESEARCH_IMPORTED_EXECUTION: enabled ? "true" : "false",
    FEATURE_RESEARCH_WFO_PROFILE: "false",
    RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 15,
  };
}

async function admit(
  spec: ResearchRequestedSpec,
  options: { enabled?: boolean; lifecycle?: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED"; eligibility?: Record<string, unknown> } = {},
) {
  const manifest = manifestFor(spec);
  const repository = admissionRepository(
    manifest,
    options.eligibility ?? importedEligibility(options.lifecycle),
  );
  return new ResearchRunAdmissionService(
    repository as never,
    importedConfig(options.enabled ?? true) as never,
  ).require(w1Admin, w1Scope, manifest.preflightToken, spec);
}

async function refusal(promise: Promise<unknown>): Promise<ResearchRunCreateError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchRunCreateError);
    return error as ResearchRunCreateError;
  }
  throw new Error("expected an E17 typed refusal");
}

describe("E17 installed imported profile", () => {
  it("pins both canonical contract digests", () => {
    expect(importedAlphaDigest(IMPORTED_ALPHA_ADAPTER_CONTRACT))
      .toBe(IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST);
    expect(importedAlphaDigest(IMPORTED_ALPHA_PROFILE))
      .toBe(IMPORTED_ALPHA_PROFILE_DIGEST);
  });

  it("admits the exact imported adapter through retained evidence and split contracts", () => {
    const evidence = structuredClone(p13EvidenceSourceFixture()) as any;
    evidence.source.execution_adapter_id = IMPORTED_ALPHA_ADAPTER_ID;
    expect(ResearchEvidenceSourceSchema.parse(evidence).source.execution_adapter_id)
      .toBe(IMPORTED_ALPHA_ADAPTER_ID);

    const split = structuredClone(p14SplitSourceFixture()) as any;
    split.source.execution_adapter_id = IMPORTED_ALPHA_ADAPTER_ID;
    split.protocol.fold_plan.reason_code = "E17_IMPORTED_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN";
    split.protocol.selection.strict_outer_oos.reason_code =
      "E17_IMPORTED_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS";
    split.windows.outer_oos.evaluation_state = "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE";
    for (const key of ["purge", "embargo", "inner_folds", "theta_per_fold", "gap_scan"] as const) {
      split.absences[key].reason_code = `E17_IMPORTED_FIXED_PROFILE_DOES_NOT_PUBLISH_${key.toUpperCase()}`;
    }
    expect(ResearchSplitSourceSchema.parse(split).source.execution_adapter_id)
      .toBe(IMPORTED_ALPHA_ADAPTER_ID);
  });

  it("defaults dark and refuses an incomplete runtime foundation", () => {
    const base = {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://x:y@127.0.0.1:5432/z",
      PORTAL_ENV: "local",
      AUTH_MODE: "dev",
      INTERNAL_PRINCIPAL_SECRET: "e17-private-principal-secret-0123456789",
    };
    expect(loadConfig(base as never).FEATURE_RESEARCH_IMPORTED_EXECUTION).toBe("false");
    expect(() => loadConfig({ ...base, FEATURE_RESEARCH_IMPORTED_EXECUTION: "true" } as never))
      .toThrow("FEATURE_RESEARCH_IMPORTED_EXECUTION=true requires");
    expect(loadConfig({
      ...base,
      FEATURE_RESEARCH_RUN_PRODUCER: "true",
      FEATURE_RESEARCH_PROGRESS: "true",
      FEATURE_RESEARCH_RETAINED_ARTIFACTS: "true",
      FEATURE_RESEARCH_EVIDENCE: "true",
      FEATURE_RESEARCH_IMPORTED_EXECUTION: "true",
    } as never).FEATURE_RESEARCH_IMPORTED_EXECUTION).toBe("true");
  });

  it("admits DRAFT/ACTIVE evidence only with the installed binding and feature fence", async () => {
    const accepted = await admit(importedRequested());
    expect(accepted.profile).toEqual({
      id: IMPORTED_ALPHA_PROFILE_ID,
      digest: IMPORTED_ALPHA_PROFILE_DIGEST,
    });
    expect(accepted.alpha).toMatchObject({
      adapterId: IMPORTED_ALPHA_ADAPTER_ID,
      adapterContractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
      sourceDigest: "7".repeat(64),
      entrypoint: "generate_signals",
      importedParameters: { exposure: 0.5, regime: "normal", window: 32 },
    });

    expect((await admit(importedRequested(), { lifecycle: "DRAFT" })).profile).toEqual(accepted.profile);
    for (const lifecycle of ["SUPERSEDED", "ABANDONED"] as const) {
      await expect(refusal(admit(importedRequested(), { lifecycle })))
        .resolves.toMatchObject({ code: "RESEARCH_RUN_ALPHA_NOT_ACTIVE", status: 409 });
    }
    for (const binding of [null, { ...importedEligibility().binding, contractDigest: "0".repeat(64) }]) {
      await expect(refusal(admit(importedRequested(), {
        eligibility: { ...importedEligibility("DRAFT"), binding },
      }))).resolves.toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409 });
    }
    await expect(refusal(admit(importedRequested(), { enabled: false })))
      .resolves.toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409 });
  });

  it.each([
    ["missing seed", { random_seed: null }],
    ["sweep", { parameter_space_overrides: [{ name: "window", kind: "sweep", low: 8, high: 64 }] }],
    ["off-step pin", { parameter_space_overrides: [
      { name: "window", kind: "pin", value: 32.5 },
      { name: "regime", kind: "pin", value: "normal" },
    ] }],
    ["unknown pin", { parameter_space_overrides: [
      { name: "window", kind: "pin", value: 32 },
      { name: "regime", kind: "pin", value: "normal" },
      { name: "undeclared", kind: "pin", value: 1 },
    ] }],
    ["optimizer", { optuna_trials: 2 }],
  ] as Array<[string, Partial<ResearchRequestedSpec>]>)(
    "fails closed for %s",
    async (_label, override) => {
      await expect(refusal(admit(importedRequested(override))))
        .resolves.toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409 });
    },
  );

  it.each(["NEW", "CLONE_FOR_EXPERIMENT"] as const)("builds an immutable %s imported envelope with an explicit lineage edge only", async (intentKind) => {
    const spec = importedRequested();
    const manifest = manifestFor(spec);
    const captured: Array<Record<string, unknown>> = [];
    const repository = {
      ...admissionRepository(manifest, importedEligibility()),
      createOrReplayRunProducerIntent: vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
        captured.push(input);
        return { producer: { ...input, dispatchState: "DISPATCHED" }, replayed: false };
      }),
    };
    const config = importedConfig(true);
    const service = new ResearchRunCreateService(
      repository as never,
      new ResearchRunAdmissionService(repository as never, config as never),
      {} as never,
      config as never,
    );
    await service.create(w1Admin, w1Scope, {
      schema_version: "research.run-create.v1",
      client_intent_id: "e17-imported-intent",
      preflight_token: manifest.preflightToken,
      requested_spec: spec,
      intent_kind: intentKind,
      ...(intentKind === "CLONE_FOR_EXPERIMENT" ? { lineage: { relation: "CLONE_OF" as const, parent_run_id: "rrun_parent_e17" } } : {}),
    }, "e17-request");

    expect(captured).toHaveLength(1);
    if (intentKind === "CLONE_FOR_EXPERIMENT") expect(captured[0]).toMatchObject({ clonedFrom: { parentRunId: "rrun_parent_e17" } });
    expect(captured[0]).toMatchObject({
      executionProfileId: IMPORTED_ALPHA_PROFILE_ID,
      executionProfileDigest: IMPORTED_ALPHA_PROFILE_DIGEST,
      executionAdapterId: IMPORTED_ALPHA_ADAPTER_ID,
      resourceClass: "p17-imported-signal-notional-v1",
    });
    const legacy = captured[0]!.legacyRequest as { research: Record<string, unknown> };
    expect(captured[0]!.intentKind).toBe(intentKind);
    expect(legacy.research.intent_kind).toBe("NEW");
    expect(legacy.research).toMatchObject({
      imported_source_digest: "7".repeat(64),
      imported_entrypoint: "generate_signals",
      imported_parameters: { exposure: 0.5, regime: "normal", window: 32 },
    });
    expect(sha256ResearchJson(legacy)).not.toBe("");
    expect(JSON.stringify(legacy)).not.toContain("source_base64");
    expect(JSON.stringify(legacy)).not.toContain("source_file_ref");
    expect(JSON.stringify(legacy)).not.toContain("ALPHA_CONTRACT");
  });

  it("refuses a clone label without an explicit parent before dispatch or admission", async () => {
    const admission = { require: vi.fn() };
    const service = new ResearchRunCreateService({} as never, admission as never, {} as never, importedConfig(true) as never);
    await expect(service.create(w1Admin, w1Scope, {
      schema_version: "research.run-create.v1", client_intent_id: "e17-unbound-clone",
      preflight_token: "rpft_unbound_clone", requested_spec: importedRequested(), intent_kind: "CLONE_FOR_EXPERIMENT",
    }, "e17-clone")).rejects.toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409 });
    expect(admission.require).not.toHaveBeenCalled();
  });

  it("returns source bytes only after worker auth, feature fence and exact current lease", async () => {
    const progress = { resolveIngress: vi.fn().mockResolvedValue({
      workspaceId: "ws_e17", actorUserId: "usr_e17", jobId: "rjob_e17",
      workerAttemptId: "rwa_e17", leaseEpoch: 3, executionProfileId: IMPORTED_ALPHA_PROFILE_ID,
    }) };
    const metadata = { loadImportedExecutionSource: vi.fn().mockResolvedValue({
      sourceBytes: Buffer.from("ALPHA_CONTRACT = {}\n", "utf8"),
      sourceDigest: "7".repeat(64),
      entrypoint: "generate_signals",
    }) };
    const controller = new ResearchProgressIngressController(
      {} as never,
      { INTERNAL_PRINCIPAL_SECRET: privateSecret, FEATURE_RESEARCH_IMPORTED_EXECUTION: "true" } as never,
      progress as never,
      metadata as never,
      {} as never,
      {} as never,
    );
    const body = {
      schema_version: "research.imported-source-resolve.v1",
      workspace_id: "ws_e17",
      run_id: "rrun_e17",
      job_id: "rjob_e17",
      worker_attempt_id: "rwa_e17",
      lease_epoch: 3,
      source_digest: "7".repeat(64),
      entrypoint: "generate_signals",
    };

    await expect(controller.resolveImportedSource({ headers: {} } as never, body))
      .rejects.toMatchObject({ status: 403 });
    expect(progress.resolveIngress).not.toHaveBeenCalled();
    await expect(controller.resolveImportedSource(signedWorker(), body)).resolves.toMatchObject({
      schema_version: "research.imported-source.v1",
      source_digest: "7".repeat(64),
      entrypoint: "generate_signals",
      byte_count: 20,
    });
    expect(progress.resolveIngress).toHaveBeenCalledWith(body);
    expect(metadata.loadImportedExecutionSource).toHaveBeenCalledWith(
      { workspaceId: "ws_e17", actorUserId: "usr_e17" },
      { runId: "rrun_e17", sourceDigest: "7".repeat(64), entrypoint: "generate_signals" },
    );
  });
});
