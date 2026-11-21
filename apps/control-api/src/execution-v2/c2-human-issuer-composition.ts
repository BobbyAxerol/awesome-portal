import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { exportJWK, exportSPKI } from "jose";
import type { Pool } from "pg";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "./current-human-candidate";
import { createC2CustodiedCurrentHumanTransport, type CurrentHumanTransportConfig } from "./current-human-transport";
import { C2CustodiedTerminalCandidate } from "./c2-custodied-terminal-candidate";
import { C2CustodiedIssuerCandidate } from "./c2-custodied-issuer-candidate";
import { RestoreIndependentCustodyCandidate } from "./restore-independent-custody-candidate";
import { preflightC2PublicTrust, type C2PublicTrustInput } from "./c2-public-trust-preflight";
import type { AccessActor } from "./access.contract";
import type { PmHttpRequestBounds, PmHttpRequestBytes } from "./pm-http-request-binding";

/** Private source composition only. It does not listen, mint a token, validate
 * a Portal session, establish owner/delegation authority, or activate C2. It
 * exposes only a custody-bound owner issuer; it is not an authenticated HTTP
 * route, an installed source registration or a qualified restore barrier.
 * No fixtures count as A2 evidence. */
export interface C2SourceRegistration {
  source_issuer: string;
  source_key_id: string;
  source_spki_sha256: string;
  source_audience: string;
  source_workload_id: string;
  source_client_csr_sha256: string;
  server_hostname: string;
  server_certificate_der_sha256: string;
  workspace_id: string;
  protected_owner_subject: string;
}

export interface PreparedC2IssuerPublicAndReverse {
  /** These are exact public file bytes, not the issuer private key. */
  readonly jwks_json: string;
  readonly jwks_sha256: string;
  readonly issuer: string;
  readonly audience: string;
  readonly key_id: string;
  readonly protected_owner_subject: string;
  readonly workspace_id: string;
  readonly source_workload_id: string;
  /** Source-only composition: the caller must supply an authenticated actor.
   * Owner is pinned from registration; no token returns before custody. */
  readonly bind_custodied_issuer: (custody:RestoreIndependentCustodyCandidate) => Readonly<{
    issue:(actor:AccessActor,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds)=>ReturnType<C2CustodiedIssuerCandidate["issue"]>;
    resume:(actor:AccessActor,request:PmHttpRequestBytes,bounds:PmHttpRequestBounds,leaseId?:string)=>ReturnType<C2CustodiedIssuerCandidate["resume"]>;
  }>;
  /** Verifies actual public trust and constructs one unbound server. It never
   * listens; operator must separately commission network and authority. */
  readonly create_reverse_transport: (input: CurrentHumanTransportConfig, trust: C2PublicTrustInput,
    custody:RestoreIndependentCustodyCandidate) => Promise<ReturnType<typeof createC2CustodiedCurrentHumanTransport>>;
}

const bad = (): never => { throw new Error("C2_HUMAN_ISSUER_COMPOSITION_INVALID"); };
const matchesSelection=RestoreIndependentCustodyCandidate.prototype.matchesSelection;
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  Buffer.byteLength(value, "utf8") <= 128 && Buffer.from(value, "utf8").toString("utf8") === value &&
  value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const copyBytes = (value: unknown): Buffer => {
  if (typeof value !== "string" && !Buffer.isBuffer(value)) return bad();
  const bytes = Buffer.from(value);
  if (!bytes.length || bytes.length > 32768) return bad();
  return bytes;
};

/** Bind source registration and the public JWKS to the *same* copied candidate
 * config. No fallback, generated key, changed permissions or I/O. Registration
 * must come from independently pinned A1 and a current Research authority;
 * matching it here alone does not prove either was installed or accepted. */
