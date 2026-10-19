/**
 * `schema_version` dispatch and the V1 readers' refusal of a V2 body.
 *
 * Every delivered V2 fixture is read from disk (`loadCanonical`) and pushed
 * through the route's dispatcher; the V1 readers are then given the same V2
 * bodies directly and must refuse them rather than answer a V1-shaped object.
 * V1 bodies must still read exactly as before (the V1 suites are untouched).
 */
import { describe, expect, it } from "vitest";

import { readLiveReview } from "../../api/profileRead";
import { readGateR2Detail, readPaperExitDetail } from "../../api/rows";
import { refusalReason, v1Refusal } from "../../api/schemaGuard";
import { readCanaryControlRoom, readSandboxCertification } from "../../certification";
import { CANARY_ROOM_FIXTURE, LIVE_FULL_FIXTURE, SANDBOX_CERTIFICATION_FIXTURE } from "../../certification.fixtures";
import { ACTIVATION_CAPABILITIES } from "../../derivedReads.fixtures";
import { readLiveFullOperations } from "../../liveFull";
import { readStagedActivation } from "../../stagedActivation";
import { loadCanonical } from "../testkit/loadCanonical";
import { schemaVersionCases } from "../testkit/negative";
import {
  readActivationByVersion,
  readByVersion,
  readCanaryByVersion,
  readLiveFullByVersion,
  readLiveReviewByVersion,
  readOperationParentByVersion,
  readPaperExitByVersion,
  readR2ByVersion,
  readSandboxByVersion,
  LIVE_FULL_PAGEABLE_PANELS,
  stageVersionedSearch,
  unsupportedText,
  v1Versioned,
} from "./dispatch";

type Fixture = Record<string, any>;
const parent = () => loadCanonical<Fixture>("execution-positive-parent.synthetic");
const liveSource = () => loadCanonical<Fixture>("execution-live-source.synthetic");
const activation = () => loadCanonical<Fixture>("execution-activation-current.synthetic");

describe("every delivered V2 body goes to its V2 reader through the route's dispatcher", () => {
  const routes: [string, (raw: unknown) => { kind: string; schemaVersion: string | null }, string[]][] = [
    ["R2", readR2ByVersion, ["r2", "r2_absent"]],
    ["Paper Exit", readPaperExitByVersion, ["paper_exit", "paper_exit_absent", "paper_exit_extended"]],
    ["Live", readLiveReviewByVersion, ["live"]],
    ["Sandbox", readSandboxByVersion, ["sandbox", "sandbox_absent", "sandbox_draft"]],
    ["Canary", readCanaryByVersion, ["canary", "canary_absent", "canary_revision"]],
    ["operation parent", readOperationParentByVersion, [
      "r2_operation", "r2_operation_uncaptured", "r2_operation_applied", "r2_operation_expired",
      "paper_exit_operation", "paper_exit_operation_applied", "paper_exit_operation_expired",
    ]],
  ];
  for (const [route, dispatch, keys] of routes) {
    it.each(keys)(`${route}: %s -> v2`, (key) => {
      const read = dispatch(parent()[key]);
      expect(read.kind).toBe("v2");
      expect(read.schemaVersion).toBe(parent()[key].schema_version);
    });
  }

  it("Live full (live-source): populated and unpublished -> v2", () => {
    for (const key of ["populated", "unpublished"]) {
      const read = readLiveFullByVersion(liveSource()[key]);
      expect(read.kind).toBe("v2");
    }
  });

  it("Activation: both V2 schemas are named and refused as not built, never read as V1", () => {
    for (const key of ["capabilities", "plan", "plan_absent"]) {
      const read = readActivationByVersion(activation()[key]);
      expect(read).toMatchObject({ kind: "unsupported", reason: "V2_READER_NOT_BUILT", schemaVersion: activation()[key].schema_version });
    }
  });

  it("the compositions' embedded parents read through the same dispatchers", () => {
    const p = parent();
    expect(readR2ByVersion(p.r2_composition.data.governance).kind).toBe("v2");
    expect(readPaperExitByVersion(p.paper_exit_composition.data.exit_review).kind).toBe("v2");
    expect(readLiveReviewByVersion(p.live_composition.data.governance).kind).toBe("v2");
  });
});

describe("V1 bodies still go to the V1 reader, unchanged", () => {
  it("R2, Paper Exit and Live reviews", () => {
    const r2 = readR2ByVersion(loadCanonical("execution-governance.r2-review"));
    expect(r2.kind).toBe("v1");
    const exit = readPaperExitByVersion(loadCanonical("execution-governance.paper-exit-review"));
    expect(exit.kind).toBe("v1");
    const live = readLiveReviewByVersion(loadCanonical("governance-live-review"));
    expect(live.kind).toBe("v1");
  });

  it("a V1 read through the dispatcher is the value the V1 reader answers directly", () => {
    const raw = loadCanonical("execution-governance.r2-review");
    const viaDispatch = readR2ByVersion(raw);
    if (viaDispatch.kind !== "v1") throw new Error("expected v1");
    expect(viaDispatch.value).toEqual(readGateR2Detail(raw));
  });

  it("certification, canary, live-full and activation V1 bodies", () => {
    expect(readSandboxByVersion(SANDBOX_CERTIFICATION_FIXTURE).kind).toBe("v1");
    expect(readCanaryByVersion(CANARY_ROOM_FIXTURE).kind).toBe("v1");
    expect(readLiveFullByVersion(LIVE_FULL_FIXTURE).kind).toBe("v1");
    expect(readActivationByVersion(ACTIVATION_CAPABILITIES).kind).toBe("v1");
  });

  it("a V1 body that carries no schema_version is still a V1 body", () => {
    const raw = loadCanonical<Fixture>("execution-governance.r2-review");
    delete raw.schema_version;
    expect(readR2ByVersion(raw).kind).toBe("v1");
  });
});

