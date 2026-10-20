/** TEST_ONLY. Pure offline inspector + reviewed templates, SYNTHETIC values.
 * No filesystem write, database, Docker, network, key or session. A passing
 * report here is NOT an owner approval, source acceptance or installation. */
import { describe, expect, it } from "vitest";
import { inspectCore009Preparation, statCore009References, type Core009Finding, type Core009StatLike }
  from "../src/execution-v2/core009-preparation";
import { nativeCoreRuntimeManifest } from "../src/execution-v2/native-core-runtime";
import { privateOwnerCommissioningDocument } from "../src/execution-v2/core-owner-commissioning";
import { HOUR, MINUTE, NOW, OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE, PLACEHOLDER_QUOTED, RUNTIME_TEMPLATE,
  TRUST_EXPIRES, compact, fill, prepared, readTemplate, sha256 } from "./fixtures/core009-templates";

const codes = (list: Core009Finding[]) => list.map(f => f.code);
const inspect = (p: ReturnType<typeof prepared>, options: Partial<Parameters<typeof inspectCore009Preparation>[2]> = {}) =>
  inspectCore009Preparation(p.runtime, p.owner, { nowMs: NOW, trustExpiresAtMs: TRUST_EXPIRES, ...options });

describe("TEST_ONLY reviewed Core009 templates track the strict production schemas", () => {
  it("every placeholder follows one grammar and the prefilled facts are the exact Research target", () => {
    for (const name of [RUNTIME_TEMPLATE, OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE]) {
      const text = readTemplate(name);
      expect(() => JSON.parse(text)).not.toThrow();
      const all = text.match(/<<FILL:/g)?.length ?? 0, grammatical = [...text.matchAll(PLACEHOLDER_QUOTED)].length;
      expect(all).toBeGreaterThan(0);
      expect(grammatical).toBe(all); // no malformed or unquoted marker
      expect(text).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/|password|Bearer /i);
    }
    const runtime = JSON.parse(readTemplate(RUNTIME_TEMPLATE)), owner = JSON.parse(readTemplate(OWNER_READ_TEMPLATE));
    const target = runtime.composition.owner_intakes[0].target;
    expect(target).toEqual(owner.target); // identical target in both files
    expect(target).toMatchObject({ database_name: "portal_control", database_system_identifier: "7688673963308855330",
      protected_owner_user_id: "usr_5a38d5dfb08b44748f5776fbe04a1434", workspace_id: "ws_06G19F61YB8CFR7TEWMS7HQ660" });
    expect(runtime.composition.retained_recovery).toEqual([]);
    expect(owner.root_grants).toEqual([]);
  });
  it("filled templates satisfy the exact strict schemas the runtime and installer use", () => {
    const p = prepared();
    expect(nativeCoreRuntimeManifest.safeParse(p.runtimeValue).success).toBe(true);
    expect(privateOwnerCommissioningDocument.safeParse(p.ownerValue).success).toBe(true);
    const s = prepared(OWNER_STREAM_TEMPLATE);
    expect(privateOwnerCommissioningDocument.safeParse(s.ownerValue).success).toBe(true);
  });
  it("an unfilled template is refused with every placeholder located, never partially accepted", () => {
    const report = inspectCore009Preparation(compact(readTemplate(RUNTIME_TEMPLATE)), compact(readTemplate(OWNER_READ_TEMPLATE)), { nowMs: NOW });
    expect(report.ok).toBe(false);
    expect(codes(report.errors)).toContain("RUNTIME_PLACEHOLDER_UNRESOLVED");
    expect(codes(report.errors)).toContain("OWNER_PLACEHOLDER_UNRESOLVED");
    expect(report.errors.find(e => e.code === "RUNTIME_PLACEHOLDER_UNRESOLVED")!.path).toMatch(/^\/.+/);
    expect(report.errors.length).toBeGreaterThan(50);
  });
});

