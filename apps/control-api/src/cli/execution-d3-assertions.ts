import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  open,
  readFile,
  readdir,
} from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  decodeJwt,
  generateKeyPair,
  importPKCS8,
  SignJWT,
  type KeyLike,
  type JWTPayload,
} from "jose";
import { ExecutionDelegationService } from "../execution/delegation";

const IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;
const CHANGE_WINDOW = /^[A-Za-z0-9._:-]{3,128}$/;
const D3_ASSERTION_RESOURCES = [
  "execution:command-center",
  "execution:manager-v2:read",
] as const;
const DEFAULT_D3_ASSERTION_RESOURCE = "execution:command-center";
const FILES = {
  valid: "valid.jwt",
  malformed: "malformed.jwt",
  wrongSignature: "wrong-signature.jwt",
  unknownKey: "unknown-key.jwt",
  wrongIssuer: "wrong-issuer.jwt",
  wrongAudience: "wrong-audience.jwt",
  expired: "expired.jwt",
  ttlTooLong: "ttl-too-long.jwt",
  futureNotBefore: "future-not-before.jwt",
  wrongEnvironment: "wrong-environment.jwt",
  missingScope: "missing-scope.jwt",
} as const;

export type D3AssertionResource = (typeof D3_ASSERTION_RESOURCES)[number];

export interface D3AssertionCorpusOptions {
  privateKeyFile: string;
  keyId: string;
  issuer: string;
  audience: string;
  environment: "paper" | "sandbox" | "live";
  outputDirectory: string;
  changeWindowId: string;
  /**
   * Closed operator-only target. The default preserves the existing D3
   * Command Center corpus; Manager-v2 qualification must opt in explicitly.
   */
  resource?: D3AssertionResource;
  now?: Date;
}

interface AssertionRecord {
  case: string;
  file: string;
  expected_http_status: 200 | 403;
}

/**
 * Creates one short-lived canonical assertion and an explicit negative corpus.
 * Files are mode 0600 and the private key/token values are never logged.
 * The corpus is operator evidence only and must be destroyed when D3 closes.
 */
export async function issueD3AssertionCorpus(
  options: D3AssertionCorpusOptions,
): Promise<{ manifestFile: string; records: AssertionRecord[] }> {
  validateOptions(options);
  const resource = options.resource ?? DEFAULT_D3_ASSERTION_RESOURCE;
  await validatePrivateBoundary(options.privateKeyFile, options.outputDirectory);
  const privateKeyPem = await readFile(options.privateKeyFile, "utf8");
  if (Buffer.byteLength(privateKeyPem, "utf8") > 16 * 1024) {
    throw new Error("D3 private key file exceeds 16384 bytes");
  }
  const privateKey = await importPKCS8(privateKeyPem, "RS256");
  const now = options.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const canonical = await ExecutionDelegationService.create({
    issuer: options.issuer,
    audience: options.audience,
    keyId: options.keyId,
    privateKeyPem,
    ttlSeconds: 45,
    environment: options.environment,
  });
  const valid = await canonical.issueReadAssertion({
    principalId: "d3-operator-probe",
    sessionId: `d3-${options.changeWindowId}`,
    workspaceId: "d3-transport-probe",
    roles: ["ADMIN"],
    resources: [resource],
    authenticationTime: new Date(now.getTime() - 1_000),
    authenticationMethods: ["operator_change_window"],
  });
  const base = decodeJwt(valid);
  const sign = (payload: JWTPayload, key = privateKey, kid = options.keyId) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
      .sign(key);
  const variant = (changes: Partial<JWTPayload>): JWTPayload => ({
    ...base,
    ...changes,
    jti: `d3-${randomUUID()}`,
  });
  const { privateKey: untrustedKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
  });

  const tokens: Record<keyof typeof FILES, string> = {
    valid,
    malformed: "not-a-jwt",
    wrongSignature: await sign(variant({}), untrustedKey),
    unknownKey: await sign(variant({}), privateKey, "d3-unknown-key"),
    wrongIssuer: await sign(variant({ iss: `${options.issuer}-wrong` })),
    wrongAudience: await sign(variant({ aud: `${options.audience}-wrong` })),
    expired: await sign(
      variant({ iat: nowSeconds - 90, nbf: nowSeconds - 90, exp: nowSeconds - 30 }),
    ),
    ttlTooLong: await sign(
      variant({ iat: nowSeconds, nbf: nowSeconds, exp: nowSeconds + 61 }),
    ),
    futureNotBefore: await sign(
      variant({ iat: nowSeconds, nbf: nowSeconds + 30, exp: nowSeconds + 45 }),
    ),
    wrongEnvironment: await sign(
      variant({ environment: options.environment === "paper" ? "sandbox" : "paper" }),
    ),
    missingScope: await sign(variant({ scopes: [] })),
  };
  const records: AssertionRecord[] = [];
  for (const [name, file] of Object.entries(FILES) as Array<
    [keyof typeof FILES, string]
  >) {
    await writeSecret(resolve(options.outputDirectory, file), tokens[name]);
    records.push({
      case: name,
      file,
      expected_http_status: name === "valid" ? 200 : 403,
    });
  }
  const manifestFile = resolve(options.outputDirectory, "manifest.json");
  await writeSecret(
    manifestFile,
    JSON.stringify(
      {
        schema_version: "portal.execution.d3.assertion-corpus.v1",
        created_at: now.toISOString(),
        change_window_id: options.changeWindowId,
        issuer: options.issuer,
        audience: options.audience,
        environment: options.environment,
        resource,
        maximum_accepted_ttl_seconds: 60,
        records,
      },
      null,
      2,
    ),
  );
  return { manifestFile, records };
}

