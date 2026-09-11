import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeJwt, exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { issueD3AssertionCorpus } from "../src/cli/execution-d3-assertions";

describe("D3 assertion corpus", () => {
  it("uses the canonical positive issuer and writes a bounded mode-0600 negative matrix", async () => {
    const root = await mkdtemp(join(tmpdir(), "portal-d3-assertions-"));
    const output = join(root, "tokens");
    await mkdir(output, { mode: 0o700 });
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
    const keyFile = join(root, "delegation-private-key.pem");
    await writeFile(keyFile, await exportPKCS8(privateKey), { mode: 0o600 });

    const result = await issueD3AssertionCorpus({
      privateKeyFile: keyFile,
      keyId: "d3-test-k1",
      issuer: "portal-control-api",
      audience: "portal-execution-edge-paper",
      environment: "paper",
      outputDirectory: output,
      changeWindowId: "CW-D3-TEST",
      now: new Date("2026-08-23T12:00:00Z"),
    });

    expect(result.records).toHaveLength(11);
    expect(result.records.filter((record) => record.expected_http_status === 200)).toHaveLength(1);
    const valid = decodeJwt(await readFile(join(output, "valid.jwt"), "utf8"));
    expect(valid).toMatchObject({
      iss: "portal-control-api",
      aud: "portal-execution-edge-paper",
      environment: "paper",
      scopes: ["execution.read"],
      resources: ["execution:command-center"],
    });
    const tooLong = decodeJwt(await readFile(join(output, "ttl-too-long.jwt"), "utf8"));
    expect(Number(tooLong.exp) - Number(tooLong.iat)).toBe(61);
    const manifest = JSON.parse(await readFile(result.manifestFile, "utf8"));
    expect(manifest).not.toHaveProperty("tokens");
    expect(manifest.resource).toBe("execution:command-center");
    for (const record of result.records) {
      expect((await stat(join(output, record.file))).mode & 0o777).toBe(0o600);
    }
    expect((await stat(result.manifestFile)).mode & 0o777).toBe(0o600);
  });

  it("rejects an output directory that is not empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "portal-d3-dirty-"));
    const output = join(root, "tokens");
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "existing"), "do-not-overwrite", { mode: 0o600 });
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
    const keyFile = join(root, "delegation-private-key.pem");
    await writeFile(keyFile, await exportPKCS8(privateKey), { mode: 0o600 });
    await expect(
      issueD3AssertionCorpus({
        privateKeyFile: keyFile,
        keyId: "d3-test-k1",
        issuer: "portal-control-api",
        audience: "portal-execution-edge-paper",
        environment: "paper",
        outputDirectory: output,
        changeWindowId: "CW-D3-TEST",
      }),
    ).rejects.toThrow(/must be empty/);
  });

  it("issues the exact Manager-v2 resource and rejects resource patterns", async () => {
    const root = await mkdtemp(join(tmpdir(), "portal-d3-manager-v2-"));
    const output = join(root, "tokens");
    await mkdir(output, { mode: 0o700 });
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
    const keyFile = join(root, "delegation-private-key.pem");
    await writeFile(keyFile, await exportPKCS8(privateKey), { mode: 0o600 });

    const result = await issueD3AssertionCorpus({
      privateKeyFile: keyFile,
      keyId: "d3-test-k1",
      issuer: "portal-control-api",
      audience: "portal-execution-edge-paper",
      environment: "paper",
      outputDirectory: output,
      changeWindowId: "CW-MANAGER-V2-TEST",
      resource: "execution:manager-v2:read",
      profileId: "PAPER_BINANCE_USDM",
      matrix: "manager-audit-v1",
    });

    expect(decodeJwt(await readFile(join(output, "valid.jwt"), "utf8"))).toMatchObject({
      resources: ["execution:manager-v2:read"],
      profile_id: "PAPER_BINANCE_USDM",
    });
    expect(result.records).toHaveLength(14);
    expect(decodeJwt(await readFile(join(output, "wrong-resource.jwt"), "utf8"))).toMatchObject({
      resources: ["execution:command-center"],
    });
    expect(decodeJwt(await readFile(join(output, "missing-resource.jwt"), "utf8"))).toMatchObject({
      resources: [],
    });
    expect(decodeJwt(await readFile(join(output, "wrong-profile.jwt"), "utf8"))).toMatchObject({
      profile_id: "PAPER_D3_AUDIT_WRONG",
    });
    const manifest = JSON.parse(await readFile(result.manifestFile, "utf8"));
    expect(manifest).toMatchObject({
      audit_matrix: "manager-audit-v1",
      audit_scope: "manager-v2-metadata-only",
      resource: "execution:manager-v2:read",
      profile_id: "PAPER_BINANCE_USDM",
    });

    const invalidOutput = join(root, "invalid");
    await mkdir(invalidOutput, { mode: 0o700 });
    await expect(
      issueD3AssertionCorpus({
        privateKeyFile: keyFile,
        keyId: "d3-test-k1",
        issuer: "portal-control-api",
        audience: "portal-execution-edge-paper",
        environment: "paper",
        outputDirectory: invalidOutput,
        changeWindowId: "CW-MANAGER-V2-TEST",
        resource: "execution:manager-v2:*" as never,
      }),
    ).rejects.toThrow(/bounded probe contract/);
  });

  it("requires the exact Manager resource and profile for the expanded matrix", async () => {
    const root = await mkdtemp(join(tmpdir(), "portal-d3-manager-audit-invalid-"));
    const output = join(root, "tokens");
    await mkdir(output, { mode: 0o700 });
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
    const keyFile = join(root, "delegation-private-key.pem");
    await writeFile(keyFile, await exportPKCS8(privateKey), { mode: 0o600 });

    await expect(
      issueD3AssertionCorpus({
        privateKeyFile: keyFile,
        keyId: "d3-test-k1",
        issuer: "portal-control-api",
        audience: "portal-execution-edge-paper",
        environment: "paper",
        outputDirectory: output,
        changeWindowId: "CW-MANAGER-AUDIT-INVALID",
        resource: "execution:command-center",
        matrix: "manager-audit-v1",
      }),
    ).rejects.toThrow(/bounded probe contract/);
  });
});
