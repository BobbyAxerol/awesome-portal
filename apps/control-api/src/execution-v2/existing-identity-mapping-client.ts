import { createHash, randomUUID } from "node:crypto";
import type { ClientRequest } from "node:http";
import { request } from "node:https";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { z } from "zod";
import type { AccessTrustProvider } from "./access-trust";
import { parseCurrentHumanWire } from "./current-human-wire";

const text = z.string().min(1).max(512)
  .refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
    && Buffer.byteLength(value, "utf8") <= 512);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const scope = z.object({ human_issuer: text, workspace_id: text,
  environment: z.enum(["paper", "sandbox", "live"]), workload_id: text }).strict();
const binding = scope.extend({ request_id: uuid, subject: text });
const response = z.discriminatedUnion("status", [
  binding.extend({ schema_version: z.literal("pma.existing-human-mapping-result.v1"), status: z.literal("FOUND"),
    ts_user_id: uuid, revision: z.string().max(128).regex(/^ts-user:[0-9a-f-]{36}:[1-9][0-9]{0,18}$/) }).strict(),
  binding.extend({ schema_version: z.literal("pma.existing-human-mapping-result.v1"), status: z.literal("NOT_FOUND") }).strict(),
]);

export interface ExistingIdentityMappingClientConfig {
  origin: string;
  tls: Pick<ConnectionOptions, "key" | "cert" | "ca">;
  source_certificate_sha256: string;
  human_issuer: string;
  workspace_id: string;
  environment: "paper" | "sandbox" | "live";
  workload_id: string;
  deadline_ms: number;
  response_bytes: number;
  /** Explicit private correctness admission, not a production budget default. */
  max_inflight: number;
  /** Independently selected absolute installation expiry; never a guessed TTL. */
  installation_expires_at_utc_ms: number;
}

export class ExistingIdentityMappingError extends Error {
  constructor(readonly code: string) { super("The existing identity mapping is not available."); }
}
export type ExistingIdentityMapping = null | { ts_user_id: string; revision: string };

/** Fresh existing-row observation, NOT a human authenticator, business grant,
 * cache, identity creation or held authority through a later Core COMMIT.
 * The selected issuer is the independently accepted stable human issuer, never
 * inferred from candidate PKI, a display name, a target session or browser input.
 * Final writes must retain their separate current source membership fence. */
export class ExistingIdentityMappingClient {
  private readonly url: URL;
  private readonly config: ExistingIdentityMappingClientConfig;
  private inFlight = 0;

  constructor(input: ExistingIdentityMappingClientConfig) {
    let origin: URL;
    try {
      origin = new URL(input.origin);
      scope.parse({ human_issuer: input.human_issuer, workspace_id: input.workspace_id,
        environment: input.environment, workload_id: input.workload_id });
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/"
        || origin.search || origin.hash || !/^sha256:[a-f0-9]{64}$/.test(input.source_certificate_sha256)
        || !input.tls.key || !input.tls.cert || !input.tls.ca
        || !Number.isSafeInteger(input.deadline_ms) || input.deadline_ms < 1 || input.deadline_ms > 10_000
        || !Number.isSafeInteger(input.response_bytes) || input.response_bytes < 1 || input.response_bytes > 8192
        || !Number.isSafeInteger(input.max_inflight) || input.max_inflight < 1 || input.max_inflight > 128
        || !Number.isSafeInteger(input.installation_expires_at_utc_ms) || input.installation_expires_at_utc_ms <= Date.now())
        throw new Error();
    } catch { throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_CONFIG_INVALID"); }
    this.url = new URL("/internal/elp210/current-human/mapping", origin);
    this.config = { ...input, tls: { key: input.tls.key, cert: input.tls.cert, ca: input.tls.ca } };
  }

  private assertInstallation(): void {
    if (Date.now() >= this.config.installation_expires_at_utc_ms)
      throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_INSTALLATION_EXPIRED");
  }

