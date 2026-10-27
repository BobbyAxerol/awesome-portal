import { createHash, randomUUID } from "node:crypto";
import type { ClientRequest } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { z } from "zod";
import { nativeRootDecode } from "./native-root-codec";

const text = z.string().min(1).max(512).refine(v => v === v.trim()
  && !/[\u0000-\u001f\u007f]/.test(v) && Buffer.byteLength(v, "utf8") <= 512);
const scopeText = text.refine(v => Buffer.byteLength(v, "utf8") <= 256);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
// Native revisions are BIGINT; do not silently round them through JSON Number.
const revision = z.number().int().positive().safe();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const lineage = z.object({ membership_id: text, version: revision }).strict();
const nativeReference = z.object({ command_id: text, membership_id: text, version: revision,
  scope: z.object({ portfolio_id: text, environment: z.literal("paper") }).strict(),
  policy_revision: revision, requester: uuid, after_digest: digest, before_digest: digest,
  intent_digest: digest, effective_at: z.string().datetime({ offset: true }),
  evaluated_memberships: z.array(z.tuple([text, revision])).max(8) }).strict();
const candidate = z.discriminatedUnion("state", [
  lineage.extend({ state: z.literal("RECEIPT_NOT_FOUND") }).strict(),
  lineage.extend({ state: z.literal("NATIVE_RECEIPT_OR_LINEAGE_NOT_VALID"), reason: text }).strict(),
  lineage.extend({ state: z.literal("NATIVE_RECEIPT_AND_CURRENT_LINEAGE_OBSERVED"),
    reference: nativeReference, current_lineage: z.array(lineage).min(1).max(9) }).strict(),
]);
const observation = z.discriminatedUnion("state", [
  z.object({ schema_version: z.literal("pma.research-membership-observation.v1"),
    state: z.literal("MAPPING_NOT_FOUND"), candidates: z.array(candidate).length(0) }).strict(),
  z.object({ schema_version: z.literal("pma.research-membership-observation.v1"),
    state: z.literal("OBSERVED_NOT_AUTHORIZED"), mapping_revision: z.string().max(128),
    policy_revision: revision, candidates: z.array(candidate).max(8) }).strict(),
]);
const binding = z.object({ request_id: uuid, human_issuer: scopeText, subject: scopeText, workspace_id: scopeText,
  environment: z.literal("paper"), workload_id: scopeText }).strict();
const response = binding.extend({ schema_version: z.literal("pma.research-membership-discovery-result.v1"),
  observation }).strict();
export type ResearchMembershipObservation = z.infer<typeof observation>;

export interface ResearchMembershipDiscoveryConfig {
  origin: string;
  tls: Pick<ConnectionOptions, "key" | "cert" | "ca">;
  source_certificate_sha256: string;
  human_issuer: string;
  subject: string;
  workspace_id: string;
  workload_id: string;
  deadline_ms: number;
  response_bytes: number;
  max_inflight: number;
  installation_expires_at_utc_ms: number;
}
export class ResearchMembershipDiscoveryError extends Error {
  constructor(readonly code: string) { super("The Research membership observation is unavailable."); }
}

/** Private, explicitly configured observation only. Never produces an accepted
 * Core original, grant, source fence or permission to READ/STREAM. */
export class ResearchMembershipDiscoveryClient {
  private readonly url: URL;
  private readonly config: ResearchMembershipDiscoveryConfig;
  private inFlight = 0;

