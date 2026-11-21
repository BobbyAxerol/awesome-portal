import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { draftA2ManifestNotAuthorized } from "../src/execution-v2/c2-a2-manifest-draft";

const names = ["acceptance-evidence.json", "human-token-jwks.json", "identifiers.json", "portal-ca.pem",
  "portal-server-cert.pem", "publication-signer.jwk.json", "ts-mtls-client.crt.pem"];
const make = () => ({ revision: 1, produced_by: "TEST_ONLY", produced_utc: "2026-11-05T05:00:00Z",
  files: names.map(path => ({ path, bytes: Buffer.from(`synthetic:${path}`) })) });
const digest = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

describe("C2 A2 draft metadata, never delivery authority", () => {
  it("returns only deterministic manifest and sums, not bytes or readiness", () => {
    const input = make(), output = draftA2ManifestNotAuthorized(input), manifest = JSON.parse(output.manifest);
    expect(output.state).toBe("DRAFT_NOT_DELIVERABLE");
    expect(manifest).toMatchObject({ schema: "ts-portal.pm-authority-exchange.v1", direction: "portal-to-ts", step: "a2", revision: 1 });
    expect(manifest.files.map((row: {path:string}) => row.path)).toEqual([...names].sort());
    expect(output.sha256sums).toContain(`${digest(output.manifest)}  MANIFEST.json\n`);
    for (const file of input.files) expect(output.sha256sums).toContain(`${digest(file.bytes)}  ${file.path}\n`);
    input.files.reverse();
    expect(draftA2ManifestNotAuthorized(input)).toEqual(output);
    expect(JSON.stringify(output)).not.toContain("synthetic:");
  });
  it("fails closed on missing P7, issuer, duplicates, extra files, invalid bytes or paths", () => {
    for (const index of [0, 1]) {
      const input = make(); input.files.splice(index, 1);
      expect(() => draftA2ManifestNotAuthorized(input)).toThrow("C2_A2_DRAFT_INVALID");
    }
    const duplicate = make(); duplicate.files.push(duplicate.files[0]!);
    expect(() => draftA2ManifestNotAuthorized(duplicate)).toThrow("C2_A2_DRAFT_INVALID");
    for (const path of ["../../private", "MANIFEST.json", "extra.pem"]) {
      const input = make(); input.files.push({ path, bytes: Buffer.from("x") });
      expect(() => draftA2ManifestNotAuthorized(input)).toThrow("C2_A2_DRAFT_INVALID");
    }
    const empty = make(); empty.files[0]!.bytes = Buffer.alloc(0);
    expect(() => draftA2ManifestNotAuthorized(empty)).toThrow("C2_A2_DRAFT_INVALID");
    const large = make(); large.files[0]!.bytes = Buffer.alloc(65537);
    expect(() => draftA2ManifestNotAuthorized(large)).toThrow("C2_A2_DRAFT_INVALID");
  });
  it("accepts only a valid revision and UTC timestamp, and optionally the sample", () => {
    const input = make(); input.files.push({ path: "sample-token.jwt", bytes: Buffer.from("synthetic-expired-sample") });
    expect(JSON.parse(draftA2ManifestNotAuthorized(input).manifest).files).toHaveLength(8);
    expect(() => draftA2ManifestNotAuthorized({ ...input, revision: 0 })).toThrow();
    expect(() => draftA2ManifestNotAuthorized({ ...input, produced_utc: "2026-02-30T05:00:00Z" })).toThrow();
  });
});