describe("the V1 readers refuse every V2 body instead of answering a V1-shaped object", () => {
  const cases: [string, (raw: unknown) => unknown, () => unknown][] = [
    ["readGateR2Detail <- r2", readGateR2Detail, () => parent().r2],
    ["readGateR2Detail <- r2_absent", readGateR2Detail, () => parent().r2_absent],
    ["readGateR2Detail <- r2_operation", readGateR2Detail, () => parent().r2_operation],
    ["readPaperExitDetail <- paper_exit", readPaperExitDetail, () => parent().paper_exit],
    ["readPaperExitDetail <- paper_exit_extended", readPaperExitDetail, () => parent().paper_exit_extended],
    ["readPaperExitDetail <- paper_exit_operation", readPaperExitDetail, () => parent().paper_exit_operation],
    ["readSandboxCertification <- sandbox", readSandboxCertification, () => parent().sandbox],
    ["readSandboxCertification <- sandbox_absent", readSandboxCertification, () => parent().sandbox_absent],
    ["readSandboxCertification <- sandbox_draft", readSandboxCertification, () => parent().sandbox_draft],
    ["readCanaryControlRoom <- canary", readCanaryControlRoom, () => parent().canary],
    ["readCanaryControlRoom <- canary_revision", readCanaryControlRoom, () => parent().canary_revision],
    ["readLiveReview <- live", readLiveReview, () => parent().live],
    ["readLiveFullOperations <- populated", readLiveFullOperations, () => liveSource().populated],
    ["readLiveFullOperations <- unpublished", readLiveFullOperations, () => liveSource().unpublished],
    ["readStagedActivation <- capabilities", readStagedActivation, () => activation().capabilities],
    ["readStagedActivation <- plan", readStagedActivation, () => activation().plan],
  ];
  it.each(cases)("%s -> null, with the schema_version named", (_name, reader, body) => {
    expect(reader(body())).toBeNull();
    const refusal = v1Refusal(body());
    expect(refusal).toEqual({ code: "SCHEMA_VERSION_NOT_V1", schemaVersion: (body() as Fixture).schema_version });
    expect(refusalReason(body(), "The review response could not be read.")).toContain((body() as Fixture).schema_version);
  });

  it("the three claims the V1 reader used to make about a V2 body are not made", () => {
    // Before: r1LineagePublished:false + capital:[] for a body whose lineage is AVAILABLE.
    expect(readGateR2Detail(parent().r2)).toBeNull();
    // Before: stage:null, panels:[], gateMet:false.
    expect(readPaperExitDetail(parent().paper_exit)).toBeNull();
    // Before: all three side-effect flags true for a body that says false.
    expect(readSandboxCertification(parent().sandbox)).toBeNull();
  });
});