describe("TEST_ONLY Core009 inspector, READ-only plan (default)", () => {
  it("passes a coherent filled pair and reports counts and windows without echoing any private value", () => {
    const p = prepared(), report = inspect(p);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ plan: "read-only", selections: 1, retained_recovery: 0, private_references: 5,
      grants: { business_read_all_allow: 1, stream_subscribe_allow: 0, deny: 0 } });
    expect(report.summary.runtime_sha256).toBe(sha256(p.runtime));
    expect(report.summary.owner_artifact_sha256).toBe(sha256(p.owner));
    expect(report.summary.window_remaining_ms.installation).toBe(90 * MINUTE);
    const text = JSON.stringify(report);
    expect(text).not.toContain("/run/secrets"); // reference paths are never printed
    expect(text).not.toContain(p.runtimeValue.composition.selections[0].config.private_key_ref.sha256);
  });
  it("refuses unknown keys and inline secrets by code and path, not by echoing the value", () => {
    for (const edit of [(r: any) => { r.extra = true; },
      (r: any) => { r.composition.selections[0].config.private_key = "TEST_ONLY-INLINE-SECRET-VALUE"; },
      (r: any) => { r.composition.selections[0].config.selected_source.transport.tls.key_pem = "TEST_ONLY-INLINE-SECRET-VALUE"; }]) {
      const report = inspect(prepared(OWNER_READ_TEMPLATE, edit));
      expect(report.ok).toBe(false);
      expect(codes(report.errors)).toContain("RUNTIME_SCHEMA_UNRECOGNIZED_KEYS");
      expect(JSON.stringify(report)).not.toContain("INLINE-SECRET");
    }
    const owner = inspect(prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.root_grants = [{ any: "grant" }]; o.surprise = 1; }));
    expect(codes(owner.errors)).toContain("OWNER_SCHEMA_UNRECOGNIZED_KEYS");
  });
  it("refuses wrong hashes: manifest pin, owner artifact pin and target pin", () => {
    const p = prepared();
    expect(codes(inspect(p, { expectedRuntimeSha256: "0".repeat(64) }).errors)).toContain("RUNTIME_SHA256_PIN_MISMATCH");
    expect(inspect(p, { expectedRuntimeSha256: sha256(p.runtime) }).ok).toBe(true);
    const wrongOwnerPin = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.owner_intakes[0].approved_sha256 = "1".repeat(64); },
      { OWNER_ARTIFACT_SHA256: "1".repeat(64) });
    expect(codes(inspect(wrongOwnerPin).errors)).toContain("OWNER_ARTIFACT_SHA256_PIN_MISMATCH");
    const wrongTarget = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.owner_intakes[0].target.database_system_identifier = "1"; });
    expect(codes(inspect(wrongTarget).errors)).toContain("OWNER_TARGET_PIN_MISMATCH");
  });
  it("refuses non-compact or duplicate-key bytes even when they parse", () => {
    const p = prepared();
    const pretty = Buffer.from(JSON.stringify(p.runtimeValue, null, 2));
    expect(codes(inspectCore009Preparation(pretty, p.owner, { nowMs: NOW }).errors)).toContain("RUNTIME_NOT_CANONICAL_COMPACT_JSON");
    const dup = Buffer.from(p.owner.toString("utf8").replace('{"schema_version":', '{"schema_version":"x","schema_version":'));
    expect(codes(inspectCore009Preparation(p.runtime, dup, { nowMs: NOW }).errors)).toContain("OWNER_NOT_CANONICAL_COMPACT_JSON");
    expect(codes(inspectCore009Preparation(Buffer.from("{"), p.owner, { nowMs: NOW }).errors)).toContain("RUNTIME_NOT_JSON");
    expect(codes(inspectCore009Preparation(Buffer.alloc(0), p.owner, { nowMs: NOW }).errors)).toContain("RUNTIME_SIZE_INVALID");
  });

  it.each([
    ["installation window already ended", { INSTALLATION_EXPIRES_AT_MS: NOW - 1, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW - 1 }, "INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT"],
    ["installation window too short", { INSTALLATION_EXPIRES_AT_MS: NOW + MINUTE, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW + MINUTE }, "INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT"],
    ["installation window not finite", { INSTALLATION_EXPIRES_AT_MS: NOW + 48 * HOUR, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW + 48 * HOUR }, "INSTALLATION_WINDOW_NOT_FINITE"],
    ["installation outlives the candidate trust", { INSTALLATION_EXPIRES_AT_MS: NOW + 3 * HOUR, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW + 3 * HOUR }, "INSTALLATION_OUTLIVES_TRUST"],
    ["scope outlives the installation", { INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW + 2 * HOUR }, "SCOPE_OUTLIVES_INSTALLATION"],
    ["native acceptance expired", { NATIVE_EXPIRES_AT: "2026-10-20T06:31:00Z" }, "NATIVE_ACCEPTANCE_EXPIRED_OR_TOO_SHORT"],
    ["native acceptance not yet effective", { NATIVE_EFFECTIVE_FROM: "2026-10-20T07:00:00Z" }, "NATIVE_ACCEPTANCE_NOT_YET_EFFECTIVE"],
    ["owner intake closed", { INTAKE_NOT_AFTER_MS: NOW - 1 }, "OWNER_INTAKE_EXPIRED_OR_TOO_SHORT"],
    ["owner intake not open yet", { INTAKE_NOT_BEFORE_MS: NOW + MINUTE }, "OWNER_INTAKE_NOT_YET_OPEN"],
    ["owner intake not finite", { INTAKE_NOT_AFTER_MS: NOW + 72 * HOUR }, "OWNER_INTAKE_NOT_FINITE"],
  ] as const)("refuses finite-validity failure: %s", (_label, overrides, code) => {
    const report = inspect(prepared(OWNER_READ_TEMPLATE, undefined, overrides));
    expect(report.ok).toBe(false);
    expect(codes(report.errors)).toContain(code);
  });
  it("refuses an unusable clock and a grant/seal that is expired, future or unbounded", () => {
    const p = prepared();
    expect(codes(inspectCore009Preparation(p.runtime, p.owner, { nowMs: 0 }).errors)).toEqual(["CLOCK_INVALID"]);
    const expired = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].valid_until_ms = NOW - 1; });
    expect(codes(inspect(expired).errors)).toContain("GRANT_EXPIRED_OR_TOO_SHORT");
    const future = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].valid_from_ms = NOW + 1; });
    expect(codes(inspect(future).errors)).toContain("GRANT_NOT_YET_VALID");
    const longGrant = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.policy.manager_read_domains[0].valid_until_ms = NOW + 400 * HOUR;
      o.manager_domain_grants[0].valid_until_ms = NOW + 200 * HOUR; });
    expect(codes(inspect(longGrant).errors)).toContain("GRANT_NOT_FINITE");
    expect(inspect(longGrant, { maxGrantMs: 300 * HOUR }).errors.map(e => e.code)).not.toContain("GRANT_NOT_FINITE");
    const sealOver = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.policy.manager_read_domains[0].valid_until_ms = NOW - 1; });
    expect(codes(inspect(sealOver).errors)).toContain("FIELD_SEAL_EXPIRED");
  });

  it("mirrors the Research single-Paper-actor ceiling and the composer's selection rules", () => {
    const live = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.selections[0].selector.environment = "sandbox"; });
    expect(codes(inspect(live).errors)).toContain("RESEARCH_REVIEW_CEILING_NOT_MET");
    expect(inspect(live, { researchReview: false }).errors.map(e => e.code)).not.toContain("RESEARCH_REVIEW_CEILING_NOT_MET");
    const noRealtime = prepared(OWNER_READ_TEMPLATE, (r) => { delete r.realtime_limits; });
    expect(codes(inspect(noRealtime).errors)).toContain("RESEARCH_REVIEW_CEILING_NOT_MET");
    const otherSubject = prepared(OWNER_READ_TEMPLATE, (r) => {
      const s = r.composition.selections[0];
      s.selector.subject = "usr_other"; s.config.selected_source.pins.binding.subject = "usr_other"; s.config.selected_source.pins.human.subject = "usr_other";
    });
    expect(codes(inspect(otherSubject).errors)).toContain("RESEARCH_REVIEW_CEILING_NOT_MET");
    const notInIntake = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.owner_intakes[0].target.principal_workspace_pins[0].user_id = "usr_other"; });
    expect(codes(inspect(notInIntake).errors)).toContain("SELECTION_NOT_IN_OWNER_INTAKE");
    const wrongWorkload = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.selections[0].config.selected_source.transport.workload_id = "other"; });
    expect(codes(inspect(wrongWorkload).errors)).toContain("WORKLOAD_NOT_EXPECTED");
    const pinMismatch = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.selections[0].config.selected_source.pins.domain.profile_sha256 = "9".repeat(64); });
    expect(codes(inspect(pinMismatch).errors)).toContain("SELECTOR_PIN_MISMATCH");
    const dup = prepared(OWNER_READ_TEMPLATE, (r) => { r.composition.retained_recovery = [structuredClone(r.composition.selections[0])]; });
    expect(codes(inspect(dup).errors)).toContain("DUPLICATE_SOURCE_IDENTITY");
  });
});

