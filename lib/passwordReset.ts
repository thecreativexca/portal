import crypto from "crypto";

export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_LENGTH = 6;

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for password reset");
  }
  return secret;
}

export function generateOtp(): string {
  return crypto.randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH).toString();
}

export function hashOtp(otp: string): string {
  return crypto.createHmac("sha256", getSecret()).update(otp).digest("hex");
}

export function verifyOtpHash(otp: string, hash: string): boolean {
  const candidate = hashOtp(otp);
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyResetToken(token: string, hash: string): boolean {
  const candidate = hashResetToken(token);
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
