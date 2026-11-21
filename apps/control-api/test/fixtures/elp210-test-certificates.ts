/** TEST_ONLY in-memory EC certificates. No openssl binary, fixture PEM or runtime CA.
 * Default behavior extracted from elp210-current-human-transport.spec.ts.
 * Optional SAN override only supports the native client's wrong-host test. */
import {createPublicKey,randomBytes,sign,X509Certificate,type KeyObject,type KeyPairKeyObjectResult} from "node:crypto";
import {expect} from "vitest";
const der = (tag: number, ...values: Buffer[]) => {
  const bytes = Buffer.concat(values), length = bytes.length;
  const encoded = length < 128 ? Buffer.from([length]) : (() => {
    let hex = length.toString(16); if (hex.length % 2) hex = `0${hex}`;
    const size = Buffer.from(hex, "hex"); return Buffer.concat([Buffer.from([0x80 | size.length]), size]);
  })();
  return Buffer.concat([Buffer.from([tag]), encoded, bytes]);
};
const seq = (...values: Buffer[]) => der(0x30, ...values);
const oid = (hex: string) => der(0x06, Buffer.from(hex, "hex"));
const boolean = () => der(0x01, Buffer.from([0xff]));
const ecSha256 = seq(oid("2a8648ce3d040302"));
const pem = (bytes: Buffer) => Buffer.from(`-----BEGIN CERTIFICATE-----\n${bytes.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`);
export const commonName = (name: string) => seq(der(0x31, seq(oid("550403"), der(0x0c, Buffer.from(name)))));
export type TestAuthority = { key: KeyObject; name: Buffer; certificate: Buffer };
export function testCertificate(name: Buffer, key: KeyPairKeyObjectResult, issuer: { name: Buffer; key: KeyObject }, ca: boolean, host = "localhost") {
  const time = (at: number) => der(0x17, Buffer.from(new Date(at).toISOString().replace(/[-:]/g, "").replace("T", "").slice(2, 14) + "Z"));
  const extension = (id: string, value: Buffer, critical = false) => seq(oid(id), ...(critical ? [boolean()] : []), der(0x04, value));
  const extensions = [extension("551d13", ca ? seq(boolean()) : seq(), true),
    extension("551d0f", der(0x03, Buffer.from(ca ? [1, 6] : [7, 0x80])), true)];
  if (!ca) extensions.push(extension("551d25", seq(oid("2b06010505070301"), oid("2b06010505070302"))),
    extension("551d11", host === "localhost" ? seq(der(0x87, Buffer.from([127, 0, 0, 1])), der(0x82, Buffer.from("localhost")))
      : seq(der(0x82, Buffer.from(host)))));
  const now = Date.now();
  const tbs = seq(der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.from([1]), randomBytes(15)), ecSha256,
    issuer.name, seq(time(now - 60_000), time(now + 86_400_000)), name,
    key.publicKey.export({ type: "spki", format: "der" }) as Buffer, der(0xa3, seq(...extensions)));
  const certificate = pem(seq(tbs, ecSha256, der(0x03, Buffer.from([0]), sign("sha256", tbs, issuer.key))));
  const parsed = new X509Certificate(certificate);
  expect(parsed.verify(createPublicKey(issuer.key))).toBe(true);
  expect(parsed.ca).toBe(ca);
  if (!ca) { if (host === "localhost") expect(parsed.checkIP("127.0.0.1")).toBe("127.0.0.1"); expect(parsed.checkHost(host)).toBe(host); }
  return certificate;
}
