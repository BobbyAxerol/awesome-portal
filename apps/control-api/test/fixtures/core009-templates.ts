/** TEST_ONLY. Fills the reviewed Core009 templates with SYNTHETIC values so the
 * strict production schemas can prove the templates track them. Nothing here is
 * a key, certificate, hash of a real file, approval, receipt or session. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TEMPLATE_DIR = process.env.PORTAL_CORE009_TEMPLATES_DIR ?? join(__dirname, "../../../../deploy/research-preview/native-core-templates");
export const RUNTIME_TEMPLATE = "native-core-runtime.v1.template.json";
export const OWNER_READ_TEMPLATE = "private-owner-manager-commissioning.v1.read-only.template.json";
export const OWNER_STREAM_TEMPLATE = "private-owner-manager-commissioning.v1.read-and-stream.template.json";
export const readTemplate = (name: string): string => readFileSync(join(TEMPLATE_DIR, name), "utf8");

export const PLACEHOLDER_QUOTED = /"<<FILL:([a-z0-9]+):([A-Z0-9_]+)(?:\|[\s\S]*?)?>>"/g;
export const NOW = Date.UTC(2026, 9, 20, 6, 30, 0);
export const MINUTE = 60_000, HOUR = 3_600_000;
export const TRUST_EXPIRES = Date.UTC(2026, 9, 20, 8, 0, 59);

const ints: Record<string, number> = {
  POOL_MAX: 4, POOL_CONNECTION_TIMEOUT_MS: 2000, POOL_STATEMENT_TIMEOUT_MS: 3000, POOL_QUERY_TIMEOUT_MS: 6000,
  POOL_IDLE_TX_TIMEOUT_MS: 3000, RT_MAX_CLIENTS: 2, RT_MAX_ENTRIES_PER_CLIENT: 4, RT_MAX_FRAME_BYTES: 32768,
  RT_MAX_CLIENT_BYTES: 65536, RT_MAX_TOTAL_BYTES: 131072, RT_MAX_NOTICES_PER_READ: 8, RT_READ_TIMEOUT_MS: 1000,
  SOURCE_DEADLINE_MS: 1000, SOURCE_REQUEST_BYTES: 32768, SOURCE_RESPONSE_BYTES: 32768, SOURCE_MAX_INFLIGHT: 1,
  LEASE_TTL_MS: 10000, LEASE_MAX_UNRESOLVED: 4, LEASE_MAX_RETAINED: 32, TERMINAL_TTL_SECONDS: 30,
  EGRESS_MAX_RESPONSE_BYTES: 1048576, EGRESS_MAX_INFLIGHT: 1, EGRESS_SEND_TIMEOUT_MS: 1000, EGRESS_QUIESCE_TIMEOUT_MS: 1000,
  MUTATION_MAX_INTENTS: 128, MUTATION_MAX_RECOVERIES_PER_REQUEST: 8, PLAN_B_MAXIMUM_GRANT_MS: 2 * 3_600_000,
};
const ms: Record<string, number> = {
  TRUST_NOT_AFTER_MS: TRUST_EXPIRES, INSTALLATION_EXPIRES_AT_MS: NOW + 90 * MINUTE, INSTALLATION_SCOPE_VALID_UNTIL_MS: NOW + 90 * MINUTE,
  INTAKE_NOT_BEFORE_MS: NOW - MINUTE, INTAKE_NOT_AFTER_MS: NOW + 90 * MINUTE,
  SEAL_VALID_FROM_MS: NOW - HOUR, SEAL_VALID_UNTIL_MS: NOW + 6 * HOUR,
  READ_GRANT_VALID_FROM_MS: NOW - MINUTE, READ_GRANT_VALID_UNTIL_MS: NOW + 90 * MINUTE,
  STREAM_GRANT_VALID_FROM_MS: NOW - MINUTE, STREAM_GRANT_VALID_UNTIL_MS: NOW + 90 * MINUTE,
};
const isos: Record<string, string> = {
  NATIVE_EFFECTIVE_FROM: "2026-10-20T06:00:00Z", NATIVE_EXPIRES_AT: "2026-10-20T08:00:30Z",
};
const strs: Record<string, string> = {
  NATIVE_ACCEPTANCE_REVISION: "2", NATIVE_POLICY_REVISION: "1",
  NATIVE_OWNER_MAPPING_REVISION: "ts-user:33333333-3333-3333-3333-333333333333:1",
};
const pad = (name: string): string => createHash("sha256").update("TEST_ONLY:" + name).digest("hex");

export type Overrides = Record<string, string | number>;
/** Replace every quoted placeholder by a SYNTHETIC JSON literal. */
export function fill(template: string, overrides: Overrides = {}, keep: readonly string[] = []): string {
  return template.replace(PLACEHOLDER_QUOTED, (whole, type: string, name: string) => {
    if (keep.includes(name)) return whole;
    if (name in overrides) return JSON.stringify(overrides[name]);
    if (type === "int") return String(ints[name] ?? 1);
    if (type === "ms") return String(ms[name] ?? NOW);
    if (type === "iso") return JSON.stringify(isos[name] ?? "2026-10-20T06:00:00Z");
    if (type === "hex64") return JSON.stringify(pad(name));
    if (type === "sha256p") return JSON.stringify("sha256:" + pad(name));
    if (type === "uuid") return JSON.stringify("44444444-4444-4444-4444-444444444444");
    if (type === "path") return JSON.stringify(name === "OWNER_ARTIFACT_PATH" ? "/root/TEST_ONLY-owner.json" : `/run/secrets/research-native/${name.toLowerCase()}`);
    if (type === "url") return JSON.stringify("https://pm.test-only.invalid:28446");
    return JSON.stringify(strs[name] ?? `test-only-${name.toLowerCase()}`);
  });
}
/** Canonical compact bytes, as the loaders require. */
export const compact = (text: string): Buffer => Buffer.from(JSON.stringify(JSON.parse(text)), "utf8");
export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export interface Prepared { runtime: Buffer; owner: Buffer; runtimeValue: any; ownerValue: any }
/** Fill both templates coherently; the runtime pin is recomputed from the owner bytes. */
export function prepared(ownerTemplate = OWNER_READ_TEMPLATE, edit: (runtime: any, owner: any) => void = () => undefined,
  runtimeOverrides: Overrides = {}): Prepared {
  const ownerValue = JSON.parse(fill(readTemplate(ownerTemplate)));
  const runtimeValue = JSON.parse(fill(readTemplate(RUNTIME_TEMPLATE), runtimeOverrides));
  // The runtime template carries the Plan B grant_window pin. The retained READ-only
  // (superseded Plan A) owner template is paired with a manifest without it.
  if (ownerTemplate === OWNER_READ_TEMPLATE) for (const intake of runtimeValue.composition.owner_intakes) delete intake.grant_window;
  edit(runtimeValue, ownerValue);
  const owner = Buffer.from(JSON.stringify(ownerValue), "utf8");
  if (!("OWNER_ARTIFACT_SHA256" in runtimeOverrides)) runtimeValue.composition.owner_intakes[0].approved_sha256 = sha256(owner);
  return { runtime: Buffer.from(JSON.stringify(runtimeValue), "utf8"), owner, runtimeValue, ownerValue };
}