  constructor(input: ResearchMembershipDiscoveryConfig) {
    try {
      const origin = new URL(input.origin);
      const host = origin.hostname.replace(/^\[|\]$/g, "");
      binding.parse({ request_id: randomUUID(), human_issuer: input.human_issuer, subject: input.subject,
        workspace_id: input.workspace_id, environment: "paper", workload_id: input.workload_id });
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/"
        || origin.search || origin.hash || !/^sha256:[a-f0-9]{64}$/.test(input.source_certificate_sha256)
        || !(isIP(host) === 4 ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)
          : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/i.test(host)))
        || !input.tls.key || !input.tls.cert || !input.tls.ca
        || !Number.isSafeInteger(input.deadline_ms) || input.deadline_ms < 1 || input.deadline_ms > 10_000
        || !Number.isSafeInteger(input.response_bytes) || input.response_bytes < 1 || input.response_bytes > 32768
        || !Number.isSafeInteger(input.max_inflight) || input.max_inflight < 1 || input.max_inflight > 16
        || !Number.isSafeInteger(input.installation_expires_at_utc_ms) || input.installation_expires_at_utc_ms <= Date.now())
        throw new Error();
      this.url = new URL("/internal/elp210/current-human/membership-discovery", origin);
      this.config = { ...input, tls: { key: input.tls.key, cert: input.tls.cert, ca: input.tls.ca } };
    } catch { throw new ResearchMembershipDiscoveryError("RESEARCH_DISCOVERY_CONFIG_INVALID"); }
  }

  private assertInstallation(): void {
    if (Date.now() >= this.config.installation_expires_at_utc_ms)
      throw new ResearchMembershipDiscoveryError("RESEARCH_DISCOVERY_INSTALLATION_EXPIRED");
  }

  async observe(): Promise<ResearchMembershipObservation> {
    this.assertInstallation();
    const expected = binding.parse({ request_id: randomUUID(), human_issuer: this.config.human_issuer,
      subject: this.config.subject, workspace_id: this.config.workspace_id, environment: "paper",
      workload_id: this.config.workload_id });
    const payload = Buffer.from(JSON.stringify({ schema_version: "pma.research-membership-discovery.v1", ...expected }));
    if (payload.length > 8192) throw new ResearchMembershipDiscoveryError("RESEARCH_DISCOVERY_REQUEST_INVALID");
    if (this.inFlight >= this.config.max_inflight) throw new ResearchMembershipDiscoveryError("RESEARCH_DISCOVERY_BUSY");
    this.inFlight++;
    try {
      const result = await new Promise<ResearchMembershipObservation>((resolve, reject) => {
        let settled = false, req: ClientRequest | undefined;
        const fail = () => {
          if (settled) return;
          settled = true; clearTimeout(timer); req?.destroy();
          reject(new ResearchMembershipDiscoveryError("RESEARCH_DISCOVERY_UNAVAILABLE"));
        };
        const timer = setTimeout(fail, this.config.deadline_ms);
        try {
          req = request(this.url, { ...this.config.tls, method: "POST", agent: false,
            minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true,
            checkServerIdentity: (host, cert) => {
              const error = checkServerIdentity(host, cert);
              if (error) return error;
              if (`sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.source_certificate_sha256)
                return new Error("RESEARCH_DISCOVERY_PEER_MISMATCH");
            }, headers: { "content-type": "application/json", "content-length": payload.length, "connection": "close" },
          }, res => {
            let size = 0;
            const chunks: Buffer[] = [];
            if (res.statusCode !== 200 || res.headers["content-type"] !== "application/json"
              || res.headers["content-encoding"] !== undefined) { res.destroy(); fail(); return; }
            res.on("error", fail); res.on("aborted", fail);
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > this.config.response_bytes) { res.destroy(); fail(); } else chunks.push(chunk);
            });
            res.on("end", () => {
              if (settled) return;
              try {
                const reply = response.parse(nativeRootDecode(Buffer.concat(chunks), this.config.response_bytes));
                for (const key of ["request_id", "human_issuer", "subject", "workspace_id", "environment", "workload_id"] as const)
                  if (reply[key] !== expected[key]) throw new Error();
                const result = reply.observation;
                if (result.state === "OBSERVED_NOT_AUTHORIZED") {
                  const match = /^ts-user:([0-9a-f-]{36}):([1-9][0-9]{0,18})$/.exec(result.mapping_revision);
                  if (!match || !uuid.safeParse(match[1]).success || BigInt(match[2]) > 9223372036854775807n)
                    throw new Error();
                  for (const item of result.candidates) {
                    if (item.state === "NATIVE_RECEIPT_AND_CURRENT_LINEAGE_OBSERVED"
                      && (item.reference.membership_id !== item.membership_id || item.reference.version !== item.version
                        || item.current_lineage[0].membership_id !== item.membership_id
                        || item.current_lineage[0].version !== item.version)) throw new Error();
                  }
                }
                settled = true; clearTimeout(timer); resolve(result);
              } catch { fail(); }
            });
          });
          req.on("error", fail); req.end(payload);
        } catch { fail(); }
      });
      this.assertInstallation();
      return result;
    } finally { this.inFlight--; }
  }
}