export async function prepareC2IssuerPublicAndReverse(pool: Pool, input: CurrentHumanCandidateConfig,
  registration: C2SourceRegistration): Promise<PreparedC2IssuerPublicAndReverse> {
  try {
    const scope = input.installation_scope;
    const source = input.source;
    if (!scope || !source || input.native_read_custody !== undefined || scope.environment !== "paper" ||
        !Number.isSafeInteger(scope.valid_until_ms) || scope.valid_until_ms <= Date.now() ||
        input.issuer === "portal-control-api.native-manager-read" ||
        ![input.issuer, input.audience, input.key_id, source.issuer, source.audience, source.key_id,
          source.workload_id, scope.workspace_id, registration.protected_owner_subject].every(identifier) ||
        !/^[a-f0-9]{64}$/u.test(registration.source_spki_sha256) ||
        !/^[a-f0-9]{64}$/u.test(registration.source_client_csr_sha256) ||
        !/^[a-f0-9]{64}$/u.test(registration.server_certificate_der_sha256) || !identifier(registration.server_hostname) ||
        registration.source_issuer !== source.issuer || registration.source_key_id !== source.key_id ||
        registration.source_audience !== source.audience || registration.source_workload_id !== source.workload_id ||
        registration.workspace_id !== scope.workspace_id) return bad();

    // Capture values before any asynchronous key handling. Rotation must build
    // a new candidate and matching pinned publication; never mutate a live key.
    const expectedSourceSpki = registration.source_spki_sha256, owner = registration.protected_owner_subject;
    const expectedCsr = registration.source_client_csr_sha256, expectedHostname = registration.server_hostname,
      expectedServerDer = registration.server_certificate_der_sha256;
    const selected: CurrentHumanCandidateConfig = { issuer: input.issuer, audience: input.audience,
      key_id: input.key_id, private_key: input.private_key, source: { ...source },
      limits: { ...input.limits }, installation_scope: { ...scope }, c2_delivery_schema_required:true,
      c2_owner_confirmation_spki_sha256:input.c2_owner_confirmation_spki_sha256 };
    const [own, peer, peerPem] = await Promise.all([
      exportJWK(selected.private_key), exportJWK(selected.source.public_key), exportSPKI(selected.source.public_key),
    ]);
    if (own.kty !== "OKP" || own.crv !== "Ed25519" || typeof own.d !== "string" ||
        typeof own.x !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(own.x) ||
        peer.kty !== "OKP" || peer.crv !== "Ed25519" || peer.d !== undefined ||
        typeof peer.x !== "string" || own.x === peer.x ||
        sha(createPublicKey(peerPem).export({ type: "spki", format: "der" })) !== expectedSourceSpki)
      return bad();
    const candidate = await CurrentHumanCandidate.create(pool, selected);
    if (selected.installation_scope!.valid_until_ms <= Date.now()) return bad();
    // Whitelist public members: never serialize the `d` member from own.
    const jwks_json = JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", x: own.x,
      kid: selected.key_id, alg: "EdDSA", use: "sig" }] });
    const issuerSpkiSha256=sha(createPublicKey({key:{kty:"OKP",crv:"Ed25519",x:own.x},format:"jwk"})
      .export({type:"spki",format:"der"}));
    let compositionCustody:RestoreIndependentCustodyCandidate|undefined;
    const assertCustody=(custody:RestoreIndependentCustodyCandidate)=>{
      if(!custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
        !matchesSelection.call(custody,{workspace_id:selected.installation_scope!.workspace_id,
          workload_id:selected.source.workload_id,owner,original:{issuer:selected.issuer,audience:selected.audience,key_id:selected.key_id,
            spki_sha256:issuerSpkiSha256},
          source:{issuer:selected.source.issuer,audience:selected.source.audience,key_id:selected.source.key_id,
            spki_sha256:expectedSourceSpki}})||
        (compositionCustody!==undefined&&compositionCustody!==custody))return bad();
    };
    const bindCustodiedIssuer=(custody:RestoreIndependentCustodyCandidate)=>{
      assertCustody(custody);
      // Retain constructor validation (including the mandatory proof vault)
      // even though the returned issuance methods remain hard-fenced below.
      new C2CustodiedIssuerCandidate(candidate,custody);
      compositionCustody=custody;
      // A candidate ACTIVE registration and OPEN scope are NOT a qualified
      // owner acceptance/delegation. Until P7 is verified under the same
      // authority fence as issuance, never expose an issuer through this
      // composition, even when the isolated custody and TLS checks pass.
      // Reverse terminal settlement is deliberately independent: originals
      // already entered must remain recoverable after a revoke or drain.
      const p7Required=async ():Promise<never> => {
        throw new Error("C2_P7_AUTHORITY_NOT_COMMISSIONED");
      };
      return Object.freeze({
        issue:(_actor:AccessActor,_request:PmHttpRequestBytes,_bounds:PmHttpRequestBounds)=>p7Required(),
        resume:(_actor:AccessActor,_request:PmHttpRequestBytes,_bounds:PmHttpRequestBounds,_leaseId?:string)=>p7Required(),
      });
    };
    let transportReserved = false;
    const createReverse = async (untrusted: CurrentHumanTransportConfig, material: C2PublicTrustInput,
      custody:RestoreIndependentCustodyCandidate) => {
      if (transportReserved) return bad();
      transportReserved = true;
      let privateKey: Buffer | undefined, success = false;
      try {
        assertCustody(custody);
        // Copy BEFORE awaiting verification: the server cannot be given a
        // different mutable cert, CA, key, limits or source leaf after checks.
        const tls = { key: privateKey = copyBytes(untrusted.tls.key), cert: copyBytes(untrusted.tls.cert),
          ca: copyBytes(untrusted.tls.ca) };
        const limits = { ...untrusted.limits }, requestedClientPin = untrusted.source_certificate_sha256;
        const publicInput: C2PublicTrustInput = { ca_pem: copyBytes(material.ca_pem),
          server_certificate_pem: copyBytes(material.server_certificate_pem), client_certificate_pem: copyBytes(material.client_certificate_pem),
          client_csr_pem: copyBytes(material.client_csr_pem), source_proof_public_key_pem: copyBytes(material.source_proof_public_key_pem),
          server_hostname: material.server_hostname, server_der_sha256: material.server_der_sha256 };
        const proofSpki = createPublicKey(publicInput.source_proof_public_key_pem).export({ type: "spki", format: "der" });
        if (sha(proofSpki) !== expectedSourceSpki || sha(publicInput.client_csr_pem) !== expectedCsr ||
            publicInput.server_hostname !== expectedHostname || publicInput.server_der_sha256 !== expectedServerDer ||
            !tls.ca.equals(publicInput.ca_pem) ||
            !tls.cert.equals(publicInput.server_certificate_pem) ||
            !new X509Certificate(tls.cert).checkPrivateKey(createPrivateKey(tls.key))) return bad();
        const checked = await preflightC2PublicTrust(publicInput);
        if (requestedClientPin !== `sha256:${checked.client_der_sha256}` ||
            selected.installation_scope!.valid_until_ms <= Date.now()) return bad();
        // A concurrent issuer bind may have selected a different store while
        // trust verification was in flight. Never split one composition.
        assertCustody(custody);
        const terminal = new C2CustodiedTerminalCandidate(pool,candidate,custody);
        const result = createC2CustodiedCurrentHumanTransport(candidate,terminal,{ tls, limits, source_certificate_sha256: requestedClientPin });
        compositionCustody=custody;
        success = true;
        return result;
      } catch { return bad(); }
      finally { if (!success) { privateKey?.fill(0); transportReserved = false; } }
    };
    return Object.freeze({ jwks_json, jwks_sha256: sha(jwks_json), issuer: selected.issuer,
      audience: selected.audience, key_id: selected.key_id, protected_owner_subject: owner,
      workspace_id: selected.installation_scope!.workspace_id, source_workload_id: selected.source.workload_id,
      bind_custodied_issuer:bindCustodiedIssuer,
      create_reverse_transport: createReverse });
  } catch { return bad(); }
}