  async lookup(subject: string, workspaceId: string): Promise<ExistingIdentityMapping> {
    this.assertInstallation();
    if (workspaceId !== this.config.workspace_id)
      throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_SCOPE_MISMATCH");
    const parsed = binding.safeParse({ request_id: randomUUID(), subject, human_issuer: this.config.human_issuer,
      workspace_id: this.config.workspace_id, environment: this.config.environment, workload_id: this.config.workload_id });
    if (!parsed.success) throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_REQUEST_INVALID");
    const expected = parsed.data;
    const payload = Buffer.from(JSON.stringify({ schema_version: "pma.existing-human-mapping.v1", ...expected }));
    if (payload.length > 8192) throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_REQUEST_INVALID");

    this.assertInstallation();
    if (this.inFlight >= this.config.max_inflight)
      throw new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_BUSY");
    this.inFlight++;
    try {
    const result = await new Promise<ExistingIdentityMapping>((resolve, reject) => {
      let settled = false, req: ClientRequest | undefined;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        req?.destroy();
        reject(new ExistingIdentityMappingError("EXISTING_IDENTITY_MAPPING_UNAVAILABLE"));
      };
      const timer = setTimeout(fail, this.config.deadline_ms);
      try {
        req = request(this.url, { ...this.config.tls, method: "POST", agent: false,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true,
          checkServerIdentity: (host, cert) => {
            const error = checkServerIdentity(host, cert);
            if (error) return error;
            if (`sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.source_certificate_sha256)
              return new Error("EXISTING_IDENTITY_MAPPING_PEER_MISMATCH");
          },
          headers: { "content-type": "application/json", "content-length": payload.length, "connection": "close" },
        }, res => {
          let size = 0;
          const chunks: Buffer[] = [];
          if (res.statusCode !== 200 || res.headers["content-type"] !== "application/json"
            || res.headers["content-encoding"] !== undefined) {
            res.destroy(); fail(); return;
          }
          res.on("error", fail);
          res.on("aborted", fail);
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.config.response_bytes) { res.destroy(); fail(); }
            else chunks.push(chunk);
          });
          res.on("end", () => {
            if (settled) return;
            try {
              const reply = response.parse(parseCurrentHumanWire(Buffer.concat(chunks)));
              for (const key of ["request_id", "human_issuer", "subject", "workspace_id", "environment", "workload_id"] as const)
                if (reply[key] !== expected[key]) throw new Error();
              if (reply.status === "FOUND") {
                const prefix = `ts-user:${reply.ts_user_id}:`;
                if (!reply.revision.startsWith(prefix) || BigInt(reply.revision.slice(prefix.length)) > 9223372036854775807n)
                  throw new Error();
              }
              settled = true; clearTimeout(timer);
              resolve(reply.status === "NOT_FOUND" ? null : { ts_user_id: reply.ts_user_id, revision: reply.revision });
            } catch { fail(); }
          });
        });
        req.on("error", fail);
        // Node buffers HTTP bytes until TLS hostname/CA/leaf verification passes.
        req.end(payload);
      } catch { fail(); }
    });
    // Expiry during source I/O invalidates even a valid FOUND/NOT_FOUND reply.
    this.assertInstallation();
    return result;
    } finally {
      this.inFlight--;
    }
  }
}

/** Preserve every existing authority callback and its receiver. Only the
 * previously unqualified mapping observation is replaced; no policy fallback. */
export function withExistingIdentityMapping(base: AccessTrustProvider, client: ExistingIdentityMappingClient): AccessTrustProvider {
  return {
    verifyPolicy: base.verifyPolicy.bind(base),
    verifyReceipt: base.verifyReceipt.bind(base),
    ...(base.verifyRootReceipt ? { verifyRootReceipt: base.verifyRootReceipt.bind(base) } : {}),
    ...(base.qualifyDelegatedReceipt ? { qualifyDelegatedReceipt: base.qualifyDelegatedReceipt.bind(base) } : {}),
    relations: base.relations.bind(base),
    verifiedHumanMapping: (subject, workspaceId) => client.lookup(subject, workspaceId),
    ...(base.readPublication ? { readPublication: base.readPublication.bind(base) } : {}),
  };
}
