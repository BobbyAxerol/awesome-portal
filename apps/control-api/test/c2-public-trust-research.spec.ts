/** Opt-in test of public Research certificate material; never loads a private
 * key, opens a listener, grants access, or proves installed/connected trust. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { preflightC2PublicTrust } from "../src/execution-v2/c2-public-trust-preflight";

const root = process.env.C2_RESEARCH_TRUST_PUBLIC_ROOT;
const a1 = process.env.C2_A1_PUBLIC_ROOT;
const pin = process.env.C2_RESEARCH_SERVER_DER_SHA256;
const hostname = process.env.C2_RESEARCH_SERVER_HOSTNAME;
const enabled = process.env.C2_PUBLIC_TRUST_RESEARCH_TEST === "EXPLICIT_PUBLIC_MATERIAL_ONLY" && !!root && !!a1 && !!pin && !!hostname;

describe.skipIf(!enabled)("Research C2 public material, uninstalled", () => {
  const input = () => ({ ca_pem: readFileSync(join(root!, "public/ca.crt.pem")),
    server_certificate_pem: readFileSync(join(root!, "listener/server.crt.pem")),
    client_certificate_pem: readFileSync(join(root!, "public/ts-mtls-client.crt.pem")),
    client_csr_pem: readFileSync(join(a1!, "ts-mtls-client.csr.pem")),
    source_proof_public_key_pem: readFileSync(join(a1!, "ts-source-proof-ed25519.pub.pem")),
    server_hostname: hostname!, server_der_sha256: pin! });

  it("accepts the explicitly pinned P-256 CSR/client chain and IP SAN with at least 120 days remaining", async () => {
    await expect(preflightC2PublicTrust(input())).resolves.toMatchObject({ state: "PUBLIC_MATERIAL_VALID_NOT_INSTALLED",
      server_der_sha256: pin, client_remaining_ms: expect.any(Number) });
  });
  it("refuses a different server leaf pin", async () => {
    await expect(preflightC2PublicTrust({ ...input(), server_der_sha256: "0".repeat(64) })).rejects.toThrow("C2_PUBLIC_TRUST_INVALID");
  });
});