function validateOptions(options: D3AssertionCorpusOptions): void {
  if (
    !IDENTIFIER.test(options.keyId) ||
    options.issuer.trim() === "" ||
    options.audience.trim() === "" ||
    !["paper", "sandbox", "live"].includes(options.environment) ||
    !CHANGE_WINDOW.test(options.changeWindowId) ||
    (options.resource !== undefined && !D3_ASSERTION_RESOURCES.includes(options.resource)) ||
    !isAbsolute(options.privateKeyFile) ||
    !isAbsolute(options.outputDirectory)
  ) {
    throw new Error("D3 assertion corpus options are outside the bounded probe contract");
  }
}

async function validatePrivateBoundary(
  privateKeyFile: string,
  outputDirectory: string,
): Promise<void> {
  const key = await lstat(privateKeyFile);
  if (!key.isFile() || key.isSymbolicLink() || (key.mode & 0o007) !== 0) {
    throw new Error("D3 private key must be a regular non-world-readable file");
  }
  const directory = await lstat(outputDirectory);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o777) !== 0o700 ||
    (typeof process.geteuid === "function" && directory.uid !== process.geteuid())
  ) {
    throw new Error("D3 output directory must be caller-owned mode 0700");
  }
  if ((await readdir(outputDirectory)).length !== 0) {
    throw new Error("D3 output directory must be empty");
  }
}

async function writeSecret(path: string, value: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${value}\n`, "utf8");
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`${name} is required`);
  return args[index + 1];
}

function optionalArgument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index + 1 >= args.length) throw new Error(`${name} is required`);
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (argument(args, "--acknowledge") !== "D3_AUTH_NEGATIVE_MATRIX") {
    throw new Error("D3 explicit acknowledgement is required");
  }
  const environment = argument(args, "--environment");
  if (!(["paper", "sandbox", "live"] as string[]).includes(environment)) {
    throw new Error("--environment is invalid");
  }
  const result = await issueD3AssertionCorpus({
    privateKeyFile: argument(args, "--private-key-file"),
    keyId: argument(args, "--key-id"),
    issuer: argument(args, "--issuer"),
    audience: argument(args, "--audience"),
    environment: environment as "paper" | "sandbox" | "live",
    outputDirectory: argument(args, "--output-directory"),
    changeWindowId: argument(args, "--change-window-id"),
    resource: optionalArgument(args, "--resource") as D3AssertionResource | undefined,
  });
  console.log(`D3 assertion corpus written without token output: ${result.records.length} cases`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "D3 assertion corpus failed");
    process.exitCode = 1;
  });
}