describe("L3: swapped and mixed shapes", () => {
  it("a V2 shape wearing a V1 schema_version is refused by the V1 reader and by the dispatcher", () => {
    for (const [reader, key, v1Version] of [
      [readGateR2Detail, "r2", "governance.r2-review.v1"],
      [readPaperExitDetail, "paper_exit", "governance.paper-exit-review.v1"],
      [readSandboxCertification, "sandbox", "governance.sandbox-certification.v1"],
      [readLiveReview, "live", "governance.live-review.v1"],
    ] as const) {
      const body = { ...parent()[key], schema_version: v1Version };
      expect(reader(body)).toBeNull();
      expect(v1Refusal(body)?.code).toBe("V2_MARKERS_UNDER_V1_VERSION");
    }
    expect(readR2ByVersion({ ...parent().r2, schema_version: "governance.r2-review.v1" })).toMatchObject({
      kind: "unsupported", reason: "V2_MARKERS_UNDER_V1_VERSION", schemaVersion: "governance.r2-review.v1",
    });
  });

  it("a V2 shape with no schema_version at all is refused, not read as V1", () => {
    const body = structuredClone(parent().r2);
    delete body.schema_version;
    expect(readGateR2Detail(body)).toBeNull();
    expect(readR2ByVersion(body)).toMatchObject({ kind: "unsupported", reason: "V2_MARKERS_UNDER_V1_VERSION" });
  });

  it("a V1 body whose data envelope claims V2 is refused", () => {
    const body = loadCanonical<Fixture>("execution-governance.r2-review");
    body.data.schema_version = "portal.execution.governance-parent.v2";
    expect(readGateR2Detail(body)).toBeNull();
    expect(readR2ByVersion(body)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
  });

  it("a V1 shape wearing a V2 schema_version is a malformed V2 body, never a V1 read", () => {
    const body = loadCanonical<Fixture>("execution-governance.r2-review");
    body.schema_version = "portal.execution.governance-parent.v2";
    expect(readR2ByVersion(body)).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
    const cert = { ...(SANDBOX_CERTIFICATION_FIXTURE as Fixture), schema_version: "portal.execution.following-parent.v2" };
    expect(readSandboxByVersion(cert)).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
  });

  it("a route given another route's V2 schema is not read", () => {
    // live-parent.v2 on the R2 route; following-parent.v2 on the R2 route; governance-parent.v2 on the Live route.
    expect(readR2ByVersion(parent().live)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
    expect(readR2ByVersion(parent().sandbox)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
    expect(readLiveReviewByVersion(parent().r2)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
    expect(readCanaryByVersion(liveSource().populated)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
    // Same schema, other family: the route's V2 reader refuses it.
    expect(readR2ByVersion(parent().paper_exit)).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
    expect(readSandboxByVersion(parent().canary)).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
    expect(readOperationParentByVersion(parent().r2)).toMatchObject({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" });
  });

  it("a V1 body on a route with no V1 reader is named, not guessed", () => {
    expect(readOperationParentByVersion({ id: "op_1" })).toMatchObject({ kind: "unsupported", reason: "V1_READER_NOT_BUILT" });
  });

  describe("schema_version variants of a real V2 body", () => {
    const base = parent().r2;
    const cases = schemaVersionCases(
      base, ["schema_version"], base.schema_version,
      ["portal.execution.live-parent.v2", "portal.execution.following-parent.v2", "governance.r2-review.v1"],
    );
    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      const read = readR2ByVersion(c.value);
      // A V2 shape under any other schema_version is never a v1 and never a v2.
      expect(read.kind).toBe("unsupported");
    });
  });

  it("a malformed V2 body is refused, whole", () => {
    const body = structuredClone(parent().r2);
    body.lineage.r1_approval_id = 7;
    expect(readR2ByVersion(body)).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED" });
  });

  it("answers not-an-object for anything that is not a document", () => {
    for (const raw of [null, undefined, 0, "text", [], true]) {
      expect(readR2ByVersion(raw)).toMatchObject({ kind: "unsupported", reason: "NOT_AN_OBJECT" });
    }
  });
});

describe("unsupportedText", () => {
  it("names the schema_version it saw", () => {
    const read = readByVersion({ schema_version: "portal.execution.something.v9" }, { v2Schemas: [] });
    expect(read.kind).toBe("unsupported");
    if (read.kind !== "unsupported") throw new Error("unreachable");
    expect(unsupportedText(read)).toContain("portal.execution.something.v9");
    expect(unsupportedText({ kind: "unsupported", schemaVersion: null, reason: "V1_MALFORMED" })).toContain("no schema_version");
  });
});

describe("the stage port helpers", () => {
  it("the pageable Live panels are the published query enum: ten, without broker_sync", () => {
    expect([...LIVE_FULL_PAGEABLE_PANELS]).toEqual([
      "deployments", "positions", "sessions", "orders", "fills", "accounts", "account_balances", "margin_balances", "account_sync", "reconciliation",
    ]);
  });

  it("stageVersionedSearch: no options is no query; workspace, panel and cursor are encoded in that order", () => {
    expect(stageVersionedSearch()).toEqual({ ok: true, search: "" });
    expect(stageVersionedSearch({})).toEqual({ ok: true, search: "" });
    expect(stageVersionedSearch({ workspaceId: "a b" })).toEqual({ ok: true, search: "?workspace_id=a+b" });
    expect(stageVersionedSearch({ cursor: "" })).toEqual({ ok: true, search: "" });
    expect(stageVersionedSearch({ workspaceId: "w", panel: "orders", cursor: "c&x=1" })).toEqual({ ok: true, search: "?workspace_id=w&panel=orders&cursor=c%26x%3D1" });
  });

  it("stageVersionedSearch: a panel outside the enum, or a cursor with no panel, is refused with a reason", () => {
    for (const panel of ["broker_sync", "", "nope", "ORDERS"]) expect(stageVersionedSearch({ panel }).ok).toBe(false);
    const refused = stageVersionedSearch({ cursor: "lps2.x" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain("panel");
  });

  it("v1Versioned wraps a V1 value as a v1 read and passes warnings and failures through untouched", () => {
    expect(v1Versioned({ ok: true, value: 7 })).toEqual({ ok: true, value: { kind: "v1", schemaVersion: null, value: 7 } });
    expect(v1Versioned({ ok: true, value: 7, warnings: ["w"] })).toEqual({ ok: true, value: { kind: "v1", schemaVersion: null, value: 7 }, warnings: ["w"] });
    const failure = { ok: false as const, status: "denied" as const, reason: "no" };
    expect(v1Versioned(failure)).toBe(failure);
  });
});