describe("TEST_ONLY Core009 constructor-level limits and the policy-install-only mode", () => {
  it.each([
    ["lease ttl below the candidate floor", (r: any) => { r.composition.selections[0].config.limits.ttl_ms = 500; }, "LEASE_LIMITS_OUT_OF_RANGE"],
    ["retained below unresolved", (r: any) => { r.composition.selections[0].config.limits.maximum_retained = 1; }, "LEASE_LIMITS_OUT_OF_RANGE"],
    ["unresolved above the candidate ceiling", (r: any) => { r.composition.selections[0].config.limits.maximum_unresolved = 129;
      r.composition.selections[0].config.limits.maximum_retained = 200; }, "LEASE_LIMITS_OUT_OF_RANGE"],
    ["terminal ttl above 60 s", (r: any) => { r.composition.selections[0].config.terminal.ttl_seconds = 61; }, "TERMINAL_TTL_OUT_OF_RANGE"],
    ["mapping revision names another TS user", (r: any) => { r.composition.selections[0].config.selected_source.pins.human.mapping_revision = "ts-user:55555555-5555-5555-5555-555555555555:1"; }, "MAPPING_REVISION_TS_USER_MISMATCH"],
    ["pinned workload differs from the transport workload", (r: any) => { r.composition.selections[0].config.selected_source.pins.binding.workload_id = "other"; }, "SOURCE_WORKLOAD_PIN_MISMATCH"],
    ["native acceptance ends before it starts", (r: any) => { const n = r.composition.selections[0].config.selected_source.pins.native;
      n.effective_from = "2026-10-20T06:10:00Z"; n.expires_at = "2026-10-20T06:05:00Z"; }, "NATIVE_WINDOW_INVERTED"],
    ["scope outlives the native acceptance", (r: any) => { r.composition.selections[0].config.selected_source.pins.native.expires_at = "2026-10-20T07:30:00Z"; }, "SCOPE_OUTLIVES_NATIVE_ACCEPTANCE"],
  ])("refuses what the constructors would refuse at start: %s", (_label, edit, code) => {
    expect(codes(inspect(prepared(OWNER_READ_TEMPLATE, edit)).errors)).toContain(code);
  });
  it("a historical source window is an error to SERVE but only a warning to INSTALL the policy", () => {
    const stale = prepared(OWNER_READ_TEMPLATE, undefined, {
      INSTALLATION_EXPIRES_AT_MS: NOW - 2 * HOUR, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW - 2 * HOUR,
      NATIVE_EFFECTIVE_FROM: "2026-10-20T03:00:00Z", NATIVE_EXPIRES_AT: "2026-10-20T04:30:00Z" });
    expect(codes(inspect(stale).errors)).toEqual(expect.arrayContaining(["INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT", "NATIVE_ACCEPTANCE_EXPIRED_OR_TOO_SHORT"]));
    const install = inspect(stale, { mode: "policy-install-only" });
    expect(install.errors).toEqual([]);
    expect(codes(install.warnings)).toEqual(expect.arrayContaining(["INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT", "NATIVE_ACCEPTANCE_EXPIRED_OR_TOO_SHORT"]));
    // The owner side stays strict in that mode: an expired grant or closed intake is never installable.
    const closed = prepared(OWNER_READ_TEMPLATE, undefined, { INTAKE_NOT_AFTER_MS: NOW - 1 });
    expect(codes(inspect(closed, { mode: "policy-install-only" }).errors)).toContain("OWNER_INTAKE_EXPIRED_OR_TOO_SHORT");
    const grant = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].valid_until_ms = NOW - 1; });
    expect(codes(inspect(grant, { mode: "policy-install-only" }).errors)).toContain("GRANT_EXPIRED_OR_TOO_SHORT");
  });
});

