import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export interface Argon2Settings {
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

export class Argon2CredentialService {
  constructor(private readonly settings: Argon2Settings) {}

  async hash(password: string): Promise<{ hash: string; parametersJson: Record<string, unknown> }> {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.settings.memoryKib,
      timeCost: this.settings.iterations,
      parallelism: this.settings.parallelism,
    });
    return {
      hash,
      parametersJson: {
        algorithm: "argon2id",
        memoryKib: this.settings.memoryKib,
        iterations: this.settings.iterations,
        parallelism: this.settings.parallelism,
      },
    };
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * A4-FE-BE-GAP-02 · spend the same work on a login that cannot succeed.
   *
   * Argon2 is deliberately expensive, and that cost is observable. Login only
   * reached it for a user who exists, is ACTIVE and holds a password, so a
   * single timed request separated three facts a stranger has no right to:
   * whether the username exists, whether the account is still awaiting its
   * first password, and whether it is locked. The fast paths were the answer.
   *
   * This burns one verify against a decoy hash so every refusal costs what a
   * real check costs. The decoy is computed once, lazily — building it at
   * construction would add an argon2 hash to every process start, including
   * the sixteen test apps.
   */
  async verifyAgainstDecoy(): Promise<void> {
    this.decoy ??= this.hash(randomBytes(24).toString("hex")).then((r) => r.hash);
    await this.verify(await this.decoy, "not-the-password");
  }

  private decoy: Promise<string> | undefined;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
