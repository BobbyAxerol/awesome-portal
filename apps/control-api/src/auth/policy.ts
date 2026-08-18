const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;

const BLOCKLIST = new Set([
  "primusspark",
  "primuspark",
  "primussparkquant",
  "portalprimusspark",
  "password",
  "password1",
  "password123",
  "changeme",
  "welcome123",
  "letmein123",
  "12345678",
  "123456789",
  "qwertyuiop",
  "admin12345",
  "quantbt2026",
  "portal2026",
  "azdag2026",
]);

export interface PasswordPolicyError {
  code: string;
  message: string;
}

export function validatePassword(password: string): PasswordPolicyError | null {
  const normalized = password.normalize("NFC");
  if (normalized.length < MIN_PASSWORD_LENGTH) {
    return {
      code: "PASSWORD_TOO_SHORT",
      message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
    };
  }
  if (normalized.length > MAX_PASSWORD_LENGTH) {
    return {
      code: "PASSWORD_TOO_LONG",
      message: `Mật khẩu không được dài quá ${MAX_PASSWORD_LENGTH} ký tự.`,
    };
  }
  const lowered = normalized.toLowerCase();
  for (const blocked of BLOCKLIST) {
    if (lowered.includes(blocked)) {
      return {
        code: "PASSWORD_BLOCKLISTED",
        message: "This password is blocklisted; choose a different value.",
      };
    }
  }
  return null;
}

export function isAcceptablePassword(password: string): boolean {
  return validatePassword(password) === null;
}