describe("TEST_ONLY Core009 READ vs STREAM separation", () => {
  it("a READ-only artifact carries no STREAM grant and a stream plan over it is refused", () => {
    const p = prepared();
    expect(p.ownerValue.manager_domain_grants.map((g: any) => g.action)).toEqual(["business.read_all"]);
    expect(codes(inspect(p, { plan: "read-and-stream" }).errors)).toContain("STREAM_GRANT_MISSING_FROM_READ_AND_STREAM_PLAN");
  });
  it("a STREAM grant inside a READ-only plan is refused, never silently installed", () => {
    const s = prepared(OWNER_STREAM_TEMPLATE), report = inspect(s);
    expect(report.ok).toBe(false);
    expect(codes(report.errors)).toContain("STREAM_GRANT_IN_READ_ONLY_PLAN");
  });
  it("READ plus an explicit STREAM grant passes only under the matching plan, with both counted", () => {
    const s = prepared(OWNER_STREAM_TEMPLATE), report = inspect(s, { plan: "read-and-stream" });
    expect(report.errors).toEqual([]);
    expect(report.summary.grants).toEqual({ business_read_all_allow: 1, stream_subscribe_allow: 1, deny: 0 });
  });
  it("STREAM alone never stands in for READ", () => {
    const s = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants.shift(); });
    const report = inspect(s, { plan: "read-and-stream" });
    expect(codes(report.errors)).toEqual(expect.arrayContaining(["NO_READ_ALLOW_GRANT", "STREAM_WITHOUT_MATCHING_READ", "SELECTION_HAS_NO_READ_GRANT"]));
  });
  it("STREAM cannot borrow another domain or field policy", () => {
    const other = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => {
      o.manager_domain_grants[1].domain.profile_sha256 = "8".repeat(64);
    });
    expect(codes(inspect(other, { plan: "read-and-stream" }).errors)).toEqual(expect.arrayContaining(["STREAM_WITHOUT_MATCHING_READ", "GRANT_OUTSIDE_FIELD_SEAL"]));
    const field = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].field_policy_ref = "other-fields"; });
    expect(codes(inspect(field, { plan: "read-and-stream" }).errors)).toContain("STREAM_WITHOUT_MATCHING_READ");
  });
  it("every runtime selection must have its own READ grant; a DENY is flagged, never counted as READ", () => {
    const wrongDomain = prepared(OWNER_READ_TEMPLATE, (r) => {
      const s = r.composition.selections[0];
      s.selector.domain.catalogue_sha256 = "7".repeat(64); s.config.selected_source.pins.domain.catalogue_sha256 = "7".repeat(64);
    });
    expect(codes(inspect(wrongDomain).errors)).toContain("SELECTION_HAS_NO_READ_GRANT");
    const deny = prepared(OWNER_READ_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].effect = "DENY"; });
    const report = inspect(deny);
    expect(codes(report.errors)).toContain("NO_READ_ALLOW_GRANT");
    expect(codes(report.warnings)).toContain("DENY_GRANT_IN_FIRST_INSTALL");
    expect(report.summary.grants).toMatchObject({ business_read_all_allow: 0, deny: 1 });
  });
  it("applies the installer's own binding rules before any install window is spent", () => {
    const mutations: [string, (o: any) => void, string][] = [
      ["issuer", o => { o.manager_domain_grants[0].issued_by = "usr_other"; }, "GRANT_BINDING_MISMATCH"],
      ["policy revision", o => { o.manager_domain_grants[0].policy_revision = "old"; }, "GRANT_BINDING_MISMATCH"],
      ["already revoked", o => { o.manager_domain_grants[0].revoked_at_ms = NOW; }, "GRANT_BINDING_MISMATCH"],
      ["subject not pinned", o => { o.manager_domain_grants[0].subject_user_id = "usr_other"; }, "GRANT_BINDING_MISMATCH"],
      ["outside the field seal", o => { o.policy.manager_read_domains[0].valid_until_ms = NOW + 60 * MINUTE; }, "GRANT_OUTSIDE_FIELD_SEAL"],
      ["no seal at all", o => { o.policy.manager_read_domains = []; }, "NO_REVIEWED_FIELD_SEAL"],
      ["not owner verified", o => { o.policy.qualification = "UNQUALIFIED"; }, "POLICY_NOT_OWNER_REVIEWED"],
      ["policy for another workspace", o => { o.policy.workspace_id = "ws_other"; }, "POLICY_TARGET_MISMATCH"],
    ];
    for (const [label, edit, code] of mutations) {
      const report = inspect(prepared(OWNER_READ_TEMPLATE, (_r, o) => edit(o)));
      expect(codes(report.errors), label).toContain(code);
    }
    const dup = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].grant_id = o.manager_domain_grants[0].grant_id; });
    expect(codes(inspect(dup, { plan: "read-and-stream" }).errors)).toContain("GRANT_ID_DUPLICATE");
  });
});

