import { httpError } from "./guards";

/**
 * In-memory sliding-window rate limiter.
 *
 * Single-instance best-effort only — state lives in the server process and is
 * not shared across replicas. That is acceptable for an internal portal
 * (documented in docs/DEPLOYMENT.md); the upgrade path is a Redis/Upstash
 * backend behind the same `rateLimit()` signature.
 *
 * `rateLimit()` throws an HttpError(429) when the window is exceeded, so route
 * handlers that already wrap in try/catch + handleApiError pick it up.
 */

interface Window {
  hits: number[];
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Prune expired windows so the map does not grow unbounded. */
let lastPrune = Date.now();
function prune(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** Check and record a hit for `key`; throw HttpError(429) if over the limit. */
export function rateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  prune(now);
  const windowMs = opts.windowMs || 60_000;
  const limit = opts.limit || 60;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { hits: [], resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.hits = bucket.hits.filter((t) => t > now - windowMs);
  if (bucket.hits.length >= limit) {
    throw httpError(429, "Too many requests. Please try again shortly.");
  }
  bucket.hits.push(now);
}

/** Default tiers used across the app. */
export const RATE_LIMIT_TIERS = {
  /** Mutating endpoints: generous per-user limit. */
  writes: { limit: 120, windowMs: 60_000 },
  /** Login endpoint (brute-force protection), keyed by IP. */
  auth: { limit: 10, windowMs: 60_000 },
  /** Heavy CEO aggregate endpoints — protect the database. */
  ceoAggregates: { limit: 30, windowMs: 60_000 },
  /** Generic list endpoints. */
  reads: { limit: 300, windowMs: 60_000 },
  /** Password reset OTP request — keyed by IP. */
  passwordReset: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** Password reset OTP resend — keyed by email. */
  passwordResetResend: { limit: 3, windowMs: 15 * 60 * 1000 },
  /** Password reset OTP verify attempts — keyed by email. */
  passwordResetVerify: { limit: 5, windowMs: 15 * 60 * 1000 },
} as const;

/** Get the requestor key for a route: authenticated userId or the IP. */
export function clientKey(userId: string | undefined, request?: Request): string {
  if (userId) return `u:${userId}`;
  let ip: string | undefined;
  const headers = (request as { headers?: unknown } | undefined)?.headers as
    | { get?(name: string): string | null }
    | Record<string, string | string[] | undefined>
    | undefined;
  if (headers) {
    if (typeof headers.get === "function") {
      ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    } else {
      const raw = (headers as Record<string, unknown>)["x-forwarded-for"];
      if (typeof raw === "string") ip = raw.split(",")[0]?.trim();
    }
  }
  return `ip:${ip || "unknown"}`;
}

/**
 * Convenience wrapper: returns an already-checked `rateLimit` guard for a
 * resolved user id. Use inside a handler after auth resolves.
 */
export function rateLimitByUser(
  userId: string,
  tier: keyof typeof RATE_LIMIT_TIERS = "writes"
): void {
  rateLimit(clientKey(userId), RATE_LIMIT_TIERS[tier]);
}