describe("TEST_ONLY Core009 reference stat check (lstat only; the service uid owns refs, root owns the artifact)", () => {
  const file = (uid: number, mode = 0o600, size = 100, kind: "file" | "link" = "file"): Core009StatLike => ({ uid, mode: 0o100000 | mode, size,
    isFile: () => kind === "file", isSymbolicLink: () => kind === "link" });
  function fs(p: ReturnType<typeof prepared>, service: number, overrides: Record<string, Core009StatLike | "missing"> = {}) {
    const touched: string[] = [];
    const lstat = async (path: string): Promise<Core009StatLike> => {
      touched.push(path);
      const override = overrides[path];
      if (override === "missing") throw new Error("ENOENT");
      if (override) return override;
      return path === "/root/TEST_ONLY-owner.json" ? file(0) : file(service);
    };
    return { lstat, touched, stat: (options = {}) => statCore009References(p.runtime, lstat, { runtimeUid: service, ...options }) };
  }
  it("passes when every private reference is service-owned and the owner artifact is root 0600", async () => {
    const p = prepared(), f = fs(p, 1000);
    expect(await f.stat({ runtimePath: "/run/secrets/research-native/runtime.json" })).toEqual([]);
    expect(f.touched.length).toBe(1 + 5 + 1); // runtime + five refs + owner artifact: nothing else
  });
  it("reports the root/service ownership tension instead of discovering it at start", async () => {
    const p = prepared(), f = fs(p, 1000, { "/run/secrets/research-native/tls_client_key_path": file(0) });
    expect(codes(await f.stat())).toEqual(["TLS_REF_OWNER_MISMATCH"]);
    const rootOnlyRun = fs(p, 0, { "/root/TEST_ONLY-owner.json": file(1000) });
    expect(codes(await rootOnlyRun.stat())).toContain("OWNER_ARTIFACT_OWNER_MISMATCH");
  });
  it("refuses symlinks, loose modes, empty/oversized files and absent paths", async () => {
    const p = prepared();
    const cases: [string, Core009StatLike | "missing", string][] = [
      ["/run/secrets/research-native/tls_ca_path", file(1000, 0o600, 100, "link"), "TLS_REF_NOT_REGULAR_FILE"],
      ["/run/secrets/research-native/human_signing_key_path", file(1000, 0o640), "SIGNING_REF_MODE_NOT_ALLOWED"],
      ["/run/secrets/research-native/terminal_signing_key_path", file(1000, 0o600, 0), "SIGNING_REF_SIZE_OUT_OF_RANGE"],
      ["/run/secrets/research-native/tls_client_cert_path", file(1000, 0o600, 32769), "TLS_REF_SIZE_OUT_OF_RANGE"],
      ["/run/secrets/research-native/tls_ca_path", "missing", "TLS_REF_UNAVAILABLE"],
      ["/root/TEST_ONLY-owner.json", file(0, 0o644), "OWNER_ARTIFACT_MODE_NOT_ALLOWED"],
    ];
    for (const [path, stat, code] of cases) expect(codes(await fs(p, 1000, { [path]: stat }).stat()), code).toContain(code);
  });
  it("never reports a file path and refuses a manifest it cannot parse", async () => {
    const p = prepared(), f = fs(p, 1000, { "/run/secrets/research-native/tls_ca_path": "missing" });
    expect(JSON.stringify(await f.stat())).not.toContain("/run/secrets");
    expect(await statCore009References(Buffer.from("{}"), f.lstat)).toEqual([{ code: "RUNTIME_NOT_PARSEABLE_FOR_STAT", path: "" }]);
    expect(fill('"<<FILL:str:X>>"')).toBe('"test-only-x"'); // fixture sanity: placeholders become synthetic values only
  });
});
